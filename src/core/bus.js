/**
 * core/bus.js — 极简事件总线
 * 用于跨模块通信（播放器 ↔ 顶栏 ↔ 视图 ↔ 后台）。
 * 事件契约（新增功能时请在此登记）：
 *   theme:change    { theme }
 *   route:change    { path, view, params }
 *   player:track    { track, index }
 *   player:state    { playing, time, duration, muted, volume }
 *   content:change  { collection }
 *   toast           { message, kind }
 *   cmd:open / cmd:close
 */

const map = new Map();

export const bus = {
  on(type, fn) {
    if (!map.has(type)) map.set(type, new Set());
    map.get(type).add(fn);
    return () => bus.off(type, fn);
  },
  off(type, fn) {
    map.get(type)?.delete(fn);
  },
  once(type, fn) {
    const off = bus.on(type, (p) => { off(); fn(p); });
    return off;
  },
  emit(type, payload) {
    map.get(type)?.forEach((fn) => {
      try { fn(payload); } catch (err) { console.error(`[bus] ${type}`, err); }
    });
    map.get('*')?.forEach((fn) => {
      try { fn({ type, payload }); } catch { /* noop */ }
    });
  },
};
