/**
 * views/gomoku.js — 五子棋（板块 / GOMOKU）
 * ------------------------------------------------------------------
 * 规则、AI 与「破规则」能力全部在 plugins/gomoku.js（纯逻辑，不碰 DOM），
 * 这里只负责画面、操作与对局节奏。
 *
 * 两种模式：
 *   人机对战  你执黑或执白，对手从四位 bot 里挑一位；
 *             轮到 bot 时它自己思考、落子，必要时掀桌（偷子 / 封点 / 连手）。
 *   AI 观战   黑方白方各挑一位 bot（可以选同一个），自动对局；
 *             人类只负责看：暂停 / 单步 / 换速度 / 自动连战。
 *
 * 交互：
 *   鼠标      悬停显示落子预览，点击落子
 *   触屏      直接点（预览只在有指针的机器上出现）
 *   键盘      ←↑→↓ 移动光标，空格 / 回车落子，U 悔棋，R 重开
 *   观战      暂停 / 继续 / 单步 / 1× 2× 4×（会影响 AI 的思考时间）
 *
 * 视觉：
 *   棋盘是 SVG，viewBox 跟着 15×15 走，所以容器怎么缩放都不会模糊。
 *   棋子不用主题的纸墨变量（夜里会黑白颠倒），固定黑 / 米白两色；
 *   网格与木纹底色才跟着主题走。
 */

import { esc } from '../util/dom.js';
import { Toast } from '../ui/toast.js';
import { Motion } from '../core/motion.js';
import { viewhead, gameTabs } from '../ui/bits.js';
import {
  BOTS, ABILITIES, ABILITY_BY_ID, BLACK, WHITE, SIZE,
  createGame, place, canPlay, chooseMove, planAbilities,
  applySteal, applySeal, applyDouble, undoToHuman,
  coordName, botById,
  loadRecord, recordResult, resetRecord,
  seriesFor, recordSeries, resetSeries,
} from '../plugins/gomoku.js';
// 给自检 / 控制台留一个引擎入口（只在五子棋视图挂载时存在，不占首屏）
import * as GomokuEngine from '../plugins/gomoku.js';

const SETUP_KEY = 'ft.terminal.gomoku.setup';
const MAX_UNDO = 3;

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

const pad3 = (n) => String(Math.max(0, Math.floor(n))).padStart(3, '0');
const stoneName = (side) => (side === BLACK ? '黑' : '白');
const sideName = (game, side) => {
  const info = game?.sides?.[side];
  if (!info) return '—';
  const bot = info.bot ? botById(info.bot) : null;
  return info.human ? '你' : (bot?.name || '—');
};
const abilityText = (e) => {
  const ab = ABILITY_BY_ID[e.type];
  if (!ab) return '';
  return e.idx >= 0 ? `${ab.name} ${coordName(e.idx)}` : ab.name;
};
const fmtClock = (ms) => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

function loadSetup() {
  const def = {
    mode: 'human',
    humanSide: BLACK,
    botId: 'gexiaojie',
    blackId: 'gexiaojie',
    whiteId: 'wotaishuaile',
    allowCheat: true,
    speed: 1,
    autoNext: true,
  };
  try {
    const raw = JSON.parse(localStorage.getItem(SETUP_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return def;
    const out = { ...def };
    if (raw.mode === 'human' || raw.mode === 'bots') out.mode = raw.mode;
    if (raw.humanSide === BLACK || raw.humanSide === WHITE) out.humanSide = raw.humanSide;
    if (botById(raw.botId)) out.botId = raw.botId;
    if (botById(raw.blackId)) out.blackId = raw.blackId;
    if (botById(raw.whiteId)) out.whiteId = raw.whiteId;
    if (typeof raw.allowCheat === 'boolean') out.allowCheat = raw.allowCheat;
    if ([1, 2, 4].includes(Number(raw.speed))) out.speed = Number(raw.speed);
    if (typeof raw.autoNext === 'boolean') out.autoNext = raw.autoNext;
    return out;
  } catch { return def; }
}

/* ------------------------------------------------------------------ */
/* 片段                                                                */
/* ------------------------------------------------------------------ */

function strengthHTML(bot) {
  if (!bot) return '';
  const max = bot.strength >= 5;
  const bars = Array.from({ length: 5 }, (_, k) =>
    `<i class="${k < bot.strength ? 'is-on' : ''}"></i>`).join('');
  return `<span class="gk-strength${max ? ' is-max' : ''}" title="强度 ${bot.strength}/5" aria-label="强度 ${bot.strength}/5">${bars}${max ? '<em class="gk-strength__inf" title="没有边际">∞</em>' : ''}</span>`;
}

function abilityRowHTML(side) {
  return ABILITIES.map((ab) => `
    <button class="gk-ab is-used" type="button" data-side="${side}" data-ab="${ab.id}"
            title="${esc(ab.desc)}" aria-label="${esc(ab.name)}：${esc(ab.desc)}">
      <span class="gk-ab__glyph" aria-hidden="true">${esc(ab.glyph)}</span>
      <span class="gk-ab__name">${esc(ab.name)}</span>
      <span class="gk-ab__pip mono">1</span>
    </button>`).join('');
}

function playerCardHTML(side) {
  return `
    <div class="gk-player" data-side="${side}">
      <span class="gk-player__stone gk-stone--${side === BLACK ? 'black' : 'white'}" aria-hidden="true"></span>
      <div class="gk-player__id">
        <b class="gk-player__name" id="gkName${side}">—</b>
        <span class="gk-player__meta mono" id="gkKind${side}">—</span>
      </div>
      <div class="gk-player__right">
        <span class="gk-player__turn mono" id="gkTurnBadge${side}" hidden>走棋</span>
        <span id="gkStr${side}"></span>
      </div>
      <div class="gk-abs" id="gkAbs${side}" hidden></div>
    </div>`;
}

function optionList(selected) {
  return BOTS.map((b) => `<option value="${b.id}"${b.id === selected ? ' selected' : ''}>${esc(b.name)} · Lv.${b.level}${b.cheat ? ' · 破规则' : ''}</option>`).join('');
}

function rosterHTML() {
  return `
    <div class="gk-roster__head">
      <div>
        <span class="k-label">OPPONENTS</span>
        <h2 class="gk-roster__title display">四位对手</h2>
      </div>
      <p class="faint" style="font-size:var(--fs-2xs);line-height:1.8;max-width:46ch">
        强度依次递增。最后一位的强度是刻意做坏的：它有三张「不守规矩」的牌，每张一局只能用一次。
      </p>
    </div>
    <div class="gk-roster__grid">
      ${BOTS.map((b) => `
        <article class="gk-card gk-tone-${b.tone}" data-bot="${b.id}">
          <div class="gk-card__head">
            <span class="gk-card__glyph" aria-hidden="true">${esc(b.glyph)}</span>
            <div class="gk-card__id">
              <b>${esc(b.name)}</b>
              <span class="mono faint">${esc(b.en)} · LV.${b.level}</span>
            </div>
            ${strengthHTML(b)}
          </div>
          <p class="gk-card__desc">${esc(b.desc)}</p>
          <div class="gk-card__foot">
            <span class="mono faint gk-card__record" data-roster-record="${b.id}">—</span>
            <button class="btn btn--sm${b.cheat ? ' gk-card__btn--danger' : ''}" data-challenge="${b.id}" type="button">
              挑战 ${esc(b.name)}
            </button>
          </div>
        </article>`).join('')}
    </div>`;
}

/* ------------------------------------------------------------------ */
/* 视图                                                                */
/* ------------------------------------------------------------------ */

export default {
  id: 'gomoku',
  title: '五子棋',

  render() {
    const setup = loadSetup();
    const hash = String(location.hash || '');
    const q = /[?&]mode=bots/.test(hash);
    const mode = q ? 'bots' : setup.mode;
    return `
    <section class="gk" id="gk" data-mode="${mode}">
      ${gameTabs('gomoku')}
      ${viewhead({
        title: 'GOMOKU',
        idx: 'GAME / 05',
        meta: [
          { label: 'MODE', value: mode === 'bots' ? '观战' : '人机', id: 'gkMetaMode' },
          { label: 'MOVES', value: '000', id: 'gkMetaMoves' },
          { label: 'STATE', value: 'READY', id: 'gkMetaState' },
        ],
        actions: '<button class="btn btn--sm" id="gkNew" type="button">⟳ 新的一局</button>',
      })}

      <div class="gk-bar">
        <div class="gk-modes" role="tablist" aria-label="对局模式">
          <button class="gk-mode" type="button" role="tab" data-mode-btn="human" aria-selected="${mode === 'human'}">人机对战</button>
          <button class="gk-mode" type="button" role="tab" data-mode-btn="bots" aria-selected="${mode === 'bots'}">AI 观战</button>
        </div>

        <div class="gk-setup gk-only-human">
          <div class="gk-field">
            <span class="k-label">我执</span>
            <span class="gk-seg" role="group" aria-label="选择棋子">
              <button class="gk-seg__btn" type="button" data-human-side="1">黑先</button>
              <button class="gk-seg__btn" type="button" data-human-side="2">白后</button>
            </span>
          </div>
          <label class="gk-field">
            <span class="k-label">对手</span>
            <select class="gk-select" id="gkBot" aria-label="选择对手">${optionList(setup.botId)}</select>
          </label>
          <label class="gk-check" title="关掉后「我太帅了」只比棋力，不掀桌">
            <input type="checkbox" id="gkCheat" />
            <span>允许它破规则</span>
          </label>
        </div>

        <div class="gk-setup gk-only-bots">
          <label class="gk-field">
            <span class="k-label">黑方</span>
            <select class="gk-select" id="gkBlack" aria-label="选择黑方 bot">${optionList(setup.blackId)}</select>
          </label>
          <label class="gk-field">
            <span class="k-label">白方</span>
            <select class="gk-select" id="gkWhite" aria-label="选择白方 bot">${optionList(setup.whiteId)}</select>
          </label>
          <label class="gk-field">
            <span class="k-label">速度</span>
            <select class="gk-select" id="gkSpeed" aria-label="观战速度">
              <option value="1">1×</option>
              <option value="2">2×</option>
              <option value="4">4×</option>
            </select>
          </label>
          <label class="gk-check">
            <input type="checkbox" id="gkAuto" />
            <span>自动连战</span>
          </label>
          <div class="gk-botbtns">
            <button class="btn btn--sm btn--signal" id="gkStart" type="button">▶ 开始观战</button>
            <button class="btn btn--sm" id="gkPause" type="button">暂停</button>
            <button class="btn btn--sm" id="gkStep" type="button">单步</button>
            <button class="btn btn--sm" id="gkNext" type="button">下一局</button>
          </div>
          <span class="gk-note mono">两侧可选同一个 bot · 破规则默认开</span>
        </div>
      </div>

      <div class="gk-layout">
        <div class="gk-main">
          <div class="gk-result" id="gkResult" hidden>
            <div class="gk-result__main">
              <span class="gk-result__tag mono" id="gkResultTag">RESULT</span>
              <b class="gk-result__title" id="gkResultTitle">—</b>
              <span class="gk-result__sub" id="gkResultSub"></span>
            </div>
            <button class="btn btn--sm btn--signal" id="gkAgain" type="button">再来一局</button>
          </div>

          <div class="gk-board" id="gkBoard">
            <svg class="gk-svg" id="gkSvg" viewBox="0 0 ${SIZE} ${SIZE}" role="grid" tabindex="0"
                 aria-label="五子棋棋盘，15 乘 15" aria-describedby="gkSvgHint"></svg>
            <div class="gk-break" id="gkBreak" hidden aria-live="polite">
              <span class="gk-break__tag mono">RULE BROKEN</span>
              <b class="gk-break__name" id="gkBreakName">—</b>
              <span class="gk-break__desc" id="gkBreakDesc"></span>
            </div>
          </div>
          <p class="gk-svghint mono" id="gkSvgHint">
            鼠标 / 触屏点击落子 · 键盘 ←↑→↓ 移动，空格落子，U 悔棋，R 重开
          </p>

          <div class="gk-turn" id="gkTurn" aria-live="polite">
            <span class="gk-turn__dot"></span><b>准备中</b>
          </div>

          <div class="gk-toolbar">
            <button class="btn btn--sm gk-only-human" id="gkUndo" type="button">悔棋 <span class="mono" id="gkUndoLeft">3</span></button>
            <span class="gk-toolbar__spacer"></span>
            <span class="mono faint gk-toolbar__hint" id="gkHint">—</span>
          </div>
        </div>

        <aside class="gk-side">
          <div class="gk-say" id="gkSay" hidden aria-live="polite">
            <span class="gk-say__glyph" id="gkSayGlyph" aria-hidden="true">—</span>
            <div class="gk-say__body">
              <b class="gk-say__name" id="gkSayName">—</b>
              <p class="gk-say__text" id="gkSayText"></p>
            </div>
          </div>

          <div class="gk-players">
            ${playerCardHTML(BLACK)}
            ${playerCardHTML(WHITE)}
          </div>

          <div class="panel gk-panel">
            <div class="panel__head">
              <span class="panel__title">棋谱</span>
              <span class="mono faint" id="gkLogCount">0 手</span>
            </div>
            <div class="panel__body gk-logbody">
              <ol class="gk-log" id="gkLog"></ol>
            </div>
          </div>

          <div class="panel gk-panel">
            <div class="panel__head">
              <span class="panel__title" id="gkRecTitle">人机战绩</span>
              <button class="gk-link mono" id="gkResetRec" type="button">清空</button>
            </div>
            <div class="panel__body">
              <div class="gk-records" id="gkRecords"></div>
              <p class="gk-recnote faint" id="gkRecNote">只存在当前浏览器。</p>
            </div>
          </div>
        </aside>
      </div>

      <section class="gk-roster" aria-label="四位 bot">
        ${rosterHTML()}
      </section>
    </section>`;
  },

  mount(root) {
    Motion.reveal(root);

    /* ---------------- 状态 ---------------- */
    const setup = loadSetup();
    let mode = root.querySelector('#gk')?.dataset.mode === 'bots' ? 'bots' : setup.mode;
    let humanSide = setup.humanSide;
    let botId = setup.botId;
    let blackId = setup.blackId;
    let whiteId = setup.whiteId;
    let allowCheat = setup.allowCheat;
    let speed = setup.speed;
    let autoNext = setup.autoNext;

    let game = null;
    let busy = false;
    let paused = true;
    let started = false;          // 观战是否已经按下「开始」——进板块不自动开
    let settled = false;
    let session = 0;
    let undosLeft = MAX_UNDO;
    let newStone = -1;
    let hover = -1;
    let cursor = { r: 7, c: 7 };
    let boardFocused = false;
    let keyboardMode = false;
    let lastSay = null;           // 当前台词条 { player, name, glyph, tone, text, seq }
    const quotesBySeq = new Map(); // 落子 seq → 这一手之后说的台词（棋谱里用）
    const lastQuoteOf = new Map(); // bot id → 上一句，避免连续复读
    const timers = new Set();

    const $ = (sel) => root.querySelector(sel);
    const $$ = (sel) => [...root.querySelectorAll(sel)];
    const alive = (s) => s === session && root.isConnected;

    // 自检 / 调试入口：window.Terminal.Gomoku（挂载时才出现，离开时撤掉）
    window.Terminal = window.Terminal || {};
    const gomokuApi = {
      ...GomokuEngine,
      get state() { return game; },
      get mode() { return mode; },
      get humanSide() { return humanSide; },
      get busy() { return busy; },
      get paused() { return paused; },
      get started() { return started; },
      get session() { return session; },
      newGame: () => newMatch(),
      start: () => startSpectate(),
      step: () => stepOnce(),
      pause: () => togglePause(),
      undo: () => doUndo(),
    };
    window.Terminal.Gomoku = gomokuApi;

    const els = {
      section: $('#gk'),
      svg: $('#gkSvg'),
      board: $('#gkBoard'),
      break: $('#gkBreak'),
      breakName: $('#gkBreakName'),
      breakDesc: $('#gkBreakDesc'),
      result: $('#gkResult'),
      resultTag: $('#gkResultTag'),
      resultTitle: $('#gkResultTitle'),
      resultSub: $('#gkResultSub'),
      say: $('#gkSay'),
      sayGlyph: $('#gkSayGlyph'),
      sayName: $('#gkSayName'),
      sayText: $('#gkSayText'),
      turn: $('#gkTurn'),
      hint: $('#gkHint'),
      metaMode: $('#gkMetaMode'),
      metaMoves: $('#gkMetaMoves'),
      metaState: $('#gkMetaState'),
      log: $('#gkLog'),
      logCount: $('#gkLogCount'),
      logBody: root.querySelector('.gk-logbody'),
      records: $('#gkRecords'),
      recTitle: $('#gkRecTitle'),
      recNote: $('#gkRecNote'),
      pause: $('#gkPause'),
      step: $('#gkStep'),
      start: $('#gkStart'),
      undo: $('#gkUndo'),
      undoLeft: $('#gkUndoLeft'),
      bot: $('#gkBot'),
      black: $('#gkBlack'),
      white: $('#gkWhite'),
      speed: $('#gkSpeed'),
      cheat: $('#gkCheat'),
      auto: $('#gkAuto'),
    };
    const sideEls = {
      1: {
        card: root.querySelector('.gk-player[data-side="1"]'),
        name: $('#gkName1'), kind: $('#gkKind1'), str: $('#gkStr1'),
        turn: $('#gkTurnBadge1'), abs: $('#gkAbs1'),
      },
      2: {
        card: root.querySelector('.gk-player[data-side="2"]'),
        name: $('#gkName2'), kind: $('#gkKind2'), str: $('#gkStr2'),
        turn: $('#gkTurnBadge2'), abs: $('#gkAbs2'),
      },
    };

    /* ---------------- 工具 ---------------- */
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
    const schedule = (fn, ms) => {
      const t = setTimeout(() => { timers.delete(t); fn(); }, Math.max(0, ms));
      timers.add(t);
      return t;
    };
    const saveSetup = () => {
      try {
        localStorage.setItem(SETUP_KEY, JSON.stringify({
          mode, humanSide, botId, blackId, whiteId, allowCheat, speed, autoNext,
        }));
      } catch { /* 隐私模式忽略 */ }
    };

    const budgetFor = (side) => {
      const level = botById(game?.sides?.[side]?.bot)?.level || 1;
      const base = { 1: 60, 2: 140, 3: 340, 4: 720 }[level] || 60;
      // 思考时间也抖一点：同样的局面有时算到 4 层、有时 6 层，落点自然不同
      return Math.max(40, Math.round((base / speed) * (0.82 + Math.random() * 0.36)));
    };
    const delayFor = () => Math.round((mode === 'bots' ? 520 : 380) / speed * (0.8 + Math.random() * 0.5));

    /* ---------------- 棋盘 ---------------- */
    const center = (idx) => [(idx % SIZE) + 0.5, (((idx / SIZE) | 0) + 0.5)];

    function boardMarkup() {
      const size = game?.size || SIZE;
      const board = game?.board;
      const sealed = game?.sealed;
      const winSet = new Set(game?.winLine || []);
      let out = `<rect class="gk-felt" x="0" y="0" width="${size}" height="${size}" rx="0"></rect>`;

      out += '<g class="gk-grid" aria-hidden="true">';
      for (let k = 0; k < size; k++) {
        out += `<line x1="0.5" y1="${k + 0.5}" x2="${size - 0.5}" y2="${k + 0.5}"></line>`;
        out += `<line x1="${k + 0.5}" y1="0.5" x2="${k + 0.5}" y2="${size - 0.5}"></line>`;
      }
      for (const [r, c] of [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]]) {
        out += `<circle cx="${c + 0.5}" cy="${r + 0.5}" r="0.085"></circle>`;
      }
      out += '</g>';

      // 获胜连线：棋子和封点下面先铺一条半透明信号带，棋子上面再叠一条细虚线。
      // 只画在棋子下面会被棋子完全挡住（直径 0.88 > 线宽），所以两层都要。
      const winA = game?.winLine?.length >= 2 ? center(game.winLine[0]) : null;
      const winB = game?.winLine?.length >= 2 ? center(game.winLine[game.winLine.length - 1]) : null;
      if (winA) {
        out += `<line class="gk-winline" x1="${winA[0]}" y1="${winA[1]}" x2="${winB[0]}" y2="${winB[1]}"></line>`;
      }

      out += '<g class="gk-stones">';
      if (board) {
        for (let i = 0; i < board.length; i++) {
          const p = board[i];
          if (!p) continue;
          const [x, y] = center(i);
          const cls = [
            'gk-stone',
            p === BLACK ? 'gk-stone--black' : 'gk-stone--white',
            i === game.lastMove ? 'is-last' : '',
            winSet.has(i) ? 'is-win' : '',
            i === newStone ? 'is-new' : '',
          ].filter(Boolean).join(' ');
          out += `<g class="${cls}" data-idx="${i}" role="img" aria-label="${sideName(game, p)} ${stoneName(p)}子 ${coordName(i)}">
            <title>${coordName(i)} · ${stoneName(p)}子</title>
            <circle cx="${x}" cy="${y}" r="0.44"></circle>
            ${i === game.lastMove ? `<circle class="gk-stone__last" cx="${x}" cy="${y}" r="0.13"></circle>` : ''}
          </g>`;
        }
      }
      out += '</g>';

      // 封点：虚线方框 + 「封」。封点属于落子方，对方永远不能下
      if (sealed) {
        out += '<g class="gk-seals">';
        for (let i = 0; i < sealed.length; i++) {
          const owner = sealed[i];
          if (!owner || board?.[i]) continue;
          const x = (i % size) + 0.5;
          const y = ((i / size) | 0) + 0.5;
          out += `<g class="gk-seal gk-seal--${owner === BLACK ? 'black' : 'white'}" data-idx="${i}">
            <title>${sideName(game, owner)} 的封点：对方不能在此落子</title>
            <rect x="${x - 0.36}" y="${y - 0.36}" width="0.72" height="0.72"></rect>
            <text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central">封</text>
          </g>`;
        }
        out += '</g>';
      }

      // 落子预览（幽灵子）
      if (hover >= 0 && game && !game.over && mode === 'human' && game.turn === humanSide && !busy
        && board && !board[hover] && canPlay(game, hover, humanSide)) {
        const [x, y] = center(hover);
        out += `<g class="gk-ghost gk-stone--${humanSide === BLACK ? 'black' : 'white'}" aria-hidden="true">
          <circle cx="${x}" cy="${y}" r="0.44"></circle>
        </g>`;
      }

      if (winA) {
        out += `<line class="gk-winline gk-winline--top" x1="${winA[0]}" y1="${winA[1]}" x2="${winB[0]}" y2="${winB[1]}"></line>`;
      }

      // 键盘光标：只有用键盘操作时才显示，鼠标点完不会留一个方框在棋子上
      if (boardFocused && keyboardMode && mode === 'human' && board) {
        const x = cursor.c + 0.5;
        const y = cursor.r + 0.5;
        out += `<rect class="gk-cursor" x="${x - 0.4}" y="${y - 0.4}" width="0.8" height="0.8" rx="0"></rect>`;
      }
      return out;
    }

    function renderBoard() {
      if (!els.svg) return;
      els.svg.innerHTML = boardMarkup();
      const turnText = game
        ? game.over
          ? (game.winner ? `${sideName(game, game.winner)} 获胜` : '和棋')
          : `${sideName(game, game.turn)}（${stoneName(game.turn)}）落子`
        : '准备中';
      els.svg.setAttribute('aria-label', `五子棋棋盘，15 乘 15，${game?.moves?.length || 0} 手，${turnText}`);
    }

    /* ---------------- 玩家卡 / 能力 ---------------- */
    function renderPlayers() {
      for (const side of [BLACK, WHITE]) {
        const info = game?.sides?.[side];
        const bot = info?.bot ? botById(info.bot) : null;
        const el = sideEls[side];
        const name = !info ? '—' : info.human ? '你' : (bot?.name || '—');
        el.name.textContent = name;
        el.kind.textContent = !info ? '—'
          : info.human ? `HUMAN · 执${stoneName(side)}`
            : `${bot.en} · LV.${bot.level}${bot.cheat && game.allowCheat ? ' · 破规则' : ''}`;
        el.str.innerHTML = strengthHTML(info?.human ? null : bot);
        el.card.classList.toggle('is-human', !!info?.human);
        const cheat = !!(game && bot?.cheat && game.allowCheat);
        el.card.classList.toggle('is-cheat', cheat);
        const active = !!game && !game.over && game.turn === side && (mode !== 'bots' || started);
        el.card.classList.toggle('is-turn', active);
        el.card.classList.toggle('is-thinking', active && busy);
        el.turn.hidden = !active;

        el.abs.hidden = !cheat;
        if (cheat) {
          if (!el.abs.dataset.built) el.abs.innerHTML = abilityRowHTML(side);
          el.abs.dataset.built = '1';
          const left = game.abilities[side] || {};
          for (const ab of ABILITIES) {
            const btn = el.abs.querySelector(`[data-ab="${ab.id}"]`);
            if (!btn) continue;
            const n = left[ab.id] || 0;
            btn.classList.toggle('is-used', n <= 0);
            btn.querySelector('.gk-ab__pip').textContent = n > 0 ? String(n) : '×';
            btn.title = n > 0 ? `${ab.name}：${ab.desc}（本局还剩 ${n} 次）` : `${ab.name}：本局已经用掉了`;
          }
        }
      }
    }

    /* ---------------- 台词 ---------------- */
    function pickQuote(bot) {
      const list = bot?.quotes || [];
      if (!list.length) return '';
      if (list.length === 1) return list[0];
      let i = Math.floor(Math.random() * list.length);
      // 同一只 bot 别连着说同一句；只有两句时也能换到另一句
      if (list[i] === lastQuoteOf.get(bot.id)) i = (i + 1) % list.length;
      lastQuoteOf.set(bot.id, list[i]);
      return list[i];
    }

    /** 某一方落子后，如果是 bot，就挑一句台词记下来（人类不说话） */
    function sayAfter(side, move) {
      const info = game?.sides?.[side];
      const bot = info?.bot ? botById(info.bot) : null;
      if (!bot || !move) return;
      const text = pickQuote(bot);
      if (!text) return;
      quotesBySeq.set(move.seq, text);
      lastSay = { player: side, name: bot.name, glyph: bot.glyph, tone: bot.tone, text, seq: move.seq };
    }

    function renderSay() {
      if (!els.say) return;
      if (!lastSay) { els.say.hidden = true; return; }
      els.say.hidden = false;
      els.say.dataset.tone = lastSay.tone;
      els.sayGlyph.textContent = lastSay.glyph;
      els.sayName.textContent = lastSay.name;
      els.sayText.textContent = `“${lastSay.text}”`;
    }

    /* ---------------- 棋谱 ---------------- */
    function renderLog() {
      if (!els.log) return;
      const entries = [];
      if (game) {
        game.moves.forEach((m, k) => {
          entries.push({ seq: m.seq, type: 'move', player: m.player, idx: m.idx, ply: k + 1 });
          const said = quotesBySeq.get(m.seq);
          if (said) entries.push({ seq: m.seq + 0.5, type: 'say', player: m.player, text: said });
        });
        for (const e of game.abilityLog) entries.push(e);
      }
      entries.sort((a, b) => a.seq - b.seq);
      if (!entries.length) {
        els.log.innerHTML = '<li class="gk-log__empty faint mono">还没有落子</li>';
        if (els.logCount) els.logCount.textContent = '0 手';
        return;
      }
      const stick = !els.logBody
        || els.logBody.scrollTop + els.logBody.clientHeight >= els.logBody.scrollHeight - 40;
      els.log.innerHTML = entries.map((e) => {
        const name = game ? sideName(game, e.player) : '—';
        if (e.type === 'say') {
          return `<li class="gk-log__i is-say" data-side="${e.player}">
            <span class="gk-log__no is-ab">“</span>
            <span class="gk-log__stone gk-stone--${e.player === BLACK ? 'black' : 'white'}" aria-label="${stoneName(e.player)}"></span>
            <span class="gk-log__say"><b>${esc(name)}</b>${esc(e.text)}</span>
          </li>`;
        }
        const cheat = e.type !== 'move';
        const text = cheat ? `破规则 · ${abilityText(e)}` : `落子 ${coordName(e.idx)}`;
        // 棋谱的编号只数「手」，破规则事件用能力字形占位 —— 否则
        // 标题写着 19 手、行号却排到 22，读起来像多下了三手。
        return `<li class="gk-log__i${cheat ? ' is-cheat' : ''}" data-side="${e.player}"
            ${e.reason ? `title="${esc(e.reason)}"` : ''}>
          <span class="gk-log__no mono${cheat ? ' is-ab' : ''}">${cheat ? esc(ABILITY_BY_ID[e.type]?.glyph || '◆') : String(e.ply).padStart(3, '0')}</span>
          <span class="gk-log__stone gk-stone--${e.player === BLACK ? 'black' : 'white'}" aria-label="${stoneName(e.player)}"></span>
          <b class="gk-log__name">${esc(name)}</b>
          <span class="gk-log__text">${esc(text)}</span>
        </li>`;
      }).join('');
      if (els.logCount) els.logCount.textContent = `${game.moves.length} 手`;
      if (stick && els.logBody) els.logBody.scrollTop = els.logBody.scrollHeight;
    }

    /* ---------------- 战绩 ---------------- */
    function renderRecords() {
      if (!els.records) return;
      if (mode === 'human') {
        const rec = loadRecord();
        if (els.recTitle) els.recTitle.textContent = '人机战绩';
        if (els.recNote) els.recNote.textContent = '只存在当前浏览器。点一行可以直接换对手。';
        els.records.innerHTML = BOTS.map((b) => {
          const r = rec[b.id] || { win: 0, loss: 0, draw: 0 };
          const total = r.win + r.loss + r.draw;
          return `<button class="gk-rec${b.id === botId ? ' is-on' : ''}" type="button"
              data-rec-bot="${b.id}" title="挑战 ${esc(b.name)}">
            <span class="gk-rec__name">${esc(b.name)}</span>
            <span class="gk-rec__nums mono"><b>${r.win}</b>胜 <b>${r.loss}</b>负${r.draw ? ` <b>${r.draw}</b>和` : ''}</span>
            <span class="gk-rec__total mono faint">${total ? `${total} 局` : '未交手'}</span>
          </button>`;
        }).join('');
        $$('[data-roster-record]').forEach((el) => {
          const r = rec[el.dataset.rosterRecord] || { win: 0, loss: 0, draw: 0 };
          el.textContent = r.win + r.loss + r.draw ? `${r.win} 胜 / ${r.loss} 负` : '还没交过手';
        });
      } else {
        const bId = game?.sides?.[BLACK]?.bot || blackId;
        const wId = game?.sides?.[WHITE]?.bot || whiteId;
        const s = seriesFor(bId, wId);
        if (els.recTitle) els.recTitle.textContent = '观战比分';
        if (els.recNote) els.recNote.textContent = `当前对局：${botById(bId)?.name || '—'}（黑） vs ${botById(wId)?.name || '—'}（白）。只存在当前浏览器。`;
        const total = s.black + s.white + s.draw;
        els.records.innerHTML = `
          <div class="gk-series">
            <div class="gk-series__side"><span class="gk-series__stone gk-stone--black"></span>${esc(botById(bId)?.name || '—')}</div>
            <div class="gk-series__score mono"><b>${s.black}</b><span>:</span><b>${s.white}</b></div>
            <div class="gk-series__side gk-series__side--right">${esc(botById(wId)?.name || '—')}<span class="gk-series__stone gk-stone--white"></span></div>
          </div>
          <div class="gk-series__foot mono faint">${total} 局${s.draw ? ` · ${s.draw} 和` : ''}${bId === wId ? ' · 同名对局' : ''}</div>`;
        $$('[data-roster-record]').forEach((el) => { el.textContent = '观战中'; });
      }
    }

    /* ---------------- 状态 / 控件 ---------------- */
    function renderStatus() {
      const moves = game?.moves.length || 0;
      const over = !!game?.over;
      const phase = !game ? 'READY'
        : over ? (game.winner ? 'WIN' : 'DRAW')
          : (mode === 'bots' && !started) ? 'READY'
            : (mode === 'bots' && paused) ? 'PAUSED'
              : busy ? 'THINK'
                : moves ? 'PLAY' : 'READY';
      if (els.metaMode) els.metaMode.textContent = mode === 'bots' ? '观战' : '人机';
      if (els.metaMoves) els.metaMoves.textContent = pad3(moves);
      if (els.metaState) els.metaState.textContent = phase;

      if (els.turn) {
        let main = '准备中';
        let sub = '';
        let dot = '';
        if (game) {
          if (over) {
            main = game.winner ? `${sideName(game, game.winner)} 拿下本局` : '和棋';
            sub = `${moves} 手`;
            dot = game.winner ? 'is-on' : '';
          } else if (busy) {
            main = `${sideName(game, game.turn)} 正在思考`;
            sub = `第 ${moves + 1} 手 · ${stoneName(game.turn)}`;
            dot = 'is-think';
          } else if (mode === 'bots') {
            if (!started) {
              main = '等待开始';
              sub = `${sideName(game, BLACK)} vs ${sideName(game, WHITE)}`;
            } else if (paused) {
              main = '已暂停';
              sub = '单步或继续';
            } else {
              main = `观战中 · ${sideName(game, game.turn)}`;
              sub = `第 ${moves + 1} 手 · ${stoneName(game.turn)}`;
              dot = 'is-on';
            }
          } else {
            const yourTurn = game.turn === humanSide;
            main = yourTurn ? '轮到你落子' : `${sideName(game, game.turn)} 准备中`;
            sub = yourTurn ? `${stoneName(humanSide)}子 · 第 ${moves + 1} 手` : '请稍候';
            dot = yourTurn ? 'is-on' : '';
          }
        }
        els.turn.innerHTML = `<span class="gk-turn__dot ${dot}"></span><b>${esc(main)}</b><span class="mono">${esc(sub)}</span>`;
      }

      if (els.hint) {
        if (!game) els.hint.textContent = '—';
        else if (mode === 'bots') {
          els.hint.textContent = `${speed}× · ${!started ? '待开始' : autoNext ? '自动连战' : '打完暂停'}`;
        } else {
          els.hint.textContent = `悔棋剩 ${undosLeft} 次 · 破规则 ${allowCheat ? '开' : '关'}`;
        }
      }

      if (els.start) {
        els.start.hidden = !(mode === 'bots' && !!game && !game.over && !started);
      }
      if (els.pause) els.pause.textContent = started && paused ? '继续' : '暂停';
      if (els.pause) els.pause.disabled = !game || game.over || mode !== 'bots' || !started;
      if (els.step) els.step.disabled = !game || game.over || mode !== 'bots' || !started || busy || !paused;
      if (els.undo) {
        const hasHumanMove = !!game && game.moves.some((m) => m.player === humanSide);
        els.undo.disabled = !game || game.over || mode !== 'human' || undosLeft <= 0 || busy || !hasHumanMove;
        if (els.undoLeft) els.undoLeft.textContent = String(undosLeft);
      }
      for (const side of [BLACK, WHITE]) {
        const active = !!game && !game.over && game.turn === side && (mode !== 'bots' || started);
        sideEls[side].turn.hidden = !active;
      }
    }

    function syncControls() {
      if (els.section) els.section.dataset.mode = mode;
      $$('[data-mode-btn]').forEach((b) => {
        const on = b.dataset.modeBtn === mode;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-selected', String(on));
      });
      $$('[data-human-side]').forEach((b) => {
        b.classList.toggle('is-on', Number(b.dataset.humanSide) === humanSide);
        b.setAttribute('aria-pressed', String(Number(b.dataset.humanSide) === humanSide));
      });
      if (els.bot) els.bot.value = botId;
      if (els.black) els.black.value = blackId;
      if (els.white) els.white.value = whiteId;
      if (els.speed) els.speed.value = String(speed);
      if (els.cheat) els.cheat.checked = allowCheat;
      if (els.auto) els.auto.checked = autoNext;
    }

    function renderAll() {
      renderBoard();
      renderPlayers();
      renderSay();
      renderLog();
      renderStatus();
      renderRecords();
    }

    /* ---------------- 结果 ---------------- */
    function hideResult() {
      if (els.result) els.result.hidden = true;
    }

    function finishGame() {
      if (!game || !game.over || settled) return;
      settled = true;
      const moves = game.moves.length;
      const secs = Math.max(1, Math.round((Date.now() - game.startedAt) / 1000));
      if (mode === 'human') {
        const oppSide = humanSide === BLACK ? WHITE : BLACK;
        const oppId = game.sides[oppSide].bot;
        const won = game.winner === humanSide;
        const draw = game.winner === 0;
        const result = draw ? 'draw' : won ? 'win' : 'loss';
        if (oppId) recordResult(oppId, result);
        const oppName = botById(oppId)?.name || '对手';
        if (els.result) {
          els.result.hidden = false;
          els.result.classList.toggle('is-win', won);
          els.result.classList.toggle('is-loss', !won && !draw);
          if (els.resultTag) els.resultTag.textContent = won ? 'YOU WIN' : draw ? 'DRAW' : 'YOU LOSE';
          if (els.resultTitle) els.resultTitle.textContent = won ? '你赢了' : draw ? '和棋' : '你输了';
          const cheats = game.abilityLog.filter((e) => e.player === oppSide).length;
          if (els.resultSub) {
            els.resultSub.textContent = draw
              ? `棋盘下满，${moves} 手 · 用时 ${fmtClock(secs * 1000)}`
              : `${won ? '击败' : '不敌'} ${oppName} · ${moves} 手 · 用时 ${fmtClock(secs * 1000)}${cheats ? ` · 它掀了 ${cheats} 次桌` : ''}`;
          }
        }
        if (won) Toast.ok(`赢了 ${oppName}！`);
        else if (draw) Toast.show('棋盘下满，和棋');
        else Toast.show(`输给了 ${oppName} · 再来一局？`);
      } else {
        const w = game.winner;
        const series = recordSeries(game.sides[BLACK].bot || blackId, game.sides[WHITE].bot || whiteId, w);
        if (els.result) {
          els.result.hidden = false;
          els.result.classList.toggle('is-win', !!w);
          els.result.classList.toggle('is-loss', false);
          if (els.resultTag) els.resultTag.textContent = 'MATCH';
          if (els.resultTitle) {
            els.resultTitle.textContent = w ? `${sideName(game, w)} 胜` : '和棋';
          }
          if (els.resultSub) {
            els.resultSub.textContent = `${sideName(game, BLACK)} ${series.black} : ${series.white} ${sideName(game, WHITE)} · 本局 ${moves} 手`;
          }
        }
        if (autoNext) {
          const s = session;
          schedule(() => {
            if (alive(s) && game?.over) newMatch({ autoStart: true });
          }, 2800);
        }
      }
      renderStatus();
      renderRecords();
    }

    /* ---------------- 破规则演出 ---------------- */
    function showBreak(type, reason) {
      const ab = ABILITY_BY_ID[type];
      if (!els.break) return;
      els.breakName.textContent = ab?.name || type;
      els.breakDesc.textContent = reason || ab?.desc || '';
      els.break.hidden = false;
      els.break.classList.remove('is-on');
      void els.break.offsetWidth;
      els.break.classList.add('is-on');
      els.board?.classList.add('is-breaking');
    }

    function hideBreak() {
      if (els.break) { els.break.hidden = true; els.break.classList.remove('is-on'); }
      els.board?.classList.remove('is-breaking');
    }

    async function announceBreak(type, reason, s) {
      showBreak(type, reason);
      await wait(Math.round(1500 / speed));
      if (!alive(s)) return;
      hideBreak();
    }

    /* ---------------- 落子 ---------------- */
    async function doPlace(side, idx, passTurn, s) {
      if (!alive(s) || !game || game.over) return false;
      if (!canPlay(game, idx, side)) return false;
      const res = place(game, idx, side, { passTurn });
      if (!res.ok) { Toast.err(res.error); return false; }
      newStone = idx;
      hover = -1;
      sayAfter(side, res.move);
      renderAll();
      const ns = idx;
      setTimeout(() => { if (newStone === ns) newStone = -1; }, 520);
      if (res.win || res.draw) { finishGame(); return true; }
      await wait(delayFor());
      return false;
    }

    /* ---------------- AI 回合 ---------------- */
    async function useAbility(type, side, plan, s) {
      const idx = plan[type];
      if (idx === null || idx === undefined) return;
      if (type === 'steal') {
        const stone = els.svg?.querySelector(`.gk-stone[data-idx="${idx}"]`);
        stone?.classList.add('is-stealing');
        await wait(Math.round(430 / speed));
        if (!alive(s) || !game || game.over) return;
        const res = applySteal(game, side, idx, plan.reasons?.steal || '');
        if (!res.ok) { Toast.show(res.error); return; }
        newStone = -1;
        renderAll();
        await announceBreak('steal', plan.reasons?.steal || ABILITY_BY_ID.steal.desc, s);
      } else if (type === 'seal') {
        const res = applySeal(game, side, idx, plan.reasons?.seal || '');
        if (!res.ok) { Toast.show(res.error); return; }
        newStone = -1;
        renderAll();
        await announceBreak('seal', plan.reasons?.seal || ABILITY_BY_ID.seal.desc, s);
      }
    }

    async function takeTurn(side, s) {
      if (!alive(s) || !game || game.over || game.turn !== side || busy) return;
      busy = true;
      renderStatus();
      renderPlayers();
      try {
        const plan = planAbilities(game, side);
        if (!alive(s)) return;

        if (plan.steal !== null) {
          await useAbility('steal', side, plan, s);
          if (!alive(s) || !game || game.over) return;
        }
        if (plan.seal !== null) {
          await useAbility('seal', side, plan, s);
          if (!alive(s) || !game || game.over) return;
        }
        if (!alive(s)) return;

        const dbl = plan.double && Array.isArray(plan.doubleMoves) && plan.doubleMoves.length === 2
          && (game.abilities[side]?.double > 0)
          && plan.doubleMoves.every((i) => canPlay(game, i, side));

        if (dbl) {
          const applied = applyDouble(game, side, plan.reasons?.double || '');
          if (!applied.ok) { Toast.show(applied.error); }
          else {
            renderPlayers();
            await announceBreak('double', plan.reasons?.double || ABILITY_BY_ID.double.desc, s);
            if (!alive(s) || !game || game.over) return;
            for (let k = 0; k < plan.doubleMoves.length; k++) {
              if (!alive(s) || !game || game.over) return;
              const ended = await doPlace(side, plan.doubleMoves[k], k === plan.doubleMoves.length - 1, s);
              if (ended) return;
              if (k < plan.doubleMoves.length - 1) await wait(Math.round(260 / speed));
            }
            return;
          }
        }

        const idx = chooseMove(game, side, { budget: budgetFor(side) });
        if (idx < 0) return;
        await doPlace(side, idx, true, s);
      } finally {
        if (alive(s) && game) {
          busy = false;
          renderAll();
          if (game.over) finishGame();
        }
      }
    }

    /* ---------------- 观战循环 ---------------- */
    async function spectateLoop(s) {
      while (alive(s) && game && !game.over) {
        if (paused) { await wait(200); continue; }
        if (busy) { await wait(80); continue; }
        const side = game.turn;
        await takeTurn(side, s);
        if (!alive(s) || !game || game.over) break;
        await wait(delayFor());
      }
      if (alive(s) && game?.over) finishGame();
    }

    /* ---------------- 对局开局 ---------------- */
    function newMatch({ autoStart = false } = {}) {
      session++;
      timers.forEach(clearTimeout);
      timers.clear();
      busy = false;
      started = false;
      settled = false;
      newStone = -1;
      hover = -1;
      undosLeft = MAX_UNDO;
      lastSay = null;
      quotesBySeq.clear();
      hideResult();
      hideBreak();
      cursor = { r: 7, c: 7 };

      if (mode === 'human') {
        const humanBlack = humanSide === BLACK;
        game = createGame({
          blackBot: humanBlack ? null : botId,
          whiteBot: humanBlack ? botId : null,
          humanSide,
          allowCheat,
        });
        paused = true;
      } else {
        game = createGame({
          blackBot: blackId,
          whiteBot: whiteId,
          humanSide: 0,
          allowCheat: true,
        });
        // 进观战页 / 换 bot 时先停在「等待开始」；点开始才跑
        started = !!autoStart;
        paused = !autoStart;
      }
      saveSetup();
      syncControls();
      renderAll();
      const s = session;
      if (mode === 'bots') {
        if (started) void spectateLoop(s);
      } else if (game.turn !== humanSide) {
        scheduleBot(s);
      }
    }

    /** 观战「开始」：只在等待状态可用 */
    function startSpectate() {
      if (mode !== 'bots' || !game || game.over || started) return;
      started = true;
      paused = false;
      renderAll();
      void spectateLoop(session);
    }

    function scheduleBot(s) {
      if (!alive(s) || !game || game.over) return;
      if (mode !== 'human' || game.turn === humanSide) return;
      const mine = s;
      schedule(() => {
        if (!alive(mine) || !game || game.over) return;
        void takeTurn(game.turn, mine);
      }, Math.round(520 / speed));
    }

    /* ---------------- 人类操作 ---------------- */
    const idxFromEvent = (e) => {
      if (!game || !els.svg) return -1;
      const rect = els.svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return -1;
      const x = ((e.clientX - rect.left) / rect.width) * game.size;
      const y = ((e.clientY - rect.top) / rect.height) * game.size;
      const c = Math.min(game.size - 1, Math.max(0, Math.floor(x)));
      const r = Math.min(game.size - 1, Math.max(0, Math.floor(y)));
      return r * game.size + c;
    };

    async function humanMove(idx) {
      if (!game || game.over || busy) return;
      if (game.turn !== humanSide) { Toast.show('还没轮到你'); return; }
      if (!canPlay(game, idx, humanSide)) {
        if (game.sealed[idx]) {
          const seal = els.svg?.querySelector(`.gk-seal[data-idx="${idx}"]`);
          seal?.classList.add('is-nope');
          setTimeout(() => seal?.classList.remove('is-nope'), 420);
          Toast.show('这个点被封住了');
        }
        return;
      }
      busy = true;
      renderStatus();
      const s = session;
      const ended = await doPlace(humanSide, idx, true, s);
      if (!alive(s)) return;
      busy = false;
      renderAll();
      if (ended) return;
      scheduleBot(s);
    }

    function doUndo() {
      if (mode !== 'human' || !game || game.over) return;
      if (undosLeft <= 0) { Toast.show('悔棋次数用完了'); return; }
      if (busy) { Toast.show('等这一步落完'); return; }
      const atHuman = undoToHuman(game, humanSide);
      if (!atHuman.ok) { Toast.show(atHuman.error); return; }
      session++;
      timers.forEach(clearTimeout);
      timers.clear();
      undosLeft--;
      settled = false;
      busy = false;
      newStone = -1;
      lastSay = null;
      hideResult();
      hideBreak();
      renderAll();
      Toast.ok(`悔棋 · 还剩 ${undosLeft} 次`);
    }

    /* ---------------- 控件事件 ---------------- */
    const onRootClick = (e) => {
      const modeBtn = e.target.closest('[data-mode-btn]');
      if (modeBtn) {
        const next = modeBtn.dataset.modeBtn;
        if (next !== mode) { mode = next; saveSetup(); syncControls(); newMatch(); }
        return;
      }
      const sideBtn = e.target.closest('[data-human-side]');
      if (sideBtn) {
        const next = Number(sideBtn.dataset.humanSide);
        if (next !== humanSide) { humanSide = next; saveSetup(); syncControls(); newMatch(); }
        return;
      }
      const challenge = e.target.closest('[data-challenge]') || e.target.closest('[data-rec-bot]');
      if (challenge) {
        const id = challenge.dataset.challenge || challenge.dataset.recBot;
        if (botById(id)) {
          mode = 'human';
          botId = id;
          saveSetup();
          syncControls();
          newMatch();
          Toast.show(`新的一局：你 vs ${botById(id).name}`);
        }
        return;
      }
      if (e.target.closest('#gkStart')) { startSpectate(); return; }
      if (e.target.closest('#gkNew')) { newMatch(); return; }
      if (e.target.closest('#gkAgain') || e.target.closest('#gkNext')) {
        // 「再来一局 / 下一局」是明确要继续看：观战直接开，人机直接开新局
        newMatch({ autoStart: mode === 'bots' });
        return;
      }
      if (e.target.closest('#gkUndo')) { doUndo(); return; }
      if (e.target.closest('#gkPause')) { togglePause(); return; }
      if (e.target.closest('#gkStep')) { stepOnce(); return; }
      if (e.target.closest('#gkResetRec')) {
        if (mode === 'human') {
          if (!confirm('清空人机战绩？')) return;
          resetRecord();
          Toast.show('人机战绩已清空');
        } else {
          if (!confirm('清空观战比分？')) return;
          resetSeries();
          Toast.show('观战比分已清空');
        }
        renderRecords();
        return;
      }
      const ab = e.target.closest('.gk-ab');
      if (ab) {
        const meta = ABILITY_BY_ID[ab.dataset.ab];
        if (meta) Toast.show(`${meta.name}：${meta.desc}`, '', { ttl: 5200 });
      }
    };

    function togglePause() {
      if (mode !== 'bots' || !game || game.over || !started) return;
      paused = !paused;
      renderStatus();
    }

    function stepOnce() {
      if (mode !== 'bots' || !game || game.over || !started || busy) return;
      paused = true;
      renderStatus();
      const s = session;
      void takeTurn(game.turn, s);
    }

    const onRootChange = (e) => {
      if (e.target === els.bot) {
        botId = els.bot.value; saveSetup(); newMatch(); return;
      }
      if (e.target === els.black) {
        blackId = els.black.value; saveSetup(); newMatch(); return;
      }
      if (e.target === els.white) {
        whiteId = els.white.value; saveSetup(); newMatch(); return;
      }
      if (e.target === els.speed) {
        speed = Number(els.speed.value) || 1; saveSetup(); renderStatus(); return;
      }
      if (e.target === els.cheat) {
        allowCheat = !!els.cheat.checked; saveSetup(); newMatch(); return;
      }
      if (e.target === els.auto) {
        autoNext = !!els.auto.checked; saveSetup(); renderStatus(); return;
      }
    };

    /* ---------------- 棋盘指针 / 键盘 ---------------- */
    const onBoardClick = (e) => {
      if (!game || mode !== 'human' || game.over || busy) return;
      const idx = idxFromEvent(e);
      if (idx < 0) return;
      keyboardMode = false;
      cursor = { r: (idx / game.size) | 0, c: idx % game.size };
      els.svg?.focus({ preventScroll: true });
      void humanMove(idx);
    };

    const onBoardMove = (e) => {
      if (!game || mode !== 'human' || game.over || busy) return;
      if (game.turn !== humanSide) return;
      const idx = idxFromEvent(e);
      if (idx === hover) return;
      if (keyboardMode) keyboardMode = false;
      hover = idx;
      renderBoard();
    };

    const onBoardLeave = () => {
      if (hover === -1) return;
      hover = -1;
      renderBoard();
    };

    const onBoardKey = (e) => {
      if (!game) return;
      const size = game.size;
      keyboardMode = true;
      let handled = true;
      if (e.key === 'ArrowUp') cursor = { r: Math.max(0, cursor.r - 1), c: cursor.c };
      else if (e.key === 'ArrowDown') cursor = { r: Math.min(size - 1, cursor.r + 1), c: cursor.c };
      else if (e.key === 'ArrowLeft') cursor = { r: cursor.r, c: Math.max(0, cursor.c - 1) };
      else if (e.key === 'ArrowRight') cursor = { r: cursor.r, c: Math.min(size - 1, cursor.c + 1) };
      else if (e.key === ' ' || e.key === 'Enter') {
        if (mode === 'human' && game.turn === humanSide && !busy) void humanMove(cursor.r * size + cursor.c);
      } else if (e.key === 'u' || e.key === 'U') {
        doUndo();
      } else if (e.key === 'r' || e.key === 'R') {
        newMatch();
      } else handled = false;
      if (handled) {
        e.preventDefault();
        hover = cursor.r * size + cursor.c;
        renderBoard();
      }
    };

    const onFocus = () => { boardFocused = true; renderBoard(); };
    const onBlur = () => { boardFocused = false; renderBoard(); };

    els.svg?.addEventListener('click', onBoardClick);
    els.svg?.addEventListener('pointermove', onBoardMove);
    els.svg?.addEventListener('pointerleave', onBoardLeave);
    els.svg?.addEventListener('keydown', onBoardKey);
    els.svg?.addEventListener('focus', onFocus);
    els.svg?.addEventListener('blur', onBlur);
    root.addEventListener('click', onRootClick);
    root.addEventListener('change', onRootChange);

    /* ---------------- 启动 ---------------- */
    syncControls();
    newMatch();

    /* 同一板块内从命令面板带参数进来：?mode=bots 已由 render 处理，这里只需要清掉
       地址上的参数不是必须的 —— 留着也只会影响首次进入模式。 */

    return () => {
      session++;
      busy = false;
      timers.forEach(clearTimeout);
      timers.clear();
      root.removeEventListener('click', onRootClick);
      root.removeEventListener('change', onRootChange);
      els.svg?.removeEventListener('click', onBoardClick);
      els.svg?.removeEventListener('pointermove', onBoardMove);
      els.svg?.removeEventListener('pointerleave', onBoardLeave);
      els.svg?.removeEventListener('keydown', onBoardKey);
      els.svg?.removeEventListener('focus', onFocus);
      els.svg?.removeEventListener('blur', onBlur);
      if (window.Terminal?.Gomoku === gomokuApi) delete window.Terminal.Gomoku;
    };
  },
};
