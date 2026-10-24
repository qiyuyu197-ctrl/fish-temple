/**
 * plugins/tools/bleed.js — 人声轨「乐器残留」清理（纯 DSP）
 * ==================================================================
 * 为什么需要它：
 *   就算用了人声专精模型（Kim Vocal 2 / Voc FT），遇到人声进入前的
 *   器乐过渡、加花、synth pad，模型仍会把它们当成「人声」留下来。
 *   这些残留有一个共同点：它们在伴奏模型的结果里也有，而且波形/相位
 *   与人声轨里的那一部分是**相干**的。
 *
 * 做法（逐频点最小二乘投影）：
 *   对每个 STFT 频点，把伴奏 I 当作参考，估一个泄漏系数
 *       g = Re(V · conj(I)) / (|I|² + ε)
 *   再把人声轨里和 I 相干的那部分减掉：
 *       V' = V − strength · g · I
 *   g 只取 [0,1]；I 很弱的频点（人声自己的频段）g≈0，不会被误伤。
 *
 * 这不是 Demucs；它只处理「和人声一起被模型带出来的伴奏」，
 * 对完全不相干的残留无能为力。界面上给了 0–100% 的强度，0 = 关。
 *
 * 纯函数（只依赖 vocal.js 的 FFT），Node / 浏览器都能跑。
 */

import { fft } from './fft.js';

const FFT_N = 2048;
const HOP = FFT_N / 4;
const TAU = Math.PI * 2;

const makeWindow = () => {
  const w = new Float64Array(FFT_N);
  for (let i = 0; i < FFT_N; i++) w[i] = 0.5 - 0.5 * Math.cos((TAU * i) / FFT_N);
  return w;
};

const WINDOW = makeWindow();

/**
 * 清理一个声道。
 * @param {Float32Array} vocal
 * @param {Float32Array} reference 伴奏（同长度/同采样率；短了按 0 补）
 * @param {{strength?:number, onProgress?:(p:number)=>void, yieldToUI?:boolean}} opts
 * @returns {Promise<Float32Array>}
 */
async function cancelChannel(vocal, reference, { strength = 0.8, onProgress, yieldToUI = true } = {}) {
  const n = vocal.length;
  const out = new Float32Array(n);
  const vr = new Float64Array(FFT_N);
  const vi = new Float64Array(FFT_N);
  const rr = new Float64Array(FFT_N);
  const ri = new Float64Array(FFT_N);
  const pad = FFT_N / 2;
  const total = n + pad * 2;
  const frames = Math.ceil(total / HOP);
  let sinceYield = Date.now();

  for (let f = 0; f < frames; f++) {
    const start = f * HOP;
    for (let i = 0; i < FFT_N; i++) {
      const idx = start + i - pad;
      const w = WINDOW[i];
      const a = (idx >= 0 && idx < n) ? vocal[idx] : 0;
      const b = (idx >= 0 && idx < reference.length) ? reference[idx] : 0;
      vr[i] = a * w; vi[i] = 0;
      rr[i] = b * w; ri[i] = 0;
    }
    fft(vr, vi);
    fft(rr, ri);

    for (let k = 0; k < FFT_N; k++) {
      const dot = vr[k] * rr[k] + vi[k] * ri[k];          // Re(V·conj(I))
      const pow = rr[k] * rr[k] + ri[k] * ri[k] + 1e-12;  // |I|²
      let g = dot / pow;
      if (g <= 0) continue;
      if (g > 1) g = 1;
      vr[k] -= strength * g * rr[k];
      vi[k] -= strength * g * ri[k];
    }

    fft(vr, vi, true);
    for (let i = 0; i < FFT_N; i++) {
      const idx = start + i - pad;
      if (idx >= 0 && idx < n) out[idx] += (vr[i] * WINDOW[i]) / 1.5;
    }

    if (onProgress && (f % 32 === 0 || f === frames - 1)) onProgress((f + 1) / frames);
    if (yieldToUI && Date.now() - sinceYield > 120) {
      await new Promise((res) => setTimeout(res, 0));
      sinceYield = Date.now();
    }
  }
  return out;
}

/**
 * 清理人声轨里的乐器残留。
 * @param {Float32Array[]} vocal     [L, R]（单声道就传一条）
 * @param {Float32Array[]} reference [L, R] 伴奏
 * @param {{strength?:number, onProgress?:(p:number)=>void, yieldToUI?:boolean}} opts
 * @returns {Promise<{l:Float32Array, r:Float32Array}>}
 */
export async function cancelBleed(vocal, reference, {
  strength = 0.8, onProgress, yieldToUI = true,
} = {}) {
  const s = Math.max(0, Math.min(1, Number(strength) || 0));
  const channels = Math.min(vocal.length || 0, reference.length || 0) || 1;
  const out = [];
  for (let c = 0; c < channels; c++) {
    const p = (c + 0.5) / channels;
    // eslint-disable-next-line no-await-in-loop
    const arr = await cancelChannel(vocal[c], reference[c] || reference[0], {
      strength: s,
      onProgress: (q) => onProgress?.(((c + q) / channels)),
      yieldToUI,
    });
    out.push(arr);
    onProgress?.(p);
  }
  return { l: out[0], r: out[1] || out[0] };
}

export default { cancelBleed };
