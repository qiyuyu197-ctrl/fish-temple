#!/usr/bin/env node
/**
 * tools/eval.mjs — 在页面上下文里执行一段表达式并打印结果
 * 用法：node tools/eval.mjs <url> <expression|@file.js> [waitMs]
 *
 * 表达式里带引号时，直接写在命令行上容易被 shell 吃掉引号，
 * 所以支持 @文件：把脚本写进文件再传路径，例如
 *   node tools/eval.mjs "http://localhost:5173/#/gallery" @.shots/check.js
 */

import { spawn } from 'node:child_process';
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const URL_TARGET = process.argv[2];
let EXPR = process.argv[3] || 'document.title';
const WAIT = Number(process.argv[4] || 3000);

// @文件 / 存在的 .js 路径 → 从磁盘读表达式
const asFile = EXPR.startsWith('@') ? EXPR.slice(1) : EXPR;
if (asFile.endsWith('.js') && existsSync(asFile)) {
  EXPR = await fs.readFile(asFile, 'utf8');
  console.log(`[eval] 表达式来自文件 ${asFile}（${EXPR.length} 字符）`);
}

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));

const PORT = 9900 + Math.floor(Math.random() * 90);
const profile = path.join(os.tmpdir(), `dsh-eval-${Date.now()}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let child;
async function main() {
  child = spawn(EDGE, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--headless=new', '--disable-gpu', '--no-first-run', '--window-size=1500,950',
    '--autoplay-policy=no-user-gesture-required',
    URL_TARGET,
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
  if (!target) throw new Error('调试端口未就绪');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', () => rej(new Error('ws fail')), { once: true });
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

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.reload', { ignoreCache: true });
  await sleep(WAIT);

  const r = await send('Runtime.evaluate', { expression: EXPR, returnByValue: true, awaitPromise: true });
  console.log(JSON.stringify(r.result?.value ?? r.result, null, 2));
  try { await send('Browser.close'); } catch { /* noop */ }
  ws.close();
  try { child.kill('SIGKILL'); } catch { /* noop */ }
  process.exit(0);
}

main().catch((e) => {
  console.error('FAILED', e);
  try { child?.kill('SIGKILL'); } catch { /* noop */ }
  process.exit(1);
});
