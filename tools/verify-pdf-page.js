/**
 * tools/verify-pdf-page.js — 「docx / pptx → PDF」的浏览器端自检（开发期用，不是站点功能）
 * ==================================================================
 * 由 `tools/verify-pdf.mjs` 通过 CDP 调用。放到浏览器里跑的原因是：
 * 这条链路是「浏览器排版 + 浏览器成像」，在 Node 里既没有排版引擎也没有 Canvas，
 * 用 mock 验等于没验。这里现造一份 docx、一份 pptx（真的 ZIP + 真的 OOXML），
 * 走完整的 convert() → PDF 字节，再把 PDF 里的 JPEG 页面抽出来数「有没有墨」。
 *
 * 造的两份文件故意踩坑：
 *   · docx：标题 / 列表 / 表格 / 图片 / 40 段正文（必然跨页）
 *   · pptx：占位符不写坐标（坐标要从版式 → 母版继承）、图片、表格
 */

import { zip } from '/src/plugins/tools/zip.js';
import Tools from '/src/plugins/tools/index.js';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';

const xmlEscape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------------- 一张真的 PNG（4×3，红底） ---------------- */

async function pixelPng() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 3;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(0, 0, 4, 3);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

/* ---------------- docx ---------------- */

const docParagraph = (text, style = '', opts = {}) => {
  const pPr = [];
  if (style) pPr.push(`<w:pStyle w:val="${style}"/>`);
  if (opts.numId) pPr.push(`<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${opts.numId}"/></w:numPr>`);
  return `<w:p>${pPr.length ? `<w:pPr>${pPr.join('')}</w:pPr>` : ''}`
    + `<w:r><w:rPr>${opts.bold ? '<w:b/>' : ''}</w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
};

const docCell = (text) => `<w:tc><w:tcPr><w:tcW w:type="dxa" w:w="3000"/></w:tcPr>${docParagraph(text)}</w:tc>`;

const docTable = () => `<w:tbl>
<w:tblPr><w:tblW w:type="auto" w:w="0"/></w:tblPr>
<w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/><w:gridCol w:w="2000"/></w:tblGrid>
<w:tr>${docCell('项目')}${docCell('状态')}${docCell('备注')}</w:tr>
<w:tr>${docCell('中文')}${docCell('好')}${docCell('跨页')}</w:tr>
</w:tbl>`;

const docImage = () => `<w:p><w:r><w:drawing><wp:inline>
<wp:extent cx="1905000" cy="1428750"/><wp:docPr id="1" name="自检图片"/>
<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="pic"/><pic:cNvPicPr/></pic:nvPicPr>
<pic:blipFill><a:blip r:embed="rId9"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
<pic:spPr/></pic:pic></a:graphicData></a:graphic>
</wp:inline></w:drawing></w:r></w:p>`;

const DOCX_NS = `xmlns:w="${W_NS}" xmlns:r="${R_NS}" `
  + 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
  + `xmlns:a="${A_NS}" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"`;

async function buildDocx(png) {
  const body = [
    docParagraph('鱼灵庙 · PDF 自检文档', 'Title'),
    docParagraph('这一段用来验证中文、换行与行距。Mixed English 和中文放在一起，看看会不会在右边被裁掉。'.repeat(3)),
    docParagraph('加粗的句子', '', { bold: true }),
    docParagraph('一级标题：结构', 'Heading1'),
    docParagraph('列表第一条', 'ListBullet'),
    docParagraph('列表第二条', 'ListBullet'),
    docParagraph('编号第一条', 'ListNumber'),
    docTable(),
    docImage(),
    ...Array.from({ length: 40 }, (_, i) => docParagraph(`第 ${i + 1} 段：` + '自检用的填充文字，用来把文档撑到两页以上。'.repeat(4))),
  ].join('');
  return docxFile(body, png, '自检文档.docx');
}

/** 一页短内容 + 分页符 + 一页短内容：验 `w:br type="page"` 真的照做 */
async function buildPageBreakDocx(png) {
  const body = [
    docParagraph('分页符之前'),
    '<w:p><w:r><w:br w:type="page"/></w:r></w:p>',
    docParagraph('分页符之后'),
  ].join('');
  return docxFile(body, png, '分页符.docx');
}

async function docxFile(body, png, name) {
  const ns = DOCX_NS;
  const files = [
    {
      name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Default Extension="png" ContentType="image/png"/>'
        + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        + '</Types>',
    },
    {
      name: '_rels/.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        + '</Relationships>',
    },
    {
      name: 'word/document.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${ns}><w:body>${body}`
        + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>',
    },
    {
      name: 'word/_rels/document.xml.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/pixel.png"/>'
        + '</Relationships>',
    },
    { name: 'word/media/pixel.png', data: png },
  ];

  const blob = await zip(files);
  return new File([blob], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/* ---------------- pptx ---------------- */

async function buildPptx(png) {
  const ns = `xmlns:a="${A_NS}" xmlns:r="${R_NS}" xmlns:p="${P_NS}"`;
  const treeEmpty = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>';

  const master = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster ${ns}><p:cSld><p:spTree>${treeEmpty}
<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="838200" y="365125"/><a:ext cx="10515600" cy="1325563"/></a:xfrm></p:spPr></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="838200" y="1825625"/><a:ext cx="10515600" cy="4351338"/></a:xfrm></p:spPr></p:sp>
</p:spTree></p:cSld>
<p:txStyles>
<p:titleStyle><a:lvl1pPr algn="ctr"><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle>
<p:bodyStyle><a:lvl1pPr marL="342900" indent="-342900"><a:buChar char="•"/><a:defRPr sz="3200"/></a:lvl1pPr></p:bodyStyle>
<p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle>
</p:txStyles></p:sldMaster>`;

  const layout = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout ${ns}><p:cSld><p:spTree>${treeEmpty}
<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>
</p:spTree></p:cSld></p:sldLayout>`;

  const para = (text, opts = {}) => `<a:p${opts.align ? `><a:pPr algn="${opts.align}"/>` : '>'}`
    + `<a:r><a:rPr lang="zh-CN"${opts.size ? ` sz="${opts.size}"` : ''}${opts.bold ? ' b="1"' : ''}/>`
    + `<a:t>${xmlEscape(text)}</a:t></a:r></a:p>`;

  // 两页都不写 xfrm：坐标必须从版式 / 母版里继承，否则就是空白页（正是要抓的 bug）
  const slide1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ${ns}><p:cSld><p:spTree>${treeEmpty}
<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/>
<p:txBody><a:bodyPr/><a:p><a:r><a:t>自检 · 幻灯片一</a:t></a:r></a:p></p:txBody></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr/>
<p:txBody><a:bodyPr/><a:p><a:r><a:t>第一点：中文不能变方块</a:t></a:r></a:p>
<a:p><a:r><a:rPr b="1"/><a:t>第二点：字号要继承母版</a:t></a:r></a:p>
<a:p><a:r><a:rPr sz="2200"/><a:t>第三点：页内覆盖 22pt</a:t></a:r></a:p></p:txBody></p:sp>
</p:spTree></p:cSld></p:sld>`;

  const slide2 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ${ns}><p:cSld><p:spTree>${treeEmpty}
<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/>
<p:txBody><a:bodyPr/><a:p><a:r><a:t>自检 · 幻灯片二</a:t></a:r></a:p></p:txBody></p:sp>
<p:pic><p:nvPicPr><p:cNvPr id="4" name="Pic"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
<p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
<p:spPr><a:xfrm><a:off x="1000000" y="2000000"/><a:ext cx="4000000" cy="3000000"/></a:xfrm></p:spPr></p:pic>
<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="5" name="Table"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
<p:xfrm><a:off x="6000000" y="2000000"/><a:ext cx="5000000" cy="1200000"/></p:xfrm>
<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
<a:tbl><a:tblGrid><a:gridCol w="2500000"/><a:gridCol w="2500000"/></a:tblGrid>
<a:tr h="600000"><a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>格 A</a:t></a:r></a:p></a:txBody></a:tc>
<a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>格 B</a:t></a:r></a:p></a:txBody></a:tc></a:tr>
</a:tbl></a:graphicData></a:graphic></p:graphicFrame>
</p:spTree></p:cSld></p:sld>`;

  const rels = (items) => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + items.map(([id, type, target]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`).join('')
    + '</Relationships>';

  const files = [
    {
      name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Default Extension="png" ContentType="image/png"/>'
        + '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
        + '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>'
        + '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>'
        + '<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
        + '<Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
        + '</Types>',
    },
    { name: '_rels/.rels', data: rels([['rId1', 'officeDocument', 'ppt/presentation.xml']]) },
    {
      name: 'ppt/presentation.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation ${ns}>`
        + '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>'
        + '<p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/></p:sldIdLst>'
        + '<p:sldSz cx="12192000" cy="6858000"/></p:presentation>',
    },
    {
      name: 'ppt/_rels/presentation.xml.rels',
      data: rels([
        ['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'],
        ['rId2', 'slide', 'slides/slide1.xml'],
        ['rId3', 'slide', 'slides/slide2.xml'],
      ]),
    },
    { name: 'ppt/slideMasters/slideMaster1.xml', data: master },
    { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']]) },
    { name: 'ppt/slideLayouts/slideLayout1.xml', data: layout },
    { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: rels([]) },
    { name: 'ppt/slides/slide1.xml', data: slide1 },
    { name: 'ppt/slides/_rels/slide1.xml.rels', data: rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']]) },
    { name: 'ppt/slides/slide2.xml', data: slide2 },
    {
      name: 'ppt/slides/_rels/slide2.xml.rels',
      data: rels([
        ['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'],
        ['rId2', 'image', '../media/pixel.png'],
      ]),
    },
    { name: 'ppt/media/pixel.png', data: png },
  ];

  const blob = await zip(files);
  return new File([blob], '自检演示.pptx', { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}

/* ---------------- PDF 拆开看看 ---------------- */

async function pdfInfo(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));

  const pages = [...bin.matchAll(/\/Type \/Page\s/g)].length;
  const mediaBoxes = [...bin.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map((m) => [Number(m[1]), Number(m[2])]);

  // 把每页的 JPEG 抽出来，缩放后数「非白像素」——空白页会在这里露馅
  const sheets = [];
  const re = /\/DCTDecode \/Length (\d+) >>\nstream\n/g;
  let m;
  while ((m = re.exec(bin))) {
    const start = m.index + m[0].length;
    const length = Number(m[1]);
    const data = bytes.subarray(start, start + length);
    re.lastIndex = start + length;
    const bitmap = await createImageBitmap(new Blob([data], { type: 'image/jpeg' }));
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = Math.max(1, Math.round((200 * bitmap.height) / bitmap.width));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] < 245 || px[i + 1] < 245 || px[i + 2] < 245) ink++;
    sheets.push({ bytes: length, ink, width: bitmap.width, height: bitmap.height });
    bitmap.close?.();
  }

  return {
    header: bin.slice(0, 8),
    size: bytes.length,
    pages,
    mediaBoxes,
    sheets,
    xref: /startxref\n\d+\n%%EOF/.test(bin),
    trailer: /\/Type \/Catalog/.test(bin),
    objectsOk: checkObjects(bin),
  };
}

/**
 * 逐条核对 xref：每个「n」条目的偏移处必须正好是「<id> 0 obj」。
 * 这比"有 %PDF 头"严得多 —— 偏移算错时阅读器会整份打不开。
 */
function checkObjects(bin) {
  const at = Number((/startxref\n(\d+)\n%%EOF/.exec(bin) || [])[1]);
  if (!Number.isFinite(at) || bin.slice(at, at + 4) !== 'xref') return false;
  const m = /^xref\n0 (\d+)\n/.exec(bin.slice(at));
  if (!m) return false;
  const total = Number(m[1]);
  const lines = bin.slice(at).split('\n').slice(2, 2 + total);
  if (lines.length !== total) return false;
  const size = Number((/\/Size (\d+)/.exec(bin) || [])[1]);
  if (size !== total) return false;
  for (let id = 1; id < total; id++) {
    const line = lines[id] || '';
    if (!/ 00000 n $/.test(line)) return false;
    const offset = Number(line.slice(0, 10));
    if (!bin.slice(offset, offset + 24).startsWith(`${id} 0 obj`)) return false;
  }
  return true;
}

/* ---------------- 跑一遍 ---------------- */

export async function run() {
  const out = {};
  const png = await pixelPng();
  const docx = await buildDocx(png);
  const pptx = await buildPptx(png);

  out.docxKind = Tools.kindOf(docx);
  out.docxTargets = Tools.targetsFor(docx).map((t) => t.id);
  out.docxDefault = Tools.defaultTarget(docx);

  const docProgress = [];
  const t0 = performance.now();
  const docPdf = await Tools.convert(docx, 'pdf', { onProgress: (p) => docProgress.push(p) });
  out.docx = {
    ...(await pdfInfo(docPdf.blob)),
    name: docPdf.name,
    note: docPdf.note,
    mime: docPdf.blob.type,
    progress: docProgress,
    ms: Math.round(performance.now() - t0),
    textInk: (docPdf.blob.size > 0) ? 1 : 0,
  };
  // docx → txt 仍然可用（新增 PDF 不能把老路弄坏）
  out.docxTxt = (await (await Tools.convert(docx, 'txt')).blob.text()).slice(0, 12);

  // 分页符：一页短内容 + w:br type="page" + 一页短内容 → 必须正好两页
  const breakDocx = await buildPageBreakDocx(png);
  out.pageBreak = await pdfInfo((await Tools.convert(breakDocx, 'pdf')).blob);

  out.pptxKind = Tools.kindOf(pptx);
  out.pptxTargets = Tools.targetsFor(pptx).map((t) => t.id);
  const pptProgress = [];
  const pptPdf = await Tools.convert(pptx, 'pdf', { onProgress: (p) => pptProgress.push(p) });
  out.pptx = {
    ...(await pdfInfo(pptPdf.blob)),
    name: pptPdf.name,
    note: pptPdf.note,
    mime: pptPdf.blob.type,
    progress: pptProgress,
  };

  // 老格式：不给假按钮，但要给一句能照做的错误
  const legacy = new File([new Uint8Array(8)], '旧稿.ppt');
  out.legacyKind = Tools.kindOf(legacy);
  out.legacyTargets = Tools.targetsFor(legacy).length;
  try { await Tools.convert(legacy, 'pdf'); out.legacyError = '没有报错'; }
  catch (err) { out.legacyError = String(err.message || err); }

  return out;
}

export default { run };
