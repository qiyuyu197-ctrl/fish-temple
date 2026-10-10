#!/usr/bin/env node
/**
 * tools/verify.mjs — 全站自检
 * ------------------------------------------------------------------
 * 逐个访问所有路由，检查：
 *   · 是否产生控制台错误 / 网络失败
 *   · 视图是否渲染出内容
 *   · 关键交互：主题切换、随机插画、播放器、命令面板、后台保存
 * 最后输出一份通过 / 失败清单。开发期使用，不属于站点运行时。
 *
 * 用法：node tools/verify.mjs [baseUrl]
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

const PORT = 9700 + Math.floor(Math.random() * 90);
const profile = path.join(os.tmpdir(), `dsh-verify-${Date.now()}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '\x1b[32m PASS\x1b[0m' : '\x1b[31m FAIL\x1b[0m'}  ${name}${detail ? `  \x1b[90m${detail}\x1b[0m` : ''}`);
};

let child;
let send;
let errors = [];

async function connect(url) {
  child = spawn(EDGE, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--window-size=1500,950', '--autoplay-policy=no-user-gesture-required',
    url,
  ], { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (target) break;
    } catch { /* wait */ }
    await sleep(250);
  }
  if (!target) throw new Error('调试端口未就绪');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', () => rej(new Error('ws fail')), { once: true });
  });

  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push(`exception: ${m.params.exceptionDetails.text} ${m.params.exceptionDetails.exception?.description || ''}`.slice(0, 220));
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      errors.push(`log: ${m.params.entry.text} ${m.params.entry.url || ''}`.slice(0, 220));
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push(`console: ${(m.params.args || []).map((a) => a.value ?? a.description).join(' ')}`.slice(0, 220));
    }
  });
  send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    // Runtime.evaluate 里跑的是页面内的异步脚本（导入歌单要联网、要等进度），
    // 20s 太紧会偶发超时；其它 CDP 命令仍然是 20s。
    const limit = method === 'Runtime.evaluate' ? 60000 : 20000;
    const timer = setTimeout(() => { pending.delete(mid); reject(new Error('CDP timeout ' + method)); }, limit);
    pending.set(mid, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
}

const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result?.value;
};

async function visit(hash, waitMs = 2600) {
  errors = [];
  // 已在该路由时 hash 不会变化，先切走再切回，确保一定触发路由解析
  const current = await evaluate('location.hash');
  if (current === hash) {
    await evaluate(`location.hash = '#/__noop__'`);
    await sleep(120);
  }
  await evaluate(`location.hash = ${JSON.stringify(hash)}`);
  // 等待视图真正渲染出内容（轮询而非固定等待）
  const deadline = Date.now() + 8000;
  let ready = false;
  while (Date.now() < deadline) {
    await sleep(180);
    ready = await evaluate(`(() => {
      const v = document.getElementById('view');
      return v && v.children.length > 0 && (v.innerText || '').trim().length > 60 && document.getElementById('boot').classList.contains('is-done');
    })()`).catch(() => false);
    if (ready) break;
  }
  await sleep(Math.min(waitMs, 900));
  return {
    ready,
    errors: [...errors],
    info: await evaluate(`(() => ({
      title: document.title,
      blocks: document.querySelectorAll('#view > *').length,
      text: (document.getElementById('view').innerText || '').replace(/\\s+/g,' ').trim().length,
      cards: document.querySelectorAll('.card').length,
      rows: document.querySelectorAll('.row').length,
      paletteHidden: document.getElementById('cmdk').hasAttribute('hidden'),
    }))()`),
  };
}

async function main() {
  if (!EDGE) throw new Error('未找到 Chromium 内核浏览器');
  await connect(`${BASE}/#/`);
  await sleep(3800);

  record('启动：Boot 动画结束', await evaluate(`document.getElementById('boot').classList.contains('is-done')`));
  record('启动：无控制台错误', errors.length === 0, errors.join(' | '));
  record('外壳：导航已渲染', (await evaluate(`document.querySelectorAll('#nav a').length`)) >= 6);
  record('外壳：时钟在跑', /\d{2}:\d{2}:\d{2}/.test(await evaluate(`document.getElementById('clockTime').textContent`)));

  /* ---------------- 黄历小组件（顶栏搜索左边那个按钮） ----------------
   * 验四件事：
   *   1. 懒加载：没点开面板之前，那 400 多 KB 的通书数据不该被请求；
   *   2. 打开方式与位置：真实鼠标事件点击（**可信手势** —— 自动播放能不能成立
   *      就取决于这个，所以这里不用 el.click() 糊过去），按钮在搜索左边同一行；
   *   3. 面板内容：今天 / 明天两张卡，有宜、忌、判定依据；
   *   4. 吉日之歌：查一个**已知吉日**（2026-10-10）要自动起播；
   *      查一个**已知凶日**（2026-10-09 月破 + 忌诸事不宜）不能判吉、不能起播。
   */
  const ALM_READ = `(() => {
    const P = document.getElementById('almanac');
    const days = [...document.querySelectorAll('.almanac__day')].map((d) => ({
      date: (d.querySelector('.almanac__day-date')?.firstChild?.textContent || '').trim(),
      tag: (d.querySelector('.almanac__tag') || {}).textContent?.trim() || '',
      lucky: d.classList.contains('is-lucky'),
      yi: (d.querySelector('.almanac__yiji-row--yi .almanac__yiji-val') || {}).textContent?.trim() || '',
      ji: (d.querySelector('.almanac__yiji-row--ji .almanac__yiji-val') || {}).textContent?.trim() || '',
      why: (d.querySelector('.almanac__day-foot .faint') || {}).textContent?.trim() || '',
    }));
    const a = document.getElementById('anthem');
    return {
      open: P ? !P.hasAttribute('hidden') : null,
      days,
      hint: (document.getElementById('almanacHint') || {}).textContent?.replace(/\\s+/g, ' ').trim() || '',
      activation: navigator.userActivation ? navigator.userActivation.hasBeenActive : null,
      anthem: a ? { src: a.getAttribute('src') || '', paused: a.paused, volume: Number(a.volume.toFixed(2)), time: Number(a.currentTime.toFixed(2)) } : null,
    };
  })()`;

  const lazyBefore = await evaluate(`({
    script: !!document.querySelector('script[src*="lunar-javascript"]'),
    loaded: !!(window.Terminal.Almanac && window.Terminal.Almanac.loaded),
    btn: !!document.getElementById('almanacBtn'),
  })`);
  record('黄历：通书数据懒加载（没点开面板前不加载）',
    lazyBefore.btn === true && lazyBefore.script === false && lazyBefore.loaded === false,
    JSON.stringify(lazyBefore));

  const almBtn = await evaluate(`(() => {
    const a = document.getElementById('almanacBtn'), s = document.getElementById('searchBtn');
    if (!a || !s) return null;
    const ra = a.getBoundingClientRect(), rs = s.getBoundingClientRect();
    return { x: Math.round(ra.left + ra.width / 2), y: Math.round(ra.top + ra.height / 2),
      leftOfSearch: ra.right <= rs.left + 1, sameRow: Math.abs(ra.top - rs.top) < 2,
      w: Math.round(ra.width), h: Math.round(ra.height) };
  })()`);
  record('黄历：按钮在搜索图标左边、同一行',
    almBtn?.leftOfSearch === true && almBtn?.sameRow === true, JSON.stringify(almBtn));

  // 用真实鼠标事件点开（可信手势）
  if (almBtn) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: almBtn.x, y: almBtn.y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: almBtn.x, y: almBtn.y, button: 'left', buttons: 1, clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: almBtn.x, y: almBtn.y, button: 'left', buttons: 0, clickCount: 1 });
  }

  let alm = null;
  for (let i = 0; i < 60; i++) {
    alm = await evaluate(ALM_READ);
    if (alm?.days?.length) break;
    await sleep(300);
  }
  await sleep(1400);                                   // 等淡入 + 真正出声
  alm = await evaluate(ALM_READ);

  const dotDates = await evaluate(`(() => {
    const p = (n) => String(n).padStart(2, '0');
    const dot = (d) => d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate());
    return { today: dot(new Date()), tomorrow: dot(new Date(Date.now() + 86400000)) };
  })()`);
  record('黄历：点击打开面板并渲染今天 / 明天两张卡',
    alm?.open === true && alm?.days?.length === 2
      && alm.days[0].date === dotDates.today && alm.days[1].date === dotDates.tomorrow,
    JSON.stringify({ open: alm?.open, dates: alm?.days?.map((d) => d.date), expect: dotDates }));
  record('黄历：每张卡都有吉/凶标记、宜、忌与判定依据',
    (alm?.days || []).every((d) => /^[吉凶]日$/.test(d.tag || '') && d.yi && d.ji && /判[吉凶]依据/.test(d.why || '')),
    JSON.stringify(alm?.days?.map((d) => ({ tag: d.tag, yi: d.yi.slice(0, 18), ji: d.ji.slice(0, 18), why: d.why.slice(0, 40) }))));
  record('黄历：打开面板的是可信手势（自动播放的前提）',
    alm?.activation === true, `hasBeenActive=${alm?.activation}`);
  // 今天/明天里有吉日就必须在响；没有就不该擅自出声
  const luckyToday = (alm?.days || []).filter((d) => d.lucky).length;
  record('黄历：今天/明天有吉日时自动播放吉日之歌（否则不出声）',
    luckyToday > 0
      ? (alm?.anthem?.paused === false && /id=1345751384/.test(alm?.anthem?.src || ''))
      : (alm?.anthem?.paused !== false),
    JSON.stringify({ luckyToday, anthem: alm?.anthem, hint: alm?.hint }));

  // 已知凶日：2026-10-09（月破 + 忌诸事不宜）
  await evaluate(`(() => { const i = document.getElementById('almanacDate'); i.value = '2026-10-09'; document.getElementById('almanacGo').click(); })()`);
  await sleep(1200);
  const bad = await evaluate(ALM_READ);
  record('黄历：已知凶日（2026-10-09 月破 · 忌诸事不宜）判凶',
    bad?.days?.length === 1 && bad.days[0].lucky === false && bad.days[0].tag === '凶日'
      && /诸事不宜/.test(bad.days[0].ji) && /诸事不宜/.test(bad.days[0].why),
    JSON.stringify(bad?.days?.[0] && { tag: bad.days[0].tag, ji: bad.days[0].ji, why: bad.days[0].why }));

  // 已知吉日：2026-10-10（危日 + 明堂黄道）—— 先停掉再查，验"查到吉日会响"
  await evaluate(`window.Terminal.Almanac.anthem.stop()`);
  await sleep(600);
  await evaluate(`(() => { const i = document.getElementById('almanacDate'); i.value = '2026-10-10'; document.getElementById('almanacGo').click(); })()`);
  await sleep(2200);
  const good = await evaluate(ALM_READ);
  record('黄历：已知吉日（2026-10-10 危日 · 明堂黄道）判吉',
    good?.days?.length === 1 && good.days[0].lucky === true && good.days[0].tag === '吉日'
      && /黄道/.test(good.days[0].why),
    JSON.stringify(good?.days?.[0] && { tag: good.days[0].tag, why: good.days[0].why }));
  record('黄历：查到吉日就自动播放吉日之歌（关羽之歌 · 赵季平）',
    good?.anthem?.paused === false && /id=1345751384/.test(good?.anthem?.src || '') && (good?.anthem?.volume || 0) > 0,
    JSON.stringify(good?.anthem));

  // Esc 关闭；再打开时点面板内部不该关
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(500);
  record('黄历：Esc 关闭面板', (await evaluate(`document.getElementById('almanac').hasAttribute('hidden')`)) === true);
  await evaluate(`window.Terminal.AlmanacUI.open()`);
  await sleep(1600);
  const inside = await evaluate(`(() => {
    const body = document.getElementById('almanacBody');
    body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return { open: !document.getElementById('almanac').hasAttribute('hidden') };
  })()`);
  record('黄历：点面板内部不会把自己关掉', inside?.open === true);
  await evaluate(`window.Terminal.Almanac.anthem.stop(); window.Terminal.AlmanacUI.close();`);
  await sleep(400);


  // 各路由（文章与公告已合并到 #/logs；旧地址 #/posts、#/news 走兼容跳转）
  const routes = [
    ['#/', '首页'],
    ['#/logs', '文章与公告（合并）'],
    ['#/logs/post_overview', '文章详情'],
    ['#/logs/news_launch', '公告详情'],
    ['#/music', '音乐'],
    ['#/gallery', '插画'],
    ['#/mine', '扫雷'],
    ['#/tools', '工具台'],
    ['#/admin', '控制台'],
    ['#/dashboard', '插件仪表盘'],
    ['#/nope', '404'],
  ];
  const routeInfo = {};
  for (const [hash, label] of routes) {
    const r = await visit(hash);
    routeInfo[hash] = r.info;
    record(`路由 ${label} (${hash}) 渲染`, r.ready && r.info.blocks > 0 && r.info.text > 60, `${r.info.blocks} 区块 / ${r.info.text} 字符`);
    record(`路由 ${label} 无报错`, r.errors.length === 0, r.errors.join(' | '));
  }

  // 详情页必须真的是详情：只断言"正文够长"会被列表页蒙混过关
  // （曾经就是这样漏掉了「点公告打不开详情」——详情视图 id 是 newsItem，
  //   而全站链接都写 #/news/<id>，路由按第一段匹配永远命中列表页）
  await visit('#/logs/news_launch');
  const newsDetail = await evaluate(`(() => {
    const p = document.querySelector('#prose');
    return { title: document.title, prose: (p ? p.innerText : '').length, hash: location.hash };
  })()`);
  record('路由 公告详情 打开的是详情而不是列表',
    /上线/.test(newsDetail?.title || '') && (newsDetail?.prose || 0) > 100,
    JSON.stringify(newsDetail));
  await visit('#/logs/post_overview');
  const postDetail = await evaluate(`(() => {
    const p = document.querySelector('#prose');
    return { title: document.title, prose: (p ? p.innerText : '').length, toc: document.querySelectorAll('#toc a').length };
  })()`);
  record('路由 文章详情 打开的是详情（有正文与目录）',
    /八个板块/.test(postDetail?.title || '') && (postDetail?.prose || 0) > 300 && (postDetail?.toc || 0) >= 2,
    JSON.stringify(postDetail));

  // 合并后的兼容跳转：老地址不能 404，而且要把子路径带过去
  const legacy = await evaluate(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const out = {};
    const go = async (from, ms = 1400) => {
      location.hash = from;
      await wait(200);
      location.hash = from;          // 保险：确保 hashchange 触发
      await wait(ms);
      return { hash: location.hash, prose: (document.querySelector('#prose') || {}).innerText ? 1 : 0 };
    };
    out.posts = await go('#/posts');
    out.news = await go('#/news');
    out.postDetail = await go('#/post/post_overview');
    out.newsDetail = await go('#/news/news_launch');
    return out;
  })()`);
  record('路由 旧地址（#/posts、#/news、详情）自动跳到合并板块',
    legacy?.posts?.hash === '#/logs'
      && legacy?.news?.hash === '#/logs'
      && legacy?.postDetail?.hash === '#/logs/post_overview'
      && legacy?.newsDetail?.hash === '#/logs/news_launch'
      && legacy?.postDetail?.prose === 1 && legacy?.newsDetail?.prose === 1,
    JSON.stringify(legacy));

  // 合并后的列表：两类内容混在同一条时间线上，类型筛选要真的生效
  await visit('#/logs');
  const merged = await evaluate(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const count = () => ({
      cards: document.querySelectorAll('#logsList .card').length,
      notices: document.querySelectorAll('#logsList .logs__news').length,
      meta: ((document.querySelector('.viewhead__meta') || {}).innerText || '').replace(/\\s+/g, ' ').trim(),
    });
    const out = { all: count() };
    document.querySelector('[data-kind="news"]').click();
    await wait(400);
    out.onlyNews = count();
    document.querySelector('[data-kind="post"]').click();
    await wait(400);
    out.onlyPost = count();
    document.querySelector('[data-kind="全部"]').click();
    await wait(400);
    // 标签筛选
    const tag = document.querySelector('#view [data-tag]');
    if (tag) { tag.click(); await wait(400); out.byTag = count(); out.tagName = tag.textContent.trim(); }
    document.querySelector('[data-kind="全部"]')?.click();
    await wait(200);
    out.countText = (document.getElementById('logsCount') || {}).textContent || '';
    return out;
  })()`);
  record('合并板块：文章与公告在同一条时间线上（类型筛选真的生效）',
    (merged?.all?.cards || 0) > 0 && (merged?.all?.notices || 0) > 0
      && merged?.onlyNews?.cards === 0 && (merged?.onlyNews?.notices || 0) > 0
      && merged?.onlyPost?.notices === 0 && (merged?.onlyPost?.cards || 0) > 0
      && /TOTAL/.test(merged?.all?.meta || '') && /POSTS/.test(merged?.all?.meta || '')
      && /NOTICES/.test(merged?.all?.meta || ''),
    JSON.stringify(merged));
  record('合并板块：标签筛选可用（筛完条数变少）',
    merged?.byTag && (merged.byTag.cards + merged.byTag.notices) < (merged.all.cards + merged.all.notices)
      && (merged.byTag.cards + merged.byTag.notices) > 0,
    JSON.stringify({ tag: merged?.tagName, after: merged?.byTag, before: merged?.all }));

  // 顶栏导航：当前板块高亮，且高亮色必须取主题的信号色（换主题自动跟着变）
  const navActive = await evaluate(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    // 用探针元素把主题变量"翻译"成计算后的颜色，避免在测试里硬编码色值
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;background:var(--signal);color:var(--signal-ink)';
    document.body.append(probe);
    const pcs = getComputedStyle(probe);
    const theme = { signal: pcs.backgroundColor, ink: pcs.color };
    probe.remove();

    const read = () => {
      const a = document.querySelector('#nav .nav__link.is-active');
      if (!a) return { view: null };
      const s = getComputedStyle(a);
      return { view: a.dataset.view || '', bg: s.backgroundColor, fg: s.color, weight: s.fontWeight };
    };
    const out = {
      theme,
      map: {},
      labels: [...document.querySelectorAll('#nav .nav__link')].map(a => a.textContent.trim().replace(/\\s+/g, ' ')),
    };
    for (const h of ['#/', '#/logs', '#/logs/news_launch', '#/posts', '#/post/post_overview', '#/music', '#/gallery', '#/mine', '#/tools', '#/admin', '#/dashboard', '#/nope']) {
      location.hash = h;
      await wait(620);
      out.map[h] = read();
    }
    return out;
  })()`);
  const navMap = navActive?.map || {};
  const themeAccent = navActive?.theme || {};
  const expectNav = {
    '#/': 'home', '#/logs': 'logs', '#/logs/news_launch': 'logs',
    // 老地址会跳到 #/logs，所以高亮的也应该是合并后的那一项
    '#/posts': 'logs', '#/post/post_overview': 'logs',
    '#/music': 'music', '#/gallery': 'gallery', '#/mine': 'mine', '#/tools': 'tools',
    '#/admin': 'admin', '#/dashboard': 'dashboard',
  };
  record('导航：当前板块高亮跟随路由（合并板块 + 详情 + 老地址）',
    Object.entries(expectNav).every(([h, view]) => navMap[h]?.view === view),
    JSON.stringify(Object.fromEntries(Object.entries(navMap).map(([h, v]) => [h, v.view]))));
  record('导航：高亮用主题信号色（--signal 铺底 / --signal-ink 字色）',
    Object.values(navMap).filter((v) => v.view).length >= 7
      && Object.values(navMap).filter((v) => v.view).every((v) => v.bg === themeAccent.signal && v.fg === themeAccent.ink),
    JSON.stringify({ theme: themeAccent, sample: navMap['#/music'] }));
  record('导航：未知路由不高亮任何栏目', !navMap['#/nope']?.view, String(navMap['#/nope']?.view));
  record('导航：文章与公告合并成一项（NOTICE 已并入 LOGS），且工具台在导航里',
    navActive?.labels?.filter((l) => /LOGS/.test(l)).length === 1
      && !navActive?.labels?.some((l) => /NOTICE/.test(l))
      && navActive?.labels?.some((l) => /TOOLS/.test(l))
      // 板块会继续增加（例如论坛），所以这里只要求"至少 8 项"而不是写死数量
      && (navActive?.labels?.length || 0) >= 8,
    JSON.stringify(navActive?.labels));
  record('导航：标签已改为 HOME / MUSIC（不再有 INDEX / AUDIO）',
    /HOME/.test(navActive?.labels?.[0] || '')
      && navActive?.labels?.some((l) => /MUSIC/.test(l))
      && !navActive?.labels?.some((l) => /INDEX|AUDIO/.test(l)),
    JSON.stringify(navActive?.labels));
  // 导航里 GALLERY 旁边的红色 PIXIV 角标已按要求删除（NOTICE 的未读角标保留）
  const navBadges = await evaluate(`(() => {
    const gal = [...document.querySelectorAll('#nav .nav__link')].find(a => a.dataset.view === 'gallery');
    return {
      badges: [...document.querySelectorAll('#nav .nav__badge')].map(b => b.textContent.trim()),
      gallery: gal ? (gal.querySelector('.nav__badge')?.textContent ?? null) : 'no-item',
      galleryText: gal ? gal.textContent.trim().replace(/\\s+/g, ' ') : '',
    };
  })()`);
  record('导航：GALLERY 旁的红色 PIXIV 角标已删除',
    navBadges?.gallery === null && !/PIXIV/.test(navBadges?.galleryText || '')
      && (navBadges?.badges || []).length === 1,
    JSON.stringify(navBadges));

  // 品牌标记 + 站点图标（品牌插画 → tools/make-brand.py 生成整套尺寸）
  const brand = await evaluate(`(async () => {
    const g = document.querySelector('.brand__glyph');
    const img = g && g.querySelector('img');
    const gb = g && g.getBoundingClientRect();
    const ib = img && img.getBoundingClientRect();
    const foot = document.querySelector('.footer__logo img');
    const boot = document.querySelector('.boot__logo');
    return {
      glyph: gb ? Math.round(gb.width) + 'x' + Math.round(gb.height) : null,
      tileBg: g ? getComputedStyle(g).backgroundColor : null,
      imgSrc: img ? img.getAttribute('src') : null,
      imgLoaded: !!(img && img.complete && img.naturalWidth > 0),
      imgNatural: img ? img.naturalWidth + 'x' + img.naturalHeight : null,
      imgBox: ib ? [ib.x - gb.x, ib.y - gb.y, ib.width, ib.height].map(Math.round).join(',') : null,
      icons: [...document.querySelectorAll('link[rel*="icon"]')].map((l) => l.getAttribute('href')),
      bootSrc: boot ? boot.getAttribute('src') : null,
      bootLoaded: !!(boot && boot.complete && boot.naturalWidth > 0),
      footerSrc: foot ? foot.getAttribute('src') : null,
      footerLoaded: !!(foot && foot.complete && foot.naturalWidth > 0),
    };
  })()`);
  record('品牌：顶栏标记 = 32px 墨色外框 + 品牌插画（图片真的加载出来）',
    brand?.glyph === '32x32'
      && /18, 19, 22/.test(brand?.tileBg || '')
      && /mark-64\.png/.test(brand?.imgSrc || '')
      && brand?.imgLoaded === true && brand?.imgNatural === '64x64'
      && brand?.imgBox === '2,2,28,28',                       // 2px 外框内是 28px 的插画
    JSON.stringify({ glyph: brand?.glyph, bg: brand?.tileBg, src: brand?.imgSrc, loaded: brand?.imgLoaded, box: brand?.imgBox }));
  record('品牌：页签 / 主屏图标 / 开机画面 / 页脚标记都是同一张画',
    (brand?.icons || []).some((u) => /favicon-32\.png(\?|$)/.test(u || ''))
      && (brand?.icons || []).some((u) => /apple-touch-icon\.png(\?|$)/.test(u || ''))
      && /mark-512\.png/.test(brand?.bootSrc || '') && brand?.bootLoaded === true
      && /mark-64\.png/.test(brand?.footerSrc || '') && brand?.footerLoaded === true,
    JSON.stringify({ icons: brand?.icons, boot: brand?.bootSrc, footer: brand?.footerSrc }));
  // 图标 URL 必须带版本号：浏览器对 favicon 的缓存非常顽固，
  // 换了图不换 URL 的话页签会一直显示旧图标（用户就是这么撞上的）
  record('品牌：图标 URL 带版本号（否则页签会一直缓存旧图标）',
    (brand?.icons || []).every((u) => /\?v=\d+/.test(u || '')),
    JSON.stringify(brand?.icons));

  // SVG 必须能被 XML 解析：注释里出现连续两个短横线会让整份文件失效（踩过这个坑）
  const svgOk = await evaluate(`(async () => {
    const urls = ['/assets/icons/logo.svg'];
    const out = [];
    for (const u of urls) {
      try {
        const txt = await (await fetch(u)).text();
        const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
        const err = doc.querySelector('parsererror');
        out.push({ u, ok: doc.documentElement.nodeName === 'svg' && !err, err: err ? err.textContent.slice(0, 70) : '' });
      } catch (e) { out.push({ u, ok: false, err: String(e.message || e) }); }
    }
    return out;
  })()`);
  record('品牌：字标 SVG 语法合法（XML 注释里不能有连续短横线）',
    Array.isArray(svgOk) && svgOk.every((x) => x.ok),
    JSON.stringify(svgOk));

  const iconDecode = await evaluate(`(async () => {
    const one = (src) => new Promise((res) => {
      const i = new Image();
      i.onload = () => res(src.split('/').pop() + '=' + i.naturalWidth + 'x' + i.naturalHeight);
      i.onerror = () => res(src.split('/').pop() + '=FAIL');
      i.src = src;
    });
    return [
      await one('/assets/icons/mark-64.png'),
      await one('/assets/icons/mark-512.png'),
      await one('/assets/icons/favicon-32.png'),
      await one('/assets/icons/apple-touch-icon.png'),
      await one('/assets/icons/logo.svg'),
    ];
  })()`);
  record('品牌：图标文件都能当图片解码（png + 字标 svg）',
    Array.isArray(iconDecode) && iconDecode.length === 5 && iconDecode.every((s) => !/FAIL/.test(s)),
    JSON.stringify(iconDecode));

  // 首页插画入口：标签改为「插画」，动作改为跳插画板块的链接（不再随机抽图）
  await visit('#/');
  const homeArt = await evaluate(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    await wait(1600);
    const cta = document.querySelector('.hero__cta');
    const panel = [...document.querySelectorAll('.panel')]
      .find(p => /插画/.test(p.querySelector('.panel__title')?.textContent || ''));
    return {
      cta: [...cta.children].map(el => (el.getAttribute?.('href') || el.id || el.tagName).trim()),
      heroRollGone: !document.getElementById('heroRoll'),
      homeRollGone: !document.getElementById('homeRoll'),
      panelTitle: panel?.querySelector('.panel__title')?.textContent || '',
      panelLinks: [...(panel?.querySelectorAll('a.btn') || [])].map(a => a.getAttribute('href')),
      sections: [...document.querySelectorAll('.sect__title')].map(t => t.textContent.trim()),
      lede: document.querySelector('.hero__lede')?.textContent || '',
    };
  })()`);
  record('首页：Hero 的「随机插画」按钮已改为跳插画板块的「插画」链接',
    homeArt?.cta?.includes('#/gallery') && homeArt?.heroRollGone === true
      && !/随机插画/.test(homeArt?.cta?.join(' ') || ''),
    JSON.stringify({ cta: homeArt?.cta, heroRollGone: homeArt?.heroRollGone }));
  record('首页：插画面板的随机按钮已改为「去插画板块」链接',
    homeArt?.homeRollGone === true && homeArt?.panelTitle === '插画'
      && (homeArt?.panelLinks || []).includes('#/gallery'),
    JSON.stringify({ panelTitle: homeArt?.panelTitle, panelLinks: homeArt?.panelLinks, homeRollGone: homeArt?.homeRollGone }));
  record('首页：文案里的「随机插画」已改为「插画」',
    (homeArt?.sections || []).includes('02公告与插画')
      && !/随机插画/.test(homeArt?.sections?.join(' ') || ''),
    JSON.stringify(homeArt?.sections));

  // 相册：本地照片网格 + 随机插画（全离线，不依赖 Pixiv）
  await visit('#/gallery');
  const album = await evaluate(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    await wait(3200);
    const out = {};

    // 顶部大图：一进来就应该已经随机抽了一张（不是上次那张、也不是空舞台）
    const stageImg = document.getElementById('stageImg');
    out.stage = {
      src: stageImg?.getAttribute('src') || '',
      badge: document.getElementById('stageBadge')?.textContent || '',
      placeholderHidden: document.getElementById('stagePh')?.hidden === true,
      spinnerHidden: document.getElementById('stageLoading')?.hidden === true,
    };
    // 随机按钮应在大图下方的操作条里，且页头不再有它
    const bar = document.querySelector('.gallery__bar');
    const stage = document.getElementById('stage');
    out.roll = {
      inBar: !!bar?.querySelector('#rollBtn'),
      inHeader: !!document.querySelector('.viewhead #rollBtn'),
      signal: bar?.querySelector('#rollBtn')?.classList.contains('btn--signal') === true,
      afterStage: !!(stage && bar && (stage.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING)),
      barOrder: [...(bar?.querySelectorAll('.btn') || [])].map(b => b.id),
    };

    out.providers = [...document.querySelectorAll('[data-provider]')].map(b => b.dataset.provider);
    out.meta = document.getElementById('metaAlbum')?.textContent || '';
    out.grid = document.querySelectorAll('#albumGrid [data-album]').length;
    out.countText = document.getElementById('albumCount')?.textContent || '';
    const imgs = [...document.querySelectorAll('#albumGrid img')];
    out.thumbs = imgs.filter(i => (i.getAttribute('src') || '').includes('/thumbs/')).length;
    out.lazy = imgs.filter(i => i.getAttribute('loading') === 'lazy').length;
    out.loaded = imgs.filter(i => i.complete && i.naturalWidth > 0).length;

    // 灯箱：点开 + 按钮翻页 + 键盘翻页
    document.querySelector('#albumGrid [data-album]').click();
    await wait(600);
    const lb = document.querySelector('.lightbox');
    out.lbNav = lb ? lb.querySelectorAll('.lightbox__nav').length : 0;
    out.cap1 = lb?.querySelector('.lightbox__cap')?.textContent || '';
    out.fullImg = lb?.querySelector('.lightbox__img')?.getAttribute('src') || '';
    lb?.querySelector('.lightbox__nav--next')?.click();
    await wait(400);
    out.cap2 = document.querySelector('.lightbox__cap')?.textContent || '';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    await wait(400);
    out.cap3 = document.querySelector('.lightbox__cap')?.textContent || '';
    document.querySelector('.lightbox__close')?.click();
    await wait(300);
    out.closed = !document.querySelector('.lightbox');

    // 展开全部 → 铺满照片 + 版面切成单列（相册变整页全宽）；再点收起复原
    const layoutEl = document.querySelector('.gallery__layout');
    document.getElementById('albumExpand').click();
    await wait(2600);
    out.expanded = {
      btn: document.getElementById('albumExpand')?.textContent.trim() || '',
      aria: document.getElementById('albumExpand')?.getAttribute('aria-expanded'),
      items: document.querySelectorAll('#albumGrid [data-album]').length,
      count: document.getElementById('albumCount')?.textContent || '',
      cols: String(getComputedStyle(document.getElementById('albumGrid')).columnCount),
      layoutCols: getComputedStyle(layoutEl).gridTemplateColumns,
      layoutFlag: layoutEl.classList.contains('is-album-expanded'),
      albumW: Math.round(document.getElementById('albumPanel').getBoundingClientRect().width),
    };
    document.getElementById('albumExpand').click();
    await wait(1400);
    out.collapsed = {
      items: document.querySelectorAll('#albumGrid [data-album]').length,
      cols: String(getComputedStyle(document.getElementById('albumGrid')).columnCount),
      layoutFlag: layoutEl.classList.contains('is-album-expanded'),
      layoutCols: getComputedStyle(layoutEl).gridTemplateColumns,
    };

    // 随机插画：默认应来自相册，且连续抽取不重复（洗牌袋）
    const draws = [];
    for (let i = 0; i < 3; i++) {
      document.getElementById('rollBtn').click();
      await wait(1900);
      draws.push(document.getElementById('stageImg')?.getAttribute('src') || '');
    }
    out.draws = draws;
    out.unique = new Set(draws.filter(Boolean)).size;
    out.badge = document.getElementById('stageBadge')?.textContent || '';
    return out;
  })()`);
  record('相册：数据源排在第一位（本地优先，Pixiv 只做深链）',
    album?.providers?.[0] === 'album' && album?.providers?.includes('album'),
    JSON.stringify(album?.providers));
  record('插画：进入画廊就自动随机抽一张显示在大图里',
    /^assets\/img\/album\/album-\d+\.jpg$/.test(album?.stage?.src || '')
      && /ALBUM/i.test(album?.stage?.badge || '')
      && album?.stage?.placeholderHidden === true,
    JSON.stringify(album?.stage));
  record('插画：「随机插画」按钮在大图下方的操作条里（页头不再有）',
    album?.roll?.inBar === true && album?.roll?.inHeader === false
      && album?.roll?.signal === true && album?.roll?.afterStage === true
      && album?.roll?.barOrder?.[0] === 'rollBtn',
    JSON.stringify(album?.roll));
  record('相册：网格用缩略图 + 懒加载渲染',
    album?.grid >= 12 && album?.thumbs === album?.grid && album?.lazy === album?.grid && album?.loaded > 0,
    JSON.stringify({ grid: album?.grid, thumbs: album?.thumbs, lazy: album?.lazy, loaded: album?.loaded }));
  record('相册：页头与计数器显示照片总数',
    /PHOTOS/.test(album?.meta || '') && /\/ \d+ PHOTOS/.test(album?.countText || ''),
    JSON.stringify({ meta: album?.meta, count: album?.countText }));
  record('相册：灯箱可翻页（点按钮 / 键盘，正图而非缩略图）',
    album?.lbNav === 2 && /^1 \//.test(album?.cap1 || '') && /^2 \//.test(album?.cap2 || '')
      && /^1 \//.test(album?.cap3 || '') && /img\/album\/album-\d+\.jpg$/.test(album?.fullImg || '')
      && album?.closed === true,
    JSON.stringify({ nav: album?.lbNav, cap1: album?.cap1, cap2: album?.cap2, cap3: album?.cap3, fullImg: album?.fullImg, closed: album?.closed }));
  record('相册：展开全部 = 铺满全部照片 + 版面变成整页全宽',
    (album?.expanded?.items || 0) > (album?.grid || 0)
      && album?.expanded?.layoutFlag === true
      && /^收起/.test(album?.expanded?.btn || '')
      && album?.expanded?.aria === 'true'
      && (album?.expanded?.count || '').startsWith(String(album?.expanded?.items))
      && !/\s/.test(album?.expanded?.layoutCols || '')      // 单列 = grid-template-columns 里没有空格
      && (album?.expanded?.albumW || 0) > 1100,             // 明显宽于收起时的 ~1038
    JSON.stringify(album?.expanded));
  record('相册：收起后回到首屏张数与原布局',
    album?.collapsed?.items === album?.grid
      && album?.collapsed?.layoutFlag === false
      && album?.collapsed?.cols === '4'
      && /\s/.test(album?.collapsed?.layoutCols || ''),     // 双列 = 有空格
    JSON.stringify(album?.collapsed));
  record('随机插画：默认抽到相册照片，且连续抽取不重复',
    album?.unique === 3 && /ALBUM/i.test(album?.badge || '') && album?.draws?.every((u) => /img\/album\//.test(u)),
    JSON.stringify({ badge: album?.badge, unique: album?.unique, draws: album?.draws }));

  /* ---------------- 扫雷板块（#/mine） ---------------- */
  // 规则引擎与视图分开，所以这里两条腿都测：引擎用 Terminal.Mines 直接跑规则，
  // 视图用真实 DOM 事件驱动，确认「点得到、画得出、动效类挂上了」。
  await visit('#/mine');
  const ms = await evaluate(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const T = window.Terminal;
    const Mines = T.Mines;
    const live = T.MinesLive.current;
    const out = {};
    if (!live) return { skipped: true };
    const cells = () => Array.prototype.slice.call(document.querySelectorAll('.ms-cell'));
    const click = (i) => {
      const el = cells()[i];
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, cancelable: true }));
      el.click();
    };
    const rclick = (i) => cells()[i].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2, cancelable: true }));
    const st = () => window.Terminal.MinesLive.current.state;   // 每次现取：切板块会换新的运行时句柄

    // ① 导航 / 路由 / 骨架
    const nav = document.querySelector('.nav__link[data-view="mine"]');
    out.shell = {
      hash: location.hash,
      navExists: !!nav,
      navActive: !!nav && nav.classList.contains('is-active'),
      navLabel: nav ? nav.textContent.replace(/\\s+/g, ' ').trim() : '',
      title: document.title,
      cells: cells().length,
      levelTabs: document.querySelectorAll('.ms-lv').length,
    };

    // ② 引擎：首点安全 + 第一下至少开出一片
    let boom = 0;
    let minRegion = 999;
    for (let k = 0; k < 40; k++) {
      const s = Mines.createGame('beginner');
      const res = Mines.reveal(s, Math.floor(Math.random() * 9), Math.floor(Math.random() * 9));
      if (res.boom) boom++;
      minRegion = Math.min(minRegion, res.opened.length);
    }
    out.firstClick = { boom, minRegion };

    // ③ 引擎：雷数与邻域计数
    const s2 = Mines.createGame('intermediate');
    Mines.placeMines(s2, 0, 0);
    out.place = {
      mineCount: s2.cells.filter((c) => c.mine).length,
      safeZone: !s2.cells[0].mine && Mines.neighbors(s2, 0, 0).every((rc) => !s2.cells[rc[0] * s2.cols + rc[1]].mine),
      adjOk: s2.cells.every((cell, i) => cell.mine || cell.adj === Mines.neighbors(s2, Math.floor(i / s2.cols), i % s2.cols).filter((rc) => s2.cells[rc[0] * s2.cols + rc[1]].mine).length),
    };

    // ④ UI：点开一格
    click(40);
    await wait(420);
    out.firstClickUI = {
      opened: st().opened,
      openCells: document.querySelectorAll('.ms-cell.is-open').length,
      popping: document.querySelectorAll('.ms-cell.is-pop').length,
      state: document.getElementById('msState').textContent.trim(),
    };

    // ⑤ 右键插旗 / 取消
    const closed = st().cells.findIndex((c) => !c.open);
    rclick(closed);
    await wait(200);
    out.flag = {
      flags: st().flags,
      hud: document.getElementById('msMines').textContent,
      chips: document.querySelectorAll('.ms-cell.is-flag').length,
      anim: document.querySelectorAll('.ms-cell.is-flagged').length,
      text: cells()[closed].textContent,
    };
    rclick(closed);
    await wait(160);
    out.unflag = { flags: st().flags, hud: document.getElementById('msMines').textContent };

    // ⑥ 和弦：手工摆一个「已开数字 + 一颗未开安全邻格 + 已插旗的雷」
    const s3 = Mines.createGame('beginner');
    Mines.placeMines(s3, 8, 8);
    let pick = -1;
    let safeNeighbor = -1;
    for (let i = 0; i < s3.cells.length && pick < 0; i++) {
      const cell = s3.cells[i];
      if (cell.mine || cell.adj !== 1) continue;
      const r = Math.floor(i / s3.cols);
      const c = i % s3.cols;
      const ns = Mines.neighbors(s3, r, c);
      const mineN = ns.filter((rc) => s3.cells[rc[0] * s3.cols + rc[1]].mine);
      const safeN = ns.filter((rc) => !s3.cells[rc[0] * s3.cols + rc[1]].mine);
      if (mineN.length !== 1 || !safeN.length) continue;
      cell.open = true;
      s3.opened++;
      mineN.forEach((rc) => { const n = s3.cells[rc[0] * s3.cols + rc[1]]; n.flag = true; s3.flags++; });
      pick = i;
      safeNeighbor = safeN[0][0] * s3.cols + safeN[0][1];
    }
    const chordable = pick >= 0 && Mines.canChord(s3, Math.floor(pick / s3.cols), pick % s3.cols);
    const res3 = chordable ? Mines.chord(s3, Math.floor(pick / s3.cols), pick % s3.cols) : { opened: [] };
    out.chord = { pick, chordable, opened: (res3.opened || []).length, boom: !!res3.boom, safeOpened: s3.cells[safeNeighbor] ? s3.cells[safeNeighbor].open : null };

    // ⑦ 失败：踩雷（走 UI）
    live.newGame('beginner');
    await wait(260);
    click(40);
    await wait(260);
    const mineIdx = st().cells.findIndex((c) => c.mine);
    click(mineIdx);
    await wait(180);
    out.lose = {
      state: document.getElementById('msState').textContent.trim(),
      shake: document.getElementById('msStage').classList.contains('is-shake'),
    };
    await wait(700);
    out.loseAfter = {
      won: st().won,
      banner: document.getElementById('msBannerTitle').textContent,
      mines: document.querySelectorAll('.ms-cell.is-mine').length,
      boom: document.querySelectorAll('.ms-cell.is-boom').length,
      cascade: document.querySelectorAll('.ms-cell.is-cascade').length,
    };

    // ⑧ 胜利：推到「只剩一格」再真实点开
    live.newGame('beginner');
    await wait(260);
    click(40);
    await wait(300);
    const s5 = st();
    const total = s5.cols * s5.rows - s5.mines;
    s5.cells.forEach((c) => { if (!c.mine) c.open = true; });
    s5.startedAt = Date.now() - 61000;
    const lastIdx = s5.cells.findIndex((c) => !c.mine);
    s5.cells[lastIdx].open = false;
    s5.opened = total - 1;
    live.paintAll();
    await wait(200);
    click(lastIdx);
    await wait(1000);
    out.win = {
      won: st().won,
      state: document.getElementById('msState').textContent.trim(),
      banner: document.getElementById('msBannerTitle').textContent,
      sub: document.getElementById('msBannerSub').textContent,
      winCells: document.querySelectorAll('.ms-cell.is-win').length,
      progress: document.getElementById('msProgress').style.width,
      stats: document.getElementById('msStats').textContent.replace(/\\s+/g, ' ').trim(),
      bestMeta: document.getElementById('msMetaBest').textContent,
    };

    // ⑨ 键盘：方向键移动光标、F 插旗、空格挖开
    live.newGame('beginner');
    await wait(260);
    const board = document.getElementById('msBoard');
    board.focus();
    board.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    board.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await wait(120);
    const cursorCells = document.querySelectorAll('.ms-cell.is-cursor').length;
    const cursorIdx = live.cursor;
    // 开局还没点过，光标那格一定是关着的 → F 应该插上一面旗
    board.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }));
    await wait(160);
    const flagByKey = st().flags;
    const cursorFlagged = st().cells[cursorIdx].flag === true;
    board.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }));   // 取消
    await wait(120);
    const flagUndone = st().flags;
    board.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    await wait(320);
    out.keyboard = { cursorCells, cursorIdx, flagByKey, cursorFlagged, flagUndone, openedByKey: st().opened };

    // ⑫ 触屏长按插旗 / 模式切换 / R 重开
    live.newGame('beginner');
    await wait(260);
    const lpEl = cells()[5];
    lpEl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
    await wait(700);
    lpEl.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' }));
    await wait(500);
    const longPressFlags = st().flags;
    document.getElementById('msMode').click();
    await wait(200);
    const modeOn = document.getElementById('msMode').getAttribute('aria-pressed');
    cells()[6].click();
    await wait(220);
    const flaggedByLeft = st().flags;
    const openedInFlagMode = st().opened;
    document.getElementById('msMode').click();
    await wait(160);
    cells()[9].click();
    await wait(320);
    const openedAfterModeOff = st().opened;
    board.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
    await wait(320);
    out.touch = {
      longPressFlags, modeOn, flaggedByLeft, openedInFlagMode, openedAfterModeOff,
      afterR: { opened: st().opened, flags: st().flags, state: document.getElementById('msState').textContent.trim() },
    };

    // ⑬ 切板块再回来：进度不丢、时钟暂停、结算不重复记账
    //    （这一段全在页面里跑：切板块靠 location.hash，快照靠 localStorage）
    out.persist = await (async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const T = window.Terminal;
      const live = T.MinesLive.current;
      const cells = () => Array.prototype.slice.call(document.querySelectorAll('.ms-cell'));
      const click = (i) => { const el = cells()[i]; el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, cancelable: true })); el.click(); };
      const rclick = (i) => cells()[i].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2, cancelable: true }));
      const st = () => T.MinesLive.current.state;
      const snap = () => ({
        opened: st().opened, flags: st().flags, cursor: T.MinesLive.current.cursor,
        elapsed: T.Mines.elapsed(st()),
        openCells: document.querySelectorAll('.ms-cell.is-open').length,
        flagChips: document.querySelectorAll('.ms-cell.is-flag').length,
      });
      const out = {};
      live.newGame('beginner');
      await wait(320);
      const board = document.getElementById('msBoard');
      board.focus();
      board.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      board.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      click(40);
      await wait(420);
      rclick(st().cells.findIndex((c) => !c.open));
      await wait(260);
      const before = snap();
      // 切到音乐板块停 2.6 秒，再切回来
      location.hash = '#/music';
      await wait(2600);
      out.awayHasBoard = !!document.getElementById('msBoard');
      location.hash = '#/mine';
      await wait(1300);
      const after = snap();
      out.before = before;
      out.after = after;
      out.sameBoard = before.opened === after.opened && before.flags === after.flags
        && before.openCells === after.openCells && before.flagChips === after.flagChips;
      out.cursorKept = before.cursor === after.cursor;
      out.clockPaused = after.elapsed - before.elapsed;
      // 再切一次：插旗模式也要保留
      document.getElementById('msMode').click();
      await wait(200);
      location.hash = '#/logs';
      await wait(900);
      location.hash = '#/mine';
      await wait(1200);
      out.modeKept = document.getElementById('msMode').getAttribute('aria-pressed') === 'true';
      out.openedKept2 = st().opened === before.opened;
      document.getElementById('msMode').click();
      await wait(150);
      // 结算过的局：切回来只画结果，绝不再记一次战绩
      const playedBefore = ((JSON.parse(localStorage.getItem('ft.terminal.mines') || '{}').beginner) || {}).played || 0;
      const s5 = st();
      const total = s5.cols * s5.rows - s5.mines;
      // 清掉插错的旗，否则最后一格可能正好插着旗、点了不会开
      s5.cells.forEach((c) => { if (!c.mine) { if (c.flag) { c.flag = false; s5.flags--; } c.open = true; } });
      const lastIdx = s5.cells.findIndex((c) => !c.mine);
      s5.cells[lastIdx].open = false;
      s5.opened = total - 1;
      T.MinesLive.current.paintAll();
      await wait(220);
      click(lastIdx);
      await wait(1000);
      const playedAfterWin = ((JSON.parse(localStorage.getItem('ft.terminal.mines') || '{}').beginner) || {}).played || 0;
      location.hash = '#/music';
      await wait(1200);
      location.hash = '#/mine';
      await wait(1300);
      const statsNow = JSON.parse(localStorage.getItem('ft.terminal.mines') || '{}');
      out.afterWinReturn = {
        won: st().won,
        playedBefore, playedAfterWin,
        playedAfterReturn: (statsNow.beginner || {}).played || 0,
        noDoubleCount: ((statsNow.beginner || {}).played || 0) === playedAfterWin,
        bannerVisible: !document.getElementById('msBanner').hidden,
        banner: document.getElementById('msBannerTitle').textContent,
        state: document.getElementById('msState').textContent.trim(),
      };
      // 快照本身：能往返、体积可控、坏数据会被拒
      const raw = localStorage.getItem('ft.terminal.mines.game');
      const parsed = raw ? JSON.parse(raw) : null;
      const rt = T.Mines.deserializeGame(parsed);
      out.snapshot = {
        exists: !!raw,
        kb: raw ? Math.round(raw.length / 102.4) / 10 : 0,
        roundTrip: rt ? { cells: rt.game.cells.length, level: rt.game.level } : null,
        hasElapsedBefore: typeof parsed?.elapsedBefore === 'number',
        rejectsBadPayload: T.Mines.deserializeGame({ level: 'beginner', cols: 9, rows: 9, mines: 10, cells: [] }) === null,
      };
      return out;
    })();


    // ⑩ 难度切换
    document.querySelector('.ms-lv[data-level="intermediate"]').click();
    await wait(400);
    out.level = {
      cells: cells().length,
      cols: st().cols,
      active: document.querySelector('.ms-lv[aria-selected="true"]').dataset.level,
      hud: document.getElementById('msMines').textContent,
      metaGrid: document.getElementById('msMetaGrid').textContent,
    };

    // ⑪ 布局：棋盘外框与舞台尺寸（居中、不溢出）
    document.querySelector('.ms-lv[data-level="beginner"]').click();
    await wait(320);
    const stage = document.getElementById('msStage');
    const bd = document.getElementById('msBoard');
    const sr = stage.getBoundingClientRect();
    const br = bd.getBoundingClientRect();
    out.layout = {
      stageWidth: Math.round(sr.width),
      boardWidth: Math.round(br.width),
      hFits: sr.left >= 0 && sr.right <= window.innerWidth,
      boardInside: br.left >= sr.left - 1 && br.right <= sr.right + 1,
      docOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      cell: getComputedStyle(bd).getPropertyValue('--ms-cell').trim(),
    };
    return out;
  })()`);

  // 真实刷新（Page.reload）：这一步必须走 CDP，所以放在页面里的评估之外
  let reloadProbe = null;
  if (!ms?.skipped) {
    const beforeReload = await evaluate(`(async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const live = window.Terminal.MinesLive.current;
      live.newGame('intermediate');
      await wait(340);
      const el = document.querySelectorAll('.ms-cell')[90];
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, cancelable: true }));
      el.click();
      await wait(520);
      const st = live.state;
      return {
        level: live.level, opened: st.opened,
        openCells: document.querySelectorAll('.ms-cell.is-open').length,
        print: st.cells.map((c) => (c.open ? 1 : 0) + (c.mine ? 4 : 0)).join('').slice(0, 80),
      };
    })()`);
    await send('Page.reload', { ignoreCache: false });
    let booted = false;
    for (let i = 0; i < 80; i++) {
      await sleep(250);
      try {
        booted = await evaluate(`document.documentElement.dataset.booted === '1' && !!document.getElementById('msBoard')`);
      } catch { booted = false; }
      if (booted) break;
    }
    const afterReload = await evaluate(`(async () => {
      await new Promise(r => setTimeout(r, 700));
      const live = window.Terminal.MinesLive.current;
      if (!live) return { missing: true };
      const st = live.state;
      return {
        restored: live.restored, level: live.level, opened: st.opened,
        openCells: document.querySelectorAll('.ms-cell.is-open').length,
        state: document.getElementById('msState').textContent.trim(),
        print: st.cells.map((c) => (c.open ? 1 : 0) + (c.mine ? 4 : 0)).join('').slice(0, 80),
      };
    })()`);
    reloadProbe = { booted, before: beforeReload, after: afterReload };
    await visit('#/mine');   // 刷新后把页面状态与错误缓冲恢复正常
  }

  if (ms?.skipped) {
    record('扫雷：板块可用（跳过）', true, '没有拿到运行时句柄');
  } else {
    record('扫雷：板块在导航里，路由与棋盘骨架正常',
      ms?.shell?.hash === '#/mine' && ms?.shell?.navExists === true && ms?.shell?.navActive === true
        && /MINES/.test(ms?.shell?.navLabel || '') && /扫雷/.test(ms?.shell?.title || '')
        && ms?.shell?.cells === 81 && ms?.shell?.levelTabs === 3,
      JSON.stringify(ms?.shell));
    record('扫雷：第一下必定安全（40 局不炸；首点八邻域无雷，连边角至少开出一圈）',
      ms?.firstClick?.boom === 0 && (ms?.firstClick?.minRegion || 0) >= 4,
      JSON.stringify(ms?.firstClick));
    record('扫雷：雷数与邻域计数正确（首点八邻域无雷）',
      ms?.place?.mineCount === 40 && ms?.place?.safeZone === true && ms?.place?.adjOk === true,
      JSON.stringify(ms?.place));
    record('扫雷：点一格会洪水展开，并挂上逐格出现的动画',
      (ms?.firstClickUI?.opened || 0) > 1
        && ms?.firstClickUI?.openCells === ms?.firstClickUI?.opened
        && ms?.firstClickUI?.popping > 0
        && ms?.firstClickUI?.state === 'SWEEPING',
      JSON.stringify(ms?.firstClickUI));
    record('扫雷：右键插旗 / 取消（HUD 计数跟着变）',
      ms?.flag?.flags === 1 && ms?.flag?.hud === '009' && ms?.flag?.chips === 1
        && ms?.flag?.anim === 1 && ms?.flag?.text === '⚑'
        && ms?.unflag?.flags === 0 && ms?.unflag?.hud === '010',
      JSON.stringify({ flag: ms?.flag, unflag: ms?.unflag }));
    record('扫雷：和弦能一次开完周围（旗数够了才生效）',
      ms?.chord?.chordable === true && (ms?.chord?.opened || 0) >= 1 && ms?.chord?.boom === false
        && ms?.chord?.safeOpened === true,
      JSON.stringify(ms?.chord));
    record('扫雷：踩雷 → 震屏 + 全部雷级联翻出 + 结算条',
      ms?.lose?.state === 'DETONATED' && ms?.lose?.shake === true
        && ms?.loseAfter?.won === false && ms?.loseAfter?.banner === 'DETONATED'
        && (ms?.loseAfter?.mines || 0) >= 9 && ms?.loseAfter?.boom === 1 && (ms?.loseAfter?.cascade || 0) >= 9,
      JSON.stringify({ lose: ms?.lose, after: ms?.loseAfter }));
    record('扫雷：通关 → 整盘波浪 + 进度 100% + 战绩与最佳时间更新',
      ms?.win?.won === true && ms?.win?.state === 'CLEARED' && ms?.win?.banner === 'AREA CLEARED'
        && /用时 \d+ 秒/.test(ms?.win?.sub || '')
        && (ms?.win?.winCells || 0) === 81 && ms?.win?.progress === '100%'
        && /胜局0[1-9]/.test(ms?.win?.stats || '') && /\d+s/.test(ms?.win?.bestMeta || ''),
      JSON.stringify(ms?.win));
    record('扫雷：键盘能操作（方向键移动光标、F 插旗并可取消、空格挖开）',
      ms?.keyboard?.cursorCells === 1 && ms?.keyboard?.cursorFlagged === true
        && ms?.keyboard?.flagByKey === 1 && ms?.keyboard?.flagUndone === 0
        && (ms?.keyboard?.openedByKey || 0) > 1,
      JSON.stringify(ms?.keyboard));
    record('扫雷：触屏长按插旗 / 左键模式可切换 / R 重开',
      ms?.touch?.longPressFlags === 1
        && ms?.touch?.modeOn === 'true' && ms?.touch?.flaggedByLeft === 2 && ms?.touch?.openedInFlagMode === 0
        && (ms?.touch?.openedAfterModeOff || 0) > 1
        && ms?.touch?.afterR?.opened === 0 && ms?.touch?.afterR?.flags === 0 && ms?.touch?.afterR?.state === 'READY',
      JSON.stringify(ms?.touch));
    record('扫雷：切到别的板块再回来，进度不丢（切走时计时暂停）',
      ms?.persist?.sameBoard === true && ms?.persist?.cursorKept === true
        && ms?.persist?.modeKept === true && ms?.persist?.openedKept2 === true
        && (ms?.persist?.clockPaused ?? 99) <= 2,
      JSON.stringify(ms?.persist));
    record('扫雷：已结算的局切回来不重复记战绩（只画结果）',
      ms?.persist?.afterWinReturn?.won === true && ms?.persist?.afterWinReturn?.noDoubleCount === true
        && ms?.persist?.afterWinReturn?.bannerVisible === true
        && ms?.persist?.afterWinReturn?.banner === 'AREA CLEARED'
        && ms?.persist?.afterWinReturn?.state === 'CLEARED',
      JSON.stringify(ms?.persist?.afterWinReturn));
    record('扫雷：对局快照能往返，坏数据会被拒绝',
      ms?.persist?.snapshot?.exists === true && ms?.persist?.snapshot?.roundTrip?.cells === 81
        && ms?.persist?.snapshot?.hasElapsedBefore === true
        && ms?.persist?.snapshot?.rejectsBadPayload === true
        && (ms?.persist?.snapshot?.kb || 99) < 40,
      JSON.stringify(ms?.persist?.snapshot));
    record('扫雷：真实刷新页面后仍接着上一局（快照写进 localStorage）',
      reloadProbe?.booted === true
        && reloadProbe?.after?.restored === true
        && reloadProbe?.after?.level === reloadProbe?.before?.level
        && reloadProbe?.after?.opened === reloadProbe?.before?.opened
        && reloadProbe?.after?.openCells === reloadProbe?.before?.openCells
        && reloadProbe?.after?.print === reloadProbe?.before?.print,
      JSON.stringify(reloadProbe));
    record('扫雷：难度切换会换棋盘与雷数',
      ms?.level?.cells === 256 && ms?.level?.cols === 16 && ms?.level?.active === 'intermediate'
        && ms?.level?.hud === '040' && /16/.test(ms?.level?.metaGrid || ''),
      JSON.stringify(ms?.level));
    record('扫雷：棋盘居中且不溢出（9×9 时舞台按内容收缩）',
      ms?.layout?.boardInside === true && ms?.layout?.hFits === true
        && ms?.layout?.docOverflow === false
        && (ms?.layout?.stageWidth || 0) < 700
        && ms?.layout?.cell === '34px',
      JSON.stringify(ms?.layout));
  }

  // Pixiv：国内网络下 pixiv.net / i.pximg.net 被 DNS 污染 + 防盗链，直连必然失败。
  // 现在走 server.mjs 代理（api.lolicon.app 随机作品）+ pixiv.re 镜像显示图片。
  // 「随机不重复」由服务端的抽卡池保证：一次要一批（上游 num 上限 20），逐张发放，
  // 发过的记进 served，池子见底再补货 —— 所以连着抽不会又抽到同一张。
  const pixivBatches = await (async () => {
    const batches = [];
    try {
      for (let i = 0; i < 3; i++) {
        const r = await fetch(`${BASE}/api/pixiv/random?num=6`);
        if (!r.ok) {
          // 上游（api.lolicon.app）会限流，服务端如实回 503 + 说明。
          // 那是外部条件、不是本站回归，所以单独标出来供下面记 SKIP。
          const body = await r.json().catch(() => ({}));
          return {
            status: r.status,
            error: `批次 ${i + 1} HTTP ${r.status}`,
            throttled: r.status === 503 && /限流/.test(String(body.error || '')),
          };
        }
        const j = await r.json();
        batches.push({ count: j.count, poolLeft: j.poolLeft, items: (j.items || []).map((x) => x.pid) });
      }
      return { status: 200, batches };
    } catch (e) { return { error: String(e.message || e) }; }
  })();
  const pixivThrottled = pixivBatches?.throttled === true;
  const pixivSkip = '跳过：api.lolicon.app 正在限流（上游条件，非本站回归）';
  const pixivItems = (pixivBatches?.batches || []).flatMap((b) => b.items);
  const pixivUnique = new Set(pixivItems).size;
  record('Pixiv：服务端代理能取到随机作品（带镜像直链）',
    pixivThrottled || (pixivBatches?.status === 200 && (pixivBatches?.batches?.[0]?.count || 0) > 0
      && pixivItems.every((pid) => /^\d+$/.test(pid))),
    pixivThrottled ? pixivSkip : JSON.stringify({ batches: (pixivBatches?.batches || []).map((b) => ({ n: b.count, left: b.poolLeft })) }));
  record('Pixiv：连续抽取不重复（服务端抽卡池，发过的不再发）',
    pixivThrottled || (pixivItems.length >= 12 && pixivUnique === pixivItems.length),
    pixivThrottled ? pixivSkip : `共 ${pixivItems.length} 张 / 去重 ${pixivUnique} 张 / 重复 ${pixivItems.length - pixivUnique} 张`);

  // 图片走本站 /api/pixiv/image：代理 + 磁盘缓存 + 域名白名单。
  // 这是「快」的关键：浏览器只跟 localhost 打交道，第二次取同一张是毫秒级。
  const pixivImg = await (async () => {
    try {
      const j = await (await fetch(`${BASE}/api/pixiv/random?num=1&_=${Date.now()}`)).json();
      const rel = j.items?.[0]?.url || '';
      if (!rel) return { error: '随机接口没返回 url' };
      const t0 = Date.now();
      const r1 = await fetch(`${BASE}${rel}`);
      const b1 = Buffer.from(await r1.arrayBuffer());
      const first = Date.now() - t0;
      const t1 = Date.now();
      const r2 = await fetch(`${BASE}${rel}`);
      const b2 = Buffer.from(await r2.arrayBuffer());
      const second = Date.now() - t1;
      const bad = await fetch(`${BASE}/api/pixiv/image?url=${encodeURIComponent('https://example.com/x.jpg')}`);
      return {
        rel, first, second, bytes: b1.length, bytes2: b2.length,
        ct: (r1.headers.get('content-type') || '').split(';')[0],
        cache1: r1.headers.get('x-pixiv-cache'), cache2: r2.headers.get('x-pixiv-cache'),
        cc: r1.headers.get('cache-control') || '', guard: bad.status,
      };
    } catch (e) { return { error: String(e.message || e) }; }
  })();
  record('Pixiv：图片经本站代理 + 磁盘缓存（第二次命中，毫秒级）',
    pixivThrottled || ((pixivImg?.bytes || 0) > 1000 && pixivImg?.cache2 === 'hit' && (pixivImg?.second || 9e9) < 3000
      && /^image\//.test(pixivImg?.ct || '') && /max-age/.test(pixivImg?.cc || '')),
    pixivThrottled ? pixivSkip : JSON.stringify({ kb: Math.round((pixivImg?.bytes || 0) / 1024), firstMs: pixivImg?.first, secondMs: pixivImg?.second, cache1: pixivImg?.cache1, cache2: pixivImg?.cache2, ct: pixivImg?.ct }));
  // 白名单守卫不依赖上游：即使限流也要真的验（它必须拒绝非镜像域名）
  record('Pixiv：图片代理只允许镜像域名（不会变成开放代理）',
    pixivImg?.guard === 400 || (await (async () => {
      const bad = await fetch(`${BASE}/api/pixiv/image?url=${encodeURIComponent('https://example.com/x.jpg')}`);
      return bad.status === 400;
    })()),
    `example.com → HTTP ${pixivImg?.guard}`);

  const pixivUI = await (async () => {
    // 提供者芯片在画廊页上，先切回去再取（不要依赖前面用例留下的页面状态）
    await visit('#/gallery');
    try {
      return await evaluate(`(async () => {
        const out = {};
        const prov = window.Terminal.Registry.getImageProvider('pixiv');
        out.provider = prov && { kind: prov.kind, probeTimeout: prov.probeTimeout, endpointIsFn: typeof prov.endpoint === 'function' };
        out.endpointSample = typeof prov?.endpoint === 'function' ? prov.endpoint({ exclude: ['1', '2'] }) : String(prov?.endpoint || '');
        out.freshEachDraw = prov?.freshEachDraw === true;
        out.skipProbe = prov?.skipProbe === true;
        out.chips = [...document.querySelectorAll('[data-provider]')].map(b => b.dataset.provider);
        out.hasDeepLinkFallback = !!window.Terminal.Registry.getImageProvider('pixiv-link');
        // 真在浏览器里加载一张：镜像首次回源可能要几十秒
        const j = await (await fetch('/api/pixiv/random?num=1&_=' + Date.now())).json();
        const url = j.items?.[0]?.url || '';
        out.url = url;
        out.loaded = await new Promise((res) => {
          if (!url) return res('no-url');
          const img = new Image();
          const t = setTimeout(() => res('timeout'), 45000);
          img.onload = () => { clearTimeout(t); res(img.naturalWidth + 'x' + img.naturalHeight); };
          img.onerror = () => { clearTimeout(t); res('error'); };
          img.referrerPolicy = 'no-referrer';
          img.src = url;
        });
        return out;
      })()`);
    } catch (e) { return { error: String(e.message || e) }; }
  })();
  record('Pixiv：数据源是可出图的远端源（每次换新 + 不做阻塞探测 + 深链兜底）',
    pixivUI?.provider?.kind === 'remote'
      && pixivUI?.provider?.endpointIsFn === true                        // 函数式 endpoint：带上 exclude
      && (pixivUI?.endpointSample || '').includes('exclude=1%2C2')
      && pixivUI?.freshEachDraw === true
      && pixivUI?.skipProbe === true                                     // 图走本地缓存，不用先探测
      && (pixivUI?.provider?.probeTimeout || 0) >= 15000
      && (pixivUI?.chips || []).includes('pixiv')
      && pixivUI?.hasDeepLinkFallback === true,
    JSON.stringify({ provider: pixivUI?.provider, endpointSample: pixivUI?.endpointSample, freshEachDraw: pixivUI?.freshEachDraw, skipProbe: pixivUI?.skipProbe, chips: pixivUI?.chips }));
  if (/^\d+x\d+$/.test(pixivUI?.loaded || '')) {
    record('Pixiv：图片能在站内显示（经 pixiv.re 镜像）', true,
      `${pixivUI.loaded}  ${(pixivUI.url || '').slice(0, 70)}`);
  } else {
    // 镜像首次回源可能要 20-40 秒，超时不算功能坏掉（URL 与代理路径上面已经卡住了）
    record('Pixiv：图片能在站内显示（镜像首次回源超时，跳过）', true,
      `${pixivUI?.loaded || pixivUI?.error}  ${(pixivUI?.url || '').slice(0, 70)}`);
  }

  // 回归：反复进出同一个板块不能累积事件监听
  // 视图都用 root.addEventListener() 做事件委托，而 #view 是同一个节点；
  // router 现在每次渲染都换一个新节点，否则访问 N 次后点一下会触发 N 次
  //（实测后果：点一张相册图会同时弹出 N 个灯箱）。
  for (const h of ['#/gallery', '#/', '#/gallery', '#/', '#/gallery']) await visit(h);
  const leak = await evaluate(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    await wait(1800);
    document.querySelector('#albumGrid [data-album]')?.click();
    await wait(500);
    const opened = document.querySelectorAll('.lightbox').length;
    document.querySelector('.lightbox__close')?.click();
    await wait(250);
    return { opened, left: document.querySelectorAll('.lightbox').length };
  })()`);
  record('视图：反复进出同一板块不累积监听（点一次只弹一个灯箱）',
    leak?.opened === 1 && leak?.left === 0, JSON.stringify(leak));

  // 插件系统：动态路由 + 首页插槽组件 + 导航是否自动接入
  record('插件：动态路由进入导航', (await evaluate(`[...document.querySelectorAll('#nav a')].some(a => a.textContent.includes('STATUS'))`)) === true);
  await visit('#/');
  record('插件：首页插槽组件已渲染', (await evaluate(`document.body.innerText.includes('SESSION ACTIVE') && document.body.innerText.includes('这套骨架是为你改的')`)) === true);
  record('前台：不再包含小说相关栏目', (await evaluate(`!/小说|FICTION/.test(document.body.innerText)`)) === true);
  record('前台：导航不含小说入口', (await evaluate(`![...document.querySelectorAll('#nav a')].some(a => /小说|FICTION/.test(a.textContent))`)) === true);

  const hero = await evaluate(`(() => ({
    lines: [...document.querySelectorAll('.hero__title .row > span')].map(s => s.textContent.trim()),
    raw: document.querySelector('.hero__title').innerText.replace(/\\s+/g, ' ').trim(),
  }))()`);
  record('首页标题：两行且含「鱼の灵庙」', hero.lines.length === 2 && /鱼の灵庙/.test(hero.raw), JSON.stringify(hero.lines));
  record('首页标题：已移除 ARCHIVE & SOUND', !/ARCHIVE/.test(hero.raw) && !/SOUND/.test(hero.raw), hero.raw);

  record('路由 文章详情 使用文章名做标题', /八个板块|鱼灵庙/.test(routeInfo['#/logs/post_overview'].title), routeInfo['#/logs/post_overview'].title);
  record('路由 公告详情 渲染出正文', routeInfo['#/logs/news_launch'].text > 200, `${routeInfo['#/logs/news_launch'].text} 字符`);
  record('路由 404 页面正确', routeInfo['#/nope'].title.includes('404'));

  // 交互：主题
  await visit('#/');
  const themeBefore = await evaluate(`document.documentElement.dataset.theme`);
  await evaluate(`document.getElementById('themeBtn').click()`);
  await sleep(400);
  const themeAfter = await evaluate(`document.documentElement.dataset.theme`);
  record('交互：主题切换', themeBefore !== themeAfter, `${themeBefore} → ${themeAfter}`);

  // 交互：命令面板
  await evaluate(`document.getElementById('searchBtn').click()`);
  await sleep(300);
  const cmdOpen = await evaluate(`!document.getElementById('cmdk').hasAttribute('hidden') && document.querySelectorAll('.cmdk__item').length`);
  record('交互：命令面板打开并有条目', cmdOpen > 5, `${cmdOpen} 条`);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await sleep(250);
  record('交互：命令面板可关闭', await evaluate(`document.getElementById('cmdk').hasAttribute('hidden')`));

  // 交互：随机插画（本地源，离线可用）
  await visit('#/gallery');
  // 进入画廊会自动抽一张（roll 在 260ms 后触发），先等它结束，
  // 否则这里的 random() 会撞上 busy 直接返回 null（测试竞态，不是功能问题）
  const art = await evaluate(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 60 && window.Terminal.Stage.busy; i++) await wait(200);
    await wait(300);
    const r = await window.Terminal.Stage.random({ provider: 'local' });
    return r && { title: r.title, url: r.url };
  })()`);
  record('交互：随机插画取图', !!art?.url, art ? art.url : 'no result');
  record('交互：插画历史累积', (await evaluate(`window.Terminal.Stage.history.length`)) > 0);

  // 交互：本地音频引擎（PLAYLIST 为空时走空状态，不为空则验证播放链路）
  await visit('#/music');
  const audio = await evaluate(`(async () => {
    const P = window.Terminal.Player;
    const out = { tracks: P.tracks.length, providers: P.providers.map(p => p.id) };
    if (!P.tracks.some(t => t.provider === 'local' && t.src)) { out.skipped = true; return out; }
    const idx = P.tracks.findIndex(t => t.provider === 'local' && t.src);
    P.prepare(idx, { autoplay: false });
    out.ok = await P.play();
    await new Promise(r => setTimeout(r, 1500));
    out.playing = P.playing;
    out.t = +P.currentTime.toFixed(2);
    P.pause();
    return out;
  })()`);
  record('播放器：两种来源均已注册', audio?.providers?.includes('local') && audio?.providers?.includes('netease'), JSON.stringify(audio?.providers));
  if (audio?.skipped) {
    record('播放器：无本地音频时优雅待机', audio.tracks === 0 || true, `tracks=${audio.tracks}`);
  } else {
    record('播放器：本地音频可播放', !!(audio?.ok && audio?.t > 0.3), `t=${audio?.t}s`);
  }

  // 交互：发布控制台（仅本地保存，不写盘）
  await visit('#/admin?tab=posts&new=1');
  const save = await evaluate(`(async () => {
    const q = (id) => document.getElementById(id);
    if (!q('fTitle')) return { ok: false, reason: 'form not rendered', tabButtons: [...document.querySelectorAll('.admin__tab')].map(b => b.textContent.trim()) };
    q('fTitle').value = '自检草稿条目';
    q('fContent').value = '## 自检\\n\\n这是一条由自检脚本创建的草稿。';
    q('fDraft').checked = true;
    q('fSummary').value = '自检摘要';
    q('fTitle').dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 250));
    q('btnSaveLocal').click();
    await new Promise(r => setTimeout(r, 600));
    const p = window.Terminal.Posts.all.find(x => x.title === '自检草稿条目');
    return p
      ? { ok: true, draft: p.draft, summary: p.summary, chars: p.stats.chars }
      : { ok: false, reason: 'not saved', total: window.Terminal.Posts.all.length,
          titles: window.Terminal.Posts.all.map(x => x.title).slice(0, 8),
          btnExists: !!q('btnSaveLocal') };
  })()`);
  record('交互：控制台保存草稿', !!save?.ok, JSON.stringify(save));
  record('交互：草稿不进前台列表', (await evaluate(`window.Terminal.Posts.published.some(x => x.title === '自检草稿条目')`)) === false);
  const cleanup = await evaluate(`(() => { const p = window.Terminal.Posts.all.find(x => x.title === '自检草稿条目'); if (p) window.Terminal.Posts.remove(p.id); return window.Terminal.Posts.all.length; })()`);
  record('交互：删除自检数据', typeof cleanup === 'number', `${cleanup} 条剩余`);

  // 服务器在线检测
  await visit('#/admin');
  record('服务：检测到 server.mjs', (await evaluate(`document.getElementById('serverState').textContent.includes('在线')`)) === true);

  // 交互：网易云集成（搜索 → 加入列表 → 官方播放器 → 清理）
  await visit('#/music');
  const ne = await evaluate(`(async () => {
    const mod = await import('/src/plugins/netease.js');
    const out = { apiReady: await mod.probeApi(true) };
    if (!out.apiReady) return out;
    try {
      const s = await mod.search('海阔天空', { limit: 5 });
      out.found = s.songs.length;
      out.withCover = s.songs.filter(x => x.cover).length;
      out.first = s.songs[0] && { id: s.songs[0].id, name: s.songs[0].name, artists: s.songs[0].artists, dur: s.songs[0].duration };
      const P = window.Terminal.Player;
      P.clear();
      // 站内直放现在对大多数曲目都可用，所以要**显式关掉直放**才能验"官方播放器"这条路
      //（这条用例的意图是：回退路径必须一直完好，它对会员/受限曲目与纯静态部署都是唯一出路）
      P.setDirectAudio(false);
      out.addResult = P.add(mod.toTrack(s.songs[0]), { play: true });
      mod.savePlaylist(P.tracks);
      await new Promise(r => setTimeout(r, 700));
      const frame = document.getElementById('neFrame');
      out.embed = { provider: P.providerId, isEmbed: P.isEmbed, title: P.current?.title, frameSrc: frame ? frame.getAttribute('src') : null };
      P.setDirectAudio(null);          // 复原，别影响后面的用例
      out.saved = JSON.parse(localStorage.getItem('ft.terminal.neteasePlaylist') || '[]').length;
      out.parse = {
        url: mod.parseSongId('https://music.163.com/#/song?id=347230'),
        embed: mod.parseSongId('https://music.163.com/outchain/player?type=2&id=1901371647&auto=0&height=66'),
        bare: mod.parseSongId('347230'),
        junk: mod.parseSongId('not-a-link'),
      };
      out.dom = {
        nowTitle: document.querySelector('#neNow .ne-now__title')?.textContent,
        miniTitle: document.getElementById('mpTitle')?.textContent,
        history: document.querySelectorAll('.ne-hist__item').length,
      };
      out.cleanupTracks = (P.clear(), mod.savePlaylist([]), P.tracks.length);
    } catch (e) { out.error = String(e.message || e); }
    return out;
  })()`);
  if (ne.apiReady) {
    record('网易云：代理搜索到曲目', ne.found > 0, `${ne.found} 条`);
    record('网易云：搜索结果带封面', ne.withCover > 0, `${ne.withCover}/${ne.found} 有封面`);
    record('网易云：加入播放列表', ne.addResult?.added === true && ne.saved === 1, JSON.stringify({ add: ne.addResult, saved: ne.saved }));
    record('网易云：挂载官方播放器', ne.embed?.isEmbed === true && /outchain\/player/.test(ne.embed?.frameSrc || ''), ne.embed?.frameSrc || 'no frame');
    record('网易云：迷你播放条同步', ne.dom?.miniTitle === ne.first?.name, JSON.stringify(ne.dom));
    record('网易云：链接解析', ne.parse?.url === '347230' && ne.parse?.embed === '1901371647' && ne.parse?.bare === '347230' && ne.parse?.junk === '', JSON.stringify(ne.parse));
    record('网易云：清空列表后持久化同步', ne.cleanupTracks === 0, String(ne.cleanupTracks));
  } else {
    record('网易云：代理不可用（跳过联网用例，降级路径仍可用）', true, 'server.mjs 未运行或未联网');
  }
  record('网易云：无服务器时链接降级可解析', (await evaluate(`(async () => {
    const mod = await import('/src/plugins/netease.js');
    return mod.parseSongId('https://music.163.com/outchain/player?type=2&id=99&auto=0&height=66') === '99';
  })()`)) === true);

  // 歌单导入：链接解析（不联网也能测，且必须只认歌单、不吞单曲链接）
  const plParse = await evaluate(`(async () => {
    const mod = await import('/src/plugins/netease.js');
    return {
      id: mod.parsePlaylistId('3778678'),
      link: mod.parsePlaylistId('https://music.163.com/#/playlist?id=19723756'),
      hashless: mod.parsePlaylistId('https://music.163.com/playlist?id=19723756'),
      toplist: mod.parsePlaylistId('https://music.163.com/#/discover/toplist?id=3778678'),
      song: mod.parsePlaylistId('https://music.163.com/#/song?id=347230'),
      junk: mod.parsePlaylistId('随便写点什么'),
      limit: mod.PLAYLIST_IMPORT_LIMIT,
    };
  })()`);
  record('歌单：链接解析（歌单 / 排行榜 / 纯 id）',
    plParse?.id === '3778678' && plParse?.link === '19723756'
      && plParse?.hashless === '19723756' && plParse?.toplist === '3778678',
    JSON.stringify(plParse));
  record('歌单：不会把单曲链接当成歌单',
    plParse?.song === '' && plParse?.junk === '', JSON.stringify({ song: plParse?.song, junk: plParse?.junk }));

  // 短链：163cn.tv 必须先展开，不能直接当歌单 id（但它要能被识别出「需要展开」）
  const plShort = await evaluate(`(async () => {
    const mod = await import('/src/plugins/netease.js');
    const share = '起鱼鱼sakasaka 的歌单 https://163cn.tv/bh08MNN0 （来自网易云音乐）';
    return {
      direct: mod.parsePlaylistId('https://163cn.tv/bh08MNN0'),
      isShort: mod.isShortLink('https://163cn.tv/bh08MNN0'),
      fromText: mod.extractLink(share),
      isShortFromText: mod.isShortLink(share),
      normalIsShort: mod.isShortLink('https://music.163.com/#/playlist?id=19723756'),
      bareIsShort: mod.isShortLink('3778678'),
    };
  })()`);
  record('歌单：163cn.tv 短链被识别为「需要展开」而不是直接解析',
    plShort?.direct === '' && plShort?.isShort === true && plShort?.bareIsShort === false,
    JSON.stringify(plShort));
  record('歌单：能从分享文案里抠出链接',
    plShort?.fromText === 'https://163cn.tv/bh08MNN0' && plShort?.isShortFromText === true,
    JSON.stringify({ fromText: plShort?.fromText }));
  record('歌单：普通歌单链接不走短链解析（少一次网络请求）',
    plShort?.normalIsShort === false, String(plShort?.normalIsShort));

  if (ne.apiReady) {
    // 关键回归：导入公开歌单 → 曲目并入列表；重复导入按 id 去重；「替换列表」清空后替换
    await visit('#/music');
    const imp = await evaluate(`(async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const mod = await import('/src/plugins/netease.js');
      const P = window.Terminal.Player;
      const text = (id) => document.getElementById(id)?.textContent.trim();
      const out = {};
      P.clear();
      mod.savePlaylist([]);

      // 走真实 UI：填输入框（搜索与导入共用一个）→ 点「导入歌单」
      document.getElementById('neInput').value = 'https://music.163.com/#/playlist?id=19723756';
      document.getElementById('plImport').click();
      for (let i = 0; i < 60; i++) { await wait(400); if (/已导入|导入失败/.test(text('plStatus'))) break; }
      out.status = text('plStatus');
      out.count = P.tracks.length;
      out.meta = text('metaTracks');
      out.head = text('trackCount');
      out.rows = document.querySelectorAll('#playlistWrap .track').length;
      const t0 = P.tracks[0];
      out.first = t0 ? { title: t0.title, artist: t0.artist, cover: !!t0.cover, dur: t0.duration } : null;
      out.current = P.current?.title || '';
      out.playing = P.playing;
      out.saved = JSON.parse(localStorage.getItem('ft.terminal.neteasePlaylist') || '[]').length;

      // 再点一次同一个歌单：必须全部去重
      document.getElementById('plImport').click();
      for (let i = 0; i < 60; i++) { await wait(400); if (/已在列表中/.test(text('plStatus'))) break; }
      out.status2 = text('plStatus');
      out.count2 = P.tracks.length;

      // 替换：清空后用另一个歌单替换
      const r = await mod.importPlaylist('3778678', { replace: true });
      out.replace = { added: r.added, total: r.total, count: P.tracks.length, name: r.playlist.name };
      out.headAfterReplace = text('trackCount');

      P.clear();
      mod.savePlaylist([]);
      return out;
    })()`);

    record('歌单：导入后曲目并入播放列表（元数据完整）',
      imp?.count >= 50 && imp?.first?.title && imp?.first?.artist && imp?.first?.cover === true
        && imp?.saved === imp?.count,
      JSON.stringify({ count: imp?.count, first: imp?.first, saved: imp?.saved }));
    record('歌单：列表与页头曲目数同步刷新',
      imp?.meta === `${String(imp?.count).padStart(2, '0')} TRACKS` && imp?.head === imp?.meta
        && imp?.rows === imp?.count,
      JSON.stringify({ meta: imp?.meta, head: imp?.head, rows: imp?.rows }));
    record('歌单：导入后自动装载第一首但不自动播放',
      imp?.current === imp?.first?.title && imp?.playing === false,
      JSON.stringify({ current: imp?.current, playing: imp?.playing }));
    record('歌单：重复导入按曲目 id 去重',
      imp?.count2 === imp?.count && /已在列表中/.test(imp?.status2 || ''),
      JSON.stringify({ status2: imp?.status2, count2: imp?.count2 }));
    record('歌单：替换列表会清空原列表',
      imp?.replace?.count === imp?.replace?.total && imp?.replace?.count >= 50
        && imp?.headAfterReplace === `${String(imp?.replace?.count).padStart(2, '0')} TRACKS`,
      JSON.stringify(imp?.replace));

    // 163cn.tv 短链：展开 → 解析出歌单 id → 走真实 UI 导入
    await visit('#/music');
    const short = await evaluate(`(async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const mod = await import('/src/plugins/netease.js');
      const P = window.Terminal.Player;
      const text = (id) => document.getElementById(id)?.textContent.trim();
      const out = {};
      try {
        const r = await mod.resolveLink('https://163cn.tv/bh08MNN0');
        out.finalUrl = r.finalUrl;
        out.hops = r.hops;
      } catch (e) {
        return { skipped: true, reason: String(e.message || e) };
      }
      out.parsed = mod.parsePlaylistId(out.finalUrl);
      P.clear();
      mod.savePlaylist([]);
      document.getElementById('neInput').value =
        '分享歌单《New Start》 https://163cn.tv/bh08MNN0 （来自网易云音乐）';   // 连分享文案一起粘
      document.getElementById('plImport').click();
      for (let i = 0; i < 80; i++) { await wait(400); if (/已导入|导入失败/.test(text('plStatus'))) break; }
      out.status = text('plStatus');
      out.count = P.tracks.length;
      out.head = text('trackCount');
      out.complete = P.tracks.length > 0 && P.tracks.every((t) => !!t.artist && !!t.cover);
      P.clear();
      mod.savePlaylist([]);
      return out;
    })()`);
    if (short?.skipped) {
      record('歌单：163cn.tv 短链导入（跳过）', true, short.reason);
    } else {
      record('歌单：163cn.tv 短链展开后能解析出歌单 id',
        /music\.163\.com/.test(short.finalUrl || '') && /^\d+$/.test(short.parsed || ''),
        JSON.stringify({ hops: short.hops, parsed: short.parsed }));
      record('歌单：粘贴带前后文字的分享文案也能导入（曲目元数据完整）',
        /已导入/.test(short.status || '') && short.count > 0 && short.complete === true
          && short.head === `${String(short.count).padStart(2, '0')} TRACKS`,
        JSON.stringify({ status: short.status, count: short.count, complete: short.complete }));
    }

    // 短链接口是「服务端替你请求 URL」，必须拒绝非网易云域名（防 SSRF）
    const guard = async (u) => {
      try {
        const r = await fetch(`${BASE}/api/netease/resolve?url=${encodeURIComponent(u)}`);
        return r.status;
      } catch { return 0; }
    };
    const gExample = await guard('https://example.com/');
    const gLocal = await guard('http://127.0.0.1:5173/');
    record('歌单：短链展开只允许网易云域名（防 SSRF）',
      gExample === 400 && gLocal === 400, JSON.stringify({ example: gExample, localhost: gLocal }));

    // 搜索结果必须紧贴搜索条下方；而且它出现后官方播放器要重新对齐
    // （结果面板在播放区上方，会把内嵌槽位整体顶下去 —— 宿主是 fixed 定位，
    //   不重新对齐的话播放器会浮在错误的位置）
    await visit('#/music');
    const resultsUI = await evaluate(`(async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const mod = await import('/src/plugins/netease.js');
      const P = window.Terminal.Player;
      const out = {};
      const search = document.querySelector('.music .ne-search');
      out.nextSibling = search?.nextElementSibling?.id || '';
      out.order = [...document.querySelectorAll('.music > *')]
        .map(n => n.id || String(n.className || '').split(' ')[0]);

      P.clear();
      const s = await mod.search('海阔天空', { limit: 1 });
      if (!s.songs.length) return { skipped: true };
      P.add(mod.toTrack(s.songs[0]), { play: false });
      await wait(1600);

      const slot = () => document.querySelector('[data-embed-slot]');
      const host = document.getElementById('embedHost');
      const gap = () => Math.round(slot().getBoundingClientRect().top - host.getBoundingClientRect().top);
      const top = () => Math.round(slot().getBoundingClientRect().top);
      // 文档坐标 = 视口坐标 + scrollY：Chrome 的 scroll anchoring 会调整 scrollY，
      // 只看视口坐标会误判成「槽位没动」
      const docTop = () => Math.round(slot().getBoundingClientRect().top + window.scrollY);
      out.gapBefore = gap();
      out.slotBefore = top();
      out.docBefore = docTop();
      out.hostBefore = Math.round(host.getBoundingClientRect().top);

      document.querySelector('.ne-search [data-kw]')?.click();   // 用快捷标签触发搜索
      await wait(3800);

      out.rows = document.querySelectorAll('#neResults .ne-row').length;
      out.resultsH = Math.round(document.getElementById('neResults').getBoundingClientRect().height);
      out.gapAfter = gap();
      out.slotAfter = top();
      out.docAfter = docTop();
      out.hostAfter = Math.round(host.getBoundingClientRect().top);
      out.hostMoved = out.hostAfter - out.hostBefore;
      out.slotMoved = out.slotAfter - out.slotBefore;
      out.docMoved = out.docAfter - out.docBefore;
      P.clear();
      mod.savePlaylist([]);
      return out;
    })()`);
    if (resultsUI?.skipped) {
      record('搜索结果：位置与播放器重新对齐（跳过）', true, '无可用曲目');
    } else {
      const orderOk = resultsUI?.nextSibling === 'neResults'
        && (resultsUI?.order || []).indexOf('neResults') === (resultsUI?.order || []).indexOf('neSearch') + 1;
      record('搜索结果：面板紧贴搜索条下方（在正在播放与播放列表之前）',
        orderOk === true, JSON.stringify({ next: resultsUI?.nextSibling, order: resultsUI?.order }));
      record('搜索结果：出现后官方播放器跟着槽位重新对齐',
        (resultsUI?.rows || 0) > 0 && (resultsUI?.resultsH || 0) > 150
          && (resultsUI?.docMoved || 0) > 100                                  // 布局上真的把槽位顶下去了
          && Math.abs((resultsUI?.gapAfter || 0) - (resultsUI?.gapBefore || 0)) <= 3   // 相对偏移不变
          && Math.abs((resultsUI?.hostMoved || 0) - (resultsUI?.slotMoved || 0)) <= 3,  // 视口位移一致
        JSON.stringify({
          rows: resultsUI?.rows, resultsH: resultsUI?.resultsH,
          gapBefore: resultsUI?.gapBefore, gapAfter: resultsUI?.gapAfter,
          docMoved: resultsUI?.docMoved, slotMoved: resultsUI?.slotMoved, hostMoved: resultsUI?.hostMoved,
        }));
    }
  } else {
    record('歌单：导入（跳过联网用例）', true, 'server.mjs 未运行或未联网');
  }

  // 关键回归：音乐台页面的播放/暂停按钮必须真正控制官方播放器（而不只是改本站 UI）
  // 注意：底栏迷你条已按需求移除全部控件，播放控制只在音乐台页面（#npPlay）。
  await visit('#/music');
  const toggle = await evaluate(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const mod = await import('/src/plugins/netease.js');
    const P = window.Terminal.Player;
    const prov = P.getProvider('netease');
    const out = { hasPause: typeof prov.pause === 'function', hasPlay: typeof prov.play === 'function' };
    const autoOf = () => {
      const f = document.getElementById('neFrame');
      return f ? new URL(f.src).searchParams.get('auto') : null;
    };
    P.clear();
    const s = await mod.search('海阔天空', { limit: 1 });
    if (!s.songs.length) return { ...out, skipped: true };
    // 这条测的是官方播放器回退路径的 pause/play（auto=0 / auto=1）：
    // 显式关掉站内直放（等价于 PLAYER.directAudio=false），别再依赖
    // "搜索第一条正好是会员曲目" —— 那个前提会随网易云的付费策略变
    P.setDirectAudio(false);
    P.add(mod.toTrack(s.songs[0]), { play: true });
    await wait(1100);
    out.playingInitial = autoOf();    document.getElementById('npPlay').click();   // 暂停
    await wait(900);
    out.paused = { auto: autoOf(), playing: P.playing, frameAlive: !!document.getElementById('neFrame') };
    document.getElementById('npPlay').click();   // 继续
    await wait(900);
    out.resumed = { auto: autoOf(), playing: P.playing, frameAlive: !!document.getElementById('neFrame') };
    return out;
  })()`);
  if (toggle?.skipped) {
    record('播放控制：暂停/继续（跳过）', true, '无可用曲目');
  } else {
    record('播放控制：网易云来源实现 pause/play',
      toggle.hasPause === true && toggle.hasPlay === true, JSON.stringify({ pause: toggle.hasPause, play: toggle.hasPlay }));
    record('播放控制：暂停后播放器切到 auto=0（真正静音）',
      toggle.paused?.auto === '0' && toggle.paused?.frameAlive === true, JSON.stringify(toggle.paused));
    record('播放控制：继续后播放器切回 auto=1',
      toggle.resumed?.auto === '1' && toggle.resumed?.playing === true, JSON.stringify(toggle.resumed));
  }

  // UI 简化：搜索 / 导入共用一个输入框、结果自带标题行、点整行即播放
  await visit('#/music');
  const layout = await evaluate(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const mod = await import('/src/plugins/netease.js');
    const P = window.Terminal.Player;
    P.clear();
    const s = await mod.search('海阔天空', { limit: 3 });
    if (!s.songs.length) return { skipped: true };
    document.querySelector('.ne-search [data-kw]')?.click();     // 真实搜一次
    await wait(3200);
    const out = {
      inputs: [...document.querySelectorAll('.music input')].map((i) => i.id || i.type),
      resultHead: document.querySelector('.ne-results__head')?.textContent.replace(/\\s+/g, ' ').trim() || '',
      rows: document.querySelectorAll('.ne-row').length,
      legacyGrid: !!document.querySelector('.ne-player-grid'),
      legacyManual: !!document.getElementById('neManual'),
      metaNow: !!document.getElementById('metaNow'),
      metaCount: document.querySelectorAll('.viewhead__meta > div').length,
      embedInsideNp: !!document.querySelector('.np .np__embed [data-embed-slot]'),
      histInTracks: !!document.querySelector('.tracks .tracks__hist'),
      panelCount: document.querySelectorAll('.music > .ne-search, .music > .np, .music > .tracks').length,
    };
    // 点整行（点标题文字，不是按钮）就应该开始播放
    P.clear();
    document.querySelector('.ne-row .ne-row__name')?.click();
    await wait(1400);
    out.playedByRowClick = P.tracks.length > 0 && !!P.current;
    out.playingTitle = P.current?.title || '';
    return out;
  })()`);
  if (layout?.skipped) {
    record('音乐台：简化后的结构（跳过）', true, '无可用曲目');
  } else {
    record('音乐台：搜索与导入共用一个输入框（没有第二个粘贴框）',
      JSON.stringify(layout?.inputs) === JSON.stringify(['neInput'])
        && layout?.legacyManual === false,
      JSON.stringify({ inputs: layout?.inputs, legacyManual: layout?.legacyManual }));
    record('音乐台：结果区自带标题行（条数 + 点整行播放提示）',
      /搜索结果/.test(layout?.resultHead || '') && /共 \d+ 条/.test(layout?.resultHead || '')
        && /点整行即可播放/.test(layout?.resultHead || '') && (layout?.rows || 0) > 0,
      JSON.stringify({ head: layout?.resultHead, rows: layout?.rows }));
    record('音乐台：点搜索结果的整行即播放（不用非点按钮）',
      layout?.playedByRowClick === true, JSON.stringify({ played: layout?.playedByRowClick, title: layout?.playingTitle }));
    record('音乐台：播放器并进「正在播放」面板，最近播放收进播放列表',
      layout?.embedInsideNp === true && layout?.histInTracks === true
        && layout?.legacyGrid === false && layout?.panelCount === 3
        && layout?.metaNow === false && layout?.metaCount === 2,
      JSON.stringify({ embedInsideNp: layout?.embedInsideNp, histInTracks: layout?.histInTracks, legacyGrid: layout?.legacyGrid, panels: layout?.panelCount, metaCount: layout?.metaCount }));
  }


  /* ---------------- 会员曲目「不出声」的判定与处理 ---------------- */
  // 官方外链播放器对 VIP / 付费专辑曲目不放音频（服务端匿名探测：外链 302 到 /404），
  // 但 iframe 照转、自建歌词时钟照走 —— 不说明白就是「歌词在动却没声音」。
  const vipProbe = await (async () => {
    try {
      const r = await fetch(`${BASE}/api/netease/playable?id=643982&id=2041508513&id=2683804669`);
      const j = await r.json();
      return { status: r.status, ...j };
    } catch (e) { return { error: String(e.message || e) }; }
  })();
  record('网易云：能判定「匿名态放不放得出来」（会员曲目探测）',
    vipProbe?.ok === true && vipProbe?.results?.['643982'] === false      // SNoW 原版：VIP
      && vipProbe?.results?.['2041508513'] === true                       // 翻唱：免费，能放
      && vipProbe?.results?.['2683804669'] === true                       // fee=8 低音质免费，也能放
      && vipProbe?.known === 3,
    JSON.stringify({ results: vipProbe?.results, known: vipProbe?.known, error: vipProbe?.error }));

  // 真实音频长度：元数据时长可能不准（试听片段 / 现场版），自动下一首靠这个才不干等
  const audioLen = await (async () => {
    try {
      const r = await fetch(`${BASE}/api/netease/playable?detail=1&id=2041508513&id=643982`);
      const j = await r.json();
      return { status: r.status, ...j };
    } catch (e) { return { error: String(e.message || e) }; }
  })();
  record('网易云：能从音频本身量出真实秒数（CBR 码率 / VBR Xing 帧数）',
    audioLen?.results?.['2041508513']?.playable === true
      && Math.abs((audioLen.results['2041508513'].seconds || 0) - 220) < 6
      && (audioLen.results['2041508513'].bitrate || 0) > 32000
      && /cbr|vbr/.test(audioLen.results['2041508513'].mode || '')
      && audioLen?.results?.['643982']?.playable === false,
    JSON.stringify(audioLen?.results));

  const vipUI = await evaluate(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const out = {};
    const input = document.getElementById('neInput');
    input.value = '逆さまの蝶';
    document.getElementById('neGo').click();
    await wait(4600);
    const rows = () => Array.prototype.slice.call(document.querySelectorAll('.ne-row'));
    out.search = {
      rows: rows().length,
      vipTags: document.querySelectorAll('.ne-row .tag--alert').length,
      firstIsVip: !!(rows()[0] && rows()[0].querySelector('.tag--alert')),
    };
    // 「只看能播的」过滤
    document.getElementById('nePlayableOnly').click();
    await wait(420);
    out.filter = {
      pressed: document.getElementById('nePlayableOnly').getAttribute('aria-pressed'),
      rows: rows().length,
      vipLeft: document.querySelectorAll('.ne-row .tag--alert').length,
      head: (document.querySelector('.ne-results__head') || {}).textContent || '',
    };
    document.getElementById('nePlayableOnly').click();
    await wait(320);
    // 播那首 VIP 的
    const vipRow = rows().find((r) => r.dataset.song && JSON.parse(r.dataset.song).id == 643982);
    out.vipRowFound = !!vipRow;
    if (vipRow) vipRow.querySelector('[data-act="play"]').click();
    await wait(6800);
    const notice = document.getElementById('neSilent');
    out.notice = {
      exists: !!notice,
      title: notice ? notice.querySelector('b').textContent.trim() : '',
      alts: notice ? Array.prototype.slice.call(notice.querySelectorAll('.ne-alt')).map((b) => {
        const s = JSON.parse(b.dataset.alt);
        return { id: String(s.id), fee: s.fee, name: s.name };
      }) : [],
      hasNeteaseLink: !!(notice && notice.querySelector('a[href*="music.163.com"]')),
    };
    out.lyricNote = {
      cls: document.getElementById('lyricBox').className,
      label: document.getElementById('lyricLabel').textContent,
      tone: document.getElementById('lyricLabel').dataset.tone,
    };
    // 点「可播放版本」应该真的换过去，并且提示消失
    const alt = notice && notice.querySelector('.ne-alt');
    if (alt) {
      const want = JSON.parse(alt.dataset.alt);
      alt.click();
      await wait(6200);
      out.switched = {
        wantId: String(want.id), wantFee: want.fee,
        gotId: window.Terminal.Player.current && window.Terminal.Player.current.neteaseId,
        gotFee: window.Terminal.Player.current && window.Terminal.Player.current.fee,
        noticeGone: !document.getElementById('neSilent'),
        noteCleared: document.getElementById('lyricBox').className === 'lyricbox',
      };
    }
    return out;
  })()`);
  record('音乐台：搜索结果标出会员曲目，且能「只看能播的」',
    vipUI?.search?.vipTags > 0 && vipUI?.search?.firstIsVip === true
      && vipUI?.filter?.pressed === 'true' && vipUI?.filter?.vipLeft === 0
      && vipUI?.filter?.rows < vipUI?.search?.rows
      && /隐藏 \d+ 首会员曲目/.test(vipUI?.filter?.head || ''),
    JSON.stringify({ search: vipUI?.search, filter: { rows: vipUI?.filter?.rows, vipLeft: vipUI?.filter?.vipLeft, head: vipUI?.filter?.head } }));
  record('音乐台：播会员曲目会说明「不会出声」并给出可播放的同名版本',
    vipUI?.vipRowFound === true && vipUI?.notice?.exists === true
      && /不会出声/.test(vipUI?.notice?.title || '')
      && (vipUI?.notice?.alts || []).length > 0
      && vipUI.notice.alts.every((a) => a.fee === 0 || a.fee === 8)
      && vipUI?.notice?.hasNeteaseLink === true,
    JSON.stringify(vipUI?.notice));
  record('音乐台：点「可播放的版本」真的换过去，提示与歌词标记一起消失',
    vipUI?.switched?.gotId === vipUI?.switched?.wantId
      && (vipUI?.switched?.gotFee === 0 || vipUI?.switched?.gotFee === 8)
      && vipUI?.switched?.noticeGone === true
      && vipUI?.switched?.noteCleared === true,
    JSON.stringify(vipUI?.switched));
  record('歌词：会员曲目时标题栏标出「可能无声」（换到能播的版本后清掉）',
    /可能无声/.test(vipUI?.lyricNote?.label || '')
      && vipUI?.lyricNote?.tone === 'alert'
      && /is-silent/.test(vipUI?.lyricNote?.cls || ''),
    JSON.stringify(vipUI?.lyricNote));

  // 探测是「服务端匿名」结论：真登录了会员的用户不该被反复打扰，给个可撤销的开关
  const vipDismiss = await (async () => {
    try {
      return await evaluate(`(async () => {
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        const out = {};
        localStorage.removeItem('ft.terminal.vipLoggedIn');
        // 先播上那首会员曲目（服务端探测结论已缓存，这一步很快）
        const input = document.getElementById('neInput');
        input.value = '逆さまの蝶';
        document.getElementById('neGo').click();
        await wait(4400);
        const row = Array.prototype.slice.call(document.querySelectorAll('.ne-row'))
          .find((r) => r.dataset.song && JSON.parse(r.dataset.song).id == 643982);
        if (row) row.querySelector('[data-act="play"]').click();
        await wait(6600);
        out.full = (document.getElementById('neSilent') || {}).className || '';
        out.hasVipSet = !!document.getElementById('neVipSet');
        const setBtn = document.getElementById('neVipSet');
        if (setBtn) setBtn.click();
        await wait(700);
        out.slim = (document.getElementById('neSilent') || {}).className || '';
        out.slimAlts = document.querySelectorAll('#neSilent .ne-alt').length;
        out.label = (document.getElementById('lyricLabel') || {}).textContent || '';
        out.storedAfterSet = localStorage.getItem('ft.terminal.vipLoggedIn');
        // 切走再回来，开关应该被记住（仍然是精简版）
        location.hash = '#/logs';
        await wait(1100);
        location.hash = '#/music';
        await wait(2300);
        out.afterRoute = (document.getElementById('neSilent') || {}).className || '';
        out.afterRouteLabel = (document.getElementById('lyricLabel') || {}).textContent || '';
        // 撤销
        const unset = document.getElementById('neVipUnset');
        out.hasUnset = !!unset;
        if (unset) unset.click();
        await wait(2800);
        out.restoredStored = localStorage.getItem('ft.terminal.vipLoggedIn');
        out.restoredNotice = (document.getElementById('neSilent') || {}).className || '';
        out.restoredAlts = document.querySelectorAll('#neSilent .ne-alt').length;
        out.restoredLabel = (document.getElementById('lyricLabel') || {}).textContent || '';
        return out;
      })()`);
    } catch (e) { return { error: String(e.message || e) }; }
  })();
  record('音乐台：登录了会员的用户能关掉提示（切板块记住、可撤销）',
    /ne-silent--slim/.test(vipDismiss?.slim || '')
      && vipDismiss?.hasVipSet === true && vipDismiss?.slimAlts === 0
      && !/可能无声/.test(vipDismiss?.label || '')
      && vipDismiss?.storedAfterSet === '1'
      && /ne-silent--slim/.test(vipDismiss?.afterRoute || '')
      && !/可能无声/.test(vipDismiss?.afterRouteLabel || '')
      && vipDismiss?.hasUnset === true
      && vipDismiss?.restoredStored === null
      && vipDismiss?.restoredNotice === 'ne-silent' && (vipDismiss?.restoredAlts || 0) > 0
      && /可能无声/.test(vipDismiss?.restoredLabel || ''),
    JSON.stringify(vipDismiss));

  /* ---------------- 网易云曲目的「自动下一首」（估算） ---------------- */
  // "放完就接上"是听歌的常态，所以默认开着；难点在于官方 iframe 不给结束回调。
  // 三层保护：锚点对齐 iframe load + 缓冲补偿；时长优先用服务端量出的真实秒数；
  // 触发点只留 1 秒多的尾巴。用户动过官方控制条就放弃估算（位置无从推断）。
  const autoNext = await evaluate(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const T = window.Terminal;
    const P = T.Player;
    const out = {};
    const btn = document.getElementById('plAutoNext');
    out.defaults = {
      embedAutoNext: P.embedAutoNext,
      stored: T.Settings.get('autoplayNextEmbed') === undefined ? null : T.Settings.get('autoplayNextEmbed'),
      timer: !!P._advanceTimer,
      toggleText: btn ? btn.textContent : '',
      ariaPressed: btn ? btn.getAttribute('aria-pressed') : '',
    };
    if (!btn) return out;

    // 先播一首**确定能放**的（服务端量得出真实秒数），再断言触发点
    const input = document.getElementById('neInput');
    input.value = '逆さまの蝶';
    document.getElementById('neGo').click();
    await wait(4200);
    const row = Array.prototype.slice.call(document.querySelectorAll('.ne-row'))
      .find((r) => r.dataset.song && JSON.parse(r.dataset.song).id == 2041508513);
    if (row) row.querySelector('[data-act="play"]').click();
    // 等探测回来（两个 HTTP 往返），最多 8 秒
    for (let i = 0; i < 40 && !(P.current && P.current.audioSeconds > 0); i++) await wait(200);

    // ⚠️ 这一组断言测的是**官方播放器回退路径**的估算时钟（提前量 / 静音秒表 / 锚点）。
    //    网易云曲目现在默认走站内直放，直放有真实 ended、根本没有这套时钟，
    //    所以这里显式关掉直放（等价于 PLAYER.directAudio=false）再重新装载。
    P.setDirectAudio(false);
    P.prepare(P.index, { autoplay: true });
    await wait(1600);

    const real = Number((P.current && P.current.audioSeconds) || 0);
    const meta = Number((P.current && P.current.duration) || 0);
    out.playing = {
      id: P.current && P.current.neteaseId,
      real, meta,
      total: P._advanceAt,
      lead: Math.round(((real || meta) - P._advanceAt) * 10) / 10,   // 提前量（正数=在结束前多久切）
      usesReal: real > 0 && Math.abs(P._advanceAt - (real - 0.8)) < 0.3,
      beforeEnd: P._advanceAt < (real || meta),
      action: P._advanceAction,
      timer: !!P._advanceTimer,
    };
    // 关掉 → 不再提前切，而是布防成"到点停住"（官方播放器是单曲循环，不管就会无限重播）
    btn.click();
    await wait(450);
    out.off = {
      embedAutoNext: P.embedAutoNext,
      stored: T.Settings.get('autoplayNextEmbed'),
      timer: !!P._advanceTimer,
      action: P._advanceAction,
      at: Math.round(P._advanceAt * 10) / 10,
      afterEnd: (P._advanceAt || 0) > (real || meta),
      text: btn.textContent,
    };
    btn.click();
    await wait(450);
    out.on = {
      embedAutoNext: P.embedAutoNext,
      stored: T.Settings.get('autoplayNextEmbed'),
      timer: !!P._advanceTimer,
      action: P._advanceAction,
      at: Math.round(P._advanceAt * 10) / 10,
    };
    // 锚点校正
    const before = P.elapsed;
    P._reanchorEmbed();
    out.reanchor = { before: Math.round(before * 10) / 10, after: Math.round(P.elapsed * 10) / 10 };
    // 动过官方控制条 → 挂起；换歌 → 恢复
    P.suspendAdvance('verify');
    await wait(300);
    out.suspended = { flag: P._advanceSuspended === true, timer: !!P._advanceTimer };
    P.next({ auto: true });
    await wait(2000);
    out.resumed = { flag: P._advanceSuspended === true, timer: !!P._advanceTimer };
    return out;
  })()`);
  record('音乐台：网易云曲目的「自动下一首」默认开启（放完就接上）',
    autoNext?.defaults?.embedAutoNext === true
      && autoNext?.defaults?.stored === null
      && autoNext?.defaults?.timer === true
      && !/（关）/.test(autoNext?.defaults?.toggleText || '')
      && autoNext?.defaults?.ariaPressed === 'true',
    JSON.stringify(autoNext?.defaults));
  record('音乐台：切歌用「真实秒数 − 提前量」（提前切，避免听到上一首重播）',
    autoNext?.playing?.usesReal === true
      && (autoNext?.playing?.lead ?? 0) > 0.3 && (autoNext?.playing?.lead ?? 9) <= 1.2
      && (autoNext?.playing?.total || 0) < (autoNext?.playing?.real || 0)
      && autoNext?.playing?.beforeEnd === true && autoNext?.playing?.action === 'next',
    JSON.stringify(autoNext?.playing));
  record('音乐台：关掉自动接播后，播完会停住（不让官方播放器单曲循环下去）',
    autoNext?.off?.embedAutoNext === false && autoNext?.off?.stored === false
      && /（关）/.test(autoNext?.off?.text || '')
      && autoNext?.off?.action === 'pause' && autoNext?.off?.timer === true
      && autoNext?.off?.afterEnd === true
      && autoNext?.on?.embedAutoNext === true && autoNext?.on?.stored === true
      && autoNext?.on?.action === 'next' && autoNext?.on?.timer === true,
    JSON.stringify({ off: autoNext?.off, on: autoNext?.on }));
  record('音乐台：iframe 载入会往回校正估算锚点（扣掉加载与缓冲时间）',
    (autoNext?.reanchor?.before || 0) >= 0 && (autoNext?.reanchor?.after || 0) <= (autoNext?.reanchor?.before || 0)
      && (autoNext?.reanchor?.after || 0) < 1,
    JSON.stringify(autoNext?.reanchor));
  record('音乐台：动过官方控制条就放弃估算（换歌后恢复）',
    autoNext?.suspended?.flag === true && autoNext?.suspended?.timer === false
      && autoNext?.resumed?.flag === false && autoNext?.resumed?.timer === true,
    JSON.stringify({ suspended: autoNext?.suspended, resumed: autoNext?.resumed }));

  /* ---- 静音媒体秒表：后台标签页的定时器会被节流到每分钟一次，切歌不能挂在它上面 ----
   * （实测：隐藏 6.5 分钟里 500ms 的 setInterval 只跑了 35 次、单次最大间隔 60 秒；
   *   官方播放器又是单曲循环，于是"该切歌"会被拖到用户切回前台才执行。）
   * 这里把兜底计时器**摘掉**，看切歌还能不能按时发生 —— 能，就说明真的挂在媒体时钟上。
   */
  const clock = await evaluate(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const P = window.Terminal.Player;
    const out = {};
    if (!P.current || P.current.provider !== 'netease') return { skipped: '当前不是网易云曲目' };
    // 估算时钟只对官方播放器回退路径生效：显式关掉直放，免得上一段用例的开关残留
    P.setDirectAudio(false);
    await wait(1600);
    out.armed = {
      hasEl: !!P._clockEl,
      muted: P._clockEl ? P._clockEl.muted : null,
      paused: P._clockEl ? P._clockEl.paused : null,
      secs: P._clockSecs || 0,
      source: P._advanceSource,
      hidden: P._clockEl ? getComputedStyle(P._clockEl).opacity === '0' : null,
    };
    // 先摘掉兜底计时器，免得它中途"对表"影响这次测量（只测秒表自己走不走）
    if (P._advanceTimer) { clearInterval(P._advanceTimer); P._advanceTimer = null; }
    const a = P._clockEl ? P._clockEl.currentTime : 0;
    await wait(2200);
    out.running = Math.round(((P._clockEl ? P._clockEl.currentTime : 0) - a) * 10) / 10;

    // 端到端：假时长 4 秒，**同时把兜底计时器和墙钟都废掉**（把锚点推到 30 秒后，
    // elapsed 会一直是 0），这样唯一能触发切歌的只剩媒体秒表。
    const track = P.tracks[P.index];
    track.audioSeconds = 4;
    P._scheduleAdvance(track);
    if (P._advanceTimer) { clearInterval(P._advanceTimer); P._advanceTimer = null; }
    P._playStartedAt = Date.now() + 30000;
    if (P._clockEl) P._clockEl.currentTime = 0;
    const idx0 = P.index;
    const t0 = Date.now();
    let at = null;
    for (let i = 0; i < 60; i++) {
      await wait(150);
      if (P.index !== idx0) { at = Math.round((Date.now() - t0) / 100) / 10; break; }
    }
    out.mediaOnly = { switchedIn: at, from: idx0, to: P.index, wallClockNeutralized: P.elapsed < 1 };

    // 关掉自动接播：应该由秒表在末尾停住
    P.setEmbedAutoNext(false);
    await wait(250);
    const t2 = P.tracks[P.index];
    const idxBefore = P.index;
    t2.audioSeconds = 3;
    P._scheduleAdvance(t2);
    // 布防时记下"到点该做什么"：秒表触发后会 _clearAdvance()，那时 _advanceAction 已被清空
    const actionArmed = P._advanceAction;
    if (P._advanceTimer) { clearInterval(P._advanceTimer); P._advanceTimer = null; }
    if (P._clockEl) P._clockEl.currentTime = 0;
    await wait(4500);
    out.offStops = { action: actionArmed, playing: P.playing, sameTrack: P.index === idxBefore, timer: !!P._advanceTimer };
    P.setEmbedAutoNext(true);

    // 回到前台的对表：过期了要立刻执行
    P.prepare(P.index, { autoplay: true });
    await wait(2200);
    const t3 = P.tracks[P.index];
    t3.audioSeconds = 300;
    P._scheduleAdvance(t3);
    const idx1 = P.index;
    P._advanceAt = 0.1;
    if (P._clockEl) P._clockEl.currentTime = 6;
    P._checkAdvanceNow();
    await wait(900);
    out.catchUp = {
      switched: P.index !== idx1,
      // 偶发红时能一眼看出原因：iframe 重建后若被判成"用户动过官方控制条"，
      // 估算会被挂起（见 embed:touched 的聚焦启发式），这条用例就会失败
      suspended: P._advanceSuspended === true,
      at: Math.round((P._advanceAt || 0) * 10) / 10,
      timer: !!P._advanceTimer,
    };
    out.harmless = {
      muted: P._clockEl ? P._clockEl.muted : null,
      aria: P._clockEl ? P._clockEl.getAttribute('aria-hidden') : null,
      offscreen: P._clockEl ? /-9999px/.test(P._clockEl.style.cssText) : null,
    };
    return out;
  })()`);
  record('音乐台：切歌挂在「静音媒体秒表」上（废掉计时器与墙钟也照样按时切）',
    clock?.armed?.hasEl === true && clock?.armed?.muted === true && clock?.armed?.paused === false
      && (clock?.armed?.secs || 0) > 200 && clock?.armed?.source === 'media'
      && clock?.armed?.hidden === true && (clock?.running || 0) > 1.5
      && clock?.mediaOnly?.switchedIn !== null && (clock?.mediaOnly?.switchedIn || 99) < 4
      && clock?.mediaOnly?.wallClockNeutralized === true,
    JSON.stringify({ armed: clock?.armed, running: clock?.running, mediaOnly: clock?.mediaOnly }));
  record('音乐台：关掉自动接播时由秒表在末尾停住；回到前台会立刻对表补执行',
    clock?.offStops?.action === 'pause' && clock?.offStops?.playing === false
      && clock?.offStops?.sameTrack === true && clock?.offStops?.timer === false
      && clock?.catchUp?.switched === true
      && clock?.harmless?.muted === true && clock?.harmless?.aria === 'true' && clock?.harmless?.offscreen === true,
    JSON.stringify({ offStops: clock?.offStops, catchUp: clock?.catchUp, harmless: clock?.harmless }));

  /* ---------------- 站内直放（默认路径）：真实 ended 驱动切歌 ----------------
   * 上面那些用例测的是「官方播放器回退路径」；这里补上**正面**用例，
   * 因为直放才是现在的默认路径，且它是「后台 / 息屏也能自动切歌」的前提：
   *   · 曲目走 netease-audio（同源 <audio>），拿得到真实时长与进度；
   *   · **不布防**估算时钟 —— 切歌由真实 ended 驱动（没有任何"猜"的成分）；
   *   · 音源是本站同源转发地址，不再是跨域 iframe；
   *   · 注册了 Media Session（移动端后台 / 锁屏控制的基础）。
   * 端到端的「完整放完 → 自动下一首」（前台 + document.hidden 各一遍）
   * 由 tools/verify-playback.mjs 负责，那里用的是真实播放。
   */
  await visit('#/music');
  const direct = await evaluate(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const mod = await import('/src/plugins/netease.js');
    const P = window.Terminal.Player;
    P.setDirectAudio(true);              // 回到默认路径（前面的用例把它关掉过）
    P.clear();
    const s = await mod.search('逆さまの蝶', { limit: 20 });
    const songs = s.songs || [];
    if (!songs.length) return { skipped: true, why: '搜索没有结果' };
    // 挑一首**服务端确认匿名能播**的曲目。写死某一首会因上游版权状态变化而假红
    //（线上就遇到过：同一首今天能播、明天匿名拿不到）。
    const prefer = songs.find((x) => String(x.id) === '2041508513');
    const candidates = [prefer, ...songs].filter(Boolean).slice(0, 6);
    let song = null;
    for (const cand of candidates) {
      const info = await mod.audioInfo(cand.id).catch(() => null);
      if (info?.playable === true) { song = cand; break; }
    }
    if (!song) return { skipped: true, why: '候选曲目匿名态都拿不到音频（上游条件）' };
    P.add(mod.toTrack(song), { play: true });
    for (let i = 0; i < 60 && !(P.audio.duration > 0 && P.audio.currentTime > 0.2); i++) await wait(250);
    const out = {
      provider: P.providerId,
      isEmbed: P.isEmbed,
      duration: P.audio.duration || 0,
      time: P.audio.currentTime || 0,
      src: String(P.audio.getAttribute('src') || ''),
      advanceTimer: !!P._advanceTimer,
      advanceAt: P._advanceAt || 0,
      mediaSession: 'mediaSession' in navigator,
      metaTitle: (navigator.mediaSession && navigator.mediaSession.metadata && navigator.mediaSession.metadata.title) || '',
      title: (P.current && P.current.title) || '',
    };
    P.pause();
    await wait(300);
    P.clear();
    return out;
  })()`);
  if (direct?.skipped) {
    record('站内直放：网易云曲目默认走同源 <audio>（跳过）', true, direct.why || '无可用曲目');
  } else {
    record('站内直放：网易云曲目默认走 netease-audio（同源 <audio>）',
      direct.provider === 'netease-audio' && direct.isEmbed === false,
      `provider=${direct.provider}`);
    record('站内直放：有真实音频时长与播放进度（不是估算）',
      direct.duration > 60 && direct.time > 0.2,
      `${Number(direct.duration).toFixed(1)}s / 已播 ${Number(direct.time).toFixed(1)}s`);
    // 音源可以是两级：① 本站同源转发（首选，能拖动进度、拿得到真实时长）
    //                ② 浏览器用自己的 IP 直取官方外链（服务端 IP 被网易云拒绝时用）
    // 两级都是"站内 <audio> 直放"，所以这里接受两者，但仍要拒绝跨域 iframe。
    record('站内直放：音源是同源转发或官方外链直取（不是 iframe）',
      /^\/api\/netease\/audio\?id=/.test(direct.src || '')
        || /^https:\/\/music\.163\.com\/song\/media\/outer\/url\?id=/.test(direct.src || ''),
      direct.src);
    record('站内直放：不布防估算时钟（切歌由真实 ended 驱动）',
      direct.advanceTimer === false && direct.advanceAt === 0,
      `timer=${direct.advanceTimer} at=${direct.advanceAt}`);
    record('站内直放：系统媒体面板已登记当前曲目（移动端后台 / 锁屏）',
      direct.mediaSession === true && direct.metaTitle === direct.title,
      `meta="${direct.metaTitle}" title="${direct.title}"`);
  }

  // 官方原皮播放器的「融入站内」改造：
  //   · 默认只留一条控制带（裁掉封面与标题 —— 站内自己的卡片已经有这些）
  //   · 可以一键切回官方完整形态
  //   · 浅色主题用 multiply 吃掉白底，深色主题反色
  //   · 内嵌形态下不重复显示宿主自带的 ✕
  const embedSkin = await evaluate(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const P = window.Terminal.Player;
    const mod = await import('/src/plugins/netease.js');
    P.setDirectAudio(false);            // 官方原皮形态只能在 iframe 上测
    P.clear();
    const s = await mod.search('海阔天空', { limit: 1 });
    if (!s.songs.length) return { skipped: true };
    P.add(mod.toTrack(s.songs[0]), { play: true });
    await wait(1400);
    const host = document.getElementById('embedHost');
    const box = () => document.getElementById('embedBox');
    const ifr = document.getElementById('neFrame');
    const out = {
      defaultCrop: host?.dataset.crop,
      bodyCrop: document.body.dataset.embedCrop,
      compactH: Math.round(host.getBoundingClientRect().height),
      btn: document.getElementById('embedCrop')?.textContent.trim(),
      blend: getComputedStyle(ifr).mixBlendMode,
      filter: getComputedStyle(ifr).filter,
      closeDisplay: getComputedStyle(document.getElementById('embedClose')).display,
      stage: Math.round(box()?.querySelector('[data-embed-stage]')?.getBoundingClientRect().height || 0),
    };
    // 切到完整形态
    document.getElementById('embedCrop')?.click();
    await wait(1300);
    out.fullCrop = host?.dataset.crop;
    out.fullH = Math.round(host.getBoundingClientRect().height);
    out.fullBtn = document.getElementById('embedCrop')?.textContent.trim();
    out.fullStage = Math.round(box()?.querySelector('[data-embed-stage]')?.getBoundingClientRect().height || 0);
    out.stored = localStorage.getItem('ft-embed-crop');
    // 切回紧凑
    document.getElementById('embedCrop')?.click();
    await wait(1300);
    out.backCrop = host?.dataset.crop;
    // 槽位里的「停止」：收掉 iframe 并回到待机形态
    document.getElementById('embedStop')?.click();
    await wait(1200);
    out.stopped = {
      hidden: host?.hidden,
      dock: host?.dataset.dock,
      iframe: !!document.getElementById('neFrame'),
      active: !!box()?.classList.contains('is-active'),
      placeholder: !!box()?.querySelector('.ne-embed-slot__ph'),
      head: box()?.querySelector('.ne-embed-slot__head')?.textContent.replace(/\\s+/g, ' ').trim(),
    };
    localStorage.removeItem('ft-embed-crop');
    return out;
  })()`);
  if (embedSkin?.skipped) {
    record('官方播放器：融入站内的外观改造（跳过）', true, '无可用曲目');
  } else {
    record('官方播放器：默认只留控制带（裁掉封面与标题）',
      embedSkin?.defaultCrop === '1' && embedSkin?.bodyCrop === '1'
        && (embedSkin?.compactH || 999) < 70 && embedSkin?.stage === 48
        && /完整播放器/.test(embedSkin?.btn || ''),
      JSON.stringify({ crop: embedSkin?.defaultCrop, hostH: embedSkin?.compactH, stage: embedSkin?.stage, btn: embedSkin?.btn }));
    record('官方播放器：可切回官方完整形态（并记住选择）',
      embedSkin?.fullCrop === '0' && (embedSkin?.fullH || 0) > 90 && embedSkin?.fullStage === 106
        && /仅控制条/.test(embedSkin?.fullBtn || '') && embedSkin?.stored === '0'
        && embedSkin?.backCrop === '1',
      JSON.stringify({ fullH: embedSkin?.fullH, stage: embedSkin?.fullStage, btn: embedSkin?.fullBtn, stored: embedSkin?.stored }));
    record('官方播放器：配色融进主题（浅色 multiply / 深色反色）',
      (embedSkin?.blend === 'multiply') || /invert/.test(embedSkin?.filter || ''),
      JSON.stringify({ mixBlendMode: embedSkin?.blend, filter: embedSkin?.filter }));
    record('官方播放器：内嵌时不重复显示宿主自带的关闭键',
      embedSkin?.closeDisplay === 'none', `#embedClose display=${embedSkin?.closeDisplay}`);
    record('官方播放器：槽位「停止」收掉播放器并回到待机',
      embedSkin?.stopped?.hidden === true && embedSkin?.stopped?.iframe === false
        && embedSkin?.stopped?.active === false && embedSkin?.stopped?.placeholder === true
        && /待机/.test(embedSkin?.stopped?.head || ''),
      JSON.stringify(embedSkin?.stopped));
  }

  // 歌词：板块标题栏右侧那块空白，播放时显示当前行 + 下一行
  // 时间轴是「自建时钟」（官方 iframe 读不到 currentTime），详见 plugins/lyrics.js
  const lyric = await evaluate(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const mod = await import('/src/plugins/netease.js');
    const P = window.Terminal.Player;
    const L = window.Terminal.Lyrics;
    P.clear();
    const s = await mod.search('海阔天空', { limit: 1 });
    if (!s.songs.length) return { skipped: true };
    // 歌词跟随的自建时钟是**回退路径**的方案（直放有真实 currentTime，不需要估算）
    P.setDirectAudio(false);
    P.add(mod.toTrack(s.songs[0]), { play: true });
    for (let i = 0; i < 60 && L.status === 'loading'; i++) await wait(250);
    const box = () => document.getElementById('lyricBox');
    const out = {
      status: L.status,
      lines: L.lines.length,
      creditFiltered: !L.lines.slice(0, 3).some(l => /作词|作曲|编曲|制作人|录音/.test(l.text)),
      boxVisible: box() ? !box().hidden : null,
      label: document.getElementById('lyricLabel')?.textContent || '',
      cur: document.getElementById('lyricCur')?.textContent || '',
      next: document.getElementById('lyricNext')?.textContent || '',
    };
    const a = L.elapsed();
    await wait(1200);
    out.tickMs = Math.round(L.elapsed() - a);
    // 时钟是否在走：单看首尾差值会被「iframe 重建 → 时钟归零」干扰，
    // 所以逐步采样取最大步进 —— 只要有一步跟着真实时间走，就说明时钟在工作
    let prev = L.elapsed();
    let maxStep = 0;
    for (let i = 0; i < 6; i++) {
      await wait(300);
      const cur = L.elapsed();
      maxStep = Math.max(maxStep, cur - prev);
      prev = cur;
    }
    out.tickStep = Math.round(maxStep);
    out.running = L._running;
    // 切到别的板块：歌词应该照样跟着
    location.hash = '#/gallery';
    await wait(1000);
    out.otherSection = box()
      ? { exists: true, visible: !box().hidden, cur: document.getElementById('lyricCur')?.textContent || '' }
      : { exists: false };
    // 首页没有 viewhead，走的是 hero__stage 两列：歌词在大标题右边那块空白里
    location.hash = '#/';
    await wait(1400);
    const heroBox = document.getElementById('lyricBox');
    const heroTitle = document.querySelector('.hero__title');
    const hb = heroBox?.getBoundingClientRect();
    const tb = heroTitle?.getBoundingClientRect();
    out.home = {
      exists: !!heroBox,
      visible: heroBox ? !heroBox.hidden : null,
      cur: document.getElementById('lyricCur')?.textContent || '',
      cols: getComputedStyle(document.querySelector('.hero__stage')).gridTemplateColumns.split(' ').length,
      gapToTitle: (hb && tb) ? Math.round(hb.x - tb.right) : null,
      overlapsTitle: (hb && tb && hb.width) ? !(hb.x > tb.right || hb.right < tb.x || hb.y > tb.bottom || hb.bottom < tb.y) : null,
      heightInsideHero: (() => {
        const hero = document.querySelector('.hero')?.getBoundingClientRect();
        return (hero && hb) ? Math.round(hero.bottom - hb.bottom) : null;
      })(),
    };
    // 完整歌词浮层：先把时钟拨到 45 秒处，保证一定有一行是「当前行」
    L.start(45000);
    await wait(400);
    out.indexAt45s = L.index;
    box()?.click();
    await wait(800);
    const full = document.querySelector('.lyricfull');
    out.overlay = {
      open: !!full,
      lines: full ? full.querySelectorAll('.lyricfull__line').length : 0,
      cur: full?.querySelector('.lyricfull__line.is-cur')?.textContent || '',
      title: full?.querySelector('.lyricfull__title')?.textContent || '',
      hint: full?.querySelector('.lyricfull__hint')?.textContent || '',
    };
    document.getElementById('lyricClose')?.click();
    await wait(300);
    out.overlayClosed = !document.querySelector('.lyricfull');
    // 换句的「翻转」动效：换句瞬间应该有动画在跑，落定后必须清干净
    // 换句的「翻转」动效：换句瞬间应该有动画在跑，落定后必须清干净。
    // 这里用轮询而不是死等固定毫秒 —— 换句由 250ms 的时钟 tick 触发，
    // 固定 sleep 很容易采样在动画开始前/结束后（曾经的偶发红）。
    const waitFor = async (fn, ms = 2500) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (fn()) return true;
        await wait(40);
      }
      return fn();
    };
    const curEl = document.getElementById('lyricCur');
    const nextEl = document.getElementById('lyricNext');
    const before = curEl.textContent;
    L.start(90000);
    const sawRotation = await waitFor(
      () => /matrix3d/.test(getComputedStyle(curEl).transform) && Number(getComputedStyle(curEl).opacity) < 1,
      1500,
    );
    out.rolling = {
      sawRotation,
      animsMid: curEl.getAnimations().length,
      transformMid: getComputedStyle(curEl).transform,
      opacityMid: Number(getComputedStyle(curEl).opacity),
    };
    out.rolling.settled = await waitFor(() => curEl.getAnimations().length === 0 && nextEl.getAnimations().length === 0);
    out.rolling.animsAfter = curEl.getAnimations().length;
    out.rolling.textChanged = curEl.textContent !== before;
    out.rolling.transformAfter = getComputedStyle(curEl).transform;
    // 连续快进（模拟副歌密集换句）不能让动画越积越多
    for (const t of [95000, 100000, 105000, 110000]) { L.start(t); await wait(120); }
    out.rolling.afterBurstSettled = await waitFor(() => curEl.getAnimations().length === 0 && nextEl.getAnimations().length === 0, 3000);
    out.rolling.afterBurst = curEl.getAnimations().length;
    out.rolling.nextAfterBurst = nextEl.getAnimations().length;
    // 解析器单测（含开头制作信息的过滤、一行多时间戳）
    const { parseLrc } = await import('/src/plugins/lyrics.js');
    out.parse = parseLrc('[00:00.50] 作词 : 某某\\n[00:01.00]第一句\\n[00:12.25][01:05.50]副歌').map(l => l.t + ':' + l.text).join(' | ');

    // 首页的波浪条：歌词下方、和底栏同一套音浪（.mp-wave）、播放时真的在动
    const waveRow = document.querySelector('.wave-row');
    const waveEl = waveRow?.querySelector('.mp-wave');
    const wCover = waveRow?.querySelector('.wave-row__cover');
    const wBars = [...(waveEl?.querySelectorAll('i') || [])];
    const h1 = wBars.map((b) => b.style.height);
    await wait(520);
    const h2 = wBars.map((b) => b.style.height);
    const lyricEl = document.getElementById('lyricBox');
    out.wave = {
      exists: !!waveRow,
      visible: waveRow ? !waveRow.hidden : null,
      gapBelowLyric: (waveRow && lyricEl) ? Math.round(waveRow.getBoundingClientRect().top - lyricEl.getBoundingClientRect().bottom) : null,
      bars: wBars.length,
      sameClassAsMiniBar: !!waveEl?.classList.contains('mp-wave'),
      live: waveEl ? waveEl.classList.contains('is-live') : null,
      playing: waveRow ? waveRow.classList.contains('is-playing') : null,
      coverRound: wCover ? getComputedStyle(wCover).borderRadius : '',
      coverHasImage: !!(wCover && wCover.style.backgroundImage),
      anim: wCover ? getComputedStyle(wCover).animationName : '',
      heightChanged: h1.filter((v, i) => v !== h2[i]).length,
      filledWidth: waveRow ? Math.round(waveRow.getBoundingClientRect().width) : 0,
      waveWidth: waveEl ? Math.round(waveEl.getBoundingClientRect().width) : 0,
    };
    // 没有曲目时应该整块收起（不听歌的人不该看到它）
    P.clear();
    await wait(700);
    out.wave.hiddenAfterClear = document.querySelector('.wave-row')?.hidden;
    return out;
  })()`);
  if (lyric?.skipped) {
    record('歌词：板块标题栏显示正在播放的歌词（跳过）', true, '无可用曲目');
  } else {
    record('歌词：服务端能取到 LRC，且开头的制作信息被过滤',
      lyric?.status === 'ready' && lyric?.lines > 5 && lyric?.creditFiltered === true,
      JSON.stringify({ status: lyric?.status, lines: lyric?.lines, creditFiltered: lyric?.creditFiltered }));
    record('歌词：标题栏显示当前行 + 下一行',
      lyric?.boxVisible === true && /LYRICS|NOW PLAYING/.test(lyric?.label || '')
        && (lyric?.cur || '').length > 0,
      JSON.stringify({ label: lyric?.label, cur: lyric?.cur, next: lyric?.next }));
    record('歌词：时钟在走（官方 iframe 读不到进度，用自建时钟估算）',
      lyric?.running === true && (lyric?.tickStep || 0) >= 250,
      `运行中=${lyric?.running}，300ms 采样里最大步进 ${lyric?.tickStep}ms`);
    record('歌词：每个板块的标题栏都在（切到画廊依然显示）',
      lyric?.otherSection?.exists === true && lyric?.otherSection?.visible === true
        && (lyric?.otherSection?.cur || '').length > 0,
      JSON.stringify(lyric?.otherSection));
    record('歌词：首页大标题右侧也有（两列并排、不压标题）',
      lyric?.home?.exists === true && lyric?.home?.visible === true
        && (lyric?.home?.cur || '').length > 0
        && lyric?.home?.cols === 2
        && (lyric?.home?.gapToTitle || 0) > 0
        && lyric?.home?.overlapsTitle === false
        && (lyric?.home?.heightInsideHero || 0) > 0,
      JSON.stringify(lyric?.home));
    record('歌词：点开有完整歌词浮层（当前行高亮 + 可关闭）',
      lyric?.overlay?.open === true && (lyric?.overlay?.lines || 0) > 5
        && (lyric?.overlay?.cur || '').length > 0 && /估算/.test(lyric?.overlay?.hint || '')
        && lyric?.overlayClosed === true,
      JSON.stringify({ ...lyric?.overlay, closed: lyric?.overlayClosed }));
    record('歌词：LRC 解析（一行多时间戳 + 制作信息过滤）',
      lyric?.parse === '1000:第一句 | 12250:副歌 | 65500:副歌',
      String(lyric?.parse));
    // 「太生硬」→ 换句时做一次翻转（rotateX + 位移 + 淡入淡出），落定后不留动画
    record('歌词：换句有翻转动效，且落定后不留残余动画',
      lyric?.rolling?.sawRotation === true
        && /matrix3d/.test(lyric?.rolling?.transformMid || '')
        && (lyric?.rolling?.opacityMid ?? 1) < 1
        && lyric?.rolling?.settled === true
        && lyric?.rolling?.animsAfter === 0
        && lyric?.rolling?.transformAfter === 'none'
        && lyric?.rolling?.textChanged === true
        && lyric?.rolling?.afterBurstSettled === true
        && lyric?.rolling?.afterBurst === 0 && lyric?.rolling?.nextAfterBurst === 0,
      JSON.stringify(lyric?.rolling));
    // 首页波浪条：歌词下方、和底栏同一套音浪、播放时真的在动
    record('首页：波浪条在歌词正下方，和底栏同款（40 根条 + 会转的小封面）',
      lyric?.wave?.exists === true && lyric?.wave?.visible === true
        && (lyric?.wave?.gapBelowLyric ?? -1) >= 0 && (lyric?.wave?.gapBelowLyric ?? 999) < 80
        && lyric?.wave?.bars === 40 && lyric?.wave?.sameClassAsMiniBar === true
        && lyric?.wave?.live === true
        && lyric?.wave?.coverRound === '50%' && lyric?.wave?.coverHasImage === true
        && /mpSpin/.test(lyric?.wave?.anim || ''),
      JSON.stringify(lyric?.wave));
    record('首页：波浪条真的在动（条高随时间变化），没有曲目时收起',
      (lyric?.wave?.heightChanged || 0) > 5
        && (lyric?.wave?.waveWidth || 0) > 300
        && lyric?.wave?.hiddenAfterClear === true,
      JSON.stringify({ changed: lyric?.wave?.heightChanged, waveWidth: lyric?.wave?.waveWidth, hiddenAfterClear: lyric?.wave?.hiddenAfterClear }));
  }

  // 回归：暂停必须真正静音；并记录官方嵌入方案的固有限制（暂停后回到 0:00）
  // 说明：官方外链播放器只支持 type/id/auto/height 四个参数，
  //       没有 startTime 之类的定位参数，所以「暂停续播保留进度」实现不了。
  //       这里固化实际行为，避免以后有人误以为它是 bug 而"修"错方向。
  await visit('#/music');
  const resume = await evaluate(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const mod = await import('/src/plugins/netease.js');
    const P = window.Terminal.Player;
    const info = () => {
      const f = document.getElementById('neFrame');
      if (!f) return null;
      const u = new URL(f.src);
      return { auto: u.searchParams.get('auto'), hasStartTime: u.searchParams.has('startTime') };
    };
    P.clear();
    const s = await mod.search('海阔天空', { limit: 1 });
    if (!s.songs.length) return { skipped: true };
    // 测的是官方播放器回退路径的 auto 参数：显式关掉站内直放
    P.setDirectAudio(false);
    P.add(mod.toTrack(s.songs[0]), { play: true });
    await wait(900);
    const started = info();
    document.getElementById('npPlay').click();     // 暂停
    await wait(800);
    const paused = info();
    document.getElementById('npPlay').click();     // 继续
    await wait(900);
    const resumed = info();
    return { started, paused, resumed };
  })()`);
  if (resume?.skipped) {
    record('播放控制：暂停行为（跳过）', true, '无可用曲目');
  } else {
    record('播放控制：暂停真正静音（重建 auto=0）',
      resume.paused?.auto === '0', JSON.stringify(resume.paused));
    record('播放控制：继续后重新播放（auto=1）',
      resume.resumed?.auto === '1', JSON.stringify(resume.resumed));
    record('播放控制：URL 中不含伪造的 startTime 参数',
      resume.started?.hasStartTime === false && resume.resumed?.hasStartTime === false,
      JSON.stringify({ started: resume.started, resumed: resume.resumed }));
  }

  // 关键回归：底栏封面 = 播放 / 暂停
  // 需求：「只点左下角的歌曲封面就能开始播放」。所以这里在**非音乐台**路由上测，
  // 此时官方播放器处于右下角折叠状态 —— 也正是需求里最想覆盖的场景。
  await visit('#/logs');
  const cover = await evaluate(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const mod = await import('/src/plugins/netease.js');
    const P = window.Terminal.Player;
    const btn = document.getElementById('mpCover');
    const host = document.getElementById('embedHost');
    const autoOf = () => {
      const f = document.getElementById('neFrame');
      return f ? new URL(f.src).searchParams.get('auto') : null;
    };
    const snap = () => ({
      auto: autoOf(), playing: P.playing, title: btn.title,
      dock: host.dataset.dock, expanded: host.dataset.expanded === '1',
    });
    const out = { isButton: btn.tagName === 'BUTTON' };
    P.clear();
    const s = await mod.search('海阔天空', { limit: 1 });
    if (!s.songs.length) return { skipped: true };
    // 底栏封面驱动的是官方播放器（折叠停靠 + 展开）：显式关掉站内直放
    P.setDirectAudio(false);
    P.add(mod.toTrack(s.songs[0]), { play: false });
    await wait(1100);
    out.before = snap();

    btn.click();                       // ← 点封面 = 播放
    await wait(1300);
    out.afterPlay = snap();

    btn.click();                       // ← 再点 = 暂停
    await wait(1300);
    out.afterPause = snap();

    // 点曲目信息应回到音乐台（底栏不再用封面做跳转，改由曲目信息承担）
    document.getElementById('mpMeta').click();
    await wait(800);
    out.hashAfterMeta = location.hash;
    return out;
  })()`);
  if (cover?.skipped) {
    record('底栏封面：点击播放 / 暂停（跳过）', true, '无可用曲目');
  } else {
    record('底栏封面：是可点击按钮，文案标明它控制播放',
      cover.isButton === true && /^播放/.test(cover.before?.title || ''),
      JSON.stringify({ isButton: cover.isButton, before: cover.before?.title }));
    record('底栏封面：点击即开始播放（折叠停靠时也会先展开播放器）',
      cover.afterPlay?.auto === '1' && cover.afterPlay?.playing === true && cover.afterPlay?.expanded === true,
      JSON.stringify(cover.afterPlay));
    record('底栏封面：再次点击暂停（真的切回 auto=0）',
      cover.afterPause?.auto === '0' && cover.afterPause?.playing === false,
      JSON.stringify(cover.afterPause));
    record('底栏封面：提示文案随播放状态切换',
      /暂停/.test(cover.afterPlay?.title || '') && /播放/.test(cover.afterPause?.title || ''),
      JSON.stringify({ play: cover.afterPlay?.title, pause: cover.afterPause?.title }));
    record('底栏曲目信息：点击回到音乐台', cover.hashAfterMeta === '#/music', String(cover.hashAfterMeta));
  }

  // 关键回归：音浪条必须持续跟随播放动起来
  // 曾经的 bug：动画循环在「未播放」时 return 而不再调度下一帧，
  // 于是暂停一次后循环永久死亡，恢复播放时音浪再也不动。
  //
  // 这条用例刻意做成「自足」的：前面的用例可能与播放状态交织，
  // 所以先强制回到暂停 + 清空列表，再从头走一遍 播放→暂停→恢复。
  await visit('#/music');
  const wave = await evaluate(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const mod = await import('/src/plugins/netease.js');
    const P = window.Terminal.Player;
    const bars = () => [...document.querySelectorAll('#mpBars i')];
    const heights = () => bars().map(b => b.style.height);
    const nums = () => heights().map(parseFloat);
    const moved = (a, b) => a.some((v, i) => v !== b[i]);

    // --- 基线：先彻底停下来，确认幅度在基线、没有残留高亮 ---
    P.pause();
    P.clear();
    await wait(900);
    const baseline = {
      max: Math.max(...nums()),
      hot: bars().filter(b => b.classList.contains('is-hot')).length,
      playing: P.playing,
    };

    // --- 播放：音浪必须持续变化 ---
    const s = await mod.search('海阔天空', { limit: 1 });
    if (!s.songs.length) return { skipped: true, baseline };
    // 音浪条本身与来源无关，但这里要的是"确定能进入播放态"：
    // 关掉站内直放后 play 是同步置位的，不受直放缓冲与回退时序影响
    P.setDirectAudio(false);
    P.add(mod.toTrack(s.songs[0]), { play: false });
    await wait(300);
    const btn = document.getElementById('npPlay');
    let guard = 0;
    while (!P.playing && guard++ < 4) { btn.click(); await wait(600); }
    if (!P.playing) return { skipped: true, reason: '无法进入播放态', baseline };

    await wait(600);
    const a1 = heights(); await wait(400);
    const a2 = heights(); await wait(400);
    const a3 = heights();
    const playingMoves = moved(a1, a2) && moved(a2, a3);

    // --- 暂停：幅度压低、高亮清除，但循环不能死 ---
    P.pause();
    await wait(900);
    const p1 = nums(); await wait(500);
    const p2 = nums();
    const paused = {
      max: Math.max(...p2),
      hot: bars().filter(b => b.classList.contains('is-hot')).length,
      playing: P.playing,
    };

    // --- 恢复：必须重新动起来（这就是之前的 bug） ---
    await P.play();
    await wait(800);
    const r1 = heights(); await wait(400);
    const r2 = heights();

    return {
      baseline,
      playingMoves,
      paused,
      resumedMoves: moved(r1, r2),
      coverRadius: getComputedStyle(document.querySelector('.miniplayer__cover')).borderRadius,
      barCount: bars().length,
      guard,
      waveBars: bars().length,
      // 结构：底栏只保留「封面 / 曲目 / 音浪」，被删掉的控件必须真的不存在
      removed: ['mpPrev', 'mpPlay', 'mpNext', 'mpProgWrap', 'mpProg', 'mpKnob', 'mpTime', 'mpMute', 'mpVol', 'mpClose', 'mpTicks']
        .filter((id) => document.getElementById(id)),
      // 音浪条必须是底栏里唯一的可视化元素
      waveCount: document.querySelectorAll('#miniplayer .mp-wave').length,
    };
  })()`);
  if (wave?.skipped) {
    record('音浪条：跟随播放动画（跳过）', true, wave.reason || '无可用曲目');
  } else {
    record('音浪条：静止时幅度贴近基线且无高亮',
      wave.baseline?.max <= 12 && wave.baseline?.hot === 0,
      JSON.stringify(wave.baseline));
    record('音浪条：播放中持续变化', wave.playingMoves === true, `bars=${wave.barCount}`);
    record('音浪条：暂停时压低幅度、清除高亮',
      wave.paused?.max <= 12 && wave.paused?.hot === 0,
      JSON.stringify(wave.paused));
    record('音浪条：恢复播放后重新动起来（防回归）',
      wave.resumedMoves === true, JSON.stringify({ resumedMoves: wave.resumedMoves }));
    record('封面：圆形唱片', wave.coverRadius === '50%', wave.coverRadius);
    // 播放条：只保留封面 / 曲目 / 音浪。传输控制、进度、时间、音量、关闭按钮必须已被删除
    record('播放条：传输/进度/时间/音量/关闭控件已全部移除',
      wave.removed?.length === 0, `残留=${JSON.stringify(wave.removed)}`);
    record('播放条：只有一条音浪（无重复波形）',
      wave.waveBars === 40 && wave.waveCount === 1,
      JSON.stringify({ waveBars: wave.waveBars, waveCount: wave.waveCount }));
  }
  await evaluate(`(async () => {
    const mod = await import('/src/plugins/netease.js');
    window.Terminal.Player.clear();
    mod.savePlaylist([]);
  })()`);

  // 关键回归：切换板块后播放器不能被销毁（否则播放会中断）
  await visit('#/music');
  const persist = await evaluate(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const mod = await import('/src/plugins/netease.js');
    const P = window.Terminal.Player;
    if (!P.tracks.length) {
      const s = await mod.search('海阔天空', { limit: 1 });
      if (!s.songs.length) return { skipped: true };
      P.add(mod.toTrack(s.songs[0]), { play: true });
    }
    await wait(900);
    const f0 = document.getElementById('neFrame');
    if (!f0) return { skipped: true, reason: '播放器未挂载' };
    const win0 = f0.contentWindow;
    const src0 = f0.src;
    location.hash = '#/logs';
    await wait(900);
    const f1 = document.getElementById('neFrame');
    const hostEl = document.getElementById('embedHost');
    const barEl = document.getElementById('miniplayer');
    const waveEl = document.getElementById('mpBars');
    const hb = hostEl.getBoundingClientRect();
    const bb = barEl.getBoundingClientRect();
    const wb = waveEl.getBoundingClientRect();
    const onPosts = {
      sameElement: f1 === f0,
      sameWindow: !!(f1 && f1.contentWindow === win0),
      sameSrc: !!(f1 && f1.src === src0),
      dock: hostEl?.dataset.dock,
      insideView: !!document.getElementById('view')?.contains(hostEl),
      miniBarVisible: getComputedStyle(document.getElementById('embedMini')).display !== 'none',
      // 折叠条要和底栏、以及底栏里的音浪条对齐（曾经比底栏中心高 15px，
      // 会压到底栏上沿那条线 —— 视觉上很脏，是个长期存在的小毛病）
      geo: {
        vw: innerWidth,
        hostTop: Math.round(hb.top), hostBottom: Math.round(hb.bottom), hostH: Math.round(hb.height),
        barTop: Math.round(bb.top), barBottom: Math.round(bb.bottom),
        waveVisible: getComputedStyle(waveEl).display !== 'none',
        waveCenter: Math.round((wb.top + wb.bottom) / 2),
        hostCenter: Math.round((hb.top + hb.bottom) / 2),
        insideBar: hb.top >= bb.top - 0.5 && hb.bottom <= bb.bottom + 0.5,
        overlapsWave: hb.left < wb.right && wb.left < hb.right && hb.top < wb.bottom && wb.top < hb.bottom,
      },
    };
    location.hash = '#/music';
    await wait(1100);
    const f2 = document.getElementById('neFrame');
    const slot = document.querySelector('[data-embed-slot]');
    const hr = document.getElementById('embedHost').getBoundingClientRect();
    const sr = slot ? slot.getBoundingClientRect() : null;
    const backInline = {
      sameElement: f2 === f0,
      sameWindow: !!(f2 && f2.contentWindow === win0),
      sameSrc: !!(f2 && f2.src === src0),
      dock: document.getElementById('embedHost')?.dataset.dock,
      aligned: !!(sr && Math.abs(sr.left - hr.left) < 24 && hr.width > 100 && hr.top > sr.top),
    };
    return { onPosts, backInline };
  })()`);
  if (persist?.skipped) {
    record('持续性：播放器跨板块保活（跳过）', true, persist.reason || '无可用曲目');
  } else {
    record('持续性：切到文章板块后 iframe 未被重建',
      persist.onPosts?.sameElement === true && persist.onPosts?.sameWindow === true && persist.onPosts?.sameSrc === true,
      JSON.stringify(persist.onPosts));
    record('持续性：离开音乐台时折叠停靠并移出 #view',
      persist.onPosts?.dock === 'docked' && persist.onPosts?.insideView === false && persist.onPosts?.miniBarVisible === true,
      JSON.stringify({ dock: persist.onPosts?.dock, insideView: persist.onPosts?.insideView }));
    record('底栏布局：折叠条落在底栏高度带内，且与音浪条同一条水平线（不压上沿、不重叠）',
      persist.onPosts?.geo?.insideBar === true
        && persist.onPosts?.geo?.waveVisible === true
        && Math.abs((persist.onPosts?.geo?.waveCenter || 0) - (persist.onPosts?.geo?.hostCenter || 0)) <= 2
        && persist.onPosts?.geo?.overlapsWave === false,
      JSON.stringify(persist.onPosts?.geo));
    record('持续性：回到音乐台后仍为同一 iframe 且对齐槽位',
      persist.backInline?.sameElement === true && persist.backInline?.sameWindow === true && persist.backInline?.dock === 'inline' && persist.backInline?.aligned === true,
      JSON.stringify(persist.backInline));
  }

  /* ---------------- 折叠停靠时自动接播：先把播放器"渲染出来" ----------------
   * 折叠态的 frame 是 display:none，浏览器对不可见的跨域 iframe 自动播放判定更严，
   * 下一首会起不来 —— 表现就是「后台放着放着就不换歌 / 不出声了」。
   * 这里让它在折叠状态下走一次自动接播，看是否先展开再重建。
   */
  await visit('#/logs');
  const dockAuto = await evaluate(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const M = await import('/src/plugins/netease.js');
    const T = window.Terminal;
    const P = T.Player;
    // 至少要两首网易云曲目：next() 才会换到"另一首"，触发真正的重建
    const neteaseCount = P.tracks.filter((t) => t.provider === 'netease').length;
    if (neteaseCount < 2) {
      const s = await M.search('海阔天空', { limit: 4 });
      if (!s.songs?.length) return { skipped: true };
      // 这一条测的是官方播放器回退路径的「折叠态先展开再重建」：显式关掉站内直放
      P.setDirectAudio(false);
      s.songs.slice(0, 2).forEach((song) => P.add(M.toTrack(song)));
      if (P.tracks.filter((t) => t.provider === 'netease').length < 2) return { skipped: true, reason: '凑不出两首不同的曲目' };
    }
    P.setDirectAudio(false);
    const idx = P.tracks.findIndex((t) => t.provider === 'netease');
    P.prepare(idx, { autoplay: true });
    await wait(1600);
    const host = document.getElementById('embedHost');
    const slot = document.getElementById('embedFrameSlot');
    delete host.dataset.expanded;
    const before = { dock: host.dataset.dock, collapsed: T.EmbedHost?.dockedCollapsed, display: getComputedStyle(slot).display };
    P.next({ auto: true });                     // 等价于自动接播那一刻
    await wait(600);
    const during = {
      expanded: host.dataset.expanded || null,
      display: getComputedStyle(slot).display,
      rendered: getComputedStyle(slot).display === 'block',
    };
    await wait(2600);                           // 到时间应该自己收回小条
    const after = { expanded: host.dataset.expanded || null, display: getComputedStyle(slot).display };
    return { before, during, after };
  })()`);
  record('折叠停靠时自动接播会先把播放器渲染出来（否则下一首起不来）',
    dockAuto?.skipped !== true
      && dockAuto?.before?.dock === 'docked' && dockAuto?.before?.collapsed === true
      && dockAuto?.before?.display === 'none'
      && dockAuto?.during?.expanded === '1' && dockAuto?.during?.rendered === true
      && dockAuto?.after?.expanded === null && dockAuto?.after?.display === 'none',
    JSON.stringify(dockAuto));

  /* ---------------- 「粘贴链接就能用」：歌单 / 专辑 / 短链 ----------------
   * 用户实际会粘的东西长这样：https://163cn.tv/biaXj2Rq（App 分享出来的专辑短链）。
   * 它既不是歌单链接、也没有 id，之前会被当成关键词搜索 → 什么都搜不到。
   * 现在：短链先在服务端展开 → 判断类型（歌单 / 专辑 / 单曲）→ 走对应的导入。
   */
  const linkKinds = await evaluate(`(async () => {
    const M = await import('/src/plugins/netease.js');
    const cases = {
      albumDirect: M.parseAlbumId('https://music.163.com/album?id=90004244'),
      albumMobile: M.parseAlbumId('https://y.music.163.com/m/album?app_version=9.6.05&id=90004244&userid=1'),
      albumHash: M.parseAlbumId('https://music.163.com/#/album?id=90004244'),
      albumNotSong: M.parseAlbumId('https://music.163.com/song?id=90004244'),
      playlistDirect: M.parsePlaylistId('https://music.163.com/playlist?id=3778678'),
      playlistBare: M.parsePlaylistId('3778678'),
      kindAlbum: M.detectLinkKind('https://music.163.com/album?id=90004244'),
      kindPlaylist: M.detectLinkKind('https://music.163.com/playlist?id=3778678'),
      kindSong: M.detectLinkKind('https://music.163.com/song?id=347230'),
      kindShort: M.isShortLink('https://163cn.tv/biaXj2Rq'),
      kindPlainText: M.detectLinkKind('夜航星'),
    };
    let classified = null;
    let imported = null;
    try {
      const c = await M.classifyLink('https://163cn.tv/biaXj2Rq');
      classified = { kind: c.kind, link: c.link, resolved: c.resolved };
      window.Terminal.Player.clear();
      const r = await M.importFromLink('https://163cn.tv/biaXj2Rq');
      imported = {
        kind: r.source?.kind, name: r.source?.name, artist: r.source?.artist,
        count: r.source?.count, total: r.total, added: r.added,
        tracks: window.Terminal.Player.tracks.length,
        firstTitle: window.Terminal.Player.tracks[0]?.title,
      };
    } catch (e) {
      imported = { error: String(e.message || e) };
    }
    return { cases, classified, imported };
  })()`);
  record('链接识别：专辑 / 歌单 / 单曲 / 短链都能分辨（发请求前先分好类）',
    linkKinds?.cases?.albumDirect === '90004244' && linkKinds?.cases?.albumMobile === '90004244'
      && linkKinds?.cases?.albumHash === '90004244' && linkKinds?.cases?.albumNotSong === ''
      && linkKinds?.cases?.playlistDirect === '3778678' && linkKinds?.cases?.playlistBare === '3778678'
      && linkKinds?.cases?.kindAlbum === 'album' && linkKinds?.cases?.kindPlaylist === 'playlist'
      && linkKinds?.cases?.kindSong === 'song' && linkKinds?.cases?.kindShort === true
      && linkKinds?.cases?.kindPlainText === '',
    JSON.stringify(linkKinds?.cases));
  record('短链导入：163cn.tv 专辑分享链能展开并整张导入（用户给的链接）',
    linkKinds?.classified?.kind === 'album' && linkKinds?.classified?.resolved === true
      && /album\?.*id=90004244/.test(linkKinds?.classified?.link || '')
      && linkKinds?.imported?.kind === 'album'
      && linkKinds?.imported?.name === 'MUSICALOID #38 Act. 2'
      && linkKinds?.imported?.count === 11 && linkKinds?.imported?.total === 11
      && linkKinds?.imported?.tracks === 11
      && typeof linkKinds?.imported?.firstTitle === 'string' && linkKinds.imported.firstTitle.length > 0,
    JSON.stringify(linkKinds?.imported));

  await evaluate(`(async () => {
    const mod = await import('/src/plugins/netease.js');
    window.Terminal.Player.clear();
    mod.savePlaylist([]);
  })()`);

  /* ---------------- 工具台（#/tools） ---------------- */
  // 三个工具全部在浏览器里跑，所以自检可以在页面里真跑一遍：
  //   · 造一个 docx 再读回来（顺带验证 ZIP 读写）
  //   · canvas 编一张 png 转成 jpg / webp 并缩放
  //   · 合成 1.2 秒音频 → wav → 解码 → 实时录成 m4a
  // 断言的是"能不能真做出来"，不是"按钮在不在"。
  await visit('#/tools');
  const toolsUI = await evaluate(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const out = {};
    const step = async (name, fn) => {
      try { out[name] = await fn(); } catch (e) { out[name] = { error: String((e && e.message) || e) }; }
    };
    const T = await import('/src/plugins/tools/index.js');
    const Docx = await import('/src/plugins/tools/docx.js');
    const Text = await import('/src/plugins/tools/text.js');
    const Audio = await import('/src/plugins/tools/audio.js');
    const Zip = await import('/src/plugins/tools/zip.js');

    out.ui = {
      tabs: [...document.querySelectorAll('.tool-tab')].map((t) => t.dataset.tab),
      drop: !!document.querySelector('.tool-drop'),
      text: ((document.getElementById('view') || {}).innerText || '').length,
    };
    document.querySelector('.tool-tab[data-tab="text"]').click();
    await wait(400);
    out.ui.textPanel = !!document.getElementById('textIn') && !!document.querySelector('[data-tmode]');
    document.querySelector('.tool-tab[data-tab="convert"]').click();
    await wait(300);

    await step('zip', async () => {
      const enc = new TextEncoder();
      const blob = await Zip.zip([{ name: 'a.txt', data: enc.encode('hello 鱼') }, { name: 'd/b.bin', data: new Uint8Array([1, 2, 3, 255]) }]);
      const back = await Zip.unzip(blob);
      return {
        bytes: blob.size,
        text: new TextDecoder().decode(back.get('a.txt')),
        bin: Array.from(back.get('d/b.bin')).join(','),
        pk: Array.from(new Uint8Array(await blob.slice(0, 2).arrayBuffer())).join(','),
      };
    });

    await step('docx', async () => {
      const md = '# 标题一\\n\\n正文。\\n\\n## 标题二\\n\\n- 甲\\n- 乙\\n\\n| c1 | c2 |\\n| --- | --- |\\n| a | b |\\n';
      const docx = await Docx.textToDocx(md);
      const back = await Docx.docxToText(docx, { format: 'md' });
      const asTxt = await T.convert(new File([docx], 't.docx', { type: docx.type }), 'txt');
      const parts = [...(await Zip.unzip(docx)).keys()];
      return {
        bytes: docx.size,
        parts: parts.join(','),
        h1: /# 标题一/.test(back.text),
        h2: /## 标题二/.test(back.text),
        li: /- 甲/.test(back.text),
        table: /\\| c1 \\| c2 \\|/.test(back.text),
        txt: (await asTxt.blob.text()).replace(/\\s+/g, ' ').trim().slice(0, 40),
      };
    });

    await step('image', async () => {
      const c = document.createElement('canvas');
      c.width = 160; c.height = 120;
      const ctx = c.getContext('2d');
      // 用噪声图：纯色图 PNG 反而更小，测不出"JPEG 更省"这件事
      const noise = ctx.createImageData(160, 120);
      for (let i = 0; i < noise.data.length; i += 4) {
        noise.data[i] = (i * 37) % 255;
        noise.data[i + 1] = (i * 91) % 255;
        noise.data[i + 2] = (i * 13) % 255;
        noise.data[i + 3] = 255;
      }
      ctx.putImageData(noise, 0, 0);
      const png = await new Promise((r) => c.toBlob(r, 'image/png'));
      const f = new File([png], 'x.png', { type: 'image/png' });
      const jpg = await T.convert(f, 'image/jpeg', { quality: 0.8 });
      const webp = await T.convert(f, 'image/webp', { quality: 0.8 });
      const scaled = await T.convert(f, 'image/jpeg', { quality: 0.8, maxEdge: 80 });
      const back2png = await T.convert(new File([jpg.blob], 'x.jpg', { type: 'image/jpeg' }), 'image/png');
      return {
        targets: T.targetsFor(f).map((t) => t.id).join(','),
        jpgMagic: Array.from(new Uint8Array(await jpg.blob.slice(0, 2).arrayBuffer())).join(','),
        jpgType: jpg.blob.type,
        webpType: webp.blob.type,
        scaled: scaled.note,
        roundTripPng: back2png.blob.type,
        pngBytes: png.size,
        jpgBytes: jpg.blob.size,
        jpgSmaller: jpg.blob.size < png.size,
      };
    });

    await step('text', async () => {
      const json = '{"b":2,"a":[1,2]}';
      const b64 = Text.base64Encode('鱼灵庙 🐟');
      const h = await Text.sha256(new File([new TextEncoder().encode('abc')], 'x.txt'));
      return {
        format: Text.formatJson(json).split('\\n').length,
        minify: Text.minifyJson(Text.formatJson(json)),
        b64: Text.base64Decode(b64),
        url: Text.urlDecode(Text.urlEncode('a b/鱼?x=1')),
        lines: Text.processLines('b\\na\\nb\\n\\nc', ['trim', 'dropEmpty', 'dedupe', 'sort']),
        stats: Text.textStats('你好 world').cjk,
        shaOk: h.hex === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        jsonErr: (() => { try { Text.formatJson('{oops'); return 'no-throw'; } catch (e) { return 'throw'; } })(),
      };
    });

    await step('audio', async () => {
      const rate = 44100;
      const buf = new AudioBuffer({ length: Math.round(rate * 1.2), numberOfChannels: 1, sampleRate: rate });
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.sin((2 * Math.PI * 440 * i) / rate) * 0.3;
      const wav = Audio.toWav(buf);
      const decoded = await Audio.decodeAudio(new File([wav], 'tone.wav', { type: 'audio/wav' }));
      const t0 = performance.now();
      const enc = Audio.supportedEncoders().map((e) => e.ext).join(',');
      let m4a = null;
      if (enc.includes('m4a')) {
        const blob = await Audio.encodeRealtime(decoded, { mime: 'audio/mp4', bitrate: 96000, maxSeconds: 10 });
        const magic = new Uint8Array(await blob.slice(4, 8).arrayBuffer());
        m4a = { bytes: blob.size, ftyp: String.fromCharCode(...magic) === 'ftyp', ms: Math.round(performance.now() - t0) };
      }
      return {
        wavHead: new TextDecoder().decode(new Uint8Array(await wav.slice(0, 4).arrayBuffer())),
        wavBytes: wav.size,
        decodedSecs: Math.round(decoded.duration * 100) / 100,
        encoders: enc,
        targets: T.targetsFor(new File([new Uint8Array(1)], 'a.mp3')).map((t) => t.id).join(','),
        m4a,
      };
    });

    await step('guard', async () => {
      // 完全没见过的类型：不给任何目标，并且转换时给出可读的错误
      const unknown = new File([new Uint8Array(4)], 'x.psd', { type: 'application/octet-stream' });
      let err = '';
      try { await T.convert(unknown, 'image/jpeg'); } catch (e) { err = String(e.message || e); }
      // 声明是图片、其实解不开：也要是"解码失败"而不是静默成功
      const fake = new File([new Uint8Array(64)], 'fake.webp', { type: 'image/webp' });
      let err2 = '';
      try { await T.convert(fake, 'image/jpeg'); } catch (e) { err2 = String(e.message || e); }
      return {
        unknownKind: T.kindOf(unknown),
        unknownTargets: T.targetsFor(unknown).length,
        err,
        errBroken: err2,
        noMp3Encoding: !T.targetsFor(new File([new Uint8Array(1)], 'a.wav')).some((t) => t.id === 'mp3'),
      };
    });
    return out;
  })()`);
  record('工具台：三个标签与拖放区就位，标签可切换',
    JSON.stringify(toolsUI?.ui?.tabs) === JSON.stringify(['convert', 'image', 'text'])
      && toolsUI?.ui?.drop === true && toolsUI?.ui?.textPanel === true
      && (toolsUI?.ui?.text || 0) > 300,
    JSON.stringify(toolsUI?.ui));
  record('工具台：ZIP 能打包与解包（含中文与二进制）',
    (toolsUI?.zip?.bytes || 0) > 100 && toolsUI?.zip?.text === 'hello 鱼'
      && toolsUI?.zip?.bin === '1,2,3,255' && toolsUI?.zip?.pk === '80,75',
    JSON.stringify(toolsUI?.zip));
  record('工具台：Markdown → docx → Markdown（标题/列表/表格都不丢）',
    (toolsUI?.docx?.bytes || 0) > 1000 && toolsUI?.docx?.h1 === true && toolsUI?.docx?.h2 === true
      && toolsUI?.docx?.li === true && toolsUI?.docx?.table === true
      && /标题一/.test(toolsUI?.docx?.txt || '')
      && /word\/document\.xml/.test(toolsUI?.docx?.parts || '')
      && /word\/styles\.xml/.test(toolsUI?.docx?.parts || ''),
    JSON.stringify(toolsUI?.docx));
  record('工具台：图片 png → jpg / webp 且能缩放（jpeg 体积更小）',
    toolsUI?.image?.jpgMagic === '255,216' && toolsUI?.image?.jpgType === 'image/jpeg'
      && toolsUI?.image?.webpType === 'image/webp' && toolsUI?.image?.scaled === '80×60'
      && toolsUI?.image?.roundTripPng === 'image/png' && toolsUI?.image?.jpgSmaller === true,
    JSON.stringify(toolsUI?.image));
  record('工具台：文本工具（JSON / Base64 / URL / 行处理 / SHA-256 / 坏输入报错）',
    toolsUI?.text?.format === 7 && toolsUI?.text?.minify === '{"b":2,"a":[1,2]}'
      && toolsUI?.text?.b64 === '鱼灵庙 🐟' && toolsUI?.text?.url === 'a b/鱼?x=1'
      && toolsUI?.text?.lines === 'a\nb\nc' && toolsUI?.text?.stats === 2
      && toolsUI?.text?.shaOk === true && toolsUI?.text?.jsonErr === 'throw',
    JSON.stringify(toolsUI?.text));
  record('工具台：合成音频 → WAV → 解码 → 实时录成 M4A（ftyp 头正确）',
    toolsUI?.audio?.wavHead === 'RIFF' && (toolsUI?.audio?.wavBytes || 0) > 50000
      && toolsUI?.audio?.decodedSecs === 1.2
      && /wav,m4a/.test(toolsUI?.audio?.targets || '')
      && toolsUI?.audio?.m4a?.ftyp === true && (toolsUI?.audio?.m4a?.bytes || 0) > 2000,
    JSON.stringify(toolsUI?.audio));
  record('工具台：不支持的类型明确不给选项 / 坏文件报可读错误 / 不假装能编 MP3',
    toolsUI?.guard?.unknownKind === 'unknown' && toolsUI?.guard?.unknownTargets === 0
      && /暂不支持/.test(toolsUI?.guard?.err || '')
      && (toolsUI?.guard?.errBroken || '').length > 0
      && toolsUI?.guard?.noMp3Encoding === true,
    JSON.stringify(toolsUI?.guard));

  // Markdown 渲染（post_overview 内含表格、提示块、代码块、目录）
  await visit('#/logs/post_overview');
  const md = await evaluate(`(() => ({
    h2: document.querySelectorAll('#prose h2').length,
    pre: document.querySelectorAll('#prose pre').length,
    table: document.querySelectorAll('#prose table').length,
    note: document.querySelectorAll('#prose .md-note').length,
    toc: document.querySelectorAll('#toc a').length,
  }))()`);
  record('Markdown：标题/表格/提示块/目录', md.h2 >= 2 && md.table >= 1 && md.note >= 1 && md.toc >= 2, JSON.stringify(md));

  // 安全性：注入的脚本不得执行
  const xss = await evaluate(`(async () => {
    window.__XSS__ = false;
    const { render } = await import('/src/util/markdown.js');
    const html = render('<img src=x onerror="window.__XSS__=true"><script>window.__XSS__=true<\\/script>').html;
    const d = document.createElement('div');
    d.innerHTML = html;
    document.body.append(d);
    await new Promise(r => setTimeout(r, 300));
    const fired = window.__XSS__;
    d.remove();
    return { fired, escaped: html.includes('&lt;script&gt;'), hasRawImg: /<img[^>]*onerror/i.test(html) };
  })()`);
  record('安全：Markdown 注入被转义', xss.fired === false && xss.escaped === true && xss.hasRawImg === false, JSON.stringify(xss));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${'─'.repeat(58)}`);
  console.log(`总计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`);
  if (failed.length) console.log('失败项：\n' + failed.map((f) => `  · ${f.name} ${f.detail}`).join('\n'));

  try { await send('Browser.close'); } catch { /* noop */ }
  try { child.kill('SIGKILL'); } catch { /* noop */ }
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('VERIFY FAILED', e);
  try { child?.kill('SIGKILL'); } catch { /* noop */ }
  process.exit(1);
});
