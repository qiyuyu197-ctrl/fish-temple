#!/usr/bin/env node
/**
 * tools/pwa-shots.mjs — 生成 manifest 里 screenshots 用的两张图
 * ------------------------------------------------------------------
 * PWA 安装面板（Android Chrome）会展示 manifest 里的 screenshots；
 * 尺寸必须和 manifest 写的一致，否则会被忽略。这里用 CDP 按精确视口截。
 *
 * 用法：node tools/pwa-shots.mjs [baseUrl]
 * 产出：assets/pwa/screenshot-mobile.png (390x844)
 *       assets/pwa/screenshot-desktop.png (1280x800)
 */
import { spawn } from 'node:child_process';
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE = (process.argv[2] || 'http://127.0.0.1:5188').replace(/\/$/, '');
const OUT = path.resolve('assets', 'pwa');

const BROWSER = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));
if (!BROWSER) throw new Error('没有找到 Chromium 内核浏览器');

const PORT = 9700 + Math.floor(Math.random() * 200);
const profile = path.join(os.tmpdir(), `dsh-pwa-${Date.now()}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(BROWSER, [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars',
  'about:blank',
], { stdio: 'ignore' });

let target = null;
for (let i = 0; i < 80; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    if (target) break;
  } catch { /* 等端口 */ }
  await sleep(250);
}
if (!target) { child.kill(); throw new Error('调试端口未就绪'); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', () => rej(new Error('ws 连接失败')), { once: true });
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

const shoot = async (name, width, height, mobile) => {
  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile,
    screenWidth: width, screenHeight: height,
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
  await send('Page.navigate', { url: `${BASE}/#/` });
  await sleep(4200);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = path.join(OUT, name);
  await fs.writeFile(file, Buffer.from(shot.data, 'base64'));
  console.log(`${path.relative(process.cwd(), file)}  ${width}x${height}`);
};

try {
  await send('Page.enable');
  await fs.mkdir(OUT, { recursive: true });
  await shoot('screenshot-mobile.png', 390, 844, true);
  await shoot('screenshot-desktop.png', 1280, 800, false);
} finally {
  ws.close();
  child.kill();
}
