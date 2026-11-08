/**
 * ui/liuli.js — 琉璃主题运行时
 * ------------------------------------------------------------------
 * 只做四件事：
 *   1) 铺一层全站壁纸（fixed 层，挂在 body 直下）
 *   2) 从壁纸取源色（64×64 缩略图挑最鲜艳的像素）
 *   3) 用源色派生整套 M3 近似色板，写进 <style id="liuliPalette">
 *   4) 壁纸来源切换（跟首页横幅 / 跟随机插画 / 用固定的那张）、遮罩浓度与磨砂强度
 *
 * 「跟首页横幅」是默认档：站主要的是全站底色和首页那张横幅是同一张照片，
 * 所以横幅一换（随机 / 换一张 / 固定 / 选图）全站跟着换 —— 靠 home.js 广播的
 * hero:change 事件；不在首页时读横幅固定下来的那张（ft.terminal.heroPinned）。
 *
 * 只有 <html data-theme="liuli*"> 时才生效；切回其它主题会把注入的样式清空、
 * 壁纸层隐藏，其它五套主题一行都不受影响。
 *
 * 材质配方（模糊 / 不透明度 / 噪声 / 圆角 / 级联入场）全在 styles/liuli.css，
 * 这里只负责「颜色从哪来」。派生算法见 ui/liuli-color.js。
 *
 * 移植参考：LilycleHeart/dsh-liuli-ui-enhance（liuli-runtime.ts）
 *          LilycleHeart/qqnt-liuli-theme（renderer/index.js 的 applyDynamicPalette）
 */

import { bus } from '../core/bus.js';
import { Theme } from '../core/theme.js';
import { Settings } from '../core/store.js';
import { Registry } from '../core/registry.js';
import { Stage } from '../plugins/stage.js';
import { openBackgroundPicker } from './background-picker.js';
import { deriveTokens, extractSourceColor, LIULI_DEFAULT_SOURCE } from './liuli-color.js';

const STYLE_ID = 'liuliPalette';
const BG_ID = 'liuliBg';
/** 固定的那张壁纸存整条 photo（标题/作者都留着，信息条要用），和首页横幅同一个套路 */
const PIN_KEY = 'ft.terminal.liuliWallpaper';
/** 首页横幅固定的那张（views/home.js 写的键）：不在首页时靠它兜底，保证「跟横幅」不断线 */
const HERO_PIN_KEY = 'ft.terminal.heroPinned';

/** 壁纸来源。默认跟首页横幅 —— 站主要的就是「全站底色和首页那张图是同一张照片」。 */
const MODES = [
  { id: 'hero', label: '跟首页横幅' },
  { id: 'art', label: '跟随机插画' },
  { id: 'album', label: '用固定的那张' },
];

/** 壁纸遮罩浓度：压住照片保证正文可读。壁纸本身已经磨砂过（见 liuli.css），
 *  所以这里的档位比第一版轻得多 —— 0.7 那版把照片压成了「一块脏色」，站主实测
 *  看不出是壁纸。三档都能读正文，靠的是壁纸磨砂 + 面板玻璃，不是靠遮罩硬压。 */
const VEILS = [
  { id: 'soft', label: '清淡', light: 0.42, dark: 0.3 },
  { id: 'std', label: '标准', light: 0.6, dark: 0.46 },
  { id: 'deep', label: '浓郁', light: 0.76, dark: 0.62 },
];

/** 壁纸磨砂强度：抹掉高频细节是「满屏壁纸 + 正文可读」的主力（遮罩只是配角）。
 *  觉得照片糊得看不出来就切「清晰」，觉得字花就切「重磨砂」。 */
const BLURS = [
  { id: 'none', label: '清晰', px: '0px' },
  { id: 'soft', label: '磨砂', px: '16px' },
  { id: 'heavy', label: '重磨砂', px: '30px' },
];

let styleEl = null;
let bgEl = null;
let seq = 0;
let hinted = false;
let blurTimer = 0;
/** 上一次生效的「壁纸 + 磨砂档 + 明暗 + 遮罩档」组合，用来跳过重复工作 */
let lastKey = '';
/** 兜底插画只主动抽一次，避免数据源全挂时反复重试 */
let artAsked = false;

const root = () => document.documentElement;
const isActive = () => String(root().dataset.theme || '').startsWith('liuli');
const isDark = () => root().dataset.scheme === 'dark';
/** 壁纸来源：hero（默认，跟首页横幅）/ art（跟随机插画）/ album（只用固定的那张）。
 *  一个会跟着壁纸呼吸的主题，不该要求用户先手动选一张图，所以三种模式都有兜底。 */
const mode = () => (MODES.find((m) => m.id === Settings.get('liuliMode')) || MODES[0]).id;
const veil = () => VEILS.find((v) => v.id === Settings.get('liuliVeil')) || VEILS[1];
const blurPref = () => BLURS.find((b) => b.id === Settings.get('liuliBlur')) || BLURS[1];

function readPin() {
  try {
    const p = JSON.parse(localStorage.getItem(PIN_KEY) || 'null');
    return p?.url ? p : null;
  } catch { return null; }
}

/** @returns {boolean} 存下来了没有（隐私模式 / 配额满时是 false，本次会话仍然能看） */
function writePin(photo) {
  try {
    if (photo?.url) localStorage.setItem(PIN_KEY, JSON.stringify(photo));
    else localStorage.removeItem(PIN_KEY);
    return true;
  } catch { return false; }
}

function readHeroPin() {
  try {
    const p = JSON.parse(localStorage.getItem(HERO_PIN_KEY) || 'null');
    return p?.url ? p : null;
  } catch { return null; }
}

/** 壁纸层：挂 body 直下（不是 .shell 里），天然避开 fixed 后代的包含块陷阱 */
function ensureLayer() {
  if (bgEl && document.body.contains(bgEl)) return bgEl;
  const div = document.createElement('div');
  div.id = BG_ID;
  div.className = 'liuli-bg';
  div.setAttribute('aria-hidden', 'true');
  div.hidden = true;
  document.body.insertBefore(div, document.body.firstChild);
  bgEl = div;
  return div;
}

function ensureStyle() {
  if (styleEl && document.head.contains(styleEl)) return styleEl;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  document.head.appendChild(el);
  styleEl = el;
  return el;
}

/**
 * 把派生出来的变量写成一段样式。
 * 选择器必须带 [data-theme="..."]：这样切到别的主题时这段自动失效，
 * 不需要逐个 removeProperty（也不会污染其它五套主题）。
 */
function writeVars(vars) {
  const theme = root().dataset.theme || 'liuli';
  const body = Object.keys(vars)
    .filter((k) => vars[k] != null && vars[k] !== '')
    .map((k) => `  ${k}: ${vars[k]};`)
    .join('\n');
  ensureStyle().textContent = `/* 琉璃动态色板 · 由 ui/liuli.js 从壁纸取色派生，请勿手改 */\n:root[data-theme="${theme}"] {\n${body}\n}\n`;
}

function clearVars() {
  if (styleEl) styleEl.textContent = '';
}

/**
 * 首页横幅当前那张。在首页就读 DOM（横幅是随机抽的，没固定也有图）；
 * 不在首页时读它固定下来的那张 —— 这样「跟横幅」在别的板块也不会断线。
 */
function heroUrl() {
  const el = document.getElementById('heroMediaImg');
  if (el && el.src) return el.src;
  return readHeroPin()?.url || '';
}

/** 当前该用哪张壁纸。三种模式都保证有图，不会出现「切了琉璃却是一片纯色」：
 *   hero（默认）= 首页横幅 → 随机插画 → 固定的那张
 *   art         = 随机插画 → 首页横幅 → 固定的那张
 *   album       = 固定的那张 → 首页横幅 → 随机插画
 */
function currentUrl() {
  const pin = readPin()?.url || '';
  const art = Stage.current?.url || '';
  const hero = heroUrl();
  switch (mode()) {
    case 'album': return pin || hero || art || '';
    case 'art': return art || hero || pin || '';
    default: return hero || art || pin || '';
  }
}

const cssUrl = (u) => `url("${String(u).replace(/"/g, '%22')}")`;

function loadAnon(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // 要读像素就必须 CORS 干净
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`图片加载失败：${url}`));
    img.src = url;
  });
}

/** 磨砂壁纸的目标宽度：够糊、又不至于糊成色块，dataURL 也小（几十 KB） */
const WP_MAX = 720;

/**
 * 把壁纸的模糊**一次性烤进一张缩小图**，返回 dataURL（失败返回 ''，调用方继续用原图）。
 *
 * 为什么不用 CSS `filter: blur()`：全屏 fixed 层上的 filter 会让每次重绘都重新
 * 光栅化整屏模糊 —— 无头浏览器（软件渲染）实测能把页面拖到不响应，低端安卓
 * WebView 同理。烤成图片之后，运行时它就是一张普通背景图，零成本。
 *
 * 顺带解决边缘问题：画的时候放大一圈再让 canvas 裁掉，模糊就不会在四边露出底色。
 * `ctx.filter` 老 Safari 没有 —— 那时只剩降采样，浏览器放大时本身就是软的，够用。
 */
async function wallpaperTexture(url, blurPx, dark) {
  const px = parseFloat(blurPx);
  if (!px) return ''; // 「清晰」档：用原图
  const img = await loadAnon(url);
  const nw = img.naturalWidth || 0;
  const nh = img.naturalHeight || 0;
  if (!nw || !nh) return '';
  const scale = Math.min(1, WP_MAX / Math.max(nw, nh));
  const w = Math.max(1, Math.round(nw * scale));
  const h = Math.max(1, Math.round(nh * scale));
  const cvs = document.createElement('canvas');
  cvs.width = w;
  cvs.height = h;
  const ctx = cvs.getContext('2d');
  if (!ctx) return '';
  // JPEG 没有透明通道：先铺一层和方案同侧的底色，透明 PNG 才不会变黑块
  ctx.fillStyle = dark ? '#0b0d10' : '#ffffff';
  ctx.fillRect(0, 0, w, h);
  const b = Math.max(3, Math.round(px * scale));
  if (typeof ctx.filter === 'string') ctx.filter = `blur(${b}px)`;
  const k = 1 + (2 * b) / Math.min(w, h);
  ctx.drawImage(img, -(w * (k - 1)) / 2, -(h * (k - 1)) / 2, w * k, h * k);
  try {
    return cvs.toDataURL('image/jpeg', 0.88);
  } catch {
    return ''; // canvas 被跨域污染：老实用原图
  }
}

export const Liuli = {
  /** 当前源色（自测 / 控制台排查用） */
  get source() { return root().dataset.liuliSource || LIULI_DEFAULT_SOURCE; },
  get mode() { return mode(); },
  get veil() { return veil().id; },
  get wallpaper() { return currentUrl(); },

  init() {
    // 切主题：进琉璃要重新取色派生，离开琉璃要清干净；顶栏那颗水滴的亮灭也跟着走
    bus.on('theme:change', () => { this.paintButton(); this.refresh(); });
    // 跟首页横幅（默认）：横幅一换，全站壁纸与配色跟着换
    bus.on('hero:change', (e) => {
      if (!isActive() || mode() !== 'hero') return;
      this.refresh(e?.photo?.url ? { url: e.photo.url } : {});
    });
    // 跟随机插画；「跟横幅」时它也是兜底来源，所以除了 album 都听一下。
    // refresh 内部按 key 去重，同一张图不会重复烤磨砂图。
    bus.on('art:change', (e) => {
      if (!isActive() || mode() === 'album') return;
      this.refresh(e?.current?.url ? { url: e.current.url } : {});
    });

    Registry.addCommand({
      id: 'liuli-theme',
      label: '琉璃：进入琉璃主题 / 切换明暗（夜 ⇄ 昼）',
      hint: 'THEME',
      run: () => this.toggle(),
    });
    Registry.addCommand({
      id: 'liuli-wallpaper',
      label: '琉璃：换全站壁纸（相册 / 本地图片）',
      hint: 'IMAGE',
      run: () => this.pick(),
    });
    Registry.addCommand({
      id: 'liuli-mode',
      label: '琉璃：壁纸来源 · 首页横幅 → 随机插画 → 固定一张',
      hint: 'SOURCE',
      run: () => this.cycleMode(),
    });
    Registry.addCommand({
      id: 'liuli-veil',
      label: '琉璃：壁纸浓度（遮罩深浅）',
      hint: 'VEIL',
      run: () => this.cycleVeil(),
    });
    Registry.addCommand({
      id: 'liuli-blur',
      label: '琉璃：壁纸磨砂（清晰 / 磨砂 / 重磨砂）',
      hint: 'BLUR',
      run: () => this.cycleBlur(),
    });

    // 顶栏那颗水滴按钮：一键进出琉璃（不必在 7 套主题里循环着找）
    const btn = document.getElementById('liuliBtn');
    if (btn) btn.addEventListener('click', () => this.toggle());
    this.paintButton();

    // 性能护栏：缩放窗口期间关掉 backdrop-filter（大面积模糊在低端机 / 安卓 WebView 会掉帧）
    window.addEventListener('resize', () => {
      if (!isActive()) return;
      root().dataset.liuliBlurOff = '1';
      clearTimeout(blurTimer);
      blurTimer = setTimeout(() => { delete root().dataset.liuliBlurOff; }, 220);
    }, { passive: true });

    this.refresh();
  },

  /**
   * 顶栏水滴按钮：**只在琉璃的两档里循环**（夜 ⇄ 昼）。
   * 和纯色主题彻底分开 —— 纯色主题按钮不碰琉璃，这里也不回纯色；
   * 想退出琉璃就按顶栏那个主题按钮（它只循环纯色）。
   * 从别的主题点进来时回到「上次待过的琉璃那一档」，不是每次都从夜开始。
   */
  toggle() {
    const list = Theme.liuliList;
    if (!Theme.isLiuli) return Theme.set(Theme.lastLiuli, { announce: true });
    const i = list.findIndex((t) => t.id === Theme.current);
    return Theme.set(list[(i + 1) % list.length].id, { announce: true });
  },

  /** 同步顶栏水滴的亮灭与提示文案（主题可以从别处切，所以挂在 theme:change 上） */
  paintButton() {
    const btn = document.getElementById('liuliBtn');
    if (!btn) return;
    const on = isActive();
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.title = !on ? '琉璃主题 · 点一下进入（进入上次的明暗档）'
      : isDark() ? '琉璃 · 夜 → 点一下切昼' : '琉璃 · 昼 → 点一下切夜';
    btn.setAttribute('aria-label', btn.title);
  },

  /** 重新取色 + 派生 + 铺壁纸。不是琉璃主题时只做清理。 */
  async refresh({ url = null } = {}) {
    const layer = ensureLayer();
    if (!isActive()) {
      layer.hidden = true;
      layer.style.backgroundImage = '';
      clearVars();
      delete root().dataset.liuliSource;
      lastKey = '';
      return;
    }

    const target = url || currentUrl();
    if (!target && !artAsked) {
      // 三种模式最后的兜底都是随机插画；一张都没有时就主动抽一张。
      // 抽到会发 art:change，上面的监听会带着新 url 再走一遍 refresh。
      artAsked = true;
      Stage.random({ silent: true }).catch(() => { /* 数据源不可用就维持无壁纸 */ });
    }

    // 同一张图 + 同一组设置不重复干活：横幅 / 插画事件很密，
    // 每次都重新解码 + 烤磨砂图纯属浪费（取色结果一样，白烧 CPU）。
    const key = `${target}|${blurPref().px}|${isDark() ? 'd' : 'l'}|${veil().id}`;
    if (key === lastKey) return;
    lastKey = key;

    if (target) {
      // 原图先顶上（立刻有壁纸），磨砂版烤好之后再换，中间不会白屏
      layer.style.backgroundImage = cssUrl(target);
      layer.hidden = false;
    } else {
      layer.hidden = true;
      layer.style.backgroundImage = '';
    }

    // 取色要解码图片，可能几百毫秒；用序号丢掉过期结果（连点换壁纸时会并发）
    const my = ++seq;
    let source = null;
    if (target) {
      try {
        source = await extractSourceColor(target);
      } catch (err) {
        console.info('[liuli] 取色失败，用默认源色', err?.message || err);
      }
      // 跨域图（Pixiv 插画）没有 CORS 头 → canvas 被污染 → 取不到色。
      // 壁纸照常显示，色板回退默认蓝，不打扰用户。
      if (!source) console.info('[liuli] 这张图取不到色（跨域或太灰），用默认源色');
      // 磨砂壁纸：一次性烤成小图换上去（失败就保持原图，不影响色板）
      try {
        const tex = await wallpaperTexture(target, blurPref().px, isDark());
        if (tex && my === seq) layer.style.backgroundImage = cssUrl(tex);
      } catch (err) {
        console.info('[liuli] 磨砂壁纸没做成，用原图', err?.message || err);
      }
    }
    if (my !== seq) return;

    const dark = isDark();
    const vars = deriveTokens(source || LIULI_DEFAULT_SOURCE, dark);
    vars['--liuli-veil-alpha'] = String(veil()[dark ? 'dark' : 'light']);
    writeVars(vars);
    root().dataset.liuliSource = source || LIULI_DEFAULT_SOURCE;

    if (!target && !hinted) {
      hinted = true;
      bus.emit('toast', {
        message: '琉璃主题已生效 · Ctrl+K 搜「琉璃」可以选壁纸、切来源',
        kind: 'ok',
      });
    }
  },

  /** 打开选图面板挑一张全站壁纸（相册 / 拖入本地图，和首页横幅同一套交互） */
  async pick() {
    if (document.body.classList.contains('is-bgpicker-open')) return;
    const pin = readPin();
    const picked = await openBackgroundPicker({
      scope: 'site',
      currentUrl: pin?.url || '',
      currentPhoto: pin,
    });
    if (!picked?.url) return;
    const saved = writePin(picked);
    if (mode() !== 'album') Settings.set('liuliMode', 'album');
    if (!isActive()) Theme.set('liuli');
    await this.refresh({ url: picked.url });
    bus.emit('toast', {
      message: saved ? `已换成这张壁纸 · 取色 ${this.source}` : `图太大没存住，本次会话有效 · 取色 ${this.source}`,
      kind: 'ok',
    });
  },

  /** 壁纸来源：跟首页横幅 → 跟随机插画 → 用固定的那张 */
  async cycleMode() {
    const i = MODES.findIndex((m) => m.id === mode());
    const next = MODES[(i + 1) % MODES.length];
    Settings.set('liuliMode', next.id);
    if (!currentUrl()) {
      // 换过去一张图都没有（例如不在首页、横幅也没固定过）：抽一张插画兜底，
      // 否则「切了来源」看起来像没反应。
      try { await Stage.random({ silent: true }); } catch { /* 数据源不可用时保持原样 */ }
    }
    await this.refresh();
    bus.emit('toast', {
      message: `琉璃壁纸：${next.label}${next.id === 'hero' ? '（默认）' : ''}`,
      kind: 'ok',
    });
  },

  /** 遮罩浓度：清淡 → 标准 → 浓郁 */
  async cycleVeil() {
    const i = VEILS.findIndex((v) => v.id === veil().id);
    const next = VEILS[(i + 1) % VEILS.length];
    Settings.set('liuliVeil', next.id);
    await this.refresh();
    bus.emit('toast', { message: `壁纸浓度 · ${next.label}`, kind: 'ok' });
  },

  /** 壁纸磨砂：清晰 → 磨砂 → 重磨砂 */
  async cycleBlur() {
    const i = BLURS.findIndex((b) => b.id === blurPref().id);
    const next = BLURS[(i + 1) % BLURS.length];
    Settings.set('liuliBlur', next.id);
    await this.refresh();
    bus.emit('toast', { message: `壁纸磨砂 · ${next.label}`, kind: 'ok' });
  },

  /** 清掉固定的壁纸（回到「没有壁纸，只用默认源色」） */
  async clear() {
    writePin(null);
    await this.refresh();
    bus.emit('toast', { message: '已取消固定壁纸', kind: 'ok' });
  },
};
