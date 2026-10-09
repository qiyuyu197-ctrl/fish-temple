/**
 * views/gallery.js — 插画画廊
 * 功能：相册网格浏览（本地手机照片）、随机插画（多数据源可切换）、历史回溯、
 *       Pixiv 深链与搜索、收藏到本地画廊。
 *
 * 两块内容的分工：
 *   · 相册     data/album.json 里的本地照片，网格 + 灯箱逐张翻，离线可用
 *   · 随机插画 由 plugins/stage.js 的引擎从各数据源抽一张（本地相册优先）
 */

import { $, $$, esc, ICON, delegate } from '../util/dom.js';
import { bus } from '../core/bus.js';
import { Registry } from '../core/registry.js';
import { PIXIV, ALBUM } from '../config/site.config.js';
import { Stage, loadManifest } from '../plugins/stage.js';
import { Toast, copyText, download } from '../ui/toast.js';
import { Motion } from '../core/motion.js';
import { viewhead, emptyState, sectionHead } from '../ui/bits.js';

let offArt = null;
let offLoading = null;

/** 相册全量清单 + 当前渲染到第几张（网格分页渲染，避免一次性插 180 个 img） */
let albumItems = [];
let albumShown = 0;
/** 历史网格当前展示的条目（点击后用下标回查，避免把长 URL 塞进属性里） */
let historyView = [];

const providerChips = () => Registry.imageProviders.map((p) => `
  <button class="chip" data-provider="${esc(p.id)}" title="${esc(p.note || '')}">${esc(p.label)}</button>`).join('');

const pixivEntries = () => PIXIV.entries.map((e) => `
  <a class="pixiv__link" href="${e.href}" target="_blank" rel="noopener noreferrer">
    <span><b>${esc(e.label)}</b><br /><span>pixiv.net</span></span>${ICON.ext}
  </a>`).join('');

function stageHTML() {
  return `
  <div class="stage" id="stage">
    <span class="stage__badge" id="stageBadge">RANDOM ART</span>
    <span class="stage__corner stage__corner--tl"></span>
    <span class="stage__corner stage__corner--br"></span>
    <div class="stage__placeholder" id="stagePh">
      ${ICON.image}
      <p class="mono" style="font-size:var(--fs-xs);letter-spacing:var(--ls-wide);text-transform:uppercase">正在抽取 · 也可点下方「随机插画」</p>
    </div>
    <img class="stage__img is-loading" id="stageImg" alt="随机插画" referrerpolicy="no-referrer" />
    <div class="stage__loading" id="stageLoading" hidden>
      <div class="stage__spinner"></div>
      <span class="mono" style="font-size:var(--fs-2xs);letter-spacing:var(--ls-widest);text-transform:uppercase" id="stageLoadingText">正在获取 …</span>
    </div>
    <div class="stage__hud">
      <span id="stageTitle">—</span>
      <span id="stageAuthor">—</span>
    </div>
  </div>`;
}

function sidebarHTML() {
  return `
  <aside class="grid" style="gap:var(--sp-4)">
    <div class="panel">
      <div class="panel__head"><span class="panel__title">数据源</span><span class="mono faint" style="font-size:var(--fs-2xs)">SOURCE</span></div>
      <div class="panel__body grid" style="gap:var(--sp-3)">
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px">${providerChips()}</div>
        <button class="btn btn--sm btn--block" id="autoProvider" aria-pressed="true">自动 · 依次尝试</button>
        <p class="faint mono" style="font-size:var(--fs-2xs);margin:0;line-height:1.7">
          默认顺序：<b>相册</b>（手机照片）→ 本地画廊 → 公开 API → <b>PIXIV 随机</b>。<br />
          相册读 <b>${esc(ALBUM.manifest)}</b>，本地画廊读 <b>data/gallery.json</b>，都离线可用。<br />
          Pixiv 走 <b>server.mjs</b> 代理取随机作品、图片经 <b>pixiv.re</b> 镜像显示
          （首次 20-40 秒，之后秒开）；点「随机插画」旁边的数据源可单独抽 Pixiv。
        </p>
      </div>
    </div>

    <div class="panel">
      <div class="panel__head"><span class="panel__title">Pixiv 入口</span><span class="mono faint" style="font-size:var(--fs-2xs)">EXTERNAL</span></div>
      <div class="panel__body pixiv" style="gap:6px">
        ${pixivEntries()}
      </div>
    </div>

    <div class="panel">
      <div class="panel__head"><span class="panel__title">搜索 Pixiv</span><span class="mono faint" style="font-size:var(--fs-2xs)">TAG</span></div>
      <div class="panel__body grid" style="gap:var(--sp-3)">
        <div class="searchline">
          <input type="search" id="pixivKw" placeholder="输入标签，如 風景" value="${esc(PIXIV.defaultKeyword)}" />
          <button class="btn btn--sm" id="pixivGo">GO</button>
        </div>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:6px">
          ${PIXIV.keywords.map((k) => `<button class="chip" data-kw="${esc(k)}">${esc(k)}</button>`).join('')}
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel__head"><span class="panel__title">历史</span><span class="mono faint" id="histCount" style="font-size:var(--fs-2xs)">0</span></div>
      <div class="panel__body grid" style="gap:var(--sp-3)">
        <div class="thumbs" id="stageThumbs"></div>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:6px">
          <button class="btn btn--sm" id="histPrev">← 上一张</button>
          <button class="btn btn--sm" id="histNext">下一张 →</button>
        </div>
        <div class="grid" style="gap:6px">
          <button class="btn btn--sm btn--block" id="histKeep">收藏到本地</button>
          <button class="btn btn--sm btn--block" id="histClear">清空历史</button>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel__head"><span class="panel__title">导出</span><span class="mono faint" style="font-size:var(--fs-2xs)">IO</span></div>
      <div class="panel__body grid" style="gap:6px">
        <button class="btn btn--sm btn--block" id="exportGallery">下载 gallery.json</button>
        <button class="btn btn--sm btn--block" id="copyGallery">复制为 JSON</button>
        <p class="faint mono" style="font-size:var(--fs-2xs);margin:0">把文件放到 <b>data/</b> 目录即可成为离线画廊。</p>
      </div>
    </div>
  </aside>`;
}

function paintStage() {
  const img = $('#stageImg');
  const ph = $('#stagePh');
  const title = $('#stageTitle');
  const author = $('#stageAuthor');
  const badge = $('#stageBadge');
  const cur = Stage.current;

  if (!cur) {
    img?.classList.add('is-loading');
    if (ph) ph.hidden = false;
    if (title) title.textContent = '—';
    if (author) author.textContent = '—';
    return;
  }
  if (badge) badge.textContent = cur.source ? `SOURCE · ${String(cur.source).toUpperCase()}` : (cur.pixiv ? 'PIXIV LINK' : 'RANDOM ART');
  if (title) title.textContent = cur.title || '无标题';
  if (author) author.textContent = cur.author || (cur.pixivId ? `ID ${cur.pixivId}` : 'UNKNOWN');

  if (!cur.url) {
    // 纯 Pixiv 深链记录
    img?.classList.add('is-loading');
    if (ph) {
      ph.hidden = false;
      ph.innerHTML = `${ICON.ext}<p class="mono" style="font-size:var(--fs-xs)">该结果需要在 Pixiv 打开</p>
        <a class="btn btn--signal btn--sm" href="${esc(cur.pixiv || '#')}" target="_blank" rel="noopener noreferrer">前往 PIXIV</a>`;
    }
    return;
  }
  if (ph) ph.hidden = true;
  if (img && img.getAttribute('src') !== cur.url) {
    img.classList.add('is-loading');
    img.onload = () => img.classList.remove('is-loading');
    img.onerror = () => {
      img.classList.add('is-loading');
      Toast.err('图片加载失败（可能被防盗链拦截）');
    };
    img.src = cur.url;
  }
}

function paintHistory() {
  const host = $('#stageThumbs');
  const count = $('#histCount');
  if (!host) return;
  const list = Stage.history.slice().reverse();
  if (count) count.textContent = String(Stage.history.length).padStart(2, '0');
  if (!list.length) {
    host.innerHTML = '<p class="faint mono" style="font-size:var(--fs-2xs);margin:0">暂无记录</p>';
    return;
  }
  host.innerHTML = list.map((h, i) => {
    const realIdx = Stage.history.length - 1 - i;
    if (!h.url) {
      return `<div class="thumb${Stage.cursor === realIdx ? ' is-on' : ''}" data-jump="${realIdx}" title="${esc(h.title || '')}">
        <div style="display:grid;place-items:center;height:100%;color:var(--signal-deep);font-family:var(--font-mono);font-size:10px">PIXIV</div>
      </div>`;
    }
    return `<div class="thumb${Stage.cursor === realIdx ? ' is-on' : ''}" data-jump="${realIdx}" title="${esc(h.title || h.author || '')}">
      <img src="${esc(h.url)}" alt="" loading="lazy" referrerpolicy="no-referrer" />
      <span class="thumb__x" data-remove="${esc(h.url)}" title="移出历史">✕</span>
    </div>`;
  }).join('');
}

function setLoading(on, text = '正在获取 …') {
  const el = $('#stageLoading');
  const t = $('#stageLoadingText');
  if (t) t.textContent = text;
  if (el) el.hidden = !on;
}

export default {
  id: 'gallery',
  title: '插画画廊',

  render() {
    const count = Stage.history.length;
    return `
    <section class="gallery">
      ${viewhead({
        title: 'GALLERY',
        sub: '本地相册 + 随机插画：相册是导入到站点里的手机照片，网格浏览、灯箱逐张翻，完全离线；随机插画引擎从各数据源取图并自动校验可用性，坏图自动跳过，结果沉淀为可回溯的历史。',
        idx: 'MODULE / 05',
        meta: [
          { label: 'ALBUM', value: '— 读取中', id: 'metaAlbum' },
          { label: 'DATA SOURCE', value: `${Registry.imageProviders.length} PROVIDERS` },
          { label: 'HISTORY', value: `${String(count).padStart(2, '0')} ITEMS`, id: 'metaHistory' },
          { label: 'OFFLINE', value: '100% LOCAL' },
        ],
        actions: `<button class="btn" id="pixivTop">${ICON.ext}打开 PIXIV</button>`,
      })}
      <div class="gallery__layout">
        <div class="grid" style="gap:var(--sp-4)">
          ${stageHTML()}
          <!-- 大图下方的操作条：随机插画是主操作，进来就会自动抽一张 -->
          <div class="gallery__bar">
            <button class="btn btn--signal" id="rollBtn">${ICON.refresh}随机插画</button>
            <button class="btn btn--sm" id="stagePrev">← 上一张</button>
            <button class="btn btn--sm" id="stageNext">下一张 →</button>
            <span class="grow"></span>
            <button class="btn btn--sm" id="stageOpenPixiv">${ICON.ext}在 Pixiv 查看</button>
            <button class="btn btn--sm" id="stageKeep">收藏</button>
            <button class="btn btn--sm" id="stageFull">全屏</button>
          </div>

          <div>
            ${sectionHead('01', '相册', null)}
            <div class="photo-album" id="albumPanel">
              <div class="photo-album__bar">
                <button class="btn btn--sm btn--signal" id="albumRandom">${ICON.refresh}随机一张</button>
                <button class="btn btn--sm" id="albumExpand" aria-expanded="false" disabled>${ICON.grid}展开全部</button>
                <span class="grow"></span>
                <span class="mono faint" id="albumCount" style="font-size:var(--fs-2xs)">读取中 …</span>
              </div>
              <div class="masonry" id="albumGrid"></div>
            </div>
          </div>

          <div>
            ${sectionHead('02', '随机插画历史', null)}
            <div id="historyGridWrap"></div>
          </div>
        </div>
        ${sidebarHTML()}
      </div>
    </section>`;
  },

  mount(root) {
    let provider = null; // null = 自动

    /** 切换数据源（同时同步左侧 chips 与「自动」按钮的状态） */
    const setProvider = (id) => {
      provider = id;
      $$('[data-provider]', root).forEach((b) => b.classList.toggle('is-on', b.dataset.provider === id));
      $('#autoProvider')?.setAttribute('aria-pressed', String(!id));
    };

    const roll = async () => {
      setLoading(true, provider ? `正在从 ${provider} 获取 …` : '正在获取 …');
      await Stage.random({ provider });
      setLoading(false);
    };

    /* ---- 相册：网格渲染；「展开全部」会把照片铺满并让整个版面变全宽 ---- */
    const albumExpanded = () => $('#albumPanel')?.classList.contains('is-expanded') === true;

    const paintAlbum = (reset = false) => {
      const host = $('#albumGrid');
      const countEl = $('#albumCount');
      const expandBtn = $('#albumExpand');
      const panel = $('#albumPanel');
      if (!host) return;
      if (reset) { host.innerHTML = ''; albumShown = 0; }

      if (!albumItems.length) {
        host.innerHTML = emptyState({
          title: '相册还是空的',
          desc: `用 tools/album-pull.ps1 从手机拷照片、再用 tools/album-build.py 压缩，结果会写进 ${ALBUM.manifest}。`,
          icon: '▤',
        });
        if (countEl) countEl.textContent = '0 PHOTOS';
        if (expandBtn) { expandBtn.hidden = true; }
        const meta = $('#metaAlbum');
        if (meta) meta.textContent = '— 空';
        return;
      }

      const expanded = panel?.classList.contains('is-expanded') === true;
      const step = expanded ? albumItems.length - albumShown : ALBUM.pageSize;
      const next = albumItems.slice(albumShown, albumShown + step);
      host.insertAdjacentHTML('beforeend', next.map((it, i) => albumCard(it, albumShown + i)).join(''));
      albumShown += next.length;

      if (countEl) countEl.textContent = `${albumShown} / ${albumItems.length} PHOTOS`;
      if (expandBtn) {
        expandBtn.hidden = false;
        expandBtn.disabled = false;
        expandBtn.setAttribute('aria-expanded', String(expanded));
        expandBtn.innerHTML = expanded ? `${ICON.up}收起` : `${ICON.grid}展开全部`;
        expandBtn.title = expanded ? '收起到 24 张并恢复右侧栏' : '铺满全部照片，同时把相册放大到整页宽度';
      }
      const meta = $('#metaAlbum');
      if (meta) meta.textContent = `${albumShown}${expanded ? '' : ` / ${albumItems.length}`} PHOTOS`;
      Motion.reveal(host);
    };

    /** 展开 = 铺满全部照片 + 版面切成单列（相册占满整页宽度） */
    const setAlbumExpanded = (on) => {
      const panel = $('#albumPanel');
      const layout = $('.gallery__layout');
      if (!panel) return;
      panel.classList.toggle('is-expanded', on);
      layout?.classList.toggle('is-album-expanded', on);
      const host = $('#albumGrid');
      if (host) host.innerHTML = '';          // 重排一次，避免展开后又懒加载残留
      albumShown = 0;
      paintAlbum(false);
      if (!on) $('#albumPanel')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    };

    $('#albumExpand')?.addEventListener('click', () => setAlbumExpanded(!albumExpanded()));
    $('#albumRandom')?.addEventListener('click', () => {
      setProvider('album');
      Toast.show('从相册里随机抽一张');
      roll();
    });

    $('#rollBtn')?.addEventListener('click', roll);
    $('#stagePrev')?.addEventListener('click', () => Stage.back());
    $('#stageNext')?.addEventListener('click', () => Stage.forward());
    $('#histPrev')?.addEventListener('click', () => Stage.back());
    $('#histNext')?.addEventListener('click', () => Stage.forward());
    $('#stageFull')?.addEventListener('click', () => Stage.current?.url && openLightbox(Stage.current));
    $('#stageOpenPixiv')?.addEventListener('click', () => Stage.openPixiv());
    $('#pixivTop')?.addEventListener('click', () => window.open('https://www.pixiv.net/', '_blank', 'noopener'));

    const keep = () => {
      const cur = Stage.current;
      if (!cur?.url) { Toast.err('当前没有可收藏的图片'); return; }
      Stage.addToAllowlist(cur.url);
      Toast.ok('已加入本地画廊（可在 gallery.json 导出中使用）');
      paintHistory();
    };
    $('#stageKeep')?.addEventListener('click', keep);
    $('#histKeep')?.addEventListener('click', keep);

    $('#histClear')?.addEventListener('click', () => {
      Stage.clearHistory();
      Toast.show('历史已清空');
    });

    // 数据源切换 / 网格点击
    root.addEventListener('click', (e) => {
      // 相册格子 → 灯箱（可左右翻）
      const alb = e.target.closest('[data-album]');
      if (alb) {
        const i = Number(alb.dataset.album);
        openLightbox(albumItems[i], { list: albumItems, index: i });
        return;
      }
      // 历史格子 → 灯箱（此前这些格子没有绑定点击，点了没反应）
      const his = e.target.closest('[data-hist]');
      if (his) {
        const i = Number(his.dataset.hist);
        if (historyView[i]) openLightbox(historyView[i], { list: historyView, index: i });
        return;
      }
      const p = e.target.closest('[data-provider]');
      if (p) {
        setProvider(p.dataset.provider);
        Toast.show(`数据源 · ${provider}`);
        roll();
        return;
      }
      const kw = e.target.closest('[data-kw]');
      if (kw) {
        const input = $('#pixivKw');
        if (input) input.value = kw.dataset.kw;
        window.open(PIXIV.searchUrl(kw.dataset.kw), '_blank', 'noopener');
        return;
      }
      const jump = e.target.closest('[data-jump]');
      if (jump) {
        const idx = Number(jump.dataset.jump);
        Stage.cursor = idx;
        Stage.current = Stage.history[idx];
        bus.emit('art:change', { current: Stage.current, history: Stage.history, source: 'history' });
        return;
      }
      const rm = e.target.closest('[data-remove]');
      if (rm) {
        e.stopPropagation();
        Stage.removeFromAllowlist(rm.dataset.remove);
        Stage.history = Stage.history.filter((h) => h.url !== rm.dataset.remove);
        Stage.cursor = Math.min(Stage.cursor, Stage.history.length - 1);
        Stage.current = Stage.history[Stage.cursor] || null;
        bus.emit('art:change', { current: Stage.current, history: Stage.history, source: 'history' });
      }
    });

    $('#autoProvider')?.addEventListener('click', (e) => {
      provider = null;
      $$('[data-provider]', root).forEach((b) => b.classList.remove('is-on'));
      e.currentTarget.setAttribute('aria-pressed', 'true');
      Toast.show('数据源 · 自动');
    });

    $('#pixivGo')?.addEventListener('click', () => {
      const kw = $('#pixivKw')?.value?.trim() || PIXIV.defaultKeyword;
      window.open(PIXIV.searchUrl(kw), '_blank', 'noopener');
    });
    $('#pixivKw')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $('#pixivGo')?.click();
    });

    $('#exportGallery')?.addEventListener('click', () => {
      download('gallery.json', Stage.toGalleryJSON(), 'application/json');
      Toast.ok('已下载 gallery.json');
    });
    $('#copyGallery')?.addEventListener('click', () => copyText(Stage.toGalleryJSON(), '已复制画廊 JSON'));

    // 订阅引擎事件
    offArt = bus.on('art:change', () => { paintStage(); paintHistory(); paintHistoryGrid(); setLoading(false); });
    offLoading = bus.on('art:loading', ({ provider: p }) => {
      // 数据源可以自定义加载文案（pixiv 镜像首次要回源，得把等待原因说清楚）
      const prov = p ? Registry.getImageProvider(p) : null;
      setLoading(true, prov?.loadingText || (p ? `正在从 ${p} 获取 …` : '正在获取 …'));
    });

    paintStage();
    paintHistory();
    paintHistoryGrid();
    Motion.reveal(root);

    // 相册清单（data/album.json）：异步读，读完再画网格
    loadManifest(ALBUM.manifest)
      .then((items) => {
        albumItems = items.filter((i) => i.url);
        paintAlbum(true);
      })
      .catch(() => paintAlbum(true));

    // 一进来就随机换一张大图（不再沿用上次看的那张）。
    // 先把上一条历史画出来占位，避免出现空白舞台，再异步抽新的。
    setTimeout(roll, 260);

    // 视图契约：mount 返回的函数会在离开路由时被调用
    // （灯箱挂在 document.body 上，不是 #view 的子节点，必须显式清掉，
    //   否则它绑在 document 上的 keydown 监听会一直留着）
    return () => {
      offArt?.();
      offLoading?.();
      offArt = null;
      offLoading = null;
      $$('.lightbox').forEach((el) => el.remove());
      document.body.classList.remove('is-locked');
    };
  },
};

/* ---------- 相册 / 历史瀑布流 ---------- */

/** 一张相册卡片：网格里加载缩略图，点开才是正图 */
function albumCard(it, index) {
  const src = it.thumb || it.url;
  const dim = it.width && it.height ? ` width="${it.width}" height="${it.height}"` : '';
  return `<figure class="masonry__item" data-album="${index}" title="${esc(it.title || '')}">
    <img src="${esc(src)}" alt="${esc(it.title || '')}" loading="lazy" decoding="async"${dim} referrerpolicy="no-referrer" />
    <figcaption class="masonry__cap"><span>${esc(it.title || '无标题')}</span><span>${esc(it.author || '')}</span></figcaption>
  </figure>`;
}

function paintHistoryGrid() {
  const host = $('#historyGridWrap');
  if (!host) return;
  const list = Stage.history.filter((h) => h.url).slice().reverse();
  historyView = list;
  const meta = $('#metaHistory');
  if (meta) meta.textContent = `${String(Stage.history.length).padStart(2, '0')} ITEMS`;
  if (!list.length) {
    host.innerHTML = emptyState({ title: '还没有插画记录', desc: '点击上方「随机插画」开始收集。历史会保存在本地浏览器中。' });
    return;
  }
  host.innerHTML = `<div class="masonry">${list.map((h, i) => `
    <figure class="masonry__item" data-hist="${i}" title="${esc(h.title || h.author || '')}">
      <img src="${esc(h.thumb || h.url)}" alt="${esc(h.title || '')}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
      <figcaption class="masonry__cap"><span>${esc(h.title || '无标题')}</span><span>${esc(h.author || '')}</span></figcaption>
    </figure>`).join('')}</div>`;
}

/* ---------- 灯箱 ---------- */

/**
 * 打开灯箱。
 * @param {{url:string,title?:string,author?:string}} entry 单张打开时的条目
 * @param {{list?:Array, index?:number}} opts 传入 list 时可左右翻页（相册/历史）
 */
export function openLightbox(entry, { list = null, index = -1 } = {}) {
  const items = (Array.isArray(list) && list.length) ? list : (entry ? [entry] : []);
  if (!items.length) return;
  let cur = index >= 0 && index < items.length ? index : 0;
  const multi = items.length > 1;

  const el = document.createElement('div');
  el.className = 'lightbox';
  el.innerHTML = `
    <img class="lightbox__img" alt="" referrerpolicy="no-referrer" />
    <button class="iconbtn lightbox__close" aria-label="关闭">✕</button>
    ${multi ? `
      <button class="iconbtn lightbox__nav lightbox__nav--prev" aria-label="上一张">‹</button>
      <button class="iconbtn lightbox__nav lightbox__nav--next" aria-label="下一张">›</button>` : ''}
    <div class="lightbox__bar">
      <span class="lightbox__cap"></span>
      <span>${multi ? '← → 翻页 · ' : ''}ESC / 点击背景关闭</span>
    </div>`;

  const img = el.querySelector('.lightbox__img');
  const cap = el.querySelector('.lightbox__cap');
  // 灯箱优先用正图（1200px）。正图是**按需**取：pixiv 的 regular 要走镜像回源，
  // 偶尔会很慢甚至失败 —— 失败就退回小图，别让用户盯着一个破图。
  img.addEventListener('error', () => {
    const it = items[cur];
    if (it?.full && it.url && img.getAttribute('src') !== it.url) {
      img.setAttribute('src', it.url);
      Toast.show('正图取不到，已回退小图', 'warn', { ttl: 1800 });
    }
  });
  const paint = () => {
    const it = items[cur];
    if (!it) return;
    img.src = it.full || it.url;
    img.alt = it.title || '';
    const name = it.title || '无标题';
    const by = it.author ? ` · ${it.author}` : '';
    cap.textContent = multi ? `${cur + 1} / ${items.length} · ${name}${by}` : `${name}${by}`;
  };
  const step = (d) => {
    if (!multi) return;
    cur = (cur + d + items.length) % items.length;
    paint();
  };

  const close = () => {
    el.remove();
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('is-locked');
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  };

  el.addEventListener('click', (e) => {
    if (e.target.closest('.lightbox__nav--prev')) { step(-1); return; }
    if (e.target.closest('.lightbox__nav--next')) { step(1); return; }
    if (e.target === el || e.target.closest('.lightbox__close')) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.append(el);
  document.body.classList.add('is-locked');
  paint();
}
