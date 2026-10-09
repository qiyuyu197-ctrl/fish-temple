/**
 * views/tools.js — TOOLS / 工具台
 * ------------------------------------------------------------------
 * 三件工具，**全部在浏览器里跑，文件不上传**（这是站点"零依赖静态站"的直接收益：
 * 没有后端，所以也不需要把用户的文件交给谁）。
 *
 *   ① 格式转换  图片 png/jpg/webp/gif/bmp ↔；docx → txt/md/html；txt/md/html/csv → docx；
 *              音频 mp3/m4a/wav/ogg/flac → wav（瞬时）或 m4a/webm（实时重编码）
 *   ② 图片压缩  批量缩放 + 质量 + 换格式，实时看前后体积
 *   ③ 文本工具  JSON 格式化/压缩、Base64、URL 编解码、行处理、文本统计、文件 SHA-256
 *
 * 做不到的也写在界面上：mp3 编码（需要第三方编码器）、pdf/xlsx/pptx 解析（复杂度不划算）。
 */

import { $, $$, esc, ICON } from '../util/dom.js';
import { Toast } from '../ui/toast.js';
import { Motion } from '../core/motion.js';
import { viewhead, emptyState } from '../ui/bits.js';
import {
  kindOf, targetsFor, defaultTarget, convert, humanSize, fmtTime, FORMAT_LABEL, EXT_OF,
} from '../plugins/tools/index.js';
import { processLines, LINE_MODES, textStats, formatJson, minifyJson, jsonSummary, base64Encode, base64Decode, urlEncode, urlDecode, sha256 } from '../plugins/tools/text.js';
import { zip } from '../plugins/tools/zip.js';

const TABS = [
  { id: 'convert', label: '格式转换', cn: 'CONVERT' },
  { id: 'image', label: '图片压缩', cn: 'SHRINK' },
  { id: 'text', label: '文本工具', cn: 'TEXT' },
];

let seq = 0;
const state = {
  tab: 'convert',
  converting: false,
  files: [],                       // { id, file, kind, target, out?, url?, busy, error, progress }
  zipBusy: false,
  img: { maxEdge: 1600, quality: 0.82, format: 'image/jpeg', background: '#ffffff' },
  results: [],                     // 图片压缩结果
  text: { mode: 'json', modes: ['trim', 'dropEmpty'], input: '', output: '', error: '', info: '', hash: null },
};

const state$ = () => state;

/* ---------------- 下载 ---------------- */
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const delta = (from, to) => {
  if (!from || !to) return '';
  const pct = Math.round(((to - from) / from) * 100);
  return pct === 0 ? '体积不变' : (pct > 0 ? `+${pct}%` : `${pct}%`);
};

/* ---------------- 片段 ---------------- */

const dropZone = (id, hint, accept = '') => `
  <div class="tool-drop" id="${id}" tabindex="0" role="button" aria-label="选择或拖入文件">
    <span class="tool-drop__ico">＋</span>
    <b>把文件拖到这里</b>
    <span class="mono faint">${esc(hint)}</span>
    <span class="btn btn--sm">选择文件</span>
    <input type="file" id="${id}Input" multiple ${accept ? `accept="${accept}"` : ''} hidden />
  </div>`;

function convertRow(item) {
  const kinds = { image: '图片', doc: '文档', audio: '音频', text: '文本', unknown: '未知' };
  const targets = targetsFor(item.file);
  const out = item.out;
  return `
  <div class="tool-row" data-row="${item.id}">
    <span class="tool-row__badge mono">${kinds[item.kind] || '?'}</span>
    <span class="tool-row__main">
      <span class="clamp-1">${esc(item.file.name)}</span>
      <span class="mono faint" style="font-size:var(--fs-2xs)">${humanSize(item.file.size)}${out ? ` → ${humanSize(out.to)} · ${out.note}` : ''}</span>
      ${item.error ? `<span class="mono" style="font-size:var(--fs-2xs);color:var(--alert)">${esc(item.error)}</span>` : ''}
      ${item.busy ? `<span class="tool-bar"><i style="width:${Math.round((item.progress || 0) * 100)}%"></i></span>` : ''}
    </span>
    <span class="tool-row__acts">
      ${targets.length ? `<select class="tool-select" data-target="${item.id}" ${item.busy ? 'disabled' : ''}>
        ${targets.map((t) => `<option value="${esc(t.id)}" ${t.id === item.target ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
      </select>` : '<span class="mono faint" style="font-size:var(--fs-2xs)">暂不支持</span>'}
      <button class="btn btn--sm" data-convert="${item.id}" ${item.busy || !targets.length ? 'disabled' : ''}>转换</button>
      ${out ? `<button class="btn btn--sm btn--signal" data-save="${item.id}">下载</button>` : ''}
      <button class="btn btn--sm" data-remove="${item.id}" title="移除">✕</button>
    </span>
  </div>`;
}

function convertPanel() {
  const items = state.files;
  const done = items.filter((i) => i.out);
  return `
  <div class="panel" data-reveal>
    <div class="panel__head">
      <span class="panel__title">格式转换</span>
      <span class="mono faint" style="font-size:var(--fs-2xs)">文件不上传 · 全在浏览器里处理</span>
    </div>
    <div class="panel__body grid" style="gap:var(--sp-4)">
      ${dropZone('toolDrop', '图片 · docx · 文本 · 音频，可一次拖多个')}
      ${items.length
        ? `<div class="tool-list">${items.map(convertRow).join('')}</div>
           <div class="tool-actions">
             <button class="btn btn--signal" id="convertAll" ${state.converting ? 'disabled' : ''}>全部转换（${items.length}）</button>
             <button class="btn" id="saveZip" ${done.length ? '' : 'disabled'}>打包下载 ZIP（${done.length}）</button>
             <button class="btn btn--danger" id="clearFiles">清空列表</button>
             <span class="grow"></span>
             <span class="mono faint" style="font-size:var(--fs-2xs)">音频转 m4a / webm 需要实时重编码，耗时≈音频时长</span>
           </div>`
        : emptyState({ title: '还没有文件', desc: '支持：png/jpg/webp/gif/bmp · docx · txt/md/html/csv · mp3/m4a/wav/ogg/flac', icon: '⇄' })}
      <details class="tool-note">
        <summary>支持矩阵与做不到的部分</summary>
        <div class="tool-note__body">
          <table class="tool-table">
            <thead><tr><th>类型</th><th>能读</th><th>能写</th></tr></thead>
            <tbody>
              <tr><td>图片</td><td>png / jpg / webp / gif(首帧) / bmp</td><td>${Object.values(FORMAT_LABEL).join(' / ')}</td></tr>
              <tr><td>文档</td><td>docx（含标题、列表、表格）</td><td>docx（由文本生成）</td></tr>
              <tr><td>文本</td><td>txt / md / html / csv / json</td><td>txt / docx</td></tr>
              <tr><td>音频</td><td>mp3 / m4a / wav / ogg / flac / webm</td><td>wav（瞬时）· m4a / webm（实时）</td></tr>
            </tbody>
          </table>
          <p class="faint" style="font-size:var(--fs-2xs);margin:var(--sp-3) 0 0;line-height:1.8">
            <b>MP3 编码不做</b>：需要一个第三方编码器（LAME 之类），本项目零依赖。<br />
            <b>PDF / XLSX / PPTX 不做</b>：解析量级远超"顺手写个小工具"，与其给个会出错的按钮，不如明说。
          </p>
        </div>
      </details>
    </div>
  </div>`;
}

/* ---------------- 图片压缩 ---------------- */

function imagePanel() {
  const { maxEdge, quality, format, background } = state.img;
  const done = state.results;
  const totalFrom = done.reduce((a, r) => a + r.from, 0);
  const totalTo = done.reduce((a, r) => a + r.to, 0);
  return `
  <div class="panel" data-reveal>
    <div class="panel__head">
      <span class="panel__title">图片压缩 / 批量缩放</span>
      <span class="mono faint" style="font-size:var(--fs-2xs)">CANVAS · 不降采样损失以外的花活</span>
    </div>
    <div class="panel__body grid" style="gap:var(--sp-4)">
      ${dropZone('imgDrop', '图片文件（可多选）', 'image/*')}

      <div class="tool-opts">
        <label class="tool-opt"><span class="k-label">最长边</span>
          <input type="number" id="imgMaxEdge" min="0" max="8000" step="80" value="${maxEdge}" />
          <em class="mono faint">px，0 = 不缩放</em></label>
        <label class="tool-opt"><span class="k-label">质量</span>
          <input type="range" id="imgQuality" min="0.3" max="1" step="0.02" value="${quality}" />
          <em class="mono" id="imgQualityVal">${Math.round(quality * 100)}%</em></label>
        <label class="tool-opt"><span class="k-label">输出格式</span>
          <select class="tool-select" id="imgFormat">
            ${Object.entries(FORMAT_LABEL).map(([m, l]) => `<option value="${m}" ${m === format ? 'selected' : ''}>${l}</option>`).join('')}
          </select></label>
        <label class="tool-opt" id="imgBgWrap" ${format === 'image/png' ? 'hidden' : ''}>
          <span class="k-label">透明底色</span>
          <input type="color" id="imgBg" value="${background}" /></label>
        <span class="grow"></span>
        <button class="btn btn--signal" id="imgRun" ${state.files.length ? '' : 'disabled'}>开始压缩（${state.files.length}）</button>
        <button class="btn" id="imgZip" ${done.length ? '' : 'disabled'}>打包下载 ZIP</button>
        <button class="btn btn--danger" id="imgClear" ${state.files.length || done.length ? '' : 'disabled'}>清空</button>
      </div>

      ${state.files.length ? `<div class="tool-thumbs">
        ${state.files.map((f) => {
          const r = done.find((d) => d.id === f.id);
          return `<figure class="tool-thumb" data-thumb="${f.id}">
            ${r ? `<img src="${r.url}" alt="" />` : '<span class="tool-thumb__ph mono">…</span>'}
            <figcaption>
              <span class="clamp-1">${esc(f.file.name)}</span>
              <span class="mono faint" style="font-size:var(--fs-2xs)">${r ? `${humanSize(r.from)} → ${humanSize(r.to)} · ${delta(r.from, r.to)}` : humanSize(f.file.size)}</span>
              ${r ? `<button class="btn btn--sm" data-saveimg="${r.id}">下载</button>` : ''}
            </figcaption>
          </figure>`;
        }).join('')}
      </div>` : emptyState({ title: '还没有图片', desc: '拖进来一批，设好最长边与质量，一次性压完。', icon: '▣' })}

      ${done.length ? `<div class="tool-total mono">
        合计 ${humanSize(totalFrom)} → ${humanSize(totalTo)} · 省下 ${humanSize(Math.max(0, totalFrom - totalTo))}（${delta(totalFrom, totalTo)}）
      </div>` : ''}
    </div>
  </div>`;
}

/* ---------------- 文本工具 ---------------- */

const TEXT_MODES = [
  { id: 'json', label: 'JSON 格式化' },
  { id: 'min', label: 'JSON 压缩' },
  { id: 'b64e', label: 'Base64 编码' },
  { id: 'b64d', label: 'Base64 解码' },
  { id: 'urle', label: 'URL 编码' },
  { id: 'urld', label: 'URL 解码' },
  { id: 'lines', label: '行处理' },
  { id: 'stats', label: '文本统计' },
  { id: 'hash', label: '文件 SHA-256' },
];

function textPanel() {
  const t = state.text;
  const isLines = t.mode === 'lines';
  const isHash = t.mode === 'hash';
  return `
  <div class="panel" data-reveal>
    <div class="panel__head">
      <span class="panel__title">文本工具</span>
      <span class="mono faint" style="font-size:var(--fs-2xs)">纯本地 · 不联网</span>
    </div>
    <div class="panel__body grid" style="gap:var(--sp-4)">
      <div class="tool-opts tool-opts--wrap">
        ${TEXT_MODES.map((m) => `<button class="chip${t.mode === m.id ? ' is-on' : ''}" data-tmode="${m.id}">${m.label}</button>`).join('')}
      </div>

      ${isHash ? `
        <div class="tool-opts">
          <label class="tool-opt"><span class="k-label">选择文件</span>
            <input type="file" id="hashFile" /></label>
          <button class="btn btn--signal" id="hashRun" disabled>计算 SHA-256</button>
        </div>
        ${t.hash ? `<div class="tool-hash mono">
          <div><span class="k-label">SHA-256</span><b id="hashValue">${esc(t.hash.hex)}</b></div>
          <div><span class="k-label">体积</span>${humanSize(t.hash.bytes)}</div>
          <button class="btn btn--sm" id="hashCopy">复制</button>
        </div>` : ''}
      ` : `
        ${isLines ? `<div class="tool-opts tool-opts--wrap">
          <span class="k-label">处理方式（可多选）</span>
          ${LINE_MODES.map((m) => `<button class="chip${t.modes.includes(m.id) ? ' is-on' : ''}" data-lmode="${m.id}">${m.label}</button>`).join('')}
        </div>` : ''}
        <div class="tool-split">
          <label class="tool-pane">
            <span class="k-label">输入</span>
            <textarea id="textIn" spellcheck="false" placeholder="粘贴内容…">${esc(t.input)}</textarea>
          </label>
          <label class="tool-pane">
            <span class="k-label">输出</span>
            <textarea id="textOut" spellcheck="false" readonly placeholder="结果会出现在这里">${esc(t.output)}</textarea>
          </label>
        </div>
        ${t.error ? `<p class="mono" style="color:var(--alert);font-size:var(--fs-2xs);margin:0">${esc(t.error)}</p>` : ''}
        ${t.info ? `<p class="mono faint" style="font-size:var(--fs-2xs);margin:0">${esc(t.info)}</p>` : ''}
        <div class="tool-actions">
          <button class="btn btn--signal" id="textRun">执行</button>
          <button class="btn" id="textSwap" title="把输出放回输入">输出 → 输入</button>
          <button class="btn" id="textCopy" ${t.output ? '' : 'disabled'}>复制结果</button>
          <button class="btn" id="textSave" ${t.output ? '' : 'disabled'}>下载结果</button>
          <button class="btn btn--danger" id="textClear">清空</button>
        </div>
      `}
    </div>
  </div>`;
}

/* ---------------- 视图 ---------------- */

export default {
  id: 'tools',
  title: '工具台',

  render() {
    return `
    <section class="tools">
      ${viewhead({
        title: 'TOOLBOX',
        sub: '三个在浏览器里跑的小工具：格式转换、图片压缩、文本处理。文件不上传、不落盘，关掉页面就没了 —— 因为没有后端，所以也不需要把文件交给谁。',
        idx: 'MODULE / 06',
        meta: [
          { label: 'TOOLS', value: String(TABS.length).padStart(2, '0') },
          { label: 'UPLOAD', value: 'NONE' },
          { label: 'RUNTIME', value: 'BROWSER' },
        ],
        actions: '<a class="btn btn--sm" href="#/admin" data-nav>内容发布 →</a>',
      })}

      <div class="tool-tabs" style="margin-top:var(--sp-5)" role="tablist">
        ${TABS.map((t) => `<button class="tool-tab${state.tab === t.id ? ' is-on' : ''}" role="tab"
            aria-selected="${state.tab === t.id}" data-tab="${t.id}">
            <span>${esc(t.label)}</span><em class="mono">${t.cn}</em>
          </button>`).join('')}
      </div>

      <div id="toolBody" style="margin-top:var(--sp-4)">
        ${state.tab === 'convert' ? convertPanel() : state.tab === 'image' ? imagePanel() : textPanel()}
      </div>
    </section>`;
  },

  mount(root) {
    const body = () => $('#toolBody');

    const repaint = ({ focusInput = false } = {}) => {
      const b = body();
      if (!b) return;
      b.innerHTML = state.tab === 'convert' ? convertPanel() : state.tab === 'image' ? imagePanel() : textPanel();
      $$('.tool-tab', root).forEach((t) => {
        const on = t.dataset.tab === state.tab;
        t.classList.toggle('is-on', on);
        t.setAttribute('aria-selected', String(on));
      });
      Motion.reveal(b);
      bindDrop();
      if (focusInput) {
        const ta = $('#textIn');
        if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
      }
    };

    /* ---- 文件拖放 ---- */
    const addFiles = (list, { imagesOnly = false } = {}) => {
      const files = [...list].filter((f) => f && f.size > 0);
      if (!files.length) return;
      if (imagesOnly) {
        const imgs = files.filter((f) => kindOf(f) === 'image');
        if (imgs.length !== files.length) Toast.show(`已忽略 ${files.length - imgs.length} 个非图片文件`);
        state.files = [...state.files, ...imgs.map((file) => ({
          id: `f${++seq}`, file, kind: 'image', target: state.img.format, busy: false, error: '',
        }))];
      } else {
        state.files = [...state.files, ...files.map((file) => ({
          id: `f${++seq}`, file, kind: kindOf(file), target: defaultTarget(file), busy: false, error: '',
        }))];
      }
      repaint();
      Toast.ok(`已加入 ${files.length} 个文件`);
    };

    const bindDrop = () => {
      $$('.tool-drop', root).forEach((zone) => {
        const input = zone.querySelector('input[type=file]');
        const imagesOnly = zone.id === 'imgDrop';
        zone.addEventListener('click', (e) => { if (e.target !== input) input?.click(); });
        zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input?.click(); } });
        input?.addEventListener('change', () => { addFiles(input.files, { imagesOnly }); input.value = ''; });
        zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('is-over'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
        zone.addEventListener('drop', (e) => {
          e.preventDefault();
          zone.classList.remove('is-over');
          addFiles(e.dataTransfer?.files || [], { imagesOnly });
        });
      });
    };

    /* ---- 转换 ---- */
    const convertFiles = async (ids) => {
      if (state.converting) return;
      state.converting = true;
      const targets = state.files.filter((f) => ids.includes(f.id) && f.target && targetsFor(f.file).length);
      for (const item of targets) {
        item.busy = true;
        item.error = '';
        item.progress = 0;
        repaint();
        try {
          const r = await convert(item.file, item.target, {
            quality: state.img.quality,
            maxEdge: 0,
            onProgress: (p) => {
              item.progress = p;
              const bar = root.querySelector(`[data-row="${item.id}"] .tool-bar i`);
              if (bar) bar.style.width = `${Math.round(p * 100)}%`;
            },
          });
          item.out = r;
          if (item.url) URL.revokeObjectURL(item.url);
          item.url = URL.createObjectURL(r.blob);
        } catch (err) {
          item.error = String(err.message || err);
          Toast.err(`${item.file.name}：${item.error}`);
        } finally {
          item.busy = false;
        }
        repaint();
      }
      state.converting = false;
      const ok = targets.filter((t) => t.out).length;
      if (ok) Toast.ok(`转换完成 ${ok} 个文件`);
      repaint();
    };

    /* ---- 文本执行 ---- */
    const runText = () => {
      const t = state.text;
      t.error = '';
      t.info = '';
      try {
        const input = t.input;
        switch (t.mode) {
          case 'json': {
            t.output = formatJson(input);
            const s = jsonSummary(t.output);
            t.info = `${s.type} · ${s.entries} 项 · ${humanSize(s.bytes)}${s.keys.length ? ` · 顶层键：${s.keys.join(', ')}` : ''}`;
            break;
          }
          case 'min':
            t.output = minifyJson(input);
            t.info = `压缩后 ${humanSize(new TextEncoder().encode(t.output).length)}`;
            break;
          case 'b64e': t.output = base64Encode(input); break;
          case 'b64d': t.output = base64Decode(input); break;
          case 'urle': t.output = urlEncode(input); break;
          case 'urld': t.output = urlDecode(input); break;
          case 'lines': t.output = processLines(input, t.modes); break;
          case 'stats': {
            const s = textStats(input);
            t.output = [
              `字符数（含空白）: ${s.chars}`,
              `字符数（去空白）: ${s.charsNoSpace}`,
              `中文字数: ${s.cjk}`,
              `英文词数: ${s.words}`,
              `行数: ${s.lines}`,
              `预估阅读: ${s.readingMin} 分钟`,
            ].join('\n');
            break;
          }
          default: t.output = input;
        }
      } catch (err) {
        t.error = String(err.message || err);
        t.output = '';
      }
      repaint();
    };

    /* ---- 交互 ---- */
    root.addEventListener('click', async (e) => {
      const tab = e.target.closest('[data-tab]');
      if (tab) { state.tab = tab.dataset.tab; repaint(); return; }

      // 转换：单条 / 全部 / 下载 / 移除
      const one = e.target.closest('[data-convert]');
      if (one) { convertFiles([one.dataset.convert]); return; }
      if (e.target.closest('#convertAll')) { convertFiles(state.files.map((f) => f.id)); return; }
      if (e.target.closest('#clearFiles')) { state.files = []; repaint(); return; }
      const rm = e.target.closest('[data-remove]');
      if (rm) { state.files = state.files.filter((f) => f.id !== rm.dataset.remove); repaint(); return; }
      const save = e.target.closest('[data-save]');
      if (save) {
        const item = state.files.find((f) => f.id === save.dataset.save);
        if (item?.out) saveBlob(item.out.blob, item.out.name);
        return;
      }
      if (e.target.closest('#saveZip')) {
        const done = state.files.filter((f) => f.out);
        if (!done.length) return;
        state.zipBusy = true;
        try {
          const blob = await zip(await Promise.all(done.map(async (f) => ({ name: f.out.name, data: new Uint8Array(await f.out.blob.arrayBuffer()) }))));
          saveBlob(blob, `converted-${Date.now()}.zip`);
          Toast.ok(`已打包 ${done.length} 个文件`);
        } catch (err) {
          Toast.err(`打包失败：${err.message}`);
        } finally { state.zipBusy = false; }
        return;
      }

      // 图片压缩
      if (e.target.closest('#imgRun')) {
        const opts = state.img;
        const list = state.files.filter((f) => f.kind === 'image');
        if (!list.length) return;
        state.results = [];
        repaint();
        for (const item of list) {
          try {
            const r = await convert(item.file, opts.format, { quality: opts.quality, maxEdge: opts.maxEdge, background: opts.background });
            state.results.push({
              id: item.id, name: r.name, from: item.file.size, to: r.to,
              blob: r.blob, url: URL.createObjectURL(r.blob),
            });
          } catch (err) {
            Toast.err(`${item.file.name}：${err.message}`);
          }
          repaint();
        }
        const saved = state.results.reduce((a, r) => a + Math.max(0, r.from - r.to), 0);
        Toast.ok(state.results.length ? `压完 ${state.results.length} 张，省下 ${humanSize(saved)}` : '没有可压缩的图片');
        return;
      }
      const saveImg = e.target.closest('[data-saveimg]');
      if (saveImg) {
        const r = state.results.find((x) => x.id === saveImg.dataset.saveimg);
        if (r) saveBlob(r.blob, r.name);
        return;
      }
      if (e.target.closest('#imgZip')) {
        if (!state.results.length) return;
        const blob = await zip(await Promise.all(state.results.map(async (r) => ({ name: r.name, data: new Uint8Array(await r.blob.arrayBuffer()) }))));
        saveBlob(blob, `images-${Date.now()}.zip`);
        return;
      }
      if (e.target.closest('#imgClear')) { state.files = []; state.results = []; repaint(); return; }

      // 文本工具
      const tm = e.target.closest('[data-tmode]');
      if (tm) { state.text.mode = tm.dataset.tmode; repaint(); return; }
      const lm = e.target.closest('[data-lmode]');
      if (lm) {
        const id = lm.dataset.lmode;
        state.text.modes = state.text.modes.includes(id) ? state.text.modes.filter((m) => m !== id) : [...state.text.modes, id];
        repaint();
        return;
      }
      if (e.target.closest('#textRun')) { runText(); return; }
      if (e.target.closest('#textSwap')) { state.text.input = state.text.output; state.text.output = ''; repaint(); return; }
      if (e.target.closest('#textClear')) { state.text.input = ''; state.text.output = ''; state.text.error = ''; state.text.info = ''; repaint(); return; }
      if (e.target.closest('#textCopy')) {
        try { await navigator.clipboard.writeText(state.text.output); Toast.ok('已复制'); }
        catch { Toast.err('复制失败（浏览器未授权剪贴板）'); }
        return;
      }
      if (e.target.closest('#textSave')) {
        saveBlob(new Blob([state.text.output], { type: 'text/plain;charset=utf-8' }), `text-${Date.now()}.txt`);
        return;
      }
      if (e.target.closest('#hashRun')) {
        try {
          const input = $('#hashFile');
          if (!input?.files?.[0]) return;
          const r = await sha256(input.files[0]);
          state.text.hash = r;
          Toast.ok('SHA-256 计算完成');
        } catch (err) { Toast.err(err.message); }
        repaint();
        return;
      }
      if (e.target.closest('#hashCopy')) {
        try { await navigator.clipboard.writeText(state.text.hash?.hex || ''); Toast.ok('已复制 SHA-256'); } catch { Toast.err('复制失败'); }
      }
    });

    root.addEventListener('change', (e) => {
      const t = e.target.closest('[data-target]');
      if (t) {
        const item = state.files.find((f) => f.id === t.dataset.target);
        if (item) item.target = t.value;
        return;
      }
      if (e.target.id === 'imgFormat') { state.img.format = e.target.value; repaint(); return; }
      if (e.target.id === 'hashFile') {
        const btn = $('#hashRun');
        if (btn) btn.disabled = !e.target.files?.[0];
      }
    });

    root.addEventListener('input', (e) => {
      if (e.target.id === 'imgQuality') {
        state.img.quality = Number(e.target.value);
        const v = $('#imgQualityVal');
        if (v) v.textContent = `${Math.round(state.img.quality * 100)}%`;
      } else if (e.target.id === 'imgMaxEdge') {
        state.img.maxEdge = Math.max(0, Number(e.target.value) || 0);
      } else if (e.target.id === 'imgBg') {
        state.img.background = e.target.value;
      } else if (e.target.id === 'textIn') {
        state.text.input = e.target.value;
        // 输入时只更新状态，不重绘（否则光标会跳）
        const out = $('#textOut');
        if (out) out.value = state.text.output;
      }
    });

    bindDrop();
    Motion.reveal(root);
  },
};

export const ToolsState = state$;
