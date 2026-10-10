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

  // 本地形态不该有墓碑语义：文件就是真相，删除＝真删，deleted 恒为空
  const localDel = await api('/api/content/posts/p1', { method: 'DELETE', token: ownerToken });
  const localAfter = await api('/api/content/posts');
  check('本地形态删除是真删，且 deleted 恒为空（文件即真相）',
    localDel.status === 200
      && (localAfter.json?.items || []).length === 0
      && Array.isArray(localAfter.json?.deleted) && localAfter.json.deleted.length === 0,
    JSON.stringify({ status: localDel.status, items: (localAfter.json?.items || []).length, deleted: localAfter.json?.deleted }));

  /* ---- 5. 清理路径 ---- */
  const del = await api(`/api/forum/posts/${postId}`, { method: 'DELETE', token: memberToken });
  check('作者能删自己的帖', del.status === 200 && del.json?.ok === true, `${del.status}`);
  const gone = await api(`/api/forum/posts/${postId}`);
  check('删掉之后读不到 → 404', gone.status === 404, `${gone.status}`);

  /* ---- 6. 账号数据是否落库（需求③的"保存账号数据"） ---- */
  const userFiles = await fs.readdir(path.join(tmpData, 'users')).catch(() => []);
  check('账号数据已保存到 users/（昵称、角色、首次/最近出现）',
    userFiles.length >= 1, `${userFiles.length} 个账号文件`);
  let userDoc = null;
  if (userFiles.length) {
    const raw = await fs.readFile(path.join(tmpData, 'users', userFiles[0]), 'utf8').catch(() => '{}');
    try { userDoc = JSON.parse(raw); } catch { userDoc = null; }
  }
  check('账号文档里带 sub / role / firstSeenAt（且键是哈希后的安全键）',
    !!userDoc && !!userDoc.sub && !!userDoc.role && !!userDoc.firstSeenAt && /^[a-f0-9]{32}$/.test(String(userDoc.key || '')),
    JSON.stringify(userDoc && { key: userDoc.key, sub: userDoc.sub, role: userDoc.role, visits: userDoc.visits }));
  check('账号文档没有把同名站长权限写给别人',
    userDoc?.role === 'member' || userDoc?.email === OWNER,
    `role=${userDoc?.role} email=${userDoc?.email}`);

  /* ---- 6.6 联机扫雷房间（服务端权威 + 成员鉴权）----
   * 房间是"合作模式"：一块共享棋盘，谁出招都同步给全房间。
   * 这里能验的正是最要紧的部分：谁能进、谁能出招、两端看到的是不是同一盘、
   * 以及未揭开的格子不会把雷位通过网络响应泄露出去。
   */
  const noAuthRoom = await api('/api/mine/rooms', { method: 'POST', body: { level: 'beginner' } });
  check('联机扫雷：未登录不能建房 → 401', noAuthRoom.status === 401, `${noAuthRoom.status}`);

  const roomCreated = await api('/api/mine/rooms', { method: 'POST', token: memberToken, body: { level: 'beginner' } });
  const roomId = roomCreated.json?.room?.id;
  const roomCode = roomCreated.json?.room?.code;
  check('联机扫雷：登录用户可建房（拿到房间号与 beginner 棋盘）',
    roomCreated.status === 200 && !!roomId && /^[A-Z0-9]{6}$/.test(String(roomCode || ''))
      && roomCreated.json.room.game?.cols === 9 && roomCreated.json.room.game?.rows === 9
      && roomCreated.json.room.members?.length === 1,
    JSON.stringify({ status: roomCreated.status, code: roomCode, level: roomCreated.json?.room?.level }));

  const roomOutsider = await api(`/api/mine/rooms/${roomId}`, { token: member2Token });
  check('联机扫雷：非成员看不到房间内容 → 403', roomOutsider.status === 403, `${roomOutsider.status}`);

  const roomOutsiderMove = await api(`/api/mine/rooms/${roomId}/move`, {
    method: 'POST', token: member2Token, body: { action: 'reveal', r: 0, c: 0 },
  });
  check('联机扫雷：非成员不能出招 → 403', roomOutsiderMove.status === 403, `${roomOutsiderMove.status}`);

  const roomJoined = await api('/api/mine/rooms/join', { method: 'POST', token: member2Token, body: { code: roomCode } });
  check('联机扫雷：用房间号加入成功（成员 2 人、版本增长）',
    roomJoined.status === 200 && roomJoined.json?.room?.members?.length === 2
      && roomJoined.json.room.version > roomCreated.json.room.version,
    JSON.stringify({ members: roomJoined.json?.room?.members?.length, v: roomJoined.json?.room?.version }));

  const roomMove = await api(`/api/mine/rooms/${roomId}/move`, {
    method: 'POST', token: member2Token, body: { action: 'reveal', r: 4, c: 4 },
  });
  const roomViewA = await api(`/api/mine/rooms/${roomId}`, { token: memberToken });
  const sameBoard = JSON.stringify(roomViewA.json?.room?.game?.cells) === JSON.stringify(roomMove.json?.room?.game?.cells);
  check('联机扫雷：一人出招后另一人拉到同一块棋盘（服务端权威、两端一致）',
    roomMove.status === 200 && roomViewA.status === 200 && sameBoard
      && roomViewA.json.room.version === roomMove.json.room.version,
    JSON.stringify({ moveV: roomMove.json?.room?.version, viewV: roomViewA.json?.room?.version, same: sameBoard }));

  const hiddenCells = (roomViewA.json?.room?.game?.cells || []).filter((c) => !c.open);
  check('联机扫雷：未揭开的格子不下发雷位/周围雷数（不能靠看响应作弊）',
    hiddenCells.length > 0 && hiddenCells.every((c) => c.mine === undefined && c.adj === undefined && c.boom === undefined),
    JSON.stringify({ hidden: hiddenCells.length, sample: hiddenCells[0] || {} }));
  check('联机扫雷：出招会记下"谁开的这一格"（合作局里前端按人着色）',
    Object.keys(roomMove.json?.room?.revealers || {}).length > 0,
    JSON.stringify(Object.entries(roomMove.json?.room?.revealers || {}).slice(0, 3)));

  // 插旗（左键模式是"插旗"时前端也走这条）—— 这一条是补的：
  // 上一版服务端的统计代码在插旗分支里引用了尚未声明的变量，插旗直接 500，
  // 而当时的断言只测了揭开，所以没抓到。
  const roomFlag = await api(`/api/mine/rooms/${roomId}/move`, {
    method: 'POST', token: memberToken, body: { action: 'flag', r: 0, c: 0 },
  });
  const flaggedCell = roomFlag.json?.room?.game?.cells?.[0];
  const flagStats = roomFlag.json?.room?.stats?.['auth0|member-1'] || roomFlag.json?.room?.stats?.[Object.keys(roomFlag.json?.room?.stats || {})[0]] || {};
  check('联机扫雷：插旗能成功（格子有旗、统计里有插旗数；不会 500）',
    roomFlag.status === 200 && flaggedCell?.flag === true && (flagStats.flags || 0) >= 1,
    JSON.stringify({ status: roomFlag.status, flag: flaggedCell?.flag, stats: flagStats }));

  const roomSteal = await api(`/api/mine/rooms/${roomId}/restart`, { method: 'POST', token: member2Token });
  const roomRestart = await api(`/api/mine/rooms/${roomId}/restart`, { method: 'POST', token: memberToken });
  const openedAfterRestart = (roomRestart.json?.room?.game?.cells || []).filter((c) => c.open).length;
  check('联机扫雷：只有房主能开新局（成员 403 / 房主成功且棋盘重置）',
    roomSteal.status === 403 && roomRestart.status === 200 && openedAfterRestart === 0,
    JSON.stringify({ member: roomSteal.status, host: roomRestart.status, openedAfterRestart }));

  const roomLeave = await api(`/api/mine/rooms/${roomId}`, { method: 'DELETE', token: member2Token });
  const roomDissolve = await api(`/api/mine/rooms/${roomId}`, { method: 'DELETE', token: memberToken });
  const roomGone = await api(`/api/mine/rooms/${roomId}`, { token: memberToken });
  check('联机扫雷：成员可退出、房主可解散（解散后房间不存在 → 404）',
    roomLeave.status === 200 && roomDissolve.status === 200 && roomGone.status === 404,
    JSON.stringify({ leave: roomLeave.status, dissolve: roomDissolve.status, gone: roomGone.status }));

  /* ---- 6.5 仓库卫生：账号与论坛的运行时数据绝不能被提交 ----
   * 这个仓库是公开的，而 data/users/ 里存的是邮箱。任何人都可能顺手 `git add -A`，
   * 所以用 .gitignore 挡住，并在这里钉住这条规则别被删掉。 */
  const ignore = await fs.readFile(path.join(ROOT, '.gitignore'), 'utf8').catch(() => '');
  check('⚠️ .gitignore 挡住了运行期账号数据（data/users/ 含邮箱，仓库是公开的）',
    /^\s*data\/users\/\s*$/m.test(ignore), ignore.includes('data/users/') ? '已忽略' : '缺失！');
  check('⚠️ .gitignore 挡住了运行期论坛数据（data/forum/）',
    /^\s*data\/forum\/\s*$/m.test(ignore), ignore.includes('data/forum/') ? '已忽略' : '缺失！');
  check('⚠️ .gitignore 挡住了论坛索引（data/forum-index.json）',
    /^\s*data\/forum-index\.json\s*$/m.test(ignore), ignore.includes('data/forum-index.json') ? '已忽略' : '缺失！');
  check('⚠️ .gitignore 挡住了联机扫雷房间（data/mine-rooms/）',
    /^\s*data\/mine-rooms\/\s*$/m.test(ignore), ignore.includes('data/mine-rooms/') ? '已忽略' : '缺失！');
  // 播放历史是**个人收听记录**，同样不该进公开仓库
  check('⚠️ .gitignore 挡住了站内播放历史（data/history/ 是个人收听记录）',
    /^\s*data\/history\/\s*$/m.test(ignore), ignore.includes('data/history/') ? '已忽略' : '缺失！');

  /* ---- 7. 站长看账号列表 / 普通用户看不到 ---- */
  const usersAsOwner = await api('/api/auth/users', { token: ownerToken });
  check('站长能看账号列表',
    usersAsOwner.status === 200 && (usersAsOwner.json?.users || []).length >= 1,
    JSON.stringify({ status: usersAsOwner.status, total: usersAsOwner.json?.total }));

  const usersAsMember = await api('/api/auth/users', { token: memberToken });
  check('⚠️ 普通用户看不到账号列表 → 403', usersAsMember.status === 403, `${usersAsMember.status}`);

  const usersAnon = await api('/api/auth/users');
  check('未登录看不到账号列表 → 401', usersAnon.status === 401, `${usersAnon.status}`);

  /* ---- 资料编辑（昵称 / 头像）：校验必须由服务端严格把关 ---- */
  const profAnonGet = await api('/api/profile');
  const profAnonPatch = await api('/api/profile', { method: 'PATCH', body: { name: 'hacker' } });
  check('未登录读写资料都被拒 → 401',
    profAnonGet.status === 401 && profAnonPatch.status === 401,
    `${profAnonGet.status} / ${profAnonPatch.status}`);

  const profBase = await api('/api/profile', { token: memberToken });
  check('登录后能读自己的资料（含 displayName / avatar 回填字段）',
    profBase.status === 200 && profBase.json?.profile?.sub === 'auth0|member-1'
      && 'displayName' in (profBase.json?.profile || {}) && 'avatar' in (profBase.json?.profile || {}),
    JSON.stringify(profBase.json?.profile));

  const tooLong = await api('/api/profile', { method: 'PATCH', token: memberToken, body: { name: 'x'.repeat(25) } });
  const blank = await api('/api/profile', { method: 'PATCH', token: memberToken, body: { name: '   ' } });
  check('昵称超长 / 只有空白 → 400（并说明限制）',
    tooLong.status === 400 && /24/.test(String(tooLong.json?.error || '')) && blank.status === 400,
    `${tooLong.status} ${tooLong.json?.error || ''} | ${blank.status} ${blank.json?.error || ''}`);

  const jsUrl = await api('/api/profile', { method: 'PATCH', token: memberToken, body: { picture: 'javascript:alert(1)' } });
  const htmlData = await api('/api/profile', { method: 'PATCH', token: memberToken, body: { picture: 'data:text/html;base64,PHNjcmlwdD4=' } });
  const blobUrl = await api('/api/profile', { method: 'PATCH', token: memberToken, body: { picture: 'blob:https://x/y' } });
  check('⚠️ 危险协议的图片一律 400（javascript: / data:text/html / blob:）',
    jsUrl.status === 400 && htmlData.status === 400 && blobUrl.status === 400,
    `${jsUrl.status} / ${htmlData.status} / ${blobUrl.status}`);

  const pngData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
  const okName = await api('/api/profile', { method: 'PATCH', token: memberToken, body: { name: '  阿甲  ' } });
  const okPic = await api('/api/profile', { method: 'PATCH', token: memberToken, body: { picture: pngData } });
  check('合法昵称（会被 trim）与内联头像都通过',
    okName.status === 200 && okName.json?.profile?.name === '阿甲'
      && okPic.status === 200 && String(okPic.json?.profile?.avatar || '').startsWith('data:image/png;base64,')
      && okPic.json?.profile?.name === '阿甲',
    JSON.stringify({ name: okName.json?.profile?.name, avatar: String(okPic.json?.profile?.avatar || '').slice(0, 30) }));

  // 生效值：/api/auth/me 必须把自定义昵称/头像算进去（顶栏/菜单/论坛都读它）
  const meAfter = await api('/api/auth/me', { token: memberToken });
  check('⚠️ /api/auth/me 返回生效值：name/picture 用自定义的，且回填 displayName/avatar',
    meAfter.status === 200 && meAfter.json?.user?.name === '阿甲'
      && String(meAfter.json?.user?.picture || '').startsWith('data:image/png;base64,')
      && meAfter.json?.user?.displayName === '阿甲'
      && String(meAfter.json?.user?.avatar || '').startsWith('data:image/png;base64,'),
    JSON.stringify({ name: meAfter.json?.user?.name, picture: String(meAfter.json?.user?.picture || '').slice(0, 24), displayName: meAfter.json?.user?.displayName }));

  // https 直链也合法，并且立刻变成生效值
  const okUrl = await api('/api/profile', { method: 'PATCH', token: memberToken, body: { picture: 'https://example.com/a.png' } });
  check('https 直链头像也通过，并立刻生效',
    okUrl.status === 200 && okUrl.json?.profile?.picture === 'https://example.com/a.png',
    JSON.stringify({ status: okUrl.status, picture: okUrl.json?.profile?.picture }));

  // 清空 = 回落到 Auth0 给的 name / picture
  const cleared = await api('/api/profile', { method: 'PATCH', token: memberToken, body: { name: '', picture: '' } });
  const meCleared = await api('/api/auth/me', { token: memberToken });
  check('清空字符串能回落到 Auth0 的默认昵称与头像',
    cleared.status === 200 && meCleared.json?.user?.name === '普通用户'
      && meCleared.json?.user?.displayName === '' && meCleared.json?.user?.avatar === '',
    JSON.stringify({ name: meCleared.json?.user?.name, displayName: meCleared.json?.user?.displayName, avatar: meCleared.json?.user?.avatar }));

  // 只能改自己的：令牌里的 sub 决定改谁，body 里塞 sub 也没用
  const spoof = await api('/api/profile', { method: 'PATCH', token: memberToken, body: { name: '冒充站长', sub: 'auth0|owner' } });
  const ownerDoc = await api('/api/auth/users', { token: ownerToken });
  const ownerEntry = (ownerDoc.json?.users || []).find((u) => u.sub === 'auth0|owner');
  check('⚠️ 塞一个别人的 sub 也改不到别人（只能改自己的）',
    spoof.status === 200 && spoof.json?.profile?.sub === 'auth0|member-1'
      && ownerEntry && ownerEntry.displayName !== '冒充站长',
    JSON.stringify({ spoofed: spoof.json?.profile?.sub, ownerDisplayName: ownerEntry?.displayName }));

  /* ---- 站内播放历史（/api/history）：只属于本人、字段严格校验 ----
   * 这是"我们自己的播放记录"（不接网易云账号、不存第三方 cookie、不发给网易云），
   * 但它是个人数据，所以**归属**与**校验**都必须由服务端把死。 */
  const histAnonGet = await api('/api/history');
  const histAnonPost = await api('/api/history', { method: 'POST', body: { items: [] } });
  check('未登录读写播放历史都被拒 → 401',
    histAnonGet.status === 401 && histAnonPost.status === 401,
    `${histAnonGet.status} / ${histAnonPost.status}`);

  const sampleItems = [
    { id: '554322674', title: '偷心', artist: 'SASIOVERLXRD', seconds: 42, at: 1_700_000_000_000, plays: 3 },
    { id: 'ne-211520', title: '你不要那样看着我的眼睛', artist: '蔡琴', seconds: 7, at: 1_700_000_100_000, plays: 1 },
  ];
  const histPost = await api('/api/history', { method: 'POST', token: memberToken, body: { items: sampleItems } });
  const histGet = await api('/api/history', { token: memberToken });
  check('登录后写入再读回：条数、字段、顺序（按时间倒序）都对',
    histPost.status === 200 && histGet.status === 200 && histGet.json?.total === 2
      && histGet.json.items[0].id === 'ne-211520' && histGet.json.items[1].seconds === 42
      && histGet.json.items[1].plays === 3,
    JSON.stringify({ post: histPost.status, total: histGet.json?.total, ids: (histGet.json?.items || []).map((x) => x.id) }));

  const histSpoof = await api('/api/history', { token: member2Token });
  check('⚠️ 别人的播放历史读不到（键与账号绑定，只有本人能读）',
    histSpoof.status === 200 && (histSpoof.json?.items || []).length === 0,
    JSON.stringify({ status: histSpoof.status, total: histSpoof.json?.total }));

  const histTooMany = await api('/api/history', {
    method: 'POST', token: memberToken,
    body: { items: Array.from({ length: 201 }, (_, i) => ({ id: `x${i}`, title: 't', artist: 'a', seconds: 1, at: 1_700_000_000_000 + i, plays: 1 })) },
  });
  const histBadId = await api('/api/history', {
    method: 'POST', token: memberToken,
    body: { items: [{ id: 'bad id/../x', title: 't', artist: 'a', seconds: 1, at: 1_700_000_000_000, plays: 1 }] },
  });
  const histBadSeconds = await api('/api/history', {
    method: 'POST', token: memberToken,
    body: { items: [{ id: 'ok1', title: 't', artist: 'a', seconds: 999_999, at: 1_700_000_000_000, plays: 1 }] },
  });
  const histBadShape = await api('/api/history', { method: 'POST', token: memberToken, body: { items: 'nope' } });
  check('⚠️ 超量 / 非法 id / 超范围 seconds / 非数组一律 400（服务端严格把关）',
    histTooMany.status === 400 && /200/.test(String(histTooMany.json?.error || ''))
      && histBadId.status === 400 && histBadSeconds.status === 400 && histBadShape.status === 400,
    JSON.stringify({ many: histTooMany.status, id: histBadId.status, seconds: histBadSeconds.status, shape: histBadShape.status }));

  // 落盘位置：history/<sha1(sub) 前 32 位>.json（与 users/ 同一套键策略）
  const histFiles = await fs.readdir(path.join(tmpData, 'history')).catch(() => []);
  let histDoc = null;
  if (histFiles.length) {
    const raw = await fs.readFile(path.join(tmpData, 'history', histFiles[0]), 'utf8').catch(() => '{}');
    try { histDoc = JSON.parse(raw); } catch { histDoc = null; }
  }
  check('历史落在 history/<哈希>.json，文档里带 sub 与 items（键是安全键）',
    histFiles.length >= 1 && !!histDoc && /^[a-f0-9]{32}\.json$/.test(String(histFiles[0]))
      && Array.isArray(histDoc.items) && !!histDoc.sub,
    JSON.stringify({ files: histFiles.length, key: histDoc?.key, items: histDoc?.items?.length }));
} catch (err) {
  check('自检过程没有抛异常', false, String(err?.message || err));
} finally {
  try { server?.kill(); } catch { /* noop */ }
  // ⚠️ 这里**不能**关模拟 IdP：下面"部署形态"那一段还要用它来验签
  await fs.rm(tmpData, { recursive: true, force: true }).catch(() => {});
}

/* ---------------- 部署形态（serverless + Blobs）----------------
 * 上面验的是本地形态（写文件）。线上发布走的是另一条腿：**写 Netlify Blobs、
 * 且读的是"覆盖层"而不是仓库文件**。这里用仿真器（tools/netlify-dev.mjs）跑一整遍：
 * 它注入一个 Blobs 替身（目录 .blobs-dev/），并让函数以 serverless 形态运行，
 * 于是"站长在线发布 → 公开页面能读到"这条链路在本地就能被真实验证。
 */
{
  const SIM_PORT = 5313;
  const sim = spawn(process.execPath, ['tools/netlify-dev.mjs', String(SIM_PORT)], {
    cwd: ROOT,
    env: {
      ...process.env,
      AUTH0_DOMAIN: `http://127.0.0.1:${IDP_PORT}`,
      AUTH0_CLIENT_ID: CLIENT_ID,
      OWNER_EMAILS: OWNER,
    },
    stdio: 'ignore',
  });
  try {
    let up = false;
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`http://127.0.0.1:${SIM_PORT}/api/health`)).ok) { up = true; break; } } catch { /* 等 */ }
      await new Promise((r) => setTimeout(r, 300));
    }
    check('部署形态仿真起来了（serverless + Blobs 替身）', up);
    if (up) {
      const h = await (await fetch(`http://127.0.0.1:${SIM_PORT}/api/health`)).json();
      check('health 报告 deploy=netlify / storage=blobs',
        h.deploy === 'netlify' && h.storage === 'blobs', JSON.stringify({ deploy: h.deploy, storage: h.storage }));

      const ownerTok = signToken(baseClaims({ sub: 'auth0|owner', email: OWNER, name: '站长', email_verified: true }));
      const memberTok = signToken(baseClaims({ sub: 'auth0|member-9', email: 'nine@example.com', name: '九号' }));

      const w = await fetch(`http://127.0.0.1:${SIM_PORT}/api/content/news`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerTok}` },
        body: JSON.stringify({ id: 'online-1', title: '线上发布的公告' }),
      });
      const wj = await w.json().catch(() => ({}));
      check('部署形态下站长能在线发布（写 Blobs，不再 501）',
        w.status === 200 && wj.storage === 'blobs', `${w.status} ${JSON.stringify(wj).slice(0, 90)}`);

      const blobFile = path.join(ROOT, '.blobs-dev', 'collections', 'news.json');
      const written = await fs.readFile(blobFile, 'utf8').catch(() => '');
      check('内容确实写进了 Blobs 替身（.blobs-dev/collections/news.json）',
        /线上发布的公告/.test(written), blobFile);

      const r = await fetch(`http://127.0.0.1:${SIM_PORT}/api/content/news`);
      const rj = await r.json().catch(() => ({}));
      check('公开读取拿到覆盖层（overlayOnly=true，前端据此合并静态文件）',
        rj.overlayOnly === true && (rj.items || []).some((it) => it.id === 'online-1'),
        JSON.stringify({ overlayOnly: rj.overlayOnly, n: (rj.items || []).length }));

      /* ---- 墓碑：线上删除必须"删得掉"，不能刷新后又从仓库 seed 里复活 ---- */
      const delOwn = await fetch(`http://127.0.0.1:${SIM_PORT}/api/content/news/online-1`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${ownerTok}` },
      });
      check('部署形态下站长能删除已发布的内容', delOwn.status === 200, `${delOwn.status}`);
      const afterDel = await (await fetch(`http://127.0.0.1:${SIM_PORT}/api/content/news`)).json().catch(() => ({}));
      check('⚠️ 删除后留下墓碑：items 里没有它、deleted 里有它（否则合并时会复活）',
        !(afterDel.items || []).some((it) => it.id === 'online-1')
          && (afterDel.deleted || []).includes('online-1'),
        JSON.stringify({ items: (afterDel.items || []).map((i) => i.id), deleted: afterDel.deleted }));

      // 只存在于仓库 seed 里的 id（覆盖层里从没写过）也必须能删 —— 前端只会删它显示过的东西
      const delSeed = await fetch(`http://127.0.0.1:${SIM_PORT}/api/content/news/seed-only-1`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${ownerTok}` },
      });
      const afterSeed = await (await fetch(`http://127.0.0.1:${SIM_PORT}/api/content/news`)).json().catch(() => ({}));
      check('部署形态下也能删"只在仓库 seed 里"的条目（留墓碑）',
        delSeed.status === 200 && (afterSeed.deleted || []).includes('seed-only-1'),
        `${delSeed.status} deleted=${JSON.stringify(afterSeed.deleted)}`);

      // 重新发布同一个 id = 撤销墓碑
      const repost = await fetch(`http://127.0.0.1:${SIM_PORT}/api/content/news`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerTok}` },
        body: JSON.stringify({ id: 'online-1', title: '重新发布的公告' }),
      });
      const afterRepost = await (await fetch(`http://127.0.0.1:${SIM_PORT}/api/content/news`)).json().catch(() => ({}));
      check('重新发布同一 id 会撤销墓碑（items 里有、deleted 里没有）',
        repost.status === 200
          && (afterRepost.items || []).some((it) => it.id === 'online-1')
          && !(afterRepost.deleted || []).includes('online-1'),
        JSON.stringify({ items: (afterRepost.items || []).map((i) => i.id), deleted: afterRepost.deleted }));

      const mw = await fetch(`http://127.0.0.1:${SIM_PORT}/api/content/news`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberTok}` },
        body: JSON.stringify({ id: 'nope', title: '普通用户想改公告' }),
      });
      check('部署形态下普通用户仍不能改公告 → 403', mw.status === 403, `${mw.status}`);

      const fpost = await fetch(`http://127.0.0.1:${SIM_PORT}/api/forum/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberTok}` },
        body: JSON.stringify({ title: '线上论坛帖', body: '写进 Blobs' }),
      });
      const fj = await fpost.json().catch(() => ({}));
      const forumBlob = path.join(ROOT, '.blobs-dev', 'forum', `${fj.post?.id}.json`);
      const forumWritten = await fs.readFile(forumBlob, 'utf8').catch(() => '');
      check('部署形态下论坛发帖也写进 Blobs',
        fpost.status === 200 && /线上论坛帖/.test(forumWritten), `${fpost.status} ${fj.post?.id || ''}`);
      if (fj.post?.id) {
        const mine = await fetch(`http://127.0.0.1:${SIM_PORT}/api/forum/posts/${fj.post.id}`);
        check('线上论坛帖公开可读', mine.status === 200, `${mine.status}`);
        const other = signToken(baseClaims({ sub: 'auth0|member-10', email: 'ten@example.com', name: '十号' }));
        const steal = await fetch(`http://127.0.0.1:${SIM_PORT}/api/forum/posts/${fj.post.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${other}` },
          body: JSON.stringify({ title: '我要改别人的' }),
        });
        check('部署形态下别人改不了我的帖 → 403', steal.status === 403, `${steal.status}`);

        /* ---- 论坛索引：列表只读一个文档，且顺序/重建都正确 ---- */
        const idxFile = path.join(ROOT, '.blobs-dev', 'collections', 'forum-index.json');
        const idx1 = await fs.readFile(idxFile, 'utf8').catch(() => '');
        check('论坛列表维护了索引文档（列表不必逐条读 Blob）',
          /线上论坛帖/.test(idx1), idxFile);

        // 第二个人再发一条：列表应按创建时间倒序（新帖在前）
        const otherPost = await fetch(`http://127.0.0.1:${SIM_PORT}/api/forum/posts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${other}` },
          body: JSON.stringify({ title: '第二篇', body: '后发的' }),
        });
        const oj = await otherPost.json().catch(() => ({}));
        const list2 = await (await fetch(`http://127.0.0.1:${SIM_PORT}/api/forum/posts`)).json().catch(() => ({}));
        const order2 = (list2.posts || []).map((p) => p.title);
        check('论坛列表按创建时间倒序（新帖在前）',
          order2[0] === '第二篇' && order2.includes('线上论坛帖'), JSON.stringify(order2));

        // 编辑**旧帖**：可以改内容，但不该跳到列表顶部
        const editOld = await fetch(`http://127.0.0.1:${SIM_PORT}/api/forum/posts/${fj.post.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberTok}` },
          body: JSON.stringify({ title: '线上论坛帖（改过）' }),
        });
        const list3 = await (await fetch(`http://127.0.0.1:${SIM_PORT}/api/forum/posts`)).json().catch(() => ({}));
        const order3 = (list3.posts || []).map((p) => p.title);
        check('编辑旧帖不会让它跳到列表顶部（顺序仍按创建时间）',
          editOld.status === 200 && order3[0] === '第二篇' && order3.includes('线上论坛帖（改过）'),
          JSON.stringify(order3));

        // 索引丢了要能按需重建（旧版本写下的内容、或索引被清掉）
        await fs.rm(idxFile, { force: true }).catch(() => {});
        const list4 = await (await fetch(`http://127.0.0.1:${SIM_PORT}/api/forum/posts`)).json().catch(() => ({}));
        const idx4 = await fs.readFile(idxFile, 'utf8').catch(() => '');
        check('索引丢失后列表会按需重建（内容不丢）',
          (list4.posts || []).length >= 2 && /线上论坛帖（改过）/.test(idx4),
          JSON.stringify({ n: (list4.posts || []).length, rebuilt: idx4.length > 0 }));

        /* ---- 改资料后，旧帖的作者快照要跟着刷新 ---- */
        const patchProf = await fetch(`http://127.0.0.1:${SIM_PORT}/api/profile`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberTok}` },
          body: JSON.stringify({ name: '九号改名了', picture: 'https://example.com/nine.png' }),
        });
        const detailAfter = await (await fetch(`http://127.0.0.1:${SIM_PORT}/api/forum/posts/${fj.post.id}`)).json().catch(() => ({}));
        const listAfter = await (await fetch(`http://127.0.0.1:${SIM_PORT}/api/forum/posts`)).json().catch(() => ({}));
        check('⚠️ 改昵称/头像后，旧帖详情与列表里的作者快照一起刷新',
          patchProf.status === 200
            && detailAfter?.post?.author?.name === '九号改名了'
            && detailAfter?.post?.author?.picture === 'https://example.com/nine.png'
            && (listAfter.posts || []).some((p) => p.id === fj.post.id
              && p.author?.name === '九号改名了' && p.author?.picture === 'https://example.com/nine.png'),
          JSON.stringify({ status: patchProf.status, detail: detailAfter?.post?.author?.name, picture: detailAfter?.post?.author?.picture }));

        // 内联 data URL 头像：详情带完整的（只读一篇无所谓），索引/列表只留短直链
        const dataPic = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
        await fetch(`http://127.0.0.1:${SIM_PORT}/api/profile`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${memberTok}` },
          body: JSON.stringify({ picture: dataPic }),
        });
        const det2 = await (await fetch(`http://127.0.0.1:${SIM_PORT}/api/forum/posts/${fj.post.id}`)).json().catch(() => ({}));
        const idxRaw2 = await fs.readFile(idxFile, 'utf8').catch(() => '');
        check('内联头像：详情带完整 data URL，列表/索引只留短直链（不把索引文档撑大）',
          String(det2?.post?.author?.picture || '').startsWith('data:image/png;base64,')
            && !idxRaw2.includes('data:image/png'),
          JSON.stringify({ detail: String(det2?.post?.author?.picture || '').slice(0, 24), indexHasDataUrl: idxRaw2.includes('data:image/png') }));

        // 清理仿真写入的痕迹，别把 .blobs-dev 留成垃圾堆
        await fetch(`http://127.0.0.1:${SIM_PORT}/api/forum/posts/${fj.post.id}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${memberTok}` },
        }).catch(() => {});
        if (oj.post?.id) {
          await fetch(`http://127.0.0.1:${SIM_PORT}/api/forum/posts/${oj.post.id}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${other}` },
          }).catch(() => {});
        }
        const idx5 = await fs.readFile(idxFile, 'utf8').catch(() => '');
        check('删除帖子会同时从索引里移除',
          !/线上论坛帖/.test(idx5) && !/第二篇/.test(idx5), idx5.slice(0, 160));
      }
    }
  } catch (err) {
    check('部署形态自检没有抛异常', false, String(err?.message || err));
  } finally {
    try { sim.kill(); } catch { /* noop */ }
    await fs.rm(path.join(ROOT, '.blobs-dev'), { recursive: true, force: true }).catch(() => {});
  }
  try { idp.close(); } catch { /* noop */ }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n\x1b[1m结果\x1b[0m  通过 ${results.length - failed.length} / ${results.length}`);
if (failed.length) {
  console.log('\x1b[31m未通过：\x1b[0m');
  failed.forEach((f) => console.log(`  · ${f.name}  (${f.detail})`));
}
process.exit(failed.length ? 1 : 0);
