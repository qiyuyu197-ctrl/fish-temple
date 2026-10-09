/**
 * plugins/tools/audio.js — 音频解码 / WAV 导出 / 实时重编码（零依赖）
 * ==================================================================
 * 能做什么、为什么：
 *
 *   · **解码**：`decodeAudioData` 支持浏览器所有能解的格式（mp3 / m4a(aac) / wav /
 *     ogg / flac / webm…）—— 这是"读"这一侧的能力。
 *   · **WAV 导出**：纯计算 + 手写 RIFF 头，任意格式 → wav 都是瞬时完成。
 *   · **m4a / webm 导出**：浏览器没有离线 AAC/Opus 编码器，但 `MediaRecorder` 能录
 *     一条媒体流。做法是把解码后的音频送进 `MediaStreamAudioDestinationNode`，
 *     边"播"边录 —— 于是**耗时 ≈ 音频时长**（实时）。这也是唯一不引入第三方编码器
 *     的办法。m4a 是否可用取决于浏览器（Chrome 实测支持 audio/mp4）。
 *   · **mp3 导出**：做不到。MP3 编码器（LAME 之类）是第三方二进制，本项目零依赖，
 *     所以工具里明确不提供，而不是给一个假按钮。
 */

/** 可用的录音编码（按浏览器能力探测，顺序即推荐顺序） */
export function supportedEncoders() {
  const list = [
    { mime: 'audio/mp4', ext: 'm4a', label: 'M4A (AAC)', realtime: true },
    { mime: 'audio/webm;codecs=opus', ext: 'webm', label: 'WEBM (Opus)', realtime: true },
  ];
  const ok = (t) => { try { return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t); } catch { return false; } };
  return list.filter((x) => ok(x.mime));
}

let sharedCtx = null;
const ctxOf = () => {
  if (!sharedCtx || sharedCtx.state === 'closed') sharedCtx = new (window.AudioContext || window.webkitAudioContext)();
  return sharedCtx;
};

/**
 * 解码音频文件。
 * @param {File|Blob} file
 * @returns {Promise<AudioBuffer>}
 */
export async function decodeAudio(file) {
  const buf = await file.arrayBuffer();
  const ctx = ctxOf();
  return new Promise((res, rej) => {
    // 回调版兼容性最好（Promise 版在部分版本里不返回）
    const p = ctx.decodeAudioData(buf, res, (e) => rej(new Error(`解码失败：${e?.message || '浏览器不支持这个音频格式'}`)));
    if (p && typeof p.then === 'function') p.then(res).catch(() => {});
  });
}

/** AudioBuffer → 16bit PCM WAV */
export function toWav(buffer) {
  const channels = Math.min(2, buffer.numberOfChannels);
  const frames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = frames * blockAlign;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);                   // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const chans = [];
  for (let c = 0; c < channels; c++) chans.push(buffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([out], { type: 'audio/wav' });
}

/**
 * 用 MediaRecorder 实时重编码。
 * @param {AudioBuffer} buffer
 * @param {{mime?:string, bitrate?:number, onProgress?:(p:number)=>void, maxSeconds?:number}} opts
 * @returns {Promise<Blob>}
 */
export async function encodeRealtime(buffer, { mime = 'audio/mp4', bitrate = 192000, onProgress, maxSeconds = 900 } = {}) {
  const encoders = supportedEncoders();
  if (!encoders.some((e) => e.mime === mime)) {
    throw new Error(`当前浏览器不支持录制 ${mime}`);
  }
  if (buffer.duration > maxSeconds) {
    throw new Error(`实时重编码耗时≈音频时长，超过 ${Math.round(maxSeconds / 60)} 分钟的素材请先裁剪`);
  }

  const ctx = ctxOf();
  if (ctx.state === 'suspended') await ctx.resume();
  const dest = ctx.createMediaStreamDestination();
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(dest);

  const rec = new MediaRecorder(dest.stream, { mimeType: mime, audioBitsPerSecond: bitrate });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

  const done = new Promise((res, rej) => {
    rec.onstop = () => res(new Blob(chunks, { type: mime }));
    rec.onerror = (e) => rej(new Error(`录音失败：${e?.error?.name || 'unknown'}`));
  });

  let raf = 0;
  const tick = () => {
    if (typeof onProgress === 'function') {
      onProgress(Math.max(0, Math.min(1, ctx.currentTime - startedAt) / buffer.duration));
    }
    raf = requestAnimationFrame(tick);
  };
  const startedAt = ctx.currentTime + 0.05;

  rec.start();
  src.start(startedAt);
  src.onended = () => { setTimeout(() => rec.state !== 'inactive' && rec.stop(), 120); };
  tick();

  const blob = await done;
  cancelAnimationFrame(raf);
  src.disconnect();
  dest.disconnect();
  if (typeof onProgress === 'function') onProgress(1);
  return new Blob([blob], { type: mime });
}

/** 秒 → 0:00 */
export const fmtTime = (s) => {
  const n = Math.max(0, Number(s) || 0);
  const m = Math.floor(n / 60);
  return `${m}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
};

export const AudioTools = { decodeAudio, toWav, encodeRealtime, supportedEncoders, fmtTime };
export default AudioTools;
