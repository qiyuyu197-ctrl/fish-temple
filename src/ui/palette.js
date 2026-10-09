/**
 * ui/palette.js — 命令面板（Ctrl/⌘ + K）
 * ------------------------------------------------------------------
 * 索引来源（自动聚合，新增内容无需改这里）：
 *   · 导航页面（来自 router 已注册的视图）
 *   · 所有文章与公告
 *   · config/site.config.js 的 COMMANDS
 *   · 主题切换
 * 通过 main.js 注入的 ctx 调用播放器 / 画廊等能力，保持解耦。
 */

import { $, h, esc } from '../util/dom.js';
import { bus } from '../core/bus.js';
import { Router } from '../core/router.js';
import { Registry } from '../core/registry.js';
import { Posts, News, fmtDate } from '../core/store.js';
import { Theme } from '../core/theme.js';

let ctx = {};
let items = [];
let cursor = 0;
let filtered = [];
let open = false;

const ICONS = {
  page: '▤', post: '▦', news: '◆', cmd: '⌘', theme: '◐',
};

function buildIndex() {
  const out = [];

  Registry.nav.forEach((n, i) => out.push({
    group: 'PAGE', label: `${n.label} · ${n.cn || ''}`, sub: String(i + 1).padStart(2, '0'),
    icon: ICONS.page, search: `${n.label} ${n.cn || ''} ${n.id}`,
    run: () => ctx.navigate?.(n.path),
  }));

  Posts.published.slice(0, 60).forEach((p) => out.push({
    group: 'LOGS', label: p.title, sub: fmtDate(p.date),
    icon: ICONS.post, search: `${p.title} ${p.category} ${(p.tags || []).join(' ')}`,
    run: () => ctx.navigate?.(`#/logs/${p.id}`),
  }));

  News.published.slice(0, 40).forEach((p) => out.push({
    group: 'NOTICE', label: p.title, sub: fmtDate(p.date),
    icon: ICONS.news, search: `${p.title} ${p.category}`,
    run: () => ctx.navigate?.(`#/logs/${p.id}`),
  }));

  Registry.commands.forEach((c) => out.push({
    group: 'ACTION', label: c.label, sub: c.hint, icon: ICONS.cmd,
    search: `${c.label} ${c.id} ${c.hint || ''}`,
    run: () => c.run(ctx),
  }));

  Theme.list.forEach((t) => out.push({
    group: 'THEME', label: `主题 · ${t.label}`, sub: t.hint, icon: ICONS.theme,
    search: `theme ${t.label} ${t.hint} 主题`,
    run: () => Theme.set(t.id, { announce: true }),
  }));

  return out;
}

function score(item, q) {
  if (!q) return 1;
  const hay = item.search.toLowerCase();
  const idx = hay.indexOf(q);
  if (idx < 0) {
    // 允许分散匹配（fuzzy-lite）
    let i = 0;
    for (const ch of q) { i = hay.indexOf(ch, i); if (i < 0) return 0; i++; }
    return 1;
  }
  return 100 - Math.min(50, idx);
}

function paint() {
  const list = $('#cmdkList');
  if (!list) return;
  if (!filtered.length) {
    list.innerHTML = '<div class="cmdk__empty">没有匹配结果 · 试试「音乐」「主题」或公告标题</div>';
    $('#cmdkCount').textContent = '0 RESULT';
    return;
  }
  let html = '';
  let lastGroup = '';
  filtered.forEach((it, i) => {
    if (it.group !== lastGroup) {
      html += `<div class="cmdk__group">${esc(it.group)}</div>`;
      lastGroup = it.group;
    }
    html += `<div class="cmdk__item${i === cursor ? ' is-cursor' : ''}" data-i="${i}">
      <span class="cmdk__ico">${it.icon}</span>
      <span class="cmdk__label">${esc(it.label)}</span>
      <span class="cmdk__sub">${esc(it.sub || '')}</span>
    </div>`;
  });
  list.innerHTML = html;
  $('#cmdkCount').textContent = `${filtered.length} RESULT`;
  list.querySelector(`[data-i="${cursor}"]`)?.scrollIntoView({ block: 'nearest' });
}

function applyFilter(q) {
  const query = String(q || '').trim().toLowerCase();
  filtered = items
    .map((it) => ({ it, s: score(it, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.it.group.localeCompare(b.it.group))
    .map((x) => x.it);
  cursor = 0;
  paint();
}

function runCursor() {
  const it = filtered[cursor];
  if (!it) return;
  close();
  setTimeout(() => it.run(), 10);
}

export function openPalette(preset = '') {
  const root = $('#cmdk');
  if (!root) return;
  items = buildIndex();
  open = true;
  root.removeAttribute('hidden');
  const input = $('#cmdkInput');
  input.value = preset;
  applyFilter(preset);
  setTimeout(() => input.focus(), 30);
  document.body.classList.add('is-locked');
  bus.emit('cmd:open');
}

export function closePalette() {
  const root = $('#cmdk');
  if (!root || root.hasAttribute('hidden')) return;
  root.setAttribute('hidden', '');
  open = false;
  document.body.classList.remove('is-locked');
  bus.emit('cmd:close');
}

export const Palette = {
  init(context) {
    ctx = context || {};
    const root = $('#cmdk');
    const input = $('#cmdkInput');
    if (!root || !input) return;

    input.addEventListener('input', () => applyFilter(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); cursor = Math.min(filtered.length - 1, cursor + 1); paint(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cursor = Math.max(0, cursor - 1); paint(); }
      else if (e.key === 'Enter') { e.preventDefault(); runCursor(); }
      else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
    });

    $('#cmdkList')?.addEventListener('click', (e) => {
      const el = e.target.closest('.cmdk__item');
      if (!el) return;
      cursor = Number(el.dataset.i);
      runCursor();
    });
    $('#cmdkScrim')?.addEventListener('click', closePalette);

    $('#searchBtn')?.addEventListener('click', () => openPalette());

    window.addEventListener('keydown', (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        open ? closePalette() : openPalette();
        return;
      }
      if (e.key === 'Escape') closePalette();
      if (e.key === '/' && !open) {
        const tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
        e.preventDefault();
        openPalette();
      }
    });
  },
  open: openPalette,
  close: closePalette,
};
