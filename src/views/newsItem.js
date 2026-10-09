/**
 * views/newsItem.js — 单条公告详情
 */

import { $, esc, ICON } from '../util/dom.js';
import { News, ReadState, fmtDate, fmtRelative } from '../core/store.js';
import { render } from '../util/markdown.js';
import { copyText } from '../ui/toast.js';
import { Motion } from '../core/motion.js';
import { emptyState } from '../ui/bits.js';

export default {
  id: 'newsItem',
  title: '公告',

  titleFor(ctx) {
    return News.get(ctx.params[0])?.title || '公告不存在';
  },

  render(ctx) {
    const item = News.get(ctx.params[0]);
    if (!item) {
      return `<section style="padding-top:var(--sp-8)">
        ${emptyState({ title: '公告不存在', desc: '它可能已被删除，或链接有误。', icon: '◆' })}
        <div style="display:grid;place-items:center;margin-top:var(--sp-5)"><a class="btn" href="#/logs" data-nav>← 返回公告列表</a></div>
      </section>`;
    }
    const { html } = render(item.content);
    const levelText = item.level >= 2 ? '紧急公告' : item.level === 1 ? '重要公告' : '一般公告';
    const levelCls = item.level >= 2 ? 'tag--alert' : item.level === 1 ? 'tag--signal' : 'tag--muted';
    const all = News.sorted.filter((n) => !n.draft);
    const idx = all.findIndex((n) => n.id === item.id);
    const prev = all[idx + 1];
    const next = all[idx - 1];

    return `
    <div class="readbar" id="readbar"></div>
    <article class="post">
      <header class="post__head">
        <div class="post__kicker">
          <a class="tag tag--muted" href="#/logs" data-nav>← NOTICE</a>
          <span class="tag ${levelCls}">${levelText}</span>
          <span class="tag tag--muted">${esc(item.category)}</span>
          ${item.pinned ? '<span class="tag tag--alert">PINNED</span>' : ''}
        </div>
        <h1 class="post__title display" style="font-size:clamp(1.6rem,4vw,3rem)">${esc(item.title)}</h1>
        ${item.summary ? `<p class="post__sub">${esc(item.summary)}</p>` : ''}
        <div class="post__info">
          <div><span class="k-label">发布于</span><b>${fmtDate(item.date)}</b></div>
          <div><span class="k-label">距今</span><b>${fmtRelative(item.date)}</b></div>
          <div><span class="k-label">编号</span><b>${esc(item.id)}</b></div>
        </div>
      </header>

      <div class="post__layout">
        <div>
          <div class="prose" id="prose">${html}</div>
          <div class="hero__cta" style="margin-top:var(--sp-6)">
            <button class="btn btn--sm" id="newsShare">${ICON.ext}复制链接</button>
            <a class="btn btn--sm" href="#/admin?tab=news&edit=${esc(item.id)}" data-nav>${ICON.edit}编辑</a>
          </div>
          <nav class="grid grid--2" style="margin-top:var(--sp-7);gap:var(--sp-3)">
            ${prev ? `<a class="panel" style="padding:16px" href="#/logs/${prev.id}" data-nav>
              <span class="k-label">← 更早</span><div style="margin-top:6px;font-weight:700">${esc(prev.title)}</div></a>` : '<div></div>'}
            ${next ? `<a class="panel" style="padding:16px;text-align:right" href="#/logs/${next.id}" data-nav>
              <span class="k-label">更新 →</span><div style="margin-top:6px;font-weight:700">${esc(next.title)}</div></a>` : '<div></div>'}
          </nav>
        </div>
        <aside class="post__aside">
          <div class="panel">
            <div class="panel__head"><span class="panel__title">其他公告</span></div>
            <div class="panel__body grid" style="gap:10px">
              ${all.filter((n) => n.id !== item.id).slice(0, 6).map((n) => `
                <a href="#/logs/${n.id}" data-nav style="display:block">
                  <div class="mono faint" style="font-size:var(--fs-2xs)">${fmtDate(n.date)}</div>
                  <div class="clamp-2" style="font-size:var(--fs-sm);font-weight:600">${esc(n.title)}</div>
                </a>`).join('') || '<p class="faint mono" style="font-size:var(--fs-2xs)">暂无</p>'}
            </div>
          </div>
          <button class="btn btn--block" id="backTop">${ICON.up}回到顶部</button>
        </aside>
      </div>
    </article>`;
  },

  mount(root, ctx) {
    ReadState.mark(ctx.params[0]);
    Motion.readProgress($('#readbar'));
    $('#newsShare')?.addEventListener('click', () => copyText(location.href, '公告链接已复制'));
    $('#backTop')?.addEventListener('click', () => Motion.scrollToTop());
    Motion.reveal(root);
  },
};
