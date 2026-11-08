#!/usr/bin/env node
/** tools/test-ui-sauce-plain.mjs — UI 端到端：saucenao 引擎走纯转发（手机视口） */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));
const PORT = 9530 + Math.floor(Math.random() * 300);
const profile = path.join(os.tmpdir(), `ui-sauce-plain-${Date.now()}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--headless=new', '--disable-gpu', '--no-first-run', '--window-size=430,932'], { stdio: 'ignore' });

let ws, mid = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++mid;
  const t = setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error(method + ' 超时')); } }, 60000);
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

  await send('Page.navigate', { url: 'http://localhost:5173/#/saucenao' });
  await sleep(4500);
  console.log('[sauce-plain-ui] status:', await evalJs('document.querySelector("#sauceStatus")?.textContent'));

  await evalJs(`(async function(){
    const r = await fetch('/tools/test-small.jpg');
    const f = new File([await r.blob()], 'test.jpg', { type: 'image/jpeg' });
    const dt = new DataTransfer(); dt.items.add(f);
    const i = document.querySelector('#sauce-file'); i.files = dt.files;
    i.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  })()`);
  await sleep(2500);
  const t0 = Date.now();
  await evalJs(`document.querySelector('#sauce-go').click(); 'ok'`);

  let done = null;
  for (let i = 0; i < 25; i++) {
    await sleep(1000);
    const st = await evalJs(`JSON.stringify({
      hits: document.querySelectorAll('.sauce-hit').length,
      err: !document.querySelector('#sauce-error')?.hidden ? document.querySelector('#sauce-error-text')?.textContent.slice(0, 120) : '',
      status: document.querySelector('#sauce-status-text')?.textContent || '',
    })`);
    const o = JSON.parse(st);
    if (o.hits > 0 || o.err) { done = o; break; }
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('[sauce-plain-ui] 结果:', JSON.stringify(done), '耗时', secs + 's');

  if (done && done.hits > 0) {
    const d = await evalJs(`JSON.stringify((function(){
      const top = document.querySelector('.sauce-hit');
      const img = top.querySelector('.sauce-hit__thumb img');
      return {
        hits: document.querySelectorAll('.sauce-hit').length,
        limit: document.querySelector('#sauce-limit')?.textContent,
        top1: {
          sim: top.querySelector('.sauce-hit__sim')?.textContent.trim(),
          tag: top.querySelector('.tag')?.textContent.trim(),
          title: top.querySelector('.sauce-hit__title')?.textContent.trim(),
          meta: [...top.querySelectorAll('.sauce-hit__meta span')].map(x => x.textContent.trim()),
          primary: top.querySelector('.sauce-hit__links .btn--signal')?.getAttribute('href'),
          thumbLoaded: img ? (img.complete && img.naturalWidth > 0) : false,
          thumbIsData: img ? img.src.startsWith('data:') : false,
        },
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    })())`);
    console.log('[sauce-plain-ui] 详情:', d);
    await evalJs(`document.querySelector('#sauce-out-panel').scrollIntoView(); 'ok'`);
    await sleep(700);
    const s = await send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile('D:\\fish-temple\\.shots\\saucenao-mobile-plain.png', Buffer.from(s.data, 'base64'));
    console.log('[sauce-plain-ui] 截图 → .shots/saucenao-mobile-plain.png');
  }

  ws.close(); child.kill();
  process.exit(done && done.hits > 0 ? 0 : 1);
}
main().catch((e) => { console.error('[sauce-plain-ui] 失败:', e.message); try { child.kill(); } catch {} process.exit(1); });
setTimeout(() => { try { child.kill(); } catch {} process.exit(1); }, 120000);
