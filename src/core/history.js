/**
 * core/history.js — 站内播放历史（我们自己的记录，不碰任何第三方账号）
 * ------------------------------------------------------------------
 * 记什么：**在本站真正播放过**的曲目，一条 = `{ id, title, artist, seconds, at, plays }`
 *   · id      曲目标识（网易云曲目用 neteaseId，本地曲目用 track.id）
 *   · title   标题（截断到 120 字，与服务端校验一致）
 *   · artist  艺术家（同上）
 *   · seconds 上次听到的位置（秒）—— 用来「继续播放」
 *   · at      最近一次播放的时间戳（毫秒）
 *   · plays   播放次数（同一首反复播放会累加，不会刷出一堆重复行）
 *
 * 记在哪：**只有你自己的浏览器**（localStorage）。登录之后可以额外同步到
 * 你自己账号下的一份服务端记录（`history/<sha1(sub)>`，本地是 data/ 下、线上是
 * Netlify Blobs），键与你的账号绑定、只有你自己能读写 —— 换设备也能接着听。
 *
 * ⚠️ 明确不做的事：**不接网易云账号、不存任何第三方 cookie、不把记录发给网易云。**
 *    这里的「历史」纯粹是本站自己的一份播放记录（站主的决定，写在 README 里）。
 *
 * 记录时机（照着"真的出声了才算"来，避免把没播成的曲目也记上）：
 *   · `player:state` 报告 `playing && time > 1` 时才算播过（被打回/被系统拦下时
 *     player 会把 playing 报成 false，这里自然就不会记 —— 与"不许谎报在播"一致）；
 *   · 切歌 / 暂停 / 页面进后台时把**当前位置写回**，供下次「继续播放」；
 *   · 位置写回是节流的（默认 8 秒一次），不会每帧都写磁盘。
 */

import { bus } from './bus.js';
import { Player } from './player.js';

const KEY = 'ft.terminal.playHistory';

/** 上限：与服务端校验保持一致（超出丢最旧） */
export const HISTORY_MAX = 200;

/** 位置写回的节流：播放中每前进这么多秒才写一次 localStorage */
const POS_WRITE_GAP_S = 8;

/** 少于一秒的位置不值得记（点了播放又立刻切走） */
const MIN_RECORD_S = 1;

/** 字段上限：与服务端 `HISTORY` 校验一一对应，客户端先自己收干净就不必吃 400 */
const LIMITS = { idLen: 40, textLen: 120, secondsMax: 86400, playsMax: 100000 };

/** id 允许的字符集（与服务端同一套） */
const ID_RE = /^[0-9A-Za-z_-]{1,40}$/;

let items = load();
let tracked = null;        // { id, time, recorded, lastWrite }
let syncTimer = null;
let pendingForce = false;   // 显式清空要让"空列表"也推一次（否则别的设备上看着没生效）
let pulledFor = '';        // 已经为哪个账号拉取并合并过远端记录
let booted = false;

/* ---------------- 本地读写 ---------------- */

const now = () => Date.now();

function cleanText(v, max) {
  return String(v ?? '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')   // 控制字符会把列表布局搞乱
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * 把一条记录收干净；收不干净就返回 null（宁可丢一条脏数据，也不要把
 * 服务端会拒的字段推上去 —— 那会让整次同步 400）。
 */
function cleanEntry(raw) {
  const id = String(raw?.id ?? '').trim();
  if (!ID_RE.test(id)) return null;
  const seconds = Number(raw?.seconds);
  const at = Number(raw?.at);
  const plays = Number(raw?.plays);
  return {
    id,
    title: cleanText(raw?.title, LIMITS.textLen),
    artist: cleanText(raw?.artist, LIMITS.textLen),
    seconds: Number.isFinite(seconds) ? Math.min(Math.max(Math.round(seconds), 0), LIMITS.secondsMax) : 0,
    at: Number.isFinite(at) && at > 0 ? Math.min(Math.round(at), now() + 60_000) : now(),
    plays: Number.isFinite(plays) && plays >= 1 ? Math.min(Math.round(plays), LIMITS.playsMax) : 1,
  };
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.map(cleanEntry).filter(Boolean).slice(0, HISTORY_MAX);
  } catch { return []; }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, HISTORY_MAX)));
  } catch { /* 隐私模式 / 配额满：功能降级成"只在内存里记"，不打扰用户 */ }
  bus.emit('history:change', { items: list(), total: items.length });
}

/* ---------------- 对外：读 ---------------- */

/** 最近播放（按时间倒序） */
export function list() {
  return [...items].sort((a, b) => (b.at || 0) - (a.at || 0));
}

/** 常听：按播放次数倒序（次数相同则最近听的在前） */
export function frequent(n = 5) {
  return [...items]
    .sort((a, b) => (b.plays || 1) - (a.plays || 1) || (b.at || 0) - (a.at || 0))
    .slice(0, Math.max(0, Math.round(n)));
}

/** 上次听到哪里（用于「继续播放」）；没有记录返回 null */
export function resumeFor(id) {
  const key = String(id);
  const hit = items.find((x) => x.id === key);
  if (!hit) return null;
  return { id: hit.id, title: hit.title, seconds: hit.seconds || 0, at: hit.at, plays: hit.plays };
}

/* ---------------- 对外：写 ---------------- */

/**
 * 记一条播放（同一首合并，plays 累加、at 刷新、seconds 取本次位置）。
 * @param {{id?:string,neteaseId?:string,title?:string,artist?:string}} track
 * @param {number} seconds 本次播放到的位置
 */
export function record(track, seconds = 0) {
  const id = trackId(track);
  if (!id) return null;
  const entry = cleanEntry({
    id,
    title: track?.title,
    artist: track?.artist,
    seconds,
    at: now(),
    plays: 1,
  });
  if (!entry) return null;
  const i = items.findIndex((x) => x.id === id);
  if (i >= 0) {
    const prev = items[i];
    items[i] = {
      ...prev,
      ...entry,
      // 位置取本次（用户刚听到的地方）；没给位置就保留上次的
      seconds: Number(seconds) > 0 ? entry.seconds : (prev.seconds || 0),
      plays: Math.min((prev.plays || 1) + 1, LIMITS.playsMax),
    };
  } else {
    items.push(entry);
  }
  items = list().slice(0, HISTORY_MAX);
  persist();
  scheduleSync();
  return items.find((x) => x.id === id) || null;
}

/** 只写回位置（不累加 plays、不动 at 顺序）—— 切歌 / 暂停时用 */
export function touch(id, seconds) {
  const key = String(id);
  const i = items.findIndex((x) => x.id === key);
  if (i < 0) return false;
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return false;
  const next = Math.min(Math.round(s), LIMITS.secondsMax);
  if (next === items[i].seconds) return false;
  items[i] = { ...items[i], seconds: next };
  persist();
  scheduleSync();
  return true;
}

/** 清空（只清我们站内的记录；登录时也会把服务端那份一起清掉） */
export function clear() {
  items = [];
  persist();
  // force：空列表也要推一次，否则"清空"在别的设备上看起来没生效
  scheduleSync(0, { force: true });
  return true;
}

/**
 * 整体替换（同步合并后调用）。
 * 传进来的会先逐条收干净，再按上限截断。
 */
export function replaceAll(next) {
  const cleaned = (Array.isArray(next) ? next : []).map(cleanEntry).filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const e of cleaned.sort((a, b) => (b.at || 0) - (a.at || 0))) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
    if (out.length >= HISTORY_MAX) break;
  }
  items = out;
  persist();
  return items.length;
}

/* ---------------- 播放器挂钩（模块加载即生效，幂等） ---------------- */

function trackId(track) {
  return String(track?.neteaseId || track?.id || '').trim();
}

/** 把当前跟踪中的位置写回（切歌 / 暂停 / 进后台 / 关页面时调用） */
function flushPosition() {
  if (!tracked) return;
  if (tracked.recorded && tracked.time >= MIN_RECORD_S) touch(tracked.id, tracked.time);
  tracked.lastWrite = tracked.time;
}

function beginTrack(track) {
  flushPosition();
  const id = trackId(track);
  tracked = id ? { id, time: 0, recorded: false, lastWrite: 0 } : null;
}

function onTrack({ track } = {}) {
  beginTrack(track);
}

function onState(state = {}) {
  const cur = Player.current;
  const id = trackId(cur);
  if (!id) { tracked = null; return; }
  // 兜底：万一没收到 player:track（或期间换了歌），这里也能跟上
  if (!tracked || tracked.id !== id) beginTrack(cur);

  const time = Number(state.time) || 0;
  tracked.time = time > 0 ? time : tracked.time;

  if (state.playing === true && tracked.time > MIN_RECORD_S && !tracked.recorded) {
    // "真的出声了"才算播过：player 在被系统拦下 / 被打回时会把 playing 报成 false，
    // 所以这里不会把没播成的曲目记进历史（与"不许谎报在播"同一条原则）。
    record(cur, tracked.time);
    tracked.recorded = true;
    tracked.lastWrite = tracked.time;
    return;
  }
  if (state.playing !== true) { flushPosition(); return; }
  if (tracked.recorded && tracked.time - (tracked.lastWrite || 0) >= POS_WRITE_GAP_S) {
    touch(tracked.id, tracked.time);
    tracked.lastWrite = tracked.time;
  }
}

export function initHistory() {
  if (booted || typeof window === 'undefined') return;
  booted = true;
  bus.on('player:track', onTrack);
  bus.on('player:state', onState);
  // 登录 / 退出都会重新走同步：登录时先合并远端，退出后不再推送
  bus.on('auth:user', ({ user } = {}) => {
    pulledFor = '';                       // 换了账号（或退出）→ 下次同步重新拉取
    if (user) scheduleSync(1200);
  });
  // 页面进后台 / 关闭前把位置落盘（手机切后台时最容易被漏掉的就是这一步）
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushPosition(); });
  window.addEventListener('pagehide', () => { flushPosition(); void syncNow(); });
}

/* ---------------- 跨设备同步（可选：登录后才生效） ---------------- */

/** 懒加载 auth：core 不该在启动时就把它拉进来（也避免循环依赖） */
async function lazyAuth() {
  try {
    const mod = await import('../plugins/auth.js');
    return mod.Auth || null;
  } catch { return null; }
}

/** 合并两边的记录：plays 取大、at 取新、seconds 取"较新的那条" */
export function mergeEntries(a, b) {
  const map = new Map();
  for (const raw of [...(a || []), ...(b || [])]) {
    const e = cleanEntry(raw);
    if (!e) continue;
    const cur = map.get(e.id);
    if (!cur) { map.set(e.id, e); continue; }
    const newer = (e.at || 0) >= (cur.at || 0) ? e : cur;
    map.set(e.id, {
      ...cur,
      ...newer,
      plays: Math.max(cur.plays || 1, e.plays || 1) || 1,
      seconds: newer.seconds || 0,
      at: Math.max(cur.at || 0, e.at || 0),
    });
  }
  return [...map.values()].sort((x, y) => (y.at || 0) - (x.at || 0)).slice(0, HISTORY_MAX);
}

/** 合并后的结果（供测试与调试查看，不改状态） */
export function mergedWith(remote) {
  return mergeEntries(remote, items);
}

export function scheduleSync(delay = 4000, { force = false } = {}) {
  if (typeof window === 'undefined') return;
  if (force) pendingForce = true;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { syncTimer = null; void syncNow(); }, Math.max(0, delay));
}

/**
 * 同步一次：登录用户先拉远端合并（每个账号只拉一次），再把本地这份推上去。
 * 未登录 / 服务端没配账号 → 静默跳过（本地记录照旧可用）。
 * 返回 { ok, count?, skipped?, error? }，不抛异常。
 *
 * 两个刻意的"少写一次"：
 *   · 本地为空且不是显式清空（force）时**不推**：登录一下就凭空在你账号下建一份空记录没有意义；
 *   · 拉取失败不阻断推送（下次同步会再拉）。
 */
export async function syncNow() {
  const force = pendingForce;
  pendingForce = false;
  const auth = await lazyAuth();
  if (!auth || !auth.enabled || !auth.loggedIn) return { ok: false, skipped: 'not-logged-in' };
  const sub = String(auth.user?.sub || '');
  try {
    if (sub && pulledFor !== sub) {
      const got = await auth.api('/history', { method: 'GET' });
      if (got.ok) {
        const remote = Array.isArray(got.data?.items) ? got.data.items : [];
        const merged = mergeEntries(remote, items);
        items = merged;
        persist();
        pulledFor = sub;
      }
      // 拉取失败（网络 / 503）：不阻断推送，下次同步还会再试
    }
    if (!items.length && !force) return { ok: true, count: 0, skipped: 'empty' };
    const sent = await auth.api('/history', { method: 'POST', body: { items } });
    if (!sent.ok) return { ok: false, error: sent.error };
    return { ok: true, count: items.length };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

initHistory();
