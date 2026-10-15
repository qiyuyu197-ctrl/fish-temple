#!/usr/bin/env node
/**
 * tools/qzone-import/build.mjs — 把采集结果变成站点数据（一次性工具，不参与站点运行）
 * ------------------------------------------------------------------
 * 输入：
 *   tools/qzone-import/albums.json      collect.js 在 QQ 相册页采集出来的清单
 *   tools/qzone-import/covers/*.jpg     你下载下来的封面（文件名 qzone-007.jpg = 清单第 7 条）
 * 输出：
 *   data/qzone-albums.json              站点"群相册"板块的数据（本地文件 ↔ 线上 Blobs 双驱动）
 *   assets/img/qzone/<序号>.jpg          拷进仓库的封面（不依赖 QQ，也不会裂图）
 *
 * 用法：
 *   node tools/qzone-import/build.mjs [--group 149796228] [--limit 0] [--dry]
 *
 * 设计取舍：
 *   · 封面**原样拷贝**，不在这里压缩 —— 先把流程跑通；压缩（转 WebP/限长边）另外一步做，
 *     免得"导入 + 处理"耦合在一起出错时不好判断是哪一步的问题。
 *   · 缺封面的相册也照样进数据（用空字符串），板块那边会画一个占位方块，不会整条丢掉。
 *   · 幂等：重复跑不会产生重复项（按相册链接去重），可以放心重跑。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const IN_JSON = path.join(HERE, 'albums.json');
const IN_COVERS = path.join(HERE, 'covers');
const OUT_JSON = path.join(ROOT, 'data', 'qzone-albums.json');
const OUT_COVERS = path.join(ROOT, 'assets', 'img', 'qzone');

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const GROUP = String(arg('group', '149796228'));
const LIMIT = Number(arg('limit', '0')) || 0;
const DRY = argv.includes('--dry');

const readJSON = (p, dflt) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return dflt; } };

const raw = readJSON(IN_JSON, null);
if (!Array.isArray(raw)) {
  console.error(`✗ 读不到 ${path.relative(ROOT, IN_JSON)}：请先用 tools/qzone-import/collect.js 采集（或手写一个数组）`);
  process.exit(1);
}

// 去重（按链接）+ 只保留有用字段
const seen = new Set();
let albums = [];
for (const it of raw) {
  const url = String(it?.url || '').trim();
  const key = url || String(it?.name || '') + String(it?.cover || '');
  if (!key || seen.has(key)) continue;
  seen.add(key);
  albums.push({
    name: String(it?.name || '').trim().slice(0, 60) || `相册 ${albums.length + 1}`,
    url,
    cover: String(it?.cover || '').trim(),
  });
}
if (LIMIT) albums = albums.slice(0, LIMIT);

// 拷封面：文件名里的序号 = 在（**去重前的原始清单**）里的位置；
// 去重会改变下标，所以这里按"原始顺序 → 去重后顺序"做一次映射，避免张冠李戴。
const indexMap = new Map();
{
  const s2 = new Set();
  let n = 0;
  raw.forEach((it, i) => {
    const url = String(it?.url || '').trim();
    const key = url || String(it?.name || '') + String(it?.cover || '');
    if (!key || s2.has(key)) return;
    s2.add(key);
    indexMap.set(i + 1, n);
    n += 1;
  });
}

let copied = 0;
let missing = 0;
if (fs.existsSync(IN_COVERS)) {
  const files = fs.readdirSync(IN_COVERS).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  if (!DRY) fs.mkdirSync(OUT_COVERS, { recursive: true });
  for (const f of files) {
    const m = /(\d+)/.exec(f);
    const seq = m ? Number(m[1]) : null;
    const target = seq !== null && indexMap.has(seq) ? indexMap.get(seq) : null;
    if (target === null || !albums[target]) { missing += 1; continue; }
    const ext = path.extname(f).toLowerCase();
    const outName = `${String(target + 1).padStart(3, '0')}${ext === '.jpeg' ? '.jpg' : ext}`;
    albums[target].cover = `assets/img/qzone/${outName}`;      // 数据里只记站内路径
    if (!DRY) fs.copyFileSync(path.join(IN_COVERS, f), path.join(OUT_COVERS, outName));
    copied += 1;
  }
}

const data = {
  group: GROUP,
  title: '群相册',
  note: '这些相册都在 QQ 群里。封面已搬到本站（不依赖 QQ，也不会裂图），点进去在 QQ 里看原图。',
  updatedAt: new Date().toISOString().slice(0, 10),
  albums,
};

if (!DRY) {
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

console.log(`${DRY ? '[dry] ' : ''}相册 ${albums.length} 条 · 有封面 ${albums.filter((a) => a.cover).length} 条`);
console.log(`封面拷贝 ${copied} 张${missing ? `（另有 ${missing} 张对不上序号，已跳过）` : ''}`);
console.log(`${DRY ? '（未写入）' : '✓ 已写'} ${path.relative(ROOT, OUT_JSON)}`);
if (!DRY) console.log(`✓ 封面目录 ${path.relative(ROOT, OUT_COVERS)}`);
console.log('提醒：封面进仓库后体积会长（319 张缩略图大概几 MB），需要压缩我再给一步。');
