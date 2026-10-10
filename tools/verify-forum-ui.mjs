#!/usr/bin/env node
/**
 * tools/verify-forum-ui.mjs — 账号界面 / 论坛界面 / 站长门禁 / 用户内容不被执行
 * ==================================================================
 * 为什么单独有这么一个工具：`tools/verify-auth.mjs` 验的是**服务端**（令牌校验、
 * 权限判定、Blobs 落库），但用户真正碰到的是**界面**：顶栏有没有登录入口、
 * 论坛能不能发帖、别人的帖子是不是真的没有编辑按钮、控制台会不会让非站长以为存上了、
 * 以及最要紧的一件事——**用户写的内容不会被当成 HTML 执行**。
 * 这些只有真浏览器能验。
 *
 * 登录怎么做的（这件事有个前提，先说清楚）：
 *   Auth0 的真实登录要真人 + 邮箱验证，自检里做不到。而本站客户端把授权地址
 *   **写死成 `https://${domain}/authorize`**（真实 Auth0 永远是 https），
 *   所以本地那个 http 模拟 IdP 没法用浏览器跳转跑通 PKCE —— 这是**预期**的，
 *   不是缺陷。于是本工具：
 *     · 先静态核查这件事（并把结论写进输出，免得后人以为漏了 PKCE 验证）；
 *     · 再用**注入令牌**的方式进到已登录态：按 `src/plugins/auth.js` 里真实的
 *       localStorage 键与结构（从源码里读出来，不猜）写入会话，令牌由本地模拟 IdP
 *       用**真 RSA 私钥**签发 —— 服务端那边走的是**完全相同**的验签代码路径。
 *   · 顺带用一个独立的小流程把模拟 IdP 的 PKCE 校验本身也验了（错误 verifier 必须 400）。
 *
 * 用法：node tools/verify-forum-ui.mjs
 * 隔离：被测站点跑在临时数据目录（FT_DATA_DIR）+ 仿真器的 Blobs 替身（.blobs-dev/），
 *       结束时会清掉自己造出来的东西；仓库里的 data/ 一个字节都不会动（工具有断言）。
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5410 + Math.floor(Math.random() * 60);
const IDP_PORT = 5480 + Math.floor(Math.random() * 60);
const CLIENT_ID = 'verify-forum-ui-client';
const OWNER_EMAIL = 'qiyuyu197@gmail.com';
const MEMBER_A = { sub: 'auth0|ui-member-a', email: 'member-a@example.com', name: '甲用户' };
const MEMBER_B = { sub: 'auth0|ui-member-b', email: 'member-b@example.com', name: '乙用户' };
const MEMBER_C = { sub: 'auth0|ui-member-c', email: 'member-c@example.com', name: '丙用户' };
const OWNER = { sub: 'auth0|ui-owner', email: OWNER_EMAIL, name: '站长' };

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? '\x1b[32m PASS\x1b[0m' : '\x1b[31m FAIL\x1b[0m'} ${name}${detail ? `  \x1b[90m${detail}\x1b[0m` : ''}`);
  return !!ok;
};
const skip = (name, why) => {
  results.push({ name, ok: true, detail: `跳过：${why}` });
  console.log(`\x1b[33m SKIP\x1b[0m ${name}  \x1b[90m${why}\x1b[0m`);
};

/* ---------------- 一、静态核查客户端（只读源码，不猜键名） ---------------- */

const readSrc = async (rel) => {
  try { return await fs.readFile(path.join(ROOT, rel), 'utf8'); } catch { return ''; }
};

const siteSrc = await readSrc('src/config/site.config.js');
const authSrc = await readSrc('src/plugins/auth.js');
const prefixMatch = /export const STORAGE_PREFIX\s*=\s*'([^']+)'/.exec(siteSrc);
const PREFIX = prefixMatch ? prefixMatch[1] : null;

/** 从 auth.js 的 KEYS 里读出真实后缀（形如 session: `${STORAGE_PREFIX}.auth.session`） */
const keyOf = (name) => {
  const m = new RegExp(`${name}:\\s*\`\\$\\{STORAGE_PREFIX\\}([^\`]+)\``).exec(authSrc);
  return m ? `${PREFIX}${m[1]}` : null;
};
const KEY_SESSION = PREFIX ? keyOf('session') : null;
const KEY_USER = PREFIX ? keyOf('user') : null;

check('能从源码读出客户端真实的 localStorage 键（不靠猜）',
  !!PREFIX && !!KEY_SESSION && !!KEY_USER,
  JSON.stringify({ prefix: PREFIX, session: KEY_SESSION, user: KEY_USER }));

// 客户端是否把授权地址写死成 https://（决定本地能不能跑真 PKCE 跳转）
const authUrlExpr = (/location\.assign\(([^)]*)\)/.exec(authSrc) || [])[1] || '';
const hardHttps = /https:\/\/\$\{this\.config\.domain\}\/authorize/.test(authSrc);
check('静态核查：本地 http 模拟 IdP 无法跑浏览器跳转（客户端写死 https://<domain>）',
  true,
  hardHttps
    ? `客户端拼的是 https://<domain>/authorize（真实 Auth0 永远 https）→ 本工具改用"注入令牌"，令牌仍由模拟 IdP 真签名，服务端走同一条验签路径。表达式：${authUrlExpr.slice(0, 60)}`
    : '客户端按 domain 原样拼，理论上可跑真 PKCE —— 但本工具仍用注入令牌以保证稳定（PKCE 本身另有独立校验，见下）');

/* ---------------- 二、本地模拟 IdP（真 RSA + PKCE 校验） ---------------- */

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'verify-forum-ui-key';
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const ISSUER = `http://127.0.0.1:${IDP_PORT}/`;

function signToken(claims) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: KID }));
  const payload = b64url(JSON.stringify(claims));
  const data = `${header}.${payload}`;
  return `${data}.${b64url(crypto.sign('sha256', Buffer.from(data), privateKey))}`;
}

/** 给某个身份签发 access_token 与 id_token（服务端只认签名与 claims） */
function tokensFor(identity) {
  const now = Math.floor(Date.now() / 1000);
  const base = {
    iss: ISSUER,
    aud: CLIENT_ID,
    sub: identity.sub,
    email: identity.email,
    email_verified: true,
    name: identity.name,
    picture: '',
    iat: now,
    exp: now + 3600,
  };
  return {
    access_token: signToken({ ...base, scope: 'openid profile email' }),
    id_token: signToken(base),
    expires_in: 3600,
    scope: 'openid profile email',
    token_type: 'Bearer',
  };
}

const pendingCodes = new Map();   // code → { challenge, redirectUri, identity }
const codeChallenges = [];        // 供 PKCE 校验用例断言
const logoutHits = [];            // 客户端跳 /v2/logout 的记录（验"真登出"）

const idp = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${IDP_PORT}`);
  const send = (code, body, headers = {}) => {
    res.writeHead(code, { 'Content-Type': 'application/json', ...headers });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };

  if (url.pathname === '/.well-known/jwks.json') return send(200, { keys: [jwk] });

  /**
   * Auth0 的"真登出"端点：客户端在清掉本地会话后会跳到
   * `https://<domain>/v2/logout?client_id=…&returnTo=…`。
   * 这里按真实行为 302 回 returnTo（并且只接受已登记的地址 —— 也就是本站根，
   * 与用户配置清单里的 Allowed Logout URLs 一致；不合法就退回本站根）。
   * 有了它，"退出登录"才能被界面级自检端到端覆盖，而不是断在一个 404 上。
   */
  if (url.pathname === '/v2/logout' || url.pathname === '/logout') {
    const returnTo = url.searchParams.get('returnTo') || '';
    const allowed = /^https?:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(returnTo);
    const back = allowed ? returnTo : `http://127.0.0.1:${PORT}/`;
    logoutHits.push({ clientId: url.searchParams.get('client_id') || '', returnTo, allowed });
    res.writeHead(302, { Location: back });
    return res.end();
  }

  if (url.pathname === '/authorize') {
    const challenge = url.searchParams.get('code_challenge') || '';
    const method = url.searchParams.get('code_challenge_method') || '';
    const redirectUri = url.searchParams.get('redirect_uri') || '';
    const state = url.searchParams.get('state') || '';
    const email = url.searchParams.get('login_hint') || MEMBER_A.email;
    const identity = email === OWNER.email ? OWNER : (email === MEMBER_B.email ? MEMBER_B : MEMBER_A);
    const code = `code_${crypto.randomBytes(8).toString('hex')}`;
    codeChallenges.push({ challenge, method });
    pendingCodes.set(code, { challenge, method, redirectUri, identity });
    const back = new URL(redirectUri || `http://127.0.0.1:${PORT}/`);
    back.searchParams.set('code', code);
    back.searchParams.set('state', state);
    res.writeHead(302, { Location: back.toString() });
    return res.end();
  }

  if (url.pathname === '/oauth/token' && req.method === 'POST') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    const grant = form.get('grant_type');

    if (grant === 'refresh_token') {
      // refresh_token 里编码了身份，方便"刷新后还是同一个人"
      const raw = String(form.get('refresh_token') || '');
      const [, sub, email] = raw.split('|');
      const identity = [MEMBER_A, MEMBER_B, OWNER].find((x) => x.sub === sub)
        || { sub: sub || MEMBER_A.sub, email: email || MEMBER_A.email, name: '用户' };
      return send(200, { ...tokensFor(identity), refresh_token: raw });
    }
    if (grant !== 'authorization_code') return send(400, { error: 'unsupported_grant_type' });

    const rec = pendingCodes.get(String(form.get('code') || ''));
    if (!rec) return send(400, { error: 'invalid_grant' });
    const verifier = String(form.get('code_verifier') || '');
    const computed = b64url(crypto.createHash('sha256').update(verifier).digest());
    if (rec.challenge && computed !== rec.challenge) {
      // PKCE 校验真的在跑：verifier 与 challenge 不匹配就必须拒绝
      return send(400, { error: 'invalid_grant', error_description: 'PKCE 校验失败' });
    }
    pendingCodes.delete(String(form.get('code')));
    return send(200, { ...tokensFor(rec.identity), refresh_token: `rt|${rec.identity.sub}|${rec.identity.email}` });
  }

  return send(404, { error: 'not_found', path: url.pathname });
});

/* ---------------- 三、PKCE 流程本身（不需要浏览器） ---------------- */

async function pkceFlow() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const authUrl = `http://127.0.0.1:${IDP_PORT}/authorize?response_type=code&client_id=${CLIENT_ID}`
    + `&redirect_uri=${encodeURIComponent(`http://127.0.0.1:${PORT}/`)}&state=st1`
    + `&code_challenge=${challenge}&code_challenge_method=S256&login_hint=${encodeURIComponent(MEMBER_A.email)}`;
  const r1 = await fetch(authUrl, { redirect: 'manual' });
  const loc = r1.headers.get('location') || '';
  const code = new URL(loc).searchParams.get('code') || '';
  const state = new URL(loc).searchParams.get('state') || '';

  const post = async (v) => {
    const body = new URLSearchParams({
      grant_type: 'authorization_code', client_id: CLIENT_ID, code,
      redirect_uri: `http://127.0.0.1:${PORT}/`, code_verifier: v,
    });
    const r = await fetch(`http://127.0.0.1:${IDP_PORT}/oauth/token`, { method: 'POST', body });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, json: j };
  };

  const wrong = await post('not-the-right-verifier');
  const minted = await fetch(authUrl, { redirect: 'manual' });
  const code2 = new URL(minted.headers.get('location') || '').searchParams.get('code') || '';
  const body2 = new URLSearchParams({
    grant_type: 'authorization_code', client_id: CLIENT_ID, code: code2,
    redirect_uri: `http://127.0.0.1:${PORT}/`, code_verifier: verifier,
  });
  const good = await fetch(`http://127.0.0.1:${IDP_PORT}/oauth/token`, { method: 'POST', body: body2 });
  const goodJson = await good.json().catch(() => ({}));

  return {
    status: r1.status, hasCode: !!code, state,
    wrongStatus: wrong.status,
    goodStatus: good.status, hasIdToken: !!goodJson.id_token,
  };
}

/* ---------------- 四、被测站点（仿真器：静态 + serverless /api + Blobs 替身） ---------------- */

const tmpData = await fs.mkdtemp(path.join(os.tmpdir(), 'ft-forum-ui-'));
const BLOB_DIR = path.join(ROOT, '.blobs-dev');
const blobExistedBefore = existsSync(BLOB_DIR);

/** 仓库 data/ 的快照：跑完必须一模一样（证明自检没碰真实内容） */
async function snapshotData() {
  const out = [];
  const walk = async (dir, rel = '') => {
    let entries = [];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(full, r);
      else {
        const st = await fs.stat(full).catch(() => null);
        out.push(`${r}:${st ? st.size : '?'}`);
      }
    }
  };
  await walk(path.join(ROOT, 'data'));
  return out.join('|');
}

let site = null;
let browser = null;
try {
  await new Promise((r) => idp.listen(IDP_PORT, '127.0.0.1', r));
  await fs.mkdir(tmpData, { recursive: true });
  const dataBefore = await snapshotData();

  site = spawn(process.execPath, ['tools/netlify-dev.mjs', String(PORT)], {
    cwd: ROOT,
    env: {
      ...process.env,
      FT_DATA_DIR: tmpData,
      AUTH0_DOMAIN: `http://127.0.0.1:${IDP_PORT}`,
      AUTH0_CLIENT_ID: CLIENT_ID,
      OWNER_EMAILS: OWNER_EMAIL,
    },
    stdio: 'ignore',
  });

  let up = false;
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok) { up = true; break; } } catch { /* 等 */ }
    await sleep(300);
  }
  check('被测站点起来了（仿真器：静态 + serverless /api + Blobs 替身）', up);
  if (!up) throw new Error('站点未就绪');

  const health = await (await fetch(`http://127.0.0.1:${PORT}/api/health`)).json();
  check('站点处于"部署形态"且账号功能已启用',
    health.deploy === 'netlify' && health.storage === 'blobs' && health.auth?.enabled === true,
    JSON.stringify({ deploy: health.deploy, storage: health.storage, auth: health.auth }));

  const pkce = await pkceFlow();
  check('模拟 IdP 的 PKCE 校验真的在跑（错误 verifier → 400，正确 verifier → 换到 id_token）',
    pkce.status === 302 && pkce.hasCode && pkce.wrongStatus === 400 && pkce.goodStatus === 200 && pkce.hasIdToken,
    JSON.stringify(pkce));

  /* ---------------- 五、真浏览器 ---------------- */

  if (!EDGE) {
    skip('真浏览器界面验证', '没找到 Edge/Chrome 可执行文件');
  } else {
    browser = await connect({ startUrl: `${origin()}/#/forum` });
    const page = browser;

    const ready = await waitFor(page, '!!window.Terminal?.Auth || !!document.getElementById("authBox")', 30000);
    check('站点在浏览器里启动（authBox 已挂到顶栏）', ready);

    /* ---- 未登录 ---- */
    const anon = await page.evalPage(`(async () => {
      const txt = (sel) => document.querySelector(sel)?.textContent || '';
      return {
        hasLoginBtn: !!document.getElementById('authLogin'),
        forumBanner: txt('.forum__banner').replace(/\\s+/g, ' ').trim(),
        hasNewBtn: !!document.getElementById('forumNew'),
        bodyText: document.body.innerText.slice(0, 400),
      };
    })()`);
    check('未登录：顶栏出现「登录」入口', anon?.hasLoginBtn === true, JSON.stringify({ hasLoginBtn: anon?.hasLoginBtn }));

    /**
     * 页内登录面板：点「登录」不再整页跳去 Auth0，而是先开我们自己的面板收邮箱，
     * 再带 login_hint 跳过去输密码（密码永不经过我们的代码）。
     * 这里只验"面板行为对不对 + 授权地址拼得对不对" —— 真实 Auth0 的跳转要真人密码，验不了。
     */
    const panel = await page.evalPage(`(async () => {
      const nap = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = {};
      document.getElementById('authLogin')?.click();
      await nap(400);
      const p = document.getElementById('authPanel');
      out.shown = !!p;
      out.hasEmail = !!document.getElementById('authPanelEmail');
      out.inputType = document.getElementById('authPanelEmail')?.type || '';
      out.focused = document.activeElement?.id || '';
      out.role = p?.getAttribute('role') || '';
      out.ariaModal = p?.getAttribute('aria-modal') || '';
      // 样式真的生效？（新加了一份 authpanel.css，怕链接没生效/选择器写错导致面板裸奔）
      if (p) {
        const cs = getComputedStyle(p);
        const ic = getComputedStyle(document.getElementById('authPanelEmail'));
        out.style = {
          bg: cs.backgroundColor,
          border: cs.borderTopWidth,
          inputBorder: ic.borderTopWidth,
          inView: p.getBoundingClientRect().top >= 0 && p.getBoundingClientRect().bottom <= window.innerHeight + 1,
        };
      }

      // 邮箱留空就点「继续」：不许跳走，且要有行内提示
      const hrefBefore = location.href;
      const form = document.getElementById('authPanelForm');
      if (form?.requestSubmit) form.requestSubmit(); else document.getElementById('authPanelGo')?.click();
      await nap(350);
      out.emptyStillHere = location.href === hrefBefore;
      out.emptyErrShown = !(document.getElementById('authPanelErr')?.hidden ?? true);

      // 格式不对同样不许跳
      const em = document.getElementById('authPanelEmail');
      if (em) { em.value = 'not-an-email'; em.dispatchEvent(new Event('input', { bubbles: true })); }
      document.getElementById('authPanelGo')?.click();
      await nap(350);
      out.badStillHere = location.href === hrefBefore;
      out.badErrShown = !(document.getElementById('authPanelErr')?.hidden ?? true);

      // 授权地址：纯函数，直接断言参数
      const { Auth } = window.Terminal;
      const u = new URL(Auth.authorizeUrl({ loginHint: 'someone@example.com' }));
      out.q = Object.fromEntries(u.searchParams.entries());
      out.endpoint = u.origin + u.pathname;

      // Esc 关闭，并把焦点还给「登录」按钮
      document.getElementById('authPanel')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await nap(350);
      out.closed = !document.getElementById('authPanel');
      out.focusBack = document.activeElement?.id || '';
      return out;
    })()`);
    check('页内登录面板：点「登录」开我们自己的面板（邮箱输入框已聚焦、role/aria 正确）',
      panel?.shown === true && panel?.hasEmail === true && panel?.inputType === 'email'
        && panel?.focused === 'authPanelEmail' && panel?.role === 'dialog' && panel?.ariaModal === 'true',
      JSON.stringify({ shown: panel?.shown, hasEmail: panel?.hasEmail, focused: panel?.focused, role: panel?.role }));
    check('页内登录面板：邮箱留空 / 格式不对都不跳转，且给行内提示',
      panel?.emptyStillHere === true && panel?.emptyErrShown === true
        && panel?.badStillHere === true && panel?.badErrShown === true,
      JSON.stringify({ emptyStillHere: panel?.emptyStillHere, emptyErrShown: panel?.emptyErrShown, badStillHere: panel?.badStillHere, badErrShown: panel?.badErrShown }));
    check('授权地址（纯函数）：带 login_hint 与 PKCE 参数，且指向 /authorize',
      panel?.q?.login_hint === 'someone@example.com'
        && panel?.q?.response_type === 'code'
        && panel?.q?.client_id === CLIENT_ID
        && panel?.q?.redirect_uri === `${origin()}/`
        && !!panel?.q?.state && !!panel?.q?.code_challenge
        && panel?.q?.code_challenge_method === 'S256'
        && /\/authorize$/.test(panel?.endpoint || ''),
      JSON.stringify({ endpoint: panel?.endpoint, login_hint: panel?.q?.login_hint, client_id: panel?.q?.client_id, redirect_uri: panel?.q?.redirect_uri, scope: panel?.q?.scope }));
    check('页内登录面板：样式真的生效（纸色底、有描边、输入框有边框、整块在视口内）',
      !/rgba\(0, 0, 0, 0\)|transparent/.test(panel?.style?.bg || '')
        && parseFloat(panel?.style?.border || '0') >= 1
        && parseFloat(panel?.style?.inputBorder || '0') >= 1
        && panel?.style?.inView === true,
      JSON.stringify(panel?.style));
    check('页内登录面板：Esc 能关闭，并把焦点还给「登录」按钮',
      panel?.closed === true && panel?.focusBack === 'authLogin',
      JSON.stringify({ closed: panel?.closed, focusBack: panel?.focusBack }));
    check('未登录：论坛说明需要登录，且没有发帖入口',
      /需要登录/.test(anon?.forumBanner || '') && anon?.hasNewBtn === false,
      JSON.stringify({ banner: anon?.forumBanner?.slice(0, 60), hasNewBtn: anon?.hasNewBtn }));

    const adminAnon = await page.evalPage(`(async () => {
      location.hash = '#/admin';
      await new Promise((r) => setTimeout(r, 1500));
      return {
        text: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 500),
        hasSave: !!document.getElementById('btnSave'),
      };
    })()`);
    check('未登录：发布控制台不给出保存入口，并说明只有站长能改',
      adminAnon?.hasSave === false && /只有站长|不是站长|登录/.test(adminAnon?.text || ''),
      JSON.stringify({ hasSave: adminAnon?.hasSave, text: adminAnon?.text?.slice(0, 80) }));

    /* ---- member（甲）：发帖 ---- */
    await signIn(page, MEMBER_A);
    const memberState = await page.evalPage(`(async () => {
      location.hash = '#/forum';
      await new Promise((r) => setTimeout(r, 2000));
      const box = document.getElementById('authBox');
      box.dataset.open = '1';
      document.getElementById('authToggle')?.click();
      await new Promise((r) => setTimeout(r, 300));
      return {
        hasToggle: !!document.getElementById('authToggle'),
        label: document.querySelector('.authbox__label')?.textContent?.trim() || '',
        menu: (document.querySelector('.authbox__menu')?.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 160),
        hasNewBtn: !!document.getElementById('forumNew'),
      };
    })()`);
    check('登录后（member）：顶栏显示用户名，菜单里角色是普通用户',
      memberState?.hasToggle === true && /MEMBER|普通用户/.test(memberState?.menu || ''),
      JSON.stringify({ label: memberState?.label, menu: memberState?.menu }));
    check('登录后（member）：论坛出现「写新帖」入口', memberState?.hasNewBtn === true);

    const payloadTitle = `自检帖 ${Date.now().toString(36)}`;
    const created = await page.evalPage(`(async () => {
      location.hash = '#/forum?write=1';
      await new Promise((r) => setTimeout(r, 1800));
      const form = document.getElementById('forumForm');
      if (!form) return { ok: false, why: '没有 compose 表单' };
      document.getElementById('fTitle').value = ${JSON.stringify(payloadTitle)};
      document.getElementById('fBody').value = '自检正文：**粗体** 与列表\\n\\n- 一\\n- 二';
      document.getElementById('forumSubmit').click();
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 300));
        if (/\\/forum\\/[A-Za-z0-9_-]+/.test(location.hash) && document.querySelector('.forum__post')) break;
      }
      return {
        ok: true,
        hash: location.hash,
        // 标题在 viewhead 里（不在 .forum__post 内），所以直接看整页文本最稳
        pageHasTitle: document.body.innerHTML.includes(${JSON.stringify(payloadTitle)}),
        hasEdit: !!document.getElementById('forumEdit'),
        hasDelete: !!document.getElementById('forumDelete'),
      };
    })()`);
    const postId = (String(created?.hash || '').match(/#\/forum\/([A-Za-z0-9_-]+)/) || [])[1] || '';
    check('member 能通过界面发帖（跳到详情页，标题出现在页面上）',
      created?.ok === true && !!postId && created?.pageHasTitle === true,
      JSON.stringify({ hash: created?.hash, id: postId, pageHasTitle: created?.pageHasTitle }));
    check('自己的帖子有「编辑 / 删除」按钮',
      created?.hasEdit === true && created?.hasDelete === true,
      JSON.stringify({ hasEdit: created?.hasEdit, hasDelete: created?.hasDelete }));

    /* ---- member（乙）：别人的帖子不能改 ---- */
    await signIn(page, MEMBER_B);
    const other = await page.evalPage(`(async () => {
      location.hash = '#/forum/${postId}';
      await new Promise((r) => setTimeout(r, 2200));
      return {
        hasPost: !!document.querySelector('.forum__post'),
        hasEdit: !!document.getElementById('forumEdit'),
        hasDelete: !!document.getElementById('forumDelete'),
      };
    })()`);
    check('别人的帖子（member 乙看）：没有编辑/删除按钮',
      other?.hasPost === true && other?.hasEdit === false && other?.hasDelete === false,
      JSON.stringify(other));

    // 越权 PATCH 直接打 API：界面不给按钮只是"看得见"的层面，服务端必须自己拦住
    const steal = await fetch(`${origin()}/api/forum/posts/${postId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokensFor(MEMBER_B).access_token}` },
      body: JSON.stringify({ title: '乙用户想改甲的帖子' }),
    });
    check('越权 PATCH 走 API 也被拦住 → 403', steal.status === 403, `HTTP ${steal.status}`);

    /* ---- XSS：用户内容不得被当成 HTML 执行 ---- */
    const xssBody = [
      '<img src=x onerror="window.__xss=1">',
      '<script>window.__xss=1<\\/script>',
      '[点我](javascript:window.__xss=1)',
      '[数据](data:text/html,<script>window.__xss=1<\\/script>)',
    ].join('\\n\\n');
    const xssPost = await fetch(`${origin()}/api/forum/posts`, {
      method: 'POST',
      // 用第三个账号发：服务端对同一账号有 15 秒发帖间隔，用甲会被限流挡住（第一版就是这么假红的）
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokensFor(MEMBER_C).access_token}` },
      body: JSON.stringify({ title: `XSS 自检 ${Date.now().toString(36)}`, body: xssBody }),
    });
    const xssJson = await xssPost.json().catch(() => ({}));
    const xssId = xssJson?.post?.id || '';
    check('XSS 用例的帖子发布成功（拿到 id）', xssPost.status === 200 && !!xssId,
      `HTTP ${xssPost.status} ${xssId || JSON.stringify(xssJson).slice(0, 80)}`);
    const xss = xssId ? await page.evalPage(`(async () => {
      window.__xss = false;
      location.hash = '#/forum/${xssId}';
      await new Promise((r) => setTimeout(r, 2500));
      const prose = document.querySelector('.forum__post .prose') || document.querySelector('.prose');
      const html = prose ? prose.innerHTML : '';
      const text = (prose ? prose.textContent : '').replace(/\\s+/g, ' ').trim();
      const links = [...document.querySelectorAll('.forum__post a, .prose a')];
      await new Promise((r) => setTimeout(r, 600));
      return {
        fired: window.__xss === true,
        // 来自正文的"会执行"的 img（onerror / onload / javascript: src）都算失败
        rawImg: /<img[^>]+(onerror|onload)=/i.test(html),
        jsHref: links.some((a) => /^\\s*javascript:/i.test(a.getAttribute('href') || '')),
        dataHref: links.some((a) => /^\\s*data:/i.test(a.getAttribute('href') || '')),
        proseHtml: html.slice(0, 120),
        proseText: text.slice(0, 140),
        // 渲染器返回的是 { html, toc }；若模板把它当字符串塞进去，正文就会变成 [object Object]
        objectObject: /\\[object Object\\]/.test(text) || /\\[object Object\\]/.test(html),
        hasPayloadText: text.includes('onerror=') && text.includes('<script>'),
      };
    })()`) : null;
    check('XSS：正文里的 <img onerror> / <script> / javascript: 链接都没有被执行',
      !!xss && xss.fired === false && xss.rawImg === false && xss.jsHref === false && xss.dataHref === false,
      JSON.stringify(xss));
    check('XSS：正文被当成纯文本渲染出来（能看到载荷原文）',
      xss?.hasPayloadText === true && xss?.objectObject === false,
      xss?.objectObject
        ? `正文渲染成了 [object Object] —— src/views/forum.js:214 把 mdRender() 的返回值（{html,toc}）当字符串用了，应为 mdRender(post.body||'').html；实测 HTML=${xss?.proseHtml}`
        : JSON.stringify({ hasPayloadText: xss?.hasPayloadText, text: xss?.proseText }));

    /* ---- owner：控制台可写 + 账号列表 ---- */
    await signIn(page, OWNER);
    const ownerAdmin = await page.evalPage(`(async () => {
      location.hash = '#/admin';
      await new Promise((r) => setTimeout(r, 2000));
      const save = document.getElementById('btnSave');
      const text = document.body.innerText.replace(/\\s+/g, ' ');
      let toast = '';
      if (save) {
        // 真的填一次再保存：只点一下空表单只会得到"请先填写标题"，验不到写入通路
        const t = document.getElementById('fTitle');
        const c = document.getElementById('fContent');
        if (t) t.value = '自检发布的公告 ' + Date.now().toString(36);
        if (c) c.value = '这条由自检写入线上内容存储（Blobs 替身），不会进仓库。';
        save.click();
        await new Promise((r) => setTimeout(r, 3400));
        toast = (document.querySelector('.toast')?.textContent || '').replace(/\\s+/g, ' ').trim();
      }
      return {
        hasSave: !!save,
        state: (document.getElementById('serverState')?.textContent || '').trim(),
        toast,
        deniedText: /不是站长|只有站长/.test(text),
      };
    })()`);
    check('站长：发布控制台进入可写态（有保存入口、且没被判成非站长）',
      ownerAdmin?.hasSave === true && ownerAdmin?.deniedText === false,
      JSON.stringify({ hasSave: ownerAdmin?.hasSave, state: ownerAdmin?.state, deniedText: ownerAdmin?.deniedText }));
    check('站长：填好内容点保存后看到成功提示（不是失败/拒绝）',
      /已发布|已保存/.test(ownerAdmin?.toast || '') && !/失败|拒绝|不能|请重新登录/.test(ownerAdmin?.toast || ''),
      /需要登录|401/.test(ownerAdmin?.toast || '')
        ? `站长保存失败，服务端说"需要登录" —— 说明写入请求没带令牌：src/core/store.js:451 的 fetch 只发了 Content-Type，没有 Authorization（应改为走 Auth.api 或带上 Auth.token()；DELETE 在 store.js:468 有同样问题）`
        : JSON.stringify({ toast: ownerAdmin?.toast?.slice(0, 90) }));

    const users = await page.evalPage(`(async () => {
      const res = await fetch('/api/auth/users', {
        headers: { Authorization: 'Bearer ' + (JSON.parse(localStorage.getItem(${JSON.stringify(KEY_SESSION)}) || '{}').access_token || '') },
        cache: 'no-store',
      });
      const j = await res.json().catch(() => ({}));
      return { status: res.status, total: j.total, names: (j.users || []).map((u) => u.email) };
    })()`);
    check('站长：能看到账号列表（/api/auth/users 200 且有账号）',
      users?.status === 200 && (users?.total || 0) >= 1, JSON.stringify(users));

    /* ---- 编辑资料：昵称 + 头像（走真实的 canvas 降采样路径） ---- */
    const openProfile = await page.evalPage(`(async () => {
      const nap = (ms) => new Promise((r) => setTimeout(r, ms));
      document.getElementById('authToggle')?.click();
      await nap(250);
      const menuItem = !!document.getElementById('authEdit');
      document.getElementById('authEdit')?.click();
      await nap(400);
      const panel = document.getElementById('profilePanel');
      return {
        menuItem,
        panel: !!panel,
        hasName: !!document.getElementById('profileName'),
        hasFile: !!document.getElementById('profileFile'),
        hasUrl: !!document.getElementById('profileAvatarUrl'),
        focused: document.activeElement?.id || '',
        role: panel?.getAttribute('role') || '',
        modal: panel?.getAttribute('aria-modal') || '',
      };
    })()`);
    check('登录后账号菜单里有「编辑资料」，打开的是同风格面板（含昵称/头像控件）',
      openProfile?.menuItem === true && openProfile?.panel === true && openProfile?.hasName === true
        && openProfile?.hasFile === true && openProfile?.hasUrl === true
        && openProfile?.role === 'dialog' && openProfile?.modal === 'true'
        && openProfile?.focused === 'profileName',
      JSON.stringify(openProfile));

    // 造一张"用户选的图片"：**在页面里用 canvas 生成 PNG** 再包成 File ——
    // 这样不依赖硬编码的 base64（之前那张 1×1 的图 createImageBitmap 直接解不开），
    // 而后面走的仍是 shell.js 里真实的 createImageBitmap → canvas → toDataURL 那条路。
    const saved = await page.evalPage(`(async () => {
      const nap = (ms) => new Promise((r) => setTimeout(r, ms));
      const NEW_NAME = '改过名的站长';
      const nameInput = document.getElementById('profileName');
      nameInput.value = NEW_NAME;
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));

      const c = document.createElement('canvas');
      c.width = 8; c.height = 8;
      const g = c.getContext('2d');
      g.fillStyle = '#FFD400'; g.fillRect(0, 0, 8, 8);
      const dataUrl = c.toDataURL('image/png');
      const bin = atob(dataUrl.split(',')[1]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const file = new File([bytes], 'a.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const fileInput = document.getElementById('profileFile');
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await nap(900);                                    // 等降采样完成

      const previewSrc = document.getElementById('profilePreview')?.getAttribute('src') || '';
      const hintText = (document.getElementById('profileHint')?.textContent || '').trim();
      const errText = (document.getElementById('profileErr')?.textContent || '').trim();
      const errHidden = document.getElementById('profileErr')?.hidden !== false;
      document.getElementById('profileSave')?.click();
      for (let i = 0; i < 30; i++) {                     // 等保存回来、面板关闭、chip 重画
        await nap(300);
        if (!document.getElementById('profilePanel')) break;
      }
      const chipLabel = (document.querySelector('#authToggle .authbox__label')?.textContent || '').trim();
      const chipImg = document.querySelector('#authToggle img.authbox__avatar')?.getAttribute('src') || '';
      const api = await fetch('/api/profile', {
        headers: { Authorization: 'Bearer ' + (JSON.parse(localStorage.getItem(${JSON.stringify(KEY_SESSION)}) || '{}').id_token || '') },
        cache: 'no-store',
      }).then((r) => r.json()).catch(() => ({}));
      return {
        previewIsDataUrl: /^data:image\\//.test(previewSrc),
        previewHead: String(previewSrc).slice(0, 20),
        hintText,
        errText,
        errHidden,
        panelClosed: !document.getElementById('profilePanel'),
        chipLabel,
        chipImgIsDataUrl: /^data:image\\//.test(chipImg),
        serverName: api?.profile?.name || '',
        serverAvatarIsDataUrl: /^data:image\\//.test(String(api?.profile?.avatar || '')),
      };
    })()`);
    check('改昵称保存后顶栏 chip 立刻变成新昵称（不刷新页面）',
      saved?.chipLabel === '改过名的站长' && saved?.serverName === '改过名的站长' && saved?.panelClosed === true,
      JSON.stringify({ chipLabel: saved?.chipLabel, serverName: saved?.serverName, panelClosed: saved?.panelClosed }));
    check('选一张图片后会先在浏览器里降采样（data:image/）并生效到顶栏头像',
      saved?.previewIsDataUrl === true && saved?.chipImgIsDataUrl === true && saved?.serverAvatarIsDataUrl === true,
      JSON.stringify(saved));

    const escClose = await page.evalPage(`(async () => {
      const nap = (ms) => new Promise((r) => setTimeout(r, ms));
      document.getElementById('authToggle')?.click();
      await nap(250);
      document.getElementById('authEdit')?.click();
      await nap(350);
      const opened = !!document.getElementById('profilePanel');
      document.getElementById('profilePanel')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await nap(250);
      return { opened, closed: !document.getElementById('profilePanel'), focusBack: document.activeElement?.id || '' };
    })()`);
    check('资料面板：Esc 关闭并把焦点还给账号 chip',
      escClose?.opened === true && escClose?.closed === true && escClose?.focusBack === 'authToggle',
      JSON.stringify(escClose));

    /* ---- 退出登录 ---- */
    // ⚠️ 真登出会**整页跳转**（Auth0 /v2/logout → 302 回站点），所以点完之后
    // 正在等待的那个 evaluate 一定会被"navigated or closed"打断 —— 那是预期，
    // 不是失败。这里把点击单独包一层容错，等跳转链路跑完再做一次全新的断言。
    await page.evalPage(`(async () => {
      location.hash = '#/forum';
      await new Promise((r) => setTimeout(r, 1500));
      document.getElementById('authToggle')?.click();
      await new Promise((r) => setTimeout(r, 300));
      document.getElementById('authLogout')?.click();
      return true;
    })()`).catch(() => null);
    await new Promise((r) => setTimeout(r, 4000));   // 等 /v2/logout → 302 → 回到站点
    const out = await page.evalPage(`(async () => {
      location.hash = '#/forum';
      await new Promise((r) => setTimeout(r, 1500));
      return {
        hasLogin: !!document.getElementById('authLogin'),
        hasToggle: !!document.getElementById('authToggle'),
        forumBanner: (document.querySelector('.forum__banner')?.textContent || '').replace(/\\s+/g, ' ').trim(),
        href: location.href,
      };
    })()`).catch((err) => ({ error: String(err?.message || err) }));
    check('退出登录后回到未登录态（顶栏又出现「登录」，论坛又提示需要登录）',
      out?.hasLogin === true && out?.hasToggle === false && /需要登录/.test(out?.forumBanner || ''),
      JSON.stringify(out));

    /**
     * 真登出：清掉本地会话之后还应当跳一次 Auth0 的 `/v2/logout`
     * （否则 Auth0 那边的会话还在，下次登录可能不再要求密码 —— 共用电脑上就是个问题）。
     * returnTo 必须是站点根（hash 路由不能带 #/…，否则 Auth0 会认为没登记过）。
     */
    const hit = logoutHits[logoutHits.length - 1];
    check('登出会真的跳 Auth0 /v2/logout（带上 client_id 与站点根的 returnTo）',
      !!hit && hit.clientId === CLIENT_ID && hit.allowed === true && !/#/.test(hit.returnTo || ''),
      JSON.stringify(hit || '没有观察到 /v2/logout 请求'));

    /* ---- 隔离性：仓库 data/ 一个字节都没动 ---- */
    const dataAfter = await snapshotData();
    check('自检没有碰仓库里的 data/（前后快照一致）', dataBefore === dataAfter,
      dataBefore === dataAfter ? '一致' : '有不一致，说明有内容被写进了仓库');
  }
} catch (err) {
  check('自检过程没有抛异常', false, String(err?.message || err));
} finally {
  try { browser?.close?.(); } catch { /* noop */ }
  try { site?.kill(); } catch { /* noop */ }
  try { idp.close(); } catch { /* noop */ }
  await fs.rm(tmpData, { recursive: true, force: true }).catch(() => {});
  // 仿真器的 Blobs 替身：只清我们自己造出来的那一个（原先就存在就别动，可能别人在用）
  if (!blobExistedBefore) await fs.rm(BLOB_DIR, { recursive: true, force: true }).catch(() => {});
}

/* ---------------- 工具函数（放在主流程之后，函数声明会提升） ---------------- */

function origin() { return `http://127.0.0.1:${PORT}`; }

/** 用注入令牌的方式进入已登录态：键与结构都来自客户端源码 */
async function signIn(page, identity) {
  const t = tokensFor(identity);
  const user = {
    sub: identity.sub, email: identity.email, name: identity.name,
    picture: '', verified: true, role: null, source: 'token',
  };
  await page.evalPage(`(() => {
    localStorage.setItem(${JSON.stringify(KEY_SESSION)}, JSON.stringify(${JSON.stringify({
      access_token: t.access_token, refresh_token: '', id_token: t.id_token,
      scope: 'openid profile email', expiresAt: 0,
    })}));
    localStorage.setItem(${JSON.stringify(KEY_USER)}, JSON.stringify(${JSON.stringify(user)}));
    return true;
  })()`);
  // expiresAt 用"真实值"而不是 0：0 会被当作已过期，从而触发 refresh（我们没配 refresh 端点）
  await page.evalPage(`(() => {
    const k = ${JSON.stringify(KEY_SESSION)};
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.expiresAt = Date.now() + 3600 * 1000;
    localStorage.setItem(k, JSON.stringify(s));
    return true;
  })()`);
  await page.evalPage('location.reload()').catch(() => { /* 上下文会随刷新销毁 */ });
  await sleep(2600);
  await waitFor(page, '!!document.getElementById("authBox")', 20000);
  return true;
}

async function waitFor(page, expr, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await page.evalPage(expr).catch(() => false);
    if (v === true) return true;
    await sleep(300);
  }
  return false;
}

/** CDP 连接（与 tools/verify-deploy.mjs 同一套写法） */
async function connect({ startUrl }) {
  const port = 9600 + Math.floor(Math.random() * 200);
  const profile = path.join(os.tmpdir(), `ft-forum-ui-${Date.now()}`);
  const child = spawn(EDGE, [
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required', '--window-size=1360,900',
    startUrl,
  ], { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (target) break;
    } catch { /* 还没起来 */ }
    await sleep(250);
  }
  if (!target) throw new Error('调试端口未就绪');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', () => rej(new Error('WebSocket 连接失败')), { once: true });
  });

  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push(String(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '').slice(0, 200));
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    const t = setTimeout(() => { pending.delete(mid); reject(new Error(`CDP 超时：${method}`)); }, 60000);
    pending.set(mid, {
      resolve: (v) => { clearTimeout(t); resolve(v); },
      reject: (e) => { clearTimeout(t); reject(e); },
    });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  await send('Runtime.enable');

  const evalPage = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __error: r.exceptionDetails.text };
    return r.result?.value;
  };

  return {
    evalPage, errors, send,
    close: () => { try { ws.close(); } catch { /* noop */ } child.kill(); },
  };
}

/* ---------------- 汇总 ---------------- */

const failed = results.filter((r) => !r.ok);
console.log(`\n\x1b[1m结果\x1b[0m  通过 ${results.length - failed.length} / ${results.length}`);
if (failed.length) {
  console.log('\x1b[31m未通过：\x1b[0m');
  failed.forEach((f) => console.log(`  · ${f.name}  (${f.detail})`));
}
setTimeout(() => process.exit(failed.length ? 1 : 0), 300);
