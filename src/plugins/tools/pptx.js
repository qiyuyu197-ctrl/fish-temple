/**
 * plugins/tools/pptx.js — .pptx → 一页一页的 HTML（给 pdf.js 用，零依赖）
 * ==================================================================
 * `.pptx` 也是一个 ZIP：`ppt/presentation.xml` 说明幻灯片尺寸与顺序，
 * 每页是 `ppt/slides/slideN.xml`，里面是一堆绝对定位的「形状」。
 * 所以「转成 PDF」在这里 = 「把形状按坐标摆成一页 HTML」，排版交给浏览器。
 *
 * 还原到什么程度（先说清楚，免得期待错）：
 *   能：文本框（位置 / 字号 / 粗斜体 / 颜色 / 对齐 / 项目符号 / 垂直居中）、
 *       图片、表格、纯色背景、组合（坐标逐层换算）、占位符继承
 *       （页里没写坐标时，从版式 / 母版里找）
 *   不能：图表 / SmartArt / 动画 / 渐变与阴影 / 3D / 艺术字 / 字距微调
 *
 * 字号、颜色、项目符号的默认值来自「母版 txStyles + 版式 lstStyle + 页内覆盖」，
 * 少了这条链，标题会变成 15px 小黑字 —— 那就不叫"转成 PDF"了。
 */

import { unzip } from './zip.js';

const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const CJK = "'Microsoft YaHei','PingFang SC','Hiragino Sans GB','Noto Sans SC',sans-serif";
const EMU = 9525;                 // 1px = 9525 EMU（96dpi）
const px = (v) => (Number(v) || 0) / EMU;
const round = (n) => Math.round(n * 10) / 10;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const kids = (node, name) => [...(node?.children || [])].filter((c) => c.localName === name);
const kid = (node, name) => kids(node, name)[0] || null;
const attrNum = (node, name) => (node && node.hasAttribute(name) ? Number(node.getAttribute(name)) : null);

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

const MEDIA_MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml',
};
const mediaUrl = (path, bytes) => {
  const mime = MEDIA_MIME[String(path).toLowerCase().replace(/^.*\./, '')];
  return mime && bytes ? `data:${mime};base64,${bytesToBase64(bytes)}` : '';
};

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

/** rels → Map<Id, {path, type}> */
function loadRels(files, relsPath, baseDir) {
  const map = new Map();
  const bytes = files.get(relsPath);
  if (!bytes) return map;
  for (const rel of parseXml(bytes).getElementsByTagName('Relationship')) {
    const id = rel.getAttribute('Id');
    const target = rel.getAttribute('Target');
    if (!id || !target || rel.getAttribute('TargetMode') === 'External') continue;
    map.set(id, { path: resolvePath(baseDir, target), type: rel.getAttribute('Type') || '' });
  }
  return map;
}

/* ---------------- 颜色 ---------------- */

const hex2rgb = (hex) => {
  const h = String(hex || '').replace('#', '');
  return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
};
const rgb2hex = (rgb) => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

/** schemeClr 上的 tint / shade / lumMod / lumOff：近似成「往白 / 黑混」 */
function adjust(hex, el) {
  let [r, g, b] = hex2rgb(hex);
  const tint = attrNum(kid(el, 'tint'), 'val');
  const shade = attrNum(kid(el, 'shade'), 'val');
  const lumMod = attrNum(kid(el, 'lumMod'), 'val');
  const lumOff = attrNum(kid(el, 'lumOff'), 'val');
  if (tint != null) {
    const t = 1 - tint / 100000;
    r = r * (1 - t) + 255 * t; g = g * (1 - t) + 255 * t; b = b * (1 - t) + 255 * t;
  }
  if (shade != null) { const s = shade / 100000; r *= s; g *= s; b *= s; }
  if (lumMod != null || lumOff != null) {
    const m = lumMod != null ? lumMod / 100000 : 1;
    const o = lumOff != null ? (lumOff / 100000) * 255 : 0;
    r = r * m + o; g = g * m + o; b = b * m + o;
  }
  return rgb2hex([r, g, b]);
}

const PRESET_COLOURS = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff',
  yellow: '#ffff00', gray: '#808080', grey: '#808080', orange: '#ffa500', purple: '#800080',
};

const themeColour = (theme, scheme) => theme.colors[theme.map[scheme] || scheme] || theme.colors[scheme] || '000000';

/** a:srgbClr / a:schemeClr / a:prstClr → CSS 颜色 */
function colourOf(clr, theme) {
  if (!clr) return '';
  if (clr.localName === 'srgbClr') return adjust(`#${clr.getAttribute('val') || '000000'}`, clr);
  if (clr.localName === 'schemeClr') return adjust(`#${themeColour(theme, clr.getAttribute('val') || 'tx1')}`, clr);
  if (clr.localName === 'prstClr') return PRESET_COLOURS[clr.getAttribute('val')] || '#000000';
  return '';
}

/** a:solidFill 等 → CSS 颜色 */
function fillColour(fill, theme) {
  if (!fill) return '';
  for (const name of ['srgbClr', 'schemeClr', 'prstClr']) {
    const clr = kid(fill, name);
    if (clr) return colourOf(clr, theme);
  }
  return '';
}

/** 形状填充：noFill → transparent，渐变退化成第一段颜色 */
function shapeFill(spPr, theme) {
  if (!spPr) return '';
  if (kid(spPr, 'noFill')) return 'transparent';
  const solid = kid(spPr, 'solidFill');
  if (solid) return fillColour(solid, theme);
  const grad = kid(spPr, 'gradFill');
  if (grad) {
    const stop = grad.getElementsByTagNameNS(A, 'gs')[0];
    const clr = stop ? kid(stop, 'srgbClr') || kid(stop, 'schemeClr') : null;
    return colourOf(clr, theme);
  }
  return '';
}

/* ---------------- 母版：字号 / 颜色 / 项目符号 ---------------- */

function parseRunProps(rPr, theme) {
  if (!rPr) return {};
  const out = {};
  const sz = attrNum(rPr, 'sz');
  if (sz != null) out.size = sz / 100;                       // 百分之一磅 → pt
  if (rPr.hasAttribute('b')) out.bold = rPr.getAttribute('b') !== '0';
  if (rPr.hasAttribute('i')) out.italic = rPr.getAttribute('i') !== '0';
  if (rPr.hasAttribute('u') && rPr.getAttribute('u') !== 'none') out.underline = true;
  if (rPr.hasAttribute('strike') && rPr.getAttribute('strike') !== 'noStrike') out.strike = true;
  const fill = kid(rPr, 'solidFill');
  if (fill) {
    const c = fillColour(fill, theme);
    if (c) out.colour = c;
  }
  const latin = kid(rPr, 'latin');
  if (latin && latin.getAttribute('typeface')) out.font = latin.getAttribute('typeface');
  return out;
}

function parseLevels(node, theme) {
  const levels = new Array(10).fill(null);
  if (!node) return levels;
  for (let i = 1; i <= 9; i++) {
    const lvl = kid(node, `lvl${i}pPr`);
    if (!lvl) continue;
    const buChar = kid(lvl, 'buChar');
    levels[i] = {
      marL: attrNum(lvl, 'marL') || 0,
      indent: attrNum(lvl, 'indent') || 0,
      algn: lvl.getAttribute('algn') || '',
      bullet: buChar ? (buChar.getAttribute('char') || '•') : '',
      bulletNone: !!kid(lvl, 'buNone'),
      autoNum: !!kid(lvl, 'buAutoNum'),
      ...parseRunProps(kid(lvl, 'defRPr'), theme),
    };
  }
  return levels;
}

/** 母版 → 版式 → 页内：后者覆盖前者 */
function mergeLevels(masterLevels, layoutLevels) {
  const out = new Array(10).fill(null);
  for (let i = 1; i <= 9; i++) {
    out[i] = { ...(masterLevels?.[i] || {}), ...(layoutLevels?.[i] || {}) };
  }
  return out;
}

function buildStyles(master, theme) {
  const tx = master && master.getElementsByTagNameNS(P, 'txStyles')[0];
  return {
    title: parseLevels(tx && kid(tx, 'titleStyle'), theme),
    body: parseLevels(tx && kid(tx, 'bodyStyle'), theme),
    other: parseLevels(tx && kid(tx, 'otherStyle'), theme),
  };
}

/* ---------------- 几何 ---------------- */

const IDENT = { sx: 1, sy: 1, tx: 0, ty: 0 };
const applyXfrm = (box, tf) => ({ x: tf.tx + box.x * tf.sx, y: tf.ty + box.y * tf.sy, cx: box.cx * tf.sx, cy: box.cy * tf.sy });

function xfrmOf(node) {
  const direct = kid(node, 'xfrm');                       // p:graphicFrame
  const spPr = kid(node, 'spPr');
  const xfrm = direct || (spPr && kid(spPr, 'xfrm'));
  if (!xfrm) return null;
  const off = kid(xfrm, 'off');
  const ext = kid(xfrm, 'ext');
  if (!off || !ext) return null;
  return {
    x: Number(off.getAttribute('x')) || 0,
    y: Number(off.getAttribute('y')) || 0,
    cx: Number(ext.getAttribute('cx')) || 0,
    cy: Number(ext.getAttribute('cy')) || 0,
  };
}

const placeholderOf = (shape) => {
  const nv = kid(shape, 'nvSpPr') || kid(shape, 'nvPicPr') || kid(shape, 'nvGraphicFramePr');
  return (nv && nv.getElementsByTagNameNS(P, 'ph')[0]) || null;
};

const placeholderStyleKey = (ph) => {
  const type = ph ? (ph.getAttribute('type') || 'obj') : '';
  if (type === 'title' || type === 'ctrTitle') return 'title';
  if (type === 'body' || type === 'obj' || type === 'subTitle') return 'body';
  return 'other';
};

const toGeo = (world) => ({ left: round(px(world.x)), top: round(px(world.y)), width: round(px(world.cx)), height: round(px(world.cy)) });

/* ---------------- 文字 ---------------- */

function fontSizePx(pt, scale) {
  return Math.round(((pt * 96) / 72) * scale * 10) / 10;
}

function renderRun(run, ctx, base) {
  const own = parseRunProps(kid(run, 'rPr'), ctx.theme);
  const merged = { ...base, ...own };
  const css = [];
  if (merged.size) css.push(`font-size:${fontSizePx(merged.size, ctx.scale)}px`);
  if (merged.bold) css.push('font-weight:700');
  if (merged.italic) css.push('font-style:italic');
  const deco = [];
  if (merged.underline) deco.push('underline');
  if (merged.strike) deco.push('line-through');
  if (deco.length) css.push(`text-decoration:${deco.join(' ')}`);
  if (merged.colour) css.push(`color:${merged.colour}`);
  if (merged.font) css.push(`font-family:'${String(merged.font).replace(/'/g, '')}',${CJK}`);

  const parts = [];
  for (const node of run.children) {
    const name = node.localName;
    if (name === 't') parts.push(esc(node.textContent));
    else if (name === 'br') parts.push('<br />');
    else if (name === 'tab') parts.push('&nbsp;&nbsp;&nbsp;&nbsp;');
  }
  if (!parts.length) return '';
  return `<span style="${css.join(';')}">${parts.join('')}</span>`;
}

function renderParagraph(p, ctx, levels, fallbackPx, autoIndex = 0) {
  const pPr = kid(p, 'pPr');
  const level = Math.min(9, Math.max(1, (attrNum(pPr, 'lvl') ?? 0) + 1));
  const base = { ...(levels[level] || levels[1] || {}) };

  if (pPr) {
    const algn = pPr.getAttribute('algn');
    if (algn) base.algn = algn;
    const marL = attrNum(pPr, 'marL');
    if (marL != null) base.marL = marL;
    const indent = attrNum(pPr, 'indent');
    if (indent != null) base.indent = indent;
    const buNone = kid(pPr, 'buNone');
    const buChar = kid(pPr, 'buChar');
    const buAutoNum = kid(pPr, 'buAutoNum');
    if (buNone) { base.bullet = ''; base.bulletNone = true; }
    else if (buChar) { base.bullet = buChar.getAttribute('char') || '•'; base.bulletNone = false; }
    else if (buAutoNum) { base.autoNum = true; base.bulletNone = false; }
    Object.assign(base, parseRunProps(kid(pPr, 'defRPr'), ctx.theme));
    const pct = kid(kid(pPr, 'lnSpc'), 'spcPct');
    if (pct) base.lineHeight = (attrNum(pct, 'val') || 100000) / 100000;
  }

  const runs = kids(p, 'r').map((r) => renderRun(r, ctx, base)).join('');
  const fields = kids(p, 'fld').map((f) => renderRun(f, ctx, base)).join('');
  const text = runs + fields;
  if (!text) return `<div style="height:${Math.round(fallbackPx * 1.2)}px"></div>`;

  const sizePx = base.size ? fontSizePx(base.size, ctx.scale) : fallbackPx;
  const css = [`font-size:${sizePx}px`, `line-height:${base.lineHeight || 1.2}`];
  css.push(`text-align:${{ ctr: 'center', r: 'right', just: 'justify', dist: 'justify', l: 'left' }[base.algn] || 'left'}`);
  if (base.marL) css.push(`padding-left:${px(base.marL)}px`);
  if (base.indent) css.push(`text-indent:${px(base.indent)}px`);

  const marker = base.bullet && !base.bulletNone ? `${esc(base.bullet)} ` : (autoIndex ? `${autoIndex}. ` : '');
  return `<div style="${css.join(';')}">${marker}${text}</div>`;
}

function textBoxHtml(shape, ctx, geo, styleKey, layoutPh, background) {
  const txBody = kid(shape, 'txBody');
  if (!txBody) return '';

  const bodyPr = kid(txBody, 'bodyPr');
  const layoutBodyPr = layoutPh && layoutPh.bodyPr;
  const anchor = (bodyPr && bodyPr.getAttribute('anchor')) || (layoutBodyPr && layoutBodyPr.getAttribute('anchor')) || 't';
  const inset = (name, fallback) => px((bodyPr ? attrNum(bodyPr, name) : null) ?? fallback);

  let scale = 1;
  const norm = bodyPr && kid(bodyPr, 'normAutofit');
  if (norm) {
    const fs = attrNum(norm, 'fontScale');
    if (fs) scale = fs / 100000;
  }
  const runCtx = { ...ctx, scale };

  const levels = mergeLevels(ctx.styles[styleKey], layoutPh && layoutPh.levels);
  const fallbackPx = fontSizePx(levels[1] && levels[1].size ? levels[1].size : 18, scale);

  // 自动编号（buAutoNum）：同一段文字里连续编号，遇到普通段落重新数
  let autoNo = 0;
  const paras = kids(txBody, 'p').map((p) => {
    const pPr = kid(p, 'pPr');
    const autoNum = !!(pPr && kid(pPr, 'buAutoNum'));
    autoNo = autoNum ? autoNo + 1 : 0;
    return renderParagraph(p, runCtx, levels, fallbackPx, autoNum ? autoNo : 0);
  }).join('');
  const justify = { ctr: 'center', b: 'flex-end', t: 'flex-start' }[anchor] || 'flex-start';
  const face = (styleKey === 'title' ? ctx.theme.fonts.major : ctx.theme.fonts.minor) || '';
  const nowrap = bodyPr && bodyPr.getAttribute('wrap') === 'none' ? 'white-space:nowrap;' : '';

  return `<div style="position:absolute;left:${geo.left}px;top:${geo.top}px;width:${geo.width}px;height:${geo.height}px;`
    + `padding:${inset('tIns', 45720)}px ${inset('rIns', 91440)}px ${inset('bIns', 45720)}px ${inset('lIns', 91440)}px;`
    + `box-sizing:border-box;display:flex;flex-direction:column;justify-content:${justify};overflow:visible;${nowrap}`
    + `${background ? `background:${background};` : ''}`
    + `font-family:${face ? `'${face.replace(/['"]/g, '')}',` : ''}${CJK};color:#1a1a1a">${paras}</div>`;
}

/* ---------------- 形状 ---------------- */

function shapeHtml(shape, ctx, tf) {
  const ph = placeholderOf(shape);
  let box = xfrmOf(shape);
  let layoutPh = null;
  let fromLayout = false;

  if (!box && ph) {
    // 页里没写坐标：从版式里找同名占位符（标题 / 正文都这样）
    const idx = ph.hasAttribute('idx') ? ph.getAttribute('idx') : null;
    const type = ph.getAttribute('type') || 'obj';
    layoutPh = (idx != null ? ctx.layoutPhMap.byIdx.get(idx) : null) || ctx.layoutPhMap.byType.get(type) || null;
    if (layoutPh && layoutPh.xfrm) {
      box = layoutPh.xfrm;
      fromLayout = true;
    }
  }
  if (!box) return '';

  const world = fromLayout ? box : applyXfrm(box, tf);
  const geo = toGeo(world);
  if (geo.width <= 0 || geo.height <= 0) return '';

  const fill = shapeFill(kid(shape, 'spPr'), ctx.theme);
  const background = fill && fill !== 'transparent' ? fill : '';
  const styleKey = ph ? placeholderStyleKey(ph) : 'other';
  const text = textBoxHtml(shape, ctx, geo, styleKey, layoutPh, background);
  if (text) return text;
  return background ? `<div style="position:absolute;left:${geo.left}px;top:${geo.top}px;width:${geo.width}px;height:${geo.height}px;background:${background}"></div>` : '';
}

function pictureHtml(pic, ctx, tf) {
  const box = xfrmOf(pic);
  if (!box) return '';
  const geo = toGeo(applyXfrm(box, tf));
  if (geo.width <= 0 || geo.height <= 0) return '';

  const blip = pic.getElementsByTagNameNS(A, 'blip')[0];
  const embed = blip ? (blip.getAttributeNS(R, 'embed') || blip.getAttribute('r:embed') || '') : '';
  const rel = embed ? ctx.rels.get(embed) : null;
  const url = rel ? mediaUrl(rel.path, ctx.files.get(rel.path)) : '';
  if (!url) return '';

  return `<div style="position:absolute;left:${geo.left}px;top:${geo.top}px;width:${geo.width}px;height:${geo.height}px">`
    + `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:fill;display:block" /></div>`;
}

function tableHtml(frame, ctx, tf) {
  const tbl = frame.getElementsByTagNameNS(A, 'tbl')[0];
  const box = xfrmOf(frame);
  if (!tbl || !box) return '';
  const geo = toGeo(applyXfrm(box, tf));
  if (geo.width <= 0 || geo.height <= 0) return '';

  const widths = kids(tbl, 'tblGrid').flatMap((g) => kids(g, 'gridCol').map((c) => Number(c.getAttribute('w')) || 0));
  const totalW = widths.reduce((a, b) => a + b, 0) || 1;
  const cellCtx = { ...ctx, scale: 1 };
  const cellLevel = { size: 14, marL: 0, indent: 0, bullet: '', algn: 'l' };

  const rows = kids(tbl, 'tr').map((tr, rowIndex) => {
    const rowH = Number(tr.getAttribute('h')) || 0;
    const cells = kids(tr, 'tc').map((tc) => {
      const txBody = kid(tc, 'txBody');
      const text = txBody
        ? kids(txBody, 'p').map((p) => kids(p, 'r').map((r) => renderRun(r, cellCtx, cellLevel)).join('')).join('<br />')
        : '';
      const span = Number(tc.getAttribute('gridSpan')) || 1;
      const css = `border:1px solid #b9b9b9;padding:4px 6px;vertical-align:middle;font-size:${fontSizePx(14, 1)}px;line-height:1.35;`
        + (rowIndex === 0 ? 'background:#f2f2ef;font-weight:600;' : '');
      return `<td${span > 1 ? ` colspan="${span}"` : ''} style="${css}">${text || '&nbsp;'}</td>`;
    }).join('');
    return `<tr${rowH ? ` style="height:${round(px(rowH))}px"` : ''}>${cells}</tr>`;
  }).join('');

  const colgroup = widths.length
    ? `<colgroup>${widths.map((w) => `<col style="width:${((w / totalW) * 100).toFixed(2)}%" />`).join('')}</colgroup>`
    : '';

  return `<div style="position:absolute;left:${geo.left}px;top:${geo.top}px;width:${geo.width}px;height:${geo.height}px">`
    + `<table style="border-collapse:collapse;width:100%;table-layout:fixed;font-family:${CJK};color:#111">${colgroup}${rows}</table></div>`;
}

function chartPlaceholder(frame, ctx, tf) {
  const box = xfrmOf(frame);
  if (!box) return '';
  const geo = toGeo(applyXfrm(box, tf));
  if (geo.width <= 0 || geo.height <= 0) return '';
  return `<div style="position:absolute;left:${geo.left}px;top:${geo.top}px;width:${geo.width}px;height:${geo.height}px;`
    + `border:1px dashed #c9c9c9;box-sizing:border-box;display:flex;align-items:center;justify-content:center;`
    + `font:12px ${CJK};color:#9a9a9a">图表 / 对象未转换</div>`;
}

function renderShapes(root, ctx, tf) {
  let html = '';
  for (const node of kids(root, 'sp')) html += shapeHtml(node, ctx, tf);
  for (const node of kids(root, 'pic')) html += pictureHtml(node, ctx, tf);
  for (const node of kids(root, 'graphicFrame')) {
    const uri = frameUri(node);
    html += /table/i.test(uri) ? tableHtml(node, ctx, tf) : chartPlaceholder(node, ctx, tf);
  }
  for (const node of kids(root, 'grpSp')) {
    const xfrm = kid(kid(node, 'grpSpPr'), 'xfrm');
    let childTf = tf;
    if (xfrm) {
      const off = kid(xfrm, 'off');
      const ext = kid(xfrm, 'ext');
      const chOff = kid(xfrm, 'chOff');
      const chExt = kid(xfrm, 'chExt');
      if (off && ext && chOff && chExt) {
        const sx = (Number(chExt.getAttribute('cx')) || 1) ? Number(ext.getAttribute('cx')) / Number(chExt.getAttribute('cx')) : 1;
        const sy = (Number(chExt.getAttribute('cy')) || 1) ? Number(ext.getAttribute('cy')) / Number(chExt.getAttribute('cy')) : 1;
        childTf = {
          sx: tf.sx * sx,
          sy: tf.sy * sy,
          tx: tf.tx + (Number(off.getAttribute('x')) - Number(chOff.getAttribute('x')) * sx) * tf.sx,
          ty: tf.ty + (Number(off.getAttribute('y')) - Number(chOff.getAttribute('y')) * sy) * tf.sy,
        };
      }
    }
    html += renderShapes(node, ctx, childTf);
  }
  return html;
}

function frameUri(frame) {
  const data = frame.getElementsByTagNameNS(A, 'graphicData')[0];
  return data ? (data.getAttribute('uri') || '') : '';
}

/* ---------------- 主题 / 版式 ---------------- */

function parseTheme(themeDoc) {
  const out = { colors: {}, map: { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' }, fonts: { major: '', minor: '' } };
  if (!themeDoc) return out;

  const scheme = themeDoc.getElementsByTagNameNS(A, 'clrScheme')[0];
  if (scheme) {
    for (const clr of scheme.children) {
      const srgb = kid(clr, 'srgbClr');
      const sys = kid(clr, 'sysClr');
      const hex = srgb ? srgb.getAttribute('val') : sys ? sys.getAttribute('lastClr') : '';
      if (hex) out.colors[clr.localName] = hex.toUpperCase();
    }
  }
  for (const name of ['majorFont', 'minorFont']) {
    const font = themeDoc.getElementsByTagNameNS(A, name)[0];
    const latin = font && kid(font, 'latin');
    if (latin) out.fonts[name.replace('Font', '')] = latin.getAttribute('typeface') || '';
  }
  return out;
}

function collectPlaceholders(root, theme) {
  const byIdx = new Map();
  const byType = new Map();
  if (!root) return { byIdx, byType };

  for (const sp of root.getElementsByTagNameNS(P, 'sp')) {
    const ph = sp.getElementsByTagNameNS(P, 'ph')[0];
    if (!ph) continue;
    const lst = sp.getElementsByTagNameNS(A, 'lstStyle')[0];
    const info = {
      xfrm: xfrmOf(sp),
      bodyPr: sp.getElementsByTagNameNS(A, 'bodyPr')[0],
      levels: lst ? parseLevels(lst, theme) : null,
    };
    if (ph.hasAttribute('idx')) byIdx.set(ph.getAttribute('idx'), info);
    const type = ph.getAttribute('type') || 'obj';
    if (!byType.has(type)) byType.set(type, info);
  }
  return { byIdx, byType };
}

/** 版式里的占位符经常只写 `<p:spPr/>`，坐标要往母版里找 */
function mergePlaceholderMaps(layoutMap, masterMap) {
  const merge = (a, b) => {
    const out = new Map(a);
    for (const [key, info] of b) {
      const prev = out.get(key);
      out.set(key, prev ? {
        xfrm: prev.xfrm || info.xfrm,
        bodyPr: prev.bodyPr || info.bodyPr,
        levels: prev.levels || info.levels,
      } : info);
    }
    return out;
  };
  return { byIdx: merge(layoutMap.byIdx, masterMap.byIdx), byType: merge(layoutMap.byType, masterMap.byType) };
}

function slideBackground(slide, theme) {
  const bg = slide.getElementsByTagNameNS(P, 'bg')[0];
  const solid = bg && bg.getElementsByTagNameNS(A, 'solidFill')[0];
  return (solid && fillColour(solid, theme)) || '#ffffff';
}

/* ---------------- 入口 ---------------- */

/**
 * .pptx → [{ html, width, height, background }]，一页一张幻灯片
 * @param {Blob|ArrayBuffer|Uint8Array} input
 */
export async function pptxToSlides(input) {
  const files = await unzip(input);
  const presBytes = files.get('ppt/presentation.xml');
  if (!presBytes) throw new Error('这个文件里找不到 ppt/presentation.xml（可能是 .ppt 老格式或已损坏）');

  const pres = parseXml(presBytes).documentElement;
  const presRels = loadRels(files, 'ppt/_rels/presentation.xml.rels', 'ppt');
  const sldSz = kid(pres, 'sldSz');
  const width = Math.round(px(sldSz?.getAttribute('cx'))) || 1280;
  const height = Math.round(px(sldSz?.getAttribute('cy'))) || 720;

  // 母版 + 主题：字号与配色都从这儿来
  const masterRel = [...presRels.values()].find((r) => /slideMaster$/.test(r.type));
  const master = masterRel && files.get(masterRel.path) ? parseXml(files.get(masterRel.path)) : null;
  let theme = { colors: {}, map: { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' }, fonts: { major: '', minor: '' } };
  if (masterRel) {
    const name = masterRel.path.split('/').pop();
    const dir = masterRel.path.slice(0, masterRel.path.length - name.length);
    const masterRels = loadRels(files, `${dir}_rels/${name}.rels`, dir.replace(/\/$/, ''));
    const themeRel = [...masterRels.values()].find((r) => /theme$/.test(r.type));
    if (themeRel && files.get(themeRel.path)) theme = parseTheme(parseXml(files.get(themeRel.path)));
  }
  const styles = buildStyles(master, theme);
  const masterPhMap = collectPlaceholders(master, theme);

  const order = kids(kid(pres, 'sldIdLst'), 'sldId')
    .map((sldId) => presRels.get(sldId.getAttributeNS(R, 'id') || sldId.getAttribute('r:id')))
    .filter(Boolean);

  const slides = [];
  for (const rel of order) {
    const bytes = files.get(rel.path);
    if (!bytes) continue;

    const slide = parseXml(bytes);
    const name = rel.path.split('/').pop();
    const dir = rel.path.slice(0, rel.path.length - name.length);
    const rels = loadRels(files, `${dir}_rels/${name}.rels`, dir.replace(/\/$/, ''));
    const layoutRel = [...rels.values()].find((r) => /slideLayout$/.test(r.type));
    const layout = layoutRel && files.get(layoutRel.path) ? parseXml(files.get(layoutRel.path)) : null;
    const layoutPhMap = mergePlaceholderMaps(collectPlaceholders(layout, theme), masterPhMap);

    const ctx = { files, rels, theme, styles, layoutPhMap };
    const tree = slide.getElementsByTagNameNS(P, 'spTree')[0];
    slides.push({
      html: tree ? renderShapes(tree, ctx, IDENT) : '',
      width,
      height,
      background: slideBackground(slide, theme),
    });
  }

  if (!slides.length) throw new Error('这份 pptx 里没有可读的幻灯片');
  return { width, height, slides, count: slides.length };
}

export const Pptx = { pptxToSlides };
export default Pptx;
