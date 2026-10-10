/**
 * plugins/auth.js — 账号（Auth0 授权码 + PKCE）
 * ==================================================================
 * 为什么是 PKCE，而不是前端拿着 client_secret 换令牌：
 *   浏览器里的任何密钥都等于公开的。PKCE 让**这一次登录**临时生成一对
 *   verifier / challenge，授权码只有在同一个浏览器里才换得成令牌，
 *   所以 public SPA 不需要、也不应该保存 client_secret。
 *
 * 为什么不引 Auth0 的 SDK：本站是零依赖静态站。一次 Universal Login 其实只有三步
 *   （拼 authorize 地址 → 拿 code → POST /oauth/token），用 fetch + crypto.subtle
 *   自己实现比拖进一个几百 KB 的运行时要干净得多，也不会和现有启动顺序打架。
 *
 * 令牌放哪：localStorage（键名前缀沿用站点的 STORAGE_PREFIX）。
 *   这是 SPA 的常规做法，代价是"XSS 能读走令牌"——所以本站所有用户输入都过 esc()，
 *   而且**角色只认服务端**（/api/auth/me 返回的 role）；前端解出来的 id_token claims
 *   只用于"先显示名字/头像"，不用来判定权限。
 *
 * 降级：/api/auth/config 说 enabled=false（纯静态部署、或还没配 Auth0）时，
 *   这里不发起任何账号相关请求，顶栏不显示登录入口，论坛只显示一句说明。
 *
 * 对外接口：
 *   Auth.init()            读配置 + 处理回调（main.js 调一次）
 *   Auth.login()           跳 Auth0 的 Universal Login
 *   Auth.logout()          清掉本地会话
 *   Auth.token()           取可用的 access token（过期自动 refresh，失败返回 null）
 *   Auth.api(path, opts)   带 Bearer 调本站 /api/xxx，401 会自动 refresh 后重试一次
 *   Auth.user / Auth.isOwner / Auth.state / Auth.config
 * 事件：auth:ready / auth:user / auth:error
 */

import { bus } from '../core/bus.js';
import { API, STORAGE_PREFIX } from '../config/site.config.js';

/** localStorage 键：都挂在站点前缀下，清站点数据时能一起清掉 */
const KEYS = {
  verifier: `${STORAGE_PREFIX}.auth.verifier`,
  state: `${STORAGE_PREFIX}.auth.state`,
  returnTo: `${STORAGE_PREFIX}.auth.returnTo`,
  session: `${STORAGE_PREFIX}.auth.session`,
  user: `${STORAGE_PREFIX}.auth.user`,
};

/** 回调参数可能在 ? 上，也可能在 hash 的查询里，两种都算 */
const CALLBACK_KEYS = ['code', 'state', 'error', 'error_description'];

/** 提前 30 秒就当作过期：避免"刚好卡在到期那一刻"的边界 */
const EXPIRY_SKEW = 30_000;

/** 授权范围：offline_access 才拿得到 refresh token（Auth0 那边也要开 Refresh Token 轮换） */
const SCOPE = 'openid profile email offline_access';

/* ---------------- 小工具 ---------------- */

function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function writeJSON(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* 隐私模式 / 配额满：退化成"这次会话内存里有效" */ }
}
function dropJSON(...keys) { keys.forEach((k) => { try { localStorage.removeItem(k); } catch { /* noop */ } }); }

function base64url(bytes) {
  const view = new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < view.length; i += 1) s += String.fromCharCode(view[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomToken(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return base64url(a);
}

/** 有些浏览器（老 Safari）没有 TextDecoder，退化成手写 UTF-8 解码 */
function decodeUtf8(binary) {
  if (typeof TextDecoder === 'function') {
    return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  }
  try { return decodeURIComponent(escape(binary)); } catch { return binary; }
}

/** 只读地解出 id_token 的 claims（**不验签**，仅用于界面显示） */
function claimsOf(idToken) {
  try {
    const part = String(idToken || '').split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodeUtf8(json));
  } catch { return null; }
}

function userFromClaims(claims) {
  if (!claims?.sub) return null;
  return {
    sub: String(claims.sub),
    email: claims.email || '',
    name: claims.name || claims.nickname || claims.email || String(claims.sub).slice(0, 12),
    picture: claims.picture || '',
    verified: claims.email_verified === true,
    role: null,               // 角色只认服务端
    source: 'token',          // 这是前端解出来的，仅用于先把界面画出来
  };
}

/** 回调地址：当前地址去掉参数与 hash（Auth0 应用里要登记完全一致的一条） */
function redirectUri() {
  return `${location.origin}${location.pathname}`;
}

/** 从 ? 或 #/xxx? 上读回调参数 */
function readCallback() {
  const out = { present: false, code: '', state: '', error: '', errorDescription: '' };
  const take = (params) => {
    if (!params) return;
    for (const k of CALLBACK_KEYS) {
      const v = params.get(k);
      if (v) out.present = true;
    }
    out.code = out.code || params.get('code') || '';
    out.state = out.state || params.get('state') || '';
    out.error = out.error || params.get('error') || '';
    out.errorDescription = out.errorDescription || params.get('error_description') || '';
  };
  try { take(new URLSearchParams(location.search.replace(/^\?/, ''))); } catch { /* noop */ }
  try {
    const hash = location.hash.replace(/^#/, '');
    const qs = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1).split('#')[0] : '';
    if (qs) take(new URLSearchParams(qs));
  } catch { /* noop */ }
  return out;
}

/**
 * 把回调参数从地址栏清掉。
 * ⚠️ 本站是 hash 路由，回调参数可能是 `#/forum?code=…` 这种形态 ——
 *    所以不能简单地把 hash 整个删掉（那会丢掉当前板块），要按段重组；
 *    同时也不能把 `#/` 弄丢，否则 Router 会以为没有路由。
 */
function cleanUrl() {
  try {
    const url = new URL(location.href);
    for (const k of CALLBACK_KEYS) url.searchParams.delete(k);

    const rawHash = url.hash.replace(/^#/, '');
    if (rawHash) {
      const [pathPart, anchor = ''] = rawHash.split('#');
      const [pathOnly, qs = ''] = pathPart.split('?');
      let hash = pathOnly || '/';
      if (qs) {
        const sp = new URLSearchParams(qs);
        for (const k of CALLBACK_KEYS) sp.delete(k);
        const rest = sp.toString();
        if (rest) hash += `?${rest}`;
      }
      if (anchor) hash += `#${anchor}`;
      url.hash = `#${hash}`;
    }

    const search = url.searchParams.toString();
    history.replaceState(null, '', `${url.origin}${url.pathname}${search ? `?${search}` : ''}${url.hash || '#/'}`);
  } catch { /* 地址不合法时算了，别因为清理地址把登录流程搞崩 */ }
}

/**
 * 服务端给的配置是否可用（域名/clientId 必须齐全，否则拼不出 authorize 地址）。
 *
 * `origin` 是"带协议"的那份，authorize / token / logout 都拿它拼：
 *   · 真实 Auth0 一般给 `tenant.auth0.com`（没有协议）→ 补 https；
 *   · 本地或自建的模拟 IdP 会给 `http://127.0.0.1:xxxx` → **必须保留 http**，
 *     否则会去连一个不存在的 https 端口（这是本地联调踩过的坑）。
 */
function usableConfig(json) {
  const enabled = json?.enabled === true;
  const raw = typeof json?.domain === 'string' ? json.domain.trim().replace(/\/+$/, '') : '';
  const origin = raw
    ? (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    : '';
  const clientId = typeof json?.clientId === 'string' ? json.clientId : '';
  return {
    enabled: enabled && !!origin && !!clientId,
    domain: origin.replace(/^https?:\/\//i, ''),
    origin,
    clientId,
    audience: typeof json?.audience === 'string' ? json.audience : '',
    // 服务端说启用了、但少了必要字段：如实说明，界面别装作能用
    incomplete: enabled && (!origin || !clientId),
  };
}

/* ---------------- 主体 ---------------- */

export const Auth = {
  /** { enabled, domain, origin, clientId, audience, incomplete } */
  config: { enabled: false, domain: '', origin: '', clientId: '', audience: '', incomplete: false },

  /** 'loading' | 'off' | 'anon' | 'user' */
  state: 'loading',

  /** { sub, email, name, picture, verified, role, source } | null */
  user: null,

  /** 当前会话 { access_token, refresh_token, expiresAt, scope } | null */
  session: null,

  /** 一句人话说明为什么账号功能不可用 / 为什么需要重新登录（界面直接显示） */
  notice: '',

  /** 是否拿到过 refresh token（拿不到就退化成"过期后重新登录"） */
  get canRefresh() { return !!this.session?.refresh_token; },

  /** 令牌何时过期（毫秒时间戳），界面可以显示"还能用多久" */
  get expiresAt() { return Number(this.session?.expiresAt) || 0; },

  get enabled() { return this.config.enabled === true; },
  get loggedIn() { return !!this.user; },
  get isOwner() { return this.user?.role === 'owner'; },

  /* ---------- 初始化 ---------- */

  async init() {
    await this.loadConfig();

    const cb = readCallback();
    if (cb.present) {
      if (!this.enabled) {
        // 服务端没启用账号，却带回了回调参数：别把它留在地址栏里当垃圾
        cleanUrl();
        this._fail('账号功能未启用，已忽略本次登录回调');
      } else if (cb.error) {
        cleanUrl();
        this._fail(cb.error === 'access_denied'
          ? '登录已取消'
          : `登录失败：${cb.error}${cb.errorDescription ? `（${cb.errorDescription}）` : ''}`);
      } else if (cb.code) {
        await this.completeLogin(cb.code, cb.state);
        cleanUrl();
      } else {
        cleanUrl();
      }
    } else if (this.enabled) {
      await this.restore();
    } else {
      this._setState('off');
    }

    bus.emit('auth:ready', { enabled: this.enabled, state: this.state, user: this.user, notice: this.notice });
    return this;
  },

  async loadConfig() {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), API.timeout || 4000);
      const res = await fetch(`${API.base}/auth/config`, { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      this.config = usableConfig(json);
      if (this.config.incomplete) {
        this.notice = '服务端启用了账号功能，但没给出 Auth0 域名 / clientId，登录入口不可用';
      }
    } catch (err) {
      // 没有这个接口（纯静态部署 / 服务端还没升级）是最常见的情况，不是错误
      this.config = { enabled: false, domain: '', clientId: '', audience: '', incomplete: false };
      this.notice = '本站未启用账号功能';
      this._offReason = String(err?.message || err);
    }
    if (!this.enabled) this._setState('off');
    return this.config;
  },

  /** 用本地存的会话恢复登录状态（令牌过期时尝试 refresh） */
  async restore() {
    const saved = readJSON(KEYS.session);
    if (!saved?.access_token) { this._setState('anon'); return false; }

    this.session = saved;
    this.user = readJSON(KEYS.user) || userFromClaims(claimsOf(saved.id_token));

    if (this._valid()) {
      this._setState('user');
      bus.emit('auth:user', { user: this.user });
      void this.confirmWithServer();            // 顺便让服务端确认一次（拿到真实 role）
      return true;
    }

    const ok = await this.refresh();
    if (!ok) {
      // 过期且刷不回来：清干净，并留一句话说明（界面据此提示"重新登录"）
      this.notice = this.canRefresh ? '登录已过期，请重新登录' : '登录已过期（没有 refresh token），请重新登录';
      this._clearSession();
      this._setState('anon');
      bus.emit('auth:user', { user: null, notice: this.notice });
      return false;
    }
    return true;
  },

  /** 拿 access token 是否还在有效期内 */
  _valid() {
    return !!this.session?.access_token && Number(this.session.expiresAt) > Date.now() + EXPIRY_SKEW;
  },

  /* ---------- 登录 / 登出 ---------- */

  async login() {
    if (!this.enabled) {
      this._fail(this.notice || '本站未启用账号功能');
      return false;
    }
    if (!crypto?.subtle) {
      this._fail('当前环境不支持 Web Crypto（需要 https 或 localhost），无法安全登录');
      return false;
    }

    const verifier = randomToken(48);
    const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const state = randomToken(16);

    writeJSON(KEYS.verifier, verifier);
    writeJSON(KEYS.state, state);
    writeJSON(KEYS.returnTo, location.hash || '#/');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: redirectUri(),
      scope: SCOPE,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    // audience 只有服务端给了才带：少了它拿到的 token 可能不是给本站 API 用的
    if (this.config.audience) params.set('audience', this.config.audience);

    location.assign(`${this.config.origin}/authorize?${params.toString()}`);
    return true;
  },

  /**
   * 用授权码换令牌。
   * 换完立刻问一次 /api/auth/me：服务端才是身份的裁判，
   * 它给的 role 决定"能不能改公告"这类权限。
   */
  async completeLogin(code, state) {
    const expectState = readJSON(KEYS.state);
    const verifier = readJSON(KEYS.verifier);
    if (!verifier) { this._fail('登录信息已丢失（可能换了浏览器或清了缓存），请重新登录'); return false; }
    if (expectState && state && expectState !== state) {
      this._fail('登录校验失败（state 不一致），出于安全已中止，请重新登录');
      return false;
    }

    let tokens = null;
    try {
      const res = await fetch(`${this.config.origin}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: this.config.clientId,
          code,
          code_verifier: verifier,
          redirect_uri: redirectUri(),
        }),
      });
      tokens = await res.json().catch(() => null);
      if (!res.ok || !tokens?.access_token) {
        throw new Error(tokens?.error_description || tokens?.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      this._fail(`换取登录令牌失败：${String(err?.message || err)}`);
      dropJSON(KEYS.verifier, KEYS.state);
      return false;
    }

    this._storeTokens(tokens);
    dropJSON(KEYS.verifier, KEYS.state);

    // 先按 claims 画出来（界面立刻有反馈），再让服务端确认
    this.user = userFromClaims(claimsOf(tokens.id_token));
    if (!this.canRefresh) {
      // 如实说明：没拿到 refresh token 就意味着"过期后要重新登录"
      this.notice = '本次授权没有拿到 refresh token（Auth0 应用需开启 Refresh Token 轮换），令牌过期后需要重新登录';
    } else {
      this.notice = '';
    }
    this._setState(this.user ? 'user' : 'anon');
    bus.emit('auth:user', { user: this.user, notice: this.notice });

    const confirmed = await this.confirmWithServer();
    // 回到登录前所在的板块（回调地址是"当前地址去掉参数"，所以 hash 会丢）
    const back = readJSON(KEYS.returnTo);
    if (back && typeof back === 'string' && back.startsWith('#/') && location.hash !== back) {
      location.hash = back;
    }
    dropJSON(KEYS.returnTo);
    return !!confirmed;
  },

  _storeTokens(tokens) {
    const expiresIn = Number(tokens.expires_in) || 3600;
    this.session = {
      access_token: tokens.access_token,
      // 轮换模式下每次都返回新的 refresh_token；没返回就沿用旧的
      refresh_token: tokens.refresh_token || this.session?.refresh_token || '',
      id_token: tokens.id_token || '',
      scope: tokens.scope || '',
      expiresAt: Date.now() + expiresIn * 1000,
    };
    writeJSON(KEYS.session, this.session);
    writeJSON(KEYS.user, this.user);
  },

  /** 问服务端"我是谁"。失败不致命，但要说清楚。 */
  async confirmWithServer(silent = false) {
    if (!this.enabled || !this.session?.access_token) return false;
    try {
      const res = await fetch(`${API.base}/auth/me`, {
        headers: { Authorization: `Bearer ${this.session.access_token}` },
        cache: 'no-store',
      });
      if (res.status === 401) {
        // 服务端不认这个令牌：以服务端为准，清掉本地会话
        this.notice = '服务端没有接受这次登录凭据，请重新登录';
        this._clearSession();
        this._setState('anon');
        bus.emit('auth:user', { user: null, notice: this.notice });
        return false;
      }
      if (res.status === 501) {
        // 501 = 服务端还没配账号体系（缺 AUTH0_DOMAIN / AUTH0_CLIENT_ID）。
        // 这不是"你被拒绝"，而是"这个部署没有账号功能" —— 别弹错误，静默降级。
        this.notice = '本站未启用账号功能';
        this._clearSession();
        this._setState('off');
        bus.emit('auth:user', { user: null, notice: this.notice });
        return false;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json?.user) {
        this.user = { ...json.user, source: 'server' };
        writeJSON(KEYS.user, this.user);
        this.notice = this.canRefresh ? '' : this.notice;
        this._setState('user');
        bus.emit('auth:user', { user: this.user, notice: this.notice });
      }
      return true;
    } catch (err) {
      if (!silent) {
        this._fail(`已登录，但服务端未能确认身份（${String(err?.message || err)}）——权限相关操作可能不可用`);
      }
      return false;
    }
  },

  /**
   * 登出：清本地会话，**并且**（能拼出地址时）跳 Auth0 的 /v2/logout。
   *
   * 为什么值得多跳这一下：只清本地的话，Auth0 那边的会话还在 —— 用户点"退出"之后
   * 再点登录，会被 IdP 直接静默放行（连密码都不问），看起来就像"根本没退出"。
   *
   * returnTo 必须与 Auth0 应用里登记的 **Allowed Logout URLs 完全一致**，
   * 所以只取 `origin + pathname`：本站是 hash 路由，带上 `#/...` 就不匹配了
   * （Auth0 拿它做字符串比对，不会替我们忽略 fragment）。
   *
   * 拿不到 domain（账号功能未启用 / 配置缺失）时退回"只清本地"，
   * 并在界面上如实说明"浏览器里可能还留着 Auth0 会话"。
   */
  logout() {
    const origin = this.config.origin;
    const clientId = this.config.clientId;
    const canRemote = this.enabled && !!origin && !!clientId;

    this._clearSession();
    // 回调后立刻登出时，地址里可能还残留 ?code=&state= —— 一并清掉，别留在地址栏里
    cleanUrl();
    this.notice = canRemote ? '' : '已退出登录。浏览器里可能仍保留 Auth0 会话，下次登录可能不再要求输入密码。';
    this._setState(this.enabled ? 'anon' : 'off');
    bus.emit('auth:user', { user: null, notice: this.notice });

    if (canRemote) {
      const returnTo = `${location.origin}${location.pathname}`;
      const url = `${origin}/v2/logout?client_id=${encodeURIComponent(clientId)}&returnTo=${encodeURIComponent(returnTo)}`;
      location.assign(url);
    }
    return true;
  },

  _clearSession() {
    this.session = null;
    this.user = null;
    dropJSON(KEYS.session, KEYS.user);
  },

  /* ---------- 令牌 ---------- */

  /** 可用的 access token；过期就 refresh，刷不到返回 null */
  async token() {
    if (!this.enabled) return null;
    if (this._valid()) return this.session.access_token;
    const ok = await this.refresh();
    return ok ? this.session.access_token : null;
  },

  /** 用 refresh_token 换新令牌（Auth0 的 Refresh Token 轮换） */
  async refresh() {
    if (!this.session?.refresh_token || !this.enabled) return false;
    try {
      const res = await fetch(`${this.config.origin}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          client_id: this.config.clientId,
          refresh_token: this.session.refresh_token,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.access_token) {
        throw new Error(json?.error_description || json?.error || `HTTP ${res.status}`);
      }
      this._storeTokens(json);
      this._setState('user');
      bus.emit('auth:user', { user: this.user, notice: this.notice, refreshed: true });
      return true;
    } catch (err) {
      // 刷不动了就是真的过期：清掉会话，让界面回到"未登录 + 说明"
      this._clearSession();
      this._setState('anon');
      this.notice = `登录已过期，请重新登录（${String(err?.message || err)}）`;
      bus.emit('auth:user', { user: null, notice: this.notice });
      return false;
    }
  },

  /* ---------- 调本站接口 ---------- */

  /**
   * 带 Bearer 调本站 /api/xxx（path 形如 '/forum/posts'）。
   * 401 时自动 refresh 并重试一次 —— 这是"令牌过期"最自然的表现，
   * 不该让每个调用方自己处理。
   * 返回 { ok, status, data, error }，不抛异常。
   */
  async api(path, { method = 'GET', body = null, headers = {}, retry = true } = {}) {
    const url = /^https?:|^\/api\//.test(path) ? path : `${API.base}${path}`;
    const token = await this.token();
    const init = {
      method,
      headers: { ...headers },
      cache: 'no-store',
    };
    if (token) init.headers.Authorization = `Bearer ${token}`;
    if (body != null) {
      init.headers['Content-Type'] = 'application/json';
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    let res;
    try {
      res = await fetch(url, init);
    } catch (err) {
      return { ok: false, status: 0, data: null, error: `网络请求失败：${String(err?.message || err)}` };
    }

    if (res.status === 401 && retry && this.session?.refresh_token) {
      const refreshed = await this.refresh();
      if (refreshed) return this.api(path, { method, body, headers, retry: false });
    }

    const text = await res.text().catch(() => '');
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data,
        error: data?.error || (res.status === 401 ? '需要登录后操作' : `HTTP ${res.status}`),
      };
    }
    return { ok: true, status: res.status, data, error: null };
  },

  /* ---------- 内部 ---------- */

  _setState(state) { this.state = state; },

  _fail(message) {
    this.notice = message;
    bus.emit('auth:error', { message });
    return false;
  },
};

export default Auth;
