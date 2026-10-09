/**
 * plugins/tools/zip.js — 极简 ZIP 读写（零依赖）
 * ==================================================================
 * 为什么需要它：`.docx` 本质是一个 ZIP（里面装着 word/document.xml）。
 * 要在浏览器里把 docx 转成 txt，就得能解开 ZIP；要反向生成 docx，就得能打出 ZIP。
 * 两条路都不需要第三方库：
 *
 *   · 读：中央目录 → 本地文件头 → 数据段。压缩方法 8（deflate）交给浏览器原生的
 *         `DecompressionStream('deflate-raw')`（Chrome 103+）。
 *   · 写：只用「存储」(method 0) 也是完全合法的 ZIP —— Word 照常打开，
 *         而存储模式不需要压缩器，正好绕开"浏览器没有同步 deflate"这件事。
 *
 * 只实现到够用为止：不做 ZIP64、不加密、不处理多卷、不保留属性。
 */

const SIG_EOCD = 0x06054b50;
const SIG_CEN = 0x02014b50;
const SIG_LOC = 0x04034b50;

/* ---------------- CRC32 ---------------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ---------------- 读 ---------------- */

const decoder = new TextDecoder('utf-8');

/** 收 Uint8Array / ArrayBuffer / Blob（docx 传来的是 Blob） */
async function asU8(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (typeof Blob !== 'undefined' && input instanceof Blob) return new Uint8Array(await input.arrayBuffer());
  if (input?.buffer instanceof ArrayBuffer) return new Uint8Array(input.buffer, input.byteOffset || 0, input.byteLength);
  throw new Error('不认识的输入类型（需要 Uint8Array / ArrayBuffer / Blob）');
}

/** 从尾部往前找 EOCD（可能带注释，所以最多回退 64KB） */
function findEocd(u8) {
  const min = Math.max(0, u8.length - 65557);
  for (let i = u8.length - 22; i >= min; i--) {
    if (u8[i] === 0x50 && u8[i + 1] === 0x4b && u8[i + 2] === 0x05 && u8[i + 3] === 0x06) return i;
  }
  return -1;
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') throw new Error('当前浏览器不支持 DecompressionStream');
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * 解开一个 ZIP。
 * @returns {Promise<Map<string, Uint8Array>>} 文件名 → 内容
 */
export async function unzip(input) {
  const u8 = await asU8(input);
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const eocd = findEocd(u8);
  if (eocd < 0) throw new Error('不是有效的 ZIP（找不到中央目录）');

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const out = new Map();

  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== SIG_CEN) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localAt = view.getUint32(p + 42, true);
    const name = decoder.decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue;                       // 目录项
    if (view.getUint32(localAt, true) !== SIG_LOC) continue;
    const lNameLen = view.getUint16(localAt + 26, true);
    const lExtraLen = view.getUint16(localAt + 28, true);
    const start = localAt + 30 + lNameLen + lExtraLen;
    const raw = u8.subarray(start, start + compSize);
    if (method === 0) out.set(name, raw.slice());
    else if (method === 8) out.set(name, await inflateRaw(raw));
    else throw new Error(`不支持的压缩方法 ${method}（${name}）`);
  }
  return out;
}

/* ---------------- 写 ---------------- */

const encoder = new TextEncoder();

const toBytes = (v) => {
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (typeof Blob !== 'undefined' && v instanceof Blob) return v.arrayBuffer().then((b) => new Uint8Array(b));
  return encoder.encode(String(v));
};

/**
 * 打包一个 ZIP（存储模式，不压缩）。
 * @param {Array<{name:string, data:Uint8Array|ArrayBuffer|Blob|string}>} entries
 * @returns {Promise<Blob>} application/zip
 */
export async function zip(entries) {
  const items = [];
  let offset = 0;
  const parts = [];

  for (const e of entries) {
    const data = await toBytes(e.data);
    const name = encoder.encode(e.name);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, SIG_LOC, true);
    lv.setUint16(4, 20, true);                 // 需要的版本
    lv.setUint16(6, 0, true);                  // 标志位
    lv.setUint16(8, 0, true);                  // 压缩方法：0 = 存储
    lv.setUint16(10, 0, true);                 // 修改时间
    lv.setUint16(12, 0, true);                 // 修改日期
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);       // 压缩后大小
    lv.setUint32(22, data.length, true);       // 原始大小
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);                 // 扩展字段长度
    local.set(name, 30);
    parts.push(local, data);
    items.push({ name, crc, size: data.length, offset });
    offset += local.length + data.length;
  }

  const cenParts = [];
  let cenSize = 0;
  for (const it of items) {
    const cen = new Uint8Array(46 + it.name.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, SIG_CEN, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, it.crc, true);
    cv.setUint32(20, it.size, true);
    cv.setUint32(24, it.size, true);
    cv.setUint16(28, it.name.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, it.offset, true);
    cen.set(it.name, 46);
    cenParts.push(cen);
    cenSize += cen.length;
  }

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, SIG_EOCD, true);
  ev.setUint16(8, items.length, true);
  ev.setUint16(10, items.length, true);
  ev.setUint32(12, cenSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...parts, ...cenParts, eocd], { type: 'application/zip' });
}

export const Zip = { unzip, zip, crc32 };
export default Zip;
