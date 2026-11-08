#!/usr/bin/env node
/**
 * tools/verify-pdf.mjs — 专测「docx / pptx → PDF」（开发期用，不属于站点运行时）
 * ------------------------------------------------------------------
 * 这条链路只能在浏览器里验：排版靠 HTML 引擎，成像靠 Canvas，Node 里两样都没有。
 * 所以这里只负责开浏览器、取回结果、断言，真正的活儿在 tools/verify-pdf-page.js。
 *
 * 验的是「能不能真的产出一个能打开的 PDF」，不是「按钮在不在」：
 *   · %PDF-1.4 头 / xref / trailer 齐全
 *   · 页数对得上、每页 MediaBox 尺寸对（A4 / 16:9）
 *   · 每页的 JPEG 抽出来数非白像素 —— 空白页会直接 FAIL
 *   · 进度回调走完、文件名后缀、老式 .ppt 报错可照做
 *
 * 用法：先 `node server.mjs`（默认 5173），再 `node tools/verify-pdf.mjs [baseUrl]`
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE = process.argv[2] || 'http://localhost:5173';
const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));

const PORT = 9850 + Math.floor(Math.random() * 90);
const profile = path.join(os.tmpdir(), `fish-pdf-verify-${Date.now()}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '\x1b[32m PASS\x1b[0m' : '\x1b[31m FAIL\x1b[0m'}  ${name}${detail ? `  \x1b[90m${detail}\x1b[0m` : ''}`);
};

const near = (a, b, tolerance = 1) => Math.abs(a - b) <= tolerance;

let child;
let send;

async function connect() {
  if (!EDGE) throw new Error('没找到 Chromium 内核浏览器（Edge / Chrome）');
  child = spawn(EDGE, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--window-size=1400,900', `${BASE}/#/tools`,
  ], { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (target) break;
    } catch { /* 端口还没起来 */ }
    await sleep(250);
  }
  if (!target) throw new Error(`连不上 ${BASE}（先在本机跑 node server.mjs）`);

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', () => rej(new Error('WebSocket 连接失败')), { once: true });
  });

  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.text);
  });

  send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    const timer = setTimeout(() => { pending.delete(mid); reject(new Error(`CDP 超时: ${method}`)); }, 180000);
    pending.set(mid, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  await send('Runtime.enable');
  await send('Page.enable');
  await sleep(1500);
  return { errors, ws };
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
}

async function main() {
  const { errors, ws } = await connect();

  const data = await evaluate(`(async () => {
    const mod = await import('/tools/verify-pdf-page.js?v=' + Date.now());
    return await mod.run();
  })()`);

  const d = data.docx;
  const p = data.pptx;

  record('docx 被识别为文档，默认目标就是 PDF',
    data.docxKind === 'doc' && data.docxTargets.includes('pdf') && data.docxDefault === 'pdf',
    JSON.stringify({ kind: data.docxKind, targets: data.docxTargets, def: data.docxDefault }));

  record('docx → PDF：%PDF 头 / xref / trailer 齐全，且每个对象的偏移都对得上',
    String(d.header).startsWith('%PDF-1.') && d.xref === true && d.trailer === true && d.objectsOk === true,
    JSON.stringify({ header: d.header, size: d.size, objectsOk: d.objectsOk, ms: d.ms }));

  record('docx → PDF：页数 ≥ 2，且 PDF 里的页数、图块数、MediaBox 一一对上',
    d.pages >= 2 && d.sheets.length === d.pages && d.mediaBoxes.length === d.pages
      && d.mediaBoxes.every(([w, h]) => near(w, 595.5) && near(h, 842.25)),
    JSON.stringify({ pages: d.pages, boxes: d.mediaBoxes, sheets: d.sheets.length }));

  record('docx → PDF：每一页都有内容（不是空白页），末页也有',
    d.sheets.every((s) => s.ink > 100) && d.sheets[d.sheets.length - 1].ink > 100,
    JSON.stringify(d.sheets.map((s) => s.ink)));

  record('docx → PDF：进度回调走完，文件名与 MIME 正确',
    d.progress.length >= d.pages && d.progress[d.progress.length - 1] === 1
      && d.progress[0] === 0 && d.progress.every((v, i, arr) => i === 0 || v >= arr[i - 1])
      && /\.pdf$/.test(d.name) && d.mime === 'application/pdf',
    JSON.stringify({ progress: d.progress, name: d.name, mime: d.mime }));

  record('docx → txt 这条老路没被 PDF 影响（中文还在）',
    /鱼灵庙/.test(data.docxTxt || ''),
    JSON.stringify(data.docxTxt));

  record('docx → PDF：Word 的分页符（w:br type="page"）真的照做（两页短内容 = 两页）',
    data.pageBreak?.pages === 2 && data.pageBreak.sheets.length === 2
      && data.pageBreak.sheets.every((s) => s.ink > 25)          // 每页只有一行字，阈值按"有墨"来
      && data.pageBreak.mediaBoxes.every(([w, h]) => near(w, 595.5) && near(h, 842.25)),
    JSON.stringify({ pages: data.pageBreak?.pages, ink: data.pageBreak?.sheets.map((s) => s.ink) }));

  record('pptx 被识别为演示文稿，只给 PDF 一个目标',
    data.pptxKind === 'slide' && data.pptxTargets.length === 1 && data.pptxTargets[0] === 'pdf',
    JSON.stringify({ kind: data.pptxKind, targets: data.pptxTargets }));

  record('pptx → PDF：两页、16:9（960×540pt）、每页都有内容、对象偏移正确',
    p.pages === 2 && p.sheets.length === 2 && p.mediaBoxes.every(([w, h]) => near(w, 960) && near(h, 540))
      && p.sheets.every((s) => s.ink > 100) && String(p.header).startsWith('%PDF-') && p.objectsOk === true,
    JSON.stringify({ pages: p.pages, boxes: p.mediaBoxes, ink: p.sheets.map((s) => s.ink), note: p.note }));

  record('老式 .ppt 不给假按钮，但给出「另存为 .pptx」的可照做报错',
    data.legacyKind === 'legacy' && data.legacyTargets === 0 && /另存为/.test(data.legacyError) && /pptx/.test(data.legacyError),
    JSON.stringify({ kind: data.legacyKind, targets: data.legacyTargets, err: data.legacyError }));

  record('页面里没有异常（渲染/导入错误会在这里出现）',
    errors.length === 0,
    errors.slice(0, 3).join(' | '));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n结果  通过 ${results.length - failed.length} / ${results.length}`
    + (failed.length ? `（失败 ${failed.length}）` : ''));
  if (failed.length) console.log('\x1b[31m失败：\x1b[0m\n  ' + failed.map((r) => r.name).join('\n  '));

  ws.close();
  child?.kill();
  process.exitCode = failed.length ? 1 : 0;
}

main()
  .catch((err) => {
    console.error('FAILED', err);
    try { child?.kill(); } catch { /* noop */ }
    process.exitCode = 1;
  })
  .finally(() => { setTimeout(() => process.exit(process.exitCode || 0), 400); });
