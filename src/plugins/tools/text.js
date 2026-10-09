/**
 * plugins/tools/text.js — 文本 / 文件小工具（零依赖）
 * ==================================================================
 * 都是纯函数（除了哈希读文件），所以能被自检直接调用，不依赖界面。
 */

/* ---------------- JSON ---------------- */

/** 格式化；失败时抛出带位置的可读错误 */
export function formatJson(text, { indent = 2 } = {}) {
  const value = JSON.parse(String(text));
  return JSON.stringify(value, null, indent);
}

export function minifyJson(text) {
  return JSON.stringify(JSON.parse(String(text)));
}

/** JSON 结构摘要：类型统计 + 体积，方便快速看一份接口返回 */
export function jsonSummary(text) {
  const value = JSON.parse(String(text));
  const count = (v) => {
    if (Array.isArray(v)) return v.length;
    if (v && typeof v === 'object') return Object.keys(v).length;
    return 0;
  };
  const keys = value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : [];
  return {
    type: Array.isArray(value) ? 'array' : typeof value,
    entries: count(value),
    keys: keys.slice(0, 24),
    bytes: new TextEncoder().encode(JSON.stringify(value)).length,
  };
}

/* ---------------- Base64（UTF-8 安全） ---------------- */

export function base64Encode(text) {
  const bytes = new TextEncoder().encode(String(text));
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

export function base64Decode(text) {
  const clean = String(text).replace(/\s+/g, '');
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

/* ---------------- URL ---------------- */

export const urlEncode = (text) => encodeURIComponent(String(text));
export const urlDecode = (text) => decodeURIComponent(String(text).replace(/\+/g, ' '));

/* ---------------- 行处理 ---------------- */

export const LINE_MODES = [
  { id: 'dedupe', label: '去重（保留首次出现）' },
  { id: 'sort', label: '升序排序' },
  { id: 'sortDesc', label: '降序排序' },
  { id: 'reverse', label: '倒序' },
  { id: 'trim', label: '去首尾空格' },
  { id: 'dropEmpty', label: '删空行' },
  { id: 'number', label: '加行号' },
  { id: 'join', label: '合并成一行（逗号分隔）' },
];

export function processLines(text, modes = []) {
  let lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const set = new Set(modes);
  if (set.has('trim')) lines = lines.map((l) => l.trim());
  if (set.has('dropEmpty')) lines = lines.filter((l) => l.length > 0);
  if (set.has('dedupe')) {
    const seen = new Set();
    lines = lines.filter((l) => (seen.has(l) ? false : (seen.add(l), true)));
  }
  if (set.has('sort')) lines = [...lines].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  if (set.has('sortDesc')) lines = [...lines].sort((a, b) => b.localeCompare(a, 'zh-Hans-CN'));
  if (set.has('reverse')) lines = [...lines].reverse();
  if (set.has('number')) {
    const w = String(lines.length).length;
    lines = lines.map((l, i) => `${String(i + 1).padStart(w, ' ')}. ${l}`);
  }
  if (set.has('join')) lines = [lines.join(', ')];
  return lines.join('\n');
}

/** 文本统计：字符 / 词 / 行 / 中文字数 / 预估阅读时长 */
export function textStats(text) {
  const s = String(text);
  const cjk = (s.match(/[\u4e00-\u9fa5]/g) || []).length;
  const words = (s.match(/[A-Za-z0-9_'’-]+/g) || []).length;
  const lines = s ? s.split(/\r\n?|\n/).length : 0;
  return {
    chars: s.length,
    charsNoSpace: s.replace(/\s/g, '').length,
    cjk,
    words,
    lines,
    readingMin: Math.max(1, Math.round((cjk + words) / 300)),
  };
}

/* ---------------- 文件指纹 ---------------- */

const HEX = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * SHA-256（浏览器原生 crypto.subtle，文件不出内存）
 * @param {File|Blob} file
 */
export async function sha256(file) {
  if (!crypto?.subtle) throw new Error('当前环境没有 crypto.subtle（需要 https 或 localhost）');
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return { hex: HEX(digest), bytes: buf.byteLength };
}

/** 按扩展名猜 MIME（给下载用） */
export const MIME_BY_EXT = {
  txt: 'text/plain;charset=utf-8',
  md: 'text/markdown;charset=utf-8',
  html: 'text/html;charset=utf-8',
  json: 'application/json;charset=utf-8',
  csv: 'text/csv;charset=utf-8',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  webm: 'audio/webm',
  zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export const TextTools = {
  formatJson, minifyJson, jsonSummary,
  base64Encode, base64Decode, urlEncode, urlDecode,
  processLines, LINE_MODES, textStats, sha256, MIME_BY_EXT,
};
export default TextTools;
