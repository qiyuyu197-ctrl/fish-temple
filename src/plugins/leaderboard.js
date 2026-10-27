/**
 * plugins/leaderboard.js — 排行榜的纯逻辑（不碰 DOM、不碰存储）
 * ------------------------------------------------------------------
 * 站主要求：
 *   · **扫雷**按**通关时间**排名（越小越好 ✓）
 *   · **像素小鱼**按**游戏内积分**排名（越大越好 ✓）
 *   · 一局结束后有「上传成绩」按钮 ✓
 *
 * 服务端（校验/排名）与前端（显示/按钮状态）**共用这一份规则** ✓
 * —— 校验只写一遍，就不会出现"前端能传、服务端 400"的裂缝 ✗
 *
 * 反作弊的边界（说清楚，别期待它像竞技游戏）：
 *   · 这是**纯前端游戏** ✓ → 分数在客户端算出来，**理论上可以伪造** ✗
 *   · 所以只做"**合理性校验**"：范围、时间下限（扫雷不可能 0.2 秒通关 ✗）、
 *     每 10 秒最多提交一次 ✓、昵称长度与字符 ✓
 *   · 真正的防作弊得服务端跑游戏逻辑 ✗ —— 那需要把游戏状态搬到服务端 ✓（以后要做再说 ✓）
 */

export const BOARDS = {
  mines: {
    id: 'mines',
    label: '扫雷 · 通关时间',
    unit: '秒',
    order: 'asc',        // 越小越好 ✓
    min: 3,              // 小于 3 秒的通关基本不可能（9×9 都得点几十下）✓
    max: 3 * 3600,
    decimals: 1,
  },
  fish: {
    id: 'fish',
    label: '像素小鱼 · 积分',
    unit: '分',
    order: 'desc',       // 越大越好 ✓
    min: 1,
    max: 100000,
    decimals: 0,
  },
};

export const MAX_NAME = 12;
export const TOP_N = 20;         // 只存/只回前 20 ✓（排行榜没必要存全量 ✗）
export const COOLDOWN_MS = 10 * 1000;   // 同一账号/昵称 10 秒最多提交一次 ✓

export const getBoard = (id) => BOARDS[String(id || '')] || null;

/** 昵称校验：1–12 字，去控制字符，允许中英文与空格 ✓ */
export function validateName(raw) {
  const name = String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME);
  if (!name) return { ok: false, error: '请填一个昵称（1–12 字）' };
  return { ok: true, name };
}

/**
 * 成绩校验：返回 { ok, score, name, detail, error }
 * @param {string} boardId
 * @param {any} raw  原始分数（可能带小数，比如扫雷 42.7 秒 ✓）
 * @param {object} meta 附加信息（扫雷传难度、小鱼传难度与用时 ✓）
 */
export function validateEntry(boardId, raw, meta = {}) {
  const b = getBoard(boardId);
  if (!b) return { ok: false, error: '没有这个排行榜' };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { ok: false, error: '成绩不是数字' };
  const score = Math.round(n * 10 ** b.decimals) / 10 ** b.decimals;
  if (score < b.min) return { ok: false, error: `成绩不可能小于 ${b.min} ${b.unit}` };
  if (score > b.max) return { ok: false, error: `成绩超过上限（${b.max} ${b.unit}）` };

  // 扫雷：只有"通关"的成绩才有资格上榜 ✓（失败局不传 ✓）
  if (b.id === 'mines') {
    const level = String(meta.level || '');
    if (!['beginner', 'intermediate', 'expert'].includes(level)) return { ok: false, error: '扫雷成绩要带难度' };
    if (!meta.won) return { ok: false, error: '只有通关的对局才能上榜' };
  }
  if (b.id === 'fish') {
    const level = String(meta.level || '');
    if (!['trash', 'easy', 'mid', 'hard'].includes(level)) return { ok: false, error: '小鱼成绩要带难度' };
  }

  const detail = {};
  if (b.id === 'mines') detail.level = String(meta.level);
  if (b.id === 'fish') {
    detail.level = String(meta.level);
    const secs = Number(meta.seconds);
    if (Number.isFinite(secs) && secs > 0) detail.seconds = Math.round(secs);
  }
  return { ok: true, score, meta: detail };
}

/** 排序比较器：扫雷升序（时间小=好 ✓）、小鱼降序（分高=好 ✓） */
export function compare(boardId) {
  const b = getBoard(boardId);
  const dir = b && b.order === 'asc' ? 1 : -1;
  return (x, y) => dir * (Number(x.score) - Number(y.score)) || String(x.at).localeCompare(String(y.at));
}

/** 只保留前 N 名 ✓ */
export const topN = (items, n = TOP_N) => [...(items || [])].slice(0, n);

/** 名次：与榜单比较，返回 1-based 名次（比同分前者数 + 1 ✓） */
export function rankOf(items, boardId, score) {
  const cmp = compare(boardId);
  const probe = { score, at: '9999' };
  const better = (items || []).filter((x) => cmp(x, probe) < 0).length;
  return better + 1;
}

/** 显示用：扫雷 42.7 秒、小鱼 1234 分 ✓ */
export function formatScore(boardId, score) {
  const b = getBoard(boardId);
  if (!b) return String(score);
  return b.id === 'mines' ? `${Number(score).toFixed(b.decimals)}` : String(Math.round(Number(score)));
}
