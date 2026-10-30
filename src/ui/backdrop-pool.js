/**
 * ui/backdrop-pool.js — 首页横幅 / 沉浸舞台共用的「横竖图池」
 * ==================================================================
 * 同一个相册，桌面用横图、手机用竖图。判断顺序：
 *   1. 手机 / 触屏竖屏 → 竖图（**先不看容器**）；
 *   2. 窄屏，或 App / 手机 UA + 竖屏 → 竖图；
 *   3. 桌面：再看容器自己的比例（最终裁切发生在这里）；
 *   4. 最后用视口宽高比兜底。
 *
 * 第 1、2 条是这次针对 App 的关键：Android WebView 有时把 layout viewport
 * 报成 980px，容器也量得偏宽；只看容器比例会把手机误判成桌面。桌面窗口宽，
 * 没有触屏 / 手机 UA，仍然按容器走横图。
 */

const MOBILE_MAX = 820;
/** 竖图 / 横图的最小长宽比，避免把接近方形的图也算进来 */
const PORTRAIT_MIN = 1.12;
const LANDSCAPE_MIN = 1.18;

export const BACKDROP_MOBILE_MQ = `(max-width: ${MOBILE_MAX}px)`;

/** 单张图的方向：portrait / landscape / square / ''（缺尺寸） */
export function photoOrientation(photo) {
  if (!photo?.width || !photo?.height) return '';
  if (photo.height >= photo.width * PORTRAIT_MIN) return 'portrait';
  if (photo.width >= photo.height * LANDSCAPE_MIN) return 'landscape';
  return 'square';
}

/** 把相册清单拆成 全部 / 竖图 / 横图 三个池子 */
export function splitBackdropPools(items) {
  const all = (Array.isArray(items) ? items : []).filter((it) => it?.url);
  return {
    all,
    portrait: all.filter((it) => photoOrientation(it) === 'portrait'),
    landscape: all.filter((it) => photoOrientation(it) === 'landscape'),
  };
}

/**
 * 按想要的方向挑池子。首选方向没有图时退回全量（而不是硬用相反方向，
 * 否则相册里只有一类图时会出现「想要竖图却只给横图」的错觉）。
 */
export function chooseBackdropPool(pools, { portrait } = {}) {
  const safe = pools || { all: [], portrait: [], landscape: [] };
  const preferred = portrait ? safe.portrait : safe.landscape;
  if (preferred.length) {
    return { pool: preferred, orientation: portrait ? 'portrait' : 'landscape', fallback: false };
  }
  return { pool: safe.all, orientation: '', fallback: true };
}

/**
 * 这块背景想要竖图吗？
 * @param {Element} [el] 背景容器（首页 hero / 沉浸舞台根节点）
 */
export function prefersPortraitBackdrop(el) {
  // 手机 / 触屏竖屏永远优先竖图，先不看容器：
  // Android WebView 有时把 layout viewport 量成 980px，容器比例会把手机误判成桌面。
  try {
    if (window.matchMedia('(pointer: coarse)').matches
      && window.matchMedia('(orientation: portrait)').matches) return true;
    if (window.matchMedia(BACKDROP_MOBILE_MQ).matches) return true;
    // 最后一道保险：App / 手机 UA + 竖屏。某些 Android WebView 会把 layout viewport
    // 报成 980px，pointer 也可能不是 coarse；UA 不会说谎。
    if (/(FishTempleApp|Android|iPhone|iPod)/i.test(navigator.userAgent || '')
      && window.matchMedia('(orientation: portrait)').matches) return true;
  } catch { /* 老 WebView 没有 matchMedia 也能继续走下面的兜底 */ }

  const rect = el?.getBoundingClientRect?.();
  if (rect && rect.width >= 120 && rect.height >= 120) {
    if (rect.height > rect.width * 1.04) return true;
    if (rect.width > rect.height * 1.04) return false;
  }
  return window.innerHeight > window.innerWidth;
}
