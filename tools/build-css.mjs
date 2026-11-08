#!/usr/bin/env node
/**
 * tools/build-css.mjs
 * 把 index.html 里的 14 个 stylesheet 合成一个 styles/app.bundle.css。
 * 主要目的不是省字节，而是省 GitHub Pages 上每个请求 1~2 秒的 RTT。
 * 输出必须放在 styles/，因为 CSS 里的 ../assets/... 相对路径要保持不变。
 */
import { promises as fs } from 'node:fs';

const ORDER = [
  'tokens.css', 'base.css', 'components.css', 'almanac.css', 'mobile.css',
  'authpanel.css', 'mine-room.css', 'leisure.css', 'download.css', 'ef.css',
  'comments.css', 'leaderboard.css', 'background-picker.css', 'patterns.css', 'saucenao.css',
  // 琉璃主题层必须排最后：它靠顺序 + html[data-theme^="liuli"] 覆盖前面所有表面配方，
  // 且规则全部关在主题选择器里，其它主题一条都吃不到。
  'liuli.css',
];

const parts = [];
for (const name of ORDER) {
  const text = await fs.readFile(`styles/${name}`, 'utf8');
  parts.push(`/* ==== ${name} ==== */\n${text}`);
}
const combined = parts.join('\n');
await fs.writeFile('styles/app.bundle.css', combined, 'utf8');

let html = await fs.readFile('index.html', 'utf8');
const lines = html.split(/\r?\n/);
const kept = [];
let inserted = false;
for (const line of lines) {
  if (/rel="stylesheet" href="styles\//.test(line) && !line.includes('app.bundle.css')) {
    if (!inserted) {
      kept.push('<link rel="stylesheet" href="styles/app.bundle.css" />');
      inserted = true;
    }
    continue;
  }
  kept.push(line);
}
html = kept.join('\n');
await fs.writeFile('index.html', html, 'utf8');
console.log(`css bundle: ${ORDER.length} -> styles/app.bundle.css (${Math.round(combined.length / 1024)}KB)`);
