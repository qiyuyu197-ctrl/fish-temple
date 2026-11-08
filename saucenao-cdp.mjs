#!/usr/bin/env node
/**
 * saucenao-cdp.mjs — 服务端「无头 Edge」执行 SauceNAO 真实搜图
 * ------------------------------------------------------------------
 * 为什么必须用浏览器：
 *   本机所在网络对 saucenao.com 的 TLS 连接做了**指纹级阻断**——
 *   curl(Schannel) / Node(OpenSSL) 的 ClientHello 会被直接 RST（ECONNRESET），
 *   但 Chromium 内核（BoringSSL 指纹）+ 系统代理可以正常到达。
 *   所以服务端借一个 headless Edge 把图 POST 进 saucenao，再把结果 DOM 抠出来。
 *
 * 契约：
 *   searchSauceNAO({ filePath, timeoutMs }) → { ok, results, error, elapsedMs }
 *   · 全程串行（互斥队列），避免同时开一堆 Edge。
 *   · 每次用完即杀进程 + 删临时 profile，绝不泄漏。
 *
 * 依赖：机器上装了 Edge（Win 默认有）。没找到浏览器时返回明确错误。
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';

/* ──── 浏览器定位 ──── */
const EDGE_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];

function findBrowser() {
  return EDGE_CANDIDATES.find((p) => existsSync(p)) || null;
}

/* ──── 互斥队列：同一时刻只跑一个搜索 ──── */
let chain = Promise.resolve();
function enqueue(task) {
  const run = chain.then(task, task); // 前一个成功/失败都要继续
  chain = run.then(() => {}, () => {}); // 吞掉，避免 unhandled
  return run;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ──── 页面内结果提取脚本（在 saucenao 结果页上下文执行）──── */
const EXTRACT_JS = `(async function () {
  function ext(u) {
    if (!u) return false;
    try { var h = new URL(u, location.href).hostname; return !/saucenao\\.com$/.test(h); }
    catch (e) { return false; }
  }
  function clean(s) { return (s || '').replace(/\\s+/g, ' ').trim(); }
  function pickField(txt, label) {
    var m = txt.match(new RegExp(label + '\\\\s*:?\\\\s*([^\\\\n]+)', 'i'));
    return m ? clean(m[1]) : '';
  }

  var out = [];
  var blocks = document.querySelectorAll('.result');
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    if (!b.querySelector('.resulttable')) continue; // 跳过「显示隐藏结果」提示条
    var img = b.querySelector('.resultimage img');
    var thumb = '';
    if (img) {
      var s = img.getAttribute('src') || '';
      var d = img.getAttribute('data-src') || '';
      // blocked.gif 是 NSFW 占位，真图在 data-src
      thumb = /blocked\\.gif/.test(s) ? d : (s || d);
    }
    var imgTitle = img ? (img.getAttribute('title') || '') : '';
    var indexName = '';
    var dbId = 0;
    var im = imgTitle.match(/Index\\s*#(\\d+):\\s*([^-]+)/i);
    if (im) { dbId = parseInt(im[1], 10); indexName = clean(im[2]); }

    var simEl = b.querySelector('.resultsimilarityinfo');
    var similarity = simEl ? parseFloat((simEl.textContent || '').replace('%', '')) || 0 : 0;

    var contentEl = b.querySelector('.resultcontent');
    var contentText = contentEl ? contentEl.innerText : '';

    var titleEl = b.querySelector('.resulttitle');
    var title = titleEl ? clean(titleEl.innerText) : '';

    // 收集所有外链（pixiv / twitter / danbooru / yande.re ...）
    var links = [];
    var anchors = b.querySelectorAll('a[href]');
    for (var j = 0; j < anchors.length; j++) {
      var href = anchors[j].href;
      if (!ext(href)) continue;
      if (/javascript:|^#$/.test(href)) continue;
      var label = clean(anchors[j].innerText) || clean(anchors[j].getAttribute('title') || '');
      // 站点图标链接（miscinfo 里的 danbooru/yande.re）用域名当标签
      if (!label) { try { label = new URL(href).hostname.replace(/^www\\./, ''); } catch (e) {} }
      links.push({ url: href, label: label });
    }
    // 去重
    var seen = {};
    links = links.filter(function (l) { if (seen[l.url]) return false; seen[l.url] = 1; return true; });

    // 主来源链接：优先 pixiv，其次 twitter/x，再次第一个外链
    var primary = links.find(function (l) { return /pixiv\\.net/.test(l.url); })
      || links.find(function (l) { return /(twitter\\.com|x\\.com)/.test(l.url); })
      || links[0] || null;

    out.push({
      similarity: similarity,
      thumbnail: thumb,
      dbId: dbId,
      indexName: indexName,
      title: title,
      creator: pickField(contentText, 'Creator'),
      member: pickField(contentText, 'Member'),
      author: pickField(contentText, 'Author'),
      source: pickField(contentText, 'Source'),
      material: pickField(contentText, 'Material'),
      characters: pickField(contentText, 'Characters'),
      contentText: clean(contentText).slice(0, 400),
      primaryUrl: primary ? primary.url : '',
      primaryLabel: primary ? primary.label : '',
      links: links,
      hidden: b.classList.contains('hidden'),
    });
  }

  // 按相似度降序
  out.sort(function (a, b) { return b.similarity - a.similarity; });

  // 让当前 Edge（已连通 saucenao）顺带把缩略图抓成 base64 dataURL ——
  // 这样前端渲染时不必再访问被 GFW 拦截的 img*.saucenao.com CDN。
  // 只抓前面几条（用户最关心的高相似结果），控制 JSON 体积；失败则前端回退用 URL。
  var top = out.filter(function (r) { return r.thumbnail && !r.hidden; }).slice(0, 6);
  if (top.length < 3) top = out.filter(function (r) { return r.thumbnail; }).slice(0, 6);
  var budget = 3 * 1024 * 1024; // base64 总预算 3MB
  await Promise.all(top.map(async function (r) {
    if (budget <= 0) return;
    try {
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, 7000);
      var resp = await fetch(r.thumbnail, { signal: ctrl.signal, credentials: 'omit' });
      clearTimeout(timer);
      if (!resp.ok) return;
      var blob = await resp.blob();
      if (!blob.size || blob.size > 700 * 1024) return; // 太大就用 URL 兜底
      var dataUrl = await new Promise(function (res) {
        var fr = new FileReader();
        fr.onload = function () { res(fr.result); };
        fr.onerror = function () { res(''); };
        fr.readAsDataURL(blob);
      });
      if (dataUrl && dataUrl.length <= budget) {
        r.thumbnailData = dataUrl;
        budget -= dataUrl.length;
      }
    } catch (e) { /* CORS 或网络失败 → 前端回退用 thumbnail URL */ }
  }));

  return JSON.stringify({
    count: out.length,
    results: out,
    pageUrl: location.href,
    // 命中检测（方便自检）
    bodyHasPixiv: /pixiv\\.net/.test(document.body.innerHTML),
  });
})()`;

/* ──── CDP 单条连接封装 ──── */
function connectWS(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.addEventListener('open', () => resolve(ws), { once: true });
    ws.addEventListener('error', () => reject(new Error('CDP WebSocket 连接失败')), { once: true });
  });
}

/* ──── 核心：跑一次搜索 ──── */
async function runSearch(filePath, timeoutMs = 75000) {
  const browser = findBrowser();
  if (!browser) {
    return { ok: false, error: '本机未找到 Edge / Chrome，无法执行搜索（SauceNAO 需要浏览器内核绕过 TLS 指纹阻断）。' };
  }

  const port = 9600 + Math.floor(Math.random() * 300);
  const profile = path.join(os.tmpdir(), `sauce-cdp-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  const started = Date.now();

  // 走系统代理（不加 --no-proxy-server）——已实测这是能到达 saucenao 的配置
  const child = spawn(browser, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--window-size=1400,1000',
    '--lang=en-US',
  ], { stdio: 'ignore' });

  let ws = null;
  let killed = false;
  const cleanup = async () => {
    if (killed) return;
    killed = true;
    try { ws?.close(); } catch {}
    try { child.kill('SIGKILL'); } catch {}
    // 删临时 profile（best effort）
    try { await fs.rm(profile, { recursive: true, force: true }); } catch {}
  };

  // 超时看门狗
  const watchdog = setTimeout(() => { cleanup(); }, timeoutMs + 5000);

  try {
    const getJSON = async (url) => (await fetch(url)).json();

    // 等 CDP 端口就绪
    let target = null;
    for (let i = 0; i < 60; i++) {
      if (Date.now() - started > timeoutMs) throw new Error('启动浏览器超时');
      try {
        const list = await getJSON(`http://127.0.0.1:${port}/json/list`);
        target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (target) break;
      } catch {}
      await sleep(250);
    }
    if (!target) throw new Error('浏览器调试端口未就绪');

    ws = await connectWS(target.webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();
    ws.addEventListener('message', (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message || JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const mid = ++id;
      const timer = setTimeout(() => {
        if (pending.has(mid)) { pending.delete(mid); reject(new Error(`CDP ${method} 超时`)); }
      }, 20000);
      pending.set(mid, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      try { ws.send(JSON.stringify({ id: mid, method, params })); }
      catch (e) { clearTimeout(timer); pending.delete(mid); reject(e); }
    });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('DOM.enable');

    const evalJs = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('页面脚本异常: ' + (r.exceptionDetails.text || ''));
      return r.result.value;
    };

    // 1) 打开 saucenao 首页
    await send('Page.navigate', { url: 'https://saucenao.com/' });
    // 等页面完全就绪：必须 readyState=complete 且 file input 存在。
    // 之前在 interactive 阶段就操作，saucenao 的 JS 重渲染会换掉节点，
    // setFileInputFiles 塞进"已脱离文档"的旧节点 → 提交时没带文件 → 永远等不到结果。
    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (Date.now() - started > timeoutMs) break;
      await sleep(500);
      try {
        const st = await evalJs(`JSON.stringify({ ready: document.readyState, has: !!document.querySelector('input[type=file]'), url: location.href })`);
        const o = JSON.parse(st);
        if (/^chrome-error/i.test(o.url)) {
          // 加载直接失败（代理节点抖动）——立刻交给上层重试，不空等
          throw new Error('RETRYABLE:首页加载失败（chrome-error，代理节点不稳定）');
        }
        if (o.ready === 'complete' && o.has) { ready = true; break; }
      } catch (e) {
        if (/RETRYABLE/.test(e.message)) throw e;
        /* 导航中上下文销毁，继续等 */
      }
    }
    if (!ready) {
      const t = await evalJs('document.title + " | " + location.href').catch(() => '');
      throw new Error(`RETRYABLE:无法加载 saucenao.com（${t || '页面空白'}）。多半是系统代理的海外节点当前不可用。`);
    }
    await sleep(800); // 让页面脚本彻底静默

    // 2) 把图片塞进 file input（塞完校验 files.length，失败就换新 document 重试）
    let fileSet = false;
    for (let attempt = 0; attempt < 3 && !fileSet; attempt++) {
      const doc = await send('DOM.getDocument', { depth: -1, pierce: true });
      const q = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type=file]' });
      if (!q.nodeId) { await sleep(600); continue; }
      try {
        await send('DOM.setFileInputFiles', { files: [filePath], nodeId: q.nodeId });
      } catch { await sleep(600); continue; }
      await sleep(400);
      const n = await evalJs(`document.querySelector('input[type=file]')?.files?.length || 0`);
      fileSet = Number(n) === 1;
      if (!fileSet) await sleep(600);
    }
    if (!fileSet) throw new Error('无法把图片交给 saucenao 的文件输入框（页面结构可能已变化）');

    // 3) 提交表单
    await evalJs(`(function(){
      var inp = document.querySelector('input[type=file]');
      var f = inp && inp.form;
      if (f) { f.submit(); }
    })()`);

    // 4) 轮询结果页
    let extracted = null;
    let lastLog = '';
    for (let i = 0; i < 60; i++) {
      if (Date.now() - started > timeoutMs) throw new Error('等待搜索结果超时');
      await sleep(1500);
      let st;
      try {
        st = JSON.parse(await evalJs(`JSON.stringify({ url: location.href, ready: document.readyState, n: document.querySelectorAll('.result .resulttable').length, title: document.title })`));
      } catch { continue; }
      const logLine = `[${i}] ${st.ready} ${st.url.slice(0, 60)} n=${st.n}`;
      if (logLine !== lastLog) { console.log('  [saucenao-cdp]', logLine); lastLog = logLine; }

      // 提交后代理断流 → 页面变 chrome-error：立即失败交给上层重试，不空等
      if (/^chrome-error/i.test(st.url)) {
        throw new Error('RETRYABLE:搜索提交后网络中断（chrome-error，代理节点不稳定）');
      }

      // search.php 结果页出现 .resulttable 即可提取
      if (/search\.php/.test(st.url) && st.n > 0) {
        await sleep(600); // 让 DOM 稳定
        const raw = await evalJs(EXTRACT_JS);
        extracted = JSON.parse(raw);
        break;
      }
      // search.php 加载完成但没有结果：抓页面文字判断原因（限流/无文件/真没结果）
      if (/search\.php/.test(st.url) && st.ready === 'complete' && st.n === 0) {
        await sleep(1200); // 再给一次机会（有的结果晚于 DOM ready）
        const recheck = JSON.parse(await evalJs(`JSON.stringify({ n: document.querySelectorAll('.result .resulttable').length })`));
        if (recheck.n === 0) {
          const bodyText = await evalJs('document.body ? document.body.innerText.replace(/\\s+/g, " ").slice(0, 400) : ""').catch(() => '');
          if (/too many|rate.?limit|error|denied|flood|wait/i.test(bodyText)) {
            throw new Error('SauceNAO 拒绝了本次搜索（限流或出错）：' + bodyText.slice(0, 200));
          }
          // 页面正常但没有匹配
          extracted = { count: 0, results: [], pageUrl: st.url, bodyHasPixiv: false, note: bodyText.slice(0, 200) };
          break;
        }
      }
      // 表单提交后被弹回首页 = 提交没被接受，值得重试一次
      if (i > 6 && /saucenao\.com\/?$/.test(st.url) && st.ready === 'complete') {
        throw new Error('RETRYABLE:提交后被弹回首页，上传可能未被接受');
      }
    }

    if (!extracted) throw new Error('RETRYABLE:未获取到结果页（超时或页面结构变化）');

    return {
      ok: true,
      results: extracted.results,
      count: extracted.count,
      pageUrl: extracted.pageUrl,
      elapsedMs: Date.now() - started,
    };
  } catch (err) {
    return { ok: false, error: String(err?.message || err), elapsedMs: Date.now() - started };
  } finally {
    clearTimeout(watchdog);
    await cleanup();
  }
}

/**
 * 对外主入口：串行执行搜索，网络类失败自动重试。
 * 代理节点不稳定是常态（实测时好时坏），一次失败不代表搜不了。
 * @param {{ filePath: string, timeoutMs?: number, attempts?: number }} opts
 */
export function searchSauceNAO(opts) {
  return enqueue(async () => {
    const attempts = Math.max(1, opts.attempts || 3);
    const perAttemptTimeout = opts.timeoutMs || 40000;
    let last = null;
    for (let i = 1; i <= attempts; i++) {
      last = await runSearch(opts.filePath, perAttemptTimeout);
      if (last.ok) {
        if (i > 1) console.log(`  [saucenao-cdp] 第 ${i} 次尝试成功`);
        return { ...last, attempts: i };
      }
      const retryable = /RETRYABLE/i.test(last.error || '');
      // 对外的错误信息去掉内部标记
      last.error = (last.error || '').replace(/^RETRYABLE:/, '');
      if (!retryable || i === attempts) break;
      console.log(`  [saucenao-cdp] 第 ${i} 次尝试失败（${last.error.slice(0, 70)}），2 秒后重试…`);
      await sleep(2000);
    }
    return last;
  });
}

export { findBrowser as sauceFindBrowser };
export default searchSauceNAO;
