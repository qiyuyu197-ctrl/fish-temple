/**
 * plugins/tools/pdf.js — 浏览器里的「排版 → PDF」（零依赖）
 * ==================================================================
 * 站点没有后端，也不打算为了导个 PDF 引一个 300KB 的第三方库。于是走浏览器
 * 自己已经有的东西：
 *
 *   ① 排版：把内容交给 HTML/CSS 引擎排（换行、表格、中文字体都由它负责）
 *   ② 成像：`<svg><foreignObject>` 把这一页「拍」进 `<canvas>`，导出 JPEG
 *   ③ 封装：手写 PDF 骨架，一页一张图（/DCTDecode，图片数据原样塞进流里）
 *
 * 为什么不直接写字？——PDF 要显示中文，要么内嵌一份 CJK 字体（几 MB，还得自己做
 * 子集化），要么指望阅读器自己有字体（不保证，手机上经常变空白）。让浏览器先把
 * 字画成像素，是最不容易"在别人电脑上打开是空白"的做法。
 *
 * 代价写清楚：**PDF 里的文字不能选中、不能搜索**，体积约 200–400KB/页。
 * 要可选中文字的 PDF，用系统打印（浏览器打印 → 另存为 PDF）更合适。
 *
 * 分页：文档按**块边界**切（段落/标题/表格不会被拦腰截断，除非它自己比一页还高）。
 */

const DOC_FONT = "'Microsoft YaHei','PingFang SC','Hiragino Sans GB','Noto Sans SC','Source Han Sans SC',sans-serif";

/** 96dpi 下的 A4（210×297mm） */
export const A4 = { width: 794, height: 1123 };
/** 页脚（文件名 / 页码）占掉的高度 */
const FOOTER_H = 34;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------------- 编码小工具 ---------------- */

const encoder = new TextEncoder();

/** UTF-8 字符串 → base64（分块，避免超长参数把调用栈撑爆） */
export function base64Utf8(str) {
  const bytes = encoder.encode(str);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

/** PDF 文本串：UTF-16BE + BOM 的十六进制写法，中文标题也不会乱码 */
function pdfHexText(str) {
  let hex = 'FEFF';
  for (const ch of String(str || '')) {
    const cp = ch.codePointAt(0);
    if (cp > 0xffff) {
      const v = cp - 0x10000;
      hex += (0xd800 + (v >> 10)).toString(16).padStart(4, '0');
      hex += (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0');
    } else {
      hex += cp.toString(16).padStart(4, '0');
    }
  }
  return hex.toUpperCase();
}

/* ---------------- 页面骨架 ---------------- */

const docCss = ({ fontSize = 15, color = '#232323', lineHeight = 1.72 } = {}) =>
  `position:absolute;left:0;top:0;font-family:${DOC_FONT};font-size:${fontSize}px;`
  + `line-height:${lineHeight};color:${color};word-wrap:break-word;overflow-wrap:break-word;`;

function pageShell({ width, height, background = '#ffffff' }) {
  const el = document.createElement('div');
  el.setAttribute('style', `position:relative;width:${width}px;height:${height}px;overflow:hidden;background:${background};`);
  return el;
}

function footerNode(title, index, count, padding) {
  const el = document.createElement('div');
  el.setAttribute('style', `position:absolute;left:${padding}px;right:${padding}px;bottom:${Math.round(padding * 0.45)}px;`
    + `height:14px;font-family:${DOC_FONT};font-size:10px;line-height:14px;color:#9a9a9a;`);
  el.innerHTML = `<span style="position:absolute;left:0;top:0;max-width:80%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(title)}</span>`
    + `<span style="position:absolute;right:0;top:0">${index} / ${count}</span>`;
  return el;
}

/** 等所有图片解码完：否则量高度时图片还没占位，分页会算错 */
async function imagesReady(root) {
  const imgs = [...root.querySelectorAll('img')];
  await Promise.all(imgs.map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve())));
}

/* ---------------- 一页 → 一张 JPEG ---------------- */

/**
 * 把已经排好版的一页画成 JPEG。
 * @param {HTMLElement} frame 尺寸就是 PDF 页面尺寸（CSS px，96dpi）
 * @returns {Promise<{data:Uint8Array, cssWidth:number, cssHeight:number, bytes:number}>}
 */
export async function pageToJpeg(frame, { scale = 2, quality = 0.82 } = {}) {
  const cssWidth = Math.round(parseFloat(frame.style.width));
  const cssHeight = Math.round(parseFloat(frame.style.height));
  const markup = new XMLSerializer().serializeToString(frame);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cssWidth}" height="${cssHeight}" `
    + `viewBox="0 0 ${cssWidth} ${cssHeight}"><foreignObject width="100%" height="100%">${markup}</foreignObject></svg>`;

  const img = new Image();
  const loaded = new Promise((resolve) => { img.onload = () => resolve(true); img.onerror = () => resolve(false); });
  img.src = `data:image/svg+xml;base64,${base64Utf8(svg)}`;
  if (!(await loaded)) throw new Error('这一页没能交给浏览器渲染（内容里有它不认识的东西）');

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(cssWidth * scale);
  canvas.height = Math.round(cssHeight * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  canvas.width = 0;            // 立刻放掉这张画布的内存（一页 1600×2200 不小）
  canvas.height = 0;
  if (!blob) throw new Error('这一页导出失败（画布太大或浏览器拒绝了 JPEG 编码）');

  return {
    data: new Uint8Array(await blob.arrayBuffer()),
    cssWidth, cssHeight, bytes: blob.size,
    pxWidth: Math.round(cssWidth * scale), pxHeight: Math.round(cssHeight * scale),
  };
}

/* ---------------- PDF 组装 ---------------- */

/**
 * 一页一张 JPEG → 一个真正的 PDF 文件。
 * 结构：catalog → pages → (page → image XObject → content stream) × N
 * @param {Array<{data:Uint8Array, cssWidth:number, cssHeight:number}>} pages
 */
export function jpegsToPdf(pages, { title = 'document' } = {}) {
  if (!pages.length) throw new Error('没有可以写进 PDF 的页面');
  const PT = 0.75;                                  // 96dpi px → pt
  const parts = [];
  let length = 0;
  const offsets = [];
  const put = (chunk) => {
    const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
    return bytes.length;
  };

  const perPage = 3;                                // page / image / content
  const count = pages.length * perPage + 3;
  const date = new Date();
  const pad2 = (n) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`
    + `${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;

  put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  const begin = (id) => { offsets[id] = length; put(`${id} 0 obj\n`); };
  const end = () => put('\nendobj\n');

  // 1 catalog / 2 pages / 3 info
  begin(1);
  put('<< /Type /Catalog /Pages 2 0 R >>');
  end();

  begin(2);
  put(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${4 + i * perPage} 0 R`).join(' ')}] >>`);
  end();

  begin(3);
  put(`<< /Title <${pdfHexText(title)}> /Producer (fish-temple \\(tools/edit\\) in browser) /Creator (fish-temple) `
    + `/CreationDate (D:${stamp}Z) >>`);
  end();

  pages.forEach((page, i) => {
    const pageId = 4 + i * perPage;
    const imgId = pageId + 1;
    const contentId = pageId + 2;
    const w = (page.cssWidth * PT).toFixed(2);
    const h = (page.cssHeight * PT).toFixed(2);

    begin(pageId);
    put(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] `
      + `/Resources << /XObject << /Im0 ${imgId} 0 R >> /ProcSet [/PDF /ImageC] >> /Contents ${contentId} 0 R >>`);
    end();

    begin(imgId);
    put(`<< /Type /XObject /Subtype /Image /Width ${page.pxWidth} /Height ${page.pxHeight} `
      + `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.data.length} >>\nstream\n`);
    put(page.data);
    put('\nendstream');
    end();

    const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q\n`;
    begin(contentId);
    put(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`);
    end();
  });

  // 交叉引用表
  const xrefAt = length;
  put(`xref\n0 ${count + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= count; id++) put(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  put(`trailer\n<< /Size ${count + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  return new Blob(parts, { type: 'application/pdf' });
}

/* ---------------- 文档（docx 这类「一篇长文」）→ PDF ---------------- */

/**
 * @param {object} opts
 * @param {string} opts.html   已经排好结构的 HTML（块级元素平铺）
 * @param {string} [opts.title] 页脚左上角的文件名
 * @param {{width:number,height:number}} [opts.page]
 */
export async function documentToPdf({
  html, title = 'document', page = A4, padding = 64,
  fontSize = 15, color = '#232323', lineHeight = 1.72,
  scale = 2, quality = 0.82, onProgress,
}) {
  const contentW = page.width - padding * 2;
  const contentH = page.height - padding * 2 - FOOTER_H;

  const doc = document.createElement('div');
  doc.setAttribute('style', `${docCss({ fontSize, color, lineHeight })}width:${contentW}px;`);
  doc.innerHTML = html;

  const host = document.createElement('div');
  host.setAttribute('style', 'position:absolute;left:-30000px;top:0;visibility:hidden;pointer-events:none;');
  host.append(doc);
  document.body.append(host);

  try {
    await imagesReady(doc);

    // 按块边界切页：块是段落 / 标题 / 列表项 / 表格 / 图片
    const nodes = [...doc.children];
    const blocks = nodes.map((el) => ({ top: el.offsetTop, bottom: el.offsetTop + el.offsetHeight }));
    // Word 里的「分页符」：遇到就断，不管这一页还剩多少空间
    const forcedAt = nodes.filter((el) => el.hasAttribute('data-break-before')).map((el) => el.offsetTop).filter((top) => top > 1);
    const total = Math.max(doc.offsetHeight, 1);
    const cuts = [];
    let y = 0;
    while (y < total - 0.5 && cuts.length < 500) {
      const limit = y + contentH;
      let cut = 0;
      for (const b of blocks) if (b.bottom <= limit + 0.5) cut = Math.max(cut, b.bottom);
      const forced = forcedAt.find((top) => top > y + 1 && top < limit - 0.5);
      if (forced) cut = cut > 0 ? Math.min(cut, forced) : forced;
      if (cut <= y + 1) cut = Math.min(total, limit);      // 单块比一页还高：只能硬切
      cuts.push({ from: y, to: cut });
      y = cut;
    }
    if (!cuts.length) cuts.push({ from: 0, to: total });

    const pages = [];
    for (let i = 0; i < cuts.length; i++) {
      onProgress?.(i / cuts.length);
      const frame = pageShell({ width: page.width, height: page.height });
      // 版面窗口只露出「这一页的正文」：高度取本页的切点，不是整块正文区 ——
      // 否则切点之后、正文区之内的那半段会溢出到页脚上，还会在下一页再出现一次
      const clip = document.createElement('div');
      clip.setAttribute('style', `position:absolute;left:${padding}px;top:${padding}px;`
        + `width:${contentW}px;height:${Math.min(contentH, cuts[i].to - cuts[i].from)}px;overflow:hidden;`);
      doc.style.left = '0px';
      doc.style.top = `${-cuts[i].from}px`;
      clip.append(doc);
      frame.append(clip);
      frame.append(footerNode(title, i + 1, cuts.length, padding));
      pages.push(await pageToJpeg(frame, { scale, quality }));
      clip.remove();
    }
    onProgress?.(1);
    return { blob: jpegsToPdf(pages, { title }), pages: pages.length, width: page.width, height: page.height };
  } finally {
    host.remove();
  }
}

/* ---------------- 幻灯片（pptx）→ PDF ---------------- */

/**
 * @param {Array<{html:string,width:number,height:number,background?:string}>} slides
 *        每一张已经是「一页」的绝对定位布局（CSS px，96dpi）
 */
export async function slidesToPdf({ slides, title = 'slides', scale = 2, quality = 0.86, onProgress }) {
  if (!slides.length) throw new Error('这份文件里没有幻灯片');
  const pages = [];
  for (let i = 0; i < slides.length; i++) {
    onProgress?.(i / slides.length);
    const s = slides[i];
    const frame = pageShell({ width: s.width, height: s.height, background: s.background || '#ffffff' });
    frame.innerHTML = s.html;
    await imagesReady(frame);
    pages.push(await pageToJpeg(frame, { scale, quality }));
  }
  onProgress?.(1);
  return { blob: jpegsToPdf(pages, { title }), pages: pages.length, width: slides[0].width, height: slides[0].height };
}

export const Pdf = { A4, base64Utf8, pageToJpeg, jpegsToPdf, documentToPdf, slidesToPdf };
export default Pdf;
