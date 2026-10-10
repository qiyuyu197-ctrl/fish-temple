/**
 * views/music.js — 音乐台
 * ------------------------------------------------------------------
 * 站点内不再自带音频文件，播放列表整体由网易云曲目组成：
 *
 *   · 搜索   站内搜索网易云曲目（经 server.mjs 代理元数据接口）
 *   · 歌单   粘贴公开歌单链接 / ID，一次性把整个歌单的曲目导入播放列表
 *            （仅元数据；「我喜欢的音乐」等需要登录的歌单读不到，本站不做登录）
 *   · 播放   网易云官方外链播放器 iframe —— 版权与登录由网易云自行处理，
 *            本站不接触任何音频流
 *   · 列表   加入 / 移除 / 清空，保存在浏览器本地；该列表就是网站的播放列表
 *   · 降级   没有服务器时不能搜索，但可以粘贴任意网易云链接生成播放器
 *
 * 播放条内部的进度与音量由网易云自持，因此这里的进度条对网易云曲目只做展示估算。
 */

import { $, $$, esc, ICON, debounce } from '../util/dom.js';
import { bus } from '../core/bus.js';
import { Player, fmtClock } from '../core/player.js';
import { Toast, copyText } from '../ui/toast.js';
import { Motion } from '../core/motion.js';
import { MiniPlayer } from '../ui/miniaudio.js';
import { EmbedHost } from '../ui/embed-host.js';
import { viewhead, emptyState } from '../ui/bits.js';
import { setLyricNote } from '../ui/lyrics.js';
import {
  pageUrl, parseSongId, probeApi, search, fetchSongs,
  toTrack, savePlaylist,
  importPlaylist, PLAYLIST_IMPORT_LIMIT,
  isVipOnly, checkPlayable, findPlayableAlternatives, audioInfo, looksLikeFragment,
  importFromLink, classifyLink,
} from '../plugins/netease.js';
// 站内播放历史：**我们自己的**一份记录（不接网易云账号、不存任何第三方 cookie、不发给网易云）。
// 记录与同步都在 core/history.js 里自己挂 bus 完成，这里只负责把它画出来、让用户能继续播放。
import {
  list as historyList, resumeFor as historyResume,
  frequent as historyFrequent, clear as historyClear, HISTORY_MAX,
} from '../core/history.js';

let state = {
  q: '',
  results: [],
  total: 0,
  searching: false,
  error: '',
  apiReady: null,
  loadingList: false,
  importing: false,
  playableOnly: false,     // 搜索结果只显示非会员曲目
  /**
   * 当前这首「放不出来」时的说明与替代版本：
   * { id, playable: false, checking: bool, alternatives: [...] }
   */
  sound: null,
};

const fmtDur = (s) => (s ? fmtClock(s) : '--:--');

/** 会员 / 付费曲目的小标（官方外链播放器匿名态不出声） */
const vipTag = (song) => (isVipOnly(song)
  ? '<span class="tag tag--alert" title="网易云会员曲目：未登录会员时官方外链播放器不会出声">VIP</span>'
  : '');

/* ---------------- 片段 ---------------- */

function searchResultRow(song, i) {
  const inList = Player.tracks.some((t) => t.neteaseId === String(song.id));
  return `
  <div class="ne-row" data-song='${esc(JSON.stringify(song))}' data-i="${i}">
    <span class="ne-row__no mono">${String(i + 1).padStart(2, '0')}</span>
    <span class="ne-row__cover">${song.cover ? `<img src="${esc(song.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : ''}</span>
    <span class="ne-row__main">
      <span class="ne-row__name clamp-1">${esc(song.name)} ${vipTag(song)}</span>
      <span class="ne-row__meta clamp-1">${esc((song.artists || []).join(' / ') || '未知歌手')}${song.album ? ` · ${esc(song.album)}` : ''}</span>
    </span>
    <span class="ne-row__dur mono">${fmtDur(song.duration)}</span>
    <span class="ne-row__acts">
      <button class="btn btn--sm btn--signal" data-act="play" title="在站内播放">▶ 播放</button>
      <button class="btn btn--sm${inList ? ' is-on' : ''}" data-act="add" ${inList ? 'disabled' : ''}>${inList ? '已在列表' : '+ 加入'}</button>
      <a class="btn btn--sm" href="${pageUrl(song.id)}" target="_blank" rel="noopener noreferrer" title="打开网易云原页面">↗</a>
    </span>
  </div>`;
}

function trackRow(t, i) {
  const active = i === Player.index ? ' is-active' : '';
  const embed = t.provider === 'netease';
  return `
  <div class="track${active}" data-track="${i}">
    <span class="track__no">${String(i + 1).padStart(2, '0')}</span>
    <span class="track__eq"><i></i><i></i><i></i></span>
    <span class="track__main">
      <span class="track__name clamp-1">${esc(t.title)}</span>
      <span class="track__artist">${esc(t.artist || '未知歌手')}${embed ? ' · 网易云' : ''}</span>
    </span>
    <span class="track__tags">
      ${(t.tags || []).map((x) => `<span class="tag tag--muted">${esc(x)}</span>`).join('')}
      ${vipTag(t)}
      <span class="tag ${embed ? 'tag--alert' : 'tag--signal'}">${embed ? 'NETEASE' : '本地'}</span>
    </span>
    <span class="track__dur">${fmtDur(t.duration)}</span>
    <button class="track__del" data-del="${i}" title="从列表移除">✕</button>
  </div>`;
}

function playlistHTML() {
  if (!Player.tracks.length) {
    return emptyState({
      title: '播放列表是空的',
      desc: '在上面搜索网易云曲目，点「+ 加入」加进来，或粘贴链接生成播放器。',
      icon: '♫',
    });
  }
  return `<div class="tracks__list" id="trackList">${Player.tracks.map(trackRow).join('')}</div>`;
}

/**
 * 播放器占位槽。
 * 真正的 iframe 由全局 #embedHost 托管（见 src/ui/embed-host.js），
 * 这里只放一个标记元素，宿主通过 [data-dock="inline"] 把自己定位到这个槽位上。
 * 这样切换板块时 iframe 不会被销毁，播放得以继续。
 */
function embedHTML() {
  const t = Player.current;
  // 只有宿主里真的挂着 iframe 时才算「有播放器」—— 点了「停止」之后
  // 曲目还在列表里被选中，但官方播放器已经收起来了，槽位要回到待机形态。
  const active = !!t && t.provider === 'netease' && EmbedHost.active;
  // 曲目是网易云的，但走的是「站内直放」（同源 <audio>）——这时官方播放器根本不挂载，
  // 槽位不该显示成"待机"，更不该沿用官方播放器那一套说明文字。
  const direct = !!t && t.provider === 'netease' && !active && !Player.isEmbed;
  const crop = EmbedHost.cropped;
  // 有曲目时槽位需要容纳「标题 + 说明 + 播放器区域」，否则浮在上面的
  // 播放器会压到下方卡片（宿主是 position:fixed，不占文档流）。
  return `
  <div class="ne-embed-slot${active ? ' is-active' : ''}" id="embedBox" data-embed-slot>
    <div class="ne-embed-slot__head">
      <span class="ne-embed-slot__title">
        <span class="status-dot ${active ? 'status-dot--on' : ''}"></span>
        <b>${active ? '网易云官方播放器' : (direct ? '站内直放 · 未使用官方播放器' : '网易云官方播放器 · 待机')}</b>
        ${active ? `<span class="mono" style="font-size:var(--fs-2xs);color:var(--fg-faint)">ID ${esc(t.neteaseId)}</span>` : ''}
      </span>
      <span class="ne-embed-slot__acts">
        ${active ? `
        <button class="btn btn--sm" id="embedCrop" title="在「只留控制条」与「官方完整播放器」之间切换"
                aria-pressed="${crop}">${crop ? '完整播放器' : '仅控制条'}</button>
        <button class="btn btn--sm" id="embedStop" title="停止播放并收起播放器">✕ 停止</button>`
        : (direct
            ? '<span class="mono" style="font-size:var(--fs-2xs)">DIRECT STREAM</span>'
            : '<span class="mono" style="font-size:var(--fs-2xs)">OFFICIAL EMBED</span>')}
      </span>
    </div>
    ${active ? `<p class="ne-embed-slot__note">
      官方嵌入只有 <span class="mono">type/id/auto/height</span> 四个参数，内部样式改不了，所以这里默认只留它的一条控制带（进度 / 时间 / 播放键）；暂停会回到 <span class="mono">0:00</span>，切板块不影响播放。
    </p>` : direct ? `<p class="ne-embed-slot__note">
      这一首经本站同源转发<b>直接播放</b>：进度、音量、暂停续播都由站内掌握，切到其他板块、把标签页放到后台、手机息屏，都能完整播完并自动接下一首。只有站内拿不到音频流的曲目（会员 / 版权受限）才会改用官方外链播放器。
    </p>` : `<div class="ne-embed-slot__ph">
      ${ICON.music}
      <p>尚未选择网易云曲目</p>
      <p class="faint">上面搜索后点「▶ 播放」，可播放的曲目直接由站内播放（右下角有迷你条）；只有会员 / 版权受限的曲目才会用官方播放器，切到其他板块时它会折叠到右下角继续播放</p>
    </div>`}
    ${active ? '<div class="ne-embed-slot__stage" data-embed-stage aria-hidden="true"></div>' : ''}
  </div>`;
}
/* ---------------- 视图 ---------------- */

export default {
  id: 'music',
  title: '音乐',

  render() {
    const hasApi = state.apiReady;
    const cur = Player.current;
    return `
    <section class="music">
      ${viewhead({
        title: 'AUDIO DECK',
        sub: '搜索网易云曲目、粘贴歌曲或歌单链接，直接在站内试听。默认经本站同源转发音频流播放：有真实进度、可拖动、切后台也能完整播完并自动接下一首；会员或版权受限的曲目自动退回网易云官方外链播放器。',
        idx: 'MODULE / 04',
        // 页头只留两个真正会变的数字：曲目数、代理状态（NOW 在下面「正在播放」里已经有了）
        meta: [
          { label: 'PLAYLIST', value: `${String(Player.tracks.length).padStart(2, '0')} TRACKS`, id: 'metaTracks' },
          { label: 'API', value: hasApi === null ? '检测中' : (hasApi ? 'PROXY ONLINE' : 'PROXY OFFLINE'), id: 'metaApi' },
        ],
        actions: `<button class="btn btn--sm" id="neteaseHome">${ICON.ext}网易云首页</button>`,
      })}

      ${hasApi === false ? `<div class="notice" style="margin-top:var(--sp-5)">
        <span class="notice__icon">!</span>
        <div>
          <b>未检测到服务器，搜索不可用</b>
          <div class="muted" style="font-size:var(--fs-sm)">
            网易云接口不返回 CORS 头，浏览器无法直连。请用 <span class="mono">node server.mjs</span> 启动后访问
            <span class="mono">http://localhost:5173</span>；或直接在下方粘贴网易云链接生成播放器。
          </div>
        </div>
      </div>` : ''}

      <!-- ① 一个输入框搞定三件事：搜关键词 / 粘贴歌曲链接或 ID / 导入歌单与专辑 -->
      <div class="ne-search" id="neSearch" style="margin-top:var(--sp-5)">
        <div class="ne-search__head">
          <span class="k-label k-label--ink">搜索 / 导入</span>
          <span class="mono faint" style="font-size:var(--fs-2xs)" id="plStatus">
            粘贴歌单 / 专辑链接或 ID · 单次最多 ${PLAYLIST_IMPORT_LIMIT} 首
          </span>
        </div>
        <div class="ne-search__bar">
          <input type="search" id="neInput" autocomplete="off" spellcheck="false"
                 placeholder="搜歌名 / 歌手；或粘贴网易云歌曲、歌单、专辑链接（含 163cn.tv 短链）"
                 value="${esc(state.q)}" ${hasApi === false ? 'disabled' : ''} />
          <button class="btn btn--signal" id="neGo" ${hasApi === false ? 'disabled' : ''}>${ICON.search}搜索 / 播放</button>
          <button class="btn" id="plImport" ${hasApi === false ? 'disabled' : ''}>${ICON.ext}导入歌单 / 专辑</button>
          <button class="btn" id="plReplace" title="清空现有列表后用这个歌单 / 专辑替换" ${hasApi === false ? 'disabled' : ''}>替换</button>
        </div>
        <div class="ne-search__quick">
          <span class="k-label">快捷</span>
          ${['夜航星', 'Beyond', '久石让', 'Lofi', '钢琴', '纯音乐'].map((k) => `<button class="chip" data-kw="${esc(k)}">${esc(k)}</button>`).join('')}
          <span class="ne-search__sep" aria-hidden="true"></span>
          <span class="k-label">歌单</span>
          ${[['热歌榜', '3778678'], ['飙升榜', '19723756'], ['新歌榜', '3779629']].map(([label, id]) => `<button class="chip" data-playlist="${id}">${esc(label)}</button>`).join('')}
        </div>
        <p class="ne-search__hint">
          <b>关键词</b>搜曲目；<b>歌曲链接或纯数字 ID</b>直接播放；<b>歌单 / 专辑链接</b>（含 App 分享出来的
          <code>163cn.tv</code> 短链）会被自动识别类型并并入本站列表。
          只读公开歌单与专辑，私密歌单需要登录 —— 本站不做登录。
        </p>
      </div>

      <!-- 搜索结果：紧贴搜索条下方，搜完不用往下翻就能看到 -->
      <div class="ne-results" id="neResults" style="margin-top:var(--sp-4)">${renderResults()}</div>

      <!-- 正在播放：站内传输键 + 官方控制带合成一块，避免同一份信息重复三遍 -->
      <section class="np" style="margin-top:var(--sp-5)">
        <div class="np__head">
          <span class="panel__title">正在播放</span>
          <span class="np__src mono" id="npSource">${cur ? (cur.provider === 'netease' ? 'NETEASE' : '本地音频') : '待机'}</span>
        </div>
        <div class="np__body">
          <div id="neNow" class="np__now">${renderNow()}</div>
          <div id="embedWrap" class="np__embed">${embedHTML()}</div>
        </div>
      </section>

      <!-- 播放列表（最近播放收进底部细条，不再单独占一个面板） -->
      <section class="tracks" style="margin-top:var(--sp-5)">
        <div class="tracks__head">
          <span class="panel__title">网站播放列表</span>
          <span class="mono faint" style="font-size:var(--fs-2xs)" id="trackCount">${String(Player.tracks.length).padStart(2, '0')} TRACKS</span>
          <span class="grow"></span>
          <button class="btn btn--sm" id="plShuffle" aria-pressed="${Player.shuffle}">${ICON.shuffle}随机</button>
          <button class="btn btn--sm" id="plAutoNext" aria-pressed="${Player.embedAutoNext}"
                  title="网易云曲目没有播放结束回调，只能按时长估算；默认关闭以免把没放完的歌切走">播完自动下一首${Player.embedAutoNext ? '' : '（关）'}</button>
          <button class="btn btn--sm" id="plPrev" title="上一首">${ICON.prev}</button>
          <button class="btn btn--sm" id="plNext" title="下一首">${ICON.next}</button>
          <button class="btn btn--sm btn--danger" id="plClear">清空列表</button>
        </div>
        <div id="playlistWrap">${playlistHTML()}</div>
        <!-- 站内播放历史：只记在我们自己这边（浏览器 + 你账号下的一份记录），不发给网易云 -->
        <div class="tracks__hist" id="histWrap">
          <div class="tracks__histhead">
            <span class="k-label k-label--signal">最近播放</span>
            <span class="mono faint" style="font-size:var(--fs-2xs)" id="histCount"></span>
            <span class="grow"></span>
            <button class="btn btn--sm" id="histClear" title="只清我们站内的记录，不影响你在网易云的任何数据">清空记录</button>
          </div>
          <div id="neHistory">${renderHistory()}</div>
        </div>
      </section>
    </section>`;
  },

  async mount(root) {
    MiniPlayer.show();

    /* ---- 探测后端 ---- */
    state.apiReady = await probeApi();
    // 页头的 API 状态是渲染时定格的「检测中」，探测完成后要回填
    const metaApi = $('#metaApi');
    if (metaApi) metaApi.textContent = state.apiReady ? 'PROXY ONLINE' : 'PROXY OFFLINE';
    const input = $('#neInput');
    const go = $('#neGo');
    if (state.apiReady === false) {
      input?.setAttribute('disabled', '');
      go?.setAttribute('disabled', '');
    }

    /* ---- 导入歌单 ---- */
    // 搜索、粘贴歌曲链接、导入歌单现在共用同一个输入框（#neInput）：
    // 面板少了一个，也不会再有「我该往哪个框里粘」的困惑
    const plInput = $('#neInput');
    const plStatus = $('#plStatus');
    const plStatusDefault = plStatus ? plStatus.textContent.trim() : '';
    const setPlStatus = (text, isError = false) => {
      if (!plStatus) return;
      plStatus.textContent = text || plStatusDefault;
      plStatus.style.color = isError ? 'var(--alert)' : '';
    };

    /**
     * @param {boolean} replace true = 清空后替换
     */
    const runImport = async (rawInput, replace = false) => {
      if (state.importing) return;
      const value = String(rawInput ?? plInput?.value ?? '').trim();
      if (!value) { setPlStatus('请先粘贴歌单 / 专辑链接或 ID', true); return; }
      state.importing = true;
      const btns = [$('#plImport'), $('#plReplace')].filter(Boolean);
      btns.forEach((b) => b.setAttribute('disabled', ''));
      setPlStatus('正在读取歌单 …');
      try {
        // 统一入口：短链会先展开，再按类型分派到「歌单」或「专辑」
        const res = await importFromLink(value, {
          replace,
          onProgress: ({ phase, done, total }) => {
            if (phase === 'link') setPlStatus('正在展开短链 …');
            else if (phase === 'meta') setPlStatus('正在读取歌单 / 专辑 …');
            else if (phase === 'tracks') setPlStatus(total ? `正在补齐曲目 ${Math.min(done + 1, total)}/${total} …` : '正在整理曲目 …');
          },
        });
        // setTracks 会广播 playlist:change，列表与播放器据此自行重绘
        paintPlaylist();
        paintNow();
        const src = res.source || {};
        const bits = [];
        bits.push(`${replace ? '已替换为' : '已导入'}${src.kind === 'album' ? '专辑' : '歌单'}「${src.name || '未命名'}」`);
        if (src.artist) bits.push(src.artist);
        bits.push(`曲目 ${res.total} 首`);
        if (!replace && res.skipped) bits.push(`已在列表中 ${res.skipped} 首`);
        if (res.unavailable) bits.push(`拿不到详情 ${res.unavailable} 首`);
        if (res.truncated) bits.push(`共 ${src.kind === 'album' ? res.album?.size : res.playlist?.trackCount} 首，按上限导入前 ${res.total} 首`);
        const summary = bits.join(' · ');
        Toast.show(summary, '', { ttl: 6000 });
        setPlStatus(summary);
      } catch (err) {
        const msg = String(err.message || err);
        Toast.show(`导入失败：${msg}`, '', { ttl: 6000 });
        setPlStatus(`导入失败：${msg}`, true);
      } finally {
        state.importing = false;
        // 服务器不可用时按钮应保持禁用，不要在这里把它们解开
        if (state.apiReady !== false) btns.forEach((b) => b.removeAttribute('disabled'));
      }
    };

    $('#plImport')?.addEventListener('click', () => runImport(plInput?.value, false));
    $('#plReplace')?.addEventListener('click', () => {
      if (Player.tracks.length && !confirm('用这个歌单替换现有播放列表？现有曲目会被清空。')) return;
      runImport(plInput?.value, true);
    });
    plInput?.addEventListener('keydown', (e) => {
      // 回车统一交给 runSmart（歌单链接 → 导入；歌曲 → 播放；关键词 → 搜索）
      if (e.key === 'Enter') e.preventDefault();
    });

    /* ---- 搜索 ---- */
    const runSearch = async (kw) => {
      const q = String(kw ?? '').trim();
      if (!q) return;
      state.q = q;
      state.searching = true;
      state.error = '';
      paintResults('<div class="ne-results__loading mono">正在搜索 …</div>');
      try {
        const { songs, total } = await search(q, { limit: 20 });
        state.results = songs;
        state.total = total;
        paintResults(renderResults());
      } catch (err) {
        state.results = [];
        state.error = String(err.message || err);
        paintResults(`<div class="ne-results__err mono">搜索失败：${esc(state.error)}</div>`);
      } finally {
        state.searching = false;
        // 条数现在画在结果区自己的标题行里（renderResults），不再挂到搜索框上
      }
    };

    /** 输入框里是链接 / 纯数字 ID 就走「直接播放」，否则当关键词搜 */
    const looksLikeIdOrLink = (v) => {
      const s = String(v || '').trim();
      if (!s) return false;
      if (/^https?:\/\//i.test(s) || /163cn\.tv|music\.163\.com|y\.music\.163\.com/i.test(s)) return true;
      return /^\d{4,12}$/.test(s);
    };
    /** 链接里出现这些词就按「歌单 / 专辑」处理 */
    const PLAYLIST_URL_RE = /playlist|discover|toplist|radio|program|album/i;

    /**
     * 一个按钮分派多种意图（这是「简化」的核心：输入框只有一个，行为可预期）：
     *   歌单 / 专辑链接 → 导入；歌曲链接 / 纯数字 → 直接播放；其他文本 → 搜索。
     *
     * 短链（163cn.tv）要先展开才知道是什么 —— classifyLink 会顺手展开并判断类型，
     * 这样「App 分享出来的专辑链接」不用先试一遍单曲、再退回歌单。
     */
    const runSmart = async () => {
      const v = String(input?.value || '').trim();
      if (!v || state.apiReady === false) return;
      if (!looksLikeIdOrLink(v)) { runSearch(v); return; }
      if (PLAYLIST_URL_RE.test(v)) { runImport(v, false); return; }
      // 短链 / 未知形态：展开后按真实类型分派
      let kind = '';
      try {
        kind = (await classifyLink(v)).kind;
      } catch { kind = ''; }
      if (kind === 'album' || kind === 'playlist') { runImport(v, false); return; }
      const ok = await manualGo();
      if (!ok) {
        Toast.show('没找到这首歌，按歌单 / 专辑再试一次 …');
        runImport(v, false);
      }
    };

    $('#neGo')?.addEventListener('click', runSmart);
    input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runSmart(); } });
    input?.addEventListener('input', debounce((e) => {
      // 粘贴链接/ID 时不要触发关键词搜索（会白打一次接口）
      if (looksLikeIdOrLink(e.target.value)) return;
      if (e.target.value.trim().length >= 2 && state.apiReady) runSearch(e.target.value);
    }, 650));

    root.addEventListener('click', (e) => {
      const kw = e.target.closest('[data-kw]');
      if (kw) {
        if (input) input.value = kw.dataset.kw;
        runSearch(kw.dataset.kw);
        return;
      }
      // 示例歌单快捷键（热歌榜 / 飙升榜 / 新歌榜）
      const plChip = e.target.closest('[data-playlist]');
      if (plChip) {
        if (plInput) plInput.value = plChip.dataset.playlist;
        runImport(plChip.dataset.playlist, false);
        return;
      }
      const row = e.target.closest('.ne-row');
      if (row) {
        const act = e.target.closest('[data-act]')?.dataset.act;
        let song;
        try { song = JSON.parse(row.dataset.song); } catch { return; }
        if (act === 'add') { addSong(song); return; }
        if (act === 'play') { playSong(song); return; }
        // 没点按钮就是点整行：直接播（点右侧那个 ↗ 外链除外）
        if (e.target.closest('a')) return;
        playSong(song);
        return;
      }
      const del = e.target.closest('[data-del]');
      if (del) {
        const i = Number(del.dataset.del);
        const t = Player.tracks[i];
        Player.remove(i);
        savePlaylist(Player.tracks);
        Toast.show(`已移除：${t?.title || ''}`);
        paintPlaylist();
        return;
      }
      const tr = e.target.closest('[data-track]');
      if (tr && !e.target.closest('[data-del]')) {
        const i = Number(tr.dataset.track);
        if (i === Player.index) Player.toggle();
        else Player.prepare(i, { autoplay: true });
      }
    });

    /* ---- 「放不放得出来 / 到底多少秒」检查 ----
     * 官方外链对 VIP / 付费专辑曲目不出声，但 iframe 照转、歌词照走；
     * 另外元数据时长可能是完整曲目、而外链给的只是试听片段 —— 都会让自动下一首判断错。
     * 一次请求同时拿结论与**真实秒数**（服务端从音频本身量的）。
     */
    let soundSeq = 0;
    const checkSound = async (track) => {
      if (!track || track.provider !== 'netease' || !state.apiReady) { state.sound = null; setLyricNote(''); return; }
      const seq = ++soundSeq;
      const id = String(track.neteaseId);
      state.sound = { id, playable: null, checking: true, alternatives: [], reason: '' };
      paintNow();
      const info = await audioInfo(id).catch(() => null);
      if (seq !== soundSeq) return;                       // 期间又换歌了
      const playable = info ? info.playable : null;

      // 真实时长：优先用它来算自动下一首（试听片段就靠这个不让人干等）
      if (info?.seconds > 0) {
        track.audioSeconds = info.seconds;
        const meta = Number(track.duration) || 0;
        if (looksLikeFragment(info, meta)) {
          state.sound = {
            id, playable: true, fragment: true, checking: false, alternatives: [],
            reason: `外链只提供 ${Math.round(info.seconds)} 秒的片段（曲目 ${Math.round(meta)} 秒）`,
          };
          paintNow();
          let alts = [];
          try { alts = await findPlayableAlternatives(track); } catch { alts = []; }
          if (seq !== soundSeq) return;
          state.sound.alternatives = alts;
          paintNow();
          Toast.show(`「${track.title}」站内只有 ${Math.round(info.seconds)} 秒片段${alts.length ? ' · 已找到完整版本' : ''}`, '', { ttl: 6000 });
          return;
        }
      }
      if (playable !== false) {
        // 能放（或测不出来）：只在「已知是会员曲目 + 没测出来」时留一句提醒
        // 明确能放 → 清掉"只能走官方播放器"的旧标记，让它重新走站内直放
        if (playable === true) track.embedOnly = false;
        state.sound = (playable === null && isVipOnly(track))
          ? { id, playable: false, checking: false, alternatives: [], reason: '探测失败，可能是会员曲目' }
          : null;
        setLyricNote(state.sound && !vipOkOn() ? '可能无声' : '');
        paintNow();
        return;
      }
      // 匿名态拿不到音频流：直接判定这一首只能走官方外链播放器，
      // 免得播放器先白试一次站内直放、再回退（会多一次请求和一条提示）
      track.embedOnly = true;
      state.sound = { id, playable: false, checking: true, alternatives: [], reason: '网易云不向匿名请求提供音频' };
      setLyricNote(vipOkOn() ? '' : '可能无声');
      paintNow();
      let alts = [];
      try { alts = await findPlayableAlternatives(track); } catch { alts = []; }
      if (seq !== soundSeq) return;
      state.sound = { id, playable: false, checking: false, alternatives: alts, reason: '网易云不向匿名请求提供音频' };
      paintNow();
      // 已经声明过「浏览器登录了会员」的人不再打扰（歌词标记也不加）
      if (!vipOkOn()) {
        setLyricNote('可能无声');
        Toast.show(`「${track.title}」需要网易云会员，官方播放器不会出声${alts.length ? ' · 已找到可播放的其他版本' : ''}`, '', { ttl: 7000 });
      }
    };

    /* ---- 播放 / 加入 ---- */
    const playSong = (song) => {
      const track = toTrack(song);
      const existing = Player.tracks.findIndex((t) => t.neteaseId === track.neteaseId);
      if (existing >= 0) {
        Player.prepare(existing, { autoplay: true });
      } else {
        Player.add(track, { play: true });
        savePlaylist(Player.tracks);
      }
      // 播放历史不在这里记：core/history.js 挂在 player 事件上，等**真的出声**（time > 1s）才记，
      // 这样"点了播放但被浏览器拦下 / 探测失败"的曲目不会污染历史。
      paintPlaylist();
      paintHistory();
      paintNow();
      paintEmbed();
      checkSound(Player.current || track);
      const box = $('#neNow');
      box?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    const addSong = (song) => {
      const track = toTrack(song);
      const r = Player.add(track);
      savePlaylist(Player.tracks);
      paintPlaylist();
      Toast.show(r.added ? `已加入：${track.title}` : '该曲目已在列表中');
      // 刷新搜索结果里的按钮状态
      paintResults(renderResults());
    };

    /* ---- 手动链接：返回是否成功（失败时上层会当作歌单再试一次） ---- */
    const manualGo = async () => {
      const raw = plInput?.value || '';
      const id = parseSongId(raw);
      if (!id) { Toast.err('没能从这段内容里解析出歌曲 ID'); return false; }
      if (!state.apiReady) {
        // 无服务器：直接用标题占位生成播放器
        const track = { id: `ne-${id}`, provider: 'netease', neteaseId: id, title: `网易云曲目 ${id}`, artist: '', duration: 0, tags: [] };
        Player.add(track, { play: true });
        savePlaylist(Player.tracks);
        paintPlaylist(); paintNow(); paintEmbed();
        Toast.show('已在站内生成官方播放器（无服务器，未能获取曲目信息）');
        return true;
      }
      try {
        const [song] = await fetchSongs([id]);
        if (!song) return false;
        playSong(song);
        Toast.ok(`已载入：${song.name}`);
        return true;
      } catch (err) {
        Toast.err(`获取歌曲信息失败：${err.message}`);
        return false;
      }
    };
    // 「粘贴链接播放」面板已经并入上面的统一输入框，这里不再单独绑按钮

    /* ---- 列表控制 ---- */
    $('#plClear')?.addEventListener('click', () => {
      if (!Player.tracks.length) return;
      if (!confirm('清空网站播放列表？（只影响本地保存的列表）')) return;
      Player.clear();
      savePlaylist([]);
      paintPlaylist(); paintNow(); paintEmbed();
      Toast.show('播放列表已清空');
    });
    $('#plPrev')?.addEventListener('click', () => Player.prev());
    $('#plNext')?.addEventListener('click', () => Player.next());
    $('#plAutoNext')?.addEventListener('click', (e) => {
      const on = Player.setEmbedAutoNext(!Player.embedAutoNext);
      e.currentTarget.setAttribute('aria-pressed', String(on));
      e.currentTarget.textContent = `播完自动下一首${on ? '' : '（关）'}`;
      Toast.show(on
        ? '已开启：按元数据时长估算，可能比真实结束差几秒'
        : '已关闭自动下一首：网易云曲目放完会停在原地（官方播放器没有结束回调）', '', { ttl: 6000 });
    });
    // 提示块里的「可播放版本」/「换下一首能播的」
    root.addEventListener('click', (e) => {
      const alt = e.target.closest('[data-alt]');
      if (alt) {
        let song;
        try { song = JSON.parse(alt.dataset.alt); } catch { return; }
        playSong(song);
        Toast.ok(`已切到可播放的版本：${song.name}`);
        return;
      }
      if (e.target.closest('#neSilentNext')) {
        const list = state.results.filter((s) => !isVipOnly(s));
        const next = list[0] || Player.tracks.find((t) => !isVipOnly(t));
        if (next && next.name) playSong(next);
        else Toast.show('列表里暂时没有别的可播放曲目，试试「只看能播的」再搜一次');
        return;
      }
      if (e.target.closest('#nePlayableOnly')) {
        state.playableOnly = !state.playableOnly;
        paintResults(renderResults());
        Toast.show(state.playableOnly ? '只显示非会员曲目' : '显示全部搜索结果');
        return;
      }
      if (e.target.closest('#neVipSet')) {
        setVipOk(true);
        setLyricNote('');
        paintNow();
        Toast.show('已记住：你这台浏览器登录了网易云会员，会员曲目不再提示', '', { ttl: 5000 });
        return;
      }
      if (e.target.closest('#neVipUnset')) {
        setVipOk(false);
        paintNow();
        if (Player.current) checkSound(Player.current);
        Toast.show('已恢复会员曲目提示');
      }
    });
    $('#plShuffle')?.addEventListener('click', (e) => {
      Player.setShuffle(!Player.shuffle);
      e.currentTarget.setAttribute('aria-pressed', String(Player.shuffle));
      Toast.show(Player.shuffle ? '随机播放：开' : '随机播放：关');
    });
    $('#neteaseHome')?.addEventListener('click', () => window.open('https://music.163.com/', '_blank', 'noopener'));
    // 官方播放器槽位上的两个按钮（事件委托，paintEmbed 重渲染后依然有效）
    $('#embedWrap')?.addEventListener('click', (e) => {
      if (e.target.closest('#embedCrop')) {
        const crop = EmbedHost.toggleCrop();
        Toast.show(crop ? '官方播放器：仅控制条' : '官方播放器：完整形态');
        paintEmbed();
      } else if (e.target.closest('#embedStop')) {
        EmbedHost.stop();
      }
    });

    /* ---- 订阅引擎事件 ---- */
    const offs = [
      bus.on('player:track', () => { paintNow(); paintPlaylist(); paintEmbed(); }),
      bus.on('player:state', () => paintNow()),
      bus.on('player:embed', ({ autoplay }) => paintEmbed(autoplay)),
      bus.on('playlist:change', () => paintPlaylist()),
      // 播放历史变化（真的开播、位置写回、清空、登录后与账号合并完）都要重画那一条
      bus.on('history:change', () => paintHistory()),
      // 用户动过官方控制条：位置无从推断，这一首不再自动切（说一句，别让人等）
      bus.on('player:advance-suspended', ({ track } = {}) => {
        if (!Player.embedAutoNext) return;
        Toast.show(`「${track?.title || '当前曲目'}」的官方播放器被手动操作过，这一首不再自动切 · 点 ⏭ 换歌`, '', { ttl: 6000 });
      }),
    ];

    paintNow();
    paintPlaylist();
    paintEmbed();
    paintHistory();
    Motion.reveal(root);
    // 进音乐台时立刻确认当前这首放不放得出来（离开时清掉标记，别带到别的板块）
    if (Player.current) checkSound(Player.current);

    return () => {
      offs.forEach((f) => f?.());
      soundSeq++;              // 让还在飞的探测结果失效
      setLyricNote('');
    };
  },
};

/* ---------------- 局部重绘 ---------------- */

/**
 * 「我在浏览器里登录了网易云会员」的开关。
 * 我们的探测是**服务端匿名**结论：会员曲目在匿名态取不到音频。
 * 但官方外链 iframe 本身在 music.163.com 上，会带上浏览器自己的 cookie
 * （它调的正是 /api/song/enhance/player/url），所以真的登录了会员的用户是能听到的。
 * 这种用户不该被反复提示 —— 给他们一个「我知道了，别再提示」的开关。
 */
const VIP_OK_KEY = 'ft.terminal.vipLoggedIn';
const vipOkOn = () => { try { return localStorage.getItem(VIP_OK_KEY) === '1'; } catch { return false; } };
const setVipOk = (on) => { try { on ? localStorage.setItem(VIP_OK_KEY, '1') : localStorage.removeItem(VIP_OK_KEY); } catch { /* 忽略 */ } };

function renderResults() {
  if (state.error) return `<div class="ne-results__err mono">搜索失败：${esc(state.error)}</div>`;
  if (!state.results.length) {
    return `<div class="ne-results__hint mono">
      ${state.apiReady === false ? '搜索不可用（没有服务器）' : '输入关键词后按回车，或用上面的快捷标签'}
    </div>`;
  }
  const list = state.playableOnly ? state.results.filter((s) => !isVipOnly(s)) : state.results;
  const hidden = state.results.length - list.length;
  // 结果自带标题行：条数和「点整行即可播放」这两个提示跟着结果走，比挂在搜索框上更好找
  return `
    <div class="ne-results__head">
      <span class="k-label k-label--ink">搜索结果</span>
      <span class="mono faint" style="font-size:var(--fs-2xs)">
        共 ${state.total || state.results.length} 条 · 显示 ${list.length}${hidden ? `（隐藏 ${hidden} 首会员曲目）` : ''}
      </span>
      <span class="grow"></span>
      <button class="chip${state.playableOnly ? ' is-on' : ''}" id="nePlayableOnly"
              aria-pressed="${state.playableOnly}" title="会员曲目在匿名态放不出声，可以只看能播的">只看能播的</button>
      <span class="mono faint" style="font-size:var(--fs-2xs)">点整行即可播放</span>
    </div>
    <div class="ne-results__list">${list.map(searchResultRow).join('') || '<div class="ne-results__hint mono">这一批结果里没有非会员曲目，取消过滤看看</div>'}</div>`;
}

/**
 * 「这首歌放不出来」的说明块。
 * 会员 / 付费曲目在匿名态下官方外链播放器不出声，但 iframe 照转、我们的歌词时钟也照走，
 * 不说明白就变成「歌词在动却没声音」。这里给出结论 + 同名可播放版本。
 */
function soundNoticeHTML() {
  const info = state.sound;
  if (!info || info.playable !== false) return '';
  // 已经声明「浏览器里登录了会员」：只留一行可撤销的说明，不再弹大块提示
  if (vipOkOn()) {
    return `
    <div class="ne-silent ne-silent--slim" id="neSilent">
      <span class="mono faint" style="font-size:var(--fs-2xs)">
        会员曲目 · 已按「浏览器已登录网易云会员」处理，不再提示
      </span>
      <button class="btn btn--sm" id="neVipUnset">恢复提示</button>
    </div>`;
  }
  const alts = info.alternatives || [];
  const frag = info.fragment === true;
  return `
  <div class="ne-silent${frag ? ' ne-silent--frag' : ''}" id="neSilent">
    <div class="ne-silent__head">
      <span class="ne-silent__ico">!</span>
      <b>${frag ? '站内只有试听片段' : '这首歌未登录会员时不会出声'}</b>
      <span class="mono faint" style="font-size:var(--fs-2xs)">${info.checking ? '正在找更完整的版本 …' : esc(info.reason || '网易云不向匿名请求提供音频')}</span>
    </div>
    <p class="ne-silent__text">
      ${frag
        ? '官方外链给这首歌的音频比曲目短，放完就没了 —— 自动下一首会按**实际音频长度**（上面的秒数）来切，不会干等。想听完整版可以换下面的版本。'
        : '本站服务器拿不到这首歌的匿名音频（网易云对 VIP / 付费专辑不下发）。下方的<b>官方播放器仍可播放</b>：<b>手机上没有声音，是因为移动端浏览器不允许它自动起播</b> —— 点一下那个播放器里的 ▶ 就会出声（在浏览器里登录网易云会员后通常更顺）。也可以直接换成下面这些能放的版本。'}
    </p>
    ${alts.length ? `<div class="ne-silent__alts">
      <span class="k-label">${frag ? '更完整的版本' : '可播放的版本'}</span>
      ${alts.map((a) => `<button class="ne-alt" data-alt='${esc(JSON.stringify(a))}'>
        ${a.cover ? `<img src="${esc(a.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : ''}
        <span class="ne-alt__main">
          <span class="clamp-1">${esc(a.name)}</span>
          <span class="mono faint" style="font-size:var(--fs-2xs)">${esc((a.artists || []).join(' / '))}</span>
        </span>
        <span class="mono faint" style="font-size:var(--fs-2xs)">▶</span>
      </button>`).join('')}
    </div>` : (info.checking ? '' : '<p class="ne-silent__text faint">没找到同名的免费版本，试试换一首，或去网易云听原版。</p>')}
    <div class="ne-silent__acts">
      <a class="btn btn--sm" href="${pageUrl(info.id)}" target="_blank" rel="noopener noreferrer">${ICON.ext}去网易云听</a>
      <a class="btn btn--sm" href="orpheus://song/${esc(String(info.id))}"
         title="用你手机上的网易云 App 打开（如果你的浏览器支持唤起 App）">App 打开</a>
      <button class="btn btn--sm" id="neSilentNext">换下一首能播的</button>
      ${frag ? '' : '<button class="btn btn--sm" id="neVipSet" title="官方播放器在 music.163.com 上，会带上你自己的登录状态">我登录了会员，能听到声音</button>'}
    </div>
  </div>`;
}

function renderNow() {
  const t = Player.current;
  if (!t) {
    return `<div class="ne-now__ph mono">播放列表为空 · 先搜索并加入一首</div>`;
  }
  const isNe = t.provider === 'netease';
  const embed = Player.isEmbed;
  return `
  <div class="ne-now__inner">
    <div class="ne-now__cover">
      ${t.cover ? `<img src="${esc(t.cover)}" alt="" referrerpolicy="no-referrer" />` : ICON.disc}
    </div>
    <div class="ne-now__meta">
      <span class="k-label k-label--signal">${isNe ? 'NOW PLAYING · NETEASE' : 'NOW PLAYING'}</span>
      <h2 class="ne-now__title clamp-2">${esc(t.title)} ${vipTag(t)}</h2>
      <div class="ne-now__sub mono">${esc(t.artist || '未知歌手')}${t.album ? ` · ${esc(t.album)}` : ''}</div>
      <div class="ne-now__ctrl">
        <button class="pbtn" id="npPrev" title="上一首">${ICON.prev}</button>
        <button class="pbtn pbtn--main" id="npPlay" title="${embed ? '播放 / 暂停（官方播放器暂停后从头播放）' : '播放 / 暂停'}">${Player.playing ? ICON.pause : ICON.play}</button>
        <button class="pbtn" id="npNext" title="下一首">${ICON.next}</button>
        <span class="mono faint" style="font-size:var(--fs-2xs);margin-left:auto">
          ${embed ? '进度与音量由网易云播放器自持' : fmtClock(Player.duration)}
        </span>
      </div>
    </div>
  </div>
  ${soundNoticeHTML()}`;
}

/**
 * 「最近播放」区块。
 *
 * 三条明确的产品/道德边界（站主的决定，写在 README 里）：
 *   1. 这份记录**只属于你自己**：存在你浏览器里；登录后另外在你账号下存一份
 *      （键与账号绑定、只有你能读），换设备能接着听；
 *   2. **不接网易云账号、不存任何第三方 cookie**；
 *   3. **不会把记录发给网易云** —— "在网易云打开"只是跳转链接，点不点由你。
 */
function timeAgo(ts) {
  const d = Date.now() - Number(ts || 0);
  if (!Number.isFinite(d) || d < 0) return '';
  const m = Math.floor(d / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const day = Math.floor(h / 24);
  if (day < 30) return `${day} 天前`;
  return new Date(Number(ts)).toISOString().slice(0, 10);
}

/** 单行：标题 / 艺术家 / 上次听到的位置 / 继续播放 / 在网易云打开 */
function historyRow(e) {
  const pos = Number(e.seconds) || 0;
  const at = pageUrl(e.id);
  return `
  <div class="ne-hist__row" data-hist-id="${esc(e.id)}">
    <span class="ne-hist__main">
      <span class="clamp-1"><b>${esc(e.title || '未命名曲目')}</b></span>
      <span class="mono faint" style="font-size:var(--fs-2xs)">
        ${esc(e.artist || '未知歌手')}${pos >= 1 ? ` · 上次听到 ${fmtClock(pos)}` : ''}${e.plays > 1 ? ` · 播放 ${e.plays} 次` : ''}${timeAgo(e.at) ? ` · ${timeAgo(e.at)}` : ''}
      </span>
    </span>
    <span class="ne-hist__acts">
      <button class="btn btn--sm btn--signal" data-act="resume" title="${pos >= 1 ? `从 ${fmtClock(pos)} 继续播放` : '从头播放'}">▶ ${pos >= 1 ? '继续播放' : '播放'}</button>
      <a class="btn btn--sm" href="${esc(at)}" target="_blank" rel="noopener noreferrer" title="在网易云打开这首歌（只是跳转，不携带我们这边的任何数据）">${ICON.ext}</a>
    </span>
  </div>`;
}

function renderHistory() {
  const all = historyList();
  if (!all.length) {
    return `<p class="ne-hist__empty faint">
      还没有播放记录。在站内播放任意一首（真的出声）之后会出现在这里：
      记录只存在你的浏览器里，登录后另外存一份在你自己的账号下；我们不会把它发给网易云。
    </p>`;
  }
  const freq = historyFrequent(5);
  return `
    <div class="ne-hist__list">${all.slice(0, 12).map(historyRow).join('')}</div>
    ${all.length > 12 ? `<p class="mono faint" style="font-size:var(--fs-2xs);margin:var(--sp-2) 0 0">
      只显示最近 12 条 · 共 ${all.length} 条（上限 ${HISTORY_MAX} 条，超出丢最旧的）</p>` : ''}
    ${freq.length > 1 ? `<div class="ne-hist__freq">
      <span class="k-label">常听</span>
      ${freq.map((e) => `<button class="chip" data-hist-id="${esc(e.id)}" data-act="resume" title="播放 ${e.plays} 次 · 点一下继续听">${esc(e.title || e.id)}</button>`).join('')}
    </div>` : ''}`;
}

/* ---------------- 重绘实现（挂在视图上的小工具） ---------------- */

function paintResults(html) {
  const host = $('#neResults');
  if (host && html !== undefined) host.innerHTML = html;
}

function paintPlaylist() {
  const host = $('#playlistWrap');
  if (host) host.innerHTML = playlistHTML();
  const shuffleBtn = $('#plShuffle');
  if (shuffleBtn) shuffleBtn.setAttribute('aria-pressed', String(Player.shuffle));
  // 曲目数是动态的（导入歌单会一次加很多），页头与列表标题都要跟着更新
  const n = Player.tracks.length;
  const label = `${String(n).padStart(2, '0')} TRACKS`;
  const head = $('#trackCount');
  if (head) head.textContent = label;
  const meta = $('#metaTracks');
  if (meta) meta.textContent = label;
}

function paintNow() {
  const host = $('#neNow');
  if (host) {
    host.innerHTML = renderNow();
    bindNowControls();
  }
  // 面板头上的来源标记（NETEASE / 本地音频 / 待机）
  const src = $('#npSource');
  if (src) {
    const t = Player.current;
    src.textContent = t ? (t.provider === 'netease' ? 'NETEASE' : '本地音频') : '待机';
  }
}

function paintEmbed() {
  const wrap = $('#embedWrap');
  if (!wrap) return;
  wrap.innerHTML = embedHTML();
  // 进入音乐台：把常驻播放器内嵌到本页槽位（iframe 不重建，继续播放）
  if (EmbedHost.active) EmbedHost.noteRoute('music');
}

function paintHistory() {
  const host = $('#neHistory');
  if (host) host.innerHTML = renderHistory();
  const count = $('#histCount');
  if (count) {
    const n = historyList().length;
    count.textContent = n ? `${n} TRACKS` : 'EMPTY';
  }
  bindHistory();
}

/**
 * 从历史里续播。
 * 已在播放列表里就直接 prepare + seek；不在列表里就先取元数据再播放
 * （取不到就如实说一句，不要假装在放）。
 */
async function resumeFromHistory(id) {
  const info = historyResume(id);
  if (!info) { Toast.err('这条记录已经不在历史里了'); return; }
  const idx = Player.tracks.findIndex((t) => String(t.neteaseId || t.id) === String(id));
  const target = Math.max(0, Number(info.seconds) || 0);
  if (idx >= 0) {
    Player.prepare(idx, { autoplay: true });
    seekWhenReady(target);
    Toast.show(target >= 1 ? `从 ${fmtClock(target)} 继续播放` : '从头播放');
    return;
  }
  try {
    const [song] = await fetchSongs([id]);
    if (!song) { Toast.err('取不到这首歌的信息（可能已下架）'); return; }
    const track = toTrack(song);
    Player.add(track, { play: true });
    savePlaylist(Player.tracks);
    seekWhenReady(target);
  } catch (err) {
    Toast.err(`取不到这首歌的信息：${String(err?.message || err)}`);
  }
}

/**
 * 等到真的能定位了再 seek。
 * 为什么不能直接 seek：`Player.seek()` 需要先知道时长（duration 为空时它直接返回），
 * 而换歌后音频是异步加载的 —— 直接调用会**静默丢掉**这次定位，用户会以为"续播没生效"。
 */
function seekWhenReady(target) {
  if (!(target >= 1)) return;
  let tries = 0;
  const tick = () => {
    if (Player.isEmbed) return;                  // 官方播放器不归我们控制，不装作能定位
    if (Player.duration > 0) { Player.seek(target); return; }
    if (++tries > 40) return;                    // 约 10 秒仍拿不到时长就放弃，不打扰用户
    setTimeout(tick, 250);
  };
  tick();
}

function bindHistory() {
  const root = $('#neHistory');
  if (!root) return;
  // 「继续播放」（行内按钮与常听 chip 共用一套 data-*）
  $$('[data-act="resume"]', root).forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.histId || el.closest('[data-hist-id]')?.dataset.histId;
      if (id) void resumeFromHistory(id);
    });
  });
  $('#histClear')?.addEventListener('click', () => {
    if (!historyList().length) { Toast.show('还没有播放记录'); return; }
    if (!confirm('清空站内播放记录？\n\n只清我们这边的记录（你浏览器里 + 你账号下的那一份），'
      + '不会影响你在网易云的任何数据，也不会取消任何收藏。')) return;
    historyClear();
    Toast.ok('已清空站内播放记录');
    paintHistory();
  });
}

function bindNowControls() {
  $('#npPlay')?.addEventListener('click', () => Player.toggle());
  $('#npPrev')?.addEventListener('click', () => Player.prev());
  $('#npNext')?.addEventListener('click', () => Player.next());
}
