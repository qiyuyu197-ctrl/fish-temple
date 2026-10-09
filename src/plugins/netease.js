/**
 * plugins/netease.js — 网易云音乐集成
 * ------------------------------------------------------------------
 * 能力边界（重要，别被网上的「一键播放」方案误导）：
 *
 *   ✅ 站内搜索        通过 server.mjs 代理调用网易云公开元数据接口
 *                      （浏览器直连会被同源策略拦掉，因为对方不返回 CORS 头）
 *   ✅ 导入歌单        粘贴公开歌单链接 / ID，一次把整个歌单的曲目合并进本站播放列表
 *                      ❌「我喜欢的音乐」与私密歌单需要登录，本项目不做登录
 *   ✅ 站内试听/播放    经本站 /api/netease/audio **同源转发音频流**，由页面自己的
 *                      <audio> 播放（见下面的「站内直放」一节）——这是默认方式，
 *                      因为只有它才有真实的 duration / currentTime / ended：
 *                      一首能完整放完，后台标签页与移动端息屏也能可靠地自动切歌。
 *   ↩️ 回退            直放不可用（会员 / 版权受限 / 纯静态部署没有 /api）时，
 *                      自动退回**网易云官方外链播放器 iframe**：
 *                      ✅ 站内试听/播放（官方 iframe，版权与登录由网易云自行处理）
 *                      ⚠️ 暂停后会回到 0:00 —— 官方嵌入播放器只有
 *                         type/id/auto/height 四个参数，没有定位或控制接口，
 *                         暂停必须重建 auto=0 的播放器（否则声音停不下来）。
 *                      ⚠️ 后台不保证自动下一首：iframe 不给结束回调，只能按时长估算，
 *                         而估算依赖会被浏览器节流的定时器（见 core/player.js 的说明）。
 *
 * 站内直放的能力边界：
 *   · 只转发网易云**已经公开给匿名访客**的外链音频（和官方外链播放器同一来源、
 *     同一权限），不做任何登录态、会员或版权绕过；拿不到流就返回 404 并自动回退。
 *   · 音频流不落盘：只在服务端内存里缓存"外链 → CDN 地址"的解析结果（15 分钟）。
 *   · 想彻底关掉直放、完全回到官方播放器：把 site.config.js 的
 *     PLAYER.directAudio 设为 false。
 *
 * 无服务器时自动降级：不能搜索，但可以粘贴网易云链接手动生成播放器。
 */

import { bus } from '../core/bus.js';
import { Player } from '../core/player.js';
import { EmbedHost } from '../ui/embed-host.js';

const STORE_KEY = 'ft.terminal.neteasePlaylist';
const API_BASE = '/api/netease';

/**
 * 官方外链播放器地址。
 *
 * ⚠️ 官方只支持四个参数：type / id / auto / height（见 README 的说明）。
 *    没有 startTime、没有 seek、没有任何控制接口 —— 这不是实现偷懒，
 *    是网易云嵌入播放器的能力边界。
 *    因此「暂停后续播」在本方案下无法做到：暂停必须重建 auto=0 的播放器
 *    （否则声音停不下来），而重建就必然回到 0:00。
 */
export function embedUrl(id, { autoplay = false, height = 106 } = {}) {
  const p = new URLSearchParams({
    type: '2',
    id: String(id),
    auto: autoplay ? '1' : '0',
    height: String(height),
  });
  return `https://music.163.com/outchain/player?${p.toString()}`;
}

/** 曲目 / 歌单 / 专辑页面地址 */
export const pageUrl = (id) => `https://music.163.com/#/song?id=${id}`;
export const playlistUrl = (id) => `https://music.163.com/#/playlist?id=${id}`;

/* ---------------- 站内直放地址 ----------------
 * 为什么不让 <audio> 直接指向网易云：跨域音频既拿不到 Web Audio 频谱，
 * 还受 Referer / CORS / 混合内容（https 页面 + http 音频）各种限制，
 * 而且外链会过期。走本站 /api/netease/audio 转发后是同源流：
 * 有真实时长与 ended、可拖动进度，失败也只是一次 404。
 */

/** 站内直放地址（同源转发，支持 Range；见 server.mjs 的 /api/netease/audio） */
export const directAudioUrl = (id) => `${API_BASE}/audio?id=${encodeURIComponent(String(id))}`;

/**
 * 不做转发的原始外链（纯静态部署、没有 server.mjs 时的兜底）。
 * 它可能因为 Referer / CORS / 外链过期而失败 —— 失败就当没有这条路。
 */
export const rawAudioUrl = (id) =>
  `https://music.163.com/song/media/outer/url?id=${encodeURIComponent(String(id))}.mp3`;

/** 从任意网易云链接或纯数字里解析出歌曲 id */
export function parseSongId(input) {
  const s = String(input ?? '').trim();
  if (/^\d{4,}$/.test(s)) return s;
  const hash = /[#/?&]id=(\d+)/.exec(s);
  if (hash) return hash[1];
  const outchain = /outchain\/player\?[^#]*\bid=(\d+)/.exec(s);
  if (outchain) return outchain[1];
  const song = /\/song\?[^#]*\bid=(\d+)/.exec(s);
  if (song) return song[1];
  const bare = /(\d{5,})/.exec(s);
  return bare ? bare[1] : '';
}

/**
 * 从任意网易云「歌单」链接里解析歌单 id。
 *
 * 注意与 parseSongId 的区别：这里刻意只认歌单形态的链接
 * （playlist / toplist / discover）或纯数字，避免把单曲链接当成歌单，
 * 否则用户粘错链接会得到一个完全无关的列表。
 *
 * 163cn.tv 分享短链在这里必然解析不出来 —— 它要先展开（见 expandLink）。
 */
export function parsePlaylistId(input) {
  const s = String(input ?? '').trim();
  if (!s) return '';
  if (/^\d{4,}$/.test(s)) return s;                       // 纯数字直接当歌单 id
  if (!/playlist|toplist|discover/.test(s)) return '';     // 不是歌单链接就不认（避免误吞单曲链接）
  const byQuery = /[?#&/]id=(\d+)/.exec(s);
  if (byQuery) return byQuery[1];
  const byPath = /playlist\/(\d+)/.exec(s);
  return byPath ? byPath[1] : '';
}

/** 从一段分享文案里抠出 URL（"分享 xxx 的歌单 https://163cn.tv/abc" 这种） */
export function extractLink(input) {
  const s = String(input ?? '').trim();
  const m = /https?:\/\/[^\s"'<>）)】]+/i.exec(s);
  return m ? m[0] : s;
}

/**
 * 从网易云「专辑」链接里解析专辑 id。
 *
 * 该支持哪几种形态（都是实际会遇到的）：
 *   https://music.163.com/album?id=90004244
 *   https://music.163.com/#/album?id=90004244
 *   https://y.music.163.com/m/album?app_version=…&id=90004244&userid=…   ← App 分享短链的落点
 *   163cn.tv/xxxx                                                       ← 先展开（expandLink）
 * 纯数字不在这里认：它和歌单 / 单曲 id 长得一样，交给上层先当单曲试（见 views/music.js）。
 */
export function parseAlbumId(input) {
  const s = String(input ?? '').trim();
  if (!s || !/album/i.test(s)) return '';
  const byQuery = /[?#&/]id=(\d+)/.exec(s);
  if (byQuery) return byQuery[1];
  const byPath = /album\/(\d+)/.exec(s);
  return byPath ? byPath[1] : '';
}

/**
 * 判断一条链接是「单曲 / 专辑 / 歌单 / 电台节目」中的哪一种。
 * 只做形态判断，不发请求（短链要先 expandLink）。
 */
export function detectLinkKind(input) {
  const s = String(input ?? '').trim();
  if (!s) return '';
  if (/album/i.test(s) && parseAlbumId(s)) return 'album';
  if (/playlist|discover|toplist|radio/i.test(s) && parsePlaylistId(s)) return 'playlist';
  if (/program/i.test(s) && /[?#&/]id=(\d+)/.test(s)) return 'program';
  if (/song/i.test(s) && parseSongId(s)) return 'song';
  if (/^\d{4,}$/.test(s)) return 'id';                    // 纯数字：类型待定
  if (parseSongId(s)) return 'song';
  return '';
}

/** 是不是需要展开的网易云短链（163cn.tv / 无 id 的分享链） */
export function isShortLink(input) {
  const url = extractLink(input);
  return /^(https?:\/\/)?(www\.)?163cn\.tv\//i.test(url)
    || /^(https?:\/\/)?(y\.)?music\.163\.com\/[a-z0-9/_-]*$/i.test(url);
}

/**
 * 展开短链，拿到最终地址。
 * 必须在服务端做：浏览器读不到跨域 302 的 Location（CORS 不允许）。
 * @returns {Promise<{finalUrl:string, hops:number, chain:string[]}>}
 */
export async function resolveLink(input) {
  const url = extractLink(input);
  if (!url) throw new Error('链接为空');
  return api(`/resolve?url=${encodeURIComponent(url)}`);
}

/**
 * 把用户输入变成「能直接被 parsePlaylistId / parseAlbumId / parseSongId 解析」的链接。
 * 已经是可解析形态就原样返回（不产生任何网络请求）；是短链才去展开。
 */
export async function expandLink(input) {
  const url = extractLink(input);
  if (!url) return '';
  if (parsePlaylistId(url) || parseAlbumId(url)) return url;   // 已经是可解析的链接 / 纯 id
  if (!isShortLink(url)) return url;                           // 不是短链：原样交回，由调用方给出明确报错
  const { finalUrl } = await resolveLink(url);
  return finalUrl || url;
}

/**
 * 复制一份用户输入，顺带把短链展开、把类型判断出来 ——
 * 界面只调这一个，不用自己拼 expandLink + detectLinkKind 的组合。
 * @returns {Promise<{kind:'song'|'album'|'playlist'|'program'|'id'|'', link:string, resolved:boolean}>}
 */
export async function classifyLink(input) {
  const raw = extractLink(input);
  const kind0 = detectLinkKind(raw);
  if (kind0 && kind0 !== 'id') return { kind: kind0, link: raw, resolved: false };
  if (!isShortLink(raw)) return { kind: kind0, link: raw, resolved: false };
  const link = await expandLink(raw);
  return { kind: detectLinkKind(link), link, resolved: true };
}

/* ---------------- 曲目计时（仅用于自动下一首） ----------------
 * 官方 iframe 不提供播放结束回调，也不暴露 currentTime，
 * 所以自动下一首只能靠本站计时估算已播时长。
 * 注意：这不是「可恢复的播放进度」—— 官方参数无法定位到指定秒数，
 * 因此暂停后必然从头播放，计时器只服务于「该切下一首了吗」。
 */

const position = {
  elapsed: 0,
  startedAt: 0,
  running: false,
};

export const Position = {
  start() {
    if (position.running) return;
    position.startedAt = performance.now();
    position.running = true;
  },
  stop() {
    if (!position.running) return;
    position.elapsed += (performance.now() - position.startedAt) / 1000;
    position.running = false;
  },
  get seconds() {
    const live = position.running ? (performance.now() - position.startedAt) / 1000 : 0;
    return Math.max(0, position.elapsed + live);
  },
  set(sec) {
    position.elapsed = Math.max(0, Number(sec) || 0);
    position.startedAt = performance.now();
  },
  reset() {
    position.elapsed = 0;
    position.startedAt = performance.now();
    position.running = false;
  },
};

/* ---------------- 数据访问 ---------------- */

let available = null;

/** 探测后端代理是否可用（结果缓存） */
export async function probeApi(force = false) {
  if (available !== null && !force) return available;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(`${API_BASE}/status`, { signal: ctrl.signal });
    clearTimeout(t);
    available = res.ok;
  } catch {
    available = false;
  }
  bus.emit('netease:probe', { available });
  return available;
}

export const isAvailable = () => available === true;

async function api(path) {
  const res = await fetch(`${API_BASE}${path}`);
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error || `请求失败（HTTP ${res.status}）`);
  return json;
}

/**
 * 搜索曲目。
 * 网易云的搜索接口只返回专辑的 picId，不返回可直接使用的封面 URL，
 * 因此这里会再补一次详情请求拿完整的封面（一次请求覆盖 20 条）。
 */
export async function search(keyword, { limit = 20, offset = 0 } = {}) {
  const q = String(keyword ?? '').trim();
  if (!q) return { songs: [], total: 0, query: '' };
  const json = await api(`/search?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`);
  let songs = json.songs || [];
  if (songs.some((s) => !s.cover) && songs.length) {
    try {
      const detail = await fetchSongs(songs.map((s) => s.id));
      const map = new Map(detail.map((d) => [String(d.id), d]));
      songs = songs.map((s) => {
        const d = map.get(String(s.id));
        return d ? { ...s, cover: s.cover || d.cover, album: s.album || d.album, fee: s.fee ?? d.fee } : s;
      });
    } catch { /* 补封面失败不影响搜索 */ }
  }
  return { songs, total: json.total || songs.length, query: q, cached: json.cached };
}

/* ---------------- 能不能真的出声（会员曲目判定） ----------------
 * 官方外链播放器对 VIP / 付费专辑曲目**不出声**：iframe 照样在转、我们自建的歌词时钟
 * 也照样在走，于是就成了「歌词在动却没声音」。服务端可以匿名探测出结论
 * （/song/media/outer/url 不给就 302 到 /404），这里只负责缓存 + 分类。
 */

const AVAIL_TTL = 10 * 60 * 1000;
const availCache = new Map();     // id → { at, value: true|false|null }

/** fee 只能当提示：0 免费、1 VIP、4 付费专辑、8 低音质免费（8 其实是能放的） */
export const isVipOnly = (song) => song?.fee === 1 || song?.fee === 4;

/**
 * 匿名态能否播放。返回 true / false / null（测不出来）。
 * 单曲查询会命中服务端缓存，不会每次都打扰网易云。
 */
export async function checkPlayable(ids) {
  const list = [...new Set((Array.isArray(ids) ? ids : [ids]).map(String).filter((s) => /^\d{4,12}$/.test(s)))].slice(0, 24);
  if (!list.length) return {};
  const out = {};
  const ask = [];
  list.forEach((id) => {
    const hit = availCache.get(id);
    if (hit && Date.now() - hit.at < AVAIL_TTL) out[id] = hit.value;
    else ask.push(id);
  });
  if (ask.length) {
    try {
      const json = await api(`/playable?id=${ask.join('&id=')}`);
      Object.entries(json.results || {}).forEach(([id, v]) => {
        const value = v === true ? true : (v === false ? false : null);
        availCache.set(id, { at: Date.now(), value });
        out[id] = value;
      });
    } catch {
      ask.forEach((id) => { out[id] = null; });
    }
  }
  return out;
}

/** 单曲便利版 */
export async function isPlayable(id) {
  const r = await checkPlayable([id]);
  return r[String(id)] ?? null;
}

/**
 * 这首歌"到底有多少秒"—— 服务端从音频本身量出来的（CBR 按码率、VBR 按 Xing 帧数）。
 *
 * 为什么要单独问：官方 iframe 不给结束回调，站内只能按时长估算切歌，
 * 而**元数据时长有时候是完整曲目、外链给的音频却只是几十秒的试听片段**，
 * 照元数据等就会干等好几分钟。这里拿到的是真实秒数。
 *
 * @returns {Promise<{playable:boolean|null, seconds:number, bytes:number, bitrate:number, mode:string}|null>}
 */
export async function audioInfo(id) {
  const key = String(id || '');
  if (!/^\d{4,12}$/.test(key)) return null;
  try {
    const json = await api(`/playable?detail=1&id=${key}`);
    return json.results?.[key] ?? null;
  } catch { return null; }
}

/** 音频明显短于元数据 → 多半只是试听片段 */
export const looksLikeFragment = (info, metaSeconds) => {
  const real = Number(info?.seconds) || 0;
  const meta = Number(metaSeconds) || 0;
  if (!real || !meta) return false;
  return real < meta - 8 && real < meta * 0.85;
};

/**
 * 给一首放不出来的歌找「能放的版本」：同名曲目里挑非会员的。
 * 只发一次搜索请求，结果按「同名优先」排。
 */
export async function findPlayableAlternatives(song, { limit = 4 } = {}) {
  const title = String(song?.name || song?.title || '').trim();
  if (!title) return [];
  const artist = (Array.isArray(song?.artists) ? song.artists[0] : String(song?.artist || '').split(' / ')[0]) || '';
  const { songs } = await search(`${title} ${artist}`.trim(), { limit: 20 });
  const selfId = String(song?.id || song?.neteaseId || '');
  const pool = songs
    .filter((s) => String(s.id) !== selfId)
    .filter((s) => !isVipOnly(s))
    .filter((s) => String(s.name).replace(/\s+/g, '').includes(title.replace(/\s+/g, '').slice(0, 6)) || title.includes(String(s.name).slice(0, 6)));
  // 同名的排前面，其次是有封面的
  pool.sort((a, b) => (a.name === title ? -1 : 0) - (b.name === title ? -1 : 0));
  const picked = pool.slice(0, limit);
  if (!picked.length) return [];
  // 再用匿名态探测确认一遍（fee=0 也可能因为版权下架）
  const avail = await checkPlayable(picked.map((s) => s.id)).catch(() => ({}));
  return picked.filter((s) => avail[String(s.id)] !== false);
}

/** 批量补齐曲目信息（用于导入链接 / 恢复本地列表） */
export async function fetchSongs(ids) {  const list = [...new Set((ids || []).map(String).filter((s) => /^\d+$/.test(s)))].slice(0, 50);
  if (!list.length) return [];
  const json = await api(`/songs?ids=${list.join(',')}`);
  return json.songs || [];
}

/* ---------------- 歌单导入 ----------------
 * 能力边界：
 *   ✅ 公开歌单（含排行榜）可以读取曲目列表 → 一次性导入到本站播放列表
 *   ❌ 「我喜欢的音乐」、私密歌单、需要登录才可见的歌单读不到 —— 不做登录
 *   ❌ 导入的只是**曲目元数据**，试听仍然走官方外链播放器（不涉及音频流）
 */

/** 单次导入的曲目上限：太大既慢又占 localStorage，且列表页会很长 */
export const PLAYLIST_IMPORT_LIMIT = 300;

/** 读取歌单元数据 + 曲目 id 列表（支持 163cn.tv 短链，会自动展开） */
export async function fetchPlaylist(input, { limit = PLAYLIST_IMPORT_LIMIT, onProgress } = {}) {
  const direct = parsePlaylistId(input);
  if (!direct && isShortLink(input)) onProgress?.({ phase: 'link', done: 0, total: 0, got: 0 });
  const link = direct ? String(input).trim() : await expandLink(input);
  const id = parsePlaylistId(link);
  if (!id) {
    const songId = parseSongId(link);
    throw new Error(songId
      ? '这看起来是单曲链接，不是歌单；导入歌单请用歌单链接（playlist?id=…）'
      : '无法识别歌单链接，请粘贴网易云歌单链接（含 163cn.tv 短链）或歌单 ID');
  }
  const json = await api(`/playlist?id=${id}&limit=${limit}`);
  const pl = json.playlist;
  if (!pl) throw new Error('歌单不存在或不可访问');
  return pl;
}

/**
 * 导入歌单到本站播放列表。
 *
 * @param {string} input          歌单链接或 id
 * @param {object} opts
 * @param {number} opts.limit     最多导入多少首（默认 300）
 * @param {boolean} opts.replace  true = 清空现有列表后替换；false = 追加（按曲目 id 去重）
 * @param {(p:{phase:string,done:number,total:number,got:number})=>void} opts.onProgress
 * @returns {{playlist:object, total:number, added:number, skipped:number, unavailable:number, truncated:boolean}}
 */
export async function importPlaylist(input, {
  limit = PLAYLIST_IMPORT_LIMIT,
  replace = false,
  onProgress,
} = {}) {
  onProgress?.({ phase: 'meta', done: 0, total: 0, got: 0 });
  const pl = await fetchPlaylist(input, { limit, onProgress });

  // v6 歌单接口的 tracks 只给前若干首（大歌单常见），完整顺序在 trackIds 里。
  // tracks 够用就直接用，省掉一批请求。
  const ids = (pl.trackIds?.length ? pl.trackIds : (pl.tracks || []).map((t) => String(t.id)))
    .map(String)
    .slice(0, limit);
  if (!ids.length) throw new Error('这个歌单里没有可读取的曲目（可能是私密歌单或空歌单）');

  const byId = new Map((pl.tracks || []).map((t) => [String(t.id), t]));
  const missing = ids.filter((id) => !byId.has(id));

  // 缺的部分按 50 首一批补齐（服务端单次上限 50）
  const chunks = [];
  for (let i = 0; i < missing.length; i += 50) chunks.push(missing.slice(i, i + 50));
  let got = byId.size;
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.({ phase: 'tracks', done: i, total: chunks.length, got });
    try {
      const part = await fetchSongs(chunks[i]);
      part.forEach((s) => byId.set(String(s.id), s));
      got += part.length;
    } catch {
      // 单批失败不整体失败：能拿到多少算多少
    }
  }
  onProgress?.({ phase: 'tracks', done: chunks.length, total: chunks.length, got });

  // 按歌单原始顺序组装，跳过拿不到详情的（版权下架 / 付费限制）
  const songs = ids.map((id) => byId.get(id)).filter(Boolean);
  const unavailable = ids.length - songs.length;

  const incoming = songs.map(toTrack);
  const others = Player.tracks.filter((t) => t.provider !== 'netease');
  const existing = Player.tracks.filter((t) => t.provider === 'netease');
  const seen = new Set(existing.map((t) => t.neteaseId));
  const fresh = incoming.filter((t) => !seen.has(t.neteaseId));

  // 追加时保留列表里已有的网易云曲目（以及任何非网易云来源），只在末尾接上新的
  const next = replace ? incoming : [...others, ...existing, ...fresh];
  // keepIndex + 当前播放状态：导入不该打断正在播放的曲目
  Player.setTracks(next, { keepIndex: true, autoplay: Player.playing });
  savePlaylist(Player.tracks);

  onProgress?.({ phase: 'done', done: chunks.length, total: chunks.length, got });
  return {
    playlist: pl,
    total: ids.length,
    added: replace ? incoming.length : fresh.length,
    skipped: replace ? 0 : incoming.length - fresh.length,
    unavailable,
    truncated: (pl.trackCount || 0) > ids.length,
  };
}

/** 读取专辑元数据 + 完整曲目（支持 163cn.tv 短链，会自动展开） */
export async function fetchAlbum(input, { limit = PLAYLIST_IMPORT_LIMIT, onProgress } = {}) {
  const direct = parseAlbumId(input);
  if (!direct && isShortLink(input)) onProgress?.({ phase: 'link', done: 0, total: 0, got: 0 });
  const link = direct ? String(input).trim() : await expandLink(input);
  const id = parseAlbumId(link);
  if (!id) {
    const songId = parseSongId(link);
    throw new Error(songId
      ? '这看起来是单曲链接，不是专辑；导入专辑请用专辑链接（album?id=…）'
      : '无法识别专辑链接，请粘贴网易云专辑链接（含 163cn.tv 短链）或专辑 ID');
  }
  const json = await api(`/album?id=${id}&limit=${limit}`);
  if (!json.album) throw new Error('专辑不存在或不可访问');
  return { ...json.album, tracks: json.tracks || [] };
}

/** 把一批曲目并进站内播放列表（导入歌单 / 专辑共用） */
function applyImport(songs, { replace = false } = {}) {
  const incoming = songs.map(toTrack);
  const others = Player.tracks.filter((t) => t.provider !== 'netease');
  const existing = Player.tracks.filter((t) => t.provider === 'netease');
  const seen = new Set(existing.map((t) => t.neteaseId));
  const fresh = incoming.filter((t) => !seen.has(t.neteaseId));
  // 追加时保留列表里已有的网易云曲目（以及任何非网易云来源），只在末尾接上新的
  const next = replace ? incoming : [...others, ...existing, ...fresh];
  // keepIndex + 当前播放状态：导入不该打断正在播放的曲目
  Player.setTracks(next, { keepIndex: true, autoplay: Player.playing });
  savePlaylist(Player.tracks);
  return {
    total: incoming.length,
    added: replace ? incoming.length : fresh.length,
    skipped: replace ? 0 : incoming.length - fresh.length,
  };
}

/**
 * 导入专辑到本站播放列表（返回结构与 importPlaylist 对齐，界面可以同一套文案）。
 */
export async function importAlbum(input, { limit = PLAYLIST_IMPORT_LIMIT, replace = false, onProgress } = {}) {
  onProgress?.({ phase: 'meta', done: 0, total: 0, got: 0 });
  const album = await fetchAlbum(input, { limit, onProgress });
  const songs = (album.tracks || []).slice(0, limit);
  if (!songs.length) throw new Error('这张专辑里没有可读取的曲目');
  const r = applyImport(songs, { replace });
  onProgress?.({ phase: 'done', done: 1, total: 1, got: songs.length });
  return {
    album,
    source: { kind: 'album', id: album.id, name: album.name, cover: album.cover, artist: album.artist, count: songs.length },
    unavailable: Math.max(0, (album.size || songs.length) - songs.length),
    truncated: (album.size || 0) > songs.length,
    ...r,
  };
}

/**
 * 统一的「粘贴链接就能用」入口：短链会先展开，再按类型分派。
 *
 * 这是用户在搜索框里粘链接时会走到的那条路（单曲链接除外 —— 那种直接播放更方便）。
 * @returns {Promise<object>} importPlaylist / importAlbum 的结果（带 source 描述）
 */
export async function importFromLink(input, { limit = PLAYLIST_IMPORT_LIMIT, replace = false, onProgress } = {}) {
  const { kind, link } = await classifyLink(input);
  if (kind === 'album') return importAlbum(link, { limit, replace, onProgress });
  if (kind === 'playlist') return importPlaylist(link, { limit, replace, onProgress });
  if (kind === 'program') {
    // 电台节目：拿节目里的主曲目当单曲处理
    const songId = parseSongId(link);
    if (songId) throw new Error('这是电台节目链接，按单曲处理更合适（直接把节目链接粘进搜索框即可播放）');
  }
  const withSource = await importPlaylist(link, { limit, replace, onProgress });
  return {
    ...withSource,
    source: {
      kind: 'playlist', id: withSource.playlist?.id, name: withSource.playlist?.name,
      cover: withSource.playlist?.cover, count: withSource.total,
    },
  };
}

/* ---------------- 转换为播放器曲目 ---------------- */

export function toTrack(song) {
  const fee = Number(song.fee) || 0;
  return {
    id: `ne-${song.id}`,
    provider: 'netease',
    neteaseId: String(song.id),
    title: song.name,
    artist: Array.isArray(song.artists) ? song.artists.join(' / ') : (song.artist || ''),
    album: song.album || '',
    cover: song.cover || '',
    duration: Number(song.duration) || 0,
    // fee 留着：官方外链对 VIP / 付费专辑曲目不出声，列表上要标出来
    // （0 免费、1 VIP、4 付费专辑、8 低音质免费 —— 注意 8 是能放的）
    // 标记统一由 isVipOnly() 从 fee 推出来，避免 tags 里再存一份导致重复显示
    fee,
    tags: [],
  };
}

/* ---------------- 播放列表持久化 ---------------- */

export function loadSavedPlaylist() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(raw) ? raw.map((t) => Player.normalize({ ...t, provider: 'netease' })) : [];
  } catch {
    return [];
  }
}

export function savePlaylist(tracks) {
  try {
    const slim = (tracks || [])
      .filter((t) => t.provider === 'netease' && t.neteaseId)
      .map((t) => ({
        id: t.id, provider: 'netease', neteaseId: t.neteaseId,
        title: t.title, artist: t.artist, album: t.album,
        cover: t.cover, duration: t.duration, tags: t.tags, fee: t.fee,
        // 记住「这首只能走官方播放器」和实测秒数：下次打开不用再白试一次直放，
        // 官方播放器的估算时钟也能直接用真实秒数（元数据时长可能只是试听片段）
        embedOnly: !!t.embedOnly,
        audioSeconds: Number(t.audioSeconds) || 0,
      }));
    localStorage.setItem(STORE_KEY, JSON.stringify(slim));
    return true;
  } catch {
    return false;
  }
}

/* ---------------- 播放历史 ---------------- */

const HISTORY_KEY = 'ft.terminal.neteaseHistory';
const HISTORY_MAX = 30;

export function history() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}

export function pushHistory(song) {
  try {
    const list = history().filter((s) => String(s.id) !== String(song.id));
    list.unshift({
      id: String(song.id), name: song.name,
      artists: song.artists || [], album: song.album || '',
      cover: song.cover || '', duration: song.duration || 0, at: Date.now(),
    });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
    bus.emit('netease:history', { list: history() });
  } catch { /* 忽略隐私模式限制 */ }
}

export function clearHistory() {
  try { localStorage.removeItem(HISTORY_KEY); } catch { /* noop */ }
  bus.emit('netease:history', { list: [] });
}

/* ---------------- 注册为播放器来源 ---------------- */

/**
 * 「站内直放」来源：网易云曲目经本站同源转发的音频流，由页面自己的 <audio> 播放。
 *
 * 这是**默认**来源，因为它是唯一能做到「一首完整放完 + 后台也能自动切歌」的方案：
 *   · `ended` 由媒体管线触发，不受后台定时器节流 / 页面冻结影响；
 *   · duration / currentTime 都是真的 —— 不用估算，也就不会掐掉结尾或干等；
 *   · 拖动进度、音量、锁屏控制（Media Session）都顺带有了（频谱仍用合成音浪，
 *     理由见 core/player.js 的 ensureGraph）。
 *
 * prepare() 返回 false = 播放由引擎驱动 <audio>（不是外部接管）。
 * 换歌时由引擎调用，同 src 不重复 load（避免自己打断自己）。
 */
export const neteaseAudioProvider = {
  id: 'netease-audio',
  label: '网易云（站内直放）',
  embed: false,
  canHandle: (t) => !!t?.neteaseId,
  /**
   * 这首歌的音频地址。
   * 放在来源上而不是写死在引擎里：引擎要**预取下一首**，而它只该知道"问来源要地址"。
   */
  audioUrl(track) {
    if (!track?.neteaseId) return '';
    return track.src || directAudioUrl(track.neteaseId);
  },
  prepare(track, ctx) {
    const src = this.audioUrl(track);
    if (ctx.audio.getAttribute('src') !== src) {
      ctx.audio.src = src;
      try { ctx.audio.load(); } catch { /* 空 src 在个别浏览器会抛错 */ }
    }
    return false;   // 不接管播放
  },
  deactivate(ctx) {
    try { ctx.audio.pause(); } catch { /* noop */ }
  },
  /**
   * 直放失败（会员 / 版权受限 / 静态部署没有 /api / 外链过期）时的回退链：
   *   ① 还没试过原始外链 → 试一次：纯静态部署时这条路可能是通的；
   *   ② 还不行 → 标记这一首只能用官方播放器，并**当场换成 iframe 接着放**。
   *
   * 返回 true = 这次失败已接管：引擎不要再弹"加载失败"，更不要跳到下一首
   * （猜错的代价比"少播一首"大 —— 用户点的是这首，就该把这首放出来）。
   */
  onError(track, ctx) {
    if (!track?.neteaseId) return false;

    // 同步先接管这次失败：绝不让引擎弹"加载失败"、更不要跳到下一首
    // （用户点的是这首，就该把这首放出来）。随后异步决定回退到哪一步。
    void (async () => {
      // 问一句"服务端到底能不能给这首歌音频"，用来决定回退到哪一步。
      let missing = false;
      try {
        missing = (await fetch(this.audioUrl(track), { method: 'HEAD', cache: 'no-store' })).status === 404;
      } catch { missing = false; }

      // ⚠️ 上面这一句是**异步**的：期间用户可能已经换歌、按了暂停，甚至又点了一次播放。
      //    所以下面一律以"现在的状态"为准，绝不能拿失败发生那一刻的意图去改播放状态 ——
      //    否则会出现"明明按了暂停，一秒后它自己又放起来了"这种事。
      const stillMine = ctx.providerId === 'netease-audio' && ctx.current === track;
      const want = stillMine && !!ctx._intent;

      /**
       * 还有一次机会：用**浏览器自己的 IP** 直接取官方外链。
       *
       * 这里刻意**不看** `missing`：那个 404 只代表**服务器所在 IP** 拿不到
       * （线上实测：Netlify Functions 是境外机房 IP，《No Why》这类曲目一律被拒，
       *  而同一首歌从国内家宽 IP 是能拿到官方外链的）。而 <audio> 跟随 302 到 CDN
       * 不需要 CORS，所以"换个 IP 再试一次"这条路在客户端才走得通 ——
       * 这也正是"PC 能听、手机不能听"的另一半原因。
       * 用的仍然是网易云官方的匿名外链，不是任何越权手段：它给就给，不给就退官方播放器。
       */
      if (stillMine && want && !track._triedRawLink) {
        track._triedRawLink = true;
        track.src = rawAudioUrl(track.neteaseId);
        ctx.prepare(ctx.index, { autoplay: true });
        /**
         * 明确期限：原始外链有可能**既不报错也不出声** —— 跨域媒体卡在 pending 时
         * 既没有 error 事件也不会 readyState 前进（线上实测遇到过，界面就一直显示"正在播放"
         * 却永远没有声音、也没有任何提示）。看门狗只在若干条件都成立时才介入，
         * 所以这里给一条无条件的上限：到点还没开始放，就直接进官方播放器。
         */
        clearTimeout(track._rawDeadline);
        track._rawDeadline = setTimeout(() => {
          if (ctx.providerId !== 'netease-audio' || ctx.current !== track) return;
          const a = ctx.audio;
          if (a && a.readyState > 0 && !a.paused) return;      // 已经在放了，什么都不用做
          track.embedOnly = true;
          track.src = '';
          ctx._failCount = 0;
          ctx.prepare(ctx.index, { autoplay: !!ctx._intent });
          bus.emit('embed:needsTap', { track, reason: 'raw-link-deadline' });
        }, 6000);
        return;
      }

      // 收尾：这一首以后直接走官方播放器，别再白试直放
      track.embedOnly = true;
      track.src = '';
      ctx._failCount = 0;
      if (stillMine) ctx.prepare(ctx.index, { autoplay: want });
      bus.emit('toast', {
        message: `「${track.title}」站内直放不可用${isVipOnly(track) ? '（会员 / 付费曲目）' : ''}，已切回官方播放器`,
        kind: 'warn',
        ttl: 6000,
      });
      // 交给宿主把官方播放器"露出来、推到眼前"：
      // 移动端（iOS/Android）不允许跨域 iframe 自动起播，必须用户点它自己的 ▶，
      // 所以这里不能只是静默地切过去 —— 那样在手机上就是"看着在放、一点声音没有"。
      bus.emit('embed:needsTap', { track, reason: missing ? 'no-anonymous-audio' : 'direct-failed' });
    })();

    return true;
  },
};

/**
 * 网易云来源。prepare() 返回 true 表示「播放由外部（官方播放器）接管」，
 * 引擎便不会去驱动 <audio>，一切交给全局宿主 EmbedHost。
 *
 * 只在直放不可用时才会走到这里（会员 / 版权 / 静态部署 / 用户把 directAudio 关掉）。
 *
 * ⚠️ 关于暂停：官方嵌入播放器只有 type/id/auto/height 四个参数，
 *    没有任何控制接口或定位参数，所以「暂停后从原处续播」做不到 ——
 *    见 README 的「能力边界」一节。想要真正的暂停/续播/拖动进度，
 *    请把音频放进 assets/audio/ 并使用本地来源（PLAYLIST 配置），
 *    或者让 directAudio 保持开启（默认）。
 */
export const neteaseProvider = {
  id: 'netease',
  label: '网易云音乐',
  embed: true,
  canHandle: (t) => !!t?.neteaseId,
  prepare(track, ctx) {
    // 选中即准备完毕：iframe 由全局宿主挂载，真正发声需要一次用户点击
    void track; void ctx;
    return true;
  },
  /** 播放：从头开始播放 */
  play(track, ctx) {
    EmbedHost.show(track, { autoplay: true });
    ctx?._scheduleAdvance?.(track);
    /**
     * 移动端必须把播放器推到眼前并说清楚。
     *
     * 这条是给"**判定为不可播**、于是直接走官方播放器"的曲目用的 —— 那条路根本不经过
     * audio 的 onError，所以那边 emitted 的 embed:needsTap 永远轮不到它（线上实测：
     * 用户截图那首《No Why》就是这条，播放器被放在音乐台页面下方、视口之外，用户看不到）。
     * 窄屏由 EmbedHost 贴底固定并展开；宽屏只是滚到视口中央，没有副作用。
     */
    const touch = typeof window !== 'undefined'
      && ((window.matchMedia && window.matchMedia('(hover: none)').matches) || window.innerWidth < 720);
    if (touch) bus.emit('embed:needsTap', { track, reason: 'embed-source' });
  },
  /** 暂停：重建 auto=0 的播放器让它真正静音（进度会归零，官方限制） */
  pause(track, ctx) {
    EmbedHost.pause();
    ctx?._clearAdvance?.();
  },
  deactivate(track, ctx) {
    EmbedHost.hide();
    ctx?._clearAdvance?.();
  },
};

/* ---------------- 初始化 ---------------- */

/** 用本地保存的网易云列表替换播放列表（默认行为：播放列表即网易云列表） */
export function bootstrapPlaylist() {
  // 注册顺序即优先级：直放优先，官方外链播放器作为回退
  Player.registerProvider(neteaseAudioProvider);
  Player.registerProvider(neteaseProvider);
  const saved = loadSavedPlaylist();
  Player.setTracks(saved);
  return saved;
}

export const Netease = {
  embedUrl,
  directAudioUrl,
  rawAudioUrl,
  pageUrl,
  playlistUrl,
  parseSongId,
  parsePlaylistId,
  parseAlbumId,
  detectLinkKind,
  classifyLink,
  extractLink,
  isShortLink,
  resolveLink,
  expandLink,
  probeApi,
  isAvailable,
  search,
  fetchSongs,
  fetchPlaylist,
  importPlaylist,
  fetchAlbum,
  importAlbum,
  importFromLink,
  toTrack,
  loadSavedPlaylist,
  savePlaylist,
  bootstrapPlaylist,
  history,
  pushHistory,
  clearHistory,
  Position,
  isVipOnly,
  checkPlayable,
  isPlayable,
  audioInfo,
  looksLikeFragment,
  findPlayableAlternatives,
};

export default Netease;
