/**
 * plugins/stage.js — 随机插画引擎
 * ------------------------------------------------------------------
 * 统一处理「取图 → 校验 → 展示 → 历史 → 跳转 Pixiv」的完整链路。
 *
 * 数据源来自 Registry.imageProviders，每个 provider：
 *   kind:'local'   → 读取 data/gallery.json 或本地已添加的图片
 *   kind:'remote'  → 请求远端 API，用 pick(json) 提取 URL 数组
 *   kind:'pixiv'   → 只产出 Pixiv 深链，不返回图片本体
 *
 * 稳定性策略：
 *   1. 单个源失败自动切到下一个源（整轮失败则回退本地 / 占位图）
 *   2. 图片 URL 会做一次 Image 预加载校验（5s 超时），坏图不计入历史
 *   3. 所有结果写入本地历史，刷新后依然可见
 */

import { Registry } from '../core/registry.js';
import { PIXIV, API } from '../config/site.config.js';
import { bus } from '../core/bus.js';

const HISTORY_MAX = 40;
const HISTORY_KEY = 'ft.terminal.artHistory';
const ALLOW_KEY = 'ft.terminal.allowlist';

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function saveHistory(arr) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(0, HISTORY_MAX))); } catch { /* ignore */ }
}
function loadAllow() {
  try { return JSON.parse(localStorage.getItem(ALLOW_KEY) || '[]'); } catch { return []; }
}
function saveAllow(arr) {
  try { localStorage.setItem(ALLOW_KEY, JSON.stringify(arr.slice(0, 300))); } catch { /* ignore */ }
}

/** Pixiv 作品 id → 可显示的图片地址
 *
 * 为什么不用 i.pximg.net 直链：国内网络下 pixiv.net / i.pximg.net 被 DNS 污染
 * （实测解析到 FaceBook / 投毒 IP），而且 i.pximg.net 有防盗链（Referer 不对 403）。
 * 所以走可达的社区镜像 pixiv.re：/{id}.jpg 是第 0 页，多图用 /{id}-{页码}.jpg。
 * 配了自建 proxy 模板时优先用它（模板里 {url} 会被替换成镜像地址）。
 */
export function pixivImageUrl(id, { page = 0 } = {}) {
  if (!id) return '';
  const mirror = PIXIV.mirror || '';
  if (!mirror) return '';
  const raw = page ? `${mirror}/${id}-${page}.jpg` : `${mirror}/${id}.jpg`;
  if (!PIXIV.proxy) return raw;
  return PIXIV.proxy.includes('{url}')
    ? PIXIV.proxy.replace('{url}', encodeURIComponent(raw))
    : `${PIXIV.proxy}${encodeURIComponent(raw)}`;
}

/** 从 Pixiv 作品链接里解析作品 id（也支持纯数字） */
export function parsePixivId(input) {
  const s = String(input ?? '').trim();
  if (/^\d{4,12}$/.test(s)) return s;
  const m = /artworks\/(\d+)/.exec(s) || /illust_id=(\d+)/.exec(s) || /(\d{5,12})/.exec(s);
  return m ? m[1] : '';
}

/** 通过本地静态清单取图 */
const manifestCache = new Map();   // file → { at, items }

/**
 * 读取一份本地图片清单。
 *
 * 目前有两份：
 *   data/gallery.json  站点自带的示例画廊（也可以在控制台里手工加）
 *   data/album.json    手机相册导入的照片（由 tools/album-build.py 生成）
 * provider 里用 file 字段指定读哪一份，两份走同一个函数。
 *
 * 清单里带 thumb 时会一并读出来 —— 网格用缩略图，灯箱/舞台用正图。
 */
export async function loadManifest(file = 'data/gallery.json', { ttl = 60000 } = {}) {
  const hit = manifestCache.get(file);
  if (hit && Date.now() - hit.at < ttl) return hit.items;

  const list = [];
  try {
    const res = await fetch(file, { cache: 'no-cache' });
    if (res.ok) {
      const json = await res.json();
      const items = Array.isArray(json) ? json : (json.items || []);
      items.forEach((it) => {
        const url = typeof it === 'string' ? it : it.url;
        if (!url) return;
        const o = typeof it === 'string' ? {} : it;
        list.push({
          url,
          thumb: o.thumb || '',
          title: o.title || '',
          author: o.author || '',
          pixivId: o.pixivId || '',
          width: o.width || 0,
          height: o.height || 0,
        });
      });
    }
  } catch { /* 文件不存在或离线时忽略 */ }

  // 手动收藏的图片并进默认画廊；相册清单不混入，保持「相册 = 手机照片」的语义
  if (file === 'data/gallery.json') {
    loadAllow().forEach((url) => {
      if (!list.some((it) => it.url === url)) list.push({ url, thumb: '', title: '本地添加', author: '' });
    });
  }
  manifestCache.set(file, { at: Date.now(), items: list });
  return list;
}

/* ---------------- 随机但不重复（洗牌袋） ----------------
 * 早期实现是「先 slice(0, count) 再打乱」，清单一大就永远只出现最前面几张：
 * 相册 180 张时实际只有前 12 张能被抽到，看起来就像随机坏掉了。
 *
 * 现在按「洗牌袋」发牌：整份清单打乱后顺序取用，取完一轮再重新洗牌。
 * 于是同一轮内不会重复，跨轮也不会总是同一批，而且每张都能轮到。
 */
const bags = new Map();

export function drawFromBag(key, list, count) {
  if (!list?.length || count <= 0) return [];
  let bag = bags.get(key);
  if (!bag || bag.size !== list.length) {
    bag = { size: list.length, order: [], cursor: 0 };
    bags.set(key, bag);
  }
  const want = Math.min(count, list.length);
  const out = [];
  while (out.length < want) {
    if (bag.cursor >= bag.order.length) {
      // Fisher–Yates，比 sort(() => Math.random() - 0.5) 分布更均匀
      const order = list.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      bag.order = order;
      bag.cursor = 0;
    }
    out.push(list[bag.order[bag.cursor++]]);
  }
  return out;
}

/** 清掉某个源的洗牌袋（换清单 / 换数据源时用） */
export function resetBag(key) { bags.delete(key); }

/** 本地源：从整份清单里抽 count 张 —— 关键点是不能只取前几张 */
async function fromLocal(provider, count = 12) {
  const list = await loadManifest(provider?.file || 'data/gallery.json');
  return drawFromBag(`local:${provider?.id || 'local'}`, list, count);
}

/** 已经成功加载过的图片地址（按数据源分组）
 *  作用：pixiv.re 这类镜像是「按需回源」的，同一张图第二次取只要几毫秒。
 *  所以随机时优先挑已经预热过的地址，避免每次都重新等一次回源。 */
const warmed = new Map();

/** 通过远端 API 取图
 *  endpoint 可以是字符串，也可以是 ({ exclude }) => string 的函数：
 *  后者用于把「本次会话已经展示过的 id」报给服务端，避免又发回同一张。 */
async function fromRemote(provider, { exclude = [] } = {}) {
  const init = { method: provider.method || 'GET', headers: {} };
  if (provider.method === 'POST') {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(provider.body || {});
  }
  const target = typeof provider.endpoint === 'function'
    ? provider.endpoint({ exclude })
    : provider.endpoint;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), provider.timeout || 8000);
  try {
    const res = await fetch(target, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const picked = (provider.pick ? provider.pick(json) : json) || [];
    // pick 既可以返回字符串数组，也可以返回带元数据的对象数组。
    // 地址允许 http(s) 与本机绝对路径（pixiv 的图走本站 /api/pixiv/image 缓存代理）。
    return picked
      .map((it) => (typeof it === 'string' ? { url: it } : it))
      .filter((it) => it && typeof it.url === 'string' && /^(https?:\/\/|\/)/.test(it.url))
      .map((it) => ({
        url: it.url,
        thumb: it.thumb || '',
        full: it.full || '',
        title: it.title || '',
        author: it.author || provider.label,
        pixivId: it.pixivId || '',
        pixiv: it.pageUrl || '',
      }));
  } finally {
    clearTimeout(t);
  }
}

/** 预加载校验：确认图片真的能显示 */
function probe(url, timeout = 6000) {
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const finish = (ok) => { if (done) return; done = true; img.src = ''; resolve(ok); };
    const timer = setTimeout(() => finish(false), timeout);
    img.onload = () => { clearTimeout(timer); finish(img.naturalWidth > 0); };
    img.onerror = () => { clearTimeout(timer); finish(false); };
    img.referrerPolicy = 'no-referrer';
    img.src = url;
  });
}

async function fetchFromProvider(provider, count = 12) {
  if (!provider) return [];
  if (provider.kind === 'local') return fromLocal(provider, count);
  if (provider.kind === 'remote') return fromRemote(provider);
  return [];
}

export const Stage = {
  history: [],
  cursor: -1,
  busy: false,
  /** 当前展示的图片对象 { url, title, author, pixivId } */
  current: null,
  /** 已缓存的候选池，按数据源分组 */
  pool: new Map(),
  /** 本次会话已经展示过的作品 id（pixiv 靠它保证不重复） */
  seenIds: [],

  init() {
    this.history = loadHistory();
    this.cursor = this.history.length - 1;
    this.current = this.history[this.cursor] || null;
    return this;
  },

  get allowlist() { return loadAllow(); },

  addToAllowlist(url) {
    if (!url) return;
    const arr = loadAllow();
    if (!arr.includes(url)) { arr.unshift(url); saveAllow(arr); }
  },

  removeFromAllowlist(url) {
    saveAllow(loadAllow().filter((u) => u !== url));
  },

  clearHistory() {
    this.history = [];
    this.cursor = -1;
    this.current = null;
    this.seenIds = [];
    saveHistory([]);
    bus.emit('art:change', { current: null, history: [] });
  },

  _push(entry) {
    const dedup = this.history.filter((h) => h.url !== entry.url);
    dedup.push(entry);
    this.history = dedup.slice(-HISTORY_MAX);
    this.cursor = this.history.length - 1;
    // 记下本会话展示过的作品 id（pixiv 用它向服务端要求「换一批没见过的」）
    if (entry.pixivId) {
      this.seenIds = [entry.pixivId, ...this.seenIds.filter((x) => x !== entry.pixivId)].slice(0, 120);
    }
    saveHistory(this.history);
  },

  /** 取一批候选图（带缓存） */
  async candidates(providerId, count = 12) {
    const provider = Registry.getImageProvider(providerId);
    if (!provider) return [];
    const key = `${providerId}:${count}`;
    if (this.pool.has(key) && this.pool.get(key).length) return this.pool.get(key);
    const items = await fetchFromProvider(provider, count);
    if (items.length) this.pool.set(key, items);
    return items;
  },

  /**
   * 随机一张插画
   * @param {{ provider?: string, count?: number, silent?: boolean }} opts
   * @returns {Promise<object|null>} 图片对象
   */
  async random({ provider = null, count = 12, silent = false } = {}) {
    if (this.busy) return null;
    this.busy = true;
    bus.emit('art:loading', { provider });
    const order = provider
      ? [Registry.getImageProvider(provider)].filter(Boolean)
      : [
          ...Registry.imageProviders.filter((p) => p.kind !== 'pixiv'),
          ...Registry.imageProviders.filter((p) => p.kind === 'pixiv'),   // 深链兜底永远排最后
        ].filter(Boolean);

    try {
      for (const p of order) {
        if (p.kind === 'pixiv') {
          // Pixiv 深链模式：产出一条可跳转的入口记录
          const kw = PIXIV.keywords[Math.floor(Math.random() * PIXIV.keywords.length)] || PIXIV.defaultKeyword;
          const entry = {
            url: '', title: `Pixiv 搜索 · ${kw}`, author: 'PIXIV', pixiv: PIXIV.searchUrl(kw), keyword: kw,
          };
          this._push(entry);
          this.current = entry;
          bus.emit('art:change', { current: entry, history: this.history, source: 'pixiv' });
          return entry;
        }

        // 已经展示过的作品 id（本次会话）：报给服务端，要求换一批没见过的
        const seen = [...new Set([
          ...this.seenIds,
          ...this.history.map((h) => h.pixivId).filter(Boolean),
        ])].slice(0, 80);

        // 本地源每次都要重新发牌（缓存池会让「随机」永远停在同一批图上）；
        // 标注了 freshEachDraw 的远端源（pixiv）也不走缓存，每次都要没见过的；
        // 其余远端源才做池缓存，避免频繁打接口。
        let items;
        if (p.kind === 'local') items = await fetchFromProvider(p, count).catch(() => []);
        else if (p.freshEachDraw) items = await fromRemote(p, { exclude: seen }).catch(() => []);
        else items = await this.candidates(p.id, count).catch(() => []);
        if (!items.length && p.kind === 'remote' && !p.freshEachDraw) {
          items = await fromRemote(p).catch(() => []);
        }
        if (!items.length) continue;

        // 再加一道保险：把本次会话出现过的 id / 最近 5 张都排除掉
        const recent = new Set(this.history.slice(-5).map((h) => h.url).filter(Boolean));
        const seenIds = new Set(this.seenIds);
        const fresh = items.filter((e) => !recent.has(e.url) && !(e.pixivId && seenIds.has(e.pixivId)));
        const source = fresh.length ? fresh : items;

        // 这个池子快用完了就丢掉，下次重新拉一批，避免一直在这十几张里打转
        if (p.kind === 'remote' && items.length) {
          const used = items.filter((e) => recent.has(e.url)).length;
          if (used >= items.length - 2) this.pool.delete(`${p.id}:${count}`);
        }

        // 打乱后逐个校验，最多试 4 个，避免慢源拖死体验。
        // 超时按数据源可配：pixiv 镜像首次要回源，20-40 秒是常态，
        // 用默认 6 秒会把好图误判成坏图（这里给它 45 秒）。
        const shuffled = [...source].sort(() => Math.random() - 0.5).slice(0, 4);
        const budget = p.probeTimeout || (p.kind === 'local' ? 4000 : 6000);
        const warm = warmed.get(p.id) || new Set();
        warmed.set(p.id, warm);
        // 已经预热过的排前面：镜像第二次取同一张只要几毫秒，用户几乎不用等
        const ordered = [
          ...shuffled.filter((e) => warm.has(e.url)),
          ...shuffled.filter((e) => !warm.has(e.url)),
        ];
        for (const entry of ordered) {
          // skipProbe：不做「先探测再显示」。图已经过本站代理 + 磁盘缓存，
          // 探测只会让用户白等；直接交给 <img> 边下边显示，坏了由 onerror 兜。
          if (!p.skipProbe) {
            const ok = await probe(entry.url, budget);
            if (!ok) continue;
          }
          warm.add(entry.url);
          const record = { ...entry, source: p.id };
          this._push(record);
          this.current = record;
          // 顺手预热同批里的其他候选（成像即缓存）：下次点「随机插画」就能秒开
          if (p.kind === 'remote') {
            shuffled.filter((e) => !warm.has(e.url)).slice(0, 3)
              .forEach((e) => { probe(e.url, budget).then((ok2) => ok2 && warm.add(e.url)).catch(() => {}); });
          }
          bus.emit('art:change', { current: record, history: this.history, source: p.id });
          return record;
        }
        // 该源全部失败，清缓存后尝试下一个
        this.pool.delete(`${p.id}:${count}`);
      }

      // 全部失败：回退历史
      if (this.history.length) {
        const last = this.history[this.history.length - 1];
        this.current = last;
        bus.emit('art:change', { current: last, history: this.history, source: 'history' });
        if (!silent) bus.emit('toast', { message: '所有插画数据源不可用，显示历史记录', kind: 'err' });
        return last;
      }
      if (!silent) bus.emit('toast', { message: '插画数据源不可用：请检查网络或改用本地画廊', kind: 'err' });
      bus.emit('art:change', { current: null, history: [] });
      return null;
    } finally {
      this.busy = false;
    }
  },

  /** 回到上一张（历史游标前移） */
  back() {
    if (this.cursor <= 0) return null;
    this.cursor--;
    this.current = this.history[this.cursor];
    bus.emit('art:change', { current: this.current, history: this.history, source: 'history' });
    return this.current;
  },

  forward() {
    if (this.cursor >= this.history.length - 1) return null;
    this.cursor++;
    this.current = this.history[this.cursor];
    bus.emit('art:change', { current: this.current, history: this.history, source: 'history' });
    return this.current;
  },

  /** 打开 Pixiv（当前图带 pixivId 则直达作品页，否则走搜索） */
  openPixiv(keyword) {
    const kw = keyword || this.current?.keyword || PIXIV.defaultKeyword;
    const id = this.current?.pixivId;
    const url = id ? PIXIV.artworkUrl(id) : PIXIV.searchUrl(kw);
    window.open(url, '_blank', 'noopener');
    return url;
  },

  /** 生成一条可下载 / 可复制的本地画廊记录 */
  toGalleryJSON() {
    return JSON.stringify(this.history.filter((h) => h.url).map((h) => ({
      url: h.url, title: h.title || '', author: h.author || '', pixivId: h.pixivId || '',
    })), null, 2);
  },
};

/** 供管理端检查 server.mjs 是否在线 */
export async function probeServer() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), API.timeout);
    const res = await fetch(`${API.base}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch { return false; }
}
