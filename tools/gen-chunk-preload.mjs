#!/usr/bin/env node
/**
 * tools/gen-chunk-preload.mjs
 * 只给 app.bundle.js 的**静态依赖**加 modulepreload，不要把所有懒加载 chunk 都塞进首屏。
 * 这样首屏的 10 来个基础 chunk 可以和主入口并行下载，但 tools/onnx 之类仍然按需加载。
 */
import { promises as fs } from 'node:fs';

const START = '<!-- CHUNK-PRELOAD:START -->';
const END = '<!-- CHUNK-PRELOAD:END -->';

const bundle = await fs.readFile('app.bundle.js', 'utf8');
const deps = [...bundle.matchAll(/from\s*["'](\.\/chunks\/[^"']+)["']/g)]
  .map((m) => m[1])
  .filter((v, i, a) => a.indexOf(v) === i)
  .sort();

const tags = deps.map((d) => `<link rel="modulepreload" href="${d.replace(/^\.\//, '')}" />`).join('\n');
let html = await fs.readFile('index.html', 'utf8');
if (!html.includes(START) || !html.includes(END)) throw new Error('index.html 缺少 CHUNK-PRELOAD 标记');
html = html.replace(new RegExp(`${START}[\\s\\S]*?${END}`), `${START}\n${tags}\n${END}`);
await fs.writeFile('index.html', html, 'utf8');
console.log(`chunk preload: ${deps.length} 个静态依赖`);
