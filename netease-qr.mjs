/**
 * netease-qr.mjs —— 网易云扫码登录用的零依赖二维码编码器
 *
 * 为什么自己写：
 * 这个站点是「零依赖静态站 + 一个 server.mjs」，不应该为了画一个二维码去装
 * canvas / pngjs / qrcode 这一整串依赖。二维码本身是公开标准（ISO/IEC 18004），
 * 只用 Node 自带的 TextEncoder 和 Buffer 就能完成，所以这里直接实现编码器，
 * 前端只拿 SVG 字符串显示。
 *
 * 支持范围：
 * - 版本 1–10（21×21 到 57×57），自动选择能装下内容的最小版本。
 * - 纠错级别 L / M，默认 L。
 * - 文本先按 UTF-8 转字节；byte 段一定是 UTF-8 字节长度，所以中文、emoji 都正确。
 * - 与官方 qrcode@1.5.4 的默认行为保持一致：连续数字、连续大写字母会采用
 *   Numeric / Alphanumeric 模式。官方包默认就会这样优化；如果强行全部用 byte，
 *   真实登录 URL 的模块矩阵会和官方包不一致。对中文、emoji、小写 URL 来说，
 *   主体仍然是 UTF-8 byte 段。
 *
 * 验证方法（本地实测）：
 * 用临时脚本 .tmp-qr-check.mjs 调用本地只读的 qrcode@1.5.4，把 qrMatrix 的
 * size 与每个模块逐字节比较；覆盖 300+ 随机字符串、真实网易云登录 URL、L/M
 * 两种纠错级别。验证脚本在交付前删除，不进入运行时依赖。
 */

import { Buffer } from 'node:buffer';

// 二维码规格里的总码字数（数据码字 + 纠错码字），下标 0 对应版本 0，仅作占位。
// 这些数字来自 QR 规范表，不是从某个渲染库临时推导出来的。
const TOTAL_CODEWORDS = Object.freeze([
  0,
  26, 44, 70, 100, 134, 172, 196, 242, 292, 346,
]);

// 每个版本、每个纠错级别占用的纠错码字总数。只保留 L/M，因为扫码登录不需要
// 更高的纠错等级；如果以后要加 Q/H，必须同时补 EC_BLOCKS 和格式信息映射。
const ECC_CODEWORDS = Object.freeze({
  L: Object.freeze([7, 10, 15, 20, 26, 36, 40, 48, 60, 72]),
  M: Object.freeze([10, 16, 26, 36, 48, 64, 72, 88, 110, 130]),
});

// RS 分块数量。为什么需要分块：二维码的纠错是按块独立计算的，块数决定了
// 数据如何被切开、纠错码字如何与数据交错。这个表必须和规范完全一致。
const EC_BLOCKS = Object.freeze({
  L: Object.freeze([1, 1, 1, 1, 1, 2, 2, 2, 2, 4]),
  M: Object.freeze([1, 1, 1, 2, 2, 4, 4, 4, 5, 5]),
});

// 对齐图案中心坐标。版本 1 没有对齐图案；版本 2–10 的坐标可以直接列出来。
// 用显式表而不是公式，是为了让版本边界一眼可查，也避免公式在 10 附近算错。
const ALIGNMENT_POSITIONS = Object.freeze([
  Object.freeze([]),
  Object.freeze([6, 18]),
  Object.freeze([6, 22]),
  Object.freeze([6, 26]),
  Object.freeze([6, 30]),
  Object.freeze([6, 34]),
  Object.freeze([6, 22, 38]),
  Object.freeze([6, 24, 42]),
  Object.freeze([6, 26, 46]),
  Object.freeze([6, 28, 50]),
]);

// Alphanumeric 模式的字符表。下标就是该字符的 6 位/11 位编码值。
const ALPHANUMERIC_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

// 三种模式的模式指示符与字符计数位宽。
// 字符计数位宽是「版本区段」的函数：1–9、10–26、27–40 各不同。
// 本实现最多到版本 10，但保留 27+ 的表项，方便以后扩展时不至于写死。
const MODE_INFO = Object.freeze({
  numeric: Object.freeze({ bit: 0b0001, charCountBits: Object.freeze([10, 12, 14]) }),
  alphanumeric: Object.freeze({ bit: 0b0010, charCountBits: Object.freeze([9, 11, 13]) }),
  byte: Object.freeze({ bit: 0b0100, charCountBits: Object.freeze([8, 16, 16]) }),
});

// 格式信息使用 (15,5) BCH 码，生成多项式与固定掩码来自 QR 规范。
const FORMAT_G15 = 0x0537;
const FORMAT_G15_MASK = 0x5412;

// 版本信息（版本 7 及以上）使用 (18,6) Golay 码。
const VERSION_G18 = 0x1f25;

const UTF8_ENCODER = new TextEncoder();

// ---------------------------------------------------------------------------
// 容量与版本选择
// ---------------------------------------------------------------------------

function dataCodewordCount(version, ecl) {
  return TOTAL_CODEWORDS[version] - ECC_CODEWORDS[ecl][version - 1];
}

function charCountBits(mode, version) {
  const table = MODE_INFO[mode].charCountBits;
  if (version < 10) return table[0];
  if (version < 27) return table[1];
  return table[2];
}

// 某模式下，length 个「字符」占用的数据位数。
// byte 模式的 length 是 UTF-8 字节数，不是 JS 的 code unit 数。
function segmentDataBits(mode, length) {
  if (mode === 'numeric') {
    return 10 * Math.floor(length / 3) + (length % 3 ? (length % 3) * 3 + 1 : 0);
  }
  if (mode === 'alphanumeric') {
    return 11 * Math.floor(length / 2) + 6 * (length % 2);
  }
  return length * 8;
}

// 单段数据的理论最大字符数。这里按规范里的取整方式计算，目的是和官方包的
// 版本选择逐位一致；多段混合数据则直接比较总位数。
function singleModeCapacity(version, ecl, mode) {
  const usableBits = dataCodewordCount(version, ecl) * 8
    - 4
    - charCountBits(mode, version);
  if (mode === 'numeric') return Math.floor((usableBits / 10) * 3);
  if (mode === 'alphanumeric') return Math.floor((usableBits / 11) * 2);
  return Math.floor(usableBits / 8);
}

function findBestVersion(segments, ecl) {
  for (let version = 1; version <= 10; version++) {
    if (segments.length === 1) {
      const segment = segments[0];
      if (segment.length <= singleModeCapacity(version, ecl, segment.mode)) {
        return version;
      }
      continue;
    }

    let totalBits = 0;
    for (const segment of segments) {
      totalBits += 4
        + charCountBits(segment.mode, version)
        + segmentDataBits(segment.mode, segment.length);
    }
    if (totalBits <= dataCodewordCount(version, ecl) * 8) return version;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// 分段优化
//
// 官方 qrcode 包会对字符串做分段。真实登录 URL 会被拆成
// Byte + Numeric + Byte + Numeric 四段，所以只做单段 byte 虽然更「纯」，
// 却无法做到与官方逐模块一致。这里的做法是照搬相同的分段与最短路策略。
// ---------------------------------------------------------------------------

function makeNode(text, mode) {
  return {
    text,
    mode,
    length: mode === 'byte' ? UTF8_ENCODER.encode(text).length : text.length,
  };
}

function splitRawSegments(text) {
  const patterns = [
    ['numeric', /[0-9]+/g],
    ['alphanumeric', /[A-Z $%*+\-.\/:]+/g],
    ['byte', /[^A-Z0-9 $%*+\-.\/:]+/g],
  ];
  const found = [];

  for (const [mode, regexp] of patterns) {
    regexp.lastIndex = 0;
    let match;
    while ((match = regexp.exec(text)) !== null) {
      found.push({ mode, text: match[0], index: match.index });
    }
  }

  // 三段正则在字符集合上互斥，理论上不会重叠；排序只是保证输入顺序。
  found.sort((a, b) => a.index - b.index);
  return found;
}

function nodeGroupFor(segment) {
  if (segment.mode === 'numeric') {
    return [
      makeNode(segment.text, 'numeric'),
      makeNode(segment.text, 'alphanumeric'),
      makeNode(segment.text, 'byte'),
    ];
  }
  if (segment.mode === 'alphanumeric') {
    return [
      makeNode(segment.text, 'alphanumeric'),
      makeNode(segment.text, 'byte'),
    ];
  }
  return [makeNode(segment.text, 'byte')];
}

// 极小的 Dijkstra 实现。节点数最多是字符数 × 3，直接排序队列足够快。
// 保留「严格小于才更新」和稳定排序，是为了让同一字符串的并列最短路型
// 与官方依赖 dijkstrajs 的选择保持一致。
function shortestPath(graph, start, end) {
  const costs = Object.create(null);
  const previous = Object.create(null);
  const queue = [{ value: start, cost: 0 }];
  costs[start] = 0;

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift();
    const edges = graph[current.value] || {};

    for (const next in edges) {
      if (!Object.prototype.hasOwnProperty.call(edges, next)) continue;
      const nextCost = current.cost + edges[next];
      if (costs[next] === undefined || costs[next] > nextCost) {
        costs[next] = nextCost;
        previous[next] = current.value;
        queue.push({ value: next, cost: nextCost });
      }
    }
  }

  if (costs[end] === undefined) {
    throw new Error('[netease-qr] 内部错误：分段最短路不存在');
  }

  const path = [];
  let node = end;
  while (node) {
    path.push(node);
    node = previous[node];
  }
  path.reverse();
  return path;
}

function optimizeSegments(text, version, rawSegments) {
  const groups = rawSegments.map(nodeGroupFor);
  const table = Object.create(null);
  const graph = Object.create(null);
  graph.start = Object.create(null);

  let previousIds = ['start'];

  for (let i = 0; i < groups.length; i++) {
    const currentIds = [];

    for (let j = 0; j < groups[i].length; j++) {
      const node = groups[i][j];
      // 和官方包一样用字符串拼接做 key。j 最大为 2，不会与相邻 i 冲突。
      const id = '' + i + j;
      currentIds.push(id);
      table[id] = { node, lastCount: 0 };
      graph[id] = Object.create(null);

      for (const previousId of previousIds) {
        const previous = table[previousId];

        if (previous && previous.node.mode === node.mode) {
          // 同模式相邻段可以合并，只付「增量位数」，不重复付模式头。
          const before = previous.lastCount;
          graph[previousId][id] = segmentDataBits(node.mode, before + node.length)
            - segmentDataBits(node.mode, before);
          previous.lastCount += node.length;
        } else {
          if (previous) previous.lastCount = node.length;
          // 换模式时要重新写 4 位模式指示符和字符计数。
          graph[previousId][id] = segmentDataBits(node.mode, node.length)
            + 4
            + charCountBits(node.mode, version);
        }
      }
    }

    previousIds = currentIds;
  }

  for (const id of previousIds) graph[id].end = 0;

  const path = shortestPath(graph, 'start', 'end');
  const chosen = [];
  for (let i = 1; i < path.length - 1; i++) {
    const entry = table[path[i]];
    if (entry) chosen.push(entry.node);
  }

  // 相邻同模式节点在官方包中会先合并再生成最终段；这里做同样的事。
  const merged = [];
  for (const node of chosen) {
    const last = merged[merged.length - 1];
    if (last && last.mode === node.mode) {
      last.text += node.text;
    } else {
      merged.push({ text: node.text, mode: node.mode });
    }
  }

  return merged.map((segment) => makeNode(segment.text, segment.mode));
}

// ---------------------------------------------------------------------------
// 比特流与 Reed-Solomon 纠错
// ---------------------------------------------------------------------------

class BitWriter {
  constructor() {
    this.bytes = [];
    this.length = 0;
  }

  put(value, bitCount) {
    for (let i = bitCount - 1; i >= 0; i--) {
      this.putBit((value >>> i) & 1);
    }
  }

  putBit(bit) {
    const index = this.length >>> 3;
    if (this.bytes.length === index) this.bytes.push(0);
    if (bit) this.bytes[index] |= 0x80 >>> (this.length & 7);
    this.length++;
  }

  toBytes() {
    return Uint8Array.from(this.bytes);
  }
}

function writeSegmentPayload(writer, segment) {
  const text = segment.text;

  if (segment.mode === 'numeric') {
    let i = 0;
    for (; i + 3 <= text.length; i += 3) {
      writer.put(Number.parseInt(text.slice(i, i + 3), 10), 10);
    }
    const remaining = text.length - i;
    if (remaining === 1) writer.put(Number.parseInt(text[i], 10), 4);
    if (remaining === 2) writer.put(Number.parseInt(text.slice(i), 10), 7);
    return;
  }

  if (segment.mode === 'alphanumeric') {
    let i = 0;
    for (; i + 2 <= text.length; i += 2) {
      const value = ALPHANUMERIC_CHARS.indexOf(text[i]) * 45
        + ALPHANUMERIC_CHARS.indexOf(text[i + 1]);
      writer.put(value, 11);
    }
    if (i < text.length) {
      writer.put(ALPHANUMERIC_CHARS.indexOf(text[i]), 6);
    }
    return;
  }

  const bytes = UTF8_ENCODER.encode(text);
  for (const byte of bytes) writer.put(byte, 8);
}

function createDataCodewords(segments, version, ecl) {
  const capacityBytes = dataCodewordCount(version, ecl);
  const capacityBits = capacityBytes * 8;
  const writer = new BitWriter();

  for (const segment of segments) {
    writer.put(MODE_INFO[segment.mode].bit, 4);
    writer.put(segment.length, charCountBits(segment.mode, version));
    writeSegmentPayload(writer, segment);
  }

  if (writer.length > capacityBits) {
    throw new Error('[netease-qr] 内部错误：数据位数超过版本容量');
  }

  // 终止符最多 4 位；如果只剩不到 4 位，就只补到容量边界。
  const remaining = capacityBits - writer.length;
  if (remaining >= 4) {
    writer.put(0, 4);
  } else {
    for (let i = 0; i < remaining; i++) writer.putBit(0);
  }

  // 终止符后按字节对齐，再用 0xEC / 0x11 交替填充。这个交替填充是规范
  // 规定的 Pad Codewords，不是随便补零。
  while (writer.length % 8 !== 0) writer.putBit(0);

  let pad = 0xec;
  while (writer.length < capacityBits) {
    writer.put(pad, 8);
    pad = pad === 0xec ? 0x11 : 0xec;
  }

  return writer.toBytes();
}

// GF(256) 的指数/对数表。QR 使用本原多项式 x^8 + x^4 + x^3 + x^2 + 1
// （0x11D），生成元是 2。
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGaloisField() {
  let value = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = value;
    GF_LOG[value] = i;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
}());

function gfMultiply(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

const GENERATOR_CACHE = new Map();

// 生成多项式 ∏(x - α^i)，i 从 0 到 degree-1。系数按从高次到低次保存。
function getGeneratorPolynomial(degree) {
  if (GENERATOR_CACHE.has(degree)) return GENERATOR_CACHE.get(degree);

  let polynomial = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(polynomial.length + 1);
    for (let j = 0; j < polynomial.length; j++) {
      next[j] ^= polynomial[j];
      next[j + 1] ^= gfMultiply(polynomial[j], GF_EXP[i]);
    }
    polynomial = next;
  }

  GENERATOR_CACHE.set(degree, polynomial);
  return polynomial;
}

function reedSolomonRemainder(data, degree) {
  const generator = getGeneratorPolynomial(degree);
  const remainder = new Uint8Array(degree);

  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.copyWithin(0, 1);
    remainder[degree - 1] = 0;

    if (factor !== 0) {
      for (let i = 0; i < degree; i++) {
        remainder[i] ^= gfMultiply(generator[i + 1], factor);
      }
    }
  }

  return remainder;
}

function addErrorCorrection(data, version, ecl) {
  const totalCodewords = TOTAL_CODEWORDS[version];
  const ecTotal = ECC_CODEWORDS[ecl][version - 1];
  const dataTotal = totalCodewords - ecTotal;
  const blockCount = EC_BLOCKS[ecl][version - 1];

  // 二维码里各块的数据长度最多相差 1 个码字，较短的一组在前。
  const group2Count = totalCodewords % blockCount;
  const group1Count = blockCount - group2Count;
  const totalPerGroup1 = Math.floor(totalCodewords / blockCount);
  const dataPerGroup1 = Math.floor(dataTotal / blockCount);
  const dataPerGroup2 = dataPerGroup1 + 1;
  const ecPerBlock = totalPerGroup1 - dataPerGroup1;

  const dataBlocks = [];
  const ecBlocks = [];
  let offset = 0;

  for (let block = 0; block < blockCount; block++) {
    const length = block < group1Count ? dataPerGroup1 : dataPerGroup2;
    const chunk = data.subarray(offset, offset + length);
    dataBlocks.push(chunk);
    ecBlocks.push(reedSolomonRemainder(chunk, ecPerBlock));
    offset += length;
  }

  const result = new Uint8Array(totalCodewords);
  let index = 0;

  // 先交错数据码字，再交错纠错码字。交错是二维码抗局部污损的关键：
  // 一个块损坏时，坏掉的是分散在不同位置的码字。
  for (let i = 0; i < dataPerGroup2; i++) {
    for (let block = 0; block < blockCount; block++) {
      if (i < dataBlocks[block].length) result[index++] = dataBlocks[block][i];
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (let block = 0; block < blockCount; block++) {
      result[index++] = ecBlocks[block][i];
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// 矩阵绘制
// ---------------------------------------------------------------------------

function getBchDigit(value) {
  let digit = 0;
  while (value !== 0) {
    digit++;
    value >>>= 1;
  }
  return digit;
}

function getFormatBits(ecl, mask) {
  // L = 01，M = 00；低 3 位是掩码编号。
  const data = ((ecl === 'L' ? 1 : 0) << 3) | mask;
  let remainder = data << 10;
  const g15Bits = getBchDigit(FORMAT_G15);

  while (getBchDigit(remainder) >= g15Bits) {
    remainder ^= FORMAT_G15 << (getBchDigit(remainder) - g15Bits);
  }

  // 异或固定掩码，保证纠错级别与掩码的任何组合都不会得到全 0 格式串。
  return ((data << 10) | remainder) ^ FORMAT_G15_MASK;
}

function getVersionBits(version) {
  let remainder = version << 12;
  const g18Bits = getBchDigit(VERSION_G18);

  while (getBchDigit(remainder) >= g18Bits) {
    remainder ^= VERSION_G18 << (getBchDigit(remainder) - g18Bits);
  }

  return (version << 12) | remainder;
}

function writeFormatInfo(modules, reserved, size, ecl, mask) {
  const bits = getFormatBits(ecl, mask);

  for (let i = 0; i < 15; i++) {
    const dark = (bits >>> i) & 1;
    let row;
    let col;

    // 左上角竖排的一份格式信息。
    if (i < 6) {
      row = i;
      col = 8;
    } else if (i < 8) {
      row = i + 1;
      col = 8;
    } else {
      row = size - 15 + i;
      col = 8;
    }
    modules[row * size + col] = dark;
    reserved[row * size + col] = 1;

    // 右上/左下方向横排的另一份格式信息（内容相同，冗余放置）。
    if (i < 8) {
      row = 8;
      col = size - i - 1;
    } else if (i === 8) {
      row = 8;
      col = 7;
    } else {
      row = 8;
      col = 14 - i;
    }
    modules[row * size + col] = dark;
    reserved[row * size + col] = 1;
  }

  // 固定的「暗模块」，它不参与掩码，是扫描定位的基准之一。
  modules[(size - 8) * size + 8] = 1;
  reserved[(size - 8) * size + 8] = 1;
}

function writeVersionInfo(modules, reserved, size, version) {
  const bits = getVersionBits(version);

  for (let i = 0; i < 18; i++) {
    const dark = (bits >>> i) & 1;
    const row = Math.floor(i / 3);
    const col = (i % 3) + size - 11;

    modules[row * size + col] = dark;
    reserved[row * size + col] = 1;
    modules[col * size + row] = dark;
    reserved[col * size + row] = 1;
  }
}

function maskBit(mask, row, col) {
  switch (mask) {
    case 0: return (row + col) % 2 === 0;
    case 1: return row % 2 === 0;
    case 2: return col % 3 === 0;
    case 3: return (row + col) % 3 === 0;
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    case 7: return (((row * col) % 3) + ((row + col) % 2)) % 2 === 0;
    default: throw new Error(`[netease-qr] 非法掩码编号: ${mask}`);
  }
}

function applyMask(modules, reserved, size, mask) {
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const index = row * size + col;
      if (!reserved[index] && maskBit(mask, row, col)) {
        modules[index] ^= 1;
      }
    }
  }
}

// 掩码评分：N1 连续同色、N2 2×2 同色、N3 类似定位图案的 1:1:3:1:1、
// N4 黑色占比偏离 50%。四类惩罚相加，分数越低越容易被扫描器识别。
function getPenaltyN1(modules, size) {
  let points = 0;

  for (let row = 0; row < size; row++) {
    let last = modules[row * size];
    let run = 1;
    for (let col = 1; col < size; col++) {
      const value = modules[row * size + col];
      if (value === last) {
        run++;
      } else {
        if (run >= 5) points += 3 + (run - 5);
        last = value;
        run = 1;
      }
    }
    if (run >= 5) points += 3 + (run - 5);
  }

  for (let col = 0; col < size; col++) {
    let last = modules[col];
    let run = 1;
    for (let row = 1; row < size; row++) {
      const value = modules[row * size + col];
      if (value === last) {
        run++;
      } else {
        if (run >= 5) points += 3 + (run - 5);
        last = value;
        run = 1;
      }
    }
    if (run >= 5) points += 3 + (run - 5);
  }

  return points;
}

function getPenaltyN2(modules, size) {
  let count = 0;
  for (let row = 0; row < size - 1; row++) {
    for (let col = 0; col < size - 1; col++) {
      const sum = modules[row * size + col]
        + modules[row * size + col + 1]
        + modules[(row + 1) * size + col]
        + modules[(row + 1) * size + col + 1];
      if (sum === 0 || sum === 4) count++;
    }
  }
  return count * 3;
}

function getPenaltyN3(modules, size) {
  let points = 0;
  let rowBits = 0;
  let colBits = 0;

  // 两个 11 位窗口分别表示「1011101 + 0000」和「0000 + 1011101」。
  for (let i = 0; i < size; i++) {
    rowBits = 0;
    colBits = 0;
    for (let j = 0; j < size; j++) {
      rowBits = ((rowBits << 1) & 0x7ff) | modules[i * size + j];
      if (j >= 10 && (rowBits === 0x5d0 || rowBits === 0x05d)) points += 40;

      colBits = ((colBits << 1) & 0x7ff) | modules[j * size + i];
      if (j >= 10 && (colBits === 0x5d0 || colBits === 0x05d)) points += 40;
    }
  }

  return points;
}

function getPenaltyN4(modules) {
  let dark = 0;
  for (const value of modules) dark += value;
  const percent = (dark * 100) / modules.length;
  return Math.abs(Math.ceil(percent / 5) - 10) * 10;
}

function getPenalty(modules, size) {
  return getPenaltyN1(modules, size)
    + getPenaltyN2(modules, size)
    + getPenaltyN3(modules, size)
    + getPenaltyN4(modules);
}

function placeData(modules, reserved, size, codewords) {
  const totalBits = codewords.length * 8;
  let bitIndex = 0;
  let row = size - 1;
  let direction = -1;

  // 从右下角开始，两列一组蛇形向上/向下填充；第 6 列是竖直定时图案，
  // 必须跳过，所以遇到 col === 6 时多减一列。
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;

    for (;;) {
      for (let c = 0; c < 2; c++) {
        const targetCol = col - c;
        const index = row * size + targetCol;
        if (reserved[index]) continue;

        let dark = 0;
        if (bitIndex < totalBits) {
          dark = (codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1;
        }
        modules[index] = dark;
        bitIndex++;
      }

      row += direction;
      if (row < 0 || row >= size) {
        row -= direction;
        direction = -direction;
        break;
      }
    }
  }
}

function buildMatrix(codewords, version, ecl) {
  const size = version * 4 + 17;
  const modules = new Uint8Array(size * size);
  const reserved = new Uint8Array(size * size);

  const set = (row, col, value) => {
    const index = row * size + col;
    modules[index] = value ? 1 : 0;
    reserved[index] = 1;
  };

  // 三个定位图案。循环从 -1 到 7，多出来的一圈是分隔符（浅色）。
  const finderOrigins = [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ];
  for (const [originRow, originCol] of finderOrigins) {
    for (let dr = -1; dr <= 7; dr++) {
      const row = originRow + dr;
      if (row < 0 || row >= size) continue;
      for (let dc = -1; dc <= 7; dc++) {
        const col = originCol + dc;
        if (col < 0 || col >= size) continue;

        const dark = (dr >= 0 && dr <= 6 && (dc === 0 || dc === 6))
          || (dc >= 0 && dc <= 6 && (dr === 0 || dr === 6))
          || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4);
        set(row, col, dark);
      }
    }
  }

  // 横向和纵向定时图案，交替黑白。
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0;
    set(i, 6, dark);
    set(6, i, dark);
  }

  // 对齐图案：5×5，外圈深色、内圈浅色、中心深色。
  const alignment = ALIGNMENT_POSITIONS[version - 1];
  const lastAlignment = alignment.length - 1;
  for (let i = 0; i < alignment.length; i++) {
    for (let j = 0; j < alignment.length; j++) {
      if ((i === 0 && j === 0)
        || (i === 0 && j === lastAlignment)
        || (i === lastAlignment && j === 0)) {
        continue;
      }

      const centerRow = alignment[i];
      const centerCol = alignment[j];
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dark = Math.abs(dr) === 2
            || Math.abs(dc) === 2
            || (dr === 0 && dc === 0);
          set(centerRow + dr, centerCol + dc, dark);
        }
      }
    }
  }

  // 先写入一份占位格式信息，仅仅为了把这些位置标记成「保留」，
  // 避免稍后填数据或掩码时覆盖它们。
  writeFormatInfo(modules, reserved, size, ecl, 0);

  if (version >= 7) writeVersionInfo(modules, reserved, size, version);

  placeData(modules, reserved, size, codewords);

  // 逐个尝试 8 种掩码，选惩罚分最低的那个。评分时必须把格式信息也写进去，
  // 因为格式信息本身也会影响连续块和黑点比例。
  let bestMask = 0;
  let bestScore = Infinity;

  for (let mask = 0; mask < 8; mask++) {
    applyMask(modules, reserved, size, mask);
    writeFormatInfo(modules, reserved, size, ecl, mask);
    const score = getPenalty(modules, size);

    if (score < bestScore) {
      bestScore = score;
      bestMask = mask;
    }

    // 撤销这一轮的数据掩码；格式信息下一轮会被覆盖，不需要恢复。
    applyMask(modules, reserved, size, mask);
  }

  applyMask(modules, reserved, size, bestMask);
  writeFormatInfo(modules, reserved, size, ecl, bestMask);

  return { size, modules };
}

// ---------------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------------

function normalizeEcl(value) {
  const level = String(value).toUpperCase();
  if (level !== 'L' && level !== 'M') {
    throw new Error(`[netease-qr] 不支持的纠错级别 "${value}"，本实现只支持 L / M`);
  }
  return level;
}

function prepareSegments(text, ecl) {
  const raw = splitRawSegments(text);
  const rawNodes = raw.map((segment) => makeNode(segment.text, segment.mode));

  // 官方包先用「未优化分段」估一个版本，再用这个版本决定字符计数位宽，
  // 最后做一次最短路优化。估版本失败时用版本 10（本实现的最高版本）；
  // 版本 10–26 的字节/数字/大写字符计数位宽相同，所以对 1–10 的结果没有影响。
  const estimatedVersion = findBestVersion(rawNodes, ecl) || 10;
  const optimized = optimizeSegments(text, estimatedVersion, raw);
  const version = findBestVersion(optimized, ecl);

  if (!version) {
    const bytes = UTF8_ENCODER.encode(text).length;
    throw new RangeError(
      `[netease-qr] 内容过长：UTF-8 ${bytes} 字节，超出 ${ecl} 纠错下版本 1–10 的容量。`
      + ` 请缩短内容或降低纠错级别（byte 模式版本 10 的上限：L 271 字节 / M 213 字节）。`,
    );
  }

  return { version, segments: optimized };
}

/**
 * 把文本编码成二维码模块矩阵。
 *
 * @param {string} text
 * @param {{ ecl?: 'L'|'M' }} [opts]
 * @returns {{ size: number, modules: Uint8Array }} size 是模块边长，modules 长度 size*size，1 表示深色
 */
export function qrMatrix(text, opts = {}) {
  if (typeof text !== 'string') {
    throw new TypeError('[netease-qr] text 必须是字符串');
  }
  if (text.length === 0) {
    throw new Error('[netease-qr] 二维码内容不能为空');
  }

  const options = opts ?? {};
  const ecl = normalizeEcl(options.ecl ?? 'L');
  const { version, segments } = prepareSegments(text, ecl);
  const dataCodewords = createDataCodewords(segments, version, ecl);
  const codewords = addErrorCorrection(dataCodewords, version, ecl);
  const matrix = buildMatrix(codewords, version, ecl);

  return matrix;
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&apos;';
    }
  });
}

function normalizeSvgOptions(opts) {
  const options = opts ?? {};
  const size = options.size ?? 220;
  const margin = options.margin ?? 4;
  const dark = options.dark ?? '#000';
  const light = options.light ?? '#fff';
  const ecl = normalizeEcl(options.ecl ?? 'L');
  const label = options.label ?? '';

  if (!Number.isFinite(size) || size <= 0) {
    throw new Error('[netease-qr] size 必须是大于 0 的有限数字');
  }
  if (!Number.isInteger(margin) || margin < 0) {
    throw new Error('[netease-qr] margin 必须是非负整数（单位：模块数）');
  }
  if (typeof dark !== 'string' || typeof light !== 'string') {
    throw new Error('[netease-qr] dark / light 必须是 CSS 颜色字符串');
  }
  if (typeof label !== 'string') {
    throw new Error('[netease-qr] label 必须是字符串');
  }

  return { size, margin, dark, light, ecl, label };
}

/**
 * 生成可直接塞进 DOM 的完整 SVG。
 *
 * @param {string} text
 * @param {{ size?: number, margin?: number, dark?: string, light?: string, ecl?: 'L'|'M', label?: string }} [opts]
 * @returns {string}
 */
export function qrSvg(text, opts = {}) {
  const options = normalizeSvgOptions(opts);
  const { size: moduleCount, modules } = qrMatrix(text, { ecl: options.ecl });
  const fullSize = moduleCount + options.margin * 2;

  // 同一行连续的深色模块合并成一个 rect。这样 rect 数量最多等于深色模块数，
  // 通常远小于 size*size，同时保持每个模块都是完整的 1×1 单元。
  const rects = [];
  for (let row = 0; row < moduleCount; row++) {
    let col = 0;
    while (col < moduleCount) {
      if (modules[row * moduleCount + col] === 0) {
        col++;
        continue;
      }
      const start = col;
      while (col < moduleCount && modules[row * moduleCount + col] === 1) col++;
      rects.push(
        `<rect x="${start + options.margin}" y="${row + options.margin}"`
        + ` width="${col - start}" height="1" fill="${escapeXml(options.dark)}"/>`,
      );
    }
  }

  const title = options.label ? `<title>${escapeXml(options.label)}</title>` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${options.size}"`
    + ` height="${options.size}" viewBox="0 0 ${fullSize} ${fullSize}"`
    + ` shape-rendering="crispEdges">${title}`
    + `<rect x="0" y="0" width="${fullSize}" height="${fullSize}"`
    + ` fill="${escapeXml(options.light)}"/>`
    + `${rects.join('')}</svg>`;
}

/**
 * 生成 data:image/svg+xml;base64,...，方便直接作为 <img src> 或 CSS 背景。
 *
 * @param {string} text
 * @param {object} [opts] 与 qrSvg 相同
 * @returns {string}
 */
export function qrDataUrl(text, opts = {}) {
  const svg = qrSvg(text, opts);
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}
