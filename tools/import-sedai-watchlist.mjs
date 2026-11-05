#!/usr/bin/env node
/**
 * tools/import-sedai-watchlist.mjs — 把「动画世代」绿色格子导入推荐动漫
 * ------------------------------------------------------------------
 * 输入：
 *   data/anime-sedai-green.json   从截图绿格提取的 196 条（year/titleZh/titleJa/score）
 *
 * 做什么：
 *   1. 跳过已经存在于 recommended 的 10 部（按标题 + Bangumi id）
 *   2. 其余逐条搜 Bangumi（bgmapi.anibt.net），拿中文简介 / 标签 / 话数 / 评分 / 封面 URL
 *   3. 写 data/anime.json 的 recommended，写 data/anime-covers.json 的 Bangumi 直链
 *   4. **不下载任何图片**，封面只写 URL
 *
 * 用法：
 *   node tools/import-sedai-watchlist.mjs --dry
 *   node tools/import-sedai-watchlist.mjs --write
 *   node tools/import-sedai-watchlist.mjs --write --limit=5   # 小样本试跑
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const GREEN_FILE = path.join(ROOT, 'data/anime-sedai-green.json');
const ANIME_FILE = path.join(ROOT, 'data/anime.json');
const COVERS_FILE = path.join(ROOT, 'data/anime-covers.json');
const CACHE_FILE = path.join(ROOT, '.shots/sedai-bangumi-cache.json');
const API = 'https://bgmapi.anibt.net/v0/search/subjects';

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const LIMIT = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1] || 0);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PALETTE = [
  { h: 190, h2: 150, accent: '#cfe9ff', mark: 'orb', layout: 'a', rot: 0 },
  { h: 265, h2: 320, accent: '#b39dff', mark: 'star', layout: 'b', rot: 18 },
  { h: 28, h2: 350, accent: '#ffd400', mark: 'blade', layout: 'c', rot: -12 },
  { h: 145, h2: 95, accent: '#9fffd0', mark: 'wave', layout: 'a', rot: 6 },
  { h: 330, h2: 20, accent: '#ffb3c9', mark: 'eye', layout: 'd', rot: -22 },
  { h: 210, h2: 250, accent: '#9fc7ff', mark: 'dots', layout: 'b', rot: 12 },
  { h: 55, h2: 25, accent: '#ffe28a', mark: 'plus', layout: 'c', rot: 0 },
  { h: 300, h2: 210, accent: '#e0b3ff', mark: 'lines', layout: 'd', rot: 24 },
];

const GENRES = new Set([
  '科幻', '奇幻', '战斗', '恋爱', '喜剧', '校园', '日常', '治愈', '悬疑', '推理',
  '热血', '运动', '音乐', '百合', '机战', '历史', '冒险', '群像', '青春', '致郁',
  '搞笑', '猎奇', '后宫', '异世界', '穿越', '魔法', '超能力', '美食', '职场',
  '公路', '单元剧', '剧情', '偶像', '泡面番', '短片', '动画',
]);

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

function scoreSubject(subject, query, expectedYear) {
  const names = [subject.name, subject.name_cn].filter(Boolean);
  let s = Math.max(0, ...names.map((n) => similarity(n, query)));
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
        'User-Agent': 'fish-temple/1.0 (sedai watchlist import)',
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
    return json?.data || [];
  }
  throw new Error('Bangumi proxy 重试 4 次仍失败');
}

function stripHTML(s) {
  return String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function firstSentence(s) {
  const text = stripHTML(s);
  if (!text) return '';
  const sentences = text.match(/[^。！？!?]+[。！？!?]?/g) || [text];
  let first = sentences.slice(0, 2).join('').trim();
  if (first.length > 54) first = `${first.slice(0, 52)}…`;
  return first;
}

function truncate(s, n) {
  const text = stripHTML(s);
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}

function genresOf(subject) {
  const tags = (subject?.tags || []).map((t) => t.name).filter((n) => GENRES.has(n));
  return [...new Set(tags)].slice(0, 3);
}

function studioOf(subject) {
  const info = subject?.infobox || [];
  const row = info.find((i) => /动画制作|製作|制作/.test(String(i.key || '')));
  if (!row) return '—';
  const value = Array.isArray(row.value) ? row.value.map((v) => v.v || v).join(' / ') : row.value;
  const first = stripHTML(value)
    .split(/[、,，]/)[0]
    .replace(/（.*$/, '')
    .trim();
  return first ? first.slice(0, 40) : '—';
}

function posterOf(seed) {
  const p = PALETTE[Math.abs(seed) % PALETTE.length];
  return { ...p };
}

function entryFrom(seed, subject) {
  const summary = stripHTML(subject?.summary);
  const genres = genresOf(subject);
  const eps = Number(subject?.total_episodes || subject?.eps || 0);
  const bgmScore = Number(subject?.rating?.score || 0);
  const score = seed.score || bgmScore || 0;
  return {
    id: `sedai-${seed.year}-${String(seed.col).padStart(2, '0')}`,
    title: seed.titleZh || subject?.name_cn || subject?.name || `未命名 ${seed.year}`,
    titleJa: seed.titleJa || subject?.name || '',
    posterJa: seed.titleJa || subject?.name || '',
    year: seed.year,
    episodes: eps ? `${eps} 话` : '—',
    studio: studioOf(subject),
    badge: '看过',
    genres,
    hook: firstSentence(summary) || `${seed.titleZh || '这部作品'}，${seed.year} 年播出。`,
    synopsis: truncate(summary, 300) || '暂无简介。',
    note: bgmScore ? `动画世代看过表收录 · Bangumi ${bgmScore.toFixed(1)} 分` : '动画世代看过表收录。',
    audience: genres.length ? `喜欢${genres.slice(0, 2).join('、')}的人` : '',
    score,
    scoreLabel: seed.score ? 'SEDAI / 参考评分' : 'BANGUMI / 参考评分',
    poster: posterOf(seed.year * 31 + seed.col * 17 + String(seed.titleZh).length),
  };
}

async function main() {
  const green = JSON.parse(await fs.readFile(GREEN_FILE, 'utf8'));
  const anime = JSON.parse(await fs.readFile(ANIME_FILE, 'utf8'));
  const covers = JSON.parse(await fs.readFile(COVERS_FILE, 'utf8'));
  const items = covers.items || {};
  const existing = anime.recommended || [];
  const existingBangumi = new Set(Object.values(items).map((v) => v.bangumiId).filter(Boolean));
  const existingKeys = new Set();
  existing.forEach((it) => {
    existingKeys.add(`${it.year}|${normalize(it.title)}`);
    if (it.titleJa) existingKeys.add(`${it.year}|${normalize(it.titleJa)}`);
  });

  let cache = {};
  try { cache = JSON.parse(await fs.readFile(CACHE_FILE, 'utf8')); } catch { cache = {}; }

  const added = [];
  const skipped = [];
  const low = [];
  const seenBangumi = new Set();
  const todo = LIMIT ? green.slice(0, LIMIT) : green;

  for (let n = 0; n < todo.length; n += 1) {
    const seed = todo[n];
    const key = `${seed.year}|${normalize(seed.titleZh)}`;
    if (existingKeys.has(key)) {
      skipped.push(`${seed.year} ${seed.titleZh} (已有)`);
      continue;
    }

    const cacheKey = `${seed.year}|${seed.titleJa || seed.titleZh}`;
    let picked = cache[cacheKey];
    if (!picked) {
      const queries = [...new Set([seed.titleJa, seed.titleZh, seed.titleEn].filter(Boolean))];
      let candidates = [];
      for (const q of queries) {
        let found = [];
        try { found = await search(q); } catch (err) {
          console.warn(`[${seed.year}] ${seed.titleZh} 搜索失败：${err.message}`);
        }
        found.forEach((m) => candidates.push({ media: m, score: scoreSubject(m, q, seed.year), query: q }));
        await sleep(600);
        // 只有「TV + 年份命中 + 标题基本精确」才提前收手；
        // 否则 OVA / 同名前缀会拿到 100 分左右，把正确 TV 挤掉。
        if (candidates.some((c) => c.score >= 150)) break;
      }
      const seen = new Set();
      candidates = candidates
        .sort((a, b) => b.score - a.score)
        .filter((c) => (seen.has(c.media.id) ? false : seen.add(c.media.id)));
      picked = candidates[0] || null;
      cache[cacheKey] = picked;
      if (n % 10 === 0) await fs.writeFile(CACHE_FILE, JSON.stringify(cache), 'utf8');
    }

    const matched = picked && picked.score >= 55 ? picked : null;
    if (!matched) {
      low.push(`${seed.year} ${seed.titleZh}`);
      const generic = entryFrom(seed, null);
      if (items[generic.id]?.bangumiId && existingBangumi.has(items[generic.id].bangumiId)) {
        skipped.push(`${seed.year} ${seed.titleZh} (已有)`);
        continue;
      }
      added.push(generic);
      if (WRITE) items[generic.id] = { cover: '' };
      console.log(`!! ${seed.year} ${seed.titleZh.padEnd(24)} NO MATCH`);
      continue;
    }

    const subject = matched.media;
    if (existingBangumi.has(subject.id) || seenBangumi.has(subject.id)) {
      skipped.push(`${seed.year} ${seed.titleZh} (Bangumi ${subject.id} 已有)`);
      continue;
    }
    seenBangumi.add(subject.id);

    const entry = entryFrom(seed, subject);
    added.push(entry);
    if (WRITE) {
      const common = subject.images?.common || subject.images?.medium || subject.images?.large || subject.image || '';
      const medium = subject.images?.medium || subject.images?.large || common;
      const large = subject.images?.large || subject.images?.medium || common;
      items[entry.id] = {
        cover: '',
        bangumiId: subject.id,
        bangumiUrl: `https://bgm.tv/subject/${subject.id}`,
        bangumiName: subject.name || '',
        bangumiNameCn: subject.name_cn || '',
        bangumiDate: subject.date || '',
        bangumiScore: subject.rating?.score || null,
        bangumiCover: common,
        bangumiCoverMedium: medium,
        bangumiCoverLarge: large,
        bangumiOriginal: large.replace('https://bgmimg.anibt.net', 'https://lain.bgm.tv'),
      };
    }
    console.log(`  ${String(n + 1).padStart(3)}/${todo.length} ${seed.year} ${seed.titleZh.padEnd(24)} <- ${subject.name} [${matched.score}]`);
  }

  await fs.writeFile(CACHE_FILE, JSON.stringify(cache), 'utf8');

  if (WRITE) {
    added.sort((a, b) => b.year - a.year || a.title.localeCompare(b.title, 'zh-Hans-CN'));
    anime.recommended = [...existing, ...added];
    anime.recommendedUpdated = new Date().toISOString().slice(0, 10);
    if (!(anime.sources || []).some((s) => s.label === '动画世代')) {
      anime.sources = [...(anime.sources || []), { label: '动画世代', url: 'https://anime-sedai.egoist.dev' }];
    }
    covers.items = items;
    covers.source = 'Bangumi（bgmimg 反代直链）+ AniList 本地兜底';
    covers.sourceUrl = 'https://bgm.tv';
    covers.note = '封面默认直连 Bangumi（经 bgmimg 反代，不下载）；失败时回退 assets/leisure/covers 的本地 AniList 缓存。';
    covers.bangumiFetched = new Date().toISOString().slice(0, 10);
    await fs.writeFile(ANIME_FILE, `${JSON.stringify(anime, null, 2)}\n`);
    await fs.writeFile(COVERS_FILE, `${JSON.stringify(covers, null, 2)}\n`);
  }

  console.log(`\n${WRITE ? '[write]' : '[dry]'} 新增 ${added.length} / 跳过 ${skipped.length} / 未匹配 ${low.length} / 推荐总数 ${WRITE ? anime.recommended.length : existing.length + added.length}`);
  if (low.length) console.log('未匹配：', low.join('、'));
}

main().catch((err) => {
  console.error('FAILED', err);
  process.exit(1);
});
