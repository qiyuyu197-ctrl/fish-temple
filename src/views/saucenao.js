/**
 * saucenao.js — SAUCE / 以图搜图（终末地工业风版）
 * ------------------------------------------------------------------
 * 搜索链路（已实测跑通）：
 *   浏览器选图/粘贴/拖放 → 客户端压缩 → POST /api/saucenao/search
 *   → server.mjs 驱动无头 Edge(CDP) 打开 saucenao.com 塞图提交
 *   → 结果页 DOM 结构化提取（缩略图顺手抓成 base64）→ JSON 回传渲染
 *
 * UI 遵循全站设计语言（design/endfield-adoption.md）：
 *   · viewhead 页头 + panel 面板（顶部墨色页签）
 *   · 切角 = 可点击（btn/chip 全局已有）；面板/图片永远直角
 *   · 信号黄只做填充：高相似度的黄块数字、搜索主按钮
 *   · 宽体英文标签 + mono 微标签，颜色全部走 tokens 变量
 *
 * 原则：只显示真实搜索结果。搜不到就明说，绝不伪造。
 */

import { $, esc } from '../util/dom.js';
import engine, { computeAHash, computePHash, loadImage, compressForSearch } from '../plugins/saucenao-engine.js';
import { Toast } from '../ui/toast.js';
import { viewhead } from '../ui/bits.js';

/* ──── 引擎定义 ──── */
const ENGINES = [
  {
    id: 'saucenao', icon: '🔍', name: 'SAUCENAO · 插画找源',
    hint: '找画师与出处（Pixiv / X / Danbooru…）· 经服务端无头浏览器 · 需系统代理可用 · 约 10~25 秒',
    emptyTitle: 'SauceNAO 没有找到匹配',
    emptyDesc: '可以换一张更完整的图，或切到「番剧场景」引擎、页底的其他搜图网站再试。',
  },
  {
    id: 'trace', icon: '📺', name: 'TRACE.MOE · 番剧场景',
    hint: '动画截图 → 是哪部番、第几集、第几秒 · 国内直连无需代理 · 约 5~15 秒 · 只认动画帧，插画/照片搜不到',
    emptyTitle: 'trace.moe 没有找到匹配的动画场景',
    emptyDesc: '它只收录真实动画的帧——插画、照片、游戏截图都搜不到。找插画出处请切回 SAUCENAO 引擎。',
  },
];

/* ──── 其他搜图网站（页底面板；可达性为 2026-11-08 本机实测） ──── */
const MORE_SITES = [
  { name: 'trace.moe',       en: 'TRACE.MOE',        href: 'https://trace.moe/',               reach: 'direct', desc: '番剧场景搜索 · 已集成为本站 ENGINE' },
  { name: 'P站助手',          en: 'PIVLITE.COM',      href: 'https://pivlite.com/',             reach: 'direct', desc: 'Pixiv 国内直连客户端 · 批量下载 / 漫画翻译 / AI 高清化' },
  { name: 'Yandex 图片',      en: 'YANDEX.COM',       href: 'https://yandex.com/images/',       reach: 'direct', desc: '找二次元出处常用 · 相似图很强' },
  { name: 'Bing 识图',        en: 'BING VISUAL',      href: 'https://cn.bing.com/visualsearch', reach: 'direct', desc: '微软识图 · 国内直连 · 综合覆盖' },
  { name: 'SauceNAO 官网',    en: 'SAUCENAO.COM',     href: 'https://saucenao.com/',            reach: 'proxy',  desc: '本站插画引擎的原站 · 二次元找源最全' },
  { name: 'ascii2d',          en: 'ASCII2D.NET',      href: 'https://ascii2d.net/',             reach: 'proxy',  desc: '二次元特化 · 色检索 / 特征检索双模式' },
  { name: 'IQDB',             en: 'IQDB.ORG',         href: 'https://iqdb.org/',                reach: 'proxy',  desc: 'Danbooru / Gelbooru / Konachan 等 booru 聚合反查' },
  { name: 'TinEye',           en: 'TINEYE.COM',       href: 'https://www.tineye.com/',          reach: 'proxy',  desc: '老牌反查 · 追踪图片传播历史' },
  { name: 'Google Lens',      en: 'LENS.GOOGLE.COM',  href: 'https://lens.google.com/',         reach: 'proxy',  desc: '谷歌识图 · 综合场景最全' },
];

/* ──── 模板 ──── */
function template() {
  return `
  <section class="sauce">
    ${viewhead({
      idx: 'SAUCE / REVERSE IMAGE SEARCH',
      title: '以图搜图',
      meta: [
        { label: 'ENGINE', value: 'SAUCENAO · CDP' },
        { label: 'STATUS', value: 'DETECTING…', id: 'sauceStatus' },
        { label: 'MATCHES', value: '—', id: 'sauceMatches' },
      ],
    })}

    <!-- 服务不可用提示 -->
    <div class="notice" id="sauce-notice" hidden>
      <span class="notice__icon">!</span>
      <span id="sauce-notice-text"></span>
    </div>

    <!-- ═══ 01 输入面板 ═══ -->
    <div class="panel sauce-input" data-reveal>
      <div class="panel__head">
        <span class="panel__title">01 · INPUT 图片输入</span>
        <span class="mono faint" style="font-size:var(--fs-2xs)">拖放 / 粘贴 / 选择文件 / URL · ≤8MB 自动压缩</span>
      </div>
      <div class="panel__body">
        <div class="sauce-input__grid">
          <!-- 左：拖放区 -->
          <div class="tool-drop sauce-drop" id="sauce-drop" tabindex="0" role="button" aria-label="选择或拖入图片">
            <span class="tool-drop__ico">🖼</span>
            <b>把图片拖到这里，或点击选择</b>
            <span class="mono faint">BROWSE · DROP · CTRL+V PASTE</span>
            <input type="file" id="sauce-file" accept="image/*" hidden>
          </div>

          <!-- 右：URL + 预览 -->
          <div class="sauce-side">
            <div class="field">
              <div class="field__label">
                <span class="k-label">IMAGE URL</span>
                <span class="field__hint">需本机可达</span>
              </div>
              <div class="sauce-urlrow">
                <input type="url" id="sauce-url" placeholder="https://…/image.jpg" autocomplete="off">
                <button class="btn btn--sm" id="sauce-url-go">加载</button>
              </div>
            </div>

            <!-- 预览条 -->
            <div class="sauce-pv" id="sauce-pv" hidden>
              <img class="sauce-pv__thumb" id="sauce-pv-thumb" alt="预览">
              <div class="sauce-pv__info">
                <b class="clamp-1" id="sauce-pv-name">—</b>
                <span class="mono faint" id="sauce-pv-size">—</span>
                <span class="mono faint sauce-pv__hash">AHASH <i id="sauce-pv-ahash">—</i> · PHASH <i id="sauce-pv-phash">—</i></span>
              </div>
              <button class="btn btn--sm btn--danger" id="sauce-pv-clear" title="清除图片">✕</button>
            </div>
            <div class="sauce-pv-empty mono faint" id="sauce-pv-empty">NO IMAGE LOADED — 等待输入</div>
          </div>
        </div>

        <!-- 引擎选择 -->
        <div class="sauce-opts sauce-opts--engine">
          <span class="k-label">ENGINE</span>
          ${ENGINES.map((e, i) => `<button class="chip${i === 0 ? ' is-on' : ''}" data-engine="${e.id}" aria-pressed="${i === 0}">${e.icon} ${esc(e.name)}</button>`).join('')}
          <span class="mono faint sauce-opts__hint" id="sauce-eng-hint">${esc(ENGINES[0].hint)}</span>
        </div>

        <!-- 选项 chips -->
        <div class="sauce-opts sauce-opts--filter" id="sauce-filter-row">
          <span class="k-label">FILTER</span>
          <button class="chip is-on" id="sauce-opt-pri" aria-pressed="true">🎨🐦 Pixiv / X 优先</button>
          <button class="chip" id="sauce-opt-only" aria-pressed="false">只看 Pixiv / X</button>
          <button class="chip" id="sauce-opt-hidden" aria-pressed="false">显示低相似结果</button>
          <span class="mono faint sauce-opts__hint">匿名限流 ≈ 4 次 / 30s · 200 次 / 天</span>
        </div>

        <!-- 主操作 -->
        <div class="sauce-go-row">
          <button class="btn btn--signal sauce-go" id="sauce-go" disabled>
            <span id="sauce-go-text">SEARCH · 开始真实搜索</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ═══ 02 输出面板 ═══ -->
    <div class="panel sauce-out" id="sauce-out-panel" data-reveal>
      <div class="panel__head">
        <span class="panel__title">02 · OUTPUT 搜索结果</span>
        <span class="mono faint" id="sauce-limit" style="font-size:var(--fs-2xs)"></span>
      </div>
      <div class="panel__body">
        <!-- 待机 -->
        <div class="sauce-idle" id="sauce-idle">
          ${`<div class="empty">
            <div class="mono" style="font-size:28px;color:var(--ink-25)">⌖</div>
            <b>等待搜索</b>
            <p>在上方输入图片后点击 SEARCH。结果来自 saucenao.com 真实搜索——找不到会如实告知，绝不伪造。</p>
          </div>`}
        </div>

        <!-- 进行中 -->
        <div class="sauce-status" id="sauce-status" hidden>
          <div class="sauce-status__line mono"><i class="sauce-status__block"></i><span id="sauce-status-text">SEARCHING…</span></div>
          <div class="sauce-bar"><i></i></div>
          <p class="mono faint" id="sauce-status-sub"></p>
        </div>

        <!-- 错误 -->
        <div class="sauce-error" id="sauce-error" hidden>
          <span class="notice__icon">!</span>
          <div>
            <b>搜索失败</b>
            <p class="mono" id="sauce-error-text"></p>
          </div>
        </div>

        <!-- 空结果 -->
        <div id="sauce-empty" hidden>
          <div class="empty">
            <div class="mono" style="font-size:28px;color:var(--ink-25)">∅</div>
            <b id="sauce-empty-title">SauceNAO 没有找到匹配</b>
            <p id="sauce-empty-desc">可以换一张更完整的图，或切到「番剧场景」引擎、页底的其他搜图网站再试。</p>
          </div>
        </div>

        <!-- 结果 -->
        <div id="sauce-results" hidden>
          <div class="sauce-cmp" id="sauce-cmp">
            <span class="k-label">YOUR IMAGE</span>
            <img class="sauce-cmp__thumb" id="sauce-cmp-img" alt="你的图片">
            <span class="sauce-cmp__arrow" aria-hidden="true">→</span>
            <span class="k-label">MATCHES</span>
            <b class="sauce-cmp__count tnum" id="sauce-cmp-count">0</b>
            <span class="mono faint" id="sauce-count"></span>
          </div>
          <div class="sauce-hits" id="sauce-list"></div>
        </div>
      </div>
    </div>

    <!-- ═══ 03 · 其他搜图网站（页底） ═══ -->
    <div class="panel sauce-more" data-reveal>
      <div class="panel__head">
        <span class="panel__title">03 · MORE 其他搜图网站</span>
        <span class="mono faint" style="font-size:var(--fs-2xs)">新标签页打开 · 标注「直连」的无需代理（2026-11 实测）</span>
      </div>
      <div class="panel__body">
        <div class="sauce-more__grid">
          ${MORE_SITES.map((s) => `
            <a class="sauce-more__item" href="${esc(s.href)}" target="_blank" rel="noopener">
              <span class="sauce-more__row">
                <b>${esc(s.name)}</b>
                <span class="tag ${s.reach === 'direct' ? 'tag--ok' : 'tag--muted'}">${s.reach === 'direct' ? '直连' : '需代理'}</span>
              </span>
              <span class="mono faint sauce-more__en">${esc(s.en)}</span>
              <p>${esc(s.desc)}</p>
            </a>`).join('')}
        </div>
      </div>
    </div>

    <!-- 灯箱 -->
    <div class="sauce-lb" id="sauce-lb" hidden>
      <button class="sauce-lb__close" id="sauce-lb-close" aria-label="关闭">✕</button>
      <img class="sauce-lb__img" id="sauce-lb-img" alt="放大预览">
    </div>
  </section>`;
}

/* ──── 视图状态 ──── */
let currentImage = null;   // HTMLImageElement（预览与哈希）
let currentFile = null;    // 原始 File（上传用）
let currentBlobUrl = null;
let lastResults = [];      // 最近一次真实结果（过滤/排序切换时重渲染）

const isPixivOrX = (r) => /pixiv\.net|twitter\.com|x\.com/i.test(r.primaryUrl || '') || /pixiv|twitter/i.test(r.sourceSite || '');

/* ──── 视图 ──── */
const view = {
  id: 'saucenao',
  title: '以图搜图',

  render() {
    return template();
  },

  mount(root) {
    const statusMeta = $('#sauceStatus');
    const matchesMeta = $('#sauceMatches');
    const notice = $('#sauce-notice');
    const noticeText = $('#sauce-notice-text');
    const drop = $('#sauce-drop');
    const fileInput = $('#sauce-file');
    const urlInput = $('#sauce-url');
    const urlGo = $('#sauce-url-go');
    const pv = $('#sauce-pv');
    const pvEmpty = $('#sauce-pv-empty');
    const pvThumb = $('#sauce-pv-thumb');
    const pvName = $('#sauce-pv-name');
    const pvSize = $('#sauce-pv-size');
    const pvAhash = $('#sauce-pv-ahash');
    const pvPhash = $('#sauce-pv-phash');
    const pvClear = $('#sauce-pv-clear');
    const optPri = $('#sauce-opt-pri');
    const optOnly = $('#sauce-opt-only');
    const optHidden = $('#sauce-opt-hidden');
    const filterRow = $('#sauce-filter-row');
    const engHint = $('#sauce-eng-hint');
    const goBtn = $('#sauce-go');
    const goText = $('#sauce-go-text');
    const idleEl = $('#sauce-idle');
    const statusEl = $('#sauce-status');
    const statusText = $('#sauce-status-text');
    const statusSub = $('#sauce-status-sub');
    const errorEl = $('#sauce-error');
    const errorText = $('#sauce-error-text');
    const emptyEl = $('#sauce-empty');
    const emptyTitle = $('#sauce-empty-title');
    const emptyDesc = $('#sauce-empty-desc');
    const resultsEl = $('#sauce-results');
    const cmpImg = $('#sauce-cmp-img');
    const cmpCount = $('#sauce-cmp-count');
    const countEl = $('#sauce-count');
    const limitEl = $('#sauce-limit');
    const listEl = $('#sauce-list');
    const lb = $('#sauce-lb');
    const lbImg = $('#sauce-lb-img');
    const lbClose = $('#sauce-lb-close');

    /* ---- 当前引擎 ---- */
    let currentEngine = 'saucenao';
    const engineOf = (id) => ENGINES.find((e) => e.id === id) || ENGINES[0];

    /* ---- 输出面板状态机 ---- */
    const showOut = (which) => {
      idleEl.hidden = which !== 'idle';
      statusEl.hidden = which !== 'status';
      errorEl.hidden = which !== 'error';
      emptyEl.hidden = which !== 'empty';
      resultsEl.hidden = which !== 'results';
      if (which === 'empty') {
        // 空态文案随引擎变化：trace.moe 只认动画帧，提示语必须说清楚
        const e = engineOf(currentEngine);
        if (emptyTitle) emptyTitle.textContent = e.emptyTitle;
        if (emptyDesc) emptyDesc.textContent = e.emptyDesc;
      }
    };
    showOut('idle');

    /* ---- 服务端能力探测 ---- */
    engine.probe().then((st) => {
      if (!statusMeta) return;
      if (st?.ok) {
        statusMeta.textContent = 'READY';
        statusMeta.style.color = 'var(--ok)';
      } else {
        statusMeta.textContent = 'NO BROWSER';
        statusMeta.style.color = 'var(--alert)';
        if (notice && noticeText) {
          notice.hidden = false;
          noticeText.textContent = '未检测到可用的浏览器内核（Edge / Chrome）——服务端无法执行 SauceNAO 真实搜索。';
        }
      }
    }).catch(() => {
      if (statusMeta) { statusMeta.textContent = 'OFFLINE'; statusMeta.style.color = 'var(--alert)'; }
    });

    /* ---- 图片预览 ---- */
    const updatePreview = async () => {
      if (!currentImage || !currentFile) {
        pv.hidden = true;
        pvEmpty.hidden = false;
        return;
      }
      pv.hidden = false;
      pvEmpty.hidden = true;
      pvThumb.src = currentBlobUrl || '';
      pvName.textContent = currentFile.name || '图片';
      const kb = currentFile.size / 1024;
      pvSize.textContent = `${currentImage.naturalWidth}×${currentImage.naturalHeight} · ${kb > 1024 ? (kb / 1024).toFixed(1) + ' MB' : Math.round(kb) + ' KB'}`;
      pvAhash.textContent = '…';
      pvPhash.textContent = '…';
      try {
        pvAhash.textContent = computeAHash(currentImage);
        pvPhash.textContent = computePHash(currentImage);
      } catch {
        pvAhash.textContent = '—';
        pvPhash.textContent = '—';
      }
    };

    const updateGoBtn = () => { goBtn.disabled = !currentFile; };

    /* ---- 收图 ---- */
    const handleImage = async (file) => {
      if (!file?.type?.startsWith('image/')) { Toast.show('请选择图片文件', 'err'); return; }
      try {
        const img = await loadImage(file);
        currentImage = img;
        currentFile = file;
        if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = URL.createObjectURL(file);
        await updatePreview();
        updateGoBtn();
        showOut('idle');
        if (matchesMeta) matchesMeta.textContent = '—';
        if (limitEl) limitEl.textContent = '';
      } catch (err) {
        Toast.show('图片加载失败: ' + err.message, 'err');
      }
    };

    const handleUrl = async (url) => {
      if (!url) return;
      showOut('status');
      statusText.textContent = 'LOADING IMAGE FROM URL…';
      statusSub.textContent = url.slice(0, 120);
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        if (!blob.type.startsWith('image/')) throw new Error('目标不是有效图片');
        showOut('idle');
        await handleImage(new File([blob], decodeURIComponent(url.split('/').pop() || 'image.png').slice(0, 60), { type: blob.type }));
      } catch (err) {
        showOut('idle');
        Toast.show('无法加载 URL 图片: ' + err.message, 'err');
      }
    };

    /* ---- 拖放 ---- */
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('is-over');
      const file = e.dataTransfer?.files?.[0];
      if (file) handleImage(file);
    });
    drop.addEventListener('click', () => fileInput.click());
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
    fileInput.addEventListener('change', () => { if (fileInput.files?.[0]) handleImage(fileInput.files[0]); });

    /* ---- 粘贴 ---- */
    const onPaste = (e) => {
      if (!root.isConnected) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) { e.preventDefault(); handleImage(item.getAsFile()); break; }
      }
    };
    document.addEventListener('paste', onPaste);

    /* ---- URL ---- */
    urlGo.addEventListener('click', () => handleUrl(urlInput.value.trim()));
    urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleUrl(urlInput.value.trim()); });

    /* ---- 清除 ---- */
    pvClear.addEventListener('click', () => {
      currentImage = null; currentFile = null;
      if (currentBlobUrl) { URL.revokeObjectURL(currentBlobUrl); currentBlobUrl = null; }
      lastResults = [];
      updatePreview(); updateGoBtn(); showOut('idle');
      urlInput.value = '';
      fileInput.value = '';
      if (matchesMeta) matchesMeta.textContent = '—';
      if (limitEl) limitEl.textContent = '';
    });

    /* ---- 选项 chips（仅 saucenao 结果有效） ---- */
    const bindChip = (el) => el.addEventListener('click', () => {
      const on = el.classList.toggle('is-on');
      el.setAttribute('aria-pressed', String(on));
      if (currentEngine === 'saucenao') renderResults(lastResults);
    });
    bindChip(optPri); bindChip(optOnly); bindChip(optHidden);

    /* ---- 引擎切换 ---- */
    const engineChips = [...root.querySelectorAll('.sauce-opts--engine .chip[data-engine]')];
    const applyEngine = (id) => {
      currentEngine = id;
      const e = engineOf(id);
      engineChips.forEach((c) => {
        const on = c.dataset.engine === id;
        c.classList.toggle('is-on', on);
        c.setAttribute('aria-pressed', String(on));
      });
      if (engHint) engHint.textContent = e.hint;
      // FILTER 行只对 saucenao 有意义（trace.moe 结果是番剧，无 Pixiv/X 概念）
      if (filterRow) filterRow.hidden = id !== 'saucenao';
      if (goText) goText.textContent = id === 'trace' ? 'SEARCH · 识别动画场景' : 'SEARCH · 开始真实搜索';
    };
    engineChips.forEach((c) => c.addEventListener('click', () => applyEngine(c.dataset.engine)));

    /* ---- 灯箱 ---- */
    const closeLb = () => { lb.hidden = true; };
    lbClose.addEventListener('click', closeLb);
    lb.addEventListener('click', (e) => { if (e.target === lb) closeLb(); });
    const onKey = (e) => { if (e.key === 'Escape' && !lb.hidden) closeLb(); };
    document.addEventListener('keydown', onKey);

    listEl.addEventListener('click', (e) => {
      const zoom = e.target.closest('.sauce-hit__zoom');
      const thumb = e.target.closest('.sauce-hit__thumb img');
      if (zoom || thumb) {
        const img = (zoom || thumb).closest('.sauce-hit__thumb')?.querySelector('img');
        if (img?.src) { lbImg.src = img.src; lb.hidden = false; }
      }
    });

    /* ---- 真实搜索 ---- */
    let searching = false;
    let lastTrace = [];   // trace.moe 最近结果
    goBtn.addEventListener('click', async () => {
      if (!currentFile || searching) return;
      searching = true;
      goBtn.disabled = true;
      goText.textContent = 'SEARCHING…';
      if (statusMeta) { statusMeta.textContent = 'SEARCHING'; statusMeta.style.color = 'var(--signal-deep)'; }

      showOut('status');
      statusText.textContent = '> COMPRESSING IMAGE…';
      statusSub.textContent = '';

      try {
        const outgoing = await compressForSearch(currentFile).catch(() => currentFile);

        if (currentEngine === 'trace') {
          /* ---- trace.moe：番剧场景识别（国内直连） ---- */
          statusText.textContent = '> SEARCHING ANIME SCENES VIA TRACE.MOE…';
          statusSub.textContent = '国内直连，通常 5~15 秒 · 只认动画帧（插画/照片搜不到）';
          const data = await engine.searchTrace(outgoing);
          lastResults = [];
          lastTrace = data?.results || [];
          if (matchesMeta) matchesMeta.textContent = String(lastTrace.length);
          if (limitEl) {
            limitEl.textContent = `${lastTrace.length} MATCHES · ${((data?.elapsedMs || 0) / 1000).toFixed(1)}S · TRACE.MOE` +
              (data?.quota != null ? ` · QUOTA ${data.quotaUsed}/${data.quota}` : '');
          }
          if (statusMeta) { statusMeta.textContent = 'READY'; statusMeta.style.color = 'var(--ok)'; }
          renderTraceResults(lastTrace, data);
        } else {
          /* ---- saucenao：插画找源（无头浏览器） ---- */
          statusText.textContent = '> SEARCHING SAUCENAO VIA HEADLESS BROWSER…';
          statusSub.textContent = '真实搜索约需 10~25 秒（网络抖动时服务端自动重试，最长约 2 分钟）';
          const data = await engine.searchViaServer(outgoing);
          lastResults = data?.results || [];
          lastTrace = [];
          if (matchesMeta) matchesMeta.textContent = String(lastResults.length);
          if (limitEl) limitEl.textContent = data?.elapsedMs ? `${lastResults.length} MATCHES · ${(data.elapsedMs / 1000).toFixed(1)}S · SAUCENAO.COM` : '';
          if (statusMeta) { statusMeta.textContent = 'READY'; statusMeta.style.color = 'var(--ok)'; }
          renderResults(lastResults);
        }
      } catch (err) {
        showOut('error');
        errorText.textContent = err?.message || String(err);
        if (statusMeta) { statusMeta.textContent = 'ERROR'; statusMeta.style.color = 'var(--alert)'; }
      } finally {
        searching = false;
        goBtn.disabled = !currentFile;
        goText.textContent = 'SEARCH · 开始真实搜索';
      }
    });

    /* ---- 结果渲染（全部真实数据） ---- */
    function renderResults(results) {
      if (!Array.isArray(results) || !results.length) {
        if (!resultsEl.hidden) showOut('empty');
        return;
      }

      let list = results.slice();
      if (!optHidden.classList.contains('is-on')) list = list.filter((r) => !r.hidden);
      if (optOnly.classList.contains('is-on')) list = list.filter(isPixivOrX);
      if (optPri.classList.contains('is-on')) {
        list.sort((a, b) => {
          const d = (isPixivOrX(b) ? 1 : 0) - (isPixivOrX(a) ? 1 : 0);
          return d !== 0 ? d : (b.similarity || 0) - (a.similarity || 0);
        });
      }

      if (!list.length) { showOut('empty'); return; }
      showOut('results');

      if (currentBlobUrl) cmpImg.src = currentBlobUrl;
      cmpCount.textContent = String(list.length);
      countEl.textContent = `共 ${results.length} 条，当前显示 ${list.length} 条`;

      listEl.innerHTML = list.map((r, i) => {
        const sim = parseFloat(r.similarity) || 0;
        const simCls = sim >= 85 ? 'is-high' : sim >= 60 ? 'is-mid' : 'is-low';
        const who = r.creator || r.member || r.author || '';
        const thumb = r.thumbnailData || r.thumbnail || '';
        const hasThumb = thumb && !/blocked\.gif/.test(thumb);
        const others = (r.links || [])
          .filter((l) => l.url !== r.primaryUrl)
          .slice(0, 5)
          .map((l) => {
            let host = l.label || '';
            try { host = host || new URL(l.url).hostname.replace(/^www\./, ''); } catch {}
            return `<a class="btn btn--sm" href="${esc(l.url)}" target="_blank" rel="noopener" title="${esc(l.url)}">${esc(String(host).slice(0, 24))} ↗</a>`;
          }).join('');

        return `
        <article class="sauce-hit${r.hidden ? ' is-dim' : ''}" style="animation-delay:${Math.min(i * 45, 450)}ms">
          <div class="sauce-hit__thumb">
            ${hasThumb
              ? `<img src="${esc(thumb)}" alt="匹配缩略图" loading="lazy" referrerpolicy="no-referrer"
                   onerror="this.style.display='none';this.nextElementSibling.hidden=false">`
              : ''}
            <div class="sauce-hit__ph mono" ${hasThumb ? 'hidden' : ''}>NO IMG</div>
            ${hasThumb ? '<button class="sauce-hit__zoom" title="放大">⛶</button>' : ''}
          </div>
          <div class="sauce-hit__sim ${simCls}" title="相似度 ${sim.toFixed(2)}%">
            <b class="tnum">${sim.toFixed(1)}</b><i>%</i>
          </div>
          <div class="sauce-hit__body">
            <div class="sauce-hit__top">
              <span class="tag ${isPixivOrX(r) ? 'tag--ink' : ''}">${esc(r.sourceIcon || '🌐')} ${esc(r.sourceSite || r.indexName || '未知来源')}</span>
              ${r.indexName ? `<span class="tag tag--muted">INDEX ${esc(r.indexName)}${r.dbId ? ' #' + r.dbId : ''}</span>` : ''}
              ${r.hidden ? '<span class="tag tag--muted">低相似</span>' : ''}
              <span class="mono faint sauce-hit__rank">RANK ${String(i + 1).padStart(2, '0')}</span>
            </div>
            <h3 class="sauce-hit__title clamp-1">${esc(r.title || (who ? `Creator: ${who}` : (r.source || '无标题')))}</h3>
            <div class="sauce-hit__meta mono">
              ${who ? `<span>👤 ${esc(who)}</span>` : ''}
              ${r.source ? `<span>📌 ${esc(r.source)}</span>` : ''}
              ${r.material ? `<span>📄 ${esc(r.material)}</span>` : ''}
              ${r.characters ? `<span class="clamp-1">🎭 ${esc(r.characters)}</span>` : ''}
            </div>
            <div class="sauce-hit__links">
              ${r.primaryUrl ? `<a class="btn btn--sm btn--signal" href="${esc(r.primaryUrl)}" target="_blank" rel="noopener">打开来源 · ${esc(r.primaryLabel || r.sourceSite || 'SOURCE')} ↗</a>` : ''}
              ${others}
            </div>
          </div>
        </article>`;
      }).join('');
    }

    /* ---- trace.moe 结果渲染（番剧场景：作品/集数/时间戳/预览） ---- */
    function renderTraceResults(list, data) {
      if (!Array.isArray(list) || !list.length) { showOut('empty'); return; }
      showOut('results');

      if (currentBlobUrl) cmpImg.src = currentBlobUrl;
      cmpCount.textContent = String(list.length);
      countEl.textContent = `动画场景匹配 ${list.length} 条`;

      const fmtClock = (sec) => {
        const s = Math.max(0, Math.floor(sec || 0));
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      };

      listEl.innerHTML = list.map((r, i) => {
        const sim = parseFloat(r.similarity) || 0;
        const simCls = sim >= 85 ? 'is-high' : sim >= 60 ? 'is-mid' : 'is-low';
        const title = r.titleNative || r.titleRomaji || r.titleEnglish || (r.anilist ? `AniList #${r.anilist}` : '未知作品');
        const epLabel = r.episode != null && r.episode !== ''
          ? `EP.${String(r.episode).padStart(2, '0')}`
          : (r.format === 'MOVIE' ? '剧场版' : '');
        const yearTag = r.seasonYear ? `${r.seasonYear}` : '';

        return `
        <article class="sauce-hit" style="animation-delay:${Math.min(i * 45, 450)}ms">
          <div class="sauce-hit__thumb">
            ${r.image ? `<img src="${esc(r.image)}" alt="场景预览帧" loading="lazy" referrerpolicy="no-referrer"
                 onerror="this.style.display='none';this.nextElementSibling.hidden=false">` : ''}
            <div class="sauce-hit__ph mono" ${r.image ? 'hidden' : ''}>NO IMG</div>
            ${r.image ? '<button class="sauce-hit__zoom" title="放大">⛶</button>' : ''}
          </div>
          <div class="sauce-hit__sim ${simCls}" title="相似度 ${sim.toFixed(2)}%">
            <b class="tnum">${sim.toFixed(1)}</b><i>%</i>
          </div>
          <div class="sauce-hit__body">
            <div class="sauce-hit__top">
              <span class="tag tag--ink">📺 ANIME</span>
              ${yearTag ? `<span class="tag tag--muted">${esc(yearTag)}${r.format ? ' · ' + esc(r.format) : ''}</span>` : ''}
              ${r.totalEpisodes ? `<span class="tag tag--muted">全 ${esc(String(r.totalEpisodes))} 话</span>` : ''}
              <span class="mono faint sauce-hit__rank">RANK ${String(i + 1).padStart(2, '0')}</span>
            </div>
            <h3 class="sauce-hit__title clamp-1">${esc(title)}</h3>
            <div class="sauce-hit__meta mono">
              ${r.titleRomaji && r.titleNative ? `<span class="clamp-1">🔤 ${esc(r.titleRomaji)}</span>` : ''}
              ${epLabel ? `<span>🎬 ${esc(epLabel)}</span>` : ''}
              <span>⏱ ${fmtClock(r.from)} – ${fmtClock(r.to)}</span>
            </div>
            <div class="sauce-hit__links">
              ${r.video ? `<a class="btn btn--sm btn--signal" href="${esc(r.video)}" target="_blank" rel="noopener">▶ 预览片段 ↗</a>` : ''}
              ${r.anilist ? `<a class="btn btn--sm" href="https://anilist.co/anime/${Number(r.anilist)}" target="_blank" rel="noopener">AniList ↗</a>` : ''}
            </div>
          </div>
        </article>`;
      }).join('');
    }

    applyEngine('saucenao');
    updatePreview();
    updateGoBtn();

    /* ---- 卸载清理 ---- */
    return () => {
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('keydown', onKey);
      if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
      currentImage = null; currentFile = null; currentBlobUrl = null; lastResults = [];
    };
  },
};

export default view;
export { view as saucenaoView };
