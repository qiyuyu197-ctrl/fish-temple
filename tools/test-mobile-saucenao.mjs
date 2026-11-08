#!/usr/bin/env node
/** tools/test-mobile-saucenao.mjs — 移动端视口(430×932)结果态截图 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));
const thumbB64 = await fs.readFile('D:\\fish-temple\\tools\\thumb-b64.txt', 'utf8');

// 精简版真实数据（同 test-render）
const DATA = {
  ok: true, count: 2, elapsedMs: 14000,
  results: [
    { similarity: 91.3, thumbnail: '', thumbnailData: `data:image/jpeg;base64,${thumbB64}`, dbId: 12, indexName: 'Yande.re', title: 'Creator: missile228', creator: 'missile228', source: 'pixiv #147357244', material: 'original', primaryUrl: 'https://www.pixiv.net/member_illust.php?mode=medium&illust_id=147357244', primaryLabel: 'pixiv #147357244', sourceSite: 'Pixiv', sourceIcon: '🎨', links: [{ url: 'https://danbooru.donmai.us/post/show/11815916', label: 'danbooru.donmai.us' }, { url: 'https://yande.re/post/show/1266085', label: 'yande.re' }], hidden: false },
    { similarity: 34.05, thumbnail: '', dbId: 5, indexName: 'pixiv', title: '竜の魔女', member: 'Lasy', source: 'pixiv ID: 62264742', primaryUrl: 'https://www.pixiv.net/member_illust.php?mode=medium&illust_id=62264742', primaryLabel: '62264742', sourceSite: 'Pixiv', sourceIcon: '🎨', links: [{ url: 'https://www.pixiv.net/member_illust.php?mode=medium&illust_id=62264742', label: '62264742' }], hidden: true },
  ],
};

const PORT = 9470 + Math.floor(Math.random() * 370);
const profile = path.join(os.tmpdir(), `ui-mob-${Date.now()}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--headless=new', '--disable-gpu', '--no-first-run', '--window-size=430,932'], { stdio: 'ignore' });

let ws, mid = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++mid;
  const t = setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error(method + ' 超时')); } }, 40000);
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
  const evalJs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value;

  await send('Page.navigate', { url: 'http://localhost:5173/#/saucenao' });
  await sleep(4000);

  await evalJs(`(async function(){
    window.fetch = ((orig) => function(url, o){ 
      if (String(url).includes('/api/saucenao/search')) return Promise.resolve(new Response(${JSON.stringify(JSON.stringify(DATA))}, {status:200, headers:{'Content-Type':'application/json'}}));
      return orig(url, o);
    })(window.fetch.bind(window));
    const r = await fetch('/tools/test-small.jpg');
    const f = new File([await r.blob()], 'test.jpg', {type:'image/jpeg'});
    const dt = new DataTransfer(); dt.items.add(f);
    const i = document.querySelector('#sauce-file'); i.files = dt.files;
    i.dispatchEvent(new Event('change', {bubbles:true}));
  })()`);
  await sleep(2200);
  const s = await send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile('D:\\fish-temple\\.shots\\saucenao-mobile-input.png', Buffer.from(s.data, 'base64'));
  console.log('[mob] 输入态截图 OK');

  await evalJs(`document.querySelector('#sauce-go').click(); document.querySelector('#sauce-opt-hidden').click(); 'ok'`);
  await sleep(2200);
  const hits = await evalJs(`document.querySelectorAll('.sauce-hit').length`);
  console.log('[mob] hits =', hits);
  // 滚到结果区
  await evalJs(`document.querySelector('#sauce-out-panel').scrollIntoView(); 'ok'`);
  await sleep(800);
  const s2 = await send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile('D:\\fish-temple\\.shots\\saucenao-mobile-results.png', Buffer.from(s2.data, 'base64'));
  console.log('[mob] 结果态截图 OK');

  ws.close(); child.kill(); process.exit(0);
}
main().catch((e) => { console.error('[mob] 失败:', e.message); try { child.kill(); } catch {} process.exit(1); });
setTimeout(() => { try { child.kill(); } catch {} process.exit(1); }, 90000);
