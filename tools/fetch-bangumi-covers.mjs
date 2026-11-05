#!/usr/bin/env node
/**
 * tools/fetch-bangumi-covers.mjs — 给文娱板块补 Bangumi 封面直链（不下载图片）
 * ------------------------------------------------------------------
 * 为什么用反代：
 *   bgm.tv / api.bgm.tv / lain.bgm.tv 在当前网络仍被 DNS 污染 / 超时；
 *   bgmapi.anibt.net / bgmimg.anibt.net 是一个公开的 Bangumi 反代，
 *   返回的元数据与图片和 Bangumi 一致，浏览器可以直接 <img src> 加载。
 *   本脚本只请求 JSON 搜索接口，**不会下载任何图片**。
 *
 * 做什么：
 *   1. 对 data/anime.json 里每部番，按日文名 / 海报短名 / 中文名搜 Bangumi
 *   2. 按标题相似度 + 年份 + TV 平台打分，选最像的 subject
 *   3. 把 bangumiId / bangumiCover / bangumiOriginal / bangumiUrl / 评分等
 *      写进 data/anime-covers.json 的对应 item（保留已有 cover 本地兜底）
 *
 * 用法：
 *   node tools/fetch-bangumi-covers.mjs --dry     只打印匹配结果
 *   node tools/fetch-bangumi-covers.mjs --write   写入 data/anime-covers.json
 *   node tools/fetch-bangumi-covers.mjs --only=id1,id2 --dry
 *
 * 注意：
 *   - 页面优先加载 bangumiCover（远程直链），失败后回退到本地 cover（AniList 缓存），
 *     再失败才回退 CSS 海报；不会新增本地图片。
 *   - 如果以后能直连 lain.bgm.tv，可以把 bangumiOriginal 换成主地址；
 *     现在 bangumiOriginal 只作为记录，页面用的是反代地址。
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DATA_FILE = path.join(ROOT, 'data/anime.json');
const COVERS_FILE = path.join(ROOT, 'data/anime-covers.json');
const API = 'https://bgmapi.anibt.net/v0/search/subjects';
const IMG_PROXY = 'https://bgmimg.anibt.net';
const IMG_ORIGIN = 'https://lain.bgm.tv';

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const ONLY = (args.find((a) => a.startsWith('--only='))?.slice(7) || '').split(',').filter(Boolean);
const OVERRIDES = {
  // 如果某部被同名旧作/续作干扰，在这里锁 Bangumi subject id
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[！!？?。．.、，,：:；;「」『』【】\[\]（）()·・\s\-–—~〜'"“”‘’]/g, '');
}

function similarity(a, b) {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return 0;
  if (x === y) return 100;
  let prefix = 0;
  while (prefix < Math.min(x.length, y.length) && x[prefix] === y[prefix]) prefix += 1;
  return Math.min(70, Math.round((prefix / Math.min(x.length, y.length)) * 70));
}

function yearOf(item) {
  return Number(String(item.premiere || '').slice(0, 4)) || Number(item.year) || 0;
}

function score(subject, query, expectedYear) {
  const names = [subject.name, subject.name_cn].filter(Boolean);
  const best = Math.max(0, ...names.map((n) => similarity(n, query)));
  let s = best;
  if (names.some((n) => normalize(n) === normalize(query))) s = Math.max(s, 110);
  else if (names.some((n) => normalize(n).includes(normalize(query)) || normalize(query).includes(normalize(n)))) s = Math.max(s, 68);

  const subjectYear = Number(String(subject.date || '').slice(0, 4)) || 0;
  if (expectedYear && subjectYear) {
    if (subjectYear === expectedYear) s += 45;
    else if (Math.abs(subjectYear - expectedYear) === 1) s += 15;
    else s -= 25;
  }
  if (subject.platform === 'TV') s += 5;
  if (subject.type === 2) s += 3;
  return s;
}

async function search(keyword) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await fetch(API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'fish-temple/1.0 (bangumi cover links)',
      },
      body: JSON.stringify({ keyword, filter: { type: [2] } }),
      signal: AbortSignal.timeout(30000),
    });
    if (res.status === 429 || res.status >= 500) {
      await sleep((Number(res.headers.get('retry-after') || 1) + attempt * 2) * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`Bangumi proxy HTTP ${res.status}`);
    const json = await res.json();
    if (json?.error) throw new Error(json.error);
    return json?.data || [];
  }
  throw new Error('Bangumi proxy 重试 4 次仍失败');
}

async function main() {
  const anime = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
  const covers = JSON.parse(await fs.readFile(COVERS_FILE, 'utf8'));
  const items = covers.items || {};
  const entries = [
    ...(anime.current || []).map((it) => ({ item: it, kind: 'current' })),
    ...(anime.recommended || []).map((it) => ({ item: it, kind: 'recommended' })),
  ].filter((e) => !ONLY.length || ONLY.includes(e.item.id));

  let changed = 0;
  for (const { item } of entries) {
    const year = yearOf(item);
    const queries = [...new Set([item.titleJa, item.posterJa, item.title].filter(Boolean))].slice(0, 3);
    const candidates = [];
    for (const q of queries) {
      let found = [];
      try { found = await search(q); } catch (err) {
        console.warn(`[${item.id}] 搜索失败：${err.message}`);
      }
      found.forEach((m) => candidates.push({ media: m, score: score(m, q, year), query: q }));
      await sleep(650);
      // 已经找到高置信度结果就不再换关键词，省请求
      if (candidates.some((c) => c.score >= 100)) break;
    }

    const seen = new Set();
    const sorted = candidates
      .filter((c) => (seen.has(c.media.id) ? false : seen.add(c.media.id)))
      .sort((a, b) => b.score - a.score);
    const fixed = OVERRIDES[item.id];
    const picked = fixed ? sorted.find((c) => c.media.id === fixed) : sorted[0];
    const low = !picked || picked.score < 55;
    if (!picked || low) {
      console.log(`!! ${item.id.padEnd(22)} ${String(year).padEnd(5)} NO MATCH`);
      continue;
    }

    const s = picked.media;
    const card = s.images?.medium || s.images?.common || s.images?.large || s.image || '';
    const large = s.images?.large || s.images?.medium || card;
    const remote = card;
    const original = large.replace(IMG_PROXY, IMG_ORIGIN);
    const record = {
      bangumiId: s.id,
      bangumiUrl: `https://bgm.tv/subject/${s.id}`,
      bangumiName: s.name || '',
      bangumiNameCn: s.name_cn || '',
      bangumiDate: s.date || '',
      bangumiScore: s.rating?.score || null,
      bangumiCover: remote,
      bangumiCoverLarge: large,
      bangumiOriginal: original,
    };
    console.log(`  ${item.id.padEnd(22)} ${String(year).padEnd(5)} ${String(picked.score).padStart(3)} · ${s.name} (${s.date || '—'})`);
    if (WRITE) {
      items[item.id] = { ...(items[item.id] || {}), ...record };
      changed += 1;
    }
  }

  if (WRITE) {
    covers.items = items;
    covers.source = 'Bangumi（bgmimg 反代直链）+ AniList 本地兜底';
    covers.sourceUrl = 'https://bgm.tv';
    covers.note = '封面默认直连 Bangumi（经 bgmimg 反代，不下载）；失败时回退 assets/leisure/covers 的本地 AniList 缓存。';
    covers.bangumiFetched = new Date().toISOString().slice(0, 10);
    await fs.writeFile(COVERS_FILE, `${JSON.stringify(covers, null, 2)}\n`);
    console.log(`\n[write] ${path.relative(ROOT, COVERS_FILE)} · ${changed} 条 Bangumi 直链`);
  } else {
    console.log('\n[dry] 未写文件。');
  }
}

main().catch((err) => {
  console.error('FAILED', err);
  process.exit(1);
});
