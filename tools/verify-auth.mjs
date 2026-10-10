#!/usr/bin/env node
/**
 * tools/verify-auth.mjs — 账号 / 权限 / 论坛 的自检
 * ------------------------------------------------------------------
 * 为什么需要它：Auth0 的真实登录没法在自检里点（要真人、要浏览器跳转），
 * 但**真正危险的那部分**——令牌校验与权限判定——完全可以在本地验：
 * 起一个**本地模拟 IdP**（自己生成 RSA 密钥、按标准暴露 /.well-known/jwks.json、
 * 用私钥签发 RS256 令牌），然后让 server.mjs 走**完全相同**的校验代码路径。
 *
 * 于是下面这些边界都能被钉住：
 *   · 签名不对 / 过期 / 受众不对 → 401（不能被伪造的令牌骗过去）
 *   · 用站长邮箱但 email_verified=false → **只能是普通成员**（否则谁都能冒充站长）
 *   · 普通成员：能发帖、能改自己的帖、**不能**改别人的帖、**不能**改网站公告文案
 *   · 站长：能改公告文案、能代管别人的帖子
 *   · 网站现有文案的写入在线上（serverless）必须靠站长身份，未登录一律拒绝
 *
 * 用法：node tools/verify-auth.mjs
 * 注意：整个过程把内容写进临时目录（FT_DATA_DIR），绝不碰仓库里的 data/。
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5311;
const IDP_PORT = 5312;
const OWNER = 'qiyuyu197@gmail.com';
const CLIENT_ID = 'test-client-id';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? '\x1b[32m PASS\x1b[0m' : '\x1b[31m FAIL\x1b[0m'} ${name}${detail ? `  \x1b[90m${detail}\x1b[0m` : ''}`);
  return !!ok;
};

/* ---------------- 本地模拟 IdP ---------------- */
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'mock-key-1';
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };
const b64 = (buf) => Buffer.from(buf).toString('base64url');

function signToken(claims, { key = privateKey, kid = KID, alg = 'RS256' } = {}) {
  const header = b64(JSON.stringify({ alg, typ: 'JWT', kid }));
  const payload = b64(JSON.stringify(claims));
  const data = `${header}.${payload}`;
  const sig = crypto.sign('sha256', Buffer.from(data), key);
  return `${data}.${b64(sig)}`;
}
function baseClaims(over = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: `http://127.0.0.1:${IDP_PORT}/`,
    aud: CLIENT_ID,
    sub: 'auth0|member-1',
    email: 'member@example.com',
    email_verified: true,
    name: '普通用户',
    iat: now,
    exp: now + 600,
    ...over,
  };
}

const idp = createServer((req, res) => {
  if (req.url.startsWith('/.well-known/jwks.json')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ keys: [jwk] }));
    return;
  }
  res.writeHead(404); res.end('nope');
});

/* ---------------- HTTP 小工具 ---------------- */
const api = async (p, { method = 'GET', token, body } = {}) => {
  const res = await fetch(`http://127.0.0.1:${PORT}${p}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 可能是空 */ }
  return { status: res.status, json, text };
};

/* ---------------- 主体 ---------------- */
let server = null;
const tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'ft-auth-'));

try {
  await new Promise((r) => idp.listen(IDP_PORT, '127.0.0.1', r));
  // 用临时数据目录起服务：里面的内容写入不会碰到仓库
  await fs.mkdir(tmpData, { recursive: true });
  await fs.writeFile(path.join(tmpData, 'posts.json'), JSON.stringify({ items: [{ id: 'p1', title: '原有文章' }] }), 'utf8');

  server = spawn(process.execPath, ['server.mjs', String(PORT)], {
    cwd: ROOT,
    env: {
      ...process.env,
      FT_DATA_DIR: tmpData,
      AUTH0_DOMAIN: `http://127.0.0.1:${IDP_PORT}`,
      AUTH0_CLIENT_ID: CLIENT_ID,
      OWNER_EMAILS: OWNER,
    },
    stdio: 'ignore',
  });
  let up = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok) { up = true; break; } } catch { /* 等 */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  check('服务起来了（带模拟 IdP 配置）', up);
  if (!up) throw new Error('服务未就绪');

  const ownerToken = signToken(baseClaims({ sub: 'auth0|owner', email: OWNER, name: '站长', email_verified: true }));
  const memberToken = signToken(baseClaims({ sub: 'auth0|member-1', email: 'member@example.com', name: '普通用户' }));
  const member2Token = signToken(baseClaims({ sub: 'auth0|member-2', email: 'other@example.com', name: '另一个人' }));
  const unverifiedOwner = signToken(baseClaims({ sub: 'auth0|fake', email: OWNER, name: '冒充者', email_verified: false }));

  /* ---- 1. 配置与身份 ---- */
  const cfg = await api('/api/auth/config');
  check('GET /api/auth/config 报告账号功能已启用', cfg.json?.enabled === true && cfg.json?.clientId === CLIENT_ID,
    JSON.stringify({ enabled: cfg.json?.enabled, clientId: cfg.json?.clientId }));

  const me = await api('/api/auth/me', { token: memberToken });
  check('普通用户令牌 → role=member', me.status === 200 && me.json?.user?.role === 'member',
    JSON.stringify(me.json?.user || me.json));

  const meOwner = await api('/api/auth/me', { token: ownerToken });
  check('站长令牌（邮箱已验证）→ role=owner', meOwner.status === 200 && meOwner.json?.user?.role === 'owner',
    JSON.stringify(meOwner.json?.user || meOwner.json));

  const meFake = await api('/api/auth/me', { token: unverifiedOwner });
  check('⚠️ 用站长邮箱但 email_verified=false → 只能是 member（不能被冒充）',
    meFake.status === 200 && meFake.json?.user?.role === 'member',
    JSON.stringify(meFake.json?.user || meFake.json));

  /* ---- 2. 伪造/过期/错受众的令牌必须被拒 ---- */
  const otherKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const forged = await api('/api/auth/me', { token: signToken(baseClaims(), { key: otherKey }) });
  check('别的私钥签的令牌 → 401（签名校验真的在跑）', forged.status === 401, `${forged.status} ${forged.json?.error || ''}`);

  const expired = await api('/api/auth/me', { token: signToken(baseClaims({ exp: Math.floor(Date.now() / 1000) - 10 })) });
  check('过期令牌 → 401', expired.status === 401, `${expired.status} ${expired.json?.error || ''}`);

  const wrongAud = await api('/api/auth/me', { token: signToken(baseClaims({ aud: 'someone-else' })) });
  check('受众不匹配的令牌 → 401', wrongAud.status === 401, `${wrongAud.status} ${wrongAud.json?.error || ''}`);

  const noneAlg = signToken(baseClaims(), { alg: 'none' });
  const algNone = await api('/api/auth/me', { token: noneAlg });
  check('alg=none 的令牌 → 401（不允许绕过签名）', algNone.status === 401, `${algNone.status}`);

  /* ---- 3. 论坛：发帖 / 改帖 / 越权 ---- */
  const created = await api('/api/forum/posts', { method: 'POST', token: memberToken, body: { title: '我的第一篇', body: '正文内容', tags: ['测试'] } });
  const postId = created.json?.post?.id;
  check('普通用户能发帖', created.status === 200 && !!postId, JSON.stringify(created.json?.post || created.json));

  const list = await api('/api/forum/posts');
  check('论坛列表公开可读，且带上了新帖', list.json?.total >= 1 && list.json?.posts?.some((p) => p.id === postId), `total=${list.json?.total}`);

  const listLeak = JSON.stringify(list.json || {});
  check('论坛列表不泄露作者邮箱', !listLeak.includes('member@example.com') && !listLeak.includes('authorEmail'));

  const patched = await api(`/api/forum/posts/${postId}`, { method: 'PATCH', token: memberToken, body: { title: '我的第一篇（改过）' } });
  check('作者能改自己的帖', patched.status === 200 && patched.json?.post?.title === '我的第一篇（改过）', `${patched.status}`);

  const stolen = await api(`/api/forum/posts/${postId}`, { method: 'PATCH', token: member2Token, body: { title: '我改了别人的' } });
  check('⚠️ 别人不能改我的帖 → 403', stolen.status === 403, `${stolen.status} ${stolen.json?.error || ''}`);

  const stolenDel = await api(`/api/forum/posts/${postId}`, { method: 'DELETE', token: member2Token });
  check('⚠️ 别人不能删我的帖 → 403', stolenDel.status === 403, `${stolenDel.status}`);

  const ownerMod = await api(`/api/forum/posts/${postId}`, { method: 'PATCH', token: ownerToken, body: { title: '站长代为修改' } });
  check('站长可以代管别人的帖子', ownerMod.status === 200 && ownerMod.json?.post?.title === '站长代为修改', `${ownerMod.status}`);

  // 校验用例用一个**新账号**：限流是按账号算的，同一个账号刚发过帖会被 429 挡住
  // （限流在校验之前，是刻意的：防滥用时不值得为可疑请求去解析大正文）
  const member3Token = signToken(baseClaims({ sub: 'auth0|member-3', email: 'third@example.com', name: '第三个用户' }));
  const empty = await api('/api/forum/posts', { method: 'POST', token: member3Token, body: { title: '', body: '' } });
  check('空标题/空正文被拒 → 400', empty.status === 400, `${empty.status} ${empty.json?.error || ''}`);

  // 限流本身也要真的生效（用一个全新账号：限流按账号算，且**连无效请求也计入** ——
  // 防滥用时不该为可疑请求白解析正文，代价是手滑打错也要等十几秒）
  const member5Token = signToken(baseClaims({ sub: 'auth0|member-5', email: 'fifth@example.com', name: '第五个用户' }));
  const rl1 = await api('/api/forum/posts', { method: 'POST', token: member5Token, body: { title: '连发一', body: 'x' } });
  const rl2 = await api('/api/forum/posts', { method: 'POST', token: member5Token, body: { title: '连发二', body: 'x' } });
  check('同一账号连发被限流 → 第二次 429', rl1.status === 200 && rl2.status === 429, `${rl1.status} / ${rl2.status}`);
  if (rl1.json?.post?.id) await api(`/api/forum/posts/${rl1.json.post.id}`, { method: 'DELETE', token: member5Token });

  const anon = await api('/api/forum/posts', { method: 'POST', body: { title: '匿名', body: 'x' } });
  check('未登录不能发帖 → 401', anon.status === 401, `${anon.status}`);

  /* ---- 4. 网站现有文案：只有站长能改 ---- */
  const memberWrite = await api('/api/content/posts', { method: 'POST', token: memberToken, body: { id: 'x1', title: '普通用户想改公告' } });
  check('⚠️ 普通用户不能改网站公告/文案 → 403', memberWrite.status === 403, `${memberWrite.status} ${memberWrite.json?.error || ''}`);

  const anonWrite = await api('/api/content/posts', { method: 'POST', body: { id: 'x2', title: '未登录想改文案' } });
  check('未登录不能改网站文案（线上语义）→ 401', anonWrite.status === 401, `${anonWrite.status}`);

  const ownerWrite = await api('/api/content/posts', { method: 'POST', token: ownerToken, body: { id: 'p1', title: '站长改过的标题' } });
  check('站长能改网站文案', ownerWrite.status === 200 && ownerWrite.json?.ok === true, `${ownerWrite.status} ${JSON.stringify(ownerWrite.json)}`);

  const after = await api('/api/content/posts');
  const items = after.json?.items || [];
  check('改完之后读得到（本地写文件，供 git 提交）',
    items.length === 1 && items[0].title === '站长改过的标题',
    JSON.stringify(items.slice(0, 2)));

  /* ---- 5. 清理路径 ---- */
  const del = await api(`/api/forum/posts/${postId}`, { method: 'DELETE', token: memberToken });
  check('作者能删自己的帖', del.status === 200 && del.json?.ok === true, `${del.status}`);
  const gone = await api(`/api/forum/posts/${postId}`);
  check('删掉之后读不到 → 404', gone.status === 404, `${gone.status}`);
} catch (err) {
  check('自检过程没有抛异常', false, String(err?.message || err));
} finally {
  try { server?.kill(); } catch { /* noop */ }
  try { idp.close(); } catch { /* noop */ }
  await fs.rm(tmpData, { recursive: true, force: true }).catch(() => {});
}

const failed = results.filter((r) => !r.ok);
console.log(`\n\x1b[1m结果\x1b[0m  通过 ${results.length - failed.length} / ${results.length}`);
if (failed.length) {
  console.log('\x1b[31m未通过：\x1b[0m');
  failed.forEach((f) => console.log(`  · ${f.name}  (${f.detail})`));
}
process.exit(failed.length ? 1 : 0);
