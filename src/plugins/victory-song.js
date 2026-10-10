/**
 * plugins/victory-song.js — 高级扫雷通关时自动播放「关羽之歌」
 * ------------------------------------------------------------------
 * 站主要求：扫雷**高级**难度通关（单人 / 联机）后自动播放关羽之歌。
 *
 * 三条设计上的取舍：
 *   · **不打包任何音频文件**：有版权的歌不进仓库。这里只用站点已有的音乐系统 ——
 *     向网易云的搜索接口找歌，拿到 id 之后交给 Player 播放（和你在音乐台点播是同一条路）。
 *     VIP-only 的结果会跳过（站点的立场是不绕过付费内容，这条不破例）。
 *   · **非破坏性**：把这首**追加**到当前队列末尾再跳过去播，原有队列、当前播放列表都不动。
 *     播完你可以直接按下一首回到原来的歌。
 *   · **不叠着响**：一分钟内重复通关只播一次（免得多局连打时叠在一起）。
 *
 * 失败不抛异常：找不到歌 / 网易云不可用时返回 { ok:false, reason }，由调用方决定要不要提示。
 */

import { Netease, toTrack, isVipOnly } from './netease.js';
import { Player } from '../core/player.js';

const QUERY = '关羽之歌';
const COOLDOWN_MS = 60 * 1000;

let lastAt = 0;
let cachedId = null;     // 同一会话里记住找到的那首，避免每次通关都重新搜

/**
 * 播放通关音乐。
 * @param {{ force?: boolean }} opts force=true 时忽略冷却（例如站主手动试听）
 * @returns {Promise<{ok:boolean, title?:string, reason?:string}>}
 */
export async function playVictorySong({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastAt < COOLDOWN_MS) return { ok: false, reason: '刚播过（一分钟内只播一次）' };
  if (!Netease?.available?.()) return { ok: false, reason: '网易云通道当前不可用' };

  try {
    let song = null;
    if (cachedId && typeof Netease.fetchSongs === 'function') {
      const list = await Netease.fetchSongs([cachedId]).catch(() => null);
      song = (list || [])[0] || null;
    }
    if (!song) {
      const res = await Netease.search(QUERY, { limit: 10 });
      const songs = (res && res.songs) || [];
      // 优先挑非 VIP-only 的（VIP 的在我们这里放不出声，选了反而尴尬）
      song = songs.find((s) => !isVipOnly(s)) || songs[0] || null;
      if (song) cachedId = String(song.id);
    }
    if (!song) return { ok: false, reason: `没搜到「${QUERY}」` };

    const track = toTrack(song);
    const list = [...Player.tracks, track];
    Player.setTracks(list, { keepIndex: true });        // 追加到末尾，保持当前索引
    Player.load(list.length - 1, { play: true });       // 立刻播这一首
    lastAt = Date.now();
    return { ok: true, title: track.title || song.name || QUERY };
  } catch (err) {
    return { ok: false, reason: String(err?.message || err) };
  }
}

/** 只有**高级**通关才播（站主明确要求的触发条件） */
export const isExpertLevel = (levelId) => String(levelId || '') === 'expert';
