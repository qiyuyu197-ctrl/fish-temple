#!/usr/bin/env node
/**
 * tools/gen-modulepreload.mjs
 * 把 src/ 下所有 ES 模块写进 index.html 的 modulepreload 段。
 *
 * 为什么需要：GitHub Pages 对静态文件有固定延迟，ES 模块图会一层一层发现
 * import，冷启动时 70+ 个模块要等十几秒。modulepreload 让浏览器一开始就
 * 并行拉整张图，避免「启动超时」的假象。
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const INDEX = path.join(ROOT, 'index.html');
const SRC = path.join(ROOT, 'src');
const START = '<!-- MODULEPRELOAD:START -->';
const END = '<!-- MODULEPRELOAD:END -->';

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = (await walk(SRC))
  .map((f) => path.relative(ROOT, f).split(path.sep).join('/'))
  .sort();
const tags = files.map((f) => `<link rel="modulepreload" href="${f}" />`).join('\n');
const block = `${START}\n${tags}\n${END}`;

let html = await fs.readFile(INDEX, 'utf8');
if (!html.includes(START) || !html.includes(END)) {
  throw new Error('index.html 缺少 MODULEPRELOAD 标记');
}
html = html.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block);
await fs.writeFile(INDEX, html, 'utf8');
console.log(`modulepreload: ${files.length} 个模块`);
