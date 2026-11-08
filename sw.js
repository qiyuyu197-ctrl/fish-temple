/**
 * sw.js — Service Worker（由 tools/gen-service-worker.mjs 生成，请勿手改）
 * ------------------------------------------------------------------
 * 版本：c5130a1a86（壳资源 49 个，约 3373 KB）
 * 生成：node tools/gen-service-worker.mjs
 *
 * 想让「装到主屏的 App」离线可用、启动更快，就靠这一份。
 * 想改缓存策略 → 改 tools/gen-service-worker.mjs 里的模板，再重新生成；
 * 直接改这里会在下一次生成时被覆盖。
 *
 * 版本号是全部壳资源内容的指纹，所以「改了文件却忘了重新生成」也不会让用户
 * 永远拿到旧版本：壳资源走 stale-while-revalidate，下一次访问就会换新。
 */

const VERSION = "c5130a1a86";
const CACHE = 'fish-temple-' + VERSION;
const SCOPE = self.registration.scope;
const url = (p) => new URL(p, SCOPE).href;

const SHELL = url('index.html');
const OFFLINE = url('offline.html');

/** 预缓存清单（相对站点根，部署在子路径下也能用） */
const PRECACHE = ["app.bundle.js","assets/icons/apple-touch-icon.png","assets/icons/favicon-32.png","assets/icons/icon-192.png","assets/icons/icon-512-maskable.png","assets/icons/logo.svg","assets/icons/mark-512.png","assets/icons/mark-64.png","assets/patterns/barcode.svg","assets/patterns/dot-matrix.svg","assets/patterns/hud-rings.svg","assets/patterns/hud-ticks.svg","assets/patterns/twill.svg","assets/vendor/lame.min.js","assets/vendor/lunar-javascript/lunar.js","data/album.json","data/anime-covers.json","data/anime-overrides.json","data/anime-sedai-green.json","data/anime-sedai.json","data/anime.json","data/gallery.json","data/netease-auth/76c5173f34e1fa5b7704157fe8e1868d.json","data/netease-meta/anonymous.json","data/netease-meta/device.json","data/netease-meta/secret.json","data/netease-meta/xeapi-key.json","data/news.json","data/posts.json","index.html","manifest.webmanifest","offline.html","styles/almanac.css","styles/app.bundle.css","styles/authpanel.css","styles/background-picker.css","styles/base.css","styles/comments.css","styles/components.css","styles/download.css","styles/ef.css","styles/leaderboard.css","styles/leisure.css","styles/liuli.css","styles/mine-room.css","styles/mobile.css","styles/patterns.css","styles/saucenao.css","styles/tokens.css"].map(url);

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

/** 内容清单：网络优先，离线才回缓存（否则改完文章，老访客会一直看到旧内容） */
async function networkFirstData(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request, { cache: 'no-store' });
    if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
    return res;
  } catch {
    const hit = await cache.match(request);
    return hit || Response.error();
  }
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

/** 导航：先要网络（保证 index.html 不是旧版 6 秒超时页），失败才回缓存/离线页 */
async function navigation(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request, { cache: 'no-store' });
    if (res && res.ok) cache.put(SHELL, res.clone()).catch(() => {});
    if (res) return res;
  } catch { /* 离线 / 网络失败，落到缓存 */ }
  const hit = await cache.match(SHELL);
  if (hit) return hit;
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
  // 内容 JSON 必须网络优先：数据是随部署更新的，stale-while-revalidate 会让老访客
  // 第一次打开仍看到旧文章（正是 2026-11-07 站主看到「最新文章还是以前的」的原因）。
  if (u.pathname.startsWith('/data/')) {
    event.respondWith(networkFirstData(req));
    return;
  }
  if (/\.(png|jpe?g|webp|gif|svg|avif|ico)$/i.test(u.pathname)) {
    event.respondWith(cacheFirstImage(req));
    return;
  }
  event.respondWith(staleWhileRevalidate(req));
});
