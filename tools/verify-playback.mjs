#!/usr/bin/env node
/**
 * tools/verify-playback.mjs — 播放链路自检（开发期工具，不属于站点运行时）
 * ------------------------------------------------------------------
 * 用真实 Chromium 内核浏览器（Edge / Chrome）验证本次修复的三件事：
 *   1. 网易云曲目走的是**站内直放**：<audio> 有真实时长，播放进度在走；
 *   2. 一首**完整放完**（播到时长末尾）之后自动接下一首 —— 不是被估算提前掐掉；
 *   3. 页面进入**后台**（document.hidden = true）之后，照样完整放完并自动接下一首。
 *      ← 这一条是本次修复的核心，也是最容易悄悄回归的地方。
 * 另外附带一个移动视口（iPhone 尺寸 + 触摸）的横向溢出检查与截图。
 *
 * 用法：
 *   node tools/verify-playback.mjs [baseUrl]
 *   node tools/verify-playback.mjs http://127.0.0.1:5173
 *
 * 退出码：0 = 全部通过，1 = 有失败项（可直接接进 CI / 自检脚本）。
 *
 * 说明：
 *   · 会临时往 D:\...\assets 之外写截图到 .shots/（可安全删除）。
 *   · 用 --autoplay-policy=no-user-gesture-required 让无头浏览器无需用户手势即可播放，
 *     否则自动播放会被策略拒掉（那是浏览器的限制，不是站点的问题）。
 */

import { spawn } from 'node:child_process';
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.argv[2] || 'http://127.0.0.1:5173';
const OUT = path.join(ROOT, '.shots');

/* 已知匿名可播放的曲目（会员 / 付费曲目拿不到匿名音频流，会走官方播放器，
   不适合用来自检直放链路）。取自「飙升榜」实测 playable=true 的三首。 */
const TRACKS = [
  { id: 'ne-554322674', provider: 'netease', neteaseId: '554322674', title: '偷心', artist: 'SASIOVERLXRD/连麻Swimming', duration: 0 },
  { id: 'ne-211520', provider: 'netease', neteaseId: '211520', title: '你不要那样看着我的眼睛', artist: '蔡琴', duration: 0 },
  { id: 'ne-1899705498', provider: 'netease', neteaseId: '1899705498', title: 'Star (反方向的钟)', artist: 'XMASwu(吴骜)', duration: 0 },
];

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter((p) => existsSync(p));

const PORT = 9200 + Math.floor(Math.random() * 300);
const profile = path.join(os.tmpdir(), `ft-verify-${Date.now()}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let child;
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? '\x1b[32m PASS\x1b[0m' : '\x1b[31m FAIL\x1b[0m'} ${name}${detail ? `  \x1b[90m${detail}\x1b[0m` : ''}`);
  return !!ok;
};

/** 建立一条 CDP 连接（页面级或浏览器级都可以） */
async function connect(wsUrl, { enableRuntime = true } = {}) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', () => rej(new Error(`WebSocket 连接失败：${wsUrl}`)), { once: true });
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
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push((msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
    }
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    const timer = setTimeout(() => { pending.delete(mid); reject(new Error(`CDP 超时：${method}`)); }, 30000);
    pending.set(mid, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  const session = {
    send,
    consoleErrors,
    close: () => ws.close(),
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(`页面求值失败：${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description || ''}`);
      return r.result?.value;
    },
  };
  // 浏览器级目标（/json/version）没有 Runtime 域，只有页面级目标才需要开
  if (enableRuntime) await send('Runtime.enable');
  return session;
}

/**
 * 采样到「曲目索引发生变化」为止，同时记录这一首播到过的最大位置。
 * 返回 max/dur 就是「有没有完整放完」的证据：max 接近 dur 才算没被提前掐掉。
 */
async function watchAdvance(page, { seconds = 25, label = '' } = {}) {
  const startIdx = await page.eval('window.Terminal.Player.index');
  let max = 0;
  let dur = 0;
  let hidden = false;
  const t0 = Date.now();
  while (Date.now() - t0 < seconds * 1000) {
    const s = await page.eval(`(() => {
      const P = window.Terminal.Player;
      const a = P.audio;
      return { i: P.index, t: a ? a.currentTime : 0, d: a ? (a.duration || 0) : 0, h: document.hidden };
    })()`);
    hidden = s.h;
    // 先看索引有没有变：变了就说明切歌了，这一刻的时长已经是**下一首**的了，
    // 不能再并进 dur（否则会拿下一首的时长去判定上一首"有没有播完"）
    if (s.i !== startIdx) return { advanced: true, max, dur, hidden, ms: Date.now() - t0, label };
    dur = Math.max(dur, s.d || 0);
    max = Math.max(max, s.t || 0);
    await sleep(250);
  }
  return { advanced: false, max, dur, hidden, ms: Date.now() - t0, label };
}

/** 把当前这首挪到「还剩 tail 秒」，用于快速验证放完 → 自动下一首 */
async function seekNearEnd(page, tail = 4) {
  return page.eval(`(() => {
    const P = window.Terminal.Player;
    const a = P.audio;
    if (!a || !Number.isFinite(a.duration) || a.duration <= 0) return null;
    a.currentTime = Math.max(0, a.duration - ${tail});
    return { dur: a.duration, at: a.currentTime, provider: P.providerId };
  })()`);
}

async function main() {
  if (!BROWSERS.length) throw new Error('未找到 Chromium 内核浏览器（Edge / Chrome）');
  console.log(`\n\x1b[1m播放链路自检\x1b[0m  ${BASE}\n浏览器：${BROWSERS[0]}\n`);

  child = spawn(BROWSERS[0], [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1280,900',
    `${BASE}/#/music`,
  ], { stdio: 'ignore' });

  // 等待调试端口
  let pageTarget = null;
  let browserWs = null;
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      pageTarget = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      const ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      browserWs = ver.webSocketDebuggerUrl;
      if (pageTarget && browserWs) break;
    } catch { /* 端口还没起来 */ }
    await sleep(250);
  }
  if (!pageTarget) throw new Error('调试端口未就绪');

  const page = await connect(pageTarget.webSocketDebuggerUrl);
  const browser = await connect(browserWs, { enableRuntime: false });
  await page.send('Page.enable');

  // 等应用启动完成（boot 会 loading 数据、注册视图）
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { if (await page.eval('!!window.Terminal?.Player?.ready')) { ready = true; break; } } catch { /* 还在加载 */ }
    await sleep(500);
  }
  check('应用启动完成（Player 就绪）', ready);
  if (!ready) throw new Error('站点没有启动起来，后续检查无法进行');

  // 用固定曲目替换播放列表：不依赖 localStorage / 导入流程，自检可重复
  await page.eval(`(() => {
    const P = window.Terminal.Player;
    P.setTracks(${JSON.stringify(TRACKS)});
    P.prepare(0, { autoplay: true });
    return P.tracks.length;
  })()`);

  // ---- 1) 走的是站内直放，而且拿到了真实时长 ----
  let meta = null;
  for (let i = 0; i < 100; i++) {
    meta = await page.eval(`(() => {
      const P = window.Terminal.Player;
      const a = P.audio;
      return { provider: P.providerId, isEmbed: P.isEmbed, dur: a ? (a.duration || 0) : 0, t: a ? a.currentTime : 0, src: a ? a.getAttribute('src') : '' };
    })()`);
    if (meta.dur > 0 && meta.t > 0.2) break;
    await sleep(300);
  }
  check('网易云曲目走站内直放（provider = netease-audio）', meta.provider === 'netease-audio', `provider=${meta.provider}`);
  check('拿到真实音频时长（不是估算）', meta.dur > 60, `${meta.dur.toFixed(1)}s`);
  check('音源是站内同源转发地址', /^\/api\/netease\/audio\?id=/.test(meta.src || ''), meta.src);

  const t1 = await page.eval('window.Terminal.Player.audio.currentTime');
  await sleep(2500);
  const t2 = await page.eval('window.Terminal.Player.audio.currentTime');
  check('播放进度在推进', t2 > t1 + 1, `${t1.toFixed(2)}s → ${t2.toFixed(2)}s`);

  // ---- 2) Media Session（移动端后台 / 锁屏控制的基础） ----
  const ms = await page.eval(`(() => ({
    has: 'mediaSession' in navigator,
    title: navigator.mediaSession?.metadata?.title || '',
    state: navigator.mediaSession?.playbackState || '',
  }))()`);
  check('已注册系统媒体面板（Media Session）', ms.has && ms.state === 'playing', `state=${ms.state} title=${ms.title}`);
  check('媒体面板元数据 = 当前曲目', ms.title === TRACKS[0].title, `"${ms.title}"`);

  // ---- 3) 前台：完整放完 → 自动接下一首 ----
  await seekNearEnd(page, 4);
  const fg = await watchAdvance(page, { seconds: 20, label: 'foreground' });
  check('前台：一首放完后自动切到下一首', fg.advanced, `${fg.ms}ms`);
  check('前台：是播到结尾才切（没有被提前掐掉）',
    fg.advanced && fg.dur > 0 && fg.max >= fg.dur - 2,
    `播到 ${fg.max.toFixed(1)}s / 共 ${fg.dur.toFixed(1)}s`);
  const nowIdx = await page.eval('window.Terminal.Player.index');
  check('前台：切到了列表里的下一首', nowIdx === 1, `index=${nowIdx}`);

  // ---- 4) 后台（hidden）：这才是本次修复的核心 ----
  // 另开一个标签页并激活它 → 原页面 document.hidden 变 true，进入真正的后台状态
  const created = await browser.send('Target.createTarget', { url: 'about:blank' });
  await browser.send('Target.activateTarget', { targetId: created.targetId });
  await sleep(1500);
  const hiddenNow = await page.eval('document.hidden');
  check('页面确实进入了后台（document.hidden = true）', hiddenNow === true, `hidden=${hiddenNow}`);

  // 后台状态下先确认音频还在播，再验证"放完 → 自动下一首"
  const bgPlaying = await page.eval(`(() => {
    const P = window.Terminal.Player;
    if (P.audio.paused) { P.play(); }
    return { playing: P.playing, paused: P.audio.paused, t: P.audio.currentTime, dur: P.audio.duration || 0 };
  })()`);
  check('后台：音频仍在播放（没有被浏览器暂停）', bgPlaying.paused === false, `t=${Number(bgPlaying.t).toFixed(1)}s`);

  await seekNearEnd(page, 4);
  const bg = await watchAdvance(page, { seconds: 25, label: 'background' });
  check('后台：一首放完后自动切到下一首（不切回前台也算数）', bg.advanced, `${bg.ms}ms, hidden=${bg.hidden}`);
  check('后台：是播到结尾才切',
    bg.advanced && bg.dur > 0 && bg.max >= bg.dur - 2,
    `播到 ${bg.max.toFixed(1)}s / 共 ${bg.dur.toFixed(1)}s`);
  const bgIdx = await page.eval('window.Terminal.Player.index');
  check('后台：切歌后仍在播放', (await page.eval('window.Terminal.Player.playing')) === true, `index=${bgIdx}`);

  await browser.send('Target.closeTarget', { targetId: created.targetId }).catch(() => {});
  await browser.send('Target.activateTarget', { targetId: pageTarget.id }).catch(() => {});
  await sleep(800);

  // ---- 5) 移动端：触控媒体特性 + 三个常见手机宽度 + 截图 ----
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setUserAgentOverride', {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  await page.eval(`location.hash = '#/music'`);
  await sleep(1200);

  const probeOverflow = `(() => {
    const de = document.documentElement;
    const inScroller = (el) => {
      for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === 'auto' || ox === 'scroll') return true;
      }
      return false;
    };
    const overflow = [...document.querySelectorAll('#view *')]
      .filter((el) => {
        if (el.closest('.hero__bg')) return false;
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed') return false;
        if (cs.position === 'absolute' && el.closest('.hero, .stage, .album, .card__thumb, .masonry__item')) return false;
        if (inScroller(el)) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > window.innerWidth + 2 || r.left < -2);
      })
      .slice(0, 6)
      .map((el) => (el.className || el.tagName).toString().slice(0, 44));
    return { vw: window.innerWidth, docWidth: de.scrollWidth, hScroll: de.scrollWidth > de.clientWidth + 1, overflow };
  })()`;

  for (const w of [360, 390, 430]) {
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: w, height: 844, deviceScaleFactor: 2, mobile: true,
      screenOrientation: { angle: 0, type: 'portraitPrimary' },
    });
    await sleep(700);
    const r = await page.eval(probeOverflow);
    check(`移动端 ${w}px：没有横向滚动`, r.hScroll === false, `docWidth=${r.docWidth}`);
    check(`移动端 ${w}px：没有元素冲出视口`, r.overflow.length === 0, r.overflow.join(', ') || '—');

    // 顶栏在手机上要放 4 个图标按钮（新增了「黄历」）：内容不能撑破自己的盒子，
    // 否则最右边的菜单键会被 body 的 overflow-x:hidden 悄悄裁掉
    const tb = await page.eval(`(() => {
      const bar = document.querySelector('.topbar');
      const right = document.querySelector('.topbar__right');
      const icons = [...right.querySelectorAll('.iconbtn')];
      return {
        barScroll: bar.scrollWidth, barClient: bar.clientWidth,
        barRight: Math.round(bar.getBoundingClientRect().right),
        lastIconRight: Math.round(icons[icons.length - 1].getBoundingClientRect().right),
        iconCount: icons.length,
        iconW: Math.round(icons[0].getBoundingClientRect().width),
      };
    })()`);
    check(`移动端 ${w}px：顶栏内容不溢出（含新增的黄历按钮）`,
      tb.barScroll <= tb.barClient + 1, `scroll=${tb.barScroll} client=${tb.barClient} icons=${tb.iconCount}@${tb.iconW}px`);
    check(`移动端 ${w}px：顶栏最右图标没被裁掉`,
      tb.lastIconRight <= tb.barRight + 1, `iconRight=${tb.lastIconRight} barRight=${tb.barRight}`);
  }

  // 390px 下逐条验证移动适配层真的生效（而不是"看起来还行"）
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 3, mobile: true,
    screenOrientation: { angle: 0, type: 'portraitPrimary' },
  });
  await sleep(700);
  const mobileCss = await page.eval(`(() => {
    const px = (el, prop) => el ? parseFloat(getComputedStyle(el)[prop]) || 0 : 0;
    // 宽表必须能横向滚动，而不是被 body 的 overflow-x:hidden 裁掉
    const probe = document.createElement('div');
    probe.className = 'prose';
    probe.innerHTML = '<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>';
    document.body.append(probe);
    const tableOverflowX = getComputedStyle(probe.querySelector('table')).overflowX;
    probe.remove();
    return {
      pointerCoarse: matchMedia('(pointer: coarse)').matches,
      hoverNone: matchMedia('(hover: none)').matches,
      iconbtn: px(document.querySelector('.iconbtn'), 'height'),
      tracksHeadWrap: getComputedStyle(document.querySelector('.tracks__head') || document.body).flexWrap,
      mpWaveDisplay: getComputedStyle(document.querySelector('.mp-wave') || document.body).display,
      tableOverflowX,
      viewportMeta: document.querySelector('meta[name=viewport]')?.content || '',
      manifest: document.querySelector('link[rel=manifest]')?.getAttribute('href') || '',
      appleCapable: document.querySelector('meta[name=apple-mobile-web-app-capable]')?.content || '',
      mobileCssLoaded: [...document.styleSheets].some((s) => (s.href || '').includes('styles/mobile.css')),
      miniplayerH: getComputedStyle(document.documentElement).getPropertyValue('--miniplayer-h').trim(),
    };
  })()`);

  check('移动端：触控媒体特性已生效（pointer: coarse / hover: none）',
    mobileCss.pointerCoarse && mobileCss.hoverNone, `coarse=${mobileCss.pointerCoarse} hoverNone=${mobileCss.hoverNone}`);
  check('移动端：styles/mobile.css 已加载', mobileCss.mobileCssLoaded);
  check('移动端：顶栏按钮达到触控尺寸（≥44px）', mobileCss.iconbtn >= 44, `${mobileCss.iconbtn}px`);
  check('移动端：播放列表标题栏允许换行（不会被裁掉）', mobileCss.tracksHeadWrap === 'wrap', mobileCss.tracksHeadWrap);
  check('移动端：底栏音浪条保留（窄屏 display:flex）', mobileCss.mpWaveDisplay === 'flex', mobileCss.mpWaveDisplay);
  check('移动端：宽表可横向滚动（不再被裁掉）', mobileCss.tableOverflowX === 'auto', mobileCss.tableOverflowX);
  check('移动端：底栏高度按手机收窄', mobileCss.miniplayerH === '56px', mobileCss.miniplayerH);
  check('移动端：viewport 元信息存在', /width=device-width/.test(mobileCss.viewportMeta), mobileCss.viewportMeta);
  check('移动端：已声明主屏图标 manifest', /manifest\.webmanifest/.test(mobileCss.manifest), mobileCss.manifest);
  check('移动端：iOS 全屏模式已声明', mobileCss.appleCapable === 'yes', mobileCss.appleCapable);

  await fs.mkdir(OUT, { recursive: true });
  const shot = await page.send('Page.captureScreenshot', { format: 'png' });
  const shotFile = path.join(OUT, 'verify-playback-mobile.png');
  await fs.writeFile(shotFile, Buffer.from(shot.data, 'base64'));
  console.log(`\x1b[90m截图：${path.relative(ROOT, shotFile)}  (390×844)\x1b[0m`);

  // ---- 6) 黄历面板在手机上的版面 ----
  const musicBefore = await page.eval('window.Terminal.Player.playing');
  await page.eval(`window.Terminal.AlmanacUI.open()`);
  await sleep(2400);
  const almMobile = await page.eval(`(() => {
    const p = document.getElementById('almanac');
    const r = p.getBoundingClientRect();
    const close = document.getElementById('almanacClose').getBoundingClientRect();
    const a = document.getElementById('anthem');
    return {
      open: !p.hasAttribute('hidden'),
      left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom),
      vw: window.innerWidth, vh: window.innerHeight,
      close: [Math.round(close.width), Math.round(close.height)],
      days: document.querySelectorAll('.almanac__day').length,
      hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      anthemPlaying: a ? !a.paused : false,
      musicPlaying: window.Terminal.Player.playing,
      pausedMusic: !!window.Terminal.Almanac.anthem.pausedMusic,
      resumeLink: !!document.getElementById('almanacResume'),
    };
  })()`);
  check('移动端：黄历面板渲染出日卡', almMobile.days >= 2, `days=${almMobile.days}`);
  check('移动端：黄历面板完整落在视口内',
    almMobile.left >= 0 && almMobile.right <= almMobile.vw + 1 && almMobile.top >= 0 && almMobile.bottom <= almMobile.vh + 1,
    `panel=${almMobile.left},${almMobile.top}–${almMobile.right},${almMobile.bottom} viewport=${almMobile.vw}×${almMobile.vh}`);
  check('移动端：黄历关闭键达到触控尺寸（≥40px）',
    almMobile.close[0] >= 40 && almMobile.close[1] >= 40, almMobile.close.join('×'));
  check('移动端：打开黄历后仍然没有横向滚动', almMobile.hScroll === false, `vw=${almMobile.vw}`);
  // 吉日之歌响起时，站内正在放的歌要让位（两个音源同时响会很难听），并给出「继续播放」
  check('移动端：吉日之歌响起时站内播放让位（并给出继续播放入口）',
    almMobile.anthemPlaying
      ? (musicBefore === false || (almMobile.musicPlaying === false && almMobile.pausedMusic === true && almMobile.resumeLink === true))
      : true,
    JSON.stringify({ musicBefore, anthemPlaying: almMobile.anthemPlaying, musicPlaying: almMobile.musicPlaying, pausedMusic: almMobile.pausedMusic, resumeLink: almMobile.resumeLink }));

  const shotAlm = await page.send('Page.captureScreenshot', { format: 'png' });
  const almFile = path.join(OUT, 'verify-playback-mobile-almanac.png');
  await fs.writeFile(almFile, Buffer.from(shotAlm.data, 'base64'));
  console.log(`\x1b[90m截图：${path.relative(ROOT, almFile)}  (390×844)\x1b[0m`);
  await page.eval(`window.Terminal.Almanac.anthem.stop(); window.Terminal.AlmanacUI.close();`);
  await sleep(500);

  // 首页也拍一张：迷你播放条 + 首屏排版在手机上最容易出问题
  await page.eval(`location.hash = '#/'`);
  await sleep(1500);
  const shotHome = await page.send('Page.captureScreenshot', { format: 'png' });
  const homeFile = path.join(OUT, 'verify-playback-mobile-home.png');
  await fs.writeFile(homeFile, Buffer.from(shotHome.data, 'base64'));
  console.log(`\x1b[90m截图：${path.relative(ROOT, homeFile)}  (390×844)\x1b[0m`);

  // 顺手把桌面端也拍一张，人工确认布局没被改坏
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });
  await page.eval(`location.hash = '#/music'`);
  await sleep(1200);
  const desk = await page.send('Page.captureScreenshot', { format: 'png' });
  const deskFile = path.join(OUT, 'verify-playback-desktop.png');
  await fs.writeFile(deskFile, Buffer.from(desk.data, 'base64'));
  console.log(`\x1b[90m截图：${path.relative(ROOT, deskFile)}  (1280×860)\x1b[0m`);

  // 桌面端也拍一张开着黄历面板的，方便人眼过一遍版面
  await page.eval(`window.Terminal.AlmanacUI.open()`);
  await sleep(2000);
  const deskAlm = await page.send('Page.captureScreenshot', { format: 'png' });
  const deskAlmFile = path.join(OUT, 'verify-playback-desktop-almanac.png');
  await fs.writeFile(deskAlmFile, Buffer.from(deskAlm.data, 'base64'));
  console.log(`\x1b[90m截图：${path.relative(ROOT, deskAlmFile)}  (1280×860 黄历面板)\x1b[0m`);
  await page.eval(`window.Terminal.Almanac.anthem.stop(); window.Terminal.AlmanacUI.close();`);

  check('页面没有控制台报错', page.consoleErrors.length === 0, page.consoleErrors.slice(0, 2).join(' | '));

  page.close();
  browser.close();
}

main().catch((err) => {
  console.error('\n\x1b[31m自检中断\x1b[0m', err?.message || err);
  process.exitCode = 1;
}).finally(async () => {
  try { child?.kill(); } catch { /* noop */ }
  await fs.rm(profile, { recursive: true, force: true }).catch(() => {});

  const failed = results.filter((r) => !r.ok);
  console.log(`\n\x1b[1m结果\x1b[0m  通过 ${results.length - failed.length} / ${results.length}`);
  if (failed.length) {
    console.log('\x1b[31m未通过：\x1b[0m');
    failed.forEach((f) => console.log(`  · ${f.name}${f.detail ? `  (${f.detail})` : ''}`));
  }
  setTimeout(() => process.exit(failed.length || process.exitCode ? 1 : 0), 300);
});
