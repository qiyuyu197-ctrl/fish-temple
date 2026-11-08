#!/usr/bin/env node
/**
 * tools/test-ui-trace.mjs — UI 验证：引擎切换 + trace.moe 真实搜索 + MORE 面板
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
const PORT = 9490 + Math.floor(Math.random() * 350);
const profile = path.join(os.tmpdir(), `ui-trace-${Date.now()}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const child = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--headless=new', '--disable-gpu', '--no-first-run', '--window-size=1440,1500'], { stdio: 'ignore' });

let ws, mid = 0;
const pending = new Map();
const events = [];
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++mid;
  const t = setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error(method + ' 超时')); } }, 90000);
  pending.set(id, { resolve: (v) => { clearTimeout(t); res(v); }, reject: (e) => { clearTimeout(t); rej(e); } });
  ws.send(JSON.stringify({ id, method, params }));
});
async function shot(name) {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(`D:\\fish-temple\\.shots\\${name}.png`, Buffer.from(s.data, 'base64'));
  console.log(`[trace-ui] 截图 → .shots/${name}.png`);
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
    else if (m.method) events.push(m);
  });
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  await send('Page.enable'); await send('Runtime.enable');
  const evalJs = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __err: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
    return r.result.value;
  };

  await send('Page.navigate', { url: 'http://localhost:5173/#/saucenao' });
  await sleep(4500);

  // 1) 结构：引擎 chips + MORE 面板
  const struct = await evalJs(`JSON.stringify({
    engineChips: [...document.querySelectorAll('.sauce-opts--engine .chip')].map(c => c.textContent.trim() + (c.classList.contains('is-on') ? ' [ON]' : '')),
    hintText: (document.querySelector('#sauce-eng-hint')?.textContent || '').slice(0, 50),
    filterVisible: !document.querySelector('#sauce-filter-row')?.hidden,
    morePanel: !!document.querySelector('.sauce-more'),
    moreTitle: document.querySelector('.sauce-more .panel__title')?.textContent || '',
    moreItems: [...document.querySelectorAll('.sauce-more__item')].map(a => a.querySelector('b')?.textContent + '(' + (a.querySelector('.tag')?.textContent || '') + ')'),
    moreIsLast: (() => { const panels = [...document.querySelectorAll('.sauce > .panel')]; return panels[panels.length - 1]?.classList.contains('sauce-more'); })(),
    extGone: !document.querySelector('.sauce-ext'),
  })`);
  console.log('[trace-ui] 结构:', struct);

  // 2) 切换到 trace 引擎
  await evalJs(`document.querySelector('.chip[data-engine="trace"]').click(); 'ok'`);
  await sleep(400);
  const switched = await evalJs(`JSON.stringify({
    traceOn: document.querySelector('.chip[data-engine="trace"]').classList.contains('is-on'),
    sauceOff: !document.querySelector('.chip[data-engine="saucenao"]').classList.contains('is-on'),
    filterHidden: document.querySelector('#sauce-filter-row').hidden,
    hint: (document.querySelector('#sauce-eng-hint')?.textContent || '').slice(0, 40),
    goText: document.querySelector('#sauce-go-text')?.textContent,
  })`);
  console.log('[trace-ui] 引擎切换:', switched);

  // 3) 注入图片 + 真实 trace 搜索（国内直连）
  await evalJs(`(async function(){
    const r = await fetch('/tools/test-small.jpg');
    const f = new File([await r.blob()], 'test.jpg', { type: 'image/jpeg' });
    const dt = new DataTransfer(); dt.items.add(f);
    const i = document.querySelector('#sauce-file'); i.files = dt.files;
    i.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  })()`);
  await sleep(2500);
  console.log('[trace-ui] 点击搜索（真实 trace.moe API）…');
  await evalJs(`document.querySelector('#sauce-go').click(); 'ok'`);

  let done = null;
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const st = await evalJs(`JSON.stringify({
      hits: document.querySelectorAll('.sauce-hit').length,
      err: !document.querySelector('#sauce-error')?.hidden ? document.querySelector('#sauce-error-text')?.textContent.slice(0, 80) : '',
      limit: document.querySelector('#sauce-limit')?.textContent || '',
    })`);
    const o = JSON.parse(st);
    if (o.hits > 0 || o.err) { done = o; break; }
  }
  console.log('[trace-ui] 搜索结束:', JSON.stringify(done));

  if (done && done.hits > 0) {
    const detail = await evalJs(`JSON.stringify((function(){
      const top = document.querySelector('.sauce-hit');
      const img = top.querySelector('.sauce-hit__thumb img');
      return {
        hits: document.querySelectorAll('.sauce-hit').length,
        metaStatus: document.querySelector('#sauceStatus')?.textContent,
        metaMatches: document.querySelector('#sauceMatches')?.textContent,
        limit: document.querySelector('#sauce-limit')?.textContent,
        cmpCount: document.querySelector('#sauce-cmp-count')?.textContent,
        top1: {
          tag: top.querySelector('.tag')?.textContent.trim(),
          title: top.querySelector('.sauce-hit__title')?.textContent.trim(),
          sim: top.querySelector('.sauce-hit__sim')?.textContent.trim(),
          simBg: getComputedStyle(top.querySelector('.sauce-hit__sim')).backgroundColor,
          meta: [...top.querySelectorAll('.sauce-hit__meta span')].map(x => x.textContent.trim()),
          videoBtn: top.querySelector('.sauce-hit__links .btn--signal')?.textContent.trim(),
          videoHref: (top.querySelector('.sauce-hit__links .btn--signal')?.href || '').slice(0, 50),
          anilistBtn: [...top.querySelectorAll('.sauce-hit__links .btn')].map(b => b.textContent.trim()),
          thumbLoaded: img ? (img.complete && img.naturalWidth > 0) : false,
        },
      };
    })())`);
    console.log('[trace-ui] === 结果详情 ===');
    console.log(detail);
    await sleep(1500);
    await shot('saucenao-trace-results');
  }

  // 4) 切回 saucenao：FILTER 行恢复
  await evalJs(`document.querySelector('.chip[data-engine="saucenao"]').click(); 'ok'`);
  await sleep(400);
  const back = await evalJs(`JSON.stringify({
    filterVisible: !document.querySelector('#sauce-filter-row')?.hidden,
    goText: document.querySelector('#sauce-go-text')?.textContent,
  })`);
  console.log('[trace-ui] 切回 saucenao:', back);

  // 5) MORE 面板截图（滚动到底）
  await evalJs(`document.querySelector('.sauce-more').scrollIntoView(); 'ok'`);
  await sleep(900);
  await shot('saucenao-more-panel');

  const errs = events.filter((e) => e.method === 'Runtime.consoleAPICalled' && e.params?.type === 'error')
    .map((e) => (e.params.args || []).map((a) => a.value || a.description || '').join(' ').slice(0, 130));
  if (errs.length) { console.log('[trace-ui] console 错误:'); errs.slice(0, 6).forEach((e) => console.log('   ', e)); }
  else console.log('[trace-ui] 无 console 错误 ✓');

  ws.close(); child.kill();
  process.exit(done && done.hits > 0 ? 0 : 1);
}
main().catch((e) => { console.error('[trace-ui] 失败:', e.message); try { child.kill(); } catch {} process.exit(1); });
setTimeout(() => { try { child.kill(); } catch {} process.exit(1); }, 180000);
