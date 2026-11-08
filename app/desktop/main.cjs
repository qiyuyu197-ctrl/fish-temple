'use strict';

/**
 * main.cjs — 鱼の灵庙 · 桌面版（单进程 · 无本地端口）
 * ------------------------------------------------------------------
 * 上一个版本是「起一个 127.0.0.1 的网站，再用窗口套上去」。这一版把那层拆了：
 *
 *   · 没有 HTTP 服务器，没有随机端口，没有子进程
 *   · 页面走自定义协议 fish://app/…，由主进程自己从磁盘读文件
 *   · /api/* 也不走网络：同一个进程里直接调用 server.mjs 的 handleApiRequest()
 *     （Netlify Functions 早就在用这个函数，输入输出都是标准的 Request/Response）
 *
 * 所以它现在是**一个进程、一个窗口、一堆本地文件**，断网、全离线。
 * 数据写在 %APPDATA%\FishTemple\data，不碰安装目录。
 *
 * 还是要说清楚：界面依旧是 HTML/CSS/JS 渲染的（VS Code、Spotify、Discord 都这样）。
 * 真要用 WinUI/WPF 重写控件，那是另一个项目——这个仓库 3 万行 JS 全在界面上。
 */

const { app, BrowserWindow, Menu, dialog, shell, session, protocol, clipboard, ipcMain } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { Readable } = require('node:stream');
const { pathToFileURL } = require('node:url');

const APP_NAME = '鱼の灵庙';
const WINDOW_TITLE = '鱼の灵庙';
const SCHEME = 'fish';
const ORIGIN = `${SCHEME}://app`;

const IS_DEV = !app.isPackaged;
/** 打包后在 resources/site；开发时直接用仓库根目录 */
const SITE_DIR = path.resolve(
  IS_DEV ? path.join(__dirname, '..', '..') : path.join(process.resourcesPath, 'site')
);

const USER_DIR = app.getPath('userData');
const DATA_DIR = path.join(USER_DIR, 'data');
const STATE_FILE = path.join(USER_DIR, 'window-state.json');
/** 首次启动自动建桌面快捷方式的标记（建过就不再打扰；删了可从菜单重建） */
const SHORTCUT_FLAG = path.join(USER_DIR, 'desktop-shortcut-v1');
const SHORTCUT_NAME = 'FISH 鱼の灵庙.lnk';
/** 局域网联机：让手机 / 另一台电脑用浏览器加入同一个房间 */
const LAN_PORT = 47822;
let lanServer = null;
let lanUrl = '';

// ⚠️ 必须在 import server.mjs 之前：它在模块顶层就会读这些变量
process.env.FT_DATA_DIR = DATA_DIR;
// 桌面版的 origin 是 fish://app，Auth0 不认这种回调地址 —— 走本站自己的账号系统
process.env.FT_LOCAL_AUTH = '1';

let mainWindow = null;
let apiHandler = null;      // server.mjs 里的 handleApiRequest
let quitting = false;

/* ---------------- 静态文件的 MIME ---------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
};

const mimeOf = (file) => MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';

/* ---------------- 窗口状态 ---------------- */

function readState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (typeof raw?.width === 'number' && typeof raw?.height === 'number') return raw;
  } catch { /* 第一次启动 / 文件被删 */ }
  return { width: 1280, height: 840 };
}

function writeState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const b = mainWindow.getBounds();
    fs.writeFileSync(STATE_FILE, JSON.stringify({ ...b, maximized: mainWindow.isMaximized() }), 'utf8');
  } catch { /* 写不进去就算了 */ }
}

/* ---------------- 数据播种 ---------------- */

/** 内容版本标记：每次换 App 版本，都该把内置的文章 / 公告同步过来 */
const CONTENT_STAMP = path.join(USER_DIR, 'site-content-version');
/** 这两个集合里可能混着用户自己写的内容，同步时只保留 local:true 的条目 */
const MERGE_COLLECTIONS = new Set(['posts.json', 'news.json']);

/**
 * 把内置的 data/*.json 同步到用户数据目录。
 *
 * ⚠️ 以前是「目标已存在就跳过」，结果升级 App 之后文章永远停在第一次安装的那版
 * （2.5.3 里已换成新文章，桌面版打开却还是「八个板块」「770 张照片」）。
 * 现在的规则：
 *   · 首次启动 / 版本没变 → 只补缺失的文件；
 *   · 版本变了 → 全量同步：文章与公告按 id 合并（保留 local:true 的用户内容），
 *     其余清单（相册 / 番剧 / 画廊）直接覆盖。
 */
function seedData() {
  const src = path.join(SITE_DIR, 'data');
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const stamp = String(app.getVersion());
  const fresh = (() => {
    try { return fs.readFileSync(CONTENT_STAMP, 'utf8').trim() !== stamp; } catch { return true; }
  })();

  for (const name of fs.readdirSync(src)) {
    if (!name.endsWith('.json')) continue;
    const from = path.join(src, name);
    const dst = path.join(DATA_DIR, name);
    if (!fs.existsSync(dst)) {
      try { fs.copyFileSync(from, dst); } catch { /* 单个失败不阻塞 */ }
      continue;
    }
    if (!fresh) continue;

    if (!MERGE_COLLECTIONS.has(name)) {
      try { fs.copyFileSync(from, dst); } catch { /* 同上 */ }
      continue;
    }

    // 文章 / 公告：新种子打底，用户自己写的那几条盖回去（按 id 去重）
    try {
      const seed = JSON.parse(fs.readFileSync(from, 'utf8'));
      const mine = JSON.parse(fs.readFileSync(dst, 'utf8'));
      const local = (Array.isArray(mine) ? mine : []).filter((x) => x && x.local);
      const map = new Map();
      for (const item of [...local, ...(Array.isArray(seed) ? seed : [])]) {
        if (item && item.id) map.set(item.id, item);
      }
      fs.writeFileSync(dst, JSON.stringify([...map.values()], null, 2) + '\n', 'utf8');
    } catch { /* 文件坏了就别动它，交给页面兜底 */ }
  }

  try { fs.writeFileSync(CONTENT_STAMP, stamp, 'utf8'); } catch { /* 标记写不进去下次再同步 */ }
}

/* ---------------- fish:// 协议 ---------------- */

function notFound() {
  return new Response('Not Found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/** Range 请求（拖动音频进度会用到）：返回 206 + 局部内容 */
async function rangeResponse(file, size, type, rangeHeader) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!m) return notFound();
  let start = m[1] === '' ? null : Number(m[1]);
  let end = m[2] === '' ? null : Number(m[2]);
  if (start === null) {
    // bytes=-N：最后 N 字节
    const n = end ?? 0;
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    end = end === null ? size - 1 : Math.min(end, size - 1);
  }
  if (start > end || start >= size) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  const fh = await fsp.open(file, 'r');
  try {
    const len = end - start + 1;
    const buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, start);
    return new Response(buf, {
      status: 206,
      headers: {
        'Content-Type': type,
        'Content-Length': String(len),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
      },
    });
  } finally {
    await fh.close();
  }
}

async function serveStatic(pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';

  // 防目录穿越：拼完必须还在 SITE_DIR 里面
  const abs = path.resolve(path.join(SITE_DIR, rel));
  if (abs !== SITE_DIR && !abs.startsWith(SITE_DIR + path.sep)) {
    return new Response('Forbidden', { status: 403 });
  }

  let target = abs;
  try {
    let st = await fsp.stat(target);
    if (st.isDirectory()) {
      target = path.join(target, 'index.html');
      st = await fsp.stat(target);
    }
    const type = mimeOf(target);
    const headers = {
      'Content-Type': type,
      'Cache-Control': rel.startsWith('/assets/') ? 'public, max-age=3600' : 'no-cache',
    };
    return new Response(await fsp.readFile(target), {
      status: 200,
      headers: { ...headers, 'Content-Length': String(st.size) },
    });
  } catch {
    // 页面级的 404 给离线页，别给浏览器默认页
    if (!path.extname(rel)) {
      try {
        const html = await fsp.readFile(path.join(SITE_DIR, 'offline.html'));
        return new Response(html, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      } catch { /* 离线页也没了 */ }
    }
    return notFound();
  }
}

/**
 * fish:// 是自定义协议，Node 的 URL 会把它算成「不透明 origin」（origin === 'null'），
 * 而 server.mjs 里 `new URL(pathname, raw.origin)` 需要一个正常的 base。
 * 所以喂给 handleApiRequest 之前先换成一个假的 http URL —— 它只读 pathname/search，
 * 绝对地址一律由它自己拼，不会把 local.invalid 漏给前端。
 */
function toApiRequest(request) {
  const src = new URL(request.url);
  const init = {
    method: request.method,
    headers: request.headers,
  };
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  if (hasBody) {
    init.body = request.body;
    init.duplex = 'half';
  }
  return new Request(`http://local.invalid${src.pathname}${src.search}`, init);
}

async function handleFishProtocol(request) {
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return notFound();
  }

  // /api/* 直接进同一进程里的服务端实现，不经过网络
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    if (!apiHandler) return new Response('API 未就绪', { status: 503 });
    try {
      return await apiHandler(toApiRequest(request), { serverless: false });
    } catch (err) {
      console.error('[api]', err);
      return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }
  }

  // 拖进度条时 <audio> 会带 Range
  const range = request.headers.get('range');
  if (range) {
    const rawPath = decodeURIComponent(url.pathname);
    const abs = path.resolve(path.join(SITE_DIR, rawPath));
    if (abs.startsWith(SITE_DIR + path.sep)) {
      try {
        const st = await fsp.stat(abs);
        if (st.isFile()) return await rangeResponse(abs, st.size, mimeOf(abs), range);
      } catch { /* 落到普通静态 */ }
    }
  }

  return serveStatic(url.pathname);
}

/* ---------------- 局域网联机（手机 / 另一台电脑用浏览器加入） ---------------- */

/** 找一个可给局域网用的 IPv4（优先 192.168 / 10 / 172.16-31） */
function lanIPv4() {
  const found = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) {
      if (n.internal) continue;
      const fam = typeof n.family === 'string' ? n.family : (n.family === 4 ? 'IPv4' : '');
      if (fam !== 'IPv4') continue;
      if (/^169\.254\./.test(n.address)) continue;
      found.push(n.address);
    }
  }
  return found.find((a) => /^192\.168\./.test(a) || /^10\./.test(a) || /^172\.(1[6-9]|2\d|3[01])\./.test(a))
    || found[0] || '';
}

async function pipeWebResponse(response, res) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    try { res.setHeader(key, value); } catch { /* 个别禁止的头跳过 */ }
  });
  if (!response.body) { res.end(); return; }
  Readable.fromWeb(response.body).pipe(res);
}

/** 把 LAN 的 HTTP 请求映射到同一套静态文件 / apiHandler */
async function handleLanRequest(req, res) {
  try {
    const url = new URL(req.url || '/', 'http://lan.invalid');

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      if (!apiHandler) { res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('API 未就绪'); return; }
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 32 * 1024 * 1024) { res.writeHead(413); res.end('请求体太大'); return; }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      const headers = new Headers();
      for (const key of ['content-type', 'authorization', 'cookie', 'range', 'user-agent', 'accept']) {
        const value = req.headers[key];
        if (value) headers.set(key, Array.isArray(value) ? value.join(',') : value);
      }
      const init = { method: req.method, headers };
      if (req.method !== 'GET' && req.method !== 'HEAD' && body.length) {
        init.body = body;
        init.duplex = 'half';
      }
      const response = await apiHandler(
        new Request(`http://lan.invalid${url.pathname}${url.search}`, init),
        { serverless: false },
      );
      await pipeWebResponse(response, res);
      return;
    }

    const range = req.headers.range;
    if (range) {
      const abs = path.resolve(path.join(SITE_DIR, decodeURIComponent(url.pathname)));
      if (abs.startsWith(SITE_DIR + path.sep)) {
        try {
          const st = await fsp.stat(abs);
          if (st.isFile()) {
            await pipeWebResponse(await rangeResponse(abs, st.size, mimeOf(abs), range), res);
            return;
          }
        } catch { /* 落到普通静态 */ }
      }
    }
    await pipeWebResponse(await serveStatic(url.pathname), res);
  } catch (err) {
    console.error('[lan]', err);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: String(err?.message || err) }));
  }
}

async function startLanServer() {
  if (lanServer && lanUrl) return { url: lanUrl, port: lanServer.address().port };
  const ip = lanIPv4();
  if (!ip) throw new Error('没有找到局域网 IPv4 地址：先连上 Wi-Fi 或网线');

  let lastErr = null;
  for (let port = LAN_PORT; port < LAN_PORT + 12; port += 1) {
    try {
      const server = await new Promise((resolve, reject) => {
        const s = http.createServer((req, res) => { void handleLanRequest(req, res); });
        s.once('error', reject);
        s.listen(port, '0.0.0.0', () => resolve(s));
      });
      lanServer = server;
      lanUrl = `http://${ip}:${port}/`;
      return { url: lanUrl, port };
    } catch (err) {
      lastErr = err;
      if (err.code !== 'EADDRINUSE') throw err;
    }
  }
  throw lastErr || new Error('局域网端口都被占用了');
}

function stopLanServer() {
  if (!lanServer) { lanUrl = ''; return; }
  const s = lanServer;
  lanServer = null;
  lanUrl = '';
  try { s.closeAllConnections?.(); } catch { /* 老 Node 没有 */ }
  try { s.close(); } catch { /* 已经关了 */ }
}

/**
 * 菜单入口：开启后手机 / 另一台电脑在同一个 Wi-Fi 下打开这个地址，
 * 注册/登录一个本站账号，就能用房间号加入同一间房（房间数据在这台电脑上）。
 */
async function showLanDialog() {
  let info;
  try {
    info = await startLanServer();
  } catch (err) {
    dialog.showErrorBox('局域网联机', String(err?.message || err));
    return;
  }
  const r = await showBox({
    type: 'info',
    title: '局域网联机',
    message: `手机 / 另一台电脑在同一个 Wi-Fi 下打开：\n${info.url}`,
    detail: [
      '1. 手机浏览器打开上面的地址',
      '2. 在页面里注册/登录一个本站账号（不要和电脑用同一个账号，否则算同一个玩家）',
      '3. 回到扫雷 → 联机，输入电脑上房间号加入',
      '',
      '房间数据在这台电脑上；关掉联机服务或退出 App 后，手机就打不开了。',
      '如果手机打不开：检查两台设备是否在同一 Wi-Fi，并允许 Windows 防火墙的「专用网络」。',
    ].join('\n'),
    buttons: ['复制地址', '停止联机', '好'],
    defaultId: 0,
    cancelId: 2,
  });
  if (r.response === 0) clipboard.writeText(info.url);
  else if (r.response === 1) stopLanServer();
}

/* ---------------- 窗口 ---------------- */

function createWindow() {
  const state = readState();

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 980,
    minHeight: 620,
    show: false,
    backgroundColor: '#EFEDE6',
    title: WINDOW_TITLE,
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    // 无边框窗口：Windows 原生标题栏会白占 ~30px，深色标题栏压在纸色页面顶上也很割裂。
    // 现在窗口的最上面就是站点自己的顶栏，最小化 / 最大化 / 关闭由页面按钮画（见
    // injectWindowChrome），点击经 preload.cjs → ipcMain 回到主进程执行。
    // thickFrame 默认 true：无边框窗口依旧可以用系统边缘拖拽缩放。
    frame: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (state.maximized) mainWindow.maximize();
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // 站外链接交给系统浏览器：Pixiv / B 站 / 网易云官网都不该在这个窗口里打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(ORIGIN + '/')) return { action: 'allow' };
    shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(ORIGIN + '/')) return;
    event.preventDefault();
    shell.openExternal(url).catch(() => {});
  });

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    dialog.showErrorBox('页面崩溃了', `原因：${details.reason}\n可以关掉重开一次。`);
  });

  mainWindow.on('close', () => writeState());
  mainWindow.on('closed', () => { mainWindow = null; });

  // 无边框窗口的自绘标题栏：注入拖拽区 + 三个窗口按钮（只在桌面版里注入，
  // 网页版没有 -webkit-app-region 这回事，注入也只发生在 app 里）
  mainWindow.webContents.on('did-finish-load', () => injectWindowChrome());
  const syncWinState = () => {
    try { mainWindow?.webContents.send('win:state', mainWindow.isMaximized()); } catch { /* 忽略 */ }
  };
  mainWindow.on('maximize', syncWinState);
  mainWindow.on('unmaximize', syncWinState);

  mainWindow.loadURL(`${ORIGIN}/index.html#/`);
}

/* ---------------- 无边框窗口：把站点顶栏当标题栏 ---------------- */

/**
 * 给页面注入两样东西：
 *  1) 一段 CSS：顶栏贴到窗口最上沿、整条可拖动；内部链接/按钮设为 no-drag
 *     （否则点不动）；窗口按钮贴在最右。
 *  2) 三个窗口按钮 + 事件，点击走 window.desktopWindow（preload 暴露）。
 * 只在桌面版注入，网页版完全不受影响。
 */
function injectWindowChrome() {
  if (!mainWindow) return;

  const css = `
    /* 无边框窗口里顶栏就是标题栏：贴满窗口顶部，左右不留缝、四角不要圆角 ——
       原来它是「悬浮胶囊」（左右各缩进 49px、14px 圆角），在窗口顶部会露出
       页面背景，看起来像浮在标题栏位置上的一块板子。 */
    .topbar {
      -webkit-app-region: drag;
      margin-top: 0 !important;
      top: 0 !important;
      width: 100vw !important;
      margin-left: calc(50% - 50vw) !important;
      border-radius: 0 !important;
      border-left: 0 !important;
      border-right: 0 !important;
      border-top: 0 !important;
      padding-left: var(--sp-5, 24px) !important;
      padding-right: var(--sp-5, 24px) !important;
    }
    /* 下面那条播报跟着拉通，否则顶栏满宽、播报缩进，中间会留一个凹口 */
    .ticker {
      width: 100vw !important;
      margin-left: calc(50% - 50vw) !important;
      border-radius: 0 !important;
    }
    /* 顶栏里的可点东西都要还原成可点，否则整条都被拖拽吃掉 */
    .topbar a, .topbar button, .topbar input, .topbar select,
    .topbar .iconbtn, .topbar .nav__link, .topbar .brand { -webkit-app-region: no-drag; }
    /* 窗口按钮：放在顶栏右侧簇的末尾，尺寸压到 32px */
    .desktop-winbar {
      display: flex; align-items: center; gap: 2px; margin-left: 6px;
      flex: 0 0 auto; -webkit-app-region: no-drag;
    }
    .desktop-winbar .iconbtn { width: 32px; height: 32px; border-radius: 8px; }
    .desktop-winbar .iconbtn svg { width: 10px; height: 10px; }
    .desktop-winbar .iconbtn--close:hover {
      background: #E2452B !important;
      border-color: transparent !important;
      color: #fff !important;
    }
    /* 顶栏在 1550px 左右的窗口宽度下本来就没有余量（品牌 + 11 个导航 + 5 个图标 + 头像），
       再加三个窗口按钮必挤。把装饰性的时钟让出来 —— Windows 任务栏右下角本来就有时间。
       宽度换算是实测的：时钟 117px，窗口按钮簇 100px，正好腾出空间且导航不再截断。 */
    #clock { display: none !important; }
  `;
  mainWindow.webContents.insertCSS(css).catch(() => {});

  const js = `(function () {
    if (document.querySelector('.desktop-winbar')) return;
    var host = document.querySelector('.topbar__right');
    if (!host) return;
    var ICON = {
      min: '<svg viewBox="0 0 12 12" fill="none"><path d="M2 6h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
      max: '<svg viewBox="0 0 12 12" fill="none"><rect x="2.2" y="2.2" width="7.6" height="7.6" rx="1" stroke="currentColor" stroke-width="1.3"/></svg>',
      restore: '<svg viewBox="0 0 12 12" fill="none"><rect x="4" y="4" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M8 4V2.2H2.2V8H4" stroke="currentColor" stroke-width="1.2"/></svg>',
      close: '<svg viewBox="0 0 12 12" fill="none"><path d="M2.6 2.6l6.8 6.8M9.4 2.6l-6.8 6.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'
    };
    var wrap = document.createElement('div');
    wrap.className = 'desktop-winbar';
    wrap.innerHTML =
      '<button class="iconbtn" id="winMin" type="button" title="最小化" aria-label="最小化">' + ICON.min + '</button>' +
      '<button class="iconbtn" id="winMax" type="button" title="最大化" aria-label="最大化">' + ICON.max + '</button>' +
      '<button class="iconbtn iconbtn--close" id="winClose" type="button" title="关闭" aria-label="关闭">' + ICON.close + '</button>';
    host.appendChild(wrap);

    var api = window.desktopWindow;
    document.getElementById('winMin').addEventListener('click', function () { api && api.min(); });
    document.getElementById('winMax').addEventListener('click', function () { api && api.toggleMax(); });
    document.getElementById('winClose').addEventListener('click', function () { api && api.close(); });

    var maxBtn = document.getElementById('winMax');
    function setMax(maxed) {
      maxBtn.title = maxed ? '还原' : '最大化';
      maxBtn.setAttribute('aria-label', maxBtn.title);
      maxBtn.innerHTML = maxed ? ICON.restore : ICON.max;
    }
    if (api && api.onState) api.onState(setMax);
  })();`;
  mainWindow.webContents.executeJavaScript(js).catch(() => {});
}

/* ---------------- 菜单 / 下载 ---------------- */

function buildMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '创建桌面快捷方式', click: () => createDesktopShortcut({ interactive: true }) },
        { label: '局域网联机（手机加入）', click: () => void showLanDialog() },
        { type: 'separator' },
        { label: '打开数据目录', click: () => shell.openPath(DATA_DIR) },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
        { role: 'toggleDevTools', label: '开发者工具' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: `关于 ${APP_NAME}`,
          click: () => dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: `关于 ${APP_NAME}`,
            message: `${APP_NAME} · 桌面版 ${app.getVersion()}`,
            detail: [
              '纯本地运行：没有本地端口、没有后台服务进程，页面走 fish://app/ 直接读磁盘。',
              '',
              `数据目录：${DATA_DIR}`,
              '',
              'Pixiv 抽卡、网易云搜索这类功能仍然需要联网；其余全部离线可用。',
            ].join('\n'),
            buttons: ['好'],
          }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function setupDownloads() {
  session.defaultSession.on('will-download', (_event, item) => {
    const name = item.getFilename() || 'download';
    item.setSaveDialogOptions({
      title: `保存 ${name}`,
      defaultPath: path.join(app.getPath('downloads'), name),
    });
  });
}

/* ---------------- 桌面快捷方式 ---------------- */

function showBox(options) {
  if (mainWindow && !mainWindow.isDestroyed()) return dialog.showMessageBox(mainWindow, options);
  return dialog.showMessageBox(options);
}

/**
 * 在桌面创建/覆盖「FISH 鱼の灵庙」快捷方式。
 * 绿色版没有安装器，所以第一次启动时自动做一次；之后删了可以从
 * 「文件 → 创建桌面快捷方式」重建，不会每次启动都烦你。
 */
function createDesktopShortcut({ interactive = false } = {}) {
  if (process.platform !== 'win32') {
    if (interactive) void showBox({ type: 'info', title: '桌面快捷方式', message: '这个功能只支持 Windows。' });
    return false;
  }
  if (!app.isPackaged) {
    if (interactive) void showBox({ type: 'info', title: '桌面快捷方式', message: '开发模式下不创建快捷方式；打包后的 FishTemple.exe 会自动创建。' });
    return false;
  }
  const shortcutPath = path.join(app.getPath('desktop'), SHORTCUT_NAME);
  try {
    const ok = shell.writeShortcutLink(shortcutPath, 'create', {
      target: process.execPath,
      cwd: path.dirname(process.execPath),
      description: `${APP_NAME} · 桌面版`,
      icon: process.execPath,
      iconIndex: 0,
      appUserModelId: 'com.qiyuyu.fishtemple',
    });
    if (!ok) throw new Error('系统没有接受这个快捷方式');
    try { fs.writeFileSync(SHORTCUT_FLAG, `${new Date().toISOString()}\n${shortcutPath}\n`, 'utf8'); } catch { /* 标记写不进去也不影响快捷方式 */ }
    if (interactive) {
      void showBox({
        type: 'info',
        title: '桌面快捷方式',
        message: '已在桌面创建快捷方式',
        detail: shortcutPath,
        buttons: ['好'],
      });
    }
    return true;
  } catch (err) {
    if (interactive) {
      void showBox({
        type: 'error',
        title: '桌面快捷方式',
        message: '创建失败',
        detail: String(err?.message || err),
        buttons: ['好'],
      });
    }
    return false;
  }
}

/** 首次启动自动建一次；已有快捷方式或已经建过就跳过 */
function ensureDesktopShortcut() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  try {
    if (fs.existsSync(SHORTCUT_FLAG)) return;
    const shortcutPath = path.join(app.getPath('desktop'), SHORTCUT_NAME);
    if (fs.existsSync(shortcutPath)) {
      // 用户自己已经放了一个同名快捷方式：不覆盖，只记下“已处理”
      fs.writeFileSync(SHORTCUT_FLAG, `existing\n${shortcutPath}\n`, 'utf8');
      return;
    }
    createDesktopShortcut();
  } catch { /* 没桌面权限 / OneDrive 路径异常：不阻塞启动 */ }
}

/* ---------------- 崩溃日志 ---------------- */

function logCrash(err) {
  const text = [
    `time: ${new Date().toISOString()}`,
    `app: ${app.getVersion()}  electron: ${process.versions.electron}`,
    `packaged: ${app.isPackaged}`,
    `siteDir: ${SITE_DIR}`,
    `dataDir: ${DATA_DIR}`,
    '',
    '=== error ===',
    String(err?.stack || err),
  ].join('\n');
  try { fs.writeFileSync(path.join(USER_DIR, 'startup-error.log'), text, 'utf8'); } catch { /* 尽力而为 */ }
  return path.join(USER_DIR, 'startup-error.log');
}

/* ---------------- 启动 ---------------- */

// 自定义协议必须在 ready 之前登记特权：
// standard 让 fish://app/x 有正常的 origin；secure 让 crypto.subtle 之类可用
protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}]);

/* ---------------- 无边框窗口的按钮（页面 → 主进程） ---------------- */

ipcMain.on('win:min', () => mainWindow?.minimize());
ipcMain.on('win:toggle-max', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('win:close', () => mainWindow?.close());

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.setAppUserModelId('com.qiyuyu.fishtemple');

  app.whenReady().then(async () => {
    try {
      seedData();

      // 同一个进程里加载服务端实现：它导出的是 handleApiRequest(Request) → Response
      const mod = await import(pathToFileURL(path.join(SITE_DIR, 'server.mjs')).href);
      apiHandler = mod.handleApiRequest;

      protocol.handle(SCHEME, handleFishProtocol);
      setupDownloads();
      buildMenu();
      createWindow();
      // 绿色版没有安装器：首次启动把桌面快捷方式补上
      ensureDesktopShortcut();
      // 可选：FishTemple.exe --lan 直接开启局域网联机（方便固定 IP / 快捷方式）
      if (process.argv.includes('--lan')) {
        startLanServer()
          .then((info) => console.log(`[lan] ${info.url}`))
          .catch((err) => console.error('[lan]', err));
      }
    } catch (err) {
      const logFile = logCrash(err);
      dialog.showErrorBox('启动失败', `${String(err?.message || err)}\n\n诊断信息已写到：\n${logFile}`);
      app.quit();
    }
  });

  app.on('window-all-closed', () => app.quit());

  app.on('before-quit', () => {
    quitting = true;
    writeState();
    stopLanServer();
  });
}
