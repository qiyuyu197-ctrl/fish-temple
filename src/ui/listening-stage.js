/**
 * ui/listening-stage.js — 沉浸式听歌舞台
 * ==================================================================
 * 参考 Folia 的「全屏歌词 + 大字排版 + 当前行动效」，但把视觉语言拉回本站：
 * 硬边、零圆角、纸 / 墨 / 信号黄、等宽标签，封面只做低饱和背景而不是霓虹主题。
 *
 * 三件事：
 *   1. 全屏歌词（原文 + 译文 + 上一行 / 下一行，换句时逐字上浮）
 *   2. 可拖动的进度 / 音量 / 循环 / 随机，和音乐台共用同一个 Player
 *   3. 键盘：Space 播放暂停、←/→ 5 秒、Shift+←/→ 切歌、M 静音、Esc 退出
 *
 * 浮层挂在 body 下，不随路由视图销毁；切板块时由 main.js 主动关闭，
 * 但音频本身不会停（播放器在 #embedHost / <audio> 里）。
 */

import { $, esc } from '../util/dom.js';
import { bus } from '../core/bus.js';
import { Player, fmtClock } from '../core/player.js';
import { Lyrics } from '../plugins/lyrics.js';
import { Toast } from './toast.js';
import { bindRange } from './range.js';
import { pumpVisualizer } from './miniaudio.js';

const ICON_EXPAND = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 4H4v5M15 4h5v5M4 15v5h5M20 15v5h-5" stroke="currentColor" stroke-width="1.7"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="1.7"/></svg>';
const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 5l12 7-12 7V5z" fill="currentColor"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>';
const ICON_PREV = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6v12L9 12l9-6zM6 6v12" stroke="currentColor" stroke-width="1.8"/></svg>';
const ICON_NEXT = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6v12l9-6-9-6zM18 6v12" stroke="currentColor" stroke-width="1.8"/></svg>';
const ICON_SHUFFLE = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h4l10 12h4M3 18h4L17 6h4M18 3l3 3-3 3M18 15l3 3-3 3" stroke="currentColor" stroke-width="1.6"/></svg>';
const ICON_REPEAT = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 10V8a2 2 0 012-2h11l-3-3M20 14v2a2 2 0 01-2 2H7l3 3" stroke="currentColor" stroke-width="1.6"/></svg>';
const ICON_VOL = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 9h3l4-4v14l-4-4H4z" stroke="currentColor" stroke-width="1.6"/><path d="M15 9a4 4 0 010 6" stroke="currentColor" stroke-width="1.6"/></svg>';
const ICON_MUTE = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 9h3l4-4v14l-4-4H4z" stroke="currentColor" stroke-width="1.6"/><path d="M15 9l6 6M21 9l-6 6" stroke="currentColor" stroke-width="1.6"/></svg>';

const state = {
  el: null,
  open: false,
  offs: [],
  bars: [],
  stopWave: null,
  seek: null,
  vol: null,
  trackKey: '',
  lyricKey: '',
  focusReturn: null,
};

const pad = (n) => String(Math.max(0, Number(n) || 0)).padStart(2, '0');
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

/** 把一行歌词拆成逐字 / 逐词 span，用于换句时错峰上浮 */
function wordsHTML(text) {
  const raw = String(text || '');
  if (!raw) return '';
  const tokens = raw.match(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]|[^\s\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]+|\s+/g) || [raw];
  return tokens.map((token, i) => (
    /^\s+$/.test(token)
      ? `<span class="lstage__space">${esc(token)}</span>`
      : `<span class="lstage__word" style="--i:${Math.min(i, 48)}">${esc(token)}</span>`
  )).join('');
}

function trackDuration(track) {
  if (!track) return 0;
  return Number(track.audioSeconds) || Number(track.duration) || 0;
}

function currentSeconds() {
  if (!Player.current) return 0;
  return Player.isEmbed ? Player.elapsed : (Player.currentTime || 0);
}

function build() {
  const root = document.createElement('div');
  root.className = 'lstage';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', '沉浸式听歌舞台');
  root.tabIndex = -1;
  root.innerHTML = `
    <div class="lstage__backdrop" id="lsBackdrop" aria-hidden="true"></div>
    <div class="lstage__grid" aria-hidden="true"></div>
    <div class="lstage__noise" aria-hidden="true"></div>

    <header class="lstage__top">
      <div class="lstage__brand">
        <span class="lstage__brandmark">${ICON_EXPAND}</span>
        <span class="lstage__brandtext"><b>FISH AUDIO</b><i>// STAGE / 沉浸听歌</i></span>
      </div>
      <div class="lstage__topmeta mono">
        <span id="lsTopIndex">TRACK -- / --</span>
        <span class="lstage__topline" aria-hidden="true"></span>
        <span id="lsTopSource">STANDBY</span>
      </div>
      <button class="lstage__queuebtn" id="lsQueueBtn" type="button" title="播放队列" aria-label="打开播放队列" aria-expanded="false">
        <span>队列</span><b class="mono" id="lsQueueCount">00</b>
      </button>
      <button class="lstage__close" id="lsClose" type="button" title="退出沉浸模式 (Esc)" aria-label="退出沉浸模式">
        ${ICON_CLOSE}<span>退出</span><kbd>ESC</kbd>
      </button>
    </header>

    <main class="lstage__body">
      <span class="lstage__ghost" id="lsGhost" aria-hidden="true">01</span>
      <section class="lstage__side" aria-label="曲目信息">
        <div class="lstage__cover" id="lsCover">
          <div class="lstage__coverart" id="lsCoverArt"></div>
          <span class="lstage__coverframe" aria-hidden="true"></span>
          <span class="lstage__coverno mono" id="lsCoverNo">--</span>
          <span class="lstage__coverstatus mono" id="lsCoverStatus">PAUSED</span>
        </div>
        <div class="lstage__meta">
          <span class="k-label k-label--signal" id="lsKicker">NOW PLAYING</span>
          <h2 class="lstage__title" id="lsTitle">—</h2>
          <p class="lstage__artist mono" id="lsArtist">—</p>
          <p class="lstage__album" id="lsAlbum"></p>
        </div>
        <div class="lstage__viz" id="lsViz" aria-hidden="true"></div>
        <div class="lstage__tech mono">
          <span id="lsTechSource">SOURCE / --</span>
          <span id="lsTechClock">00:00 / --:--</span>
        </div>
      </section>

      <section class="lstage__lyrics" aria-label="歌词" aria-live="polite">
        <div class="lstage__lyrichead">
          <span class="mono" id="lsLyricLabel">LYRICS</span>
          <span class="lstage__lyricrule" aria-hidden="true"></span>
          <span class="mono" id="lsLyricIndex">—</span>
        </div>
        <p class="lstage__prev" id="lsPrev"></p>
        <div class="lstage__line" id="lsLine"><span class="lstage__placeholder">选择一首歌</span></div>
        <p class="lstage__trans" id="lsTrans"></p>
        <p class="lstage__next" id="lsNext"></p>
        <div class="lstage__lyricfoot">
          <span class="mono" id="lsLyricMeta">LRC SYNC</span>
          <span class="lstage__offset">
            <button type="button" class="lstage__mini" id="lsOffsetBack" title="歌词提前 0.5 秒">−0.5s</button>
            <button type="button" class="lstage__mini" id="lsOffsetFwd" title="歌词延后 0.5 秒">+0.5s</button>
          </span>
        </div>
      </section>
    </main>

    <aside class="lstage__queue" id="lsQueue" hidden aria-label="播放队列">
      <header class="lstage__queuehead">
        <span class="mono">// QUEUE / 播放队列</span>
        <span class="lstage__queuerule" aria-hidden="true"></span>
        <span class="mono" id="lsQueueCount2">00</span>
        <button class="lstage__mini" id="lsQueueClose" type="button" title="关闭队列">✕</button>
      </header>
      <div class="lstage__queuelist" id="lsQueueList"></div>
    </aside>

    <footer class="lstage__transport">
      <div class="lstage__timeline">
        <div class="lstage__seek" id="lsSeek" role="slider" tabindex="0"
             aria-label="播放进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <span class="lstage__seekfill" aria-hidden="true"></span>
          <span class="lstage__seekknob" aria-hidden="true"></span>
        </div>
        <div class="lstage__times mono">
          <span id="lsTime">00:00</span>
          <span class="lstage__timeslash">/</span>
          <span id="lsDur">--:--</span>
          <span class="lstage__status" id="lsStatus">PAUSED</span>
        </div>
      </div>

      <div class="lstage__controls">
        <button type="button" class="lstage__ctl" id="lsShuffle" title="随机播放" aria-label="随机播放" aria-pressed="false">${ICON_SHUFFLE}</button>
        <button type="button" class="lstage__ctl" id="lsPrev" title="上一首" aria-label="上一首">${ICON_PREV}</button>
        <button type="button" class="lstage__ctl lstage__ctl--play" id="lsPlay" title="播放 / 暂停 (Space)" aria-label="播放">${ICON_PLAY}</button>
        <button type="button" class="lstage__ctl" id="lsNext" title="下一首" aria-label="下一首">${ICON_NEXT}</button>
        <button type="button" class="lstage__ctl" id="lsRepeat" title="循环模式" aria-label="循环模式" aria-pressed="true">${ICON_REPEAT}<span class="lstage__rep1" id="lsRep1" hidden>1</span></button>
        <span class="lstage__ctlgap" aria-hidden="true"></span>
        <button type="button" class="lstage__ctl lstage__ctl--vol" id="lsMute" title="静音 (M)" aria-label="静音">${ICON_VOL}</button>
        <div class="lstage__vol" id="lsVol" role="slider" tabindex="0"
             aria-label="音量" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100">
          <span class="lstage__volfill" aria-hidden="true"></span>
        </div>
        <div class="lstage__keyhint mono">
          <span><kbd>SPACE</kbd> 播放</span>
          <span><kbd>←</kbd><kbd>→</kbd> 5s</span>
          <span><kbd>F</kbd> 退出</span>
        </div>
      </div>
    </footer>`;
  document.body.append(root);
  state.el = root;

  // 音浪条与底栏 / 音乐台共用同一个可视化来源
  const viz = $('#lsViz', root);
  state.bars = Array.from({ length: 48 }, () => {
    const bar = document.createElement('i');
    viz?.append(bar);
    return bar;
  });

  bindStatic();
  bindControls();
  return root;
}

function bindStatic() {
  const root = state.el;
  root.addEventListener('click', (e) => {
    const id = e.target.closest('button')?.id || '';
    // 不能写裸 close()：浏览器会解析成 window.close，直接把整个标签页关掉
    if (id === 'lsClose') return closeListeningStage();
    if (id === 'lsQueueBtn') { toggleQueue(); return; }
    if (id === 'lsQueueClose') { toggleQueue(false); return; }
    if (id === 'lsPlay') { Player.toggle(); return; }
    if (id === 'lsPrev') { Player.prev(); return; }
    if (id === 'lsNext') { Player.next(); return; }
    if (id === 'lsShuffle') { toggleShuffle(); return; }
    if (id === 'lsRepeat') { cycleRepeat(); return; }
    if (id === 'lsMute') { Player.toggleMute(); return; }
    if (id === 'lsOffsetBack') { Lyrics.setOffset(Lyrics.offset - 500); syncTransport(); return; }
    if (id === 'lsOffsetFwd') { Lyrics.setOffset(Lyrics.offset + 500); syncTransport(); return; }
    // 队列里点一行 = 直接切过去（舞台不关，歌词与封面跟着换）
    const qrow = e.target.closest('[data-ls-track]');
    if (qrow) {
      const i = Number(qrow.dataset.lsTrack);
      if (Number.isInteger(i) && i >= 0) {
        Player.prepare(i, { autoplay: true });
        toggleQueue(false);
        Toast.show(`正在播放：${Player.current?.title || ''}`);
      }
      return;
    }
    // 点歌词本身 = 回到当前行（不 seek，避免官方 iframe 位置估算被搅乱）
    if (e.target.closest('.lstage__line')) {
      const t = Lyrics.current()?.t;
      if (Number.isFinite(t) && !Player.isEmbed) Player.seek(t / 1000);
    }
  });
  root.addEventListener('dblclick', (e) => {
    if (e.target.closest('.lstage__transport, .lstage__queue')) return;
    closeListeningStage();
  });
}

function toggleShuffle() {
  Player.setShuffle(!Player.shuffle);
  Toast.show(Player.shuffle ? '随机播放：开' : '随机播放：关');
  syncTransport();
}

function cycleRepeat() {
  const order = ['all', 'one', 'off'];
  const next = order[(order.indexOf(Player.repeat) + 1) % order.length];
  Player.setRepeat(next);
  Toast.show(next === 'one' ? '单曲循环' : next === 'off' ? '列表播完就停' : '列表循环');
  syncTransport();
}

function toggleQueue(force) {
  if (!state.el) return;
  const panel = $('#lsQueue', state.el);
  const btn = $('#lsQueueBtn', state.el);
  if (!panel) return;
  const open = typeof force === 'boolean' ? force : panel.hidden;
  if (open) renderQueue();
  panel.hidden = !open;
  btn?.setAttribute('aria-expanded', String(open));
  state.el.classList.toggle('is-queue', open);
}

function renderQueue() {
  if (!state.el) return;
  const list = $('#lsQueueList', state.el);
  const count = Player.tracks.length;
  $('#lsQueueCount', state.el).textContent = pad(count);
  $('#lsQueueCount2', state.el).textContent = `${pad(count)} TRACKS`;
  if (!list) return;
  list.innerHTML = Player.tracks.length ? Player.tracks.map((t, i) => `
    <button type="button" class="lstage__qrow${i === Player.index ? ' is-active' : ''}" data-ls-track="${i}">
      <span class="lstage__qno mono">No.${pad(i + 1)}</span>
      <span class="lstage__qcover" aria-hidden="true">${t.cover ? `<img src="${esc(t.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : ''}</span>
      <span class="lstage__qmain">
        <b>${esc(t.title || '未命名曲目')}</b>
        <i class="mono">${esc(t.artist || '未知歌手')}${t.provider === 'netease' ? ' / NETEASE' : ' / LOCAL'}</i>
      </span>
      <span class="lstage__qdur mono">${t.duration ? fmtClock(t.duration) : '--:--'}</span>
    </button>`).join('') : '<p class="lstage__qempty mono">播放列表是空的</p>';
}

/* ---------------- 绘制 ---------------- */

function paintTrack() {
  const t = Player.current;
  if (!state.el) return;
  const total = Player.tracks.length || 0;
  const idx = Player.index;
  $('#lsTopIndex', state.el).textContent = `TRACK ${pad(idx + 1)} / ${pad(total)}`;
  $('#lsCoverNo', state.el).textContent = pad(idx + 1);
  $('#lsGhost', state.el).textContent = pad(idx + 1);
  $('#lsTopSource', state.el).textContent = t?.provider === 'netease' ? 'NETEASE / DIRECT' : 'LOCAL FILE';
  $('#lsTechSource', state.el).textContent = t?.provider === 'netease' ? `SOURCE / NETEASE / ${t.neteaseId || '—'}` : 'SOURCE / LOCAL AUDIO';

  const title = t?.title || '未选择曲目';
  const artist = t?.artist || '未知歌手';
  $('#lsTitle', state.el).textContent = title;
  $('#lsArtist', state.el).textContent = artist;
  $('#lsAlbum', state.el).textContent = t?.album && t.album !== t.title ? t.album : '';
  $('#lsKicker', state.el).textContent = t ? (Player.playing ? 'NOW PLAYING' : 'PAUSED') : 'STANDBY';

  const art = $('#lsCoverArt', state.el);
  const cover = t?.cover || '';
  art.style.backgroundImage = cover ? `url("${String(cover).replace(/"/g, '%22')}")` : '';
  art.classList.toggle('is-empty', !cover);
  const backdrop = $('#lsBackdrop', state.el);
  backdrop.style.backgroundImage = cover ? `url("${String(cover).replace(/"/g, '%22')}")` : '';
  state.el.classList.toggle('has-cover', !!cover);
  state.trackKey = t ? `${t.id}|${idx}|${total}` : '';
  if (!$('#lsQueue', state.el).hidden) renderQueue();
}

function paintLyrics() {
  if (!state.el) return;
  const lineEl = $('#lsLine', state.el);
  const prevEl = $('#lsPrev', state.el);
  const nextEl = $('#lsNext', state.el);
  const transEl = $('#lsTrans', state.el);
  const labelEl = $('#lsLyricLabel', state.el);
  const indexEl = $('#lsLyricIndex', state.el);
  const metaEl = $('#lsLyricMeta', state.el);

  if (!Player.current) {
    if (state.lyricKey !== 'none') {
      lineEl.innerHTML = '<span class="lstage__placeholder">等一首歌</span>';
      prevEl.textContent = '';
      nextEl.textContent = '';
      transEl.textContent = '';
      labelEl.textContent = 'LYRICS';
      indexEl.textContent = '—';
      metaEl.textContent = 'STANDBY';
      state.lyricKey = 'none';
    }
    return;
  }

  let cur = '';
  let prev = '';
  let next = '';
  let trans = '';
  let label = 'LYRICS';
  let meta = '';

  switch (Lyrics.status) {
    case 'loading':
      label = 'LYRICS / LOADING';
      cur = '正在取歌词 …';
      meta = 'FETCHING';
      break;
    case 'ready': {
      const line = Lyrics.current();
      const p = Lyrics.prev();
      const n = Lyrics.next();
      cur = line ? line.text : '· · ·';
      trans = line?.translation || '';
      prev = p ? p.text : '';
      next = n ? n.text : '';
      label = 'LYRICS / 原文';
      meta = trans ? '原文 + 译文' : 'LRC SYNC';
      break;
    }
    case 'empty':
      label = 'LYRICS / 暂无';
      cur = Lyrics._msg || '这首歌没有可显示的歌词';
      meta = 'INSTRUMENTAL';
      break;
    case 'error':
      label = 'LYRICS / 失败';
      cur = Lyrics._msg || '歌词获取失败';
      meta = 'OFFLINE';
      break;
    case 'local':
      label = 'LYRICS / 本地音频';
      cur = '本地音频 / 没有歌词来源';
      meta = 'LOCAL';
      break;
    default:
      label = 'LYRICS';
      cur = '· · ·';
      meta = 'STANDBY';
  }

  const key = `${Lyrics.status}|${Lyrics.index}|${cur}|${trans}`;
  if (key !== state.lyricKey) {
    state.lyricKey = key;
    transEl.textContent = trans;
    transEl.hidden = !trans;
    prevEl.textContent = prev;
    nextEl.textContent = next;
    prevEl.classList.toggle('is-empty', !prev);
    nextEl.classList.toggle('is-empty', !next);
    lineEl.classList.remove('is-empty');
    lineEl.innerHTML = /^(正在取歌词|本地音频|这首歌|纯音乐|歌词获取失败|· · ·)/.test(cur)
      ? `<span class="lstage__placeholder">${esc(cur)}</span>`
      : wordsHTML(cur);
    // 让「逐字上浮」从第一颗字重新开始；prefers-reduced-motion 由 CSS 关掉
    lineEl.classList.remove('is-enter');
    void lineEl.offsetWidth;
    lineEl.classList.add('is-enter');
  }

  labelEl.textContent = label;
  indexEl.textContent = Lyrics.status === 'ready' && Lyrics.lines.length
    ? `${pad(Math.max(0, Lyrics.index) + 1)} / ${pad(Lyrics.lines.length)}`
    : '—';
  metaEl.textContent = meta;
}

function syncTransport() {
  if (!state.el) return;
  const t = Player.current;
  const dur = trackDuration(t);
  const time = clamp(currentSeconds(), 0, dur || Number.MAX_SAFE_INTEGER);
  const p = dur ? time / dur : 0;

  state.seek?.set(p);
  // 拖动时由滑块自己的 onInput 更新时间，播放事件不要抢
  if (!state.seek?.dragging) {
    $('#lsTime', state.el).textContent = fmtClock(time);
    $('#lsDur', state.el).textContent = dur ? fmtClock(dur) : '--:--';
    $('#lsTechClock', state.el).textContent = `${fmtClock(time)} / ${dur ? fmtClock(dur) : '--:--'}`;
  }
  $('#lsStatus', state.el).textContent = Player.isEmbed ? 'EMBED / EST.' : (Player.playing ? 'PLAYING' : 'PAUSED');
  $('#lsCoverStatus', state.el).textContent = Player.playing ? 'PLAYING' : 'PAUSED';
  $('#lsKicker', state.el).textContent = Player.playing ? 'NOW PLAYING' : 'PAUSED';
  $('#lsPlay', state.el).innerHTML = Player.playing ? ICON_PAUSE : ICON_PLAY;
  $('#lsPlay', state.el).setAttribute('aria-label', Player.playing ? '暂停' : '播放');
  $('#lsPlay', state.el).title = Player.playing ? '暂停 (Space)' : '播放 (Space)';
  state.el.classList.toggle('is-playing', !!Player.playing);
  state.el.classList.toggle('is-embed', !!Player.isEmbed);

  $('#lsShuffle', state.el).classList.toggle('is-on', Player.shuffle);
  $('#lsShuffle', state.el).setAttribute('aria-pressed', String(Player.shuffle));
  const repeat = Player.repeat;
  $('#lsRepeat', state.el).classList.toggle('is-on', repeat !== 'off');
  $('#lsRepeat', state.el).setAttribute('aria-pressed', String(repeat !== 'off'));
  $('#lsRepeat', state.el).title = repeat === 'one' ? '单曲循环' : repeat === 'off' ? '列表播完就停' : '列表循环';
  $('#lsRep1', state.el).hidden = repeat !== 'one';

  const muted = Player.muted || Player.isEmbed;
  $('#lsMute', state.el).innerHTML = muted ? ICON_MUTE : ICON_VOL;
  $('#lsMute', state.el).title = Player.isEmbed ? '网易云曲目的音量请在播放器内调整' : (Player.muted ? '取消静音 (M)' : '静音 (M)');

  const vol = Player.isEmbed ? 0 : Player.volume;
  state.vol?.set(Player.isEmbed ? 0 : vol);
  $('#lsVol', state.el).classList.toggle('is-disabled', !!Player.isEmbed);
  $('#lsVol', state.el).setAttribute('aria-disabled', String(!!Player.isEmbed));
  $('#lsVol', state.el).tabIndex = Player.isEmbed ? -1 : 0;

  $('#lsSeek', state.el).classList.toggle('is-disabled', !!Player.isEmbed);
  $('#lsSeek', state.el).setAttribute('aria-disabled', String(!!Player.isEmbed));
  $('#lsSeek', state.el).tabIndex = Player.isEmbed ? -1 : 0;

  // 字幕索引在 seek 后可能跳行，syncTransport 顺带补一次（内部有 key 去重）
  paintLyrics();
}

/* ---------------- 打开 / 关闭 ---------------- */

export function openListeningStage() {
  if (!Player.current) {
    Toast.show('先选一首歌，再进沉浸模式');
    return false;
  }
  if (!state.el) build();
  if (state.open) return true;

  state.focusReturn = document.activeElement;
  state.open = true;
  state.lyricKey = '';
  state.trackKey = '';
  state.el.hidden = false;
  document.body.classList.add('is-locked');
  // 背景页面不可聚焦：键盘 Tab 不会跑到浮层后面
  document.querySelectorAll('.topbar, .ticker, #view, .footer, .miniplayer').forEach((el) => { el.inert = true; });
  requestAnimationFrame(() => state.el.classList.add('is-open'));

  toggleQueue(false);
  renderQueue();
  paintTrack();
  paintLyrics();
  syncTransport();

  state.offs.forEach((off) => off?.());
  state.offs = [
    bus.on('player:track', () => { paintTrack(); paintLyrics(); syncTransport(); }),
    bus.on('player:state', syncTransport),
    bus.on('player:embed', syncTransport),
    bus.on('lyrics:line', paintLyrics),
    bus.on('lyrics:ready', paintLyrics),
    bus.on('lyrics:idle', paintLyrics),
    bus.on('playlist:change', () => { paintTrack(); syncTransport(); }),
  ];

  if (state.bars.length) {
    state.stopWave?.();
    state.stopWave = pumpVisualizer(state.bars, () => Player.playing);
  }

  document.addEventListener('keydown', onKey);
  // 焦点落在对话框本身：屏幕阅读器会报出「沉浸式听歌舞台」，
  // 同时避免程序化聚焦把 Exit 键画出醒目的焦点圈（Tab 仍会先到关闭键）。
  setTimeout(() => state.el?.focus?.({ preventScroll: true }), 50);
  return true;
}

export function closeListeningStage() {
  if (!state.el || !state.open) return;
  state.open = false;
  toggleQueue(false);
  state.el.classList.remove('is-open');
  state.stopWave?.();
  state.stopWave = null;
  state.offs.forEach((off) => off?.());
  state.offs = [];
  document.removeEventListener('keydown', onKey);
  document.querySelectorAll('.topbar, .ticker, #view, .footer, .miniplayer').forEach((el) => { el.inert = false; });
  if (!document.querySelector('.lyricfull')) document.body.classList.remove('is-locked');

  const root = state.el;
  setTimeout(() => { if (!state.open) root.hidden = true; }, 220);
  try { state.focusReturn?.focus?.(); } catch { /* 已卸载 */ }
}

function bindControls() {
  if (!state.el) return;
  const seekEl = $('#lsSeek', state.el);
  const volEl = $('#lsVol', state.el);

  state.seek = bindRange(seekEl, {
    onInput: (r, commit) => {
      if (!Player.current) return;
      const d = trackDuration(Player.current);
      if (d) {
        $('#lsTime', state.el).textContent = fmtClock(d * r);
        $('#lsTechClock', state.el).textContent = `${fmtClock(d * r)} / ${fmtClock(d)}`;
      }
      if (commit && !Player.isEmbed) Player.seekRatio(r);
      else if (commit && Player.isEmbed) Toast.show('官方播放器的进度条无法从站内拖动');
    },
  });

  state.vol = bindRange(volEl, {
    onInput: (r, commit) => {
      if (Player.isEmbed) return;
      Player.setVolume(r);
      if (commit && Player.muted) Player.toggleMute();
    },
  });

  // 音量回写：拖动时 bindRange.set 会自己忽略，避免跟用户抢手柄
  state.vol?.set(Player.isEmbed ? 0 : Player.volume);
}

function onKey(e) {
  if (!state.open) return;
  const tag = String(e.target?.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;

  // 焦点在按钮 / 滑块上时，Space 与方向键交给控件自己处理：
  // 否则按一次空格会同时触发「原生 click」和这里的全局 toggle，等于没按。
  const inControl = e.target?.closest?.('button, a, input, select, textarea, [role="slider"]');
  if (inControl && (e.code === 'Space' || e.key.startsWith('Arrow'))) return;

  if (e.key === 'Escape') {
    e.preventDefault();
    if (!document.getElementById('lsQueue')?.hidden) toggleQueue(false);
    else closeListeningStage();
  } else if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    closeListeningStage();
  } else if (e.code === 'Space') {
    e.preventDefault();
    Player.toggle();
  } else if (e.key === 'ArrowLeft' && !e.shiftKey) {
    e.preventDefault();
    if (Player.isEmbed) Toast.show('官方播放器无法从站外拖动进度');
    else Player.seek(Player.currentTime - 5);
  } else if (e.key === 'ArrowRight' && !e.shiftKey) {
    e.preventDefault();
    if (Player.isEmbed) Toast.show('官方播放器无法从站外拖动进度');
    else Player.seek(Player.currentTime + 5);
  } else if (e.key === 'ArrowLeft' && e.shiftKey) {
    e.preventDefault();
    Player.prev();
  } else if (e.key === 'ArrowRight' && e.shiftKey) {
    e.preventDefault();
    Player.next();
  } else if (e.key === 'm' || e.key === 'M') {
    e.preventDefault();
    Player.toggleMute();
  }
}

/** 只绑定一次总线路由；真正的播放器订阅在打开时才挂 */
export function initListeningStage() {
  bus.on('route:change', () => closeListeningStage());
  return ListeningStage;
}

export const ListeningStage = { init: initListeningStage, open: openListeningStage, close: closeListeningStage };

export default ListeningStage;
