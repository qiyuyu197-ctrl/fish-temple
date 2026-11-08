#!/usr/bin/env node
/**
 * tools/test-liuli-color.mjs — 琉璃色板派生自测
 * 跑法：node tools/test-liuli-color.mjs
 *
 * 核对三件事：
 *   1) 派生出来的颜色确实是「亮色偏亮、暗色偏暗」，且色相跟着源色走；
 *   2) 关键文字/底色组合的对比度过 WCAG AA（正文 4.5:1，大字 3:1）；
 *   3) 太灰的源色会回退默认蓝，不会派生出一套死灰色板。
 */
import {
  LIULI_DEFAULT_SOURCE,
  deriveTokens,
  chromaOfHex,
  contrastRatio,
  rgbToOklch,
  hexToRgb,
} from '../src/ui/liuli-color.js';

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  [ok]   ${name}${extra ? ` · ${extra}` : ''}`); }
  else { fail += 1; console.log(`  [FAIL] ${name}${extra ? ` · ${extra}` : ''}`); }
};

const SOURCES = ['#1d9bf0', '#e8567f', '#3fa46a', '#f0a92c', '#7c6ce6', '#c8452b'];

console.log('① 各源色派生结果（亮 / 暗）');
for (const src of SOURCES) {
  const l = deriveTokens(src, false);
  const d = deriveTokens(src, true);
  const hue = (hex) => Math.round(rgbToOklch(...hexToRgb(hex)).h);
  console.log(`  ${src}  亮: signal=${l['--signal']} bg=${l['--paper']} fg=${l['--fg']}  暗: signal=${d['--signal']} bg=${d['--paper']} fg=${d['--fg']}  色相 ${hue(src)}→${hue(l['--signal'])}/${hue(d['--signal'])}`);
}

console.log('\n② 色相一致性：派生的强调色应保留源色色相（±18°）');
for (const src of SOURCES) {
  const h0 = rgbToOklch(...hexToRgb(src)).h;
  for (const isDark of [false, true]) {
    const t = deriveTokens(src, isDark);
    const h1 = rgbToOklch(...hexToRgb(t['--signal'])).h;
    const diff = Math.min(Math.abs(h1 - h0), 360 - Math.abs(h1 - h0));
    ok(`${src} ${isDark ? '暗' : '亮'} signal 色相`, diff <= 18, `${h0.toFixed(0)}° → ${h1.toFixed(0)}°（差 ${diff.toFixed(0)}°）`);
  }
}

console.log('\n③ 明度方向：亮色主题的底要比暗色主题的底亮得多');
for (const src of SOURCES) {
  const l = deriveTokens(src, false);
  const d = deriveTokens(src, true);
  const lum = (hex) => rgbToOklch(...hexToRgb(hex)).l;
  ok(`${src} 底 L`, lum(l['--paper']) > 0.9 && lum(d['--paper']) < 0.25, `亮 ${lum(l['--paper']).toFixed(2)} / 暗 ${lum(d['--paper']).toFixed(2)}`);
  ok(`${src} 字 L`, lum(l['--ink-100']) < 0.35 && lum(d['--ink-100']) > 0.8, `亮 ${lum(l['--ink-100']).toFixed(2)} / 暗 ${lum(d['--ink-100']).toFixed(2)}`);
}

console.log('\n④ 对比度（WCAG AA：正文 ≥ 4.5，大字/图形 ≥ 3）');
for (const src of SOURCES) {
  for (const isDark of [false, true]) {
    const t = deriveTokens(src, isDark);
    const tag = `${src} ${isDark ? '暗' : '亮'}`;
    const body = contrastRatio(t['--ink-100'], t['--paper']);
    const panel = contrastRatio(t['--ink-100'], t['--paper-2']);
    const muted = contrastRatio(t['--ink-60'], t['--paper']);
    const onSignal = contrastRatio(t['--signal-ink'], t['--signal']);
    ok(`${tag} 正文/页底`, body >= 4.5, body.toFixed(2));
    ok(`${tag} 正文/面板`, panel >= 4.5, panel.toFixed(2));
    ok(`${tag} 次级文字/页底`, muted >= 4.5, muted.toFixed(2));
    ok(`${tag} 强调底上的字`, onSignal >= 3, onSignal.toFixed(2));
  }
}

console.log('\n⑤ 太灰的源色回退默认蓝');
const gray = deriveTokens('#808080', false);
ok('灰源色 → 默认色板', gray['--liuli-source'] === LIULI_DEFAULT_SOURCE || chromaOfHex(gray['--signal']) > 12, `signal=${gray['--signal']}`);
const defaultPal = deriveTokens(LIULI_DEFAULT_SOURCE, false);
ok('默认源色可派生', chromaOfHex(defaultPal['--signal']) >= 24, `signal=${defaultPal['--signal']}`);

console.log('\n⑥ 静态兜底色板：请用 node tools/gen-liuli-fallback.mjs 同步进 styles/liuli.css');
for (const isDark of [true, false]) {
  const t = deriveTokens(LIULI_DEFAULT_SOURCE, isDark);
  console.log(`  /* ${isDark ? '暗 liuli' : '昼 liuli-day'} */ ${Object.keys(t).length} 个变量 · signal=${t['--signal']} · paper=${t['--paper']} · ink-100=${t['--ink-100']}`);
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
