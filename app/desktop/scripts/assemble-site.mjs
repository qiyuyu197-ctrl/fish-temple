#!/usr/bin/env node
/**
 * app/desktop/scripts/assemble-site.mjs — 把站点装进桌面版
 * ------------------------------------------------------------------
 * 桌面版要「断网也能用」，所以不能像安卓壳那样只写个网址：
 * 站点文件 + server.mjs 必须真的躺在安装目录里。
 *
 * 复制规则：只拿运行时需要的东西。tools/、deploy/、app/、.git、截图都不进包。
 * 想瘦身又不在乎相册图的话加 --lite（跳过 assets/img，体积从 ~290MB 降到 ~50MB，
 * 代价是插画板块空白）。
 *
 * 用法：
 *   node scripts/assemble-site.mjs
 *   node scripts/assemble-site.mjs --lite
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, '..');            // app/desktop
const ROOT = path.resolve(APP_DIR, '..', '..');      // 仓库根目录
const OUT = path.join(APP_DIR, '.build', 'site');

const LITE = process.argv.includes('--lite');

/** 站点运行时需要的目录/文件（相对仓库根目录） */
const DIRS = [
  'src',
  'styles',
  'assets/icons',
  'assets/pwa',
  'assets/vendor',
  'assets/audio',
  ...(LITE ? [] : ['assets/img']),
];

const FILES = [
  'index.html',
  'manifest.webmanifest',
  'offline.html',
  'sw.js',
  // 服务端：/api/* 全靠这几个文件，缺一个音乐台就废了
  'server.mjs',
  'auth.mjs',
  'auth-local.mjs',
  'storage.mjs',
  'netease-eapi.mjs',
  'netease-login.mjs',
  'netease-qr.mjs',
];

const bytes = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

async function sizeOf(p) {
  const st = await fs.stat(p).catch(() => null);
  if (!st) return 0;
  if (st.isFile()) return st.size;
  let total = 0;
  for (const entry of await fs.readdir(p, { withFileTypes: true })) {
    total += await sizeOf(path.join(p, entry.name));
  }
  return total;
}

async function main() {
  console.log(`组装桌面版站点 → ${path.relative(ROOT, OUT)}${LITE ? '（lite：不含相册图）' : ''}`);
  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(OUT, { recursive: true });

  let total = 0;
  for (const rel of DIRS) {
    const from = path.join(ROOT, rel);
    if (!(await fs.stat(from).catch(() => null))) {
      console.warn(`  跳过（不存在）${rel}`);
      continue;
    }
    await fs.cp(from, path.join(OUT, rel), { recursive: true });
    const n = await sizeOf(path.join(OUT, rel));
    total += n;
    console.log(`  ${rel.padEnd(18)} ${bytes(n)}`);
  }

  for (const rel of FILES) {
    const from = path.join(ROOT, rel);
    if (!(await fs.stat(from).catch(() => null))) {
      console.warn(`  跳过（不存在）${rel}`);
      continue;
    }
    await fs.mkdir(path.dirname(path.join(OUT, rel)), { recursive: true });
    await fs.copyFile(from, path.join(OUT, rel));
    total += (await fs.stat(from)).size;
  }

  // 内容清单：只要 data 根目录下的 JSON（.backup / users / forum 这些是运行期数据，不进包）
  const dataOut = path.join(OUT, 'data');
  await fs.mkdir(dataOut, { recursive: true });
  for (const name of await fs.readdir(path.join(ROOT, 'data'))) {
    if (!name.endsWith('.json')) continue;
    const from = path.join(ROOT, 'data', name);
    const st = await fs.stat(from);
    if (!st.isFile()) continue;
    await fs.copyFile(from, path.join(dataOut, name));
    total += st.size;
  }
  console.log(`  ${'data/*.json'.padEnd(18)} ${bytes(await sizeOf(dataOut))}`);

  // 打包时给个标记，main.cjs 不读它，但排查「这个包是 lite 吗」很方便
  await fs.writeFile(path.join(OUT, 'DESKTOP-BUILD.txt'),
    `lite=${LITE}\nbuilt=${new Date().toISOString()}\n`, 'utf8');

  // ⚠️ 必须有这个 package.json：Node 靠 "type": "module" 才知道 src/ 下的 .js 是 ESM。
  //    少了它，server.mjs 里 `import ... from './src/plugins/comment-model.js'` 会把对方
  //    当成 CommonJS，直接 SyntaxError: Named export 'canDelete' not found（踩过）。
  await fs.writeFile(path.join(OUT, 'package.json'),
    JSON.stringify({ name: 'fish-temple-site', private: true, type: 'module' }, null, 2) + '\n', 'utf8');

  console.log(`\n合计 ${bytes(total)} → ${OUT}`);
}

main().catch((err) => {
  console.error('组装失败：', err);
  process.exit(1);
});
