/**
 * storage.mjs — 内容存储的双驱动
 * ==================================================================
 * 为什么需要它：Netlify 上的部署产物是**只读**的（所以原来写内容一律 501），
 * 但 Netlify 提供了 Blobs（跨部署持久的键值存储）。于是：
 *
 *   · 本地 `node server.mjs` → 直接写磁盘 `data/…`
 *     好处：改完就是一条 git diff，能进仓库、能 review、能回滚。
 *   · 线上（Netlify Functions）→ 写 Blobs
 *     好处：不用重新部署就能发布内容，且刷新页面即可见。
 *
 * 两者对上层是**同一个接口**，所以 server.mjs 里不需要满处判断"我跑在哪"。
 * 部署形态下还要把仓库里那份 `data/*.json` 当**种子**：线上第一次读取时，
 * Blobs 里可能还没有任何东西，此时展示仓库里的内容；一旦线上发布了，
 * 就按 id 合并（线上覆盖种子）—— 这样"网站现有文案"不会因为上线而消失。
 *
 * Blobs 的模块（@netlify/blobs）**只在线上动态引入**：本地不装依赖也能跑。
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

/** 只允许这种形态的 id 落到文件路径上（防目录穿越） */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SAFE_NAME = /^[A-Za-z0-9_-]{1,40}$/;

function assertSafe(value, re, what) {
  if (!re.test(String(value || ''))) throw new Error(`非法的${what}：${String(value).slice(0, 40)}`);
}

/** 按 id 合并两份列表：覆盖者胜出，顺序保持"覆盖者在前" */
function mergeById(base, over) {
  const out = [];
  const seen = new Set();
  for (const item of [...(over || []), ...(base || [])]) {
    const id = String(item?.id ?? '');
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    out.push(item);
  }
  return out;
}

export function createStorage({ root, dataDir: dataDirIn, serverless = false, storeName = 'fish-temple', driver: injected = null } = {}) {
  const dataDir = dataDirIn || path.join(root, 'data');

  /** 线上：惰性拿 Blobs store；用 strong 一致性，避免"刚发布却读不到" */
  /**
   * ⚠️ **不要缓存这个 store 实例**（线上真实踩过）：
   * Netlify 给函数注入的 Blobs 凭据是**短时效令牌**（放在 NETLIFY_BLOBS_CONTEXT 里）。
   * `getStore()` 会在构造时把当时的令牌读进去；函数实例变"热"以后如果一直复用同一个实例，
   * 令牌一过期，所有读写在服务端就被判 `Failed to decode token: Token expired` ——
   * 表现是"刚部署能用、过一阵子发布就全部失败"。
   * 每次操作都重新 getStore() 很便宜（只是读环境变量 + 造一个对象），
   * 但能让库每次都从最新上下文里取到有效令牌。
   */
  async function blobs() {
    let mod;
    try {
      mod = await import('@netlify/blobs');
    } catch (err) {
      throw new Error(`线上发布需要 @netlify/blobs（请确认 package.json 已提交且 Netlify 装好了依赖）：${err.message}`);
    }
    return mod.getStore({ name: storeName, consistency: 'strong' });
  }

  /* ---------------- 文件驱动（本地） ---------------- */

  const fsDriver = {
    async readText(key) {
      try { return await fs.readFile(path.join(dataDir, key), 'utf8'); } catch { return null; }
    },
    async writeText(key, text) {
      const full = path.join(dataDir, key);
      await fs.mkdir(path.dirname(full), { recursive: true });
      // 先写临时文件再 rename：中途崩溃不会留下半截 JSON
      const tmp = `${full}.tmp`;
      await fs.writeFile(tmp, text);
      await fs.rename(tmp, full);
    },
    async remove(key) {
      try { await fs.unlink(path.join(dataDir, key)); } catch { /* 本来就不在 */ }
    },
    async list(prefix) {
      try {
        const names = await fs.readdir(path.join(dataDir, prefix));
        return names.filter((n) => n.endsWith('.json')).map((n) => `${prefix}${n}`);
      } catch { return []; }
    },
  };

  /* ---------------- Blobs 驱动（线上） ---------------- */

  const blobsDriver = {
    async readText(key) {
      const s = await blobs();
      return s.get(key, { type: 'text', consistency: 'strong' });
    },
    async writeText(key, text) {
      const s = await blobs();
      await s.set(key, text);
    },
    async remove(key) {
      const s = await blobs();
      await s.delete(key);
    },
    async list(prefix) {
      const s = await blobs();
      const { blobs: entries } = await s.list({ prefix });
      return entries.map((e) => e.key);
    },
  };

  const driver = injected || (serverless ? blobsDriver : fsDriver);

  return {
    // mode 表示"部署语义"（线上=覆盖层 + Blobs；本地=文件即真相），
    // driver 表示"实际谁在写"（本地仿真会注入一个 Blobs 替身，mode 仍是 blobs）
    mode: serverless ? 'blobs' : 'fs',
    driver: injected ? 'injected' : (serverless ? 'blobs' : 'fs'),
    dataDir,

    /**
     * 读一份整文件集合（posts / news / gallery / site 这类）。
     * @param seed 仓库里那份内容（线上当种子；本地忽略，因为文件本身就是它）
     */
    async readCollection(name, seed = null) {
      assertSafe(name, SAFE_NAME, '集合名');
      const raw = await driver.readText(`collections/${name}.json`);
      const stored = raw ? JSON.parse(raw) : null;

      if (!serverless) {
        // 本地：文件就是唯一真相；没有文件时用种子兜底（例如刚 clone 还没写过）
        return stored || seed || null;
      }
      if (!stored) return seed || null;
      if (!seed) return stored;
      // 线上：种子（仓库）+ 线上发布的内容，按 id 合并
      return {
        ...seed,
        ...stored,
        items: mergeById(seed.items, stored.items),
      };
    },

    /** 写一份整文件集合（本地写 data/<name>.json，线上写 Blobs） */
    async writeCollection(name, data) {
      assertSafe(name, SAFE_NAME, '集合名');
      const key = serverless ? `collections/${name}.json` : `${name}.json`;
      await driver.writeText(key, JSON.stringify(data, null, 2));
      return key;
    },

    /** 读一条条目（论坛帖、用户资料这类一条一个文件/一个 blob 的） */
    async readItem(collection, id) {
      assertSafe(collection, SAFE_NAME, '集合名');
      assertSafe(id, SAFE_ID, 'id');
      const raw = await driver.readText(`${collection}/${id}.json`);
      return raw ? JSON.parse(raw) : null;
    },

    async writeItem(collection, id, obj) {
      assertSafe(collection, SAFE_NAME, '集合名');
      assertSafe(id, SAFE_ID, 'id');
      await driver.writeText(`${collection}/${id}.json`, JSON.stringify(obj, null, 2));
      return `${collection}/${id}.json`;
    },

    async removeItem(collection, id) {
      assertSafe(collection, SAFE_NAME, '集合名');
      assertSafe(id, SAFE_ID, 'id');
      await driver.remove(`${collection}/${id}.json`);
    },

    /** 列出某个集合下的 id（不含 .json 后缀），按 key 升序 */
    async listItems(collection) {
      assertSafe(collection, SAFE_NAME, '集合名');
      const keys = await driver.list(`${collection}/`);
      return keys
        .map((k) => k.slice(collection.length + 1).replace(/\.json$/, ''))
        .filter((id) => SAFE_ID.test(id))
        .sort();
    },
  };
}
