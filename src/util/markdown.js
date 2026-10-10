/**
 * util/markdown.js — 轻量 Markdown 渲染器（零依赖）
 * ------------------------------------------------------------------
 * 支持：frontmatter、标题、粗斜体、删除线、行内代码、围栏代码块、
 *       有序/无序列表、引用、提示块、表格、分隔线、链接、图片、自动链接。
 * 设计目标：把渲染逻辑集中在一个纯函数里，方便将来替换成 marked / remark，
 *          只要保持 render() / parseFrontmatter() / slugify() 三个导出签名不变即可。
 */

import { esc } from './dom.js';

/** 解析 YAML 风格 frontmatter（只支持 key: value 与 [a, b] 数组，足够用） */
export function parseFrontmatter(raw) {
  const text = String(raw ?? '').replace(/^\uFEFF/, '');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { data: {}, body: text };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    let [, k, v] = kv;
    v = v.trim();
    if (/^\[.*\]$/.test(v)) {
      v = v.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else if (/^["'].*["']$/.test(v)) {
      v = v.slice(1, -1);
    } else if (v === 'true' || v === 'false') {
      v = v === 'true';
    } else if (/^-?\d+(\.\d+)?$/.test(v)) {
      v = Number(v);
    }
    data[k] = v;
  }
  return { data, body: text.slice(m[0].length) };
}

/** 生成锚点 id（中文保留，空格转 -） */
export function slugify(str, fallback = 'section') {
  const s = String(str ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '-')
    .replace(/[^\w\u4e00-\u9fa5-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  return s || fallback;
}

/** 允许出现在 href / src 里的协议 */
const SAFE_SCHEMES = new Set(['http', 'https', 'mailto']);

/**
 * 链接 / 图片地址的白名单校验。
 *
 * 为什么必须在渲染层做：`[点我](javascript:alert(1))` 会被拼成
 * `<a href="javascript:alert(1)">` —— 引号虽然已经 esc() 过（所以不是属性逃逸），
 * 但读者一点就执行脚本，这是一条**可点的存储型 XSS**。文章只有站长写，风险低；
 * 论坛对任意注册用户开放后，人人都能写，必须在渲染这一层一次堵住（论坛与文章共用它）。
 *
 * 放行：http / https / mailto，以及相对地址（`/`、`#`、`./`、`../`，或显然不含协议的 `foo/bar`）。
 * 其余（`javascript:`、`data:`、`vbscript:`、`blob:`、`file:` …）一律不放行。
 *
 * 校验要点：
 *   · 先 trim() 再取协议，比较时小写 —— `JavaScript:`、` javascript:` 都要挡住；
 *   · 含控制字符（\t \n \r 等）直接拒绝 —— 浏览器解析 URL 时会忽略它们，
 *     于是 `java\tscript:alert(1)` 等价于 `javascript:`，不能靠"看起来不像"来放行；
 *   · 冒号前必须等于一个已知协议，其它写法一律按"没有协议"处理（相对地址）。
 */
export function safeUrl(raw) {
  const url = String(raw ?? '').trim();
  if (!url) return null;
  if (/[\u0000-\u001f\u007f]/.test(url)) return null;

  const m = /^([a-z][a-z0-9+.-]*):/i.exec(url);
  if (m) return SAFE_SCHEMES.has(m[1].toLowerCase()) ? url : null;

  // 没匹配到"干净协议"时，再看冒号出现在哪儿：如果在第一个 `/` 或 `?` 之前，
  // 说明这段地址**想装成协议**（例如把 javascript 写成 java&#115;cript: ——
  // 实体是我们自己 esc() 出来的，浏览器解析属性时只解码一次，所以它其实不可利用，
  // 但没有任何理由放行这种写法）。
  // ⚠️ 这里刻意只把 `/` 与 `?` 当分隔符，**不看 `#`**：`&#115;` 这种数字实体里就带 `#`，
  //    拿它当分隔符会算出一个不含冒号的 head，于是又把危险写法放过去了。
  const head = url.split(/[/?]/, 1)[0];
  if (head.includes(':')) return null;
  return url;    // 相对地址 / 锚点：本来就没有协议可执行
}

/** 行内语法。注意：传入的必须是「已转义」的纯文本 */
function inline(src) {
  let s = src;
  // 行内代码优先（保护内部内容）
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000C${codes.length - 1}\u0000`;
  });
  // 图片（地址不过白名单时不生成 <img>，降级成 alt 文本 + 原地址）
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
    (_, alt, url, title) => {
      const safe = safeUrl(url);
      if (!safe) return `${alt || '图片'}（${url}）`;
      return `<img src="${safe}" alt="${alt}"${title ? ` title="${title}"` : ''} loading="lazy" />`;
    });
  // 链接（外链自动加 target；地址不过白名单时不生成 <a>，降级成文字 + 括号里的原地址）
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, txt, url, title) => {
    const safe = safeUrl(url);
    if (!safe) return `${txt}（${url}）`;
    const ext = /^https?:\/\//i.test(safe);
    return `<a href="${safe}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}${title ? ` title="${title}"` : ''}>${txt}</a>`;
  });
  // 裸链接
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_, pre, url) =>
    `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
  // 强调
  s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  s = s.replace(/==([^=]+)==/g, '<mark>$1</mark>');
  // 还原行内代码
  s = s.replace(/\u0000C(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
  return s;
}

/**
 * 主渲染函数
 * @param {string} md 原始 markdown
 * @param {{anchors?: boolean, headingBase?: number}} [opts]
 * @returns {{html: string, toc: {level:number,id:string,text:string}[]}}
 */
export function render(md, opts = {}) {
  const { anchors = true } = opts;
  // 安全策略：块级语法在「原始文本」上识别（引用需要 >，先转义会破坏语法），
  // 所有进入输出的文本节点再单独 esc()。这样 <script> / onerror= 都变成纯文本，
  // 而由本函数生成的标签全部来自受控模板。
  const src = String(md ?? '').replace(/\r\n?/g, '\n');
  const toc = [];
  const lines = src.split('\n');
  let out = '';
  let i = 0;
  let usedIds = Object.create(null);

  const uid = (text) => {
    let id = slugify(text);
    if (usedIds[id]) {
      let n = 2;
      while (usedIds[`${id}-${n}`]) n++;
      id = `${id}-${n}`;
    }
    usedIds[id] = 1;
    return id;
  };

  const flushParagraph = (buf) => {
    if (!buf.length) return;
    out += `<p>${inline(esc(buf.join('\n'))).replace(/\n/g, '<br />')}</p>`;
    buf.length = 0;
  };
  const para = [];

  while (i < lines.length) {
    const line = lines[i];

    // 代码块
    const fence = /^\s*(```|~~~)\s*([\w+-]*)\s*$/.exec(line);
    if (fence) {
      flushParagraph(para);
      const [, marker, lang] = fence;
      const body = [];
      i++;
      while (i < lines.length && !new RegExp(`^\\s*${marker}\\s*$`).test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++;
      out += `<pre${lang ? ` data-lang="${esc(lang)}"` : ''}><code>${esc(body.join('\n'))}</code></pre>`;
      continue;
    }

    // 分隔线
    if (/^\s{0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/.test(line)) {
      flushParagraph(para);
      out += '<hr />';
      i++;
      continue;
    }

    // 标题
    const hd = /^(#{1,6})\s+(.*)$/.exec(line);
    if (hd) {
      flushParagraph(para);
      const level = hd[1].length;
      const text = hd[2].trim();
      const id = uid(text);
      if (level === 2 || level === 3) toc.push({ level, id, text });
      out += `<h${level}${anchors ? ` id="${esc(id)}"` : ''}>${inline(esc(text))}</h${level}>`;
      i++;
      continue;
    }

    // 引用 / 提示块  > [!NOTE] 内容
    if (/^\s*>\s?/.test(line)) {
      flushParagraph(para);
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      const first = buf[0] || '';
      const nt = /^\[!(NOTE|TIP|INFO|WARN|WARNING|DANGER|重要|注意)\]\s*(.*)$/i.exec(first);
      if (nt) {
        const kind = /WARN|DANGER|注意/i.test(nt[1]) ? 'warn' : 'note';
        const rest = [nt[2], ...buf.slice(1)].filter(Boolean).join('\n');
        out += `<div class="md-note md-note--${kind}"><span class="md-note__t">${esc(nt[1].toUpperCase())}</span><div>${render(rest, { anchors: false }).html}</div></div>`;
      } else {
        out += `<blockquote>${render(buf.join('\n'), { anchors: false }).html}</blockquote>`;
      }
      continue;
    }

    // 表格
    if (/\|/.test(line) && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1] || '')) {
      flushParagraph(para);
      const rows = [];
      while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim() !== '') {
        rows.push(lines[i]);
        i++;
      }
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(rows.shift());
      rows.shift(); // 丢弃分隔行
      out += '<table><thead><tr>' +
        head.map((c) => `<th>${inline(esc(c))}</th>`).join('') +
        '</tr></thead><tbody>' +
        rows.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(esc(c))}</td>`).join('')}</tr>`).join('') +
        '</tbody></table>';
      continue;
    }

    // 无序列表
    if (/^\s*[-*+]\s+/.test(line)) {
      flushParagraph(para);
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i++;
        // 续行（缩进）
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*[-*+]\s+/.test(lines[i])) {
          items[items.length - 1] += '\n' + lines[i].trim();
          i++;
        }
      }
      out += `<ul>${items.map((t) => `<li>${inline(esc(t)).replace(/\n/g, '<br />')}</li>`).join('')}</ul>`;
      continue;
    }

    // 有序列表
    if (/^\s*\d+[.)]\s+/.test(line)) {
      flushParagraph(para);
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
        i++;
      }
      out += `<ol>${items.map((t) => `<li>${inline(esc(t))}</li>`).join('')}</ol>`;
      continue;
    }

    // 空行
    if (/^\s*$/.test(line)) {
      flushParagraph(para);
      i++;
      continue;
    }

    // 段落
    para.push(line);
    i++;
  }
  flushParagraph(para);

  return { html: out, toc };
}

/** 提取纯文本摘要（用于卡片描述、SEO、搜索结果） */
export function excerpt(md, len = 130) {
  const { body } = parseFrontmatter(md);
  const text = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > len ? text.slice(0, len).trimEnd() + '…' : text;
}

/** 粗略统计字数与阅读时长 */
export function stats(md) {
  const { body } = parseFrontmatter(md);
  const cjk = (body.match(/[\u4e00-\u9fa5]/g) || []).length;
  const words = (body.replace(/[\u4e00-\u9fa5]/g, ' ').match(/[A-Za-z0-9']+/g) || []).length;
  const chars = body.length;
  const minutes = Math.max(1, Math.round((cjk + words * 1.6) / 380));
  return { cjk, words, chars, minutes };
}
