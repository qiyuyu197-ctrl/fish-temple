/**
 * saucenao-engine.js — 反向图片搜索引擎
 * ------------------------------------------------------------------
 * 支持多种搜索后端：
 *   1. SauceNAO 官方 API（需要 API key）
 *   2. Google 图片搜索（URL 重定向）
 *   3. IQDB（Danbooru 系）
 *   4. TinEye
 *   5. 本地感知哈希索引（离线测试用）
 *
 * 注册为插件，其他模块可通过 Registry.getEngine('saucenao') 获取。
 */

import { $ } from '../util/dom.js';
import { Registry } from '../core/registry.js';

/* ──── 数据库定义（与 SauceNAO 保持一致） ──── */
export const DB_LIST = [
  { id: 5,  name: 'pixiv Images',        cat: 'art',   icon: '🎨' },
  { id: 9,  name: 'Danbooru',            cat: 'art',   icon: '🍡' },
  { id: 25, name: 'Gelbooru',            cat: 'art',   icon: '🔵' },
  { id: 26, name: 'Konachan',            cat: 'art',   icon: '🟣' },
  { id: 29, name: 'Sankaku Channel',      cat: 'art',   icon: '⚪' },
  { id: 10, name: 'drawr Images',        cat: 'art',   icon: '✏️' },
  { id: 11, name: 'Nijie Images',        cat: 'art',   icon: '🖼️' },
  { id: 12, name: 'Yande.re',            cat: 'art',   icon: '🌸' },
  { id: 34, name: 'deviantArt',          cat: 'art',   icon: '🌿' },
  { id: 36, name: 'Pawoo.net',           cat: 'art',   icon: '🐾' },
  { id: 21, name: 'Anime-Pictures.net',  cat: 'art',   icon: '📷' },
  { id: 38, name: 'ArtStation',          cat: 'art',   icon: '🖌️' },
  { id: 41, name: 'Twitter',             cat: 'social', icon: '🐦' },
  { id: 44, name: 'Skeb',               cat: 'social', icon: '✉️' },
  { id: 8,  name: 'Nico Nico Seiga',     cat: 'jp',    icon: '📺' },
  { id: 33, name: 'bcy.net Illust',      cat: 'cn',    icon: '🀄' },
  { id: 42, name: 'Kemono',             cat: 'social', icon: '🐺' },
  { id: 37, name: 'Madokami (Manga)',    cat: 'manga',  icon: '📖' },
  { id: 39, name: 'MangaDex',            cat: 'manga',  icon: '📚' },
  { id: 6,  name: 'DoujinshiDB',         cat: 'doujin', icon: '📕' },
  { id: 2,  name: 'H-Magazines',         cat: 'nsfw',  icon: '🔞' },
  { id: 3,  name: 'H-Game CG',           cat: 'nsfw',  icon: '🔞' },
  { id: 31, name: 'FAKKU',               cat: 'nsfw',  icon: '🔞' },
  { id: 15, name: 'Shutterstock',        cat: 'stock',  icon: '📸' },
  { id: 16, name: 'Anime',               cat: 'media',  icon: '🎬' },
  { id: 17, name: 'H-Anime',             cat: 'nsfw',  icon: '🔞' },
  { id: 18, name: 'Movies',              cat: 'media',  icon: '🎥' },
  { id: 19, name: 'Shows',               cat: 'media',  icon: '📡' },
  { id: 20, name: '2D-Market',           cat: 'other',  icon: '🏪' },
  { id: 22, name: 'MediBang',            cat: 'other',  icon: '🖊️' },
  { id: 23, name: 'e621.net',            cat: 'nsfw',  icon: '🔞' },
  { id: 28, name: 'Idol Complex',        cat: 'nsfw',  icon: '🔞' },
  { id: 32, name: 'PortalGraphics.net',  cat: 'other',  icon: '🖥️' },
  { id: 35, name: 'FurAffinity',         cat: 'nsfw',  icon: '🔞' },
  { id: 40, name: 'Furry Network',       cat: 'nsfw',  icon: '🔞' },
  { id: 1,  name: 'H-Misc (nH)',         cat: 'nsfw',  icon: '🔞' },
  { id: 24, name: 'H-Misc (eH)',         cat: 'nsfw',  icon: '🔞' },
];

/** 构建数据库查询字符串（SauceNAO API 的 dbs 参数用位掩码） */
export function buildDbMask(selectedIds) {
  return selectedIds.reduce((mask, id) => mask | (1 << id), 0);
}

/* ──── 图片哈希（客户端感知哈希） ──── */

/**
 * 从图片元素计算平均哈希（aHash）
 * 返回 64-bit 十六进制字符串
 */
export function computeAHash(img) {
  const canvas = document.createElement('canvas');
  const size = 8;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;

  // 计算平均灰度
  const grays = [];
  for (let i = 0; i < data.length; i += 4) {
    grays.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  const avg = grays.reduce((a, b) => a + b, 0) / grays.length;

  // 构建哈希
  let hash = 0n;
  for (let i = 0; i < 64; i++) {
    if (grays[i] > avg) hash |= (1n << BigInt(63 - i));
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * 从图片元素计算感知哈希（pHash）
 * 使用 DCT 低频系数
 */
export function computePHash(img) {
  const size = 32;
  const smallSize = 8;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, size, size);
  const pixels = ctx.getImageData(0, 0, size, size).data;

  // 转换为灰度并缩小到 8x8
  const gray = new Array(smallSize * smallSize).fill(0);
  for (let y = 0; y < smallSize; y++) {
    for (let x = 0; x < smallSize; x++) {
      let sum = 0;
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 4; dx++) {
          const idx = ((y * 4 + dy) * size + (x * 4 + dx)) * 4;
          sum += 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
        }
      }
      gray[y * smallSize + x] = sum / 16;
    }
  }

  // DCT
  const dct = new Array(smallSize * smallSize).fill(0);
  const piOverN = Math.PI / smallSize;
  for (let u = 0; u < smallSize; u++) {
    for (let v = 0; v < smallSize; v++) {
      let sum = 0;
      for (let x = 0; x < smallSize; x++) {
        for (let y = 0; y < smallSize; y++) {
          sum += gray[y * smallSize + x]
            * Math.cos(piOverN * (x + 0.5) * u)
            * Math.cos(piOverN * (y + 0.5) * v);
        }
      }
      dct[v * smallSize + u] = sum * (u === 0 ? 1 / Math.SQRT2 : 1) * (v === 0 ? 1 / Math.SQRT2 : 1) / 4;
    }
  }

  // 用低频 8x8 区域（跳过 DC）
  const lowFreq = [];
  for (let y = 0; y < smallSize; y++) {
    for (let x = 0; x < smallSize; x++) {
      if (x === 0 && y === 0) continue; // skip DC
      lowFreq.push(dct[y * smallSize + x]);
    }
  }
  const median = [...lowFreq].sort((a, b) => a - b)[Math.floor(lowFreq.length / 2)];

  let hash = 0n;
  for (let i = 0; i < lowFreq.length && i < 64; i++) {
    if (lowFreq[i] > median) hash |= (1n << BigInt(63 - i));
  }
  return hash.toString(16).padStart(16, '0');
}

/** 计算两个十六进制哈希字符串的汉明距离 */
export function hammingDistance(h1, h2) {
  const a = BigInt('0x' + h1);
  const b = BigInt('0x' + h2);
  let xor = a ^ b;
  let dist = 0;
  while (xor > 0n) {
    dist++;
    xor &= (xor - 1n);
  }
  return dist;
}

/* ──── 搜索后端 ──── */

class SauceNAOEngine {
  constructor() {
    this.apiKey = null;
    this.baseUrl = 'https://saucenao.com/search.php';
    this.indexedHashes = [];
    this.searchUrl = '/api/saucenao/search';
    this.statusUrl = '/api/saucenao/status';
  }

  /** 设置 SauceNAO API key */
  setApiKey(key) { this.apiKey = key; }

  /** 服务端搜索能力探测（有没有 Edge/Chrome 可用） */
  async probe() {
    try {
      const r = await fetch(this.statusUrl);
      return await r.json();
    } catch {
      return { ok: false, browser: null };
    }
  }

  /**
   * 通过本站服务端执行 SauceNAO 真实搜索。
   * 服务端用无头 Edge(CDP) 打开 saucenao.com 塞图提交（绕过 TLS 指纹阻断），
   * 返回结构化 JSON。一次约 10~25 秒。
   * @param {File|Blob} file
   * @returns {Promise<{ok:boolean, count:number, elapsedMs:number, results:Array}>}
   */
  async searchViaServer(file) {
    const dataUrl = await blobToDataUrl(file);

    const resp = await fetch(this.searchUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl, mime: file.type || 'image/jpeg' }),
    });

    let data = null;
    try { data = await resp.json(); } catch { /* 非 JSON 响应 */ }

    if (!resp.ok || !data || data.ok === false) {
      const msg = data?.error || `服务端搜索失败 (HTTP ${resp.status})`;
      throw new Error(msg);
    }
    return data;
  }

  /**
   * trace.moe 番剧场景搜索（经本站服务端转发；国内直连，不依赖代理）。
   * 动画截图 → 是哪部番、第几集、第几秒，附预览图与视频片段。
   * @param {File|Blob} file
   * @returns {Promise<{ok:boolean, count:number, elapsedMs:number, quota:number, quotaUsed:number, results:Array}>}
   */
  async searchTrace(file) {
    const dataUrl = await blobToDataUrl(file);
    const resp = await fetch('/api/trace/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl, mime: file.type || 'image/jpeg' }),
    });
    let data = null;
    try { data = await resp.json(); } catch { /* 非 JSON */ }
    if (!resp.ok || !data || data.ok === false) {
      throw new Error(data?.error || `trace.moe 搜索失败 (HTTP ${resp.status})`);
    }
    return data;
  }

  /* ──── 「新标签页打开」辅助入口 ────
   * 这些站点自己没法替用户上传（需要公网可达的图片 URL 或人工操作），
   * 所以只负责把站点开在新标签页，由用户的浏览器（走系统代理）完成搜索。
   */

  openGoogleLens() { window.open('https://lens.google.com/', '_blank'); }
  openTinEye() { window.open('https://tineye.com/', '_blank'); }
  openSauceNAOWeb() { window.open('https://saucenao.com/', '_blank'); }
  openAscii2d() { window.open('https://ascii2d.net/', '_blank'); }
  openYandex() { window.open('https://yandex.com/images/', '_blank'); }
}

/* ──── 图片加载与预处理 ──── */

/** Blob/File → dataURL（base64），上传给服务端搜索用 */
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('读取图片数据失败'));
    fr.readAsDataURL(blob);
  });
}

/**
 * 客户端压缩：长边超过 maxSide 或体积超过 maxBytes 时重编码为 JPEG。
 * saucenao 上限 8MB；压小一点上传快、搜索也快，对识别精度影响可忽略。
 */
export async function compressForSearch(file, { maxSide = 2200, maxBytes = 6 * 1024 * 1024, quality = 0.9 } = {}) {
  if (file.size <= maxBytes && file.type === 'image/jpeg') {
    // 体积可接受的 JPEG 直接原样送（少一次重编码，保真度最高）
    const probe = await loadImage(file).catch(() => null);
    if (probe && Math.max(probe.naturalWidth, probe.naturalHeight) <= maxSide) return file;
  }
  const img = await loadImage(file);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
  if (!blob) return file;
  return new File([blob], (file.name || 'image').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}

/**
 * 从 File/Blob 加载为 HTMLImageElement
 */
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片加载失败'));
    };
    img.src = url;
  });
}

/**
 * 从 URL 加载图片（带 CORS 代理）
 */
export function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('无法加载图片，可能是跨域限制'));
    img.src = url;
  });
}

/* ──── 单例 ──── */

const engine = new SauceNAOEngine();

export { engine as SauceNAOEngine };
export default engine;

/* ──── 平台识别 ──── */

const PLATFORM_PATTERNS = [
  { test: /pixiv\.net|pixiv/i,          label: 'Pixiv',        icon: '🎨', color: '#0096FA' },
  { test: /twitter\.com|x\.com/i,        label: 'Twitter / X',  icon: '🐦', color: '#1DA1F2' },
  { test: /danbooru/i,                   label: 'Danbooru',     icon: '🍡', color: '#E64A19' },
  { test: /gelbooru/i,                   label: 'Gelbooru',     icon: '🔵', color: '#2196F3' },
  { test: /konachan/i,                   label: 'Konachan',     icon: '🟣', color: '#9C27B0' },
  { test: /yande\.re/i,                  label: 'Yande.re',     icon: '🌸', color: '#E91E63' },
  { test: /sankaku/i,                    label: 'Sankaku',      icon: '⚪', color: '#607D8B' },
  { test: /deviantart/i,                 label: 'DeviantArt',   icon: '🌿', color: '#05CC47' },
  { test: /artstation/i,                 label: 'ArtStation',   icon: '🖌️', color: '#13AFF0' },
  { test: /nijie/i,                      label: 'Nijie',        icon: '🖼️', color: '#FF9800' },
  { test: /nico.*seiga|nicovideo/i,      label: 'Nico Seiga',   icon: '📺', color: '#4CAF50' },
  { test: /pawoo/i,                      label: 'Pawoo',        icon: '🐾', color: '#8BC34A' },
  { test: /anime-pictures/i,             label: 'AnimePic',     icon: '📷', color: '#00BCD4' },
  { test: /e621/i,                       label: 'e621',         icon: '🦊', color: '#3F51B5' },
  { test: /furaffinity/i,                label: 'FurAffinity',  icon: '🐺', color: '#795548' },
  { test: /mangadex/i,                   label: 'MangaDex',     icon: '📚', color: '#F44336' },
  { test: /shutterstock/i,               label: 'Shutterstock', icon: '📸', color: '#FF5722' },
  { test: /skeb/i,                       label: 'Skeb',         icon: '✉️', color: '#00E5FF' },
  { test: /kemono/i,                     label: 'Kemono',       icon: '🐱', color: '#FFB74D' },
  { test: /bcy\.net/i,                   label: 'bcy.net',      icon: '🀄', color: '#E040FB' },
  { test: /madokami/i,                   label: 'Madokami',     icon: '📖', color: '#673AB7' },
  { test: /2d-market|2dmarket/i,         label: '2D-Market',    icon: '🏪', color: '#009688' },
  { test: /medibang/i,                   label: 'MediBang',     icon: '🖊️', color: '#00C853' },
  { test: /portalgraphics/i,             label: 'PortalGraphics', icon: '🖥️', color: '#607D8B' },
];

export function identifyPlatform(url, text = '') {
  const combined = `${url} ${text}`;
  for (const p of PLATFORM_PATTERNS) {
    if (p.test.test(combined)) return { label: p.label, icon: p.icon, color: p.color };
  }
  // 尝试从域名提取
  try {
    const host = new URL(url).hostname.replace('www.', '');
    return { label: host, icon: '🌐', color: '#999' };
  } catch {
    return { label: '未知来源', icon: '❓', color: '#999' };
  }
}

export function fixUrl(url, base) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) {
    try {
      const u = new URL(base);
      return u.origin + url;
    } catch { return url; }
  }
  return url;
}