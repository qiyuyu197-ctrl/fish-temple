#!/usr/bin/env node
/**
 * tools/make-audio.mjs — 生成一个用于测试的合成音频（可选工具）
 * ------------------------------------------------------------------
 * 站点的播放列表默认由网易云曲目组成（见 src/plugins/netease.js）。
 * 只有当需要往列表里加「自托管的音频」时，才需要这个脚本产出一个测试文件，
 * 用来确认 <audio> 播放链路与频谱可视化是否正常。
 *
 * 用法：
 *   node tools/make-audio.mjs                  # 生成 assets/audio/test-tone.wav
 *   node tools/make-audio.mjs my-track.mp3     # 自定义文件名（内容仍是 WAV）
 *
 * 生成后编辑 src/config/site.config.js，把 PLAYLIST 里那条注释示例打开即可。
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'assets', 'audio');

const SR = 22050;
const DURATION = 9;   // 秒

/** 生成 16-bit 单声道 WAV */
function wav(samples) {
  const dataLen = samples.length * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);       // PCM
  buf.writeUInt16LE(1, 22);       // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

/** 和弦 + 缓慢滤波感，做出安静的 ambient 氛围 */
function render({ freqs, lfo = 0.18, gain = 0.34, seed = 1 }) {
  const n = SR * DURATION;
  const out = new Float32Array(n);
  let rnd = seed;
  const noise = () => { rnd = (rnd * 16807) % 2147483647; return (rnd / 2147483647) * 2 - 1; };
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    // 整体包络：2s 淡入、1.5s 淡出
    const env = Math.min(1, t / 2) * Math.min(1, Math.max(0, (DURATION - t) / 1.5));
    let v = 0;
    freqs.forEach((f, k) => {
      const detune = 1 + 0.0015 * Math.sin(2 * Math.PI * (0.07 + k * 0.03) * t);
      v += Math.sin(2 * Math.PI * f * detune * t + k) / (k + 1.6);
    });
    // 极轻的低频脉动 + 噪声底
    const pulse = 1 + 0.12 * Math.sin(2 * Math.PI * lfo * t);
    v = v * 0.42 * pulse + noise() * 0.006;
    out[i] = v * env * gain;
  }
  return out;
}

const PRESET = { freqs: [110, 164.81, 220, 329.63], lfo: 0.16, gain: 0.36, seed: 7 };

async function main() {
  const name = process.argv[2] || 'test-tone.wav';
  if (/[\\/]/.test(name)) throw new Error('文件名不能包含路径分隔符');
  await fs.mkdir(OUT_DIR, { recursive: true });
  const buf = wav(render(PRESET));
  const out = path.join(OUT_DIR, name);
  await fs.writeFile(out, buf);
  console.log(`✓ 已生成 ${name}  ${(buf.length / 1024).toFixed(0)} KB  ${DURATION}s`);
  console.log(`\n输出目录：${OUT_DIR}`);
  console.log('\n接着在 src/config/site.config.js 里启用它：');
  console.log(`  export const PLAYLIST = [
    { id: 'tr-01', title: '测试音', artist: 'me', src: 'assets/audio/${name}', cover: '', tags: ['test'] },
  ];`);
}

main().catch((e) => { console.error(e); process.exit(1); });
