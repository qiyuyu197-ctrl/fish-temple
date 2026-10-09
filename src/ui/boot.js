/**
 * ui/boot.js — 启动序列
 * 纯装饰性的开机自检动画，播放一次后淡出；可通过 Settings 跳过。
 */

import { $ } from '../util/dom.js';

const LINES = [
  ['MOUNT', '核心模块挂载完成'],
  ['CONTENT', '内容仓库握手'],
  ['AUDIO', '初始化音频引擎'],
  ['GALLERY', '连接插画通道'],
  ['THEME', '载入视觉令牌'],
  ['READY', '终端就绪'],
];

export const Boot = {
  async run({ minDuration = 1150 } = {}) {
    const root = $('#boot');
    const log = $('#bootLog');
    const bar = $('#bootBar');
    const pct = $('#bootPct');
    if (!root || !log) return;

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      root.classList.add('is-done');
      return;
    }

    const started = performance.now();
    for (let i = 0; i < LINES.length; i++) {
      const [tag, text] = LINES[i];
      const line = document.createElement('div');
      line.innerHTML = `<b>[${tag}]</b> ${text}`;
      line.style.opacity = '0';
      line.style.transition = 'opacity 180ms ease';
      log.append(line);
      requestAnimationFrame(() => { line.style.opacity = '1'; });
      const p = Math.round(((i + 1) / LINES.length) * 100);
      if (bar) bar.style.width = `${p}%`;
      if (pct) pct.textContent = `${String(p).padStart(3, '0')}%`;
      await new Promise((r) => setTimeout(r, 130 + Math.random() * 130));
    }

    const elapsed = performance.now() - started;
    if (elapsed < minDuration) await new Promise((r) => setTimeout(r, minDuration - elapsed));
    root.classList.add('is-done');
    setTimeout(() => root.setAttribute('hidden', ''), 700);
  },
};
