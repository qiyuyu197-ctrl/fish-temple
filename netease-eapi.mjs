/**
 * netease-eapi.mjs — 网易云 eapi 客户端（零依赖 · 只做登录与个人数据要用的那点事）
 * ==================================================================
 * 这个文件是「从 Folia 学来的那套东西」在网页端的落点。原来本站只有
 * `music.163.com` 的公开 web 接口（匿名、明文、无登录），够搜歌、够试听，
 * 但拿不到任何"属于某个人"的东西：私密歌单、我喜欢的音乐、每日推荐、红心。
 * 那些接口只在**登录态**下返回，而且入口都是 eapi。
 *
 * eapi 是什么（对照 Folia 里 `@neteasecloudmusicapienhanced/api` 的 util/crypto.js）：
 *   1. 把 `{...参数, e_r, header}` 序列化成 JSON 文本 text；
 *   2. 拼 `nobody{uri}use{text}md5forencrypt` 求 MD5 → digest；
 *   3. 拼 `{uri}-36cd479b6b5-{text}-36cd479b6b5-{digest}`，用固定密钥
 *      `e82ckenh8dichen8` 做 **AES-128-ECB + PKCS7**，输出大写十六进制；
 *   4. 以表单 `params=<十六进制>` POST 到 `https://interfacepc.music.163.com/eapi/{uri去掉/api/}`，
 *      同时把 header 里那几个字段（deviceId / os / appver / osver / requestId …）
 *      既写进请求的 Cookie，又原样塞进 body 的 `header` 字段。
 *
 * 为什么不用现成的 npm 包：
 *   · 站点是零依赖的（README 里写了"没有 npm 依赖、没有构建步骤"），为了一个登录
 *     拖进 axios/crypto-js/node-forge 一整套不划算；
 *   · 我们只需要 6 个接口，Node 自带的 `node:crypto` 就是完整的 AES/MD5 实现；
 *   · 上游包有些边界行为不适合服务端复用（比如把网络错误吞成空 body，见 Folia
 *     的 neteaseApiStartup.cjs 为什么要替换 login_qr_check）。自己写反而更短、更好排查。
 *
 * 这里**只放协议层**：加密、请求、错误归一化、节流。
 * "扫码会话怎么绑到账号、cookie 存在哪、加密没有" 在 netease-login.mjs。
 */

import crypto from 'node:crypto';
import zlib from 'node:zlib';

/** eapi 的固定对称密钥。这不是秘密：网易云客户端里写死的常量。 */
const EAPI_KEY = 'e82ckenh8dichen8';

/** 登录二维码这条链路走 interfacepc（Folia 注释里叫 eapi / interfacepc 分支）。 */
export const EAPI_ORIGIN = 'https://interfacepc.music.163.com';
export const EAPI_PREFIX = '/eapi/';

/**
 * 手机端 UA。eapi 的 Cookie 里 os=iPhone OS、appver=9.0.90 必须和它自洽，
 * 否则容易被判成"客户端指纹不一致"。这组值直接取自上游包的 osMap / userAgentMap。
 */
export const EAPI_UA = 'NeteaseMusic 9.0.90/5038 (iPhone; iOS 16.2; zh_CN)';

/**
 * 各端在请求里声明的设备画像。
 *
 * 默认用 **pc**：Folia 的渲染进程调本地 API 时并不传 cookie，上游
 * `processCookieObject` 就回落到 `osMap.pc`（os=pc / appver=3.1.17 / Windows 10），
 * 而 UA 仍然是 iPhone 的——这是上游多年来的默认组合，也是"大家都这么用"的那一套。
 * 我们之前自己编了一套自洽的 iPhone 指纹（os=iPhone OS / 9.0.90），反而和历史流量不一样。
 */
export const OS_PROFILES = {
  pc: {
    os: 'pc',
    appver: '3.1.17.204416',
    osver: 'Microsoft-Windows-10-Professional-build-19045-64bit',
    channel: 'netease',
  },
  android: {
    os: 'android',
    appver: '9.1.65',
    osver: '16',
    channel: 'xiaomi',
  },
  iphone: {
    os: 'iPhone OS',
    appver: '9.0.90',
    osver: '16.2',
    channel: 'distribution',
  },
};

/** 同一进程内的最小请求间隔：和 server.mjs 里那套代理保持一个量级，别把对方打急。 */
const MIN_INTERVAL_MS = 180;
let lastCall = 0;

/* ------------------------------------------------------------------ */
/* 纯函数：加密与编码                                                   */
/* ------------------------------------------------------------------ */

export function md5hex(input) {
  return crypto.createHash('md5').update(String(input), 'utf8').digest('hex');
}

/**
 * 把一次 eapi 调用的参数加密成 `params`（大写十六进制）。
 * 单独导出是为了能被自检直接喂固定输入、断言输出 —— 这条链路一旦错，
 * 表现是网易云回一个 200 但 code 400/没结果，很难从现象倒推。
 */
export function eapiParams(uri, data) {
  const text = JSON.stringify(data);
  const digest = md5hex(`nobody${uri}use${text}md5forencrypt`);
  const plain = `${uri}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;
  const cipher = crypto.createCipheriv(`aes-${EAPI_KEY.length * 8}-ecb`, Buffer.from(EAPI_KEY, 'utf8'), null);
  return Buffer.concat([cipher.update(Buffer.from(plain, 'utf8')), cipher.final()])
    .toString('hex')
    .toUpperCase();
}

/**
 * 万一对端无视 `e_r:false` 仍然回了密文，这里能把它解回 JSON。
 * 平时用不到 —— 但少了它，一次"突然全变十六进制"的上游变更会被误判成"被风控"。
 */
export function eapiDecrypt(hex) {
  const decipher = crypto.createDecipheriv(`aes-${EAPI_KEY.length * 8}-ecb`, Buffer.from(EAPI_KEY, 'utf8'), null);
  const plain = Buffer.concat([decipher.update(Buffer.from(hex, 'hex')), decipher.final()]).toString('utf8');
  return JSON.parse(plain);
}

/** 设备号：52 位十六进制。形状和官方一致（客户端就是这种长度）。 */
export function generateDeviceId() {
  const pool = '0123456789ABCDEF';
  let out = '';
  const bytes = crypto.randomBytes(52);
  for (let i = 0; i < 52; i += 1) out += pool[bytes[i] % 16];
  return out;
}

/** 小写十六进制随机串（`_ntes_nuid` 用；官方是 64 位十六进制）。 */
function randomHex(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

/** `WNMCID` 的形状：6 个小写字母 + `.时间戳.01.0`（上游就是这么拼的）。 */
function randomWnmcid() {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let head = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i += 1) head += letters[bytes[i] % 26];
  return `${head}.${Date.now()}.01.0`;
}

/** Cookie 对象 → `k=v; k=v`。值要 encodeURIComponent：MUSIC_U 里可能出现 `=`、`/`。 */
export function cookieToString(cookie) {
  return Object.entries(cookie || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('; ');
}

/** `set-cookie` 数组 → 扁平对象（只留 name=value，属性全部丢掉）。 */
export function parseSetCookie(list) {
  const out = {};
  for (const line of Array.isArray(list) ? list : []) {
    const [pair] = String(line).split(';');
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (name) out[name] = value;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 身份：一次登录流程里所有请求必须共用同一份 header / deviceId            */
/* ------------------------------------------------------------------ */

/**
 * 建一个"身份"。扫码的 `unikey` 与随后每一次 `client/login` 轮询都该用它，
 * 这样网易云那边看到的始终是同一台设备（Folia 的 neteaseLoginIdentity.cjs
 * 花了整段注释讲为什么：同一轮里换 deviceId 会把扫码状态弄丢）。
 */
export function createIdentity({ deviceId = generateDeviceId(), cookie = {}, profile = 'pc' } = {}) {
  const os = OS_PROFILES[profile] || OS_PROFILES.pc;
  const nuid = cookie._ntes_nuid || randomHex(32);
  return {
    deviceId,
    osProfile: os,
    cookie: {
      // 下面这几项是上游 processCookieObject 每个请求都会补的"客户端身份"：
      // 少了它们，请求在服务端看来就是一台没有装过 App 的裸设备。
      __remember_me: 'true',
      ntes_kaola_ad: '1',
      _ntes_nuid: nuid,
      _ntes_nnid: cookie._ntes_nnid || `${nuid},${Date.now()}`,
      WNMCID: cookie.WNMCID || randomWnmcid(),
      WEVNSM: '1.0.0',
      osver: os.osver,
      deviceId,
      os: os.os,
      channel: os.channel,
      appver: os.appver,
      ...cookie,
    },
    buildver: String(Date.now()).slice(0, 10),
  };
}

/** 身份 cookie 里跟"设备指纹"有关的那几项，需要跨请求稳定（存在绑定的设备档案里）。 */
export function identityCookieFields(identity) {
  const c = identity?.cookie || {};
  return {
    _ntes_nuid: c._ntes_nuid,
    _ntes_nnid: c._ntes_nnid,
    WNMCID: c.WNMCID,
  };
}

function headerFor(identity) {
  const c = identity.cookie || {};
  const header = {
    osver: c.osver,
    deviceId: identity.deviceId,
    os: c.os,
    appver: c.appver,
    versioncode: '140',
    mobilename: '',
    buildver: identity.buildver || String(Date.now()).slice(0, 10),
    resolution: '1920x1080',
    __csrf: c.__csrf || '',
    channel: c.channel,
    // requestId 每次请求都新生成：上游就是这么做的
    requestId: `${Date.now()}_${String(Math.floor(Math.random() * 1000)).padStart(4, '0')}`,
  };
  for (const name of ['MUSIC_U', 'MUSIC_A', 'NMTID']) {
    if (c[name]) header[name] = c[name];
  }
  return header;
}

/* ------------------------------------------------------------------ */
/* 错误归一化                                                           */
/* ------------------------------------------------------------------ */

/**
 * 所有 eapi 失败都变成这一种错误，调用方只需要看三件事：
 *   · `code`     网易云业务码（800/801/802/803、8821、301…）
 *   · `network`  是不是根本没拿到响应（超时 / 连接被重置）
 *   · `message`  能直接给人看的一句话
 *
 * ⚠️ 这里刻意**不吞错**。上游那个 login_qr_check 的 catch 分支引用了 try 里的变量，
 * 请求一被拒就抛 ReferenceError，服务端只能回 404 —— 扫码失败时看到的永远是
 * "二维码不存在"，真实原因（风控 8821、连接重置）全丢了。Folia 为此专门替换了
 * 那个模块；我们是自己写的，所以从一开始就保留原因。
 */
export class NeteaseError extends Error {
  constructor(message, { code = 0, status = 0, network = false, body = null } = {}) {
    super(message);
    this.name = 'NeteaseError';
    this.code = code;
    this.status = status;
    this.network = network;
    this.body = body;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 轻节流：把并发的 eapi 调用摊开，避免同一瞬间打一串过去。 */
async function throttle() {
  const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastCall));
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
}

/* ------------------------------------------------------------------ */
/* 请求                                                                */
/* ------------------------------------------------------------------ */

/**
 * 发一次 eapi 请求。
 *
 * @param {string} uri   形如 `/api/login/qrcode/unikey`（带 /api/ 前缀，和上游一致）
 * @param {object} data  业务参数
 * @param {object} identity  createIdentity() 的产物
 * @param {{timeout?:number, retry?:number}} opts
 * @returns {Promise<{status:number, body:object, setCookie:string[], cookie:object}>}
 */
export async function eapiRequest(uri, data = {}, identity, { timeout = 10000, retry = 1 } = {}) {
  if (!identity) throw new Error('eapiRequest 需要 identity');

  const attempt = async () => {
    const header = headerFor(identity);
    const payload = { ...data, e_r: false, header };
    const params = eapiParams(uri, payload);
    const url = `${EAPI_ORIGIN}${EAPI_PREFIX}${uri.replace(/^\/api\//, '')}`;

    await throttle();

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // Cookie 用**完整身份**（含 _ntes_nuid / WNMCID / 设备画像），body 里的 header 只放其中一部分。
          // 上游就是这么分的；我们之前两边都只放那一小撮，等于把身份信息砍掉了一半。
          Cookie: cookieToString(identity.cookie),
          'User-Agent': EAPI_UA,
          Accept: '*/*',
        },
        body: new URLSearchParams({ params }).toString(),
      });
    } catch (err) {
      // 超时 / DNS / 连接被重置：这一类是"真的没拿到响应"，重试有意义
      throw new NeteaseError(`网易云没有响应：${err?.message || err}`, { code: 502, network: true });
    } finally {
      clearTimeout(timer);
    }

    const setCookie = typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);

    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      // 不是 JSON：可能是密文（理论上 e_r:false 不会出现），也可能是一张风控页
      try { body = eapiDecrypt(text.trim()); } catch {
        throw new NeteaseError(
          `网易云返回了无法解析的内容（HTTP ${res.status}）`,
          { code: res.status || 502, status: res.status, body: text.slice(0, 200) },
        );
      }
    }

    return { status: res.status, body, setCookie, cookie: parseSetCookie(setCookie) };
  };

  // 只对网络层失败重试。业务码（比如 8821 风控）重试没有意义，反而像在撞门。
  let lastError;
  for (let i = 0; i <= retry; i += 1) {
    try {
      return await attempt();
    } catch (err) {
      lastError = err;
      if (!(err instanceof NeteaseError) || !err.network || i === retry) break;
      await sleep(300);
    }
  }
  throw lastError;
}

/**
 * 业务成功判定。eapi 的 HTTP 状态几乎永远是 200，真正的结果在 `body.code`。
 * 只把 200 当成功；803（扫码确认成功）由调用方自己判断，因为它不是"请求失败"。
 */
export function isOk(res) {
  return Boolean(res && res.body && Number(res.body.code) === 200);
}

/* ================================================================== */
/* xeapi：注册匿名账号（拿 MUSIC_A）用的那一套                           */
/* ================================================================== */
/*
 * 为什么需要它：官方 App 第一次启动会先注册一个**匿名账号**，之后所有请求都带着
 * `MUSIC_A`。Folia 在启动流程里也做这件事（register_anonimous → 写 anonymous_token，
 * 上游 request 再把它塞进每个没有 MUSIC_U 的请求）。
 *
 * 我们之前没有这一步：要扫码 key 的请求是"一台没装过 App 的裸设备"发的 —— 这正是
 * 手机端提示「当前设备环境异常」时最可疑的地方。
 *
 * 这套协议比 eapi 复杂：设备侧生成 X25519 临时密钥，和服务端公钥做 ECDH，
 * HKDF 出 AES-128-GCM 的会话密钥，再把动态密钥包成 S；请求体是 C/S/R 三个字段。
 * 全部用 node:crypto 实现，常量取自上游 util/crypto.js（都是协议常量，不是秘密）。
 */

const XEAPI_STATIC_KEY = Buffer.from(
  'ab1d5a430f6bb04a3f01e81ddd72bd916d5ce591248ac128714806d7f8fb1b84',
  'hex',
);
const XEAPI_SIGN_KEY = 'mUHCwVNWJbunMqAHf5MImuirT6plvs6VSFW62MGHstFQxhBGdEoIhLItH3djc4+FB/OKty3+lL2rGeoFBpVe5g==';
const XEAPI_X25519_SPKI = Buffer.from('302a300506032b656e032100', 'hex');
export const API_ORIGIN = 'https://interface.music.163.com';
export const XEAPI_ORIGIN = 'https://interface3.music.163.com';
const XEAPI_UA = 'NeteaseMusic/9.5.61.260802021928(9005061);Dalvik/2.1.0 (Linux; U; Android 12; HBN-AL00 Build/cd737a2.0)';

const aesEcbEncrypt = (key, buf) => {
  const c = crypto.createCipheriv(`aes-${key.length * 8}-ecb`, key, null);
  return Buffer.concat([c.update(buf), c.final()]);
};
const aesEcbDecrypt = (key, buf) => {
  const d = crypto.createDecipheriv(`aes-${key.length * 8}-ecb`, key, null);
  return Buffer.concat([d.update(buf), d.final()]);
};

/** 服务端公钥接口的签名：HMAC-SHA256(signKey, timestamp + nonce)。 */
export function xeapiSign(timestamp, nonce) {
  return crypto.createHmac('sha256', XEAPI_SIGN_KEY).update(String(timestamp) + nonce).digest('base64');
}

/** 把密文和随机数异或后再整体旋转，官方叫 mid transform。 */
function xeapiMidTransform(ciphertext) {
  const random = crypto.randomBytes(16);
  const xored = Buffer.alloc(ciphertext.length);
  for (let i = 0; i < ciphertext.length; i += 1) xored[i] = ciphertext[i] ^ random[i & 0x0f];
  const rot = xored.length ? (random[0] & 0x0f) % xored.length : 0;
  return Buffer.concat([random, xored.subarray(rot), xored.subarray(0, rot)]);
}

/** ECDH + HKDF 出会话密钥，再把动态密钥封进 S。 */
function xeapiSeal(dynamicKey, publicKeyState, os) {
  const peer = crypto.createPublicKey({
    key: Buffer.concat([XEAPI_X25519_SPKI, Buffer.from(publicKeyState.publicKey, 'base64')]),
    format: 'der',
    type: 'spki',
  });
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
  const ephemeral = Buffer.from(publicKey.export({ format: 'der', type: 'spki' })).subarray(-32);
  const shared = crypto.diffieHellman({ privateKey, publicKey: peer });
  const prk = crypto.createHmac('sha256', Buffer.alloc(32))
    .update(shared.length ? shared : Buffer.alloc(32)).digest();
  const aesKey = crypto.createHmac('sha256', prk)
    .update(Buffer.concat([ephemeral, Buffer.from([1])])).digest().subarray(0, 16);

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-128-gcm', aesKey, iv);
  const plaintext = Buffer.from(`${dynamicKey.toString('base64')}|${os}|${publicKeyState.sk || ''}`);
  const sealed = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([ephemeral, iv, sealed, cipher.getAuthTag()]);
}

function xeapiBuildPlaintext(uri, data) {
  const fields = {};
  const url = new URL(uri, API_ORIGIN);
  if (url.search) fields.queryString = url.search.slice(1);
  const bodyData = { ...data };
  delete bodyData.e_r;
  const body = new URLSearchParams(bodyData).toString();
  if (body) fields.content = body;
  fields.queryString = fields.queryString ? `${fields.queryString}&e_r=true` : 'e_r=true';
  return Buffer.from(JSON.stringify(fields));
}

/** 组装 C/S/R 三个字段。 */
export function xeapiPayload(uri, data, publicKeyState) {
  const dynamicKey = crypto.randomBytes(16);
  const c = aesEcbEncrypt(
    dynamicKey,
    xeapiMidTransform(aesEcbEncrypt(XEAPI_STATIC_KEY, xeapiBuildPlaintext(uri, data))),
  );
  const s = xeapiSeal(dynamicKey, publicKeyState, 'android');
  const r = aesEcbEncrypt(XEAPI_STATIC_KEY, Buffer.from(`${publicKeyState.version}|`));
  return { C: c.toString('base64url'), S: s.toString('base64'), R: r.toString('base64') };
}

/**
 * 拿 xeapi 的服务端公钥（普通 POST，不加密）。返回 `{ publicKey, version, sk, nextUpdateTime }`。
 * `sk` 必须原样留着：S 的明文里要带它，服务端才认得这次会话。
 */
export async function fetchXeapiPublicKey(deviceId, { timeout = 10000, currentKeyVersion = '' } = {}) {
  const nonce = Array.from({ length: 16 }, () => crypto.randomInt(10)).join('');
  const timestamp = String(Date.now());
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(`${API_ORIGIN}/api/bsr/sk/get`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'User-Agent': XEAPI_UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: deviceId ? `deviceId=${encodeURIComponent(deviceId)}` : '',
      },
      body: new URLSearchParams({
        appVersion: '9.5.61',
        currentKeyVersion,
        deviceId,
        nonce,
        os: 'android',
        requestType: 'active',
        signature: xeapiSign(timestamp, nonce),
        t1: '',
        t2: '',
        timestamp,
        uid: '',
      }).toString(),
    });
  } catch (err) {
    throw new NeteaseError(`获取 xeapi 公钥失败：${err?.message || err}`, { code: 502, network: true });
  } finally {
    clearTimeout(timer);
  }

  let json;
  try { json = await res.json(); } catch { throw new NeteaseError('xeapi 公钥接口返回的不是 JSON', { code: 502 }); }
  if (json.code !== 200 || !json.data?.encryptedData) {
    throw new NeteaseError(`xeapi 公钥接口失败（code ${json.code ?? '?'}）`, { code: json.code || 502 });
  }
  if (xeapiSign(json.data.timestamp, nonce) !== json.data.signature) {
    throw new NeteaseError('xeapi 公钥响应签名不匹配（中间人？）', { code: 502 });
  }
  let state;
  try {
    state = JSON.parse(aesEcbDecrypt(XEAPI_STATIC_KEY, Buffer.from(json.data.encryptedData, 'base64')).toString());
  } catch {
    throw new NeteaseError('xeapi 公钥解不开', { code: 502 });
  }
  if (!state?.publicKey || !state?.sk) throw new NeteaseError('xeapi 公钥不完整（缺 publicKey / sk）', { code: 502 });
  return state;
}

/**
 * 发一次 xeapi 请求。identity 必须是 **android** 画像（上游 register_anonimous 就是这么发的）。
 * 返回结构与 eapiRequest 一致，方便上层共用错误处理。
 */
export async function xeapiRequest(uri, data, identity, publicKeyState, { timeout = 12000 } = {}) {
  const c = identity.cookie || {};
  const body = new URLSearchParams(xeapiPayload(uri, data, publicKeyState)).toString();
  const url = `${XEAPI_ORIGIN}/xeapi/${uri.replace(/^\/api\//, '')}`;

  await throttle();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'User-Agent': XEAPI_UA,
        'X-Client-Enc-State': 'ENCRYPTED',
        'x-aeapi': 'true',
        'content-type': 'application/x-www-form-urlencoded;charset=utf-8',
        'x-deviceid': identity.deviceId,
        'x-os': c.os || 'android',
        'x-osver': c.osver || '16',
        'x-appver': c.appver || '9.1.65',
        'x-sdeviceid': c.sDeviceId || identity.deviceId,
        'x-buildver': identity.buildver,
        ...(c.MUSIC_U ? { 'x-music-u': c.MUSIC_U } : {}),
        Cookie: cookieToString(c),
      },
      body,
    });
  } catch (err) {
    throw new NeteaseError(`xeapi 没有响应：${err?.message || err}`, { code: 502, network: true });
  } finally {
    clearTimeout(timer);
  }

  const setCookie = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);

  const raw = Buffer.from(await res.arrayBuffer());
  let parsed;
  try {
    const plain = aesEcbDecrypt(Buffer.from(EAPI_KEY, 'utf8'), raw);
    const text = plain[0] === 0x1f && plain[1] === 0x8b ? zlib.gunzipSync(plain) : plain;
    parsed = JSON.parse(text.toString('utf8'));
  } catch {
    throw new NeteaseError(`xeapi 响应解不开（HTTP ${res.status}）`, { code: 502, status: res.status });
  }

  return { status: res.status, body: parsed, setCookie, cookie: parseSetCookie(setCookie) };
}

/* ================================================================== */
/* weapi：网页版那套（云盘列表、部分账号接口只认它）                     */
/* ================================================================== */
/*
 * 上游给 `/api/v1/cloud/get` 指定的加密方式是 weapi，不是 eapi。
 * weapi 的规矩：
 *   · 正文先 AES-128-CBC(presetKey, iv) 再 AES-128-CBC(随机 secretKey, iv)，两层 base64；
 *   · secretKey 倒序后用 **1024 位 RSA「无填充」**加密成 encSecKey（128 字节，左侧补零）；
 *   · POST 到 music.163.com/weapi/<path>，带上 csrf_token 与完整 Cookie。
 * RSA_NO_PADDING 是"教科书式" RSA（不做 PKCS#1 填充），Node 的 publicEncrypt 支持，
 * 但要求输入**恰好等于模长**，所以这里手动把 16 字节的 secretKey 左补零到 128 字节。
 */

const WEAPI_PRESET_KEY = '0CoJUm6Qyw8W8jud';
const WEAPI_IV = '0102030405060708';
const WEAPI_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0';
const WEAPI_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB
-----END PUBLIC KEY-----`;

const base62 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const aesCbcBase64 = (text, key) => {
  const cipher = crypto.createCipheriv('aes-128-cbc', Buffer.from(key, 'utf8'), Buffer.from(WEAPI_IV, 'utf8'));
  return Buffer.concat([cipher.update(Buffer.from(text, 'utf8')), cipher.final()]).toString('base64');
};

/** 生成 weapi 的 params / encSecKey（单独导出，自检能直接验形状）。 */
export function weapiPayload(data) {
  const text = JSON.stringify(data);
  let secretKey = '';
  for (let i = 0; i < 16; i += 1) secretKey += base62[crypto.randomInt(base62.length)];
  const params = aesCbcBase64(aesCbcBase64(text, WEAPI_PRESET_KEY), secretKey);
  const raw = Buffer.from(secretKey.split('').reverse().join(''), 'utf8');
  const padded = Buffer.concat([Buffer.alloc(128 - raw.length), raw]);
  const encSecKey = crypto.publicEncrypt(
    { key: WEAPI_PUBLIC_KEY, padding: crypto.constants.RSA_NO_PADDING },
    padded,
  ).toString('hex');
  return { params, encSecKey };
}

/** 发一次 weapi 请求，返回结构与 eapiRequest 一致。 */
export async function weapiRequest(uri, data = {}, identity, { timeout = 12000 } = {}) {
  const csrf = String(identity?.cookie?.__csrf || '');
  const payload = weapiPayload({ ...data, csrf_token: csrf });
  const url = `https://music.163.com/weapi/${uri.replace(/^\/api\//, '')}?csrf_token=${encodeURIComponent(csrf)}`;

  await throttle();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: 'https://music.163.com/',
        'User-Agent': WEAPI_UA,
        Cookie: cookieToString(identity?.cookie || {}),
        Accept: '*/*',
      },
      body: new URLSearchParams(payload).toString(),
    });
  } catch (err) {
    throw new NeteaseError(`weapi 没有响应：${err?.message || err}`, { code: 502, network: true });
  } finally {
    clearTimeout(timer);
  }

  const setCookie = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new NeteaseError(`weapi 返回了无法解析的内容（HTTP ${res.status}）`, { code: res.status || 502, status: res.status });
  }
  return { status: res.status, body, setCookie, cookie: parseSetCookie(setCookie) };
}
