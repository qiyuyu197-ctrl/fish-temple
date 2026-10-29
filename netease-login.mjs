/**
 * netease-login.mjs — 网易云扫码登录：会话、绑定、个人数据
 * ==================================================================
 * 这个文件回答一个问题：**在网页上，把"你的网易云账号"安全地接进来，需要哪几件事？**
 *
 * Folia（Electron 桌面端）的做法是：本机拉起一个本地 API 服务，cookie 存在本机磁盘，
 * 渲染进程通过 localhost 调它。网页端没有"本机"这层信任，所以每个决定都要重做：
 *
 *   1. **谁来登**：必须先有本站身份（Auth0）。网易云的 cookie 是**凭据**，
 *      不能匿名谁都能绑，否则服务器就成了公共代理。默认只允许站长绑（见 neteaseLoginConfig）。
 *   2. **cookie 存哪**：服务端，按本站 sub 分文件/blob。**永远不回给浏览器** ——
 *      前端只拿到昵称、头像、uid 这些展示用的字段。
 *   3. **存的时候加密吗**：加密。AES-256-GCM，密钥优先取 `FT_COOKIE_KEY`，
 *      没配就在存储里生成一把随机密钥（`netease-meta/secret`）。
 *      说实话：密钥和密文放在同一个 store 里，防的是"备份/截图/日志泄露"，
 *      不防"整个存储被拿走"。这一点写在 README 里，不装。
 *   4. **怎么防止别人抢走别人的扫码结果**：二维码的 key 是服务端发给"这个 sub"的，
 *      轮询时必须带回一个 HMAC 签名的 state，里面钉死 sub + deviceId + key + 过期时间。
 *      （攻击者要伪造 state，得先拿到签名密钥 —— 所以 FT_COOKIE_KEY 建议配。）
 *   5. **失败了说得清吗**：所有失败都带网易云的业务码和一句人话。800/801/802/803
 *      是扫码的四个正常状态，不是错误；8821 是风控；连接重置是网络。
 *      Folia 花了四个文件（diagnostics / identity / startup / backend）解决"扫码失败
 *      但看不出原因"，这里压缩成一个事件环 + 明确的状态机。
 *
 * 不做什么（和 README 的能力边界保持一致）：
 *   · 不拿登录态去取 VIP 音频流。登录只解锁"属于你的数据"（歌单 / 喜欢 / 推荐），
 *     播放仍然走原来那条匿名可用的同源直放链路。
 *   · 不上报播放记录（scrobble）。那需要另一个接口族，且写进别人账号的操作应该单独讨论。
 */

import crypto from 'node:crypto';
import {
  createIdentity,
  eapiRequest,
  fetchXeapiPublicKey,
  generateDeviceId,
  NeteaseError,
  weapiRequest,
  xeapiRequest,
} from './netease-eapi.mjs';
import { qrSvg } from './netease-qr.mjs';

/* ------------------------------------------------------------------ */
/* 配置                                                                */
/* ------------------------------------------------------------------ */

/** 扫码有效期。网易云那边大约 3 分钟就回收 key，我们按 180 秒算，宁短勿长。 */
const QR_TTL_MS = 180 * 1000;

/** 绑定关系里只留这几个 cookie：够用于后续 eapi 请求，不多存一个字节。 */
const KEEP_COOKIES = ['MUSIC_U', '__csrf', 'MUSIC_A', 'NMTID', '__remember_me'];

const SECRET_COLLECTION = 'netease-meta';
const SECRET_ID = 'secret';
const BIND_COLLECTION = 'netease-auth';

/**
 * 登录开关。
 *   NETEASE_LOGIN=off     完全关闭（默认之外的显式关闭）
 *   NETEASE_LOGIN=owner   只有站长能绑（默认：把风险留给自己）
 *   NETEASE_LOGIN=members 所有已登录的站内账号都能绑
 *
 * 为什么默认 owner：README 里那条"第三方登录可能触发网易云风控"的风险是真实的
 * （YesPlayMusic / SPlayer 都发过公告）。让每个来访者都把账号交进来，不合算；
 * 站长自己想用，就把开关打开。
 */
export function neteaseLoginConfig() {
  const raw = String(process.env.NETEASE_LOGIN ?? 'owner').trim().toLowerCase();
  const mode = raw === 'off' ? 'off' : raw === 'members' ? 'members' : 'owner';
  return {
    enabled: mode !== 'off',
    mode,
    // 前端要照这个文案显示风险提示，所以放在服务端统一出
    riskNotice: '这是第三方登录：扫码后本站会替你保管一个网易云登录凭据。'
      + '据公开反馈，第三方客户端登录有可能被网易云判定为异常（如临时冻结），'
      + '介意的话请用小号，或不要开启。',
    qrTtlMs: QR_TTL_MS,
  };
}

/** 这个身份能不能用网易云登录（role 来自 auth.mjs；本机免登录时是 owner）。 */
export function canUseNeteaseLogin(user, cfg = neteaseLoginConfig()) {
  if (!cfg.enabled) return { ok: false, status: 501, error: '网易云登录没有开启（NETEASE_LOGIN=off）' };
  if (cfg.mode === 'members') return { ok: true };
  if (user?.role === 'owner') return { ok: true };
  return { ok: false, status: 403, error: '网易云登录只对站长开放（NETEASE_LOGIN=owner）' };
}

/* ------------------------------------------------------------------ */
/* 密钥：签名 + cookie 加密                                            */
/* ------------------------------------------------------------------ */

let secretCache = null;

/**
 * 拿两把密钥：一把签 state，一把加密 cookie。
 * 优先用环境变量（多实例/多函数实例部署时唯一正确的做法）；
 * 没配就生成一次存进 store —— 单实例够用，但每个函数实例冷启动都可能读到不同值，
 * 所以线上强烈建议配 FT_COOKIE_KEY。
 */
export async function getSecrets(store) {
  if (secretCache) return secretCache;

  const envKey = String(process.env.FT_COOKIE_KEY || '').trim();
  if (envKey) {
    secretCache = {
      source: 'env',
      signKey: crypto.createHash('sha256').update(`sign:${envKey}`).digest(),
      cookieKey: crypto.createHash('sha256').update(`cookie:${envKey}`).digest(),
    };
    return secretCache;
  }

  let doc = await store.readItem(SECRET_COLLECTION, SECRET_ID).catch(() => null);
  if (!doc?.cookieKey || !doc?.signKey) {
    doc = {
      v: 1,
      signKey: crypto.randomBytes(32).toString('base64'),
      cookieKey: crypto.randomBytes(32).toString('base64'),
      createdAt: new Date().toISOString(),
    };
    await store.writeItem(SECRET_COLLECTION, SECRET_ID, doc).catch(() => null);
  }
  secretCache = {
    source: doc?.signKey ? 'store' : 'ephemeral',
    signKey: doc?.signKey ? Buffer.from(doc.signKey, 'base64') : crypto.randomBytes(32),
    cookieKey: doc?.cookieKey ? Buffer.from(doc.cookieKey, 'base64') : crypto.randomBytes(32),
  };
  return secretCache;
}

/** 自检要能重复跑，所以给一个复位入口（生产代码不会调它）。 */
export function _resetSecretCache() {
  secretCache = null;
}

/** 同上：只给自检用，让"换一个 store"能重新走一遍持久化。 */
export function _resetDeviceCache() {
  deviceCache = '';
  deviceProfileCache = null;
  anonCache = null;
}

/* ------------------------------------------------------------------ */
/* state：把 sub / deviceId / key / 过期时间 钉在一起                   */
/* ------------------------------------------------------------------ */

const b64u = (buf) => Buffer.from(buf).toString('base64url');

/**
 * 通用的「签名 + 过期」token。
 * 扫码状态和云盘音频地址都用它，但两者的校验强度不一样：
 *   · 扫码状态必须带 sub / dev / key（少了就没法把这一轮钉住）；
 *   · 音频地址只要 sub / id（dev 是设备指纹，跟一次播放无关）。
 * 之前图省事让音频复用了 verifyState，结果它按"扫码状态"检查 dev/key，
 * 云盘音频一律被 400 拒掉 —— 这个坑就是在这里踩的。
 */
function signToken(secret, payload) {
  const body = b64u(JSON.stringify(payload));
  const mac = crypto.createHmac('sha256', secret.signKey).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verifyToken(secret, token, { label = '状态', expired = '已过期，请重新生成' } = {}) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) throw new NeteaseError(`${label}格式不对，${expired}`, { status: 400 });
  const [body, mac] = parts;
  const want = crypto.createHmac('sha256', secret.signKey).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new NeteaseError(`${label}校验失败（可能被改过），${expired}`, { status: 400 });
  }
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch {
    throw new NeteaseError(`${label}解析失败，${expired}`, { status: 400 });
  }
  if (Number(payload?.exp) < Date.now()) throw new NeteaseError(`${label}${expired}`, { status: 400 });
  return payload;
}

const signState = (secret, payload) => signToken(secret, payload);

/** 扫码状态：比通用 token 多查三个字段（这一轮必须钉死 sub / 设备 / key）。 */
function verifyState(secret, token) {
  const payload = verifyToken(secret, token, { label: '扫码状态', expired: '请重新生成二维码' });
  if (!payload?.sub || !payload?.dev || !payload?.key) {
    throw new NeteaseError('扫码状态不完整，请重新生成二维码', { status: 400 });
  }
  return payload;
}

/* ------------------------------------------------------------------ */
/* cookie 加解密                                                       */
/* ------------------------------------------------------------------ */

function encryptCookie(secret, cookie) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secret.cookieKey, iv);
  const plain = Buffer.from(JSON.stringify(cookie), 'utf8');
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ct.toString('base64url')}`;
}

function decryptCookie(secret, payload) {
  const parts = String(payload || '').split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('不是 v1 密文');
  const iv = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  const ct = Buffer.from(parts[3], 'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm', secret.cookieKey, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  return JSON.parse(plain);
}

/* ------------------------------------------------------------------ */
/* 绑定关系（每个本站账号一份）                                          */
/* ------------------------------------------------------------------ */

/** Auth0 的 sub 带 `|`，不能直接当文件名/Blob key。和 server.mjs 的 userKey 同一规则。 */
function subKey(sub) {
  return crypto.createHash('sha1').update(String(sub)).digest('hex').slice(0, 32);
}

function normalizeCookie(cookie) {
  const out = {};
  for (const name of KEEP_COOKIES) {
    if (cookie?.[name]) out[name] = String(cookie[name]);
  }
  return out;
}

/** 读绑定。返回 null 表示没绑 / 解不开（密钥换了）。 */
export async function readBinding(store, sub) {
  const doc = await store.readItem(BIND_COLLECTION, subKey(sub)).catch(() => null);
  if (!doc || doc.sub !== sub) return null;
  const secret = await getSecrets(store);
  let cookie;
  try {
    cookie = doc.encrypted ? decryptCookie(secret, doc.cookie) : doc.cookie;
  } catch {
    return null;
  }
  if (!cookie?.MUSIC_U) return null;
  return { ...doc, cookie };
}

export async function writeBinding(store, sub, { cookie, profile }) {
  const secret = await getSecrets(store);
  const now = new Date().toISOString();
  const prev = await store.readItem(BIND_COLLECTION, subKey(sub)).catch(() => null);
  const doc = {
    key: subKey(sub),
    sub,
    uid: String(profile?.uid || ''),
    nickname: String(profile?.nickname || ''),
    avatarUrl: String(profile?.avatarUrl || ''),
    vipType: Number(profile?.vipType) || 0,
    cookie: encryptCookie(secret, normalizeCookie(cookie)),
    encrypted: true,
    boundAt: prev?.boundAt || now,
    updatedAt: now,
  };
  await store.writeItem(BIND_COLLECTION, subKey(sub), doc);
  return doc;
}

export async function clearBinding(store, sub) {
  await store.removeItem(BIND_COLLECTION, subKey(sub)).catch(() => {});
}

/** 前端要的"绑定状态"，**不含 cookie**。 */
export function publicBinding(doc) {
  if (!doc) return null;
  return {
    uid: doc.uid,
    nickname: doc.nickname,
    avatarUrl: doc.avatarUrl,
    vipType: doc.vipType,
    boundAt: doc.boundAt,
    updatedAt: doc.updatedAt,
  };
}

/* ------------------------------------------------------------------ */
/* 备用通道：粘贴 MUSIC_U（扫码被风控拦掉时用）                          */
/* ------------------------------------------------------------------ */

/**
 * 解析用户粘进来的凭据。三种形态都认：
 *   · 整段 `MUSIC_U=xxx; __csrf=yyy; NMTID=zzz`
 *   · 只有一行 `MUSIC_U=xxx`
 *   · 只粘了值（一长串，没有等号）
 * 多粘的字段会被 normalizeCookie 的白名单过滤掉，不会多存。
 */
export function parseCookieInput(raw) {
  const text = String(raw || '').trim();
  if (!text) return {};
  const out = {};
  for (const part of text.split(/[;\n\r\t]+/)) {
    const item = part.trim().replace(/^["']|["']$/g, '');
    if (!item) continue;
    const eq = item.indexOf('=');
    if (eq > 0) {
      const name = item.slice(0, eq).trim();
      const value = item.slice(eq + 1).trim();
      if (name && value) out[name] = value;
    } else if (!out.MUSIC_U && /^[A-Za-z0-9+/=_-]{20,}$/.test(item)) {
      // 只复制了值：长度和字符集够像 session 才收，避免把一句中文当凭据
      out.MUSIC_U = item;
    }
  }
  return out;
}

/**
 * 用粘贴的 MUSIC_U 建立绑定。
 *
 * 什么时候用：手机扫码时网易云回「检测到当前设备环境异常 / 本次操作已拦截」。
 * 那是它自己的风控，不是密钥错了 —— 换一条不经过"扫码确认"的路。
 *
 * 代价必须说清楚：MUSIC_U 等同于**完整登录态**，比扫码拿到的会话更敏感。
 * 所以这里先拿它去问一次「我是谁」：问得到才存，问不到直接拒绝，不存垃圾凭据。
 */
export async function bindByCookie(store, sub, raw) {
  const parsed = parseCookieInput(raw);
  if (!parsed.MUSIC_U) {
    throw new NeteaseError('没找到 MUSIC_U：请复制 `MUSIC_U=…` 那一整行（或只复制等号后面的值）', { status: 400 });
  }
  if (parsed.MUSIC_U.length < 20) {
    throw new NeteaseError('MUSIC_U 看起来不完整（太短），请重新复制', { status: 400 });
  }

  const identity = await identityFor(store, parsed);
  const startedAt = Date.now();
  let profile = null;
  try {
    profile = await fetchProfile(identity);
  } catch (err) {
    record('cookie-bind', { ok: false, code: err.code || 502, ms: Date.now() - startedAt, message: err.message, sub });
    throw new NeteaseError(`验证这个凭据时出错：${err.message}`, { code: err.code, status: 502 });
  }
  if (!profile) {
    record('cookie-bind', { ok: false, code: 401, ms: Date.now() - startedAt, message: '凭据无效或已过期', sub });
    throw new NeteaseError('这个 MUSIC_U 无效或已过期（网易云没有返回账号信息），请重新复制一个', { status: 401 });
  }

  const doc = await writeBinding(store, sub, { cookie: parsed, profile });
  record('cookie-bind', { ok: true, code: 200, ms: Date.now() - startedAt, message: `已绑定 ${profile.nickname}`, sub });
  return { profile, binding: publicBinding(doc) };
}

/* ------------------------------------------------------------------ */
/* 事件环：扫码这条链路上发生了什么                                      */
/* ------------------------------------------------------------------ */

const EVENTS_MAX = 40;
const events = [];

function record(step, { ok = true, code = 0, ms = 0, message = '', sub = '' } = {}) {
  events.push({
    at: new Date().toISOString(),
    step,
    ok,
    code,
    ms,
    message: String(message || '').slice(0, 200),
    // 只记 sub 的短指纹：报告要能贴给别人看，不能带身份原文
    who: sub ? subKey(sub).slice(0, 8) : '',
  });
  if (events.length > EVENTS_MAX) events.splice(0, events.length - EVENTS_MAX);
}

export function recentEvents() {
  return events.slice(-EVENTS_MAX);
}

/* ------------------------------------------------------------------ */
/* 设备身份（必须稳定，别每次扫码都换）                                   */
/* ------------------------------------------------------------------ */

const DEVICE_ID_RE = /^[0-9A-F]{52}$/;
const DEVICE_COLLECTION = 'netease-meta';
const DEVICE_ID = 'device';

/** 同一账号两次生成二维码的最小间隔：手快连点会被网易云当成异常操作。 */
const QR_COOLDOWN_MS = 8000;
const qrCooldown = new Map();

let deviceCache = '';
let deviceProfileCache = null;

/**
 * 取这台"设备"的档案：deviceId + 上游那套身份 cookie（`_ntes_nuid` / `_ntes_nnid` / `WNMCID`）。
 *
 * ⚠️ 这一条是 2026-10-25 踩坑后补上的，值得记住为什么：
 * 最初每次点「扫码登录」都 `generateDeviceId()` 一个新的。官方客户端是**一台设备一个固定 ID**，
 * 而我们在几分钟内从同一个出口 IP 冒出了四五个"新设备"去要登录二维码 —— 手机确认时
 * 网易云直接拦了（「检测到当前设备环境异常」）。Folia 的做法是全局复用一个 deviceId、
 * 只在扫码请求被连接重置时才轮换；这里学的是"稳定"，不是"每次换"。
 *
 * 身份 cookie 也要一起稳定：上游每个请求都带 `_ntes_nuid` / `_ntes_nnid` / `WNMCID`，
 * 它们和 deviceId 一起构成"这台设备"。每次重生成等于又换了一台机器。
 */
export async function getDeviceProfile(store) {
  if (deviceProfileCache) return deviceProfileCache;
  const doc = await store.readItem(DEVICE_COLLECTION, DEVICE_ID).catch(() => null);
  const deviceId = doc?.deviceId && DEVICE_ID_RE.test(doc.deviceId) ? doc.deviceId : generateDeviceId();
  const nuid = /^[0-9a-f]{64}$/.test(doc?._ntes_nuid || '') ? doc._ntes_nuid : crypto.randomBytes(32).toString('hex');
  const nnid = doc?._ntes_nnid || `${nuid},${Date.now()}`;
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const wnmcid = doc?.WNMCID || `${[...crypto.randomBytes(6)].map((b) => letters[b % 26]).join('')}.${Date.now()}.01.0`;
  const next = {
    deviceId,
    _ntes_nuid: nuid,
    _ntes_nnid: nnid,
    WNMCID: wnmcid,
    createdAt: doc?.createdAt || new Date().toISOString(),
  };
  if (!doc || doc.deviceId !== deviceId || doc._ntes_nuid !== nuid || doc._ntes_nnid !== nnid || doc.WNMCID !== wnmcid) {
    await store.writeItem(DEVICE_COLLECTION, DEVICE_ID, next).catch(() => null);
  }
  deviceProfileCache = next;
  deviceCache = deviceId;
  return next;
}

export async function getDeviceId(store) {
  if (deviceCache) return deviceCache;
  return (await getDeviceProfile(store)).deviceId;
}

/* ------------------------------------------------------------------ */
/* 匿名账号：拿 MUSIC_A                                                */
/* ------------------------------------------------------------------ */

const ANON_ID = 'anonymous';
const ANON_TTL_MS = 300 * 24 * 60 * 60 * 1000;   // 匿名 token 按年算，过期就重注册
const XEAPI_KEY_ID = 'xeapi-key';
const XEAPI_KEY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

let anonCache = null;

/** 官方客户端注册匿名账号时的 username：base64(deviceId + " " + base64(md5(xor(deviceId, key))))。 */
function encodeAnonymousUsername(deviceId) {
  const XOR_KEY = '3go8&$8*3*3h0k(2)2';
  let xored = '';
  for (let i = 0; i < deviceId.length; i += 1) {
    xored += String.fromCharCode(deviceId.charCodeAt(i) ^ XOR_KEY.charCodeAt(i % XOR_KEY.length));
  }
  const digest = crypto.createHash('md5').update(Buffer.from(xored, 'utf8')).digest();
  return Buffer.from(`${deviceId} ${digest.toString('base64')}`, 'utf8').toString('base64');
}

/** 拿（并缓存）xeapi 的服务端公钥。 */
async function getXeapiKey(store, deviceId) {
  const doc = await store.readItem(DEVICE_COLLECTION, XEAPI_KEY_ID).catch(() => null);
  const fresh = doc?.publicKey
    && Date.now() - Number(doc.fetchedAt || 0) < XEAPI_KEY_TTL_MS
    && Number(doc.nextUpdateTime || 0) > Date.now();
  if (fresh) return doc;
  const key = await fetchXeapiPublicKey(deviceId, { currentKeyVersion: doc?.version || '' });
  await store.writeItem(DEVICE_COLLECTION, XEAPI_KEY_ID, { ...key, fetchedAt: Date.now() }).catch(() => null);
  return key;
}

/**
 * 注册/复用匿名账号，返回 MUSIC_A。
 * 失败不抛：匿名 token 是"锦上添花"，没有它也要能扫码（Folia 首次启动同样可能没有）。
 *
 * 失败后会安静 10 分钟：实测同一个出口 IP 连续注册几次之后，网易云会直接回
 * `{"code":400}`（换 deviceId、换身份 cookie 都一样，说明是按 IP 节流）。
 * 这时候继续重试只会更像机器人，所以记下失败时间，冷却期内直接用"没有 MUSIC_A"的身份。
 */
const ANON_FAIL_COOLDOWN_MS = 10 * 60 * 1000;

export async function getAnonymousToken(store) {
  if (anonCache?.token) return anonCache.token;
  if (anonCache && anonCache.until > Date.now()) return '';
  const profile = await getDeviceProfile(store);
  const doc = await store.readItem(DEVICE_COLLECTION, ANON_ID).catch(() => null);
  if (doc?.token && doc.deviceId === profile.deviceId && Date.now() - Number(doc.at || 0) < ANON_TTL_MS) {
    anonCache = doc;
    return doc.token;
  }
  if (doc?.failedAt && Date.now() - Number(doc.failedAt) < ANON_FAIL_COOLDOWN_MS) {
    anonCache = { token: '', until: Number(doc.failedAt) + ANON_FAIL_COOLDOWN_MS };
    return '';
  }

  const startedAt = Date.now();
  try {
    const key = await getXeapiKey(store, profile.deviceId);
    const identity = createIdentity({
      deviceId: profile.deviceId,
      profile: 'android',          // 上游注册匿名账号走的是 Android 画像
      cookie: {
        _ntes_nuid: profile._ntes_nuid,
        _ntes_nnid: profile._ntes_nnid,
        WNMCID: profile.WNMCID,
      },
    });
    const res = await xeapiRequest(
      '/api/register/anonimous',
      { username: encodeAnonymousUsername(profile.deviceId) },
      identity,
      key,
    );
    const code = Number(res.body?.code);
    const token = String(res.cookie?.MUSIC_A || '');
    if (code !== 200 || !token) {
      record('anonymous', { ok: false, code, ms: Date.now() - startedAt, message: `注册匿名账号失败（code ${code}）` });
      await store.writeItem(DEVICE_COLLECTION, ANON_ID, { failedAt: Date.now(), code }).catch(() => null);
      anonCache = { token: '', until: Date.now() + ANON_FAIL_COOLDOWN_MS };
      return '';
    }
    const docNext = { token, deviceId: profile.deviceId, userId: String(res.body?.userId || ''), at: Date.now() };
    await store.writeItem(DEVICE_COLLECTION, ANON_ID, docNext).catch(() => null);
    anonCache = docNext;
    record('anonymous', { ok: true, code, ms: Date.now() - startedAt, message: `匿名账号 uid=${docNext.userId}` });
    return token;
  } catch (err) {
    record('anonymous', { ok: false, code: err.code || 502, ms: Date.now() - startedAt, message: err.message });
    anonCache = { token: '', until: Date.now() + ANON_FAIL_COOLDOWN_MS };
    return '';
  }
}

/**
 * 造一个"官方客户端会发出来的那种"身份：稳定 deviceId + 身份 cookie + 匿名 token。
 * 有 MUSIC_U 就不加 MUSIC_A（上游也是这么判断的）。
 */
export async function identityFor(store, cookie = {}) {
  const profile = await getDeviceProfile(store);
  const merged = {
    _ntes_nuid: profile._ntes_nuid,
    _ntes_nnid: profile._ntes_nnid,
    WNMCID: profile.WNMCID,
    ...cookie,
  };
  if (!merged.MUSIC_U && !merged.MUSIC_A) {
    const token = await getAnonymousToken(store).catch(() => '');
    if (token) merged.MUSIC_A = token;
  }
  return createIdentity({ deviceId: profile.deviceId, cookie: merged });
}

/* ------------------------------------------------------------------ */
/* 扫码：开始                                                          */
/* ------------------------------------------------------------------ */

/**
 * 生成一把新的扫码 key，并把二维码直接渲染成 SVG 返回。
 *
 * 注意：**不落任何服务端状态**。网易云自己记得这把 key，我们靠 state 里的签名
 * 把 sub / deviceId / key 串起来 —— 这样 Netlify 那种"每次请求可能落在不同实例"
 * 的部署也能正常工作（不需要共享内存，也不需要为每次扫码写一次 Blobs）。
 */
export async function startQrLogin({ sub, store }) {
  const cfg = neteaseLoginConfig();
  if (!cfg.enabled) throw new NeteaseError('网易云登录已关闭');

  const startedAt = Date.now();
  const since = Date.now() - (qrCooldown.get(sub) || 0);
  if (since < QR_COOLDOWN_MS) {
    throw new NeteaseError(
      `刚生成过一个二维码，${Math.ceil((QR_COOLDOWN_MS - since) / 1000)} 秒后再试（频繁要码会被风控）`,
      { status: 429 },
    );
  }
  qrCooldown.set(sub, Date.now());

  // 固定的设备身份 + 身份 cookie + 匿名 token：让网易云看到的始终是"同一台装过 App 的设备"
  const identity = await identityFor(store);

  let res;
  try {
    res = await eapiRequest('/api/login/qrcode/unikey', { type: 3 }, identity);
  } catch (err) {
    record('unikey', { ok: false, code: err.code || 502, ms: Date.now() - startedAt, message: err.message, sub });
    throw err;
  }

  const code = Number(res.body?.code);
  if (code !== 200 || !res.body?.unikey) {
    const message = res.body?.message || res.body?.msg || `网易云没有给出扫码 key（code ${code || '?'}）`;
    record('unikey', { ok: false, code, ms: Date.now() - startedAt, message, sub });
    throw new NeteaseError(message, { code, status: 502, body: res.body });
  }

  const key = String(res.body.unikey);
  const qrUrl = `https://music.163.com/login?codekey=${encodeURIComponent(key)}`;
  const secret = await getSecrets(store);
  // 要码这一次网易云会下发 NMTID（设备指纹的一部分）。官方客户端之后每个请求都带着它，
  // 我们把它钉进 state，轮到 check 时再带回去 —— 少这一项，同一次扫码前后就像两台设备。
  const nmtid = String(res.cookie?.NMTID || '').trim();
  const state = signState(secret, {
    sub,
    dev: identity.deviceId,
    key,
    exp: Date.now() + QR_TTL_MS,
    ...(nmtid ? { nmtid } : {}),
  });

  record('unikey', { ok: true, code, ms: Date.now() - startedAt, sub });

  return {
    key,
    state,
    qrUrl,
    // 二维码内容就是上面这个 URL：用网易云 App 扫，App 会去打它自己的登录确认
    qrSvg: qrSvg(qrUrl, { size: 240, margin: 3, ecl: 'L', label: '网易云扫码登录' }),
    expiresIn: Math.floor(QR_TTL_MS / 1000),
    deviceId: identity.deviceId.slice(0, 8) + '…', // 只回显前 8 位，够排查，不足以当凭据
  };
}

/* ------------------------------------------------------------------ */
/* 扫码：轮询                                                          */
/* ------------------------------------------------------------------ */

const QR_STATES = {
  800: { status: 'expired', message: '二维码已过期，请重新生成' },
  801: { status: 'waiting', message: '等待扫码' },
  802: { status: 'scanned', message: '已扫码，请在手机上点「确认登录」' },
  803: { status: 'confirmed', message: '登录成功' },
};

/**
 * 轮询一次。
 *
 * 返回的 `status` 是给界面用的状态机，**不是** HTTP 状态：
 *   waiting / scanned / confirmed / expired / network / error
 * 只有 confirmed 才会写绑定。
 */
export async function checkQrLogin({ sub, key, state, store }) {
  const startedAt = Date.now();
  const secret = await getSecrets(store);
  const payload = verifyState(secret, state);
  if (payload.sub !== sub) throw new NeteaseError('这个二维码不是发给你的，请重新生成');
  if (payload.key !== key) throw new NeteaseError('二维码 key 与状态不匹配，请重新生成');

  const profile = await getDeviceProfile(store);
  if (payload.dev !== profile.deviceId) {
    throw new NeteaseError('设备身份已经变过了，这个二维码作废，请重新生成', { status: 400 });
  }
  // 轮询也要用同一份身份（含 _ntes_nuid / WNMCID / MUSIC_A）与那一轮的 NMTID
  const identity = await identityFor(store, payload.nmtid ? { NMTID: payload.nmtid } : {});

  let res;
  try {
    res = await eapiRequest('/api/login/qrcode/client/login', { key, type: 3 }, identity);
  } catch (err) {
    // 网络层失败不当作"扫码失败"：界面上一句"网络波动"比把人踢回第一步好
    record('check', { ok: false, code: err.code || 502, ms: Date.now() - startedAt, message: err.message, sub });
    return {
      status: err.network ? 'network' : 'error',
      code: err.code || 502,
      message: err.network ? `网络波动：${err.message}` : err.message,
    };
  }

  const body = res.body || {};
  const code = Number(body.code);
  const known = QR_STATES[code];

  if (code === 803) {
    const cookie = normalizeCookie(res.cookie);
    if (!cookie.MUSIC_U) {
      record('check', { ok: false, code, ms: Date.now() - startedAt, message: '803 但没有 MUSIC_U', sub });
      return { status: 'error', code, message: '扫码确认了，但网易云没有下发登录凭据（MUSIC_U），请重试' };
    }

    // 拿到凭据后立刻验一次：能读到自己是哪个账号，才说明这个 cookie 真的可用
    let profile = null;
    try {
      profile = await fetchProfile(await identityFor(store, cookie));
    } catch (err) {
      record('profile', { ok: false, code: err.code || 0, ms: 0, message: err.message, sub });
    }
    if (!profile) {
      // cookie 有了但读不到账号：照样绑，但把"未知"说清楚，界面能提示重新登录
      profile = { uid: '', nickname: '（未读到昵称）', avatarUrl: '', vipType: 0 };
    }

    const doc = await writeBinding(store, sub, { cookie, profile });
    record('check', { ok: true, code, ms: Date.now() - startedAt, message: `已绑定 ${profile.nickname}`, sub });
    record('bind', { ok: true, code, ms: Date.now() - startedAt, message: `uid=${profile.uid}`, sub });
    return { status: 'confirmed', code, message: '登录成功', profile, binding: publicBinding(doc) };
  }

  if (known) {
    record('check', { ok: true, code, ms: Date.now() - startedAt, message: known.message, sub });
    return { status: known.status, code, message: body.message || known.message };
  }

  const message = body.message || body.msg || `网易云返回了未预期的结果（code ${code || '?'}）`;
  // 8821 是网易云的风控码：需要人去做行为验证，重试和换 key 都没用
  const risk = code === 8821;
  record('check', { ok: false, code, ms: Date.now() - startedAt, message, sub });
  return {
    status: risk ? 'risk' : 'error',
    code,
    message: risk ? '网易云判定这次登录有风险（8821），请稍后再试，或直接在官方客户端扫码' : message,
  };
}

/* ------------------------------------------------------------------ */
/* 个人数据                                                            */
/* ------------------------------------------------------------------ */

function artistNames(song) {
  const list = song?.ar || song?.artists || [];
  return Array.isArray(list) ? list.map((a) => String(a?.name || '')).filter(Boolean).join(' / ') : '';
}

function coverOf(song) {
  return song?.al?.picUrl || song?.album?.picUrl || song?.album?.artist?.img1v1Url || '';
}

/** 统一成前端现成的 SearchSong 形状（和 /api/netease/search 的输出一致）。 */
export function shapeSong(song) {
  return {
    id: String(song?.id ?? ''),
    name: String(song?.name || ''),
    artist: artistNames(song),
    album: String(song?.al?.name || song?.album?.name || ''),
    cover: coverOf(song),
    duration: Number(song?.dt || song?.duration || 0),
    fee: Number(song?.fee) || 0,
    vip: Number(song?.fee) === 1,
  };
}

/** 用登录态读"我是谁"。失败不抛：调用方自己决定要不要当未登录处理。 */
export async function fetchProfile(identity) {
  const res = await eapiRequest('/api/nuser/account/get', {}, identity);
  const body = res.body || {};
  if (Number(body.code) !== 200 || !body.profile) return null;
  const p = body.profile;
  return {
    uid: String(p.userId ?? p.uid ?? ''),
    nickname: String(p.nickname || ''),
    avatarUrl: String(p.avatarUrl || ''),
    signature: String(p.signature || '').slice(0, 120),
    vipType: Number(p.vipType) || 0,
    level: Number(body.level) || 0,
  };
}

/** 我的歌单（含"我喜欢的音乐"，它是一条 specialType=5 的歌单）。 */
export async function listMyPlaylists(identity, uid, { limit = 60 } = {}) {
  if (!uid) throw new NeteaseError('绑定信息里没有 uid，请重新登录');
  const res = await eapiRequest('/api/user/playlist', {
    uid,
    limit: Math.min(200, Math.max(1, limit)),
    offset: 0,
    includeVideo: false,
  }, identity);
  const body = res.body || {};
  if (Number(body.code) !== 200) {
    throw new NeteaseError(body.message || `读取歌单失败（code ${body.code}）`, { code: body.code });
  }
  const list = Array.isArray(body.playlist) ? body.playlist : [];
  return list.map((p) => ({
    id: String(p.id),
    name: String(p.name || '未命名歌单'),
    cover: String(p.coverImgUrl || ''),
    trackCount: Number(p.trackCount) || 0,
    playCount: Number(p.playCount) || 0,
    // specialType: 5 = 我喜欢的音乐；subscribed = 收藏别人的歌单
    specialType: Number(p.specialType) || 0,
    subscribed: !!p.subscribed,
    creator: String(p.creator?.nickname || ''),
    privacy: Number(p.privacy) || 0,
  }));
}

/**
 * 带登录态读歌单详情。**这是本站原来做不到的那一格**：
 * 私密歌单 / 我喜欢的音乐，匿名接口一律 404。
 * 返回形状和公开的 /api/netease/playlist 完全一致，前端可以复用同一套导入逻辑。
 */
export async function fetchPlaylistWithLogin(identity, id, { limit = 300 } = {}) {
  const res = await eapiRequest('/api/v6/playlist/detail', {
    id: String(id),
    n: Math.min(1000, Math.max(1, limit)),
    s: 8,
  }, identity);
  const body = res.body || {};
  if (Number(body.code) !== 200 || !body.playlist) {
    throw new NeteaseError(
      body.message || `读取歌单失败（code ${body.code ?? '?'}）`,
      { code: body.code },
    );
  }
  const pl = body.playlist;
  const trackIds = (pl.trackIds || [])
    .map((t) => String(t.id))
    .filter((s) => /^\d+$/.test(s))
    .slice(0, limit);
  return {
    id: String(pl.id ?? id),
    name: String(pl.name || '未命名歌单'),
    cover: String(pl.coverImgUrl || ''),
    creator: String(pl.creator?.nickname || ''),
    description: String(pl.description || '').slice(0, 300),
    trackCount: Number(pl.trackCount) || trackIds.length,
    trackIds,
  };
}

/** 我喜欢的音乐：只取 id 列表（前端拿 id 再去 /api/netease/songs 补元数据）。 */
export async function listLikedIds(identity, uid) {
  if (!uid) throw new NeteaseError('绑定信息里没有 uid，请重新登录');
  const res = await eapiRequest('/api/song/like/get', { uid }, identity);
  const body = res.body || {};
  const code = Number(body.code);
  if (code === 301) throw new NeteaseError('登录已失效，请重新扫码', { code });
  if (code !== 200) throw new NeteaseError(body.message || `读取喜欢列表失败（code ${code}）`, { code });
  return {
    ids: (Array.isArray(body.ids) ? body.ids : []).map(String).filter((s) => /^\d+$/.test(s)),
  };
}

/** 每日推荐（按登录账号算）。匿名也能拿到，但登录后才是"你的"。 */
export async function dailyRecommend(identity, { limit = 30 } = {}) {
  const res = await eapiRequest('/api/v3/discovery/recommend/songs', {}, identity);
  const body = res.body || {};
  if (Number(body.code) !== 200) {
    throw new NeteaseError(body.message || `读取每日推荐失败（code ${body.code}）`, { code: body.code });
  }
  const songs = body.data?.dailySongs || body.recommend || [];
  return (Array.isArray(songs) ? songs : []).slice(0, limit).map(shapeSong);
}

/** 红心 / 取消红心。 */
export async function setSongLike(identity, uid, id, like) {
  if (!uid) throw new NeteaseError('绑定信息里没有 uid，请重新登录');
  const res = await eapiRequest('/api/song/like', {
    trackId: String(id),
    userid: String(uid),
    like: !!like,
  }, identity);
  const body = res.body || {};
  const code = Number(body.code);
  if (code === 301) throw new NeteaseError('登录已失效，请重新扫码', { code });
  if (code !== 200) throw new NeteaseError(body.message || `操作失败（code ${code}）`, { code });
  return { ok: true, like: !!like, id: String(id) };
}

/** 诊断报告：给站长看的，里面没有 cookie、没有昵称，只有事件与状态。 */
export async function diagnostics(store) {
  const secret = await getSecrets(store).catch(() => null);
  return {
    config: neteaseLoginConfig(),
    secrets: secret ? { source: secret.source } : null,
    events: recentEvents(),
    now: new Date().toISOString(),
  };
}

/* ================================================================== */
/* 云盘（你上传到网易云的那些歌）                                        */
/* ================================================================== */
/*
 * 为什么单独做：云盘曲目**只有登录态能读**，匿名接口一律拿不到（列表、详情、播放地址都是）。
 * 它和 VIP 曲目是两件事 —— 云盘里是用户自己上传的文件，不涉及会员版权档；
 * 所以这里可以放心用登录态取地址，但仍然**只认云盘里的 id**（见 assertCloudSong）：
 * 这个端点不能变成"拿用户 cookie 换任意 VIP 音频"的通用后门。
 *
 * 加密方式用 weapi：上游给 `/api/v1/cloud/get` 指定的就是 weapi，eapi 不认。
 */

const CLOUD_TTL_MS = 3 * 60 * 1000;
const cloudListCache = new Map();        // uid → { at, songs }
const cloudMemberCache = new Map();      // `${uid}:${id}` → { at, ok }
const CLOUD_AUDIO_CACHE_MS = 10 * 60 * 1000;
const cloudAudioCache = new Map();       // `${uid}:${id}` → { at, info }

/** 云盘条目 → 前端能直接用的形状。字段在不同账号/匹配状态下会缺，所以每个都给了回落。 */
export function shapeCloudSong(item) {
  const s = item?.simpleSong || {};
  const artists = Array.isArray(s.ar) ? s.ar.map((a) => a.name).filter(Boolean).join(' / ') : '';
  return {
    id: String(item?.songId ?? item?.id ?? s.id ?? ''),
    cloudId: String(item?.id ?? ''),
    name: String(item?.songName || s.name || '未命名'),
    artist: String(item?.artist || artists || ''),
    album: String(item?.album || s.al?.name || ''),
    cover: String(item?.cover || s.al?.picUrl || ''),
    duration: Number(s.dt) || 0,
    fileSize: Number(item?.fileSize) || 0,
    bitrate: Number(item?.bitrate) || 0,
    // 有的账号只给 addTime，有的给 creationTime；毫秒还是秒也不统一
    addTime: Number(item?.addTime || item?.creationTime) || 0,
    matched: Boolean(item?.simpleSong),
  };
}

/** 云盘列表。`limit` 上限按接口经验取 200。 */
export async function listCloudSongs(identity, uid, { limit = 200, offset = 0 } = {}) {
  if (!uid) throw new NeteaseError('绑定信息里没有 uid，请重新登录');
  const cacheKey = String(uid);
  const hit = cloudListCache.get(cacheKey);
  if (!offset && hit && Date.now() - hit.at < CLOUD_TTL_MS) return hit.songs;

  const res = await weapiRequest('/api/v1/cloud/get', {
    limit: Math.min(200, Math.max(1, limit)),
    offset: Math.max(0, offset),
  }, identity);
  const body = res.body || {};
  const code = Number(body.code);
  if (code === 301) throw new NeteaseError('登录已失效，请重新扫码', { code });
  if (code !== 200) throw new NeteaseError(body.message || `读取云盘失败（code ${code}）`, { code });
  const songs = (Array.isArray(body.data) ? body.data : []).map(shapeCloudSong).filter((s) => s.id);
  if (!offset) cloudListCache.set(cacheKey, { at: Date.now(), songs });
  return songs;
}

/**
 * 这个 id 到底在不在云盘里。播放前必须问一次 —— 否则端点就成了任意曲目的音频代理。
 * 结果按 id 缓存 5 分钟：`/api/v1/cloud/get/byids` 是精确查询，比翻列表可靠。
 */
async function assertCloudSong(identity, uid, id) {
  const key = `${uid}:${id}`;
  const hit = cloudMemberCache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) {
    if (!hit.ok) throw new NeteaseError('这首不在你的云盘里', { status: 403 });
    return;
  }
  const res = await weapiRequest('/api/v1/cloud/get/byids', { songIds: [String(id)] }, identity);
  const list = Array.isArray(res.body?.data) ? res.body.data : [];
  const ok = list.some((item) => String(item?.songId ?? item?.id) === String(id));
  cloudMemberCache.set(key, { at: Date.now(), ok });
  if (!ok) throw new NeteaseError('这首不在你的云盘里', { status: 403 });
}

/**
 * 解析云盘曲目的播放地址。
 * 请求 `br=999000`：云盘放的是**你自己上传的文件**，不涉及会员音质档位；
 * 128k 的免费档限制只针对版权曲目（见 README 的「码率规则」）。
 */
export async function resolveCloudAudio(identity, uid, id) {
  const cacheKey = `${uid}:${id}`;
  const hit = cloudAudioCache.get(cacheKey);
  if (hit && Date.now() - hit.at < CLOUD_AUDIO_CACHE_MS) return hit.info;

  await assertCloudSong(identity, uid, id);
  const res = await weapiRequest('/api/song/enhance/player/url', {
    ids: JSON.stringify([String(id)]),
    br: 999000,
  }, identity);
  const body = res.body || {};
  const code = Number(body.code);
  if (code === 301) throw new NeteaseError('登录已失效，请重新扫码', { code });
  const d = Array.isArray(body.data) ? body.data[0] : null;
  if (code !== 200 || !d?.url) {
    throw new NeteaseError(`云盘曲目没有可播放地址（code ${code || d?.code || '?'}）`, { code, status: 404 });
  }
  const info = {
    url: d.url,
    via: 'cloud',
    bitrate: Number(d.br) || 0,
    bytes: Number(d.size) || 0,
    type: d.type || 'mp3',
    trial: !!d.freeTrialInfo,
  };
  cloudAudioCache.set(cacheKey, { at: Date.now(), info });
  return info;
}

/**
 * 解析普通曲目（含会员 / 付费档）的播放地址 —— **用绑定账号自己的会话**。
 *
 * 这里照抄的是 Folia 的做法（`getSongUrl: (id, level='exhigh')`）：
 * 用 **v1 接口 + `level` 档位**，而不是老的 `br`。
 *   standard 128k / exhigh 320k / lossless / hires
 * 账号有什么权限就返回什么档位（实测请求 hires 会回 lossless，说明服务端会自己降），
 * 我们再把返回的 `d.level` 记下来，界面/诊断能看到实际拿到的是哪一档。
 *
 * 逐级降级：请求的档位拿不到就往下试（hires → lossless → exhigh → standard）。
 * 只在 `/api/netease/login/audio` 里用，且必须带签名 token ——
 * 匿名路径 `/api/netease/audio` 一行没改，仍然只问免费档。
 */
const TRACK_AUDIO_LEVELS = ['standard', 'exhigh', 'lossless', 'hires'];

/** 允许 'high' 这种界面叫法；未知值一律回落到 exhigh。 */
export function normalizeAudioLevel(level) {
  const raw = String(level || '').trim().toLowerCase();
  if (raw === 'high') return 'exhigh';
  return TRACK_AUDIO_LEVELS.includes(raw) ? raw : 'exhigh';
}

const trackAudioCache = new Map();
const TRACK_AUDIO_TTL_MS = 10 * 60 * 1000;

export async function resolveTrackAudio(identity, id, { level = 'exhigh' } = {}) {
  const key = String(id);
  const wanted = normalizeAudioLevel(level);
  const cacheKey = `${key}:${wanted}`;
  const hit = trackAudioCache.get(cacheKey);
  if (hit && Date.now() - hit.at < TRACK_AUDIO_TTL_MS) return hit.info;

  // hires → lossless → exhigh → standard
  const chain = TRACK_AUDIO_LEVELS.slice(0, TRACK_AUDIO_LEVELS.indexOf(wanted) + 1).reverse();
  const tried = [];
  let lastCode = 0;

  for (const lv of chain) {
    const res = await eapiRequest('/api/song/enhance/player/url/v1', {
      ids: JSON.stringify([key]),
      level: lv,
      encodeType: 'flac',
    }, identity);
    const body = res.body || {};
    const code = Number(body.code);
    lastCode = code;
    if (code === 301) throw new NeteaseError('登录已失效，请重新扫码', { code });
    const d = Array.isArray(body.data) ? body.data[0] : null;
    tried.push(`${lv}:${d?.url ? 'ok' : (code || d?.code || 'no-url')}`);
    if (code !== 200 || !d?.url) continue;

    const info = {
      url: d.url,
      via: `login@${d.level || lv}`,
      level: d.level || lv,
      bitrate: Number(d.br) || 0,
      bytes: Number(d.size) || 0,
      type: d.type || 'mp3',
      trial: !!d.freeTrialInfo,
      tried,
    };
    trackAudioCache.set(cacheKey, { at: Date.now(), info });
    if (trackAudioCache.size > 300) {
      [...trackAudioCache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 120)
        .forEach(([k]) => trackAudioCache.delete(k));
    }
    return info;
  }

  throw new NeteaseError(
    `这个账号拿不到这首的音频（${tried.join('、') || `code ${lastCode || '?'}`}，可能没匹配到 / 版权受限）`,
    { code: lastCode, status: 404 },
  );
}

/* ---------------- 云盘音频的短期签名（<audio> 带不了 Bearer） ---------------- */

const CLOUD_AUDIO_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * 给某首歌签一个音频 URL。
 *
 * 为什么需要：`<audio src>` 是浏览器自己发的请求，**带不上本站的 Bearer 令牌**，
 * 也不能让音频端点裸奔（否则谁都能拿站长 cookie 换音频）。
 * 所以列表接口顺手把「sub + 歌曲 id + 过期时间」签进 URL，音频端点只认这个签名。
 * 30 天是权衡：播放列表存在 localStorage 里，太短会在某天突然全部放不出声音。
 *
 * kind 区分两种用途：
 *   · cloud-audio：云盘曲目（播放前还要确认 id 真在云盘里）
 *   · track-audio：普通曲目 / 会员曲目（只校验"这个 sub 的绑定还在"）
 */
export async function signAudioUrl(store, sub, id, kind = 'track-audio', level = 'exhigh') {
  const secret = await getSecrets(store);
  const payload = {
    kind,
    sub,
    id: String(id),
    // 音质档位钉进签名：改 URL 上的 level 是无效的（会被签名校验拦掉）
    ...(kind === 'track-audio' ? { level: normalizeAudioLevel(level) } : {}),
    exp: Date.now() + CLOUD_AUDIO_TOKEN_TTL_MS,
  };
  const token = signToken(secret, payload);
  return `/api/netease/login/audio?id=${encodeURIComponent(id)}&t=${encodeURIComponent(token)}`;
}

export async function cloudAudioUrl(store, sub, id) {
  return signAudioUrl(store, sub, id, 'cloud-audio');
}

/** 校验音频 URL 上的签名，返回 { kind, sub, id }；不合法就抛。 */
export async function verifyCloudAudioToken(store, token) {
  const secret = await getSecrets(store);
  const payload = verifyToken(secret, token, {
    label: '音频链接',
    expired: '已过期，请回「云盘」里再点一次播放',
  });
  if (!['cloud-audio', 'track-audio'].includes(payload?.kind) || !payload?.sub || !payload?.id) {
    throw new NeteaseError('音频签名不完整，请回「云盘」里再点一次播放', { status: 400 });
  }
  return payload;
}
