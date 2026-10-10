/**
 * core/store.js — 内容仓库
 * ------------------------------------------------------------------
 * 单一数据源。所有文章 / 公告都从这里读写，视图只订阅不直接改。
 *
 * 数据流：
 *   data/posts.json, data/news.json (内置种子)
 *        └─→ 首次访问播种到 localStorage
 *   GET /api/content/<集合>（可选的"线上覆盖层"，见 loadServerOverlay）
 *        └─→ 合并到种子之上，线上发布的内容才能在公开页面显示出来
 *   用户在后台「发布」→ 写入 localStorage（local: true）
 *        └─→ 若运行在 server.mjs 上，同时 POST /api/content（本地写文件 / 线上写 Blobs）
 *
 * 扩展新集合：在 COLLECTIONS 里加一项，然后 createCollection 即可。
 */

import { STORAGE_PREFIX, CONTENT_VERSION, API } from '../config/site.config.js';
import { bus } from './bus.js';
import { Auth } from '../plugins/auth.js';
import { parseFrontmatter, excerpt, stats } from '../util/markdown.js';

const LS = {
  posts: `${STORAGE_PREFIX}.posts`,
  news: `${STORAGE_PREFIX}.news`,
  read: `${STORAGE_PREFIX}.read`,
  version: `${STORAGE_PREFIX}.version`,
  settings: `${STORAGE_PREFIX}.settings`,
};

/* ---------------- 基础工具 ---------------- */

export const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn('[store] 写入本地失败', err);
    bus.emit('toast', { message: '本地存储写入失败（可能是隐私模式）', kind: 'err' });
    return false;
  }
}

/** 安全读取 localStorage（file:// 或隐私模式下可能抛错） */
function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

/**
 * file:// 直接打开时 fetch 会被浏览器拦截，此时退化为内置种子，
 * 保证站点依然有内容可看。把这三条替换成真实内容即可。
 */
const FALLBACK_SEED = {
  posts: [
    {
      id: 'post_offline_seed',
      title: '离线模式：内置示例内容',
      summary: '当前是以 file:// 直接打开页面，浏览器拦截了 fetch，因此这里显示内置示例。运行 node server.mjs 即可读取 data/ 目录中的真实内容。',
      category: '公告',
      tags: ['离线', '说明'],
      date: new Date().toISOString(),
      pinned: true,
      content: '## 为什么看到的是示例内容\n\n浏览器的同源策略禁止 `file://` 页面用 `fetch` 读取本地 JSON 文件，所以站点无法加载 `data/posts.json`。\n\n## 解决办法\n\n在项目目录执行：\n\n```bash\nnode server.mjs\n```\n\n然后访问 `http://localhost:5173`，即可看到 `data/` 目录中的全部内容，并且能在控制台里直接发布。\n\n> [!TIP]\n> 也可以使用任意静态服务器，例如 `python -m http.server`。',
    },
  ],
  news: [
    {
      id: 'news_offline_seed',
      title: '提示：建议通过本地服务器访问',
      summary: '使用 file:// 打开会限制 ES 模块与 fetch，部分功能（内容加载、发布控制台写入）会降级。',
      category: '维护',
      tags: ['提示'],
      date: new Date().toISOString(),
      level: 1,
      pinned: true,
      content: '运行 `node server.mjs` 后访问 **http://localhost:5173** 可获得完整体验：\n\n- 读取 `data/posts.json` 与 `data/news.json`\n- 控制台保存内容时直接写入项目文件\n- 随机插画与音乐播放不受 file:// 限制影响',
    },
  ],
};

/** 统一时间显示：2025.03.07 */
export function fmtDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '----.--.--';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

export function fmtTime(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '--:--';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 相对时间：3 分钟前 / 2 天前 */
export function fmtRelative(iso) {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return '—';
  const diff = Date.now() - d;
  const min = Math.round(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} 小时前`;
  const day = Math.round(h / 24);
  if (day < 30) return `${day} 天前`;
  return fmtDate(iso);
}

/** 把任意来源（对象 / frontmatter 文本）规范成内容记录 */
export function normalizeItem(input, kind = 'posts') {
  const isString = typeof input === 'string';
  const { data, body } = isString ? parseFrontmatter(input) : { data: {}, body: '' };
  const src = isString ? data : input || {};
  const content = isString ? body : (src.content ?? src.body ?? '');
  const s = stats(content);
  return {
    id: src.id || uid(kind === 'news' ? 'news' : 'post'),
    title: src.title || '未命名',
    summary: src.summary || excerpt(content, 150),
    content,
    category: src.category || (kind === 'news' ? '公告' : '日志'),
    tags: Array.isArray(src.tags) ? src.tags : (src.tags ? String(src.tags).split(/[,，\s]+/).filter(Boolean) : []),
    cover: src.cover || '',
    author: src.author || '',
    date: src.date ? new Date(src.date).toISOString() : new Date().toISOString(),
    updatedAt: src.updatedAt ? new Date(src.updatedAt).toISOString() : null,
    pinned: !!src.pinned,
    draft: !!src.draft,
    /** 重要程度：news 用，0 普通 / 1 重要 / 2 紧急 */
    level: Number(src.level) || 0,
    /** 是否由本地后台创建（用于区分内置种子） */
    local: !!src.local,
    stats: s,
  };
}

/* ---------------- 服务端内容覆盖层 ---------------- */

/**
 * 取"线上发布的那部分内容"。
 *
 * 为什么必须有这一步：线上部署里函数读不到仓库那份 `data/*.json`（产物只含 server.mjs），
 * 所以 `GET /api/content/<集合>` 在线上只能回**线上发布过的覆盖层**
 * （`overlayOnly: true`），由前端把它合并到静态种子之上；本地跑 server.mjs 时它回的是
 * 文件里的全量（`overlayOnly: false`），那就直接用。
 *
 * 另外注意：这个接口现在返回的是**对象**（`{ ok, items, deleted, storage, overlayOnly }`），
 * 不再是裸数组 —— 两种都认，免得服务端回退时把页面搞白。
 *
 * 失败一律静默：纯静态托管、没网、接口不存在时，站点必须照旧能用（这块是增强，不是依赖）。
 */
async function loadServerOverlay(name) {
  if (!API.enabled || location.protocol === 'file:') return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), API.timeout || 4000);
    const res = await fetch(`${API.base}/content/${encodeURIComponent(name)}`, {
      signal: ctrl.signal,
      cache: 'no-store',
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const json = await res.json();
    const items = Array.isArray(json) ? json : (Array.isArray(json?.items) ? json.items : []);
    return {
      items,
      /**
       * 墓碑：线上**删除过**的 id 列表。
       *
       * 为什么需要它：线上覆盖层只记"写过什么"，删除只是把那条从覆盖层里拿掉 ——
       * 合并到静态种子之上时，仓库里那份又会冒出来，表现就是"线上删掉的公告，
       * 刷新一次又回来了"。所以服务端把删除记成 id 列表，客户端在合并之后按它过滤。
       * 字段不存在（旧服务端 / 纯静态部署）时当空数组，不要报错。
       */
      deleted: (Array.isArray(json) ? [] : (Array.isArray(json?.deleted) ? json.deleted : [])).map(String),
      overlayOnly: Array.isArray(json) ? false : json?.overlayOnly === true,
      storage: (Array.isArray(json) ? '' : json?.storage) || '',
    };
  } catch {
    return null;   // 静默：没有服务端也要能看内容
  }
}

/**
 * 合并覆盖层与种子：**覆盖层在前、种子在后，同 id 只留一份**（覆盖层胜出）。
 * 顺序很重要 —— 列表是按日期排的，但"线上发布的那条"应当出现在种子之前，
 * 这样即使时间字段没变，用户也能立刻看到自己刚发的内容。
 */
function mergeOverlay(overlay, base) {
  const seen = new Set();
  const out = [];
  for (const item of [...overlay, ...base]) {
    const id = item?.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

/* ---------------- 集合 ---------------- */

/**
 * 创建一个内容集合。插件可用它注册自己的内容类型，自动获得
 * 播种 / 排序 / 持久化 / 增删改查 / 导入导出全套能力。
 * 集合需同时登记到 server.mjs 的 COLLECTIONS 才能通过 API 落盘。
 */
export function createCollection(name, { seedFile, kind }) {
  let items = [];
  const listeners = new Set();

  const persist = () => {
    writeJSON(LS[name], items);
    bus.emit('content:change', { collection: name });
    listeners.forEach((fn) => fn(items));
  };

  /**
   * 排序：置顶在前，其余按日期倒序。
   * 日期这里要"容错 + 确定"：线上覆盖层里若有条目没带（或带坏了）date，
   * `new Date(undefined) - new Date(x)` 会算出 NaN —— 比较器返回 NaN 时排序结果是不确定的，
   * 表现为列表每次刷新顺序都不一样，甚至盖掉刚发布的那条。缺日期一律当最旧。
   */
  const timeOf = (x) => {
    const t = new Date(x?.date).getTime();
    return Number.isFinite(t) ? t : 0;
  };
  const sort = (arr) =>
    arr.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return timeOf(b) - timeOf(a);
    });

  async function loadSeed() {
    // file:// 下 fetch 必然失败，直接用内置种子，避免控制台报错
    if (location.protocol === 'file:') {
      return (FALLBACK_SEED[name] || []).map((x) => normalizeItem(x, kind));
    }
    if (!seedFile) return [];
    try {
      const res = await fetch(seedFile, { cache: 'no-cache' });
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      return (Array.isArray(json) ? json : json.items || []).map((x) => normalizeItem(x, kind));
    } catch (err) {
      console.warn(`[store] 种子数据加载失败 ${seedFile}，使用内置示例`, err);
      return (FALLBACK_SEED[name] || []).map((x) => normalizeItem(x, kind));
    }
  }

  return {
    name,
    get all() { return items; },
    get published() { return items.filter((x) => !x.draft); },
    get drafts() { return items.filter((x) => x.draft); },
    get(id) { return items.find((x) => x.id === id) || null; },
    get sorted() { return sort([...items]); },

    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    /** 首次播种：本地没有数据时用种子填充；随后叠加服务端的线上覆盖层 */
    async init(force = false) {
      // ① 基底：上次访问留在浏览器里的那份，其次是仓库里的静态种子。
      //    静态种子在线上也一定存在（它是部署产物的一部分），所以它同时是离线兜底。
      const stored = readJSON(LS[name], null);
      let base;
      if (!force && Array.isArray(stored)) {
        base = stored.map((x) => normalizeItem(x, kind));
        if (!base.length) base = await loadSeed();
      } else {
        base = await loadSeed();
      }

      // ② 叠加服务端：本地（fs）回的是全量，线上（blobs）回的只是覆盖层
      const remote = await loadServerOverlay(name);
      const tombstones = new Set(remote?.deleted || []);
      if (remote && !remote.overlayOnly) {
        // 服务端说"这就是完整内容"（本地读的就是 data/<集合>.json）→ 直接以它为准
        items = remote.items.map((x) => normalizeItem(x, kind));
      } else if (remote && remote.overlayOnly) {
        // 线上：静态种子打底，线上发布的那部分盖在上面
        items = mergeOverlay(
          remote.items.map((x) => normalizeItem(x, kind)),
          base,
        );
      } else {
        items = base;
      }

      // ③ 墓碑过滤：线上删过的 id 一律不出现 —— 不管它来自覆盖层还是仓库种子。
      //    没有这一步，线上删掉一条本来写在 data/*.json 里的公告，刷新一次它就又回来了。
      //    本地形态 / 旧服务端没有 deleted 字段时集合恒为空，这里等于没执行。
      if (tombstones.size) {
        items = items.filter((x) => !tombstones.has(String(x?.id)));
      }

      items = sort(items);
      persist();
      bus.emit('content:change', { collection: name, phase: 'init', storage: remote?.storage || '' });
      return items;
    },

    /** 新增或更新（按 id 判断） */
    upsert(input, { silent = false } = {}) {
      const item = normalizeItem(input, kind);
      const idx = items.findIndex((x) => x.id === item.id);
      if (idx >= 0) {
        item.local = items[idx].local || item.local;
        item.updatedAt = new Date().toISOString();
        items[idx] = item;
      } else {
        item.local = true;
        items.push(item);
      }
      sort(items);
      if (!silent) persist();
      return item;
    },

    remove(id) {
      const before = items.length;
      items = items.filter((x) => x.id !== id);
      if (items.length !== before) persist();
      return before !== items.length;
    },

    /** 切换置顶 */
    togglePin(id) {
      const it = items.find((x) => x.id === id);
      if (!it) return;
      it.pinned = !it.pinned;
      sort(items);
      persist();
    },

    /** 导入：合并同 id 覆盖 */
    importJSON(json, { replace = false } = {}) {
      const arr = (Array.isArray(json) ? json : json.items || []).map((x) => normalizeItem(x, kind));
      if (replace) items = arr;
      else {
        const map = new Map(items.map((x) => [x.id, x]));
        arr.forEach((x) => map.set(x.id, x));
        items = [...map.values()];
      }
      sort(items);
      persist();
      return arr.length;
    },

    exportJSON() {
      return JSON.stringify(sort([...items]).map((x) => ({ ...x, local: undefined })), null, 2);
    },

    replaceAll(arr) { items = sort(arr.map((x) => normalizeItem(x, kind))); persist(); },
  };
}

export const Posts = createCollection('posts', { seedFile: 'data/posts.json', kind: 'posts' });
export const News = createCollection('news', { seedFile: 'data/news.json', kind: 'news' });

/* ---------------- 已读状态 ---------------- */

const readSet = new Set(readJSON(LS.read, []));

export const ReadState = {
  has(id) { return readSet.has(id); },
  mark(id) {
    if (readSet.has(id)) return;
    readSet.add(id);
    writeJSON(LS.read, [...readSet]);
    bus.emit('content:change', { collection: 'read' });
  },
  markAll(ids) {
    ids.forEach((i) => readSet.add(i));
    writeJSON(LS.read, [...readSet]);
    bus.emit('content:change', { collection: 'read' });
  },
  reset() {
    readSet.clear();
    writeJSON(LS.read, []);
    bus.emit('content:change', { collection: 'read' });
  },
  get unreadNews() {
    return News.published.filter((n) => !readSet.has(n.id)).length;
  },
  get unreadPosts() {
    return Posts.published.filter((n) => !readSet.has(n.id)).length;
  },
};

/* ---------------- 用户设置 ---------------- */

const DEFAULT_SETTINGS = { theme: 'paper', density: 'normal', shuffle: false, volume: 0.8, reduceMotion: false };
let settings = { ...DEFAULT_SETTINGS, ...readJSON(LS.settings, {}) };

export const Settings = {
  get all() { return { ...settings }; },
  get(key) { return settings[key]; },
  set(key, value) {
    settings[key] = value;
    writeJSON(LS.settings, settings);
    return value;
  },
  patch(obj) { Object.assign(settings, obj); writeJSON(LS.settings, settings); },
  reset() { settings = { ...DEFAULT_SETTINGS }; writeJSON(LS.settings, settings); },
};

/* ---------------- 版本迁移 ---------------- */

export async function migrateIfNeeded() {
  const v = Number(safeGet(LS.version) || 0);
  if (v === CONTENT_VERSION) return false;
  safeSet(LS.version, String(CONTENT_VERSION));
  // 未来新增版本时在此追加迁移分支
  return true;
}

/** 一次性初始化所有集合 */
export async function initStore() {
  const migrated = await migrateIfNeeded();
  await Promise.all([
    Posts.init(migrated),
    News.init(migrated),
  ]);
  return { Posts, News, unread: ReadState.unreadNews };
}

/* ---------------- 远端 API（可选） ---------------- */

export const Api = {
  available: false,
  async probe() {
    if (!API.enabled) return false;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), API.timeout);
      const res = await fetch(`${API.base}/health`, { signal: ctrl.signal });
      clearTimeout(t);
      this.available = res.ok;
    } catch {
      this.available = false;
    }
    return this.available;
  },
  /**
   * 保存到服务端。
   * 返回 { ok, status, storage, file, error } —— storage 是 'fs'（本地写文件）或 'blobs'（线上内容存储），
   * 界面据此决定提示语：线上说"已写入 data/xxx.json"是假话，用户会去仓库里找不到东西。
   */
  async save(collection, item) {
    if (!this.available) return { ok: false, status: 0, storage: '', file: '', error: '服务器不在线' };

    /**
     * 带上登录令牌（配了账号体系时）。
     *
     * 为什么必须带：服务端把"公告 / 网站文案"的写入判为**仅站长**，不带 Bearer 直接 401。
     * 而界面若把它当成"写入失败、已存本地"，用户会以为发布成功了 —— 线上其实什么都没有，
     * 这是最误导的一种失败。
     *
     * 为什么要有分支：`Auth.enabled === false`（没配 Auth0 的纯本机部署）时必须保持老路 ——
     * 本地那台 node server.mjs 对回环地址免登录，不带令牌也能写文件 + git。
     * （core 直接引 plugins/auth 看着像跨层，但这条写入路径的鉴权就在这里，抽一层反而绕。）
     */
    if (Auth.enabled) {
      const r = await Auth.api(`/content/${encodeURIComponent(collection)}`, { method: 'POST', body: item });
      return {
        ok: r.ok,
        status: r.status,
        storage: r.data?.storage || '',
        file: r.data?.file || '',
        error: r.error,
      };
    }

    try {
      const res = await fetch(`${API.base}/content/${collection}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        return { ok: false, status: res.status, storage: data?.storage || '', file: '', error: data?.error || `HTTP ${res.status}` };
      }
      return { ok: true, status: res.status, storage: data?.storage || '', file: data?.file || '', data };
    } catch (err) {
      return { ok: false, status: 0, storage: '', file: '', error: String(err?.message || err) };
    }
  },
  async remove(collection, id) {
    if (!this.available) return { ok: false, status: 0, error: '服务器不在线' };
    if (Auth.enabled) {
      const r = await Auth.api(`/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return { ok: r.ok, status: r.status, error: r.error };
    }
    try {
      const res = await fetch(`${API.base}/content/${collection}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok) return { ok: true, status: res.status, error: null };
      const data = await res.json().catch(() => null);
      return { ok: false, status: res.status, error: data?.error || `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, status: 0, error: String(err?.message || err) };
    }
  },
  async tree() {
    if (!this.available) return null;
    try {
      const res = await fetch(`${API.base}/tree`);
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  },
};
