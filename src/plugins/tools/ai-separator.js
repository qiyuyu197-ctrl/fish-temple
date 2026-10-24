/**
 * plugins/tools/ai-separator.js — 浏览器端 AI 分轨（MDX-Net + ONNX Runtime Web）
 * ==================================================================
 * 为什么单独一个模块：M/S 只能搬走「正中间」的人声，立体声混响、双轨人声、
 * 稍微偏一点的人声都留在伴奏里。要真正做到「人声一条、伴奏一条」得让模型来。
 *
 * 这里按 UVR（Ultimate Vocal Remover）的思路配了两份 MDX-Net：
 *
 *   · UVR-MDX-NET-Inst_HQ_3 —— 伴奏专精；它「剩下」的人声会带一点音乐，
 *     所以只拿它当「伴奏优先」的快速模式。
 *   · Kim_Vocal_2 —— 人声专精；纯人声走它，伴奏走 Inst 模型，
 *     这就是「双模型」模式（慢一倍，但两条都干净）。
 *
 * 推理全程在浏览器里跑：
 *   模型（各 ~64MB）→ ONNX Runtime Web（本地 wasm）→ 分段 STFT → 推理 → 反变换
 *
 * 模型不进仓库，发布在 GitHub Release（tag model-v1）；页面请求同源
 * `/model/<文件名>`（本地 server.mjs / Netlify redirects 代理），失败再直连
 * Release 或国内镜像。音频不上传。
 */

import { decodeAudio } from './audio.js';

const LIB_URL = new URL('../../../assets/vendor/web-audio-separation/index.js', import.meta.url).href;
const MODEL_CACHE = 'fish-temple-ai-models';

const MODEL_DEFS = {
  inst: {
    id: 'UVR-MDX-NET-Inst_HQ_3',
    file: 'UVR-MDX-NET-Inst_HQ_3.onnx',
    name: 'UVR-MDX-NET Inst HQ 3',
    short: '伴奏模型',
    bytes: 66_759_214,
    primary: 'instrumental',
  },
  vocal: {
    id: 'Kim_Vocal_2',
    file: 'Kim_Vocal_2.onnx',
    name: 'Kim Vocal 2',
    short: '人声模型',
    bytes: 66_759_214,
    primary: 'vocals',
  },
};

/** 三种输出策略；界面上按这个顺序显示 */
export const AI_MODES = {
  inst: {
    id: 'inst',
    label: '伴奏优先（快）',
    short: '伴奏优先',
    models: ['inst'],
    hint: '只跑伴奏模型；人声是它的残差，可能带一点音乐。',
  },
  vocal: {
    id: 'vocal',
    label: '人声优先',
    short: '人声优先',
    models: ['vocal'],
    hint: '只跑人声模型；快，但没有伴奏参照，人声进入前的器乐过渡可能留下。要清理残留选「双模型」。',
  },
  dual: {
    id: 'dual',
    label: '双模型（最干净，慢一倍）',
    short: '双模型',
    models: ['inst', 'vocal'],
    hint: '伴奏取伴奏模型、人声取人声模型，再用伴奏当参照把人声里的器乐残留减掉。',
  },
};

export const AI_MODELS = MODEL_DEFS;

const modelPath = (def) => `/model/${def.file}`;
const modelUrl = (def) => new URL(modelPath(def), location.href).href;

const sourcesFor = (def) => [
  modelPath(def),
  `https://github.com/qiyuyu197-ctrl/fish-temple/releases/download/model-v1/${def.file}`,
  `https://hf-mirror.com/Blane187/all_public_uvr_models/resolve/main/${def.file}`,
  `https://aifasthub.com/Blane187/all_public_uvr_models/resolve/main/${def.file}`,
];

let libPromise = null;
/** model 名（inst / vocal）→ { sep, key } */
const loaded = new Map();

export const aiReady = (model = 'inst') => loaded.has(model);

/** 释放某个模型（或全部）的 ORT 会话 */
export function dispose(model = null) {
  const drop = (name) => {
    const item = loaded.get(name);
    if (!item) return;
    try { item.sep?.model?.release?.(); } catch { /* 旧版本没有 release */ }
    loaded.delete(name);
  };
  if (model) drop(model);
  else ['inst', 'vocal'].forEach(drop);
}

async function loadLib() {
  if (!libPromise) libPromise = import(LIB_URL);
  return libPromise;
}

/**
 * 带进度的 fetch。服务器对不存在的模型可能回退 index.html，
 * 所以要检查 content-type / 大小，别把 HTML 当 ONNX 塞给 ORT。
 */
async function fetchWithProgress(url, def, { onProgress, signal } = {}) {
  const res = await fetch(url, { signal, cache: 'force-cache' });
  const type = String(res.headers.get('content-type') || '');
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.ok) throw new Error(`模型下载失败（HTTP ${res.status}）`);
  if (/text\/html/i.test(type)) throw new Error('没找到模型文件（服务器返回了 HTML）');
  if (total && total < 1024 * 1024) throw new Error(`模型文件只有 ${total} 字节，不像完整的 ONNX。`);

  if (!res.body) {
    const buf = await res.arrayBuffer();
    onProgress?.({ loaded: buf.byteLength, total: buf.byteLength || total });
    return new Blob([buf], { type: 'application/octet-stream' });
  }

  const reader = res.body.getReader();
  const chunks = [];
  let loadedBytes = 0;
  let last = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loadedBytes += value.byteLength;
    const now = performance.now();
    if (now - last > 120) {
      last = now;
      onProgress?.({ loaded: loadedBytes, total: total || def.bytes });
    }
  }
  onProgress?.({ loaded: loadedBytes, total: total || loadedBytes });
  return new Blob(chunks, { type: 'application/octet-stream' });
}

/** 先查 CacheStorage，没命中再按「同源 → Release → 镜像」顺序下载，成功就缓存 */
async function cachedModel(def, { onProgress, signal } = {}) {
  const key = modelUrl(def);
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(MODEL_CACHE);
      const hit = await cache.match(key);
      if (hit) {
        const blob = await hit.blob();
        if (blob.size > 1024 * 1024) {
          onProgress?.({ loaded: blob.size, total: blob.size, cached: true });
          return blob;
        }
        await cache.delete(key);
      }
    } catch { /* 隐私模式 / 配额不足：退回网络 */ }
  }

  let lastErr;
  for (const src of sourcesFor(def)) {
    try {
      const blob = await fetchWithProgress(src, def, { onProgress, signal });
      if (typeof caches !== 'undefined') {
        try {
          const cache = await caches.open(MODEL_CACHE);
          await cache.put(key, new Response(blob));
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
 * 确保某个模型的「库 + 模型 + ORT 会话」就绪。同一个模型只加载一次。
 * @param {{model?:'inst'|'vocal', localFile?:File|null, onProgress?:(p:object)=>void, signal?:AbortSignal}} opts
 */
export async function ensureModel({ model = 'inst', localFile = null, onProgress, signal } = {}) {
  const def = MODEL_DEFS[model];
  if (!def) throw new Error(`未知模型：${model}`);

  const key = localFile
    ? `local:${localFile.name}:${localFile.size}:${localFile.lastModified}`
    : modelUrl(def);
  const existing = loaded.get(model);
  if (existing && existing.key === key) {
    onProgress?.({ stage: 'ready', model, modelShort: def.short });
    return existing.sep;
  }
  if (existing) dispose(model);

  onProgress?.({ stage: 'download', loaded: 0, total: localFile ? localFile.size : def.bytes, model, modelShort: def.short });
  let blob;
  if (localFile) {
    blob = localFile;
    onProgress?.({ stage: 'download', loaded: localFile.size, total: localFile.size, local: true, model, modelShort: def.short });
  } else {
    blob = await cachedModel(def, {
      onProgress: (p) => onProgress?.({ stage: 'download', ...p, model, modelShort: def.short }),
      signal,
    });
  }
  if (signal?.aborted) throw new Error('已取消');

  onProgress?.({ stage: 'load', fraction: 0, model, modelShort: def.short });
  // 笔记本上默认可能挑核显；有独立显卡时让 ORT 优先用它（不支持就静默忽略）
  try {
    const ort = await import('../../../assets/vendor/onnxruntime-web/ort.min.mjs');
    if (ort?.env?.webgpu) ort.env.webgpu.powerPreference = 'high-performance';
  } catch { /* ORT 还没加载成功时交给 loadLib 报错 */ }
  const { createSeparator } = await loadLib();
  const sep = createSeparator(def.id, {
    common: {
      logLevel: 'warn',
      sampleRate: 44100,
      onProgress: (p) => {
        const stage = p.stage === 'loading-model' ? 'load'
          : p.stage === 'demixing' ? 'demix'
            : 'write';
        onProgress?.({
          stage, fraction: p.fraction, chunk: p.chunk, totalChunks: p.totalChunks,
          model, modelShort: def.short,
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
  const blobUrl = URL.createObjectURL(blob);
  sep.modelPath = blobUrl;
  sep.model = true;
  try {
    await sep.loadModel();
  } catch (err) {
    try { sep.model?.release?.(); } catch { /* noop */ }
    URL.revokeObjectURL(blobUrl);
    throw new Error(`模型加载失败：${err?.message || err}`);
  }
  // 会话已经吃进权重，blob URL 可以放了（省 64MB 内存）
  URL.revokeObjectURL(blobUrl);
  loaded.set(model, { sep, key });
  onProgress?.({ stage: 'ready', model, modelShort: def.short });
  return sep;
}

/**
 * 用某一份模型分离，返回两条已解码的 AudioBuffer。
 * 注意：模型只保证它的 primary stem 干净；另一条是残差。
 * @param {File} file
 * @param {{model?:'inst'|'vocal', onProgress?:(p:object)=>void}} opts
 */
export async function separateFile(file, { model = 'inst', onProgress } = {}) {
  const item = loaded.get(model);
  if (!item) throw new Error('模型还没加载');
  const def = MODEL_DEFS[model];
  const t0 = performance.now();
  const fileUrl = URL.createObjectURL(file);
  let urls;
  try {
    urls = await item.sep.separate(fileUrl);
  } finally {
    URL.revokeObjectURL(fileUrl);
  }
  if (!Array.isArray(urls) || urls.length < 2) throw new Error('分离结果不完整（应该有人声与伴奏两轨）');

  // 库按 [secondary, primary] 返回
  const primaryIsVocals = String(item.sep.primaryStemName || def.primary).toLowerCase() === 'vocals';
  const vocalsUrl = primaryIsVocals ? urls[1] : urls[0];
  const instUrl = primaryIsVocals ? urls[0] : urls[1];

  onProgress?.({ stage: 'decode', fraction: 0, model, modelShort: def.short });
  const load = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`读取分离结果失败（HTTP ${res.status}）`);
    return decodeAudio(await res.blob());
  };
  const [instrumental, vocals] = await Promise.all([load(instUrl), load(vocalsUrl)]);
  return { instrumental, vocals, ms: performance.now() - t0, model };
}

/**
 * 双模型：伴奏取 Inst 模型、人声取 Kim 模型。
 * 这是修复「纯人声带音乐」的主路径 —— 不再用 Inst 模型的残差当人声。
 */
export async function separateDual(file, { onProgress } = {}) {
  const t0 = performance.now();
  const a = await separateFile(file, {
    model: 'inst',
    onProgress: (p) => onProgress?.({ ...p, part: 1, parts: 2 }),
  });
  const b = await separateFile(file, {
    model: 'vocal',
    onProgress: (p) => onProgress?.({ ...p, part: 2, parts: 2 }),
  });
  return {
    instrumental: a.instrumental,
    vocals: b.vocals,
    ms: performance.now() - t0,
    dual: true,
  };
}

export const AISeparator = {
  AI_MODELS, AI_MODES, ensureModel, separateFile, separateDual, dispose, aiReady,
};
export default AISeparator;
