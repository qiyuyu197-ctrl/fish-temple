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
  // 小屏上"到底哪一档开始换行 / 溢出"是看不出来的。
  // 桌面这侧在 1240–1920 之间加密采样：站主报的顶栏重叠就出现在这个区间的某个等效宽度上
  // （浏览器缩放到 125%/150% 时，1880px 的窗口等效于 1250–1500 CSS px），
  // 只采样 1100/1280/1440 会漏掉中间那些"刚好挤住"的档位。
  const widths = [1920, 1680, 1600, 1536, 1500, 1440, 1400, 1336, 1300, 1240, 1100, 900, 768, 560, 480, 430, 400, 390, 360];
  await fs.mkdir(OUT, { recursive: true });
  const rows = [];

  for (const w of widths) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 1000, deviceScaleFactor: 1, mobile: w < 860 });
    // 触屏才会命中的媒体特性（(pointer: coarse) / (hover: none)）：
    // 用触摸模拟让窄档真正跑在"手指"那套规则上，否则量到的还是鼠标版式
    await send('Emulation.setTouchEmulationEnabled', { enabled: w < 860, maxTouchPoints: 5 });
    await sleep(700);
    // #authBox 平时是空的（本地没配 Auth0），于是右侧永远比线上窄 ——
    // 站主报的重叠恰恰只在**已登录**（头像 + 名字 + 时钟都占位）时才有压力。
    // 这里注入一个等价的登录态控件，让宽度检查贴近真实使用。
    if (w >= 1080) {
      await evaluate(`(() => {
        const box = document.getElementById('authBox');
        if (!box) return;
        box.hidden = false;
        box.innerHTML = '<button class="authbox__btn is-user" id="authToggle" type="button">'
          + '<span class="authbox__initial" aria-hidden="true">Q</span>'
          + '<span class="authbox__label clamp-1">qiyuyu197-ctrl</span></button>';
      })()`);
      await sleep(120);
    }
    const info = await evaluate(`(() => {
      const nav = document.getElementById('nav');
      const topbar = document.getElementById('topbar');
      const brand = document.querySelector('.brand');
      const links = [...nav.querySelectorAll('a')];
      const right = document.querySelector('.topbar__right').getBoundingClientRect();
      const de = document.documentElement;
      const hit = (a, b) => a.width > 0 && b.width > 0
        && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
      // 顶栏够不够"实"：sticky 顶栏压在内容之上，底色太透就会把背后的正文透出来，
      // 看起来像"字叠在 logo 上"（88% 时线上真出现过）。支持 backdrop-filter 时要求 ≥0.95，
      // 不支持时必须是完全不透明（样式里有 @supports 兜底）。
      const bg = getComputedStyle(topbar).backgroundColor;
      const alphaOf = (s) => {
        const m = s.match(/rgba?\\([^)]*?,\\s*([\\d.]+)\\s*\\)/) || s.match(/\\/\\s*([\\d.]+)\\s*\\)/);
        if (m) return Number(m[1]);
        return 1;                                  // 命名色 / 十六进制 / rgb() 都是不透明
      };
      const backdrop = CSS.supports('backdrop-filter', 'blur(4px)') || CSS.supports('-webkit-backdrop-filter', 'blur(4px)');
      const alpha = alphaOf(bg);
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
        // 导航压到 logo 上（站主报的那个现象）：两侧盒子真的相交才算
        brandOverlap: links.length && getComputedStyle(nav).display !== 'none'
          ? hit(brand.getBoundingClientRect(), links[0].getBoundingClientRect()) : false,
        navLeftOver: getComputedStyle(nav).display !== 'none'
          && nav.getBoundingClientRect().left < brand.getBoundingClientRect().right - 1,
        gap: Math.round(nav.getBoundingClientRect().left - brand.getBoundingClientRect().right),
        alpha,
        ghostRisk: backdrop ? alpha < 0.95 : alpha < 1,
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

  const badRow = (r) => r.hScroll || r.navOverlap || r.brandOverlap || r.navLeftOver || r.ghostRisk || r.overflow.length;
  console.log('宽度   导航  序号  裁剪  重叠  压logo  左越界  透字  余量  横向滚动  文档宽  溢出元素');
  for (const r of rows) {
    const flag = badRow(r) ? '\x1b[31m' : '\x1b[32m';
    console.log(
      `${flag}${String(r.w).padEnd(6)}\x1b[0m ${r.navVisible ? '显示' : '抽屉'}  ${r.indexShown ? '是' : '否'}    ${r.navClipped ? '是' : '否'}    ${r.navOverlap ? '是' : '否'}    ${r.brandOverlap ? '是' : '否'}     ${r.navLeftOver ? '是' : '否'}     ${r.ghostRisk ? '是' : '否'}   ${(r.navVisible ? String(r.gap).padStart(4) : '  — ')}  ${r.hScroll ? '是' : '否'}       ${String(r.docWidth).padEnd(6)}  ${r.overflow.join(', ') || '—'}`
    );
  }
  const bad = rows.filter(badRow);
  if (bad.length) {
    console.log(`\n\x1b[31m有问题的宽度：${bad.map((r) => r.w).join(', ')}\x1b[0m`);
    console.log('  压logo = 导航第一项与 .brand 相交；左越界 = .nav 左边界越过 .brand 右边界；');
    console.log('  透字 = sticky 顶栏底色不够实（支持 backdrop-filter 要求 ≥0.95，不支持要求完全不透明）');
  }
  console.log(`\n截图目录：${OUT}`);

  try { await send('Browser.close'); } catch { /* noop */ }
  try { child.kill('SIGKILL'); } catch { /* noop */ }
  process.exit(bad.length ? 1 : 0);
}

main().catch((e) => { console.error('FAILED', e); try { child?.kill('SIGKILL'); } catch { /* noop */ } process.exit(1); });
