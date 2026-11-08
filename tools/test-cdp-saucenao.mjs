#!/usr/bin/env node
/**
 * tools/test-cdp-saucenao.mjs — 用无头 Edge（直连，绕过 TLS 指纹阻断）在 saucenao 真实搜图
 * 关键：DOM.setFileInputFiles 直接塞文件路径，提交表单，抓结果 DOM。
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const IMG = process["argv"][2] || 'D:\\fish-temple\\tools\\test-small.jpg';
const MODE = process["argv"][3] || 'quic-direct'; // quic-direct | proxy | direct
const NO_PROXY = MODE !== 'proxy';
const FORCE_QUIC = MODE === 'quic-direct';

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));
if (!EDGE) { console.error('未找到 Edge'); process.exit(1); }

const PORT = 9500 + Math.floor(Math.random() * 400);
const profile = path.join(os.tmpdir(), `sauce-cdp-${Date.now()}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--window-size=1400,1000',
  '--lang=en-US',
];
if (NO_PROXY) args.push('--no-proxy-server');
if (FORCE_QUIC) args.push('--origin-to-force-quic-on=saucenao.com:443', '--enable-quic');
console.log(`[cdp] 模式=${MODE} 直连=${NO_PROXY} 强制QUIC=${FORCE_QUIC}`);

const child = spawn(EDGE, args, { stdio: 'ignore' });
const getJSON = async (url) => (await fetch(url)).json();

let ws, mid = 0;
const pending = new Map();
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const id = ++mid;
  pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});

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
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
    }
  });
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __error: r.exceptionDetails.text };
    return r.result.value;
  };

  // 1) 打开 saucenao
  console.log('[cdp] 导航 saucenao.com ...');
  await send('Page.navigate', { url: 'https://saucenao.com/' });
  await sleep(6000);
  const title = await evalJs('document.title');
  const url0 = await evalJs('location.href');
  console.log('    title:', title, ' url:', url0);
  if (!/SauceNAO/i.test(String(title))) { console.error('!! 未加载到 saucenao（可能被墙）'); child.kill(); process.exit(2); }

  // 2) 检查表单结构
  const formInfo = await evalJs(`JSON.stringify({
    forms: [...document.forms].map(f => ({ action: f.action, method: f.method, enctype: f.enctype })),
    fileInputs: [...document.querySelectorAll('input[type=file]')].map(i => ({ name: i.name, id: i.id, accept: i.accept })),
    buttons: [...document.querySelectorAll('input[type=submit],button')].map(b => (b.value||b.textContent||'').trim()).slice(0,8),
  })`);
  console.log('[cdp] 表单结构:', formInfo);

  // 3) 用 DOM.setFileInputFiles 塞图片
  const doc = await send('DOM.getDocument');
  const q = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type=file]' });
  if (!q.nodeId) { console.error('!! 找不到 file input'); child.kill(); process.exit(2); }
  console.log('[cdp] 设置文件:', IMG, 'nodeId=', q.nodeId);
  await send('DOM.setFileInputFiles', { files: [IMG], nodeId: q.nodeId });
  await sleep(1500);

  // 4) 提交表单（saucenao 选中文件后通常需点 Search 或直接 submit）
  console.log('[cdp] 提交搜索 ...');
  await evalJs(`(function(){
    var f = document.querySelector('input[type=file]').form || document.forms[0];
    if (f) f.submit();
  })()`);

  // 5) 等结果页加载（轮询 URL + 结果元素）
  let resultHtml = '';
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const st = await evalJs(`JSON.stringify({ url: location.href, ready: document.readyState, n: document.querySelectorAll('.result, .resulttable, [class*=result]').length })`);
    const o = JSON.parse(st);
    console.log(`    [${i}] ${o.ready} url=${o.url.slice(0,60)} 结果节点=${o.n}`);
    if (o.n > 0 && /search\.php|results/i.test(o.url)) { resultHtml = o.url; break; }
    if (o.n > 2) { resultHtml = o.url; break; }
  }

  // 6) 抓结构化结果
  console.log('[cdp] 提取结果 ...');
  const data = await evalJs(`JSON.stringify((function(){
    var out = [];
    var nodes = document.querySelectorAll('.result');
    nodes.forEach(function(n){
      var img = n.querySelector('img');
      var a = n.querySelector('a[href]');
      var txt = n.innerText || '';
      var sim = (txt.match(/(\\d+\\.?\\d*)\\s*%/) || [])[1] || '';
      out.push({
        thumb: img ? (img.src||img.getAttribute('data-src')||'') : '',
        href: a ? a.href : '',
        sim: sim,
        text: txt.replace(/\\s+/g,' ').trim().slice(0, 200),
      });
    });
    // 关键词命中检查
    var body = document.body.innerText || '';
    return {
      count: nodes.length,
      hasMISSILE: /MISSILE288/i.test(body),
      has429077: body.indexOf('429077')>=0,
      pixivLinks: [...document.querySelectorAll('a[href*="pixiv"]')].map(a=>a.href).slice(0,5),
      twitterLinks: [...document.querySelectorAll('a[href*="twitter"],a[href*="x.com"]')].map(a=>a.href).slice(0,5),
      results: out.slice(0, 10),
      pageUrl: location.href,
      title: document.title,
    };
  })())`);
  console.log('[cdp] === 结果 ===');
  console.log(data);

  const { promises: fs } = await import('node:fs');
  await fs.writeFile('D:\\fish-temple\\tools\\saucenao-cdp-result.json', data);
  // 也存整页 HTML 供分析
  const fullHtml = await evalJs('document.documentElement.outerHTML');
  await fs.writeFile('D:\\fish-temple\\tools\\saucenao-cdp-page.html', String(fullHtml));
  console.log('[cdp] 已保存 saucenao-cdp-result.json + saucenao-cdp-page.html');

  ws.close();
  child.kill();
  process.exit(0);
}

main().catch((e) => { console.error('[cdp] 失败:', e.message); try { child.kill(); } catch {} process.exit(1); });
setTimeout(() => { console.error('[cdp] 超时'); try { child.kill(); } catch {} process.exit(1); }, 120000);
