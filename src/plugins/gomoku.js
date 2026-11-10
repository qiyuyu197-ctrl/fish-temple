/**
 * plugins/gomoku.js — 五子棋核心（纯逻辑，不碰 DOM）
 * ------------------------------------------------------------------
 * 和扫雷同一个套路：规则 / AI 在这一层，views/gomoku.js 只管画面与交互。
 *
 * 棋盘：15 × 15 标准交叉点，一维 Int8Array。
 *   0 空 · 1 黑（先手）· 2 白
 *
 * 四位 bot（强度依次递增）：
 *   落鱼鱼        刚学会数五颗子 —— 1 层启发式，看漏是常态
 *   吃什么        会算两步 —— 2 层搜索，能堵四，但常被双威胁打穿
 *   葛小姐        算路很深 —— 4 层 α-β，会做双活三 / 冲四
 *   我太帅了      强得没有边际 —— 6 层迭代加深 + 三个破规则能力
 *
 * 「破规则」是字面意思：偷子 / 封点 / 连手，每一项都能用一次，
 * 不占它自己的落子回合（连手除外，连手就是落两子）。
 * 这是刻意的：它是最终 boss，不是公平对局。人类可以关掉破规则。
 *
 * 搜索结构：
 *   · 每个候选点的形状分用「9 格三进制窗口 → 预计算查表」，落子前后都能 O(36) 算完
 *   · 静态评估按「所有长度 ≥5 的线」增量维护，一子只影响最多 4 条线
 *   · α-β + 迭代加深 + 时间预算；超时就退回上一层完整结果
 */

/* ================================================================== */
/* 常量                                                                */
/* ================================================================== */

export const SIZE = 15;
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
const OPP = (p) => (p === BLACK ? WHITE : BLACK);

/** 形状档位。数值只用于比较与启发式排序，不直接当「目」看 */
const V = {
  FIVE: 1e7,
  OPEN4: 1e6,
  FOUR: 1e5,
  OPEN3: 1e4,
  THREE: 1e3,
  OPEN2: 1e2,
  TWO: 10,
  ONE: 1,
};

/** 四位 bot。level 决定搜索配置，strength 只给界面画强度条 */
export const BOTS = [
  {
    id: 'luoyu',
    name: '落鱼鱼',
    en: 'LUOYU',
    glyph: '鱼',
    tone: 'a',
    level: 1,
    strength: 1,
    tagline: '刚学会落子',
    desc: '落子随缘，看到空位就想下。偶尔会碰巧连成三个，大多数时候在给你送棋。',
    quotes: [
      '只要我还是一天群主，我就称一条帝！',
      '都是天意啊。',
      '胜兵必骄，骄兵必败。',
      '败兵必哀，哀兵必胜。',
      '我有没有什么繁殖的办法？',
      '好好活着。',
    ],
    cheat: false,
  },
  {
    id: 'chishenme',
    name: '吃什么',
    en: 'CHI',
    glyph: '食',
    tone: 'b',
    level: 2,
    strength: 2,
    tagline: '会算两步',
    desc: '知道堵你的四，也会抢活三。但它只看两步，双威胁一旦做出来它就顾不过来了。',
    quotes: [
      '是啊，吃什么？',
      '早上吃什么？',
      '中午吃什么？',
      '晚上吃什么？',
      '夜宵吃什么？',
      '记得好好吃饭啊。',
    ],
    cheat: false,
  },
  {
    id: 'gexiaojie',
    name: '葛小姐',
    en: 'GE',
    glyph: '葛',
    tone: 'c',
    level: 3,
    strength: 3,
    tagline: '算路很深',
    desc: '四层搜索，会主动做双活三和冲四。跟她下棋不能只盯着眼前那一手。',
    quotes: [
      '你下它做甚！你这次下了它，我下个回合还会来撒野的！',
      '我街亭没了？',
      '好火啊，比夷陵之火还好啊！',
      '真是为汉室除去一个巨害啊！',
      '与其寻找一个对手，不如创造一个对手。',
      '危险总在狂欢时逼近。',
      '所有的千秋霸业，都是在山穷水尽时开始的。',
    ],
    cheat: false,
  },
  {
    id: 'wotaishuaile',
    name: '我太帅了',
    en: 'SHUAI',
    glyph: '帅',
    tone: 'd',
    level: 4,
    strength: 5,
    tagline: '强得没有边际，而且不守规矩',
    desc: '六层迭代加深，已经是正常棋力的天花板。更麻烦的是它会掀桌：偷子、封点、连手，每样一次，用完为止。',
    quotes: [
      '世人昨日看错我，今日又看错，也许明日还会看错，可我依然是我，我从来不怕别人看错我。',
      '死不可怕，死是凉爽的夏夜，可供人无忧地安眠。',
      '不要愤怒，愤怒会降低你的智慧；仇恨会失去判断力。',
      '失败是个好事，失败能教会我们如何成功……一个人要想成事，就得拿得起、放得下。',
      '你又怎么知道今天的无名之辈，来日不会名震天下呢？',
      '故人陆续凋零，好似风中落叶。',
      '对手啊……如果你跟着我，岂能身首异处？不过话又说回来了，你要是当初跟了我……我就瞧不上你了，因为我也喜欢忠义之人。',
    ],
    cheat: true,
  },
];

/** 破规则能力（只有「我太帅了」有，每局各一次） */
export const ABILITIES = [
  {
    id: 'steal',
    name: '偷子',
    en: 'STEAL',
    glyph: '偷',
    desc: '从棋盘上偷走对方一颗棋子，不占自己的落子回合。',
  },
  {
    id: 'seal',
    name: '封点',
    en: 'SEAL',
    glyph: '封',
    desc: '封死一个交叉点：对方永远不能在此落子，自己可以。',
  },
  {
    id: 'double',
    name: '连手',
    en: 'DOUBLE',
    glyph: '连',
    desc: '一回合连落两子。',
  },
];

export const ABILITY_BY_ID = Object.fromEntries(ABILITIES.map((a) => [a.id, a]));

export const botById = (id) => BOTS.find((b) => b.id === id) || null;

/** 各档位搜索配置。budget 是单步上限（毫秒） */
const LEVELS = {
  1: { depth: 1, breadth: 7, budget: 60 },
  2: { depth: 2, breadth: 8, budget: 140 },
  3: { depth: 4, breadth: 10, budget: 340 },
  4: { depth: 6, breadth: 12, budget: 720 },
};

const now = () => (typeof performance !== 'undefined' && performance.now
  ? performance.now()
  : Date.now());

/* ================================================================== */
/* 形状表：9 格窗口（中心恒为自己的子）→ 分数                            */
/* ================================================================== */

/**
 * 每个方向取以候选点为中心的 9 格窗口，编码成三进制：
 *   0 = 空 · 1 = 自己 · 2 = 对手 / 边界
 * 9 位三进制共 3^9 = 19683 种，预先算好分数，落子评分时只查表。
 */

/** 把窗口字符串（'0' 空 / '1' 己 / '2' 挡）按最强形状打分 */
function shapeFromString(s) {
  if (s.includes('11111')) return V.FIVE;
  if (s.includes('011110')) return V.OPEN4;
  if (/011112|211110|01111|11110|11011|10111|11101/.test(s)) return V.FOUR;
  if (/01110|010110|011010/.test(s)) return V.OPEN3;
  if (/11100|00111|11010|01011|10110|01101|10011|11001|10101/.test(s)) return V.THREE;
  if (/001100|011000|000110|010100|001010|0110|01010/.test(s)) return V.OPEN2;
  if (/110|011|101/.test(s)) return V.TWO;
  if (s.includes('1')) return V.ONE;
  return 0;
}

let SHAPE = null;
function shapeTable() {
  if (SHAPE) return SHAPE;
  const table = new Float32Array(19683);
  const chars = ['0', '1', '2'];
  for (let code = 0; code < 19683; code++) {
    let x = code;
    let s = '';
    for (let k = 0; k < 9; k++) {
      s = chars[x % 3] + s;
      x = (x / 3) | 0;
    }
    table[code] = shapeFromString(s);
  }
  SHAPE = table;
  return table;
}

/** 候选点相对于玩家 p 的四个方向形状分 */
function pointDirs(board, size, idx, p) {
  const table = shapeTable();
  const r = (idx / size) | 0;
  const c = idx % size;
  const dirs = [0, 0, 0, 0];
  for (let d = 0; d < 4; d++) {
    const dr = DIRS[d][0];
    const dc = DIRS[d][1];
    let code = 0;
    for (let k = -4; k <= 4; k++) {
      let st;
      if (k === 0) st = 1;
      else {
        const rr = r + dr * k;
        const cc = c + dc * k;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) st = 2;
        else {
          const v = board[rr * size + cc];
          st = v === 0 ? 0 : v === p ? 1 : 2;
        }
      }
      code = code * 3 + st;
    }
    dirs[d] = table[code];
  }
  return dirs;
}

/** 单点进攻价值（含双威胁加成）。返回 >= 1e8 表示这一手直接成五 */
function pointValue(board, size, idx, p) {
  const dirs = pointDirs(board, size, idx, p);
  let sum = 0;
  let five = false;
  let open4 = 0;
  let fours = 0;
  let threes = 0;
  for (let d = 0; d < 4; d++) {
    const s = dirs[d];
    if (s >= V.FIVE) five = true;
    else if (s >= V.OPEN4) open4++;
    else if (s >= V.FOUR) fours++;
    else if (s >= V.OPEN3) threes++;
    sum += s;
  }
  if (five) return V.FIVE * 10;      // 1e8：比任何组合都高
  let bonus = 0;
  if (open4) bonus += 4e6;            // 活四：下一手必成五
  if (fours >= 2) bonus += 3e6;       // 双冲四
  else if (fours >= 1 && threes >= 1) bonus += 2e6;
  if (threes >= 2) bonus += 1e6;      // 双活三
  return sum + bonus;
}

/* ================================================================== */
/* 棋盘工具                                                            */
/* ================================================================== */

/** 落在 idx 的 p 是否已经连成五子（含长连） */
export function isWinAt(board, size, idx, p) {
  const r = (idx / size) | 0;
  const c = idx % size;
  for (let d = 0; d < 4; d++) {
    const dr = DIRS[d][0];
    const dc = DIRS[d][1];
    let count = 1;
    for (let sign = -1; sign <= 1; sign += 2) {
      let rr = r + dr * sign;
      let cc = c + dc * sign;
      while (rr >= 0 && rr < size && cc >= 0 && cc < size && board[rr * size + cc] === p) {
        count++;
        rr += dr * sign;
        cc += dc * sign;
      }
    }
    if (count >= 5) return true;
  }
  return false;
}

/** 返回完整获胜线（>= 5 格的下标数组），没有就 null */
export function findWinLine(board, size, idx, p) {
  const r = (idx / size) | 0;
  const c = idx % size;
  for (let d = 0; d < 4; d++) {
    const dr = DIRS[d][0];
    const dc = DIRS[d][1];
    const cells = [idx];
    for (let sign = -1; sign <= 1; sign += 2) {
      let rr = r + dr * sign;
      let cc = c + dc * sign;
      while (rr >= 0 && rr < size && cc >= 0 && cc < size && board[rr * size + cc] === p) {
        cells.push(rr * size + cc);
        rr += dr * sign;
        cc += dc * sign;
      }
    }
    if (cells.length >= 5) {
      // 按方向排好，画线时首尾相接
      cells.sort((a, b) => (a - b) * (dr !== 0 ? 1 : 1));
      return cells;
    }
  }
  return null;
}

/** 所有能让 p 立刻成五的空点（可带封点过滤） */
export function winningMoves(board, size, p, sealed = null) {
  const out = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i]) continue;
    if (sealed && sealed[i] && sealed[i] !== p) continue;
    board[i] = p;
    if (isWinAt(board, size, i, p)) out.push(i);
    board[i] = 0;
  }
  return out;
}

/** 最近的棋子距离（用于候选点收缩）：把「周围 2 格内有子」当候选 */
function buildNear(size) {
  const deltas = [];
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      if (!dr && !dc) continue;
      deltas.push([dr, dc]);
    }
  }
  return deltas;
}
const NEAR_DELTAS = buildNear(SIZE);

/* ================================================================== */
/* 所有长度 >= 5 的线：静态评估增量维护                                  */
/* ================================================================== */

const lineCache = new Map();
const cellLineCache = new Map();

function buildLines(size) {
  if (lineCache.has(size)) return lineCache.get(size);
  const lines = [];
  const cellLines = Array.from({ length: size * size }, () => []);
  const pushLine = (cells) => {
    if (cells.length < 5) return;
    const id = lines.length;
    lines.push(cells);
    cells.forEach((idx) => cellLines[idx].push(id));
  };
  // 横 / 竖
  for (let r = 0; r < size; r++) {
    const row = [];
    for (let c = 0; c < size; c++) row.push(r * size + c);
    pushLine(row);
  }
  for (let c = 0; c < size; c++) {
    const col = [];
    for (let r = 0; r < size; r++) col.push(r * size + c);
    pushLine(col);
  }
  // ↘
  for (let start = -(size - 5); start <= size - 5; start++) {
    const cells = [];
    for (let r = 0; r < size; r++) {
      const c = r + start;
      if (c >= 0 && c < size) cells.push(r * size + c);
    }
    pushLine(cells);
  }
  // ↙
  for (let sum = 4; sum <= size * 2 - 6; sum++) {
    const cells = [];
    for (let r = 0; r < size; r++) {
      const c = sum - r;
      if (c >= 0 && c < size) cells.push(r * size + c);
    }
    pushLine(cells);
  }
  const out = { lines, cellLines };
  lineCache.set(size, out);
  cellLineCache.set(size, out);
  return out;
}

/** 线的形状分：按最强形状给分；同档出现多次略微加成 */
const LINE_PATTERNS = [
  { re: /11111/g, v: V.FIVE },
  { re: /011110/g, v: V.OPEN4 },
  { re: /011112|211110|01111|11110|11011|10111|11101/g, v: V.FOUR },
  { re: /01110|010110|011010/g, v: V.OPEN3 },
  { re: /11100|00111|11010|01011|10110|01101|10011|11001|10101/g, v: V.THREE },
  { re: /001100|011000|000110|010100|001010|0110|01010/g, v: V.OPEN2 },
  { re: /110|011|101/g, v: V.TWO },
  { re: /1/g, v: V.ONE },
];

function scoreLineString(s) {
  for (const { re, v } of LINE_PATTERNS) {
    re.lastIndex = 0;
    let count = 0;
    while (re.exec(s)) {
      count++;
      if (re.lastIndex === 0) break;
    }
    if (count) return v * (1 + Math.min(2, count - 1) * 0.5);
  }
  return 0;
}

/** 一条线对某一方的分数（两端补 '2' 当作边界） */
function lineScoreFor(board, cells, p) {
  let s = '2';
  for (let k = 0; k < cells.length; k++) {
    const v = board[cells[k]];
    s += v === 0 ? '0' : v === p ? '1' : '2';
  }
  s += '2';
  return scoreLineString(s);
}

/* ================================================================== */
/* 对局状态                                                            */
/* ================================================================== */

/**
 * 每一局给每个 bot 抽一组「性格参数」。
 * 这不是为了削弱谁，而是把「同一局面永远走同一步」打散：
 * 攻防权重、中心偏好、评估权重、排序抖动、掀桌心情都在小范围内随机。
 * 高段位的范围更窄（我太帅了几乎仍然走最强手），低段位更离谱。
 */
const DEFAULT_TUNING = {
  attack: 1,
  defense: 1.12,
  oppWeight: 1.12,
  center: 1,
  jitter: 0,
  cheatMood: 0.55,
  cheatFavorite: 'steal',
};

const TUNING_RANGES = {
  1: { attack: [0.78, 1.2], defense: [0.75, 1.5], opp: [0.9, 1.3], center: [0.4, 2.2], jitter: [0.012, 0.03], mood: [0.2, 0.9] },
  2: { attack: [0.9, 1.1], defense: [0.98, 1.28], opp: [1.0, 1.24], center: [0.5, 1.8], jitter: [0.006, 0.014], mood: [0.3, 0.85] },
  3: { attack: [0.95, 1.05], defense: [1.05, 1.2], opp: [1.05, 1.18], center: [0.7, 1.4], jitter: [0.002, 0.006], mood: [0.35, 0.85] },
  4: { attack: [0.995, 1.005], defense: [1.105, 1.135], opp: [1.105, 1.135], center: [0.9, 1.1], jitter: [0.0004, 0.0014], mood: [0.35, 0.95] },
};

function makeTuning(level = 1) {
  const r = TUNING_RANGES[level] || TUNING_RANGES[1];
  const rnd = (pair) => pair[0] + Math.random() * (pair[1] - pair[0]);
  return {
    attack: rnd(r.attack),
    defense: rnd(r.defense),
    oppWeight: rnd(r.opp),
    center: rnd(r.center),
    jitter: rnd(r.jitter),
    cheatMood: rnd(r.mood),
    cheatFavorite: ['steal', 'seal', 'double'][Math.floor(Math.random() * 3)],
  };
}

function sidesFor({ blackBot, whiteBot, humanSide }) {
  const mk = (botId, human) => {
    const bot = botId ? botById(botId) : null;
    return {
      bot: bot ? bot.id : null,
      human: !!human && !bot,
      name: human && !bot ? '你' : (bot ? bot.name : '—'),
      tuning: bot ? makeTuning(bot.level) : DEFAULT_TUNING,
    };
  };
  return {
    1: mk(blackBot, humanSide === BLACK),
    2: mk(whiteBot, humanSide === WHITE),
  };
}

/**
 * 开一局。
 * @param {object} opts
 *   blackBot / whiteBot  bot id（人类那侧传 null）
 *   humanSide            1 / 2；0 = 双方都是 bot（观战）
 *   allowCheat           是否允许「我太帅了」破规则（默认 true）
 */
export function createGame({ blackBot = null, whiteBot = null, humanSide = 0, allowCheat = true } = {}) {
  const size = SIZE;
  const game = {
    size,
    board: new Int8Array(size * size),
    sealed: new Int8Array(size * size),
    turn: BLACK,
    moves: [],
    abilityLog: [],
    seq: 0,
    over: false,
    winner: 0,
    winLine: null,
    lastMove: -1,
    sides: sidesFor({ blackBot, whiteBot, humanSide }),
    abilities: { 1: zeroAbilities(), 2: zeroAbilities() },
    allowCheat: !!allowCheat,
    startedAt: Date.now(),
  };
  for (const side of [BLACK, WHITE]) {
    const info = game.sides[side];
    const bot = info.bot ? botById(info.bot) : null;
    if (bot?.cheat && allowCheat) {
      game.abilities[side] = { steal: 1, seal: 1, double: 1 };
    }
  }
  return game;
}

function zeroAbilities() {
  return { steal: 0, seal: 0, double: 0 };
}

export function abilityLeft(game, side) {
  const a = game.abilities[side] || {};
  return ABILITIES.filter((ab) => (a[ab.id] || 0) > 0).map((ab) => ab.id);
}

export function isHumanTurn(game) {
  return !game.over && game.sides[game.turn].human;
}

/** 这个点现在能不能被 player 落子 */
export function canPlay(game, idx, player = game.turn) {
  if (game.over) return false;
  if (!Number.isInteger(idx) || idx < 0 || idx >= game.board.length) return false;
  if (game.board[idx]) return false;
  const seal = game.sealed[idx];
  if (seal && seal !== player) return false;
  return true;
}

/** 轮到 player 时还有没有合法的落子点（封点可能把最后一个空点锁死） */
export function hasLegalMove(game, player) {
  for (let i = 0; i < game.board.length; i++) {
    if (!game.board[i] && (!game.sealed[i] || game.sealed[i] === player)) return true;
  }
  return false;
}

/**
 * 落子。passTurn=false 用于「连手」的第一子。
 * @returns {{ok:boolean, win?:boolean, draw?:boolean, line?:number[]|null, error?:string}}
 */
export function place(game, idx, player = game.turn, { passTurn = true } = {}) {
  if (game.over) return { ok: false, error: '对局已结束' };
  if (player !== game.turn) return { ok: false, error: '还没到这一方' };
  if (!canPlay(game, idx, player)) return { ok: false, error: '这个点不能落子' };

  game.board[idx] = player;
  game.seq++;
  const move = { idx, player, seq: game.seq, at: Date.now() };
  game.moves.push(move);
  game.lastMove = idx;

  const line = findWinLine(game.board, game.size, idx, player);
  if (line) {
    game.over = true;
    game.winner = player;
    game.winLine = line;
    return { ok: true, win: true, draw: false, line, move };
  }
  if (game.moves.length >= game.board.length) {
    game.over = true;
    game.winner = 0;
    game.winLine = null;
    return { ok: true, win: false, draw: true, line: null, move };
  }
  if (passTurn) game.turn = OPP(player);
  // 极端情况：封点把最后一个空点也锁死了，双方都没得下 —— 判和，别让观战循环卡住
  if (!hasLegalMove(game, game.turn)) {
    game.over = true;
    game.winner = 0;
    game.winLine = null;
    return { ok: true, win: false, draw: true, line: null, move };
  }
  return { ok: true, win: false, draw: false, line: null, move };
}

/** 悔棋：把从「人类上一手」开始的所有落子撤回，回到轮到人类时的局面 */
export function undoToHuman(game, humanSide) {
  if (!humanSide) return { ok: false, error: '观战模式不能悔棋' };
  let cut = -1;
  for (let k = game.moves.length - 1; k >= 0; k--) {
    if (game.moves[k].player === humanSide) { cut = k; break; }
  }
  if (cut < 0) return { ok: false, error: '还没有你的落子' };
  const removed = game.moves.splice(cut);
  for (const m of removed) game.board[m.idx] = 0;
  game.over = false;
  game.winner = 0;
  game.winLine = null;
  game.lastMove = game.moves.length ? game.moves[game.moves.length - 1].idx : -1;
  game.turn = humanSide;
  return { ok: true, removed: removed.length };
}

/* ================================================================== */
/* 破规则能力                                                          */
/* ================================================================== */

function logAbility(game, side, type, idx, reason = '') {
  const n = ++game.seq;
  game.abilityLog.push({ type, player: side, idx, seq: n, at: Date.now(), reason });
  return n;
}

/** 偷走对手一颗子（不占落子回合） */
export function applySteal(game, side, idx, reason = '') {
  if (game.over) return { ok: false, error: '对局已结束' };
  if (!game.abilities[side]?.steal) return { ok: false, error: '偷子已经用过了' };
  const opp = OPP(side);
  if (game.board[idx] !== opp) return { ok: false, error: '只能偷对方的棋子' };
  game.board[idx] = 0;
  game.abilities[side].steal = 0;
  const seq = logAbility(game, side, 'steal', idx, reason);
  if (game.lastMove === idx) game.lastMove = -1;
  return { ok: true, idx, seq };
}

/** 封点：对方永远不能下这里（自己可以） */
export function applySeal(game, side, idx, reason = '') {
  if (game.over) return { ok: false, error: '对局已结束' };
  if (!game.abilities[side]?.seal) return { ok: false, error: '封点已经用过了' };
  if (game.board[idx]) return { ok: false, error: '这里已经有棋子了' };
  if (game.sealed[idx]) return { ok: false, error: '这里已经被封了' };
  game.sealed[idx] = side;
  game.abilities[side].seal = 0;
  const seq = logAbility(game, side, 'seal', idx, reason);
  return { ok: true, idx, seq };
}

/** 连手：消耗能力并记账；真正的两子由 place(passTurn:false) + place() 完成 */
export function applyDouble(game, side, reason = '') {
  if (game.over) return { ok: false, error: '对局已结束' };
  if (!game.abilities[side]?.double) return { ok: false, error: '连手已经用过了' };
  game.abilities[side].double = 0;
  const seq = logAbility(game, side, 'double', -1, reason);
  return { ok: true, seq };
}

/** 把封点标记从棋盘上抹掉（仅内部/重置时用） */
export function clearSeal(game, idx) {
  game.sealed[idx] = 0;
}

/* ================================================================== */
/* 搜索                                                                */
/* ================================================================== */

const INF = 1e12;
const WIN = 1e9;
const MAX_NODES_CHECK = 64;

class Searcher {
  constructor(game, me, tuning = null) {
    const size = game.size;
    const { lines, cellLines } = buildLines(size);
    this.size = size;
    this.n = size * size;
    this.board = game.board.slice();
    this.sealed = game.sealed;
    this.me = me;
    this.tuning = tuning || game.sides?.[me]?.tuning || DEFAULT_TUNING;
    this.lines = lines;
    this.cellLines = cellLines;
    this.ls1 = new Float64Array(lines.length);
    this.ls2 = new Float64Array(lines.length);
    this.totals = [0, 0, 0];
    this.near = new Uint8Array(this.n);
    this.nodes = 0;
    this.deadline = Infinity;
    this.timeout = false;

    // 初始化：线分 + 邻域计数
    for (let li = 0; li < lines.length; li++) {
      const cells = lines[li];
      const s1 = lineScoreFor(this.board, cells, BLACK);
      const s2 = lineScoreFor(this.board, cells, WHITE);
      this.ls1[li] = s1;
      this.ls2[li] = s2;
      this.totals[1] += s1;
      this.totals[2] += s2;
    }
    for (let i = 0; i < this.n; i++) if (this.board[i]) this.bumpNear(i, 1);
  }

  bumpNear(idx, delta) {
    const size = this.size;
    const r = (idx / size) | 0;
    const c = idx % size;
    for (let d = 0; d < NEAR_DELTAS.length; d++) {
      const rr = r + NEAR_DELTAS[d][0];
      const cc = c + NEAR_DELTAS[d][1];
      if (rr >= 0 && rr < size && cc >= 0 && cc < size) {
        this.near[rr * size + cc] += delta;
      }
    }
  }

  updateLine(li) {
    const cells = this.lines[li];
    const s1 = lineScoreFor(this.board, cells, BLACK);
    const s2 = lineScoreFor(this.board, cells, WHITE);
    this.totals[1] += s1 - this.ls1[li];
    this.totals[2] += s2 - this.ls2[li];
    this.ls1[li] = s1;
    this.ls2[li] = s2;
  }

  add(idx, p) {
    this.board[idx] = p;
    this.bumpNear(idx, 1);
    const ls = this.cellLines[idx];
    for (let k = 0; k < ls.length; k++) this.updateLine(ls[k]);
  }

  remove(idx, p) {
    this.board[idx] = 0;
    this.bumpNear(idx, -1);
    const ls = this.cellLines[idx];
    for (let k = 0; k < ls.length; k++) this.updateLine(ls[k]);
  }

  /** 按启发式分数取前 limit 个候选点 */
  candidates(player, limit) {
    const size = this.size;
    const board = this.board;
    const opp = OPP(player);
    const tune = this.tuning;
    const top = [];
    for (let i = 0; i < this.n; i++) {
      if (board[i] || !this.near[i]) continue;
      if (this.sealed[i] && this.sealed[i] !== player) continue;
      const atk = pointValue(board, size, i, player);
      const def = pointValue(board, size, i, opp);
      // 中心略微加权，开局不会贴边
      const r = (i / size) | 0;
      const c = i % size;
      const bias = (size - Math.abs(r - 7) - Math.abs(c - 7)) * 0.5;
      // 自己的五连永远排在最前；对手的五连点排第二（必须堵）
      let score;
      if (atk >= V.FIVE * 10) score = 1e10 + def;
      else if (def >= V.FIVE * 10) score = 5e9 + atk;
      else {
        // 每局/每只 bot 的攻防权重与中心偏好不同；排序再叠一点抖动，
        // 让同样的局面在不同对局里不会总是排出同一顺序。
        const jitter = 1 + (Math.random() - 0.5) * tune.jitter;
        score = (atk * tune.attack + def * tune.defense + bias * tune.center) * jitter;
      }
      if (top.length < limit) {
        top.push({ i, s: score });
        top.sort((a, b) => b.s - a.s);
      } else if (score > top[top.length - 1].s) {
        top[top.length - 1] = { i, s: score };
        top.sort((a, b) => b.s - a.s);
      }
    }
    if (!top.length && !this.board.some((v) => v)) {
      return [{ i: ((size / 2) | 0) * size + ((size / 2) | 0), s: 1 }];
    }
    return top;
  }

  evaluate(player) {
    const t = this.totals;
    return t[player] - t[OPP(player)] * this.tuning.oppWeight;
  }

  checkTime() {
    if (this.timeout) return true;
    if ((this.nodes & (MAX_NODES_CHECK - 1)) === 0 && now() > this.deadline) this.timeout = true;
    return this.timeout;
  }

  negamax(depth, alpha, beta, player, ply) {
    this.nodes++;
    if (this.checkTime()) return 0;
    if (depth <= 0) return this.evaluate(player);

    const moves = this.candidates(player, depth >= 3 ? 8 : 6);
    if (!moves.length) return this.evaluate(player);

    let best = -INF;
    for (let k = 0; k < moves.length; k++) {
      const m = moves[k];
      this.add(m.i, player);
      let val;
      if (isWinAt(this.board, this.size, m.i, player)) {
        val = WIN - ply;
      } else {
        val = -this.negamax(depth - 1, -beta, -alpha, OPP(player), ply + 1);
      }
      this.remove(m.i, player);
      if (this.timeout) return best === -INF ? 0 : best;
      if (val > best) best = val;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  root(player, depth, limit) {
    const moves = this.candidates(player, limit);
    if (!moves.length) return { move: -1, score: 0, completed: true, results: [] };
    let bestMove = moves[0].i;
    let bestScore = -INF;
    let alpha = -INF;
    const beta = INF;
    const results = [];
    for (let k = 0; k < moves.length; k++) {
      const m = moves[k];
      this.add(m.i, player);
      let val;
      if (isWinAt(this.board, this.size, m.i, player)) {
        val = WIN - 1;
      } else {
        val = -this.negamax(depth - 1, -beta, -alpha, OPP(player), 1);
      }
      this.remove(m.i, player);
      if (this.timeout) return { move: bestMove, score: bestScore, completed: false, results };
      results.push({ i: m.i, score: val });
      if (val > bestScore) { bestScore = val; bestMove = m.i; }
      if (val > alpha) alpha = val;
    }
    return { move: bestMove, score: bestScore, completed: true, results };
  }
}

/* ================================================================== */
/* 四个 bot 的决策                                                     */
/* ================================================================== */

function levelOf(game, side) {
  const id = game.sides[side]?.bot;
  const bot = id ? botById(id) : null;
  return bot ? bot.level : 1;
}

/** 候选点里直接成五的那一手 */
function findWinning(game, side) {
  const wins = winningMoves(game.board, game.size, side, game.sealed);
  return wins.length ? wins : null;
}

function heuristicPick(game, side, { noise = 0, breadth = 7, ignoreDefense = false } = {}) {
  const searcher = new Searcher(game, side);
  const cands = searcher.candidates(side, breadth);
  if (!cands.length) return -1;
  const opp = OPP(side);
  const tune = searcher.tuning;
  const scored = cands.map((m) => {
    let s = pointValue(searcher.board, game.size, m.i, side) * tune.attack;
    if (!ignoreDefense) s += pointValue(searcher.board, game.size, m.i, opp) * tune.defense;
    if (noise) s *= 1 + (Math.random() * 2 - 1) * noise;
    return { i: m.i, s };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored[0].i;
}

/* ---------------- 开局：不总是 H8 ---------------- */

const OPENING_KEY = 'ft.terminal.gomoku.lastOpening';

function readLastOpening() {
  try {
    const v = Number(localStorage.getItem(OPENING_KEY));
    return Number.isInteger(v) ? v : -1;
  } catch { return -1; }
}

function writeLastOpening(idx) {
  try { localStorage.setItem(OPENING_KEY, String(idx)); } catch { /* 隐私模式忽略 */ }
}

/** 15×15 的开局点：中心 / 相邻一圈 / 距离 2 的一圈 */
function openingGroups(size) {
  const mid = (size / 2) | 0;
  const center = mid * size + mid;
  const near = [];
  const far = [];
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      if (!dr && !dc) continue;
      const r = mid + dr;
      const c = mid + dc;
      if (r < 0 || c < 0 || r >= size || c >= size) continue;
      const idx = r * size + c;
      const cheb = Math.max(Math.abs(dr), Math.abs(dc));
      if (cheb === 1) near.push(idx);
      else if (cheb === 2) far.push(idx);
    }
  }
  return { center, near, far };
}

const OPENING_WEIGHTS = {
  1: [0.2, 0.5, 0.3],
  2: [0.4, 0.45, 0.15],
  3: [0.4, 0.45, 0.15],
  4: [0.6, 0.35, 0.05],
};

/**
 * 空盘第一手：按档位权重随机中心 / 邻圈 / 外圈，并避开上一局的第一手。
 * 这是去套路化最有效的一刀 —— 开局位置一变，整盘棋的棋型就完全不同了。
 */
function chooseOpening(game, level) {
  const { center, near, far } = openingGroups(game.size);
  const w = OPENING_WEIGHTS[level] || OPENING_WEIGHTS[1];
  const last = readLastOpening();
  const groups = [
    { list: [center], w: w[0] },
    { list: near, w: w[1] },
    { list: far, w: w[2] },
  ];
  const total = groups.reduce((s, g) => s + g.w, 0);
  let pick = Math.random() * total;
  for (const g of groups) {
    pick -= g.w;
    if (pick > 0) continue;
    const pool = g.list.filter((i) => i !== last);
    if (!pool.length) continue;
    const idx = pool[Math.floor(Math.random() * pool.length)];
    writeLastOpening(idx);
    return idx;
  }
  // 兜底：中心（或排除 last 后的任一邻点）
  const fallback = [center, ...near, ...far].find((i) => i !== last) ?? center;
  writeLastOpening(fallback);
  return fallback;
}

/**
 * 从根节点的完整搜索结果里挑一手。
 * 只在「分数接近」的候选之间随机；差距大的第二手会被 margin 挡掉，
 * 所以不会为了随机而送棋。必胜局面在必胜手里随机。
 */
function pickRootMove(results, level, tune = DEFAULT_TUNING) {
  if (!results || !results.length) return -1;
  const sorted = results.slice().sort((a, b) => b.score - a.score);
  const best = sorted[0].score;
  if (!Number.isFinite(best)) return sorted[0].i;
  if (best >= WIN / 2) {
    const wins = sorted.filter((r) => r.score >= WIN / 2);
    return wins[Math.floor(Math.random() * wins.length)].i;
  }
  if (best <= -WIN / 2) return sorted[0].i;

  const conf = {
    2: { rank: 3, margin: 180000, weights: [1, 0.4, 0.15] },
    3: { rank: 3, margin: 60000, weights: [1, 0.16, 0.05] },
    4: { rank: 3, margin: 12000, weights: [1, 0.05, 0.015] },
  }[level] || { rank: 1, margin: 0, weights: [1] };
  // 局面焦灼时（分差很小）允许更松一点；大优/大劣时收紧，避免把胜势走丢
  const margin = conf.margin * (0.75 + tune.center * 0.25);
  const pool = [];
  for (let k = 0; k < Math.min(conf.rank, sorted.length); k++) {
    if (k === 0 || sorted[k].score >= best - margin) {
      pool.push({ i: sorted[k].i, w: conf.weights[k] || 0 });
    }
  }
  if (pool.length === 1) return pool[0].i;
  const total = pool.reduce((s, p) => s + p.w, 0);
  let pick = Math.random() * total;
  for (const p of pool) {
    pick -= p.w;
    if (pick <= 0) return p.i;
  }
  return pool[0].i;
}

/**
 * 选一手棋。
 * 观战时可以用 opts.budget 缩短思考时间（加速连战）。
 */
export function chooseMove(game, side, opts = {}) {
  if (game.over) return -1;
  const level = opts.level ?? levelOf(game, side);
  const cfg = LEVELS[level] || LEVELS[1];
  const tune = game.sides?.[side]?.tuning || DEFAULT_TUNING;

  // 1) 能赢就赢：任何档位都不会看漏自己的五连；多个成五点里随机一个
  const myWins = findWinning(game, side);
  if (myWins) return myWins[Math.floor(Math.random() * myWins.length)];

  // 2) 对手有立刻成五的点：低段位会漏，高段位必堵
  const opp = OPP(side);
  const oppWins = winningMoves(game.board, game.size, opp, game.sealed);
  if (oppWins.length) {
    if (level === 1) {
      if (Math.random() < 0.55) return oppWins[Math.floor(Math.random() * oppWins.length)];
    } else {
      return oppWins[Math.floor(Math.random() * oppWins.length)];
    }
  }

  // 3) 空盘 / 开局
  if (game.moves.length === 0) return chooseOpening(game, level);

  if (level === 1) {
    // 60% 认真看一手，40% 只看进攻 —— 于是经常漏防
    const ignoreDefense = Math.random() < 0.4;
    return heuristicPick(game, side, { noise: 0.7, breadth: 7, ignoreDefense });
  }
  if (level === 2) {
    const searcher = new Searcher(game, side);
    searcher.deadline = now() + (opts.budget ?? cfg.budget);
    const r = searcher.root(side, 2, 8);
    if (r.completed && r.results?.length) return pickRootMove(r.results, 2, searcher.tuning);
    return r.move >= 0 ? r.move : heuristicPick(game, side, { noise: 0.2, breadth: 6 });
  }

  // 3 / 4 档：迭代加深 + 时间预算
  const searcher = new Searcher(game, side);
  const budget = Math.max(40, opts.budget ?? cfg.budget);
  searcher.deadline = now() + budget;
  let best = heuristicPick(game, side, { breadth: 8 });
  let finalResults = null;
  let reached = 0;
  for (let d = 2; d <= cfg.depth; d += 2) {
    const r = searcher.root(side, d, d >= 4 ? cfg.breadth : 8);
    if (!r.completed) {
      // 这一层没跑完：如果上一层已经有完整结果就用上层的
      if (d === 2 && r.move >= 0 && !finalResults) best = r.move;
      break;
    }
    if (r.move >= 0) {
      best = r.move;
      finalResults = r.results;
      reached = d;
    }
    if (r.score >= WIN / 2) break;       // 已经算到必胜
    if (now() > searcher.deadline) break;
  }
  if (finalResults) best = pickRootMove(finalResults, level, searcher.tuning);
  if (opts.meta) {
    opts.meta.depth = reached;
    opts.meta.nodes = searcher.nodes;
    opts.meta.timedOut = searcher.timeout;
  }
  return best;
}

/* ================================================================== */
/* 「我太帅了」的破规则决策                                             */
/* ================================================================== */

/** 找一条包含威胁点的对方四连，返回其中一颗子的下标 */
function threatStones(board, size, p, point) {
  const r = (point / size) | 0;
  const c = point % size;
  const out = [];
  for (let d = 0; d < 4; d++) {
    const dr = DIRS[d][0];
    const dc = DIRS[d][1];
    // 从威胁点两侧各收集 4 格
    for (let sign = -1; sign <= 1; sign += 2) {
      const cells = [point];
      for (let k = 1; k <= 4; k++) {
        const rr = r + dr * k * sign;
        const cc = c + dc * k * sign;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) break;
        const idx = rr * size + cc;
        if (board[idx] !== p) break;
        cells.push(idx);
      }
      if (cells.length >= 5) {
        for (const idx of cells) if (idx !== point) out.push(idx);
      }
    }
  }
  return out;
}

function chooseStealTarget(game, side, urgent = true) {
  const opp = OPP(side);
  const board = game.board;
  const wins = winningMoves(board, game.size, opp, game.sealed);

  if (urgent && wins.length) {
    const candidates = new Set();
    for (const w of wins) {
      for (const s of threatStones(board, game.size, opp, w)) candidates.add(s);
    }
    // 也可以偷刚下的那一手：往往是最痛的一颗
    if (game.lastMove >= 0 && board[game.lastMove] === opp) candidates.add(game.lastMove);
    if (!candidates.size) return -1;

    let bestCount = Infinity;
    const best = [];
    for (const s of candidates) {
      board[s] = 0;
      const remain = winningMoves(board, game.size, opp, game.sealed).length;
      board[s] = opp;
      if (remain < bestCount) { bestCount = remain; best.length = 0; best.push(s); }
      else if (remain === bestCount) best.push(s);
    }
    return best.length ? best[Math.floor(Math.random() * best.length)] : -1;
  }

  // 没有立刻成五：拆对方最舒服的一颗。找到对方最好的落点，再试它附近的几颗子，
  // 谁被拿走后对方的最强点降得最多就偷谁；前几名里随机，避免每局都偷同一颗。
  const p = bestPoint(board, game.size, opp, game.sealed);
  if (p < 0) return -1;
  const pr = (p / game.size) | 0;
  const pc = p % game.size;
  const candidates = new Set();
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== opp) continue;
    const r = (i / game.size) | 0;
    const c = i % game.size;
    if (Math.max(Math.abs(r - pr), Math.abs(c - pc)) <= 2) candidates.add(i);
  }
  if (game.lastMove >= 0 && board[game.lastMove] === opp) candidates.add(game.lastMove);
  if (!candidates.size) return -1;

  const scored = [];
  for (const s of candidates) {
    board[s] = 0;
    const after = bestPoint(board, game.size, opp, game.sealed);
    const score = after >= 0 ? pointValue(board, game.size, after, opp) : 0;
    board[s] = opp;
    scored.push({ s, score });
  }
  scored.sort((a, b) => a.score - b.score);
  const bestScore = scored[0].score;
  const pool = scored.filter((x) => x.score <= bestScore + V.OPEN3 * 2).slice(0, 4);
  return pool[Math.floor(Math.random() * pool.length)].s;
}

/** 某一方当前最强的几个落点（用于封点 / 偷子目标） */
function topPoints(board, size, p, sealed, n = 3) {
  const searcher = new Searcher({ board, sealed, size }, p);
  return searcher.candidates(p, n).map((m) => m.i);
}

function bestPoint(board, size, p, sealed) {
  const cands = topPoints(board, size, p, sealed, 1);
  return cands.length ? cands[0] : -1;
}

function chooseSealTarget(game, side) {
  const opp = OPP(side);
  const oppWins = winningMoves(game.board, game.size, opp, game.sealed);
  if (oppWins.length) {
    const valid = oppWins.filter((w) => !game.board[w] && !game.sealed[w]);
    return valid.length ? valid[Math.floor(Math.random() * valid.length)] : -1;
  }
  return -1;
}

/** 连手：找一对落子后能做出「两个成五点」的组合（对方堵不过来） */
function findDoublePair(game, side) {
  const searcher = new Searcher(game, side);
  const cands = searcher.candidates(side, 7).map((m) => m.i);
  const opp = OPP(side);
  const oppWeight = searcher.tuning.oppWeight;
  const found = [];
  for (let a = 0; a < cands.length; a++) {
    const A = cands[a];
    if (!canPlay(game, A, side)) continue;
    searcher.add(A, side);
    if (isWinAt(searcher.board, game.size, A, side)) { searcher.remove(A, side); continue; }
    for (let b = a + 1; b < cands.length; b++) {
      const B = cands[b];
      if (!canPlay(game, B, side)) continue;
      searcher.add(B, side);
      const myWins = winningMoves(searcher.board, game.size, side, game.sealed).length;
      const oppWins = winningMoves(searcher.board, game.size, opp, game.sealed).length;
      const ev = searcher.totals[side] - searcher.totals[opp] * oppWeight;
      searcher.remove(B, side);
      if (oppWins === 0 && myWins >= 2) {
        found.push({ pair: [A, B], score: myWins * 1e6 + ev });
      }
    }
    searcher.remove(A, side);
  }
  if (!found.length) return null;
  found.sort((a, b) => b.score - a.score);
  const best = found[0].score;
  const margin = Math.max(60000, Math.abs(best) * 0.1);
  const pool = found.filter((x) => x.score >= best - margin).slice(0, 4);
  return pool[Math.floor(Math.random() * pool.length)].pair;
}

function pickWeighted(list) {
  const total = list.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const x of list) {
    r -= x.w;
    if (r <= 0) return x;
  }
  return list[0];
}

/**
 * 「我太帅了」这一回合要不要掀桌。
 * 只给 level 4 用；返回的目标点直接喂给 applySteal / applySeal，
 * double 为真时 doubleMoves 是已经验算过的一对落子（能做出双威胁）。
 *
 * 去套路化的关键：不再「一有四就偷、一能双就双」。
 * 每局给这只 bot 抽一个 cheatMood（掀桌心情）和一个 favorite（偏好能力），
 * 再叠加随机；但对方真的有两个成五点（普通堵一手挡不住）时一定出手，
 * 所以随机只改变「怎么破」和「什么时候破」，不会把它随机成傻子。
 *
 * @returns {{steal:number|null, seal:number|null, double:boolean, doubleMoves:number[]|null, reasons:object}}
 */
export function planAbilities(game, side) {
  const out = { steal: null, seal: null, double: false, doubleMoves: null, reasons: {} };
  if (game.over) return out;
  const level = levelOf(game, side);
  if (level < 4) return out;
  const avail = game.abilities[side] || {};
  if (!avail.steal && !avail.seal && !avail.double) return out;
  if (game.moves.length < 4) return out;          // 开局先正常下，别一上来就掀桌

  const tune = game.sides?.[side]?.tuning || DEFAULT_TUNING;
  const mood = Number.isFinite(tune.cheatMood) ? tune.cheatMood : 0.55;
  const fav = tune.cheatFavorite || 'steal';
  const chance = (base, bonus = 0) => Math.random() < Math.min(0.94, base * (0.65 + mood * 0.7) + bonus);
  const favBonus = (type, bonus) => (fav === type ? bonus : 0);

  const opp = OPP(side);
  const myWins = winningMoves(game.board, game.size, side, game.sealed);
  if (myWins.length) return out;                   // 能赢就正常赢

  const oppWins = winningMoves(game.board, game.size, opp, game.sealed);

  /* ---------- 对方已经做成四：防守优先 ---------- */
  if (oppWins.length) {
    const must = oppWins.length >= 2;
    const options = [];
    if (avail.steal) {
      const target = chooseStealTarget(game, side, true);
      if (target >= 0) options.push({ type: 'steal', target, w: fav === 'steal' ? 1.7 : 1 });
    }
    if (avail.seal) {
      const target = chooseSealTarget(game, side);
      if (target >= 0) options.push({ type: 'seal', target, w: fav === 'seal' ? 1.7 : 1 });
    }
    if (!options.length) return out;

    // 只有一个成五点：普通堵一手就够了，偶尔才用能力换一个进攻回合。
    if (!must && !chance(0.45)) return out;

    const pick = pickWeighted(options);
    if (pick.type === 'steal') {
      out.steal = pick.target;
      out.reasons.steal = must
        ? '你已经做出两个成五点了，我偷掉一颗，规则没说不行。'
        : '你这颗子放得太舒服了，我拿走。';
    } else {
      out.seal = pick.target;
      out.reasons.seal = '这个五连点归我了，你换条路吧。';
    }

    // 两个成五点 + 两张牌都在：偶尔两张一起打，剩下的交给下一手堵
    if (must && options.length === 2 && Math.random() < 0.2 + mood * 0.15) {
      const other = options.find((o) => o.type !== pick.type);
      if (other) {
        if (other.type === 'steal') {
          out.steal = other.target;
          out.reasons.steal = '你已经做出两个成五点了，我偷掉一颗，规则没说不行。';
        } else {
          out.seal = other.target;
          out.reasons.seal = '这个五连点归我了，你换条路吧。';
        }
      }
    }
    return out;
  }

  /* ---------- 没有立刻成五：偶尔提前拆招 / 做杀 ---------- */
  // 预先封掉对方做活四的点
  if (avail.seal && chance(0.28, favBonus('seal', 0.18))) {
    const pts = topPoints(game.board, game.size, opp, game.sealed, 3);
    const strong = pts.filter((i) => pointValue(game.board, game.size, i, opp) >= V.OPEN4);
    if (strong.length) {
      const mine = bestPoint(game.board, game.size, side, game.sealed);
      const ms = mine >= 0 ? pointValue(game.board, game.size, mine, side) : 0;
      if (ms < V.FOUR) {
        out.seal = strong[Math.floor(Math.random() * strong.length)];
        out.reasons.seal = '你这里要做活四了，先封为敬。';
      }
    }
  }

  // 没有封点机会时，偶尔提前偷一颗对方最顺的子
  if (!out.seal && avail.steal && game.moves.length >= 8 && chance(0.14, favBonus('steal', 0.12))) {
    const target = chooseStealTarget(game, side, false);
    if (target >= 0) {
      out.steal = target;
      out.reasons.steal = '你这块棋太顺了，我拆一颗。';
    }
  }

  // 连手：只在没有用别的牌、且抽到「想掀桌」时找一对双威胁
  if (avail.double && !out.seal && !out.steal && chance(0.4, favBonus('double', 0.2))) {
    const pair = findDoublePair(game, side);
    if (pair) {
      out.double = true;
      out.doubleMoves = pair;
      out.reasons.double = '连下两手，这局到此为止。';
    }
  }
  return out;
}

/* ================================================================== */
/* 战绩（本机 localStorage；和扫雷一样只存这台设备）                    */
/* ================================================================== */

const RECORD_KEY = 'ft.terminal.gomoku.record';
const SERIES_KEY = 'ft.terminal.gomoku.series';

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : fallback;
  } catch { return fallback; }
}

function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 隐私模式忽略 */ }
}

/** 人类 vs bot 的总战绩：{ [botId]: {win, loss, draw} } */
export function loadRecord() {
  const raw = readJSON(RECORD_KEY, {});
  const out = {};
  for (const bot of BOTS) {
    const r = raw[bot.id];
    out[bot.id] = {
      win: Number.isFinite(r?.win) ? r.win : 0,
      loss: Number.isFinite(r?.loss) ? r.loss : 0,
      draw: Number.isFinite(r?.draw) ? r.draw : 0,
    };
  }
  return out;
}

/** 记一局人机结果：result = 'win' | 'loss' | 'draw'（从人类视角） */
export function recordResult(botId, result) {
  const rec = loadRecord();
  if (!rec[botId]) rec[botId] = { win: 0, loss: 0, draw: 0 };
  if (result === 'win') rec[botId].win++;
  else if (result === 'loss') rec[botId].loss++;
  else rec[botId].draw++;
  writeJSON(RECORD_KEY, rec);
  return rec;
}

export function resetRecord() {
  writeJSON(RECORD_KEY, {});
  return loadRecord();
}

/** 观战对局比分：按「黑 id / 白 id」分别记 {black, white, draw} */
export function loadSeries() {
  const raw = readJSON(SERIES_KEY, {});
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

const normSeries = (v) => ({
  black: Number.isFinite(v?.black) ? v.black : 0,
  white: Number.isFinite(v?.white) ? v.white : 0,
  draw: Number.isFinite(v?.draw) ? v.draw : 0,
});

export function recordSeries(blackId, whiteId, winner) {
  const all = loadSeries();
  const key = `${blackId}>${whiteId}`;
  const cur = normSeries(all[key]);
  if (winner === BLACK) cur.black++;
  else if (winner === WHITE) cur.white++;
  else cur.draw++;
  all[key] = cur;
  writeJSON(SERIES_KEY, all);
  return cur;
}

export function seriesFor(blackId, whiteId) {
  const all = loadSeries();
  return normSeries(all[`${blackId}>${whiteId}`]);
}

export function resetSeries() {
  writeJSON(SERIES_KEY, {});
}

/* ================================================================== */
/* 给界面用的小工具                                                    */
/* ================================================================== */

const COLS = 'ABCDEFGHIJKLMNO';
export function coordName(idx, size = SIZE) {
  if (idx < 0) return '—';
  const r = (idx / size) | 0;
  const c = idx % size;
  return `${COLS[c] || '?'}${r + 1}`;
}

/** 当前局面给某一方的粗略评估（仅用于界面展示「优势」） */
export function positionEval(game, side) {
  const searcher = new Searcher(game, side);
  const tune = searcher.tuning;
  const v = searcher.totals[side] - searcher.totals[OPP(side)] * tune.oppWeight;
  return v;
}
