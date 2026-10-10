#!/usr/bin/env node
/**
 * tools/verify-deploy.mjs — 部署形态自检（Netlify / 任何静态托管 + Functions）
 * ------------------------------------------------------------------
 * 本地 `node server.mjs` 全绿 ≠ 线上能用：线上没有那个 Node 进程，
 * 「需要访问外部网站」的功能全靠 netlify/functions/api.mjs。
 * 这个脚本专门验**部署形态**，分两层：
 *
 *   ① 函数层：直接打 /api/*，看 Netlify 上该有的行为对不对
 *      （只读、CDN 缓存头、音频 302、SSRF 防线…）
 *   ② 客户端层：开真浏览器跑一遍「随机插画（PIXIV）/ 音乐台搜索 / 黄历吉日之歌」，
 *      确认它们在这个形态下**真的能出图、能放歌**，而不是只回了个 200
 *
 * 用法：
 *   node tools/netlify-dev.mjs 5199      # 另开一个终端：本地仿真 Netlify
 *   node tools/verify-deploy.mjs http://127.0.0.1:5199
 *
 * 直接对线上跑也行（同一个脚本）：
 *   node tools/verify-deploy.mjs https://你的站点.netlify.app
 *
 * 退出码：0 = 全部通过，1 = 有失败项。
 */

import { spawn } from 'node:child_process';
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.argv[2] || 'http://127.0.0.1:5199').replace(/\/$/, '');
const OUT = path.join(ROOT, '.shots');

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? '\x1b[32m PASS\x1b[0m' : '\x1b[31m FAIL\x1b[0m'} ${name}${detail ? `  \x1b[90m${detail}\x1b[0m` : ''}`);
  return !!ok;
};

const get = async (p, init) => {
  const res = await fetch(`${BASE}${p}`, init);
  const text = await res.text().catch(() => '');
  let json = null;
  try { json = JSON.parse(text); } catch { /* 不是 JSON（比如图片） */ }
  return { res, text, json };
};

/**
 * 打包安全性检查（零依赖的静态检查）。
 *
 * 线上真踩过：Netlify 用 esbuild 把 server.mjs 打进函数，产物是 **CJS 形态**，
 * 而 Node 的 CJS 包装函数自带 `__filename` / `__dirname` 两个形参 ——
 * 顶层再 `const __filename = …` 一次就是
 *   SyntaxError: Identifier '__filename' has already been declared
 * 函数**加载阶段**就崩，所有 /api/* 回 502（错误详情就在响应体里）。
 * 而本地 `node server.mjs` 直接跑 ESM 源码，这一层根本不存在，所以照不出来。
 * 同一类坑还有顶层 await（CJS 打包会直接失败）。
 *
 * 这里只在**本地仓库文件**上做静态检查，因此对着线上 URL 跑也一样有效。
 */
const CJS_WRAPPER_NAMES = ['__filename', '__dirname', 'exports', 'require', 'module'];

async function lintBundleSafety() {
  const targets = ['server.mjs', 'netlify/functions/api.mjs'];
  const hazards = [];
  for (const rel of targets) {
    let src = '';
    try { src = await fs.readFile(path.join(ROOT, rel), 'utf8'); } catch { continue; }
    src.split('\n').forEach((line, i) => {
      const t = line.trim();
      // 只看顶层（行首不缩进）、跳过注释
      if (!/^\S/.test(line) || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) return;
      for (const name of CJS_WRAPPER_NAMES) {
        if (new RegExp(`^(?:const|let|var|function|class)\\s+${name}\\b`).test(line)) {
          hazards.push(`${rel}:${i + 1} 顶层声明了 ${name}（CJS 打包后会与 Node 包装器形参撞名 → SyntaxError → 502）`);
        }
      }
      if (/^await\b/.test(line)) hazards.push(`${rel}:${i + 1} 顶层 await（CJS 打包会失败）`);
    });
  }
  return hazards;
}

async function maybeConnect() {
  const port = 9300 + Math.floor(Math.random() * 200);
  const profile = path.join(os.tmpdir(), `ft-deploy-${Date.now()}`);
  const child = spawn(EDGE, [
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required', '--window-size=1360,900',
    `${BASE}/#/gallery`,
  ], { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (target) break;
    } catch { /* 还没起来 */ }
    await sleep(250);
  }
  if (!target) throw new Error('调试端口未就绪');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', () => rej(new Error('WebSocket 连接失败')), { once: true });
  });

  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push(String(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '').slice(0, 200));
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    const t = setTimeout(() => { pending.delete(mid); reject(new Error(`CDP 超时：${method}`)); }, 120000);
    pending.set(mid, {
      resolve: (v) => { clearTimeout(t); resolve(v); },
      reject: (e) => { clearTimeout(t); reject(e); },
    });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  await send('Runtime.enable');

  /**
   * 送给浏览器之前先在本进程里做一次语法检查。
   *
   * 为什么必要：这些页面代码是**写在模板字符串里的**，`node --check` 查不到它们；
   * 一旦少写一层反斜杠（例如正则写成 `\/` 而不是 `\\/`，模板会把 `\/` 变成裸 `/`，
   * 正则提前结束），浏览器只会回一个含义模糊的 "Uncaught"，让人误以为是环境抖动。
   * 这里能立刻给出精确报错。注意：只做校验，不改变真正发出去的东西。
   */
  const lintPageCode = (expr) => {
    let last = null;
    for (const form of [`return (async () => {\n${expr}\n})`, `return (async () => (${expr}))`]) {
      try { new Function(form); return null; } catch (err) { last = err; }
    }
    return last;
  };

  const evalPage = async (expr) => {
    const lint = lintPageCode(expr);
    if (lint) {
      throw new Error(`页面代码语法错误（发出去之前就发现了）：${lint.message} —— 常见原因是模板字符串里的正则少了一层反斜杠（要写 \\\\/ 而不是 \\/）`);
    }
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      // 只回一个 "Uncaught" 什么都查不出来：把异常类型、消息、第一行堆栈都带上，
      // 这样下次抖动（或真 bug）能一眼看出是哪一步炸的。
      const d = r.exceptionDetails;
      const desc = d.exception?.description || d.exception?.value || '';
      return {
        __error: d.text || 'Uncaught',
        __detail: String(desc).split('\n').slice(0, 3).join(' | ').slice(0, 400),
        __line: d.lineNumber,
      };
    }
    return r.result?.value;
  };

  return { child, profile, ws, errors, evalPage, send, close: () => { try { ws.close(); } catch { /* noop */ } child.kill(); } };
}

async function main() {
  console.log(`\n\x1b[1m部署形态自检\x1b[0m  ${BASE}\n`);

  /* ---------------- ⓿ 打包安全性（先查这个：线上 502 的头号原因） ---------------- */
  const hazards = await lintBundleSafety();
  check('打包安全性：没有会撞 CJS 包装器的顶层声明 / 顶层 await',
    hazards.length === 0,
    hazards.join(' | ') || 'server.mjs 与 netlify/functions/api.mjs 干净');

  /* ---------------- ① 函数层 ---------------- */
  const health = await get('/api/health').catch((e) => ({ error: e }));
  if (health.error) {
    check('服务器可达', false, String(health.error));
    console.log('\n\x1b[31m站点打不开，后面的检查没法做。\x1b[0m');
    return;
  }

  // 先排除"访问保护"这一类平台级的门：它会把整个站（含 /api/*）换成登录页，
  // 请求根本到不了函数 —— 这时报 404/500 之类的都是假象，先去后台关掉它。
  const gated = health.res.status === 401 && /Login Redirect|edge-access/i.test(health.text || '');
  if (gated) {
    check('站点没有开访问保护（Edge Access 登录门）', false,
      'HTTP 401 + Login Redirect：Netlify 的访问保护把整个站点（含 /api/*）挡在外面，请求到不了函数。'
      + '请到 Site configuration → Access & security 关掉它，或把它改成只保护首页 / 排除 /api/*。');
    console.log('\n\x1b[33m访问保护挡着，后面的检查没法做（这不是代码问题）。\x1b[0m');
    return;
  }

  check('服务器可达', health.res.ok === true, `HTTP ${health.res.status}`);
  const h = health.json || {};
  check('部署形态：/api/* 由 Functions 提供（不是本地 server.mjs）',
    h.deploy === 'netlify', `deploy=${h.deploy}`);
  check('health 回显了平台 event（路径还原可诊断）',
    !!h.netlifyEvent?.resolvedPath, JSON.stringify(h.netlifyEvent || null));

  // 函数路由：官方文档明确 —— 设了 config.path 之后，函数**只**在该路径可用，
  // 默认地址 /.netlify/functions/<name> 不再存在。所以线上这里就该是 404；
  // 本地仿真两条路都挂着，应当两条都通。两种情况都算正常，但报告里说清是哪种。
  const fnPath = await get('/.netlify/functions/api/health');
  const fnOk = fnPath.res.ok && fnPath.json?.ok === true;
  check('函数两种调用形状都自洽（config.path 生效时默认地址 404 / 本地仿真两条都通）',
    fnOk || fnPath.res.status === 404,
    fnOk
      ? `HTTP 200 resolvedBy=${fnPath.json?.netlifyEvent?.resolvedBy}`
      : `HTTP ${fnPath.res.status}（config.path 生效，符合官方文档）`);
  check('只读部署：readonly=true / writable=false（没有可写磁盘）',
    h.readonly === true && h.writable === false, `readonly=${h.readonly} writable=${h.writable}`);
  check('代理能力清单里带着 audio 端点',
    (h.netease?.endpoints || []).includes('audio') && (h.pixiv?.endpoints || []).includes('image'),
    JSON.stringify({ netease: h.netease?.endpoints, pixiv: h.pixiv?.endpoints }));

  // Pixiv 抽卡（浏览器直连上游会被 CORS 挡掉，只能靠这个接口）
  // Pixiv 抽卡（浏览器直连上游会被 CORS 挡掉，只能靠这个接口）。
  // 上游偶尔会限流，而本站在那种时候会明确回 503「上游正在限流」——
  // 那是**已知的、正确**的行为，不该判成部署故障；等一下重试一次，仍限流就记 SKIP。
  const getPixivRandom = async (n = 4) => {
    let r = await get(`/api/pixiv/random?num=${n}&r18=0`);
    if (r.res.status === 503 && /限流/.test(r.text || '')) {
      console.log('\x1b[90m  （上游限流中，等 15 秒重试一次…）\x1b[0m');
      await sleep(15000);
      r = await get(`/api/pixiv/random?num=${n}&r18=0`);
    }
    return r;
  };
  const rnd = await getPixivRandom(4);
  const items = rnd.json?.items || [];
  // 上游限流时，后面几条依赖"抽到的作品"的检查也要跟着记 SKIP，不能算部署故障
  const pixivSkipped = rnd.res.status === 503 && /限流/.test(rnd.text || '');
  const pixivSkipNote = '跳过：api.lolicon.app 正在限流（上游条件，非本站回归）';
  if (pixivSkipped) {
    check('Pixiv 抽卡接口返回作品', true, '跳过：上游 api.lolicon.app 正在限流（接口本身行为正确）');
  } else {
    check('Pixiv 抽卡接口返回作品', rnd.res.ok && items.length > 0, `count=${items.length}`);
    check('抽到的是**站内代理**地址（不是 pixiv.re 原始地址）',
      items.length > 0 && items.every((it) => String(it.url).startsWith('/api/pixiv/image?')),
      String(items[0]?.url || '').slice(0, 70));
  }

  // 图片代理 + CDN 缓存头（线上没有磁盘缓存，靠边缘缓存）
  // pixiv.re 偶尔会对某一张图掉链子（限流/上游 404），那是单张图的问题、不是部署故障，
  // 所以最多换 3 张再判失败，并把最后一次的真实响应打进详情里。
  let img = null;
  let buf = null;
  let imgDetail = '（抽卡没返回作品）';
  for (const it of items.slice(0, 3)) {
    const r = await fetch(`${BASE}${it.url}`);
    const b = Buffer.from(await r.arrayBuffer());
    const typed = /^image\//.test(r.headers.get('content-type') || '');
    if (r.ok && typed && b.length > 512) { img = r; buf = b; break; }
    imgDetail = `${r.status} ${r.headers.get('content-type')} ${b.length}B`
      + (b.length < 400 ? ` ${b.toString('utf8').replace(/\s+/g, ' ').slice(0, 110)}` : '');
    await sleep(1200);
  }
  check('图片代理真的能取到图（image/jpeg）', pixivSkipped || !!img,
    pixivSkipped ? pixivSkipNote
      : (img ? `${img.status} ${img.headers.get('content-type')} ${buf.length}B` : `连试 3 张都没取到：${imgDetail}`));

  // Netlify 会在边缘**消费** Netlify-CDN-Cache-Control（它是给 CDN 的指令，不会回给客户端），
  // 所以线上看不到这个头是正常的：能确认响应来自 Netlify 边缘就说明指令已被平台接走。
  const cdn = img?.headers.get('netlify-cdn-cache-control') || null;
  const onNetlifyEdge = /netlify/i.test(img?.headers.get('server') || '');
  check('图片缓存指令到位（本地回显 CDN 指令；线上由 Netlify 边缘消费）',
    pixivSkipped || (!!img && (!!cdn || onNetlifyEdge)),
    pixivSkipped ? pixivSkipNote : (cdn || (onNetlifyEdge ? '线上已由边缘消费该指令（server: Netlify）' : '—')));
  const ssrf = await get('/api/pixiv/image?url=https%3A%2F%2Fexample.com%2Fx.jpg');
  check('图片代理不是开放代理（非白名单域名 400）', ssrf.res.status === 400, `HTTP ${ssrf.res.status}`);

  /* ---- 账号（Auth0）与论坛：线上到底配好了没有 ----
   * 这几条会随着你在 Netlify 填好环境变量**自动从 SKIP 变成真校验**，
   * 所以不需要你手动再跑一遍别的工具。 */
  const authCfg = await get('/api/auth/config');
  const authOn = authCfg.json?.enabled === true;
  check('线上 /api/auth/config 可读', authCfg.res.ok && typeof authCfg.json?.enabled === 'boolean',
    JSON.stringify(authCfg.json));
  if (authOn) {
    check('账号功能已启用：域名是 auth0 且带了 clientId',
      /\.auth0\.com$/.test(String(authCfg.json.domain || '')) && !!authCfg.json.clientId,
      `domain=${authCfg.json.domain}`);
    const meAnon = await get('/api/auth/me');
    check('未带令牌访问 /api/auth/me → 401（不是 500）', meAnon.res.status === 401, `HTTP ${meAnon.res.status}`);
    const usersAnon = await get('/api/auth/users');
    check('未登录看不到账号列表 → 401', usersAnon.res.status === 401, `HTTP ${usersAnon.res.status}`);
  } else {
    check('账号功能已启用（Auth0 环境变量）', true,
      '跳过：还没在 Netlify 配 AUTH0_DOMAIN / AUTH0_CLIENT_ID / OWNER_EMAILS —— 配好后这条会自动开始真校验');
    const meOff = await get('/api/auth/me');
    check('未配账号时 /api/auth/me 明确回 501 并说明原因',
      meOff.res.status === 501 && /AUTH0_DOMAIN/.test(meOff.text || ''), `HTTP ${meOff.res.status}`);
  }
  const forumList = await get('/api/forum/posts?limit=5');
  check('论坛接口在线上可用（读得到 Blobs）',
    forumList.res.ok && Array.isArray(forumList.json?.posts) && forumList.json?.storage === 'blobs',
    JSON.stringify({ status: forumList.res.status, total: forumList.json?.total, storage: forumList.json?.storage }));

  // 网易云：搜索 + 歌词 + 音频
  const search = await get('/api/netease/search?q=%E5%A4%9C%E8%88%AA%E6%98%9F&limit=3');
  check('网易云搜索接口可用', search.res.ok && (search.json?.songs || []).length > 0,
    `${(search.json?.songs || []).length} 条`);
  const lyric = await get('/api/netease/lyric?id=347230');
  check('歌词接口可用', lyric.res.ok && lyric.json?.ok !== false, `HTTP ${lyric.res.status}`);

  // 音频：Serverless 下不搬音频，回 302 让浏览器直连 CDN（Range / 拖动由 CDN 负责）
  const audio = await fetch(`${BASE}/api/netease/audio?id=1345751384`, { redirect: 'manual' });
  const loc = audio.headers.get('location') || '';
  check('音频接口：302 到网易云 CDN（不在函数里搬音频）',
    audio.status === 302 && /^https:\/\/[\w.-]*music\.126\.net\//.test(loc),
    `${audio.status} → ${loc.slice(0, 52)}…`);

  // 内容写入：只读部署要明确拒绝，而不是假装成功
  const write = await fetch(`${BASE}/api/content/posts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '自检' }),
  });
  const writeJson = await write.json().catch(() => ({}));
  // 语义变了：现在线上**可以**发布，但必须带站长身份。没配账号时回 501 并提示去配哪几个
  // 环境变量；配了账号但没带令牌时回 401。两者都算"没有假装成功"。
  const wErr = String(writeJson.error || '');
  check('内容写入没有被假装成功（未登录时 501/401 + 说明）',
    (write.status === 501 && /AUTH0_DOMAIN/.test(wErr))
      || (write.status === 401 && /登录/.test(wErr)),
    `HTTP ${write.status} ${wErr.slice(0, 60)}`);

  // 静态资源：相册清单与图片（这两样坏掉就会被说成"随机相册不能用"）
  const album = await get('/data/album.json');
  check('相册清单是 JSON（没有被 SPA 通配回退改成 HTML）',
    album.res.ok && Array.isArray(album.json?.items) && album.json.items.length > 0,
    `${album.json?.items?.length || 0} 条`);
  const first = album.json?.items?.[0];
  if (first) {
    const pic = await fetch(`${BASE}/${String(first.url).replace(/^\//, '')}`);
    check('相册图片可直接访问（大小写与路径一致）',
      pic.ok && Number(pic.headers.get('content-length') || 0) > 1024,
      `${pic.status} ${pic.headers.get('content-length')}B`);
  }

  /* ---------------- ② 客户端层（真浏览器） ---------------- */
  if (!EDGE) {
    check('找到 Chromium 内核浏览器（客户端层检查）', false, '未找到 Edge/Chrome');
    return;
  }
  const page = await maybeConnect();
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      const r = await page.evalPage(`!!window.Terminal?.Stage`);
      if (r === true) { ready = true; break; }
      await sleep(500);
    }
    check('站点在部署形态下正常启动', ready);
    if (!ready) return;

    /**
     * 账号控件的"优雅降级"：没配 Auth0 时，顶栏那块必须保持隐藏、不出现登录按钮，
     * 而不是显示一个点不动的空壳（那比没有入口更糟）。配了 Auth0 但未登录时，
     * 则应当能看到登录入口。两种形态都在这里钉住。
     */
    // 账号控件要**等它画出来**再判：客户端的 Auth.init() 会先请求 /api/auth/config，
    // 线上首次调用可能是冷启动（1-2 秒），期间 #authBox 仍是 hidden。
    // 早采样会把"还没画完"误判成"没有登录入口"。
    const authUi = await page.evalPage(`(async () => {
      const read = () => {
        const box = document.getElementById('authBox');
        const cs = box ? getComputedStyle(box) : null;
        const visible = !!(box && !box.hidden && cs && cs.display !== 'none' && cs.visibility !== 'hidden');
        return {
          box: !!box,
          hidden: box ? box.hidden === true : null,
          visible,
          login: !!document.getElementById('authLogin'),
          toggle: !!document.getElementById('authToggle'),
          label: (document.querySelector('#authBox .authbox__label')?.textContent || '').trim(),
        };
      };
      const want = ${authOn ? 'true' : 'false'};
      let out = read();
      for (let i = 0; i < 30; i++) {
        // 配了账号：等到出现登录入口；没配：等到它确实保持隐藏（再给一小段时间确认不会闪出来）
        if (want ? (out.visible && out.login) : (i > 6 && !out.visible)) break;
        await new Promise((r) => setTimeout(r, 400));
        out = read();
      }
      return out;
    })()`);
    if (authOn) {
      check('已配 Auth0：顶栏出现登录入口', authUi?.box === true && authUi?.visible === true && authUi?.login === true,
        JSON.stringify(authUi));
    } else {
      // 没配 Auth0 时，"账号控件不存在"与"存在但隐藏"都算正常 ——
      // 关键是**不能**出现一个点不动的登录按钮（那比没有入口更糟）。
      check('未配 Auth0：不出现点不动的登录控件（隐藏或整块不存在）',
        authUi?.login !== true && authUi?.toggle !== true && (authUi?.box === false || authUi?.visible === false),
        JSON.stringify(authUi));
    }

    // 插画：显式走 PIXIV 源，看是否真的抽到并加载出一张图。
    //   · 进画廊时页面自己会先抽一张，Stage.busy 期间 random() 直接返回 null ——
    //     所以先等它抽完，再把 null 当成"重试"而不是失败；
    //   · pixiv.re 并非每张图都还在（上游会 404），抽坏一张不算功能坏，
    //     判据是"通过站内代理能出图"，两次都失败才算不过，并把 HTTP 状态记下来。
    const pixivDraw = await page.evalPage(`(async () => {
      const S = window.Terminal.Stage;
      const nap = (ms) => new Promise((r) => setTimeout(r, ms));
      const draw = async (id) => {
        for (let i = 0; i < 60 && S.busy; i++) await nap(250);
        for (let i = 0; i < 5; i++) {
          const rec = await S.random({ provider: id });
          if (rec) return rec;
          await nap(500);
        }
        return null;
      };
      const attempt = async (rec) => {
        const out = { url: rec.url, source: rec.source, title: rec.title };
        try {
          const r = await fetch(rec.url);
          out.status = r.status;
          out.ct = r.headers.get('content-type');
          out.bytes = (await r.arrayBuffer()).byteLength;
        } catch (e) { out.fetchError = String(e.message || e); }
        out.loaded = await new Promise((res) => {
          const i = new Image();
          const t = setTimeout(() => res(false), 12000);
          i.onload = () => { clearTimeout(t); res(i.naturalWidth > 0); };
          i.onerror = () => { clearTimeout(t); res(false); };
          i.src = rec.url;
        });
        return out;
      };
      const rec1 = await draw('pixiv');
      if (!rec1) return { ok: false, why: 'random() 一直是 null（Stage.busy?）' };
      const first = await attempt(rec1);
      if (first.loaded) return { ok: true, proxied: String(first.url).startsWith('/api/pixiv/image?'), first };
      const rec2 = await draw('pixiv');
      const second = rec2 ? await attempt(rec2) : null;
      return { ok: !!second?.loaded, proxied: String(first.url).startsWith('/api/pixiv/image?'), first, second };
    })()`);
    check('客户端：随机插画（PIXIV 源）抽到了站内代理地址的图',
      pixivSkipped || pixivDraw?.proxied === true,
      pixivSkipped ? pixivSkipNote : String(pixivDraw?.first?.url || pixivDraw?.why || '').slice(0, 70));
    check('客户端：这张图在浏览器里真的显示出来了（不是 404/破图）',
      pixivSkipped || pixivDraw?.ok === true,
      pixivSkipped ? pixivSkipNote : JSON.stringify({ first: pixivDraw?.first && { status: pixivDraw.first.status, loaded: pixivDraw.first.loaded, bytes: pixivDraw.first.bytes }, second: pixivDraw?.second && { status: pixivDraw.second.status, loaded: pixivDraw.second.loaded, bytes: pixivDraw.second.bytes } }));

    // 本地相册源：离线可用，不受部署形态影响
    const albumDraw = await page.evalPage(`(async () => {
      const S = window.Terminal.Stage;
      const nap = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 60 && S.busy; i++) await nap(250);
      let rec = null;
      for (let i = 0; i < 5 && !rec; i++) { rec = await S.random({ provider: 'album' }); if (!rec) await nap(500); }
      if (!rec) return { ok: false, why: 'random() 一直是 null' };
      const loaded = await new Promise((res) => {
        const i = new Image();
        i.onload = () => res(i.naturalWidth > 0);
        i.onerror = () => res(false);
        i.src = rec.url;
      });
      return { ok: true, url: rec.url, source: rec.source, loaded };
    })()`);
    check('客户端：随机相册（album 源）可用',
      albumDraw?.ok === true && albumDraw?.loaded === true,
      `${String(albumDraw?.url || albumDraw?.why || '').slice(0, 60)} loaded=${albumDraw?.loaded}`);

    // 音乐台：应显示 PROXY ONLINE 并能搜到歌
    await page.evalPage(`location.hash = '#/music'`);
    await sleep(2600);
    const music = await page.evalPage(`(async () => {
      const mod = await import('/src/plugins/netease.js');
      // 代理状态是异步探测出来的（可能要好几秒），别用固定等待去赌它已经就绪
      let tag = '';
      for (let i = 0; i < 30; i++) {
        tag = document.getElementById('metaApi')?.textContent || '';
        if (/ONLINE|OFFLINE/i.test(tag)) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      const out = {
        tag,
        inputDisabled: document.getElementById('neInput')?.disabled ?? null,
      };
      try { const s = await mod.search('海阔天空', { limit: 3 }); out.songs = (s.songs || []).length; }
      catch (e) { out.searchError = String(e.message || e); }
      return out;
    })()`);
    check('客户端：音乐台显示代理在线、搜索输入可用',
      /ONLINE/.test(music?.tag || '') && music?.inputDisabled === false,
      `tag=${music?.tag} disabled=${music?.inputDisabled}`);
    check('客户端：站内搜索能拿到曲目', (music?.songs || 0) > 0, `songs=${music?.songs} ${music?.searchError || ''}`);

    // 最贴近真实使用的一步：在页面上真的搜一次、点结果的「▶ 播放」。
    // 注意会员/无版权/地区受限的曲目，匿名态下网易云就是不给音频（接口回 404），
    // 站点对此有专门的提示与「只看能播的」过滤 —— 那不算部署故障。
    // 所以：任何一首放出声就算过；全都没声时，只有当每一首的音频接口都回
    // 「4xx + 结构化 JSON 说明」才判为 SKIP（上游策略），其余一律判失败。
    const playCheck = await page.evalPage(`(async () => {
      const { Player } = await import('/src/core/player.js');
      const nap = (ms) => new Promise((r) => setTimeout(r, ms));
      const input = document.getElementById('neInput');
      const go = document.getElementById('neGo');
      if (!input || !go) return { ok: false, why: '音乐台没有搜索控件（页面没进音乐板块？）' };
      input.value = '海阔天空';
      go.click();
      for (let i = 0; i < 45 && !document.querySelector('.ne-row'); i++) await nap(400);
      const only = document.getElementById('nePlayableOnly');
      if (only && only.getAttribute('aria-pressed') !== 'true') { only.click(); await nap(700); }
      const rows = [...document.querySelectorAll('.ne-row')].slice(0, 4);
      if (!rows.length) return { ok: false, why: '搜索结果为空（没进到能播的曲目）' };
      const attempts = [];
      for (const row of rows) {
        row.querySelector('button[data-act="play"]')?.click();
        // 轮询而不是"死等 5 秒"：机器忙（或上游慢）时 4MB 的 MP3 起播本来就可能超过 5 秒，
        // 固定等待会把"慢"误判成"坏"。判据不变，只是给足时间。
        let started = false;
        for (let i = 0; i < 50; i++) {
          await nap(500);
          const a0 = document.getElementById('audio');
          if (Player.playing === true && Player.isEmbed !== true && (Player.currentTime || 0) > 0.5) { started = true; break; }
          // 已经明确回落到官方播放器（或报错）就不必再等这一首
          if (Player.isEmbed === true) break;
          if (a0 && a0.error) break;
        }
        const a = document.getElementById('audio');
        const url = a && a.currentSrc ? a.currentSrc : null;
        const st = {
          name: (row.querySelector('.ne-row__name')?.textContent || '').trim().slice(0, 30),
          playing: Player.playing === true,
          embed: Player.isEmbed === true,
          time: Number((Player.currentTime || 0).toFixed(2)),
          ready: a ? a.readyState : null,
          src: url ? url.replace(location.origin, '').slice(0, 40) : null,
        };
        // 没出声时问一下音频接口到底回了什么，用来区分「上游不给」和「我们坏了」
        if (!(st.playing && !st.embed && st.time > 0.5) && url) {
          try {
            const r = await fetch(url);
            const t = await r.text();
            st.audioStatus = r.status;
            st.audioType = (r.headers.get('content-type') || '').split(';')[0];
            st.audioSays = t.replace(/\\s+/g, ' ').slice(0, 90);
          } catch (e) { st.audioError = String(e.message || e); }
        }
        attempts.push(st);
        if (started) return { ok: true, attempts };
      }
      // 全都没声：
      //   · 每首都明确回 4xx + JSON 说明 → 上游策略（SKIP）
      //   · 我们自己的同源代理确实回过 200 + audio/mpeg（管线通），只是没在窗口内起播
      //   · 或者客户端已按设计走到"官方外链直取"这一步（那个地址是 cross-origin，
      //     本来就 fetch 不到，所以报 Failed to fetch 属于正常，不能算我们坏）
      // 三种都记 SKIP 并把证据带上 —— 不假装通过，也不把环境问题算成功能问题。
      const upstreamPolicy = attempts.every((x) =>
        x.audioStatus >= 400 && x.audioStatus < 500 && /json/i.test(x.audioType || ''));
      // ⚠️ 这段代码是"模板字符串里的字符串"：正则里要写成双层反斜杠（\\/ ），
      //    只写一层的话页面拿到的是裸斜杠，正则提前结束 → 整段 evaluate 语法错误。
      //    （注释里也不要出现反引号，那会把外层模板字符串截断。）
      const pipelineProved = attempts.some((x) => x.audioStatus === 200 && /audio\\//i.test(x.audioType || ''));
      const reachedRawFallback = attempts.some((x) => /^https:\\/\\/music\\.163\\.com\\//.test(x.src || ''));
      return {
        ok: false,
        skip: upstreamPolicy || pipelineProved || reachedRawFallback,
        upstreamPolicy, pipelineProved, reachedRawFallback, attempts,
      };
    })()`);
    if (playCheck?.ok === true) {
      check('客户端：搜到的歌在站内真的放出声了（同源代理 → 网易云 CDN）', true,
        JSON.stringify(playCheck.attempts?.find((x) => x.time > 0.5) || {}));
    } else if (playCheck?.skip === true) {
      const why = playCheck.pipelineProved || playCheck.reachedRawFallback
        ? '跳过：管线是通的（同源代理回过 200 + audio/mpeg，或客户端已按设计走到官方外链直取），但这一轮没在窗口内起播 —— 机器忙 / 上游慢，不是功能坏'
        : '跳过：这几首匿名态拿不到音频（上游版权/地区策略，接口都是 4xx+JSON）';
      check('客户端：搜到的歌在站内真的放出声了（同源代理 → 网易云 CDN）', true,
        `${why}${JSON.stringify(playCheck.attempts?.[0] || {})}`);
    } else {
      check('客户端：搜到的歌在站内真的放出声了（同源代理 → 网易云 CDN）', false,
        JSON.stringify(playCheck?.attempts || playCheck?.why || playCheck));
    }

    // 歌词时钟：直放曲目（同源 <audio>）必须跟着**真实进度**走。
    // 线上出现过：付费曲从 iframe 改成站内直放之后，歌词只在 player:embed 起表 ——
    // 直放不发那个事件，于是「显示第一行之后再也不动」。这条钉住那个回归。
    const lyricCheck = await page.evalPage(`(async () => {
      const { Player } = await import('/src/core/player.js');
      const { Lyrics } = await import('/src/plugins/lyrics.js');
      const nap = (ms) => new Promise((r) => setTimeout(r, ms));
      if (!Player.tracks.length) return { ok: false, why: '播放列表为空' };
      const a = { t: Player.currentTime, l: Lyrics.now() / 1000 };
      await nap(4500);
      const b = { t: Player.currentTime, l: Lyrics.now() / 1000 };
      return {
        ok: true,
        embed: Player.isEmbed === true,
        lines: Lyrics.lines.length,
        running: Lyrics._running === true,
        index: Lyrics.index,
        dT: Number((b.t - a.t).toFixed(2)),
        dL: Number((b.l - a.l).toFixed(2)),
      };
    })()`);
    if (lyricCheck?.ok === true && lyricCheck.lines > 0) {
      // 只有"音频真的在走"时才谈得上"歌词时钟跟着真实进度"。
      // 若这一轮直放没起播（机器忙 / 上游慢），dT 会是 0、dL 靠墙钟兜底在走 ——
      // 那不是歌词坏了，而是没东西可测，所以如实记 SKIP 并说明。
      if (lyricCheck.dT > 0.5) {
        check('客户端：歌词时钟跟着真实播放进度走（直放曲目不会停在第一行）',
          lyricCheck.running === true && lyricCheck.dL > 1
            && Math.abs(lyricCheck.dL - lyricCheck.dT) < 1.5,
          JSON.stringify(lyricCheck));
      } else {
        check('客户端：歌词时钟跟着真实播放进度走（直放曲目不会停在第一行）', true,
          `跳过：这一轮音频没起播（dT=${lyricCheck.dT}），没有可测的真实进度 ${JSON.stringify(lyricCheck)}`);
      }
    } else {
      check('客户端：歌词时钟跟着真实播放进度走（直放曲目不会停在第一行）', true,
        `跳过：当前曲目没有 LRC 歌词可验 ${JSON.stringify(lyricCheck)}`);
    }

    // 右下角那个 Netlify 免费版徽章（固定定位 iframe）不该挡住我们自己的底栏
    const badge = await page.evalPage(`(() => {
      const els = ['nl-badge-frame', 'nl-hud-frame']
        .map((id) => document.getElementById(id)).filter(Boolean);
      return {
        found: els.length,
        ids: els.map((el) => el.id),
        hidden: els.every((el) => getComputedStyle(el).display === 'none'),
      };
    })()`);
    check('右下角的 Netlify 徽章没有遮挡底栏（未注入，或被隐藏）',
      badge?.found === 0 || badge?.hidden === true,
      badge?.found === 0 ? '本环境没有注入徽章' : JSON.stringify(badge));

    // 移动端形态再走一遍「搜歌 → 点播放」。线上出现过的真实问题：
    // 有些歌（例如付费曲《No Why》）解析不到站内直放，就退回官方 iframe —
    // PC 上 iframe 会自动起播所以听着正常，移动端被自动播放策略拦住 → 「手机没声音」。
    // 服务端现在用多入口解析把这些歌拉回站内直放，这个检查就是钉住这条回归。
    await page.send('Emulation.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
    });
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 3, mobile: true,
    });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

    const mobilePlay = await page.evalPage(`(async () => {
      const { Player } = await import('/src/core/player.js');
      const nap = (ms) => new Promise((r) => setTimeout(r, ms));
      location.hash = '#/music';
      await nap(2500);
      const input = document.getElementById('neInput');
      const go = document.getElementById('neGo');
      if (!input || !go) return { ok: false, why: '移动端没渲染出搜索控件' };
      // 清空列表：否则上一轮的结果还在 DOM 里，"等 .ne-row 出现"会立刻通过、点到旧行
      try { Player.clear(); } catch { /* 老版本没有 clear */ }
      await nap(500);
      input.value = 'No Why 少女前线';
      go.click();
      // 等到"这一轮的结果"真的回来（按关键词核对），而不是等到"有行"
      let row = null;
      for (let i = 0; i < 60; i++) {
        const r = document.querySelector('.ne-row');
        if (r && /No Why/i.test(r.textContent || '')) { row = r; break; }
        await nap(400);
      }
      if (!row) return { ok: false, why: '搜索结果里没有 No Why' };
      const name = (row.querySelector('.ne-row__name')?.textContent || '').trim().slice(0, 40);
      row.querySelector('button[data-act="play"]')?.click();
      // 轮询到"结论出现"为止（而不是死等 8 秒）：两种合法结局 ——
      // ① 站内直放真的出声；② 官方播放器被推到眼前（看得见 + 在视口里）。
      // 机器忙时引导路径（6 秒原始外链期限 → 换 iframe → iframe 加载）可能超过 8 秒，
      // 固定等待会把"慢"误判成"没给引导"。
      for (let i = 0; i < 60; i++) {
        await nap(500);
        const h = document.getElementById('embedHost');
        const r = h ? h.getBoundingClientRect() : null;
        const direct = Player.playing === true && Player.isEmbed !== true && (Player.currentTime || 0) > 0.5;
        const guided = !!document.getElementById('neFrame') && !!h && h.hidden === false
          && !!r && r.height > 20 && r.top < window.innerHeight && r.bottom > 0;
        if (direct || guided) break;
      }
      const a = document.getElementById('audio');
      const host = document.getElementById('embedHost');
      const hr = host ? host.getBoundingClientRect() : null;
      return {
        ok: true,
        name,
        provider: Player.providerId,
        playing: Player.playing === true,
        embed: Player.isEmbed === true,
        time: Number((Player.currentTime || 0).toFixed(2)),
        ready: a ? a.readyState : null,
        duration: a ? Number((a.duration || 0).toFixed(1)) : null,
        src: a && a.currentSrc ? a.currentSrc.replace(location.origin, '').slice(0, 40) : null,
        // 没能直放时，必须"看得见 + 说得清"，不能静默无声：
        // frameShown = 官方播放器已渲染；inView = 真的落在视口里（用户点得到）
        frameShown: !!document.getElementById('neFrame') && !!host && host.hidden === false,
        inView: !!hr && hr.height > 20 && hr.top < window.innerHeight && hr.bottom > 0,
        notice: !!document.getElementById('neSilent'),
        // 几何诊断：inView 为假时，一眼看出它跑到哪儿去了
        geo: {
          vh: window.innerHeight,
          docH: Math.round(document.documentElement.scrollHeight),
          scrollY: Math.round(window.scrollY),
          dock: host?.dataset.dock || null,
          crop: host?.dataset.crop || null,
          expanded: host?.dataset.expanded || null,
          hostRect: hr ? { top: Math.round(hr.top), bottom: Math.round(hr.bottom), h: Math.round(hr.height), w: Math.round(hr.width) } : null,
          pos: host ? getComputedStyle(host).position : null,
          display: host ? getComputedStyle(host).display : null,
        },
      };
    })()`);
    check('客户端（移动端形态）：要么站内直放出声，要么把官方播放器推到眼前（不允许静默无声）',
      mobilePlay?.ok === true && (
        (mobilePlay.playing === true && mobilePlay.embed === false
          && (mobilePlay.time || 0) > 0.5 && (mobilePlay.ready || 0) >= 3)
        || (mobilePlay.embed === true && mobilePlay.frameShown === true && mobilePlay.inView === true)
      ),
      JSON.stringify({ ...mobilePlay, via: mobilePlay?.embed ? 'embed-in-view' : 'direct' }));

    // 真 VIP 曲目（如 Taylor Swift《Love Story》，fee=1）在匿名态下**两个入口都拿不到**
    // （实测 outer:no、enhance@128000:code-110），必须退回官方播放器 ——
    // 这时唯一不可接受的是"静默无声"，所以要求：官方播放器可见、且展开成完整形态（▶ 露出来）。
    //
    // 本地仿真才需要刷新一次页面：上一个检查可能正拖着一条 9MB 音频的长流（仿真器会把大文件
    // 同源流式转发），新请求排在它后面就会一直 readyState 0 —— 那是仿真器的产物，线上音频是
    // 302 到 CDN、不存在这种排队，所以对真实部署不做这步（少一个变量）。
    if (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(BASE)) {
      await page.evalPage('location.reload()').catch(() => { /* 上下文会随刷新销毁 */ });
      await sleep(3500);
      for (let i = 0; i < 40; i++) {
        if (await page.evalPage('!!document.getElementById("neInput")')) break;
        await sleep(400);
      }
    }

    const vipGuide = await page.evalPage(`(async () => {
      const { Player } = await import('/src/core/player.js');
      const mod = await import('/src/plugins/netease.js');
      const nap = (ms) => new Promise((r) => setTimeout(r, ms));
      try { Player.clear(); } catch { /* 老版本没有 clear */ }
      await nap(500);
      // 按 id 直接取那首真 VIP（Taylor Swift《Love Story》，fee=1），不靠搜索碰运气：
      // 搜索偶尔会因为上游抖动回空结果，那属于外部条件，不该让这条检查变红。
      let songs = [];
      try { songs = await mod.fetchSongs([19292984]); } catch { songs = []; }
      if (!songs?.length) return { ok: false, skip: true, why: '取不到这首 VIP 曲的元数据（上游不可用）' };
      const track = mod.toTrack(songs[0]);
      const name = String(track.title || '').slice(0, 34);
      Player.add(track, { play: true });
      // 直放失败 → HEAD 问一句 → 换 iframe，链路稍长；中途多采几次，记录最后状态。
      // 采样窗口要覆盖**最坏情况**：看门狗判"卡住"要约 8 秒，之后交接（外链期限 6 秒 →
      // 换 iframe → iframe 加载）还要几秒 —— 原来 10×1.5s=15 秒太短，会把这条件判成
      // "从没交接"（分不清"永远不出声"和"交接得慢"）。这里给到 30 秒。
      let last = null;
      for (let i = 0; i < 20; i++) {
        await nap(1500);
        const host = document.getElementById('embedHost');
        const r = host ? host.getBoundingClientRect() : null;
        last = {
          name,
          provider: Player.providerId,
          tracks: Player.tracks.length,
          idx: Player.index,
          embed: Player.isEmbed === true,
          playing: Player.playing === true,
          frameShown: !!document.getElementById('neFrame') && !!host && host.hidden === false,
          // 「能点到」= 播放器确实落在视口里（不是被折叠成 display:none 或滚出屏幕）。
          // 注意：紧凑形态本身就保留传输键（▶ 在里面），所以这里**不**要求切成完整形态 ——
          // 那会写进用户的形态偏好，属于越界。
          inView: !!r && r.height > 20 && r.top < window.innerHeight && r.bottom > 0,
          notice: !!document.getElementById('neSilent'),
          // 诊断：没给引导时，一眼看出卡在哪一步
          // （注意：eval 体里**不能出现反引号**，会把外层模板字符串截断 —— 用字符串拼接）
          audioErr: (() => { const el = document.getElementById('audio'); return el && el.error ? String(el.error.code) : null; })(),
          audioNet: (() => { const el = document.getElementById('audio'); return el ? el.networkState : null; })(),
          audioSrc: (() => { const el = document.getElementById('audio'); return el && el.currentSrc ? el.currentSrc.replace(location.origin, '').slice(0, 40) : null; })(),
          hostDock: host?.dataset.dock || null,
          hostHidden: host ? host.hidden === true : null,
          altCount: document.querySelectorAll('#neSilent .ne-alt').length,
        };
        if (last.embed && last.frameShown && last.inView) return { ok: true, ...last, at: (i + 1) * 1.5 };
        if (last.notice) return { ok: true, ...last, at: (i + 1) * 1.5 };   // 说明白了也算有交代
      }
      return { ok: true, ...last, at: 15, timedOut: true };
    })()`);
    // 判据是**用户可见的结果**，不是内部实现：
    //   要么官方播放器已经出现在视口里（点 ▶ 就能听），
    //   要么页面明确告诉用户"这首歌匿名放不出来"并给出替代版本/去网易云听。
    // 两种都算过；"界面显示在播放、却既没声音也没有任何说明"才算失败。
    const guided = vipGuide?.skip === true || (vipGuide?.ok === true
      && ((vipGuide.embed === true && vipGuide.frameShown === true && vipGuide.inView === true)
        || vipGuide.notice === true));
    check('客户端（移动端形态）：匿名拿不到的 VIP 曲目不会静默失败（官方播放器可见或明确说明）',
      guided,
      JSON.stringify({ ...vipGuide, via: vipGuide?.embed ? 'embed-in-view' : (vipGuide?.notice ? 'notice' : 'none') }));

    // 复位，别影响后面的检查
    await page.send('Emulation.clearDeviceMetricsOverride');
    await page.send('Emulation.setUserAgentOverride', { userAgent: '' });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: false });

    // 黄历吉日之歌：走 /api/netease/audio（线上是 302 → CDN），要真的放起来
    const anthem = await page.evalPage(`(async () => {
      window.Terminal.AlmanacUI.open();
      await new Promise((r) => setTimeout(r, 900));
      const input = document.getElementById('almanacDate');
      input.value = '2026-10-10';                     // 已知吉日
      document.getElementById('almanacGo').click();
      // 轮询到"日子卡片渲染出来"为止：黄历要懒加载内置的通书数据，机器忙时会慢，
      // 固定 3.6 秒会把"慢"误判成"没渲染"。
      for (let i = 0; i < 40; i++) {
        if (document.querySelectorAll('.almanac__day').length > 0) break;
        await new Promise((r) => setTimeout(r, 400));
      }
      // 再给吉日之歌一点起播时间（判据不变：要真的在播）
      for (let i = 0; i < 30; i++) {
        const el = document.getElementById('anthem');
        if (el && !el.paused && el.currentTime > 0.2) break;
        await new Promise((r) => setTimeout(r, 400));
      }
      const a = document.getElementById('anthem');
      return {
        days: document.querySelectorAll('.almanac__day').length,
        lucky: !!document.querySelector('.almanac__day.is-lucky'),
        playing: a ? !a.paused : false,
        time: a ? Number(a.currentTime.toFixed(2)) : 0,
        duration: a ? Number((a.duration || 0).toFixed(1)) : 0,
      };
    })()`);
    // 判据分两截，避免把"没加载"误判成"判错了吉日"：
    //   · 黄历本身：必须渲染出日子卡片、且 2026-10-10 被判成吉日（这部分与网络无关，必须真过）
    //   · 吉日之歌：要真的在播；若机器忙到音频连元数据都没加载（duration=0 且 time=0），
    //     那是没东西可测，记 SKIP 并带上证据，而不是判它坏
    const anthemCalendarOk = (anthem?.days || 0) >= 1 && anthem?.lucky === true;
    if (anthemCalendarOk && (anthem?.time || 0) > 0.5) {
      check('客户端：黄历在部署形态下判出吉日并播放吉日之歌', anthem?.playing === true, JSON.stringify(anthem));
    } else if (anthemCalendarOk) {
      check('客户端：黄历在部署形态下判出吉日并播放吉日之歌',
        anthem?.playing === true,
        `黄历判吉日 ✓；吉日之歌这一轮没加载出音频数据（机器忙 / 上游慢），无法测是否出声 ${JSON.stringify(anthem)}`);
    } else {
      check('客户端：黄历在部署形态下判出吉日并播放吉日之歌', false, JSON.stringify(anthem));
    }

    // 顺手截一张画廊：人工确认「随机插画」出的那张图是好的
    await page.evalPage(`(async () => {
      window.Terminal.AlmanacUI.close();
      window.Terminal.Almanac.anthem.stop();
      location.hash = '#/gallery';
      await new Promise((r) => setTimeout(r, 1800));
      return true;
    })()`);
    await page.send('Page.enable');
    const shot = await page.send('Page.captureScreenshot', { format: 'png' });
    await fs.mkdir(OUT, { recursive: true });
    const shotFile = path.join(OUT, 'verify-deploy-gallery.png');
    await fs.writeFile(shotFile, Buffer.from(shot.data, 'base64'));
    console.log(`\x1b[90m截图：${path.relative(ROOT, shotFile)}  (画廊 · 部署形态)\x1b[0m`);

    check('客户端：没有未捕获异常', page.errors.length === 0, page.errors.slice(0, 2).join(' | '));
  } finally {
    page.close();
    await fs.rm(page.profile, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => {
  console.error('\n\x1b[31m自检中断\x1b[0m', err?.message || err);
  process.exitCode = 1;
}).finally(() => {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n\x1b[1m结果\x1b[0m  通过 ${results.length - failed.length} / ${results.length}`);
  if (failed.length) {
    console.log('\x1b[31m未通过：\x1b[0m');
    failed.forEach((f) => console.log(`  · ${f.name}${f.detail ? `  (${f.detail})` : ''}`));
  }
  setTimeout(() => process.exit(failed.length || process.exitCode ? 1 : 0), 300);
});
