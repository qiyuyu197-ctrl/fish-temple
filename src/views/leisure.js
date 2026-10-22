/**
 * views/leisure.js — 文娱（当季新番 / 推荐动漫 / 我的追番）
 * ------------------------------------------------------------------
 * 路由： #/leisure          默认「当季新番」
 *        #/leisure?tab=picks 推荐动漫
 *        #/leisure?tab=mine  我的追番（只存在浏览器 localStorage）
 *        #/leisure?random=1  随机打开一部（命令面板用）
 *
 * 数据：  data/anime.json
 *    season       本季元信息（年份 / 季度 / 起止 / 说明）
 *    current[]    当季新番：放送日、时间、声优、简介、期待值
 *    recommended[] 推荐动漫：年份、话数、制作、评分、推荐理由
 *
 * 设计：  卡片封面不是外链图片，而是由 `poster` 字段驱动的「排版海报」：
 *         色相 + 一个几何母题 + 四种标题版式。这样离线可用、不依赖图床，
 *         也不会把别人的版权绘搬进仓库。海报系统见 styles/leisure.css 顶部注释。
 *
 * 交互：  搜索 / 类型筛选 / 排序 / 本周放送表 / 详情弹层 / 追番状态循环。
 *         追番写在 localStorage（key: ft.terminal.leisure.watch），
 *         只在这台设备上生效；数据结构是 { [animeId]: 'watching'|'plan'|'done' }。
 */

import { $, $$, esc } from '../util/dom.js';
import { STORAGE_PREFIX } from '../config/site.config.js';
import { viewhead, emptyState } from '../ui/bits.js';
import { Toast } from '../ui/toast.js';

const DATA_URL = 'data/anime.json';
const COVERS_URL = 'data/anime-covers.json';
const WATCH_KEY = `${STORAGE_PREFIX}.leisure.watch`;

const WEEK = [
  { n: 1, cn: '周一', ja: '月', en: 'MON' },
  { n: 2, cn: '周二', ja: '火', en: 'TUE' },
  { n: 3, cn: '周三', ja: '水', en: 'WED' },
  { n: 4, cn: '周四', ja: '木', en: 'THU' },
  { n: 5, cn: '周五', ja: '金', en: 'FRI' },
  { n: 6, cn: '周六', ja: '土', en: 'SAT' },
  { n: 7, cn: '周日', ja: '日', en: 'SUN' },
];

const WATCH_STATUS = {
  watching: { label: '在看', icon: '▶', order: 0 },
  plan: { label: '想看', icon: '◇', order: 1 },
  done: { label: '看完', icon: '✓', order: 2 },
};
/** 卡片右上角那颗按钮的循环：未加入 → 想看 → 在看 → 看完 → 移除 */
const WATCH_CYCLE = [null, 'plan', 'watching', 'done'];
const MARKS = ['orb', 'lines', 'blade', 'eye', 'dots', 'wave', 'plus', 'star'];
const LAYOUTS = ['a', 'b', 'c', 'd'];
const TABS = [
  { id: 'season', cn: '当季新番', en: 'SEASON' },
  { id: 'picks', cn: '推荐动漫', en: 'PICKS' },
  { id: 'mine', cn: '我的追番', en: 'WATCHLIST' },
];

let DATA = null;
let displayList = [];
let modalList = [];
let modalId = null;
let searchTimer = null;
let lastRandomId = '';

const state = { tab: 'season', q: '', genre: '全部', mine: '全部', sort: '' };

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

const pad = (n) => String(n).padStart(2, '0');
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const dayOf = (n) => WEEK.find((d) => d.n === Number(n)) || WEEK[0];
const todayN = () => { const d = new Date().getDay(); return d === 0 ? 7 : d; };
const scoreOf = (item) => Math.max(0, Math.min(10, num(item?.score, 0)));
const seasonLabel = () => (DATA?.season ? `${DATA.season.year} ${DATA.season.name}` : '当季');
const fmtAir = (s) => String(s || '').slice(0, 10).replace(/-/g, '.');
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
/** 今天是否已经开播（未写明首播日的按已开播处理） */
const hasAired = (item) => !item.premiere || String(item.premiere) <= todayKey();
const isLive = () => {
  const s = DATA?.season;
  if (!s?.start || !s?.end) return true;
  const now = Date.now();
  const start = Date.parse(`${s.start}T00:00:00+09:00`);
  const end = Date.parse(`${s.end}T23:59:59+09:00`);
  return Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end;
};

function scoreText(item) {
  return scoreOf(item).toFixed(1);
}

/** 卡片底部只放短标签（"ANILIST / 参考评分" → "参考评分"），完整来源留给详情 */
function scoreLabelShort(item) {
  if (item.scoreLabel) return String(item.scoreLabel).split('/').pop().trim();
  return item.kind === 'season' ? '期待' : '评分';
}

/** 全文搜索用的归一化字符串（标题 / 日文名 / 声优 / 类型 / 简介 / 推荐语） */
function searchText(item) {
  return [
    item.title, item.titleJa, item.posterJa, item.studio, item.station,
    item.hook, item.synopsis, item.note, item.audience,
    item.year, (item.genres || []).join(' '), (item.cast || []).join(' '),
  ].filter(Boolean).join(' ').toLowerCase();
}

/* ------------------------------------------------------------------ */
/* 追番状态（localStorage）                                            */
/* ------------------------------------------------------------------ */

function loadWatch() {
  try {
    const raw = localStorage.getItem(WATCH_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  } catch { return {}; }
}

let watch = loadWatch();

function saveWatch() {
  try { localStorage.setItem(WATCH_KEY, JSON.stringify(watch)); } catch { /* 隐私模式忽略 */ }
}

function pruneWatch() {
  if (!DATA) return;
  let changed = false;
  Object.keys(watch).forEach((id) => {
    if (!DATA.byId.has(id) || !WATCH_STATUS[watch[id]]) {
      delete watch[id];
      changed = true;
    }
  });
  if (changed) saveWatch();
}

/** 已追的条目，按「在看 → 想看 → 看完」再按标题排 */
function trackedItems() {
  if (!DATA) return [];
  return DATA.all
    .filter((it) => watch[it.id])
    .sort((a, b) => {
      const oa = WATCH_STATUS[watch[a.id]]?.order ?? 9;
      const ob = WATCH_STATUS[watch[b.id]]?.order ?? 9;
      return oa - ob || a.title.localeCompare(b.title, 'zh-Hans-CN');
    });
}

/* ------------------------------------------------------------------ */
/* 数据                                                                */
/* ------------------------------------------------------------------ */

async function loadData() {
  if (DATA) return DATA;
  const [res, coverRes] = await Promise.all([
    fetch(DATA_URL, { cache: 'no-cache' }),
    fetch(COVERS_URL, { cache: 'no-cache' }).catch(() => null),
  ]);
  if (!res.ok) throw new Error(`data/anime.json HTTP ${res.status}`);
  const json = await res.json();
  let covers = { items: {} };
  if (coverRes?.ok) {
    try { covers = await coverRes.json(); } catch { covers = { items: {} }; }
  }
  const coverOf = (id) => covers.items?.[id] || null;
  const withCover = (it, kind) => {
    const meta = coverOf(it.id);
    return { ...it, kind, cover: meta?.cover || '', coverMeta: meta, _search: searchText(it) };
  };
  const current = (json.current || []).map((it) => withCover(it, 'season'));
  const picks = (json.recommended || []).map((it) => withCover(it, 'pick'));
  const all = [...current, ...picks];
  DATA = { ...json, current, picks, all, byId: new Map(all.map((it) => [it.id, it])), coverMeta: covers };
  pruneWatch();
  return DATA;
}

/** 当前标签页的完整池子（不经过搜索 / 筛选） */
function poolItems() {
  if (!DATA) return [];
  if (state.tab === 'picks') return DATA.picks;
  if (state.tab === 'mine') return trackedItems();
  return DATA.current;
}

function effectiveSort() {
  return state.sort || (state.tab === 'season' ? 'day' : state.tab === 'mine' ? 'mine' : 'score');
}

function filteredItems() {
  let list = [...poolItems()];
  if (state.tab === 'mine' && state.mine !== '全部') {
    list = list.filter((it) => watch[it.id] === state.mine);
  }
  if (state.tab !== 'mine' && state.genre !== '全部') {
    list = list.filter((it) => (it.genres || []).includes(state.genre));
  }
  if (state.q) {
    const q = state.q.toLowerCase();
    list = list.filter((it) => it._search.includes(q));
  }

  const sort = effectiveSort();
  if (sort === 'date') list.sort((a, b) => String(a.premiere || '').localeCompare(String(b.premiere || '')));
  else if (sort === 'day') list.sort((a, b) => num(a.day, 9) - num(b.day, 9) || String(a.time || '').localeCompare(String(b.time || '')));
  else if (sort === 'year') list.sort((a, b) => num(b.year) - num(a.year));
  else if (sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'));
  else if (sort === 'mine') list.sort((a, b) => {
    const oa = WATCH_STATUS[watch[a.id]]?.order ?? 9;
    const ob = WATCH_STATUS[watch[b.id]]?.order ?? 9;
    return oa - ob || a.title.localeCompare(b.title, 'zh-Hans-CN');
  });
  else list.sort((a, b) => scoreOf(b) - scoreOf(a) || a.title.localeCompare(b.title, 'zh-Hans-CN'));
  return list;
}

/* ------------------------------------------------------------------ */
/* 海报（纯 CSS 排版封面）                                             */
/* ------------------------------------------------------------------ */

function posterHTML(item, { index = 0, lg = false } = {}) {
  const p = item.poster || {};
  const h = Math.round(Math.max(0, Math.min(360, num(p.h, 30))));
  const h2 = Math.round(Math.max(0, Math.min(360, num(p.h2, h + 40))));
  const accent = /^#[0-9a-f]{6}$/i.test(String(p.accent)) ? p.accent : '#ffd400';
  const mark = MARKS.includes(p.mark) ? p.mark : 'orb';
  const layout = LAYOUTS.includes(p.layout) ? p.layout : 'a';
  const rot = Math.max(-40, Math.min(40, num(p.rot, 0)));
  const jp = item.posterJa || item.titleJa || item.title || '';
  const jpCls = jp.length > 16 ? ' poster--jp-long' : jp.length > 10 ? ' poster--jp-mid' : '';
  const seasonTag = item.kind === 'pick'
    ? `${item.year || '—'} / PICK`
    : `${DATA?.season?.year || ''} / ${dayOf(item.day).en}`;
  const cover = item.cover
    ? `<img class="poster__cover" src="${esc(item.cover)}" alt="" ${lg ? 'loading="eager"' : 'loading="lazy"'} decoding="async" />`
    : '';

  return `<div class="poster${lg ? ' poster--lg' : ''}${cover ? ' poster--cover' : ''}${jpCls}"
      data-layout="${layout}" data-mark="${mark}"
      style="--p-h:${h};--p-h2:${h2};--p-accent:${accent};--p-rot:${rot}deg" aria-hidden="true">
    ${cover}
    <span class="poster__wash"></span>
    <span class="poster__grid"></span>
    <span class="poster__mark"><i></i></span>
    <span class="poster__ghost">${String(index + 1).padStart(2, '0')}</span>
    <span class="poster__jp" lang="ja">${esc(jp)}</span>
    <span class="poster__season">${esc(seasonTag)}</span>
    <span class="poster__type">${item.kind === 'pick' ? 'RECOMMENDED' : 'TV ANIMATION'}</span>
    <span class="poster__shine"></span>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* 卡片 / 筛选 / 放送表                                                */
/* ------------------------------------------------------------------ */

function cardHTML(item, i) {
  const w = watch[item.id];
  const st = w ? WATCH_STATUS[w] : null;
  const kicker = item.kind === 'season'
    ? `<span class="tag ${item.status === '续作' ? 'tag--signal' : 'tag--muted'}">${esc(item.status || '新作')}</span>
       <span class="acard__air mono">${dayOf(item.day).ja}曜 ${esc(item.time || '')}</span>`
    : `<span class="tag tag--signal">${esc(item.badge || '推荐')}</span>
       <span class="acard__air mono">${esc(item.year || '')} · ${esc(item.episodes || '')}</span>`;

  return `<article class="acard${w ? ' is-tracked' : ''}" data-id="${esc(item.id)}" style="--i:${i}">
    <div class="acard__poster">
      ${posterHTML(item, { index: i })}
      <button class="acard__open" type="button" data-open="${esc(item.id)}"
              aria-label="查看《${esc(item.title)}》详情"></button>
      <button class="acard__track${w ? ' is-tracked' : ''}" type="button" data-track="${esc(item.id)}"
              aria-pressed="${w ? 'true' : 'false'}"
              aria-label="${w ? `追番状态：${st.label}，点击切换` : '加入追番'}"
              title="${w ? `追番状态：${st.label}（点击切换）` : '加入追番'}">
        <span aria-hidden="true">${w ? st.icon : '＋'}</span>
      </button>
    </div>
    <div class="acard__body">
      <div class="acard__kicker">${kicker}</div>
      <h3 class="acard__title">${esc(item.title)}</h3>
      <p class="acard__hook clamp-2">${esc(item.hook || '')}</p>
      <div class="acard__foot">
        <span class="acard__score"><b>${scoreText(item)}</b><i>/10</i><em>${esc(scoreLabelShort(item))}</em></span>
        <span class="acard__genres mono">${(item.genres || []).slice(0, 2).map((g) => esc(g)).join(' / ')}</span>
      </div>
    </div>
  </article>`;
}

function filtersHTML() {
  if (!DATA) return '';
  if (state.tab === 'mine') {
    const counts = { '全部': trackedItems().length };
    Object.entries(WATCH_STATUS).forEach(([k]) => {
      counts[k] = trackedItems().filter((it) => watch[it.id] === k).length;
    });
    return [
      `<button class="chip${state.mine === '全部' ? ' is-on' : ''}" type="button" data-mine="全部">全部<b>${counts['全部']}</b></button>`,
      ...Object.entries(WATCH_STATUS).map(([k, v]) =>
        `<button class="chip${state.mine === k ? ' is-on' : ''}" type="button" data-mine="${k}">${v.label}<b>${counts[k]}</b></button>`),
    ].join('');
  }

  const counts = new Map();
  poolItems().forEach((it) => (it.genres || []).forEach((g) => counts.set(g, (counts.get(g) || 0) + 1)));
  const genres = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hans-CN'));
  return [
    `<button class="chip${state.genre === '全部' ? ' is-on' : ''}" type="button" data-genre="全部">全部<b>${poolItems().length}</b></button>`,
    ...genres.map(([g, n]) => `<button class="chip${state.genre === g ? ' is-on' : ''}" type="button" data-genre="${esc(g)}">${esc(g)}<b>${n}</b></button>`),
  ].join('');
}

function sortOptions() {
  if (state.tab === 'season') {
    return [['day', '放送日 · 周一→周日'], ['score', '期待值 · 高→低'], ['date', '首播日 · 早→晚'], ['title', '名称']];
  }
  if (state.tab === 'mine') {
    return [['mine', '追番状态'], ['score', '评分 · 高→低'], ['title', '名称']];
  }
  return [['score', '评分 · 高→低'], ['year', '年份 · 新→旧'], ['title', '名称']];
}

function sortHTML() {
  const current = effectiveSort();
  return sortOptions().map(([v, label]) =>
    `<option value="${v}"${current === v ? ' selected' : ''}>${esc(label)}</option>`).join('');
}

function weekHTML() {
  if (!DATA) return '';
  const today = todayN();
  const live = isLive();
  return `<section class="leisure-week" id="leisureWeek"${state.tab !== 'season' ? ' hidden' : ''}>
    <div class="leisure-week__head">
      <div>
        <span class="k-label">WEEKLY / ${live ? '本周放送' : '本季放送表'}</span>
        <p>按星期排好的放送表，点条目直接看详情${live ? '；标黄的是今天' : ''}。</p>
      </div>
      <span class="mono">${DATA.current.length} TITLES · ${esc(seasonLabel())}</span>
    </div>
    <div class="leisure-week__grid">
      ${WEEK.map((day) => {
        const items = DATA.current
          .filter((it) => Number(it.day) === day.n)
          .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
        return `<div class="lweek__day${live && day.n === today ? ' is-today' : ''}">
          <div class="lweek__head">
            <b>${day.ja}</b><span>${day.en}</span><em>${items.length}</em>
            ${live && day.n === today ? '<i>今日</i>' : ''}
          </div>
          <div class="lweek__list">
            ${items.length ? items.map((it) => `<button class="lweek__item${watch[it.id] ? ' is-tracked' : ''}"
                type="button" data-open="${esc(it.id)}" data-week-id="${esc(it.id)}">
                <span class="lweek__time mono">${esc(it.time || '')}</span>
                <span class="lweek__title">${esc(it.title)}</span>
              </button>`).join('') : '<p class="lweek__off mono">—</p>'}
          </div>
        </div>`;
      }).join('')}
    </div>
  </section>`;
}

function todayButtonsHTML() {
  const today = todayN();
  const items = DATA.current
    .filter((it) => Number(it.day) === today && hasAired(it))
    .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
  if (!items.length) {
    return '<p class="leisure-today__empty">今天没有收录作品在更新。<br />去推荐里翻一部？</p>';
  }
  return items.slice(0, 4).map((it) => `<button class="leisure-today__item" type="button" data-open="${esc(it.id)}">
    <span class="leisure-today__time mono">${esc(it.time || '')}</span>
    <span class="leisure-today__title">${esc(it.title)}</span>
    <span class="leisure-today__score mono">${scoreText(it)}</span>
  </button>`).join('');
}

function heroHTML() {
  const s = DATA.season || {};
  const live = isLive();
  const today = todayN();
  const nSequel = DATA.current.filter((it) => it.status === '续作').length;
  const nToday = live ? DATA.current.filter((it) => Number(it.day) === today && hasAired(it)).length : 0;

  return `<div class="leisure-hero">
    <div class="leisure-hero__stamp">
      <span class="leisure-hero__stamp-label mono">SEASON FILE</span>
      <span class="leisure-hero__year mono">${esc(s.year || '')}</span>
      <b class="leisure-hero__kanji">${esc(s.name || '季')}</b>
      <span class="leisure-hero__en mono">${esc(s.nameEn || '')}</span>
    </div>
    <div class="leisure-hero__copy">
      <span class="k-label">${live ? 'CURRENT SEASON / 当季' : 'ARCHIVE / 已完结'}</span>
      <h2 class="leisure-hero__title">
        <span class="leisure-hero__title-main">${esc(s.headline || '这一季，')}</span>
        <span class="leisure-hero__title-sub"><i aria-hidden="true">01</i>${esc(s.headlineEm || '看点什么？')}</span>
      </h2>
      <p class="leisure-hero__intro">${esc(s.intro || '')}</p>
      <div class="leisure-hero__stats">
        <div><b>${pad(DATA.current.length)}</b><span>本季收录</span></div>
        <div><b>${pad(nSequel)}</b><span>续作</span></div>
        <div><b>${pad(nToday)}</b><span>今日更新</span></div>
        <div><b>${pad(DATA.picks.length)}</b><span>编辑推荐</span></div>
      </div>
    </div>
    <aside class="leisure-hero__aside">
      <div class="leisure-hero__aside-head">
        <span class="k-label">${live ? `TODAY / ${dayOf(today).cn}` : 'SEASON ARCHIVE'}</span>
        <span class="mono">${live ? `${nToday} 部` : '补番'}</span>
      </div>
      <div class="leisure-today">${live ? todayButtonsHTML() : '<p class="leisure-today__empty">本季已完结。<br />下面按放送日整理好了，慢慢补。</p>'}</div>
      <button class="leisure-hero__all mono" type="button" data-week-jump>WEEKLY TABLE <span>↓</span></button>
    </aside>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* 详情弹层                                                            */
/* ------------------------------------------------------------------ */

/** 封面 404 / 解码失败：退回 CSS 排版海报，而不是留一块破图 */
function dropBrokenCover(img) {
  const poster = img?.closest?.('.poster');
  poster?.classList.remove('poster--cover');
  img?.remove();
}

function scanCovers(root = document) {
  $$('.poster__cover', root).forEach((img) => {
    if (img.complete && img.naturalWidth === 0) dropBrokenCover(img);
  });
}

function watchButtonsHTML(id) {
  const cur = watch[id];
  return `<div class="amodal__watch-head">
      <span class="k-label">我的追番</span>
      <span class="mono" id="leisureModalWatchState">${cur ? WATCH_STATUS[cur].label : '未加入'}</span>
    </div>
    <div class="amodal__watchbtns">
      ${Object.entries(WATCH_STATUS).map(([k, v]) => `<button class="watchbtn${cur === k ? ' is-on' : ''}"
        type="button" data-watch="${k}" aria-pressed="${cur === k}"><span>${v.icon}</span>${v.label}</button>`).join('')}
    </div>
    ${cur
      ? '<button class="amodal__watchclear" type="button" data-watch="">✕ 从追番移除</button>'
      : '<p class="amodal__watchhint">选一个状态就记下来了；只保存在这台设备的浏览器里。</p>'}`;
}

function modalHTML(item, idx) {
  const isSeason = item.kind === 'season';
  const day = dayOf(item.day);
  const score = scoreOf(item);
  const facts = isSeason
    ? [
      ['放送', `${day.cn} ${item.time || ''}`],
      ['首播', fmtAir(item.premiere)],
      ['放送局', item.station || '—'],
      ['话数', item.episodes || '放送中'],
      ['类型', (item.genres || []).join(' / ')],
      ['声优', (item.cast || []).slice(0, 3).join(' / ')],
    ]
    : [
      ['年份', String(item.year || '—')],
      ['话数', item.episodes || '—'],
      ['制作', item.studio || '—'],
      ['类型', (item.genres || []).join(' / ')],
    ];

  return `<div class="amodal__grid">
    <div class="amodal__side">
      <div class="amodal__poster">${posterHTML(item, { index: idx, lg: true })}</div>
      <div class="amodal__watch" id="leisureModalWatch">${watchButtonsHTML(item.id)}</div>
      ${item.cover && item.coverMeta?.anilistUrl
        ? `<p class="amodal__credit mono">COVER / <a href="${esc(item.coverMeta.anilistUrl)}" target="_blank" rel="noopener noreferrer">AniList</a></p>`
        : ''}
    </div>
    <div class="amodal__main">
      <div class="amodal__eyebrow">
        <span class="tag tag--signal">${esc(isSeason ? (item.status || '新作') : (item.badge || '推荐'))}</span>
        <span class="mono">${isSeason
          ? `${esc(seasonLabel())} · ${day.ja}曜 ${esc(item.time || '')}`
          : `${esc(item.year || '')} · ${esc(item.episodes || '')}`}</span>
      </div>
      <h2 class="amodal__title" id="leisureModalTitle">${esc(item.title)}</h2>
      <p class="amodal__ja" lang="ja">${esc(item.titleJa || '')}</p>
      <p class="amodal__hook">${esc(item.hook || '')}</p>

      <div class="amodal__score">
        <b>${scoreText(item)}</b>
        <div class="amodal__score-body">
          <span class="k-label">${esc(item.scoreLabel || (isSeason ? 'EXPECTATION / 期待值' : 'FISH SCORE / 本站评分'))}</span>
          <span class="amodal__meter"><i style="width:${Math.round(score * 10)}%"></i></span>
          <span class="amodal__score-note">主观评分，不是评分网站数据</span>
        </div>
      </div>

      <p class="amodal__synopsis">${esc(item.synopsis || '')}</p>

      <blockquote class="amodal__note">
        <span class="k-label">${isSeason ? 'WHY / 值得看' : 'WHY / 推荐理由'}</span>
        <p>${esc(item.note || '')}</p>
        ${item.audience ? `<span class="amodal__audience">适合：${esc(item.audience)}</span>` : ''}
      </blockquote>

      <dl class="amodal__facts">
        ${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v || '—')}</dd></div>`).join('')}
      </dl>

      <div class="amodal__tags">${(item.genres || []).map((g) => `<span class="tag tag--muted">${esc(g)}</span>`).join('')}</div>

      <div class="amodal__actions">
        <a class="btn btn--sm" href="https://search.bilibili.com/all?keyword=${encodeURIComponent(item.title)}"
           target="_blank" rel="noopener noreferrer">B 站搜索 ↗</a>
        <a class="btn btn--sm btn--ghost" href="https://bgm.tv/subject_search/${encodeURIComponent(item.titleJa || item.title)}"
           target="_blank" rel="noopener noreferrer">Bangumi ↗</a>
        <button class="btn btn--sm btn--ghost" type="button" data-close>关闭</button>
      </div>

      <div class="amodal__pager">
        <button class="btn btn--sm btn--ghost" type="button" data-prev>← 上一部</button>
        <span class="mono">${idx + 1} / ${modalList.length}</span>
        <button class="btn btn--sm btn--ghost" type="button" data-next>下一部 →</button>
      </div>
    </div>
  </div>`;
}

function openModal(id, list = null) {
  const item = DATA?.byId.get(id);
  const dlg = $('#leisureModal');
  if (!item || !dlg) return;
  const source = list || (displayList.some((x) => x.id === id)
    ? displayList
    : item.kind === 'season'
      ? [...DATA.current].sort((a, b) => num(a.day, 9) - num(b.day, 9) || String(a.time).localeCompare(String(b.time)))
      : DATA.picks);
  modalList = source;
  modalId = id;
  const idx = Math.max(0, modalList.findIndex((x) => x.id === id));
  const body = $('#leisureModalBody');
  if (!body) return;
  body.innerHTML = modalHTML(item, idx);
  if (!dlg.open) dlg.showModal();
  document.documentElement.classList.add('leisure-modal-open');
  const panel = dlg.querySelector('.amodal');
  if (panel) panel.scrollTop = 0;
  scanCovers(body);
  dlg.querySelector('[data-close]')?.focus({ preventScroll: true });
}

function closeModal() {
  const dlg = $('#leisureModal');
  if (dlg?.open) dlg.close();
  document.documentElement.classList.remove('leisure-modal-open');
  modalId = null;
}

function stepModal(dir) {
  if (!modalList.length) return;
  const i = modalList.findIndex((x) => x.id === modalId);
  const next = modalList[(i + dir + modalList.length) % modalList.length];
  if (next) openModal(next.id, modalList);
}

function renderModalWatch(id) {
  const host = $('#leisureModalWatch');
  if (host) host.innerHTML = watchButtonsHTML(id);
}

/* ------------------------------------------------------------------ */
/* 状态与重绘                                                          */
/* ------------------------------------------------------------------ */

function refreshSummary() {
  const n = trackedItems().length;
  const meta = $('#leisureWatchMeta');
  if (meta) meta.textContent = pad(n);
  $$('[data-tab]').forEach((btn) => {
    const b = btn.querySelector('b');
    if (!b) return;
    const key = btn.dataset.tab;
    if (!DATA) return;
    b.textContent = pad(key === 'season' ? DATA.current.length : key === 'picks' ? DATA.picks.length : n);
  });
  const clear = $('#leisureClear');
  if (clear) clear.hidden = n === 0;
}

function paint({ focusTrack = null } = {}) {
  const grid = $('#leisureGrid');
  if (!grid || !DATA) return;
  displayList = filteredItems();
  grid.innerHTML = displayList.length
    ? displayList.map((it, i) => cardHTML(it, i)).join('')
    : emptyState({
      title: state.tab === 'mine' ? '还没有追任何一部' : '没有匹配的作品',
      desc: state.tab === 'mine'
        ? '在卡片右上角点「＋」，或者打开详情选一个追番状态。'
        : '试试清空搜索词，或者换一个类型。',
      icon: '▤',
    });

  const count = $('#leisureCount');
  if (count) count.textContent = `${pad(displayList.length)} / ${pad(poolItems().length)} TITLES`;
  // 「我的追番」的状态筛选计数会随追番变化，重画一遍筛选条
  if (state.tab === 'mine') {
    const filters = $('#leisureFilters');
    if (filters) filters.innerHTML = filtersHTML();
  }
  $$('[data-week-id]').forEach((el) => el.classList.toggle('is-tracked', Boolean(watch[el.dataset.weekId])));
  refreshSummary();

  if (focusTrack) {
    const btn = $(`[data-track="${CSS.escape(focusTrack)}"]`);
    btn?.focus({ preventScroll: true });
  }
}

function cycleWatch(id) {
  const item = DATA?.byId.get(id);
  if (!item) return;
  const cur = watch[id] || null;
  const next = WATCH_CYCLE[(WATCH_CYCLE.indexOf(cur) + 1) % WATCH_CYCLE.length];
  if (next) watch[id] = next; else delete watch[id];
  saveWatch();
  Toast.ok(next ? `《${item.title}》· ${WATCH_STATUS[next].label}` : `已从追番移除《${item.title}》`);
  paint({ focusTrack: id });
  if (modalId === id) renderModalWatch(id);
}

function setWatch(id, status) {
  const item = DATA?.byId.get(id);
  if (!item) return;
  if (status && WATCH_STATUS[status]) watch[id] = status; else delete watch[id];
  saveWatch();
  Toast.ok(status ? `《${item.title}》· ${WATCH_STATUS[status].label}` : `已从追番移除《${item.title}》`);
  paint();
  if (modalId === id) renderModalWatch(id);
}

function syncUrl() {
  const q = state.tab === 'season' ? '' : `?tab=${state.tab}`;
  history.replaceState(null, '', `#/leisure${q}`);
}

function setTab(tab) {
  if (!TABS.some((t) => t.id === tab)) return;
  state.tab = tab;
  state.q = '';
  state.genre = '全部';
  state.mine = '全部';
  state.sort = '';
  const search = $('#leisureSearch');
  if (search) search.value = '';
  const filters = $('#leisureFilters');
  if (filters) filters.innerHTML = filtersHTML();
  const sort = $('#leisureSort');
  if (sort) sort.innerHTML = sortHTML();
  const week = $('#leisureWeek');
  if (week) week.hidden = tab !== 'season';
  $$('[data-tab]').forEach((btn) => {
    const on = btn.dataset.tab === tab;
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  paint();
  syncUrl();
}

function randomOpen() {
  const list = poolItems();
  if (!list.length) {
    Toast.show('这一栏还没有内容。');
    return;
  }
  let pick = list[Math.floor(Math.random() * list.length)];
  if (list.length > 1) {
    let guard = 0;
    while (pick.id === lastRandomId && guard++ < 12) {
      pick = list[Math.floor(Math.random() * list.length)];
    }
  }
  lastRandomId = pick.id;
  openModal(pick.id, [...list]);
}

/* ------------------------------------------------------------------ */
/* 视图                                                                */
/* ------------------------------------------------------------------ */

export default {
  id: 'leisure',
  title: '文娱',

  async render(ctx) {
    let data;
    try {
      data = await loadData();
    } catch (err) {
      return `<section class="leisure">
        ${viewhead({
          title: 'LEISURE',
          sub: '文娱档案：当季新番与私心推荐。',
          idx: 'MODULE / 09',
        })}
        <div class="empty" style="margin-top:var(--sp-6)">
          <b>番剧数据没读到</b>
          <p>请确认 <span class="mono">data/anime.json</span> 存在，并且是通过本地服务器访问（不是 file://）。</p>
          <pre class="mono" style="white-space:pre-wrap;font-size:11px;max-width:100%">${esc(err?.stack || err)}</pre>
        </div>
      </section>`;
    }

    const q = ctx?.query || {};
    // URL 是标签页的唯一真相：直接打开 #/leisure 就回到「当季新番」，
    // 带 ?tab=picks / ?tab=mine 才停在对应页签（可收藏、可分享）。
    const nextTab = TABS.some((t) => t.id === q.tab) ? q.tab : 'season';
    if (nextTab !== state.tab) {
      state.tab = nextTab;
      state.sort = '';
      state.genre = '全部';
      state.mine = '全部';
    }
    state.q = q.q || '';
    state.genre = '全部';
    state.mine = '全部';

    const data2 = data;
    const s = data2.season || {};
    const live = isLive();
    const tab = state.tab;
    const nWatch = trackedItems().length;

    return `<section class="leisure">
      ${viewhead({
        title: 'LEISURE',
        sub: '文娱档案：本季值得先看的番、十部随时可以重看的推荐，以及只存在这台设备上的追番标记。',
        idx: 'MODULE / 09',
        meta: [
          { label: 'SEASON', value: `${s.year || ''} ${s.nameEn || ''}`.trim() || '—' },
          { label: 'ON AIR', value: `${pad(data2.current.length)} TITLES` },
          { label: 'PICKS', value: `${pad(data2.picks.length)} TITLES` },
          { label: 'WATCH', value: pad(nWatch), id: 'leisureWatchMeta' },
        ],
        actions: `<span class="tag tag--muted">UPDATED ${esc(fmtAir(s.updated))}</span>`,
      })}

      ${heroHTML()}

      <div class="leisure-tabs" role="tablist" aria-label="文娱内容分类">
        ${TABS.map((t) => `<button class="leisure-tab${tab === t.id ? ' is-on' : ''}" type="button"
            role="tab" data-tab="${t.id}" aria-selected="${tab === t.id}"
            aria-controls="leisureGrid">
            <span class="leisure-tab__cn">${t.cn}</span>
            <span class="leisure-tab__en mono">${t.en}</span>
            <b>${pad(t.id === 'season' ? data2.current.length : t.id === 'picks' ? data2.picks.length : nWatch)}</b>
          </button>`).join('')}
        <button class="btn btn--sm leisure-random" type="button" id="leisureRandom">随机一部 ↗</button>
      </div>

      ${weekHTML()}

      <div class="leisure-toolbar">
        <div class="searchline leisure-search">
          <input type="search" id="leisureSearch" value="${esc(state.q)}"
                 placeholder="搜索番名 / 声优 / 类型 / 关键词…" autocomplete="off" spellcheck="false" />
        </div>
        <div class="leisure-filters" id="leisureFilters">${filtersHTML()}</div>
        <label class="leisure-sort">
          <span class="k-label">SORT</span>
          <select id="leisureSort">${sortHTML()}</select>
        </label>
        <button class="chip leisure-clear" type="button" id="leisureClear"${nWatch ? '' : ' hidden'}>清空追番</button>
        <span class="result-count" id="leisureCount">—</span>
      </div>

      <div class="leisure-grid" id="leisureGrid" aria-live="polite"></div>

      <p class="leisure-footnote">
        ${esc(s.note || '放送时间以关东地上波为准。')}
        番剧信息整理自 ${(data2.sources || []).map((src) => `<a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${esc(src.label)}</a>`).join(' · ')}。
        ${Object.keys(data2.coverMeta?.items || {}).length
          ? '封面图缓存自 <a href="https://anilist.co" target="_blank" rel="noopener noreferrer">AniList</a>，版权归原作者与制作方所有。'
          : ''}
        ${s.auto ? '本季列表由 AniList 自动整理，中文名 / 短评 / 声优持续补充中。' : ''}
        ${s.auto ? '自动条目的评分来自 AniList，仅供参考。' : '评分、期待值与推荐语为主观。'}
        追番状态只保存在这台设备里。${live ? '' : ' 本季已完结，页面保留为补番档案。'}
      </p>

      <dialog class="anime-modal" id="leisureModal" aria-labelledby="leisureModalTitle">
        <div class="amodal">
          <div class="amodal__bar">
            <span class="k-label">ANIME FILE / 作品档案</span>
            <button class="amodal__close" type="button" data-close aria-label="关闭">✕</button>
          </div>
          <div class="amodal__body" id="leisureModalBody"></div>
        </div>
      </dialog>
    </section>`;
  },

  mount(root, ctx) {
    if (!DATA) return;

    // 封面加载失败就退回排版海报（图片在弹层里才创建，所以用捕获阶段委托）
    root.addEventListener('error', (e) => {
      if (e.target?.classList?.contains('poster__cover')) dropBrokenCover(e.target);
    }, true);

    paint();
    scanCovers(root);

    // 搜索（防抖，输入时重绘卡片）
    const search = $('#leisureSearch', root);
    search?.addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.q = e.target.value.trim();
        paint();
      }, 150);
    });

    // 排序
    $('#leisureSort', root)?.addEventListener('change', (e) => {
      state.sort = e.target.value;
      paint();
    });

    // 清空追番
    $('#leisureClear', root)?.addEventListener('click', () => {
      if (!trackedItems().length) return;
      if (!window.confirm('清空全部追番记录？只影响这台设备。')) return;
      watch = {};
      saveWatch();
      paint();
      Toast.ok('已清空追番记录');
    });

    // 随机一部
    $('#leisureRandom', root)?.addEventListener('click', randomOpen);

    // 详情弹层：点背景关闭 / 键盘左右翻 / 关闭时解除滚动锁
    const dlg = $('#leisureModal', root);
    if (dlg) {
      dlg.addEventListener('click', (e) => { if (e.target === dlg) closeModal(); });
      dlg.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); stepModal(-1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); stepModal(1); }
      });
      dlg.addEventListener('close', () => {
        modalId = null;
        document.documentElement.classList.remove('leisure-modal-open');
      });
    }

    // 统一委托：标签 / 筛选 / 卡片 / 追番 / 弹层按钮
    root.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('[data-tab]');
      if (tabBtn) { setTab(tabBtn.dataset.tab); return; }

      const genre = e.target.closest('[data-genre]');
      if (genre) {
        state.genre = genre.dataset.genre;
        $$('[data-genre]', root).forEach((b) => b.classList.toggle('is-on', b === genre));
        paint();
        return;
      }

      const mine = e.target.closest('[data-mine]');
      if (mine) {
        state.mine = mine.dataset.mine;
        $$('[data-mine]', root).forEach((b) => b.classList.toggle('is-on', b === mine));
        paint();
        return;
      }

      const track = e.target.closest('[data-track]');
      if (track) {
        e.preventDefault();
        e.stopPropagation();
        cycleWatch(track.dataset.track);
        return;
      }

      const watchBtn = e.target.closest('[data-watch]');
      if (watchBtn) {
        e.preventDefault();
        setWatch(modalId, watchBtn.dataset.watch || null);
        return;
      }

      const prev = e.target.closest('[data-prev]');
      if (prev) { e.preventDefault(); stepModal(-1); return; }
      const next = e.target.closest('[data-next]');
      if (next) { e.preventDefault(); stepModal(1); return; }

      const close = e.target.closest('[data-close]');
      if (close) { e.preventDefault(); closeModal(); return; }

      const open = e.target.closest('[data-open]');
      if (open) { e.preventDefault(); openModal(open.dataset.open); return; }

      // 点子卡片任意位置也能打开详情（卡片里的按钮已经先一步 return）
      const card = e.target.closest('.acard');
      if (card?.dataset.id) { openModal(card.dataset.id); return; }

      // 跳回放送表（在推荐 / 追番页签时先切回当季）
      if (e.target.closest('[data-week-jump]')) {
        if (state.tab !== 'season') setTab('season');
        setTimeout(() => $('#leisureWeek', root)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      }
    });

    // 命令面板的 #/leisure?random=1
    if (ctx?.query?.random) {
      syncUrl();
      setTimeout(() => randomOpen(), 180);
    }

    return () => {
      clearTimeout(searchTimer);
      document.documentElement.classList.remove('leisure-modal-open');
    };
  },
};
