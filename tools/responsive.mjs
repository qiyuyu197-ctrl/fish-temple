#!/usr/bin/env node
/**
 * tools/responsive.mjs — 多断点布局自检 + 截图
 * 用法：node tools/responsive.mjs [baseUrl] [hash]
 */

import { spawn } from 'node:child_process';
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE = process.argv[2] || 'http://localhost:5173';
const HASH = process.argv[3] || '#/';
const OUT = '.shots/responsive';

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));

const PORT = 9600 + Math.floor(Math.random() * 90);
const profile = path.join(os.tmpdir(), `dsh-resp-${Date.now()}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let child;

async function main() {
  child = spawn(EDGE, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--headless=new', '--disable-gpu', '--no-first-run',
    `${BASE}/${HASH}`,
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
    const timer = setTimeout(() => { pending.delete(mid); reject(new Error('timeout ' + method)); }, 20000);
    pending.set(mid, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: `${BASE}/${HASH}` });
  await sleep(4000);

  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result?.value;
  };

  // 手机竖屏的常见宽度（360 / 390 / 430）也纳进来：只有 400 一档时，
  // 小屏上"到底哪一档开始换行 / 溢出"是看不出来的
  const widths = [1920, 1600, 1440, 1280, 1100, 900, 768, 560, 480, 430, 400, 390, 360];
  await fs.mkdir(OUT, { recursive: true });
  const rows = [];

  for (const w of widths) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 1000, deviceScaleFactor: 1, mobile: w < 860 });
    // 触屏才会命中的媒体特性（(pointer: coarse) / (hover: none)）：
    // 用触摸模拟让窄档真正跑在"手指"那套规则上，否则量到的还是鼠标版式
    await send('Emulation.setTouchEmulationEnabled', { enabled: w < 860, maxTouchPoints: 5 });
    await sleep(700);
    const info = await evaluate(`(() => {
      const nav = document.getElementById('nav');
      const links = [...nav.querySelectorAll('a')];
      const right = document.querySelector('.topbar__right').getBoundingClientRect();
      const de = document.documentElement;
      // 找出所有横向溢出视口的元素（忽略被父级裁剪的装饰层与滚动容器内的内容）
      // 注意：代码块 .prose pre 是 overflow-x:auto —— 里面的 <code> 比容器宽是**设计如此**，
      // 由父级滚动承接，不算版面溢出（否则任何一行长代码都会误报）
      const inScroller = (el) => {
        for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
          const ox = getComputedStyle(p).overflowX;
          if (ox === 'auto' || ox === 'scroll') return true;
        }
        return false;
      };
      const overflow = [...document.querySelectorAll('#view *')]
        .filter(el => {
          if (el.closest('.hero__bg')) return false;               // 首屏装饰背景（由父级 overflow:hidden 裁剪）
          const cs = getComputedStyle(el);
          if (cs.position === 'absolute' && el.closest('.hero, .stage, .album, .card__thumb, .masonry__item')) return false;
          if (inScroller(el)) return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.right > window.innerWidth + 2 || r.left < -2);
        })
        .slice(0, 5)
        .map(el => (el.className || el.tagName).toString().slice(0, 40));
      return {
        navVisible: getComputedStyle(nav).display !== 'none',
        indexShown: getComputedStyle(document.querySelector('.nav__idx') || document.createElement('i')).display !== 'none',
        navClipped: nav.scrollWidth > nav.clientWidth + 1,
        navOverlap: links.length ? links.at(-1).getBoundingClientRect().right > right.left + 1 : false,
        hScroll: de.scrollWidth > de.clientWidth + 1,
        docWidth: de.scrollWidth,
        overflow,
        heroFontPx: getComputedStyle(document.querySelector('.hero__title') || document.body).fontSize,
      };
    })()`);
    rows.push({ w, ...info });
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(OUT, `w${w}.png`), Buffer.from(data, 'base64'));
  }

  console.log('宽度   导航  序号  裁剪  重叠  横向滚动  文档宽  溢出元素');
  for (const r of rows) {
    const flag = (r.hScroll || r.navOverlap || r.overflow.length) ? '\x1b[31m' : '\x1b[32m';
    console.log(
      `${flag}${String(r.w).padEnd(6)}\x1b[0m ${r.navVisible ? '显示' : '抽屉'}  ${r.indexShown ? '是' : '否'}    ${r.navClipped ? '是' : '否'}    ${r.navOverlap ? '是' : '否'}    ${r.hScroll ? '是' : '否'}       ${String(r.docWidth).padEnd(6)}  ${r.overflow.join(', ') || '—'}`
    );
  }
  console.log(`\n截图目录：${OUT}`);

  try { await send('Browser.close'); } catch { /* noop */ }
  try { child.kill('SIGKILL'); } catch { /* noop */ }
  process.exit(rows.some((r) => r.hScroll || r.navOverlap || r.overflow.length) ? 1 : 0);
}

main().catch((e) => { console.error('FAILED', e); try { child?.kill('SIGKILL'); } catch { /* noop */ } process.exit(1); });
