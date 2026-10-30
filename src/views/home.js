/**
 * views/home.js — 首屏
 * 结构：英雄区 → 实时统计 → 随机插画预览 → 最新文章 / 最新公告 → 模块导航
 * 所有区块在数据为空时自动隐藏或显示空状态，不会出现半成品版面。
 */

import { $, $$, esc, ICON } from '../util/dom.js';
import { SITE, PIXIV } from '../config/site.config.js';
import { Posts, News, ReadState, fmtDate, fmtRelative } from '../core/store.js';
import { Registry } from '../core/registry.js';
import { Stage, loadManifest } from '../plugins/stage.js';
import { Player } from '../core/player.js';
import { Motion } from '../core/motion.js';
import { bus } from '../core/bus.js';
import { newsItem, postCard, sectionHead, statBlock, emptyState, lyricBox, waveRow } from '../ui/bits.js';
import { Toast } from '../ui/toast.js';
import { openBackgroundPicker } from '../ui/background-picker.js';
import {
  splitBackdropPools,
  chooseBackdropPool,
  photoOrientation,
  prefersPortraitBackdrop,
} from '../ui/backdrop-pool.js';

let offArt = null;

// 首屏横幅：桌面挑横图，手机挑竖图；数据加载完后缓存两套候选池。
// 判断交给 ui/backdrop-pool.js：先看 hero 自己的比例，再看窄屏 / 触屏，
// 所以 App 里的 WebView 只要首屏是一块高高的区域就会拿到竖图。
let heroPools = null;
let heroLastUrl = '';

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
    <section class="hero" id="hero">
      <div class="hero__media" id="heroMedia" aria-hidden="true">
        <img class="hero__media-img" id="heroMediaImg" alt="" decoding="async" fetchpriority="high" draggable="false" />
        <span class="hero__media-scrim"></span>
      </div>
      <div class="hero__bg" id="heroBg">
        <div class="hero__slash"></div>
        <div class="ruled-mask"></div>
      </div>
      <div class="hero__inner">
        <button class="hero__media-fab" id="heroMediaFab" type="button" disabled
                aria-label="换一张横幅" aria-keyshortcuts="R" title="换一张横幅（快捷键 R）">${ICON.refresh}</button>
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

        <div class="hero__media-bar" id="heroMediaBar" hidden>
          <a class="hero__media-credit" id="heroMediaCredit" href="#/gallery" data-nav>
            <span class="hero__media-kicker" id="heroMediaKicker">// RANDOM ARCHIVE</span>
            <span class="hero__media-no" id="heroMediaNo">NO.---</span>
            <b class="hero__media-title" id="heroMediaTitle">等待抽取</b>
            <span class="hero__media-meta" id="heroMediaMeta">横幅相册</span>
          </a>
          <span class="hero__media-count" id="heroMediaCount">SCAN ---</span>
          <button class="btn btn--sm" id="heroMediaPin" type="button" aria-pressed="false"
                  title="固定当前横幅：之后进首页不再换">固定</button>
          <button class="btn btn--sm" id="heroMediaPick" type="button" disabled
                  aria-keyshortcuts="G" title="从图库选一张 / 导入自己的图（快捷键 G）">选图</button>
          <button class="btn btn--sm" id="heroMediaShuffle" type="button" disabled
                  aria-keyshortcuts="R" title="换一张横幅（快捷键 R）">${ICON.refresh}换一张</button>
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
            ? `<div class="list">${latestNews.map((n, i) => newsItem(n, { compact: true, index: i })).join('')}</div>
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
                <img class="stage__img is-loading" id="homeStageImg" alt="插画预览" referrerpolicy="no-referrer" fetchpriority="high" decoding="async" style="max-height:320px" />
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
          { t: '文娱', e: 'LEISURE', d: '当季新番、私心推荐，以及只存在本地的追番标记。', h: '#/leisure', i: ICON.screen, n: '22' },
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
    // 英雄区视差：黄斜纹一层、照片一层，幅度都很小
    const offHeroParallax = Motion.parallax('#heroBg', 16);
    const offMediaParallax = Motion.parallax('#heroMediaImg', 8);

    // 数字滚动
    $$('.hero__stat b', root).forEach((el) => {
      const target = Number(String(el.textContent).replace(/\D/g, '')) || 0;
      if (target > 0 && target < 10000) Motion.countup(el, target, { pad: String(el.textContent).length });
    });

    /* 首屏横幅 ---------------------------------------------------------
     * 桌面从相册里挑横图，手机挑竖图；图片只做背景，标题/正文/按钮
     * 浮在上层。换图时先预加载，旧图不闪掉；横竖都没有时才回退到全量。 */
    let heroSeq = 0;
    // 信息条只认横 / 竖两种口径；接近方形的图按当前屏幕方向记
    const orientationLabel = (photo, portrait) => {
      const o = photoOrientation(photo);
      if (o === 'portrait' || o === 'landscape') return o;
      return portrait ? 'portrait' : 'landscape';
    };
    const pickHeroPhoto = async () => {
      if (!heroPools) {
        try {
          const items = await loadManifest('data/album.json');
          heroPools = splitBackdropPools(items);
        } catch {
          heroPools = splitBackdropPools([]);
        }
      }
      const portrait = prefersPortraitBackdrop($('#hero'));
      const chosen = chooseBackdropPool(heroPools, { portrait });
      const pool = chosen.pool;
      // 固定优先：只要还钉着，就直接用那一张（换一张时走 forceRandom 临时绕开）
      if (heroPinned && !heroForceRandom) {
        const p = heroPinned;
        return { photo: p, count: pool.length, orientation: orientationLabel(p, portrait), pinned: true };
      }
      if (!pool.length) {
        const cur = Stage.current;
        if (cur?.url) {
          return { photo: cur, count: 1, orientation: orientationLabel(cur, portrait) };
        }
        return null;
      }
      let pick = pool[Math.floor(Math.random() * pool.length)];
      for (let i = 0; i < 6 && pick.url === heroLastUrl && pool.length > 1; i++) {
        pick = pool[Math.floor(Math.random() * pool.length)];
      }
      heroLastUrl = pick.url;
      return {
        photo: pick,
        count: pool.length,
        orientation: orientationLabel(pick, portrait),
        fallback: chosen.fallback,
      };
    };

    // 照片从浏览器顶端开始，顶栏 / 跑马灯压在照片上时切成透明文字态；
    // 离开照片范围恢复纸底。
    const topbarEl = document.getElementById('topbar');
    const tickerEl = document.getElementById('ticker');
    const heroEl = $('#hero');
    const heroMediaEl = $('#heroMedia');
    const syncTopbar = () => {
      if (!topbarEl || !heroEl || !heroMediaEl) return;
      const mb = heroMediaEl.getBoundingClientRect();
      const tb = topbarEl.getBoundingClientRect();
      const over = heroEl.classList.contains('is-media')
        && mb.top < tb.bottom - 1 && mb.bottom > tb.top + 1;
      topbarEl.classList.toggle('is-over-media', over);
      tickerEl?.classList.toggle('is-over-media', over);
    };
    syncTopbar();
    window.addEventListener('scroll', syncTopbar, { passive: true });
    window.addEventListener('resize', syncTopbar);

    let heroLoading = false;
    let heroOrientationPending = false;
    // 固定横幅：存整条 photo（标题/作者/尺寸都要留在信息条里），不只是一张 URL
    const HERO_PIN_KEY = 'ft.terminal.heroPinned';
    const readPinnedHero = () => {
      try { const p = JSON.parse(localStorage.getItem(HERO_PIN_KEY) || 'null'); return p?.url ? p : null; } catch { return null; }
    };
    const writePinnedHero = (photo) => {
      try {
        if (photo?.url) localStorage.setItem(HERO_PIN_KEY, JSON.stringify(photo));
        else localStorage.removeItem(HERO_PIN_KEY);
        return true;
      } catch {
        // 隐私模式 / 配额满：本次会话仍然能看，只是刷新后不保留
        return false;
      }
    };
    let heroPinned = readPinnedHero();
    let heroForceRandom = false;
    let heroCurrent = null;

    const paintHeroPin = () => {
      const btn = $('#heroMediaPin');
      if (!btn) return;
      const on = !!heroPinned;
      btn.textContent = on ? '已固定' : '固定';
      btn.setAttribute('aria-pressed', String(on));
      btn.classList.toggle('is-on', on);
      btn.title = on ? '已固定这张横幅：点一下恢复随机' : '固定当前横幅：之后进首页不再换';
    };
    const loadHeroPhoto = async () => {
      const hero = $('#hero');
      const img = $('#heroMediaImg');
      const bar = $('#heroMediaBar');
      const btns = [$('#heroMediaShuffle'), $('#heroMediaFab'), $('#heroMediaPin'), $('#heroMediaPick')].filter(Boolean);
      if (!hero || !img || heroLoading) return;
      heroLoading = true;
      btns.forEach((b) => { b.disabled = true; });
      hero.classList.add('is-loading');
      hero.setAttribute('aria-busy', 'true');
      bar?.classList.add('is-loading');
      try {
        let picked = await pickHeroPhoto();
        if (!picked) {
          if (bar) bar.hidden = true;
          return;
        }
        let { photo } = picked;
        // 先在 Image 里预载；失败就保留旧图，不要让首屏突然变白。
        // 相册里偶有坏图 / 缺文件，随机到它时再抽一张，最多重试 2 次。
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            await new Promise((resolve, reject) => {
              const pre = new Image();
              pre.onload = resolve;
              pre.onerror = reject;
              pre.src = photo.url;
            });
            break;
          } catch (err) {
            if (attempt >= 2 || picked.pinned) throw err;
            picked = await pickHeroPhoto();
            if (!picked) throw err;
            photo = picked.photo;
          }
        }
        // 预加载期间可能已经切走又切回来；不要把旧闭包写到新页面上。
        if (!document.body.contains(hero) || hero !== $('#hero')) return;
        const hadMedia = hero.classList.contains('is-media');
        img.src = photo.url;
        img.alt = '';
        if (hadMedia) {
          img.classList.remove('is-swapping');
          void img.offsetWidth;
          img.classList.add('is-swapping');
          setTimeout(() => img.classList.remove('is-swapping'), 520);
        }
        heroSeq += 1;
        const no = `NO.${String(heroSeq).padStart(3, '0')}`;
        const dims = (photo.width && photo.height) ? `${photo.width} × ${photo.height}` : '';
        const noEl = $('#heroMediaNo');
        const titleEl = $('#heroMediaTitle');
        const metaEl = $('#heroMediaMeta');
        const countEl = $('#heroMediaCount');
        const kicker = $('#heroMediaKicker');
        const credit = $('#heroMediaCredit');
        if (noEl) noEl.textContent = no;
        if (titleEl) titleEl.textContent = photo.title || '未命名档案';
        if (metaEl) metaEl.textContent = [photo.author, dims].filter(Boolean).join(' / ') || `ALBUM / 相册 · ${picked.count} 张${picked.orientation === 'portrait' ? '竖图' : '横图'}`;
        if (countEl) countEl.textContent = `${picked.orientation === 'portrait' ? 'PORTRAIT' : 'LANDSCAPE'} ${String(picked.count).padStart(3, '0')}`;
        if (kicker) kicker.textContent = photo.custom ? '// LOCAL IMAGE' : '// RANDOM ARCHIVE';
        if (credit) {
          credit.href = '#/gallery';
          credit.setAttribute('aria-label', `在相册中查看${photo.title ? `：${photo.title}` : '随机照片'}`);
        }
        if (bar) bar.hidden = false;
        hero.classList.add('is-media');
        heroCurrent = photo;
        // 固定状态下点「换一张」：换成新的这张，并继续钉住它
        if (heroPinned && heroForceRandom) {
          heroPinned = photo;
          writePinnedHero(photo);
        }
        paintHeroPin();
        syncTopbar();
      } catch {
        Toast.show('这张横幅没加载出来，换一张试试');
      } finally {
        heroLoading = false;
        heroForceRandom = false;
        const hasMedia = hero.classList.contains('is-media');
        btns.forEach((b) => { b.disabled = !hasMedia; });
        paintHeroPin();
        hero.classList.remove('is-loading');
        hero.setAttribute('aria-busy', 'false');
        bar?.classList.remove('is-loading');
        if (heroOrientationPending) {
          heroOrientationPending = false;
          setTimeout(loadHeroPhoto, 0);
        }
      }
    };

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

    // 只有在「当前曲目 + 正在播放」时，右侧歌词 / 音浪才出现。
    // 暂停、播完、切歌停住、没有曲目时整块隐藏，避免在照片上留一块黑框。
    const paintHeroPlaying = () => {
      const hero = $('#hero');
      if (!hero) return;
      hero.classList.toggle('is-playing', !!Player.current && !!Player.playing);
    };
    paintHeroPlaying();
    const offPlayerState = bus.on('player:state', paintHeroPlaying);
    const offPlayerTrack = bus.on('player:track', paintHeroPlaying);

    // 首屏「换一张」只换背景横幅，不动下面那块随机插画预览。
    // 固定状态下换一张：换成新的这张并继续钉住（heroForceRandom 只绕开一次）
    const shuffleHero = () => { heroForceRandom = !!heroPinned; void loadHeroPhoto(); };
    $('#heroMediaShuffle')?.addEventListener('click', shuffleHero);
    $('#heroMediaFab')?.addEventListener('click', shuffleHero);
    $('#heroMediaPin')?.addEventListener('click', () => {
      if (heroPinned) {
        heroPinned = null;
        writePinnedHero(null);
        Toast.show('已取消固定，横幅恢复随机');
      } else if (heroCurrent) {
        heroPinned = heroCurrent;
        writePinnedHero(heroCurrent);
        Toast.show('已固定这张横幅，下次进首页还是它');
      }
      paintHeroPin();
    });

    // 从图库 / 本地导入里选一张：选中即固定，和「固定当前横幅」共用同一套存储
    const pickHeroBackground = async () => {
      if (document.body.classList.contains('is-bgpicker-open')) return;
      const picked = await openBackgroundPicker({
        scope: 'home',
        currentUrl: heroCurrent?.url || '',
        currentPhoto: heroCurrent,
      });
      if (!picked?.url) return;
      heroPinned = picked;
      heroForceRandom = false;
      const saved = writePinnedHero(picked);
      await loadHeroPhoto();
      Toast.show(saved ? '已换成这张背景，并固定' : '已换成这张背景；图太大，下次打开可能丢失');
    };
    $('#heroMediaPick')?.addEventListener('click', pickHeroBackground);
    paintHeroPin();

    const onHeroKey = (e) => {
      if (document.body.classList.contains('is-bgpicker-open')) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const key = String(e.key).toLowerCase();
      if (key !== 'r' && key !== 'g') return;
      if (e.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('#cmdk:not([hidden])')) return;
      e.preventDefault();
      if (key === 'g') void pickHeroBackground();
      else shuffleHero();
    };
    window.addEventListener('keydown', onHeroKey);

    // 手机竖屏选竖图，桌面 / 横屏选横图。这里盯的是 hero 自己的尺寸，
    // 而不是只监听一个宽度断点：App 的 WebView 转屏 / 改窗口后，只要容器
    // 从“宽”变成“高”，就换一张对应方向的图（固定状态除外）。
    let heroResizeTimer = 0;
    const syncHeroOrientation = () => {
      if (!heroEl || !heroCurrent || heroPinned) return;
      const portrait = prefersPortraitBackdrop(heroEl);
      if (orientationLabel(heroCurrent, portrait) === (portrait ? 'portrait' : 'landscape')) return;
      if (heroLoading) { heroOrientationPending = true; return; }
      void loadHeroPhoto();
    };
    const onHeroResize = () => {
      clearTimeout(heroResizeTimer);
      heroResizeTimer = setTimeout(syncHeroOrientation, 240);
    };
    const heroRO = typeof ResizeObserver === 'function' ? new ResizeObserver(onHeroResize) : null;
    heroRO?.observe(heroEl);
    window.addEventListener('resize', onHeroResize);
    window.addEventListener('orientationchange', onHeroResize);

    offArt = bus.on('art:change', paintStage);

    // 挂载通过 Registry 注册的首页插槽组件
    const cleanWidgets = [
      Registry.mountWidgets('hero-actions', root, {}),
      Registry.mountWidgets('after-hero', root, {}),
      Registry.mountWidgets('before-footer', root, {}),
    ];

    // 横幅：相册数据缓存过，通常第一帧后就能铺上。
    loadHeroPhoto();

    // 下面那块小预览继续沿用 Stage 的随机逻辑。
    if (Stage.history.length) paintStage();
    else setTimeout(() => Stage.random({ silent: true }), 320);

    Motion.reveal(root);
    Motion.magnetic(root);

    return () => {
      offArt?.();
      offHeroParallax?.();
      offMediaParallax?.();
      offPlayerState?.();
      offPlayerTrack?.();
      clearTimeout(heroResizeTimer);
      heroRO?.disconnect();
      window.removeEventListener('resize', onHeroResize);
      window.removeEventListener('orientationchange', onHeroResize);
      window.removeEventListener('keydown', onHeroKey);
      window.removeEventListener('scroll', syncTopbar);
      window.removeEventListener('resize', syncTopbar);
      topbarEl?.classList.remove('is-over-media');
      tickerEl?.classList.remove('is-over-media');
      cleanWidgets.forEach((fn) => fn?.());
    };
  },
};
