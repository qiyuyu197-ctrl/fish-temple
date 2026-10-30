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
import { createSceneLayer, nextSceneId, sceneName, SCENES } from './stage-scenes.js';
import { loadManifest } from '../plugins/stage.js';
import { openBackgroundPicker } from './background-picker.js';
import {
  splitBackdropPools,
  chooseBackdropPool,
  photoOrientation,
  prefersPortraitBackdrop,
} from './backdrop-pool.js';

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
  sceneLayer: null,
  beatTimer: 0,
  backdrop: 'cover',
  archiveUrl: '',
  archivePools: null,
  archiveOrientation: '',
  resizeTimer: 0,
  bgPinned: '',
  bgPickerBusy: false,
  seek: null,
  vol: null,
  trackKey: '',
  lyricKey: '',
  focusReturn: null,
  bare: false,
};

/** 无 UI 模式下不弹提示：切背景 / 场景 / 循环都不打断画面 */
function stageToast(message, kind = '') {
  if (state.bare) return;
  if (kind === 'err') Toast.err(message);
  else Toast.show(message);
}

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

/**
 * 逐字渲染：每颗字都带自己的开始时间（引擎算好的 `line.chars`）。
 * 没有逐字时间轴时退回词级渲染 —— 至少换句动画还在。
 */
function charsHTML(line, fallbackText) {
  const chars = line?.chars;
  if (!Array.isArray(chars) || !chars.length) return wordsHTML(fallbackText);
  return chars.map((c, i) => (
    /^\s$/.test(c.ch)
      ? '<span class="lstage__gap"> </span>'
      : `<span class="lstage__ch" data-t="${Math.round(c.t)}" style="--i:${Math.min(i, 64)}"><i class="lstage__chi">${esc(c.ch)}</i></span>`
  )).join('');
}

/** 逐字点亮的帧循环：只在沉浸舞台打开时跑，关掉就停 */
let karaRaf = 0;
let karaLive = null;
let karaPulseAt = 0;

function stopKaraoke() {
  if (karaRaf) cancelAnimationFrame(karaRaf);
  karaRaf = 0;
  karaLive = null;
}

function startKaraoke() {
  stopKaraoke();
  const step = () => {
    const el = state.el;
    if (!el || !el.classList.contains('is-open')) { karaRaf = 0; return; }
    const lineEl = $('#lsLine', el);
    const ms = Lyrics.now();
    // 鼓点包络写进 CSS 变量：正在唱的那颗字据此做"呼吸"，而不是匀速动画
    if (state.sceneLayer?.energy) {
      el.style.setProperty('--beat', state.sceneLayer.energy.beat.toFixed(3));
    }
    let live = null;
    for (const node of lineEl ? lineEl.querySelectorAll('.lstage__ch') : []) {
      const t = Number(node.dataset.t) || 0;
      const on = ms >= t;
      if (on !== node.classList.contains('is-on')) node.classList.toggle('is-on', on);
      if (on && ms - t < 240) live = node;
    }
    if (live !== karaLive) {
      karaLive?.classList.remove('is-live');
      live?.classList.add('is-live');
      // 逐字点亮时在字的位置打一圈涟漪：画面和"唱到哪颗字"同一个时间轴
      if (live) {
        const now = performance.now();
        if (now - karaPulseAt > 90) {
          karaPulseAt = now;
          const r = live.getBoundingClientRect();
          state.sceneLayer?.pulseAt(r.left + r.width / 2, r.top + r.height / 2, 0.55);
        }
      }
      karaLive = live;
    }
    karaRaf = requestAnimationFrame(step);
  };
  karaRaf = requestAnimationFrame(step);
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
    <img class="lstage__archive" id="lsArchive" alt="" aria-hidden="true" hidden />
    <div class="lstage__scrim" id="lsScrim" aria-hidden="true"></div>
    <canvas class="lstage__scene" id="lsSceneCanvas" aria-hidden="true"></canvas>
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
      <button class="lstage__queuebtn lstage__bgbtn" id="lsBgBtn" type="button" title="切换背景：封面 / 相册插画 / 关闭 (B)" aria-label="切换背景">
        <span class="mono" id="lsBgName">COVER</span>
      </button>
      <button class="lstage__queuebtn lstage__bgbtn" id="lsBgShuffle" type="button" title="换一张相册背景 (R)" aria-label="换一张相册背景">
        <span class="mono">换图</span>
      </button>
      <button class="lstage__queuebtn lstage__bgbtn lstage__bgpick" id="lsBgPick" type="button" title="从图库选一张 / 导入自己的图 (G)" aria-label="从图库选择背景" aria-keyshortcuts="G">
        <span class="mono">选图</span>
      </button>
      <button class="lstage__queuebtn lstage__bgbtn" id="lsBgPin" type="button" title="固定这张相册背景 (P)" aria-label="固定相册背景">
        <span class="mono" id="lsBgPinName">固定</span>
      </button>
      <button class="lstage__queuebtn lstage__bgbtn" id="lsHelpBtn" type="button" title="快捷键 (?)" aria-label="快捷键">
        <span class="mono">?</span>
      </button>
      <button class="lstage__queuebtn lstage__scenebtn" id="lsSceneBtn" type="button" title="切换可视化场景 (V)" aria-label="切换可视化场景">
        <span class="mono" id="lsSceneName">OFF</span>
      </button>
      <button class="lstage__queuebtn" id="lsQueueBtn" type="button" title="播放队列" aria-label="打开播放队列" aria-expanded="false">
        <span>队列</span><b class="mono" id="lsQueueCount">00</b>
      </button>
      <button class="lstage__queuebtn" id="lsBareBtn" type="button" title="无UI模式 (H)" aria-pressed="false">
        <span class="mono">无UI</span>
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
          <span><kbd>V</kbd> 场景</span>
          <span><kbd>B</kbd> 背景</span>
          <span><kbd>R</kbd> 换图</span>
          <span><kbd>?</kbd> 快捷键</span>
          <span><kbd>H</kbd> 无UI</span>
        </div>
      </div>
    </footer>

    <div class="lstage__help" id="lsHelp" role="dialog" aria-modal="true" aria-label="快捷键" hidden>
      <div class="lstage__helpcard">
        <div class="lstage__helphead">
          <b>KEYBOARD / 快捷键</b>
          <button class="lstage__mini" id="lsHelpClose" type="button" aria-label="关闭快捷键">关闭</button>
        </div>
        <dl class="lstage__helpkeys">
          <dt><kbd>SPACE</kbd></dt><dd>播放 / 暂停</dd>
          <dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>后退 / 前进 5 秒</dd>
          <dt><kbd>SHIFT</kbd> + <kbd>←</kbd> <kbd>→</kbd></dt><dd>上一首 / 下一首</dd>
          <dt><kbd>M</kbd></dt><dd>静音</dd>
          <dt><kbd>V</kbd></dt><dd>切换可视化场景</dd>
          <dt><kbd>B</kbd></dt><dd>切换背景（封面 / 相册 / 关闭）</dd>
          <dt><kbd>R</kbd></dt><dd>换一张相册背景</dd>
          <dt><kbd>G</kbd></dt><dd>从图库选图 / 导入自己的图</dd>
          <dt><kbd>P</kbd></dt><dd>固定 / 取消固定相册背景</dd>
          <dt><kbd>H</kbd></dt><dd>无 UI 模式 / 恢复界面</dd>
          <dt><kbd>Q</kbd></dt><dd>打开 / 关闭队列</dd>
          <dt><kbd>F</kbd> <kbd>ESC</kbd></dt><dd>退出沉浸舞台</dd>
        </dl>
        <p class="lstage__helpfoot mono">? 打开 · ESC 关闭</p>
      </div>
    </div>`;
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
  // 点完按钮把焦点交还舞台：否则空格会被浏览器当成"再点一次刚才那个按钮"，
  // 而不是播放 / 暂停（无 UI 模式下这个坑最明显，因为按钮已经藏起来了）。
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn) btn.blur?.();
  });
  root.addEventListener('click', (e) => {
    const id = e.target.closest('button')?.id || '';
    // 不能写裸 close()：浏览器会解析成 window.close，直接把整个标签页关掉
    if (id === 'lsClose') return closeListeningStage();
    if (id === 'lsSceneBtn') { cycleScene(); return; }
    if (id === 'lsBgBtn') { void cycleBackdrop(); return; }
    if (id === 'lsBgShuffle') { void shuffleArchive(); return; }
    if (id === 'lsBgPick') { void chooseBackgroundFromLibrary(); return; }
    if (id === 'lsBgPin') { toggleBgPin(); return; }
    if (id === 'lsHelpBtn') { toggleHelp(); return; }
    if (id === 'lsBareBtn') { toggleBare(); return; }
    if (id === 'lsHelpClose') { toggleHelp(false); return; }
    if (e.target?.id === 'lsHelp') { toggleHelp(false); return; }
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
        stageToast(`正在播放：${Player.current?.title || ''}`);
      }
      return;
    }
    // 点某颗字 = 从那颗字开始（只有直放能 seek；iframe 的位置是估算，不接）
    const ch = e.target.closest('.lstage__ch');
    if (ch && !Player.isEmbed) {
      const ms = Number(ch.dataset.t);
      if (Number.isFinite(ms) && ms >= 0) { Player.seek(ms / 1000); return; }
    }
    // 点歌词空白处 = 回到当前行
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
  stageToast(Player.shuffle ? '随机播放：开' : '随机播放：关');
  syncTransport();
}

/** 快捷键面板：按 ? 打开，ESC / 点空白关闭 */
function toggleHelp(force) {
  if (state.bare && force !== false) return; // 无 UI 模式不弹面板
  const el = $('#lsHelp', state.el);
  if (!el) return;
  const open = typeof force === 'boolean' ? force : el.hidden;
  el.hidden = !open;
  if (open) $('#lsHelpClose', state.el)?.focus?.({ preventScroll: true });
  else state.el?.focus?.({ preventScroll: true });
}

/**
 * 无 UI 模式：上下两条控制区全隐藏，只剩歌词与背景。
 * 快捷键照常生效，但不弹任何提示；再按 H 恢复。
 */
function toggleBare(force) {
  if (!state.el) return;
  const on = typeof force === 'boolean' ? force : !state.bare;
  state.bare = on;
  state.el.classList.toggle('is-bare', on);
  $('#lsBareBtn', state.el)?.setAttribute('aria-pressed', String(on));
  if (on) {
    toggleQueue(false);
    toggleHelp(false);
    // 收起 UI 后把焦点从按钮上拿走：否则 Space / 方向键会被当成"按钮自己的快捷键"
    try {
      const active = document.activeElement;
      if (active && active !== state.el) active.blur?.();
      state.el.focus?.({ preventScroll: true });
    } catch { /* 忽略 */ }
  }
}

/**
 * 背景视差：指针在舞台里移动时，相册图 / 封面底缓慢跟一点（最多 ~12px），
 * 移出后回中。只对鼠标生效；触屏与 prefers-reduced-motion 直接跳过。
 */
function startParallax() {
  const el = state.el;
  if (!el) return () => {};
  let reduced = false;
  try { reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* noop */ }
  if (reduced) return () => {};

  let tx = 0; let ty = 0; let cx = 0; let cy = 0; let raf = 0;
  const apply = () => {
    el.style.setProperty('--bg-px', cx.toFixed(3));
    el.style.setProperty('--bg-py', cy.toFixed(3));
  };
  const tick = () => {
    raf = 0;
    cx += (tx - cx) * 0.14;
    cy += (ty - cy) * 0.14;
    if (Math.abs(tx - cx) < 0.003 && Math.abs(ty - cy) < 0.003) {
      cx = tx; cy = ty; apply(); return;
    }
    apply();
    raf = requestAnimationFrame(tick);
  };
  const move = (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
    ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2));
    if (!raf) raf = requestAnimationFrame(tick);
  };
  const leave = () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(tick); };

  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', leave);
  return () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerleave', leave);
    if (raf) cancelAnimationFrame(raf);
    el.style.removeProperty('--bg-px');
    el.style.removeProperty('--bg-py');
  };
}

/* ---------------- 背景：封面模糊 / 相册插画 / 关闭 ---------------- */

const BG_KEY = 'ft.terminal.stageBackdrop';
const BG_PIN_KEY = 'ft.terminal.stageBackdropPin';
const BG_MODES = ['cover', 'archive', 'off'];
const BG_LABEL = { cover: 'COVER', archive: 'ARCHIVE', off: 'OFF' };

function readBackdropMode() {
  try {
    const v = localStorage.getItem(BG_KEY);
    return BG_MODES.includes(v) ? v : 'cover';
  } catch { return 'cover'; }
}

function storeBackdropMode(mode) {
  try { localStorage.setItem(BG_KEY, mode); } catch { /* noop */ }
  return mode;
}

function readBgPin() {
  try { return localStorage.getItem(BG_PIN_KEY) || ''; } catch { return ''; }
}

function writeBgPin(url) {
  let saved = true;
  try {
    if (url) localStorage.setItem(BG_PIN_KEY, url);
    else localStorage.removeItem(BG_PIN_KEY);
  } catch { saved = false; }
  state.bgPinned = url || '';
  return saved;
}

/** 把当前相册图钉住 / 取消固定 */
function toggleBgPin() {
  if (state.bgPinned) {
    writeBgPin('');
    stageToast('已取消固定，下次进舞台重新随机');
  } else if (state.archiveUrl) {
    writeBgPin(state.archiveUrl);
    stageToast('已固定这张相册背景');
  } else {
    stageToast('先切到 ARCHIVE 背景再固定');
  }
  paintBackdrop();
}

/** 把当前模式画到背景层上（封面 / 相册 / 关闭） */
function paintBackdrop() {
  if (!state.el) return;
  const bd = $('#lsBackdrop', state.el);
  const img = $('#lsArchive', state.el);
  if (!bd) return;
  const mode = state.backdrop;
  bd.classList.toggle('is-archive', mode === 'archive');
  bd.classList.toggle('is-off', mode === 'off');
  bd.classList.toggle('is-cover', mode === 'cover');
  state.el.classList.toggle('is-archive', mode === 'archive');

  if (mode === 'archive') {
    bd.style.backgroundImage = '';
    bd.style.removeProperty('--archive-url');
    if (img) {
      const next = state.archiveUrl || '';
      if (img.getAttribute('src') !== next) img.setAttribute('src', next);
      img.hidden = !next;
    }
  } else {
    bd.style.removeProperty('--archive-url');
    if (img) { img.hidden = true; img.removeAttribute('src'); }
    const cover = mode === 'cover' ? (Player.current?.cover || '') : '';
    bd.style.backgroundImage = cover ? `url("${String(cover).replace(/"/g, '%22')}")` : '';
  }

  const name = $('#lsBgName', state.el);
  const localArchive = mode === 'archive' && /^data:/i.test(state.archiveUrl || '');
  if (name) name.textContent = localArchive ? 'LOCAL' : (BG_LABEL[mode] || 'COVER');
  const btn = $('#lsBgBtn', state.el);
  btn?.classList.toggle('is-on', mode === 'archive');
  if (btn) btn.title = `背景：${BG_LABEL[mode]}（B 切换）`;

  const pinBtn = $('#lsBgPin', state.el);
  const pinned = !!state.bgPinned;
  pinBtn?.classList.toggle('is-on', pinned);
  pinBtn?.setAttribute('aria-pressed', String(pinned));
  const pinName = $('#lsBgPinName', state.el);
  if (pinName) pinName.textContent = pinned ? '已固定' : '固定';
  if (pinBtn) pinBtn.title = pinned ? '已固定：点一下恢复随机 (P)' : '固定这张相册背景 (P)';
}

const preloadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = resolve;
  img.onerror = reject;
  img.src = src;
});

async function ensureArchivePools() {
  if (!state.archivePools) {
    const items = await loadManifest('data/album.json');
    state.archivePools = splitBackdropPools(items);
  }
  return state.archivePools;
}

/** 舞台当前想要的方向：手机 / 竖屏 → 竖图，桌面 → 横图 */
function wantArchiveOrientation() {
  return prefersPortraitBackdrop(state.el) ? 'portrait' : 'landscape';
}

/** 从相册清单里抽一张背景（和首页「RANDOM ARCHIVE」同一个池子；手机优先竖图） */
async function loadArchivePhoto({ force = false } = {}) {
  // 固定优先：只要钉着就直接用那张；失败就自动解钉、退回随机
  if (state.bgPinned && !force) {
    try {
      await preloadImage(state.bgPinned);
      state.archiveUrl = state.bgPinned;
      const known = state.archivePools?.all.find((it) => it.url === state.bgPinned);
      state.archiveOrientation = photoOrientation(known) || '';
      return true;
    } catch {
      writeBgPin('');
    }
  }
  try {
    const pools = await ensureArchivePools();
    const chosen = chooseBackdropPool(pools, { portrait: wantArchiveOrientation() === 'portrait' });
    const pool = chosen.pool;
    if (!pool.length) return false;
    let pick = pool[Math.floor(Math.random() * pool.length)];
    // 换图时尽量别抽到刚看过的那张
    for (let i = 0; i < 5 && pool.length > 1 && pick.url === state.archiveUrl; i += 1) {
      pick = pool[Math.floor(Math.random() * pool.length)];
    }
    await preloadImage(pick.url);
    state.archiveUrl = pick.url;
    state.archiveOrientation = photoOrientation(pick);
    return true;
  } catch {
    return false;
  }
}

/**
 * 舞台是整屏的，转屏 / 改窗口后宽高比会变：相册背景跟着换一张同方向的。
 * 固定状态不动（那是用户明确选的）。防抖，避免手机地址栏收起也触发换图。
 */
function onStageResize() {
  if (!state.open) return;
  clearTimeout(state.resizeTimer);
  state.resizeTimer = setTimeout(() => {
    state.resizeTimer = 0;
    if (!state.open || state.backdrop !== 'archive' || state.bgPinned) return;
    if (!state.archiveOrientation || state.archiveOrientation === wantArchiveOrientation()) return;
    void loadArchivePhoto({ force: true }).then((ok) => { if (ok) paintBackdrop(); });
  }, 260);
}

async function cycleBackdrop() {
  const next = BG_MODES[(BG_MODES.indexOf(state.backdrop) + 1) % BG_MODES.length];
  state.backdrop = storeBackdropMode(next);
  if (next === 'archive') {
    const ok = await loadArchivePhoto();
    if (!ok) {
      state.backdrop = storeBackdropMode('cover');
      stageToast('相册里还没有可用的背景，先退回封面');
      paintBackdrop();
      return;
    }
    stageToast('背景：相册插画（RANDOM ARCHIVE）');
  } else if (next === 'off') {
    stageToast('背景：关闭');
  } else {
    stageToast('背景：封面模糊');
  }
  paintBackdrop();
}

/** 换一张相册背景（没开相册模式时顺手切过去；固定状态下换成新的并继续钉住） */
async function shuffleArchive() {
  state.backdrop = storeBackdropMode('archive');
  const wasPinned = !!state.bgPinned;
  const ok = await loadArchivePhoto({ force: true });
  if (!ok) {
    state.backdrop = storeBackdropMode('cover');
    stageToast('相册里还没有可用的背景，先退回封面');
    paintBackdrop();
    return;
  }
  if (wasPinned) writeBgPin(state.archiveUrl);
  paintBackdrop();
  stageToast(wasPinned ? '换了一张，并继续固定' : '换了一张相册背景');
}

/** 从图库 / 本地导入里选一张，选中即固定；舞台下一次打开还是它 */
async function chooseBackgroundFromLibrary() {
  if (!state.el || state.bgPickerBusy) return;
  state.bgPickerBusy = true;
  try {
    const photo = await openBackgroundPicker({
      scope: 'stage',
      currentUrl: state.archiveUrl,
      currentPhoto: state.archiveUrl
        ? { url: state.archiveUrl, title: state.bgPinned ? '已固定的舞台背景' : '当前舞台背景' }
        : null,
    });
    if (!photo?.url) return;
    try {
      await preloadImage(photo.url);
    } catch {
      Toast.err('这张背景加载不出来，换一张试试');
      return;
    }
    const saved = writeBgPin(photo.url);
    state.archiveUrl = photo.url;
    state.archiveOrientation = photoOrientation(photo);
    state.backdrop = storeBackdropMode('archive');
    paintBackdrop();
    if (!saved) stageToast('背景已换；图太大，只在本次打开有效', 'err');
    else stageToast(photo.custom ? '已换成导入的背景，并固定' : '已固定这张相册背景');
  } catch {
    Toast.err('选图面板没打开成功');
  } finally {
    state.bgPickerBusy = false;
  }
}

/** 场景按钮上只显示短名（LATTICE / ORBIT…） */
function paintSceneLabel() {
  const id = state.sceneLayer?.id || 'off';
  const el = $('#lsSceneName', state.el);
  const btn = $('#lsSceneBtn', state.el);
  const noFft = !!Player.isEmbed;
  if (el) el.textContent = id === 'off' ? 'OFF' : (noFft ? 'NO FFT' : sceneName(id));
  btn?.classList.toggle('is-on', id !== 'off');
  btn?.classList.toggle('is-dim', noFft);
  if (btn) btn.title = noFft
    ? '官方播放器读不到频谱：场景不会跟着节奏动'
    : `切换可视化场景 (V) · 当前 ${sceneName(id)}`;
}

function cycleScene() {
  if (!state.sceneLayer) return;
  const next = nextSceneId(state.sceneLayer.id);
  state.sceneLayer.set(next);
  paintSceneLabel();
  const item = SCENES.find((s) => s.id === next);
  if (Player.isEmbed) {
    stageToast(`已切到 ${item?.label || ''}，但官方播放器没有频谱，画面不会跟节奏`);
  } else {
    stageToast(`可视化：${item?.label || ''}（${sceneName(next)}）`);
  }
}

function cycleRepeat() {
  const order = ['all', 'one', 'off'];
  const next = order[(order.indexOf(Player.repeat) + 1) % order.length];
  Player.setRepeat(next);
  stageToast(next === 'one' ? '单曲循环' : next === 'off' ? '列表播完就停' : '列表循环');
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
  paintBackdrop();
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
      // yrc 才有逐字；没有的时候仍是行级 LRC，标出来免得误会
      meta = [line?.words?.length ? '逐字同步' : 'LRC SYNC', trans ? '译文' : ''].filter(Boolean).join(' · ');
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
      : charsHTML(Lyrics.status === 'ready' ? Lyrics.current() : null, cur);
    // 让「逐字上浮」从第一颗字重新开始；prefers-reduced-motion 由 CSS 关掉
    lineEl.classList.remove('is-enter');
    void lineEl.offsetWidth;
    lineEl.classList.add('is-enter');
    // 换句 = 一次更强的涟漪（低频鼓点也走同一条绘制路径）
    if (state.sceneLayer && Player.playing) {
      const r = lineEl.getBoundingClientRect();
      state.sceneLayer.pulseAt(r.left + r.width / 2, r.top + r.height / 2, 1.1);
    }
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
    stageToast('先选一首歌，再进沉浸模式');
    return false;
  }
  if (!state.el) build();
  if (state.open) return true;

  state.focusReturn = document.activeElement;
  state.open = true;
  // 每次打开都从"有 UI"开始，避免上次的无 UI 状态让人找不到退出键
  state.bare = false;
  state.el.classList.remove('is-bare');
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
  // 背景视差（指针跟随；关舞台时由 offs 统一清理）
  state.offs.push(startParallax());

  if (state.bars.length) {
    state.stopWave?.();
    state.stopWave = pumpVisualizer(state.bars, () => Player.playing);
  }

  startKaraoke();
  // 可视化场景层：canvas 在内容后面，跟着频谱跑。
  // 注意：不再给舞台挂 is-beat —— 整屏/整行跟着鼓点明暗跳会像在闪屏。
  if (!state.sceneLayer) state.sceneLayer = createSceneLayer($('#lsSceneCanvas', state.el));
  state.sceneLayer.start();
  paintSceneLabel();

  // 背景：沿用上次的选择；相册模式首次需要抽一张（固定优先）。
  // 重新打开舞台时如果横竖方向变了（手机竖屏 ↔ 桌面宽屏），也换一张对应的。
  state.backdrop = readBackdropMode();
  state.bgPinned = readBgPin();
  paintBackdrop();
  if (state.backdrop === 'archive') {
    const wrongOrientation = !state.bgPinned && state.archiveOrientation
      && state.archiveOrientation !== wantArchiveOrientation();
    if (!state.archiveUrl || wrongOrientation) {
      void loadArchivePhoto({ force: !!state.archiveUrl }).then((ok) => {
        if (ok) paintBackdrop();
        else {
          state.backdrop = storeBackdropMode('cover');
          paintBackdrop();
          stageToast('相册里还没有可用的背景，已退回封面');
        }
      });
    }
  }

  // 转屏 / 改窗口：相册背景跟着换同方向的一张（固定状态除外）
  window.addEventListener('resize', onStageResize);
  window.addEventListener('orientationchange', onStageResize);

  document.addEventListener('keydown', onKey);
  // 焦点落在对话框本身：屏幕阅读器会报出「沉浸式听歌舞台」，
  // 同时避免程序化聚焦把 Exit 键画出醒目的焦点圈（Tab 仍会先到关闭键）。
  setTimeout(() => state.el?.focus?.({ preventScroll: true }), 50);
  return true;
}

export function closeListeningStage() {
  if (!state.el || !state.open) return;
  state.open = false;
  stopKaraoke();
  state.sceneLayer?.stop();
  toggleQueue(false);
  state.el.classList.remove('is-open');
  state.stopWave?.();
  state.stopWave = null;
  state.offs.forEach((off) => off?.());
  state.offs = [];
  window.removeEventListener('resize', onStageResize);
  window.removeEventListener('orientationchange', onStageResize);
  clearTimeout(state.resizeTimer);
  state.resizeTimer = 0;
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
      else if (commit && Player.isEmbed) stageToast('官方播放器的进度条无法从站内拖动');
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
  // 图库面板打开时，按键归搜索框 / 面板自己；否则输入地名会触发 F / B / R 等快捷键
  if (document.body.classList.contains('is-bgpicker-open')) return;
  const tag = String(e.target?.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;

  // 焦点在按钮 / 滑块上时，Space 与方向键交给控件自己处理：
  // 否则按一次空格会同时触发「原生 click」和这里的全局 toggle，等于没按。
  const inControl = e.target?.closest?.('button, a, input, select, textarea, [role="slider"]');
  if (inControl && (e.code === 'Space' || e.key.startsWith('Arrow'))) return;

  if (e.key === 'Escape') {
    e.preventDefault();
    if (!document.getElementById('lsHelp')?.hidden) toggleHelp(false);
    else if (!document.getElementById('lsQueue')?.hidden) toggleQueue(false);
    else closeListeningStage();
  } else if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
    e.preventDefault();
    toggleHelp();
  } else if (e.key === 'h' || e.key === 'H') {
    e.preventDefault();
    toggleBare();
  } else if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    closeListeningStage();
  } else if (e.key === 'v' || e.key === 'V') {
    e.preventDefault();
    cycleScene();
  } else if (e.key === 'b' || e.key === 'B') {
    e.preventDefault();
    void cycleBackdrop();
  } else if (e.key === 'r' || e.key === 'R') {
    e.preventDefault();
    void shuffleArchive();
  } else if (e.key === 'g' || e.key === 'G') {
    e.preventDefault();
    void chooseBackgroundFromLibrary();
  } else if (e.key === 'p' || e.key === 'P') {
    e.preventDefault();
    toggleBgPin();
  } else if (e.code === 'Space') {
    e.preventDefault();
    Player.toggle();
  } else if (e.key === 'ArrowLeft' && !e.shiftKey) {
    e.preventDefault();
    if (Player.isEmbed) stageToast('官方播放器无法从站外拖动进度');
    else Player.seek(Player.currentTime - 5);
  } else if (e.key === 'ArrowRight' && !e.shiftKey) {
    e.preventDefault();
    if (Player.isEmbed) stageToast('官方播放器无法从站外拖动进度');
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
