/**
 * plugins/mine-room.js — 联机扫雷的房间客户端
 * ------------------------------------------------------------------
 * 服务端权威：棋盘只有服务端能改。这里只做三件事：
 *   ① 把"创建 / 加入 / 出招 / 开新局 / 退出"发给服务端
 *   ② 按 version **轮询**拉状态（短请求，不用 WebSocket，所以 VPS 与 Netlify 都能跑）
 *   ③ 把远端状态交给视图（视图自己不碰网络）
 *
 * 身份：只允许**已注册并登录**的用户 —— 令牌由 Auth.api 自动带上（401 会自动刷新重试一次）。
 */

import { Auth } from './auth.js';

const POLL_MS = 1200;

export const MineRoom = {
  id: null,
  code: null,
  room: null,
  version: 0,
  error: '',
  busy: false,
  onUpdate: null,      // 视图注册：状态变化时回调（视图据此重画）
  _timer: null,

  get active() { return !!this.id && !!this.room; },
  get loggedIn() { return !!Auth.loggedIn; },

  _set(room) {
    if (!room) return;
    this.room = room;
    this.version = Number(room.version) || 0;
    this.id = room.id;
    this.code = room.code;
    this.error = '';
    if (typeof this.onUpdate === 'function') this.onUpdate(this.room);
  },

  _fail(res) {
    const msg = (res && (res.error || res.message)) || '请求失败';
    this.error = msg;
    if (typeof this.onUpdate === 'function') this.onUpdate(this.room);
    return { ok: false, error: msg, status: res && res.status };
  },

  /** 建房（level: beginner / intermediate / expert） */
  async create(level = 'beginner') {
    if (this.busy) return { ok: false, error: '正在处理上一个请求' };
    this.busy = true;
    try {
      const res = await Auth.api('/mine/rooms', { method: 'POST', body: { level } });
      if (!res || !res.ok) return this._fail(res);
      this._set(res.room || res.json?.room);
      this.startPolling();
      return { ok: true };
    } finally { this.busy = false; }
  },

  /** 用房间号加入（大小写不敏感） */
  async joinByCode(code) {
    const clean = String(code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(clean)) return { ok: false, error: '房间号是 6 位字母数字' };
    this.busy = true;
    try {
      const res = await Auth.api('/mine/rooms/join', { method: 'POST', body: { code: clean } });
      if (!res || !res.ok) return this._fail(res);
      this._set(res.room || res.json?.room);
      this.startPolling();
      return { ok: true };
    } finally { this.busy = false; }
  },

  /** 用邀请链接里的房间 id 加入 */
  async joinById(id) {
    this.busy = true;
    try {
      const res = await Auth.api(`/mine/rooms/${encodeURIComponent(id)}`, { method: 'POST' });
      if (!res || !res.ok) return this._fail(res);
      this._set(res.room || res.json?.room);
      this.startPolling();
      return { ok: true };
    } finally { this.busy = false; }
  },

  /** 出招：reveal / flag / chord */
  async move(action, r, c) {
    if (!this.active) return { ok: false, error: '还没进房间' };
    if (this.room.finished) return { ok: false, error: '这一局已经结束了' };
    const res = await Auth.api(`/mine/rooms/${encodeURIComponent(this.id)}/move`, {
      method: 'POST', body: { action, r, c },
    });
    if (!res || !res.ok) return this._fail(res);
    this._set(res.room || res.json?.room);
    return { ok: true };
  },

  /** 房主开新局 */
  async restart() {
    if (!this.active) return { ok: false, error: '还没进房间' };
    const res = await Auth.api(`/mine/rooms/${encodeURIComponent(this.id)}/restart`, { method: 'POST' });
    if (!res || !res.ok) return this._fail(res);
    this._set(res.room || res.json?.room);
    return { ok: true };
  },

  /** 退出（房主则是解散） */
  async leave() {
    if (this.active) {
      await Auth.api(`/mine/rooms/${encodeURIComponent(this.id)}`, { method: 'DELETE' }).catch(() => null);
    }
    this.stopPolling();
    this.id = null;
    this.code = null;
    this.room = null;
    this.version = 0;
    this.error = '';
    if (typeof this.onUpdate === 'function') this.onUpdate(null);
    return { ok: true };
  },

  /** 拉一次状态（只在 version 变了时通知视图，避免白白重画） */
  async pull() {
    if (!this.id) return;
    const res = await Auth.api(`/mine/rooms/${encodeURIComponent(this.id)}`, { cache: 'no-store' }).catch(() => null);
    if (!res || !res.ok) {
      // 房间被解散 / 掉线：给一句人话，别静默
      if (res && (res.status === 404 || res.status === 403)) {
        this.error = res.error || '房间不可用（可能被解散了）';
        this.stopPolling();
        this.id = null;
        this.room = null;
        if (typeof this.onUpdate === 'function') this.onUpdate(null);
      }
      return;
    }
    const room = res.room || res.json?.room;
    if (room && Number(room.version) !== this.version) this._set(room);
    else if (room) this.room = room;   // 版本没变也刷新一下"谁在线"
  },

  startPolling() {
    this.stopPolling();
    this._timer = setInterval(() => { void this.pull(); }, POLL_MS);
  },

  stopPolling() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },
};
