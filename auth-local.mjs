/**
 * auth-local.mjs — 本站自己的账号系统（不依赖 Auth0）
 * ==================================================================
 * 为什么会有这个文件：
 *   Auth0 的 SPA 流程要求 redirect_uri 是 http(s) 的公网地址。桌面版跑在
 *   自定义协议 `fish://app` 下，Auth0 不认；而且这台机器上没有 Auth0 后台权限，
 *   加不了回调地址。于是「纯本地」的那一版需要一个不依赖第三方的账号系统。
 *
 * 适用范围：只在本机/自建服务里打开（`FT_LOCAL_AUTH=1` 时才启用）。
 *   · 密码用 scrypt 加盐哈希（node:crypto，零依赖）
 *   · 会话是 HMAC-SHA256 签名的无状态令牌（默认 30 天）
 *   · 第一个注册的账号自动成为站长；之后注册的都是普通成员
 *   · 失败次数按邮箱限流，避免本机被脚本爆破
 *
 * 这里**不做**的事（也不该由这一层做）：
 *   邮箱验证、找回密码、多设备会话管理 —— 那是完整账号服务的活。
 *   忘了密码只能删 `data/auth/users.json` 重来，这是本地账号的取舍，写进 README 了。
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;   // 30 天
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 200;
const MAX_USERS = 50;                            // 本机应用，别当多租户系统用
const MAX_FAILS = 8;                             // 同一邮箱连续失败次数
const FAIL_WINDOW_MS = 10 * 60 * 1000;

let store = null;          // { file, secret, users: [] }
const fails = new Map();   // email → { n, at }

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const fromB64url = (s) => Buffer.from(String(s), 'base64url');

/* ---------------- 存储 ---------------- */

function fileOf(dataDir) {
  return path.join(dataDir, 'auth', 'users.json');
}

function load(dataDir) {
  const file = fileOf(dataDir);
  let doc = null;
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    doc = null;
  }
  if (!doc || !Array.isArray(doc.users)) {
    doc = { version: 1, secret: crypto.randomBytes(32).toString('hex'), users: [] };
  }
  if (!doc.secret || typeof doc.secret !== 'string' || doc.secret.length < 32) {
    doc.secret = crypto.randomBytes(32).toString('hex');
  }
  store = { file, secret: doc.secret, users: doc.users };
  return store;
}

function save() {
  if (!store) throw new Error('本地账号系统还没初始化');
  const dir = path.dirname(store.file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${store.file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({
    version: 1,
    secret: store.secret,
    users: store.users,
  }, null, 2), 'utf8');
  fs.renameSync(tmp, store.file);
}

/* ---------------- 密码 ---------------- */

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password.normalize('NFKC'), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function checkPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, 'base64');
  const want = Buffer.from(hashB64, 'base64');
  let got;
  try {
    got = crypto.scryptSync(password.normalize('NFKC'), salt, want.length, {
      N: Number(N) || 16384, r: Number(r) || 8, p: Number(p) || 1,
    });
  } catch {
    return false;
  }
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

/* ---------------- 初始化 ---------------- */

/**
 * 打开本地账号系统。`dataDir` 一般就是 DATA_DIR（桌面版是 %APPDATA%\FishTemple\data）。
 * 返回 true 表示可用。
 */
export function initLocalAuth({ dataDir } = {}) {
  if (!dataDir) return false;
  try {
    load(dataDir);
    return true;
  } catch {
    store = null;
    return false;
  }
}

export function localAuthReady() {
  return !!store;
}

/* ---------------- 用户 ---------------- */

function normEmail(email) {
  return String(email || '').trim().toLowerCase();
}

const emailLooksOk = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function publicUser(doc) {
  return {
    sub: `local:${doc.id}`,
    email: doc.email,
    name: doc.name || doc.email.split('@')[0],
    picture: '',
    verified: true,          // 本地账号没有邮件验证，但其身份是"这台机器的主人"
    role: doc.role === 'owner' ? 'owner' : 'member',
    source: 'local',
  };
}

function issueToken(doc) {
  const payload = {
    sub: `local:${doc.id}`,
    email: doc.email,
    name: doc.name || '',
    role: doc.role === 'owner' ? 'owner' : 'member',
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', store.secret).update(body).digest();
  return `${body}.${b64url(sig)}`;
}

/** 校验令牌。成功返回 claims，失败抛错（调用方回 401）。 */
export function verifyLocalToken(token) {
  if (!store) throw new Error('本地账号系统未启用');
  const parts = String(token || '').split('.');
  if (parts.length !== 2) throw new Error('令牌格式不对');
  const [body, sigB64] = parts;
  const want = crypto.createHmac('sha256', store.secret).update(body).digest();
  const got = fromB64url(sigB64);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) throw new Error('签名校验失败');
  let claims;
  try {
    claims = JSON.parse(fromB64url(body).toString('utf8'));
  } catch {
    throw new Error('令牌内容损坏');
  }
  if (!(Number(claims.exp) > Date.now())) throw new Error('登录已过期');
  const doc = store.users.find((u) => `local:${u.id}` === claims.sub);
  if (!doc) throw new Error('账号已不存在');
  return { ...claims, role: doc.role === 'owner' ? 'owner' : 'member' };
}

/* ---------------- 注册 / 登录 / 登出 ---------------- */

function throttleKey(email) {
  return email || '(empty)';
}

function assertNotThrottled(email) {
  const rec = fails.get(throttleKey(email));
  if (!rec) return;
  if (Date.now() - rec.at > FAIL_WINDOW_MS) { fails.delete(throttleKey(email)); return; }
  if (rec.n >= MAX_FAILS) {
    const left = Math.ceil((FAIL_WINDOW_MS - (Date.now() - rec.at)) / 60000);
    throw Object.assign(new Error(`失败次数太多，${left} 分钟后再试`), { status: 429 });
  }
}

function noteFail(email) {
  const key = throttleKey(email);
  const rec = fails.get(key);
  if (!rec || Date.now() - rec.at > FAIL_WINDOW_MS) fails.set(key, { n: 1, at: Date.now() });
  else { rec.n += 1; rec.at = Date.now(); }
}

export function registerLocal({ email, password, name } = {}) {
  if (!store) throw Object.assign(new Error('本站未启用本地账号'), { status: 501 });
  const mail = normEmail(email);
  if (!emailLooksOk(mail)) throw Object.assign(new Error('邮箱格式看起来不对'), { status: 400 });
  const pass = String(password || '');
  if (pass.length < MIN_PASSWORD) throw Object.assign(new Error(`密码至少 ${MIN_PASSWORD} 位`), { status: 400 });
  if (pass.length > MAX_PASSWORD) throw Object.assign(new Error('密码太长了'), { status: 400 });
  if (store.users.some((u) => u.email === mail)) throw Object.assign(new Error('这个邮箱已经注册过了，直接登录'), { status: 409 });
  if (store.users.length >= MAX_USERS) throw Object.assign(new Error(`本机最多 ${MAX_USERS} 个账号`), { status: 429 });

  const owners = String(process.env.OWNER_EMAILS || '')
    .split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const role = store.users.length === 0 || owners.includes(mail) ? 'owner' : 'member';

  const doc = {
    id: crypto.randomBytes(8).toString('hex'),
    email: mail,
    name: String(name || '').trim().slice(0, 40) || mail.split('@')[0],
    pass: hashPassword(pass),
    role,
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };
  store.users.push(doc);
  save();
  return { user: publicUser(doc), token: issueToken(doc) };
}

export function loginLocal({ email, password } = {}) {
  if (!store) throw Object.assign(new Error('本站未启用本地账号'), { status: 501 });
  const mail = normEmail(email);
  assertNotThrottled(mail);
  const doc = store.users.find((u) => u.email === mail);
  const pass = String(password || '');
  // 账号不存在也照样算一次失败，别让「有/没有这个邮箱」从响应时间或文案里漏出去
  if (!doc || !checkPassword(pass, doc.pass)) {
    noteFail(mail);
    throw Object.assign(new Error('邮箱或密码不对'), { status: 401 });
  }
  doc.lastSeenAt = new Date().toISOString();
  save();
  fails.delete(throttleKey(mail));
  return { user: publicUser(doc), token: issueToken(doc) };
}

/** 改了资料之后让令牌里的 name 跟上（不重发令牌，前端下次 /me 会拿到新的） */
export function touchLocalUser(sub) {
  if (!store) return null;
  const doc = store.users.find((u) => `local:${u.id}` === sub);
  if (!doc) return null;
  doc.lastSeenAt = new Date().toISOString();
  return publicUser(doc);
}

export function localUserCount() {
  return store ? store.users.length : 0;
}

/** 开发者用：清空所有本地账号（只在测试脚本里调） */
export function _resetLocalAuth() {
  if (!store) return;
  store.users = [];
  save();
}
