/**
 * views/audio-extract.js — 视频提取音频（TOOLS 板块里的一个页签）
 * ------------------------------------------------------------------
 * 能做什么：把视频文件里的**音轨**解出来，导出 WAV 或 MP3。全程在浏览器里跑，文件不上传 ✓
 *
 * 为什么 MP3 要额外引库：
 *   · 浏览器**能解码**音轨（`AudioContext.decodeAudioData` 支持 mp4/webm/mov 里的音轨 ✓）
 *   · 但浏览器**没有 MP3 编码器** ✗（MediaRecorder 只会 webm/opus、ogg，Safari 是 m4a/aac）
 *   · 所以 MP3 走 lamejs（MIT，`assets/vendor/lame.min.js`），**按需加载** ✓：
 *     只在真的点"导出 MP3"时才把 150KB 的库拉进来，不拖慢首屏 ✓
 *   · 没有这个库时按钮照常可按，但会给出人话提示 —— 不静默失败 ✓
 *
 * 限制写在界面上：只提**音轨**（不转视频）；容器是否可解取决于浏览器 ✓
 */

import { esc } from '../util/dom.js';
import { Toast } from '../ui/toast.js';
import { viewhead } from '../ui/bits.js';

const LAME_SRC = 'assets/vendor/lame.min.js';

/** 按需加载 lamejs（window.lamejs）✓ */
let lamePromise = null;
function loadLame() {
  if (window.lamejs) return Promise.resolve(window.lamejs);
  if (lamePromise) return lamePromise;
  lamePromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = LAME_SRC;
    s.onload = () => (window.lamejs ? resolve(window.lamejs) : reject(new Error('库加载了但没挂上 window.lamejs')));
    s.onerror = () => reject(new Error('没找到 assets/vendor/lame.min.js'));
    document.head.append(s);
  });
  return lamePromise;
}

/** Float32 [-1,1] → Int16 ✓ */
function floatTo16(f32) {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return out;
}

/** AudioBuffer → WAV（16-bit PCM，零依赖 ✓） */
function encodeWav(buf) {
  const ch = buf.numberOfChannels;
  const len = buf.length;
  const bytes = 44 + len * ch * 2;
  const ab = new ArrayBuffer(bytes);
  const v = new DataView(ab);
  const w = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, bytes - 8, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, buf.sampleRate, true); v.setUint32(28, buf.sampleRate * ch * 2, true);
  v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, len * ch * 2, true);
  const chans = [];
  for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c));
  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}

/** AudioBuffer → MP3（lamejs，16-bit PCM ✓） */
async function encodeMp3(buf, kbps) {
  const lame = await loadLame();
  const ch = Math.min(2, buf.numberOfChannels);
  const enc = new lame.Mp3Encoder(ch, buf.sampleRate, kbps);
  const left = floatTo16(buf.getChannelData(0));
  const right = ch > 1 ? floatTo16(buf.getChannelData(1)) : null;
  const chunks = [];
  const STEP = 1152;
  for (let i = 0; i < left.length; i += STEP) {
    const l = left.subarray(i, i + STEP);
    const r = right ? right.subarray(i, i + STEP) : null;
    const out = ch > 1 ? enc.encodeBuffer(l, r) : enc.encodeBuffer(l);
    if (out.length) chunks.push(new Uint8Array(out));
  }
  const tail = enc.flush();
  if (tail.length) chunks.push(new Uint8Array(tail));
  return new Blob(chunks, { type: 'audio/mpeg' });
}

const human = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

let decoded = null;   // { buffer, name, size }

function statusHTML() {
  if (!decoded) {
    return '<p class="mono" style="font-size:var(--fs-2xs);color:var(--fg-soft)">还没有载入视频。选一个文件 → 解析 → 导出。</p>';
  }
  const { buffer, name, size } = decoded;
  const secs = buffer.duration.toFixed(1);
  return `<div class="mono" style="font-size:var(--fs-2xs);color:var(--fg-soft);line-height:1.9">
    <b style="color:var(--fg)">${esc(name)}</b> · 原文件 ${human(size)}<br>
    时长 ${secs}s · 采样率 ${buffer.sampleRate} Hz · 声道 ${buffer.numberOfChannels}<br>
    WAV 预计 ${human(44 + buffer.length * buffer.numberOfChannels * 2)}
  </div>
  <audio id="aePreview" controls src="${esc(window.__aeUrl || '')}" style="width:100%;margin-top:var(--sp-2)"></audio>`;
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export default {
  id: 'audio-extract',
  title: '视频提取音频',

  render() {
    return `${viewhead({
      title: 'EXTRACT AUDIO',
      sub: '把视频里的音轨提出来，导出 WAV 或 MP3。全程在浏览器里跑，文件不上传；能不能解这个容器取决于浏览器。',
      idx: 'TOOLS / AUDIO',
    })}
    <div class="mr-tabs" role="tablist" aria-label="工具">
      <a class="mr-tab" href="#/tools">工具台</a>
      <a class="mr-tab" href="#/tools?tab=tier">Tier List</a>
      <a class="mr-tab is-on" href="#/tools?tab=audio" role="tab" aria-selected="true">提取音频</a>
    </div>
    <div class="mr-card" style="display:grid;gap:var(--sp-3)">
      <div class="mr-row">
        <label class="btn btn--sm">选择视频<input type="file" id="aeFile" accept="video/*,audio/*" hidden /></label>
        <span class="mono" style="font-size:var(--fs-2xs);color:var(--fg-faint)">mp4 / webm / mov · 只提音轨，不转视频</span>
      </div>
      <div id="aeInfo">${statusHTML()}</div>
      <div class="mr-row">
        <button class="btn btn--sm" id="aeWav" disabled>导出 WAV</button>
        <button class="btn btn--sm btn--signal" id="aeMp3" disabled>导出 MP3</button>
        <select id="aeKbps" class="mr-input mono" style="flex:0 0 120px" aria-label="MP3 码率">
          <option value="128">128 kbps</option>
          <option value="192" selected>192 kbps</option>
          <option value="320">320 kbps</option>
        </select>
      </div>
      <p class="mono" style="font-size:var(--fs-2xs);color:var(--fg-faint)">
        MP3 需要 <code>assets/vendor/lame.min.js</code>（MIT）。没有这个文件时 WAV 照样能用 ✓
      </p>
    </div>`;
  },

  mount(root) {
    const info = root.querySelector('#aeInfo');
    const repaint = () => { if (info) info.innerHTML = statusHTML(); };
    const setEnabled = (on) => {
      const w = root.querySelector('#aeWav');
      const m = root.querySelector('#aeMp3');
      if (w) w.disabled = !on;
      if (m) m.disabled = !on;
    };

    root.addEventListener('change', async (e) => {
      const file = e.target.closest('#aeFile')?.files?.[0];
      if (!file) return;
      try {
        const ab = await file.arrayBuffer();
        const AC = window.AudioContext || window.webkitAudioContext;
        const ctx = new AC();
        const buffer = await ctx.decodeAudioData(ab.slice(0));
        ctx.close?.();
        decoded = { buffer, name: file.name, size: file.size };
        if (window.__aeUrl) URL.revokeObjectURL(window.__aeUrl);
        window.__aeUrl = URL.createObjectURL(new Blob([ab], { type: file.type || 'video/mp4' }));
        repaint();
        setEnabled(true);
        Toast.ok('音轨已解析，可以导出了');
      } catch (err) {
        decoded = null;
        setEnabled(false);
        repaint();
        Toast.show('这个文件解不了：多数是容器/编码不被浏览器支持，或视频里没有音轨', 'err');
      }
    });

    root.addEventListener('click', async (e) => {
      if (!decoded) return;
      if (e.target.closest('#aeWav')) {
        const btn = e.target.closest('#aeWav');
        btn.disabled = true; btn.textContent = '生成中…';
        const blob = encodeWav(decoded.buffer);
        download(blob, decoded.name.replace(/\.[^.]+$/, '') + '.wav');
        btn.disabled = false; btn.textContent = '导出 WAV';
        Toast.ok(`WAV 已导出（${human(blob.size)}）`);
        return;
      }
      if (e.target.closest('#aeMp3')) {
        const btn = e.target.closest('#aeMp3');
        const kbps = Number(root.querySelector('#aeKbps')?.value || 192);
        btn.disabled = true; btn.textContent = '编码中…';
        try {
          const blob = await encodeMp3(decoded.buffer, kbps);
          download(blob, decoded.name.replace(/\.[^.]+$/, '') + '.mp3');
          Toast.ok(`MP3 已导出（${human(blob.size)} · ${kbps}kbps）`);
        } catch (err) {
          Toast.show(String(err?.message || err), 'err');
        } finally {
          btn.disabled = false; btn.textContent = '导出 MP3';
        }
      }
    });

    return () => {
      if (window.__aeUrl) { URL.revokeObjectURL(window.__aeUrl); window.__aeUrl = ''; }
    };
  },
};
