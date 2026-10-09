#!/usr/bin/env node
/**
 * tools/shot.mjs — 指定主题/路由截图（开发期用）
 * 用法：node tools/shot.mjs <url> <theme> <outFile>
 */

import { spawn } from 'node:child_process';
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const URL_TARGET = process.argv[2] || 'http://localhost:5173/#/';
const THEME = process.argv[3] || 'night';
const OUT = process.argv[4] || `.shots/theme-${THEME}.png`;
const WAIT = Number(process.argv[5] || 3600);
/** 可选：截图前在页面里执行的脚本文件（用于预置 localStorage 数据） */
const SEED_FILE = process.argv[6] || '';
/** 可选：窗口尺寸（默认 1500,1000）—— 想验窄屏时用 DSH_SHOT_WINDOW=520,900 */
const WINDOW_SIZE = process.env.DSH_SHOT_WINDOW || '1500,1000';

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));

const PORT = 9500 + Math.floor(Math.random() * 90);
const profile = path.join(os.tmpdir(), `dsh-shot-${Date.now()}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let child;

async function main() {
  child = spawn(EDGE, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--headless=new', '--disable-gpu', '--no-first-run', `--window-size=${WINDOW_SIZE}`, URL_TARGET,
  ], { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (target) break;
    } catch { /* wait */ }
    await sleep(250);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', () => rej(new Error('ws')), { once: true });
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
    // 页面内的脚本可能等很久（例如 Pixiv 镜像首次回源要几十秒），给 Runtime.evaluate 放宽
    const limit = method === 'Runtime.evaluate' ? 120000 : 20000;
    const timer = setTimeout(() => { pending.delete(mid); reject(new Error('timeout ' + method)); }, limit);
    pending.set(mid, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: URL_TARGET });
  await sleep(WAIT);

  const evalx = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value;

  // 通过设置模块切换主题并持久化
  await evalx(`(async () => {
    const { Theme } = await import('/src/core/theme.js');
    Theme.set(${JSON.stringify(THEME)});
    return document.documentElement.dataset.theme;
  })()`);
  await sleep(1200);

  // 可选：执行注入脚本（例如预置播放列表），再等页面稳定
  if (SEED_FILE) {
    const seed = await fs.readFile(SEED_FILE, 'utf8');
    const r = await send('Runtime.evaluate', { expression: seed, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) console.error('SEED ERROR', r.exceptionDetails.text);
    else console.log('SEED RESULT', JSON.stringify(r.result?.value));
    await sleep(1500);
  }

  const m = await send('Page.getLayoutMetrics');
  const h = Math.min(7000, Math.ceil(m.cssContentSize.height));
  const vh = await evalx('window.innerHeight');
  // 只截首屏，避免超高图看不清细节
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, Buffer.from(data, 'base64'));
  console.log(`theme=${await evalx('document.documentElement.dataset.theme')}  pageHeight=${h}  viewport=${vh}`);
  console.log(`SCREENSHOT ${OUT}`);

  try { await send('Browser.close'); } catch { /* noop */ }
  try { child.kill('SIGKILL'); } catch { /* noop */ }
  process.exit(0);
}

main().catch((e) => { console.error('FAILED', e); try { child?.kill('SIGKILL'); } catch { /* noop */ } process.exit(1); });
