#!/usr/bin/env node
/**
 * server.mjs — 零依赖本地服务器
 * ------------------------------------------------------------------
 * 两个职责：
 *   1) 托管静态站点（比 file:// 更接近真实部署环境，ES 模块与 fetch 都能正常工作）
 *   2) 提供内容写入 API，让「发布控制台」可以把文章 / 公告直接落盘到 data/
 *
 * 用法：
 *   node server.mjs            # http://localhost:5173
 *   node server.mjs 8080       # 指定端口
 *   PORT=8080 node server.mjs  # 环境变量方式
 *
 * API：
 *   GET    /api/health                     服务与目录状态
 *   GET    /api/tree                       项目文件树（用于控制台展示）
 *   GET    /api/content/:collection        读取集合
 *   POST   /api/content/:collection        新增 / 更新（按 id 去重，自动备份）
 *   DELETE /api/content/:collection/:id    删除
 *
 *   GET    /api/netease/search             曲目搜索（元数据）
 *   GET    /api/netease/songs              批量曲目详情
 *   GET    /api/netease/playlist           公开歌单：元数据 + 完整曲目 id 列表
 *   GET    /api/netease/resolve            展开 163cn.tv / music.163.com 短链
 *   GET    /api/netease/lyric              歌词（LRC 文本）
 *   GET    /api/netease/playable           匿名态能否播放（会员曲目判定）
 *   GET    /api/netease/audio              音频流转发（同源直放，支持 Range）
 *   GET    /api/netease/status             代理状态
 *
 *   GET    /api/pixiv/random               随机 Pixiv 作品（元数据 + 镜像图片地址）
 *   GET    /api/pixiv/illust?id=           按作品 id 给出镜像图片地址
 *   GET    /api/pixiv/status               Pixiv 代理状态
 *
 * 安全边界：只允许读写白名单集合（posts / news / gallery）；
 *          静态文件服务强制限制在项目根目录内，拒绝路径穿越。
 */

import { createServer } from 'node:http';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { promises as fs, constants } from 'node:fs';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStorage } from './storage.mjs';
import { authConfig, authenticate } from './auth.mjs';

/**
 * ⚠️ 这里**不能**用 `__filename` / `__dirname` 这两个名字。
 *
 * 部署到 Netlify 时本文件会被 esbuild 打进函数，产物是 CJS 形态 —— 而 Node 的 CJS
 * 包装函数自带 `__filename` / `__dirname` 两个形参，于是顶层的
 * `const __filename = …` 会直接变成
 *   SyntaxError: Identifier '__filename' has already been declared
 * 函数在 **加载阶段** 就崩，每个 /api/* 都回 502（线上踩过，本地因为直接跑 ESM 源码
 * 所以照不出来）。换个名字就与打包形态无关了。
 */
const THIS_FILE = fileURLToPath(import.meta.url);
const THIS_DIR = path.dirname(THIS_FILE);
const ROOT = THIS_DIR;
// 数据目录可以用 FT_DATA_DIR 覆盖：自检会把内容写到临时目录，绝不碰仓库里的 data/
const DATA_DIR = process.env.FT_DATA_DIR ? path.resolve(process.env.FT_DATA_DIR) : path.join(ROOT, 'data');
const BACKUP_DIR = path.join(DATA_DIR, '.backup');

/**
 * 内容存储：本地写文件、线上写 Netlify Blobs（详见 storage.mjs）。
 * 两个实例都惰性创建 —— 本地跑的时候完全不会去碰 @netlify/blobs。
 */
let fsStore = null;
let blobStore = null;
function storageFor(opts = {}) {
  if (opts.serverless) {
    // opts.blobDriver：本地仿真器注入的 Blobs 替身（这样"线上写 Blobs"这条路径本地也能真跑）
    if (!blobStore) blobStore = createStorage({ root: ROOT, dataDir: DATA_DIR, serverless: true, driver: opts.blobDriver || null });
    return blobStore;
  }
  if (!fsStore) fsStore = createStorage({ root: ROOT, dataDir: DATA_DIR, serverless: false });
  return fsStore;
}

/** 请求是否来自本机（本地发布控制台的"免登录写入"只对本机开放） */
function isLoopback(req) {
  const ip = String(req.socket?.remoteAddress || '');
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

const PORT = Number(process.argv[2] || process.env.PORT || 5173);

/**
 * 是否「直接启动」（node server.mjs）。
 *
 * 被 import 时**绝不** listen —— 部署到 Netlify 时，
 * netlify/functions/api.mjs 会 import 本文件、复用同一份 /api 实现
 * （见文件末尾的 handleApiRequest），那份代码里不存在 HTTP 服务器。
 * 这样本地与线上只有一份代理逻辑，不会各修各的。
 */
const IS_MAIN = (() => {
  // Serverless 运行时装在 Lambda 里：永远不要试图监听端口
  if (process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY) return false;
  const entry = process.argv[1];
  if (!entry) return false;
  try { return path.resolve(entry) === THIS_FILE; } catch { return false; }
})();

/** 允许通过 API 读写的集合 → 对应文件 */
const COLLECTIONS = {
  posts: path.join(DATA_DIR, 'posts.json'),
  news: path.join(DATA_DIR, 'news.json'),
  gallery: path.join(DATA_DIR, 'gallery.json'),
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  // 主屏图标安装要用它；缺了这一条会按 octet-stream 发出去，浏览器会拒绝解析
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/* ---------------- 工具 ---------------- */

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`\x1b[90m[${now()}]\x1b[0m`, ...a);
const ok = (res, data, status = 200) => sendJSON(res, data, status);
const fail = (res, status, message) => sendJSON(res, { ok: false, error: message }, status);

function sendJSON(res, data, status = 200) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function readBody(req, limit = 4 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('请求体过大（上限 4MB）');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { throw new Error('请求体不是合法 JSON'); }
}

/* ---------------- 网易云音乐代理 ----------------
 * 为什么必须走服务端：
 *   music.163.com 的接口不返回 Access-Control-Allow-Origin，
 *   浏览器从本站发起的跨域请求会被同源策略直接拦掉。由 Node 转发即可解决。
 * 说明：
 *   · 转发「元数据」（搜索 / 曲目详情 / 封面 / 歌词）与「匿名可用的音频流」。
 *   · 音频转发只做同源透传，让站内 <audio> 拿到真实的 duration / ended，从而能在
 *     后台与移动端息屏时可靠地自动切歌（见 /api/netease/audio 的说明）。
 *   · 会员 / 版权受限曲目没有匿名音频流，前端自动退回官方外链播放器。
 *   · 带 5 分钟内存缓存 + 频率限制，避免被对方限流。
 */

const NETEASE = {
  origin: 'https://music.163.com',
  ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  ttl: 5 * 60 * 1000,
  minInterval: 350,           // 同一进程内的最小请求间隔（毫秒）
  cache: new Map(),
  lastCall: 0,
  // 「这首歌放不放得出来」的结论缓存：比元数据稳定得多，缓存久一点（30 分钟）
  availTtl: 30 * 60 * 1000,
  avail: new Map(),
};

async function neteaseFetch(pathname, { cacheKey, method = 'GET', form = null } = {}) {
  const key = cacheKey || pathname;
  const hit = NETEASE.cache.get(key);
  if (hit && Date.now() - hit.at < NETEASE.ttl) return { data: hit.data, cached: true };

  // 简单节流：把并发压成串行，避免触发风控
  const wait = Math.max(0, NETEASE.minInterval - (Date.now() - NETEASE.lastCall));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  NETEASE.lastCall = Date.now();

  const url = `${NETEASE.origin}${pathname}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, {
      method,
      signal: ctrl.signal,
      headers: {
        'User-Agent': NETEASE.ua,
        Referer: `${NETEASE.origin}/`,
        Accept: 'application/json, text/plain, */*',
        ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      ...(form ? { body: form } : {}),
    });
    if (!res.ok) throw new Error(`网易云返回 HTTP ${res.status}`);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('网易云返回的不是 JSON（可能被风控）'); }
    if (data.code && data.code !== 200) throw new Error(`网易云错误码 ${data.code}`);
    NETEASE.cache.set(key, { at: Date.now(), data });
    if (NETEASE.cache.size > 200) {
      // 简单淘汰：清掉最早的一批
      [...NETEASE.cache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 60)
        .forEach(([k]) => NETEASE.cache.delete(k));
    }
    return { data, cached: false };
  } finally {
    clearTimeout(timer);
  }
}

/* ---- 短链展开（163cn.tv 分享链） ----
 * 网易云 App 分享出来的是 https://163cn.tv/xxxx 这种短链，
 * 它 302 到 music.163.com/m/playlist?... 再 302 到 music.163.com/playlist?id=...
 * 浏览器侧读不到跨域跳转的最终地址（拿不到 Location，CORS 也不允许），
 * 所以这一步必须在服务端做。
 *
 * 安全：这是「服务端替你请求一个 URL」，必须防 SSRF ——
 * 只允许网易云自己的域名，且跳转目标也要逐个校验。
 */
const NETEASE_LINK_HOSTS = [/(^|\.)163cn\.tv$/i, /(^|\.)163\.com$/i];

function neteaseLinkAllowed(rawUrl) {
  try {
    const u = new URL(String(rawUrl));
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return NETEASE_LINK_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

/** 跟随 302 直到拿到最终地址（最多 6 跳，且每一跳都必须在网易云域名内） */
async function resolveNeteaseLink(rawUrl) {
  let url = String(rawUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  if (!neteaseLinkAllowed(url)) throw new Error('只接受网易云域名（music.163.com / 163cn.tv）');

  const chain = [];
  for (let i = 0; i < 6; i++) {
    chain.push(url);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    let res;
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: ctrl.signal,
        headers: { 'User-Agent': NETEASE.ua, Referer: `${NETEASE.origin}/`, Accept: 'text/html,*/*' },
      });
    } finally {
      clearTimeout(timer);
    }
    // 不读正文，但要把连接放掉，避免句柄堆积
    try { await res.body?.cancel(); } catch { /* noop */ }

    const loc = res.headers.get('location');
    if (!loc) return { finalUrl: url, hops: chain.length - 1, chain };
    const next = new URL(loc, url).href;
    if (!neteaseLinkAllowed(next)) throw new Error('短链跳转到了非网易云域名，已中断');
    url = next;
  }
  throw new Error('短链跳转次数过多，已中断');
}

/** 把网易云的 song 对象压成前端要用的最小结构
 *  注意字段名有两套：
 *    · /api/search 与 /api/song/detail 用 artists / album / duration(ms)
 *    · /api/v6/playlist/detail 的 tracks 用 ar / al / dt(ms)
 *  两套都要认，否则导入歌单会拿到一堆没歌手没封面的空壳。 */
function shapeSong(s) {
  const artists = s.artists || s.ar || [];
  const album = s.album || s.al || {};
  return {
    id: String(s.id),
    name: s.name,
    artists: artists.map((a) => a?.name).filter(Boolean),
    album: album.name || '',
    cover: album.picUrl || artists?.[0]?.picUrl || '',
    duration: Math.round((s.duration || s.dt || 0) / 1000),
    fee: s.fee ?? 0,
  };
}

/* ---- 「这首歌官方外链放不放得出来」 ----
 * 背景：官方外链播放器（/outchain/player）对 VIP / 付费专辑曲目**不出声**。
 * 服务端没有登录态，所以不能替用户解锁，但可以**明确判定**：
 *   GET /song/media/outer/url?id=<id>.mp3  不跟随跳转
 *     · 302 → /404        → 放不出来（会员曲目 / 已下架）
 *     · 302 → 音频路径     → 能放
 * 这个探测拿到的是「匿名态能不能放」，比只看 fee 准（fee=8 低音质免费也能放）。
 * 结论缓存 30 分钟，避免反复打扰对方。
 */
async function neteasePlayable(id) {
  const key = String(id);
  const hit = NETEASE.avail.get(key);
  if (hit && Date.now() - hit.at < NETEASE.availTtl) return hit.value;

  let value = null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`${NETEASE.origin}/song/media/outer/url?id=${encodeURIComponent(key)}.mp3`, {
      signal: ctrl.signal,
      redirect: 'manual',
      headers: { 'User-Agent': NETEASE.ua, Referer: `${NETEASE.origin}/` },
    });
    const loc = r.headers.get('location') || '';
    if (r.status >= 300 && r.status < 400) value = !/\/404(\?|$)/.test(loc) && loc.length > 0;
    else if (r.status === 200) value = true;      // 直接返回音频流
    else value = false;
  } catch {
    value = null;                                  // 探测失败：不下结论，前端按 fee 猜
  } finally {
    clearTimeout(timer);
  }

  NETEASE.avail.set(key, { at: Date.now(), value });
  if (NETEASE.avail.size > 500) {
    [...NETEASE.avail.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 200)
      .forEach(([k]) => NETEASE.avail.delete(k));
  }
  return value;
}

/** 有限并发地批量探测 */
async function neteasePlayableMany(ids, concurrency = 4) {
  const out = {};
  const queue = [...ids];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const id = queue.shift();
      out[id] = await neteasePlayable(id);
    }
  });
  await Promise.all(workers);
  return out;
}

/* ---- 「这条外链到底有多少秒」 ----
 * 为什么需要：官方 iframe 不给播放结束回调，站内只能按时长估算来切下一首。
 * 而**元数据时长 ≠ 音频时长**：试听片段（几十秒）会配上完整曲目的 4 分钟元数据，
 * 于是估算要么提前掐断、要么干等好几分钟。这里直接从音频本身量一把：
 *
 *   HEAD 外链  → content-length
 *   Range 取头 8KB → 找 MPEG 帧同步字 → 读码率；有 Xing/Info 头就读精确帧数
 *   CBR: 秒数 = (字节数 × 8) / 码率        VBR: 秒数 = 帧数 × 每帧采样 / 采样率
 *
 * 我们请求的就是 `.mp3`（见上面的外链），所以只要认 MPEG Layer III 这一种就够。
 * 测不出来就返回 null，调用方退回元数据时长（不猜得比原来更糟）。
 */
const MPEG_BITRATES = {
  // [version][layer] → 码率表（kbps），索引 0 表示"自由格式"
  1: { 1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448], 2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384], 3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] },
  2: { 1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256], 2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160], 3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] },
};
const MPEG_RATES = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 25: [11025, 12000, 8000] };

/** 在缓冲区里找第一个 MPEG 帧头，返回 { offset, bitrate, sampleRate, samplesPerFrame, channels, version } */
function findMpegFrame(buf) {
  for (let i = 0; i + 4 < buf.length; i++) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) continue;
    const b1 = buf[i + 1];
    const b2 = buf[i + 2];
    const verBits = (b1 >> 3) & 0x03;          // 3=MPEG1 2=MPEG2 0=MPEG2.5
    const layerBits = (b1 >> 1) & 0x03;        // 1=Layer III
    const brIndex = (b2 >> 4) & 0x0f;
    const srIndex = (b2 >> 2) & 0x03;
    if (verBits === 1 || layerBits === 0 || brIndex === 0 || brIndex === 15 || srIndex === 3) continue;
    const version = verBits === 3 ? 1 : (verBits === 2 ? 2 : 25);
    const layer = 4 - layerBits;               // 3 → Layer III
    const table = MPEG_BITRATES[version === 1 ? 1 : 2]?.[layer];
    const bitrate = table?.[brIndex] ? table[brIndex] * 1000 : 0;
    const sampleRate = MPEG_RATES[version]?.[srIndex] || 0;
    if (!bitrate || !sampleRate) continue;
    const channels = ((b2 >> 6) & 0x03) === 3 ? 1 : 2;
    return {
      offset: i,
      bitrate,
      sampleRate,
      channels,
      version,
      samplesPerFrame: version === 1 ? 1152 : 576,
    };
  }
  return null;
}

/** 读 Xing/Info 头里的帧数（可变码率时用它算精确时长） */
function readXingFrames(buf, frame) {
  const { offset, version, channels } = frame;
  // 侧信息长度：MPEG1 单声道 17 / 立体声 32；MPEG2/2.5 单声道 9 / 立体声 17
  const sideInfo = version === 1 ? (channels === 1 ? 17 : 32) : (channels === 1 ? 9 : 17);
  const at = offset + 4 + sideInfo;
  if (at + 12 > buf.length) return null;
  const tag = String.fromCharCode(buf[at], buf[at + 1], buf[at + 2], buf[at + 3]);
  if (tag !== 'Xing' && tag !== 'Info') return null;
  const flags = (buf[at + 4] << 24) | (buf[at + 5] << 16) | (buf[at + 6] << 8) | buf[at + 7];
  if (!(flags & 0x01)) return null;                       // 没有帧数字段
  const frames = (buf[at + 8] << 24) | (buf[at + 9] << 16) | (buf[at + 10] << 8) | buf[at + 11];
  return frames > 0 ? frames : null;
}

async function neteaseAudioInfo(id) {
  const key = `info:${id}`;
  const hit = NETEASE.avail.get(key);
  if (hit && Date.now() - hit.at < NETEASE.availTtl) return hit.value;

  let value = null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  const headers = { 'User-Agent': NETEASE.ua, Referer: `${NETEASE.origin}/` };
  try {
    // ① 用**同一个**多入口解析器拿地址：判定和实际播放必须走同一条路，
    //    否则会出现「这里说能播、点下去 404」或者反过来的错判。
    const info = await resolveNeteaseAudio(id);
    if (!info) {
      value = { playable: false };
    } else {
      const audioUrl = info.url;
      // ② HEAD 拿长度
      const head = await fetch(audioUrl, { signal: ctrl.signal, headers });
      const bytes = Number(head.headers.get('content-length')) || info.bytes || 0;
      // ③ 取头部 8KB 解析帧
      const part = await fetch(audioUrl, { signal: ctrl.signal, headers: { ...headers, Range: 'bytes=0-8191' } });
      const buf = new Uint8Array(await part.arrayBuffer());
      const frame = findMpegFrame(buf);
      let seconds = 0;
      let mode = 'unknown';
      if (frame) {
        const frames = readXingFrames(buf, frame);
        if (frames) {
          seconds = (frames * frame.samplesPerFrame) / frame.sampleRate;
          mode = 'vbr';
        } else if (bytes) {
          seconds = (bytes * 8) / frame.bitrate;
          mode = 'cbr';
        }
      }
      value = {
        playable: true,
        bytes,
        bitrate: frame?.bitrate || info.bitrate || 0,
        seconds: seconds ? Math.round(seconds * 10) / 10 : 0,
        mode,
        // 诊断 / 展示用：哪个入口解析出来的、上游标称码率、是否只是试听片段
        via: info.via,
        upstreamBitrate: info.bitrate || 0,
        trial: !!info.trial,
      };
    }
  } catch {
    value = null;
  } finally {
    clearTimeout(timer);
  }

  NETEASE.avail.set(key, { at: Date.now(), value });
  return value;
}

/* ---- 音频流转发：让站内 <audio> 直接播网易云曲目 ----
 * 为什么需要这个接口：
 *   官方外链播放器是跨域 iframe —— 站内既拿不到播放进度，也拿不到 ended 回调，
 *   只能"按时长估算"切下一首。估算在后台标签页里必然不可靠（定时器被节流、
 *   用来计时的静音媒体会被挂起），而且时长猜错就会掐掉结尾或者干等。
 *   把音频流经本站**同源**转发之后，<audio> 拿到的是真实的 duration / currentTime /
 *   ended：切歌由媒体管线驱动，后台、最小化、移动端息屏都不受影响；
 *   顺带还能拖动进度、显示真频谱（同源才建得起 Web Audio 图）。
 *
 * 版权边界：只转发网易云**已经公开给匿名访客**的外链音频。
 *   会员曲目 / 版权受限曲目拿不到流（外链 302 到 /404）→ 返回 404，
 *   前端会自动退回官方外链播放器，行为与以前一致，不做任何越权解锁。
 *
 * Range：拖动进度条必需，原样转发给上游并透传 206 / Content-Range。
 */
/** 解析真实音频地址：多入口依次尝试。放不出来返回 null（并缓存结论） */
const AUDIO_TTL = 15 * 60 * 1000;
const audioUrlCache = new Map();          // id → { at, info }
/** 允许跟随的音频主机（必须是网易云的 CDN，防 SSRF） */
const NETEASE_AUDIO_HOSTS = [/(^|\.)music\.126\.net$/i, /(^|\.)126\.net$/i, /(^|\.)163\.com$/i];

function audioHostAllowed(raw) {
  try {
    const u = new URL(String(raw));
    return (u.protocol === 'http:' || u.protocol === 'https:')
      && NETEASE_AUDIO_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

/** 把上游给的音频地址规范化：必须在网易云 CDN 白名单内，且统一升级成 https */
function httpsAudioUrl(raw) {
  if (!raw) return null;
  try {
    const u = new URL(String(raw), NETEASE.origin);
    if (!audioHostAllowed(u.href)) return null;
    // 外链/CDN 经常给 http://m801.music.126.net/...，而本站是 https 部署，
    // 混用会被浏览器当混合内容拦掉（移动端更严）。CDN 同时支持 https，统一升级。
    u.protocol = 'https:';
    return u.href;
  } catch { return null; }
}

/** 带独立超时的 GET，成功返回 Response，失败返回 null（每个入口互不拖累） */
async function fetchWithTimeout(url, { ms = 9000, ...init } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 解析某首歌「匿名访客能听到」的音频地址。
 *
 * 两个入口，顺序有讲究（线上实测，别再简化）：
 *   ① /song/media/outer/url?id=X.mp3 —— 官方「外链播放」地址，是这个站一直用的**正统匿名路径**；
 *      付费/版权受限曲目它会 302 到 /404（这时才说明"匿名没有"）。
 *   ② /api/song/enhance/player/url?ids=[X]&br=128000 —— 官方 Web 播放器用的接口，作为兜底。
 *
 * ⚠️ 关于 ② 的**版权边界**（实测数据，改代码前先看这里）：
 *   · 请求 320000 时，它对手上这些 `fee=8`（低音质免费、高音质付费）的曲目会直接给出
 *     `level=exhigh` 的 320kbps 地址 —— 那是**付费档**，本站不该拿；所以这里**只请求
 *     128000（标准/免费档）**，绝不主动索取更高音质。
 *   · 对真正的 VIP 曲目（`fee=1`，实测 Taylor Swift《Love Story》《Cruel Summer》、
 *     陈奕迅《富士山下》原版）它返回 `code=-110`、没有地址 —— 也就是说这个门槛由**网易云
 *     自己**把关，我们只是问一句"匿名能听免费档吗"，不做任何越权解锁。
 *   · 结论：能拿到就是匿名免费档本就可用；拿不到就如实回 404，前端退回官方播放器。
 *
 * 为什么值得加这个兜底：只走 ① 时，一批 fee=8 的曲目会被误判成"完全没有匿名音频"，
 * 于是退回官方 iframe —— PC 上 iframe 能自动起播所以听着正常，移动端被自动播放策略
 * 拦住就**静默无声**，表现正是「同一首歌 PC 有声音、手机没声音」。
 *
 * 返回 { url, via, bitrate, bytes, type, trial, tried } 或 null。
 */
async function resolveNeteaseAudio(id) {
  const key = String(id);
  const hit = audioUrlCache.get(key);
  if (hit && Date.now() - hit.at < AUDIO_TTL) return hit.info;

  const headers = { 'User-Agent': NETEASE.ua, Referer: `${NETEASE.origin}/` };
  const tried = [];
  let info = null;

  // ① 官方外链（正统匿名路径）
  const outer = `${NETEASE.origin}/song/media/outer/url?id=${encodeURIComponent(key)}.mp3`;
  const r = await fetchWithTimeout(outer, { headers, redirect: 'manual', ms: 9000 });
  if (!r) {
    tried.push('outer:超时');
  } else {
    const loc = r.headers.get('location') || '';
    try { await r.body?.cancel(); } catch { /* 不读正文 */ }
    if (r.status >= 300 && r.status < 400 && !/\/404(\?|$)/.test(loc)) {
      const url = httpsAudioUrl(loc);
      if (url) info = { url, via: 'outer', bitrate: 0, bytes: 0, type: 'mp3', trial: false };
    } else if (r.status === 200) {
      info = { url: outer, via: 'outer-direct', bitrate: 0, bytes: 0, type: 'mp3', trial: false };
    }
    tried.push(`outer:${info ? 'ok' : 'no'}`);
  }

  // ② 兜底：只问标准音质（免费档），拿不到就算了，绝不要更高音质
  if (!info) {
    const e = await fetchWithTimeout(
      `${NETEASE.origin}/api/song/enhance/player/url?ids=%5B${encodeURIComponent(key)}%5D&br=128000`,
      { headers, ms: 9000 },
    );
    if (!e) {
      tried.push('enhance@128000:超时');
    } else {
      const j = await e.json().catch(() => null);
      const d = j?.data?.[0];
      const url = httpsAudioUrl(d?.url);
      tried.push(`enhance@128000:${url ? 'ok' : (d?.code ? 'code' + d.code : 'no-url')}`);
      if (url) {
        info = {
          url,
          via: `enhance@${Number(d?.br) || 128000}`,
          bitrate: Number(d?.br) || 128000,
          bytes: Number(d?.size) || 0,
          type: d?.type || 'mp3',
          trial: !!d?.freeTrialInfo,
        };
      }
    }
  }

  if (info) info.tried = tried;
  audioUrlCache.set(key, { at: Date.now(), info, tried });
  if (audioUrlCache.size > 300) {
    [...audioUrlCache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 120)
      .forEach(([k]) => audioUrlCache.delete(k));
  }
  return info;
}

/** GET /api/netease/audio?id=<id> —— 同源音频流（支持 Range，可拖动进度） */
async function streamNeteaseAudio(req, res, url, opts = {}) {
  const id = (url.searchParams.get('id') || '').trim();
  if (!/^\d{4,12}$/.test(id)) return fail(res, 400, '缺少合法的歌曲 id');

  const info = await resolveNeteaseAudio(id);
  if (!info) {
    // 把两个入口各自的结果带上：线上排查时一眼看出是"上游拒绝"还是"我们超时"
    const tried = audioUrlCache.get(String(id))?.tried;
    const detail = tried?.length ? `（${tried.join('、')}）` : '';
    return fail(res, 404, `这首歌没有匿名可用的音频流（会员 / 版权限制），请改用官方外链播放器${detail}`);
  }
  const audioUrl = info.url;

  /* Serverless（Netlify Functions）上不要在函数里搬音频：
   *   ① 同步函数响应有体积上限，一首 5 分钟的歌可能十几 MB，硬转发会被平台截断/报错；
   *   ② 白搬一遍带宽纯属浪费。
   * 所以这里只做一次 302，把浏览器直接指向上游 CDN（媒体元素会自动跟随重定向），
   * Range / 断点续传 / 拖动进度全部由 CDN 原生支持。
   * 本地 server.mjs 仍然照旧代理，保持同源（频谱、离线调试都不受影响）。 */
  if (opts.serverless) {
    res.writeHead(302, {
      Location: audioUrl,
      // 解析结果有 15 分钟缓存，这里给一个短缓存，别让浏览器把它记死
      'Cache-Control': 'private, max-age=300',
      // 诊断：这次是哪个入口解析出来的、什么码率、是否只是试听片段
      'X-Netease-Audio-Via': info.via || '',
      'X-Netease-Audio-Bitrate': String(info.bitrate || ''),
      'X-Netease-Audio-Trial': info.trial ? '1' : '0',
    });
    return res.end();
  }

  const ctrl = new AbortController();
  // 客户端提前断开（换歌 / 拖进度 / 关页面）→ 立刻放掉上游连接，不白下载
  res.on('close', () => { if (!res.writableEnded) ctrl.abort(); });

  const range = req.headers.range;
  let upstream;
  try {
    upstream = await fetch(audioUrl, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': NETEASE.ua,
        Referer: `${NETEASE.origin}/`,
        ...(range ? { Range: range } : {}),
      },
    });
  } catch (err) {
    if (ctrl.signal.aborted) return;                 // 客户端先走了，没什么可回的
    return fail(res, 502, `拉取音频流失败：${err.message}`);
  }

  if (!upstream.ok && upstream.status !== 206) {
    try { await upstream.body?.cancel(); } catch { /* noop */ }
    const status = upstream.status === 416 ? 416 : 404;
    return fail(res, status, `音频源返回 HTTP ${upstream.status}`);
  }

  const headers = {
    'Content-Type': upstream.headers.get('content-type') || 'audio/mpeg',
    'Accept-Ranges': 'bytes',
    // 允许浏览器缓存：预加载下一首时就是靠它把音频先拿进缓存，切歌才不会空一拍。
    // 必须是 private —— 这是转发流，不该被任何共享缓存留存。
    'Cache-Control': 'private, max-age=86400',
    // 与 serverless 的 302 分支保持同一套诊断头：本地也能看出是哪个入口解析的
    'X-Netease-Audio-Via': info.via || '',
    'X-Netease-Audio-Bitrate': String(info.bitrate || ''),
    'X-Netease-Audio-Trial': info.trial ? '1' : '0',
  };
  const len = upstream.headers.get('content-length');
  if (len) headers['Content-Length'] = len;
  const cr = upstream.headers.get('content-range');
  if (cr) headers['Content-Range'] = cr;

  const status = upstream.status === 206 ? 206 : 200;
  res.writeHead(status, headers);

  if (req.method === 'HEAD') {
    try { await upstream.body?.cancel(); } catch { /* noop */ }
    return res.end();
  }

  try {
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch {
    // 客户端中途断开（换歌、拖动进度、关页面）是常态，不是错误
  }
}

/**
 * 搜索上游候选 —— 为什么要试这么多个：
 *
 * 实测（同一份代码、同一组参数）：
 *   · 本机（国内 IP）：/api/search/get/web 返回 301 条；
 *   · Netlify Functions（AWS 机房，境外 IP）：**稳定返回 0 条** ——
 *     HTTP 200、code 200、songCount 0、songs []，不报错，就是空。
 *   而详情接口 /api/song/detail 在两边都正常，说明不是整体被墙，而是搜索入口被区别对待。
 *
 * 所以搜索改成「按顺序试，谁先给出结果就用谁」，并把尝试过程回显（仅在全空时），
 * 这样以后哪个入口失效，线上一个请求就能看出来，不用猜。
 */
const NETEASE_SEARCH_CANDIDATES = [
  {
    id: 'search/get/web·GET',
    method: 'GET',
    path: (q, limit, offset) => `/api/search/get/web?csrf_token=&s=${encodeURIComponent(q)}&type=1&offset=${offset}&limit=${limit}`,
  },
  {
    id: 'search/get/web·POST',
    method: 'POST',
    path: () => '/api/search/get/web',
    form: (q, limit, offset) => `s=${encodeURIComponent(q)}&type=1&offset=${offset}&limit=${limit}&csrf_token=`,
  },
  {
    id: 'cloudsearch/pc·POST',
    method: 'POST',
    path: () => '/api/cloudsearch/pc',
    form: (q, limit, offset) => `s=${encodeURIComponent(q)}&type=1&offset=${offset}&limit=${limit}&total=true`,
  },
  {
    id: 'search/complex/get·GET',
    method: 'GET',
    path: (q, limit, offset) => `/api/search/complex/get?csrf_token=&s=${encodeURIComponent(q)}&type=1&offset=${offset}&limit=${limit}`,
  },
  {
    id: 'search/suggest/web·GET',
    method: 'GET',
    path: (q, limit) => `/api/search/suggest/web?csrf_token=&s=${encodeURIComponent(q)}&limit=${limit}`,
  },
];

/** 挨个试搜索入口，返回第一个有结果的；全空时把尝试过程一并带回去 */
async function neteaseSearch(q, limit, offset) {
  const tried = [];
  for (const c of NETEASE_SEARCH_CANDIDATES) {
    const pathname = c.path(q, limit, offset);
    const form = c.form ? c.form(q, limit, offset) : null;
    try {
      const { data, cached } = await neteaseFetch(pathname, {
        // 每个入口单独缓存：否则一个入口的空结果会污染另一个
        cacheKey: `${c.id}|${pathname}|${form || ''}`,
        method: c.method,
        form,
      });
      const songs = (data?.result?.songs || []).map(shapeSong);
      const total = data?.result?.songCount ?? songs.length;
      tried.push({ via: c.id, songs: songs.length, total });
      if (songs.length) return { songs, total, cached, via: c.id, tried };
    } catch (err) {
      tried.push({ via: c.id, error: String(err?.message || err).slice(0, 120) });
    }
  }
  return { songs: [], total: 0, cached: false, via: null, tried };
}

async function handleNetease(req, res, url, opts = {}) {
  const seg = url.pathname.replace(/^\/api\/netease\/?/, '').split('/').filter(Boolean);
  const action = seg[0] || 'search';

  if (action === 'search') {
    const q = (url.searchParams.get('q') || '').trim();
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));
    const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
    if (!q) return fail(res, 400, '缺少搜索关键词 q');
    if (q.length > 80) return fail(res, 400, '关键词过长');
    const r = await neteaseSearch(q, limit, offset);
    return ok(res, {
      ok: true,
      cached: r.cached,
      query: q,
      total: r.total,
      songs: r.songs,
      // 用的是哪个入口（排查时有用）
      via: r.via,
      // 全部入口都拿不到结果时，把尝试过程回显出来 —— 客户端的解析不受影响
      ...(r.songs.length ? {} : { upstreamTried: r.tried }),
    });
  }

  if (action === 'songs') {
    // /api/netease/songs?id=1&id=2 或 ?ids=1,2,3
    const list = [
      ...url.searchParams.getAll('id'),
      ...(url.searchParams.get('ids') || '').split(','),
    ].map((s) => s.trim()).filter((s) => /^\d+$/.test(s)).slice(0, 50);
    if (!list.length) return fail(res, 400, '缺少合法的歌曲 id');
    const path = `/api/song/detail?ids=${encodeURIComponent(JSON.stringify(list.map(Number)))}`;
    const { data, cached } = await neteaseFetch(path);
    return ok(res, { ok: true, cached, songs: (data?.songs || []).map(shapeSong) });
  }

  if (action === 'playlist') {
    // /api/netease/playlist?id=3778678&limit=300
    // 只读公开歌单的元数据 + 曲目 id 列表；不涉及音频流，也不需要登录。
    const id = (url.searchParams.get('id') || '').trim();
    if (!/^\d+$/.test(id)) return fail(res, 400, '缺少合法的歌单 id');
    const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit')) || 300));

    let payload;
    try {
      // n / s 参数决定 trackIds 返回多少条：v6 接口的 tracks 只给前若干首，
      // 完整曲目顺序要看 trackIds（见 README 的说明）
      payload = await neteaseFetch(`/api/v6/playlist/detail?id=${id}&n=${limit}&s=8`);
    } catch (err) {
      return fail(res, 404, `读取歌单失败：${err.message}（私密歌单 /「我喜欢的音乐」需要登录，本项目不实现登录）`);
    }

    const pl = payload.data?.playlist;
    if (!pl) return fail(res, 404, '歌单不存在或不可访问（私密歌单需要登录，本项目不实现登录）');

    const trackIds = (pl.trackIds || [])
      .map((t) => String(t.id))
      .filter((s) => /^\d+$/.test(s))
      .slice(0, limit);

    return ok(res, {
      ok: true,
      cached: payload.cached,
      playlist: {
        id: String(pl.id ?? id),
        name: pl.name || '未命名歌单',
        cover: pl.coverImgUrl || '',
        creator: pl.creator?.nickname || '',
        description: String(pl.description || '').slice(0, 300),
        trackCount: Number(pl.trackCount) || trackIds.length,
        trackIds,
        // tracks 可能只有前几首（大歌单），前端会用 trackIds 补齐
        tracks: (pl.tracks || []).map(shapeSong),
      },
    });
  }

  if (action === 'album') {
    // /api/netease/album?id=90004244&limit=200
    // 专辑分享链（含 163cn.tv 短链）会跳成 /m/album?id=…，前端解析出 id 之后来这里取曲目。
    // 注意用的是 v1 接口：老的 /api/album/<id> 现在常常回 -462（要求绑定手机的风控页），
    // v1 端点在匿名态可以直接拿到专辑信息与完整曲目表。
    const id = (url.searchParams.get('id') || '').trim();
    if (!/^\d+$/.test(id)) return fail(res, 400, '缺少合法的专辑 id');
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 200));

    let payload;
    try {
      payload = await neteaseFetch(`/api/v1/album/${id}?ext=true&offset=0&total=true&limit=${limit}`);
    } catch (err) {
      return fail(res, 404, `读取专辑失败：${err.message}`);
    }

    const al = payload.data?.album;
    if (!al) return fail(res, 404, '专辑不存在或不可访问');

    const songs = (payload.data.songs || []).slice(0, limit).map(shapeSong);
    return ok(res, {
      ok: true,
      cached: payload.cached,
      album: {
        id: String(al.id ?? id),
        name: al.name || '未命名专辑',
        cover: al.picUrl || '',
        artist: al.artist?.name || (al.artists || []).map((a) => a?.name).filter(Boolean).join(' / ') || '',
        description: String(al.description || '').slice(0, 300),
        publishTime: Number(al.publishTime) || 0,
        size: Number(al.size) || songs.length,
      },
      tracks: songs,
    });
  }

  if (action === 'resolve') {
    // /api/netease/resolve?url=https%3A%2F%2F163cn.tv%2Fxxxx
    const raw = (url.searchParams.get('url') || '').trim();
    if (!raw) return fail(res, 400, '缺少 url');
    if (raw.length > 300) return fail(res, 400, 'url 过长');
    try {
      const out = await resolveNeteaseLink(raw);
      return ok(res, { ok: true, ...out });
    } catch (err) {
      return fail(res, 400, `展开短链失败：${err.message}`);
    }
  }

  if (action === 'lyric') {
    // /api/netease/lyric?id=1431292823 —— 只取歌词文本，不涉及音频流
    const id = (url.searchParams.get('id') || '').trim();
    if (!/^\d{4,12}$/.test(id)) return fail(res, 400, '缺少合法的曲目 id');
    const { data, cached } = await neteaseFetch(`/api/song/lyric?id=${id}&lv=-1&kv=-1&tv=-1`);
    const lrc = String(data?.lrc?.lyric || '');
    return ok(res, {
      ok: true,
      cached,
      id,
      lrc,
      tlyric: String(data?.tlyric?.lyric || ''),
      // 纯音乐 / 无人声时网易云会回一段很短或空的占位
      nolyric: !!data?.nolyric || lrc.replace(/\[[^\]]*\]/g, '').trim().length < 2,
    });
  }

  if (action === 'playable') {
    // /api/netease/playable?id=643982&id=347230 或 ?ids=1,2
    // 返回 { id: true|false|null }：true 能放、false 匿名态放不出来（会员曲目/已下架）、null 没测出来
    // ?detail=1 时返回对象：{ playable, seconds, bytes, bitrate, mode }
    //   seconds 是**从音频本身量出来的真实秒数**（元数据时长可能是完整曲目，而音频只是试听片段）
    const list = [
      ...url.searchParams.getAll('id'),
      ...(url.searchParams.get('ids') || '').split(','),
    ].map((s) => s.trim()).filter((s) => /^\d{4,12}$/.test(s)).slice(0, 12);
    if (!list.length) return fail(res, 400, '缺少合法的曲目 id');

    if (url.searchParams.get('detail')) {
      const results = {};
      for (const id of [...new Set(list)]) results[id] = await neteaseAudioInfo(id);
      return ok(res, {
        ok: true,
        results,
        note: 'seconds 由音频本身量出（CBR 按码率、VBR 按 Xing 帧数）；测不出为 null。',
      });
    }

    const results = await neteasePlayableMany([...new Set(list)]);
    const known = Object.values(results).filter((v) => v !== null).length;
    return ok(res, {
      ok: true,
      results,
      checked: list.length,
      known,
      note: '匿名态判定：false 表示未登录网易云会员时官方外链播放器不会出声（登录会员后浏览器里仍可能正常播放）。',
    });
  }

  if (action === 'audio') {
    // /api/netease/audio?id=347230 —— 音频流转发（本地同源直放 / Serverless 下 302 到 CDN）
    return streamNeteaseAudio(req, res, url, opts);
  }

  if (action === 'status') {
    return ok(res, {
      ok: true,
      origin: NETEASE.origin,
      cachedEntries: NETEASE.cache.size,
      availEntries: NETEASE.avail.size,
      audioEntries: audioUrlCache.size,
      note: '代理元数据与音频流（同源直放）；官方外链播放器仍作为会员曲目的回退方案。',
    });
  }

  return fail(res, 404, `未知网易云接口：${action}（可用：search / songs / playlist / lyric / resolve / playable / audio / status）`);
}

/* ---------------- Pixiv 随机插画代理 ----------------
 * 为什么需要服务端：
 *   · pixiv.net / i.pximg.net 在本机网络下被 DNS 污染（解析到 FaceBook / 已知投毒 IP），
 *     直连必然超时，浏览器端更没戏；i.pximg.net 还有防盗链（Referer 不对直接 403）。
 *   · 第三方随机接口 api.lolicon.app 不返回 Access-Control-Allow-Origin，
 *     浏览器直连会被同源策略拦掉。
 * 做法：
 *   1. Node 去取「随机作品 + 图片地址」（抽卡池，保证不重复）
 *   2. 图片**走本站自己的图片代理 + 磁盘缓存**（/api/pixiv/image?url=…），
 *      浏览器只跟 localhost 打交道：命中缓存是毫秒级，未命中才去社区镜像取。
 *   3. 要小图：上游 size=small（540px，约 40KB）而不是 regular（1200px，600KB+）。
 *      实测同一张图 regular 回源 22.3 秒 / 621KB，small 只要 2.4 秒 / 43KB —— 十倍差距。
 * 说明：只做展示与缓存，不做批量抓取，也不绕过任何登录。
 */
const PIXIV = {
  api: 'https://api.lolicon.app/setu/v2',
  /** 图片镜像：pixiv.re 支持 /{pid}.jpg 与多图 /{pid}-{p}.jpg，且返回 CORS * */
  mirror: 'https://pixiv.re',
  origin: 'https://www.pixiv.net',
  ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  /** 取小图（540px）。要看大图时客户端再单独请求 full。 */
  size: 'small',
  /** 图片磁盘缓存目录 + 上限 */
  imgCache: path.join(DATA_DIR, '.cache', 'pixiv-img'),
  imgCacheMax: 600,
  /**
   * 「抽卡池」而不是缓存。
   * 为什么不能简单缓存：同一个 key 缓存 3 分钟，等于把同样的 8 张反复发出去 ——
   * 用户看到的就是「怎么老是这几张」。所以这里一次向上游要一批（上游 num 上限 20），
   * 放进池子逐张发，发过的记进 served，池子见底再补货。
   * 上游限流很凶（实测连续打会返回「请求的太快啦，休息一会吧」并连续返回空），
   * 所以补货有最小间隔 + 退避。
   */
  pool: [],
  served: new Set(),
  batch: 20,                 // 上游 num 上限（实测 21 直接返回 0 条）
  minInterval: 2500,         // 两次补货的最小间隔
  targetWarm: 24,            // 常备多少张「已缓存」的图（按一次 8 张算，够连点三次都是秒开）
  maxPool: 60,               // 池子上限，别无限涨
  bufferBusy: false,
  lastFetch: 0,
  backoffUntil: 0,
  stats: { refills: 0, throttled: 0, served: 0, imgHits: 0, imgMiss: 0, imgFail: 0 },
};

/** 只允许从这些域名取图，避免这个接口变成任意 URL 的开放代理（SSRF） */
const PIXIV_IMG_HOSTS = [/(^|\.)pixiv\.re$/i, /(^|\.)pixiv\.nl$/i, /(^|\.)pximg\.net$/i];

function pixivImageAllowed(raw) {
  try {
    const u = new URL(String(raw));
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return PIXIV_IMG_HOSTS.some((re) => re.test(u.hostname));
  } catch { return false; }
}

const pixivImgInflight = new Map();     // 同一个 URL 的并发请求只去镜像取一次

function pixivCacheFile(target) {
  const key = createHash('sha1').update(target).digest('hex');
  return path.join(PIXIV.imgCache, `${key}.img`);
}

/**
 * 取一张图并落到本地缓存。命中缓存直接返回 Buffer。
 * 返回 { buf, ct, cached }
 *
 * noDisk=true（Serverless）：**不碰磁盘**。
 * Netlify Functions 的代码目录是只读的，既读不到也写不了缓存 ——
 * 那边由 Netlify 的边缘缓存（Netlify-CDN-Cache-Control）承担同样的角色。
 */
async function cachePixivImage(target, { timeout = 60000, noDisk = false } = {}) {
  const file = noDisk ? '' : pixivCacheFile(target);
  if (file) {
    try {
      const buf = await fs.readFile(file);
      if (buf.length > 512) return { buf, ct: 'image/jpeg', cached: true };
    } catch { /* 缓存未命中 */ }
  }

  // 同一个 URL 的并发只取一次：Serverless 下没有文件路径做 key，用 URL 本身
  const key = file || target;
  let p = pixivImgInflight.get(key);
  if (!p) {
    p = (async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeout);
      try {
        const res = await fetch(target, {
          signal: ctrl.signal,
          headers: { 'User-Agent': PIXIV.ua, Accept: 'image/*' },
        });
        if (!res.ok) throw new Error(`镜像 HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 512) throw new Error('镜像返回的内容太小，可能不是图片');
        const ct = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
        if (file) {
          await fs.mkdir(PIXIV.imgCache, { recursive: true });
          await fs.writeFile(`${file}.tmp`, buf);
          await fs.rename(`${file}.tmp`, file);
        }
        return { buf, ct, cached: false };
      } finally {
        clearTimeout(timer);
      }
    })().finally(() => pixivImgInflight.delete(key));
    pixivImgInflight.set(key, p);
  }
  return p;
}

/** 磁盘缓存做个体量控制：超了就按修改时间删最老的一批 */
async function trimPixivImageCache() {
  try {
    const names = await fs.readdir(PIXIV.imgCache);
    if (names.length <= PIXIV.imgCacheMax) return 0;
    const stats = await Promise.all(names.map(async (n) => {
      const f = path.join(PIXIV.imgCache, n);
      try { const st = await fs.stat(f); return { f, at: st.mtimeMs }; } catch { return null; }
    }));
    const sorted = stats.filter(Boolean).sort((a, b) => a.at - b.at);
    const drop = sorted.slice(0, Math.max(0, sorted.length - PIXIV.imgCacheMax));
    await Promise.all(drop.map((x) => fs.unlink(x.f).catch(() => {})));
    return drop.length;
  } catch { return 0; }
}

/** 上游图片地址 → 走本站缓存的地址（浏览器只跟 localhost 打交道） */
function proxiedPixivUrl(target) {
  return `/api/pixiv/image?url=${encodeURIComponent(target)}`;
}

/**
 * 后台把「已缓存的备用图」维持在一个水位（targetWarm）。
 * 为什么需要它：一次随机要 8 张，20 张的池子连点两次就见底了；继续发就得让浏览器
 * 等镜像现去回源（几秒到几十秒）。这里提前把图攒好，用户连点也是毫秒级。
 * 540px 小图一张三四十 KB，常备 24 张也就 1MB 左右。
 */
async function ensurePixivBuffer() {
  if (PIXIV.bufferBusy) return;
  PIXIV.bufferBusy = true;
  try {
    for (let i = 0; i < 8; i++) {
      const warmCount = PIXIV.pool.filter((x) => x.cached && !x.bad).length;
      if (warmCount >= PIXIV.targetWarm) break;
      if (PIXIV.pool.length < PIXIV.maxPool) {
        const got = await refillPixivPool(0);
        if (!got && PIXIV.pool.length === 0) break;      // 上游没货/被限流，先算了
      }
      warmPixivImages(PIXIV.pool, PIXIV.pool.length);
      await new Promise((r) => setTimeout(r, 5000));      // 给预热一点时间，别空转
    }
  } catch { /* 预热是尽力而为 */ } finally {
    PIXIV.bufferBusy = false;
  }
}

/** 向上游补一批货；返回是否补到新的 */
async function refillPixivPool(r18 = 0) {
  const now = Date.now();
  if (now < PIXIV.backoffUntil) return false;
  // 两次补货之间必须留间隔（上游限流很凶），但不要直接放弃 —— 等一小会儿再打，
  // 否则用户连点两下就会撞上「池子空 + 不能补」而拿到 503
  const wait = PIXIV.minInterval - (now - PIXIV.lastFetch);
  if (wait > 0) await new Promise((r) => setTimeout(r, Math.min(wait, PIXIV.minInterval)));
  PIXIV.lastFetch = Date.now();
  PIXIV.stats.refills++;

  const target = `${PIXIV.api}?num=${PIXIV.batch}&r18=${r18}&size=${PIXIV.size}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(target, {
      signal: ctrl.signal,
      headers: { 'User-Agent': PIXIV.ua, Accept: 'application/json' },
    });
    if (!res.ok) return false;
    const json = await res.json();
    if (json.error) {
      // 「请求的太快啦，休息一会吧」→ 退避一段时间再试
      PIXIV.backoffUntil = Date.now() + 20000;
      PIXIV.stats.throttled++;
      console.warn(`  [pixiv] 上游限流：${json.error}（退避 20s）`);
      return false;
    }
    const have = new Set([...PIXIV.pool.map((x) => x.pid), ...PIXIV.served]);
    const fresh = (json.data || [])
      .map((d) => shapePixivWork(d))
      .filter((it) => it && !have.has(it.pid));
    PIXIV.pool.push(...fresh);
    return fresh.length > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 从池子里取 num 张「这次调用没发过的」作品。
 * 优先发「图片已经在本地缓存里」的那些 —— 那样浏览器几乎是瞬间显示。
 * @param {number} num
 * @param {{r18?:number, exclude?:string[], preferCached?:boolean}} opts
 *        exclude 是前端报上来的「本次会话已展示」id
 */
async function pixivTake(num = 12, { r18 = 0, exclude = [], preferCached = true } = {}) {
  const banned = new Set([...exclude.map(String), ...PIXIV.served]);
  const take = () => {
    const out = [];
    for (let i = 0; i < PIXIV.pool.length && out.length < num; i++) {
      const it = PIXIV.pool[i];
      if (banned.has(it.pid) || it.bad) continue;      // 坏图（取不到）不再发
      out.push(it);
      banned.add(it.pid);
    }
    return out;
  };
  // 已缓存（it.cached）的排前面，其余保持原顺序
  const order = () => {
    if (!preferCached) return PIXIV.pool;
    return [...PIXIV.pool.filter((x) => x.cached), ...PIXIV.pool.filter((x) => !x.cached)];
  };

  // 一开始就按「已缓存优先」排，否则第一次取可能挑到还没下好的图（就要等镜像回源）
  PIXIV.pool = order();
  let items = take();
  // 池子不够就补货再取；最多补两次，避免在上游出事时把请求拖死
  for (let i = 0; i < 2 && items.length < num; i++) {
    const got = await refillPixivPool(r18);
    if (!got && !PIXIV.pool.length) break;
    PIXIV.pool = order();
    items = take();
  }

  // 只把真正发出去的从池子里移除，并记进 served（保证同一次运行内不重复）
  const send = new Set(items.map((x) => x.pid));
  PIXIV.pool = PIXIV.pool.filter((x) => !send.has(x.pid));
  items.forEach((x) => PIXIV.served.add(x.pid));
  PIXIV.stats.served += items.length;
  // served 太大时清掉一批（池子本身已经保证短期不重复了）
  if (PIXIV.served.size > 4000) PIXIV.served = new Set([...PIXIV.served].slice(-1000));

  // 库存见底 / 已缓存的备用图不够，就后台补货并预热（不 await）
  ensurePixivBuffer().catch(() => {});

  return { items, poolLeft: PIXIV.pool.length };
}

/** 把 Lolicon 的一条记录压成前端要用的结构
 *  · url  → 本站图片缓存代理的小图（540px，约 40KB，浏览器拿它秒开）
 *  · full → 同一张的 regular（1200px），只在用户点开灯箱 / 全屏时才请求
 */
function shapePixivWork(d) {
  const pid = String(d?.pid ?? '');
  if (!pid) return null;
  const p = Number(d.p) || 0;
  // urls.* 已经是 i.pixiv.re 上的完整路径（含发布日期目录），最省事也最稳
  const byId = (suffix) => (p ? `${PIXIV.mirror}/${pid}-${p}.jpg` : `${PIXIV.mirror}/${pid}.jpg`);
  const small = d?.urls?.small || d?.urls?.regular || byId();
  // 上游只返回「你请求的那个尺寸」。正图不用再问一次接口：
  // 缩略地址形如 …/c/540x540_70/img-master/…，把 /c/尺寸_质量/ 这段去掉就是 regular。
  const full = (d?.urls?.regular && d.urls.regular !== small)
    ? d.urls.regular
    : small.replace(/\/c\/\d+x\d+(_[a-z0-9]+)?\//i, '/');
  return {
    pid,
    p,
    uid: String(d.uid ?? ''),
    title: String(d.title || '').slice(0, 120),
    author: String(d.author || '').slice(0, 80),
    tags: Array.isArray(d.tags) ? d.tags.slice(0, 8) : [],
    width: Number(d.width) || 0,
    height: Number(d.height) || 0,
    r18: !!d.r18,
    url: proxiedPixivUrl(small),
    full: full === small ? '' : proxiedPixivUrl(full),
    sourceUrl: small,
    sourceFull: full,
    cached: false,
    pageUrl: `${PIXIV.origin}/artworks/${pid}`,
  };
}

/**
 * 后台把池子里的图取进本地缓存（fire-and-forget）。
 * 这一步是「快」的关键：等用户点「随机插画」时，图已经在磁盘上，
 * 浏览器请求的是 localhost 的文件，而不是让社区镜像现去回源。
 *
 * 因为要的是 540px 小图（约 30-45KB），**可以整池预热**，成本只有几百 KB；
 * 但并发压到 4，别把免费镜像打毛了。取不到的（404 / 镜像抽风）标记成坏图。
 */
function warmPixivImages(items, n = 6, concurrency = 4) {
  const queue = items.slice(0, n).filter((it) => it && !it.cached && !it.bad && !it.warming);
  queue.forEach((it) => { it.warming = true; });
  let active = 0;
  let idx = 0;
  const next = () => {
    while (active < concurrency && idx < queue.length) {
      const it = queue[idx++];
      active++;
      cachePixivImage(it.sourceUrl || it.url)
        .then(() => { it.cached = true; })
        .catch(() => { it.bad = true; PIXIV.stats.imgFail++; })
        .finally(() => {
          it.warming = false;
          active--;
          if (idx < queue.length) next();
        });
    }
  };
  next();
}

async function handlePixiv(req, res, url, opts = {}) {
  const seg = url.pathname.replace(/^\/api\/pixiv\/?/, '').split('/').filter(Boolean);
  const action = seg[0] || 'random';

  // 图片代理 + 缓存：本地落盘（server.mjs），Serverless 交给 CDN
  if (action === 'image') {
    const target = url.searchParams.get('url') || '';
    if (!pixivImageAllowed(target)) {
      return fail(res, 400, '只允许 pixiv.re / pixiv.nl / pximg.net 的图片地址');
    }
    try {
      const { buf, ct, cached } = await cachePixivImage(target, { noDisk: !!opts.serverless });
      if (cached) PIXIV.stats.imgHits++; else PIXIV.stats.imgMiss++;
      const headers = {
        'Content-Type': ct || 'image/jpeg',
        'Content-Length': buf.length,
        // 图片地址带日期目录，内容不会变，可以长期缓存
        'Cache-Control': 'public, max-age=604800, immutable',
        'X-Pixiv-Cache': cached ? 'hit' : 'miss',
      };
      // Serverless 上没有可写的磁盘缓存，改为让 Netlify 的边缘缓存接手：
      // 第一次请求回源，之后同一个地址直接由 CDN 出，效果和本地磁盘缓存一样。
      if (opts.serverless) headers['Netlify-CDN-Cache-Control'] = 'public, max-age=604800, durable';
      res.writeHead(200, headers);
      res.end(buf);
    } catch (err) {
      return fail(res, 502, `取图失败：${err.message}`);
    }
    return;
  }

  if (action === 'random') {
    // num 上限固定 20（上游限制），exclude 是前端报上来的「本次会话已展示」id
    const num = Math.min(PIXIV.batch, Math.max(1, Number(url.searchParams.get('num')) || 12));
    const r18 = Number(url.searchParams.get('r18')) === 1 ? 1 : 0;
    const exclude = (url.searchParams.get('exclude') || '')
      .split(',').map((s) => s.trim()).filter((s) => /^\d+$/.test(s));
    try {
      const { items, poolLeft } = await pixivTake(num, { r18, exclude });
      if (!items.length) {
        return fail(res, 503, 'Pixiv 上游正在限流，稍等十几秒再点一次');
      }
      warmPixivImages(items, PIXIV.batch);                    // 后台预热到本地缓存，别 await
      return ok(res, {
        ok: true, mirror: PIXIV.mirror, count: items.length, poolLeft,
        excluded: exclude.length, items,
      });
    } catch (err) {
      return fail(res, 502, `获取随机 Pixiv 作品失败：${err.message}`);
    }
  }

  // 手动填作品 id：不做元数据（pixiv.net 不可达），只给出可显示、且**已转成站内代理**的地址。
  // ⚠️ 这里曾经有两份一模一样的分支，前一份直接返回 pixiv.re 原始地址并 return ——
  //    于是后一份（走 /api/pixiv/image 代理的那份）永远执行不到，浏览器只能去直连镜像，
  //    在国内/Netlify 上就是「Pixiv 图片显示不出来」。现在只保留代理这一份。
  if (action === 'illust') {
    const id = (url.searchParams.get('id') || '').trim();
    if (!/^\d{4,12}$/.test(id)) return fail(res, 400, '缺少合法的作品 id');
    const p = Math.max(0, Math.min(50, Number(url.searchParams.get('p')) || 0));
    const raw = p ? `${PIXIV.mirror}/${id}-${p}.jpg` : `${PIXIV.mirror}/${id}.jpg`;
    return ok(res, {
      ok: true,
      item: {
        pid: id, p, uid: '', title: `Pixiv ${id}`, author: 'PIXIV',
        tags: [], width: 0, height: 0, r18: false,
        url: proxiedPixivUrl(raw), full: '', sourceUrl: raw,
        pageUrl: `${PIXIV.origin}/artworks/${id}`,
      },
    });
  }

  if (action === 'status') {
    let cacheFiles = 0;
    try { cacheFiles = (await fs.readdir(PIXIV.imgCache)).length; } catch { /* 还没有缓存 */ }
    return ok(res, {
      ok: true,
      api: PIXIV.api,
      mirror: PIXIV.mirror,
      size: PIXIV.size,
      poolLeft: PIXIV.pool.length,
      poolCached: PIXIV.pool.filter((x) => x.cached).length,
      served: PIXIV.served.size,
      cacheFiles,
      stats: PIXIV.stats,
      backoffMs: Math.max(0, PIXIV.backoffUntil - Date.now()),
      note: '按「抽卡池」发放（同一作品只发一次）；图片经本站 /api/pixiv/image 代理并落盘缓存，浏览器只跟 localhost 打交道。',
    });
  }

  return fail(res, 404, `未知 Pixiv 接口：${action}（可用：random / image / illust / status）`);
}

/**
 * 墓碑：线上"删掉一条内容"这件事本身也要记下来。
 *
 * 为什么需要：线上（Blobs）的读只能拿到**覆盖层**（仓库里那份 data/*.json 在函数产物里读不到），
 * 前端把覆盖层合并到静态 seed 之上。如果删除只是"从覆盖层里拿掉"，那就等于从没发布过 ——
 * 前端一合并，仓库 seed 里那条又冒出来了，表现为**线上删掉的公告刷新后又出现**。
 * 所以线上删除要留下 `{ id, __deleted: true }` 这条墓碑，GET 时通过 `deleted` 告诉前端剔除它。
 * 本地（文件即真相）不需要墓碑：删除就是真删。
 */
function isTombstone(it) {
  return !!it && it.__deleted === true;
}

async function readCollection(name, opts = {}) {
  const store = storageFor(opts);
  if (store.mode === 'blobs') {
    // 线上：仓库里那份读不到（函数产物只含 server.mjs），所以只返回**线上发布的覆盖层**，
    // 由前端把它合并到静态 data/*.json 之上（见 src/core/store.js）。
    const doc = await store.readCollection(name, null);
    return Array.isArray(doc?.items) ? doc.items : [];
  }
  const file = COLLECTIONS[name];
  if (!existsSync(file)) return [];
  try {
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    return Array.isArray(json) ? json : (json.items || []);
  } catch (err) {
    throw new Error(`读取 ${name}.json 失败：${err.message}`);
  }
}

async function writeCollection(name, items, opts = {}) {
  const store = storageFor(opts);
  if (store.mode === 'blobs') {
    // 线上：写 Blobs（跨部署持久）。不做备份 —— Blobs 的每次写入都是覆盖，必要时用 Netlify UI 看历史。
    await store.writeCollection(name, { items, updatedAt: new Date().toISOString() });
    return items.length;
  }
  const file = COLLECTIONS[name];
  await fs.mkdir(DATA_DIR, { recursive: true });
  // 备份旧文件，最多保留 20 份
  if (existsSync(file)) {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await fs.copyFile(file, path.join(BACKUP_DIR, `${name}-${stamp}.json`));
    const olds = (await fs.readdir(BACKUP_DIR)).filter((f) => f.startsWith(`${name}-`)).sort();
    for (const f of olds.slice(0, Math.max(0, olds.length - 20))) {
      await fs.unlink(path.join(BACKUP_DIR, f)).catch(() => {});
    }
  }
  // 原子写入：先写临时文件再重命名
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(items, null, 2), 'utf8');
  await fs.rename(tmp, file);
  return items.length;
}

/** 校验并规范一条内容记录 */
function sanitizeItem(input) {
  if (!input || typeof input !== 'object') throw new Error('内容必须是对象');
  const str = (v, max = 20000) => String(v ?? '').slice(0, max);
  const item = {
    id: str(input.id, 120) || `item_${Date.now().toString(36)}`,
    title: str(input.title, 300) || '未命名',
    summary: str(input.summary, 1000),
    content: str(input.content, 400000),
    category: str(input.category, 60) || '日志',
    tags: Array.isArray(input.tags) ? input.tags.map((t) => str(t, 40)).slice(0, 20) : [],
    cover: str(input.cover, 600),
    author: str(input.author, 120),
    date: input.date ? new Date(input.date).toISOString() : new Date().toISOString(),
    pinned: !!input.pinned,
    draft: !!input.draft,
    level: Math.max(0, Math.min(2, Number(input.level) || 0)),
  };
  if (input.updatedAt) item.updatedAt = new Date(input.updatedAt).toISOString();
  return item;
}

/* ---------------- API ----------------
 * opts（可选）：
 *   serverless  true = 跑在 Serverless（Netlify Functions）上：
 *               · 没有可写磁盘 → 内容接口只读，写操作回 501 而不是假装成功
 *               · 响应有体积上限 → 大音频改成 302 直接给上游 CDN（见 streamNeteaseAudio）
 *               · 图片缓存交给 CDN（Netlify-CDN-Cache-Control）而不是落盘
 *   readonly    true = 强制内容接口只读
 */
/* ---------------- 账号数据 ---------------- */

/**
 * 把 Auth0 的 `sub` 变成一个安全的存储键。
 * 为什么不能直接用：Auth0 的 sub 形如 `auth0|6ac9ba5f…`（含 `|`），
 * 而我们的键要落到文件路径/Blob 键上，所以只允许 [A-Za-z0-9_-]，
 * 于是取 sha1 的前 32 位——真实 sub 仍完整保存在文档里，不会丢信息。
 */
function userKey(sub) {
  return createHash('sha1').update(String(sub)).digest('hex').slice(0, 32);
}

/** 记录/更新一个账号的资料（昵称、角色、首次与最近出现时间） */
async function rememberUser(user, opts = {}) {
  if (!user?.sub) return null;
  const store = storageFor(opts);
  const key = userKey(user.sub);
  const prev = await store.readItem('users', key).catch(() => null);
  const now = new Date().toISOString();
  // Blobs / 磁盘的写入都是稀缺资源，而 /api/auth/me 每次开页面都会被调一次 ——
  // 所以只在"资料真的变了"或"上次记录超过 1 小时"时才写回。
  const changed = !prev
    || prev.name !== user.name
    || prev.role !== user.role
    || prev.email !== user.email
    || prev.verified !== !!user.verified;
  const stale = !prev || (Date.now() - Date.parse(prev.lastSeenAt || 0)) > 60 * 60 * 1000;
  if (!changed && !stale) return prev;
  const doc = {
    key,
    sub: user.sub,
    email: user.email,
    name: user.name,
    picture: user.picture || prev?.picture || '',
    role: user.role,
    verified: !!user.verified,
    firstSeenAt: prev?.firstSeenAt || now,
    lastSeenAt: now,
    visits: (Number(prev?.visits) || 0) + 1,
  };
  await store.writeItem('users', key, doc);
  return doc;
}

/* ---------------- 权限：谁能改"网站现有文案" ---------------- */

/**
 * 「网站现有文案」= 公告 / 文章 / 相册清单（data/*.json 那几份）。
 * 规则（按优先级）：
 *   ① 配了 Auth0 → 必须是**站长**：邮箱在 OWNER_EMAILS 白名单里，且 Auth0 标记为已验证
 *      （不这样要求的话，任何人拿你的邮箱注册一个未验证账号就成站长了）；
 *   ② 没配 Auth0、且请求来自本机 → 允许。这样你原来的工作流不变：
 *      本地控制台写 data/*.json，然后 git 提交；
 *   ③ 其它 → 拒绝。线上没配账号时仍是"只读部署"，但会明确告诉你去配哪几个环境变量。
 */
async function requireOwner(req, res, opts = {}) {
  const cfg = authConfig();
  if (cfg.enabled) {
    const who = await authenticate(req);
    if (!who.ok) return fail(res, who.status, who.error), null;
    if (who.user.role !== 'owner') {
      return fail(res, 403, '只有站长可以修改网站公告与现有文案；普通账号可以到论坛发帖。'), null;
    }
    return who.user;
  }
  if (!opts.serverless && isLoopback(req)) {
    return { sub: 'local', email: '', name: '本机', role: 'owner', verified: true };
  }
  fail(res, opts.serverless ? 501 : 401, opts.serverless
    ? '这份部署还不能在线发布：请在 Netlify 配置 AUTH0_DOMAIN / AUTH0_CLIENT_ID / OWNER_EMAILS 后，用站长账号登录再发布。'
    : '只有本机访问才能改内容；要远程编辑请先配好账号功能（AUTH0_DOMAIN / AUTH0_CLIENT_ID / OWNER_EMAILS）。');
  return null;
}

/* ---------------- 论坛 ---------------- */

const FORUM = {
  titleMax: 120,
  bodyMax: 200000,
  tagsMax: 6,
  tagMax: 24,
  listDefault: 20,
  listMax: 50,
  excerpt: 240,
  // 简易限流（内存态、每个实例一份）：够挡误触和脚本刷帖，Serverless 多实例下是"尽力而为"
  gapMs: 15 * 1000,
  perDay: 40,
};
const forumRate = new Map();   // sub → { last, day, count }

function forumRateOk(sub) {
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const rec = forumRate.get(sub) || { last: 0, day, count: 0 };
  if (rec.day !== day) { rec.day = day; rec.count = 0; }
  if (now - rec.last < FORUM.gapMs) return `发得太快了，请等 ${Math.ceil((FORUM.gapMs - (now - rec.last)) / 1000)} 秒再发`;
  if (rec.count >= FORUM.perDay) return '今天发的帖子有点多，明天再来吧';
  rec.last = now;
  rec.count += 1;
  forumRate.set(sub, rec);
  if (forumRate.size > 500) forumRate.clear();
  return '';
}

function newForumId() {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 校验并规范化一篇帖子（只收标题/正文/标签，其余字段一律由服务端生成） */
function sanitizeForumInput(input) {
  const str = (v, max) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
  const title = str(input?.title, FORUM.titleMax);
  const body = str(input?.body, FORUM.bodyMax);
  const tags = Array.isArray(input?.tags)
    ? [...new Set(input.tags.map((t) => str(t, FORUM.tagMax)).filter(Boolean))].slice(0, FORUM.tagsMax)
    : [];
  if (!title) throw new Error('标题不能为空');
  if (!body) throw new Error('正文不能为空');
  return { title, body, tags };
}

/** 公开视图：不暴露作者邮箱，列表里只给摘要 */
function publicForumPost(post, { full = false } = {}) {
  const out = {
    id: post.id,
    title: post.title,
    tags: post.tags || [],
    // 带上角色：客户端据此给站长的帖子加个"站长"标记（角色本身不是隐私，
    // 公告的作者是谁本来就公开）。邮箱仍然只存服务端。
    author: { sub: post.author?.sub, name: post.author?.name || '匿名', role: post.author?.role || 'member' },
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    edited: !!post.edited,
  };
  out.body = full ? post.body : String(post.body || '').slice(0, FORUM.excerpt);
  if (!full) out.excerpt = out.body.length >= FORUM.excerpt;
  return out;
}

/** /api/forum/* —— 读公开、写在登录后、改删只有作者本人（站长可代为管理） */
/* ---------------- 论坛索引 ----------------
 * 为什么需要：Netlify Blobs 一次只能读一个键。列表页若靠"列目录 + 逐条读"，
 * 一个请求就要读最多 300 个键 —— 慢，而且很快吃掉读配额。
 * 所以另外维护一份**轻量索引**（标题 / 标签 / 作者 / 时间 / 摘要），列表只读它一个文档。
 * 索引是"派生数据"：万一和帖子不一致（例如写入中途失败），下一次列表会按需重建。
 */
const FORUM_INDEX = 'forum-index';

/** 从一篇完整帖子抽出索引条目（摘要够列表页用，不必再读正文） */
function forumIndexEntry(post) {
  return {
    id: post.id,
    title: post.title,
    tags: post.tags || [],
    author: post.author,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    edited: !!post.edited,
    excerpt: String(post.body || '').slice(0, FORUM.excerpt),
  };
}

async function readForumIndex(store) {
  const doc = await store.readCollection(FORUM_INDEX, null);
  const items = Array.isArray(doc?.items) ? doc.items : [];
  return items.filter((it) => it && it.id);
}

async function writeForumIndex(store, items) {
  await store.writeCollection(FORUM_INDEX, { items, updatedAt: new Date().toISOString() });
}

/**
 * 索引里插入/替换一条，并保持"按创建时间倒序"。
 * 注意**不能**简单插到最前面：编辑一篇旧帖不应该让它跳到列表顶部
 * （用户看到的是"我改了个错别字，帖子却跑到第一行"）。
 */
function upsertForumIndex(items, entry) {
  const next = [entry, ...items.filter((e) => e.id !== entry.id)];
  next.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return next;
}

/** 索引缺失（内容由旧版本写入、或索引被清掉）时，从逐条帖子重建一次并落库 */
async function rebuildForumIndex(store) {
  const ids = await store.listItems('forum');
  const items = [];
  for (const pid of ids.slice(-300)) {
    const p = await store.readItem('forum', pid).catch(() => null);
    if (p && p.id) items.push(forumIndexEntry(p));
  }
  items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  await writeForumIndex(store, items).catch(() => {});
  log(`\x1b[35mFORUM\x1b[0m 索引重建：${items.length} 条`);
  return items;
}

/** 取索引（缺失就重建）；索引内部按时间倒序 */
async function forumIndex(store) {
  const items = await readForumIndex(store);
  if (items.length) return items;
  // 索引为空有两种可能：真的没人发过帖，或者索引还没建过。
  // 只有"帖库里确实有条目"时才值得重建（否则每次空列表都要列一遍目录）。
  return rebuildForumIndex(store);
}

/** 列表/我的帖都用它：索引条目 + 摘要 → 公开对象（不带作者邮箱） */
function publicFromIndex(entry, { full = false } = {}) {
  return publicForumPost({ ...entry, body: full ? entry.body : entry.excerpt }, { full });
}

async function handleForum(req, res, url, opts, seg) {
  const store = storageFor(opts);
  const head = seg[0] || 'posts';
  const id = seg[1] ? decodeURIComponent(seg[1]) : '';

  // GET /api/forum/posts?limit&offset&q
  if (head === 'posts' && !id && req.method === 'GET') {
    const limit = Math.min(FORUM.listMax, Math.max(1, Number(url.searchParams.get('limit')) || FORUM.listDefault));
    const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    // 线上存储偶发抽风（冷启动 / Blobs 抖动）时不要吐 500 —— 给一句人话 + 503，
    // 前端可以提示"稍后重试"，而不是让访问者看到一个没有解释的服务端错误。
    let list = [];
    try {
      list = await forumIndex(store);
    } catch (err) {
      log(`\x1b[31mFORUM\x1b[0m 列表读取失败：${err.message}`);
      return fail(res, 503, '论坛列表暂时读不出来（存储服务抖动）：请稍后刷新重试。');
    }
    // 列表只读索引这一个文档（不再逐条读帖子）：摘要在索引里，够列表页用
    if (q) {
      list = list.filter((e) => `${e.title}\n${e.excerpt}\n${(e.tags || []).join(' ')}`.toLowerCase().includes(q));
    }
    const total = list.length;
    const page = list.slice(offset, offset + limit).map((e) => publicFromIndex(e));
    return ok(res, { ok: true, total, offset, limit, posts: page, storage: store.mode });
  }

  // GET /api/forum/mine （登录）
  if (head === 'mine' && req.method === 'GET') {
    const who = await authenticate(req);
    if (!who.ok) return fail(res, who.status, who.error);
    // 先用索引筛出"我的"，再逐条取正文（通常只有几条）
    let index = [];
    try {
      index = await forumIndex(store);
    } catch (err) {
      return fail(res, 503, '论坛列表暂时读不出来（存储服务抖动）：请稍后刷新重试。');
    }
    const mineIds = index.filter((e) => e.author?.sub === who.user.sub).map((e) => e.id);
    const mine = [];
    for (const pid of mineIds) {
      const p = await store.readItem('forum', pid).catch(() => null);
      if (p && p.id) mine.push(p);
    }
    mine.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return ok(res, { ok: true, posts: mine.map((p) => publicForumPost(p, { full: true })) });
  }

  // GET /api/forum/posts/:id （公开）
  if (head === 'posts' && id && req.method === 'GET') {
    const p = await store.readItem('forum', id);
    if (!p) return fail(res, 404, '没有这篇内容（可能已被删除）');
    return ok(res, { ok: true, post: publicForumPost(p, { full: true }) });
  }

  // POST /api/forum/posts （登录后发帖）
  if (head === 'posts' && !id && (req.method === 'POST' || req.method === 'PUT')) {
    const who = await authenticate(req);
    if (!who.ok) return fail(res, who.status, who.error);
    if (!who.user.verified) return fail(res, 403, '请先到邮箱里点验证链接，验证后再发帖');
    const gate = forumRateOk(who.user.sub);
    if (gate) return fail(res, 429, gate);
    let input;
    try { input = sanitizeForumInput(await readBody(req)); } catch (err) { return fail(res, 400, err.message); }
    const now = new Date().toISOString();
    const post = {
      id: newForumId(),
      ...input,
      author: { sub: who.user.sub, name: who.user.name || '匿名', role: who.user.role },
      // 邮箱只存服务端，公开接口不会带出去（站长管理时需要时可另开接口）
      authorEmail: who.user.email,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await store.writeItem('forum', post.id, post);
    } catch (err) {
      // 存储侧偶发问题（令牌过期、Blobs 抖动）不要让它变成一句原始报错甩给用户：
      // 记日志，回 503 + 人话，用户重试一次通常就好。
      log(`\x1b[31mFORUM\x1b[0m 发帖写入失败：${err.message}`);
      return fail(res, 503, '发帖没写进去（存储服务暂时不可用）：请稍后重试一次，内容还在编辑框里。');
    }
    // 维护索引（派生数据：写失败只记日志，列表下次会按需重建，不影响发帖本身）
    try {
      await writeForumIndex(store, upsertForumIndex(await readForumIndex(store), forumIndexEntry(post)));
    } catch (err) { log(`\x1b[33mFORUM\x1b[0m 索引更新失败（列表下次会重建）：${err.message}`); }
    log(`\x1b[35mFORUM\x1b[0m + ${post.id} ${post.title}`);
    return ok(res, { ok: true, post: publicForumPost(post, { full: true }) });
  }

  // PATCH / DELETE /api/forum/posts/:id
  if (head === 'posts' && id && (req.method === 'PATCH' || req.method === 'DELETE')) {
    const who = await authenticate(req);
    if (!who.ok) return fail(res, who.status, who.error);
    const p = await store.readItem('forum', id);
    if (!p) return fail(res, 404, '没有这篇内容（可能已被删除）');
    const isAuthor = p.author?.sub && p.author.sub === who.user.sub;
    if (!isAuthor && who.user.role !== 'owner') {
      return fail(res, 403, '只有作者本人可以修改或删除这篇内容');
    }
    if (req.method === 'DELETE') {
      await store.removeItem('forum', id);
      try {
        await writeForumIndex(store, (await readForumIndex(store)).filter((e) => e.id !== id));
      } catch (err) { log(`\x1b[33mFORUM\x1b[0m 索引更新失败（列表下次会重建）：${err.message}`); }
      log(`\x1b[31mFORUM\x1b[0m - ${id}`);
      return ok(res, { ok: true, deleted: id });
    }
    let input;
    try {
      const body = await readBody(req);
      input = sanitizeForumInput({ title: body?.title ?? p.title, body: body?.body ?? p.body, tags: body?.tags ?? p.tags });
    } catch (err) { return fail(res, 400, err.message); }
    const next = { ...p, ...input, updatedAt: new Date().toISOString(), edited: true };
    await store.writeItem('forum', id, next);
    try {
      await writeForumIndex(store, upsertForumIndex(await readForumIndex(store), forumIndexEntry(next)));
    } catch (err) { log(`\x1b[33mFORUM\x1b[0m 索引更新失败（列表下次会重建）：${err.message}`); }
    log(`\x1b[33mFORUM\x1b[0m ~ ${id}`);
    return ok(res, { ok: true, post: publicForumPost(next, { full: true }) });
  }

  return fail(res, 404, '未知论坛接口（可用：GET posts / GET posts/:id / GET mine / POST posts / PATCH posts/:id / DELETE posts/:id）');
}

async function handleApi(req, res, url, opts = {}) {
  const seg = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);

  // GET /api/netease/* — 网易云元数据代理（搜索 / 详情 / 歌单 / 状态）
  if (seg[0] === 'netease') return handleNetease(req, res, url, opts);

  // GET /api/pixiv/* — Pixiv 随机作品代理（api.lolicon.app + pixiv.re 镜像）
  if (seg[0] === 'pixiv') return handlePixiv(req, res, url, opts);

  // GET /api/health
  if (seg[0] === 'health') {
    const readonly = !!(opts.readonly || opts.serverless);
    let writable = false;
    if (!readonly) {
      try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.access(DATA_DIR, constants.W_OK);
        writable = true;
      } catch { writable = false; }
    }
    return ok(res, {
      ok: true,
      server: 'fish-temple-terminal',
      // 'local' = node server.mjs（可写、可落盘缓存）；'netlify' = Netlify Functions（只读 + CDN 缓存）
      deploy: opts.serverless ? 'netlify' : 'local',
      readonly,
      root: ROOT,
      dataDir: DATA_DIR,
      collections: Object.keys(COLLECTIONS),
      netease: { enabled: true, endpoints: ['search', 'songs', 'playlist', 'album', 'lyric', 'resolve', 'playable', 'audio', 'status'] },
      pixiv: { enabled: true, endpoints: ['random', 'image', 'illust', 'status'], mirror: PIXIV.mirror },
      // 账号与内容存储：前端据此决定要不要显示登录入口、以及"能不能在线发布"
      auth: (() => { const c = authConfig(); return { enabled: c.enabled, domain: c.domain, clientId: c.clientId, ownerConfigured: c.owners.length > 0 }; })(),
      storage: storageFor(opts).mode,
      forum: { enabled: true, endpoints: ['posts', 'posts/:id', 'mine'] },
      writable,
      // Serverless 诊断：把平台给的原始 event（以及函数是"怎么还原路径"的）回显出来。
      // 线上 /api/health 看一眼就知道 event 语义对不对，不用猜。
      ...(opts.meta ? { netlifyEvent: opts.meta } : {}),
      time: new Date().toISOString(),
    });
  }

  // GET /api/tree
  if (seg[0] === 'tree') {
    const dirs = ['src', 'src/core', 'src/views', 'src/ui', 'src/util', 'src/plugins', 'src/config', 'styles', 'data', 'assets', 'assets/audio', 'assets/img'];
    const tree = {};
    for (const d of dirs) {
      const abs = path.join(ROOT, d);
      try {
        tree[d] = (await fs.readdir(abs)).slice(0, 40);
      } catch { tree[d] = []; }
    }
    return ok(res, tree);
  }

  /* ---------------- 账号（Auth0） ---------------- */

  // GET /api/auth/config —— 公开：前端据此决定要不要显示登录入口、往哪个域名跳
  if (seg[0] === 'auth' && seg[1] === 'config') {
    const cfg = authConfig();
    return ok(res, {
      ok: true,
      enabled: cfg.enabled,
      domain: cfg.domain,
      clientId: cfg.clientId,
      audience: cfg.audience,
      // 只说明"有没有配站长白名单"，不暴露具体邮箱
      ownerConfigured: cfg.owners.length > 0,
    });
  }

  // GET /api/auth/me —— 校验令牌并回当前身份（前端用它判断"我是不是站长"）
  if (seg[0] === 'auth' && seg[1] === 'me') {
    const who = await authenticate(req);
    if (!who.ok) return fail(res, who.status, who.error);
    // 顺便把账号数据落一份（需求里的"保存账号数据"）：
    // 记下这个账号第一次/最近一次出现、昵称与角色，站长以后可以在后台看有哪些人。
    try { await rememberUser(who.user, opts); } catch (err) { log(`\x1b[33mUSER\x1b[0m 记录失败：${err.message}`); }
    return ok(res, { ok: true, user: who.user });
  }

  // GET /api/auth/users —— 仅站长：看有哪些账号（账号数据存了就要能用起来）
  if (seg[0] === 'auth' && seg[1] === 'users') {
    const owner = await requireOwner(req, res, opts);
    if (!owner) return undefined;
    const store = storageFor(opts);
    const keys = await store.listItems('users');
    const users = [];
    for (const k of keys.slice(-500)) {
      const doc = await store.readItem('users', k).catch(() => null);
      if (doc) users.push(doc);
    }
    users.sort((a, b) => String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || '')));
    return ok(res, {
      ok: true,
      total: users.length,
      users,
      note: '邮箱只对站长可见；公开接口一律不返回作者邮箱。',
    });
  }

  /* ---------------- 论坛 ---------------- */
  if (seg[0] === 'forum') return handleForum(req, res, url, opts, seg.slice(1));

  // /api/content/:collection[/:id]
  if (seg[0] === 'content') {
    const name = seg[1];
    if (!name || !COLLECTIONS[name]) {
      return fail(res, 400, `未知集合：${name || '(空)'}，可用：${Object.keys(COLLECTIONS).join(', ')}`);
    }

    // 「网站现有文案」（公告 / 文章 / 相册清单）只有站长能改。
    // 配了账号体系就按角色判；没配账号又是在本机跑，就沿用原来的本地工作流（写文件 + git）。
    if (req.method !== 'GET') {
      const owner = await requireOwner(req, res, opts);
      if (!owner) return undefined;
    }

    if (req.method === 'GET') {
      const raw = await readCollection(name, opts);
      const store = storageFor(opts);
      const items = raw.filter((it) => !isTombstone(it));
      // deleted：线上被删除过的 id。前端合并完覆盖层之后要再按这些 id 剔除，
      // 否则仓库 data/*.json 里那条 seed 会"复活"（详见 isTombstone 的注释）。
      const deleted = store.mode === 'blobs' ? raw.filter(isTombstone).map((it) => String(it.id)) : [];
      return ok(res, { ok: true, items, deleted, storage: store.mode, overlayOnly: store.mode === 'blobs' });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const body = await readBody(req);
      const incoming = Array.isArray(body) ? body.map(sanitizeItem) : [sanitizeItem(body)];
      const raw = await readCollection(name, opts);
      const map = new Map(raw.map((it) => [it.id, it]));
      incoming.forEach((it) => {
        const next = { ...map.get(it.id), ...it };
        // 重新写入同一条 = 撤销之前的删除墓碑（否则刚"恢复"的内容会被 deleted 又剔掉）
        delete next.__deleted;
        delete next.deletedAt;
        map.set(it.id, next);
      });
      const count = await writeCollection(name, [...map.values()], opts);
      log(`\x1b[33mWRITE\x1b[0m ${name} ← ${incoming.length} 条（共 ${count} 条，${storageFor(opts).mode}）`);
      return ok(res, {
        ok: true, written: incoming.length, total: count,
        storage: storageFor(opts).mode,
        file: storageFor(opts).mode === 'fs' ? path.relative(ROOT, COLLECTIONS[name]) : `blobs:collections/${name}.json`,
      });
    }

    if (req.method === 'DELETE') {
      const id = decodeURIComponent(seg[2] || '');
      if (!id) return fail(res, 400, '缺少 id');
      const raw = await readCollection(name, opts);
      const store = storageFor(opts);
      const live = raw.some((it) => it.id === id && !isTombstone(it));
      if (!live && store.mode !== 'blobs') return fail(res, 404, `未找到 id=${id}`);
      // 线上：这个 id 可能只存在于仓库 seed 里（覆盖层里没有），也要允许删 ——
      // 函数里读不到 seed，没法验证它到底存不存在，而前端只会删它显示过的东西。
      const next = raw.filter((it) => it.id !== id);
      if (store.mode === 'blobs') {
        next.push({ id, __deleted: true, deletedAt: new Date().toISOString() });
      }
      await writeCollection(name, next, opts);
      log(`\x1b[31mDELETE\x1b[0m ${name} → ${id}${store.mode === 'blobs' ? '（留墓碑）' : ''}`);
      return ok(res, { ok: true, total: next.filter((it) => !isTombstone(it)).length, deleted: id });
    }

    return fail(res, 405, `不支持的方法：${req.method}`);
  }

  return fail(res, 404, `未知接口：${url.pathname}`);
}

/* ---------------- 静态文件 ---------------- */

async function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';

  // 拒绝路径穿越
  const abs = path.normalize(path.join(ROOT, rel));
  if (!abs.startsWith(ROOT)) return fail(res, 403, '越权访问');

  let target = abs;
  try {
    const st = statSync(target);
    if (st.isDirectory()) target = path.join(target, 'index.html');
  } catch {
    // 目录不存在或文件不存在 → SPA 回退（hash 路由其实用不到，但保持兼容）
    target = path.join(ROOT, 'index.html');
  }

  try {
    const data = await fs.readFile(target);
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'no-cache',
      'Accept-Ranges': ext === '.mp3' || ext === '.mp4' ? 'bytes' : 'none',
    });
    res.end(data);
  } catch (err) {
    fail(res, 404, `未找到：${rel}`);
  }
}

/* ---------------- HTTP 入口（本地 server.mjs） ----------------
 * 线上（Netlify Functions）走文件末尾的 handleApiRequest()，同一份 /api 实现。
 * 静态文件由平台自己发，本地才需要 serveStatic。
 */
async function handleHttp(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const started = Date.now();

  // CORS：方便你在别的前端里调用内容 API。
  // 必须把 Authorization 也列进 allow-headers —— 论坛/内容写入要带 Bearer 令牌，
  // 跨域场景下浏览器会先发预检请求，不带这一项就会被拦在预检那一步。
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  try {
    if (url.pathname.startsWith('/api')) await handleApi(req, res, url);
    else await serveStatic(req, res, url);
  } catch (err) {
    console.error('[error]', err);
    if (!res.headersSent) fail(res, 500, String(err.message || err));
  }

  const ms = Date.now() - started;
  const color = req.method === 'GET' ? '\x1b[36m' : '\x1b[33m';
  console.log(`  ${color}${req.method.padEnd(6)}\x1b[0m ${url.pathname} \x1b[90m${res.statusCode} ${ms}ms\x1b[0m`);
}

const server = createServer(handleHttp);

const onListen = () => {
  const line = '─'.repeat(58);
  console.log(`\n\x1b[33m${line}\x1b[0m`);
  console.log('  \x1b[1mFISH TEMPLE\x1b[0m  ·  本地开发服务器');
  console.log(`\x1b[33m${line}\x1b[0m`);
  console.log(`  站点地址   \x1b[36mhttp://localhost:${PORT}\x1b[0m`);
  console.log(`  发布控制台 \x1b[36mhttp://localhost:${PORT}/#/admin\x1b[0m`);
  console.log(`  内容目录   ${DATA_DIR}`);
  console.log(`  写入接口   POST /api/content/posts|news|gallery`);
  console.log(`  网易云代理 GET  /api/netease/search?q=关键词`);
  console.log(`             GET  /api/netease/songs?ids=347230`);
  console.log(`             GET  /api/netease/playlist?id=3778678   （导入歌单用）`);
  console.log(`             GET  /api/netease/lyric?id=347230        （歌词 LRC，板块标题栏要用）`);
  console.log(`             GET  /api/netease/playable?id=643982     （匿名态能否播放：会员曲目判定）`);
  console.log(`             GET  /api/netease/resolve?url=163cn.tv/xxxx   （短链展开）`);
  console.log(`  Pixiv 代理 GET  /api/pixiv/random?num=8   （随机作品，抽卡池不重复）`);
  console.log(`             GET  /api/pixiv/image?url=…   （图片代理 + 磁盘缓存）`);
  console.log(`             GET  /api/pixiv/illust?id=40000000`);
  console.log(`\x1b[33m${line}\x1b[0m`);
  console.log('  在控制台保存内容会直接写入 data/（旧文件自动备份到 data/.backup）');
  console.log('  Ctrl + C 停止服务\n');

  // 后台预热：先把随机池填满，并把**整池**的图取进本地缓存
  // （540px 小图，一张三四十 KB，整池也就几百 KB）
  // 这样用户第一次点「随机插画（PIXIV）」时图片已经在磁盘上，浏览器秒开。
  setTimeout(async () => {
    try {
      const trimmed = await trimPixivImageCache();
      const got = await refillPixivPool(0);
      if (!got) { console.log('  [pixiv] 预热跳过（上游暂时不可用或限流）'); return; }
      warmPixivImages(PIXIV.pool, PIXIV.pool.length);
      console.log(`  [pixiv] 预热中：池子 ${PIXIV.pool.length} 张全部取进本地缓存（目标常备 ${PIXIV.targetWarm} 张）`
        + (trimmed ? `（顺带清理 ${trimmed} 个过期缓存）` : ''));
      ensurePixivBuffer().catch(() => {});
    } catch (err) {
      console.log(`  [pixiv] 预热失败：${err.message}`);
    }
  }, 1200);
};

/* ---------------- 启动（只有直接运行时才监听端口） ---------------- */

if (IS_MAIN) {
  server.listen(PORT, onListen);
  process.on('SIGINT', () => {
    console.log('\n服务已停止。');
    process.exit(0);
  });
}

/* ---------------- Serverless 入口：Web 标准 Request → Response ----------------
 * Netlify Functions 只支持 Web 标准签名，而上面这套 /api 实现是直接写 Node res 的
 * （writeHead / end / 甚至被 pipeline 当 Writable 用）。与其把上千行代理逻辑重写一遍，
 * 不如在这里垫一层薄适配：把 Node 风格的 res 调用录下来，最后交出一个 Response。
 * 「只读 + 大音频 302 到 CDN + 图片交给 CDN 缓存」这些部署差异都通过 opts 传进去。
 */
class WebResponseSink extends Writable {
  constructor() {
    super();
    this.statusCode = 200;
    this.headersSent = false;
    this._headers = new Map();
    this._chunks = [];
  }
  setHeader(name, value) { this._headers.set(String(name).toLowerCase(), String(value)); return this; }
  getHeader(name) { return this._headers.get(String(name).toLowerCase()); }
  writeHead(status, headers) {
    this.statusCode = status;
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        if (v !== undefined && v !== null) this.setHeader(k, v);
      }
    }
    this.headersSent = true;
    return this;
  }
  _write(chunk, enc, cb) {
    this._chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, enc));
    cb();
  }
  toResponse() {
    const body = this._chunks.length ? Buffer.concat(this._chunks) : null;
    return new Response(body, { status: this.statusCode, headers: Object.fromEntries(this._headers) });
  }
}

/**
 * 把一个 Web Request 交给同一套 /api 实现，返回 Web Response。
 *
 * 两种调用形状都认（这是踩过坑的地方，别简化）：
 *   · v2 函数（netlify/functions/api.mjs 的 `config.path = '/api/*'`）给的是**客户端原始 URL**；
 *   · 走 netlify.toml 那条重写时，URL 可能是函数自己的地址
 *     （/.netlify/functions/api/xxx）——那时要还原成 /api/xxx，否则一条路由都匹配不上。
 * 还原结果一起放进 meta，/api/health 会回显，线上一个请求就能看清平台给的是哪种。
 */
export async function handleApiRequest(request, opts = {}) {
  const raw = new URL(request.url);
  let pathname = raw.pathname;
  let resolvedBy = 'original';
  const m = /^\/\.netlify\/functions\/api(\/.*)?$/.exec(pathname);
  if (m) {
    pathname = `/api${m[1] || ''}`;
    resolvedBy = 'normalized';
  }
  const url = new URL(`${pathname}${raw.search}`, raw.origin);
  const sink = new WebResponseSink();

  const reqLike = {
    method: request.method,
    url: url.pathname + url.search,
    headers: Object.fromEntries(request.headers.entries()),
    on() { return this; },
    off() { return this; },
  };
  // readBody() 是 for await (const chunk of req)：把 Web 流接上
  if (request.body) {
    reqLike[Symbol.asyncIterator] = () => request.body[Symbol.asyncIterator]();
  }

  sink.setHeader('Access-Control-Allow-Origin', '*');
  sink.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  sink.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (reqLike.method === 'OPTIONS') { sink.writeHead(204); sink.end(); return sink.toResponse(); }

  try {
    await handleApi(reqLike, sink, url, {
      serverless: true,
      ...opts,
      // 诊断：v2 下 meta 由这里生成（v1 适配层也会传自己的）
      meta: opts.meta || { requestUrl: request.url, resolvedPath: pathname, resolvedBy },
    });
  } catch (err) {
    console.error('[api]', err);
    if (!sink.headersSent) {
      return new Response(JSON.stringify({ ok: false, error: String(err.message || err) }, null, 2), {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }
  }
  return sink.toResponse();
}
