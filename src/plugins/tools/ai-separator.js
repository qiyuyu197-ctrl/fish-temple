/**
 * plugins/tools/ai-separator.js — 浏览器端 AI 分轨（MDX-Net + ONNX Runtime Web）
 * ==================================================================
 * 为什么单独一个模块：M/S 只能搬走「正中间」的人声，立体声混响、双轨人声、
 * 稍微偏一点的人声都留在伴奏里。要真正做到「人声一条、伴奏一条」得让模型来。
 *
 * 这里用的是 UVR 社区公开的 MDX-Net 模型（UVR-MDX-NET-Inst_HQ_3），
 * 推理全程在浏览器里跑：
 *
 *   模型（64MB）→ ONNX Runtime Web（本地 wasm）→ 分段 STFT → 推理 → 反变换
 *
 * 三件事刻意做成「按需」：
 *   1. 库（web-audio-separation）和 ORT 都是动态 import，不点 AI 分轨就不会加载；
 *   2. 模型第一次用时才下载，存进 CacheStorage，之后同一浏览器不再下载；
 *   3. 模型只从本站 `assets/models/` 取，不依赖 Hugging Face / jsDelivr ——
 *      国内网络也能用。也可以让用户点「选择本地模型」绕开下载。
 *
 * 局限（页面上也写着）：MDX 比 M/S 干净得多，但不是完美的 Demucs；
 * 首次分离慢（看机器），手机可能吃力；模型权重来自 UVR 社区，商用请自行确认授权。
 */

import { decodeAudio } from './audio.js';

const LIB_URL = new URL('../../../assets/vendor/web-audio-separation/index.js', import.meta.url).href;

// 模型不进仓库：发布在 GitHub Release（tag model-v1）。
// 浏览器优先请求同源 /model/…（本地 server.mjs / Netlify redirect 代理），
// 失败再直连 Release / 国内镜像。
const MODEL_PATH = '/model/UVR-MDX-NET-Inst_HQ_3.onnx';
const MODEL_URL = new URL(MODEL_PATH, location.href).href;
const MODEL_SOURCES = [
  MODEL_PATH,
  'https://github.com/qiyuyu197-ctrl/fish-temple/releases/download/model-v1/UVR-MDX-NET-Inst_HQ_3.onnx',
  'https://hf-mirror.com/Blane187/all_public_uvr_models/resolve/main/UVR-MDX-NET-Inst_HQ_3.onnx',
  'https://aifasthub.com/Blane187/all_public_uvr_models/resolve/main/UVR-MDX-NET-Inst_HQ_3.onnx',
];
const MODEL_CACHE = 'fish-temple-ai-models';

export const AI_MODEL = {
  id: 'UVR-MDX-NET-Inst_HQ_3',
  name: 'UVR-MDX-NET Inst HQ 3',
  bytes: 66_759_214,
  url: MODEL_URL,
  source: 'GitHub Release model-v1 / UVR 社区',
  note: 'MDX-Net · 4 分轨中的伴奏与人声两轨 · 模型在浏览器里跑，音频不上传',
};

let libPromise = null;
let separator = null;
let sepKey = '';
let modelBlobUrl = '';

export const aiReady = () => !!separator;

/** 释放 ORT 会话与模型 blob（切换模型或离开页面时） */
export function dispose() {
  try { separator?.model?.release?.(); } catch { /* 旧版本没有 release */ }
  separator = null;
  sepKey = '';
  if (modelBlobUrl) {
    URL.revokeObjectURL(modelBlobUrl);
    modelBlobUrl = '';
  }
}

async function loadLib() {
  if (!libPromise) libPromise = import(LIB_URL);
  return libPromise;
}

/**
 * 带进度的 fetch。服务器对不存在的模型可能回退 index.html，
 * 所以要检查 content-type / 大小，别把 HTML 当 ONNX 塞给 ORT。
 */
async function fetchWithProgress(url, { onProgress, signal } = {}) {
  const res = await fetch(url, { signal, cache: 'force-cache' });
  const type = String(res.headers.get('content-type') || '');
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.ok) throw new Error(`模型下载失败（HTTP ${res.status}）`);
  if (/text\/html/i.test(type)) {
    throw new Error('没找到模型文件（服务器返回了 index.html）。把 UVR-MDX-NET-Inst_HQ_3.onnx 放到 assets/models/ 再试。');
  }
  if (total && total < 1024 * 1024) throw new Error(`模型文件只有 ${total} 字节，不像完整的 ONNX。`);

  if (!res.body) {
    const buf = await res.arrayBuffer();
    onProgress?.({ loaded: buf.byteLength, total: buf.byteLength || total });
    return new Blob([buf], { type: 'application/octet-stream' });
  }

  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  let last = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    const now = performance.now();
    if (now - last > 120) {
      last = now;
      onProgress?.({ loaded, total: total || AI_MODEL.bytes });
    }
  }
  onProgress?.({ loaded, total: total || loaded });
  return new Blob(chunks, { type: 'application/octet-stream' });
}

/** 先查 CacheStorage，没命中再按「同源 → Release → 镜像」顺序下载，成功就缓存 */
async function cachedModel({ onProgress, signal } = {}) {
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(MODEL_CACHE);
      const hit = await cache.match(MODEL_URL);
      if (hit) {
        const blob = await hit.blob();
        if (blob.size > 1024 * 1024) {
          onProgress?.({ loaded: blob.size, total: blob.size, cached: true });
          return blob;
        }
        await cache.delete(MODEL_URL);
      }
    } catch { /* 隐私模式 / 配额不足：退回网络 */ }
  }

  let lastErr;
  for (const src of MODEL_SOURCES) {
    try {
      const blob = await fetchWithProgress(src, { onProgress, signal });
      if (typeof caches !== 'undefined') {
        try {
          const cache = await caches.open(MODEL_CACHE);
          await cache.put(MODEL_URL, new Response(blob));
        } catch { /* 存不进去也不影响这次 */ }
      }
      return blob;
    } catch (err) {
      if (signal?.aborted) throw err;
      lastErr = err;
    }
  }
  throw new Error(`模型下载失败：${lastErr?.message || lastErr || '所有来源都不可用'}`);
}

/**
 * 确保「库 + 模型 + ORT 会话」就绪。同一个模型只加载一次。
 * @param {{localFile?:File|null, onProgress?:(p:object)=>void, signal?:AbortSignal}} opts
 */
export async function ensureModel({ localFile = null, onProgress, signal } = {}) {
  const key = localFile
    ? `local:${localFile.name}:${localFile.size}:${localFile.lastModified}`
    : MODEL_URL;
  if (separator && sepKey === key) {
    onProgress?.({ stage: 'ready' });
    return separator;
  }

  dispose();
  onProgress?.({ stage: 'download', loaded: 0, total: localFile ? localFile.size : AI_MODEL.bytes });

  let blob;
  if (localFile) {
    blob = localFile;
    onProgress?.({ stage: 'download', loaded: localFile.size, total: localFile.size, local: true });
  } else {
    blob = await cachedModel({
      onProgress: (p) => onProgress?.({ stage: 'download', ...p }),
      signal,
    });
  }
  if (signal?.aborted) throw new Error('已取消');

  onProgress?.({ stage: 'load', fraction: 0 });
  // 笔记本上默认可能挑核显；有独立显卡时让 ORT 优先用它（不支持就静默忽略）
  try {
    const ort = await import('../../../assets/vendor/onnxruntime-web/ort.min.mjs');
    if (ort?.env?.webgpu) ort.env.webgpu.powerPreference = 'high-performance';
  } catch { /* ORT 还没加载成功时交给 loadLib 报错 */ }
  const { createSeparator } = await loadLib();
  const sep = createSeparator(AI_MODEL.id, {
    common: {
      logLevel: 'warn',
      sampleRate: 44100,
      onProgress: (p) => {
        const stage = p.stage === 'loading-model' ? 'load'
          : p.stage === 'demixing' ? 'demix'
            : 'write';
        onProgress?.({
          stage, fraction: p.fraction, chunk: p.chunk, totalChunks: p.totalChunks,
        });
      },
    },
    mdx: {
      executionProviders: ['webgpu', 'wasm'],
      segmentSize: 256,
      overlap: 0.25,
      batchSize: 1,
      hopLength: 1024,
    },
  });

  // 关键：把库自带的「从 HuggingFace 下载」换成我们手里的 Blob。
  // loadModel() 里是 `this.model || await this.downloadModel()`，先塞一个真值就跳过下载。
  modelBlobUrl = URL.createObjectURL(blob);
  sep.modelPath = modelBlobUrl;
  sep.model = true;
  try {
    await sep.loadModel();
  } catch (err) {
    dispose();
    throw new Error(`模型加载失败：${err?.message || err}`);
  }
  // 会话已经吃进权重，blob URL 可以放了（省 64MB 内存）
  if (modelBlobUrl) {
    URL.revokeObjectURL(modelBlobUrl);
    modelBlobUrl = '';
  }
  separator = sep;
  sepKey = key;
  onProgress?.({ stage: 'ready' });
  return separator;
}

/**
 * 分离一个音频文件，返回两条已解码的 AudioBuffer。
 * @param {File} file
 * @param {{onProgress?:(p:object)=>void}} opts
 * @returns {Promise<{instrumental:AudioBuffer, vocals:AudioBuffer, ms:number}>}
 */
export async function separateFile(file, { onProgress } = {}) {
  if (!separator) throw new Error('模型还没加载');
  const t0 = performance.now();
  const fileUrl = URL.createObjectURL(file);
  let urls;
  try {
    urls = await separator.separate(fileUrl);
  } finally {
    URL.revokeObjectURL(fileUrl);
  }
  if (!Array.isArray(urls) || urls.length < 2) throw new Error('分离结果不完整（应该有人声与伴奏两轨）');

  // 库按 [secondary, primary] 返回。我们的模型 primary = instrumental。
  const primaryIsVocals = String(separator.primaryStemName || '').toLowerCase() === 'vocals';
  const vocalsUrl = primaryIsVocals ? urls[1] : urls[0];
  const instUrl = primaryIsVocals ? urls[0] : urls[1];

  onProgress?.({ stage: 'decode', fraction: 0 });
  const load = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`读取分离结果失败（HTTP ${res.status}）`);
    return decodeAudio(await res.blob());
  };
  const [instrumental, vocals] = await Promise.all([load(instUrl), load(vocalsUrl)]);
  return { instrumental, vocals, ms: performance.now() - t0 };
}

export const AISeparator = { AI_MODEL, ensureModel, separateFile, dispose, aiReady };
export default AISeparator;
