#!/usr/bin/env node
/**
 * tools/verify-android-server.mjs — 在电脑上验证安卓那个「本地服务」
 * ------------------------------------------------------------------
 * 安卓版不再依赖任何线上站点：APK 里带一份站点，启动时在 127.0.0.1 起一个
 * 小服务器（SiteServer.java），静态文件从 APK 资源里读，/api/* 里实现
 * health / 本地账号 / 只读内容覆盖层。
 *
 * 这段 Java 代码不碰 Android API，所以在普通 JVM 上就能跑 —— 这个脚本就是干这个：
 *   编译 → 起服务 → 用真浏览器访问 → 走一遍注册/登录/内容 → 截图 → 收工。
 *
 * 用法：
 *   node tools/verify-android-server.mjs
 *   node tools/verify-android-server.mjs --keep     # 跑完不关服务（调试用）
 *
 * 需要：JDK 17+（找 JAVA_HOME、PATH 或 %TEMP%\dsh-android\jdk17）+ Edge/Chrome。
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const KEEP = process.argv.includes('--keep');
const SRC_DIR = path.join(ROOT, 'app', 'android', 'app', 'src', 'main', 'java', 'com', 'qiyuyu', 'fishtemple');
const HARNESS = path.join(ROOT, 'app', 'android', 'tools', 'com', 'qiyuyu', 'fishtemple', 'TestHarness.java');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 找 JDK ---------- */

function findJdk() {
  const candidates = [
    process.env.JAVA_HOME,
    path.join(process.env.LOCALAPPDATA || '', 'Temp', 'dsh-android', 'jdk17'),
    'C:\\Program Files\\Java\\jdk-17',
    'C:\\Program Files\\Eclipse Adoptium\\jdk-17',
  ].filter(Boolean);
  for (const c of candidates) {
    const javac = path.join(c, 'bin', process.platform === 'win32' ? 'javac.exe' : 'javac');
    if (existsSync(javac)) return { javac, java: path.join(c, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') };
  }
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['javac'], { encoding: 'utf8' });
  if (which.status === 0) {
    const javac = which.stdout.split(/\r?\n/)[0].trim();
    return { javac, java: javac.replace(/javac(\.exe)?$/, process.platform === 'win32' ? 'java.exe' : 'java') };
  }
  return null;
}

const jdk = findJdk();
if (!jdk) {
  console.error('找不到 JDK（需要 17+）。设 JAVA_HOME，或装一个 Temurin 17。');
  process.exit(2);
}

/* ---------- 编译 ---------- */

const classes = await mkdtemp(path.join(os.tmpdir(), 'ft-android-classes-'));
const dataDir = await mkdtemp(path.join(os.tmpdir(), 'ft-android-data-'));
const javaSrc = ['Json.java', 'LocalAuth.java', 'SiteServer.java', 'RemoteApi.java'].map((f) => path.join(SRC_DIR, f));

// RemoteApi 用 org.json（Android 自带，JDK 没有）—— 测试时临时抓一个官方 jar 进 classpath。
const jsonJar = path.join(os.tmpdir(), 'ft-json-20240303.jar');
if (!existsSync(jsonJar)) {
  const res = await fetch('https://repo.maven.apache.org/maven2/org/json/json/20240303/json-20240303.jar');
  if (!res.ok) {
    console.error(`拉不到 org.json jar（HTTP ${res.status}）`);
    process.exit(2);
  }
  await writeFile(jsonJar, Buffer.from(await res.arrayBuffer()));
}

const compiled = spawnSync(jdk.javac, ['-encoding', 'UTF-8', '-cp', jsonJar, '-d', classes, ...javaSrc, HARNESS], { encoding: 'utf8' });
if (compiled.status !== 0) {
  console.error('编译失败：\n' + (compiled.stderr || compiled.stdout));
  process.exit(1);
}

/* ---------- 起服务 ---------- */

const child = spawn(jdk.java, ['-cp', `${classes}${process.platform === 'win32' ? ';' : ':'}${jsonJar}`,
  'com.qiyuyu.fishtemple.TestHarness', ROOT, dataDir], {
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});

let port = 0;
let harnessErr = '';
child.stderr.on('data', (d) => { harnessErr += d.toString(); });
child.stdin?.end();

const portDeadline = Date.now() + 20000;
while (!port && Date.now() < portDeadline) {
  await new Promise((resolve) => {
    const onData = (buf) => {
      const m = /PORT=(\d+)/.exec(buf.toString());
      if (m) { port = Number(m[1]); cleanup(); resolve(); }
    };
    const timer = setTimeout(() => { cleanup(); resolve(); }, 500);
    const cleanup = () => { clearTimeout(timer); child.stdout.off('data', onData); };
    child.stdout.on('data', onData);
  });
}
if (!port) {
  console.error('本地服务没起来：\n' + harnessErr);
  child.kill();
  process.exit(1);
}
console.log(`本地服务已启动：http://127.0.0.1:${port}/`);

const stop = async () => {
  if (!KEEP) { try { child.kill(); } catch { /* 已经没了 */ } }
  await rm(classes, { recursive: true, force: true }).catch(() => {});
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
};
process.on('exit', () => { try { child.kill(); } catch { /* ignore */ } });

/* ---------- 用浏览器验收 ---------- */

const BROWSER = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));
if (!BROWSER) {
  console.error('找不到 Edge / Chrome');
  await stop();
  process.exit(2);
}

let pass = 0;
let fail = 0;
const ok = (name, extra = '') => { pass++; console.log(`  PASS  ${name}${extra ? '  ' + extra : ''}`); };
const bad = (name, extra = '') => { fail++; console.log(`  FAIL  ${name}${extra ? '  ' + extra : ''}`); };

const CDP_PORT = 9450 + Math.floor(Math.random() * 200);
const profile = path.join(os.tmpdir(), `ft-android-browser-${Date.now()}`);
const browser = spawn(BROWSER, [
  `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
  '--headless=new', '--disable-gpu', '--no-first-run', '--window-size=1280,860',
  'about:blank',
], { stdio: 'ignore' });

let target = null;
for (let i = 0; i < 80; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    if (target) break;
  } catch { /* 等端口 */ }
  await sleep(250);
}
if (!target) { browser.kill(); await stop(); console.error('调试端口没起来'); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', () => rej(new Error('ws 失败')), { once: true });
});
let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const mid = ++id;
  pending.set(mid, { resolve, reject });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evalJS = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;

try {
  console.log('\n== 安卓本地服务自检 ==\n');
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/#/` });
  await sleep(4500);

  const boot = await evalJS(`({ booted: document.documentElement.dataset.booted === '1', title: document.title, chars: (document.querySelector('#view')?.textContent || '').length })`);
  boot.booted ? ok('站点能从 Java 服务里正常启动', `${boot.chars} 字符`) : bad('站点能从 Java 服务里正常启动', JSON.stringify(boot));

  const health = await evalJS(`fetch('/api/health').then(r => r.json()).catch(e => ({ error: String(e) }))`);
  health?.ok && health.deploy === 'android-local' ? ok('/api/health 走的是本地 Java 实现', health.server) : bad('/api/health 走的是本地 Java 实现', JSON.stringify(health).slice(0, 160));

  const cfg = await evalJS(`fetch('/api/auth/config').then(r => r.json())`);
  cfg?.mode === 'local' && cfg.enabled === true ? ok('/api/auth/config 报告本机账号模式') : bad('/api/auth/config 报告本机账号模式', JSON.stringify(cfg));

  const reg = await evalJS(`(async () => {
    const A = window.Terminal.Auth;
    const u = await A.loginLocal({ email: 'phone@local.test', password: 'temple2026', register: true });
    const me = await A.api('/auth/me');
    return { user: u, state: A.state, me: me.data?.user || me.error, chip: document.querySelector('#authToggle')?.textContent?.trim() || null };
  })()`);
  if (reg?.user?.role === 'owner' && reg.state === 'user' && reg.me?.email === 'phone@local.test') {
    ok('注册 → 登录 → /auth/me 全链路', `role=${reg.user.role}`);
  } else {
    bad('注册 → 登录 → /auth/me 全链路', JSON.stringify(reg).slice(0, 240));
  }

  const posts = await evalJS(`fetch('/api/content/posts').then(r => r.json()).then(j => ({ ok: j.ok, overlayOnly: j.overlayOnly, items: Array.isArray(j.items) ? j.items.length : -1 })).catch(e => ({ error: String(e) }))`);
  posts?.ok && posts.overlayOnly === true ? ok('内容接口回了空覆盖层（前端会用打包的数据）', `items=${posts.items}`) : bad('内容接口回了空覆盖层', JSON.stringify(posts));

  const publish = await evalJS(`fetch('/api/content/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => ({ status: r.status, ok: r.ok }))`);
  publish?.status === 501 ? ok('在手机端发内容会被明确拒绝（501 + 说明）') : bad('在手机端发内容会被明确拒绝', JSON.stringify(publish));

  const ne = await evalJS(`fetch('/api/netease/search?keywords=' + encodeURIComponent('夜航星') + '&limit=5').then(r => r.json()).catch(e => ({ error: String(e) }))`);
  if (ne?.ok && ne.songs?.length) ok('网易云搜索（Java 代理）', `via=${ne.via} · ${ne.songs.length} 首`);
  else bad('网易云搜索（Java 代理）', JSON.stringify(ne).slice(0, 200));

  const firstId = ne?.songs?.[0]?.id;
  if (firstId) {
    const detail = await evalJS(`fetch('/api/netease/song?id=${firstId}').then(r => r.json()).catch(e => ({ error: String(e) }))`);
    detail?.ok ? ok('曲目详情', detail.songs?.[0]?.name || '') : bad('曲目详情', JSON.stringify(detail).slice(0, 160));

    const lyric = await evalJS(`fetch('/api/netease/lyric?id=${firstId}').then(r => r.json()).catch(e => ({ error: String(e) }))`);
    lyric?.ok ? ok('歌词（行级 LRC）', `${(lyric.lrc || '').length} 字`) : bad('歌词（行级 LRC）', JSON.stringify(lyric).slice(0, 160));

    const audio = await evalJS(`fetch('/api/netease/audio?id=${firstId}', { method: 'HEAD' }).then(r => ({ status: r.status, type: r.headers.get('content-type') })).catch(e => ({ error: String(e) }))`);
    audio?.status === 200 ? ok('音频可解析（HEAD）', audio.type || '') : bad('音频可解析（HEAD）', JSON.stringify(audio));
  } else {
    bad('曲目详情 / 歌词 / 音频', '搜索没有结果，跳过');
  }

  const pixiv = await evalJS(`fetch('/api/pixiv/random?num=3').then(r => r.json()).catch(e => ({ error: String(e) }))`);
  if (pixiv?.ok && pixiv.items?.length) {
    ok('Pixiv 抽卡（Java 代理）', `${pixiv.items.length} 张`);
    const img = await evalJS(`fetch(${JSON.stringify(pixiv.items[0].url)}).then(r => ({ status: r.status, type: r.headers.get('content-type') })).catch(e => ({ error: String(e) }))`);
    img?.status === 200 && /image/.test(img.type || '') ? ok('Pixiv 图片代理 + 缓存', img.type) : bad('Pixiv 图片代理 + 缓存', JSON.stringify(img));
  } else {
    bad('Pixiv 抽卡（Java 代理）', JSON.stringify(pixiv).slice(0, 200));
  }

  const loginApi = await evalJS(`fetch('/api/netease/login/status').then(r => ({ status: r.status })).catch(() => ({ status: 0 }))`);
  loginApi?.status === 501 ? ok('网易云账号登录明确回 501（没实现的部分不假装可用）') : bad('网易云账号登录明确回 501', JSON.stringify(loginApi));

  const neteasePanel = await evalJS(`(async () => {
    location.hash = '#/music';
    await new Promise(r => setTimeout(r, 2200));
    return { neAccount: !!document.querySelector('#neAccount'), offline: /OFFLINE|还没连接|不可用/.test(document.querySelector('#neAccountBody')?.textContent || '') };
  })()`);
  neteasePanel?.neAccount ? ok('音乐台在离线模式下仍然渲染（网易云面板显示离线）', neteasePanel.offline ? 'OFFLINE' : '—') : bad('音乐台在离线模式下仍然渲染', JSON.stringify(neteasePanel));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile('.shots/android-local-server.png', Buffer.from(shot.data, 'base64'));
  ok('截图已保存', '.shots/android-local-server.png');
} catch (err) {
  bad('自检过程', String(err).slice(0, 200));
} finally {
  ws.close();
  browser.kill();
  await stop();
}

console.log(`\n== ${pass} PASS / ${fail} FAIL ==\n`);
process.exit(fail ? 1 : 0);
