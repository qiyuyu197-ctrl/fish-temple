/**
 * plugins/tools/docx-html.js — .docx → 一份「可以排版成 PDF 的 HTML」（零依赖）
 * ==================================================================
 * 和 `docx.js` 的分工：那个负责「docx ↔ 纯文本 / Markdown」（提大纲、喂给别的工具），
 * 这个负责「把 Word 的排版尽量原样搬出来」，唯一的消费者是 `pdf.js`。
 *
 * 读的东西比 `docx.js` 多：
 *   · 段内样式：加粗 / 斜体 / 下划线 / 删除线 / 上标下标 / 颜色 / 字号 / 字体
 *   · 段落：标题层级（Title / Subtitle / Heading1-6）、对齐、缩进、段前段后、行距
 *   · 列表：`w:numPr` + `numbering.xml`（真 Word 的编号与项目符号）也认
 *           `pStyle=List*`（python-docx / WPS 常见写法）
 *   · 表格：行列、列宽、首行加粗
 *   · 图片：`word/media/*` 直接转成 data URL（PDF 那边不联网、不许外链）
 *   · 分页符：`w:br w:type="page"` → 一个「从这里断页」的空块，交给 pdf.js
 *
 * 不做：文本框浮动位置、脚注尾注、修订留痕、EMF/WMF 图（浏览器画不出来）。
 * 这些在 PDF 里会退化成「按顺序阅读」或「跳过」，不假装还原。
 */

import { unzip } from './zip.js';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const V = 'urn:schemas-microsoft-com:vml';

const MEDIA_MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml',
};

/** Word 的长度：twip（1/20 pt）→ px（96dpi） */
const twip = (v) => Math.round((Number(v) || 0) / 15);
/** DrawingML 的 EMU → px */
const emu = (v) => Math.round((Number(v) || 0) / 9525);
/** 半磅（w:sz）→ px */
const halfPt = (v) => Math.round(((Number(v) || 0) / 2) * (96 / 72) * 10) / 10;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const kids = (node, name) => (node ? [...node.children].filter((c) => c.localName === name) : []);
const kid = (node, name) => kids(node, name)[0] || null;
const attr = (node, name) => (node ? node.getAttribute(`w:${name}`) ?? node.getAttributeNS(W, name) : null);
const val = (node) => (node ? node.getAttribute('w:val') : null);

const on = (node) => {
  if (!node) return false;
  const v = val(node);
  return !(v === '0' || v === 'false' || v === 'off');
};

const parseXml = (bytes) => {
  const doc = new DOMParser().parseFromString(new TextDecoder('utf-8').decode(bytes), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('XML 解析失败（文件可能损坏）');
  return doc;
};

function bytesToBase64(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

function mediaDataUrl(name, bytes) {
  const mime = MEDIA_MIME[String(name).toLowerCase().replace(/^.*\./, '')];
  return mime ? `data:${mime};base64,${bytesToBase64(bytes)}` : '';
}

function resolvePath(baseDir, target) {
  if (!target) return '';
  const raw = target.startsWith('/') ? target.slice(1) : `${baseDir}/${target}`;
  const out = [];
  for (const seg of raw.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return out.join('/');
}

/* ---------------- 关系表 / 编号表 ---------------- */

async function loadRels(files, relsPath, baseDir) {
  const map = new Map();
  const bytes = files.get(relsPath);
  if (!bytes) return map;
  for (const rel of parseXml(bytes).getElementsByTagName('Relationship')) {
    const id = rel.getAttribute('Id');
    const target = rel.getAttribute('Target');
    if (id && target && !/^https?:/i.test(target)) map.set(id, resolvePath(baseDir, target));
  }
  return map;
}

/** numbering.xml → numId → [{ fmt, text, start, indent, hanging }] */
async function loadNumbering(files) {
  const bytes = files.get('word/numbering.xml');
  const map = new Map();
  if (!bytes) return map;

  const doc = parseXml(bytes);
  const abstract = new Map();
  for (const an of doc.getElementsByTagNameNS(W, 'abstractNum')) {
    const levels = [];
    for (const lvl of kids(an, 'lvl')) {
      const ind = kid(kid(lvl, 'pPr'), 'ind');
      levels[Number(lvl.getAttribute('w:ilvl')) || 0] = {
        fmt: val(kid(lvl, 'numFmt')) || 'bullet',
        text: val(kid(lvl, 'lvlText')) || '',
        start: Number(val(kid(lvl, 'start'))) || 1,
        left: twip(attr(ind, 'left') || attr(ind, 'start')),
        hanging: twip(attr(ind, 'hanging')),
      };
    }
    abstract.set(an.getAttribute('w:abstractNumId'), levels);
  }
  for (const num of doc.getElementsByTagNameNS(W, 'num')) {
    const levels = abstract.get(val(kid(num, 'abstractNumId'))) || [];
    map.set(num.getAttribute('w:numId'), levels);
  }
  return map;
}

/* ---------------- 段内样式 ---------------- */

const HIGHLIGHT = {
  yellow: 'fff3a0', green: 'b7f0b1', cyan: 'b7f0f0', magenta: 'f0b7f0',
  blue: 'b7c7f0', red: 'f0b7b7', darkBlue: '8fa2d8', darkRed: 'c98a8a',
  gray: 'e0e0e0', lightGray: 'f2f2f2',
};

function runStyle(rPr) {
  const css = [];
  if (on(kid(rPr, 'b'))) css.push('font-weight:600');
  if (on(kid(rPr, 'i'))) css.push('font-style:italic');

  const deco = [];
  if (on(kid(rPr, 'u'))) deco.push('underline');
  if (on(kid(rPr, 'strike')) || on(kid(rPr, 'dstrike'))) deco.push('line-through');
  if (deco.length) css.push(`text-decoration:${deco.join(' ')}`);

  const color = val(kid(rPr, 'color'));
  if (color && /^[0-9a-f]{6}$/i.test(color)) css.push(`color:#${color}`);

  const sz = val(kid(rPr, 'sz'));
  if (sz) css.push(`font-size:${halfPt(sz)}px`);

  const fonts = kid(rPr, 'rFonts');
  const face = fonts && (attr(fonts, 'eastAsia') || attr(fonts, 'ascii') || attr(fonts, 'hAnsi'));
  if (face) css.push(`font-family:'${String(face).replace(/['"]/g, '')}'`);

  const va = val(kid(rPr, 'vertAlign'));
  if (va === 'superscript') css.push('vertical-align:super;font-size:70%');
  if (va === 'subscript') css.push('vertical-align:sub;font-size:70%');

  const hl = val(kid(rPr, 'highlight'));
  if (hl && hl !== 'none') css.push(`background:#${HIGHLIGHT[hl] || 'fff3a0'}`);

  return css.join(';');
}

/** 一个 w:r → inline HTML（图片也是 inline 的） */
function runHtml(run, ctx) {
  const style = runStyle(kid(run, 'rPr'));
  const parts = [];

  for (const node of run.children) {
    const name = node.localName;
    if (name === 't') parts.push(esc(node.textContent));
    else if (name === 'tab') parts.push('<span style="display:inline-block;width:1.6em"></span>');
    else if (name === 'br' || name === 'cr') parts.push('<br />');
    else if (name === 'noBreakHyphen') parts.push('&#8209;');
    else if (name === 'drawing' || name === 'pict' || name === 'object') {
      const img = imageHtml(node, ctx);
      if (img) parts.push(img);
    }
  }

  const html = parts.join('');
  return style && html ? `<span style="${style}">${html}</span>` : html;
}

/** w:drawing / w:pict → <img>（拿不到图就返回空串，不塞破图标） */
function imageHtml(node, ctx) {
  let embed = '';
  const blip = node.getElementsByTagNameNS(A, 'blip')[0];
  if (blip) embed = blip.getAttributeNS(R, 'embed') || blip.getAttribute('r:embed') || '';
  if (!embed) {
    const data = node.getElementsByTagNameNS(V, 'imagedata')[0];
    if (data) embed = data.getAttributeNS(R, 'id') || data.getAttribute('r:id') || '';
  }
  if (!embed) return '';

  const extent = node.getElementsByTagNameNS(WP, 'extent')[0] || node.getElementsByTagNameNS(WP, 'ext')[0];
  let width = extent ? emu(extent.getAttribute('cx')) : 0;
  let height = extent ? emu(extent.getAttribute('cy')) : 0;
  if (!width) width = 480;
  if (!height) height = Math.round(width * 0.66);

  const path = ctx.rels.get(embed);
  const bytes = path && ctx.files.get(path);
  if (!bytes) return '';
  const url = mediaDataUrl(path, bytes);
  if (!url) return '';

  if (width > ctx.contentWidth) {
    height = Math.round((height * ctx.contentWidth) / width);
    width = ctx.contentWidth;
  }
  return `<img src="${url}" alt="" style="width:${width}px;height:${height}px;vertical-align:bottom" />`;
}

/* ---------------- 段落 ---------------- */

const HEADING_SIZE = { 1: 26, 2: 22, 3: 19, 4: 17, 5: 16, 6: 15 };
const ALIGN = { start: 'left', end: 'right', both: 'justify', distribute: 'justify', center: 'center', left: 'left', right: 'right' };

function inlineOf(p, ctx) {
  const parts = [];
  for (const node of p.children) {
    const name = node.localName;
    if (name === 'r') parts.push(runHtml(node, ctx));
    else if (name === 'hyperlink' || name === 'ins' || name === 'smartTag' || name === 'fldSimple') {
      for (const child of node.children) if (child.localName === 'r') parts.push(runHtml(child, ctx));
    } else if (name === 'sdt') {
      const content = kid(node, 'sdtContent');
      if (content) for (const child of content.children) if (child.localName === 'r') parts.push(runHtml(child, ctx));
    }
  }
  return parts.join('');
}

/* ---- 列表编号 ---- */

const roman = (n) => {
  const map = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
    [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let out = '';
  let rest = n;
  for (const [v, s] of map) while (rest >= v) { out += s; rest -= v; }
  return out;
};

const letters = (n, upper) => {
  let s = '';
  let rest = n;
  while (rest > 0) { const r = (rest - 1) % 26; s = String.fromCharCode(97 + r) + s; rest = Math.floor((rest - 1) / 26); }
  return upper ? s.toUpperCase() : s;
};

function nextNumber(ctx, numId, ilvl, start) {
  const key = `${numId}:${ilvl}`;
  const n = (ctx.counters.get(key) ?? (start - 1)) + 1;
  ctx.counters.set(key, n);
  for (const k of [...ctx.counters.keys()]) {
    const [id, lvl] = k.split(':');
    if (id === numId && Number(lvl) > ilvl) ctx.counters.delete(k);   // 回到上层，下层重新数
  }
  return n;
}

function listMarker(ctx, numPr, style) {
  const numId = numPr ? (val(kid(numPr, 'numId')) || '0') : '0';
  const ilvl = numPr ? Number(val(kid(numPr, 'ilvl')) || 0) : 0;
  const levels = numId !== '0' ? ctx.numbering.get(numId) : null;
  const level = levels?.[ilvl] || null;

  let fmt = level?.fmt || '';
  if (!fmt) {
    if (/^list/i.test(style)) fmt = /number/i.test(style) ? 'decimal' : 'bullet';
    else if (numPr) fmt = 'bullet';
    else return null;
  }
  if (fmt === 'none') return null;

  let marker;
  if (fmt === 'bullet') marker = level?.text || '•';
  else {
    const n = nextNumber(ctx, numId || 'style', ilvl, level?.start || 1);
    const body = fmt.includes('Letter') ? letters(n, fmt.startsWith('upper'))
      : fmt.includes('Roman') ? roman(n)
        : String(n);
    marker = (level?.text || '%1.').replace(/%\d/g, body);
  }

  return {
    marker,
    ilvl,
    left: level?.left || 0,
    hanging: level?.hanging || 0,
    numbered: fmt !== 'bullet',
  };
}

function paragraphHtml(p, ctx) {
  const pPr = kid(p, 'pPr');
  const style = val(kid(pPr, 'pStyle')) || '';
  const heading = /^heading([1-6])$/i.exec(style);
  const isTitle = /^title$/i.test(style);
  const isSubtitle = /^subtitle$/i.test(style);
  const numPr = kid(pPr, 'numPr');

  const inner = inlineOf(p, ctx);
  const text = (p.textContent || '').trim();
  const css = [];

  const jc = val(kid(pPr, 'jc'));
  if (jc) css.push(`text-align:${ALIGN[jc] || 'left'}`);

  const spacing = kid(pPr, 'spacing');
  const before = twip(attr(spacing, 'before'));
  const after = twip(attr(spacing, 'after'));
  const line = Number(attr(spacing, 'line')) || 0;
  const rule = attr(spacing, 'lineRule') || 'auto';
  if (line && rule === 'auto') css.push(`line-height:${(line / 240).toFixed(2)}`);
  else if (line && rule === 'exact') css.push(`line-height:${Math.max(1, Math.round((line / 20) * (96 / 72)))}px`);

  const ind = kid(pPr, 'ind');
  const left = twip(attr(ind, 'left') || attr(ind, 'start'));
  const hanging = twip(attr(ind, 'hanging'));
  const first = twip(attr(ind, 'firstLine'));

  if (heading || isTitle) {
    const level = heading ? Number(heading[1]) : 1;
    const size = isTitle ? 30 : HEADING_SIZE[level];
    css.push(`font-size:${size}px`, 'font-weight:700', 'line-height:1.35',
      `padding-top:${level <= 1 ? 2 : 8}px`, `padding-bottom:${isTitle ? 16 : level === 1 ? 10 : 8}px`);
    if (left) css.push(`padding-left:${left}px`);
  } else if (isSubtitle) {
    css.push('font-size:19px', 'color:#555', 'padding-bottom:14px');
  } else {
    const li = listMarker(ctx, numPr, style);
    css.push(`font-size:${ctx.fontSize}px`, `padding-bottom:${Math.max(after, 6)}px`);
    if (before) css.push(`padding-top:${before}px`);

    if (li) {
      const baseLeft = left || li.left || 24 + li.ilvl * 18;
      const indent = hanging || li.hanging || 18;
      css.push(`padding-left:${baseLeft}px`, `text-indent:-${indent}px`);
      return `<div style="${css.join(';')}">${esc(li.marker)}&nbsp;${inner}</div>`;
    }

    if (left) css.push(`padding-left:${left}px`);
    if (hanging) css.push(`text-indent:-${hanging}px`);
    else if (first) css.push(`text-indent:${first}px`);
  }

  if (!text && !inner.includes('<img')) return `<div style="height:${Math.round(ctx.fontSize * 1.55)}px"></div>`;
  return `<div style="${css.join(';')}">${inner}</div>`;
}

/* ---------------- 表格 ---------------- */

function tableHtml(tbl, ctx) {
  const rows = kids(tbl, 'tr');
  if (!rows.length) return '';

  const widths = kids(kid(tbl, 'tblGrid'), 'gridCol').map((c) => Number(attr(c, 'w')) || 0);
  const total = widths.reduce((a, b) => a + b, 0);
  const colgroup = total
    ? `<colgroup>${widths.map((w) => `<col style="width:${((w / total) * 100).toFixed(2)}%" />`).join('')}</colgroup>`
    : '';

  const body = rows.map((tr, rowIndex) => {
    const cells = kids(tr, 'tc').map((tc) => {
      const span = Number(val(kid(kid(tc, 'tcPr'), 'gridSpan'))) || 1;
      const paras = kids(tc, 'p').map((p) => inlineOf(p, ctx)).filter((html) => html.trim());
      const css = ['border:1px solid #d0d0d0', 'padding:5px 7px', 'vertical-align:top',
        `font-size:${ctx.fontSize - 1}px`, 'line-height:1.55'];
      if (rowIndex === 0) css.push('background:#f5f5f2', 'font-weight:600');
      return `<td${span > 1 ? ` colspan="${span}"` : ''} style="${css.join(';')}">${paras.join('<br />') || '&nbsp;'}</td>`;
    });
    return `<tr>${cells.join('')}</tr>`;
  }).join('');

  return `<table style="border-collapse:collapse;width:100%;table-layout:fixed;padding-bottom:10px">${colgroup}${body}</table>`;
}

/* ---------------- 文档 ---------------- */

const blockHtml = (node, ctx) => {
  if (node.localName === 'tbl') return tableHtml(node, ctx);
  if (node.localName === 'sdt') {
    const content = kid(node, 'sdtContent');
    return content ? [...content.children].map((c) => blockHtml(c, ctx)).join('') : '';
  }
  return '';
};

/**
 * .docx → 可以交给 pdf.js 的 HTML 片段（块级元素平铺，方便按块分页）
 * @param {Blob|ArrayBuffer|Uint8Array} input
 */
export async function docxToHtml(input, { contentWidth = 666, fontSize = 15 } = {}) {
  const files = await unzip(input);
  const xmlBytes = files.get('word/document.xml');
  if (!xmlBytes) throw new Error('这个 docx 里找不到 word/document.xml（可能是 .doc 老格式或已损坏）');

  const [rels, numbering] = await Promise.all([
    loadRels(files, 'word/_rels/document.xml.rels', 'word'),
    loadNumbering(files),
  ]);
  const doc = parseXml(xmlBytes);
  const body = doc.getElementsByTagNameNS(W, 'body')[0] || doc.documentElement;
  const ctx = { files, rels, numbering, contentWidth, fontSize, counters: new Map() };

  const parts = [];
  let paragraphs = 0;
  for (const node of body.children) {
    const name = node.localName;
    if (name === 'sectPr') continue;

    if (name === 'p') {
      const pageBreak = [...node.getElementsByTagNameNS(W, 'br')].some((br) => br.getAttribute('w:type') === 'page');
      if (pageBreak) parts.push('<div data-break-before="1" style="height:0"></div>');
      parts.push(paragraphHtml(node, ctx));
      paragraphs += 1;
    } else if (name === 'tbl' || name === 'sdt') {
      parts.push(blockHtml(node, ctx));
    }
  }

  const html = parts.filter(Boolean).join('');
  return { html, images: (html.match(/<img /g) || []).length, paragraphs };
}

export const DocxHtml = { docxToHtml };
export default DocxHtml;
