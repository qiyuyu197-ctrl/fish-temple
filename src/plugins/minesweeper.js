/**
 * plugins/minesweeper.js — 扫雷核心（纯逻辑，不碰 DOM）
 * ------------------------------------------------------------------
 * 引擎与视图分开：这里只负责「规则」，src/views/mine.js 负责画和交互。
 * 好处是自检可以脱离 UI 直接跑规则（首点安全、洪水展开、和弦、胜负判定）。
 *
 * 几个刻意的设计：
 *   · 雷在**第一次点击之后**才布置，并且避开点击格及其八邻域
 *     —— 保证第一下必定点出一片空地，不会一上来就炸
 *   · 状态是一份纯数据（cells 是一维数组），复制/断言都很方便
 *   · 每个会改状态的操作都返回「发生了什么」（开了哪些格子、是否踩雷…），
 *     视图据此播动画，不用自己 diff
 */

/** 三档难度。expert 比经典 30×16/99 略小，为的是在常见屏宽下不横向滚动。 */
export const LEVELS = [
  { id: 'beginner', label: '初级', cn: 'BEGINNER', cols: 9, rows: 9, mines: 10 },
  { id: 'intermediate', label: '中级', cn: 'INTERMEDIATE', cols: 16, rows: 16, mines: 40 },
  { id: 'expert', label: '高级', cn: 'EXPERT', cols: 24, rows: 16, mines: 75 },
];

export const getLevel = (id) => LEVELS.find((l) => l.id === id) || LEVELS[0];

const idx = (s, r, c) => r * s.cols + c;
const inBounds = (s, r, c) => r >= 0 && c >= 0 && r < s.rows && c < s.cols;

/** 八邻域坐标（越界的会被过滤掉） */
export function neighbors(s, r, c) {
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (inBounds(s, nr, nc)) out.push([nr, nc]);
    }
  }
  return out;
}

/** 开一局新游戏（此时还没有雷，等第一次点击） */
export function createGame(levelId = 'beginner') {
  const lv = getLevel(levelId);
  return {
    level: lv.id,
    cols: lv.cols,
    rows: lv.rows,
    mines: lv.mines,
    cells: Array.from({ length: lv.cols * lv.rows }, () => ({ mine: false, adj: 0, open: false, flag: false, boom: false })),
    placed: false,     // 雷是否已布置
    over: false,
    won: false,
    opened: 0,
    flags: 0,
    startedAt: 0,      // 第一次点击的时刻（毫秒）
    endedAt: 0,
  };
}

const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

/** 布置雷：排除 (safeR, safeC) 与其八邻域 */
export function placeMines(s, safeR, safeC) {
  const banned = new Set([idx(s, safeR, safeC), ...neighbors(s, safeR, safeC).map(([r, c]) => idx(s, r, c))]);
  const pool = [];
  for (let i = 0; i < s.cells.length; i++) if (!banned.has(i)) pool.push(i);
  // 棋盘太小时（理论上不会出现）退化为只排除点击格
  if (pool.length < s.mines) {
    pool.length = 0;
    for (let i = 0; i < s.cells.length; i++) if (i !== idx(s, safeR, safeC)) pool.push(i);
  }
  shuffle(pool);
  pool.slice(0, s.mines).forEach((i) => { s.cells[i].mine = true; });
  for (let r = 0; r < s.rows; r++) {
    for (let c = 0; c < s.cols; c++) {
      const cell = s.cells[idx(s, r, c)];
      if (cell.mine) continue;
      cell.adj = neighbors(s, r, c).filter(([nr, nc]) => s.cells[idx(s, nr, nc)].mine).length;
    }
  }
  s.placed = true;
  return s;
}

const checkWin = (s) => {
  if (s.won || s.over) return false;
  if (s.opened === s.cols * s.rows - s.mines) {
    s.won = true;
    s.over = true;
    s.endedAt = Date.now();
    // 胜利时把没插旗的雷都补上旗，画面更完整
    s.cells.forEach((cell) => { if (cell.mine) cell.flag = true; });
    s.flags = s.mines;
    return true;
  }
  return false;
};

/**
 * 挖开一格。
 * @returns {{ok:boolean,reason?:string,opened?:number[],boom?:boolean,won?:boolean}}
 */
export function reveal(s, r, c) {
  if (s.over) return { ok: false, reason: 'over' };
  if (!inBounds(s, r, c)) return { ok: false, reason: 'bounds' };
  const cell = s.cells[idx(s, r, c)];
  if (cell.flag) return { ok: false, reason: 'flagged' };
  if (cell.open) return { ok: false, reason: 'open' };
  if (!s.placed) { placeMines(s, r, c); s.startedAt = Date.now(); }
  if (!s.startedAt) s.startedAt = Date.now();

  // 踩雷
  if (cell.mine) {
    cell.open = true;
    cell.boom = true;
    s.over = true;
    s.endedAt = Date.now();
    return { ok: true, boom: true, opened: [idx(s, r, c)] };
  }

  // 洪水展开：从这一格开始，遇到 adj>0 的格子只开它自己，不再往外扩
  const opened = [];
  const stack = [[r, c]];
  while (stack.length) {
    const [cr, cc] = stack.pop();
    const cur = s.cells[idx(s, cr, cc)];
    if (cur.open || cur.flag || cur.mine) continue;
    cur.open = true;
    s.opened++;
    opened.push(idx(s, cr, cc));
    if (cur.adj === 0) {
      neighbors(s, cr, cc).forEach(([nr, nc]) => {
        const n = s.cells[idx(s, nr, nc)];
        if (!n.open && !n.flag && !n.mine) stack.push([nr, nc]);
      });
    }
  }
  const won = checkWin(s);
  return { ok: true, opened, won };
}

/** 插旗 / 取消插旗 */
export function toggleFlag(s, r, c) {
  if (s.over || !inBounds(s, r, c)) return { ok: false };
  const cell = s.cells[idx(s, r, c)];
  if (cell.open) return { ok: false, reason: 'open' };
  cell.flag = !cell.flag;
  s.flags += cell.flag ? 1 : -1;
  return { ok: true, flag: cell.flag };
}

/** 这一格现在能不能「和弦」：已挖开、数字 > 0、周围旗数够了、还有没开的邻居 */
export function canChord(s, r, c) {
  if (s.over || !inBounds(s, r, c)) return false;
  const cell = s.cells[idx(s, r, c)];
  if (!cell.open || cell.adj <= 0) return false;
  const ns = neighbors(s, r, c);
  const flagged = ns.filter(([nr, nc]) => s.cells[idx(s, nr, nc)].flag).length;
  if (flagged !== cell.adj) return false;
  return ns.some(([nr, nc]) => {
    const n = s.cells[idx(s, nr, nc)];
    return !n.open && !n.flag;
  });
}

/** 和弦：一次性挖开周围所有没插旗的格子（旗插错了就会踩雷，和经典规则一致） */
export function chord(s, r, c) {
  if (!canChord(s, r, c)) return { ok: false, reason: 'not-chordable' };
  const opened = [];
  let boom = false;
  for (const [nr, nc] of neighbors(s, r, c)) {
    const n = s.cells[idx(s, nr, nc)];
    if (n.open || n.flag) continue;
    const res = reveal(s, nr, nc);
    if (res.opened) opened.push(...res.opened);
    if (res.boom) { boom = true; break; }
  }
  return { ok: true, opened, boom, won: s.won };
}

/** 失败时把所有雷翻出来（视图据此播级联动画） */
export function revealMines(s, boomIndex = -1) {
  const out = [];
  s.cells.forEach((cell, i) => {
    if (cell.mine && !cell.flag) {
      cell.open = true;
      out.push(i);
    }
  });
  return { mines: out, boomIndex, wrongFlags: wrongFlags(s) };
}

/** 插错的旗（那格其实不是雷），失败结算时标出来 */
export function wrongFlags(s) {
  const out = [];
  s.cells.forEach((cell, i) => { if (cell.flag && !cell.mine) out.push(i); });
  return out;
}

/** 剩余雷数（可能为负：旗插多了） */
export const minesLeft = (s) => s.mines - s.flags;

/** 已用的毫秒数；结束的游戏定格在 endedAt */
export function elapsedMs(s, now = Date.now()) {
  if (!s.startedAt) return 0;
  return Math.max(0, (s.endedAt || now) - s.startedAt);
}

/** 已用秒数（整数，给界面显示用）；结束的游戏定格在 endedAt */
export function elapsed(s, now = Date.now()) {
  return Math.floor(elapsedMs(s, now) / 1000);
}

/** 进度：已挖开格数 / 需要挖开的格数 */
export function progress(s) {
  const total = s.cols * s.rows - s.mines;
  return total <= 0 ? 0 : Math.min(1, s.opened / total);
}

/** 胜负与统计数据（存在 localStorage，按难度分开记） */
const STATS_KEY = 'ft.terminal.mines';
/** 上一局的对局快照（切板块 / 刷新页面都能接着玩） */
const GAME_KEY = 'ft.terminal.mines.game';

export function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return data && typeof data === 'object' ? data : {};
  } catch { return {}; }
}

export function saveStats(stats) {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch { /* 隐私模式下忽略 */ }
}

/** 记一局结果：{ played, won, best } */
export function recordResult(levelId, won, seconds) {
  const stats = loadStats();
  const cur = stats[levelId] || { played: 0, won: 0, best: 0 };
  cur.played += 1;
  if (won) {
    cur.won += 1;
    if (!cur.best || seconds < cur.best) cur.best = seconds;
  }
  stats[levelId] = cur;
  saveStats(stats);
  return stats;
}

export function resetStats() {
  saveStats({});
  return {};
}

/* ---------------- 对局快照（切板块 / 刷新页面不断开） ----------------
 * 这张快照同时服务两条路：
 *   · 切板块：视图卸载时把快照留在模块内存里，切回来直接用（最快，不碰存储）
 *   · 刷新页面：同一份快照写进 localStorage，重载后还能接着玩
 *
 * 计时这一块要特别处理：state 里的 startedAt 是绝对时间戳，
 * 直接把整局存下来再读回来，离开的那段时间会被算进用时。
 * 所以快照里存的是「离开时已经用了几秒」（elapsedBefore），
 * 读回来时反推出新的 startedAt —— 相当于离开即暂停，回来接着走。
 */

export function serializeGame(s, extra = {}) {
  return {
    v: 1,
    level: s.level,
    cols: s.cols,
    rows: s.rows,
    mines: s.mines,
    placed: s.placed,
    over: s.over,
    won: s.won,
    opened: s.opened,
    flags: s.flags,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    // 每格压成 5 个数字，384 格的专家局也只有十来 KB
    cells: s.cells.map((c) => [c.mine ? 1 : 0, c.adj, c.open ? 1 : 0, c.flag ? 1 : 0, c.boom ? 1 : 0]),
    cursor: 0,
    flagMode: false,
    elapsedBefore: 0,
    ...extra,
  };
}

const emptyCell = () => ({ mine: false, adj: 0, open: false, flag: false, boom: false });

/**
 * 还原快照。任何一处对不上就返回 null（宁可开新局，也不要还原出一个坏棋盘）。
 * @returns {null | {game:object, cursor:number, flagMode:boolean}}
 */
export function deserializeGame(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const lv = LEVELS.find((l) => l.id === raw.level);
  if (!lv) return null;
  if (raw.cols !== lv.cols || raw.rows !== lv.rows || raw.mines !== lv.mines) return null;
  if (!Array.isArray(raw.cells) || raw.cells.length !== lv.cols * lv.rows) return null;

  const cells = raw.cells.map((c) => (Array.isArray(c) && c.length >= 5
    ? { mine: !!c[0], adj: Number(c[1]) || 0, open: !!c[2], flag: !!c[3], boom: !!c[4] }
    : emptyCell()));
  // 雷数必须对得上（布置过 = 正好 mines 颗）
  const mineCount = cells.filter((c) => c.mine).length;
  if (mineCount !== (raw.placed ? lv.mines : 0)) return null;

  const opened = Number(raw.opened) || 0;
  if (opened > lv.cols * lv.rows - lv.mines) return null;

  const over = !!raw.over;
  const endedAt = Number(raw.endedAt) || 0;
  const storedStart = Number(raw.startedAt) || 0;
  const elapsedBefore = Math.max(0, Number(raw.elapsedBefore) || 0);
  // 未结束、且已经起表的局：把「离开前已经用了多久」折算回绝对起点，等于离开即暂停。
  // 注意用 startedAt 判断「起没起表」，不能用 elapsedBefore 是否非零 —— 玩了不到一秒就走，
  // elapsedBefore 会是 0，那样会把离开的时间也算进去。
  const startedAt = (!over && storedStart)
    ? Date.now() - Math.round(elapsedBefore * 1000)
    : storedStart;

  return {
    game: {
      level: lv.id,
      cols: lv.cols,
      rows: lv.rows,
      mines: lv.mines,
      cells,
      placed: !!raw.placed,
      over,
      won: !!raw.won,
      opened,
      flags: Number(raw.flags) || 0,
      startedAt,
      endedAt: over ? (endedAt || storedStart) : 0,
    },
    cursor: Math.max(0, Math.min(cells.length - 1, Number(raw.cursor) || 0)),
    flagMode: !!raw.flagMode,
  };
}

export function saveGame(payload) {
  try { localStorage.setItem(GAME_KEY, JSON.stringify(payload)); } catch { /* 隐私模式下忽略 */ }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(GAME_KEY);
    return raw ? deserializeGame(JSON.parse(raw)) : null;
  } catch { return null; }
}

export function clearGame() {
  try { localStorage.removeItem(GAME_KEY); } catch { /* 忽略 */ }
}
