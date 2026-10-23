/**
 * views/vocal-remove.js — 去人声 / 提取纯伴奏（TOOLS 板块里的一个页签）
 * ==================================================================
 * 放进一首歌 → 抽掉正中间的人声 → 试听 → 导出 WAV / MP3。
 * 全程在浏览器里跑，文件不上传，也没有后端可上传。
 *
 * 两种做法：
 *   · 快速 / 精细 —— M/S 中置抵消（所有卡拉 OK 机都是这个做法），免费、瞬时；
 *     缺点也写清楚：混响、双轨、偏一点的人声拿不掉。
 *   · AI 分轨 —— UVR 的 MDX-Net 模型（64MB，随站点一起发）在浏览器里用
 *     ONNX Runtime Web 推理。第一次慢，但干净得多；模型按需加载，音频不上传。
 *
 * 页面分三段：
 *   01 音源    解码 + 看一眼左右声道（相关系数 / 中置占比）
 *   02 怎么分  快速 / 精细 / AI 分轨 + 对应参数
 *   03 试听    原曲 / 纯伴奏 / 人声（残留）三选一，波形对比，导出
 *
 * 交互上两个约定：
 *   · 快速模式参数一松手就重算（几毫秒），精细模式必须按「重新分离」（几秒）；
 *   · 试听走 WebAudio 的 BufferSource，不生成临时 WAV —— 换 A/B 时从同一个位置接着放。
 */

import { esc } from '../util/dom.js';
import { Toast } from '../ui/toast.js';
import { viewhead } from '../ui/bits.js';
import { toolsTabs } from '../ui/tools-tabs.js';
import { decodeAudio, toWav, encodeMp3, audioCtx, fmtTime } from '../plugins/tools/audio.js';
import { analyze, separate } from '../plugins/tools/vocal.js';
import { AI_MODEL, ensureModel, separateFile as separateWithAI, aiReady } from '../plugins/tools/ai-separator.js';
import { humanSize } from '../plugins/tools/index.js';

const MAX_SECONDS = 10 * 60;         // 10 分钟以上就不要在浏览器里玩了（解码后的内存是每秒 384KB）
const LONG_SECONDS = 6 * 60;         // 超过 6 分钟提示精细模式会久
const ACCEPT = '.mp3,.m4a,.aac,.wav,.ogg,.oga,.flac,.webm,.opus,audio/*';

const state = {
  status: 'idle',        // idle | loading | ready | working | error
  file: null,
  buffer: null,          // AudioBuffer（原始）
  info: null,            // analyze() 结果
  error: '',
  progress: 0,

  method: 'spectral',    // fast | spectral | ai
  strength: 0.9,         // 0..1
  bassHz: 150,
  autoGain: true,

  // AI 分轨：模型按需下载 / 本地文件可选，进度单独记
  ai: {
    stage: 'idle',       // idle | download | load | demix | write | decode | ready | error
    loaded: 0,
    total: AI_MODEL.bytes,
    fraction: 0,
    chunk: 0,
    totalChunks: 0,
    localFile: null,
    localName: '',
    cached: false,
    error: '',
    ms: 0,
  },
  workText: '',

  result: null,          // { l, r, gain, ms, method, strength, bassHz, autoGain }
  instBuffer: null,      // 伴奏 AudioBuffer（试听 / 导出）
  vocalBuffer: null,     // 被抽掉的人声（懒生成）

  source: 'inst',        // orig | inst | vocal
  position: 0,
  playing: false,
  mp3Busy: false,
};

let runToken = 0;
let ctx = null;
let srcNode = null;
let startedAt = 0;
let rafId = 0;
let ro = null;
/** 重绘整块的入口，mount 时注入（loadFile / run 在 mount 外面） */
let repaintView = () => {};

/* ---------------- 小工具 ---------------- */

const pct = (v) => `${Math.round(v * 100)}%`;

function outName(ext) {
  const base = String(state.file?.name || 'audio').replace(/\.[^.]+$/, '') || 'audio';
  return `${base} (instrumental).${ext}`;
}

function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

function makeBuffer(l, r, rate) {
  const buf = new AudioBuffer({ length: l.length, numberOfChannels: 2, sampleRate: rate });
  buf.copyToChannel(l, 0);
  buf.copyToChannel(r, 1);
  return buf;
}

function audioDuration() {
  return state.buffer ? state.buffer.duration : 0;
}

const methodLabel = (m) => (m === 'ai' ? 'AI · MDX-Net' : m === 'spectral' ? '精细（频域）' : '快速（相位）');

const modelKey = () => (state.ai.localFile ? state.ai.localName : 'builtin');

function isStale() {
  const r = state.result;
  if (!r) return false;
  if (r.method === 'ai' || state.method === 'ai') {
    return r.method !== state.method || (r.method === 'ai' && r.modelKey !== modelKey());
  }
  return r.method !== state.method || r.strength !== state.strength
    || r.bassHz !== state.bassHz || r.autoGain !== state.autoGain;
}

/* ---------------- 播放 ---------------- */

function ensureCtx() {
  if (!ctx || ctx.state === 'closed') ctx = audioCtx();
  return ctx;
}

function stopNode() {
  if (!srcNode) return;
  const node = srcNode;
  srcNode = null;
  node.onended = null;
  try { node.stop(); } catch { /* 已经停了 */ }
  try { node.disconnect(); } catch { /* 已经断开 */ }
}

function currentBuffer() {
  if (!state.buffer) return null;
  if (state.source === 'orig') return state.buffer;
  if (state.source === 'vocal') return vocalBuffer();
  return state.instBuffer || state.buffer;
}

/** 被抽掉的那部分 = 原曲 − 伴奏（伴奏可能做过等响增益，先除回去） */
function vocalBuffer() {
  if (state.vocalBuffer) return state.vocalBuffer;
  if (!state.result || !state.buffer) return null;
  const n = Math.min(state.buffer.length, state.result.l.length);
  const gain = state.result.gain || 1;
  const origL = state.buffer.getChannelData(0);
  const origR = state.buffer.numberOfChannels > 1 ? state.buffer.getChannelData(1) : origL;
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    l[i] = origL[i] - state.result.l[i] / gain;
    r[i] = origR[i] - state.result.r[i] / gain;
  }
  state.vocalBuffer = makeBuffer(l, r, state.buffer.sampleRate);
  return state.vocalBuffer;
}

function paintPlayer() {
  const root = document.getElementById('view');
  if (!root) return;
  const play = root.querySelector('#vrPlay');
  if (play) {
    play.textContent = state.playing ? '❚❚' : '▶';
    play.setAttribute('aria-label', state.playing ? '暂停' : '播放');
    play.classList.toggle('is-playing', state.playing);
  }
  const seek = root.querySelector('#vrSeek');
  const dragging = seek?.dataset.dragging === '1';
  const time = root.querySelector('#vrTime');
  if (time && !dragging) time.textContent = `${fmtTime(state.position)} / ${fmtTime(audioDuration())}`;
  if (seek && !dragging) {
    seek.value = String(Math.round((state.position / Math.max(0.001, audioDuration())) * 1000));
  }
}

function paintProgress() {
  const root = document.getElementById('view');
  const seek = root?.querySelector('#vrSeek');
  // 用户正拖着进度条：别用播放位置把手柄抢回去
  if (!seek || seek.dataset.dragging === '1') return;
  const time = root.querySelector('#vrTime');
  if (time) time.textContent = `${fmtTime(state.position)} / ${fmtTime(audioDuration())}`;
  seek.value = String(Math.round((state.position / Math.max(0.001, audioDuration())) * 1000));
}

/* ---------------- 进度（快速 / 精细 / AI 共用一条） ---------------- */

function aiPercent() {
  const a = state.ai;
  if (a.stage === 'download') return a.total ? 0.4 * (a.loaded / a.total) : 0;
  if (a.stage === 'load') return 0.45;
  if (a.stage === 'demix') return 0.45 + 0.5 * Math.max(0, Math.min(1, a.fraction || 0));
  if (a.stage === 'write') return 0.95 + 0.03 * (a.fraction || 0);
  if (a.stage === 'decode') return 0.99;
  return 0;
}

function aiProgressText() {
  const a = state.ai;
  if (a.stage === 'download') {
    const p = a.total ? Math.round((a.loaded / a.total) * 100) : 0;
    const head = a.cached ? '读取缓存的模型' : a.localName ? '读取本地模型' : '下载模型';
    return `${head}… ${p}%${a.total ? `（${humanSize(a.loaded)} / ${humanSize(a.total)}）` : ''}`;
  }
  if (a.stage === 'load') return '加载模型… 第一次会慢一点';
  if (a.stage === 'demix') {
    return `AI 分离中… ${Math.round((a.fraction || 0) * 100)}%`
      + `${a.totalChunks ? `（第 ${a.chunk}/${a.totalChunks} 段）` : ''}`;
  }
  if (a.stage === 'write') return '写出音轨…';
  if (a.stage === 'decode') return '解码结果…';
  return 'AI 分离…';
}

function paintWork() {
  const bar = document.querySelector('#vrProgressBar i');
  const text = document.querySelector('#vrProgressText');
  const ai = state.method === 'ai';
  const ratio = ai ? aiPercent() : state.progress;
  if (bar) bar.style.width = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
  if (text) text.textContent = ai ? aiProgressText() : (state.workText || '分离中…');
}

function updateAiProgress(p) {
  const a = state.ai;
  if (p.stage === 'download') {
    a.stage = 'download';
    a.loaded = Number(p.loaded) || 0;
    a.total = Number(p.total) || a.total;
    a.cached = !!p.cached;
  } else if (p.stage === 'ready') {
    a.stage = 'ready';
  } else if (p.stage) {
    a.stage = p.stage;
    if (Number.isFinite(p.fraction)) a.fraction = p.fraction;
    if (p.chunk) a.chunk = p.chunk;
    if (p.totalChunks) a.totalChunks = p.totalChunks;
  }
  paintWork();
}

function tick() {
  cancelAnimationFrame(rafId);
  const step = () => {
    if (!state.playing || !ctx) return;
    const dur = audioDuration();
    state.position = Math.min(dur, Math.max(0, ctx.currentTime - startedAt));
    paintProgress();
    if (state.position >= dur - 0.02) { pause(); return; }
    rafId = requestAnimationFrame(step);
  };
  rafId = requestAnimationFrame(step);
}

async function play() {
  if (!state.buffer || !state.result) return;
  const buf = currentBuffer();
  if (!buf) return;
  const c = ensureCtx();
  try { if (c.state === 'suspended') await c.resume(); } catch { /* 用户手势之外，交给下一次点击 */ }
  stopNode();
  const offset = Math.min(Math.max(0, state.position), Math.max(0, buf.duration - 0.03));
  const node = c.createBufferSource();
  node.buffer = buf;
  node.connect(c.destination);
  node.start(0, offset);
  srcNode = node;
  startedAt = c.currentTime - offset;
  state.playing = true;
  state.position = offset;
  node.onended = () => {
    if (srcNode !== node) return;
    srcNode = null;
    state.playing = false;
    state.position = audioDuration();
    paintPlayer();
  };
  paintPlayer();
  tick();
}

function pause() {
  if (state.playing && ctx) {
    state.position = Math.min(audioDuration(), Math.max(0, ctx.currentTime - startedAt));
  }
  state.playing = false;
  stopNode();
  cancelAnimationFrame(rafId);
  paintPlayer();
}

async function togglePlay() {
  if (state.playing) pause();
  else await play();
}

function seekTo(ratio) {
  if (!state.buffer) return;
  const was = state.playing;
  stopNode();
  cancelAnimationFrame(rafId);
  state.playing = false;
  state.position = Math.max(0, Math.min(1, ratio)) * audioDuration();
  paintPlayer();
  if (was) play();
}

/* ---------------- 分离 ---------------- */

async function run({ quiet = false } = {}) {
  if (!state.buffer || state.status === 'working') return;
  if (state.method === 'ai') { await runAI({ quiet }); return; }
  const token = ++runToken;
  const buffer = state.buffer;
  const method = state.method;
  const strength = state.strength;
  const bassHz = state.bassHz;
  const autoGain = state.autoGain;

  pause();
  state.status = 'working';
  state.progress = 0;
  state.error = '';
  state.workText = '';
  repaintView();

  const t0 = performance.now();
  try {
    const l = buffer.getChannelData(0);
    const r = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : l;
    const res = await separate(l, r, {
      method, strength, bassHz, autoGain, sampleRate: buffer.sampleRate,
      onProgress: (p) => {
        if (token !== runToken) return;
        state.progress = p;
        state.workText = `${method === 'spectral' ? '精细分离' : '快速分离'}中… ${Math.round(p * 100)}%`
          + ` · 已用 ${((performance.now() - t0) / 1000).toFixed(1)}s`;
        paintWork();
      },
    });
    if (token !== runToken) return;

    state.result = { ...res, strength, bassHz, autoGain };
    state.instBuffer = makeBuffer(res.l, res.r, buffer.sampleRate);
    state.vocalBuffer = null;
    state.position = Math.min(state.position, buffer.duration);
    state.status = 'ready';
    repaintView();
    if (!quiet) {
      const secs = (res.ms / 1000).toFixed(res.ms < 950 ? 2 : 1);
      Toast.ok(`分离完成 · ${methodLabel(method)} · ${secs}s`);
    }
  } catch (err) {
    if (token !== runToken) return;
    state.status = 'ready';
    state.error = String(err?.message || err);
    repaintView();
    Toast.err(`分离失败：${state.error}`);
  }
}

/* ---------------- AI 分轨 ---------------- */

async function runAI({ quiet = false } = {}) {
  if (!state.buffer || !state.file || state.status === 'working') return;
  const token = ++runToken;
  pause();
  state.status = 'working';
  state.error = '';
  state.workText = '';
  state.ai = {
    ...state.ai,
    stage: 'download',
    loaded: 0,
    total: state.ai.localFile ? state.ai.localFile.size : AI_MODEL.bytes,
    fraction: 0,
    chunk: 0,
    totalChunks: 0,
    cached: false,
    error: '',
  };
  repaintView();

  const t0 = performance.now();
  try {
    await ensureModel({
      localFile: state.ai.localFile,
      onProgress: (p) => { if (token === runToken) updateAiProgress(p); },
    });
    if (token !== runToken) return;

    const res = await separateWithAI(state.file, {
      onProgress: (p) => { if (token === runToken) updateAiProgress(p); },
    });
    if (token !== runToken) return;

    const l = res.instrumental.getChannelData(0);
    const r = res.instrumental.numberOfChannels > 1 ? res.instrumental.getChannelData(1) : l;
    state.result = {
      l, r, gain: 1, method: 'ai', model: AI_MODEL.name, modelKey: modelKey(),
      ms: res.ms, strength: 1, bassHz: 0, autoGain: false,
    };
    state.instBuffer = res.instrumental;
    state.vocalBuffer = res.vocals;
    state.ai.stage = 'ready';
    state.ai.ms = res.ms;
    state.status = 'ready';
    state.position = Math.min(state.position, state.buffer.duration);
    repaintView();
    if (!quiet) Toast.ok(`AI 分轨完成 · ${(res.ms / 1000).toFixed(1)}s`);
  } catch (err) {
    if (token !== runToken) return;
    state.status = 'ready';
    state.ai.stage = 'error';
    state.ai.error = String(err?.message || err);
    state.error = state.ai.error;
    repaintView();
    Toast.err(`AI 分轨失败：${state.ai.error}`);
  }
}

/* ---------------- 载入 ---------------- */

async function loadFile(file) {
  if (!file) return;
  const isAudio = /^audio\//i.test(file.type || '') || /\.(mp3|m4a|aac|wav|ogg|oga|flac|webm|opus)$/i.test(file.name || '');
  if (!isAudio) { Toast.err('这不是音频文件。放一首歌进来吧。'); return; }

  pause();
  runToken++;
  state.status = 'loading';
  state.file = file;
  state.buffer = null;
  state.info = null;
  state.result = null;
  state.instBuffer = null;
  state.vocalBuffer = null;
  state.error = '';
  state.position = 0;
  state.source = 'inst';
  state.ai.stage = 'idle';
  state.ai.error = '';
  repaintView();

  try {
    const buffer = await decodeAudio(file);
    if (buffer.duration > MAX_SECONDS) {
      throw new Error(`这首 ${fmtTime(buffer.duration)}，超过 ${MAX_SECONDS / 60} 分钟。在浏览器里分离这么长的音频不划算，先剪一段吧。`);
    }
    if (!buffer.numberOfChannels || buffer.length < 1000) throw new Error('这个文件里没有可用的音频。');
    state.buffer = buffer;
    const left = buffer.getChannelData(0);
    const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
    state.info = analyze(left, right);
    state.status = 'ready';
    repaintView();
    if (buffer.duration >= LONG_SECONDS) {
      Toast.show(`这首 ${fmtTime(buffer.duration)}，精细模式会慢一些；赶时间就切「快速」。`);
    }
    // AI 模式不自动跑：下载/推理都很重，得让用户自己按
    if (state.method === 'ai') { repaintView(); return; }
    await run();
  } catch (err) {
    state.status = 'error';
    state.error = String(err?.message || err);
    repaintView();
    Toast.err(state.error);
  }
}

/* ---------------- 视图 ---------------- */

function dropZone(compact = false) {
  return `<div class="tool-drop vr-drop${compact ? ' vr-drop--compact' : ''}" id="vrDrop" tabindex="0" role="button" aria-label="选择或拖入音频文件">
    <span class="tool-drop__ico">♪</span>
    <b>${compact ? '换一首' : '把音乐拖到这里'}</b>
    <span class="mono faint">${compact ? '也可以点一下重新选' : 'MP3 · M4A · WAV · FLAC · OGG · 不上传、不落盘'}</span>
    <span class="btn btn--sm">选择文件</span>
    <input type="file" id="vrInput" accept="${ACCEPT}" hidden />
  </div>`;
}

function stepsHTML() {
  return `<div class="vr-steps">
    <div class="vr-step"><span class="vr-step__no mono">01</span><b>解码到内存</b><span class="faint">浏览器自己解，文件不上传</span></div>
    <div class="vr-step"><span class="vr-step__no mono">02</span><b>抽掉正中间</b><span class="faint">M/S 中置抵消，伴奏留在两侧</span></div>
    <div class="vr-step"><span class="vr-step__no mono">03</span><b>试听 / 导出</b><span class="faint">原曲、伴奏、人声残留随时切</span></div>
  </div>`;
}

function noteHTML() {
  return `<details class="tool-note vr-note">
    <summary>它做不到什么（先说清楚，免得白等）</summary>
    <div class="tool-note__body">
      <p class="faint" style="font-size:var(--fs-2xs);line-height:1.9;margin:0">
        <b>M/S 模式只对立体声有效。</b>原理是把左右声道里「一模一样」的部分压掉 —— 主唱通常摆在正中间，
        所以会一起消失。左右完全相同（单声道）的文件没有人声可以抵消，结果只会接近静音。<br>
        <b>M/S 会削掉正中间的乐器。</b>底鼓、贝斯、军鼓、部分钢琴经常也在正中；
        「低频保护」只把低频补回来，中频的军鼓救不了。<br>
        <b>M/S 的极限就在这里。</b>混响、双轨人声、稍微偏一点的人声都会留在伴奏里，
        再怎么拉滑杆也拿不掉 —— 要更干净就切「AI 分轨」。它用 UVR 的 MDX-Net 模型在本机推理，
        模型约 64MB（第一次从本站下载），音频不上传；首次分离要几分钟，手机可能吃力。
        模型权重来自 UVR 社区，商用请自行确认授权。<br>
        <b>不上传。</b>解码、计算、导出都在这台设备的浏览器里完成，关掉页面就没了。
      </p>
    </div>
  </details>`;
}

function fileHTML() {
  const b = state.buffer;
  const info = state.info || {};
  const warn = info.mono
    ? `<p class="vr-warn">左右声道几乎一样（相关 ${info.correlation.toFixed(3)}）。${
      state.method === 'ai'
        ? 'AI 分轨仍可尝试；快速 / 精细模式没有人声可抵消，结果会接近静音。'
        : '快速 / 精细模式没有人声可抵消，结果会接近静音；可以切「AI 分轨」试试。'
    }</p>`
    : '';
  return `<div class="vr-file">
    <div class="vr-file__main">
      <b class="clamp-1">${esc(state.file?.name || '')}</b>
      <span class="mono faint">${humanSize(state.file?.size || 0)} · ${fmtTime(b.duration)} · ${b.sampleRate} Hz · ${b.numberOfChannels}ch</span>
    </div>
    <div class="vr-stats mono">
      <span><em>中置</em>${pct(info.centerRatio || 0)}</span>
      <span><em>两侧</em>${pct(info.width || 0)}</span>
      <span><em>相关</em>${Number(info.correlation || 0).toFixed(2)}</span>
    </div>
  </div>${warn}`;
}

function progressBlock() {
  if (state.status !== 'working') return '';
  const ratio = state.method === 'ai' ? aiPercent() : state.progress;
  const text = state.method === 'ai' ? aiProgressText() : (state.workText || '分离中…');
  return `<div class="vr-progress" id="vrProgress">
    <span class="vr-progress__bar" id="vrProgressBar"><i style="width:${Math.round(ratio * 100)}%"></i></span>
    <span class="mono faint" id="vrProgressText">${esc(text)}</span>
  </div>`;
}

function aiControlsHTML(working, stale) {
  const a = state.ai;
  const gpu = typeof navigator !== 'undefined' && !!navigator.gpu;
  const runLabel = working ? '分离中…' : state.result ? '重新 AI 分离' : '开始 AI 分离';
  return `<div class="vr-ai">
    <div class="vr-ai__head">
      <b>${esc(AI_MODEL.name)}</b>
      <span class="mono faint">${humanSize(AI_MODEL.bytes)} · MDX-Net · 本地推理</span>
      <span class="mono faint">${gpu ? 'WebGPU 可用' : 'WASM（较慢）'}</span>
    </div>
    <p class="mono faint vr-hint">第一次用会从本站下载模型（只下一次，之后存在浏览器缓存里）。模型在你的设备上跑，音频不上传；分离要几分钟到几十分钟，看设备，慢是正常的。</p>
    ${gpu ? '' : '<p class="vr-warn">这个浏览器没有 WebGPU，只能用单线程 WASM：3 分钟的歌可能要几十分钟。换 Chrome / Edge（WebGPU）会快好几倍。</p>'}
    <div class="tool-actions">
      <label class="btn btn--sm">选择本地模型<input type="file" id="vrModelFile" accept=".onnx,application/octet-stream" hidden ${working ? 'disabled' : ''} /></label>
      ${a.localName ? `<button class="btn btn--sm" id="vrModelClear" ${working ? 'disabled' : ''}>用回站内模型</button>` : ''}
      <span class="mono faint" id="vrModelName">${esc(a.localName ? `本地：${a.localName}` : aiReady() ? '站内模型 · 已加载' : '站内模型')}</span>
      <span class="grow"></span>
      <button class="btn btn--signal" id="vrRun" ${working ? 'disabled' : ''}>${runLabel}</button>
    </div>
    ${progressBlock()}
    ${stale ? '<p class="vr-stale">换了模型或做法，点「重新 AI 分离」才会生效。</p>' : ''}
    ${a.error || state.error ? `<p class="vr-error">${esc(a.error || state.error)}</p>` : ''}
  </div>`;
}

function controlsHTML() {
  const working = state.status === 'working';
  const stale = isStale();
  const ai = state.method === 'ai';
  return `<div class="tool-opts tool-opts--wrap">
      <span class="k-label">做法</span>
      <button class="chip${state.method === 'fast' ? ' is-on' : ''}" data-method="fast" ${working ? 'disabled' : ''}>快速 · 相位抵消</button>
      <button class="chip${state.method === 'spectral' ? ' is-on' : ''}" data-method="spectral" ${working ? 'disabled' : ''}>精细 · 频域压制</button>
      <button class="chip${ai ? ' is-on' : ''}" data-method="ai" ${working ? 'disabled' : ''}>AI 分轨 · 模型</button>
    </div>
    <p class="mono faint vr-hint">${
      ai
        ? 'M/S 只搬得走正中间的声音；混响、双轨、偏一点的人声都会留下。AI 分轨用 MDX-Net 模型，干净得多，代价是首次下载模型 + 慢。'
        : state.method === 'spectral'
          ? '逐频点只压中置成分，更干净，代价是要算几秒（约每 10 秒音频 1 秒）。'
          : '整段中置一起压，几乎瞬时；裙边会漏一点人声，适合先听个大概。'
    }</p>

    ${ai ? aiControlsHTML(working, stale) : `
      <div class="vr-sliders">
        <label class="vr-slider">
          <span class="vr-slider__head"><span class="k-label">人声抑制</span><em class="mono" id="vrStrengthVal">${pct(state.strength)}</em></span>
          <input type="range" id="vrStrength" min="0" max="100" step="5" value="${Math.round(state.strength * 100)}" ${working ? 'disabled' : ''} />
          <span class="faint">100% = 把中置压到只剩低频；调低会故意留一点人声，听起来没那么空。</span>
        </label>
        <label class="vr-slider">
          <span class="vr-slider__head"><span class="k-label">低频保护</span><em class="mono" id="vrBassVal">${state.bassHz} Hz</em></span>
          <input type="range" id="vrBass" min="0" max="400" step="10" value="${state.bassHz}" ${working ? 'disabled' : ''} />
          <span class="faint">这段频率以下原样保留，贝斯和底鼓不会跟着人声一起消失。0 = 不保护。</span>
        </label>
      </div>

      <div class="tool-opts">
        <label class="tool-opt"><input type="checkbox" id="vrAutoGain" ${state.autoGain ? 'checked' : ''} ${working ? 'disabled' : ''} /> 自动增益（对齐原曲音量）</label>
        <span class="grow"></span>
        <button class="btn btn--signal" id="vrRun" ${working ? 'disabled' : ''}>${working ? '分离中…' : state.result || stale ? '重新分离' : '开始分离'}</button>
      </div>
      ${progressBlock()}
      ${stale ? '<p class="vr-stale">参数变了，点「重新分离」才会生效。</p>' : ''}
      ${state.error ? `<p class="vr-error">${esc(state.error)}</p>` : ''}
    `}`;
}

function playerHTML() {
  const r = state.result;
  if (!r) return '';
  const ai = r.method === 'ai';
  const stale = isStale();
  const gainDb = !ai && Math.abs(r.gain - 1) > 0.01 ? `${(20 * Math.log10(r.gain)).toFixed(1)} dB` : '';
  const wavBytes = 44 + state.instBuffer.length * 2 * 2;
  const vocalLabel = ai ? '人声' : '人声残留';
  const srcTag = { orig: '原曲', inst: '纯伴奏', vocal: vocalLabel }[state.source] || '纯伴奏';
  const head = ai
    ? `AI · ${esc(r.model || AI_MODEL.name)} · ${(r.ms / 1000).toFixed(1)}s`
    : `${methodLabel(r.method)} · ${(r.ms / 1000).toFixed(r.ms < 950 ? 2 : 1)}s${gainDb ? ` · 增益 ${gainDb}` : ''}`;
  return `<div class="panel" data-reveal>
    <div class="panel__head">
      <span class="panel__title">03 / 试听与导出</span>
      <span class="mono faint">${head}${stale ? ' · 参数已改' : ''}</span>
    </div>
    <div class="panel__body grid" style="gap:var(--sp-4)">
      <canvas class="vr-wave" id="vrWave" height="96" aria-label="原曲与伴奏的波形对比"></canvas>
      <div class="vr-player">
        <button class="vr-play" id="vrPlay" aria-label="${state.playing ? '暂停' : '播放'}">${state.playing ? '❚❚' : '▶'}</button>
        <div class="vr-player__main">
          <div class="vr-player__meta">
            <span class="mono" id="vrTime">${fmtTime(state.position)} / ${fmtTime(audioDuration())}</span>
            <span class="mono faint">正在听：${srcTag}</span>
          </div>
          <input type="range" class="vr-seek" id="vrSeek" min="0" max="1000" step="1" value="${Math.round((state.position / Math.max(0.001, audioDuration())) * 1000)}" aria-label="播放进度" />
        </div>
        <div class="vr-ab">
          <button class="chip${state.source === 'orig' ? ' is-on' : ''}" data-source="orig">原曲</button>
          <button class="chip${state.source === 'inst' ? ' is-on' : ''}" data-source="inst">纯伴奏</button>
          <button class="chip${state.source === 'vocal' ? ' is-on' : ''}" data-source="vocal">${vocalLabel}</button>
        </div>
      </div>
      <div class="tool-actions">
        <button class="btn btn--signal" id="vrWav" ${state.status === 'working' ? 'disabled' : ''}>导出 WAV</button>
        <button class="btn" id="vrMp3" ${state.status === 'working' || state.mp3Busy ? 'disabled' : ''}>${state.mp3Busy ? '编码中…' : '导出 MP3'}</button>
        <select class="tool-select" id="vrKbps" style="flex:0 0 120px" aria-label="MP3 码率">
          <option value="128">128 kbps</option>
          <option value="192" selected>192 kbps</option>
          <option value="320">320 kbps</option>
        </select>
        <span class="grow"></span>
        <span class="mono faint">WAV 约 ${humanSize(wavBytes)}</span>
      </div>
      <p class="mono faint vr-hint">结果只活在这个页面里，刷新就没了。导出的文件在浏览器下载目录。</p>
    </div>
  </div>`;
}

function bodyHTML() {
  if (state.status === 'loading') {
    return `<div class="panel" data-reveal>
      <div class="panel__head"><span class="panel__title">01 / 音源</span></div>
      <div class="panel__body"><p class="mono faint" style="margin:0">解码中… 大文件需要一两秒。</p></div>
    </div>`;
  }

  if (state.status === 'error' && !state.buffer) {
    return `<div class="panel" data-reveal>
      <div class="panel__head"><span class="panel__title">01 / 音源</span><span class="mono faint">FAILED</span></div>
      <div class="panel__body grid" style="gap:var(--sp-4)">
        <p class="vr-error" style="margin:0">${esc(state.error)}</p>
        ${dropZone(false)}
        ${noteHTML()}
      </div>
    </div>`;
  }

  if (!state.buffer) {
    return `<div class="panel" data-reveal>
      <div class="panel__head">
        <span class="panel__title">01 / 音源</span>
        <span class="mono faint">全在本地 · 不上传</span>
      </div>
      <div class="panel__body grid" style="gap:var(--sp-4)">
        ${dropZone(false)}
        ${stepsHTML()}
        ${noteHTML()}
      </div>
    </div>`;
  }

  return `<div class="panel" data-reveal>
      <div class="panel__head"><span class="panel__title">01 / 音源</span><span class="mono faint">${esc((state.file?.type || 'audio').replace(/^audio\//, '').toUpperCase() || 'AUDIO')}</span></div>
      <div class="panel__body grid" style="gap:var(--sp-3)">
        ${dropZone(true)}
        ${fileHTML()}
      </div>
    </div>

    <div class="panel" data-reveal>
      <div class="panel__head">
        <span class="panel__title">02 / 怎么分</span>
        <span class="mono faint">${state.method === 'ai' ? 'MDX-Net · 浏览器本地推理' : 'M/S 中置处理 · 不靠模型'}</span>
      </div>
      <div class="panel__body grid" style="gap:var(--sp-3)">
        ${controlsHTML()}
      </div>
    </div>

    ${playerHTML()}

    ${noteHTML()}`;
}

/* ---------------- 波形 ---------------- */

/**
 * 每个像素列取 (L+R)/2 的峰值。
 * 长音频有上千万个采样，逐点扫会把重绘拖到几百毫秒；每列最多抽 32 个点就够了，
 * 波形看的是形状，不是精确峰值。
 */
function envelope(l, r, cols) {
  const out = new Float32Array(cols);
  const n = Math.min(l.length, r ? r.length : l.length);
  const step = n / cols;
  for (let c = 0; c < cols; c++) {
    const a = Math.floor(c * step);
    const b = Math.min(n, Math.max(a + 1, Math.floor((c + 1) * step)));
    const inc = Math.max(1, Math.floor((b - a) / 32));
    let p = 0;
    for (let i = a; i < b; i += inc) {
      const v = Math.abs((l[i] + (r ? r[i] : l[i])) / 2);
      if (v > p) p = v;
    }
    out[c] = p;
  }
  return out;
}

/** 把 CSS 变量解析成 canvas 认得的颜色（--fg-faint 是 var(--ink-40)，直接塞给 fillStyle 无效） */
function cssColor(name, fallback) {
  const probe = document.createElement('span');
  probe.style.cssText = `color:var(${name});position:absolute;visibility:hidden;pointer-events:none`;
  document.body.append(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  return c || fallback;
}

function drawWave(canvas) {
  if (!canvas || !state.buffer || !state.result) return;
  const w = Math.max(240, canvas.clientWidth || 640);
  const h = 96;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const g = canvas.getContext('2d');
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  const faint = cssColor('--fg-faint', '#8a8a8a');
  const signal = cssColor('--signal', '#e5be00');
  const grid = getComputedStyle(document.documentElement).getPropertyValue('--grid-line').trim() || 'rgba(0,0,0,.1)';

  const buf = state.buffer;
  const origL = buf.getChannelData(0);
  const origR = buf.numberOfChannels > 1 ? buf.getChannelData(1) : origL;
  const cols = Math.max(80, Math.floor(w));
  const top = envelope(origL, origR, cols);
  const bottom = envelope(state.result.l, state.result.r, cols);

  const lane = (env, y0, hgt, color) => {
    const mid = y0 + hgt / 2;
    const amp = hgt / 2 - 3;
    g.fillStyle = color;
    g.globalAlpha = 0.9;
    for (let x = 0; x < cols; x++) {
      const v = Math.min(1, env[x] || 0);
      const bar = Math.max(0.6, v * amp);
      g.fillRect(x, mid - bar, 1, bar * 2);
    }
    g.globalAlpha = 1;
    g.fillStyle = grid;
    g.fillRect(0, Math.round(mid), w, 1);
  };

  lane(top, 0, h / 2, faint);
  lane(bottom, h / 2, h / 2, signal);

  g.font = '9px ui-monospace, monospace';
  g.fillStyle = faint;
  g.fillText('原曲', 6, 12);
  g.fillStyle = signal;
  g.fillText('伴奏', 6, h / 2 + 12);
}

/* ---------------- 视图接口 ---------------- */

export default {
  id: 'vocal-remove',
  title: '去人声',

  render() {
    return `${viewhead({
      title: 'VOCAL REMOVER',
      sub: '放进一首歌，把人声抽走，留下伴奏。M/S 秒出，AI 分轨更干净；全程在浏览器里跑，文件不上传。',
      idx: 'TOOLS / VOCAL',
      meta: [
        { label: 'METHOD', value: 'M/S + AI' },
        { label: 'UPLOAD', value: 'NONE' },
        { label: 'RUNTIME', value: 'BROWSER' },
      ],
    })}
    ${toolsTabs('vocal')}
    <div id="vrBody" class="vr" style="display:grid;gap:var(--sp-4)">${bodyHTML()}</div>`;
  },

  mount(root) {
    const body = () => root.querySelector('#vrBody');
    const repaint = () => {
      const b = body();
      if (!b) return;
      b.innerHTML = bodyHTML();
      bindDrop();
      paintPlayer();
      requestAnimationFrame(() => drawWave(root.querySelector('#vrWave')));
    };
    repaintView = repaint;      // loadFile / run 在 mount 外，靠它重绘

    /* 拖放 / 选择文件（每次重绘后重新绑定，旧节点会被丢掉） */
    function bindDrop() {
      const zone = root.querySelector('#vrDrop');
      if (!zone) return;
      const input = zone.querySelector('input[type=file]');
      zone.addEventListener('click', (e) => { if (e.target !== input) input?.click(); });
      zone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input?.click(); }
      });
      input?.addEventListener('change', () => {
        const f = input.files?.[0];
        input.value = '';
        if (f) loadFile(f);
      });
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('is-over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('is-over');
        const f = e.dataTransfer?.files?.[0];
        if (f) loadFile(f);
      });
    }

    /* ---- 点击 ---- */
    root.addEventListener('click', async (e) => {
      const method = e.target.closest('[data-method]');
      if (method && !method.disabled) {
        const m = method.dataset.method;
        if (m === state.method) return;
        state.method = m;
        state.ai.error = '';
        // AI 不自动跑：下载模型 / 推理都很重，得让用户自己按
        if (m === 'fast') run({ quiet: true });
        else repaint();
        return;
      }

      if (e.target.closest('#vrModelClear')) {
        state.ai.localFile = null;
        state.ai.localName = '';
        state.ai.stage = 'idle';
        state.ai.error = '';
        repaint();
        return;
      }

      const src = e.target.closest('[data-source]');
      if (src) {
        const s = src.dataset.source;
        if (s === state.source) return;
        const was = state.playing;
        pause();
        state.source = s;
        repaint();
        if (was) play();
        return;
      }

      if (e.target.closest('#vrRun')) { run(); return; }
      if (e.target.closest('#vrPlay')) { await togglePlay(); return; }

      if (e.target.closest('#vrWav')) {
        if (!state.instBuffer || state.status === 'working') return;
        const blob = toWav(state.instBuffer);
        saveBlob(blob, outName('wav'));
        Toast.ok(`WAV 已导出（${humanSize(blob.size)}）`);
        return;
      }

      if (e.target.closest('#vrMp3')) {
        if (!state.instBuffer || state.mp3Busy || state.status === 'working') return;
        const kbps = Number(root.querySelector('#vrKbps')?.value || 192);
        state.mp3Busy = true;
        const btn = e.target.closest('#vrMp3');
        if (btn) { btn.disabled = true; btn.textContent = '编码中…'; }
        try {
          const blob = await encodeMp3(state.instBuffer, kbps);
          saveBlob(blob, outName('mp3'));
          Toast.ok(`MP3 已导出（${humanSize(blob.size)} · ${kbps}kbps）`);
        } catch (err) {
          Toast.err(String(err?.message || err));
        } finally {
          state.mp3Busy = false;
          repaint();
        }
      }
    });

    /* ---- 滑杆：拖动时只改数字，松手才重算 ---- */
    root.addEventListener('input', (e) => {
      if (e.target.id === 'vrStrength') {
        state.strength = Number(e.target.value) / 100;
        const v = root.querySelector('#vrStrengthVal');
        if (v) v.textContent = pct(state.strength);
      } else if (e.target.id === 'vrBass') {
        state.bassHz = Number(e.target.value);
        const v = root.querySelector('#vrBassVal');
        if (v) v.textContent = `${state.bassHz} Hz`;
      } else if (e.target.id === 'vrSeek') {
        e.target.dataset.dragging = '1';
        state.position = (Number(e.target.value) / 1000) * audioDuration();
        const t = root.querySelector('#vrTime');
        if (t) t.textContent = `${fmtTime(state.position)} / ${fmtTime(audioDuration())}`;
      }
    });

    root.addEventListener('change', (e) => {
      if (e.target.id === 'vrModelFile') {
        const f = e.target.files?.[0];
        if (!f) return;
        state.ai.localFile = f;
        state.ai.localName = f.name;
        state.ai.stage = 'idle';
        state.ai.error = '';
        e.target.value = '';
        repaint();
        Toast.ok(`已选择本地模型：${f.name}`);
        return;
      }
      if (e.target.id === 'vrStrength' || e.target.id === 'vrBass') {
        if (state.method === 'fast') run({ quiet: true });
        else repaint();
      } else if (e.target.id === 'vrAutoGain') {
        state.autoGain = !!e.target.checked;
        if (state.method === 'fast') run({ quiet: true });
        else repaint();
      } else if (e.target.id === 'vrSeek') {
        delete e.target.dataset.dragging;
        seekTo(Number(e.target.value) / 1000);
      }
    });

    /* ---- 波形随窗口走（盯容器，画布是重绘时才出现的） ---- */
    try {
      ro = new ResizeObserver(() => {
        const c = root.querySelector('#vrWave');
        if (c) requestAnimationFrame(() => drawWave(c));
      });
      const box = body();
      if (box) ro.observe(box);
    } catch { /* 旧浏览器没有 ResizeObserver，波形只是不跟随缩放 */ }

    bindDrop();
    paintPlayer();
    requestAnimationFrame(() => drawWave(root.querySelector('#vrWave')));

    return () => {
      pause();
      ro?.disconnect();
      ro = null;
      repaintView = () => {};
      runToken++;
      // 分离到一半被路由带走了：别让状态卡在 working，下次进来还能按
      if (state.status === 'working') {
        state.status = state.buffer ? 'ready' : 'idle';
        state.progress = 0;
      }
    };
  },
};
