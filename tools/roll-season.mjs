#!/usr/bin/env node
/**
 * tools/roll-season.mjs — 换季：从 AniList 生成当季文娱数据
 * ------------------------------------------------------------------
 * 做什么：
 *   1. 算出目标季度（默认当前季；--next 下一季；--season 2027-winter 指定）
 *   2. 拉 AniList 该季 TV 动画（按热度，最多 --limit 部）
 *   3. 把 data/anime-overrides.json 里的编辑字段盖在自动字段上
 *   4. 写 data/anime.json（season + current；recommended 原样保留）
 *
 * 为什么要有 override：
 *   AniList 给的是日文标题 / 英文简介；站内需要中文名、短评、声优、放送局。
 *   overrides 以 AniList subject id 为 key，只写想改的字段，其余沿用自动值。
 *   已把当前 22 部 2026 秋的编辑字段迁进 data/anime-overrides.json，--force
 *   重建当前季也不会把它们弄丢。
 *
 * 用法：
 *   node tools/roll-season.mjs --dry                 预览当前季（不写文件）
 *   node tools/roll-season.mjs --write               当前季已是最新则跳过
 *   node tools/roll-season.mjs --write --force       强制重建当前季
 *   node tools/roll-season.mjs --write --next        生成下一季
 *   node tools/roll-season.mjs --write --season=2027-winter
 *   node tools/roll-season.mjs --check               只打印 stale 状态（给 CI 用）
 *
 * 典型换季流水线（GitHub Actions 里也是这三步）：
 *   node tools/roll-season.mjs --write
 *   node tools/fetch-covers.mjs
 *   python tools/optimize-covers.py
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DATA_FILE = path.join(ROOT, 'data/anime.json');
const OVERRIDES_FILE = path.join(ROOT, 'data/anime-overrides.json');
const BACKUP_DIR = path.join(ROOT, 'data/.backup');
const MIN_ITEMS = 8;
const DEFAULT_LIMIT = 24;

const SEASON_DEFS = {
  winter: { name: '冬', en: 'WINTER', start: '01-01', end: '03-31', anilist: 'WINTER' },
  spring: { name: '春', en: 'SPRING', start: '04-01', end: '06-30', anilist: 'SPRING' },
  summer: { name: '夏', en: 'SUMMER', start: '07-01', end: '09-30', anilist: 'SUMMER' },
  autumn: { name: '秋', en: 'AUTUMN', start: '10-01', end: '12-31', anilist: 'FALL' },
};
const SEASON_ORDER = ['winter', 'spring', 'summer', 'autumn'];
const MARKS = ['orb', 'lines', 'blade', 'eye', 'dots', 'wave', 'plus', 'star'];
const LAYOUTS = ['a', 'b', 'c', 'd'];
const PALETTES = [
  { h: 8, h2: 38, accent: '#f0b45a' },
  { h: 318, h2: 190, accent: '#7fe3ff' },
  { h: 142, h2: 0, accent: '#ff5a3c' },
  { h: 205, h2: 230, accent: '#9fd6ff' },
  { h: 45, h2: 18, accent: '#ffd400' },
  { h: 265, h2: 300, accent: '#b39dff' },
  { h: 350, h2: 12, accent: '#ff8a5c' },
  { h: 190, h2: 215, accent: '#7fe6ff' },
  { h: 165, h2: 195, accent: '#6fe3c1' },
  { h: 225, h2: 0, accent: '#ff5a5a' },
  { h: 340, h2: 30, accent: '#ffc2d1' },
  { h: 155, h2: 110, accent: '#d8ff6a' },
];

const GENRE_CN = {
  Action: '动作', Adventure: '冒险', Comedy: '喜剧', Drama: '剧情', Ecchi: '福利',
  Fantasy: '奇幻', Horror: '恐怖', 'Mahou Shoujo': '魔法少女', Mecha: '机战',
  Music: '音乐', Mystery: '悬疑', Psychological: '心理', Romance: '恋爱',
  'Sci-Fi': '科幻', 'Slice of Life': '日常', Sports: '运动', Supernatural: '超自然',
  Thriller: '惊悚', 'Boys Love': 'BL', 'Girls Love': 'GL', Harem: '后宫',
  Historical: '历史', Isekai: '异世界', Josei: '女性向', 'Martial Arts': '武术',
  Military: '军事', Parody: '恶搞', Police: '警察', School: '校园', Seinen: '青年向',
  Shoujo: '少女向', Shounen: '少年向', Space: '宇宙', Vampire: '吸血鬼',
  Game: '游戏', Kids: '儿童', Samurai: '武士', Gourmet: '美食',
};
const GENRE_MARK = {
  运动: 'lines', 音乐: 'wave', 恐怖: 'eye', 奇幻: 'star', 恋爱: 'dots',
  科幻: 'plus', 日常: 'orb', 动作: 'blade', 机战: 'blade',
};

const pad = (n) => String(n).padStart(2, '0');

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localStamp(d = new Date()) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function hash(s) {
  let h = 2166136261;
  for (const ch of String(s)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seasonFromDate(date = new Date()) {
  const index = Math.floor(date.getMonth() / 3);      // 0 冬 / 1 春 / 2 夏 / 3 秋
  return makeSeason(date.getFullYear(), SEASON_ORDER[index]);
}

function makeSeason(year, key) {
  const def = SEASON_DEFS[key];
  if (!def) throw new Error(`未知季度：${key}`);
  return {
    id: `${year}-${key}`,
    year,
    key,
    name: def.name,
    nameEn: def.en,
    anilist: def.anilist,
    start: `${year}-${def.start}`,
    end: `${year}-${def.end}`,
  };
}

function shiftSeason(season, delta) {
  let index = SEASON_ORDER.indexOf(season.key) + delta;
  let year = season.year;
  while (index < 0) { index += 4; year -= 1; }
  while (index > 3) { index -= 4; year += 1; }
  return makeSeason(year, SEASON_ORDER[index]);
}

function parseSeason(text) {
  const match = /^(\d{4})-(winter|spring|summer|autumn|fall)$/i.exec(String(text || '').trim());
  if (!match) throw new Error(`--season 格式应为 2027-winter，收到：${text}`);
  const key = match[2].toLowerCase() === 'fall' ? 'autumn' : match[2].toLowerCase();
  return makeSeason(Number(match[1]), key);
}

function argValue(name) {
  const index = process.argv.findIndex((a) => a === name || a.startsWith(`${name}=`));
  if (index < 0) return null;
  const arg = process.argv[index];
  if (arg.includes('=')) return arg.slice(arg.indexOf('=') + 1);
  const next = process.argv[index + 1];
  return next && !next.startsWith('--') ? next : true;
}

const has = (name) => process.argv.includes(name);
const MODE = has('--write') ? 'write' : has('--dry') ? 'dry' : has('--check') ? 'check' : '';
const FORCE = has('--force');
const NEXT = has('--next');
const LIMIT = Math.max(MIN_ITEMS, Math.min(50, Number(argValue('--limit')) || DEFAULT_LIMIT));
const SEASON_TEXT = argValue('--season');

const QUERY = `query ($season: MediaSeason, $year: Int, $limit: Int) {
  Page(page: 1, perPage: $limit) {
    pageInfo { total }
    media(
      season: $season, seasonYear: $year, type: ANIME, format: TV,
      isAdult: false, sort: POPULARITY_DESC
    ) {
      id
      title { native romaji english }
      startDate { year month day }
      episodes
      format
      status
      description(asHtml: false)
      genres
      averageScore
      popularity
      coverImage { extraLarge }
      siteUrl
      studios(isMain: true) { nodes { name } }
      nextAiringEpisode { airingAt episode }
      airingSchedule(perPage: 5) { nodes { airingAt episode } }
    }
  }
}`;

async function anilistSeason(season) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'fish-temple/1.0 (season roll)',
      },
      body: JSON.stringify({
        query: QUERY,
        variables: { season: season.anilist, year: season.year, limit: LIMIT },
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after') || 15) * 1000;
      console.log(`  · AniList 429，等 ${Math.round(wait / 1000)}s 再试（${attempt + 1}/4）`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);
    const json = await res.json();
    if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));
    const page = json.data?.Page;
    return { media: page?.media || [], total: Number(page?.pageInfo?.total) || 0 };
  }
  throw new Error('AniList 429（重试 4 次仍失败）');
}

function stripHtml(input) {
  return String(input || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\n*[\[(]Source:[\s\S]*?[\])]\s*$/i, '')
    .replace(/\n*\[Written by MAL Rewrite\]\s*$/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hookOf(description) {
  const text = stripHtml(description).replace(/\s+/g, ' ').trim();
  if (!text) return '本季新番，简介待补。';
  const sentence = (text.match(/^.*?[。！？!?](?=\s|$)/)?.[0] || text).trim();
  return sentence.length > 90 ? `${sentence.slice(0, 88)}…` : sentence;
}

function dateOf(media) {
  const d = media.startDate;
  if (d?.year && d?.month) return `${d.year}-${pad(d.month)}-${pad(d.day || 1)}`;
  return '';
}

function dayOfISO(iso) {
  if (!iso) return 7;
  const d = new Date(`${iso}T00:00:00Z`);
  return d.getUTCDay() || 7;
}

/** 日本放送时间：AniList 的 airingAt 是 UTC，+9 小时后取 JST 的星期 / 时刻 */
function airingOf(media) {
  const nodes = (media.airingSchedule?.nodes || [])
    .filter((n) => n?.airingAt)
    .sort((a, b) => a.airingAt - b.airingAt);
  const ts = media.nextAiringEpisode?.airingAt || nodes[0]?.airingAt;
  if (!ts) return {};
  const d = new Date((ts + 9 * 3600) * 1000);
  let day = d.getUTCDay() || 7;
  let hour = d.getUTCHours();
  let date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  // 日本番组表习惯把凌晨 0–4 点写成前一天的 24–28 点（如 水曜 24:30），沿用这个写法
  if (hour < 5) {
    day = day === 1 ? 7 : day - 1;
    hour += 24;
    const prev = new Date(d.getTime() - 24 * 3600 * 1000);
    date = `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-${pad(prev.getUTCDate())}`;
  }
  return {
    day,
    time: `${pad(hour)}:${pad(d.getUTCMinutes())}`,
    date,
  };
}

function genresOf(media) {
  const list = (media.genres || []).map((g) => GENRE_CN[g] || g);
  return [...new Set(list)].slice(0, 3);
}

function statusOf(media) {
  const text = [media.title?.native, media.title?.romaji, media.title?.english].join(' ');
  const sequel = /第\s*[0-9一二三四五六七八九十]+\s*[期季]|Season\s*\d+|第\s*\d+\s*シーズン|\bII\b|\bIII\b|Final Season|続編|2nd Season|3rd Season/i.test(text);
  return sequel ? '续作' : '新作';
}

function posterOf(id, genres) {
  const palette = PALETTES[hash(id) % PALETTES.length];
  const mark = (genres || []).map((g) => GENRE_MARK[g]).find(Boolean) || MARKS[hash(`${id}m`) % MARKS.length];
  return {
    ...palette,
    mark,
    layout: LAYOUTS[hash(`${id}l`) % LAYOUTS.length],
    rot: (hash(`${id}r`) % 41) - 20,
  };
}

function toEntry(media, overrides) {
  const id = `anilist-${media.id}`;
  const native = media.title?.native || '';
  const title = native || media.title?.romaji || media.title?.english || `AniList ${media.id}`;
  const air = airingOf(media);
  const premiere = dateOf(media) || air.date || '';
  const genres = genresOf(media);
  const auto = {
    id,
    anilistId: media.id,
    anilistUrl: media.siteUrl,
    title,
    titleJa: native || title,
    posterJa: native || title,
    day: air.day || dayOfISO(premiere),
    time: air.time || '—',
    premiere,
    station: '—',
    episodes: media.episodes ? `全 ${media.episodes} 话` : '放送中',
    status: statusOf(media),
    genres,
    cast: [],
    hook: hookOf(media.description),
    synopsis: stripHtml(media.description) || '简介待补。',
    note: '自动收录：中文名 / 短评 / 声优待补。',
    score: media.averageScore ? Number((media.averageScore / 10).toFixed(1)) : 8.0,
    scoreLabel: 'ANILIST / 参考评分',
    poster: posterOf(id, genres),
    auto: true,
  };

  const ov = overrides.items?.[String(media.id)] || {};
  const merged = {
    ...auto,
    ...ov,
    id: ov.id || auto.id,
    anilistId: media.id,
    anilistUrl: media.siteUrl,
    title: ov.title || auto.title,
    titleJa: ov.titleJa || auto.titleJa,
    posterJa: ov.posterJa || auto.posterJa,
    genres: Array.isArray(ov.genres) ? ov.genres : auto.genres,
    cast: Array.isArray(ov.cast) ? ov.cast : auto.cast,
    poster: { ...auto.poster, ...(ov.poster || {}) },
    // override 只写了 score、没写 scoreLabel 时，不要把 AniList 的标签带过去
    scoreLabel: ov.scoreLabel !== undefined
      ? ov.scoreLabel
      : (Object.prototype.hasOwnProperty.call(ov, 'score') ? undefined : auto.scoreLabel),
    auto: ov.auto === undefined ? true : ov.auto,
  };
  delete merged.cover;
  return merged;
}

function seasonMeta(season, entries, overrides) {
  const def = SEASON_DEFS[season.key];
  const generated = {
    id: season.id,
    year: season.year,
    name: def.name,
    nameEn: def.en,
    label: `${season.year} ${def.name}`,
    start: season.start,
    end: season.end,
    updated: localDate(),
    total: entries.length,
    headline: `${def.name}天到了。`,
    headlineEm: '先从哪部开始？',
    intro: `本季从 AniList 的 TV 动画里按热度取了 ${entries.length} 部，中文名 / 短评 / 声优持续补充中。`,
    note: '放送时间取自 AniList 的日本放送时间；24:30 这类跨日节目按节目表原样保留，不换算成次日 00:30。',
    auto: true,
  };
  return { ...generated, ...(overrides.seasons?.[season.id] || {}) };
}

async function main() {
  if (!MODE) {
    console.error('用法：node tools/roll-season.mjs --dry | --write | --check [--next|--season=2027-winter] [--force] [--limit=24]');
    process.exit(1);
  }

  const base = seasonFromDate();
  const season = typeof SEASON_TEXT === 'string' && SEASON_TEXT
    ? parseSeason(SEASON_TEXT)
    : NEXT ? shiftSeason(base, 1) : base;

  let old = {};
  try { old = JSON.parse(await fs.readFile(DATA_FILE, 'utf8')); } catch { /* first run */ }
  let overrides = { items: {}, seasons: {} };
  try { overrides = JSON.parse(await fs.readFile(OVERRIDES_FILE, 'utf8')); } catch { /* optional */ }
  overrides = {
    items: overrides?.items && typeof overrides.items === 'object' ? overrides.items : {},
    seasons: overrides?.seasons && typeof overrides.seasons === 'object' ? overrides.seasons : {},
  };

  const same = old.season?.id === season.id;
  if (MODE === 'check') {
    console.log(JSON.stringify({ current: old.season?.id || null, target: season.id, stale: !same }));
    return;
  }
  if (same && MODE === 'write' && !FORCE) {
    console.log(`[season] ${season.id} 已是当前季；跳过（--force 可强制重建）`);
    return;
  }

  console.log(`[season] 目标：${season.id}（${season.anilist} ${season.year}）`);
  const { media } = await anilistSeason(season);
  if (media.length < MIN_ITEMS) {
    throw new Error(`AniList 只返回 ${media.length} 部（<${MIN_ITEMS}），可能还没开季；等一两天再跑，或手动 --season 指定。`);
  }

  const entries = media.map((m) => toEntry(m, overrides));
  const overridden = entries.filter((e) => !e.auto).length;
  const seasonData = seasonMeta(season, entries, overrides);
  const sources = [...(old.sources || [])];
  if (!sources.some((s) => /anilist/i.test(s.url || ''))) {
    sources.push({
      label: 'AniList · 当季番剧',
      url: `https://anilist.co/search/anime?season=${season.anilist}&seasonYear=${season.year}`,
    });
  }
  const next = {
    ...old,
    season: seasonData,
    sources,
    current: entries,
    recommended: old.recommended || [],
  };

  console.log(`[season] 拿到 ${entries.length} 部（override ${overridden} 部）`);
  entries.slice(0, 8).forEach((e, i) => {
    console.log(`  ${String(i + 1).padStart(2, '0')} ${e.id.padEnd(20)} ${e.title}${e.auto ? '' : '  [override]'}`);
  });
  if (entries.length > 8) console.log(`  … 另有 ${entries.length - 8} 部`);

  if (MODE === 'dry') {
    console.log('\n[dry] 未写文件。');
    return;
  }

  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const backup = path.join(BACKUP_DIR, `anime-${localStamp()}.json`);
  await fs.writeFile(backup, `${JSON.stringify(old, null, 2)}\n`);
  await fs.writeFile(DATA_FILE, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`[write] ${path.relative(ROOT, DATA_FILE)} 已更新；旧文件备份在 ${path.relative(ROOT, backup)}`);
  console.log('[next] 接着跑：node tools/fetch-covers.mjs && python tools/optimize-covers.py');
}

main().catch((err) => {
  console.error('FAILED', err.message || err);
  process.exit(1);
});
