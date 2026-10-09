#!/usr/bin/env node
/**
 * tools/netlify-dev.mjs — 本地仿真 Netlify（静态托管 + Functions）
 * ------------------------------------------------------------------
 * 为什么需要它：部署到 Netlify 之后，站点里那些"要访问外部网站"的功能
 * （随机插画 / Pixiv 抽卡与图片、网易云搜索与试听、黄历吉日之歌）靠的是
 * netlify/functions/api.mjs。可你没法在本地点一下就知道线上会不会好 ——
 * 这个脚本就用 Node 把 Netlify 的那套行为**照着搭一遍**：
 *
 *   · 静态文件：按真实文件发，目录找 index.html，其余 404
 *     （**故意不做 SPA 通配回退** —— 线上加那条回退会把 data/album.json
 *      和相册图片一起改写成 index.html，随机相册就是这么坏的）
 *   · /api/*  ：原样交给 netlify/functions/api.mjs 的 handler，
 *     event 的形状（rawUrl / path / httpMethod / headers / body / isBase64Encoded）
 *     与 Netlify 一致，所以这里跑通 ≈ 线上跑通
 *
 * 用法：
 *   node tools/netlify-dev.mjs          # http://127.0.0.1:5199
 *   node tools/netlify-dev.mjs 8080     # 换端口
 *
 * 预期与本地 server.mjs 的差别（都是部署形态决定，不是 bug）：
 *   · /api/content/*   → 501（只读；线上没有可写磁盘）
 *   · /api/netease/audio → 302 到网易云 CDN（函数不搬音频）
 *   · /api/health      → deploy: "netlify", readonly: true
 */

import { createServer } from 'node:http';
import { promises as fs, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handler as apiHandler } from '../netlify/functions/api.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || process.env.PORT || 5199);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

const now = () => new Date().toISOString().slice(11, 19);
const log = (req, url, status, started) => {
  const color = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : '\x1b[36m';
  console.log(`  ${now()} ${req.method.padEnd(6)} ${url.pathname}${url.search} ${color}${status}\x1b[0m \x1b[90m${Date.now() - started}ms\x1b[0m`);
};

async function readBody(req, limit = 8 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error('请求体过大');
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

/** 把 /api/* 交给 Netlify 函数（event 形状与线上一致） */
async function handleApi(req, res, url, started) {
  const bodyBuf = await readBody(req).catch(() => Buffer.alloc(0));
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    headers[k] = Array.isArray(v) ? v.join(', ') : String(v ?? '');
  }

  const event = {
    rawUrl: `http://${req.headers.host || `127.0.0.1:${PORT}`}${req.url}`,
    path: url.pathname,
    httpMethod: req.method,
    headers,
    queryStringParameters: Object.fromEntries(url.searchParams),
    rawQuery: url.searchParams.toString(),
    body: bodyBuf.length ? bodyBuf.toString('base64') : null,
    isBase64Encoded: bodyBuf.length > 0,
  };
  // 想验「Netlify 给的是函数自己的路径」那种语义时：NETLIFY_FAKE_FN_PATH=1
  if (process.env.NETLIFY_FAKE_FN_PATH === '1' && url.pathname.startsWith('/api')) {
    event.path = `/.netlify/functions/api${url.pathname.slice(4)}`;
    event.rawUrl = `http://${req.headers.host || `127.0.0.1:${PORT}`}/.netlify/functions/api${url.pathname.slice(4)}${url.search}`;
  }

  let out;
  try {
    out = await apiHandler(event);
  } catch (err) {
    console.error('  [function] 抛错：', err);
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: `函数抛错：${err.message}` }, null, 2));
    return log(req, url, 500, started);
  }

  const buf = out.isBase64Encoded
    ? Buffer.from(out.body || '', 'base64')
    : Buffer.from(out.body ?? '', 'utf8');
  const outHeaders = { ...(out.headers || {}) };
  // 302 之类不带正文的响应不要硬塞 Content-Length
  if (buf.length || !/^(204|304)$/.test(String(out.statusCode))) {
    outHeaders['Content-Length'] = String(buf.length);
  }
  res.writeHead(out.statusCode || 200, outHeaders);
  res.end(buf);
  log(req, url, out.statusCode || 200, started);
}

/** 静态文件：与 Netlify 一致的"命中就发，否则 404"（不做 SPA 通配回退） */
async function serveStatic(req, res, url, started) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const abs = path.normalize(path.join(ROOT, rel));
  if (!abs.startsWith(ROOT)) {
    res.writeHead(403); res.end('403'); return log(req, url, 403, started);
  }

  let target = abs;
  try {
    if (statSync(target).isDirectory()) target = path.join(target, 'index.html');
  } catch { /* 不存在 → 下面统一 404 */ }

  try {
    const buf = await fs.readFile(target);
    const ext = path.extname(target).toLowerCase();
    const isHtml = ext === '.html';
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': String(buf.length),
      'Cache-Control': isHtml ? 'public, max-age=0, must-revalidate' : 'public, max-age=604800',
      'Accept-Ranges': ext === '.mp3' || ext === '.mp4' ? 'bytes' : 'none',
    });
    res.end(buf);
    log(req, url, 200, started);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    log(req, url, 404, started);
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `127.0.0.1:${PORT}`}`);
  const started = Date.now();
  try {
    // 与线上一致：函数既可以从 /api/*（走 netlify.toml 的重写）进，
    // 也可以从它自己的地址 /.netlify/functions/api/... 进 —— 两条都要能跑，
    // 免得"本地测的是重写路径、线上走的是函数路径"这种差异漏过去
    if (url.pathname.startsWith('/api') || url.pathname.startsWith('/.netlify/functions/api')) {
      await handleApi(req, res, url, started);
    } else {
      await serveStatic(req, res, url, started);
    }
  } catch (err) {
    console.error('[error]', err);
    if (!res.headersSent) { res.writeHead(500); res.end('500'); }
  }
});

server.listen(PORT, () => {
  const line = '─'.repeat(58);
  console.log(`\n\x1b[33m${line}\x1b[0m`);
  console.log('  \x1b[1mNETLIFY 仿真\x1b[0m  ·  静态托管 + Functions');
  console.log(`\x1b[33m${line}\x1b[0m`);
  console.log(`  站点地址   \x1b[36mhttp://127.0.0.1:${PORT}\x1b[0m`);
  console.log('  静态文件   直接发仓库里的文件（无 SPA 通配回退，与线上一致）');
  console.log('  /api/*     交给 netlify/functions/api.mjs（与线上同一个函数）');
  console.log('\x1b[90m  预期差异：/api/content/* 回 501（只读）、音频回 302 到网易云 CDN\x1b[0m');
  console.log(`\x1b[33m${line}\x1b[0m\n`);
});

process.on('SIGINT', () => { console.log('\n已停止。'); process.exit(0); });
