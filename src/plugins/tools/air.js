/**
 * plugins/tools/air.js — 给 AI 伴奏补回高频（纯 DSP）
 * ==================================================================
 * 问题：MDX-Net 的伴奏输出在 4–16kHz 会掉 20–30dB（实测 Planetes），
 * 导出后听起来「糊」、没有空气感。它不是没声音，而是高频被模型削掉了。
 *
 * 做法：把「原曲 − 模型伴奏」的 4kHz 以上部分补回模型伴奏：
 *     delta = highpass(orig − inst)
 *     out   = inst + strength · delta
 * 低频/中频仍然用模型的结果（人声已经去掉），只有高频从原曲借回来。
 * 这会同时带回一点人声齿音/气声；所以留了 0–100% 的强度，默认 80%。
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

/**
 * 给模型伴奏补高频。
 * @param {Float32Array[]} inst 模型伴奏 [L, R]
 * @param {Float32Array[]} orig 原曲 [L, R]
 * @param {{strength?:number, sampleRate?:number, cutoff?:number}} opts
 * @returns {{l:Float32Array, r:Float32Array}}
 */
export function restoreAir(inst, orig, {
  strength = 0.8, sampleRate = 48000, cutoff = 3800,
} = {}) {
  const s = Math.max(0, Math.min(1, Number(strength) || 0));
  const channels = Math.max(1, Math.min(inst.length || 1, orig.length || 1));
  const out = [];
  let peak = 0;

  for (let c = 0; c < channels; c++) {
    const a = inst[c];
    const b = orig[c] || orig[0];
    const n = Math.min(a.length, b.length);
    const diff = new Float32Array(n);
    for (let i = 0; i < n; i++) diff[i] = b[i] - a[i];
    const hp = highpass(diff, sampleRate, cutoff);
    const y = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = a[i] + s * hp[i];
      y[i] = v;
      const abs = Math.abs(v);
      if (abs > peak) peak = abs;
    }
    out.push(y);
  }

  // 补高频可能让峰值超过 1；整体缩一下，别在导出时削波
  if (peak > 1) {
    const g = 0.999 / peak;
    for (const arr of out) {
      for (let i = 0; i < arr.length; i++) arr[i] *= g;
    }
  }

  return { l: out[0], r: out[1] || out[0] };
}

export default { restoreAir };
