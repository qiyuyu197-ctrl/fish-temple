/**
 * plugins/uno.js — UNO 核心（纯逻辑，不碰 DOM）
 * ------------------------------------------------------------------
 * 引擎与视图分开：这里只有规则，src/views/uno.js 负责画与交互。
 * 好处有两个：① 自检可以脱离 UI 直接跑规则；② **服务端也能 import 这一份**
 * 去做联机对局的权威判定（见下面的"为联机预留的设计"）。
 *
 * 为联机预留的设计（下一步接房间时直接用，不改规则）：
 *   · 状态是一份**可 JSON 序列化的纯数据**（牌用 id 表示，没有循环引用、没有函数）
 *   · 每个动作都走 `applyMove(state, move)` 这一个入口，返回 { state, events } —— 纯函数，
 *     同样的 state + move 一定得到同样的结果（服务端与客户端各跑一遍也不会分叉）
 *   · `viewFor(state, seat)` 只暴露"该看得到的"：自己的手牌 + 所有人手牌**张数**，
 *     别家的手牌内容不会进入这份视图 —— 联机时服务端只下发这个，防作弊
 *   · `state.version` 每步 +1，客户端据此做"短轮询 / 版本号变了才重画"
 *
 * 规则取舍（都写在明处，免得玩家觉得是 bug）：
 *   · 108 张标准牌组：四色 0–9（0 一张、1–9 各两张）、Skip / Reverse / Draw2 各两张、Wild / Wild4 各四张
 *   · 每人 7 张，翻一张作起始牌；起始牌是 Wild4 时重翻（简化处理）
 *   · 能出就必须出：颜色或数字/符号相同，或出 Wild / Wild4（出完由出牌者指定颜色）
 *   · **不叠 +2/+4**（官方也是不叠），被 +2/+4 罚牌后直接轮到下家
 *   · 摸不到能出的牌就摸一张并**跳过**（不做"摸到能出可以立刻出"的进阶规则）
 *   · 两人局里 Reverse 视同 Skip（否则等于没出）
 *   · 剩最后一张时"UNO"是荣誉提醒，不做罚则
 */

export const COLORS = ['red', 'yellow', 'green', 'blue'];
export const COLOR_CN = { red: '红', yellow: '黄', green: '绿', blue: '蓝' };
export const KINDS = ['num', 'skip', 'reverse', 'draw2', 'wild', 'wild4'];

/** 牌面显示用（数字直接是数字，符号用短标签） */
export const FACE = { skip: '⊘', reverse: '⇄', draw2: '+2', wild: 'W', wild4: 'W4' };

/** 造一副 108 张的牌组（每张都有稳定 id，便于序列化与断言） */
export function createDeck() {
  const deck = [];
  let n = 0;
  const push = (color, kind, value) => deck.push({ id: `c${++n}`, color, kind, value });
  for (const color of COLORS) {
    push(color, 'num', 0);
    for (let v = 1; v <= 9; v++) { push(color, 'num', v); push(color, 'num', v); }
    for (const kind of ['skip', 'reverse', 'draw2']) { push(color, kind, null); push(color, kind, null); }
  }
  for (let i = 0; i < 4; i++) { push(null, 'wild', null); push(null, 'wild4', null); }
  return deck;
}

/** 可复现的洗牌（seed 可传；联机时服务端用固定 seed 就能复盘） */
export function shuffle(deck, seed = 1) {
  const out = deck.slice();
  let s = seed >>> 0 || 1;
  const rnd = () => {
    // xorshift32：不用 Math.random，保证"同样的 seed 得同样的牌局"
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 新建一局：players = [{ id, name, bot }]（2–4 人） */
export function createGame(players, { seed = Date.now() % 2147483647 } = {}) {
  if (!Array.isArray(players) || players.length < 2 || players.length > 4) {
    throw new Error('UNO 需要 2–4 名玩家');
  }
  const deck = shuffle(createDeck(), seed);
  const hands = players.map(() => []);
  for (let r = 0; r < 7; r++) {
    for (let p = 0; p < players.length; p++) hands[p].push(deck.pop());
  }
  // 起始牌：跳过 Wild4（避免开局就要指定颜色），其余照常
  let top = deck.pop();
  while (top.kind === 'wild4') { deck.unshift(top); top = deck.pop(); }
  const state = {
    version: 1,
    seed,
    players: players.map((p, i) => ({ id: p.id, name: p.name || `玩家${i + 1}`, bot: !!p.bot })),
    hands,
    deck,
    discard: [top],
    turn: 0,
    dir: 1,                       // 1 顺时针 / -1 逆时针
    color: top.color,             // 当前有效颜色（Wild 出牌后由出牌者指定）
    pending: 0,                   // 罚牌累积（本实现不叠，仅用于提示）
    log: [`开局，起始牌是 ${label(top)}`],
    winner: null,
  };
  return state;
}

/** 牌面文字（日志与提示用） */
export function label(card) {
  if (!card) return '？';
  if (card.kind === 'num') return `${COLOR_CN[card.color]}${card.value}`;
  return `${card.color ? COLOR_CN[card.color] : '无'}${FACE[card.kind]}`;
}

/** 顶牌 */
export const topCard = (state) => state.discard[state.discard.length - 1];

/** 这张牌能不能压在当前牌面上 */
export function isPlayable(state, card) {
  if (!card) return false;
  if (card.kind === 'wild' || card.kind === 'wild4') return true;
  const top = topCard(state);
  return card.color === state.color || (card.kind === 'num' && top.kind === 'num' && card.value === top.value)
    || (card.kind !== 'num' && card.kind === top.kind);
}

/** 手牌里所有能出的牌（联机时用于"该你了"的提示与 AI） */
export const playableCards = (state, seat) => state.hands[seat].filter((c) => isPlayable(state, c));

/** 下一位玩家（跳过 dir 步） */
export function nextSeat(state, from = state.turn, step = 1) {
  const n = state.players.length;
  return ((from + state.dir * step) % n + n) % n;
}

function drawOne(state) {
  if (!state.deck.length) {
    // 牌堆摸完了：把弃牌堆（保留顶牌）洗回来 —— 保证不会"摸不出牌"卡死
    const top = state.discard.pop();
    state.deck = shuffle(state.discard, state.version + 7);
    state.discard = [top];
    state.log.push('牌堆摸完，弃牌洗回来了');
  }
  return state.deck.pop();
}

/** 摸牌（内部用；返回摸到的牌） */
export function draw(state, seat, n = 1) {
  const got = [];
  for (let i = 0; i < n; i++) got.push(drawOne(state));
  state.hands[seat].push(...got);
  return got;
}

/**
 * 唯一的动作入口（纯函数：不修改传入的 state，返回新 state 与事件）
 * move 形如：
 *   { type: 'play', seat, cardId, color? }   // color 仅在 Wild/Wild4 时必填
 *   { type: 'draw', seat }                   // 摸一张；摸到能出的也不许出（简化）
 */
export function applyMove(state, move) {
  const s = JSON.parse(JSON.stringify(state));
  const events = [];
  const seat = move.seat;
  if (s.winner) return { state: s, events, error: '这局已经结束了' };
  if (seat !== s.turn) return { state: s, events, error: '还没轮到你' };

  if (move.type === 'draw') {
    const got = draw(s, seat, 1);
    events.push({ type: 'draw', seat, card: got[0] });
    s.log.push(`${s.players[seat].name} 摸了一张`);
    s.turn = nextSeat(s);
    s.version += 1;
    return { state: s, events };
  }

  if (move.type !== 'play') return { state: s, events, error: `未知动作 ${move.type}` };
  const card = s.hands[seat].find((c) => c.id === move.cardId);
  if (!card) return { state: s, events, error: '你手上没有这张牌' };
  if (!isPlayable(s, card)) return { state: s, events, error: '这张牌压不上去' };
  if ((card.kind === 'wild' || card.kind === 'wild4') && !COLORS.includes(move.color)) {
    return { state: s, events, error: '出变色牌要指定颜色' };
  }

  s.hands[seat] = s.hands[seat].filter((c) => c.id !== card.id);
  s.discard.push(card);
  s.color = card.kind === 'wild' || card.kind === 'wild4' ? move.color : card.color;
  events.push({ type: 'play', seat, card, color: s.color });
  s.log.push(`${s.players[seat].name} 出了 ${label(card)}${card.kind.startsWith('wild') ? `（指定${COLOR_CN[move.color]}）` : ''}`);

  if (!s.hands[seat].length) {
    s.winner = seat;
    s.version += 1;
    events.push({ type: 'win', seat });
    return { state: s, events };
  }

  let step = 1;
  if (card.kind === 'skip') {
    const skipped = nextSeat(s);
    events.push({ type: 'skip', seat: skipped });
    s.log.push(`${s.players[skipped].name} 被跳过`);
    step = 2;
  } else if (card.kind === 'reverse') {
    if (s.players.length === 2) {
      const skipped = nextSeat(s);
      events.push({ type: 'skip', seat: skipped });
      s.log.push('两人局：反转视同跳过');
      step = 2;
    } else {
      s.dir = -s.dir;
      events.push({ type: 'reverse' });
      s.log.push('方向反转');
    }
  } else if (card.kind === 'draw2' || card.kind === 'wild4') {
    const victim = nextSeat(s);
    const n = card.kind === 'draw2' ? 2 : 4;
    draw(s, victim, n);
    events.push({ type: 'penalty', seat: victim, n });
    s.log.push(`${s.players[victim].name} 被罚摸 ${n} 张`);
    step = 2;
  }

  s.turn = nextSeat(s, s.turn, step);
  s.version += 1;
  return { state: s, events };
}

/** 轮到机器人时该出什么（纯函数：给定 state 返回一个 move） */
export function botMove(state) {
  const seat = state.turn;
  const cards = playableCards(state, seat);
  if (!cards.length) return { type: 'draw', seat };
  // 简单策略：先出"能压的数字牌"，再出功能牌，最后才动变色牌（把变色牌留到没别的选择时）
  const rank = (c) => (c.kind === 'num' ? 0 : (c.kind === 'wild' || c.kind === 'wild4') ? 2 : 1);
  const pick = cards.slice().sort((a, b) => rank(a) - rank(b) || (b.kind === 'draw2' ? 1 : 0) - (a.kind === 'draw2' ? 1 : 0))[0];
  const move = { type: 'play', seat, cardId: pick.id };
  if (pick.kind === 'wild' || pick.kind === 'wild4') {
    // 指定"手上最多的那个颜色"，没有手牌就随机取一个合法值
    const counts = {};
    for (const c of state.hands[seat]) if (c.color) counts[c.color] = (counts[c.color] || 0) + 1;
    const best = COLORS.slice().sort((a, b) => (counts[b] || 0) - (counts[a] || 0))[0];
    move.color = best;
  }
  return move;
}

/**
 * 给某个座位看的视图（**联机时服务端只下发这个**）：
 * 自己的手牌是完整牌面，别家只给张数 —— 手牌内容不会泄露。
 */
export function viewFor(state, seat) {
  return {
    version: state.version,
    seat,
    turn: state.turn,
    dir: state.dir,
    color: state.color,
    winner: state.winner,
    deckCount: state.deck.length,
    top: topCard(state),
    hand: state.hands[seat] || [],
    opponents: state.players.map((p, i) => ({
      id: p.id, name: p.name, bot: p.bot, count: (state.hands[i] || []).length,
    })),
    log: state.log.slice(-6),
    playable: state.turn === seat && !state.winner ? playableCards(state, seat).map((c) => c.id) : [],
  };
}

/** 序列化 / 反序列化（联机房间存的就是这段 JSON；也是本地"接着打"的存档） */
export const serializeGame = (state) => JSON.stringify(state);
export function deserializeGame(text) {
  try {
    const s = JSON.parse(text);
    if (!s || !Array.isArray(s.hands) || !s.players) return null;
    return s;
  } catch { return null; }
}
