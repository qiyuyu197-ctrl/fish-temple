/**
 * util/dom.js — 极简 DOM 助手
 * 只做三件事：选择、创建、事件委托。够用且零依赖。
 */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** 创建元素：h('div.card', { onclick }, [children]) */
export function h(tag, attrs = {}, children = []) {
  const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(tag);
  const el = document.createElement(m?.[1] || 'div');
  (m?.[2] || '').split(/(?=[.#])/).filter(Boolean).forEach((p) => {
    if (p[0] === '.') el.classList.add(p.slice(1));
    else el.id = p.slice(1);
  });
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = [el.className, v].filter(Boolean).join(' ');
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) return c.forEach(add);
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  add(children);
  return el;
}

/** HTML 转义，所有用户输入进入 innerHTML 前必须经过它 */
export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 事件委托 */
export function delegate(root, type, selector, fn) {
  root.addEventListener(type, (e) => {
    const t = e.target.closest(selector);
    if (t && root.contains(t)) fn(e, t);
  });
}

/** rAF 节流 */
export function rafThrottle(fn) {
  let queued = false;
  let lastArgs;
  return (...args) => {
    lastArgs = args;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fn(...lastArgs); });
  };
}

/** debounce */
export function debounce(fn, ms = 180) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** 元素内联 SVG 图标库：按需扩充 */
export const ICON = {
  arrow: '<svg class="btn__ico" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.8"/></svg>',
  up: '<svg class="btn__ico" viewBox="0 0 24 24" fill="none"><path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" stroke-width="1.8"/></svg>',
  ext: '<svg class="btn__ico" viewBox="0 0 24 24" fill="none"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" stroke="currentColor" stroke-width="1.7"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none"><path d="M7 5l12 7-12 7V5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="none"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="none"><path d="M18 6v12L9 12l9-6zM6 6v12" stroke="currentColor" stroke-width="1.8"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 6v12l9-6-9-6zM18 6v12" stroke="currentColor" stroke-width="1.8"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" fill="none"><path d="M3 6h4l10 12h4M3 18h4L17 6h4M18 3l3 3-3 3M18 15l3 3-3 3" stroke="currentColor" stroke-width="1.6"/></svg>',
  repeat: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 10V8a2 2 0 012-2h11l-3-3M20 14v2a2 2 0 01-2 2H7l3 3" stroke="currentColor" stroke-width="1.6"/></svg>',
  vol: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 9h3l4-4v14l-4-4H4z" stroke="currentColor" stroke-width="1.6"/><path d="M15 9a4 4 0 010 6" stroke="currentColor" stroke-width="1.6"/></svg>',
  mute: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 9h3l4-4v14l-4-4H4z" stroke="currentColor" stroke-width="1.6"/><path d="M15 9l6 6M21 9l-6 6" stroke="currentColor" stroke-width="1.6"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none"><path d="M20 12a8 8 0 11-2.34-5.66M20 4v4h-4" stroke="currentColor" stroke-width="1.7"/></svg>',
  dl: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3v12M7 11l5 5 5-5M5 21h14" stroke="currentColor" stroke-width="1.7"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 20h4l10-10-4-4L4 16v4zM14 6l4 4" stroke="currentColor" stroke-width="1.6"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" stroke="currentColor" stroke-width="1.6"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none"><path d="M9 9h10v12H9zM5 3h10v4" stroke="currentColor" stroke-width="1.6"/></svg>',
  search: '<svg class="btn__ico" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="1.8"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" stroke="currentColor" stroke-width="1.6"/><circle cx="8.5" cy="9.5" r="1.8" stroke="currentColor" stroke-width="1.4"/><path d="M4 17l5-5 4 4 3-3 4 4" stroke="currentColor" stroke-width="1.6"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 3h8l4 4v14H6z" stroke="currentColor" stroke-width="1.6"/><path d="M9 12h6M9 16h6M9 8h3" stroke="currentColor" stroke-width="1.4"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 16V10a6 6 0 1112 0v6l2 2H4l2-2zM10 20h4" stroke="currentColor" stroke-width="1.6"/></svg>',
  music: '<svg viewBox="0 0 24 24" fill="none"><path d="M9 18V6l10-2v12" stroke="currentColor" stroke-width="1.6"/><circle cx="6.5" cy="18" r="2.5" stroke="currentColor" stroke-width="1.6"/><circle cx="16.5" cy="16" r="2.5" stroke="currentColor" stroke-width="1.6"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" stroke="currentColor" stroke-width="1.5"/></svg>',
  cmd: '<svg viewBox="0 0 24 24" fill="none"><path d="M9 6a3 3 0 10-3 3h12a3 3 0 10-3-3v12a3 3 0 103-3H6a3 3 0 103 3z" stroke="currentColor" stroke-width="1.5"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3.2" stroke="currentColor" stroke-width="1.6"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" stroke="currentColor" stroke-width="1.5"/></svg>',
  disc: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.4"/><path d="M12 3a9 9 0 019 9" stroke="currentColor" stroke-width="2.2"/></svg>',
  tools: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h9M19 7h1M4 12h3M13 12h7M4 17h11" stroke="currentColor" stroke-width="1.6"/><circle cx="16" cy="7" r="2" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="12" r="2" stroke="currentColor" stroke-width="1.5"/><circle cx="18" cy="17" r="2" stroke="currentColor" stroke-width="1.5"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8.5" r="3.6" stroke="currentColor" stroke-width="1.7"/><path d="M4.8 20c1.1-3.6 3.9-5.4 7.2-5.4S18.1 16.4 19.2 20" stroke="currentColor" stroke-width="1.7"/></svg>',
};
