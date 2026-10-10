/**
 * core/player.js — 播放引擎
 * ------------------------------------------------------------------
 * 一个播放列表里可以混装两种来源的曲目，对界面暴露统一的控制接口：
 *
 *   provider: 'local'   自托管音频文件（assets/audio/*.mp3）
 *                       → 驱动 <audio>，支持进度拖动、音量、真频谱
 *   provider: 'netease' 网易云曲目
 *                       → 使用官方外链播放器（iframe），进度/音量为网易云自持；
 *                         本站只负责选中、切换与（按时长估算的）自动下一首
 *
 * 界面只需要调用 play/pause/toggle/next/prev/seek/setVolume 并订阅 bus 事件
 * （player:track / player:state），不必关心底层是哪种来源。
 *
 * 新增来源：写一个 { id, label, canHandle(track), activate(track, ctx) } 注册到
 * Player.registerProvider()，其余逻辑自动复用。
 */

import { PLAYLIST, PLAYER } from '../config/site.config.js';
import { bus } from './bus.js';
import { Settings } from './store.js';

/**
 * 切歌的**提前量**（秒）。
 *
 * 为什么必须提前：官方外链播放器**把单曲嵌入当成长度 1 的列表循环播放** ——
 * 它自己的 JS 里 `Id8C(index)` 有一句 `if (index > list.length - 1) index = 0`，
 * 播完（ended）推进索引就回绕到第 0 首，也就是同一首重头再放。
 * 所以站内如果等到"估计播完了"才切，用户就会先听到上一首的开头重播几秒。
 * 提前 0.8 秒切走，代价是可能吃掉收尾的一点点淡出（几乎听不出来），
 * 换回来的是"下一首立刻接上，不会先放错歌"。
 */
const EMBED_BELL_S = 0.8;
/**
 * iframe 载入到音频真正出声之间的估计补偿（毫秒）。
 *
 * 注意方向：以前这里给 1500ms，等于假设"载入完还要 1.5 秒才开始出声"，
 * 于是估算时钟**偏晚** —— 正好落进上面那个循环里，变成"上一首重播几秒"。
 * 现在按实测的暖缓存路径取 350ms，宁可偏早（早切 = 少听半秒尾巴），不要偏晚。
 */
const EMBED_BUFFER_MS = 350;

/**
 * 「秒表」用一段静音 WAV 来做 —— 为什么不是 setInterval：
 *
 * 标签页被放到后台后，普通计时器会被节流；Chrome 在隐藏约 5 分钟后进入
 * **intensive throttling**，定时器最多每分钟才跑一次。于是"该切歌了"这一刻
 * 会被推迟几十秒甚至到用户切回前台才执行 —— 表现就是
 * 「后台放着放着就断了，回到网站才发现已经（或才）切到下一首」。
 *
 * 媒体元素的事件不走这套节流：它由媒体管线驱动，和音频本身同一条时钟。
 * 所以这里生成一段**静音**、长度等于曲目的 WAV，用隐藏的 <audio muted> 播放它，
 * 拿它的 timeupdate / ended 当秒表 —— 暂停、卡顿、后台，它都和真正的音频一起走。
 * 静音是必须的：它的唯一职责是计时，绝不能发出一点声音。
 *
 * 8kHz / 8bit / 单声道 = 8KB 每秒，20 分钟也只要 9.6MB，且只生成一次后复用。
 */
const CLOCK_RATE = 8000;
const CLOCK_MAX_S = 1200;

/** iOS / iPadOS（含"伪装成 Mac"的 iPad）：Web Audio 上下文进后台会被系统挂起 */
const IS_IOS = (() => {
  const ua = navigator.userAgent || '';
  if (/iP(hone|ad|od)/.test(ua)) return true;
  return /Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1;
})();

/** 生成静音 WAV（8bit PCM 的静音值是 128） */
function silentWav(seconds) {
  const frames = Math.max(1, Math.round(seconds * CLOCK_RATE));
  const buf = new ArrayBuffer(44 + frames);
  const v = new DataView(buf);
  const str = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + frames, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, CLOCK_RATE, true); v.setUint32(28, CLOCK_RATE, true);
  v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  str(36, 'data'); v.setUint32(40, frames, true);
  new Uint8Array(buf, 44).fill(128);
  return new Blob([buf], { type: 'audio/wav' });
}

/* ---------------- 内置来源：本地音频 ---------------- */

const localProvider = {
  id: 'local',
  label: '本地音频',
  embed: false,
  canHandle: (t) => !!t?.src,
  /** 进入该来源：设置 src 并等待后续 play()（建立频谱图要等播放稳定后再做） */
  prepare(track, ctx) {
    const audio = ctx.audio;
    if (audio.getAttribute('src') !== track.src) {
      audio.src = track.src;
      try { audio.load(); } catch { /* 空 src 在个别浏览器会抛错 */ }
    }
    return false; // 不接管播放
  },
  deactivate(ctx) {
    try { ctx.audio.pause(); } catch { /* noop */ }
  },
};

/* ---------------- 引擎 ---------------- */

export const Player = {
  audio: null,
  tracks: [],
  index: 0,
  playing: false,
  ready: false,
  ctx: null,
  analyser: null,
  source: null,
  freq: null,
  /** 当前曲目的来源 id */
  providerId: 'local',
  _failCount: 0,
  _shuffleOrder: null,
  _graphTimer: null,
  _advanceTimer: null,
  _providers: new Map(),
  /** 用户意图：本来就在放。浏览器的暂停事件不该改写它（后台自愈 / 回退链都看它） */
  _intent: false,
  /** 已经预取过的音频地址（避免每秒重复 load 下一首） */
  _primedUrl: '',
  /** 预取用的隐藏 <audio>：只把下一首拉进缓存，绝不出声 */
  _preload: null,
  /** 「刚刚放完」的防抖标记：`ended` 与兜底检查可能同时到达 */
  _ending: false,
  /** 运行时覆盖 `PLAYER.directAudio`：null = 用配置值 */
  _directAudioPref: null,
  /** 「点了播放但音频其实没加载出来」的看门狗定时器（见 _armStallWatch） */
  _stallTimer: null,

  init() {
    this.audio = document.getElementById('audio');
    this.tracks = (PLAYLIST || []).map((t, i) => this.normalize({ ...t, id: t.id || `tr-${i + 1}` }));
    this.index = 0;
    const vol = Number(Settings.get('volume') ?? PLAYER.volume);
    this.audio.volume = Math.min(1, Math.max(0, vol));
    this.audio.muted = false;
    this.audio.preload = 'metadata';

    // 进度上报：顺带做「位置已经到尾巴、但 ended 没来」的兜底
    // （后台标签页里个别浏览器会把 ended 吞掉，媒体被挂起后位置也可能直接跳到末尾）
    this.audio.addEventListener('timeupdate', () => {
      this._emitState();
      this._guardEnd();
      this._updatePositionState();
    });
    this.audio.addEventListener('durationchange', () => this._emitState());
    this.audio.addEventListener('progress', () => this._emitState());
    // 拖动进度时 timeupdate 可能被节流，用 rAF 补上平滑更新
    this.audio.addEventListener('seeking', () => this._emitState());
    this.audio.addEventListener('seeked', () => this._emitState());
    // <audio> 只在自己是"真正发声的那个"时才有资格改写播放状态。
    // 外部来源（官方外链播放器）接管期间，换源本来就会 pause() 这个元素来止血，
    // 那条 pause 事件是**异步**到达的 —— 不挡住它就会把刚设好的 playing 覆盖回 false，
    // 表现是"官方播放器明明在响，界面却显示暂停"（播放键点一下变成开始播，而不是暂停）。
    this.audio.addEventListener('play', () => {
      if (this.isEmbed) return;
      this.playing = true; this._emitState(); this._pump();
    });
    this.audio.addEventListener('pause', () => {
      if (this.isEmbed) return;
      this.playing = false; this._emitState();
    });
    this.audio.addEventListener('waiting', () => bus.emit('player:state', { buffering: true }));
    this.audio.addEventListener('playing', () => { this._clearStallWatch(); bus.emit('player:state', { buffering: false }); });
    this.audio.addEventListener('loadedmetadata', () => this._clearStallWatch());
    // 一首放完 → 自动接下一首。`ended` 由媒体管线驱动，是后台 / 息屏下最可靠的信号，
    // 所以它必须是把切歌接力下去的**主路径**（不再是按时长估算的定时器）。
    this.audio.addEventListener('ended', () => this._advanceFromEnd());
    this.audio.addEventListener('error', () => this._onError());
    this.audio.addEventListener('volumechange', () => {
      Settings.set('volume', this.audio.volume);
      this._emitState();
    });

    this.registerProvider(localProvider);
    this._bindEmbedClock();
    this._bindLifecycle();
    this._bindMediaSession();
    this.ready = true;
    this.prepare(0);
    // prepare() 中的广播发生在订阅者注册之前，这里补发一次
    bus.emit('player:track', { track: this.current, index: this.index });
    this._emitState();
    return this;
  },

  /** 注册一个来源 */
  registerProvider(p) {
    if (!p?.id) throw new Error('provider 必须有 id');
    this._providers.set(p.id, p);
    return p.id;
  },
  getProvider(id = this.providerId) { return this._providers.get(id) || localProvider; },
  get providers() { return [...this._providers.values()]; },

  /** 规范化曲目对象（补上 provider 与统一字段） */
  normalize(t) {
    const provider = t.provider || (t.neteaseId ? 'netease' : 'local');
    return {
      id: t.id || (provider === 'netease' ? `ne-${t.neteaseId}` : `tr-${Math.random().toString(36).slice(2, 8)}`),
      provider,
      title: t.title || t.name || '未命名',
      artist: t.artist || (Array.isArray(t.artists) ? t.artists.join(' / ') : '') || '',
      src: t.src || '',
      cover: t.cover || '',
      duration: Number(t.duration) || 0,
      tags: Array.isArray(t.tags) ? t.tags : [],
      neteaseId: t.neteaseId ? String(t.neteaseId) : '',
      album: t.album || '',
      fee: t.fee ?? 0,
      /** 服务端从音频本身量出来的真实秒数（嵌入来源的估算时钟用得到） */
      audioSeconds: Number(t.audioSeconds) || 0,
      /** 这首歌只能走官方外链播放器（会员 / 版权 / 直放已经失败过），别再白试一次 */
      embedOnly: !!t.embedOnly,
    };
  },

  /* ---------- 派生状态 ---------- */

  get current() { return this.tracks[this.index] || null; },
  /** 是否存在任何「可播放」的曲目（含网易云嵌入） */
  get hasAudio() { return this.tracks.length > 0; },
  get provider() { return this.getProvider(this.providerId); },
  /** 当前来源是否为「外部嵌入播放器」（本站拿不到进度/音量） */
  get isEmbed() { return !!this.provider?.embed; },
  get duration() {
    if (this.isEmbed) return Number(this.current?.duration) || 0;
    return Number.isFinite(this.audio?.duration) ? this.audio.duration : 0;
  },
  get currentTime() { return this.isEmbed ? 0 : (this.audio?.currentTime || 0); },
  get shuffle() { return !!Settings.get('shuffle'); },

  /** 可视化模式：'analyser' 真频谱 / 'synthetic' 合成动画 / 'off' */
  get visualizerMode() {
    if (this.isEmbed) return this.playing ? 'synthetic' : 'off';
    if (this.analyser && this.ctx?.state === 'running') return 'analyser';
    return this.playing || this.currentTime > 0 ? 'synthetic' : 'off';
  },

  /* ---------- 曲目装载 ---------- */

  /**
   * 决定这一首用哪个来源播放。
   *
   * 网易云曲目**优先走「站内直放」**（同源 <audio>）：只有这样才有真实的
   * duration / currentTime / ended —— 一首能完整放完，后台标签页、最小化、
   * 移动端息屏时切歌也由媒体管线驱动，不依赖会被节流的定时器，更不会因为
   * 估算跑偏而掐掉结尾或干等。只有直放不可用（会员 / 版权受限 / 纯静态部署
   * 没有 /api / 用户关掉了 directAudio / 这首已经失败过）才退回官方外链播放器。
   *
   * ⚠️ 曲目里存的 `provider` 字段保持 'netease' 不变（播放列表持久化、
   *    界面上的「网易云」标记都依赖它），这里解析出来的是**运行时**来源。
   */
  resolveProviderId(track) {
    if (!track) return 'local';
    const hasDirect = this._providers.has('netease-audio');

    if (track.neteaseId) {
      if (hasDirect && this.preferDirectAudio && !track.embedOnly) return 'netease-audio';
      if (this._providers.has('netease')) return 'netease';
    }
    if (track.src && this._providers.has('local')) return 'local';
    return this._providers.has(track.provider) ? track.provider : 'local';
  },

  /**
   * 是否优先站内直放。
   * 默认跟随 site.config.js 的 `PLAYER.directAudio`；`setDirectAudio()` 可以在运行时
   * 覆盖它（自检用它来验证"官方播放器回退路径"仍然完好 —— 那条路径必须一直可用，
   * 因为会员 / 版权受限 / 纯静态部署都要靠它）。
   */
  get preferDirectAudio() {
    return this._directAudioPref === null ? PLAYER.directAudio !== false : !!this._directAudioPref;
  },

  /**
   * 运行时切换「优先站内直放」。
   * 传 null 恢复成配置值。切换后按新开关重新装载当前曲目，避免"界面已经换了路，
   * 声音还挂在旧路上"。
   */
  setDirectAudio(on) {
    this._directAudioPref = on === null || on === undefined ? null : !!on;
    if (this.tracks.length) this.prepare(this.index, { autoplay: this.playing || this._intent });
    bus.emit('player:state', { directAudio: this.preferDirectAudio });
    return this.preferDirectAudio;
  },

  /**
   * 只装载不播放。
   * 来源通过自己的 prepare(track, ctx) 接管：返回 true 表示「播放由外部接管」
   * （例如网易云外链播放器），引擎便不会去驱动 <audio>。
   */
  prepare(index = this.index, { autoplay = false } = {}) {
    if (!this.tracks.length) {
      this._clearAdvance();
      this.playing = false;
      this.providerId = 'local';
      bus.emit('player:embed', { track: null, index: -1, autoplay: false });
      this._emitState();
      return;
    }
    this.index = ((index % this.tracks.length) + this.tracks.length) % this.tracks.length;
    const track = this.current;
    const prevProvider = this.providerId;
    this.providerId = this.resolveProviderId(track);
    this._failCount = 0;
    this._clearStallWatch();             // 换歌 = 旧的看门狗作废
    this._clearAdvance();
    this._primedUrl = '';                // 换歌 = 该为新的"下一首"重新预取
    this._advanceSuspended = false;      // 换歌 = 位置重新可知，恢复估算

    // 换源时先停掉上一个来源
    if (prevProvider !== this.providerId) this.getProvider(prevProvider).deactivate?.(this);

    // 交给来源自己准备；返回 true = 播放由外部接管
    const external = this.provider.prepare?.(track, this) === true;

    if (external) {
      // 嵌入来源：autoplay 由来源生效（网易云是按 auto=1 建播放器），
      // 因此这里必须同步 playing 状态，否则 UI 会与实际情况错位 ——
      // 表现为「第一次点播放按钮反而执行了暂停」。
      this.playing = !!autoplay;
      if (autoplay) this.provider.play?.(track, this);
      bus.emit('player:embed', { track, index: this.index, autoplay });
      bus.emit('player:track', { track, index: this.index });
      this._emitState();
      return;
    }

    // 切回本地音频：通知界面卸载嵌入播放器
    this.playing = false;
    bus.emit('player:embed', { track: null, index: -1, autoplay: false });
    bus.emit('player:track', { track, index: this.index });
    if (autoplay) this.play();
    this._emitState();
  },

  /** 兼容旧接口：load(index, { play }) */
  async load(index = this.index, { play = false } = {}) {
    this.prepare(index, { autoplay: play });
  },

  /* ---------- 播放控制 ---------- */

  async play() {
    const track = this.current;
    if (!track) return false;
    this._intent = true;      // 用户意图：要放着听（浏览器擅自暂停时用来自愈）
    this._ending = false;     // 新的播放开始，「刚放完」的防抖标记复位

    if (this.isEmbed) {
      // 嵌入播放器由来源接管，这里只同步本站 UI 状态
      this.playing = true;
      this.provider.play?.(track, this);
      this._scheduleAdvance(track);
      this._emitState();
      return true;
    }

    // 「有没有音频」不能只看 track.src：站内直放的网易云曲目地址是**来源算出来的**
    // （/api/netease/audio?id=…），track.src 是空的 —— 这里曾经因此直接判定"没配置音频"，
    // 于是直放永远起不来。
    const src = this._audioUrlFor(track);
    if (!src) {
      bus.emit('player:noaudio', { track });
      return false;
    }
    try {
      const p = this.audio.play();
      p?.catch?.(() => {});
      const result = await Promise.race([
        Promise.resolve(p).then(() => true).catch(() => false),
        new Promise((r) => setTimeout(() => r('timeout'), 2500)),
      ]);
      if (result === false) {
        // 被浏览器的自动播放策略拒了。移动端最容易在"后台自动接下一首"时遇到
        // （iOS 上系统只保证**有用户手势**的那一次能起播）。
        // 关键：不要把这首丢掉 —— 记下意图，等用户下一次触屏立刻把它接上。
        this._armGestureRetry();
        // 来源自己能处理失败时（网易云直放会回退到官方播放器）不要叠一条通用提示：
        // 同一件事出现"无法播放"+"已切回官方播放器"两条互相矛盾的话，比没有提示更糟
        if (typeof this.provider?.onError !== 'function') {
          bus.emit('toast', { message: '无法播放：请确认音频路径可访问，或先与页面交互一次', kind: 'err' });
        }
        return false;
      }
      this._failCount = 0;
      this._scheduleGraph();
      // 起播成功了，但"成功"只代表浏览器接受了 play() —— 源可能随后才 404/加载不出来。
      // 挂个看门狗，杜绝"界面显示在放、既没声音也没提示"的死状态。
      this._armStallWatch(track);
      return true;
    } catch (err) {
      console.warn('[player] 播放被拒绝或失败', err);
      bus.emit('toast', { message: '无法播放：请确认音频路径可访问，或先与页面交互一次', kind: 'err' });
      return false;
    }
  },

  /**
   * 播放看门狗：点下播放后，若 <audio> 明确"加载不出来"
   * （`networkState === 3` 没有可用源，或已经带 `error`）却始终 `readyState === 0`，
   * 而且**错误事件没有把失败处理走完**，就补一次失败处理。
   *
   * 为什么必须有：换 src 造成的 abort（error.code === 1）有时会把紧随其后的 404
   * 盖掉，_onError 于是整条被跳过 —— 界面显示"正在播放"，实际既没声音也没有任何提示。
   * 网易云曲目遇到这种状态本该回退官方播放器（并提示用户点 ▶），跳过就等于"手机上这首不响
   * 也不告诉我为什么"。
   *
   * 只认"明确没源/有错误"，所以正常缓冲（networkState === 2）不会被误判。
   */
  _armStallWatch(track) {
    this._clearStallWatch();
    const startedAt = Date.now();
    let lastTime = -1;          // 上一次采样到的播放进度
    let lastProgressAt = Date.now();
    const tick = () => {
      this._stallTimer = null;
      const a = this.audio;
      if (!a) return;
      if (this.isEmbed || !this._intent || this.current !== track) return;  // 已换路 / 换歌 / 用户暂停

      // 进度在走就说明真的出声了，撤防
      if (a.currentTime > lastTime + 0.05) {
        lastTime = a.currentTime;
        lastProgressAt = Date.now();
      }
      // ⚠️ 不能只看 readyState：实测踩到过"拿到元数据（readyState 1）却一直不出声"的流
      //（官方外链在弱网/被限速时就长这样：networkState 仍是 2 在加载、也没有 error）。
      // 原来这里 `readyState > 0` 就直接放行，于是界面一直显示"正在播放"、既没声音也没说明 ——
      // 正是自检里那条「不许静默无声」要抓的情况。所以改成**按进度判**：
      // 只要"声称在播"却连续 8 秒 currentTime 不动、且还没到能连续播放的状态，就认为这路死了。
      const stalled = a.currentTime <= 0.05 || (Date.now() - lastProgressAt > 8000);
      // 四种"确实不行"：
      //   ① 已经带 error；② 明确没有可用源；
      //   ③ 声称在播却**十秒**连元数据都没拿到（readyState 0）；
      //   ④ 拿到数据却**八秒**没有进度（卡在缓冲，不出声也不报错）
      const dead = !!a.error
        || a.networkState === 3
        || (a.readyState === 0 && Date.now() - startedAt > 10000)
        || (stalled && Date.now() - startedAt > 8000 && a.readyState < 3);
      if (!dead) { this._stallTimer = setTimeout(tick, 2000); return; }
      this._onError({ force: true });                                        // 状态已确认，绕开 abort 去抖
    };
    this._stallTimer = setTimeout(tick, 2500);
  },

  _clearStallWatch() {
    if (this._stallTimer) {
      clearTimeout(this._stallTimer);
      this._stallTimer = null;
    }
  },

  /**
   * 自动播放被拒之后的补救。
   *
   * 场景：后台自动接下一首时，个别移动端浏览器（典型是 iOS Safari）只允许
   * "由用户手势触发"的那一次播放，于是下一首被静默拒掉 —— 用户切回前台看到的是
   * "停在上一首的结尾、按播放也没用"。这里挂一次性监听：用户下一次**任何**触屏 /
   * 按键就立刻把当前这首放出来，不会白丢一首。
   */
  _armGestureRetry() {
    if (this._gestureRetry) return;
    this._gestureRetry = true;
    const once = () => {
      this._gestureRetry = false;
      window.removeEventListener('pointerdown', once, true);
      window.removeEventListener('touchend', once, true);
      window.removeEventListener('keydown', once, true);
      if (!this._intent) return;
      const p = this.audio?.play();
      p?.catch?.(() => { /* 还是不行就再等下一次手势 */ this._gestureRetry = false; });
    };
    window.addEventListener('pointerdown', once, true);
    window.addEventListener('touchend', once, true);
    window.addEventListener('keydown', once, true);
  },

  pause() {
    this._intent = false;
    if (this.isEmbed) {
      // 交给来源真正停止发声（网易云是重建 auto=0 的播放器）
      this.provider.pause?.(this.current, this);
      this.playing = false;
      this._clearAdvance();
      this._emitState();
      return;
    }
    this.audio?.pause();
  },

  toggle() {
    const next = !this.playing;
    this.playing = next;
    this._emitState();          // 立即反馈，不等 iframe 加载 / 音频缓冲
    return next ? this.play() : this.pause();
  },

  next({ auto = false } = {}) {
    if (!this.tracks.length) return false;
    const want = this.playing || this._intent || auto;
    if (this.shuffle && this._shuffleOrder) {
      const pos = this._shuffleOrder.indexOf(this.index);
      const nxt = this._shuffleOrder[(pos + 1) % this._shuffleOrder.length];
      this.prepare(nxt, { autoplay: want });
      return true;
    }
    const nxt = (this.index + 1) % this.tracks.length;
    // 走到列表末尾时，只有「本地音频/站内直放且允许自动下一首」才从头再来；
    // 网易云外链曲目用的是另一个开关（embedAutoNext），别把两者混在一起
    const allowWrap = this.isEmbed ? this.embedAutoNext : !!PLAYER.autoplayNext;
    if (auto && nxt === 0 && !allowWrap) {
      // 列表放完了：停在这首的结尾。状态必须跟着落地，否则界面会一直显示"播放中"，
      // 而实际上声音早就没了 —— 后台放完一整张列表后回到前台看到的就是这个假状态。
      this.playing = false;
      this._intent = false;
      this._clearAdvance();
      this._updateMediaSession();
      this._emitState();
      return false;
    }
    this.prepare(nxt, { autoplay: want });
    return true;
  },

  prev() {
    if (!this.tracks.length) return;
    if (this.currentTime > 3) { this.seek(0); return; }
    this.prepare((this.index - 1 + this.tracks.length) % this.tracks.length, { autoplay: this.playing || this._intent });
  },

  seek(seconds) {
    if (this.isEmbed || !this.audio || !this.duration) return;
    this.audio.currentTime = Math.min(this.duration, Math.max(0, seconds));
    // 上报实际落点：浏览器可能夹取或异步应用该值，用请求值会显示错位
    // （例如请求 6 秒但实际只跳到 0.5 秒时，进度条与时间会不一致）
    this._emitState({ time: this.audio.currentTime || 0 });
  },

  seekRatio(r) {
    if (this.isEmbed) return;
    this.seek(this.duration * Math.min(1, Math.max(0, r)));
  },

  setVolume(v) {
    if (!this.audio) return;
    this.audio.volume = Math.min(1, Math.max(0, v));
    if (this.audio.volume > 0) this.audio.muted = false;
  },

  get volume() { return this.audio?.volume ?? 1; },
  get muted() { return !!this.audio?.muted; },

  toggleMute() {
    if (!this.audio) return;
    // 网易云曲目的声音在 iframe 内，静音本地音频不影响它 —— 明确提示用户
    if (this.isEmbed) {
      bus.emit('toast', { message: '网易云曲目的音量请在播放器内调整' });
      return;
    }
    this.audio.muted = !this.audio.muted;
    bus.emit('toast', { message: this.audio.muted ? '静音' : '取消静音' });
  },

  setShuffle(on) {
    Settings.set('shuffle', on);
    this._shuffleOrder = on ? this._makeShuffle() : null;
    bus.emit('player:state', { shuffle: on });
  },

  _makeShuffle() {
    const arr = this.tracks.map((_, i) => i);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },

  /* ---------- 播放列表编辑 ---------- */

  setTracks(list, { autoplay = false, keepIndex = false } = {}) {
    const cur = this.current?.id;
    this.tracks = (list || []).map((t) => this.normalize(t));
    if (!this.tracks.length) {
      this.index = 0;
      this.providerId = 'local';
      this.playing = false;
      this._clearAdvance();
      bus.emit('player:embed', { track: null, index: -1, autoplay: false });
      bus.emit('playlist:change', { tracks: [], index: -1 });
      this._emitState();
      return;
    }
    const idx = keepIndex && cur ? Math.max(0, this.tracks.findIndex((t) => t.id === cur)) : 0;
    this.index = Math.min(idx, this.tracks.length - 1);
    if (this.shuffle) this._shuffleOrder = this._makeShuffle();
    bus.emit('playlist:change', { tracks: this.tracks, index: this.index });
    this.prepare(this.index, { autoplay });
  },

  add(track, { play = false } = {}) {
    const t = this.normalize(track);
    const dup = this.tracks.findIndex((x) => x.id === t.id);
    if (dup >= 0) {
      if (play) this.prepare(dup, { autoplay: true });
      return { added: false, index: dup };
    }
    this.tracks.push(t);
    if (this.shuffle) this._shuffleOrder = this._makeShuffle();
    bus.emit('playlist:change', { tracks: this.tracks, index: this.index });
    const idx = this.tracks.length - 1;
    if (play || this.tracks.length === 1) this.prepare(idx, { autoplay: play });
    return { added: true, index: idx };
  },

  remove(index) {
    if (index < 0 || index >= this.tracks.length) return false;
    const wasCurrent = index === this.index;
    this.tracks.splice(index, 1);
    if (!this.tracks.length) {
      this.setTracks([]);
      return true;
    }
    if (index < this.index) this.index--;
    else if (wasCurrent) this.index = Math.min(this.index, this.tracks.length - 1);
    if (this.shuffle) this._shuffleOrder = this._makeShuffle();
    bus.emit('playlist:change', { tracks: this.tracks, index: this.index });
    if (wasCurrent) this.prepare(this.index, { autoplay: this.playing });
    return true;
  },

  clear() { this.setTracks([]); },

  /* ---------- 一首放完 → 接下一首（不需要估算） ---------- */

  /**
   * 一首播完了。
   *
   * 只有本地音频与站内直放会走到这里 —— 它们有真实的 `ended`。
   * 网易云外链播放器（iframe）拿不到结束回调，走的是下面那套估算时钟。
   */
  _advanceFromEnd() {
    if (this.isEmbed) return;
    if (this._ending) return;              // ended 与兜底检查可能同时到达
    this._ending = true;
    this._intent = true;                   // 接力放下一首，用户意图不变
    if (!this.next({ auto: true })) this._ending = false;
  },

  /**
   * 第二道保险：位置已经到尾巴，但 `ended` 没来。
   *
   * 什么时候会发生：后台标签页里媒体被挂起、或浏览器把结束事件吞掉。
   * 用 timeupdate（媒体事件，与音频同一条时钟）检查位置，比定时器可靠得多。
   */
  _guardEnd() {
    if (this.isEmbed) return;
    const a = this.audio;
    if (!a || !Number.isFinite(a.duration) || a.duration <= 0) return;
    if (!this.playing) return;

    // 快到尾巴了：把下一首预取进缓存（见 _primeNext）
    const lead = Number(PLAYER.preloadLead) || 0;
    if (lead > 0 && a.duration - a.currentTime <= lead) this._primeNext();

    // 位置已经到底，但 ended 还没到（或已经被吞掉）
    if (a.ended || a.currentTime >= a.duration - 0.12) this._advanceFromEnd();
  },

  /**
   * 预取下一首 —— 「丝滑切歌」靠的就是这一步。
   *
   * 等 `ended` 之后才开始加载下一首，中间必然空一拍（经过本站转发的流尤其明显）。
   * 提前把下一首拉进浏览器缓存，切歌时是**立刻出声**，听感上就是连着放的。
   * 用隐藏的 <audio muted> 只拉流：不出声，也不进入播放状态。
   */
  _primeNext() {
    if (this.isEmbed) return;
    const next = this._peekNext();
    if (!next) return;
    const url = this._audioUrlFor(next);
    if (!url || url === this._primedUrl) return;
    this._primedUrl = url;
    try {
      if (!this._preload) {
        const el = document.createElement('audio');
        el.muted = true;
        el.preload = 'auto';
        el.setAttribute('aria-hidden', 'true');
        el.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
        document.body.append(el);
        this._preload = el;
      }
      if (this._preload.getAttribute('src') !== url) {
        this._preload.src = url;
        this._preload.load();
      }
    } catch { /* 预取失败不影响正常播放，只是切歌时多等一会儿 */ }
  },

  /** 下一首会是谁（跟随随机播放顺序，并遵守列表末尾的回绕规则） */
  _peekNext() {
    const n = this.tracks.length;
    if (n < 2) return null;
    let idx;
    if (this.shuffle && this._shuffleOrder) {
      const pos = this._shuffleOrder.indexOf(this.index);
      idx = this._shuffleOrder[(pos + 1) % this._shuffleOrder.length];
    } else {
      const nxt = (this.index + 1) % n;
      const allowWrap = this.isEmbed ? this.embedAutoNext : !!PLAYER.autoplayNext;
      if (nxt === 0 && !allowWrap) return null;
      idx = nxt;
    }
    const t = this.tracks[idx];
    return this._audioUrlFor(t) ? t : null;    // 嵌入来源的曲目预取不了
  },

  /** 某首曲目真正的音频地址（问来源要；嵌入来源返回空串） */
  _audioUrlFor(track) {
    if (!track) return '';
    const p = this.getProvider(this.resolveProviderId(track));
    return p?.audioUrl?.(track) || '';
  },

  /** 同一件事的公开版：界面想知道"这首到底有没有能播的音频"时用它 */
  audioUrl(track) { return this._audioUrlFor(track); },

  /* ---------- 后台 / 前后台切换的生命周期兜底 ---------- */

  /**
   * 浏览器在后台会节流定时器、甚至冻结整个页面；移动端息屏还可能把媒体暂停。
   * 这里把「回到前台时状态一定是对的」这件事兜住：
   *   1. 对表：位置已经到了尾巴就直接接下一首（媒体事件可能被吞掉）；
   *   2. 自愈：浏览器擅自暂停了音频（省电策略 / 音频会话被别的应用抢占）而用户本来
   *      就在听，就接着放 —— 注意只看 `_intent`，用户自己按的暂停不会被覆盖；
   *   3. 报进度：把播放位置同步给系统媒体面板（锁屏 / 通知栏）。
   */
  _bindLifecycle() {
    if (this._lifecycleBound) return this;
    this._lifecycleBound = true;
    const check = () => {
      if (this.isEmbed) { this._checkAdvanceNow(); return; }
      const a = this.audio;
      if (!a) return;
      if (this._intent && a.paused && !a.ended && a.currentTime > 0 && a.src) {
        const p = a.play();
        p?.catch?.(() => { /* 没有用户手势时可能被拒，那就等用户自己点 */ });
      }
      this._guardEnd();
      this._pump();
      this._updatePositionState();
    };
    document.addEventListener('visibilitychange', check);
    document.addEventListener('resume', check);      // Page Lifecycle：从冻结中恢复
    document.addEventListener('freeze', check);      // 冻结前最后对一次表
    window.addEventListener('pageshow', check);
    window.addEventListener('focus', check);
    return this;
  },

  /* ---------- 系统媒体面板（锁屏 / 通知栏 / 耳机按键） ---------- */

  /**
   * 移动端后台播放的关键之一：注册 Media Session 之后
   *   · 声音进后台不会因为"页面没有可见的播放器"被浏览器降级处理；
   *   · 锁屏 / 通知栏 / 耳机线控可以直接播放、暂停、上一首、下一首；
   *   · 用户在锁屏上点「下一首」就是站内切歌，和自动接力走同一条路径。
   */
  _bindMediaSession() {
    if (!('mediaSession' in navigator)) return this;
    const ms = navigator.mediaSession;
    const set = (action, fn) => { try { ms.setActionHandler(action, fn); } catch { /* 不支持的 action 会抛错 */ } };
    set('play', () => this.play());
    set('pause', () => this.pause());
    set('previoustrack', () => this.prev());
    set('nexttrack', () => this.next());
    set('stop', () => this.pause());
    set('seekbackward', (d) => this.seek(this.currentTime - (Number(d?.seekOffset) || 10)));
    set('seekforward', (d) => this.seek(this.currentTime + (Number(d?.seekOffset) || 10)));
    set('seekto', (d) => { if (Number.isFinite(d?.seekTime)) this.seek(d.seekTime); });
    return this;
  },

  /** 把当前曲目与播放状态写进系统媒体面板（只在变化时写，避免每个 timeupdate 重建对象） */
  _updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const t = this.current;
    const key = `${this.index}|${this.playing ? 1 : 0}|${this.providerId}|${t?.id || ''}`;
    if (key === this._msKey) return;
    this._msKey = key;

    try { ms.playbackState = this.playing ? 'playing' : 'paused'; } catch { /* 个别实现只读 */ }
    if (!t) { try { ms.metadata = null; } catch { /* noop */ } return; }
    if (typeof MediaMetadata !== 'function') return;
    try {
      ms.metadata = new MediaMetadata({
        title: t.title || '未命名',
        artist: t.artist || '未知歌手',
        album: t.album || '',
        artwork: t.cover ? [{ src: t.cover, sizes: '512x512', type: 'image/jpeg' }] : [],
      });
    } catch { /* 元数据写不进去不影响播放 */ }
  },

  /**
   * 告诉系统"播到哪儿了"：锁屏进度条、耳机快进快退都依赖它。
   * 节流到 5 秒一次（timeupdate 每秒约 4 次，没必要每次都写）。
   */
  _updatePositionState() {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    if (this.isEmbed || !this.playing) return;
    const now = Date.now();
    if (now - (this._posStateAt || 0) < 5000) return;
    const d = this.duration;
    if (!Number.isFinite(d) || d <= 0) return;
    this._posStateAt = now;
    try {
      navigator.mediaSession.setPositionState({
        duration: d,
        position: Math.min(d, Math.max(0, this.currentTime)),
        playbackRate: this.audio?.playbackRate || 1,
      });
    } catch { /* 参数越界会抛错，忽略 */ }
  },

  /* ---------- 网易云嵌入的自动下一首 ---------- */

  /**
   * 暂停 / 停止后重新开始计时（因为每次播放都从 0:00 开始）。
   * 绑定在 player:embed 上：宿主重建播放器时即视为重新开始。
   */
  _bindEmbedClock() {
    if (this._embedClockBound) return;
    this._embedClockBound = true;
    bus.on('player:embed', ({ autoplay }) => {
      this._playStartedAt = autoplay ? Date.now() : 0;
      this._emitState();
    });
    // iframe 载入完成 ≈ 音频即将开始：把锚点挪过去，别把加载那几秒算成已播
    // （这是「歌还没放完就被自动切走」的主要来源）
    bus.on('embed:loaded', () => this._reanchorEmbed());
    // 用户动过官方控制条（拖动进度 / 在里面暂停）：位置无从推断，这一首不再自动切
    bus.on('embed:touched', ({ reason } = {}) => this.suspendAdvance(reason || 'touched'));
    // 回到前台 / 从冻结中恢复：立刻对一次表（秒表若被挂起，这是最好的补救时机）
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this._checkAdvanceNow();
    });
    document.addEventListener('resume', () => this._checkAdvanceNow());
  },

  /** 已播放秒数（仅用于自动下一首；官方 iframe 拿不到真实 currentTime） */
  get elapsed() {
    if (!this.isEmbed) return this.currentTime;
    if (this._playStartedAt) return Math.max(0, (Date.now() - this._playStartedAt) / 1000);
    return this.playing ? 0 : (this._lastElapsed || 0);
  },

  /* ---------- 自动下一首（估算） ---------- */

  /** 网易云曲目的「自动下一首」开关：默认关（见 site.config.js 的说明），可由用户显式打开 */
  get embedAutoNext() {
    const v = Settings.get('autoplayNextEmbed');
    return v === undefined ? !!PLAYER.embedAutoplayNext : !!v;
  },

  setEmbedAutoNext(on) {
    Settings.set('autoplayNextEmbed', !!on);
    // 两个方向都要重新布防：开 → 提前切歌；关 → 到点停住（否则官方播放器会单曲循环下去）
    if (this.isEmbed && this.playing && !this._advanceSuspended) this._scheduleAdvance(this.current);
    else this._clearAdvance();
    bus.emit('player:state', { embedAutoNext: !!on });
    return !!on;
  },

  /**
   * 网易云曲目的自动接播。
   *
   * ⚠️ 这是**估算**，不是事实：官方 iframe 没有播放结束回调。五层保护：
   *   1. 锚点对齐到 iframe `load` 之后 + 一小段缓冲补偿（`embed:loaded` 事件），
   *      且**宁可偏早**——偏晚就会听见上一首重播（官方播放器是单曲循环，见常量注释）；
   *   2. 时长优先用 `track.audioSeconds`（服务端从音频本身量出来的真实秒数），
   *      没有才退回元数据时长；试听片段就是靠这个才不会让人干等；
   *   3. 触发点是 `时长 − EMBED_BELL_S`（提前量），而不是"时长 + 尾巴"；
   *   4. **计时用静音媒体秒表，不用 setInterval**：后台标签页的定时器会被节流到
   *      每分钟一次，"该切歌"就会被推迟到用户切回前台（见 CLOCK_RATE 注释）；
   *      媒体事件与音频同一条时钟，不受节流影响；
   *   5. **关掉时不是不管**，而是在 `时长 + 0.3s` 把它停下来 —— 官方播放器播完会
   *      自己从头再来（单曲循环），不管的话就变成无限重播。
   *
   * 例外：用户动过官方控制条（`embed:touched`）之后位置无从推断，直接放弃估算 ——
   * 把正在听的歌切走，比少切一次严重得多。
   */
  _scheduleAdvance(track) {
    this._clearAdvance();
    if (!this.isEmbed || this._advanceSuspended) return;
    const total = Number(track?.audioSeconds) || Number(track?.duration) || 0;
    if (total <= 0) return;
    this._advanceAction = this.embedAutoNext ? 'next' : 'pause';
    this._advanceTotal = total;
    // 墙钟基准的触发点（兜底计时器用）
    this._advanceAt = this.embedAutoNext
      ? Math.max(1, total - EMBED_BELL_S)
      : total + 0.3;
    // 秒表从 iframe `load` 那一刻起跑，比音频出声早了缓冲补偿那一段，所以要加上
    this._advanceAtClock = this._advanceAt + EMBED_BUFFER_MS / 1000;

    const fire = () => {
      if (!this.playing || !this.isEmbed || this._advanceSuspended) return;
      const action = this._advanceAction;
      this._clearAdvance();
      if (action === 'pause') this.pause();
      else this.next({ auto: true });
    };

    // ① 主计时：静音媒体秒表（与音频同一条时钟，后台不被节流）
    if (total <= CLOCK_MAX_S && this._armClock(total, fire)) {
      this._advanceSource = 'media';
    } else {
      this._advanceSource = 'timer';
    }

    // ② 兜底：墙钟轮询。正常情况下先被秒表触发，这里只是"秒表放不出来 / 被挂起"时的保险，
    //    并且顺手把秒表拉回正确位置（resync）—— 后台被节流到每分钟一次也还能自愈。
    this._advanceTimer = setInterval(() => {
      if (!this.playing || !this.isEmbed || this._advanceSuspended) return;
      this._resyncClock();
      if (this.elapsed >= this._advanceAt) fire();
    }, 1000);
  },

  /**
   * 把静音秒表拉回"墙钟估算出来的位置"。
   *
   * 为什么需要：浏览器在后台可能把不发声的媒体挂起（实测过：隐藏后秒表的
   * paused 变 true、currentTime 停住）。秒表一旦停住，靠它计时的切歌也就停了，
   * 所以每次兜底计时器跑起来时都对一次表：暂停了就接着放，跑偏了就 seek 回去。
   */
  _resyncClock() {
    const el = this._clockEl;
    if (!el || !this._clockFire) return;
    const limit = Math.max(0.5, (el.duration || 1e9) - 0.2);
    const want = Math.min(Math.max(0, this.elapsed), limit);
    try {
      if (el.paused) {
        // 被浏览器挂起了：接着放，并且挪到墙钟估算的位置
        el.currentTime = want;
        const p = el.play();
        if (p && p.catch) p.catch(() => { /* 实在放不出来就靠兜底计时器 */ });
      } else if (want - el.currentTime > 3) {
        // 只**往前补**，绝不往后退：秒表在跑的时候它就是权威（它和音频同一条时钟），
        // 往后退反而会把"该切歌了"提前触发。
        el.currentTime = want;
      }
    } catch { /* 忽略 */ }
  },

  /** 准备/复用静音秒表元素；返回是否成功起表 */
  _armClock(total, fire) {
    try {
      const need = Math.ceil(total) + 2;
      if (!this._clockEl) {
        const el = document.createElement('audio');
        el.muted = true;
        el.preload = 'auto';
        el.setAttribute('aria-hidden', 'true');
        el.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
        document.body.append(el);
        this._clockEl = el;
        this._clockSecs = 0;
        el.addEventListener('timeupdate', () => this._onClockTick());
        el.addEventListener('ended', () => this._onClockTick(true));
      }
      const el = this._clockEl;
      if (this._clockSecs < need) {
        if (el.src) URL.revokeObjectURL(el.src);
        el.src = URL.createObjectURL(silentWav(need));
        this._clockSecs = need;
      }
      this._clockFire = fire;
      el.currentTime = 0;
      const p = el.play();
      if (p && p.catch) p.catch(() => { /* 放不出来就交给兜底计时器 */ });
      return true;
    } catch {
      return false;
    }
  },

  /** 秒表走到触发点就执行（timeupdate 约 4 次/秒，精度足够） */
  _onClockTick(ended = false) {
    const el = this._clockEl;
    if (!el || !this._clockFire) return;
    if (!this.playing || !this.isEmbed || this._advanceSuspended) return;
    if (!ended && el.currentTime < this._advanceAtClock) return;
    const fire = this._clockFire;
    this._clockFire = null;
    fire();
  },

  /** 用户动过官方播放器（拖动进度 / 在 iframe 里暂停）：这一首不再自动切 */
  suspendAdvance(reason = '') {
    if (!this.isEmbed) return false;
    this._advanceSuspended = true;
    this._clearAdvance();
    bus.emit('player:advance-suspended', { reason, track: this.current });
    return true;
  },

  /**
   * iframe 载入完成：把估算锚点挪到"音频大概刚要开始"的时刻。
   *
   * 秒表**不在这里重新起跑** —— 早期版本是在这里 pause 再等 350ms 用 `setTimeout` 重启，
   * 结果在后台标签页里那个 350ms 的定时器会被节流/冻结，秒表就一直停着不动，
   * 切歌自然也就停了（"后台放着放着断了"的另一个来源）。现在改成：秒表在
   * `_armClock` 里直接起跑，缓冲补偿体现在触发点 `_advanceAtClock` 上，全程不用定时器。
   */
  _reanchorEmbed() {
    if (!this.isEmbed || !this.playing) return;
    this._playStartedAt = Date.now() + EMBED_BUFFER_MS;
  },

  _clearAdvance() {
    if (this._advanceTimer) {
      clearInterval(this._advanceTimer);
      this._advanceTimer = null;
    }
    this._clockFire = null;
    if (this._clockEl && !this._clockEl.paused) {
      try { this._clockEl.pause(); } catch { /* 忽略 */ }
    }
    this._lastElapsed = 0;
    // 触发点也一起清掉：它是"估算时钟已布防"的证据。只清计时器不清它，
    // 换到直放曲目之后查询状态会看到"没有时钟却留着一个触发点"（自检就是这么抓到的）。
    this._advanceAt = 0;
    this._advanceAtClock = 0;
    this._advanceAction = null;
    this._advanceTotal = 0;
  },

  /**
   * 页面重新可见时立刻对一次表。
   *
   * 秒表在后台可能被浏览器挂起（不发声的媒体会被省电策略暂停），
   * 回到前台的这一刻就是最好的补救时机：先对表，再看是不是早就该切了。
   */
  _checkAdvanceNow() {
    if (!this.isEmbed || this._advanceSuspended) return;
    if (!this._advanceAt || !this._clockFire) return;
    this._resyncClock();
    const clock = this._clockEl && !this._clockEl.paused ? this._clockEl.currentTime : null;
    // 秒表和墙钟估算是两条独立的线，任一条过期就算过期（秒表被挂起时靠墙钟兜住）
    const byClock = clock !== null && clock >= this._advanceAtClock;
    const byWall = this.elapsed >= this._advanceAt;
    if (byClock || byWall) {
      const fire = this._clockFire;
      this._clockFire = null;
      fire();
    }
  },

  /* ---------- 可视化 ---------- */

  _scheduleGraph() {
    if (this.ctx || this._graphTimer || this.isEmbed) return;
    let tries = 0;
    // 播放稳定之后再建图：createMediaElementSource 在播放前调用会让媒体元素丢源。
    // 首播可能因为缓冲迟迟不动，所以这里重试几次，而不是一次不成就算了。
    const attempt = () => {
      this._graphTimer = null;
      if (this.ctx || !this.playing) return;
      if (this.currentTime <= 0) {
        if (tries++ < 6) this._graphTimer = setTimeout(attempt, 1500);
        return;
      }
      try { this.ensureGraph(); } catch { /* 忽略 */ }
    };
    this._graphTimer = setTimeout(attempt, 1200);
  },

  /**
   * 建立频谱分析图。只对同源音频建图（跨域音频接了会静音），
   * 且必须在播放稳定之后调用 —— 播放前 createMediaElementSource 会让媒体元素丢源。
   */
  ensureGraph() {
    if (this.ctx || !this.audio) return;
    const track = this.current;
    // ⚠️ 只给「自托管音频」建图，站内直放的网易云曲目**刻意不建**。
    //
    // 原因：`createMediaElementSource` 一旦调用，<audio> 的输出就**永久**改由
    // AudioContext 转发（规范如此，没法撤销），而这个上下文一旦被挂起 ——
    // iOS 进后台、音频设备切换、自动播放策略、耳机拔出 —— 声音就彻底没了，
    // 界面却还显示"播放中"。频谱只是锦上添花，而移动端「后台完整放完 + 自动切歌」
    // 是刚需，所以直放走**纯媒体管线**，可视化退化成合成音浪（观感一致）。
    // 自托管文件沿用老行为：本地文件自己控制，出问题也是自己的文件。
    if (track?.neteaseId) return;
    const sameOrigin = (() => {
      const url = this._audioUrlFor(track);
      if (!url) return false;
      try { return new URL(url, location.href).origin === location.origin; } catch { return false; }
    })();
    if (!sameOrigin) return;
    // iOS 上不建图：`createMediaElementSource` 之后 <audio> 的声音是**经过**
    // AudioContext 输出的，而 iOS 一进后台就把这个上下文挂起 —— 声音没了，
    // 界面却还在"播放中"。移动端「后台完整放完 + 自动切歌」比频谱动画重要。
    if (PLAYER.visualizerOnIOS === false && IS_IOS) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.source = this.ctx.createMediaElementSource(this.audio);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.78;
      this.source.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      this.freq = new Uint8Array(this.analyser.frequencyBinCount);
      bus.emit('player:graph', { ok: true, mode: 'analyser' });
    } catch (err) {
      console.warn('[player] 频谱不可用，降级为合成可视化', err);
      this.ctx = null;
      this.analyser = null;
      bus.emit('player:graph', { ok: false, mode: 'synthetic' });
    }
  },

  /** 返回 0~1 的频谱数组；不可用时返回 null（调用方使用合成动画） */
  spectrum(bars = PLAYER.bars) {
    if (!this.analyser || !this.freq) return null;
    this.analyser.getByteFrequencyData(this.freq);
    const out = new Array(bars);
    const usable = Math.floor(this.freq.length * 0.72);
    const step = usable / bars;
    for (let i = 0; i < bars; i++) {
      let sum = 0;
      const s = Math.floor(i * step);
      const e = Math.max(s + 1, Math.floor((i + 1) * step));
      for (let j = s; j < e; j++) sum += this.freq[j];
      out[i] = Math.min(1, sum / (e - s) / 210);
    }
    return out;
  },

  _pump() {
    if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
  },

  /**
   * 音频加载失败。
   * `force` = 已经**另行确认**过状态确实加载不出来（看门狗），此时不要再被
   * abort（code 1）去抖挡掉 —— 那个去抖正是导致"跳过整条回退链"的原因。
   */
  _onError({ force = false } = {}) {
    const t = this.current;
    if (!t) return;
    // 我们自己换 src / 主动取消加载不算失败（换歌、预取、拖动进度都会触发 code 1）
    if (!force && (this.audio?.error?.code || 0) === 1) return;

    // 先让来源处理：网易云直放失败会依次尝试「原始外链 → 官方外链播放器」，
    // 处理掉了就不要弹错误、更不要跳下一首 —— 用户点的是这首，就该把这首放出来
    if (this.provider?.onError?.(t, this) === true) return;

    if (!this._audioUrlFor(t)) return; // 真的没有音频（本地曲目没配文件），静默
    this._failCount++;
    bus.emit('toast', { message: `音频加载失败：${t.title}`, kind: 'err' });
    if (this._failCount < this.tracks.length && this.tracks.filter((x) => this._audioUrlFor(x)).length > 1) {
      this.next({ auto: true });
    } else {
      this.playing = false;
      this._intent = false;
      this._emitState();
    }
  },

  _emitState(extra = {}) {
    this._updateMediaSession();
    bus.emit('player:state', {
      playing: this.playing,
      index: this.index,
      provider: this.providerId,
      isEmbed: this.isEmbed,
      time: this.currentTime,
      duration: this.duration,
      buffered: this.audio?.buffered?.length ? this.audio.buffered.end(this.audio.buffered.length - 1) : 0,
      volume: this.audio?.volume ?? 1,
      muted: this.audio?.muted ?? false,
      ...extra,
    });
  },
};

/** 秒 → mm:ss */
export function fmtClock(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
