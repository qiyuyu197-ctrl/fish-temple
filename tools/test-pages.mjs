#!/usr/bin/env node
/** tools/test-pages.mjs — 验证 GitHub Pages 线上版（手机视口） */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SITE = 'https://qiyuyu197-ctrl.github.io/fish-temple/#/saucenao';
const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));
const PORT = 9550 + Math.floor(Math.random() * 300);
const profile = path.join(os.tmpdir(), `pages-${Date.now()}`);
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
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });
  const evalJs = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __err: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
    return r.result.value;
  };

  console.log('[pages] 打开', SITE);
  await send('Page.navigate', { url: SITE });
  await sleep(6000);

  const state = await evalJs(`JSON.stringify({
    title: document.title,
    hasView: !!document.querySelector('.sauce-view'),
    status: document.querySelector('#sauceStatus')?.textContent,
    notice: (document.querySelector('#sauce-notice-text')?.textContent || '').slice(0, 100),
    noticeHidden: document.querySelector('#sauce-notice')?.hidden,
    swVersion: navigator.serviceWorker ? 'has-sw' : 'no-sw',
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  })`);
  console.log('[pages] 页面状态:', state);

  // trace 引擎：用站点内置图片（/tools 不上公网）直连搜索
  await evalJs(`document.querySelector('.chip[data-engine="trace"]').click(); 'ok'`);
  await sleep(300);
  const inject = await evalJs(`(async function(){
    const r = await fetch('/fish-temple/assets/icons/mark-512.png');
    if (!r.ok) return 'fetch fail ' + r.status;
    const f = new File([await r.blob()], 'test.png', { type: 'image/png' });
    const dt = new DataTransfer(); dt.items.add(f);
    const i = document.querySelector('#sauce-file'); i.files = dt.files;
    i.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  })()`);
  console.log('[pages] 注入:', inject);
  await sleep(2500);
  await evalJs(`document.querySelector('#sauce-go').click(); 'ok'`);

  let done = null;
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const st = await evalJs(`JSON.stringify({
      hits: document.querySelectorAll('.sauce-hit').length,
      err: !document.querySelector('#sauce-error')?.hidden ? document.querySelector('#sauce-error-text')?.textContent.slice(0, 120) : '',
      limit: document.querySelector('#sauce-limit')?.textContent || '',
    })`);
    const o = JSON.parse(st);
    if (o.hits > 0 || o.err) { done = o; break; }
  }
  console.log('[pages] trace 直连结果:', JSON.stringify(done));

  if (done && done.hits > 0) {
    const top = await evalJs(`JSON.stringify((function(){
      const t = document.querySelector('.sauce-hit');
      return {
        tag: t.querySelector('.tag')?.textContent.trim(),
        title: t.querySelector('.sauce-hit__title')?.textContent.trim(),
        sim: t.querySelector('.sauce-hit__sim')?.textContent.trim(),
        meta: [...t.querySelectorAll('.sauce-hit__meta span')].map(x => x.textContent.trim()),
      };
    })())`);
    console.log('[pages] Top1:', top);
    await evalJs(`document.querySelector('#sauce-out-panel').scrollIntoView(); 'ok'`);
    await sleep(700);
    const s = await send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile('D:\\fish-temple\\.shots\\pages-trace.png', Buffer.from(s.data, 'base64'));
    console.log('[pages] 截图 → .shots/pages-trace.png');
  }

  ws.close(); child.kill();
  process.exit(0);
}
main().catch((e) => { console.error('[pages] 失败:', e.message); try { child.kill(); } catch {} process.exit(1); });
setTimeout(() => { try { child.kill(); } catch {} process.exit(1); }, 180000);
