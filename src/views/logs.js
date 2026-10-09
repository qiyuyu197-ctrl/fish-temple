/**
 * views/logs.js — 文章 + 公告（合并板块）
 * ------------------------------------------------------------------
 * 原来 NOTICE 与 LOGS 是两个板块，内容却都是「按时间顺序的发布物」——
 * 一个读起来像列表，一个读起来像日志，切来切去很碎。现在合成一个：
 *
 *   #/logs            合并列表：类型筛选（全部 / 文章 / 公告）+ 分类 + 标签 + 搜索
 *   #/logs/<id>       详情：自动判断这条是文章还是公告，交给对应的渲染器
 *
 * 两类内容仍分别存在 data/posts.json 与 data/news.json（发布控制台照旧分开写），
 * 这里只是把它们在同一条时间线上混排 —— 数据结构不动，视图层合并。
 *
 * 旧链接（#/posts、#/news、#/post/<id>、#/newsItem/<id>）由 main.js 注册的重定向视图
 * 转到 /logs 系，不会 404。
 */

import { $, $$, esc } from '../util/dom.js';
import { Posts, News, ReadState, fmtDate } from '../core/store.js';
import { postCard, newsItem, viewhead, emptyState } from '../ui/bits.js';
import { Motion } from '../core/motion.js';
import postDetail from './post.js';
import newsDetail from './newsItem.js';

const PAGE_SIZE = 9;

let state = { q: '', cat: '全部', tag: '', kind: '全部', onlyUnread: false, limit: PAGE_SIZE };

/** 合并后的条目：带上来源，列表才知道该用哪套卡片渲染 */
function entries() {
  const posts = Posts.sorted.filter((p) => !p.draft).map((item) => ({ kind: 'post', item }));
  const news = News.sorted.filter((n) => !n.draft).map((item) => ({ kind: 'news', item }));
  return [...posts, ...news].sort((a, b) => new Date(b.item.date) - new Date(a.item.date));
}

function applyFilters(list) {
  return list
    .filter((e) => (state.kind === '全部' ? true : e.kind === state.kind))
    .filter((e) => (state.cat === '全部' ? true : e.item.category === state.cat))
    .filter((e) => (state.tag ? (e.item.tags || []).includes(state.tag) : true))
    .filter((e) => (state.onlyUnread ? (e.kind === 'news' && !ReadState.has(e.item.id)) : true))
    .filter((e) => {
      if (!state.q) return true;
      const it = e.item;
      const hay = `${it.title} ${it.summary} ${it.category} ${(it.tags || []).join(' ')} ${it.content}`.toLowerCase();
      return hay.includes(state.q.toLowerCase());
    });
}

/** 详情：按 id 判断来源，交给对应渲染器（两个渲染器本来就只认自己的集合） */
function detailOf(ctx) {
  const id = ctx?.params?.[0];
  if (!id) return null;
  if (Posts.get(id)) return { view: postDetail, item: Posts.get(id), kind: 'post' };
  if (News.get(id)) return { view: newsDetail, item: News.get(id), kind: 'news' };
  return { view: postDetail, item: null, kind: 'post' };   // 不存在：仍走文章详情的"未找到"分支
}

export default {
  id: 'logs',
  title: '文章与公告',

  titleFor(ctx) {
    const d = detailOf(ctx);
    if (!d) return '文章与公告';
    return d.item?.title || '内容不存在';
  },

  render(ctx) {
    const detail = detailOf(ctx);
    if (detail) return detail.view.render(ctx);

    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    if (params.get('cat')) state.cat = params.get('cat');
    if (params.get('tag')) state.tag = params.get('tag');
    if (params.get('q')) state.q = params.q ?? params.get('q');
    if (params.get('kind')) state.kind = params.get('kind');

    const all = entries();
    const cats = ['全部', ...new Set(all.map((e) => e.item.category).filter(Boolean))];
    const tags = [...new Set(all.flatMap((e) => e.item.tags || []))].slice(0, 14);
    const nPosts = all.filter((e) => e.kind === 'post').length;
    const nNews = all.length - nPosts;
    const unread = News.sorted.filter((n) => !n.draft && !ReadState.has(n.id)).length;

    return `
    <section class="logs">
      ${viewhead({
        title: 'FIELD LOGS',
        sub: '文章与公告合并成一条时间线：文章偏长读，公告偏快讯（带重要程度）。类型、分类、标签、关键词都能筛，置顶内容排最前。',
        idx: 'MODULE / 03',
        meta: [
          { label: 'TOTAL', value: `${String(all.length).padStart(2, '0')} ENTRIES` },
          { label: 'POSTS', value: String(nPosts).padStart(2, '0') },
          { label: 'NOTICES', value: String(nNews).padStart(2, '0') },
          { label: 'UNREAD', value: String(unread).padStart(2, '0'), id: 'logsUnread' },
        ],
        actions: `<a class="btn" href="#/admin?tab=posts&new=1" data-nav>+ 写内容</a>`,
      })}

      <div class="gallery__bar" style="margin-top:var(--sp-5)">
        <div class="searchline" style="flex:1 1 240px;max-width:400px">
          <input type="search" id="logsSearch" placeholder="搜索标题 / 摘要 / 标签 / 正文…" value="${esc(state.q)}" />
        </div>
        <div class="grid" style="grid-auto-flow:column;gap:6px;flex:0 0 auto">
          ${[['全部', '全部'], ['post', '文章'], ['news', '公告']].map(([v, label]) =>
            `<button class="chip${state.kind === v ? ' is-on' : ''}" data-kind="${v}">${label}</button>`).join('')}
        </div>
        <div class="grid" style="grid-auto-flow:column;gap:6px;overflow-x:auto;flex:1 1 auto">
          ${cats.map((c) => `<button class="chip${state.cat === c ? ' is-on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
        </div>
        <button class="chip${state.onlyUnread ? ' is-on' : ''}" id="logsUnreadOnly" aria-pressed="${state.onlyUnread}">只看未读</button>
        <span class="result-count" id="logsCount">—</span>
      </div>

      ${tags.length ? `<div class="grid" style="grid-auto-flow:column;gap:6px;overflow-x:auto;padding:var(--sp-3) 0">
        <span class="k-label" style="align-self:center">TAGS</span>
        ${tags.map((t) => `<button class="chip${state.tag === t ? ' is-on' : ''}" data-tag="${esc(t)}">#${esc(t)}</button>`).join('')}
      </div>` : ''}

      <div id="logsList" style="margin-top:var(--sp-5)"></div>
    </section>`;
  },

  mount(root, ctx) {
    const detail = detailOf(ctx);
    if (detail) return detail.view.mount?.(root, ctx);

    const paint = () => {
      const list = applyFilters(entries());
      const shown = list.slice(0, state.limit);
      const host = $('#logsList');
      if (!host) return;

      if (!shown.length) {
        host.innerHTML = emptyState({
          title: '没有匹配的内容',
          desc: state.onlyUnread ? '公告都读完了。' : '试试清空搜索词或切换类型 / 分类。',
          icon: '▤',
        });
      } else {
        // 置顶优先，其余按时间倒序：两类内容混在同一条流里
        const pinned = shown.filter((e) => e.item.pinned);
        const rest = shown.filter((e) => !e.item.pinned);
        const grid = (items) => `<div class="grid grid--3">${items.map((e, i) => (e.kind === 'news'
          ? `<div class="logs__news">${newsItem(e.item, { compact: true })}</div>`
          : postCard(e.item, { index: i }))).join('')}</div>`;
        host.innerHTML = `
          ${pinned.length ? `<div class="logs__pinned"><span class="k-label">PINNED</span>${grid(pinned)}</div>` : ''}
          ${rest.length ? grid(rest) : ''}
          ${list.length > state.limit
            ? `<div class="loadmore"><button class="btn" id="logsMore">加载更多 · 还有 ${list.length - state.limit} 条</button></div>`
            : ''}`;
      }

      const count = $('#logsCount');
      if (count) {
        count.textContent = `${String(list.length).padStart(2, '0')} / ${String(entries().length).padStart(2, '0')} ENTRIES`;
      }
      const unreadEl = $('#logsUnread');
      if (unreadEl) {
        unreadEl.textContent = String(News.sorted.filter((n) => !n.draft && !ReadState.has(n.id)).length).padStart(2, '0');
      }
      $('#logsMore')?.addEventListener('click', () => { state.limit += PAGE_SIZE; paint(); Motion.reveal(root); });
      Motion.reveal(host);
    };

    let timer;
    $('#logsSearch')?.addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.q = e.target.value.trim();
        state.limit = PAGE_SIZE;
        paint();
      }, 160);
    });

    root.addEventListener('click', (e) => {
      const kind = e.target.closest('[data-kind]');
      if (kind) {
        state.kind = kind.dataset.kind;
        $$('[data-kind]', root).forEach((b) => b.classList.toggle('is-on', b === kind));
        state.limit = PAGE_SIZE;
        paint();
        return;
      }
      const cat = e.target.closest('[data-cat]');
      if (cat) {
        state.cat = cat.dataset.cat;
        $$('[data-cat]', root).forEach((b) => b.classList.toggle('is-on', b === cat));
        state.limit = PAGE_SIZE;
        paint();
        return;
      }
      const tag = e.target.closest('[data-tag]');
      if (tag) {
        const t = tag.dataset.tag;
        state.tag = state.tag === t ? '' : t;
        $$('[data-tag]', root).forEach((b) => b.classList.toggle('is-on', b.dataset.tag === state.tag));
        state.limit = PAGE_SIZE;
        paint();
        return;
      }
      if (e.target.closest('#logsUnreadOnly')) {
        state.onlyUnread = !state.onlyUnread;
        e.target.closest('#logsUnreadOnly').classList.toggle('is-on', state.onlyUnread);
        state.limit = PAGE_SIZE;
        paint();
      }
    });

    paint();
  },
};
