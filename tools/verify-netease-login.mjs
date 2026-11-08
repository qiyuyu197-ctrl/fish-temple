#!/usr/bin/env node
/**
 * tools/verify-netease-login.mjs — 网易云扫码登录自检
 * ==================================================================
 * 为什么要单独一套：登录这条链路的失败**都不响**。
 *   · eapi 加密错一个字节 → 对方回 200 + 空 body，现象是"二维码扫了没反应"；
 *   · Cookie 解析错 → 登录看起来成功，后面每个接口都 401；
 *   · state 签名没校验 → 别人能拿你的 key 绑自己的账号（这个最要命）；
 *   · 二维码编码错一个模块 → 手机就是扫不出来。
 * 这些在界面上都长得像"再试一次"，所以必须在没有真人扫码的情况下也能验。
 *
 * 分三层：
 *   1. 纯函数：eapi 加密 / Cookie 编解码 / 二维码矩阵 / 绑定加解密；
 *   2. HTTP：起一个真的 server.mjs，验状态机、错误码、以及"响应里绝不能出现 cookie"；
 *   3. 联网：真的向网易云要一把 unikey 并轮询一次（拿不到就 SKIP，不算失败）。
 *
 * 用法：
 *   node tools/verify-netease-login.mjs            # 全部（联网那段失败会 SKIP）
 *   node tools/verify-netease-login.mjs --offline  # 不联网
 *   node tools/verify-netease-login.mjs --base http://127.0.0.1:5173  # 对着已有服务跑
 */

import { spawn } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promises as fs } from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const OFFLINE = args.includes('--offline');
const BASE_ARG = (() => {
  const i = args.indexOf('--base');
  return i >= 0 ? String(args[i + 1] || '').replace(/\/+$/, '') : null;
})();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const record = (name, ok, detail = '', skip = false) => {
  results.push({ name, ok, skip });
  const tag = skip ? '\x1b[33m SKIP\x1b[0m' : ok ? '\x1b[32m PASS\x1b[0m' : '\x1b[31m FAIL\x1b[0m';
  console.log(`${tag}  ${name}${detail ? `  \x1b[90m${detail}\x1b[0m` : ''}`);
};

async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

const getJSON = async (url, init = {}) => {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 不是 JSON 也照常返回原文 */ }
  return { status: res.status, json, text, headers: res.headers };
};

/* ================================================================== */
/* 1. 纯函数                                                           */
/* ================================================================== */

async function unitTests() {
  const load = (name) => import(pathToFileURL(path.join(ROOT, name)).href);
  const eapi = await load('netease-eapi.mjs');
  const qr = await load('netease-qr.mjs');
  const login = await load('netease-login.mjs');

  /* ---- eapi 加密 ---- */
  const params = eapi.eapiParams('/api/login/qrcode/unikey', { type: 3 });  record('eapi：params 是大写十六进制', /^[0-9A-F]+$/.test(params) && params.length % 32 === 0, `${params.length} 字符`);

  // 解回来必须能拆成 url / data / digest 三段，且 digest = md5(nobody…use…md5forencrypt)
  const crypto = await import('node:crypto');
  const decipher = crypto.createDecipheriv('aes-128-ecb', Buffer.from('e82ckenh8dichen8'), null);
  const plain = Buffer.concat([decipher.update(Buffer.from(params, 'hex')), decipher.final()]).toString('utf8');
  const m = /^(.*?)-36cd479b6b5-(.*?)-36cd479b6b5-(.*)$/.exec(plain);
  const expectDigest = crypto.createHash('md5')
    .update(`nobody${m?.[1]}use${m?.[2]}md5forencrypt`).digest('hex');
  record('eapi：密文解回的三段与 MD5 摘要自洽', !!m && m[3] === expectDigest, m ? m[1] : '结构不对');
  // eapiRequest 会把 header 塞进 body（协议要求），这里直接喂一份同样的结构验证纯函数
  const withHeader = eapi.eapiParams('/api/x', {
    type: 3,
    e_r: false,
    header: { deviceId: 'ABC', os: 'iPhone OS', appver: '9.0.90' },
  });
  const d2 = crypto.createDecipheriv('aes-128-ecb', Buffer.from('e82ckenh8dichen8'), null);
  const plain2 = Buffer.concat([d2.update(Buffer.from(withHeader, 'hex')), d2.final()]).toString('utf8');
  const body2 = (() => { try { return JSON.parse(/-36cd479b6b5-(.*?)-36cd479b6b5-/s.exec(plain2)?.[1] || 'null'); } catch { return null; } })();
  record('eapi：body 里带了 header（deviceId / os / appver）',
    !!(body2?.header?.deviceId && body2?.header?.os && body2?.header?.appver));

  /* ---- Cookie 编解码 ---- */
  const cookie = eapi.parseSetCookie([
    'MUSIC_U=abc/def+ghi==; Max-Age=1296000; Path=/; Domain=.music.163.com; HttpOnly',
    '__csrf=xyz; Path=/',
    '   ',
  ]);
  record('cookie：从 set-cookie 只取 name=value', cookie.MUSIC_U === 'abc/def+ghi==' && cookie.__csrf === 'xyz' && cookie.Domain === undefined,
    JSON.stringify(Object.keys(cookie)));
  const line = eapi.cookieToString({ MUSIC_U: 'a b', __csrf: 'c=d' });
  record('cookie：序列化对特殊字符转义', line.includes('MUSIC_U=a%20b') && line.includes('__csrf=c%3Dd'), line);

  /* ---- 二维码 ---- */
  const url = 'https://music.163.com/login?codekey=f442932e-0e7d-4c68-89f2-5771a6ad4224';
  const matrix = qr.qrMatrix(url, { ecl: 'L' });
  // 这个编码器只回 { size, modules }；版本号按规范反推：(size - 17) / 4
  const version = (matrix.size - 17) / 4;
  record('二维码：登录 URL 落在版本 4–6', version >= 4 && version <= 6, `v${version} ${matrix.size}×${matrix.size}`);
  record('二维码：矩阵长度与 size 自洽', matrix.modules.length === matrix.size * matrix.size);
  // 三个定位图形：左上 / 右上 / 左下 的 7×7 外框必须是深色
  const at = (r, c) => matrix.modules[r * matrix.size + c];
  const finderOk = [[0, 0], [0, matrix.size - 7], [matrix.size - 7, 0]].every(([r0, c0]) => {
    for (let i = 0; i < 7; i += 1) {
      if (!at(r0, c0 + i) || !at(r0 + 6, c0 + i) || !at(r0 + i, c0) || !at(r0 + i, c0 + 6)) return false;
    }
    return !at(r0 + 1, c0 + 1) && at(r0 + 3, c0 + 3);
  });
  record('二维码：三个定位图形形状正确', finderOk);

  const svg = qr.qrSvg(url, { size: 200, margin: 4, label: '扫码' });
  const total = matrix.size + 8;
  record('二维码：SVG 结构完整且没有脚本',
    svg.startsWith('<svg') && svg.endsWith('</svg>') && svg.includes(`viewBox="0 0 ${total} ${total}"`)
    && !/<script/i.test(svg) && svg.includes('<title>扫码</title>'));
  record('二维码：内容过长时抛清楚的错', (() => {
    try { qr.qrSvg('中'.repeat(400)); return false; } catch (e) { return /内容过长|超出/.test(e.message); }
  })());
  record('二维码：dataUrl 可被 <img> 用', qr.qrDataUrl('hi').startsWith('data:image/svg+xml;base64,'));

  /* ---- 权限开关 ---- */
  const member = { sub: 'auth0|member', role: 'member' };
  const owner = { sub: 'auth0|owner', role: 'owner' };
  const cfgOwner = { enabled: true, mode: 'owner' };
  const cfgMembers = { enabled: true, mode: 'members' };
  record('权限：默认 owner 模式下普通成员不能绑',
    login.canUseNeteaseLogin(member, cfgOwner).ok === false && login.canUseNeteaseLogin(owner, cfgOwner).ok === true);
  record('权限：members 模式下成员可以绑', login.canUseNeteaseLogin(member, cfgMembers).ok === true);
  record('权限：NETEASE_LOGIN=off 时整体关闭', login.canUseNeteaseLogin(owner, { enabled: false, mode: 'off' }).ok === false);

  /* ---- 绑定的加密存储 ---- */
  const mem = new Map();
  const store = {
    async readItem(c, id) { return mem.has(`${c}/${id}`) ? JSON.parse(mem.get(`${c}/${id}`)) : null; },
    async writeItem(c, id, v) { mem.set(`${c}/${id}`, JSON.stringify(v)); },
    async removeItem(c, id) { mem.delete(`${c}/${id}`); },
  };
  login._resetSecretCache();
  const storeCookie = { MUSIC_U: 'secret-value-123', __csrf: 'csrf', ignored: 'x' };
  await login.writeBinding(store, 'auth0|test', { cookie: storeCookie, profile: { uid: '42', nickname: '奈绪', avatarUrl: '', vipType: 0 } });
  const rawDoc = mem.get([...mem.keys()].find((k) => k.startsWith('netease-auth/')));
  record('存储：cookie 不以明文落库',
    !String(rawDoc).includes('secret-value-123') && JSON.parse(rawDoc).encrypted === true);
  const readBack = await login.readBinding(store, 'auth0|test');
  record('存储：能解回，且只保留白名单字段',
    readBack?.cookie?.MUSIC_U === 'secret-value-123' && readBack?.cookie?.ignored === undefined && readBack?.uid === '42');
  record('存储：别的 sub 读不到', (await login.readBinding(store, 'auth0|other')) === null);

  // 篡改密文必须解不开（GCM 的认证标签会拦下来）
  const key = [...mem.keys()].find((k) => k.startsWith('netease-auth/'));
  const tampered = JSON.parse(mem.get(key));
  tampered.cookie = tampered.cookie.slice(0, -4) + 'AAAA';
  mem.set(key, JSON.stringify(tampered));
  record('存储：密文被改过后拒绝使用（而不是返回半个 cookie）', (await login.readBinding(store, 'auth0|test')) === null);

  // 删掉密钥 = 旧绑定作废，但不会崩
  login._resetSecretCache();
  mem.delete('netease-meta/secret');
  record('存储：密钥轮换后旧绑定自动失效且不抛异常', (await login.readBinding(store, 'auth0|test')) === null);

  /* ---- 设备身份必须稳定（2026-10-25 被网易云风控教做人之后补的回归） ---- */
  login._resetDeviceCache();
  const devA = await login.getDeviceId(store);
  const devB = await login.getDeviceId(store);
  record('设备：同一个 store 复用同一个 deviceId', devA === devB && /^[0-9A-F]{52}$/.test(devA), devA.slice(0, 8) + '…');
  login._resetDeviceCache();
  const devC = await login.getDeviceId(store);
  record('设备：重启后从存储读回，而不是再造一台"新设备"', devC === devA);

  /* ---- 请求指纹要向官方客户端看齐（这是被风控拦过之后补的第二课） ---- */
  login._resetDeviceCache();
  const profA = await login.getDeviceProfile(store);
  login._resetDeviceCache();
  const profB = await login.getDeviceProfile(store);
  record('设备：_ntes_nuid / _ntes_nnid / WNMCID 也一起稳定',
    profA.deviceId === profB.deviceId && profA._ntes_nuid === profB._ntes_nuid
    && profA._ntes_nnid === profB._ntes_nnid && profA.WNMCID === profB.WNMCID);

  const idn = eapi.createIdentity({ deviceId: profA.deviceId });
  const identityCookies = ['_ntes_nuid', '_ntes_nnid', 'WNMCID', 'WEVNSM', '__remember_me', 'ntes_kaola_ad'];
  record('身份：请求带上官方客户端那套身份 cookie', identityCookies.every((k) => Boolean(idn.cookie[k])),
    identityCookies.filter((k) => !idn.cookie[k]).join(',') || '全都有');
  record('身份：默认 os=pc 画像（和上游默认一致，不是我们自编的 iPhone）',
    idn.cookie.os === 'pc' && /Windows/.test(idn.cookie.osver) && idn.cookie.appver === '3.1.17.204416');
  const idWithU = await login.identityFor(store, { MUSIC_U: 'fake-token-for-test' });
  record('身份：有 MUSIC_U 时不再注册匿名账号，且带上稳定设备 cookie',
    idWithU.cookie.MUSIC_U === 'fake-token-for-test'
    && !idWithU.cookie.MUSIC_A
    && idWithU.cookie._ntes_nuid === profA._ntes_nuid);

  /* ---- 备用通道：粘贴 MUSIC_U 的解析 ---- */
  const p1 = login.parseCookieInput('MUSIC_U=abc123def456ghi789; __csrf=zzz');
  record('备用通道：整段 cookie 能拆出 MUSIC_U', p1.MUSIC_U === 'abc123def456ghi789' && p1.__csrf === 'zzz');
  const p2 = login.parseCookieInput('MUSIC_U=abc123def456ghi789');
  record('备用通道：只有一行 MUSIC_U 也认', p2.MUSIC_U === 'abc123def456ghi789');
  const p3 = login.parseCookieInput('0123456789abcdefghijklmnopqrstuvwxyz');
  record('备用通道：只粘了值（没有等号）也认', p3.MUSIC_U === '0123456789abcdefghijklmnopqrstuvwxyz');
  record('备用通道：空输入不臆造凭据', Object.keys(login.parseCookieInput('   ')).length === 0);

  /* ---- weapi（云盘接口只认它） ---- */
  const wp = eapi.weapiPayload({ hello: 'world' });
  record('weapi：params 是 base64、encSecKey 是 256 位十六进制',
    /^[A-Za-z0-9+/=]+$/.test(wp.params) && /^[0-9a-f]{256}$/.test(wp.encSecKey));

  /* ---- 云盘条目映射：缺字段要有回落，不能崩 ---- */
  const shaped = login.shapeCloudSong({
    songId: 123, songName: 'X', artist: 'Y', album: 'Z', fileSize: 10, bitrate: 320000,
    simpleSong: { dt: 1000, al: { picUrl: 'p' }, ar: [{ name: 'A' }, { name: 'B' }] },
  });
  record('云盘：条目映射到播放器形状', shaped.id === '123' && shaped.name === 'X' && shaped.artist === 'Y'
    && shaped.cover === 'p' && shaped.duration === 1000 && shaped.matched === true);
  const bare = login.shapeCloudSong({ id: 9, songName: '只有名字' });
  record('云盘：只有最基础字段时也不崩', bare.id === '9' && bare.name === '只有名字' && bare.artist === '');

  // 音频签名：能验回 sub/id；改一个字符就拒（顺便锁住"云盘 token 不该被扫码校验器拦掉"这个回归）
  const audioLink = await login.cloudAudioUrl(store, 'auth0|cloud', '123456');
  const audioToken = new URL(audioLink, 'http://x').searchParams.get('t');
  const audioPayload = await login.verifyCloudAudioToken(store, audioToken);
  record('云盘：音频签名能验回 sub 与歌曲 id',
    audioPayload.sub === 'auth0|cloud' && audioPayload.id === '123456' && audioPayload.kind === 'cloud-audio');
  const trackLink = await login.signAudioUrl(store, 'auth0|vip', '3350903186', 'track-audio');
  const trackToken = new URL(trackLink, 'http://x').searchParams.get('t');
  const trackPayload = await login.verifyCloudAudioToken(store, trackToken);
  record('会员：track-audio 签名能验回 kind/sub/id/档位',
    trackPayload.kind === 'track-audio' && trackPayload.sub === 'auth0|vip'
    && trackPayload.id === '3350903186' && trackPayload.level === 'exhigh');
  let tamperedAudio = false;
  try { await login.verifyCloudAudioToken(store, `${audioToken.slice(0, -2)}zz`); } catch { tamperedAudio = true; }
  record('云盘：音频签名被改动后拒绝', tamperedAudio);
}

/* ================================================================== */
/* 2. HTTP                                                            */
/* ================================================================== */

async function httpTests(base) {
  const health = await getJSON(`${base}/api/health`);
  record('HTTP：health 声明了登录端点',
    health.json?.netease?.login?.enabled === true && (health.json?.netease?.login?.endpoints || []).includes('qr'),
    JSON.stringify(health.json?.netease?.login || null));

  const status = await getJSON(`${base}/api/netease/login/status`);
  record('HTTP：status 给出开关、模式与风险提示',
    status.json?.ok === true && status.json?.mode === 'owner' && /第三方登录/.test(status.json?.riskNotice || ''),
    `canBind=${status.json?.canBind} via=${status.json?.siteUser?.via}`);
  record('HTTP：status 响应里没有凭据', !/MUSIC_U|MUSIC_A/.test(status.text));

  const me = await getJSON(`${base}/api/netease/login/me`);
  record('HTTP：me 未绑定时 bound=null', me.json?.ok === true && me.json?.bound === null);

  const unbound = await getJSON(`${base}/api/netease/login/playlists`);
  record('HTTP：未绑定时读歌单回 404 并说清原因', unbound.status === 404 && /没有绑定/.test(unbound.json?.error || ''), unbound.json?.error || '');

  // state 被改：必须 400，且不能顺手生成新二维码
  const broken = await getJSON(`${base}/api/netease/login/qr/check?key=abc&state=forged.signature`);
  record('HTTP：伪造的 state 被拒绝（400）', broken.status === 400 && /校验失败|格式/.test(broken.json?.error || ''), broken.json?.error || '');

  const logout = await getJSON(`${base}/api/netease/login/logout`, { method: 'POST' });
  record('HTTP：解绑在未绑定时也安全返回', logout.status === 200 && logout.json?.bound === null);

  // 备用通道：没给 cookie 要 400；给了但里面没有 MUSIC_U 也要 400（不能拿别的东西去撞上游）
  const noCookie = await getJSON(`${base}/api/netease/login/cookie`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  record('HTTP：备用通道缺 cookie 回 400', noCookie.status === 400, noCookie.json?.error || '');
  const junkCookie = await getJSON(`${base}/api/netease/login/cookie`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookie: '这不是凭据' }),
  });
  record('HTTP：备用通道里没有 MUSIC_U 时拒绝入库', junkCookie.status === 400 && /MUSIC_U/.test(junkCookie.json?.error || ''),
    junkCookie.json?.error || '');

  // 云盘：未绑定要 404；音频链接的签名不对要拒绝
  const cloud = await getJSON(`${base}/api/netease/login/cloud`);
  record('HTTP：未绑定时读云盘回 404', cloud.status === 404 && /没有绑定/.test(cloud.json?.error || ''), cloud.json?.error || '');
  const vipUrls = await getJSON(`${base}/api/netease/login/urls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: ['3350903186'] }),
  });
  record('HTTP：未绑定时不能签会员音频', vipUrls.status === 404, `HTTP ${vipUrls.status}`);
  const badAudio = await getJSON(`${base}/api/netease/login/audio?id=123&t=forged.signature`);
  record('HTTP：伪造的音频签名被拒绝', badAudio.status >= 400 && badAudio.status < 500, `HTTP ${badAudio.status}`);
  const unboundAudio = await getJSON(`${base}/api/netease/login/audio?id=123`);
  record('HTTP：未绑定时音频端点回 403', unboundAudio.status === 403, `HTTP ${unboundAudio.status}`);

  if (OFFLINE) {
    record('联网：向网易云要扫码 key', false, '--offline', true);
    record('联网：轮询一次应停在 waiting', false, '--offline', true);
    return;
  }

  const qr = await getJSON(`${base}/api/netease/login/qr`);
  const okQr = qr.status === 200 && /^[0-9a-f-]{36}$/i.test(qr.json?.key || '') && String(qr.json?.qrSvg || '').startsWith('<svg');
  record('联网：向网易云要扫码 key 并生成二维码', okQr, okQr ? `key=${qr.json.key.slice(0, 8)}… svg=${qr.json.qrSvg.length}B` : (qr.json?.error || `HTTP ${qr.status}`));
  if (!okQr) {
    record('联网：轮询一次应停在 waiting', false, '上一步没拿到 key，跳过', true);
    return;
  }
  record('联网：二维码响应里没有凭据', !/MUSIC_U|MUSIC_A/.test(qr.text));

  const poll = await getJSON(`${base}/api/netease/login/qr/check?key=${encodeURIComponent(qr.json.key)}&state=${encodeURIComponent(qr.json.state)}`);
  record('联网：轮询一次停在 waiting（801）',
    poll.status === 200 && ['waiting', 'scanned'].includes(poll.json?.status),
    `${poll.json?.status} code=${poll.json?.code} ${poll.json?.message || ''}`);
  record('联网：轮询响应里没有凭据', !/MUSIC_U|MUSIC_A/.test(poll.text));

  // 诊断：本机回环身份是 owner，能看到事件环；且里面没有 cookie
  const diag = await getJSON(`${base}/api/netease/login/diagnostics`);
  record('联网：诊断接口可读，且事件环里有刚才的 unikey',
    diag.status === 200 && Array.isArray(diag.json?.events) && diag.json.events.some((e) => e.step === 'unikey'),
    `events=${diag.json?.events?.length ?? '-'}`);
  record('联网：诊断报告里没有凭据', !/MUSIC_U/.test(diag.text));
}

/* ================================================================== */
/* 3. 起服务 / 收尾                                                     */
/* ================================================================== */

async function main() {
  const t0 = Date.now();
  console.log('\x1b[1m网易云扫码登录自检\x1b[0m');
  console.log('\x1b[90m──────────────────────────────────────────────\x1b[0m');

  try {
    await unitTests();
  } catch (err) {
    record('纯函数测试跑完', false, String(err?.message || err));
  }

  let child = null;
  let base = BASE_ARG;
  let dataDir = null;
  if (!base) {
    const port = await freePort();
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ft-netease-login-'));
    child = spawn(process.execPath, ['server.mjs', String(port)], {
      cwd: ROOT,
      env: {
        ...process.env,
        FT_DATA_DIR: dataDir,
        FT_COOKIE_KEY: 'verify-only-key',
        NETEASE_LOGIN: 'owner',
        AUTH0_DOMAIN: '',
        AUTH0_CLIENT_ID: '',
      },
      stdio: 'ignore',
    });
    base = `http://127.0.0.1:${port}`;
    let up = false;
    for (let i = 0; i < 60; i += 1) {
      try { const h = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) }); if (h.ok) { up = true; break; } } catch { /* 还没起来 */ }
      await sleep(250);
    }
    if (!up) {
      record('起服务', false, `server.mjs 没能监听 ${port}`);
      child.kill();
      return summary(t0);
    }
    record('起服务', true, base);
  }

  try {
    await httpTests(base);
  } catch (err) {
    record('HTTP 测试跑完', false, String(err?.message || err));
  }

  if (child) { try { child.kill(); } catch { /* ignore */ } }
  if (dataDir) { await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {}); }
  return summary(t0);
}

function summary(t0) {
  const failed = results.filter((r) => !r.ok && !r.skip);
  const skipped = results.filter((r) => r.skip);
  console.log('\x1b[90m──────────────────────────────────────────────\x1b[0m');
  console.log(`\x1b[1m${results.length - failed.length - skipped.length}\x1b[0m 通过 · `
    + `\x1b[31m${failed.length}\x1b[0m 失败 · \x1b[33m${skipped.length}\x1b[0m 跳过 · `
    + `\x1b[90m${((Date.now() - t0) / 1000).toFixed(1)}s\x1b[0m`);
  if (failed.length) {
    console.log('\n失败明细：');
    for (const f of failed) console.log(`  · ${f.name}`);
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
