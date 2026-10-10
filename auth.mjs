/**
 * auth.mjs — Auth0 令牌校验与角色判定
 * ==================================================================
 * 为什么这么做（而不是自己存密码）：
 *   密码一旦由我们保存，就得自己承担加盐哈希、找回密码、爆破防护、邮箱验证……
 *   这些 Auth0 已经做好，而且密码**根本不会经过我们的代码**：
 *   浏览器在 Auth0 的页面上登录，我们只拿到一个签名过的令牌。
 *   所以这里的职责只有两件事：
 *     ① 验证令牌确实是 Auth0 签发的、没过期、受众是本应用；
 *     ② 由令牌里的邮箱判定角色（站长 / 普通成员）。
 *
 * 只用 node:crypto —— 不引入 jwks-rsa / jsonwebtoken 之类的依赖：
 *   · JWKS 就是一个 JSON（含 RSA 公钥的 n/e），取回来用 createPublicKey({ format: 'jwk' }) 即可；
 *   · 验签用 crypto.verify('sha256', data, keyObject, sig)。
 *
 * 环境变量（在 Netlify 后台配，本地用 .env 或直接不配）：
 *   AUTH0_DOMAIN     例如 dev-xxxx.us.auth0.com（本地测试也可以填 http://127.0.0.1:PORT，见下）
 *   AUTH0_CLIENT_ID  应用的 Client ID
 *   AUTH0_AUDIENCE   可选：如果建了 API（推荐留空，本实现用 ID Token 校验）
 *   OWNER_EMAILS     站长邮箱白名单，逗号或空格分隔
 *
 * ⚠️ 站长判定要求 `email_verified === true`：否则任何人都能用别人的邮箱注册一个
 *    未验证账号来冒充站长（Auth0 会把验证邮件发给真正的邮箱主人，攻击者收不到）。
 */

import crypto from 'node:crypto';

const JWKS_TTL = 60 * 60 * 1000;          // 公钥缓存 1 小时
const jwksCache = new Map();              // origin → { at, keys }
const jwksInflight = new Map();

/** 读取当前环境配置（每次读，方便本地改完不用重启） */
export function authConfig() {
  const domain = String(process.env.AUTH0_DOMAIN || '').trim().replace(/\/+$/, '');
  const clientId = String(process.env.AUTH0_CLIENT_ID || '').trim();
  const audience = String(process.env.AUTH0_AUDIENCE || '').trim();
  const owners = String(process.env.OWNER_EMAILS || '')
    .split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  return {
    enabled: !!(domain && clientId),
    domain: domain || null,
    clientId: clientId || null,
    audience: audience || null,
    owners,
  };
}

/** 允许把 domain 写成 http://127.0.0.1:PORT —— 自检里用本地模拟 IdP 走完全同一条代码路径 */
function originOf(domain) {
  return domain.startsWith('http://') || domain.startsWith('https://') ? domain : `https://${domain}`;
}
function jwksUrlOf(domain) {
  return `${originOf(domain)}/.well-known/jwks.json`;
}
function issuerOf(domain) {
  return `${originOf(domain)}/`;
}

/** 取 JWKS 公钥（带缓存；遇到不认识的 kid 会强制刷新一次） */
async function getKeys(domain, { force = false } = {}) {
  const url = jwksUrlOf(domain);
  const hit = jwksCache.get(url);
  if (!force && hit && Date.now() - hit.at < JWKS_TTL) return hit.keys;
  if (jwksInflight.has(url)) return jwksInflight.get(url);

  const p = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`拉取 JWKS 失败：HTTP ${res.status}`);
      const json = await res.json();
      const keys = Array.isArray(json?.keys) ? json.keys : [];
      if (!keys.length) throw new Error('JWKS 里没有公钥');
      jwksCache.set(url, { at: Date.now(), keys });
      return keys;
    } finally {
      clearTimeout(timer);
      jwksInflight.delete(url);
    }
  })();
  jwksInflight.set(url, p);
  return p;
}

function b64urlToBuffer(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/** 用 JWKS 里的 RSA 公钥验证 RS256 签名 */
function verifySignature(header, signingInput, signature, jwk) {
  if (header.alg !== 'RS256') throw new Error(`不支持的签名算法：${header.alg}`);
  if (jwk.kty !== 'RSA') throw new Error('公钥不是 RSA');
  const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  return crypto.verify('sha256', Buffer.from(signingInput), key, signature);
}

/**
 * 校验一个 Auth0 令牌（ID Token）。
 * 返回 claims；任何一步不通过都抛错（调用方回 401）。
 */
export async function verifyToken(token, { cfg = authConfig() } = {}) {
  if (!cfg.enabled) throw new Error('本站没有配置 AUTH0_DOMAIN / AUTH0_CLIENT_ID');
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('令牌格式不对');

  const header = JSON.parse(b64urlToBuffer(parts[0]).toString('utf8'));
  const claims = JSON.parse(b64urlToBuffer(parts[1]).toString('utf8'));
  const signature = b64urlToBuffer(parts[2]);
  const signingInput = `${parts[0]}.${parts[1]}`;

  // 先看时间与签发方：这些不用验签就能挡掉大部分垃圾请求
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp === 'number' && claims.exp < now) throw new Error('令牌已过期');
  if (typeof claims.nbf === 'number' && claims.nbf > now + 60) throw new Error('令牌还没生效');
  if (claims.iss !== issuerOf(cfg.domain)) throw new Error('签发方不匹配');

  // 受众：ID Token 的 aud 是 client_id（也可能是数组）
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const wantAud = cfg.audience || cfg.clientId;
  if (!aud.includes(wantAud)) throw new Error('受众不匹配');

  // 验签：先按 kid 找，找不到就刷新一次 JWKS 再找（Auth0 轮换密钥时会发生）
  let keys = await getKeys(cfg.domain);
  let jwk = keys.find((k) => k.kid === header.kid) || null;
  if (!jwk) {
    keys = await getKeys(cfg.domain, { force: true });
    jwk = keys.find((k) => k.kid === header.kid) || null;
  }
  if (!jwk) throw new Error('找不到对应的公钥（kid 不匹配）');
  if (!verifySignature(header, signingInput, signature, jwk)) throw new Error('签名校验失败');

  return claims;
}

/** 由 claims 判定角色：站长 = 邮箱在白名单里，且邮箱已验证 */
export function roleFor(claims, cfg = authConfig()) {
  const email = String(claims?.email || '').trim().toLowerCase();
  if (!email) return 'member';
  const listed = cfg.owners.includes(email);
  const verified = claims.email_verified !== false && claims.email_verified !== undefined
    ? claims.email_verified === true
    : false;
  // email_verified 必须显式为 true：Auth0 的 Database 连接默认会发验证邮件，
  // 未验证的账号不能因为"填了站长邮箱"就拿到站长权限。
  return listed && verified ? 'owner' : 'member';
}

/** 把 claims 整理成客户端要用的用户对象 */
export function userFromClaims(claims, cfg = authConfig()) {
  return {
    sub: String(claims.sub || ''),
    email: String(claims.email || ''),
    name: String(claims.name || claims.nickname || claims.email || '').slice(0, 80),
    picture: String(claims.picture || ''),
    verified: claims.email_verified === true,
    role: roleFor(claims, cfg),
  };
}

/**
 * 从请求里取身份。返回 { ok:true, user, claims } 或 { ok:false, status, error }。
 * 认两种携带方式：`Authorization: Bearer <token>`（前端 fetch）
 * 和 `Cookie: ft_token=<token>`（将来做 SSR/整页跳转时方便）。
 */
export async function authenticate(req) {
  const cfg = authConfig();
  if (!cfg.enabled) return { ok: false, status: 501, error: '本站还没有配置账号功能（缺 AUTH0_DOMAIN / AUTH0_CLIENT_ID）' };
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  let token = /^Bearer\s+(.+)$/i.test(header) ? header.replace(/^Bearer\s+/i, '').trim() : '';
  if (!token) {
    const cookie = req.headers?.cookie || '';
    const m = /(?:^|;\s*)ft_token=([^;]+)/.exec(cookie);
    if (m) token = decodeURIComponent(m[1]);
  }
  if (!token) return { ok: false, status: 401, error: '需要登录' };
  try {
    const claims = await verifyToken(token, { cfg });
    return { ok: true, user: userFromClaims(claims, cfg), claims };
  } catch (err) {
    return { ok: false, status: 401, error: `登录状态无效：${err.message}` };
  }
}
