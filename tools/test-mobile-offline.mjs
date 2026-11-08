#!/usr/bin/env node
/**
 * tools/test-mobile-offline.mjs — 手机场景验证
 * ① 移动视口(430×932)：面板标题不断字、布局不溢出
 * ② 屏蔽本地 API（模拟服务未启动/静态部署）：提示应为 LOCAL ONLY + 友好说明
 * ③ API 被屏蔽时，TRACE.MOE 引擎应仍可直连成功（不依赖服务端）
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));
const PORT = 9510 + Math.floor(Math.random() * 350);
const profile = path.join(os.tmpdir(), `mob-off-${Date.now()}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--headless=new', '--disable-gpu', '--no-first-run', '--window-size=430,932'], { stdio: 'ignore' });

let ws, mid = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++mid;
  const t = setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error(method + ' 超时')); } }, 90000);
  pending.set(id, { resolve: (v) => { clearTimeout(t); res(v); }, reject: (e) => { clearTimeout(t); rej(e); } });
  ws.send(JSON.stringify({ id, method, params }));
});
async function shot(name) {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(`D:\\fish-temple\\.shots\\${name}.png`, Buffer.from(s.data, 'base64'));
  console.log(`[mob] 截图 → .shots/${name}.png`);
}

async function main() {
  let target = null;
  for (let i = 0; i < 40; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page' && t.webSocketDebuggerUrl); if (target) break; } catch {}
    await sleep(250);
  }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
  });
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });
  const evalJs = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __err: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
    return r.result.value;
  };

  // ① 正常状态（服务在运行）
  await send('Page.navigate', { url: 'http://localhost:5173/#/saucenao' });
  await sleep(4500);
  const normal = await evalJs(`JSON.stringify({
    status: document.querySelector('#sauceStatus')?.textContent,
    noticeHidden: document.querySelector('#sauce-notice')?.hidden,
    titleLines: (function(){ const t = document.querySelector('.sauce .panel__title'); if (!t) return -1; return t.getClientRects().length; })(),
    titleText: document.querySelector('.sauce .panel__title')?.textContent,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  })`);
  console.log('[mob] 正常态:', normal);
  await shot('saucenao-mobile-normal');

  // ② 屏蔽本地 API → 模拟服务未启动 / 静态部署
  await send('Network.setBlockedURLs', { urls: ['*/api/saucenao/*', '*/api/trace/search*'] });
  await send('Page.reload', { ignoreCache: true });
  await sleep(5000);
  const offline = await evalJs(`JSON.stringify({
    status: document.querySelector('#sauceStatus')?.textContent,
    noticeHidden: document.querySelector('#sauce-notice')?.hidden,
    noticeText: (document.querySelector('#sauce-notice-text')?.textContent || '').slice(0, 120),
    noticeClass: document.querySelector('#sauce-notice')?.className,
    goDisabled: document.querySelector('#sauce-go')?.disabled,
  })`);
  console.log('[mob] API 屏蔽态:', offline);
  await shot('saucenao-mobile-offline');

  // ③ API 被屏蔽时切 trace 引擎搜真实图 → 应走浏览器直连成功
  await evalJs(`document.querySelector('.chip[data-engine="trace"]').click(); 'ok'`);
  await sleep(300);
  await evalJs(`(async function(){
    const r = await fetch('/tools/test-small.jpg');
    const f = new File([await r.blob()], 'test.jpg', { type: 'image/jpeg' });
    const dt = new DataTransfer(); dt.items.add(f);
    const i = document.querySelector('#sauce-file'); i.files = dt.files;
    i.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  })()`);
  await sleep(2500);
  console.log('[mob] 点击 trace 搜索（本地 API 已屏蔽，走直连）…');
  await evalJs(`document.querySelector('#sauce-go').click(); 'ok'`);

  let done = null;
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const st = await evalJs(`JSON.stringify({
      hits: document.querySelectorAll('.sauce-hit').length,
      err: !document.querySelector('#sauce-error')?.hidden ? document.querySelector('#sauce-error-text')?.textContent.slice(0, 100) : '',
      limit: document.querySelector('#sauce-limit')?.textContent || '',
    })`);
    const o = JSON.parse(st);
    if (o.hits > 0 || o.err) { done = o; break; }
  }
  console.log('[mob] trace 直连结果:', JSON.stringify(done));
  if (done && done.hits > 0) {
    await sleep(1200);
    await evalJs(`document.querySelector('#sauce-out-panel').scrollIntoView(); 'ok'`);
    await sleep(700);
    await shot('saucenao-mobile-trace');
  }

  ws.close(); child.kill();
  process.exit(done && done.hits > 0 ? 0 : 1);
}
main().catch((e) => { console.error('[mob] 失败:', e.message); try { child.kill(); } catch {} process.exit(1); });
setTimeout(() => { try { child.kill(); } catch {} process.exit(1); }, 180000);
