/**
 * views/uno.js — UNO 视图（板块 / MINES → UNO 页签）
 * ------------------------------------------------------------------
 * 规则在 plugins/uno.js，这里只管画面与交互。风格与扫雷一致：
 * 纸色底 + 墨色 2px 描边 + 信号黄强调 + 等宽小标签。
 *
 * 交互一览：
 *   点手牌      如果压得上就出（变色牌会先弹颜色选择）
 *   点牌堆      摸一张（摸完自动轮到下家）
 *   键  N       新开一局；U 摸牌；1–4 选颜色（变色时）；Esc 关掉颜色选择
 *   联机        本文件已按 `viewFor(state, seat)` 的接口拿数据，
 *               下一步接房间时把本地 state 换成"服务端下发的视图"即可（见文件末注释）
 */

import { esc } from '../util/dom.js';
import { Toast } from '../ui/toast.js';
import { viewhead } from '../ui/bits.js';
import {
  COLORS, COLOR_CN, FACE, createGame, applyMove, botMove, isPlayable,
  topCard, label, serializeGame, deserializeGame,
} from '../plugins/uno.js';

const SAVE_KEY = 'ft.terminal.unoGame';
const BOT_DELAY = 620;   // 机器人思考一下再走，太快看不清

/** 自检用的句柄（与扫雷的 MinesLive 同思路） */
export const UnoLive = {
  get state() { return live ? live.state : null; },
  get ready() { return !!live; },
  /** 直接把当前局的 state 换掉（自检用） */
  setState(s) { if (live) { live.state = s; paint(); } },
  play(seat, cardId, color) { return move({ type: 'play', seat, cardId, color }); },
  draw(seat) { return move({ type: 'draw', seat }); },
  newGame(n = 3) { start(n); },
  bots() { return live ? live.state.players.filter((p) => p.bot).length : 0; },
};

let live = null;      // 当前这一局的运行时句柄
let handoff = null;   // 会话内交接：切板块时留在内存里，切回来接着打

const glyph = (c) => (c.kind === 'num' ? String(c.value) : FACE[c.kind]);
const colorVar = (c) => (c ? `var(--uno-${c})` : 'var(--ink-100)');

/* ---------------- 片段 ---------------- */

function cardHTML(card, { playable = false, mini = false } = {}) {
  const cls = ['uno__card', mini ? 'uno__card--mini' : '', playable ? 'is-playable' : '', card.color ? '' : 'is-wild'].filter(Boolean).join(' ');
  const face = glyph(card);
  return `<button class="${cls}" data-card="${esc(card.id)}" style="--uno-c:${colorVar(card.color)}"${playable ? '' : ' disabled'} aria-label="${esc(label(card))}">
    <b>${esc(face)}</b><i>${esc(card.color ? COLOR_CN[card.color] : '变色')}</i>
  </button>`;
}

function seatHTML(p, i, state, me) {
  const isTurn = state.turn === i && !state.winner;
  const isMe = i === me;
  return `<div class="uno__seat ${isTurn ? 'is-turn' : ''} ${isMe ? 'is-me' : ''}" data-seat="${i}">
    <span class="uno__seat-name mono">${esc(p.name)}${p.bot ? ' · AI' : ''}</span>
    <span class="uno__seat-count"><b>${(state.hands[i] || []).length}</b> 张</span>
    ${isTurn ? '<span class="uno__seat-tag mono">TURN</span>' : ''}
  </div>`;
}

function boardHTML() {
  const s = live.state;
  const me = live.me;
  const v = { playable: s.turn === me && !s.winner ? s.hands[me].filter((c) => isPlayable(s, c)).map((c) => c.id) : [] };
  const top = topCard(s);
  return `
    <div class="uno">
      <div class="uno__head">
        <div class="uno__status mono">
          <span>颜色 <b class="uno__dot" style="--uno-c:${colorVar(s.color)}"></b>${esc(COLOR_CN[s.color] || '—')}</span>
          <span>方向 ${s.dir > 0 ? '↻' : '↺'}</span>
          <span>牌堆 ${s.deck.length}</span>
        </div>
        <div class="uno__newbtns">
          <button class="btn btn--sm" data-new="2">2 人</button>
          <button class="btn btn--sm btn--signal" data-new="3">3 人</button>
          <button class="btn btn--sm" data-new="4">4 人</button>
        </div>
      </div>

      <div class="uno__seats">
        ${s.players.map((p, i) => (i === me ? '' : seatHTML(p, i, s, me))).join('')}
      </div>

      <div class="uno__table">
        <button class="uno__pile" id="unoDraw" aria-label="摸一张">
          <span class="uno__pile-back mono">+1</span>
          <i class="mono">摸牌</i>
        </button>
        <div class="uno__discard">
          ${top ? cardHTML(top, { mini: true }) : ''}
          <i class="mono">牌面</i>
        </div>
      </div>

      ${s.winner !== null ? `<div class="uno__over mono">${s.winner === me ? '你赢了' : `${esc(s.players[s.winner].name)} 赢了`} —— 点人数按钮再来一局</div>` : ''}

      <div class="uno__mine">
        <div class="uno__mine-label mono">你的手牌（${s.hands[me].length}）${s.turn === me && !s.winner ? ' · 轮到你了' : ''}</div>
        <div class="uno__hand">
          ${s.hands[me].map((c) => cardHTML(c, { playable: v.playable.includes(c.id) })).join('')}
        </div>
      </div>

      <div class="uno__log mono">
        ${s.log.slice(-6).map((l) => `<div>· ${esc(l)}</div>`).join('')}
      </div>
      <p class="uno__note">不叠 +2/+4；摸到能出的牌也轮下家（简化规则）。两人局里反转视同跳过。</p>
    </div>`;
}

/* ---------------- 逻辑 ---------------- */

function start(n = 3) {
  const players = [{ id: 'me', name: '你' }];
  const names = ['阿岚', '小満', '鱼丸', '青柠'];
  for (let i = 1; i < n; i++) players.push({ id: `bot${i}`, name: names[(i - 1) % names.length], bot: true });
  live = { state: createGame(players), me: 0, timer: null };
  paint();
  scheduleBot();
}

function move(m) {
  if (!live) return { error: '还没开局' };
  const res = applyMove(live.state, m);
  if (res.error) { Toast.show(res.error, 'err'); return res; }
  live.state = res.state;
  try { localStorage.setItem(SAVE_KEY, serializeGame(live.state)); } catch { /* 隐私模式下写不了，忽略 */ }
  for (const ev of res.events) {
    if (ev.type === 'win') Toast.ok(ev.seat === live.me ? '你赢了！' : `${live.state.players[ev.seat].name} 赢了`);
    if (ev.type === 'penalty' && ev.seat === live.me) Toast.show(`被罚摸 ${ev.n} 张`, '', { ttl: 3500 });
  }
  paint();
  scheduleBot();
  return res;
}

/** 机器人按顺序自动走（每步之间留点"思考"时间，观感更像在打牌） */
function scheduleBot() {
  if (!live) return;
  clearTimeout(live.timer);
  const s = live.state;
  if (s.winner !== null) return;
  if (!s.players[s.turn]?.bot) return;
  live.timer = setTimeout(() => {
    if (!live || live.state.winner !== null) return;
    if (!live.state.players[live.state.turn]?.bot) return;
    move(botMove(live.state));
  }, BOT_DELAY);
}

/** 变色牌：弹出选择（键盘 1–4；Esc 取消） */
function askColor(cardId) {
  const wrap = document.createElement('div');
  wrap.className = 'uno__ask';
  wrap.innerHTML = `<div class="uno__ask-box" role="dialog" aria-modal="true" aria-label="选择颜色">
    <b class="mono">指定颜色</b>
    <div class="uno__ask-row">
      ${COLORS.map((c, i) => `<button class="uno__ask-btn" data-color="${c}" style="--uno-c:var(--uno-${c})"><span></span><i class="mono">${i + 1} ${COLOR_CN[c]}</i></button>`).join('')}
    </div>
    <button class="btn btn--sm" data-cancel="1">取消</button>
  </div>`;
  const close = () => { document.removeEventListener('keydown', onKey); wrap.remove(); };
  const onKey = (e) => {
    if (e.key === 'Escape') { close(); return; }
    const n = Number(e.key);
    if (n >= 1 && n <= 4) { const c = COLORS[n - 1]; close(); move({ type: 'play', seat: live.me, cardId, color: c }); }
  };
  wrap.addEventListener('click', (e) => {
    const c = e.target.closest('[data-color]')?.dataset.color;
    if (c) { close(); move({ type: 'play', seat: live.me, cardId, color: c }); return; }
    if (e.target.closest('[data-cancel]') || e.target === wrap) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.append(wrap);
  wrap.querySelector('[data-color]')?.focus();
}

function paint() {
  const root = document.getElementById('unoRoot');
  if (!root || !live) return;
  root.innerHTML = boardHTML();
}

/* ---------------- 视图 ---------------- */

export default {
  id: 'uno',
  title: 'UNO',
  render() {
    if (handoff && !live) { live = handoff; }
    if (!live) {
      const saved = (() => { try { return deserializeGame(localStorage.getItem(SAVE_KEY)); } catch { return null; } })();
      if (saved && saved.winner === null) { live = { state: saved, me: 0, timer: null }; }
      else { start(3); }
    }
    return `${viewhead({ title: 'UNO', sub: '和扫雷同一个板块 · 单机对 AI（联机房间开发中）', idx: 'MINES / UNO' })}
      <div id="unoRoot">${live ? boardHTML() : ''}</div>`;
  },
  mount(root) {
    const rootEl = root.querySelector('#unoRoot');

    root.addEventListener('click', (e) => {
      const nb = e.target.closest('[data-new]');
      if (nb) { start(Number(nb.dataset.new)); return; }
      if (e.target.closest('#unoDraw')) {
        if (live.state.turn !== live.me) { Toast.show('还没轮到你', 'err'); return; }
        move({ type: 'draw', seat: live.me });
        return;
      }
      const cardBtn = e.target.closest('[data-card]');
      if (cardBtn && rootEl.contains(cardBtn)) {
        const id = cardBtn.dataset.card;
        const card = live.state.hands[live.me].find((c) => c.id === id);
        if (!card) return;
        if (live.state.turn !== live.me) { Toast.show('还没轮到你', 'err'); return; }
        if (card.kind === 'wild' || card.kind === 'wild4') { askColor(id); return; }
        move({ type: 'play', seat: live.me, cardId: id });
      }
    });

    const onKey = (e) => {
      if (e.target.matches('input, textarea')) return;
      if (e.key === 'n' || e.key === 'N') { start(3); return; }
      if (e.key === 'u' || e.key === 'U') { if (live.state.turn === live.me) move({ type: 'draw', seat: live.me }); }
    };
    document.addEventListener('keydown', onKey);

    // 切走时把定时器收掉、把这一局交接出去（回来接着打）
    return () => {
      document.removeEventListener('keydown', onKey);
      if (live) { clearTimeout(live.timer); live.timer = null; handoff = live; live = null; }
    };
  },
};
