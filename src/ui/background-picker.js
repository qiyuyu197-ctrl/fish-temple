/**
 * ui/background-picker.js — 背景图库（首页横幅 / 沉浸舞台共用）
 * ==================================================================
 * 两个入口：
 *   - 「图库」：从相册 manifest 里选一张，横竖 / 搜索 / 分页都走真实数据；
 *   - 「导入」：本地图片压到最长边 1600px 后转成 WebP data URL，只存本机。
 *
 * 打开时返回 Promise<photo|null>；调用方负责把 photo 写进自己的固定槽位
 * （首页 heroPinned / 舞台 BG_PIN_KEY），这样换图、固定、恢复随机仍然是一套逻辑。
 */
import { esc } from '../util/dom.js';
import { loadManifest } from '../plugins/stage.js';
import { bus } from '../core/bus.js';
import { Toast } from './toast.js';

const ALL = 'all';
const LANDSCAPE = 'landscape';
const PORTRAIT = 'portrait';
const PAGE = 60;
const MAX_EDGE = 1600;

let active = null;

const dims = (it) => (it?.width && it?.height ? `${it.width} × ${it.height}` : '—');
const isPortrait = (it) => !!(it?.width && it?.height && it.height > it.width);
const ratio = (it) => (it?.width && it?.height ? (it.width / it.height).toFixed(2) : '—');
const bytesText = (n) => {
  const v = Number(n) || 0;
  if (!v) return '';
  if (v > 1024 * 1024) return `${(v / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(v / 1024))} KB`;
};

function readFile(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ''));
    fr.onerror = () => reject(new Error('文件读不出来'));
    fr.readAsDataURL(file);
  });
}

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('这张图片浏览器解不开'));
    img.src = src;
  });
}

/** 本地图片 → 压到最长边 1600px 的 WebP data URL（不超过就保留原图大小） */
async function fileToPhoto(file) {
  if (!file || !/^image\//i.test(file.type || '')) throw new Error('请选择图片文件（JPG / PNG / WebP）');
  const raw = await readFile(file);
  const img = await loadImg(raw);
  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;
  if (!w0 || !h0) throw new Error('这张图片没有有效尺寸');

  const scale = Math.min(1, MAX_EDGE / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  let url = raw;
  // 小图原样保留；大图 / PNG / 体量超过 localStorage 舒适区的，统一重压。
  if (scale < 1 || raw.length > 1_200_000 || /^image\/(png|bmp|tiff?)$/i.test(file.type)) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('浏览器不给画布，换一张图试试');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    url = canvas.toDataURL('image/webp', 0.84);
    if (!/^data:image\/webp/i.test(url)) url = canvas.toDataURL('image/jpeg', 0.86);
  }
  const bytes = Math.round((url.length - url.indexOf(',') - 1) * 0.75);
  return {
    id: `local-${Date.now().toString(36)}`,
    url,
    // 不复制第二份 data URL：首页 localStorage 里只留 url 这一份
    thumb: '',
    title: String(file.name || '本地图片').replace(/\.[^.]+$/, '') || '本地图片',
    author: '本地导入',
    width: w,
    height: h,
    bytes,
    custom: true,
  };
}

function shellHTML(scopeLabel) {
  return `
    <div class="bgpicker__scrim" data-close></div>
    <section class="bgpicker__panel" role="document" aria-labelledby="bgPickerTitle" tabindex="-1">
      <header class="bgpicker__head">
        <div class="bgpicker__headmain">
          <div class="bgpicker__eyebrow"><span>// IMAGE DECK</span><i>${esc(scopeLabel)}</i></div>
          <h2 class="bgpicker__title" id="bgPickerTitle">选一张<span>背景</span></h2>
          <p class="bgpicker__lede">从相册里挑一张，或者把自己的照片拖进来。选完会固定成当前背景，点「固定」可以恢复随机。</p>
        </div>
        <button class="bgpicker__close" type="button" data-close aria-label="关闭选图面板">
          <span>关闭</span><kbd>ESC</kbd>
        </button>
      </header>

      <nav class="bgpicker__tabs" role="tablist" aria-label="背景来源">
        <button class="bgpicker__tab is-active" type="button" data-tab="library" role="tab" aria-selected="true">
          <b>01</b><span>图库</span><i id="bpTotal">—</i>
        </button>
        <button class="bgpicker__tab" type="button" data-tab="import" role="tab" aria-selected="false">
          <b>02</b><span>导入自己的图</span><i>LOCAL</i>
        </button>
        <span class="bgpicker__tabhint">横竖都能选 · 选完固定</span>
      </nav>

      <div class="bgpicker__body">
        <aside class="bgpicker__preview" aria-label="当前选中的背景">
          <div class="bgpicker__shot">
            <img id="bpShotImg" alt="" hidden draggable="false" />
            <span class="bgpicker__shotempty" id="bpShotEmpty">
              <b>NO IMAGE</b>
              <i>从右边挑一张<br />或导入自己的图</i>
            </span>
            <span class="bgpicker__shottag" id="bpShotTag">STANDBY</span>
            <span class="bgpicker__shotcross" aria-hidden="true"></span>
          </div>
          <div class="bgpicker__previewinfo">
            <span class="bgpicker__kicker" id="bpKicker">// SELECTED</span>
            <h3 id="bpTitle">还没有选图</h3>
            <p id="bpMeta">图库里有 1090 张，慢慢挑。</p>
            <button class="bgpicker__use" type="button" id="bpUse" disabled>
              <span>使用这张背景</span><i>ENTER</i>
            </button>
            <p class="bgpicker__usenote" id="bpNote">选图后会固定这张；想回到随机，点外面的「固定」取消。</p>
          </div>
        </aside>

        <div class="bgpicker__main">
          <div class="bgpicker__library" id="bpLibrary">
            <div class="bgpicker__tools">
              <label class="bgpicker__search">
                <span aria-hidden="true">⌕</span>
                <input id="bpSearch" type="search" autocomplete="off" placeholder="搜文件名 / 日期 / 相册" aria-label="搜索图库" />
              </label>
              <div class="bgpicker__filters" role="group" aria-label="按方向筛选">
                <button class="is-active" type="button" data-filter="${ALL}">全部</button>
                <button type="button" data-filter="${LANDSCAPE}">横图</button>
                <button type="button" data-filter="${PORTRAIT}">竖图</button>
              </div>
            </div>
            <div class="bgpicker__grid" id="bpGrid" aria-live="polite">
              <div class="bgpicker__loading"><i></i><span>正在读相册索引…</span></div>
            </div>
            <div class="bgpicker__morewrap">
              <button class="bgpicker__more" type="button" id="bpMore" hidden>
                <span>加载更多</span><b id="bpCount">—</b>
              </button>
            </div>
          </div>

          <section class="bgpicker__import" id="bpImport" hidden aria-label="导入本地图片">
            <label class="bgpicker__drop" id="bpDrop">
              <input id="bpFile" type="file" accept="image/*" hidden />
              <span class="bgpicker__dropicon" aria-hidden="true">＋</span>
              <b>拖一张图进来，或点击选择</b>
              <span>JPG / PNG / WebP · 压到最长边 ${MAX_EDGE}px · 只存在这台浏览器</span>
              <em id="bpDropFile">还没有选择文件</em>
            </label>
            <div class="bgpicker__importnote">
              <b>LOCAL ONLY</b>
              <p>导入的图会存进浏览器本地，不会上传。换浏览器 / 清缓存后会消失；想换回相册，切到「图库」再选。</p>
            </div>
          </section>
        </div>
      </div>

      <footer class="bgpicker__foot">
        <span><b>双击</b>照片直接使用 · <b>ESC</b> 关闭</span>
        <span id="bpFootCount">ALBUM / —</span>
      </footer>
    </section>`;
}

export function openBackgroundPicker(options = {}) {
  if (active) active.close(null);
  const scopeLabel = options.scope === 'stage' ? '沉浸舞台' : '首页横幅';
  const currentRaw = options.currentPhoto
    || (options.currentUrl ? { url: options.currentUrl, title: '当前背景' } : null);
  const current = currentRaw
    ? { ...currentRaw, custom: currentRaw.custom ?? /^data:|^blob:/i.test(currentRaw.url || '') }
    : null;

  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'bgpicker';
    el.id = 'bgPicker';
    el.innerHTML = shellHTML(scopeLabel);
    document.body.appendChild(el);
    document.body.classList.add('is-bgpicker-open');
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const $ = (s) => el.querySelector(s);
    const $$ = (s) => [...el.querySelectorAll(s)];
    const grid = $('#bpGrid');
    const search = $('#bpSearch');
    const more = $('#bpMore');
    const totalEl = $('#bpTotal');
    const footCount = $('#bpFootCount');
    const countEl = $('#bpCount');
    const useBtn = $('#bpUse');
    const shotImg = $('#bpShotImg');
    const shotEmpty = $('#bpShotEmpty');
    const shotTag = $('#bpShotTag');
    const titleEl = $('#bpTitle');
    const metaEl = $('#bpMeta');
    const kickerEl = $('#bpKicker');
    const noteEl = $('#bpNote');
    const drop = $('#bpDrop');
    const fileInput = $('#bpFile');
    const dropFile = $('#bpDropFile');

    let items = [];
    let selected = current || null;
    let filter = ALL;
    let query = '';
    let limit = PAGE;
    let tab = 'library';
    let done = false;
    let offRoute = null;

    const close = (value = null) => {
      if (done) return;
      done = true;
      active = null;
      offRoute?.();
      window.removeEventListener('keydown', onKey, true);
      document.body.classList.remove('is-bgpicker-open');
      document.body.style.overflow = prevOverflow;
      el.remove();
      resolve(value);
    };

    const match = (it) => {
      if (filter === LANDSCAPE && isPortrait(it)) return false;
      if (filter === PORTRAIT && !isPortrait(it)) return false;
      if (!query) return true;
      const hay = `${it.title || ''} ${it.author || ''} ${it.album || ''} ${it.id || ''}`.toLowerCase();
      return hay.includes(query);
    };

    const filtered = () => items.filter(match);

    const sameCurrent = (it) => !!(current?.url && it?.url === current.url);

    const paintPreview = () => {
      if (!selected?.url) {
        shotImg.hidden = true;
        shotImg.removeAttribute('src');
        shotEmpty.hidden = false;
        shotTag.textContent = 'STANDBY';
        kickerEl.textContent = '// SELECTED';
        titleEl.textContent = '还没有选图';
        metaEl.textContent = '从图库挑一张，或者导入自己的图。';
        useBtn.disabled = true;
        useBtn.querySelector('span').textContent = '使用这张背景';
        noteEl.textContent = '选图后会固定这张；想回到随机，点外面的「固定」取消。';
        return;
      }
      shotImg.src = selected.url;
      shotImg.hidden = false;
      shotEmpty.hidden = true;
      shotTag.textContent = selected.custom ? 'LOCAL / 本机' : `NO.${String(items.indexOf(selected) + 1 || 0).padStart(3, '0')}`;
      kickerEl.textContent = selected.custom ? '// LOCAL IMAGE' : '// GALLERY PICK';
      titleEl.textContent = selected.title || '未命名背景';
      metaEl.textContent = [
        selected.custom ? '本地导入' : (selected.author || '相册'),
        dims(selected),
        ratio(selected),
        bytesText(selected.bytes),
      ].filter(Boolean).join(' · ');
      useBtn.disabled = false;
      useBtn.querySelector('span').textContent = sameCurrent(selected) ? '当前背景 · 关闭' : '使用这张背景';
      noteEl.textContent = sameCurrent(selected)
        ? '这就是现在的背景。也可以换一张别的。'
        : '选图后会固定这张；想回到随机，点外面的「固定」取消。';
      $$('.bgpicker__card').forEach((card) => {
        const on = card.dataset.url === selected.url;
        card.classList.toggle('is-on', on);
        card.setAttribute('aria-pressed', String(on));
      });
    };

    const select = (photo) => {
      selected = photo || null;
      paintPreview();
    };

    const renderGrid = () => {
      const list = filtered();
      const shown = list.slice(0, limit);
      totalEl.textContent = String(list.length).padStart(3, '0');
      footCount.textContent = `ALBUM / ${list.length} ${filter === ALL ? 'ALL' : filter.toUpperCase()}`;
      if (!list.length) {
        grid.innerHTML = `<div class="bgpicker__empty"><b>没有匹配的图</b><span>换个筛选，或者清空搜索词。</span></div>`;
        more.hidden = true;
        return;
      }
      grid.innerHTML = shown.map((it, i) => {
        const no = String(items.indexOf(it) + 1).padStart(3, '0');
        const on = selected?.url === it.url;
        return `<button class="bgpicker__card${on ? ' is-on' : ''}${sameCurrent(it) ? ' is-current' : ''}" type="button"
          data-url="${esc(it.url)}" aria-pressed="${on}" aria-label="${esc(it.title || '相册图片')}">
          <img src="${esc(it.thumb || it.url)}" alt="" loading="lazy" decoding="async" draggable="false" />
          <span class="bgpicker__cardno">NO.${no}</span>
          <span class="bgpicker__cardori">${isPortrait(it) ? '竖' : '横'}</span>
          ${sameCurrent(it) ? '<span class="bgpicker__current">当前</span>' : ''}
          <span class="bgpicker__cardname">${esc(it.title || '未命名')}</span>
          <span class="bgpicker__check" aria-hidden="true">✓</span>
        </button>`;
      }).join('');
      more.hidden = shown.length >= list.length;
      if (countEl) countEl.textContent = `${shown.length} / ${list.length}`;
    };

    const setTab = (name) => {
      tab = name;
      $$('.bgpicker__tab').forEach((b) => {
        const on = b.dataset.tab === name;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', String(on));
      });
      $('#bpLibrary').hidden = name !== 'library';
      $('#bpImport').hidden = name !== 'import';
      el.dataset.tab = name;
    };

    const apply = () => {
      if (!selected?.url) return;
      close({ ...selected });
    };

    const handleFile = async (file) => {
      if (!file) return;
      drop.classList.add('is-busy');
      dropFile.textContent = '正在压缩…';
      try {
        const photo = await fileToPhoto(file);
        select(photo);
        dropFile.textContent = `${photo.title} · ${dims(photo)} · ${bytesText(photo.bytes)}`;
        Toast.show('图片已就绪，点「使用这张背景」应用');
      } catch (err) {
        dropFile.textContent = err?.message || '这张图读不出来';
        Toast.err(err?.message || '这张图读不出来');
      } finally {
        drop.classList.remove('is-busy');
        fileInput.value = '';
      }
    };

    // 事件绑定
    el.addEventListener('click', (e) => {
      const tabBtn = e.target.closest?.('.bgpicker__tab[data-tab]');
      if (tabBtn) { setTab(tabBtn.dataset.tab); return; }
      if (e.target.closest?.('[data-close]')) { close(null); return; }
      const filterBtn = e.target.closest?.('[data-filter]');
      if (filterBtn) {
        filter = filterBtn.dataset.filter;
        limit = PAGE;
        $$('.bgpicker__filters button').forEach((b) => b.classList.toggle('is-active', b === filterBtn));
        renderGrid();
        return;
      }
      const card = e.target.closest?.('.bgpicker__card');
      if (card) {
        const photo = items.find((it) => it.url === card.dataset.url);
        if (photo) select(photo);
        return;
      }
      if (e.target.closest?.('#bpMore')) {
        limit += PAGE;
        renderGrid();
        return;
      }
      if (e.target.closest?.('#bpUse')) apply();
    });

    el.addEventListener('dblclick', (e) => {
      const card = e.target.closest?.('.bgpicker__card');
      if (!card) return;
      const photo = items.find((it) => it.url === card.dataset.url);
      if (photo) { select(photo); apply(); }
    });

    search?.addEventListener('input', () => {
      query = search.value.trim().toLowerCase();
      limit = PAGE;
      renderGrid();
    });

    drop?.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('is-over');
    });
    drop?.addEventListener('dragleave', () => drop.classList.remove('is-over'));
    drop?.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('is-over');
      handleFile(e.dataTransfer?.files?.[0]);
    });
    fileInput?.addEventListener('change', () => handleFile(fileInput.files?.[0]));

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(null);
        return;
      }
      if (e.key === 'Enter' && !e.target?.closest?.('input, textarea, button, a, [role="button"]') && selected?.url) {
        e.preventDefault();
        apply();
        return;
      }
      if (e.key === 'Tab') {
        const nodes = [...el.querySelectorAll('button:not([disabled]), input, [tabindex]:not([tabindex="-1"])')]
          .filter((n) => n.offsetParent !== null);
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (!el.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey, true);
    offRoute = bus.on('route:change', () => close(null));

    // 初始选中的是当前背景；如果它是相册里的，图库加载后会自动高亮。
    paintPreview();
    setTab('library');
    // 焦点进面板（不是搜索框，手机不自动弹键盘），Tab 只在面板内循环
    $('.bgpicker__panel')?.focus({ preventScroll: true });

    loadManifest('data/album.json')
      .then((list) => {
        items = (list || []).filter((it) => it?.url);
        if (!selected?.url) selected = null;
        renderGrid();
        paintPreview();
        if (selected?.url) {
          const curCard = [...grid.querySelectorAll('.bgpicker__card')]
            .find((c) => c.dataset.url === selected.url);
          curCard?.scrollIntoView({ block: 'nearest' });
        }
        if (!items.length) {
          grid.innerHTML = `<div class="bgpicker__empty"><b>相册索引是空的</b><span>还可以用「导入自己的图」。</span></div>`;
        }
      })
      .catch(() => {
        grid.innerHTML = `<div class="bgpicker__empty"><b>相册索引没读出来</b><span>别急，导入自己的图仍然可用。</span></div>`;
        Toast.err('相册索引没读出来，可以改用导入');
      });
  });
}

export function closeBackgroundPicker() {
  active?.close(null);
}
