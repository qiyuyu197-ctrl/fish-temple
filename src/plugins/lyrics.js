/**
 * plugins/lyrics.js — 歌词引擎
 * ==================================================================
 * 为什么能做到「跟唱」：
 *   · 歌词本身好办：网易云的 `/api/song/lyric` 不需要登录，由 server.mjs 代取 LRC 文本
 *   · 难点是**时间轴**：官方嵌入播放器是跨域 iframe，我们读不到它的 currentTime，
 *     也没有任何进度事件。所以这里用的是「自建时钟」——
 *     我们在哪个时刻把 auto=1 的播放器推进去，就从那一刻开始计时。
 *   · 好在官方播放器只有一个「从头播」的行为：暂停=重建 auto=0、继续=重建 auto=1，
 *     两者都会回到 0:00，所以时钟也跟着归零，反而与真实播放位置保持一致。
 *   · 唯一的误差来源是 iframe 加载耗时（几百毫秒），用 OFFSET_MS 做常数补偿。
 *     用户在官方播放器里拖动进度的话歌词会偏，这是这套方案的固有代价（README 有说明）。
 *
 * 对外接口：
 *   Lyrics.init()                 绑定播放器事件（main.js 调一次）
 *   Lyrics.load(track)            取这首歌的歌词
 *   Lyrics.current() / next()     当前行 / 下一行
 *   Lyrics.elapsed()              估算的播放毫秒数
 *   Lyrics.setOffset(ms)          手动校准
 * 事件：
 *   lyrics:ready  { track, lines, nolyric }
 *   lyrics:line   { index, line, next, elapsed }
 *   lyrics:idle   {}              没有曲目 / 不是网易云
 */
import { bus } from '../core/bus.js';
import { Player } from '../core/player.js';

/** 只有官方 iframe 才需要这个常数补偿（插入到真正出声有几百毫秒延迟）。
 *  直放读的是真实 currentTime，再减 600ms 会让整首歌的歌词提前 0.6 秒。 */
const OFFSET_MS = 600;
/** 直放时行切换的检查间隔：80ms 已经比人眼可辨的"卡顿"细，250ms 会肉眼晚半拍 */
const TICK_MS = 80;
const MAX_LINES = 400;
/** 内存里保留多少首歌词：来回切歌时不用重复打接口，也不至于无限涨 */
const CACHE_MAX = 80;

/** 歌词开头的「作词/作曲/编曲/制作人…」是随 LRC 一起回来的制作信息，
 *  网易云自己的播放器也会显示，但放在我们这块标题栏里很怪。
 *  早期只丢掉前 3 秒内的行，结果歌曲末尾的「录音棚 / 混音 / 母带室」又会
 *  跑进沉浸歌词里；现在只要它长成「关键词 + 冒号」的样子就丢掉
 *  （歌曲正文里出现这些词的概率极低）。
 *  注意写法不固定：「制作人/编曲：Yu H.」这种也是制作信息。 */
const CREDIT_WORDS = /(作词|作曲|编曲|制作人|监制|混音|母带|录音|配唱|和声|吉他|贝斯|鼓|键盘|弦乐|出品|发行|演唱|主唱|企划|版权|管理方|词曲|Produced|Composed|Arranged|Lyricist|Vocals?)/i;

function isCreditLine(text) {
  const head = text.slice(0, 24);
  return CREDIT_WORDS.test(head) && /[:：]/.test(head);
}

/* ---------------- 三种歌词格式 ----------------
 *
 * 网易云的歌词现在会混着回来，同一首歌里都可能出现两种：
 *   · 老 LRC：`[00:12.25]副歌`
 *   · 逐字 yrc：`[224910,3680](224910,360,0)战(225270,560,0)吗…`
 *   · 富文本 JSON 行：`{"t":0,"c":[{"tx":"作词: "},{"tx":"某某"}]}`
 *
 * 逐字的时间轴在 yrc 的括号里：`(词开始ms, 词时长ms, ?)`，后面跟到的下一个 `(` 之前
 * 就是这个词的文字。前端据此把每个字点亮 —— 没有 yrc 的歌就用"行时长 ÷ 字数"平均分配，
 * 至少节奏上不会呆住。
 */
const YRC_HEAD = /^\[(\d{1,7}),(\d{1,7})\]/;
const YRC_WORD = /\((\d{1,7}),(\d{1,7}),(-?\d+)\)([^(]*)/g;

function parseRichLine(raw) {
  try {
    const obj = JSON.parse(raw);
    if (!obj || !Array.isArray(obj.c)) return null;
    const text = obj.c.map((c) => String(c?.tx ?? '')).join('').replace(/\s+/g, ' ').trim();
    if (!text) return null;
    return { t: Math.max(0, Number(obj.t) || 0), text };
  } catch {
    return null;
  }
}

function parseYrcLine(raw) {
  const head = raw.match(YRC_HEAD);
  if (!head) return null;
  const words = [];
  YRC_WORD.lastIndex = 0;
  let m;
  while ((m = YRC_WORD.exec(raw))) {
    const text = m[4];
    if (!text) continue;
    words.push({ t: Number(m[1]), d: Number(m[2]), text });
  }
  if (!words.length) return null;
  return {
    t: Number(head[1]),
    d: Number(head[2]),
    text: words.map((w) => w.text).join('').replace(/\s+/g, ' ').trim(),
    words,
  };
}

/** 把一行展开成「每颗字的时间」：有逐字就用逐字，否则按行时长平均分。 */
function expandChars(line, duration) {
  const chars = [];
  const push = (text, t, d) => {
    const list = [...text];
    const per = d / Math.max(1, list.length);
    list.forEach((ch, i) => chars.push({ ch, t: Math.round(t + i * per), d: Math.round(per) }));
  };

  if (line.words?.length) {
    for (const w of line.words) {
      const wd = w.d > 0 ? w.d : Math.max(120, duration / Math.max(1, line.words.length));
      push(w.text, w.t, wd);
    }
    return chars;
  }
  if (!line.text) return chars;
  push(line.text, line.t, Math.max(600, duration || 4000));
  return chars;
}

/** 解析 LRC / yrc / 富文本 JSON：[mm:ss.xx] 文本，一行可能带多个时间戳 */
export function parseLrc(text) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    if (!raw.trim()) continue;

    // 富文本 JSON 行
    if (raw.trimStart().startsWith('{')) {
      const rich = parseRichLine(raw);
      if (rich && !isCreditLine(rich.text)) out.push(rich);
      continue;
    }

    // 逐字 yrc 行
    if (YRC_HEAD.test(raw)) {
      const yrc = parseYrcLine(raw);
      if (yrc && yrc.text && !isCreditLine(yrc.text)) out.push(yrc);
      continue;
    }

    // 普通 LRC（一行可带多个时间戳）
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const body = raw.replace(/\[[^\]]*\]/g, '').trim();
    if (!body) continue;
    for (const m of stamps) {
      const min = Number(m[1]) || 0;
      const sec = Number(m[2]) || 0;
      const frac = m[3] ? Number(`0.${m[3].padEnd(3, '0').slice(0, 3)}`) : 0;
      const t = Math.round((min * 60 + sec + frac) * 1000);
      if (isCreditLine(body)) continue;
      out.push({ t, text: body });
    }
  }
  out.sort((a, b) => a.t - b.t);
  const lines = out.slice(0, MAX_LINES);

  // 行时长：有 yrc 自带就用自己的，否则用下一行的开始时间；再展开成逐字时间
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const next = lines[i + 1];
    const span = next ? next.t - line.t : 0;
    if (!(line.d > 0)) line.d = span > 0 ? Math.min(span, 15000) : 4000;
    line.chars = expandChars(line, line.d);
  }
  return lines;
}

/**
 * 把网易云的翻译 LRC 并进原文行。
 *
 * 翻译时间轴与原文通常逐行对齐，但偶尔会差几十毫秒，所以不要求时间戳完全相同，
 * 取最近的一行、且距离不超过 350ms。没有翻译的曲目原样返回，界面会自己隐藏译文行。
 */
export function attachTranslations(lines, translatedLrc) {
  const trans = parseLrc(translatedLrc);
  if (!trans.length || !lines.length) return lines;
  let j = 0;
  for (const line of lines) {
    while (j + 1 < trans.length && Math.abs(trans[j + 1].t - line.t) <= Math.abs(trans[j].t - line.t)) j++;
    const hit = trans[j];
    if (hit && Math.abs(hit.t - line.t) <= 350) line.translation = hit.text;
  }
  return lines;
}

export const Lyrics = {
  track: null,
  lines: [],
  index: -1,
  status: 'idle',       // idle | loading | ready | empty | error | local
  offset: 0,            // 用户手动校准量；iframe 的 600ms 基础补偿单独算
  _running: false,
  _startedAt: 0,
  _frozen: 0,
  _timer: null,
  _msg: '',
  _cache: new Map(),

  init() {
    bus.on('player:track', ({ track } = {}) => {
      if (!track) return this.clear();
      if (track.provider !== 'netease') {
        // 本地音频没有歌词来源，只报个态，标题栏照样能显示
        this.track = track;
        this.lines = [];
        this.index = -1;
        this.status = 'local';
        this._stopTimer();
        bus.emit('lyrics:idle', { track, reason: 'local' });
        return;
      }
      this.load(track);
    });

    // 官方播放器重建 = 从头开始；auto=1 开钟，auto=0 停表
    bus.on('player:embed', ({ track, autoplay } = {}) => {
      if (!track?.neteaseId) return;
      if (autoplay) this.start(0);
      else this.stop();
    });
    bus.on('player:state', ({ playing } = {}) => {
      if (playing === false) return this.stop();
      // 直放（同源 <audio>）不会发 player:embed，所以起表也得挂在这里 ——
      // 否则歌词显示第一行后就再也不动（详见 now() 的注释）。
      if (playing === true && !this._running) this.start(0);
      return undefined;
    });

    return this;
  },

  /** 取歌词（带内存缓存，同一首只请求一次） */
  async load(track) {
    if (!track?.neteaseId) return this.clear();
    const id = String(track.neteaseId);
    const same = this.track?.neteaseId === id;
    this.track = track;
    if (same && (this.status === 'ready' || this.status === 'empty')) return this;

    // 之前听过、切回来时直接用缓存：不闪「正在取歌词」，也不重复请求
    const cached = this._cache.get(id);
    if (cached) {
      this.lines = cached.lines;
      this.status = cached.status;
      this._msg = cached.msg;
      this.index = -1;
      bus.emit('lyrics:ready', { track, lines: this.lines, status: this.status, nolyric: cached.nolyric, cached: true });
      this._tick(true);
      return this;
    }

    this.status = 'loading';
    this.lines = [];
    this.index = -1;
    this._msg = '';
    bus.emit('lyrics:ready', { track, lines: [], status: 'loading' });

    try {
      const res = await fetch(`/api/netease/lyric?id=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      // 优先用逐字 yrc（有的话）；没有就退回行级 lrc。
      // 两种格式里都可能混着富文本 JSON 行，parseLrc 都认。
      const primary = String(json.yrc || '').trim() ? json.yrc : json.lrc;
      // 译文与原文一起回来，按最近时间戳对齐；没有译文就只显示原文
      const lines = attachTranslations(parseLrc(primary), json.tlyric || '');
      // 当前曲目可能在请求期间被切走了
      if (this.track?.neteaseId !== id) return this;
      this.lines = lines;
      this.status = lines.length ? 'ready' : 'empty';
      this._msg = json.nolyric ? '纯音乐 · 没有歌词' : '这首歌没有可显示的歌词';
      this._remember(id, { lines, status: this.status, msg: this._msg, nolyric: !!json.nolyric });
      bus.emit('lyrics:ready', { track, lines, status: this.status, nolyric: !!json.nolyric });
      this._tick(true);
    } catch (err) {
      this.status = 'error';
      this._msg = '歌词获取失败';
      bus.emit('lyrics:ready', { track, lines: [], status: 'error', error: String(err.message || err) });
    }
    return this;
  },

  _remember(id, entry) {
    if (!id) return;
    if (this._cache.size >= CACHE_MAX) {
      // Map 保持插入顺序：删最早的一首
      this._cache.delete(this._cache.keys().next().value);
    }
    this._cache.set(id, entry);
  },

  clear() {
    this.track = null;
    this.lines = [];
    this.index = -1;
    this.status = 'idle';
    this._msg = '';
    this._stopTimer();
    bus.emit('lyrics:idle', {});
    return this;
  },

  /** 开始计时（at 为已经播过的毫秒数；网易云每次都是 0） */
  start(at = 0) {
    this._running = true;
    this._startedAt = Date.now() - at;
    this._frozen = at;
    this._ensureTimer();
    this._tick(true);
    return this;
  },

  stop() {
    if (this._running) this._frozen = this.elapsed();
    this._running = false;
    this._stopTimer();
    return this;
  },

  /** iframe 的基础补偿；直放没有这个延迟 */
  baseOffset() {
    return Player?.isEmbed ? OFFSET_MS : 0;
  },

  /** 估算的播放位置（毫秒） */
  elapsed() {
    if (!this._running) return Math.max(0, this._frozen);
    const raw = Date.now() - this._startedAt;
    return Math.max(0, raw - this.baseOffset() - this.offset);
  },

  /**
   * 歌词该用哪个时间。
   *
   * ⚠️ 这里踩过坑：站内直放（同源 `<audio>`）**有真实的 currentTime**，官方 iframe 读不到
   * （`Player.currentTime` 在 embed 下恒为 0，见 core/player.js），只能按时长估算。
   * 早先只有 `player:embed`（autoplay=true）会 `start()`，而直放曲目发出的是
   * `player:embed {track:null}` → 计时器从来没起过，表现为「歌词显示第一行就再也不动」。
   * 那次是"付费曲目从 iframe 改成站内直放"之后暴露的 —— 直放多了，歌词反而停了。
   *
   * 所以：直放时直接读播放器的真实进度（还免了估算漂移），只有 embed 才回退到挂钟估算。
   */
  now() {
    try {
      const t = Player?.currentTime;
      if (!Player?.isEmbed && Number.isFinite(t) && t > 0) {
        return Math.max(0, t * 1000 - this.offset);
      }
    } catch { /* 播放器还没起来 */ }
    return this.elapsed();
  },

  /** 手动校准（正值 = 歌词往后推） */
  setOffset(ms) {
    this.offset = Math.max(-5000, Math.min(30000, Number(ms) || 0));
    this._tick(true);
    return this.offset;
  },

  current() { return this.index >= 0 ? this.lines[this.index] : null; },
  next() { return this.lines[this.index + 1] || null; },
  prev() { return this.index > 0 ? this.lines[this.index - 1] : null; },
  translation() { return this.current()?.translation || ''; },

  _ensureTimer() {
    if (this._timer) return;
    this._timer = setInterval(() => this._tick(), TICK_MS);
  },

  _stopTimer() {
    if (!this._timer) return;
    clearInterval(this._timer);
    this._timer = null;
  },

  /** 找出当前该显示哪一行，变了就广播 */
  _tick(force = false) {
    if (!this.lines.length) return;
    const ms = this.now();
    let i = -1;
    for (let k = 0; k < this.lines.length; k++) {
      if (this.lines[k].t <= ms) i = k; else break;
    }
    if (!force && i === this.index) return;
    const changed = i !== this.index;
    this.index = i;
    bus.emit('lyrics:line', {
      index: i,
      line: this.current(),
      next: this.next(),
      elapsed: ms,
      changed,
    });
  },
};

export default Lyrics;
