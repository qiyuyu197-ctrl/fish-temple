/**
 * plugins/tools/docx.js — Word 文档 ↔ 纯文本 / Markdown / HTML（零依赖）
 * ==================================================================
 * `.docx` 是一个 ZIP，正文在 `word/document.xml` 里。所以转换分两步：
 *   docx → zip.unzip → 解析 document.xml → 段落/表格 → 文本
 *   文本 → 生成 document.xml → zip.zip → docx
 *
 * 解析刻意做得"够用而不炫技"：
 *   · 段落 w:p，文本 w:t（w:tab / w:br 还原成制表符与换行）
 *   · 标题按 w:pStyle 认（Heading1/2/3 → #/##/###）
 *   · 列表按 w:numPr 认（→ `- `）
 *   · 表格 w:tbl → Markdown 表格
 *   · 超链接里的文字照常取出（丢掉 URL，只保文本）
 *
 * 生成端不依赖 styles.xml，标题/加粗都用直接格式（w:b、w:sz），
 * 这样 Word / WPS / LibreOffice 打开都不会缺样式。
 */

import { unzip, zip } from './zip.js';

const XML_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/* ---------------- docx → 文本 ---------------- */

const tag = (el, name) => Array.from(el.getElementsByTagNameNS(XML_NS, name));

/** 把一段 w:p 里的可见文本拼出来 */
function paragraphText(p) {
  let out = '';
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType !== 1) continue;
      const local = child.localName;
      if (local === 't') out += child.textContent;
      else if (local === 'tab') out += '\t';
      else if (local === 'br' || local === 'cr') out += '\n';
      else if (local === 'delText') out += '';          // 修订删除的内容不要
      else walk(child);
    }
  };
  walk(p);
  return out.replace(/\s+$/g, '');
}

function headingLevel(p) {
  const style = tag(p, 'pStyle')[0]?.getAttributeNS(XML_NS, 'val') || p.getElementsByTagNameNS(XML_NS, 'pStyle')[0]?.getAttribute('w:val') || '';
  const m = /^Heading(\d)/i.exec(style) || /^heading\s*(\d)/i.exec(style);
  if (m) return Math.min(6, Math.max(1, Number(m[1])));
  if (/^Title$/i.test(style)) return 1;
  return 0;
}

const isList = (p) => tag(p, 'numPr').length > 0 || p.getElementsByTagNameNS(XML_NS, 'numPr').length > 0;
/** 有些工具（包括本站的生成器）不用 numPr，而是直接把符号写进文本里 —— 也认 */
const BULLET_RE = /^\s*(?:[•·▪‣∙]|[-*+])\s+/;
const stripBullet = (s) => s.replace(BULLET_RE, '');

function tableToRows(tbl, escapeCell) {
  const rows = tag(tbl, 'tr').map((tr) => tag(tr, 'tc').map((tc) => tag(tc, 'p').map((p) => paragraphText(p)).join(' ').trim()));
  return rows.map((cells) => cells.map(escapeCell));
}

/** 正文 → 结构化的块数组（text/md/html 三种输出共用） */
function blocksFromXml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('document.xml 解析失败');
  const body = doc.getElementsByTagNameNS(XML_NS, 'body')[0] || doc.documentElement;
  const blocks = [];

  for (const node of body.children) {
    const local = node.localName;
    if (local === 'p') {
      const text = paragraphText(node);
      const level = headingLevel(node);
      if (level) blocks.push({ type: 'h', level, text });
      else if (isList(node)) blocks.push({ type: 'li', text });
      else if (BULLET_RE.test(text)) blocks.push({ type: 'li', text: stripBullet(text) });
      else if (text) blocks.push({ type: 'p', text });
    } else if (local === 'tbl') {
      const rows = tableToRows(node, (s) => s);
      if (rows.length) blocks.push({ type: 'table', rows });
    }
  }
  return blocks;
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const escapeMdCell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n+/g, ' ');

function blocksToText(blocks) {
  return blocks.map((b) => {
    if (b.type === 'table') return b.rows.map((r) => r.join('\t')).join('\n');
    if (b.type === 'li') return `· ${b.text}`;
    return b.text;
  }).join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function blocksToMarkdown(blocks) {
  const out = [];
  blocks.forEach((b, i) => {
    if (b.type === 'h') out.push(`${'#'.repeat(b.level)} ${b.text}`);
    else if (b.type === 'li') out.push(`- ${b.text}`);
    else if (b.type === 'table') {
      const [head, ...rest] = b.rows;
      out.push(`| ${head.map(escapeMdCell).join(' | ')} |`);
      out.push(`| ${head.map(() => '---').join(' | ')} |`);
      rest.forEach((r) => out.push(`| ${r.map(escapeMdCell).join(' | ')} |`));
    } else out.push(b.text);
    if (i < blocks.length - 1) out.push('');
  });
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function blocksToHtml(blocks) {
  const body = blocks.map((b) => {
    if (b.type === 'h') return `<h${b.level}>${escapeHtml(b.text)}</h${b.level}>`;
    if (b.type === 'li') return `<li>${escapeHtml(b.text)}</li>`;
    if (b.type === 'table') {
      const [head, ...rest] = b.rows;
      return `<table><thead><tr>${head.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>`
        + `<tbody>${rest.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
    return `<p>${escapeHtml(b.text)}</p>`;
  }).join('\n');
  return `<!doctype html>\n<html lang="zh-CN">\n<head><meta charset="utf-8"><title>文档</title></head>\n<body>\n${body}\n</body>\n</html>\n`;
}

/**
 * 读 docx。
 * @param {ArrayBuffer|Uint8Array|Blob} input
 * @param {{format?: 'txt'|'md'|'html'}} [opts]
 * @returns {Promise<{text:string, blocks:number, paragraphs:number, name:string}>}
 */
export async function docxToText(input, { format = 'txt' } = {}) {
  const files = await unzip(input);
  const xmlBytes = files.get('word/document.xml');
  if (!xmlBytes) throw new Error('这个 docx 里找不到 word/document.xml（可能是 .doc 老格式或已损坏）');
  const blocks = blocksFromXml(new TextDecoder('utf-8').decode(xmlBytes));
  const text = format === 'md' ? blocksToMarkdown(blocks)
    : format === 'html' ? blocksToHtml(blocks)
      : blocksToText(blocks);
  return {
    text,
    blocks: blocks.length,
    paragraphs: blocks.filter((b) => b.type === 'p').length,
    name: 'document',
  };
}

/* ---------------- 文本 → docx ---------------- */

/** 解析纯文本 / Markdown 的行结构（够用即可） */
function parseLines(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let table = null;
  const flushTable = () => { if (table && table.length) blocks.push({ type: 'table', rows: table }); table = null; };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    const li = /^\s*[-*+]\s+(.*)$/.exec(line) || /^·\s*(.*)$/.exec(line);
    const isTableRow = /^\s*\|.*\|\s*$/.test(line);
    if (isTableRow) {
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((s) => s.trim());
      if (cells.every((c) => /^-{2,}$/.test(c))) continue;      // 分隔行
      (table = table || []).push(cells);
      continue;
    }
    flushTable();
    if (!line.trim()) continue;
    if (h) blocks.push({ type: 'h', level: h[1].length, text: h[2].trim() });
    else if (li) blocks.push({ type: 'li', text: li[1].trim() });
    else blocks.push({ type: 'p', text: line.trim() });
  }
  flushTable();
  return blocks;
}

const xmlEscape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

const run = (text, { bold = false, size = 22, color = null } = {}) =>
  `<w:r><w:rPr>${bold ? '<w:b/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>`
  + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;

const para = (inner, { style = null, spacing = null } = {}) =>
  `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${spacing ? `<w:spacing w:before="${spacing}" w:after="${spacing}"/>` : ''}</w:pPr>${inner}</w:p>`;

function blocksToDocumentXml(blocks) {
  const body = blocks.map((b) => {
    if (b.type === 'h') {
      const size = [36, 32, 28, 26, 24, 24][Math.min(5, b.level - 1)];
      // 同时给 pStyle 与直接格式：有样式表的软件按标题渲染，没有的也看得出层级
      return para(run(b.text, { bold: true, size }), { style: `Heading${b.level}`, spacing: 240 });
    }
    if (b.type === 'li') return para(run(`• ${b.text}`), { style: 'ListParagraph' });
    if (b.type === 'table') {
      const rows = b.rows.map((cells) => `<w:tr>${cells.map((c) => `<w:tc>${para(run(c))}</w:tc>`).join('')}</w:tr>`).join('');
      return `<w:tbl><w:tblPr><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
        .map((s) => `<w:${s} w:val="single" w:sz="6" w:color="999999"/>`).join('')}</w:tblBorders></w:tblPr>${rows}</w:tbl>`;
    }
    return para(run(b.text));
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${XML_NS}"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`;
}

/** 最小的样式表：Heading1-3 / Title / ListParagraph（不写它，Word 里标题就只是"大号粗体"） */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${XML_NS}">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:eastAsia="宋体" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="44"/></w:rPr></w:style>
${[1, 2, 3, 4, 5, 6].map((n) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${[36, 32, 28, 26, 24, 24][n - 1]}"/></w:rPr></w:style>`).join('')}
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="420"/></w:pPr></w:style>
</w:styles>`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

/**
 * 文本 / Markdown → docx（存储模式 ZIP，Word / WPS / LibreOffice 都能打开）
 * @param {string} text
 * @returns {Promise<Blob>}
 */
export async function textToDocx(text) {
  const blocks = parseLines(text);
  const doc = blocksToDocumentXml(blocks);
  return zip([
    { name: '[Content_Types].xml', data: CONTENT_TYPES },
    { name: '_rels/.rels', data: RELS },
    { name: 'word/document.xml', data: doc },
    { name: 'word/styles.xml', data: STYLES },
    { name: 'word/_rels/document.xml.rels', data: DOC_RELS },
  ]).then((blob) => new Blob([blob], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }));
}

export const Docx = { docxToText, textToDocx, parseLines };
export default Docx;
