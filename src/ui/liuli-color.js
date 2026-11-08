/**
 * ui/liuli-color.js — 琉璃主题的「取色 + 色板派生」
 * ------------------------------------------------------------------
 * 参考实现（只借算法，不引依赖）：
 *   · LilycleHeart/dsh-liuli-ui-enhance  src/client/liuli-palette.ts / liuli-runtime.ts
 *   · LilycleHeart/qqnt-liuli-theme      renderer/index.js（extractSource / deriveVars）
 *
 * 两个项目都用 Google 的 Material Color Utilities（HCT 色彩空间，压缩后约 103KB）
 * 从源色派生整套 M3 色板。本站是零依赖静态站、还要照顾 GitHub Pages 的弱网，
 * 所以这里用 **OKLCH 近似** 自己算：同样是「固定 tone 表 + 固定彩度比例」，
 * 只是把 HCT 换成 OKLCH（两者都是感知均匀空间，肉眼差异很小，体积差 30 倍）。
 *
 * 分工：
 *   extractSourceColor(url)  壁纸 → 源色（浏览器里跑，要 canvas）
 *   deriveTokens(src, isDark) 源色 → 一整份 CSS 变量（纯函数，可在 node 里自测）
 */

/** 源色兜底：与原项目同一个默认蓝（取色失败 / 图太灰时用） */
export const LIULI_DEFAULT_SOURCE = '#1d9bf0';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* ============================================================
   1. 颜色基础转换
   ============================================================ */

export function hexToRgb(hex) {
  let h = String(hex || '').replace('#', '').trim();
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (!/^[0-9a-f]{6}$/i.test(h)) return [0, 0, 0];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r, g, b) {
  const to = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** 0~255 的 sRGB 分量 → 线性光 */
function toLinear(c8) {
  const c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** 线性光 → 0~255 的 sRGB 分量（**不裁剪**，裁剪交给调用方判断色域） */
function toSrgb(c) {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return v * 255;
}

/** sRGB → OKLCH（L 0~1，C 0~0.4+，H 0~360） */
export function rgbToOklch(r, g, b) {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

/** OKLCH → sRGB（可能超出色域，返回未裁剪的浮点值） */
export function oklchToRgb(L, C, H) {
  const l = clamp(L, 0, 1);
  const hr = (H * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const lc = l_ ** 3;
  const mc = m_ ** 3;
  const sc = s_ ** 3;
  return [
    toSrgb(4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc),
    toSrgb(-1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc),
    toSrgb(-0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc),
  ];
}

const inGamut = (rgb) => rgb.every((v) => v >= -1.5 && v <= 256.5);

/**
 * 按「明度 + 彩度 + 色相」取一个色域内的颜色。
 * 超出色域时逐级压彩度（M3 的 TonalPalette 同理：tone 变化时尽量保住色相）。
 */
export function tone(L, C, H) {
  let c = Math.max(0, C);
  for (let i = 0; i < 14 && c > 0.002; i += 1) {
    const rgb = oklchToRgb(L, c, H);
    if (inGamut(rgb)) return rgbToHex(rgb[0], rgb[1], rgb[2]);
    c *= 0.88;
  }
  const rgb = oklchToRgb(L, 0, H);
  return rgbToHex(rgb[0], rgb[1], rgb[2]);
}

/** RGB 彩度（max-min）：原项目用它判「图太灰」，阈值 24 */
export function chromaOfHex(hex) {
  const [r, g, b] = hexToRgb(hex);
  return Math.max(r, g, b) - Math.min(r, g, b);
}

/** 把前景色按 alpha 叠到背景色上（原项目 alphaComposite 同款，用于给表面染上品牌色相） */
export function alphaComposite(fgHex, bgHex, a) {
  const [pr, pg, pb] = hexToRgb(fgHex);
  const [br, bg2, bb] = hexToRgb(bgHex);
  return rgbToHex(a * pr + (1 - a) * br, a * pg + (1 - a) * bg2, a * pb + (1 - a) * bb);
}

/** '#rrggbb' → 'r, g, b'（给 rgba(var(--x-rgb), α) 用） */
export function rgbTriplet(hex) {
  return hexToRgb(hex).join(', ');
}

/* ============================================================
   2. 从图片取源色
   ============================================================ */

/** 同一张图只解码取色一次：切主题 / 反复 apply 时不再重复算 */
const sourceCache = new Map();

function loadImage(url, anonymous) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (anonymous) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`图片加载失败：${url}`));
    img.src = url;
  });
}

/**
 * 缩到 64×64 后挑「最鲜艳且不太暗 / 不太亮」的那个像素当源色。
 * 打分公式与原项目一致：score = chroma - |l - 128| * 0.4（l 取 (max+min)/2，跳过 l<35 或 l>220）。
 * 跨域图（Pixiv 插画）没有 CORS 头时 canvas 会被污染，getImageData 抛错 ——
 * 这时返回 null，调用方回退默认源色，**壁纸本身照常显示**（显示不需要 CORS）。
 * @returns {Promise<string|null>} 源色 hex；太灰（chroma<24）或取不到时返回 null
 */
export function extractSourceColor(url) {
  if (!url) return Promise.resolve(null);
  const hit = sourceCache.get(url);
  if (hit) return hit;
  const task = (async () => {
    let img = null;
    try {
      img = await loadImage(url, true);
    } catch {
      return null; // 无 CORS 头：取不到色，但图还能当壁纸用
    }
    const size = 64;
    const cvs = document.createElement('canvas');
    cvs.width = size;
    cvs.height = size;
    const ctx = cvs.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    let data;
    try {
      data = ctx.getImageData(0, 0, size, size).data;
    } catch {
      return null; // canvas 被污染
    }
    let best = null;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 128) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      if (l < 35 || l > 220) continue;
      const score = max - min - Math.abs(l - 128) * 0.4;
      if (!best || score > best.score) best = { r, g, b, score };
    }
    if (!best) return null;
    const hex = rgbToHex(best.r, best.g, best.b);
    return chromaOfHex(hex) >= 24 ? hex : null;
  })();
  sourceCache.set(url, task);
  task.catch(() => {
    if (sourceCache.get(url) === task) sourceCache.delete(url);
  });
  return task;
}

/* ============================================================
   3. M3 近似派生
   ============================================================ */

/** 表面 tone 表（照抄原项目）：亮色 98/96/94/92/90，暗色 6/10/12/17/22 */
const SURFACE_TONES = {
  light: { appBg: 98, low: 96, mid: 94, high: 92, highest: 90 },
  dark: { appBg: 6, low: 10, mid: 12, high: 17, highest: 22 },
};
/** 品牌色叠到表面上的强度（照抄原项目）：让玻璃底带一点色相而不是死灰 */
const SCRIM = { low: 0.05, mid: 0.08, high: 0.11, highest: 0.14 };

/** M3 的关键色用 tone 表示（0~100，本质是 CIE L*），OKLCH 的 L 是另一条标度：
 *  灰色上 OKLab 的 L = cbrt(Y)，而 L* 与 Y 的关系是分段函数，所以
 *    L* > 8  → L = (L* + 16) / 116
 *    L* <= 8 → L = cbrt(L* / 903.3)
 *  直接把 tone/100 当 L 用会整体偏暗（tone 6 会黑成 #010100，M3 实际是 #131313 左右）。 */
export function toneToL(t) {
  const v = clamp(t, 0, 100);
  return v > 8 ? (v + 16) / 116 : Math.cbrt(v / 903.3);
}

/** 各角色彩度相对源色的比例（M3 里 secondary 最灰、tertiary 换个色相） */
const CHROMA = { primary: 1, secondary: 0.34, tertiary: 0.62, neutral: 0.09, neutralVariant: 0.18 };
const TERTIARY_HUE_SHIFT = 60;
const ERROR_HUE = 25;
const ERROR_CHROMA = 0.14;
/** 「通过 / 在线」是产品语义色，不跟源色走（否则蓝壁纸下会变成紫色，站主会看不懂） */
const SUCCESS_HUE = 145;

/** M3 关键色的 tone（亮 / 暗），照 Material 3 的 baseline scheme */
const ROLE_TONES = {
  light: {
    primary: 40, onPrimary: 100, primaryContainer: 90, onPrimaryContainer: 10,
    secondary: 40, onSecondary: 100, secondaryContainer: 90, onSecondaryContainer: 10,
    tertiary: 40, onTertiary: 100, tertiaryContainer: 90, onTertiaryContainer: 10,
    error: 40, onError: 100, errorContainer: 90, onErrorContainer: 10,
    onSurface: 10, onSurfaceVariant: 30, outline: 50, outlineVariant: 80,
    inverseSurface: 20, inverseOnSurface: 95,
    fg2: 30, fg3: 40, fg4: 60,
  },
  dark: {
    primary: 80, onPrimary: 20, primaryContainer: 30, onPrimaryContainer: 90,
    secondary: 80, onSecondary: 20, secondaryContainer: 30, onSecondaryContainer: 90,
    tertiary: 80, onTertiary: 20, tertiaryContainer: 30, onTertiaryContainer: 90,
    error: 80, onError: 20, errorContainer: 30, onErrorContainer: 90,
    onSurface: 90, onSurfaceVariant: 80, outline: 60, outlineVariant: 30,
    inverseSurface: 90, inverseOnSurface: 20,
    fg2: 80, fg3: 66, fg4: 45,
  },
};

/**
 * 源色 → 一整份 CSS 变量（既覆盖本站 tokens.css 的语义令牌，也给出琉璃材质令牌）。
 * 纯函数：不碰 DOM，方便在 node 里跑自测。
 * @param {string} sourceHex 源色（壁纸取色结果，或 LIULI_DEFAULT_SOURCE）
 * @param {boolean} isDark 暗色方案
 * @returns {Record<string,string>} CSS 变量名 → 值
 */
export function deriveTokens(sourceHex, isDark) {
  const src = sourceHex && chromaOfHex(sourceHex) >= 2 ? sourceHex : LIULI_DEFAULT_SOURCE;
  const oklch = rgbToOklch(...hexToRgb(src));
  const H = oklch.h;
  const C = clamp(oklch.c, 0.025, 0.19);
  const T = ROLE_TONES[isDark ? 'dark' : 'light'];
  const ST = SURFACE_TONES[isDark ? 'dark' : 'light'];

  const pal = (role, t) => {
    const c = C * CHROMA[role];
    const h = role === 'tertiary' ? (H + TERTIARY_HUE_SHIFT) % 360 : H;
    return tone(toneToL(t), role === 'neutral' ? Math.min(c, 0.014) : c, h);
  };
  const neu = (t) => tone(toneToL(t), Math.min(C * CHROMA.neutral, 0.014), H);
  const nv = (t) => tone(toneToL(t), Math.min(C * CHROMA.neutralVariant, 0.03), H);
  const err = (t) => tone(toneToL(t), ERROR_CHROMA, ERROR_HUE);
  const success = (t) => tone(toneToL(t), Math.max(0.06, C * 0.5), SUCCESS_HUE);

  const primary = pal('primary', T.primary);
  const onPrimary = pal('primary', T.onPrimary);
  const tertiary = pal('tertiary', T.tertiary);

  // 表面：中性色 tone 表 + 品牌色按 SCRIM 叠一层（= 原项目的 bg1..bg4）
  const appBg = neu(ST.appBg);
  const sLow = neu(ST.low);
  const sMid = neu(ST.mid);
  const sHigh = neu(ST.high);
  const sHighest = neu(ST.highest);
  const bg1 = alphaComposite(primary, sLow, SCRIM.low);
  const bg2 = alphaComposite(primary, sMid, SCRIM.mid);
  const bg3 = alphaComposite(primary, sHigh, SCRIM.high);
  const bg4 = alphaComposite(primary, sHighest, SCRIM.highest);

  const onSurface = neu(T.onSurface);
  const onSurfaceVariant = nv(T.onSurfaceVariant);
  const outline = nv(T.outline);
  const outlineVariant = nv(T.outlineVariant);
  const error = err(T.error);
  const shadowBase = isDark ? '0, 0, 0' : rgbTriplet(neu(10));

  return {
    /* ---------- 琉璃自己的材质令牌 ---------- */
    '--liuli-source': src,
    '--liuli-brand-rgb': rgbTriplet(primary),
    '--liuli-acrylic-rgb': rgbTriplet(bg2),
    '--liuli-acrylic-rgb-low': rgbTriplet(bg1),
    '--liuli-acrylic-rgb-high': rgbTriplet(bg4),
    '--liuli-control-rgb': rgbTriplet(bg3),
    '--liuli-stroke-rgb': rgbTriplet(outline),
    '--liuli-shadow-rgb': shadowBase,
    '--liuli-veil-rgb': isDark ? '0, 0, 0' : '255, 255, 255',

    /* ---------- 本站语义令牌：纸 / 墨 ---------- */
    '--paper': appBg,
    '--paper-2': bg1,
    '--paper-3': bg2,
    '--paper-sunk': bg3,
    '--ink': onSurface,
    '--ink-2': onSurface,
    '--ink-100': onSurface,
    '--ink-80': nv(T.fg2),
    '--ink-60': nv(T.fg3),
    '--ink-40': nv(T.fg4),
    '--ink-25': nv(isDark ? 34 : 70),
    '--ink-12': nv(isDark ? 24 : 86),

    /* ---------- 强调 ---------- */
    '--signal': primary,
    '--signal-deep': pal('primary', isDark ? 90 : 30),
    '--signal-ink': onPrimary,
    '--alert': error,
    '--ok': success(isDark ? 78 : 38),
    '--link': primary,

    /* ---------- 线 ---------- */
    '--line': outlineVariant,
    '--line-strong': outline,
    '--line-soft': nv(isDark ? 24 : 90),

    /* ---------- 语义 ----------
       tokens.css 里 --bg / --bg-alt / --bg-sunk / --fg / --fg-muted / --fg-faint /
       --accent / --border / --border-hard 全是 --paper* / --ink* / --signal / --line*
       的别名，所以这里只给「基色」，别名自己指过来（和 night / matcha 等主题同一套约定）。
       两个例外必须显式给：
         · --selection-fg 默认是 --ink-100，暗色琉璃下会和浅色强调底撞成「浅字压浅底」
         · --bg-alt / --bg-sunk 由 styles/liuli.css 用 --liuli-acrylic-rgb 算成半透明玻璃底。
           运行时这段样式的选择器是 :root[data-theme="…"]（特异性 0,2,0），会压过
           liuli.css 的 html[data-theme^="liuli"]（0,1,1）—— 在这里写出不透明值，
           玻璃就被自己关掉了。 */
    '--selection-bg': primary,
    '--selection-fg': onPrimary,
    '--trace': primary,

    /* ---------- 深色命令栏（所有主题都保持深色，这里也跟 M3 走） ---------- */
    '--console-bg': neu(isDark ? 10 : 12),
    '--console-fg': neu(95),
    '--console-muted': nv(70),
    '--console-line': nv(30),

    /* ---------- 纹理 ---------- */
    '--grid-line': `rgba(${rgbTriplet(onSurface)}, ${isDark ? 0.07 : 0.06})`,

    /* ---------- M3 其余角色（组件想用时直接取） ---------- */
    '--liuli-primary': primary,
    '--liuli-on-primary': onPrimary,
    '--liuli-primary-container': pal('primary', T.primaryContainer),
    '--liuli-on-primary-container': pal('primary', T.onPrimaryContainer),
    '--liuli-secondary': pal('secondary', T.secondary),
    '--liuli-secondary-container': pal('secondary', T.secondaryContainer),
    '--liuli-on-secondary-container': pal('secondary', T.onSecondaryContainer),
    '--liuli-tertiary': tertiary,
    '--liuli-tertiary-container': pal('tertiary', T.tertiaryContainer),
    '--liuli-on-tertiary-container': pal('tertiary', T.onTertiaryContainer),
    '--liuli-error': error,
    '--liuli-error-container': err(T.errorContainer),
    '--liuli-on-error': err(T.onError),
    '--liuli-surface': appBg,
    '--liuli-surface-high': sHigh,
    '--liuli-surface-highest': sHighest,
    '--liuli-on-surface': onSurface,
    '--liuli-on-surface-variant': onSurfaceVariant,
    '--liuli-outline': outline,
    '--liuli-outline-variant': outlineVariant,
    '--liuli-inverse-surface': neu(T.inverseSurface),
    '--liuli-inverse-on-surface': neu(T.inverseOnSurface),
  };
}

/** 相对亮度（WCAG），用来在自测里核对文字对比度 */
export function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 两个颜色的对比度（WCAG 4.5:1 是正文及格线） */
export function contrastRatio(fgHex, bgHex) {
  const a = relativeLuminance(fgHex);
  const b = relativeLuminance(bgHex);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}
