#!/usr/bin/env node
/**
 * tools/fetch-covers.mjs — 给文娱板块抓本地封面
 * ------------------------------------------------------------------
 * 数据源：AniList GraphQL（https://anilist.co）
 *   · bgm.tv / api.bgm.tv / lain.bgm.tv 在当前网络不可达（DNS 被污染、连接超时），
 *     所以这里用 AniList 的封面；图片会下载到 assets/leisure/covers/，
 *     站点运行时不再依赖外网，也不存在防盗链。
 *   · 想换回 Bangumi：把同名文件替换掉即可，data/anime-covers.json 里的 cover 路径不用改。
 *
 * 用法：
 *   node tools/fetch-covers.mjs --dry         只打印候选，不下载、不写文件
 *   node tools/fetch-covers.mjs               抓取缺失的封面并写 data/anime-covers.json
 *   node tools/fetch-covers.mjs --force       全部重下
 *   node tools/fetch-covers.mjs --only=a,b    只处理指定 id
 *
 * 匹配规则：日文名优先，其次海报短名；按标题相似度 + 年份打分。
 * 抓完后请打开页面看一眼：万一某部匹配到同名的旧作，在 OVERRIDES 里锁 AniList id。
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DATA_FILE = path.join(ROOT, 'data/anime.json');
const OUT_FILE = path.join(ROOT, 'data/anime-covers.json');
const COVER_DIR = path.join(ROOT, 'assets/leisure/covers');

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const FORCE = args.includes('--force');
const ONLY = (args.find((a) => a.startsWith('--only='))?.slice(7) || '').split(',').filter(Boolean);

/** 已知会被同名旧作干扰的条目：锁 AniList id */
const OVERRIDES = {
  'tensei-sword-s2': 159042,
};

/** 日文名在 AniList 搜不到时，用这个英文/罗马字名兜底 */
const QUERY_OVERRIDES = {
  'tensei-sword-s2': 'Reincarnated as a Sword',
};

const QUERY = `query ($search: String) {
  Page(perPage: 10) {
    media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
      id
      title { romaji native english }
      startDate { year }
      format
      coverImage { extraLarge }
      siteUrl
    }
  }
}`;

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
  const shorter = Math.min(x.length, y.length);
  return Math.min(70, Math.round((prefix / shorter) * 70));
}

function score(candidate, query, year) {
  const native = candidate.title?.native || '';
  const romaji = candidate.title?.romaji || '';
  const best = Math.max(similarity(native, query), similarity(romaji, query));
  let s = best;
  if (normalize(native) === normalize(query) || normalize(romaji) === normalize(query)) s = Math.max(s, 100);
  if (normalize(native).includes(normalize(query)) || normalize(query).includes(normalize(native))) s = Math.max(s, 68);
  const cy = Number(candidate.startDate?.year);
  if (year && cy) {
    if (cy === year) s += 45;
    else if (Math.abs(cy - year) === 1) s += 15;
    else s -= 25;
  }
  if (candidate.format === 'TV') s += 3;
  return s;
}

async function search(query) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'fish-temple/1.0 (leisure cover fetch)',
      },
      body: JSON.stringify({ query: QUERY, variables: { search: query } }),
      signal: AbortSignal.timeout(30000),
    });
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after') || 15) * 1000;
      console.log(`  · AniList 429，等 ${Math.round(wait / 1000)}s 再试（${attempt + 1}/4）`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);
    const json = await res.json();
    if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));
    return json.data?.Page?.media || [];
  }
  throw new Error('AniList 429（重试 4 次仍失败）');
}

async function download(url, dest) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'fish-temple/1.0 (leisure cover fetch)', Referer: 'https://anilist.co/' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`cover HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 8 * 1024) throw new Error(`cover too small: ${buf.length}B`);
  await fs.writeFile(dest, buf);
  return buf.length;
}

async function main() {
  const data = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
  const yearOf = (it) => Number(String(it.premiere || '').slice(0, 4)) || Number(data.season?.year) || 0;
  const entries = [
    ...(data.current || []).map((it) => ({ item: it, year: yearOf(it), kind: 'current' })),
    ...(data.recommended || []).map((it) => ({ item: it, year: Number(it.year) || 0, kind: 'pick' })),
  ].filter((e) => !ONLY.length || ONLY.includes(e.item.id));

  await fs.mkdir(COVER_DIR, { recursive: true });
  let existing = {};
  try { existing = JSON.parse(await fs.readFile(OUT_FILE, 'utf8')); } catch { /* first run */ }
  const outItems = { ...(existing.items || {}) };
  if (!ONLY.length) {
    const wanted = new Set(entries.map((e) => e.item.id));
    Object.keys(outItems).forEach((id) => { if (!wanted.has(id)) delete outItems[id]; });
  }
  const report = [];

  for (const { item, year, kind } of entries) {
    let candidates = [];
    // 先用日文全名；没有像样的结果再用海报短名兜底，减少请求量（AniList 有速率限制）
    const queries = [QUERY_OVERRIDES[item.id] || item.titleJa].filter(Boolean);
    for (const q of queries) {
      try {
        const found = await search(q);
        candidates.push(...found.map((m) => ({ media: m, s: score(m, q, year), query: q })));
      } catch (err) {
        console.warn(`[${item.id}] 搜索失败：${err.message}`);
      }
      await sleep(950);
    }
    let best = candidates.sort((a, b) => b.s - a.s)[0];
    if ((!best || best.s < 55) && item.posterJa && item.posterJa !== item.titleJa) {
      try {
        const found = await search(item.posterJa);
        candidates.push(...found.map((m) => ({ media: m, s: score(m, item.posterJa, year), query: item.posterJa })));
      } catch (err) {
        console.warn(`[${item.id}] 短名搜索失败：${err.message}`);
      }
      await sleep(950);
    }
    const seen = new Set();
    candidates = candidates
      .filter((c) => (seen.has(c.media.id) ? false : seen.add(c.media.id)))
      .sort((a, b) => b.s - a.s);
    best = candidates[0];
    const fixedId = OVERRIDES[item.id];
    const picked = fixedId ? candidates.find((c) => c.media.id === fixedId) || null : best;
    const low = !picked || picked.s < 55;
    const label = picked
      ? `${picked.s.toFixed(0)} · ${picked.media.title?.native || picked.media.title?.romaji} (${picked.media.startDate?.year || '—'})`
      : 'NO MATCH';
    report.push(`${low ? '!!' : '  '} ${item.id.padEnd(22)} ${String(year).padEnd(5)} ${label}`);

    if (DRY || !picked) continue;
    const coverPath = `assets/leisure/covers/${item.id}.jpg`;
    const dest = path.join(ROOT, coverPath);
    let bytes = 0;
    try {
      const exists = await fs.stat(dest).then(() => true).catch(() => false);
      if (FORCE || !exists) bytes = await download(picked.media.coverImage.extraLarge, dest);
      else bytes = (await fs.stat(dest)).size;
      outItems[item.id] = {
        anilistId: picked.media.id,
        anilistUrl: picked.media.siteUrl,
        title: picked.media.title?.native || picked.media.title?.romaji || '',
        year: picked.media.startDate?.year || null,
        kind,
        score: Math.round(picked.s),
        cover: coverPath,
        remote: picked.media.coverImage.extraLarge,
        bytes,
      };
    } catch (err) {
      console.warn(`[${item.id}] 封面下载失败：${err.message}`);
    }
    await sleep(120);
  }

  console.log(report.join('\n'));
  console.log(`\n${DRY ? 'DRY RUN（未写文件）' : `写入 ${path.relative(ROOT, OUT_FILE)}`}`);
  if (DRY) return;

  const payload = {
    source: 'AniList',
    sourceUrl: 'https://anilist.co',
    fetched: new Date().toISOString().slice(0, 10),
    note: '封面缓存自 AniList；bgm.tv 在当前网络不可达，所以没有直接引用 bgm 的图。想换回 Bangumi：替换 assets/leisure/covers/ 下的同名文件即可。',
    items: outItems,
  };
  await fs.writeFile(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`完成：${Object.keys(outItems).length} 条封面记录`);
}

main().catch((err) => {
  console.error('FAILED', err);
  process.exit(1);
});
