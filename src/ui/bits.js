/**
 * ui/bits.js — 可复用展示片段
 * 所有返回 HTML 字符串的函数都在这里集中，便于统一改版式。
 * 输入一律经过 esc() 处理，例外：content / body 字段由 markdown 渲染器清洗。
 */

import { esc } from '../util/dom.js';
import { fmtDate, fmtRelative } from '../core/store.js';

/**
 * 正在播放的歌词（板块标题栏右侧那块空白）。
 * 内容由 ui/lyrics.js 在运行时填（#lyricCur / #lyricNext / #lyricLabel），
 * 没有曲目时整块隐藏 —— 所以这里只给出骨架，不读任何状态。
 */
export const lyricBox = () => `
  <button class="lyricbox" id="lyricBox" type="button" hidden
          title="点击查看完整歌词" aria-label="查看完整歌词">
    <span class="lyricbox__label mono" id="lyricLabel">NOW PLAYING</span>
    <span class="lyricbox__cur" id="lyricCur">—</span>
    <span class="lyricbox__next" id="lyricNext"></span>
  </button>`;

/**
 * 首页「正在播放」的波浪条：小封面 + 和底栏同款的音浪条（.mp-wave）。
 * 内容与动画由 ui/wave-row.js 驱动，没有曲目时整块 [hidden]。
 */
const HOME_WAVE_BARS = 40;

export const waveRow = () => `
  <div class="wave-row" hidden>
    <span class="wave-row__cover" aria-hidden="true"></span>
    <div class="mp-wave wave-row__wave" aria-hidden="true">
      <span class="mp-wave__mid"></span>
      ${'<i></i>'.repeat(HOME_WAVE_BARS)}
    </div>
  </div>`;

export const viewhead = ({ title, sub, idx, meta = [], actions = '' }) => `  <!-- meta 项可选带 id：值会随状态变化时（例如曲目数）便于就地更新 -->
  <header class="viewhead">
    <span class="viewhead__idx">${esc(idx || '')}</span>
    <div class="viewhead__row">
      <div>
        <h1 class="viewhead__title display">${esc(title)}</h1>
        ${sub ? `<p class="muted" style="margin:12px 0 0;max-width:70ch">${esc(sub)}</p>` : ''}
      </div>
      ${lyricBox()}
      ${actions ? `<div class="hero__cta" style="margin:0">${actions}</div>` : ''}
    </div>
    ${meta.length ? `<div class="viewhead__meta">${meta.map((m) => `
      <div><span class="k-label">${esc(m.label)}</span><b${m.id ? ` id="${esc(m.id)}"` : ''}>${m.html ? m.value : esc(m.value)}</b></div>`).join('')}</div>` : ''}
  </header>`;

export const tagRow = (tags = [], cls = '') =>
  tags.length ? `<div class="track__tags ${cls}">${tags.map((t) => `<span class="tag tag--muted">${esc(t)}</span>`).join('')}</div>` : '';

export const emptyState = ({ title = '暂无内容', desc = '', icon = '▤' } = {}) => `
  <div class="empty">
    <div class="mono" style="font-size:28px;color:var(--ink-25)">${esc(icon)}</div>
    <b>${esc(title)}</b>
    ${desc ? `<p>${esc(desc)}</p>` : ''}
  </div>`;

/** 文章卡片 */
export function postCard(item, { index = 0, href = null } = {}) {
  const url = href || `#/logs/${item.id}`;
  return `
    <a class="card" href="${url}" data-nav data-reveal data-reveal-delay="${Math.min(index * 60, 360)}">
      <span class="card__idx mono">${String(index + 1).padStart(2, '0')}</span>
      ${item.cover ? `<div class="card__thumb"><img src="${esc(item.cover)}" alt="${esc(item.title)}" loading="lazy" /></div>` : ''}
      <div class="card__body">
        <div class="card__meta">
          <span class="tag tag--signal">${esc(item.category)}</span>
          <span>${fmtDate(item.date)}</span>
          ${item.pinned ? '<span class="tag tag--alert">PINNED</span>' : ''}
        </div>
        <h3 class="card__title">${esc(item.title)}</h3>
        <p class="card__excerpt clamp-3">${esc(item.summary || '')}</p>
        <div class="card__foot">
          <span class="mono faint" style="font-size:var(--fs-2xs)">${item.stats?.minutes || 1} MIN READ</span>
          <span class="mono" style="font-size:var(--fs-2xs)">READ →</span>
        </div>
      </div>
    </a>`;
}

/** 文章列表行 */
export function postRow(item, { href = null, side = '' } = {}) {
  const url = href || `#/logs/${item.id}`;
  return `
    <a class="row" href="${url}" data-nav>
      <div class="row__date">
        <span>${fmtDate(item.date)}</span>
        <span class="faint">${fmtRelative(item.date)}</span>
      </div>
      <div class="row__main">
        <span class="row__title clamp-1">${item.pinned ? '<span class="tag tag--alert" style="margin-right:6px">PIN</span>' : ''}${esc(item.title)}</span>
        <span class="row__sub clamp-1">${esc(item.summary || '')}</span>
      </div>
      <div class="row__side">
        ${side || `<span class="tag tag--muted">${esc(item.category)}</span>`}
      </div>
    </a>`;
}

/** 公告条目 */
export function newsItem(item, { compact = false } = {}) {
  const levelCls = item.level >= 2 ? 'tag--alert' : item.level === 1 ? 'tag--signal' : 'tag--muted';
  const levelText = item.level >= 2 ? '紧急' : item.level === 1 ? '重要' : item.category;
  return `
    <a class="row${compact ? ' row--compact' : ''}" href="#/logs/${item.id}" data-nav>
      <div class="row__date">
        <span>${fmtDate(item.date)}</span>
        <span class="faint">${esc(item.category)}</span>
      </div>
      <div class="row__main">
        <span class="row__title clamp-1">${item.pinned ? '<span class="tag tag--alert" style="margin-right:6px">PIN</span>' : ''}${esc(item.title)}</span>
        <span class="row__sub clamp-2">${esc(item.summary || '')}</span>
      </div>
      <div class="row__side">
        <span class="tag ${levelCls}">${esc(levelText)}</span>
      </div>
    </a>`;
}

/** 分区标题 */
export const sectionHead = (no, title, linkHref, linkText) => `
  <div class="sect__head">
    <h2 class="sect__title display"><span class="sect__no">${esc(no)}</span>${esc(title)}</h2>
    ${linkHref ? `<a class="sect__link" href="${linkHref}" data-nav>${esc(linkText || 'VIEW ALL')} →</a>` : ''}
  </div>`;

/** 统计格 */
export const statBlock = (label, value, extra = '') => `
  <div class="hero__stat">
    <b class="tnum" ${extra}>${esc(String(value))}</b>
    <span>${esc(label)}</span>
  </div>`;

/** 由文章正文生成目录（使用 markdown render 返回的 toc） */
export const tocHTML = (toc = []) => (toc.length
  ? `<nav class="toc" aria-label="目录">${toc.map((t) =>
      `<a href="#${t.id}" class="toc--h${t.level}" data-toc>${esc(t.text)}</a>`).join('')}</nav>`
  : '<p class="faint mono" style="font-size:var(--fs-2xs)">无小节</p>');
