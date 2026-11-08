#!/usr/bin/env node
/**
 * tools/test-ui-saucenao.mjs — UI 级端到端测试（工业风改版后）
 * 无头 Edge 打开 localhost:5173/#/saucenao：
 *   ① 检查视图结构（viewhead / panel 01 / panel 02 / chips / 主按钮）
 *   ② 检查关键计算样式（直角、tokens 变量生效、无 --c-* 残留）
 *   ③ 注入测试图 → 预览/哈希 → 点搜索 → 等真实结果
 *   ④ 截图：初始态 + 结果态
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SITE = 'http://localhost:5173/#/saucenao';
const SKIP_SEARCH = process["argv"][2] === '--no-search';
const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));
if (!EDGE) { console.error('未找到 Edge'); process.exit(1); }

const PORT = 9450 + Math.floor(Math.random() * 400);
const profile = path.join(os.tmpdir(), `ui-test-${Date.now()}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--window-size=1440,1400',
], { stdio: 'ignore' });

const getJSON = async (url) => (await fetch(url)).json();
let ws, mid = 0;
const pending = new Map();
const events = [];
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++mid;
  const timer = setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`${method} 超时`)); } }, 150000);
  pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
  ws.send(JSON.stringify({ id, method, params }));
});

async function shot(name) {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  const p = `D:\\fish-temple\\.shots\\${name}.png`;
  await fs.writeFile(p, Buffer.from(s.data, 'base64'));
  console.log(`[ui] 截图 → .shots/${name}.png`);
}

async function main() {
  let target = null;
  for (let i = 0; i < 40; i++) {
    try {
      const list = await getJSON(`http://127.0.0.1:${PORT}/json/list`);
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (target) break;
    } catch {}
    await sleep(250);
  }
  if (!target) throw new Error('CDP 未就绪');

  ws = new WebSocket(target.webSocketDebuggerUrl);
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) events.push(msg);
  });
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));

  await send('Page.enable');
  await send('Runtime.enable');
  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __err: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
    return r.result.value;
  };

  console.log('[ui] 打开', SITE);
  await send('Page.navigate', { url: SITE });
  await sleep(4500);

  // ① 结构检查
  const struct = await evalJs(`JSON.stringify({
    viewhead: !!document.querySelector('.sauce .viewhead'),
    title: document.querySelector('.viewhead__title')?.textContent || '',
    idx: document.querySelector('.viewhead__idx')?.textContent || '',
    metaCount: document.querySelectorAll('.viewhead__meta > div').length,
    panel01: !!document.querySelector('.sauce-input'),
    panel02: !!document.querySelector('.sauce-out'),
    drop: !!document.querySelector('#sauce-drop.tool-drop'),
    chips: document.querySelectorAll('.sauce-opts .chip').length,
    chipOn: document.querySelectorAll('.sauce-opts .chip.is-on').length,
    goBtn: !!document.querySelector('#sauce-go.btn--signal'),
    goDisabled: document.querySelector('#sauce-go')?.disabled,
    extBtns: document.querySelectorAll('#sauce-ext .btn').length,
    idleVisible: !document.querySelector('#sauce-idle')?.hidden,
    engineStatus: document.querySelector('#sauceStatus')?.textContent || '',
    noticeHidden: document.querySelector('#sauce-notice')?.hidden,
  })`);
  console.log('[ui] 结构:', struct);

  // ② 计算样式抽查（工业风落地情况）
  const styles = await evalJs(`JSON.stringify((function(){
    const cs = (sel, prop) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : '(缺失)'; };
    return {
      panelRadius: cs('.sauce-input', 'borderRadius'),          // 应为 0px
      hitRadius: cs('.tool-drop', 'borderRadius'),               // 应为 0px
      panelBg: cs('.sauce-input', 'backgroundColor'),            // 应为 --bg-alt（非透明/白）
      panelBorder: cs('.sauce-input', 'borderTopColor'),
      goBtnFont: cs('#sauce-go', 'fontFamily').slice(0, 30),     // 应为 Saira（--font-wide）
      emptyBorder: cs('.sauce .empty', 'borderTopStyle'),
      bodyBg: cs('body', 'backgroundColor'),
    };
  })())`);
  console.log('[ui] 样式:', styles);

  // 旧 --c-* 变量残留检查（CSS 文件层面）
  const hasLegacy = await evalJs(`
    fetch('/styles/saucenao.css').then(r=>r.text()).then(t=>/var\\(--c-/.test(t) ? 'LEGACY!' : 'clean')
  `);
  console.log('[ui] CSS 变量检查:', hasLegacy);

  await shot('saucenao-idle');

  if (SKIP_SEARCH) { ws.close(); child.kill(); process.exit(0); }

  // ③ 注入图片
  const injected = await evalJs(`(async function(){
    try {
      const r = await fetch('/tools/test-small.jpg');
      if (!r.ok) return 'fetch HTTP ' + r.status;
      const file = new File([await r.blob()], 'missile228-test.jpg', { type: 'image/jpeg' });
      const dt = new DataTransfer(); dt.items.add(file);
      const input = document.querySelector('#sauce-file');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return 'ok ' + file.size;
    } catch (e) { return 'ERR ' + e.message; }
  })()`);
  console.log('[ui] 注入:', injected);
  await sleep(3000);

  const pvState = await evalJs(`JSON.stringify({
    pvVisible: !document.querySelector('#sauce-pv')?.hidden,
    name: document.querySelector('#sauce-pv-name')?.textContent || '',
    size: document.querySelector('#sauce-pv-size')?.textContent || '',
    ahash: document.querySelector('#sauce-pv-ahash')?.textContent || '',
    goEnabled: !document.querySelector('#sauce-go')?.disabled,
  })`);
  console.log('[ui] 预览:', pvState);
  await shot('saucenao-loaded');

  // ④ 点搜索
  console.log('[ui] 点击 SEARCH…');
  await evalJs(`document.querySelector('#sauce-go').click(); 'ok'`);

  let done = null;
  for (let i = 0; i < 80; i++) {
    await sleep(2000);
    const st = await evalJs(`JSON.stringify({
      status: !document.querySelector('#sauce-status')?.hidden,
      statusText: document.querySelector('#sauce-status-text')?.textContent || '',
      hits: document.querySelectorAll('.sauce-hit').length,
      err: !document.querySelector('#sauce-error')?.hidden ? document.querySelector('#sauce-error-text')?.textContent : '',
      metaStatus: document.querySelector('#sauceStatus')?.textContent || '',
    })`);
    try {
      const o = JSON.parse(st);
      if (i % 5 === 0) console.log(`[ui] [${i}] hits=${o.hits} status=${o.status} ${o.statusText.slice(0, 40)} ${o.err ? 'ERR:' + o.err.slice(0, 60) : ''}`);
      if (o.hits > 0 || o.err) { done = o; break; }
    } catch {}
  }
  console.log('[ui] 搜索结束:', JSON.stringify(done));

  if (done && done.hits > 0) {
    const detail = await evalJs(`JSON.stringify((function(){
      const hits = [...document.querySelectorAll('.sauce-hit')];
      const top = hits[0];
      const img = top.querySelector('.sauce-hit__thumb img');
      const cs = getComputedStyle(top.querySelector('.sauce-hit__sim'));
      return {
        total: hits.length,
        cmpVisible: !document.querySelector('#sauce-cmp')?.hidden,
        cmpCount: document.querySelector('#sauce-cmp-count')?.textContent || '',
        limit: document.querySelector('#sauce-limit')?.textContent || '',
        metaStatus: document.querySelector('#sauceStatus')?.textContent || '',
        matches: document.querySelector('#sauceMatches')?.textContent || '',
        top1: {
          sim: top.querySelector('.sauce-hit__sim b')?.textContent || '',
          simBg: cs.backgroundColor,
          tag: top.querySelector('.tag')?.textContent.trim() || '',
          tagInk: top.querySelector('.tag')?.className || '',
          title: top.querySelector('.sauce-hit__title')?.textContent.trim() || '',
          meta: [...top.querySelectorAll('.sauce-hit__meta span')].map(x => x.textContent.trim()),
          primary: top.querySelector('.sauce-hit__links .btn--signal')?.textContent.trim() || '',
          primaryHref: top.querySelector('.sauce-hit__links .btn--signal')?.href || '',
          linkCount: top.querySelectorAll('.sauce-hit__links .btn').length,
          thumbLoaded: img ? (img.complete && img.naturalWidth > 0) : false,
          thumbIsData: img ? img.src.startsWith('data:') : false,
          thumbRadius: img ? getComputedStyle(img).borderRadius : '',
        },
      };
    })())`);
    console.log('[ui] === 结果详情 ===');
    console.log(detail);
    await fs.writeFile('D:\\fish-temple\\tools\\ui-test-result.json', detail);
    await sleep(1500); // 等缩略图/动画稳定
    await shot('saucenao-results');
  }

  // ⑤ console 错误
  const errs = events.filter((e) => e.method === 'Runtime.consoleAPICalled' && e.params?.type === 'error')
    .map((e) => (e.params.args || []).map((a) => a.value || a.description || '').join(' ').slice(0, 140));
  if (errs.length) { console.log('[ui] console 错误:'); errs.slice(0, 8).forEach((e) => console.log('   ', e)); }
  else console.log('[ui] 无 console 错误 ✓');

  ws.close();
  child.kill();
  process.exit(done && done.hits > 0 ? 0 : 1);
}

main().catch((e) => { console.error('[ui] 失败:', e.message); try { child.kill(); } catch {} process.exit(1); });
setTimeout(() => { console.error('[ui] 总超时'); try { child.kill(); } catch {} process.exit(1); }, 300000);
