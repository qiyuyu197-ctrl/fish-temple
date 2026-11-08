/**
 * core/theme.js — 主题与密度
 * 主题通过 <html data-theme="..."> 切换，所有颜色来自 tokens.css。
 * 每套主题在 THEMES 里用 scheme 声明深浅，主题切换时同步写 <html data-scheme>，
 * 供 CSS 与画布（stage-scenes.js）走统一的浅/深分支。
 * 新增主题只需在 tokens.css 添加变量块 + 在 site.config.js 的 THEMES 追加一项（含 scheme）。
 *
 * ⚠️ 主题分两条线，不要混：
 *   · 纯色主题 THEMES      —— 顶栏主题按钮 / 命令面板「主题」组只在这条线里循环
 *   · 琉璃主题 LIULI_THEMES —— 顶栏那颗水滴按钮只在这条线里切（夜 ⇄ 昼）
 * 琉璃是「从壁纸取色 + 磨砂玻璃」的另一套视觉语言，混进纯色循环里，
 * 每次进出都要点七八下。两边各自记住「上次停在哪一档」。
 */

import { THEMES, LIULI_THEMES, ALL_THEMES } from '../config/site.config.js';
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
  /** 纯色主题（命令面板的「主题」组、主题按钮都用这份） */
  list: THEMES,
  /** 琉璃主题（只在顶栏水滴按钮里循环） */
  liuliList: LIULI_THEMES,
  /** 当前是不是琉璃（夜 / 昼都算） */
  get isLiuli() {
    return String(this.current).startsWith('liuli');
  },
  /** 上次待过的琉璃那一档；水滴按钮从别的主题进来时回到它 */
  get lastLiuli() {
    const id = Settings.get('liuliTheme');
    return LIULI_THEMES.some((t) => t.id === id) ? id : LIULI_THEMES[0].id;
  },

  set(id, { announce = false } = {}) {
    // 解析用 ALL_THEMES：存档里可能存着琉璃，别被纯色列表挡回去
    const meta = ALL_THEMES.find((t) => t.id === id) || THEMES[0];
    document.documentElement.dataset.theme = meta.id;
    document.documentElement.dataset.scheme = meta.scheme || 'light';
    Settings.set('theme', meta.id);
    // 两条线各自记住最后停在哪
    if (meta.liuli) Settings.set('liuliTheme', meta.id);
    else Settings.set('lastSolidTheme', meta.id);
    const paper = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#EFEDE6';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', paper);
    // 安卓 App：状态栏 / 导航栏跟着主题走（网页里没有 FTNative，这一句自动跳过）。
    // 不做的话 themes.xml 里写死的纸色会一直压在暗色页面顶上。
    try {
      if (typeof window.FTNative?.setStatusBar === 'function') {
        window.FTNative.setStatusBar(paper, (meta.scheme || 'light') === 'light');
      }
    } catch { /* 原生侧不可用就算了 */ }
    if (announce) {
      bus.emit('toast', { message: `主题 · ${meta.label || meta.id}`, kind: 'ok' });
    }
    bus.emit('theme:change', { theme: meta.id, scheme: meta.scheme || 'light' });
    return meta.id;
  },

  /** 纯色主题循环。当前在琉璃时，从「上次那个纯色主题」的下一套开始 ——
   *  按一下主题按钮就是「离开琉璃」，而不是从列表头重来。 */
  cycle() {
    const i = THEMES.findIndex((t) => t.id === this.current);
    const saved = THEMES.findIndex((t) => t.id === Settings.get('lastSolidTheme'));
    const base = i >= 0 ? i : Math.max(0, saved);
    return this.set(THEMES[(base + 1) % THEMES.length].id, { announce: true });
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
