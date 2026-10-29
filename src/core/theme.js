/**
 * core/theme.js — 主题与密度
 * 主题通过 <html data-theme="..."> 切换，所有颜色来自 tokens.css。
 * 每套主题在 THEMES 里用 scheme 声明深浅，主题切换时同步写 <html data-scheme>，
 * 供 CSS 与画布（stage-scenes.js）走统一的浅/深分支。
 * 新增主题只需在 tokens.css 添加变量块 + 在 site.config.js 的 THEMES 追加一项（含 scheme）。
 */

import { THEMES } from '../config/site.config.js';
import { Settings } from './store.js';
import { bus } from './bus.js';

export const Theme = {
  get current() {
    return document.documentElement.dataset.theme || Settings.get('theme') || THEMES[0].id;
  },
  /** 'light' | 'dark' —— 当前主题的明暗模式 */
  get scheme() {
    return document.documentElement.dataset.scheme || 'light';
  },
  list: THEMES,

  set(id, { announce = false } = {}) {
    const meta = THEMES.find((t) => t.id === id) || THEMES[0];
    document.documentElement.dataset.theme = meta.id;
    document.documentElement.dataset.scheme = meta.scheme || 'light';
    Settings.set('theme', meta.id);
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#EFEDE6');
    if (announce) {
      bus.emit('toast', { message: `主题 · ${meta.label || meta.id}`, kind: 'ok' });
    }
    bus.emit('theme:change', { theme: meta.id, scheme: meta.scheme || 'light' });
    return meta.id;
  },

  cycle() {
    const idx = THEMES.findIndex((t) => t.id === this.current);
    return this.set(THEMES[(idx + 1) % THEMES.length].id, { announce: true });
  },

  setDensity(mode) {
    if (mode === 'normal') delete document.documentElement.dataset.density;
    else document.documentElement.dataset.density = mode;
    Settings.set('density', mode);
    bus.emit('theme:change', { density: mode });
  },

  init() {
    // 1) 显式设置 2) 系统偏好 3) 默认
    const saved = Settings.get('theme');
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const initial = saved || (prefersDark ? 'night' : THEMES[0].id);
    this.set(initial);
    if (Settings.get('density')) this.setDensity(Settings.get('density'));

    // 跟随系统（仅当用户未手动选择过）
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', (e) => {
      if (Settings.get('theme')) return;
      this.set(e.matches ? 'night' : THEMES[0].id);
    });
  },
};
