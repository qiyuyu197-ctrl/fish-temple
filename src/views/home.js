/**
 * views/home.js — 首屏
 * 结构：英雄区 → 实时统计 → 随机插画预览 → 最新文章 / 最新公告 → 模块导航
 * 所有区块在数据为空时自动隐藏或显示空状态，不会出现半成品版面。
 */

import { $, $$, esc, ICON } from '../util/dom.js';
import { SITE, PIXIV } from '../config/site.config.js';
import { Posts, News, ReadState, fmtDate, fmtRelative } from '../core/store.js';
import { Registry } from '../core/registry.js';
import { Stage } from '../plugins/stage.js';
import { Player } from '../core/player.js';
import { Motion } from '../core/motion.js';
import { bus } from '../core/bus.js';
import { newsItem, postCard, sectionHead, statBlock, emptyState, lyricBox, waveRow } from '../ui/bits.js';
import { Toast } from '../ui/toast.js';

let offArt = null;

/**
 * 渲染首屏巨型标题：把 & 标成信号黄，其余保持墨色。
 * 文案来自 site.config.js 的 SITE.heroTitle（一行一个元素）。
 */
function heroTitleHTML() {
  const lines = Array.isArray(SITE.heroTitle) && SITE.heroTitle.length
    ? SITE.heroTitle
    : [{ text: SITE.name }];
  return lines.slice(0, 3).map((raw) => {
    const line = typeof raw === 'string' ? { text: raw } : raw;
    let inner = esc(line.text);
    if (line.style === 'em') inner = `<em>${inner}</em>`;
    else inner = inner.replace(/&amp;/g, '<span class="amp">&amp;</span>');
    return `<span class="row"><span>${inner}</span></span>`;
  }).join('');
}

export default {
  id: 'home',
  title: '首页',

  render() {
    const posts = Posts.published;
    const news = News.sorted.filter((n) => !n.draft);
    const pinnedNews = news.filter((n) => n.pinned || n.level > 0).slice(0, 2);
    const latestNews = news.slice(0, 5);
    const featured = posts.slice(0, 6);
    const unread = ReadState.unreadNews;
    const tags = [...new Set(posts.flatMap((p) => p.tags || []))].slice(0, 10);

    return `
    <section class="hero">
      <div class="hero__bg" id="heroBg">
        <div class="hero__slash"></div>
        <div class="ruled-mask"></div>
      </div>
      <div class="hero__inner">
        <div class="hero__eyebrow">
          <span class="hero__eyebrow-line"></span>
          <span class="k-label k-label--ink">${esc(SITE.subtitle)}</span>
          <span class="k-label k-label--signal">● ONLINE</span>
          <span class="k-label">${fmtDate(new Date().toISOString())}</span>
        </div>

        <!-- 大标题 + 右侧「正在播放」：歌词在上，圆形音浪（圆心封面）在下 -->
        <div class="hero__stage">
          <h1 class="hero__title">
            ${heroTitleHTML()}
          </h1>
          <div class="hero__playing">
            ${lyricBox()}
            ${waveRow()}
          </div>
        </div>

        <p class="hero__lede">${esc(SITE.tagline)}<br />
          这里收集文章、公告、正在循环的音乐，以及相册里的插画。</p>

        <div class="hero__cta">
          <a class="btn btn--signal" href="#/logs" data-nav>${ICON.doc}阅读文章</a>
          <a class="btn" href="#/gallery" data-nav>${ICON.image}插画</a>
          <button class="btn" id="heroPlay">${ICON.play}播放音乐</button>
          <a class="btn" href="#/admin" data-nav>${ICON.settings}发布内容</a>
          ${Registry.renderWidgets('hero-actions', {})}
        </div>

        <div class="hero__stats">
          ${statBlock('篇文章', String(posts.length).padStart(2, '0'))}
          ${statBlock('条公告', String(news.length).padStart(2, '0'))}
          ${statBlock('未读', String(unread).padStart(2, '0'))}
          ${statBlock('曲目', String(Player.tracks.length).padStart(2, '0'))}
          ${statBlock('插画数据源', String(Registry.imageProviders.length).padStart(2, '0'))}
          ${statBlock('版本', SITE.version)}
        </div>
        ${Registry.renderWidgets('after-hero', {})}
      </div>
    </section>

    ${pinnedNews.length ? `<div class="grid" style="gap:var(--sp-2);margin-top:var(--sp-5)">
      ${pinnedNews.map((n) => `<div class="notice ${n.level >= 2 ? '' : 'notice--signal'}">
        <span class="notice__icon">${n.level >= 2 ? '!!' : '★'}</span>
        <div style="flex:1;min-width:0">
          <a href="#/logs/${n.id}" data-nav style="font-weight:700">${esc(n.title)}</a>
          <div class="mono faint" style="font-size:var(--fs-2xs)">${fmtDate(n.date)} · ${esc(n.category)}</div>
        </div>
        <span class="tag ${n.level >= 2 ? 'tag--alert' : 'tag--signal'}">${n.level >= 2 ? '紧急' : '重要'}</span>
      </div>`).join('')}
    </div>` : ''}

    <section class="sect">
      ${sectionHead('01', '最新文章', '#/logs', 'ALL LOGS')}
      ${featured.length
        ? `<div class="grid grid--3">${featured.map((p, i) => postCard(p, { index: i })).join('')}</div>`
        : emptyState({ title: '还没有文章', desc: '进入「发布」控制台写下第一篇。', icon: '▦' })}
    </section>

    <section class="sect">
      ${sectionHead('02', '公告与插画', '#/gallery', 'OPEN GALLERY')}
      <div class="grid grid--split">
        <div>
          ${latestNews.length
            ? `<div class="list">${latestNews.map((n) => newsItem(n, { compact: true })).join('')}</div>
               <div style="margin-top:var(--sp-4)"><a class="btn btn--sm" href="#/logs" data-nav>全部公告 →</a></div>`
            : emptyState({ title: '暂无公告', desc: '发布一条公告会立刻显示在这里。', icon: '◆' })}
        </div>
        <div class="grid" style="gap:var(--sp-4)">
          <div class="panel">
            <div class="panel__head">
              <span class="panel__title">插画</span>
              <span class="status-dot status-dot--on">LIVE</span>
            </div>
            <div class="panel__body grid" style="gap:var(--sp-3)">
              <div class="stage" id="homeStage" style="min-height:200px">
                <span class="stage__badge" id="homeStageBadge">ART</span>
                <div class="stage__placeholder" id="homeStagePh">${ICON.image}<p class="mono" style="font-size:var(--fs-2xs)">点击下方进入画廊</p></div>
                <img class="stage__img is-loading" id="homeStageImg" alt="插画预览" referrerpolicy="no-referrer" style="max-height:320px" />
              </div>
              <div class="grid" style="grid-template-columns:1fr 1fr;gap:6px">
                <a class="btn btn--sm btn--signal" href="#/gallery" data-nav>${ICON.image}去插画板块</a>
                <button class="btn btn--sm" id="homePixiv">${ICON.ext}PIXIV</button>
              </div>
              <div class="faint mono" style="font-size:var(--fs-2xs)" id="homeStageMeta">SOURCE —</div>
            </div>
          </div>

          <div class="panel">
            <div class="panel__head"><span class="panel__title">标签</span><span class="mono faint" style="font-size:var(--fs-2xs)">TAGS</span></div>
            <div class="panel__body" style="display:flex;flex-wrap:wrap;gap:6px">
              ${tags.length ? tags.map((t) => `<a class="chip" href="#/logs?tag=${encodeURIComponent(t)}" data-nav>#${esc(t)}</a>`).join('')
                : '<span class="faint mono" style="font-size:var(--fs-2xs)">暂无标签</span>'}
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="sect">
      ${sectionHead('03', '模块索引', null)}
      <div class="grid grid--auto">
        ${[
          { t: '文章与公告', e: 'LOGS', d: '两类发布物合成一条时间线：文章与公告。', h: '#/logs', i: ICON.doc, n: `${String(Posts.published.length).padStart(2, '0')}+${String(News.published.length).padStart(2, '0')}` },
          { t: '音乐', e: 'MUSIC', d: '搜索网易云曲目，官方播放器站内试听。', h: '#/music', i: ICON.music, n: String(Player.tracks.length).padStart(2, '0') },
          { t: '插画', e: 'GALLERY', d: '本地相册网格 + 随机抽图，一键跳转 Pixiv。', h: '#/gallery', i: ICON.image, n: `${Registry.imageProviders.length}` },
          { t: '扫雷', e: 'MINES', d: '三档难度，首点安全、和弦、键盘都能来。', h: '#/mine', i: ICON.grid, n: 'GAME' },
          { t: '工具台', e: 'TOOLS', d: '格式转换 / 图片压缩 / 文本处理，文件不出浏览器。', h: '#/tools', i: ICON.tools, n: '03' },
          { t: '发布', e: 'CONSOLE', d: '在浏览器里写文章、发公告、导出数据。', h: '#/admin', i: ICON.settings, n: 'IO' },
        ].map((m, i) => `
          <a class="panel" href="${m.h}" data-nav data-reveal data-reveal-delay="${i * 50}" style="padding:var(--sp-4);display:flex;flex-direction:column;gap:var(--sp-3);transition:border-color 120ms">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <span style="color:var(--fg-muted);width:20px;height:20px">${m.i}</span>
              <span class="mono faint" style="font-size:var(--fs-2xs)">${m.n}</span>
            </div>
            <div>
              <div class="k-label">${esc(m.e)}</div>
              <div style="font-size:1.15rem;font-weight:800;margin-top:2px">${esc(m.t)}</div>
            </div>
            <p class="muted" style="font-size:var(--fs-sm);margin:0">${esc(m.d)}</p>
          </a>`).join('')}
      </div>
    </section>

    ${Registry.renderWidgets('before-footer', {})}`;
  },

  mount(root) {
    // 英雄区视差
    Motion.parallax('#heroBg', 16);

    // 数字滚动
    $$('.hero__stat b', root).forEach((el) => {
      const target = Number(String(el.textContent).replace(/\D/g, '')) || 0;
      if (target > 0 && target < 10000) Motion.countup(el, target, { pad: String(el.textContent).length });
    });

    const paintStage = () => {
      const cur = Stage.current;
      const img = $('#homeStageImg');
      const ph = $('#homeStagePh');
      const meta = $('#homeStageMeta');
      const badge = $('#homeStageBadge');
      if (!cur) return;
      if (badge) badge.textContent = cur.source ? String(cur.source).toUpperCase() : 'ART';
      if (meta) meta.textContent = `SOURCE — ${cur.source || (cur.pixiv ? 'pixiv' : 'history')} · ${cur.author || cur.title || ''}`;
      if (!cur.url) {
        img?.classList.add('is-loading');
        if (ph) {
          ph.hidden = false;
          ph.innerHTML = `${ICON.ext}<p class="mono" style="font-size:var(--fs-2xs)">在 Pixiv 打开</p>`;
        }
        return;
      }
      if (ph) ph.hidden = true;
      if (img) {
        img.classList.add('is-loading');
        img.onload = () => img.classList.remove('is-loading');
        img.onerror = () => img.classList.add('is-loading');
        // 首屏这块预览很小，用缩略图就够（相册正图是 1600px，没必要为此拉几百 KB）
        img.src = cur.thumb || cur.url;
      }
    };

    // 首屏不再放「随机插画」按钮：入口统一改成跳插画板块的链接（上面的 <a>），
    // 这块预览只是进入时静默取一张，让首屏不空着。
    $('#heroPlay')?.addEventListener('click', () => {
      // 播放列表由网易云曲目组成：没有曲目时先去音乐台搜索
      if (!Player.current) {
        location.hash = '#/music';
        Toast.show('播放列表还是空的，去音乐台搜一首吧');
        return;
      }
      Player.playing ? Player.pause() : Player.play();
    });
    $('#homePixiv')?.addEventListener('click', () => {
      const kw = Stage.current?.keyword || PIXIV.defaultKeyword;
      window.open(PIXIV.searchUrl(kw), '_blank', 'noopener');
    });

    offArt = bus.on('art:change', paintStage);

    // 挂载通过 Registry 注册的首页插槽组件
    const cleanWidgets = [
      Registry.mountWidgets('hero-actions', root, {}),
      Registry.mountWidgets('after-hero', root, {}),
      Registry.mountWidgets('before-footer', root, {}),
    ];

    // 若已有历史则直接显示，否则静默抽取一张
    if (Stage.history.length) paintStage();
    else setTimeout(() => Stage.random({ silent: true }), 900);

    Motion.reveal(root);
    Motion.magnetic(root);

    return () => { offArt?.(); cleanWidgets.forEach((fn) => fn?.()); };
  },
};
