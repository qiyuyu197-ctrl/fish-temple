/**
 * plugins/tools/image.js — 图片格式转换 / 缩放 / 压缩（零依赖）
 * ==================================================================
 * 全部走浏览器的 canvas：解码用 createImageBitmap，编码用 canvas.toBlob。
 * 能读的格式 = 浏览器能解码的（png / jpg / webp / gif 首帧 / bmp / avif 视版本而定）；
 * 能写的格式 = canvas 支持的编码（png / jpeg / webp；avif 目前 Chrome 不提供编码）。
 *
 * 两个容易踩的点，这里都处理了：
 *   · 转 JPEG 没有 alpha —— 必须先把透明区域铺成底色，否则透明会变黑
 *   · EXIF 方向 —— createImageBitmap({imageOrientation:'from-image'}) 让它自动摆正
 */

export const WRITABLE = ['image/jpeg', 'image/png', 'image/webp'];

export const EXT_OF = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const FORMAT_LABEL = {
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/webp': 'WEBP',
};

const baseName = (name) => String(name || 'image').replace(/\.[^.]+$/, '') || 'image';

/** 解码成 ImageBitmap；顺带拿到原始尺寸 */
export async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch { /* 老浏览器/个别格式走下面的 img 兜底 */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error('这个文件浏览器解不开（可能不是图片，或格式不支持）'));
      img.src = url;
    });
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

const sizeOf = (src) => ({ width: src.width || src.naturalWidth, height: src.height || src.naturalHeight });

/**
 * 转换一张图片。
 * @param {File|Blob} file
 * @param {{format?: string, quality?: number, maxEdge?: number, background?: string}} opts
 * @returns {Promise<{blob:Blob, name:string, width:number, height:number, from:number, to:number}>}
 */
export async function convertImage(file, { format = 'image/jpeg', quality = 0.9, maxEdge = 0, background = '#ffffff' } = {}) {
  const src = await decodeImage(file);
  const { width: sw, height: sh } = sizeOf(src);
  if (!sw || !sh) throw new Error('读不到图片尺寸');

  let w = sw;
  let h = sh;
  if (maxEdge > 0 && Math.max(sw, sh) > maxEdge) {
    const k = maxEdge / Math.max(sw, sh);
    w = Math.max(1, Math.round(sw * k));
    h = Math.max(1, Math.round(sh * k));
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // JPEG 没有透明通道：先铺底色再画，避免透明区域变成黑色
  if (format === 'image/jpeg' || format === 'image/webp') {
    ctx.fillStyle = background || '#ffffff';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(src, 0, 0, w, h);
  if (src.close) src.close();

  const blob = await new Promise((res, rej) => {
    canvas.toBlob((b) => (b ? res(b) : rej(new Error(`浏览器无法编码 ${format}`))), format, quality);
  });

  return {
    blob,
    name: `${baseName(file.name)}.${EXT_OF[format] || 'bin'}`,
    width: w,
    height: h,
    from: file.size || 0,
    to: blob.size,
  };
}

/** 生成缩略图（dataURL，给列表用） */
export async function thumbnail(file, edge = 96) {
  const r = await convertImage(file, { format: 'image/jpeg', quality: 0.6, maxEdge: edge });
  return URL.createObjectURL(r.blob);
}

export const humanSize = (bytes) => {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
};

export const ImageTools = { convertImage, decodeImage, thumbnail, humanSize, WRITABLE, EXT_OF, FORMAT_LABEL };
export default ImageTools;
