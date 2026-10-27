/**
 * views/vocal-remove.js — 分离纯音乐 / 人声（TOOLS 板块里的一个页签）
 * ==================================================================
 * 放进一首歌 → 分出「纯音乐」和「人声」两条轨 → 试听 / 导出。
 * 全程在浏览器里跑，文件不上传。
 *
 * 只有 AI 分轨这一种做法（M/S 已移除）：
 *   · 伴奏专精：UVR-MDX-NET-Inst_HQ_3
 *   · 人声专精：Kim_Vocal_2
 *   · 双模型：伴奏取 Inst、人声取 Kim；再用伴奏当参照做「人声残留清理」
 *
 * 模型不进仓库，发布在 GitHub Release（tag model-v1）；页面从同源
 * /model/<文件名> 取（本地 server.mjs / Netlify redirects 代理）。
 */

import { esc } from '../util/dom.js';
import { Toast } from '../ui/toast.js';
import { viewhead } from '../ui/bits.js';
import { toolsTabs } from '../ui/tools-tabs.js';
import { decodeAudio, toWav, encodeMp3, audioCtx, fmtTime } from '../plugins/tools/audio.js';
import { cancelBleed } from '../plugins/tools/bleed.js';
import { restoreAir } from '../plugins/tools/air.js';
import {
  AI_MODELS, AI_MODES, ensureModel, separateFile as separateWithAI, separateDual, aiReady,
} from '../plugins/tools/ai-separator.js';
import { humanSize } from '../plugins/tools/index.js';

const MAX_SECONDS = 10 * 60;
const LONG_SECONDS = 6 * 60;
const ACCEPT = '.mp3,.m4a,.aac,.wav,.ogg,.oga,.flac,.webm,.opus,audio/*';

const state = {
  status: 'idle',        // idle | loading | ready | working | error
  file: null,
  buffer: null,
  error: '',

  ai: {
    mode: 'inst',        // inst | vocal | dual
    stage: 'idle',       // idle | download | load | demix | write | decode | clean | ready | error
    loaded: 0,
    total: AI_MODELS.inst.bytes,
    fraction: 0,
    part: 1,
    parts: 1,
    modelShort: '',
    chunk: 0,
    totalChunks: 0,
    localFile: null,
    localName: '',
    localFor: '',
    clean: 1,
    air: 0.8,
    modelInst: null,
    rawInst: null,
    rawVocal: null,
    cleanProgress: 0,
    cached: false,
    error: '',
    ms: 0,
  },

  result: null,          // { l, r, method, model, aiMode, modelKey, ms }
  instBuffer: null,
  vocalBuffer: null,

  source: 'inst',        // orig | inst | vocal
  exportSource: 'inst',  // inst | vocal
  position: 0,
  playing: false,
  mp3Busy: false,
};

let runToken = 0;
let cleanSeq = 0;
let ctx = null;
let srcNode = null;
let startedAt = 0;
let rafId = 0;
let ro = null;
let repaintView = () => {};

/* ---------------- 小工具 ---------------- */

const pct = (v) => `${Math.round(v * 100)}%`;

function outName(ext) {
  const base = String(state.file?.name || 'audio').replace(/\.[^.]+$/, '') || 'audio';
  const kind = state.exportSource === 'vocal' ? 'vocals' : 'instrumental';
  return `${base} (${kind}).${ext}`;
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

const aiModeOf = (id) => AI_MODES[id] || AI_MODES.inst;
const modelKey = () => `${state.ai.mode}:${state.ai.localFile ? state.ai.localName : 'builtin'}`;

function isStale() {
  const r = state.result;
  if (!r) return false;
  return r.aiMode !== state.ai.mode || r.modelKey !== modelKey();
}

function exportBuffer() {
  return state.exportSource === 'vocal' ? state.vocalBuffer : state.instBuffer;
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
  if (state.source === 'vocal') return state.vocalBuffer;
  return state.instBuffer || state.buffer;
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
  if (!seek || seek.dataset.dragging === '1') return;
  const time = root.querySelector('#vrTime');
  if (time) time.textContent = `${fmtTime(state.position)} / ${fmtTime(audioDuration())}`;
  seek.value = String(Math.round((state.position / Math.max(0.001, audioDuration())) * 1000));
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
  if (!state.buffer) return;
  const buf = currentBuffer();
  if (!buf) return;
  const c = ensureCtx();
  try { if (c.state === 'suspended') await c.resume(); } catch { /* 等下一次点击 */ }
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

/* ---------------- 进度 ---------------- */

function aiPercent() {
  const a = state.ai;
  const part = Math.max(1, a.part || 1);
  const parts = Math.max(1, a.parts || 1);
  const within = (v) => Math.max(0, Math.min(1, v || 0));
  if (a.stage === 'download') return 0.35 * ((part - 1) + (a.total ? a.loaded / a.total : 0)) / parts;
  if (a.stage === 'load') return 0.35 + 0.1 * (part / parts);
  if (a.stage === 'demix') return 0.45 + 0.5 * ((part - 1) + within(a.fraction)) / parts;
  if (a.stage === 'write') return 0.95 + 0.03 * within(a.fraction);
  if (a.stage === 'decode') return 0.98;
  if (a.stage === 'clean') return 0.98 + 0.015 * within(a.cleanProgress);
  return 0;
}

function aiProgressText() {
  const a = state.ai;
  const which = a.modelShort ? `${a.modelShort} · ` : '';
  const partText = a.parts > 1 ? `（模型 ${a.part}/${a.parts}）` : '';
  if (a.stage === 'download') {
    const p = a.total ? Math.round((a.loaded / a.total) * 100) : 0;
    const head = a.cached ? '读取缓存的模型' : a.localName ? '读取本地模型' : '下载模型';
    return `${which}${head}… ${p}%${a.total ? `（${humanSize(a.loaded)} / ${humanSize(a.total)}）` : ''}${partText}`;
  }
  if (a.stage === 'load') return `${which}加载模型… 第一次会慢一点${partText}`;
  if (a.stage === 'demix') {
    return `${which}分离中… ${Math.round((a.fraction || 0) * 100)}%`
      + `${a.totalChunks ? `（第 ${a.chunk}/${a.totalChunks} 段）` : ''}${partText}`;
  }
  if (a.stage === 'write') return `${which}写出音轨…`;
  if (a.stage === 'decode') return `${which}解码结果…`;
  if (a.stage === 'clean') return `清理人声残留… ${Math.round((a.cleanProgress || 0) * 100)}%`;
  return 'AI 分离…';
}

function paintWork() {
  const bar = document.querySelector('#vrProgressBar i');
  const text = document.querySelector('#vrProgressText');
  const ratio = aiPercent();
  if (bar) bar.style.width = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
  if (text) text.textContent = aiProgressText();
}

function updateAiProgress(p) {
  const a = state.ai;
  if (p.modelShort) a.modelShort = p.modelShort;
  if (p.part) a.part = p.part;
  if (p.parts) a.parts = p.parts;
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

/* ---------------- 人声残留清理 ---------------- */

async function applyClean() {
  const rawV = state.ai.rawVocal;
  const rawI = state.ai.rawInst;
  if (!rawV || !rawI || state.ai.mode !== 'dual') return;
  const seq = ++cleanSeq;
  const token = runToken;
  const strength = Math.max(0, Math.min(1, state.ai.clean));

  if (strength <= 0) {
    if (token !== runToken || seq !== cleanSeq) return;
    state.vocalBuffer = rawV;
    state.ai.stage = 'ready';
    state.ai.cleanProgress = 0;
    state.status = 'ready';
    repaintView();
    return;
  }

  state.status = 'working';
  state.ai.stage = 'clean';
  state.ai.cleanProgress = 0;
  repaintView();
  try {
    const vL = rawV.getChannelData(0);
    const vR = rawV.numberOfChannels > 1 ? rawV.getChannelData(1) : vL;
    const iL = rawI.getChannelData(0);
    const iR = rawI.numberOfChannels > 1 ? rawI.getChannelData(1) : iL;
    const out = await cancelBleed([vL, vR], [iL, iR], {
      strength,
      sampleRate: rawV.sampleRate,
      onProgress: (p) => {
        if (token !== runToken || seq !== cleanSeq) return;
        state.ai.cleanProgress = p;
        paintWork();
      },
    });
    if (token !== runToken || seq !== cleanSeq) return;
    state.vocalBuffer = makeBuffer(out.l, out.r, rawV.sampleRate);
    state.ai.cleanProgress = 1;
    state.ai.stage = 'ready';
    state.status = 'ready';
    repaintView();
  } catch (err) {
    if (token !== runToken || seq !== cleanSeq) return;
    state.status = 'ready';
    state.ai.stage = 'ready';
    state.error = `人声残留清理失败：${err?.message || err}`;
    repaintView();
    Toast.err(state.error);
  }
}

/* ---------------- 高频修复 ---------------- */

/** 用原曲的 4kHz 以上补回模型伴奏被削掉的高频；只重算 DSP，不重跑模型 */
function applyAir({ paint = true } = {}) {
  const raw = state.ai.modelInst;
  if (!raw) return;
  const mode = state.ai.mode;
  const s = mode === 'vocal' ? 0 : Math.max(0, Math.min(1, state.ai.air));
  const was = state.playing && state.source === 'inst';
  let next = raw;
  if (s > 0 && state.buffer) {
    const l = raw.getChannelData(0);
    const r = raw.numberOfChannels > 1 ? raw.getChannelData(1) : l;
    const orig = state.buffer;
    const oL = orig.getChannelData(0);
    const oR = orig.numberOfChannels > 1 ? orig.getChannelData(1) : oL;
    const out = restoreAir([l, r], [oL, oR], { strength: s, sampleRate: raw.sampleRate });
    next = makeBuffer(out.l, out.r, raw.sampleRate);
    if (state.result) { state.result.l = out.l; state.result.r = out.r; }
  } else if (state.result) {
    const l = raw.getChannelData(0);
    const r = raw.numberOfChannels > 1 ? raw.getChannelData(1) : l;
    state.result.l = l;
    state.result.r = r;
  }
  state.instBuffer = next;
  if (was) { pause(); play(); }
  if (paint) repaintView();
}

/* ---------------- AI 分轨 ---------------- */

async function runAI({ quiet = false } = {}) {
  if (!state.buffer || !state.file || state.status === 'working') return;
  const token = ++runToken;
  const mode = state.ai.mode;
  const modeDef = aiModeOf(mode);
  const models = modeDef.models;
  const localFile = mode === 'dual' || state.ai.localFor !== mode ? null : state.ai.localFile;

  pause();
  state.status = 'working';
  state.error = '';
  state.ai = {
    ...state.ai,
    stage: 'download',
    loaded: 0,
    total: localFile ? localFile.size : AI_MODELS[models[0]].bytes,
    fraction: 0,
    part: 1,
    parts: models.length,
    modelShort: AI_MODELS[models[0]].short,
    chunk: 0,
    totalChunks: 0,
    cached: false,
    error: '',
  };
  repaintView();

  const t0 = performance.now();
  try {
    for (let i = 0; i < models.length; i++) {
      if (token !== runToken) return;
      const name = models[i];
      state.ai.part = i + 1;
      state.ai.parts = models.length;
      updateAiProgress({
        stage: 'download', modelShort: AI_MODELS[name].short, part: i + 1, parts: models.length,
      });
      await ensureModel({
        model: name,
        localFile,
        onProgress: (p) => {
          if (token === runToken) updateAiProgress({ ...p, part: i + 1, parts: models.length });
        },
      });
    }
    if (token !== runToken) return;

    let res;
    if (mode === 'dual') {
      res = await separateDual(state.file, {
        onProgress: (p) => { if (token === runToken) updateAiProgress(p); },
      });
    } else {
      res = await separateWithAI(state.file, {
        model: mode,
        onProgress: (p) => { if (token === runToken) updateAiProgress({ ...p, part: 1, parts: 1 }); },
      });
    }
    if (token !== runToken) return;

    const l = res.instrumental.getChannelData(0);
    const r = res.instrumental.numberOfChannels > 1 ? res.instrumental.getChannelData(1) : l;
    state.result = {
      l, r, method: 'ai',
      model: mode === 'dual' ? '双模型' : AI_MODELS[mode].name,
      aiMode: mode, modelKey: modelKey(),
      ms: res.ms,
    };
    state.instBuffer = res.instrumental;
    state.ai.modelInst = res.instrumental;
    if (mode === 'dual') {
      state.ai.rawInst = res.instrumental;
      state.ai.rawVocal = res.vocals;
      state.vocalBuffer = res.vocals;
      state.source = 'inst';
      await applyClean();
    } else {
      state.ai.rawInst = null;
      state.ai.rawVocal = null;
      state.vocalBuffer = res.vocals;
      state.source = mode === 'vocal' ? 'vocal' : 'inst';
    }
    applyAir({ paint: false });
    state.ai.stage = 'ready';
    state.ai.ms = res.ms;
    state.status = 'ready';
    state.position = Math.min(state.position, state.buffer.duration);
    repaintView();
    if (!quiet) {
      Toast.ok(`分离完成 · ${modeDef.label.replace(/（.*?）/g, '')} · ${(res.ms / 1000).toFixed(1)}s`);
    }
  } catch (err) {
    if (token !== runToken) return;
    state.status = 'ready';
    state.ai.stage = 'error';
    state.ai.error = String(err?.message || err);
    state.error = state.ai.error;
    repaintView();
    Toast.err(`分离失败：${state.ai.error}`);
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
  state.result = null;
  state.instBuffer = null;
  state.vocalBuffer = null;
  state.error = '';
  state.position = 0;
  state.source = 'inst';
  state.ai.stage = 'idle';
  state.ai.error = '';
  state.ai.modelInst = null;
  state.ai.rawInst = null;
  state.ai.rawVocal = null;
  state.ai.cleanProgress = 0;
  repaintView();

  try {
    const buffer = await decodeAudio(file);
    if (buffer.duration > MAX_SECONDS) {
      throw new Error(`这首 ${fmtTime(buffer.duration)}，超过 ${MAX_SECONDS / 60} 分钟。在浏览器里分离这么长的音频不划算，先剪一段吧。`);
    }
    if (!buffer.numberOfChannels || buffer.length < 1000) throw new Error('这个文件里没有可用的音频。');
    state.buffer = buffer;
    state.status = 'ready';
    repaintView();
    if (buffer.duration >= LONG_SECONDS) {
      Toast.show(`这首 ${fmtTime(buffer.duration)}，双模型会比较久；赶时间可以先用「伴奏优先」。`);
    }
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
    <div class="vr-step"><span class="vr-step__no mono">01</span><b>放入音乐</b><span class="faint">解码到内存，文件不上传</span></div>
    <div class="vr-step"><span class="vr-step__no mono">02</span><b>AI 分离</b><span class="faint">伴奏 / 人声 / 双模型</span></div>
    <div class="vr-step"><span class="vr-step__no mono">03</span><b>试听 / 导出</b><span class="faint">纯音乐、人声，WAV / MP3</span></div>
  </div>`;
}

function noteHTML() {
  return `<details class="tool-note vr-note">
    <summary>它做不到什么（先说清楚，免得白等）</summary>
    <div class="tool-note__body">
      <p class="faint" style="font-size:var(--fs-2xs);line-height:1.9;margin:0">
        <b>不是 Demucs 那种顶级分离。</b>两份 MDX-Net 在浏览器里跑，双模型已经比单模型干净很多，
        但复杂混音、极端混响、合唱重叠仍可能有残留。<br>
        <b>伴奏优先 / 人声优先只跑一份模型。</b>另一条轨是它的残差：伴奏优先的人声可能带音乐，
        人声优先的伴奏可能带人声。要两条都干净就选双模型。<br>
        <b>人声残留清理是 DSP。</b>它只减掉和人声轨里与伴奏相干的部分；完全不相干的残留无能为力。
        默认 100%，觉得人声变薄就调低。<br>
        <b>高频修复是从原曲借的。</b>MDX 会削掉 4kHz 以上的器乐高频，导出会糊；
        补回来更亮，但可能带回一点人声齿音/气声。默认 80%，觉得刺就调低。<br>
        <b>慢。</b>双模型要两份模型、各跑一遍；首次还要下载约 128MB。手机可能吃力。<br>
        <b>不上传。</b>解码、推理、导出都在这台设备的浏览器里完成。
      </p>
    </div>
  </details>`;
}

function fileHTML() {
  const b = state.buffer;
  return `<div class="vr-file">
    <div class="vr-file__main">
      <b class="clamp-1">${esc(state.file?.name || '')}</b>
      <span class="mono faint">${humanSize(state.file?.size || 0)} · ${fmtTime(b.duration)} · ${b.sampleRate} Hz · ${b.numberOfChannels}ch</span>
    </div>
  </div>`;
}

function progressBlock() {
  if (state.status !== 'working') return '';
  const ratio = aiPercent();
  return `<div class="vr-progress" id="vrProgress">
    <span class="vr-progress__bar" id="vrProgressBar"><i style="width:${Math.round(ratio * 100)}%"></i></span>
    <span class="mono faint" id="vrProgressText">${esc(aiProgressText())}</span>
  </div>`;
}

function aiControlsHTML(working, stale) {
  const a = state.ai;
  const modeDef = aiModeOf(a.mode);
  const defs = modeDef.models.map((m) => AI_MODELS[m]);
  const gpu = typeof navigator !== 'undefined' && !!navigator.gpu;
  const runLabel = working ? '分离中…' : state.result && !stale ? '重新分离' : '开始分离';
  const totalBytes = defs.reduce((n, d) => n + d.bytes, 0);
  const loadedAll = modeDef.models.every((m) => aiReady(m));
  const second = a.localName ? `本地：${a.localName}` : `${defs.map((d) => d.name).join(' + ')}${loadedAll ? ' · 已加载' : ''}`;
  return `<div class="vr-ai">
    <div class="tool-opts tool-opts--wrap">
      <span class="k-label">输出</span>
      ${Object.values(AI_MODES).map((m) => `<button class="chip${a.mode === m.id ? ' is-on' : ''}" data-aimode="${m.id}" ${working ? 'disabled' : ''}>${m.label}</button>`).join('')}
    </div>
    <p class="mono faint vr-hint">${modeDef.hint}</p>
    ${a.mode === 'dual' ? `<label class="vr-slider">
      <span class="vr-slider__head"><span class="k-label">人声残留清理</span><em class="mono" id="vrCleanVal">${Math.round(a.clean * 100)}%</em></span>
      <input type="range" id="vrClean" min="0" max="100" step="5" value="${Math.round(a.clean * 100)}" ${working ? 'disabled' : ''} />
      <span class="faint">用伴奏模型当参照，减掉人声里和伴奏相干的部分。0 = 关；默认 100%，觉得人声变薄就调低。</span>
    </label>` : ''}
    ${a.mode !== 'vocal' ? `<label class="vr-slider">
      <span class="vr-slider__head"><span class="k-label">高频修复</span><em class="mono" id="vrAirVal">${Math.round(a.air * 100)}%</em></span>
      <input type="range" id="vrAir" min="0" max="100" step="5" value="${Math.round(a.air * 100)}" ${working ? 'disabled' : ''} />
      <span class="faint">MDX 会削掉 4k 以上的器乐高频，导出会糊；从原曲补回来。可能带回一点齿音，觉得刺就调低。</span>
    </label>` : ''}
    <div class="vr-ai__head">
      <b>${esc(defs.map((d) => d.name).join(' + '))}</b>
      <span class="mono faint">${humanSize(totalBytes)} · MDX-Net · 本地推理</span>
      <span class="mono faint">${gpu ? 'WebGPU 可用' : 'WASM（较慢）'}</span>
    </div>
    <p class="mono faint vr-hint">第一次用会从本站下载模型（单模型约 64MB，双模型约 128MB；只下一次，之后存在浏览器缓存里）。模型在你的设备上跑，音频不上传；分离要几分钟到几十分钟，看设备。</p>
    ${gpu ? '' : '<p class="vr-warn">这个浏览器没有 WebGPU，只能用单线程 WASM：3 分钟的歌可能要几十分钟。换 Chrome / Edge（WebGPU）会快好几倍。</p>'}
    <div class="tool-actions">
      ${a.mode === 'dual'
        ? '<span class="mono faint">双模型使用站内两份模型；要用本地模型请切「伴奏优先 / 人声优先」</span>'
        : `<label class="btn btn--sm">选择本地模型<input type="file" id="vrModelFile" accept=".onnx,application/octet-stream" hidden ${working ? 'disabled' : ''} /></label>
           ${a.localName ? `<button class="btn btn--sm" id="vrModelClear" ${working ? 'disabled' : ''}>用回站内模型</button>` : ''}
           <span class="mono faint" id="vrModelName">${esc(second)}</span>`}
      <span class="grow"></span>
      <button class="btn btn--signal" id="vrRun" ${working ? 'disabled' : ''}>${runLabel}</button>
    </div>
    ${progressBlock()}
    ${stale ? '<p class="vr-stale">换了模型或输出方式，点「重新分离」才会生效。</p>' : ''}
    ${a.error || state.error ? `<p class="vr-error">${esc(a.error || state.error)}</p>` : ''}
  </div>`;
}

function controlsHTML() {
  return aiControlsHTML(state.status === 'working', isStale());
}

function playerHTML() {
  const r = state.result;
  if (!r) return '';
  const mode = aiModeOf(r.aiMode);
  const stale = isStale();
  const buf = exportBuffer();
  const wavBytes = buf ? 44 + buf.length * 2 * 2 : 0;
  const vocalLabel = r.aiMode === 'inst' ? '人声（残差）' : r.aiMode === 'dual' && state.ai.clean > 0 ? '人声（已清理）' : '人声';
  const instLabel = r.aiMode === 'vocal' ? '伴奏（残差）' : '纯音乐';
  const srcTag = { orig: '原曲', inst: instLabel, vocal: vocalLabel }[state.source] || instLabel;
  const cleanTag = r.aiMode === 'dual' && state.ai.clean > 0 ? ` · 去残留 ${Math.round(state.ai.clean * 100)}%` : '';
  const airTag = r.aiMode !== 'vocal' && state.ai.air > 0 ? ` · 补高频 ${Math.round(state.ai.air * 100)}%` : '';
  const head = `AI · ${esc(mode?.short || r.model || 'MDX-Net')} · ${(r.ms / 1000).toFixed(1)}s${cleanTag}${airTag}`;
  return `<div class="panel" data-reveal>
    <div class="panel__head">
      <span class="panel__title">03 / 试听与导出</span>
      <span class="mono faint">${head}${stale ? ' · 参数已改' : ''}</span>
    </div>
    <div class="panel__body grid" style="gap:var(--sp-4)">
      <canvas class="vr-wave" id="vrWave" height="96" aria-label="原曲与纯音乐的波形对比"></canvas>
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
          <button class="chip${state.source === 'inst' ? ' is-on' : ''}" data-source="inst">${instLabel}</button>
          <button class="chip${state.source === 'vocal' ? ' is-on' : ''}" data-source="vocal">${vocalLabel}</button>
        </div>
      </div>
      <div class="tool-actions">
        <select class="tool-select" id="vrExport" style="flex:0 0 132px" aria-label="导出哪条轨">
          <option value="inst"${state.exportSource === 'inst' ? ' selected' : ''}>纯音乐</option>
          <option value="vocal"${state.exportSource === 'vocal' ? ' selected' : ''}>人声</option>
        </select>
        <button class="btn btn--signal" id="vrWav" ${state.status === 'working' ? 'disabled' : ''}>导出 WAV</button>
        <button class="btn" id="vrMp3" ${state.status === 'working' || state.mp3Busy ? 'disabled' : ''}>${state.mp3Busy ? '编码中…' : '导出 MP3'}</button>
        <select class="tool-select" id="vrKbps" style="flex:0 0 120px" aria-label="MP3 码率">
          <option value="128">128 kbps</option>
          <option value="192" selected>192 kbps</option>
          <option value="320">320 kbps</option>
        </select>
        <span class="grow"></span>
        <span class="mono faint">${buf ? `WAV 约 ${humanSize(wavBytes)}` : ''}</span>
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
        <span class="mono faint">MDX-Net · 浏览器本地推理</span>
      </div>
      <div class="panel__body grid" style="gap:var(--sp-3)">
        ${controlsHTML()}
      </div>
    </div>

    ${playerHTML()}

    ${noteHTML()}`;
}

/* ---------------- 波形 ---------------- */

function cssColor(name, fallback) {
  const probe = document.createElement('span');
  probe.style.cssText = `color:var(${name});position:absolute;visibility:hidden;pointer-events:none`;
  document.body.append(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  return c || fallback;
}

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
  g.fillText('纯音乐', 6, h / 2 + 12);
}

/* ---------------- 视图接口 ---------------- */

export default {
  id: 'vocal-remove',
  title: '分离纯音乐/人声',

  render() {
    return `${viewhead({
      title: 'PURE MUSIC / VOCALS',
      sub: '放进一首歌，分出纯音乐和人声两条轨。AI 模型在浏览器里跑，文件不上传；双模型会让两条轨都更干净。',
      idx: 'TOOLS / STEMS',
      meta: [
        { label: 'METHOD', value: 'MDX-Net' },
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
    repaintView = repaint;

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

    root.addEventListener('click', async (e) => {
      const aim = e.target.closest('[data-aimode]');
      if (aim && !aim.disabled) {
        const m = aim.dataset.aimode;
        if (m === state.ai.mode) return;
        state.ai.mode = m;
        if (state.ai.localFile && state.ai.localFor !== m) {
          state.ai.localFile = null;
          state.ai.localName = '';
          state.ai.localFor = '';
        }
        state.ai.error = '';
        state.ai.stage = 'idle';
        state.ai.modelInst = null;
        state.ai.rawInst = null;
        state.ai.rawVocal = null;
        state.ai.cleanProgress = 0;
        repaint();
        return;
      }

      if (e.target.closest('#vrModelClear')) {
        state.ai.localFile = null;
        state.ai.localName = '';
        state.ai.localFor = '';
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

      if (e.target.closest('#vrRun')) { runAI(); return; }
      if (e.target.closest('#vrPlay')) { await togglePlay(); return; }

      if (e.target.closest('#vrWav')) {
        const buf = exportBuffer();
        if (!buf || state.status === 'working') return;
        const blob = toWav(buf);
        saveBlob(blob, outName('wav'));
        Toast.ok(`WAV 已导出（${humanSize(blob.size)}）`);
        return;
      }

      if (e.target.closest('#vrMp3')) {
        const buf = exportBuffer();
        if (!buf || state.mp3Busy || state.status === 'working') return;
        const kbps = Number(root.querySelector('#vrKbps')?.value || 192);
        state.mp3Busy = true;
        const btn = e.target.closest('#vrMp3');
        if (btn) { btn.disabled = true; btn.textContent = '编码中…'; }
        try {
          const blob = await encodeMp3(buf, kbps);
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

    root.addEventListener('input', (e) => {
      if (e.target.id === 'vrClean') {
        state.ai.clean = Number(e.target.value) / 100;
        const v = root.querySelector('#vrCleanVal');
        if (v) v.textContent = pct(state.ai.clean);
      } else if (e.target.id === 'vrAir') {
        state.ai.air = Number(e.target.value) / 100;
        const v = root.querySelector('#vrAirVal');
        if (v) v.textContent = pct(state.ai.air);
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
        state.ai.localFor = state.ai.mode;
        state.ai.stage = 'idle';
        state.ai.error = '';
        e.target.value = '';
        repaint();
        Toast.ok(`已选择本地模型：${f.name}`);
        return;
      }
      if (e.target.id === 'vrClean') {
        state.ai.clean = Number(e.target.value) / 100;
        if (state.ai.rawVocal && state.ai.mode === 'dual') applyClean();
        return;
      }
      if (e.target.id === 'vrAir') {
        state.ai.air = Number(e.target.value) / 100;
        if (state.ai.modelInst && state.ai.mode !== 'vocal') applyAir();
        return;
      }
      if (e.target.id === 'vrExport') {
        state.exportSource = e.target.value === 'vocal' ? 'vocal' : 'inst';
        repaint();
        return;
      }
      if (e.target.id === 'vrSeek') {
        delete e.target.dataset.dragging;
        seekTo(Number(e.target.value) / 1000);
      }
    });

    try {
      ro = new ResizeObserver(() => {
        const c = root.querySelector('#vrWave');
        if (c) requestAnimationFrame(() => drawWave(c));
      });
      const box = body();
      if (box) ro.observe(box);
    } catch { /* 旧浏览器没有 ResizeObserver */ }

    bindDrop();
    paintPlayer();
    requestAnimationFrame(() => drawWave(root.querySelector('#vrWave')));

    return () => {
      pause();
      ro?.disconnect();
      ro = null;
      repaintView = () => {};
      runToken++;
      if (state.status === 'working') {
        state.status = state.buffer ? 'ready' : 'idle';
        state.ai.stage = state.ai.rawVocal ? 'ready' : 'idle';
      }
    };
  },
};
