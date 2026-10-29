#!/usr/bin/env node
/**
 * tools/gen-service-worker.mjs — 生成 sw.js
 * ------------------------------------------------------------------
 * 站点没有构建步骤，但 Service Worker 需要一份「壳资源清单」才能离线打开。
 * 这个脚本按目录扫描出清单、算出内容指纹，把 sw.js 整份写出来（模板就在下面）。
 * 改完 src/ styles/ data/ 之后跑一次即可：
 *
 *     node tools/gen-service-worker.mjs
 *
 * 为什么不手写清单：漏一个文件，断网时就白屏；而且版本号会忘记升。
 * 指纹是全部壳资源内容的 SHA-256 前 10 位 —— 任一文件变了，sw.js 就会变，
 * 浏览器据此判定"有新版本"，于是走更新提示（见 src/ui/pwa.js）。
 *
 * 缓存策略（写在生成的 sw.js 里）：
 *   · 页面导航 / 壳资源 → stale-while-revalidate（先给缓存，后台更新）
 *   · 图片 → cache-first（有上限，超了删最旧的）
 *   · /api/、Range 请求、跨域、模型与 wasm → 一律直连网络，不进缓存
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 扫描出需要预缓存的相对路径（正斜杠，相对站点根） */
async function collect() {
  const out = new Set();

  const addFile = (rel) => out.add(rel.replace(/\\/g, '/'));

  const walk = async (relDir, filter) => {
    const abs = path.join(ROOT, relDir);
    let entries;
    try { entries = await fs.readdir(abs, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const rel = `${relDir}/${e.name}`;
      if (e.isDirectory()) await walk(rel, filter);
      else if (filter(e.name)) addFile(rel);
    }
  };

  // 入口与兜底
  ['index.html', 'offline.html', 'manifest.webmanifest'].forEach(addFile);

  // 壳：样式、脚本、内容清单
  await walk('styles', (n) => n.endsWith('.css'));
  await walk('src', (n) => n.endsWith('.js') || n.endsWith('.mjs'));
  await walk('data', (n) => n.endsWith('.json') && n !== 'forum-index.json');

  // 图标与两个小的运行时库（黄历 / mp3 编码），大文件（wasm / 模型 / 音频）不进预缓存
  await walk('assets/icons', (n) => n.endsWith('.png') || n.endsWith('.svg'));
  addFile('assets/vendor/lunar-javascript/lunar.js');
  addFile('assets/vendor/lame.min.js');

  return [...out].sort();
}

const files = await collect();

const hash = createHash('sha256');
const sizes = [];
for (const rel of files) {
  const buf = await fs.readFile(path.join(ROOT, rel));
  hash.update(rel).update(buf);
  sizes.push([rel, buf.length]);
}
const VERSION = hash.digest('hex').slice(0, 10);
const totalKB = Math.round(sizes.reduce((n, [, b]) => n + b, 0) / 1024);

const sw = `/**
 * sw.js — Service Worker（由 tools/gen-service-worker.mjs 生成，请勿手改）
 * ------------------------------------------------------------------
 * 版本：${VERSION}（壳资源 ${files.length} 个，约 ${totalKB} KB）
 * 生成：node tools/gen-service-worker.mjs
 *
 * 想让「装到主屏的 App」离线可用、启动更快，就靠这一份。
 * 想改缓存策略 → 改 tools/gen-service-worker.mjs 里的模板，再重新生成；
 * 直接改这里会在下一次生成时被覆盖。
 *
 * 版本号是全部壳资源内容的指纹，所以「改了文件却忘了重新生成」也不会让用户
 * 永远拿到旧版本：壳资源走 stale-while-revalidate，下一次访问就会换新。
 */

const VERSION = ${JSON.stringify(VERSION)};
const CACHE = 'fish-temple-' + VERSION;
const SCOPE = self.registration.scope;
const url = (p) => new URL(p, SCOPE).href;

const SHELL = url('index.html');
const OFFLINE = url('offline.html');

/** 预缓存清单（相对站点根，部署在子路径下也能用） */
const PRECACHE = ${JSON.stringify(files)}.map(url);

/** 图片缓存上限：超出后删最旧的（Cache API 的 key 按插入顺序返回） */
const IMAGE_CACHE = 'fish-temple-images';
const IMAGE_MAX = 400;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 逐个 add：某个文件 404 不该让整次安装失败（比如本地删了但清单还没重建）
    await Promise.all(PRECACHE.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    // 不在这里 skipWaiting：等用户点「有更新」再接管，避免半个旧页面配新资源的错位
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((n) => n.startsWith('fish-temple-') && n !== CACHE && n !== IMAGE_CACHE)
      .map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/** 壳资源：先给缓存，后台顺手更新 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreSearch: false });
  const network = fetch(request).then((res) => {
    if (res && res.ok && res.type === 'basic') cache.put(request, res.clone()).catch(() => {});
    return res;
  }).catch(() => null);
  if (hit) {
    event_waitUntilSafe(network);
    return hit;
  }
  const res = await network;
  return res || Response.error();
}

/** 图片：有缓存先用，没有再取；取回来顺手裁剪旧的 */
async function cacheFirstImage(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      cache.put(request, res.clone()).catch(() => {});
      trimImageCache(cache);
    }
    return res;
  } catch {
    return Response.error();
  }
}

async function trimImageCache(cache) {
  const keys = await cache.keys();
  const extra = keys.length - IMAGE_MAX;
  if (extra <= 0) return;
  for (const k of keys.slice(0, extra)) await cache.delete(k);
}

/** 导航：缓存里有就立刻给（离线秒开），同时后台更新 */
async function navigation(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(SHELL);
  const network = fetch(request).then((res) => {
    if (res && res.ok) cache.put(SHELL, res.clone()).catch(() => {});
    return res;
  }).catch(() => null);
  if (hit) {
    event_waitUntilSafe(network);
    return hit;
  }
  const res = await network;
  if (res) return res;
  return (await caches.match(OFFLINE)) || new Response(
    '<!doctype html><meta charset="utf-8"><title>离线</title><p style="font:16px system-ui;padding:32px">离线，且没有缓存。联网后重新打开。</p>',
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

/** 在 fetch 事件外拿到 event.waitUntil 的替代：把 promise 挂到全局，避免 unhandled rejection */
const background = new Set();
function event_waitUntilSafe(p) {
  if (!p) return;
  background.add(p);
  p.finally(() => background.delete(p));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const u = new URL(req.url);
  if (u.origin !== self.location.origin) return;          // 跨域交给浏览器
  if (u.pathname.startsWith('/api/')) return;             // 接口永远要新的
  if (req.headers.has('range')) return;                   // 音频/视频拖动进度不掺和
  if (u.pathname.startsWith('/model/') ||
      u.pathname.includes('/assets/models/') ||
      u.pathname.includes('/assets/vendor/onnxruntime-web/')) return;  // 大文件不进缓存

  if (req.mode === 'navigate') {
    event.respondWith(navigation(req));
    return;
  }
  if (/\\.(png|jpe?g|webp|gif|svg|avif|ico)$/i.test(u.pathname)) {
    event.respondWith(cacheFirstImage(req));
    return;
  }
  event.respondWith(staleWhileRevalidate(req));
});
`;

await fs.writeFile(path.join(ROOT, 'sw.js'), sw, 'utf8');

console.log(`sw.js 已生成：版本 ${VERSION}，预缓存 ${files.length} 个文件，约 ${totalKB} KB`);
for (const [rel, bytes] of sizes.slice().sort((a, b) => b[1] - a[1]).slice(0, 6)) {
  console.log(`  ${(bytes / 1024).toFixed(0).padStart(5)} KB  ${rel}`);
}
