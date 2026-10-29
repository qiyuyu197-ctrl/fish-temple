#!/usr/bin/env node
/**
 * tools/verify-pwa.mjs — 「装成 App」这条链路自检
 * ------------------------------------------------------------------
 * 装到主屏之后最容易出的三个问题，都能在这里被抓住：
 *   1. manifest 少一档图标 / 尺寸对不上 → 浏览器不给装（或装上是个丑图标）
 *   2. Service Worker 没注册成功 → 每次打开都要等网络，断网白屏
 *   3. 断网重开直接白屏 → 用户以为 App 坏了
 *
 * 用法：
 *   node tools/verify-pwa.mjs                     # 默认 http://127.0.0.1:5173
 *   node tools/verify-pwa.mjs http://127.0.0.1:5188
 *
 * 需要本机有 Chromium 内核浏览器（Edge / Chrome），和 tools/verify*.mjs 一致。
 * 退出码：0 全过；1 有失败项。
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE = (process.argv[2] || 'http://127.0.0.1:5173').replace(/\/$/, '');

const BROWSER = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));
if (!BROWSER) {
  console.error('找不到 Chromium 内核浏览器（Edge / Chrome）');
  process.exit(1);
}

const PORT = 9800 + Math.floor(Math.random() * 150);
const profile = path.join(os.tmpdir(), `dsh-verify-pwa-${Date.now()}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
let fail = 0;
const ok = (name, extra = '') => { pass++; console.log(`  PASS  ${name}${extra ? '  ' + extra : ''}`); };
const bad = (name, extra = '') => { fail++; console.log(`  FAIL  ${name}${extra ? '  ' + extra : ''}`); };

const child = spawn(BROWSER, [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--window-size=390,844',
  'about:blank',
], { stdio: 'ignore' });

let target = null;
for (let i = 0; i < 80; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    if (target) break;
  } catch { /* 等端口 */ }
  await sleep(250);
}
if (!target) { child.kill(); console.error('调试端口未就绪'); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', () => rej(new Error('ws 连接失败')), { once: true });
});

let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const mid = ++id;
  pending.set(mid, { resolve, reject });
  ws.send(JSON.stringify({ id: mid, method, params }));
});

const evalJS = async (expression) => {
  const r = await send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'evaluate 失败');
  return r.result?.value;
};

const goto = async (url, wait = 3200) => {
  await send('Page.navigate', { url });
  await sleep(wait);
};

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
  });

  console.log(`\n== PWA 自检 · ${BASE}\n`);

  /* ---------- 1) 首次访问：壳能起来 ---------- */
  await goto(`${BASE}/#/`, 3800);
  const booted = await evalJS(`document.documentElement.dataset.booted === '1'`);
  booted ? ok('首屏启动完成') : bad('首屏启动完成', 'boot 标记没出现');

  /* ---------- 2) manifest ---------- */
  const manifestHref = await evalJS(`document.querySelector('link[rel=manifest]')?.href || ''`);
  const manifest = await evalJS(`(async () => {
    const href = document.querySelector('link[rel=manifest]')?.href;
    if (!href) return { error: '没有 <link rel=manifest>' };
    const res = await fetch(href, { cache: 'no-store' });
    if (!res.ok) return { error: 'HTTP ' + res.status };
    return await res.json();
  })()`);
  if (manifest?.error) bad('manifest 可读', manifest.error);
  else {
    ok('manifest 可读', `${manifest.icons?.length || 0} 个图标`);
    const sizes = new Set((manifest.icons || []).map((i) => i.sizes));
    const purposes = new Set((manifest.icons || []).map((i) => i.purpose || 'any'));
    sizes.has('192x192') ? ok('图标含 192×192') : bad('图标含 192×192');
    sizes.has('512x512') ? ok('图标含 512×512') : bad('图标含 512×512');
    purposes.has('maskable') ? ok('图标含 maskable') : bad('图标含 maskable', 'Android 会套白底');
    (manifest.start_url === './#/' || manifest.start_url === '/#/')
      ? ok('start_url 指到首页', manifest.start_url) : bad('start_url 指到首页', String(manifest.start_url));
    manifest.display === 'standalone' ? ok('display=standalone') : bad('display=standalone', String(manifest.display));

    // screenshots 引用的文件必须真的能取到
    for (const shot of manifest.screenshots || []) {
      const url = new URL(shot.src, manifestHref).href;
      const r = await evalJS(`fetch(${JSON.stringify(url)}, { method: 'HEAD' }).then(r => r.status).catch(() => 0)`);
      r === 200 ? ok(`截图可访问 ${shot.src}`, shot.sizes) : bad(`截图可访问 ${shot.src}`, `HTTP ${r}`);
    }
  }

  /* ---------- 3) Service Worker ---------- */
  const sw = await evalJS(`(async () => {
    if (!('serviceWorker' in navigator)) return { error: '浏览器不支持 serviceWorker' };
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((r) => setTimeout(() => r(null), 12000)),
    ]);
    if (!reg) return { error: '等待 ready 超时（12s）' };
    const waited = await Promise.race([
      navigator.serviceWorker.controller ? Promise.resolve(true) : new Promise((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(true), { once: true });
      }),
      new Promise((r) => setTimeout(() => r(false), 6000)),
    ]);
    return {
      scope: reg.scope,
      active: !!reg.active,
      waiting: !!reg.waiting,
      controller: !!navigator.serviceWorker.controller,
      waited,
    };
  })()`);
  if (sw?.error) bad('Service Worker 注册', sw.error);
  else {
    ok('Service Worker 注册', sw.scope);
    sw.active ? ok('sw 已激活') : bad('sw 已激活');
    sw.controller ? ok('页面已受 sw 控制') : bad('页面已受 sw 控制', '刷新后才会接管');
  }

  /* ---------- 4) 安装性（Chromium 自己的判定） ---------- */
  try {
    const inst = await send('Page.getInstallabilityErrors');
    const errs = inst?.installabilityErrors || [];
    if (!errs.length) ok('Chromium 判定可安装');
    else {
      const text = errs.map((e) => `${e.errorId}${e.errorArguments?.length ? '(' + e.errorArguments.join(',') + ')' : ''}`).join(', ');
      bad('Chromium 判定可安装', text);
    }
  } catch (e) {
    bad('Chromium 判定可安装', String(e).slice(0, 120));
  }

  /* ---------- 5) 断网重开：壳还在 ---------- */
  await send('Network.emulateNetworkConditions', {
    offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
  });
  await goto(`${BASE}/#/`, 3000);
  const offlineState = await evalJS(`({
    booted: document.documentElement.dataset.booted === '1',
    hasShell: !!document.querySelector('.brand'),
    title: document.title,
    isOfflinePage: /离线/.test(document.title || ''),
  })`);
  if (offlineState.booted && offlineState.hasShell) ok('断网仍能打开外壳', offlineState.title);
  else if (offlineState.isOfflinePage) bad('断网仍能打开外壳', '落到了 offline.html（壳没缓存住）');
  else bad('断网仍能打开外壳', JSON.stringify(offlineState));

  // 断网时切一个板块：hash 路由不该依赖网络
  await send('Page.navigate', { url: `${BASE}/#/logs` });
  await sleep(2200);
  const routeOffline = await evalJS(`({
    hash: location.hash,
    hasView: (document.querySelector('#view')?.children.length || 0) > 0,
  })`);
  routeOffline.hasView ? ok('断网可切换板块', routeOffline.hash) : bad('断网可切换板块', JSON.stringify(routeOffline));

  // 离线兜底页本身也要在缓存里（导航兜底靠它）
  const offlinePage = await evalJS(`(async () => {
    try { const r = await fetch('offline.html', { cache: 'no-store' }); return r.status; }
    catch { return 0; }
  })()`);
  offlinePage === 200 ? ok('离线兜底页已缓存') : bad('离线兜底页已缓存', `status ${offlinePage}`);

  // 接口不进缓存：断网时必须失败，而不是把旧数据当新数据
  const apiOffline = await evalJS(`(async () => {
    try { const r = await fetch('api/health', { cache: 'no-store' }); return 'resolved:' + r.status; }
    catch { return 'rejected'; }
  })()`);
  apiOffline === 'rejected' ? ok('接口断网时不走缓存') : bad('接口断网时不走缓存', apiOffline);

  await send('Network.emulateNetworkConditions', {
    offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
  });
} catch (err) {
  bad('自检过程', String(err).slice(0, 200));
} finally {
  ws.close();
  child.kill();
}

console.log(`\n== ${pass} PASS / ${fail} FAIL\n`);
process.exit(fail ? 1 : 0);
