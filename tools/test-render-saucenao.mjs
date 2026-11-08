#!/usr/bin/env node
/**
 * tools/test-render-saucenao.mjs — 结果态渲染验证（不依赖代理）
 * 注入昨晚真实搜索返回的数据（missile228 / pixiv #147357244 + 真实原图缩略 base64），
 * 验证：结果行渲染 / 相似度黄块 / 平台 tag / 链接按钮 / chips 过滤 / 对照条 / 截图。
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));
if (!EDGE) { console.error('未找到 Edge'); process.exit(1); }

const thumbB64 = await fs.readFile('D:\\fish-temple\\tools\\thumb-b64.txt', 'utf8');

// 昨晚真实搜索返回的数据（tools/e2e 输出原样重构）
const REAL_DATA = {
  ok: true, count: 4, elapsedMs: 13983, attempts: 1,
  results: [
    {
      similarity: 91.3, thumbnail: 'https://img3.saucenao.com/booru/d/f/dfccbf4dcd0d329853f7f3cccb9d11a8_1.jpg',
      thumbnailData: `data:image/jpeg;base64,${thumbB64}`,
      dbId: 12, indexName: 'Yande.re', title: 'Creator: missile228',
      creator: 'missile228', member: '', author: '', source: 'pixiv #147357244', material: 'original', characters: '',
      primaryUrl: 'https://www.pixiv.net/member_illust.php?mode=medium&illust_id=147357244', primaryLabel: 'pixiv #147357244',
      sourceSite: 'Pixiv', sourceIcon: '🎨', sourceColor: '#0096FA',
      links: [
        { url: 'https://danbooru.donmai.us/post/show/11815916', label: 'danbooru.donmai.us' },
        { url: 'https://yande.re/post/show/1266085', label: 'yande.re' },
        { url: 'https://www.pixiv.net/member_illust.php?mode=medium&illust_id=147357244', label: 'pixiv #147357244' },
      ],
      hidden: false,
    },
    {
      similarity: 34.79, thumbnail: '', dbId: 20, indexName: 'MediBang', title: '月猫',
      creator: '', member: '小抹茶', author: '', source: '', material: '', characters: '',
      primaryUrl: 'https://medibang.com/picture/xf1702141908076070002344208', primaryLabel: '月猫',
      sourceSite: 'MediBang', sourceIcon: '🖊', sourceColor: '#00C853',
      links: [{ url: 'https://medibang.com/picture/xf1702141908076070002344208', label: '月猫' }, { url: 'https://medibang.com/author/2344208', label: '小抹茶' }],
      hidden: true,
    },
    {
      similarity: 34.05, thumbnail: '', dbId: 5, indexName: 'pixiv', title: '竜の魔女',
      creator: '', member: 'Lasy', author: '', source: 'pixiv ID: 62264742', material: '', characters: '',
      primaryUrl: 'https://www.pixiv.net/member_illust.php?mode=medium&illust_id=62264742', primaryLabel: '62264742',
      sourceSite: 'Pixiv', sourceIcon: '🎨', sourceColor: '#0096FA',
      links: [{ url: 'https://www.pixiv.net/member_illust.php?mode=medium&illust_id=62264742', label: '62264742' }, { url: 'https://www.pixiv.net/member.php?id=2816131', label: 'Lasy' }],
      hidden: true,
    },
    {
      similarity: 33.42, thumbnail: '', dbId: 38, indexName: 'ArtStation', title: 'Burgomaster Arawak',
      creator: '', member: '', author: 'CherryMasterArt', source: '', material: '', characters: '',
      primaryUrl: 'https://www.artstation.com/artwork/VgVJrZ', primaryLabel: 'VgVJrZ',
      sourceSite: 'ArtStation', sourceIcon: '🖌', sourceColor: '#13AFF0',
      links: [{ url: 'https://www.artstation.com/artwork/VgVJrZ', label: 'VgVJrZ' }, { url: 'https://www.artstation.com/isabelpico', label: 'CherryMasterArt' }],
      hidden: true,
    },
  ],
};

const PORT = 9460 + Math.floor(Math.random() * 380);
const profile = path.join(os.tmpdir(), `ui-render-${Date.now()}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--window-size=1440,1500',
], { stdio: 'ignore' });

const getJSON = async (url) => (await fetch(url)).json();
let ws, mid = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++mid;
  const timer = setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`${method} 超时`)); } }, 60000);
  pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
  ws.send(JSON.stringify({ id, method, params }));
});

async function shot(name) {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(`D:\\fish-temple\\.shots\\${name}.png`, Buffer.from(s.data, 'base64'));
  console.log(`[render] 截图 → .shots/${name}.png`);
}

async function main() {
  let target = null;
  for (let i = 0; i < 40; i++) {
    try {
      const list = await getJSON(`http://127.0.0.1:${PORT}/json/list`);
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (target) break;
    } catch {}
    await sleep(250);
  }
  if (!target) throw new Error('CDP 未就绪');

  ws = new WebSocket(target.webSocketDebuggerUrl);
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  });
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  await send('Page.enable');
  await send('Runtime.enable');
  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __err: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
    return r.result.value;
  };

  await send('Page.navigate', { url: 'http://localhost:5173/#/saucenao' });
  await sleep(4000);

  // 1) stub 搜索接口（返回昨晚真实数据）+ 注入图片
  const stub = await evalJs(`(async function(){
    window.__SAUCE_STUB__ = ${JSON.stringify(JSON.stringify(REAL_DATA))};
    const origFetch = window.fetch.bind(window);
    window.fetch = function(url, opts) {
      if (String(url).includes('/api/saucenao/search')) {
        return Promise.resolve(new Response(window.__SAUCE_STUB__, { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return origFetch(url, opts);
    };
    const r = await origFetch('/tools/test-small.jpg');
    const file = new File([await r.blob()], 'missile228-test.jpg', { type: 'image/jpeg' });
    const dt = new DataTransfer(); dt.items.add(file);
    const input = document.querySelector('#sauce-file');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return 'stubbed+injected';
  })()`);
  console.log('[render] 注入:', stub);
  await sleep(2500);

  // 2) 点搜索（走 stub，秒回）
  await evalJs(`document.querySelector('#sauce-go').click(); 'ok'`);
  await sleep(2500);

  // 3) 验证默认渲染（低相似隐藏 → 只有 1 条）
  const s1 = await evalJs(`JSON.stringify((function(){
    const hits = [...document.querySelectorAll('.sauce-hit')];
    const top = hits[0];
    const img = top?.querySelector('.sauce-hit__thumb img');
    const simEl = top?.querySelector('.sauce-hit__sim');
    return {
      hits: hits.length,
      cmpVisible: !document.querySelector('#sauce-cmp')?.hidden,
      cmpCount: document.querySelector('#sauce-cmp-count')?.textContent,
      countText: document.querySelector('#sauce-count')?.textContent,
      limitText: document.querySelector('#sauce-limit')?.textContent,
      metaStatus: document.querySelector('#sauceStatus')?.textContent,
      metaMatches: document.querySelector('#sauceMatches')?.textContent,
      top1: {
        sim: top?.querySelector('.sauce-hit__sim b')?.textContent,
        simClass: simEl?.className,
        simBg: simEl ? getComputedStyle(simEl).backgroundColor : '',
        tag: top?.querySelector('.tag')?.textContent.trim(),
        tagClass: top?.querySelector('.tag')?.className,
        indexTag: top?.querySelectorAll('.tag')[1]?.textContent.trim(),
        title: top?.querySelector('.sauce-hit__title')?.textContent.trim(),
        meta: [...(top?.querySelectorAll('.sauce-hit__meta span') || [])].map(x => x.textContent.trim()),
        primaryText: top?.querySelector('.sauce-hit__links .btn--signal')?.textContent.trim(),
        primaryHref: top?.querySelector('.sauce-hit__links .btn--signal')?.href,
        otherLinks: [...(top?.querySelectorAll('.sauce-hit__links .btn:not(.btn--signal)') || [])].map(b => b.textContent.trim()),
        thumbLoaded: img ? (img.complete && img.naturalWidth > 0) : false,
        thumbIsData: img ? img.src.startsWith('data:') : false,
        radius: top ? getComputedStyle(top).borderRadius : '',
      },
    };
  })())`);
  console.log('[render] 默认态:', s1);
  await shot('saucenao-results');

  // 4) 开「显示低相似结果」→ 应 4 条，低相似带 is-dim
  await evalJs(`document.querySelector('#sauce-opt-hidden').click(); 'ok'`);
  await sleep(600);
  const s2 = await evalJs(`JSON.stringify({
    hits: document.querySelectorAll('.sauce-hit').length,
    dim: document.querySelectorAll('.sauce-hit.is-dim').length,
    phCount: document.querySelectorAll('.sauce-hit__ph:not([hidden])').length,
  })`);
  console.log('[render] 显示低相似:', s2);

  // 5) 再开「只看 Pixiv / X」→ 应 2 条且全 Pixiv
  await evalJs(`document.querySelector('#sauce-opt-only').click(); 'ok'`);
  await sleep(600);
  const s3 = await evalJs(`JSON.stringify({
    hits: document.querySelectorAll('.sauce-hit').length,
    tags: [...document.querySelectorAll('.sauce-hit .tag:first-child')].map(t => t.textContent.trim()),
  })`);
  console.log('[render] 只看 Pixiv/X:', s3);
  await shot('saucenao-results-filtered');

  // 6) 灯箱
  await evalJs(`document.querySelector('#sauce-opt-only').click(); document.querySelector('#sauce-opt-hidden').click(); 'ok'`);
  await sleep(400);
  await evalJs(`document.querySelector('.sauce-hit__zoom')?.click(); 'ok'`);
  await sleep(800);
  const lbState = await evalJs(`JSON.stringify({
    visible: !document.querySelector('#sauce-lb')?.hidden,
    imgOk: (function(){ const i = document.querySelector('#sauce-lb-img'); return i && i.complete && i.naturalWidth > 0; })(),
  })`);
  console.log('[render] 灯箱:', lbState);
  await shot('saucenao-lightbox');
  await evalJs(`document.querySelector('#sauce-lb-close').click(); 'ok'`);

  ws.close();
  child.kill();
  process.exit(0);
}

main().catch((e) => { console.error('[render] 失败:', e.message); try { child.kill(); } catch {} process.exit(1); });
setTimeout(() => { console.error('[render] 总超时'); try { child.kill(); } catch {} process.exit(1); }, 120000);
