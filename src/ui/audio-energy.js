/**
 * ui/audio-energy.js — 频段能量 + 起音（onset）检测
 * ==================================================================
 * 场景要"跟着歌走"，靠的不是频谱快照，而是**瞬态**：
 * 鼓点砸下来的那一下（onset）才是画面该抖、该亮、该溅开的时候。
 *
 * 这套检测是照 Folia 的实现搬的（`VisualizerDiorama` 里的 onset 状态机）：
 *   · 每条频段维护 fast（快跟随）、floor（慢地板）、peak（峰值衰减）三个包络；
 *   · transient = (fast - floor) / (peak - floor)，超过阈值 → onset，并进入 armed；
 *   · transient 回落到低位 → 重新武装，避免一次鼓点连发几十次。
 *
 * 频段划分也照它：bass 20–150 / lowMid 150–400 / mid 400–1200 / vocal 1k–3.5k / treble 3.5k–12k。
 * 前提是 analyser 的 fftSize 够大（我们改成 2048，频点间隔 ≈21.5Hz），
 * 256 点的时候一个频点跨 172Hz，低音根本分不出来。
 */
import { Player } from '../core/player.js';

export const BANDS = [
  { id: 'bass', lo: 20, hi: 150 },
  { id: 'lowMid', lo: 150, hi: 400 },
  { id: 'mid', lo: 400, hi: 1200 },
  { id: 'vocal', lo: 1000, hi: 3500 },
  { id: 'treble', lo: 3500, hi: 12000 },
];

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const exp = (ms) => 1 - Math.exp(-16 / ms); // 以 60fps 的一帧算系数

/** 单个频段的包络状态（也用于测试） */
export function newBandState() {
  return { fast: 0, floor: 0, peak: 0, armed: false, primed: false, level: 0 };
}

/**
 * 推进一帧，返回 { level, transient, sustained, onset }。
 * level 是归一化后的频段能量（0–1）。
 */
export function stepBand(state, rawLevel, { spike = 1 } = {}) {
  const level = clamp01((Number(rawLevel) || 0) ** spike);

  if (!state.primed) {
    state.fast = level;
    state.floor = level;
    state.peak = level;
    state.primed = true;
    state.level = level;
    return { level, transient: 0, sustained: 0, onset: false };
  }

  // fast：起音快、回落慢一点，鼓点才有"实体"
  state.fast += (level - state.fast) * (level > state.fast ? exp(28) : exp(120));
  // floor：极慢地板，跟住静音段的环境噪声
  state.floor += (level - state.floor) * (level > state.floor ? exp(700) : exp(3200));
  // peak：跟着最大值走，然后缓慢衰减（给 transient 一个"相对高度"的参照）
  state.peak = Math.max(level, state.peak - 0.004);

  const range = Math.max(0.1, state.peak - state.floor);
  const transient = clamp01((state.fast - state.floor) / range);
  const sustained = clamp01(state.fast / Math.max(0.18, state.peak));

  let onset = false;
  if (!state.armed && transient >= 0.5) {
    state.armed = true;
    onset = true;
  } else if (state.armed && transient <= 0.28) {
    state.armed = false;
  }

  state.level = level;
  return { level, transient, sustained, onset };
}

/** 把一串采样喂给一个频段，返回 onset 次数（测试用） */
export function countOnsets(levels) {
  const st = newBandState();
  let n = 0;
  for (const v of levels) if (stepBand(st, v).onset) n += 1;
  return n;
}

export class AudioEnergy {
  constructor() {
    this.states = new Map(BANDS.map((b) => [b.id, newBandState()]));
    this.bands = {};
    this.overall = 0;
    this.beat = 0;        // 0–1 的鼓点包络，给"震一下"用
    this.lastOnsetAt = 0;
  }

  /** 读一帧；没有 analyser 时返回 null（官方 iframe 就没有） */
  read(now = performance.now()) {
    const analyser = Player?.analyser;
    const freq = Player?.freq;
    if (!analyser || !freq) return null;

    if (!this._binHz) {
      const nyquist = (Player.ctx?.sampleRate || 44100) / 2;
      this._binHz = nyquist / freq.length;
    }
    // 全零：上下文没跑或还没出声，返回 null 让场景退化成合成波形（而不是静止）
    let total = 0;
    for (let j = 0; j < freq.length; j += 1) total += freq[j];
    if (total === 0) return null;
    if (!this._last) this._last = now;
    const dt = Math.min(80, Math.max(8, now - this._last));
    this._last = now;

    // 鼓点包络：起音时冲到 1，之后按时间衰减
    if (this.lastOnsetAt) {
      this.beat = Math.max(0, 1 - (now - this.lastOnsetAt) / 260);
    }

    for (const band of BANDS) {
      const b0 = Math.max(1, Math.floor(band.lo / this._binHz));
      const b1 = Math.max(b0 + 1, Math.min(freq.length - 1, Math.ceil(band.hi / this._binHz)));
      let sum = 0;
      for (let i = b0; i <= b1; i += 1) sum += freq[i];
      const raw = sum / (b1 - b0 + 1) / 255;
      // bass 提权（人耳对低频响度感知弱，Folia 也这么做）
      const spike = band.id === 'bass' ? 1.6 : band.id === 'treble' ? 2 : 1.8;
      const r = stepBand(this.states.get(band.id), raw, { spike });
      this.bands[band.id] = r;
      if (r.onset && band.id === 'bass') {
        this.lastOnsetAt = now;
        this.beat = 1;
      }
    }

    const b = this.bands;
    this.overall = clamp01((b.bass.level * 1.2 + b.lowMid.level + b.mid.level * 0.8
      + b.vocal.level * 0.6 + b.treble.level * 0.4) / 4);
    return this;
  }
}

