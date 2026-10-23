/**
 * plugins/tools/vocal.js — 去人声 / 提纯伴奏（纯 DSP，零依赖）
 * ==================================================================
 * 原理先说清楚，免得抱着「AI 分离」的期待点进来：
 *
 *   绝大多数流行歌把**主唱摆在正中间**：左右声道里人声一模一样（同相），
 *   而伴奏的吉他、键盘、混响通常带一点左右差（反相/立体声）。于是
 *
 *       中间信号 M = (L + R) / 2      ← 人声几乎全在这里
 *       两侧信号 S = (L - R) / 2      ← 人声几乎为零，伴奏在这里
 *
 *   把 M 压掉、只留 S，就能得到「伴奏」—— 这就是所有卡拉 OK 机的做法。
 *   本模块给两个做法：
 *
 *     · fast   时域相位抵消：outM = M_lp + k·(M − M_lp)，k = 1 − 强度。
 *              低频（默认 <150Hz）原样留下，所以贝斯和底鼓不会一起消失。
 *              瞬时完成，几百毫秒。
 *     · spectral 频域中置压制：STFT 后逐频点估计「中置程度」
 *              w = 1 − |L−R| / |L+R|，只把中置成分按 w 压掉。
 *              比时域干净，代价是慢（≈ 每 10 秒音频 1~2 秒）。
 *
 * 做不到的：**单声道文件无解**（L 与 R 一模一样，没有人声可抵消）；
 * 乐器如果也摆在正中（军鼓、贝斯、部分钢琴）会跟着一起被削；
 * 真正「干净地分离人声与伴奏」需要 Demucs 之类的模型权重与推理，
 * 那是几百 MB 的事，站点不干 —— 界面上也这么写。
 *
 * 这个文件不碰 DOM，Node 里能直接 import 做数值自检。
 */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const TAU = Math.PI * 2;

/* ================= 基础：低通 / FFT / 统计 ================= */

/** RBJ 双二阶低通系数（12dB/oct） */
export function lowpassCoeffs(fc, fs, q = Math.SQRT1_2) {
  const cut = clamp(Number(fc) || 0, 10, fs * 0.45);
  const w0 = (TAU * cut) / fs;
  const cosw = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  return {
    b0: (1 - cosw) / 2 / a0,
    b1: (1 - cosw) / a0,
    b2: (1 - cosw) / 2 / a0,
    a1: (-2 * cosw) / a0,
    a2: (1 - alpha) / a0,
  };
}

/**
 * 单声道低通（直接型 I，双二阶）。
 * `stages = 2` 级联成 24dB/oct —— 低频保护只补贝斯，不该把 440Hz 的人声
 * 也从 12dB/oct 的裙边漏回来。
 */
export function lowpass(input, fc, fs, q, stages = 2) {
  const { b0, b1, b2, a1, a2 } = lowpassCoeffs(fc, fs, q);
  let src = input;
  let out = new Float32Array(input.length);
  for (let stage = 0; stage < Math.max(1, stages); stage++) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < src.length; i++) {
      const x = src[i];
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x;
      y2 = y1; y1 = y;
      out[i] = y;
    }
    src = out;
    if (stage + 1 < stages) out = new Float32Array(input.length);
  }
  return out;
}

/**
 * 原地复数 FFT（radix-2）。长度必须是 2 的幂。
 * `inverse` 时做 IFFT 并除以 N。
 */
export function fft(re, im, inverse = false) {
  const n = re.length;
  if (!n || (n & (n - 1)) !== 0) throw new Error('FFT 长度必须是 2 的幂');
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? TAU : -TAU) / len);
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        const ur = re[a], ui = im[a];
        re[a] = ur + xr; im[a] = ui + xi;
        re[b] = ur - xr; im[b] = ui - xi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
  return { re, im };
}

/** 均方根（可选抽样，长音频统计不必逐点） */
export function rms(data, step = 1) {
  let sum = 0, count = 0;
  for (let i = 0; i < data.length; i += step) { sum += data[i] * data[i]; count++; }
  return count ? Math.sqrt(sum / count) : 0;
}

export function peak(data, step = 1) {
  let p = 0;
  for (let i = 0; i < data.length; i += step) {
    const v = Math.abs(data[i]);
    if (v > p) p = v;
  }
  return p;
}

/**
 * 看一眼这对声道值不值得做分离。
 * @returns {{mono:boolean, correlation:number, centerRatio:number, width:number, rmsL:number, rmsR:number}}
 */
export function analyze(l, r) {
  const n = Math.min(l.length, r.length);
  const step = Math.max(1, Math.floor(n / 400000));
  let ll = 0, rr = 0, lr = 0, mm = 0, ss = 0;
  for (let i = 0; i < n; i += step) {
    const a = l[i], b = r[i];
    ll += a * a; rr += b * b; lr += a * b;
    const m = (a + b) / 2, s = (a - b) / 2;
    mm += m * m; ss += s * s;
  }
  const corr = ll > 1e-12 && rr > 1e-12 ? lr / Math.sqrt(ll * rr) : 1;
  const mid = Math.sqrt(mm), side = Math.sqrt(ss);
  const total = mid + side;
  return {
    // 相关系数接近 1（或中置能量远大于两侧）→ 没有人声可抵消
    mono: corr > 0.999 || side < mid * 0.02,
    correlation: corr,
    centerRatio: total > 1e-9 ? mid / total : 1,
    width: total > 1e-9 ? side / total : 0,
    rmsL: Math.sqrt(ll / Math.max(1, Math.ceil(n / step))),
    rmsR: Math.sqrt(rr / Math.max(1, Math.ceil(n / step))),
  };
}

/* ================= 时域：相位抵消（快） ================= */

/**
 * 相位抵消去人声。
 * @param {Float32Array} l
 * @param {Float32Array} r
 * @param {{strength?:number, bassHz?:number, sampleRate?:number}} opts
 * @returns {{l:Float32Array, r:Float32Array}} 伴奏（立体声保留）
 */
export function removeCenterFast(l, r, { strength = 1, bassHz = 150, sampleRate = 44100 } = {}) {
  const n = Math.min(l.length, r.length);
  const s = clamp(Number(strength), 0, 1);
  const mid = new Float32Array(n);
  for (let i = 0; i < n; i++) mid[i] = (l[i] + r[i]) / 2;
  // bassHz=0 时不滤波：低频保护关掉，整个中置都压
  const low = bassHz > 0 ? lowpass(mid, bassHz, sampleRate) : null;
  const keep = 1 - s;
  const outL = new Float32Array(n);
  const outR = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const m = low ? low[i] + keep * (mid[i] - low[i]) : mid[i] * keep;
    // 两侧信号现算，不再单独存一条 side（长音频省几十 MB）
    const side = (l[i] - r[i]) / 2;
    outL[i] = m + side;
    outR[i] = m - side;
  }
  return { l: outL, r: outR };
}

/* ================= 频域：中置压制（细） ================= */

const FFT_N = 2048;
const HOP = FFT_N / 4;

function hann(n) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((TAU * i) / n);
  return w;
}

/**
 * 频域去人声：逐频点估计中置程度，只压中置成分。
 * 立体声像会被保留（两侧信号原样不动），低频按 bassHz 软保留。
 *
 * @param {Float32Array} l
 * @param {Float32Array} r
 * @param {{strength?:number, bassHz?:number, sampleRate?:number,
 *          onProgress?:(p:number)=>void, yieldToUI?:boolean}} opts
 * @returns {Promise<{l:Float32Array, r:Float32Array}>}
 */
export async function removeCenterSpectral(l, r, {
  strength = 1, bassHz = 150, sampleRate = 44100,
  onProgress, yieldToUI = true,
} = {}) {
  const n = Math.min(l.length, r.length);
  const s = clamp(Number(strength), 0, 1);
  const win = hann(FFT_N);
  const outL = new Float32Array(n);
  const outR = new Float32Array(n);

  const lre = new Float64Array(FFT_N), lim = new Float64Array(FFT_N);
  const rre = new Float64Array(FFT_N), rim = new Float64Array(FFT_N);

  // 每个频点的「低频保留」系数：bassHz 以下 1，斜率区平滑过渡，以上 0
  const keepOfBin = new Float64Array(FFT_N);
  if (bassHz > 0) {
    const lo = bassHz * 0.75, hi = bassHz * 1.35;
    for (let k = 0; k < FFT_N; k++) {
      const f = ((k <= FFT_N / 2 ? k : FFT_N - k) * sampleRate) / FFT_N;
      keepOfBin[k] = f <= lo ? 0 : f >= hi ? 1 : (f - lo) / (hi - lo);
    }
  } else {
    keepOfBin.fill(1);
  }

  const pad = FFT_N / 2;
  const total = n + pad * 2;
  const frames = Math.ceil(total / HOP);
  // Hann 窗在 75% 重叠下的平方和 = 1.5
  const norm = 3 / 2;
  let sinceYield = Date.now();

  for (let f = 0; f < frames; f++) {
    const start = f * HOP;                  // 窗在补齐后的坐标；-pad 才是原信号坐标
    for (let i = 0; i < FFT_N; i++) {
      const idx = start + i - pad;
      const w = win[i];
      const a = (idx >= 0 && idx < n) ? l[idx] : 0;
      const b = (idx >= 0 && idx < n) ? r[idx] : 0;
      lre[i] = a * w; lim[i] = 0;
      rre[i] = b * w; rim[i] = 0;
    }
    fft(lre, lim);
    fft(rre, rim);

    for (let k = 0; k < FFT_N; k++) {
      const keep = keepOfBin[k];
      if (keep === 0) continue;             // 低频整段不动
      const sre = lre[k] + rre[k], sim = lim[k] + rim[k];   // 2M
      const dre = lre[k] - rre[k], dim = lim[k] - rim[k];   // 2D
      const den = sre * sre + sim * sim;
      const num = dre * dre + dim * dim;
      let w = den > 1e-20 ? 1 - Math.sqrt(num / den) : 1;   // 1=纯中置，0=纯两侧
      w = clamp(w, 0, 1) * keep;
      const g = 1 - s * w;
      const nsre = sre * g, nsim = sim * g;
      lre[k] = (nsre + dre) / 2; lim[k] = (nsim + dim) / 2;
      rre[k] = (nsre - dre) / 2; rim[k] = (nsim - dim) / 2;
    }

    fft(lre, lim, true);
    fft(rre, rim, true);
    for (let i = 0; i < FFT_N; i++) {
      const idx = start + i - pad;
      if (idx < 0 || idx >= n) continue;
      outL[idx] += (lre[i] * win[i]) / norm;
      outR[idx] += (rre[i] * win[i]) / norm;
    }

    if (onProgress && (f % 32 === 0 || f === frames - 1)) onProgress((f + 1) / frames);
    if (yieldToUI && Date.now() - sinceYield > 120) {
      await new Promise((res) => setTimeout(res, 0));
      sinceYield = Date.now();
    }
  }

  return { l: outL, r: outR };
}

/* ================= 收尾：增益 / 试听素材 ================= */

/** 等响增益：让处理后的伴奏不比原曲小声（会留 2% 余量防削顶） */
export function matchLoudness(outL, outR, refL, refR, { maxGain = 2 } = {}) {
  const inRms = Math.sqrt((rms(refL, 7) ** 2 + rms(refR, 7) ** 2) / 2) || 1e-9;
  const outRms = Math.sqrt((rms(outL, 7) ** 2 + rms(outR, 7) ** 2) / 2);
  if (outRms < 1e-7) return 1;
  let gain = clamp(inRms / outRms, 0.5, maxGain);
  const pk = Math.max(peak(outL, 5), peak(outR, 5));
  if (pk * gain > 0.98) gain = 0.98 / pk;
  return gain;
}

/** 被去掉的那部分（= 原曲 − 伴奏），用来试听「人声残留」 */
export function residual(origL, origR, instL, instR) {
  const n = Math.min(origL.length, instL.length);
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  for (let i = 0; i < n; i++) { l[i] = origL[i] - instL[i]; r[i] = origR[i] - instR[i]; }
  return { l, r };
}

/**
 * 一步到位：分离 → 等响 → 返回可播放/导出的两条声道。
 * @param {Float32Array} l
 * @param {Float32Array} r
 * @param {{method?:'fast'|'spectral', strength?:number, bassHz?:number,
 *          sampleRate?:number, autoGain?:boolean, onProgress?:(p:number)=>void}} opts
 * @returns {Promise<{l:Float32Array, r:Float32Array, gain:number, method:string, ms:number}>}
 */
export async function separate(l, r, {
  method = 'fast', strength = 1, bassHz = 150, sampleRate = 44100, autoGain = true, onProgress,
} = {}) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  onProgress?.(0);
  const raw = method === 'spectral'
    ? await removeCenterSpectral(l, r, { strength, bassHz, sampleRate, onProgress })
    : removeCenterFast(l, r, { strength, bassHz, sampleRate });
  onProgress?.(1);
  let gain = 1;
  if (autoGain) {
    gain = matchLoudness(raw.l, raw.r, l, r);
    if (Math.abs(gain - 1) > 1e-3) {
      // 结果数组是自己的，原地乘，别再复制一份（5 分钟音频能省上百 MB）
      for (let i = 0; i < raw.l.length; i++) { raw.l[i] *= gain; raw.r[i] *= gain; }
    } else {
      gain = 1;
    }
  }
  const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  return { l: raw.l, r: raw.r, gain, method, ms: t1 - t0 };
}

export const VocalTools = {
  analyze, separate, removeCenterFast, removeCenterSpectral,
  residual, matchLoudness, fft, lowpass, rms, peak,
};

export default VocalTools;
