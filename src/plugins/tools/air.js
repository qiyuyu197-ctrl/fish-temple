/**
 * plugins/tools/air.js — 给 AI 伴奏补回高频（纯 DSP，带人声安全模式）
 * ==================================================================
 * 问题：MDX-Net 的伴奏输出在 4–16kHz 会掉 20–30dB（实测 Planetes），
 * 导出后听起来「糊」。但直接把原曲高频补回去，会把原曲里的人声齿音/气声
 * 也一起带回来——有些歌里 4kHz 以上几乎全是人声（实测 Kim 人声高频和
 * 「原曲−伴奏」高频的相关度 0.998），所以「糊」和人声是一枚硬币的两面。
 *
 * 两种补法：
 *   strong（安全关）：out = inst + strength · highpass(orig − inst)
 *     高频补得最满，但可能带回一点人声高频。
 *   safe（默认）：把补回量拆成 M/S：
 *     · 侧面 S 永远补（人声通常在中间，侧高频多是器乐/混响）
 *     · 中间 M 只在「人声不活跃」时补：
 *         - 有 Kim 人声参考：按 Kim 高频包络做门限
 *         - 没有参考：按原曲中/侧高频比例做门限（中间太强就不补）
 *     这样有人声高频的地方不会被补出小声音；只有器乐高频的地方仍然变亮。
 *
 * 4 阶 Linkwitz-Riley 高通（两级 RBJ biquad，Q=0.707，-6dB 在 cutoff）。
 * 纯函数，Node / 浏览器都能跑。
 */

/** 一级 RBJ 高通 */
function highpassOnce(input, sampleRate, cutoff, Q = 0.707) {
  const w0 = (2 * Math.PI * cutoff) / sampleRate;
  const c = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Q);
  const a0 = 1 + alpha;
  const b0 = ((1 + c) / 2) / a0;
  const b1 = (-(1 + c)) / a0;
  const b2 = ((1 + c) / 2) / a0;
  const a1 = (-2 * c) / a0;
  const a2 = (1 - alpha) / a0;
  const out = new Float32Array(input.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x;
    y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

/** 两级级联 = 4 阶 Linkwitz-Riley（-6dB @ cutoff） */
function highpass(input, sampleRate, cutoff) {
  return highpassOnce(highpassOnce(input, sampleRate, cutoff), sampleRate, cutoff);
}

/** 高频包络（快起慢落） */
function envelope(sig, sampleRate, attack = 0.008, release = 0.15) {
  const out = new Float32Array(sig.length);
  const aA = Math.exp(-1 / Math.max(1, sampleRate * attack));
  const aR = Math.exp(-1 / Math.max(1, sampleRate * release));
  let e = 0;
  for (let i = 0; i < sig.length; i++) {
    const v = Math.abs(sig[i]);
    e = v > e ? aA * e + (1 - aA) * v : aR * e + (1 - aR) * v;
    out[i] = e;
  }
  return out;
}

/** 取分位数（用于把包络归一化到 98% 峰值） */
function percentile(arr, p) {
  if (!arr.length) return 0;
  const a = Float32Array.from(arr).sort();
  return a[Math.min(a.length - 1, Math.floor(a.length * p))] || 0;
}

/**
 * 给模型伴奏补高频。
 * @param {Float32Array[]} inst 模型伴奏 [L, R]
 * @param {Float32Array[]} orig 原曲 [L, R]
 * @param {{strength?:number, sampleRate?:number, cutoff?:number, safe?:boolean, vocal?:Float32Array[]|null}} opts
 * @returns {{l:Float32Array, r:Float32Array}}
 */
export function restoreAir(inst, orig, {
  strength = 0.8, sampleRate = 48000, cutoff = 3800, safe = true, vocal = null,
} = {}) {
  const s = Math.max(0, Math.min(1, Number(strength) || 0));
  const channels = Math.max(1, Math.min(inst.length || 1, orig.length || 1));
  const n = Math.min(inst[0]?.length || 0, orig[0]?.length || 0);
  if (!n) return { l: new Float32Array(0), r: new Float32Array(0) };

  const iL = inst[0];
  const iR = channels > 1 ? inst[1] : iL;
  const oL = orig[0];
  const oR = channels > 1 ? orig[1] : oL;

  const dL = highpass(Float32Array.from({ length: n }, (_, i) => oL[i] - iL[i]), sampleRate, cutoff);
  const dR = highpass(Float32Array.from({ length: n }, (_, i) => oR[i] - iR[i]), sampleRate, cutoff);

  let airL = dL;
  let airR = dR;

  if (safe) {
    // 中/侧拆分：侧面高频直接补，中间高频按人声活跃度门限
    const dM = new Float32Array(n);
    const dS = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      dM[i] = (dL[i] + dR[i]) / 2;
      dS[i] = (dL[i] - dR[i]) / 2;
    }

    let gate = null;
    if (vocal && vocal[0] && vocal[0].length) {
      const vL = vocal[0];
      const vR = vocal[1] || vL;
      const vMid = new Float32Array(n);
      for (let i = 0; i < n; i++) vMid[i] = (vL[i] + vR[i]) / 2;
      const env = envelope(highpass(vMid, sampleRate, cutoff), sampleRate);
      const ref = percentile(env, 0.98) || 1;
      gate = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const q = env[i] / (0.12 * ref);
        gate[i] = 1 / (1 + q * q);
      }
    } else {
      // 没有 Kim 参考：中间高频明显强于侧面时，认为可能是人声，不补中间
      const cHigh = highpass(Float32Array.from({ length: n }, (_, i) => (oL[i] + oR[i]) / 2), sampleRate, cutoff);
      const sHigh = highpass(Float32Array.from({ length: n }, (_, i) => (oL[i] - oR[i]) / 2), sampleRate, cutoff);
      const cEnv = envelope(cHigh, sampleRate);
      const sEnv = envelope(sHigh, sampleRate);
      gate = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const q = cEnv[i] / (0.6 * sEnv[i] + 1e-9);
        gate[i] = 1 / (1 + q * q);
      }
    }

    airL = new Float32Array(n);
    airR = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const m = dM[i] * gate[i];
      airL[i] = m + dS[i];
      airR[i] = m - dS[i];
    }
  }

  const outL = new Float32Array(n);
  const outR = new Float32Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const l = iL[i] + s * airL[i];
    const r = iR[i] + s * airR[i];
    outL[i] = l; outR[i] = r;
    const a = Math.max(Math.abs(l), Math.abs(r));
    if (a > peak) peak = a;
  }

  if (peak > 1) {
    const g = 0.999 / peak;
    for (let i = 0; i < n; i++) { outL[i] *= g; outR[i] *= g; }
  }
  return { l: outL, r: outR };
}

/**
 * 量一下模型伴奏缺了多少高频（dB），用来决定要不要补、补多少。
 * 只看前 60 秒，够代表整首；4kHz 以上 RMS 比。
 * @param {AudioBuffer|Float32Array[]} inst
 * @param {AudioBuffer|Float32Array[]} orig
 * @param {{sampleRate?:number, cutoff?:number}} opts
 * @returns {number} 原曲高频 / 模型高频，dB；0 表示不缺
 */
export function measureAirNeed(inst, orig, { sampleRate = 48000, cutoff = 3800 } = {}) {
  const get = (x, c) => (x?.getChannelData ? x.getChannelData(c) : x[c]);
  const iL = get(inst, 0), oL = get(orig, 0);
  const iR = get(inst, 1) || iL, oR = get(orig, 1) || oL;
  if (!iL || !oL) return 0;
  const n = Math.min(iL.length, oL.length, Math.round(sampleRate * 60));
  if (n < 1000) return 0;
  const iH = highpass(Float32Array.from({ length: n }, (_, i) => (iL[i] + iR[i]) / 2), sampleRate, cutoff);
  const oH = highpass(Float32Array.from({ length: n }, (_, i) => (oL[i] + oR[i]) / 2), sampleRate, cutoff);
  let ie = 0, oe = 0;
  for (let i = 0; i < n; i += 4) { ie += iH[i] * iH[i]; oe += oH[i] * oH[i]; }
  if (ie < 1e-12) return oe > 1e-12 ? 24 : 0;
  return Math.max(0, Math.round(20 * Math.log10(Math.sqrt(oe / ie)) * 10) / 10);
}

export default { restoreAir, measureAirNeed };
