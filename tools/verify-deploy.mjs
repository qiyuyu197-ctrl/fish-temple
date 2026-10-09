#!/usr/bin/env node
/**
 * tools/verify-deploy.mjs — 部署形态自检（Netlify / 任何静态托管 + Functions）
 * ------------------------------------------------------------------
 * 本地 `node server.mjs` 全绿 ≠ 线上能用：线上没有那个 Node 进程，
 * 「需要访问外部网站」的功能全靠 netlify/functions/api.mjs。
 * 这个脚本专门验**部署形态**，分两层：
 *
 *   ① 函数层：直接打 /api/*，看 Netlify 上该有的行为对不对
 *      （只读、CDN 缓存头、音频 302、SSRF 防线…）
 *   ② 客户端层：开真浏览器跑一遍「随机插画（PIXIV）/ 音乐台搜索 / 黄历吉日之歌」，
 *      确认它们在这个形态下**真的能出图、能放歌**，而不是只回了个 200
 *
 * 用法：
 *   node tools/netlify-dev.mjs 5199      # 另开一个终端：本地仿真 Netlify
 *   node tools/verify-deploy.mjs http://127.0.0.1:5199
 *
 * 直接对线上跑也行（同一个脚本）：
 *   node tools/verify-deploy.mjs https://你的站点.netlify.app
 *
 * 退出码：0 = 全部通过，1 = 有失败项。
 */

import { spawn } from 'node:child_process';
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.argv[2] || 'http://127.0.0.1:5199').replace(/\/$/, '');
const OUT = path.join(ROOT, '.shots');

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? '\x1b[32m PASS\x1b[0m' : '\x1b[31m FAIL\x1b[0m'} ${name}${detail ? `  \x1b[90m${detail}\x1b[0m` : ''}`);
  return !!ok;
};

const get = async (p, init) => {
  const res = await fetch(`${BASE}${p}`, init);
  const text = await res.text().catch(() => '');
  let json = null;
  try { json = JSON.parse(text); } catch { /* 不是 JSON（比如图片） */ }
  return { res, text, json };
};

async function maybeConnect() {
  const port = 9300 + Math.floor(Math.random() * 200);
  const profile = path.join(os.tmpdir(), `ft-deploy-${Date.now()}`);
  const child = spawn(EDGE, [
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required', '--window-size=1360,900',
    `${BASE}/#/gallery`,
  ], { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (target) break;
    } catch { /* 还没起来 */ }
    await sleep(250);
  }
  if (!target) throw new Error('调试端口未就绪');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', () => rej(new Error('WebSocket 连接失败')), { once: true });
  });

  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push(String(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '').slice(0, 200));
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    const t = setTimeout(() => { pending.delete(mid); reject(new Error(`CDP 超时：${method}`)); }, 40000);
    pending.set(mid, {
      resolve: (v) => { clearTimeout(t); resolve(v); },
      reject: (e) => { clearTimeout(t); reject(e); },
    });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  await send('Runtime.enable');

  const evalPage = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __error: r.exceptionDetails.text };
    return r.result?.value;
  };

  return { child, profile, ws, errors, evalPage, send, close: () => { try { ws.close(); } catch { /* noop */ } child.kill(); } };
}

async function main() {
  console.log(`\n\x1b[1m部署形态自检\x1b[0m  ${BASE}\n`);

  /* ---------------- ① 函数层 ---------------- */
  const health = await get('/api/health').catch((e) => ({ error: e }));
  if (health.error) {
    check('服务器可达', false, String(health.error));
    console.log('\n\x1b[31m站点打不开，后面的检查没法做。\x1b[0m');
    return;
  }
  check('服务器可达', health.res.ok === true, `HTTP ${health.res.status}`);
  const h = health.json || {};
  check('部署形态：/api/* 由 Functions 提供（不是本地 server.mjs）',
    h.deploy === 'netlify', `deploy=${h.deploy}`);
  check('只读部署：readonly=true / writable=false（没有可写磁盘）',
    h.readonly === true && h.writable === false, `readonly=${h.readonly} writable=${h.writable}`);
  check('代理能力清单里带着 audio 端点',
    (h.netease?.endpoints || []).includes('audio') && (h.pixiv?.endpoints || []).includes('image'),
    JSON.stringify({ netease: h.netease?.endpoints, pixiv: h.pixiv?.endpoints }));

  // Pixiv 抽卡（浏览器直连上游会被 CORS 挡掉，只能靠这个接口）
  const rnd = await get('/api/pixiv/random?num=4&r18=0');
  const items = rnd.json?.items || [];
  check('Pixiv 抽卡接口返回作品', rnd.res.ok && items.length > 0, `count=${items.length}`);
  check('抽到的是**站内代理**地址（不是 pixiv.re 原始地址）',
    items.length > 0 && items.every((it) => String(it.url).startsWith('/api/pixiv/image?')),
    String(items[0]?.url || '').slice(0, 70));

  // 图片代理 + CDN 缓存头（线上没有磁盘缓存，靠边缘缓存）
  if (items[0]) {
    const img = await fetch(`${BASE}${items[0].url}`);
    const buf = Buffer.from(await img.arrayBuffer());
    check('图片代理真的能取到图（image/jpeg）',
      img.ok && /^image\//.test(img.headers.get('content-type') || '') && buf.length > 512,
      `${img.status} ${img.headers.get('content-type')} ${buf.length}B`);
    check('图片响应带 CDN 缓存指令（替代本地磁盘缓存）',
      !!img.headers.get('netlify-cdn-cache-control'), String(img.headers.get('netlify-cdn-cache-control') || '—'));
  }
  const ssrf = await get('/api/pixiv/image?url=https%3A%2F%2Fexample.com%2Fx.jpg');
  check('图片代理不是开放代理（非白名单域名 400）', ssrf.res.status === 400, `HTTP ${ssrf.res.status}`);

  // 网易云：搜索 + 歌词 + 音频
  const search = await get('/api/netease/search?q=%E5%A4%9C%E8%88%AA%E6%98%9F&limit=3');
  check('网易云搜索接口可用', search.res.ok && (search.json?.songs || []).length > 0,
    `${(search.json?.songs || []).length} 条`);
  const lyric = await get('/api/netease/lyric?id=347230');
  check('歌词接口可用', lyric.res.ok && lyric.json?.ok !== false, `HTTP ${lyric.res.status}`);

  // 音频：Serverless 下不搬音频，回 302 让浏览器直连 CDN（Range / 拖动由 CDN 负责）
  const audio = await fetch(`${BASE}/api/netease/audio?id=1345751384`, { redirect: 'manual' });
  const loc = audio.headers.get('location') || '';
  check('音频接口：302 到网易云 CDN（不在函数里搬音频）',
    audio.status === 302 && /^https:\/\/[\w.-]*music\.126\.net\//.test(loc),
    `${audio.status} → ${loc.slice(0, 52)}…`);

  // 内容写入：只读部署要明确拒绝，而不是假装成功
  const write = await fetch(`${BASE}/api/content/posts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '自检' }),
  });
  const writeJson = await write.json().catch(() => ({}));
  check('内容写入被明确拒绝（501 + 说明文案）',
    write.status === 501 && /只读/.test(String(writeJson.error || '')), `HTTP ${write.status}`);

  // 静态资源：相册清单与图片（这两样坏掉就会被说成"随机相册不能用"）
  const album = await get('/data/album.json');
  check('相册清单是 JSON（没有被 SPA 通配回退改成 HTML）',
    album.res.ok && Array.isArray(album.json?.items) && album.json.items.length > 0,
    `${album.json?.items?.length || 0} 条`);
  const first = album.json?.items?.[0];
  if (first) {
    const pic = await fetch(`${BASE}/${String(first.url).replace(/^\//, '')}`);
    check('相册图片可直接访问（大小写与路径一致）',
      pic.ok && Number(pic.headers.get('content-length') || 0) > 1024,
      `${pic.status} ${pic.headers.get('content-length')}B`);
  }

  /* ---------------- ② 客户端层（真浏览器） ---------------- */
  if (!EDGE) {
    check('找到 Chromium 内核浏览器（客户端层检查）', false, '未找到 Edge/Chrome');
    return;
  }
  const page = await maybeConnect();
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      const r = await page.evalPage(`!!window.Terminal?.Stage`);
      if (r === true) { ready = true; break; }
      await sleep(500);
    }
    check('站点在部署形态下正常启动', ready);
    if (!ready) return;

    // 插画：显式走 PIXIV 源，看是否真的抽到并加载出一张图。
    //   · 进画廊时页面自己会先抽一张，Stage.busy 期间 random() 直接返回 null ——
    //     所以先等它抽完，再把 null 当成"重试"而不是失败；
    //   · pixiv.re 并非每张图都还在（上游会 404），抽坏一张不算功能坏，
    //     判据是"通过站内代理能出图"，两次都失败才算不过，并把 HTTP 状态记下来。
    const pixivDraw = await page.evalPage(`(async () => {
      const S = window.Terminal.Stage;
      const nap = (ms) => new Promise((r) => setTimeout(r, ms));
      const draw = async (id) => {
        for (let i = 0; i < 60 && S.busy; i++) await nap(250);
        for (let i = 0; i < 5; i++) {
          const rec = await S.random({ provider: id });
          if (rec) return rec;
          await nap(500);
        }
        return null;
      };
      const attempt = async (rec) => {
        const out = { url: rec.url, source: rec.source, title: rec.title };
        try {
          const r = await fetch(rec.url);
          out.status = r.status;
          out.ct = r.headers.get('content-type');
          out.bytes = (await r.arrayBuffer()).byteLength;
        } catch (e) { out.fetchError = String(e.message || e); }
        out.loaded = await new Promise((res) => {
          const i = new Image();
          const t = setTimeout(() => res(false), 12000);
          i.onload = () => { clearTimeout(t); res(i.naturalWidth > 0); };
          i.onerror = () => { clearTimeout(t); res(false); };
          i.src = rec.url;
        });
        return out;
      };
      const rec1 = await draw('pixiv');
      if (!rec1) return { ok: false, why: 'random() 一直是 null（Stage.busy?）' };
      const first = await attempt(rec1);
      if (first.loaded) return { ok: true, proxied: String(first.url).startsWith('/api/pixiv/image?'), first };
      const rec2 = await draw('pixiv');
      const second = rec2 ? await attempt(rec2) : null;
      return { ok: !!second?.loaded, proxied: String(first.url).startsWith('/api/pixiv/image?'), first, second };
    })()`);
    check('客户端：随机插画（PIXIV 源）抽到了站内代理地址的图',
      pixivDraw?.proxied === true, String(pixivDraw?.first?.url || pixivDraw?.why || '').slice(0, 70));
    check('客户端：这张图在浏览器里真的显示出来了（不是 404/破图）',
      pixivDraw?.ok === true,
      JSON.stringify({ first: pixivDraw?.first && { status: pixivDraw.first.status, loaded: pixivDraw.first.loaded, bytes: pixivDraw.first.bytes }, second: pixivDraw?.second && { status: pixivDraw.second.status, loaded: pixivDraw.second.loaded, bytes: pixivDraw.second.bytes } }));

    // 本地相册源：离线可用，不受部署形态影响
    const albumDraw = await page.evalPage(`(async () => {
      const S = window.Terminal.Stage;
      const nap = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 60 && S.busy; i++) await nap(250);
      let rec = null;
      for (let i = 0; i < 5 && !rec; i++) { rec = await S.random({ provider: 'album' }); if (!rec) await nap(500); }
      if (!rec) return { ok: false, why: 'random() 一直是 null' };
      const loaded = await new Promise((res) => {
        const i = new Image();
        i.onload = () => res(i.naturalWidth > 0);
        i.onerror = () => res(false);
        i.src = rec.url;
      });
      return { ok: true, url: rec.url, source: rec.source, loaded };
    })()`);
    check('客户端：随机相册（album 源）可用',
      albumDraw?.ok === true && albumDraw?.loaded === true,
      `${String(albumDraw?.url || albumDraw?.why || '').slice(0, 60)} loaded=${albumDraw?.loaded}`);

    // 音乐台：应显示 PROXY ONLINE 并能搜到歌
    await page.evalPage(`location.hash = '#/music'`);
    await sleep(2600);
    const music = await page.evalPage(`(async () => {
      const mod = await import('/src/plugins/netease.js');
      const out = {
        tag: document.getElementById('metaApi')?.textContent || '',
        inputDisabled: document.getElementById('neInput')?.disabled ?? null,
      };
      try { const s = await mod.search('海阔天空', { limit: 3 }); out.songs = (s.songs || []).length; }
      catch (e) { out.searchError = String(e.message || e); }
      return out;
    })()`);
    check('客户端：音乐台显示代理在线、搜索输入可用',
      /ONLINE/.test(music?.tag || '') && music?.inputDisabled === false,
      `tag=${music?.tag} disabled=${music?.inputDisabled}`);
    check('客户端：站内搜索能拿到曲目', (music?.songs || 0) > 0, `songs=${music?.songs} ${music?.searchError || ''}`);

    // 黄历吉日之歌：走 /api/netease/audio（线上是 302 → CDN），要真的放起来
    const anthem = await page.evalPage(`(async () => {
      window.Terminal.AlmanacUI.open();
      await new Promise((r) => setTimeout(r, 900));
      const input = document.getElementById('almanacDate');
      input.value = '2026-10-10';                     // 已知吉日
      document.getElementById('almanacGo').click();
      await new Promise((r) => setTimeout(r, 3600));
      const a = document.getElementById('anthem');
      return {
        days: document.querySelectorAll('.almanac__day').length,
        lucky: !!document.querySelector('.almanac__day.is-lucky'),
        playing: a ? !a.paused : false,
        time: a ? Number(a.currentTime.toFixed(2)) : 0,
        duration: a ? Number((a.duration || 0).toFixed(1)) : 0,
      };
    })()`);
    check('客户端：黄历在部署形态下判出吉日并播放吉日之歌',
      anthem?.days >= 1 && anthem?.lucky === true && anthem?.playing === true && (anthem?.time || 0) > 0.5,
      JSON.stringify(anthem));

    // 顺手截一张画廊：人工确认「随机插画」出的那张图是好的
    await page.evalPage(`(async () => {
      window.Terminal.AlmanacUI.close();
      window.Terminal.Almanac.anthem.stop();
      location.hash = '#/gallery';
      await new Promise((r) => setTimeout(r, 1800));
      return true;
    })()`);
    await page.send('Page.enable');
    const shot = await page.send('Page.captureScreenshot', { format: 'png' });
    await fs.mkdir(OUT, { recursive: true });
    const shotFile = path.join(OUT, 'verify-deploy-gallery.png');
    await fs.writeFile(shotFile, Buffer.from(shot.data, 'base64'));
    console.log(`\x1b[90m截图：${path.relative(ROOT, shotFile)}  (画廊 · 部署形态)\x1b[0m`);

    check('客户端：没有未捕获异常', page.errors.length === 0, page.errors.slice(0, 2).join(' | '));
  } finally {
    page.close();
    await fs.rm(page.profile, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => {
  console.error('\n\x1b[31m自检中断\x1b[0m', err?.message || err);
  process.exitCode = 1;
}).finally(() => {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n\x1b[1m结果\x1b[0m  通过 ${results.length - failed.length} / ${results.length}`);
  if (failed.length) {
    console.log('\x1b[31m未通过：\x1b[0m');
    failed.forEach((f) => console.log(`  · ${f.name}${f.detail ? `  (${f.detail})` : ''}`));
  }
  setTimeout(() => process.exit(failed.length || process.exitCode ? 1 : 0), 300);
});
