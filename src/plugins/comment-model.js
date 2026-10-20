/**
 * plugins/comment-model.js — 评论的纯逻辑模型（不碰 DOM、不碰存储）
 * ------------------------------------------------------------------
 * 服务端（server.mjs）、前端（views/post.js）、自检三方共用这一份规则 ✓
 * —— 校验只写一遍，就不会出现"前端放行、服务端拒绝"或反过来的裂缝 ✗
 *
 * 站主确认的规格：
 *   · 支持**楼中楼**（一层就够：回复只挂在顶层评论下，再回复仍挂同一层 ✓）
 *   · 支持**图片评论**（单张），和头像同一套白名单：data:image/*;base64 或 http(s) ✓
 *   · 正文 1–1000 字；正文可以为空，但**正文和图片不能同时为空** ✓
 *
 * 安全上的三条硬规矩：
 *   ① 正文**不做任何 HTML 解析**，原样存、渲染时由视图 esc() ✓（评论是 XSS 首选入口 ✗）
 *   ② 图片只认白名单：`javascript:` / `data:text/html` / `blob:` 一律拒绝 ✓
 *   ③ 内联图片上限 80KB（与头像一致 ✓）—— 再大就要求用图片地址，别把存储撑爆 ✗
 */

export const MAX_BODY = 1000;
export const MAX_IMAGE_CHARS = 80000;   // data URL 字符数上限（约 60KB 原图）
export const MAX_DEPTH = 1;             // 楼中楼只做一层 ✓

const CTRL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/** 校验正文：返回 { ok, text, error } */
export function validateBody(raw) {
  const text = String(raw ?? '').replace(/\r\n/g, '\n').trim();
  if (text.length > MAX_BODY) return { ok: false, text, error: `正文最多 ${MAX_BODY} 字` };
  if (CTRL.test(text)) return { ok: false, text, error: '正文里有控制字符' };
  return { ok: true, text };
}

/** 校验图片：只认 data:image/(png|jpeg|webp|gif);base64 或 http(s) ✓ */
export function validateImage(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { ok: true, image: '' };
  if (s.length > MAX_IMAGE_CHARS) return { ok: false, image: '', error: `内联图片太大（上限 ${Math.round(MAX_IMAGE_CHARS / 1000)}k 字符），请改用图片地址` };
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(s)) return { ok: true, image: s };
  if (/^https?:\/\/\S+$/i.test(s)) return { ok: true, image: s };
  return { ok: false, image: '', error: '图片只接受 data:image/…;base64 或 http(s) 地址' };
}

/** 造一条评论（id 由调用方给，服务端用它保证唯一 ✓） */
export function makeComment({ id, sub, name, picture = '', body = '', image = '', parentId = null, at }) {
  return {
    id,
    sub: String(sub || ''),
    name: String(name || '匿名').slice(0, 24),
    picture: String(picture || ''),
    body: String(body || ''),
    image: String(image || ''),
    parentId: parentId || null,
    at: at || new Date().toISOString(),
  };
}

/**
 * 前后端共用的一次性校验：给"要发出去的评论"做体检 ✓
 * @returns {{ ok: boolean, value?: object, error?: string }}
 */
export function validateComment(input = {}) {
  const b = validateBody(input.body);
  if (!b.ok) return { ok: false, error: b.error };
  const im = validateImage(input.image);
  if (!im.ok) return { ok: false, error: im.error };
  if (!b.text && !im.image) return { ok: false, error: '写点字或者配张图，别发空评论' };
  return { ok: true, value: { body: b.text, image: im.image } };
}

/** 谁能删：作者本人，或站长（role === 'owner'）✓ */
export function canDelete(comment, actor) {
  if (!comment || !actor) return false;
  if (actor.role === 'owner') return true;
  return !!comment.sub && comment.sub === actor.sub;
}

/**
 * 把扁平列表整理成**两层**树：顶层评论 + 各自的回复 ✓
 *   · 找不到父评论的孤儿评论 → 提升为顶层（不能让数据错误把评论吃掉 ✗）
 *   · 回复的回复（depth > MAX_DEPTH）→ 挂到同一个顶层下（楼中楼只做一层 ✓）
 */
export function nestTree(items = []) {
  const list = items.filter(Boolean).slice();
  const byId = new Map(list.map((c) => [c.id, c]));
  const rootOf = (c) => {
    let cur = c;
    let guard = 0;
    while (cur.parentId && byId.has(cur.parentId) && guard < 8) {
      cur = byId.get(cur.parentId);
      guard += 1;
    }
    return cur;
  };
  const roots = [];
  const childrenOf = new Map();
  for (const c of list) {
    const root = rootOf(c);
    if (root === c) { roots.push(c); continue; }
    if (!childrenOf.has(root.id)) childrenOf.set(root.id, []);
    childrenOf.get(root.id).push(c);
  }
  const byTime = (a, b) => String(a.at).localeCompare(String(b.at));
  roots.sort(byTime);
  return roots.map((r) => ({ ...r, replies: (childrenOf.get(r.id) || []).sort(byTime) }));
}

/** 总条数（顶层 + 回复 ✓）—— 帖子列表上的"💬 N"用它 ✓ */
export const countAll = (items = []) => items.filter(Boolean).length;
