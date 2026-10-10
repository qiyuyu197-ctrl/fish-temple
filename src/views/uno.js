/**
 * views/uno.js — UNO 视图（板块 / MINES → UNO 页签）
 * ------------------------------------------------------------------
 * 规则在 plugins/uno.js，这里只管画面与交互。牌桌式布局：
 *   · 场地是一块"桌垫"（纸色/墨色边框 + 细网格纹理），对手席位沿桌边摆开
 *   · 中央：弃牌堆（当前牌面）+ 摸牌堆 + 当前颜色环 + 方向指示
 *   · 底部：自己的手牌做扇形微rotation，能出的牌抬起并高亮
 *   · 剩最后一张时出现醒目的「喊 UNO」按钮；错过窗口会被引擎罚摸两张（规则在引擎里）
 *
 * 交互：点能出的牌出牌 / 变色牌弹颜色选择（1–4、Esc）/ 点摸牌堆摸一张 /
 *       点「喊 UNO」/ N 新开一局 / U 摸牌
 * 联机：本视图只通过 `viewFor(state, seat)` 的数据作画，下一步接房间时把本地 state
 *       换成服务端下发的视图即可（引擎已按这个接口准备好）。
 */

import { esc } from '../util/dom.js';
import { Toast } from '../ui/toast.js';
import { viewhead } from '../ui/bits.js';
import {
  COLORS, COLOR_CN, FACE, createGame, applyMove, botMove, isPlayable, canCallUno,
  topCard, label, serializeGame, deserializeGame,
} from '../plugins/uno.js';

const SAVE_KEY = 'ft.terminal.unoGame';
const BOT_DELAY = 620;

/** 自检句柄（与扫雷的 MinesLive 同思路） */
export const UnoLive = {
  get state() { return live ? live.state : null; },
  get ready() { return !!live; },
  setState(s) { if (live) { live.state = s; paint(); } },
  play(seat, cardId, color) { return move({ type: 'play', seat, cardId, color }); },
  draw(seat) { return move({ type: 'draw', seat }); },
  callUno(seat) { return move({ type: 'uno', seat }); },
  newGame(n = 3) { start(n); },
};

let live = null;
let handoff = null;

const glyph = (c) => (c.kind === 'num' ? String(c.value) : FACE[c.kind]);
const colorVar = (c) => (c ? `var(--uno-${c})` : 'var(--ink-100)');

/* ---------------- 片段 ---------------- */

function cardHTML(card, { playable = false, mini = false, i = null, n = 1 } = {}) {
  const cls = ['uno__card', mini ? 'uno__card--mini' : '', playable ? 'is-playable' : '', card.color ? '' : 'is-wild'].filter(Boolean).join(' ');
  // ⚠️ 所有自定义属性必须写进**同一个** style 属性：
  // 之前我在外面用 String.replace() 又插了一个 style，HTML 只保留一个 →
  // 牌色变量 --uno-c 被丢掉，手牌全变成灰的（站主截图就是这个现象）。不要再那样拼。
  const style = [`--uno-c:${colorVar(card.color)}`, i === null ? '' : `--i:${i}`, i === null ? '' : `--n:${n}`]
    .filter(Boolean).join(';');
  return `<button class="${cls}" data-card="${esc(card.id)}" style="${style}"${playable ? '' : ' disabled'} aria-label="${esc(label(card))}" title="${esc(label(card))}">
    <span class="uno__oval"><b class="uno__card-face">${esc(glyph(card))}</b></span>
    <u class="uno__pip" aria-hidden="true">${esc(glyph(card))}</u>
    <i class="uno__card-tag">${esc(card.color ? COLOR_CN[card.color] : '变色')}</i>
  </button>`;
}

/** 对手席位：沿桌边的一位玩家（含手牌张数、是否轮到、是不是欠一声 UNO） */
function seatHTML(p, i, state, me) {
  const isTurn = state.turn === i && state.winner === null;
  const owesUno = state.unoPending === i;
  const n = (state.hands[i] || []).length;
  return `<div class="uno__seat ${isTurn ? 'is-turn' : ''}" data-seat="${i}">
    <div class="uno__seat-plate">
      <span class="uno__seat-name">${esc(p.name)}${p.bot ? ' · AI' : ''}</span>
      <span class="uno__seat-count mono">${n} 张</span>
    </div>
    <div class="uno__seat-cards" aria-hidden="true">
      ${Array.from({ length: Math.min(n, 7) }).map(() => '<span class="uno__mini-back"></span>').join('')}
      ${n > 7 ? `<span class="uno__mini-more mono">+${n - 7}</span>` : ''}
    </div>
    ${isTurn ? '<span class="uno__seat-turn mono">TURN</span>' : ''}
    ${owesUno ? '<span class="uno__seat-uno mono">欠 UNO</span>' : ''}
  </div>`;
}

function boardHTML() {
  const s = live.state;
  const me = live.me;
  const mine = s.players[me];
  const others = s.players.map((p, i) => ({ p, i })).filter((x) => x.i !== me);
  const top = topCard(s);
  const myTurn = s.turn === me && s.winner === null;
  const playable = myTurn ? s.hands[me].filter((c) => isPlayable(s, c)).map((c) => c.id) : [];
  const needUno = canCallUno(s, me);

  return `
    <div class="uno">
      <div class="uno__head">
        <div class="uno__status mono">
          <span>当前颜色 <b class="uno__dot" style="--uno-c:${colorVar(s.color)}"></b>${esc(COLOR_CN[s.color] || '—')}</span>
          <span>方向 <b>${s.dir > 0 ? '顺时针 ↻' : '逆时针 ↺'}</b></span>
          <span>牌堆 <b>${s.deck.length}</b></span>
          <span>弃牌 <b>${s.discard.length}</b></span>
        </div>
        <div class="uno__newbtns">
          <span class="uno__newbtns-label mono">开局</span>
          <button class="btn btn--sm" data-new="2">2 人</button>
          <button class="btn btn--sm btn--signal" data-new="3">3 人</button>
          <button class="btn btn--sm" data-new="4">4 人</button>
        </div>
      </div>

      <div class="uno__table-area">
        <div class="uno__seats">
          ${others.map(({ p, i }) => seatHTML(p, i, s, me)).join('')}
        </div>

        <div class="uno__center">
          <button class="uno__pile" id="unoDraw" aria-label="摸一张" ${myTurn ? '' : 'disabled'}>
            <span class="uno__pile-back">UNO</span>
            <i class="mono">摸牌</i>
          </button>

          <div class="uno__discard">
            ${top ? cardHTML(top, { mini: true }) : ''}
            <span class="uno__ring" style="--uno-c:${colorVar(s.color)}" aria-hidden="true"></span>
          </div>

          <div class="uno__side mono">
            <span>上家出的：${esc(top ? label(top) : '—')}</span>
            <span>轮到：${esc(s.winner === null ? s.players[s.turn].name : '—')}</span>
          </div>
        </div>

        <div class="uno__mine">
          <div class="uno__mine-label mono">
            你的手牌（${s.hands[me].length}）${myTurn ? ' · 轮到你了' : ''}${needUno ? ' · 该喊 UNO 了' : ''}
          </div>
          <div class="uno__hand">
            ${s.hands[me].map((c, idx) => cardHTML(c, { playable: playable.includes(c.id), i: idx, n: s.hands[me].length })).join('')}
          </div>
          ${needUno ? `<button class="uno__uno-btn" id="unoCall">喊 UNO！</button>` : ''}
        </div>
      </div>

      ${s.winner !== null ? `<div class="uno__over">${s.winner === me ? '你赢了' : `${esc(s.players[s.winner].name)} 赢了`} —— 上面点人数再来一局</div>` : ''}

      <div class="uno__log mono">
        ${s.log.slice(-6).map((l) => `<div>· ${esc(l)}</div>`).join('')}
      </div>
      <p class="uno__note">
        规则：能出必须出；不叠 +2/+4，被罚直接过；摸不到能出的就摸一张并轮下家；两人局里反转视同跳过。
        <b>出到只剩一张时必须在下一手之前点「喊 UNO」，否则被罚摸两张。</b>
      </p>
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
  try { localStorage.setItem(SAVE_KEY, serializeGame(live.state)); } catch { /* 隐私模式忽略 */ }
  for (const ev of res.events) {
    if (ev.type === 'win') Toast.ok(ev.seat === live.me ? '你赢了！' : `${live.state.players[ev.seat].name} 赢了`);
    if (ev.type === 'penalty' && ev.seat === live.me) Toast.show(`被罚摸 ${ev.n} 张`, '', { ttl: 3500 });
    if (ev.type === 'unoPending' && ev.seat === live.me) Toast.show('别忘了喊 UNO！（下一手之前）', '', { ttl: 4000 });
    if (ev.type === 'unoPenalty') Toast.show(`${live.state.players[ev.seat].name} 忘了喊 UNO，被罚摸 2 张`, 'err', { ttl: 4000 });
    if (ev.type === 'uno' && ev.seat === live.me) Toast.ok('UNO！');
  }
  paint();
  scheduleBot();
  return res;
}

/** 机器人依次自动走（喊 UNO 不占回合，所以会先喊再出） */
function scheduleBot() {
  if (!live) return;
  clearTimeout(live.timer);
  const s = live.state;
  if (s.winner !== null) return;
  if (!s.players[s.turn]?.bot && !(s.unoPending !== null && s.players[s.unoPending]?.bot)) return;
  live.timer = setTimeout(() => {
    if (!live || live.state.winner !== null) return;
    const st = live.state;
    // 机器人欠 UNO 就补喊（引擎允许它自己喊）
    if (st.unoPending !== null && st.players[st.unoPending]?.bot) { move({ type: 'uno', seat: st.unoPending }); return; }
    if (!st.players[st.turn]?.bot) return;
    move(botMove(st));
  }, BOT_DELAY);
}

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
    if (handoff && !live) live = handoff;
    if (!live) {
      const saved = (() => { try { return deserializeGame(localStorage.getItem(SAVE_KEY)); } catch { return null; } })();
      if (saved && saved.winner === null && saved.unoCalled) live = { state: saved, me: 0, timer: null };
      else start(3);
    }
    return `${viewhead({ title: 'UNO', sub: '和扫雷同一个板块 · 单机对 AI（联机房间开发中）', idx: 'MINES / UNO' })}
      <div id="unoRoot">${live ? boardHTML() : ''}</div>`;
  },
  mount(root) {
    const host = root.querySelector('#unoRoot');

    root.addEventListener('click', (e) => {
      const nb = e.target.closest('[data-new]');
      if (nb) { start(Number(nb.dataset.new)); return; }
      if (e.target.closest('#unoCall')) { move({ type: 'uno', seat: live.me }); return; }
      if (e.target.closest('#unoDraw')) {
        if (live.state.turn !== live.me) { Toast.show('还没轮到你', 'err'); return; }
        move({ type: 'draw', seat: live.me });
        return;
      }
      const cardBtn = e.target.closest('[data-card]');
      if (cardBtn && host.contains(cardBtn)) {
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
      if (e.key === 'u' || e.key === 'U') { if (live.state.turn === live.me) move({ type: 'draw', seat: live.me }); return; }
      if (e.key === 'c' || e.key === 'C') { if (canCallUno(live.state, live.me)) move({ type: 'uno', seat: live.me }); }
    };
    document.addEventListener('keydown', onKey);

    // 切走：收掉定时器、把这局交接出去（回来接着打）
    return () => {
      document.removeEventListener('keydown', onKey);
      if (live) { clearTimeout(live.timer); live.timer = null; handoff = live; live = null; }
    };
  },
};
