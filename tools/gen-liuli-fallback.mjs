#!/usr/bin/env node
/**
 * tools/gen-liuli-fallback.mjs — 同步 styles/liuli.css 里的「静态兜底色板」
 * ------------------------------------------------------------------
 * 琉璃主题的颜色是运行时从壁纸取色派生的（src/ui/liuli.js + ui/liuli-color.js），
 * 但 JS 跑起来之前（以及 JS 挂了的时候）页面也得有一套能看的颜色，所以
 * styles/liuli.css 里写死了一份「默认源色 #1d9bf0」派生出来的兜底值。
 *
 * 这份值必须和派生逻辑保持一致 —— 手抄迟早会忘，所以用这个脚本生成：
 *
 *     node tools/gen-liuli-fallback.mjs
 *
 * 改完 src/ui/liuli-color.js 的 tone 表 / 彩度比例之后跑一次即可。
 * 只替换 [data-theme="liuli-day"] 与 [data-theme="liuli"] 两个块的内容，
 * 文件其它部分（材质配方、形状、动画）一个字都不动。
 */
import { promises as fs } from 'node:fs';
import { deriveTokens, LIULI_DEFAULT_SOURCE } from '../src/ui/liuli-color.js';

const TARGET = 'styles/liuli.css';

/**
 * 兜底块里写哪些变量、按什么顺序。
 * --bg / --bg-alt / --fg / --border 这些是 tokens.css 里指向 --paper* / --ink* / --line*
 * 的别名，不重复写；--bg-alt / --bg-sunk 的玻璃值由 liuli.css 的材质段落给。
 */
const KEYS = [
  '--paper', '--paper-2', '--paper-3', '--paper-sunk',
  '--ink', '--ink-2', '--ink-100', '--ink-80', '--ink-60', '--ink-40', '--ink-25', '--ink-12',
  '--signal', '--signal-deep', '--signal-ink', '--alert', '--ok', '--link',
  '--line', '--line-strong', '--line-soft',
  '--selection-bg', '--selection-fg', '--trace',
  '--console-bg', '--console-fg', '--console-muted', '--console-line',
  '--grid-line',
  '--liuli-source', '--liuli-brand-rgb',
  '--liuli-acrylic-rgb', '--liuli-acrylic-rgb-low', '--liuli-acrylic-rgb-high',
  '--liuli-control-rgb', '--liuli-stroke-rgb', '--liuli-shadow-rgb', '--liuli-veil-rgb',
];

function body(isDark) {
  const t = deriveTokens(LIULI_DEFAULT_SOURCE, isDark);
  const missing = KEYS.filter((k) => t[k] == null || t[k] === '');
  if (missing.length) throw new Error(`派生结果缺少这些变量：${missing.join(', ')}`);
  const lines = KEYS.map((k) => `  ${k}: ${t[k]};`);
  return [
    '  /* 由 tools/gen-liuli-fallback.mjs 生成，请勿手改。',
    `     源色 ${LIULI_DEFAULT_SOURCE}，共 ${KEYS.length} 个变量；运行时会被壁纸取色的结果覆盖。 */`,
    ...lines,
  ].join('\n');
}

const css = await fs.readFile(TARGET, 'utf8');
let out = css;
let changed = 0;

for (const [theme, isDark] of [['liuli-day', false], ['liuli', true]]) {
  // 只认行首的裸选择器：section 2 里的 html[data-theme="liuli-day"] 不会被误伤
  const re = new RegExp(`^\\[data-theme="${theme}"\\] \\{\\n[\\s\\S]*?^\\}`, 'm');
  if (!re.test(out)) throw new Error(`在 ${TARGET} 里找不到 [data-theme="${theme}"] 兜底块`);
  const next = out.replace(re, `[data-theme="${theme}"] {\n${body(isDark)}\n}`);
  if (next !== out) changed += 1;
  out = next;
}

if (out === css) {
  console.log(`liuli.css 兜底色板已是最新（${KEYS.length} 个变量 × 2 套）`);
} else {
  await fs.writeFile(TARGET, out, 'utf8');
  console.log(`已更新 ${TARGET}：${changed} 个兜底块 × ${KEYS.length} 个变量（源色 ${LIULI_DEFAULT_SOURCE}）`);
  console.log('  记得跑 node tools/build-css.mjs 重新合成 styles/app.bundle.css');
}
