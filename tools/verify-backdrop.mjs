#!/usr/bin/env node
/**
 * tools/verify-backdrop.mjs — 首页横幅 / 沉浸舞台的横竖图选择
 * ==================================================================
 * 站主报过：手机端（尤其是 App 里）的背景插画还是横图。这里用真浏览器把
 * 手机竖屏 / 手机横屏 / 转屏 / 桌面四种情况各走一遍，断言：
 *
 *   · 首页 hero 容器高 > 宽时选竖图（手机），宽 > 高时选横图（桌面）；
 *   · 沉浸舞台的手机背景同样优先竖图；
 *   · 转屏后自动换一张方向匹配的（不是一直停在第一次抽到的那张）；
 *   · 固定背景后不再被转屏换掉（固定是用户的明确选择）。
 *
 * 只读本地 data/album.json，不依赖任何外网接口，跑一遍约 15 秒。
 *
 * 用法：
 *   node tools/verify-backdrop.mjs [baseUrl]
 *   node tools/verify-backdrop.mjs http://127.0.0.1:5173
 *
 * 退出码：0 = 全部通过，1 = 有失败项。
 */

import { spawn } from 'node:child_process';
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.argv[2] || 'http://127.0.0.1:5173').replace(/\/+$/, '');
const OUT = path.join(ROOT, '.shots');

const BROWSER = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));

const PORT = 9300 + Math.floor(Math.random() * 200);
const profile = path.join(os.tmpdir(), `ft-backdrop-${Date.now()}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let child;
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? '\x1b[32m PASS\x1b[0m' : '\x1b[31m FAIL\x1b[0m'} ${name}${detail ? `  \x1b[90m${detail}\x1b[0m` : ''}`);
  return !!ok;
};

async function main() {
  if (!BROWSER) throw new Error('没有找到 Edge / Chrome');

  child = spawn(BROWSER, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    'about:blank',
  ], { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
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
  const consoleErrors = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(String(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || '').slice(0, 300));
    }
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    const timer = setTimeout(() => { pending.delete(mid); reject(new Error(`CDP 超时: ${method}`)); }, 20000);
    pending.set(mid, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.text || 'evaluate failed'));
    return r.result?.value;
  };

  await send('Runtime.enable');
  await send('Page.enable');

  const isPortrait = (w, h) => h > w;

  const viewport = async (width, height, mobile = true) => {
    const portrait = isPortrait(width, height);
    await send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 2, mobile,
      screenOrientation: { angle: portrait ? 0 : 90, type: portrait ? 'portraitPrimary' : 'landscapePrimary' },
    });
    await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
    await sleep(500);
  };

  const heroInfo = () => evaluate(`(() => {
    const img = document.getElementById('heroMediaImg');
    const hero = document.getElementById('hero');
    const r = hero?.getBoundingClientRect();
    return {
      box: r ? [Math.round(r.width), Math.round(r.height)] : [0, 0],
      w: img?.naturalWidth || 0,
      h: img?.naturalHeight || 0,
      src: (img?.currentSrc || '').replace(location.origin + '/', ''),
    };
  })()`);

  const stageInfo = () => evaluate(`(() => {
    const img = document.getElementById('lsArchive');
    return {
      w: img?.naturalWidth || 0,
      h: img?.naturalHeight || 0,
      src: (img?.getAttribute('src') || '').replace(location.origin + '/', ''),
      hidden: img?.hidden,
    };
  })()`);

  // 手机竖屏 → 首页竖图
  await viewport(390, 844);
  await send('Page.navigate', { url: `${BASE}/#/` });
  await sleep(3200);
  const mobile = await heroInfo();
  check('手机竖屏：首页横幅用竖图', mobile.h > mobile.w, `${mobile.w}×${mobile.h} · ${mobile.src}`);
  check('手机竖屏：hero 本身是一块高高的区域', mobile.box[1] > mobile.box[0], `hero=${mobile.box.join('×')}`);
  await fs.mkdir(OUT, { recursive: true });
  {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(OUT, 'verify-backdrop-mobile-home.png'), Buffer.from(shot.data, 'base64'));
  }

  // 转成横屏 → 换横图
  await viewport(844, 390);
  await sleep(1500);
  const mobileLand = await heroInfo();
  check('手机横屏：首页横幅换成横图', mobileLand.w > mobileLand.h, `${mobileLand.w}×${mobileLand.h} · ${mobileLand.src}`);

  // 转回竖屏 → 换回竖图
  await viewport(390, 844);
  await sleep(1500);
  const mobileBack = await heroInfo();
  check('转回竖屏：首页横幅换回竖图', mobileBack.h > mobileBack.w, `${mobileBack.w}×${mobileBack.h} · ${mobileBack.src}`);

  // 桌面 → 横图
  await viewport(1440, 900, false);
  await sleep(1500);
  const desktop = await heroInfo();
  check('桌面宽屏：首页横幅用横图', desktop.w > desktop.h, `${desktop.w}×${desktop.h} · ${desktop.src}`);

  // 沉浸舞台：塞一首占位曲目，切到相册背景
  await viewport(390, 844);
  await sleep(600);
  const stageOpened = await evaluate(`(async () => {
    localStorage.setItem('ft.terminal.stageBackdrop', 'archive');
    localStorage.removeItem('ft.terminal.stageBackdropPin');
    const P = window.Terminal.Player;
    if (!P.current) P.add({ id: 'backdrop-probe', title: 'BACKDROP PROBE', artist: 'LOCAL', provider: 'local' });
    window.Terminal.ListeningStage.open();
    await new Promise((r) => setTimeout(r, 1600));
    return !!document.querySelector('.lstage.is-open');
  })()`);
  check('沉浸舞台能打开', stageOpened === true);

  const stageMobile = await stageInfo();
  check('手机竖屏：舞台相册背景用竖图', stageMobile.h > stageMobile.w,
    `${stageMobile.w}×${stageMobile.h} · ${stageMobile.src}`);
  {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(OUT, 'verify-backdrop-mobile-stage.png'), Buffer.from(shot.data, 'base64'));
  }

  // 舞台转横屏 → 换横图
  await viewport(844, 390);
  await sleep(1600);
  const stageLand = await stageInfo();
  check('手机横屏：舞台相册背景换成横图', stageLand.w > stageLand.h,
    `${stageLand.w}×${stageLand.h} · ${stageLand.src}`);

  // 转回竖屏 → 换回竖图
  await viewport(390, 844);
  await sleep(1600);
  const stageBack = await stageInfo();
  check('转回竖屏：舞台相册背景换回竖图', stageBack.h > stageBack.w,
    `${stageBack.w}×${stageBack.h} · ${stageBack.src}`);

  // 固定后就该听用户的：转屏不再换图
  await evaluate(`document.getElementById('lsBgPin').click()`);
  await sleep(300);
  const pinned = await evaluate(`localStorage.getItem('ft.terminal.stageBackdropPin') || ''`);
  check('舞台「固定」把当前背景写进本地存储', normalizeUrl(pinned) === stageBack.src, pinned || '—');
  await viewport(844, 390);
  await sleep(1600);
  const stagePinned = await stageInfo();
  check('固定后转屏不换图（固定优先于横竖自适应）', stagePinned.src === stageBack.src,
    `${stagePinned.src} / 固定 ${stageBack.src}`);

  check('页面没有控制台异常', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

  const pass = results.filter((r) => r.ok).length;
  console.log(`\n\x1b[1m结果\x1b[0m  通过 ${pass} / ${results.length}`);
  try { await send('Browser.close'); } catch { /* noop */ }
  try { child.kill('SIGKILL'); } catch { /* noop */ }
  return pass === results.length ? 0 : 1;
}

/** 本地存储里存的是相对站点的地址；比较时把前导斜杠归一掉 */
function normalizeUrl(url) {
  return String(url || '').replace(/^\/+/, '');
}

main()
  .then((code) => { process.exitCode = code; setTimeout(() => process.exit(code), 300); })
  .catch((err) => {
    console.error('FAILED', err?.stack || err);
    try { child?.kill('SIGKILL'); } catch { /* noop */ }
    setTimeout(() => process.exit(1), 300);
  })
  .finally(() => { fs.rm(profile, { recursive: true, force: true }).catch(() => {}); });
