/**
 * ui/backdrop-pool.js — 首页横幅 / 沉浸舞台共用的「横竖图池」
 * ==================================================================
 * 同一个相册，桌面用横图、手机用竖图。判断顺序：
 *   1. 先看**容器自己的比例** —— 最终裁切发生在这里，最不会骗人；
 *   2. 容器还没量出来时，退到窄屏 / 触屏竖屏媒体查询；
 *   3. 最后才用视口宽高比兜底。
 *
 * 第 1 条是这次针对 App 的关键：WebView 上报的视口宽度有时和预期不一样，
 * 只要首屏 / 舞台本身是一块高高的区域，就会拿到竖图；桌面窗口宽，仍然是横图。
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
  const rect = el?.getBoundingClientRect?.();
  if (rect && rect.width >= 120 && rect.height >= 120) {
    if (rect.height > rect.width * 1.04) return true;
    if (rect.width > rect.height * 1.04) return false;
  }
  try {
    if (window.matchMedia(BACKDROP_MOBILE_MQ).matches) return true;
    if (window.matchMedia('(pointer: coarse)').matches
      && window.matchMedia('(orientation: portrait)').matches) return true;
  } catch { /* 老 WebView 没有 matchMedia 也能继续走下面的兜底 */ }
  return window.innerHeight > window.innerWidth;
}
