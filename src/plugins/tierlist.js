/**
 * plugins/tierlist.js — Tier List 核心（纯逻辑，不碰 DOM）
 * ------------------------------------------------------------------
 * 引擎与视图分开（和扫雷/UNO 同一个套路）：
 *   · 状态是可 JSON 序列化的纯数据 ✓ → 存档/导出/联机都能直接用
 *   · 每个操作都是纯函数（不改入参，返回新状态 + 说明发生了什么）✓
 *   · 自检可以脱离浏览器直接跑 ✓
 *
 * 数据形状：
 *   { tiers: [{ id, label, color }], items: [{ id, label, image, tier }] }
 *   tier 为 null 表示"还没分级"（在素材区）✓
 *
 * 设计取舍：
 *   · 默认六档 S/A/B/C/D/E（Tier List 的通用做法 ✓），可增删 ✓
 *   · 同一档内按 items 数组顺序排列（拖动 = 先移档、再定序 ✓）
 *   · 不做"图片上传"，只收 data URL 或 http(s) 地址 ✓（和站里头像同一套策略 ✓）
 */

export const DEFAULT_TIERS = [
  { id: 't-s', label: 'S', color: '#e5484d' },
  { id: 't-a', label: 'A', color: '#ff8f1f' },
  { id: 't-b', label: 'B', color: '#ffd400' },
  { id: 't-c', label: 'C', color: '#46a758' },
  { id: 't-d', label: 'D', color: '#3b82f6' },
  { id: 't-e', label: 'E', color: '#8b8b8b' },
];

let seq = 0;
const nextId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(seq += 1).toString(36)}`;

/** 新建一张空的 Tier List */
export function createBoard() {
  return { tiers: DEFAULT_TIERS.map((t) => ({ ...t })), items: [] };
}

/** 只接受 data:image/*;base64 或 http(s) 图片地址（与站里头像同一套策略，防 javascript: 之类） */
export function safeImage(src) {
  const s = String(src || '').trim();
  if (!s) return '';
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(s)) return s;
  if (/^https?:\/\//i.test(s)) return s;
  return '';
}

/** 加一张卡片（label 可空，图片可空，但不能两个都空） */
export function addItem(board, { label = '', image = '' } = {}) {
  const text = String(label || '').trim().slice(0, 40);
  const img = safeImage(image);
  if (!text && !img) return { board, error: '至少给一个名字或一张图' };
  const item = { id: nextId('i'), label: text, image: img, tier: null };
  return { board: { ...board, items: [...board.items, item] }, item };
}

/** 删掉一张卡片 */
export function removeItem(board, itemId) {
  return { ...board, items: board.items.filter((i) => i.id !== itemId) };
}

/**
 * 把卡片移动到某个档位。
 * @param {string|null} tierId  目标档位（null = 素材区）
 * @param {number} [at]         落点在该档里的位置（省略 = 末尾）
 */
export function moveItem(board, itemId, tierId, at = null) {
  const item = board.items.find((i) => i.id === itemId);
  if (!item) return { board, error: '没有这张卡片' };
  if (tierId !== null && !board.tiers.some((t) => t.id === tierId)) return { board, error: '没有这个档位' };

  const rest = board.items.filter((i) => i.id !== itemId);
  const moved = { ...item, tier: tierId };

  if (at === null) return { board: { ...board, items: [...rest, moved] }, item: moved };

  // 插入到"目标档位里第 at 个位置"：先把该档的索引找出来，再插进去
  const inTier = rest.filter((i) => i.tier === tierId);
  const anchor = inTier[Math.max(0, Math.min(at, inTier.length - 1))];
  if (!anchor) return { board: { ...board, items: [...rest, moved] }, item: moved };
  const idx = rest.indexOf(anchor);
  const items = [...rest.slice(0, idx + (at > 0 ? 1 : 0)), moved, ...rest.slice(idx + (at > 0 ? 1 : 0))];
  return { board: { ...board, items }, item: moved };
}

/** 某一档里的卡片（按当前顺序） */
export const itemsIn = (board, tierId) => board.items.filter((i) => i.tier === tierId);

/** 还没分级的卡片 */
export const unassigned = (board) => board.items.filter((i) => i.tier === null);

/** 改档位名/颜色 */
export function updateTier(board, tierId, patch = {}) {
  return {
    ...board,
    tiers: board.tiers.map((t) => (t.id === tierId
      ? { ...t, label: String(patch.label ?? t.label).slice(0, 6), color: patch.color || t.color }
      : t)),
  };
}

/** 加一个新档位（默认放在最后） */
export function addTier(board, { label = '新档', color = '#8b8b8b' } = {}) {
  const tier = { id: nextId('t'), label: String(label).slice(0, 6), color };
  return { board: { ...board, tiers: [...board.tiers, tier] }, tier };
}

/** 删一个档位（里面的卡片退回素材区，不丢 ✓） */
export function removeTier(board, tierId) {
  if (board.tiers.length <= 1) return { board, error: '至少保留一个档位' };
  return {
    ...board,
    tiers: board.tiers.filter((t) => t.id !== tierId),
    items: board.items.map((i) => (i.tier === tierId ? { ...i, tier: null } : i)),
  };
}

/* ---- 存档 ---- */

export const serialize = (board) => JSON.stringify({ v: 1, ...board });

export function deserialize(raw) {
  try {
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.tiers) || !Array.isArray(data.items)) return null;
    // 兜底：不合法的档位引用一律退回素材区，别让界面崩
    const tierIds = new Set(data.tiers.map((t) => t.id));
    return {
      tiers: data.tiers.map((t) => ({ id: String(t.id), label: String(t.label || '?').slice(0, 6), color: String(t.color || '#8b8b8b') })),
      items: data.items.map((i) => ({
        id: String(i.id),
        label: String(i.label || '').slice(0, 40),
        image: safeImage(i.image),
        tier: tierIds.has(i.tier) ? i.tier : null,
      })),
    };
  } catch { return null; }
}
