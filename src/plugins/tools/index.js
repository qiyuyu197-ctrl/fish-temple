/**
 * plugins/tools/index.js — 格式转换的调度层
 * ==================================================================
 * 界面只管「这个文件能转成什么」，具体交给对应的模块：
 *
 *   图片  png / jpg / webp / gif(首帧) / bmp  →  jpg / png / webp（canvas 编码）
 *   文档  docx                                →  pdf（浏览器排版后成像封装）
 *                                              →  txt / md / html（解 zip + 解析 XML）
 *         txt / md / html / csv                →  docx（生成最小合法 docx）
 *   演示  pptx                                →  pdf（一页一张幻灯片，按坐标摆）
 *   音频  mp3 / m4a / wav / ogg / flac / webm  →  wav（瞬时）
 *                                              →  m4a / webm（实时重编码，耗时≈时长）
 *
 * 明确不做：**mp3 编码**（LAME 是第三方二进制，本项目零依赖）、**xlsx**；
 * `.doc` / `.ppt` 这类 97-2003 的二进制老格式也读不了（会直接说清楚，不装死）。
 * PDF 是**图片式**的：排版与中文保真，但文字不能选中 —— 想选中就走系统打印。
 */

import { docxToText, textToDocx } from './docx.js';
import { docxToHtml } from './docx-html.js';
import { pptxToSlides } from './pptx.js';
import { documentToPdf, slidesToPdf, A4 } from './pdf.js';
import { convertImage, EXT_OF, FORMAT_LABEL, humanSize } from './image.js';
import { decodeAudio, toWav, encodeRealtime, supportedEncoders, fmtTime } from './audio.js';

export { humanSize, fmtTime, EXT_OF, FORMAT_LABEL, A4 };

const ext = (name) => String(name || '').toLowerCase().replace(/^.*\./, '');
const baseName = (name) => String(name || 'file').replace(/\.[^.]+$/, '') || 'file';

export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'];
export const DOC_EXTS = ['docx'];
export const SLIDE_EXTS = ['pptx', 'pptm', 'ppsx'];
export const TEXT_EXTS = ['txt', 'md', 'markdown', 'html', 'htm', 'csv', 'json'];
export const AUDIO_EXTS = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'flac', 'webm', 'opus'];
/** 97-2003 的二进制格式：知道它是什么，但打不开 */
export const LEGACY_EXTS = ['doc', 'ppt', 'pps', 'xls'];

/** 判断文件属于哪一类（先用扩展名，必要时再看 MIME） */
export function kindOf(file) {
  const e = ext(file.name);
  const mime = String(file.type || '');
  if (IMAGE_EXTS.includes(e) || /^image\//.test(mime)) return 'image';
  if (DOC_EXTS.includes(e) || /wordprocessingml/.test(mime)) return 'doc';
  if (SLIDE_EXTS.includes(e) || /presentationml/.test(mime)) return 'slide';
  if (AUDIO_EXTS.includes(e) || /^audio\//.test(mime)) return 'audio';
  if (TEXT_EXTS.includes(e) || /^text\//.test(mime)) return 'text';
  if (LEGACY_EXTS.includes(e)) return 'legacy';
  return 'unknown';
}

const docTargets = [
  { id: 'pdf', label: 'PDF（排版 · 图片式）' },
  { id: 'txt', label: 'TXT' },
  { id: 'md', label: 'Markdown' },
  { id: 'html', label: 'HTML' },
];
const slideTargets = [{ id: 'pdf', label: 'PDF（每页一张幻灯片）' }];
const textTargets = [{ id: 'docx', label: 'DOCX' }, { id: 'txt', label: 'TXT（规范化换行）' }];
const audioIdle = [{ id: 'wav', label: 'WAV（无损 PCM，瞬时）' }]
  .concat(supportedEncoders().filter((e) => e.ext !== 'wav').map((e) => ({ id: e.ext, label: `${e.label}（实时重编码）` })));

/** 这个文件能转成哪些格式 */
export function targetsFor(file) {
  switch (kindOf(file)) {
    case 'image':
      return Object.keys(FORMAT_LABEL)
        .filter((m) => m !== 'image/png' || ext(file.name) !== 'png')     // 同格式不给选项
        .map((m) => ({ id: m, label: FORMAT_LABEL[m] }));
    case 'doc':
      return docTargets;
    case 'slide':
      return slideTargets;
    case 'text':
      return textTargets;
    case 'audio':
      return audioIdle;
    default:
      return [];
  }
}

/** 默认目标：优先"无损或最常用"的那个 */
export function defaultTarget(file) {
  const list = targetsFor(file);
  if (!list.length) return '';
  if (kindOf(file) === 'image') return list.find((t) => t.id === 'image/jpeg')?.id || list[0].id;
  if (kindOf(file) === 'audio') return list[0].id;      // wav：瞬时完成
  return list[0].id;                                    // doc / slide：PDF 排第一
}

/**
 * 转换一个文件。
 * @param {File} file
 * @param {string} target 目标格式 id（图片是 MIME，其它是扩展名）
 * @param {{quality?:number, maxEdge?:number, background?:string, onProgress?:(p:number)=>void}} opts
 * @returns {Promise<{blob:Blob, name:string, note:string, from:number, to:number}>}
 */
export async function convert(file, target, opts = {}) {
  const kind = kindOf(file);
  const base = baseName(file.name);

  if (kind === 'image') {
    const r = await convertImage(file, {
      format: target,
      quality: opts.quality ?? 0.9,
      maxEdge: opts.maxEdge ?? 0,
      background: opts.background,
    });
    return {
      blob: r.blob,
      name: `${base}.${EXT_OF[target] || 'bin'}`,
      note: `${r.width}×${r.height}`,
      from: file.size,
      to: r.blob.size,
    };
  }

  if (kind === 'doc') {
    if (target === 'pdf') {
      const doc = await docxToHtml(file, { contentWidth: A4.width - 128, fontSize: 15 });
      const r = await documentToPdf({
        html: doc.html, title: base, padding: 64, onProgress: opts.onProgress,
      });
      return {
        blob: r.blob, name: `${base}.pdf`,
        note: `${r.pages} 页 · ${doc.paragraphs} 段${doc.images ? ` · ${doc.images} 图` : ''}`,
        from: file.size, to: r.blob.size,
      };
    }
    const { text, paragraphs } = await docxToText(file, { format: target === 'txt' ? 'txt' : target });
    const mime = target === 'html' ? 'text/html;charset=utf-8' : 'text/plain;charset=utf-8';
    const blob = new Blob([text], { type: mime });
    return { blob, name: `${base}.${target}`, note: `${paragraphs} 段`, from: file.size, to: blob.size };
  }

  if (kind === 'slide') {
    const { slides } = await pptxToSlides(file);
    const r = await slidesToPdf({ slides, title: base, onProgress: opts.onProgress });
    return {
      blob: r.blob, name: `${base}.pdf`,
      note: `${r.pages} 页 · ${r.width}×${r.height}px`,
      from: file.size, to: r.blob.size,
    };
  }

  if (kind === 'text') {
    const raw = await file.text();
    if (target === 'docx') {
      const blob = await textToDocx(raw);
      return { blob, name: `${base}.docx`, note: '生成 docx', from: file.size, to: blob.size };
    }
    const normalized = raw.replace(/\r\n?/g, '\n');
    const blob = new Blob([normalized], { type: 'text/plain;charset=utf-8' });
    return { blob, name: `${base}.txt`, note: '规范化换行', from: file.size, to: blob.size };
  }

  if (kind === 'audio') {
    const buffer = await decodeAudio(file);
    const note = `${fmtTime(buffer.duration)} · ${buffer.sampleRate}Hz · ${buffer.numberOfChannels}ch`;
    if (target === 'wav') {
      const blob = toWav(buffer);
      return { blob, name: `${base}.wav`, note, from: file.size, to: blob.size };
    }
    const mime = target === 'm4a' ? 'audio/mp4' : 'audio/webm;codecs=opus';
    opts.onProgress?.(0);
    const blob = await encodeRealtime(buffer, { mime, bitrate: opts.bitrate || 192000, onProgress: opts.onProgress });
    opts.onProgress?.(1);
    return { blob, name: `${base}.${target}`, note: `${note} · 实时重编码`, from: file.size, to: blob.size };
  }

  if (kind === 'legacy') {
    const want = { doc: 'docx', ppt: 'pptx', pps: 'pptx', xls: 'xlsx' }[ext(file.name)] || '新格式';
    throw new Error(`.${ext(file.name)} 是 97-2003 的老二进制格式，浏览器里读不了；先用 Office / WPS 另存为 .${want}`);
  }

  throw new Error(`暂不支持这种文件（${ext(file.name) || file.type || '未知类型'}）`);
}

export const Tools = { kindOf, targetsFor, defaultTarget, convert, humanSize, fmtTime };
export default Tools;
