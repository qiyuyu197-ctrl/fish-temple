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

const { app, BrowserWindow, Menu, dialog, shell, session, protocol } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
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

/** 第一次启动：把打包进来的内容清单播种到用户数据目录 */
function seedData() {
  const src = path.join(SITE_DIR, 'data');
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (!name.endsWith('.json')) continue;
    const dst = path.join(DATA_DIR, name);
    if (fs.existsSync(dst)) continue;
    try { fs.copyFileSync(path.join(src, name), dst); } catch { /* 单个失败不阻塞 */ }
  }
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
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      webSecurity: true,
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

  mainWindow.loadURL(`${ORIGIN}/index.html#/`);
}

/* ---------------- 菜单 / 下载 ---------------- */

function buildMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
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
  });
}
