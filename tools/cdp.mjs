#!/usr/bin/env node
/**
 * tools/cdp.mjs — 开发期自检脚本（不属于站点运行时）
 * ------------------------------------------------------------------
 * 用 Chrome DevTools Protocol 打开站点、收集控制台错误、渲染后导出 DOM 信息与截图。
 * 用法：node tools/cdp.mjs <url> [outDir]
 */

import { spawn } from 'node:child_process';
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const URL_TARGET = process.argv[2] || 'http://localhost:5173/#/';
const OUT = process.argv[3] || '.shots';
const WAIT_MS = Number(process.argv[4] || 3500);

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));

const PORT = 9400 + Math.floor(Math.random() * 500);
const profile = path.join(os.tmpdir(), `dsh-cdp-${Date.now()}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = async (url) => (await fetch(url)).json();

let child;

async function main() {
  if (!EDGE) throw new Error('未找到 Chromium 内核浏览器');

  child = spawn(EDGE, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--window-size=1600,1000',
    URL_TARGET,
  ], { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 60; i++) {
    try {
      const list = await getJSON(`http://127.0.0.1:${PORT}/json/list`);
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (target) break;
    } catch { /* 端口还没起来 */ }
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
  const logs = [];
  const errors = [];

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      logs.push(`[${msg.params.type}] ` + (msg.params.args || [])
        .map((a) => a.value ?? a.description ?? a.type).join(' '));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push(`${d.text} ${d.exception?.description || ''}`.trim().slice(0, 400));
    }
    if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry;
      if (e.level === 'error') errors.push(`[net] ${e.text} ${e.url || ''}`.slice(0, 300));
    }
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    const timer = setTimeout(() => { pending.delete(mid); reject(new Error(`CDP 超时: ${method}`)); }, 15000);
    pending.set(mid, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Page.reload', { ignoreCache: true });
  await sleep(WAIT_MS);

  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result?.value;
  };

  const report = {
    url: URL_TARGET,
    title: await evaluate('document.title'),
    bootDone: await evaluate('!!document.getElementById("boot")?.classList.contains("is-done")'),
    paletteHidden: await evaluate('document.getElementById("cmdk")?.hasAttribute("hidden")'),
    viewChildren: await evaluate('document.getElementById("view")?.children.length'),
    viewBlocks: await evaluate('[...document.querySelectorAll("#view > *")].map(e=>e.className||e.tagName).slice(0,12)'),
    navLinks: await evaluate('[...document.querySelectorAll("#nav a")].map(a=>a.textContent.trim().replace(/\\s+/g," "))'),
    cards: await evaluate('document.querySelectorAll(".card").length'),
    rows: await evaluate('document.querySelectorAll(".row").length'),
    scrollHeight: await evaluate('document.body.scrollHeight'),
    errors,
    logs: logs.slice(-25),
  };

  const m = await send('Page.getLayoutMetrics');
  const fullH = Math.min(7000, Math.ceil(m.cssContentSize.height));
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: fullH, deviceScaleFactor: 1, mobile: false });
  await sleep(700);
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await fs.mkdir(OUT, { recursive: true });
  const name = (URL_TARGET.split('#')[1] || 'root').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'root';
  const file = path.join(OUT, `${name}.png`);
  await fs.writeFile(file, Buffer.from(data, 'base64'));

  console.log(JSON.stringify(report, null, 2));
  console.log(`SCREENSHOT ${file} (h=${fullH})`);
  ws.close();
  child.kill();
}

main()
  .then(() => { setTimeout(() => process.exit(0), 400); })
  .catch((err) => {
    console.error('FAILED', err);
    try { child?.kill(); } catch { /* noop */ }
    setTimeout(() => process.exit(1), 300);
  })
  .finally(() => { fs.rm(profile, { recursive: true, force: true }).catch(() => {}); });
