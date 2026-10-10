/**
 * views/forum.js — 论坛（用户创作）
 * ==================================================================
 * 与「文章与公告」的分工（这也是页面上必须对用户讲清的一句话）：
 *   · #/logs   是**站点自己的**文章与公告，内容在仓库的 data/*.json 里，只有站长能改；
 *   · #/forum  只放**用户创作**，帖子存在服务端，作者本人（或站长）才能改自己的帖子。
 * 两者刻意不合并：前者是编辑内容、有草稿与分类，后者是 UGC、有作者与权限。
 *
 * 路由（都挂在同一个视图上，靠 params / query 分流）：
 *   #/forum               列表（搜索 + 加载更多）
 *   #/forum/<id>          详情
 *   #/forum?write=1       发新帖
 *   #/forum?edit=<id>     编辑自己的帖子
 *
 * 权限：界面只按"能不能改"来显示按钮，**真正的判定在服务端**（403）。
 * 所以即使有人手改 DOM 把按钮变出来，服务端也会拒绝 —— 界面会如实把 403 的话显示出来。
 *
 * 未启用账号功能（/api/auth/config 说 enabled=false）时：列表照旧可读，
 * 但不显示发帖入口，并明确写出"本站未启用账号功能"，而不是假装能发。
 */

import { $, esc, ICON } from '../util/dom.js';
import { bus } from '../core/bus.js';
import { Router } from '../core/router.js';
import { Auth } from '../plugins/auth.js';
import { Toast } from '../ui/toast.js';
import { viewhead, emptyState } from '../ui/bits.js';
import { render as mdRender } from '../util/markdown.js';
import { fmtRelative } from '../core/store.js';

const PAGE_SIZE = 10;

let state = {
  posts: [],
  total: 0,
  limit: PAGE_SIZE,
  q: '',
  loading: false,
  error: '',
  loaded: false,
};

/** 详情页单独缓存一条，避免编辑保存后还要再取一次 */
let cache = { id: '', post: null };

function reset() {
  state = { posts: [], total: 0, limit: PAGE_SIZE, q: '', loading: false, error: '', loaded: false };
}

/* ---------------- 数据 ---------------- */

async function loadList({ append = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  const offset = append ? state.posts.length : 0;
  const limit = append ? PAGE_SIZE : Math.max(state.limit, PAGE_SIZE);
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (state.q) qs.set('q', state.q);

  const r = await Auth.api(`/forum/posts?${qs.toString()}`);
  state.loading = false;
  state.loaded = true;

  if (!r.ok) {
    state.error = r.status === 404
      ? '服务端还没有提供论坛接口（/api/forum/posts）'
      : (r.error || '论坛暂时不可用');
    return false;
  }
  const list = r.data?.posts || [];
  state.posts = append ? [...state.posts, ...list] : list;
  state.total = Number(r.data?.total) || state.posts.length;
  state.error = '';
  return true;
}

async function loadPost(id) {
  if (cache.id === id && cache.post) return cache.post;
  const r = await Auth.api(`/forum/posts/${encodeURIComponent(id)}`);
  if (!r.ok || !r.data?.post) return null;
  cache = { id, post: r.data.post };
  return cache.post;
}

/* ---------------- 渲染片段 ---------------- */

function timeOf(post) {
  const t = post?.updatedAt && post.updatedAt !== post.createdAt ? post.updatedAt : post.createdAt;
  return fmtRelative ? fmtRelative(t) : String(t || '');
}

function authorName(post) {
  return post?.author?.name || post?.author?.email || '匿名';
}

/** 能不能改这条：作者本人，或站长（服务端仍会独立校验一遍） */
function canEdit(post) {
  if (!Auth.loggedIn || !post) return false;
  if (Auth.isOwner) return true;
  return !!post.author?.sub && post.author.sub === Auth.user?.sub;
}

function loginHintHTML(action = '发帖') {
  if (!Auth.enabled) {
    return `<p class="muted mono" style="font-size:var(--fs-xs)">本站未启用账号功能，暂时不能${esc(action)}。</p>`;
  }
  if (Auth.loggedIn) return '';
  return `<p class="muted mono" style="font-size:var(--fs-xs)">
    需要登录后才能${esc(action)}。<button class="btn btn--sm" id="forumLogin">${ICON.doc}登录 / 注册</button></p>`;
}

function postRowHTML(post, i) {
  const tags = (post.tags || []).slice(0, 4);
  return `<a class="forum__row" href="#/forum/${encodeURIComponent(post.id)}" data-post="${esc(post.id)}">
    <span class="forum__no mono">${String(i + 1).padStart(2, '0')}</span>
    <span class="forum__main">
      <b class="clamp-1">${esc(post.title || '（无标题）')}</b>
      <span class="forum__meta mono">
        ${esc(authorName(post))}${Auth.isOwner && post.author?.role === 'owner' ? ' <i class="forum__owner">站长</i>' : ''}
        · ${esc(timeOf(post))}
      </span>
    </span>
    ${tags.length ? `<span class="forum__tags">${tags.map((t) => `<span class="tag tag--muted">${esc(t)}</span>`).join('')}</span>` : ''}
    <span class="forum__arrow mono" aria-hidden="true">→</span>
  </a>`;
}

function listHTML() {
  const canWrite = Auth.enabled && Auth.loggedIn;
  const more = state.posts.length < state.total;
  return `${viewhead({
    title: 'FORUM',
    sub: '这里只放用户创作（发帖 / 讨论）。网站公告与文案在「文章与公告」板块，仅站长可改。',
    idx: 'MODULE / 08',
    meta: [
      { label: 'POSTS', value: String(state.total).padStart(2, '0'), id: 'forumTotal' },
      { label: 'ACCOUNT', value: Auth.enabled ? (Auth.loggedIn ? esc(Auth.user?.name || '已登录') : '未登录') : '未启用' },
    ],
    actions: canWrite
      ? `<button class="btn btn--signal" id="forumNew">${ICON.edit}写新帖</button>`
      : '',
  })}

  ${!Auth.enabled ? `<div class="forum__banner mono">
    <b>本站未启用账号功能</b>
    <span>可以浏览帖子；发帖 / 编辑需要服务端配置 Auth0 后才可用。</span>
  </div>` : ''}
  ${Auth.enabled && !Auth.loggedIn ? `<div class="forum__banner mono">
    <b>还没有登录</b>
    <span>浏览不需要登录；发帖、编辑自己的帖子需要登录。</span>
  </div>` : ''}
  ${Auth.loggedIn && Auth.notice && /过期/.test(Auth.notice) ? `<div class="forum__banner forum__banner--warn mono">
    <b>${esc(Auth.notice)}</b>
  </div>` : ''}

  <div class="forum__tools">
    <label class="forum__search">
      <span class="mono faint">SEARCH</span>
      <input id="forumQ" type="search" placeholder="搜索标题 / 正文 / 标签…" value="${esc(state.q)}" autocomplete="off" spellcheck="false" />
    </label>
    <button class="btn btn--sm" id="forumSearch">${ICON.search}搜索</button>
    ${state.q ? `<button class="btn btn--sm" id="forumClear">清空</button>` : ''}
    <span class="grow"></span>
    ${loginHintHTML('发帖')}
  </div>

  ${state.error
    ? `<div class="forum__banner forum__banner--warn mono"><b>${esc(state.error)}</b></div>`
    : ''}

  ${state.posts.length
    ? `<div class="forum__list">${state.posts.map(postRowHTML).join('')}</div>`
    : (state.loaded && !state.error
      ? emptyState({
        title: state.q ? '没有匹配的帖子' : '还没有人发帖',
        desc: state.q ? '换个关键词试试。' : '登录后可以在这里发第一帖。',
        icon: '▤',
      })
      : `<div class="forum__list forum__list--skeleton">${Array.from({ length: 3 }, () => '<div class="forum__row is-ghost"></div>').join('')}</div>`)}

  ${more ? `<div class="forum__more"><button class="btn btn--sm" id="forumMore">${ICON.arrow}加载更多（${state.posts.length} / ${state.total}）</button></div>` : ''}`;
}

function detailHTML(post) {
  if (!post) {
    return `${viewhead({ title: '帖子不存在', sub: '它可能已被作者或站长删除。', idx: 'MODULE / 08' })}
      <p><a class="btn btn--sm" href="#/forum" data-nav>← 回到论坛列表</a></p>`;
  }
  const editable = canEdit(post);
  const tags = post.tags || [];
  return `${viewhead({
    title: post.title || '（无标题）',
    sub: '',
    idx: 'FORUM / POST',
    meta: [
      { label: 'AUTHOR', value: authorName(post) },
      { label: 'UPDATED', value: timeOf(post) },
      { label: 'TAGS', value: String(tags.length).padStart(2, '0') },
    ],
    actions: `<a class="btn btn--sm" href="#/forum" data-nav>← 论坛列表</a>
      ${editable ? `<button class="btn btn--sm" id="forumEdit">${ICON.edit}编辑</button>
      <button class="btn btn--sm" id="forumDelete">${ICON.trash}删除</button>` : ''}`,
  })}

  <article class="forum__post">
    <div class="forum__postmeta mono">
      <span>${esc(authorName(post))}</span>
      ${post.author?.role === 'owner' ? '<i class="forum__owner">站长</i>' : ''}
      <span>·</span>
      <span>${esc(timeOf(post))}</span>
      ${post.author?.email ? `<span>·</span><span class="faint">${esc(post.author.email)}</span>` : ''}
    </div>
    ${tags.length ? `<div class="forum__posttags">${tags.map((t) => `<span class="tag tag--muted">${esc(t)}</span>`).join('')}</div>` : ''}
    <div class="prose">${mdRender(post.body || '').html}</div>
    ${!editable ? `<p class="muted mono" style="font-size:var(--fs-xs);margin-top:var(--sp-5)">
      只有作者本人或站长可以修改这篇内容。</p>` : ''}
  </article>`;
}

function composeHTML({ post = null, error = '' } = {}) {
  const editing = !!post;
  return `${viewhead({
    title: editing ? '编辑帖子' : '写新帖',
    sub: editing ? '只有作者本人或站长能保存修改。' : '发帖需要登录。标题必填，正文支持 Markdown。',
    idx: 'FORUM / WRITE',
    actions: `<a class="btn btn--sm" href="${editing ? `#/forum/${encodeURIComponent(post.id)}` : '#/forum'}" data-nav>取消</a>`,
  })}
  ${error ? `<div class="forum__banner forum__banner--warn mono"><b>${esc(error)}</b></div>` : ''}
  <form class="forum__form" id="forumForm">
    <label class="field">
      <span class="field__label k-label">标题</span>
      <input id="fTitle" type="text" maxlength="120" required value="${esc(post?.title || '')}" placeholder="一句话说清主题" />
    </label>
    <label class="field">
      <span class="field__label k-label">标签（逗号分隔，可空）</span>
      <input id="fTags" type="text" maxlength="200" value="${esc((post?.tags || []).join(', '))}" placeholder="随笔, 求助, 分享" />
    </label>
    <label class="field">
      <span class="field__label k-label">正文（Markdown）</span>
      <textarea id="fBody" rows="14" placeholder="支持 **粗体**、列表、代码块、> [!NOTE] 提示块…">${esc(post?.body || '')}</textarea>
    </label>
    <div class="forum__formacts">
      <button class="btn btn--signal" id="forumSubmit" type="submit">${ICON.dl}${editing ? '保存修改' : '发布'}</button>
      <span class="muted mono" style="font-size:var(--fs-2xs)">发布后作者本人（或站长）可以再次编辑或删除。</span>
    </div>
  </form>`;
}

/* ---------------- 视图 ---------------- */

export default {
  id: 'forum',
  title: '论坛',

  async render(ctx) {
    const id = ctx?.params?.[0] || '';
    const q = ctx?.query || {};

    if (q.write) return composeHTML({});
    if (q.edit) {
      const post = await loadPost(q.edit);
      if (!post) return composeHTML({ error: '这篇帖子不存在或已被删除' });
      if (!canEdit(post)) {
        return `${viewhead({ title: '无权编辑', sub: '只有作者本人或站长可以修改这篇内容。', idx: 'FORUM / WRITE' })}
          <p><a class="btn btn--sm" href="#/forum/${encodeURIComponent(post.id)}" data-nav>← 回到这篇帖子</a></p>`;
      }
      return composeHTML({ post });
    }
    if (id) return detailHTML(await loadPost(id));

    state.q = q.q || state.q || '';
    state.limit = PAGE_SIZE;
    await loadList();
    return listHTML();
  },

  mount(root, ctx) {
    const cleanups = [];
    const on = (el, type, fn) => { el?.addEventListener(type, fn); cleanups.push(() => el?.removeEventListener(type, fn)); };

    // 登录入口（列表页的提示里）
    on($('#forumLogin', root), 'click', () => Auth.login());
    on($('#forumNew', root), 'click', () => { location.hash = '#/forum?write=1'; });

    // 搜索：回车或点按钮都走一次路由（把关键词放进 query，便于分享 / 前进后退）
    const doSearch = () => {
      const v = $('#forumQ', root)?.value.trim() || '';
      location.hash = v ? `#/forum?q=${encodeURIComponent(v)}` : '#/forum';
    };
    on($('#forumSearch', root), 'click', doSearch);
    on($('#forumQ', root), 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
    on($('#forumClear', root), 'click', () => { state.q = ''; location.hash = '#/forum'; });

    // 加载更多：就地追加，不整页重绘（输入框里的关键词不会被打断）
    on($('#forumMore', root), 'click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = '加载中…';
      const ok = await loadList({ append: true });
      if (!ok) { btn.disabled = false; btn.textContent = '加载失败，点击重试'; return; }
      const list = $('.forum__list', root);
      if (list) list.innerHTML = state.posts.map(postRowHTML).join('');
      const more = $('.forum__more', root);
      if (state.posts.length >= state.total) { more?.remove(); }
      else {
        btn.disabled = false;
        btn.textContent = `加载更多（${state.posts.length} / ${state.total}）`;
      }
      const total = $('#forumTotal', root);
      if (total) total.textContent = String(state.total).padStart(2, '0');
    });

    // 详情页：编辑 / 删除
    on($('#forumEdit', root), 'click', () => {
      const id = ctx?.params?.[0];
      if (id) location.hash = `#/forum?edit=${encodeURIComponent(id)}`;
    });
    on($('#forumDelete', root), 'click', async (e) => {
      const id = ctx?.params?.[0];
      if (!id) return;
      if (!confirm('删除这篇帖子？此操作不可撤销。')) return;
      const btn = e.currentTarget;
      btn.disabled = true;
      const r = await Auth.api(`/forum/posts/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!r.ok) {
        btn.disabled = false;
        // 服务端会给出人话（例如"只有作者本人可以修改这篇内容"），照原样显示
        Toast.show(r.error || '删除失败', 'err');
        return;
      }
      cache = { id: '', post: null };
      Toast.ok('已删除');
      reset();
      location.hash = '#/forum';
    });

    // 发帖 / 编辑表单
    const form = $('#forumForm', root);
    on(form, 'submit', async (e) => {
      e.preventDefault();
      const btn = $('#forumSubmit', root);
      const title = $('#fTitle', root).value.trim();
      const body = $('#fBody', root).value;
      // 标签上限跟服务端一致（服务端是 6 个 × 24 字）：这里原来写 8，
      // 结果用户填 8 个会被服务端静默截到 6 个 —— 界面不提示、内容却少了，属于"看起来成功了"。
      const tags = $('#fTags', root).value.split(/[,，]/).map((s) => s.trim()).filter(Boolean).slice(0, 6);
      if (!title) { Toast.show('标题不能为空', 'err'); return; }
      if (!body.trim()) { Toast.show('正文不能为空', 'err'); return; }

      const editingId = ctx?.query?.edit;
      btn.disabled = true;
      const r = editingId
        ? await Auth.api(`/forum/posts/${encodeURIComponent(editingId)}`, { method: 'PATCH', body: { title, body, tags } })
        : await Auth.api('/forum/posts', { method: 'POST', body: { title, body, tags } });
      btn.disabled = false;

      if (!r.ok) {
        Toast.show(r.error || '保存失败', 'err');
        return;
      }
      const post = r.data?.post;
      cache = post ? { id: post.id, post } : { id: '', post: null };
      Toast.ok(editingId ? '已保存修改' : '已发布');
      reset();
      location.hash = post?.id ? `#/forum/${encodeURIComponent(post.id)}` : '#/forum';
    });

    // 登录状态变化后，列表页的"写新帖 / 请登录"要跟着变。
    // 这里靠路由重解析来重绘（视图重绘统一走 Router，避免自己拼 DOM 拼歪）。
    const onAuthChange = () => {
      const onList = !ctx?.params?.[0] && !ctx?.query?.write && !ctx?.query?.edit;
      if (onList) Router.resolve();
    };
    cleanups.push(bus.on('auth:user', onAuthChange));
    cleanups.push(bus.on('auth:ready', onAuthChange));

    return () => cleanups.forEach((fn) => { try { fn(); } catch { /* noop */ } });
  },
};
