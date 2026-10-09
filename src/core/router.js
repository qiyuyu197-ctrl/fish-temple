/**
 * core/router.js — 视图路由
 * ------------------------------------------------------------------
 * 使用 hash 路由，保证在任意静态托管（含 file://）下都能直接工作。
 * 路径格式：#/post/abc123?tab=x#anchor
 *   → base   : 'post'      （第一段即视图 id，必须全局唯一）
 *   → params : ['abc123']  （后续段落作为参数）
 *   → query  : { tab: 'x' }
 *   → hash   : 'anchor'
 *
 * 注意：列表与详情请使用不同的 id，例如 posts（列表）/ post（详情），
 *      否则 #/posts/xxx 会先命中列表视图。
 *
 * 视图契约（每个 src/views/*.js 必须导出同名对象）：
 *   { id, title, render(ctx) -> string|Node, mount?(root, ctx), unmount?() }
 */

import { bus } from './bus.js';
import { $ } from '../util/dom.js';

const views = new Map();
let current = null;
let cleanup = null;

export function defineView(view) {
  if (!view?.id) throw new Error('view 必须有 id');
  views.set(view.id, view);
  return view;
}

export function hasView(id) { return views.has(id); }
export function viewList() { return [...views.values()]; }

/** 解析当前 location.hash */
export function parseHash(hash = location.hash) {
  const raw = String(hash || '').replace(/^#/, '');
  const [pathPart, anchor = ''] = raw.split('#');
  const [pathOnly, qs = ''] = pathPart.split('?');
  const segs = pathOnly.split('/').filter(Boolean).map(decodeURIComponent);
  const query = {};
  if (qs) new URLSearchParams(qs).forEach((v, k) => { query[k] = v; });
  return {
    base: segs[0] || 'home',
    params: segs.slice(1),
    query,
    anchor,
    raw: hash || '#/',
    path: pathPart || '/',
  };
}

export const Router = {
  get current() { return current; },
  get views() { return views; },

  navigate(to, { replace = false } = {}) {
    const target = to.startsWith('#') ? to : `#/${String(to).replace(/^\/+/, '')}`;
    if (location.hash === target) { this.resolve(); return; }
    if (replace) history.replaceState(null, '', target);
    else location.hash = target;
    if (replace) this.resolve();
  },

  back() { history.length > 1 ? history.back() : this.navigate('#/'); },

  async resolve() {
    const route = parseHash();
    const view = views.get(route.base) || views.get('notfound') || views.get('home');
    if (!view) return;

    // 卸载上一个视图
    try { cleanup?.(); } catch (e) { console.warn(e); }
    cleanup = null;

    current = { ...route, view: view.id };

    const stale = $('#view');
    if (!stale) return;
    // 每次渲染都换一个全新的 #view 节点。
    // 原因：视图普遍用 root.addEventListener() 做事件委托，如果复用同一个节点，
    // 监听器会随访问次数累积 —— 表现为「访问过 N 次之后，点一下触发 N 次」。
    // 已实测的后果：画廊点一张相册图会同时弹出 N 个灯箱；音乐台点「移除」会一次删掉 N 首。
    // 换节点等于把旧节点的监听器一起丢掉，比要求每个视图自己解绑更不容易漏。
    const mount = stale.cloneNode(false);
    stale.replaceWith(mount);

    let html = '';
    try {
      html = (await view.render({ ...route, view: view.id })) ?? '';
    } catch (err) {
      console.error('[router] render 失败', err);
      html = `<section class="viewhead"><div class="viewhead__row"><h1 class="viewhead__title display">渲染失败</h1></div>
        <pre class="mono" style="white-space:pre-wrap;margin-top:16px">${String(err?.stack || err)}</pre></section>`;
    }

    mount.innerHTML = html;
    mount.classList.remove('is-swapping');
    // 触发重排以重启动画
    void mount.offsetWidth;
    mount.classList.add('is-swapping');

    if (route.anchor) {
      const el = document.getElementById(route.anchor);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    try {
      cleanup = (await view.mount?.(mount, { ...route, view: view.id })) || null;
    } catch (err) {
      console.error('[router] mount 失败', err);
    }

    // 优先使用视图提供的动态标题（如文章详情返回文章名）
    let pageTitle = view.title;
    try {
      if (typeof view.titleFor === 'function') pageTitle = await view.titleFor({ ...route, view: view.id }) || pageTitle;
    } catch { /* 忽略动态标题失败 */ }
    document.title = `${pageTitle ? `${pageTitle} · ` : ''}${window.__SITE__?.name || 'FISH TEMPLE'}`;
    bus.emit('route:change', current);
  },

  init() {
    window.addEventListener('hashchange', () => this.resolve());
    if (!location.hash) history.replaceState(null, '', '#/');
    return this.resolve();
  },
};
