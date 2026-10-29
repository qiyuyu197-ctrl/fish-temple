#!/usr/bin/env node
/**
 * app/desktop/scripts/package.mjs — 打成 Windows 便携版
 * ------------------------------------------------------------------
 * 产物：app/desktop/dist/FishTemple-win32-x64/
 *   FishTemple.exe          双击就用
 *   resources/app.asar      主进程代码（很小）
 *   resources/site/         站点 + server.mjs（断网可用的关键）
 *
 * 用 @electron/packager 而不是 electron-builder：不需要 NSIS、不需要下载额外的
 * 安装器工具链，产出一个绿色目录，压缩成 zip 就能挂在 GitHub Release 上。
 *
 * 用法：
 *   node scripts/package.mjs                 # 版本取 package.json
 *   node scripts/package.mjs --version=1.0.1 # 由 tag 传进来
 */
import { packager } from '@electron/packager';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, '..');
const SITE_DIR = path.join(APP_DIR, '.build', 'site');
const OUT_DIR = path.join(APP_DIR, 'dist');

const versionArg = process.argv.find((a) => a.startsWith('--version='));
const version = versionArg ? versionArg.split('=')[1] : '1.0.0';

const pkg = JSON.parse(await fs.readFile(path.join(APP_DIR, 'package.json'), 'utf8'));

if (!(await fs.stat(path.join(SITE_DIR, 'server.mjs')).catch(() => null))) {
  console.error('找不到 .build/site/server.mjs —— 先跑 node scripts/assemble-site.mjs');
  process.exit(1);
}

console.log(`打包 FishTemple ${version}（${pkg.devDependencies.electron}）…`);

const [out] = await packager({
  dir: APP_DIR,
  out: OUT_DIR,
  platform: 'win32',
  arch: 'x64',
  name: 'FishTemple',
  appVersion: version,
  icon: path.join(APP_DIR, 'icon.ico'),
  asar: true,
  prune: true,
  overwrite: true,
  // 站点单独作为 resources/site 放，不打进 asar：
  // asar 是虚拟文件系统，子进程里的 server.mjs 读不到里面的文件
  extraResource: [SITE_DIR],
  ignore: [
    /^\/scripts(\/|$)/,
    /^\/\.build(\/|$)/,
    /^\/dist(\/|$)/,
    /^\/node_modules\/\.cache(\/|$)/,
    /^\/README\.md$/,
    /^\/icon\.ico$/,
  ],
  win32metadata: {
    CompanyName: 'FISH TEMPLE',
    FileDescription: '鱼の灵庙 · 桌面版',
    ProductName: '鱼の灵庙',
    InternalName: 'FishTemple',
    OriginalFilename: 'FishTemple.exe',
  },
});

async function dirSize(p) {
  let total = 0;
  for (const entry of await fs.readdir(p, { withFileTypes: true })) {
    const full = path.join(p, entry.name);
    if (entry.isDirectory()) total += await dirSize(full);
    else total += (await fs.stat(full)).size;
  }
  return total;
}

// Electron 自带 50 多种语言包（locales/*.pak），一个几十 MB。
// 这个 App 只有中文界面，留中文 + 英文就够了，其余的删掉能省一大截。
const KEEP_LOCALES = new Set(['zh-CN.pak', 'zh-TW.pak', 'en-US.pak', 'en-GB.pak']);
const localesDir = path.join(out, 'locales');
let pruned = 0;
for (const name of await fs.readdir(localesDir).catch(() => [])) {
  if (KEEP_LOCALES.has(name)) continue;
  const full = path.join(localesDir, name);
  pruned += (await fs.stat(full)).size;
  await fs.rm(full, { force: true });
}
if (pruned) console.log(`  精简语言包：删掉 ${(pruned / 1024 / 1024).toFixed(0)} MB`);

const total = await dirSize(out);
console.log(`\n完成：${path.relative(process.cwd(), out)}  （${(total / 1024 / 1024).toFixed(0)} MB）`);
console.log(`可执行文件：${path.join(out, 'FishTemple.exe')}`);
