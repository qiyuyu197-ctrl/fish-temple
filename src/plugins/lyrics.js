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

/** iframe 从插入到真正出声大约要这么久，用它把歌词往后压一点 */
const OFFSET_MS = 600;
const TICK_MS = 250;
const MAX_LINES = 400;

/** 歌词开头的「作词/作曲/编曲/制作人…」是随 LRC 一起回来的制作信息，
 *  网易云自己的播放器也会显示，但放在我们这块标题栏里很怪 —— 前 3 秒内
 *  命中关键词 + 冒号的行直接丢掉（歌曲正文里出现这些词的概率极低）。
 *  注意写法不固定：「制作人/编曲：Yu H.」这种也是制作信息。 */
const CREDIT_WORDS = /(作词|作曲|编曲|制作人|监制|混音|母带|录音|配唱|和声|吉他|贝斯|鼓|键盘|弦乐|出品|发行|演唱|Produced|Composed|Arranged|Lyricist|Vocals?)/i;

function isCreditLine(text) {
  const head = text.slice(0, 24);
  return CREDIT_WORDS.test(head) && /[:：]/.test(head);
}

/** 解析 LRC：[mm:ss.xx] 文本，一行可能带多个时间戳 */
export function parseLrc(text) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const body = raw.replace(/\[[^\]]*\]/g, '').trim();
    if (!body) continue;
    for (const m of stamps) {
      const min = Number(m[1]) || 0;
      const sec = Number(m[2]) || 0;
      const frac = m[3] ? Number(`0.${m[3].padEnd(3, '0').slice(0, 3)}`) : 0;
      const t = Math.round((min * 60 + sec + frac) * 1000);
      if (t < 3000 && isCreditLine(body)) continue;
      out.push({ t, text: body });
    }
  }
  out.sort((a, b) => a.t - b.t);
  return out.slice(0, MAX_LINES);
}

export const Lyrics = {
  track: null,
  lines: [],
  index: -1,
  status: 'idle',       // idle | loading | ready | empty | error | local
  offset: OFFSET_MS,
  _running: false,
  _startedAt: 0,
  _frozen: 0,
  _timer: null,
  _msg: '',

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
    const same = this.track?.neteaseId === track.neteaseId;
    this.track = track;
    if (same && (this.status === 'ready' || this.status === 'empty')) return this;

    this.status = 'loading';
    this.lines = [];
    this.index = -1;
    this._msg = '';
    bus.emit('lyrics:ready', { track, lines: [], status: 'loading' });

    try {
      const res = await fetch(`/api/netease/lyric?id=${encodeURIComponent(track.neteaseId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const lines = parseLrc(json.lrc);
      // 当前曲目可能在请求期间被切走了
      if (this.track?.neteaseId !== track.neteaseId) return this;
      this.lines = lines;
      this.status = lines.length ? 'ready' : 'empty';
      this._msg = json.nolyric ? '纯音乐 · 没有歌词' : '这首歌没有可显示的歌词';
      bus.emit('lyrics:ready', { track, lines, status: this.status, nolyric: !!json.nolyric });
      this._tick(true);
    } catch (err) {
      this.status = 'error';
      this._msg = '歌词获取失败';
      bus.emit('lyrics:ready', { track, lines: [], status: 'error', error: String(err.message || err) });
    }
    return this;
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

  /** 估算的播放位置（毫秒） */
  elapsed() {
    const raw = this._running ? Date.now() - this._startedAt : this._frozen;
    return Math.max(0, raw - this.offset);
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
