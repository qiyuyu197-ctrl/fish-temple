/**
 * views/post.js — 文章详情
 * 支持：Markdown 渲染、自动目录、阅读进度、相关文章、上下篇、分享链接、打印。
 */

import { $, $$, esc, ICON, rafThrottle } from '../util/dom.js';
import { Posts, ReadState, fmtDate, fmtRelative } from '../core/store.js';
import { render, stats } from '../util/markdown.js';
import { copyText } from '../ui/toast.js';
import { Motion } from '../core/motion.js';
import { emptyState, postRow, tagRow } from '../ui/bits.js';

export default {
  id: 'post',
  title: '文章',

  /** 页签标题使用文章名，便于多标签浏览 */
  titleFor(ctx) {
    return Posts.get(ctx.params[0])?.title || '文章不存在';
  },

  render(ctx) {
    const id = ctx.params[0];
    const item = Posts.get(id);
    if (!item) {
      return `<section style="padding-top:var(--sp-8)">
        ${emptyState({ title: '文章不存在', desc: '它可能已被删除，或链接有误。', icon: '▦' })}
        <div style="display:grid;place-items:center;margin-top:var(--sp-5)"><a class="btn" href="#/logs" data-nav>← 返回文章列表</a></div>
      </section>`;
    }

    const { html, toc } = render(item.content);
    const all = Posts.sorted.filter((p) => !p.draft);
    const idx = all.findIndex((p) => p.id === item.id);
    const prev = all[idx + 1] || null;   // 更早
    const next = all[idx - 1] || null;   // 更新
    const related = all
      .filter((p) => p.id !== item.id)
      .map((p) => ({ p, s: (p.tags || []).filter((t) => (item.tags || []).includes(t)).length + (p.category === item.category ? 1 : 0) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 3)
      .map((x) => x.p);
    const st = item.stats || stats(item.content);

    return `
    <div class="readbar" id="readbar"></div>
    <article class="post">
      <header class="post__head">
        <div class="post__kicker">
          <a class="tag tag--muted" href="#/logs?cat=${encodeURIComponent(item.category)}" data-nav>${esc(item.category)}</a>          ${item.pinned ? '<span class="tag tag--alert">PINNED</span>' : ''}
          ${item.draft ? '<span class="tag tag--signal">DRAFT</span>' : ''}
          ${item.local ? '<span class="tag tag--muted">LOCAL</span>' : ''}
          <span class="mono faint" style="font-size:var(--fs-2xs)">${esc(item.id)}</span>
        </div>
        <h1 class="post__title display">${esc(item.title)}</h1>
        ${item.summary ? `<p class="post__sub">${esc(item.summary)}</p>` : ''}
        <div class="post__info">
          <div><span class="k-label">PUBLISHED</span><b>${fmtDate(item.date)}</b></div>
          <div><span class="k-label">UPDATED</span><b>${item.updatedAt ? fmtRelative(item.updatedAt) : fmtDate(item.date)}</b></div>
          <div><span class="k-label">AUTHOR</span><b>${esc(item.author || window.__SITE__?.author || '—')}</b></div>
          <div><span class="k-label">READING</span><b>${st.minutes} MIN · ${st.chars} CHARS</b></div>
        </div>
        ${item.cover ? `<div class="post__cover"><img src="${esc(item.cover)}" alt="${esc(item.title)}" /></div>` : ''}
      </header>

      <div class="post__layout">
        <div>
          <div class="prose" id="prose">${html}</div>

          ${tagRow(item.tags, 'style="margin-top:32px"')}

          <div class="hero__cta" style="margin-top:var(--sp-6)">
            <button class="btn btn--sm" id="postShare">${ICON.ext}复制链接</button>
            <button class="btn btn--sm" id="postPrint">打印 / 存为 PDF</button>
            <a class="btn btn--sm" href="#/admin?tab=posts&edit=${esc(item.id)}" data-nav>${ICON.edit}在控制台编辑</a>
          </div>

          <nav class="grid grid--2" style="margin-top:var(--sp-7);gap:var(--sp-3)">
            ${prev ? `<a class="panel" style="padding:16px" href="#/logs/${prev.id}" data-nav>
              <span class="k-label">← 上一篇</span><div style="margin-top:6px;font-weight:700">${esc(prev.title)}</div></a>` : '<div></div>'}
            ${next ? `<a class="panel" style="padding:16px;text-align:right" href="#/logs/${next.id}" data-nav>
              <span class="k-label">下一篇 →</span><div style="margin-top:6px;font-weight:700">${esc(next.title)}</div></a>` : '<div></div>'}
          </nav>

          ${related.length ? `<section class="sect">
            <div class="sect__head"><h2 class="sect__title display"><span class="sect__no">REL</span>相关文章</h2></div>
            <div class="list">${related.map((p) => postRow(p)).join('')}</div>
          </section>` : ''}
        </div>

        <aside class="post__aside">
          <div class="panel">
            <div class="panel__head"><span class="panel__title">目录</span><span class="mono faint" style="font-size:var(--fs-2xs)">TOC</span></div>
            <div class="panel__body">
              ${toc.length ? `<nav class="toc" id="toc">${toc.map((t) => `<a href="#${t.id}" class="toc--h${t.level}" data-toc>${esc(t.text)}</a>`).join('')}</nav>` : '<p class="faint mono" style="font-size:var(--fs-2xs)">无小节</p>'}
            </div>
          </div>
          <div class="panel">
            <div class="panel__head"><span class="panel__title">文章信息</span></div>
            <div class="panel__body grid" style="gap:8px">
              <div class="grid" style="grid-template-columns:auto 1fr;gap:8px"><span class="k-label">字数</span><b class="mono" style="font-size:var(--fs-sm)">${st.chars}</b></div>
              <div class="grid" style="grid-template-columns:auto 1fr;gap:8px"><span class="k-label">阅读</span><b class="mono" style="font-size:var(--fs-sm)">${st.minutes} MIN</b></div>
              <div class="grid" style="grid-template-columns:auto 1fr;gap:8px"><span class="k-label">分类</span><b class="mono" style="font-size:var(--fs-sm)">${esc(item.category)}</b></div>
              <div class="grid" style="grid-template-columns:auto 1fr;gap:8px"><span class="k-label">标签</span><b class="mono" style="font-size:var(--fs-sm)">${(item.tags || []).length}</b></div>
            </div>
          </div>
          <button class="btn btn--block" id="backTop">${ICON.up}回到顶部</button>
        </aside>
      </div>
    </article>`;
  },

  mount(root, ctx) {
    const item = Posts.get(ctx.params[0]);
    ReadState.mark(ctx.params[0]);

    Motion.readProgress($('#readbar'));

    // 目录高亮
    const links = $$('#toc a', root);
    if (links.length) {
      const targets = links.map((a) => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
      const onScroll = rafThrottle(() => {
        const y = window.scrollY + 140;
        let active = 0;
        targets.forEach((t, i) => { if (t.offsetTop <= y) active = i; });
        links.forEach((a, i) => a.classList.toggle('is-active', i === active));
      });
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
      root.__cleanupScroll = () => window.removeEventListener('scroll', onScroll);
    }

    // 目录平滑滚动（hash 路由下不能直接用 #anchor，会改变路由）
    root.addEventListener('click', (e) => {
      const a = e.target.closest('[data-toc]');
      if (!a) return;
      e.preventDefault();
      const el = document.getElementById(a.getAttribute('href').slice(1));
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      links.forEach((l) => l.classList.toggle('is-active', l === a));
    });

    $('#postShare')?.addEventListener('click', () => copyText(location.href, '文章链接已复制'));
    $('#postPrint')?.addEventListener('click', () => window.print());
    $('#backTop')?.addEventListener('click', () => Motion.scrollToTop());

    Motion.reveal(root);
    return () => { root.__cleanupScroll?.(); };
  },
};
