/**
 * plugins/tools/fft.js — 原地复数 radix-2 FFT（零依赖）
 * ------------------------------------------------------------------
 * 只留 AI 分轨需要的那一个函数：人声残留清理（bleed.js）的 STFT / ISTFT。
 * 长度必须是 2 的幂；`inverse` 时做 IFFT 并除以 N。
 */

const TAU = Math.PI * 2;

/**
 * 原地 FFT / IFFT。
 * @param {Float64Array} re 实部
 * @param {Float64Array} im 虚部
 * @param {boolean} [inverse]
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
    const ang = (inverse ? TAU : -TAU) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        const ur = re[a];
        const ui = im[a];
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

export default { fft };
