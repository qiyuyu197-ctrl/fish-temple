'use strict';

/**
 * main.cjs — 鱼の灵庙 · 桌面版
 * ------------------------------------------------------------------
 * 结构很简单，和安卓壳是同一个思路，但桌面版**不需要联网**：
 *
 *   站点文件与 server.mjs 一起打进安装目录
 *          ↓
 *   Electron 启动时在 127.0.0.1 的随机端口上把 server.mjs 跑起来
 *          ↓
 *   窗口加载这个本地地址（所以 /api/* 全都在，音乐代理、Pixiv、黄历都正常）
 *
 * 数据（文章 / 公告 / 播放历史 / 账号）写到系统的用户数据目录，不碰安装目录，
 * 也不碰仓库里的 data/ —— 第一次启动时从打包进来的 data/*.json 播种一次。
 *
 * 刻意没做的：自动更新、托盘常驻、系统级快捷键。
 * 先把「双击就能用、断网也能用」做扎实，剩下的等你真觉得需要再说。
 */

const { app, BrowserWindow, Menu, dialog, shell, session } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');

const IS_DEV = !app.isPackaged;
const APP_NAME = '鱼の灵庙';
const HOME_TITLE = '鱼の灵庙 · 桌面版';

/** 打包后在 resources/site；开发时直接用仓库根目录 */
const SITE_DIR = IS_DEV
  ? path.resolve(__dirname, '..', '..')
  : path.join(process.resourcesPath, 'site');

const USER_DIR = app.getPath('userData');
const DATA_DIR = path.join(USER_DIR, 'data');
const STATE_FILE = path.join(USER_DIR, 'window-state.json');

let mainWindow = null;
let serverProcess = null;
let serverPort = 0;
let serverLog = '';
let quitting = false;

/* ---------------- 工具 ---------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

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
  } catch { /* 写不进去就算了，下次用默认尺寸 */ }
}

/** 第一次启动：把打包进来的内容清单播种到用户数据目录 */
function seedData() {
  const src = path.join(SITE_DIR, 'data');
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (!name.endsWith('.json')) continue;
    const dst = path.join(DATA_DIR, name);
    if (fs.existsSync(dst)) continue;
    try { fs.copyFileSync(path.join(src, name), dst); } catch { /* 单个文件失败不阻塞启动 */ }
  }
}

function logCrash(err) {
  const text = [
    `time: ${new Date().toISOString()}`,
    `app: ${app.getVersion()}  electron: ${process.versions.electron}`,
    `packaged: ${app.isPackaged}`,
    `siteDir: ${SITE_DIR}`,
    `dataDir: ${DATA_DIR}`,
    `port: ${serverPort}`,
    '',
    '=== error ===',
    String(err?.stack || err),
    '',
    '=== server log (tail) ===',
    serverLog,
  ].join('\n');
  try { fs.writeFileSync(path.join(USER_DIR, 'startup-error.log'), text, 'utf8'); } catch { /* 尽力而为 */ }
  return path.join(USER_DIR, 'startup-error.log');
}

/* ---------------- 本地服务 ---------------- */

async function waitHealthy(port, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (serverProcess && serverProcess.exitCode !== null) {
      throw new Error(`本地服务启动失败（退出码 ${serverProcess.exitCode}）\n\n${serverLog.slice(-1200)}`);
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`, { cache: 'no-store' });
      if (res.ok) return;
    } catch { /* 还没起来 */ }
    await sleep(250);
  }
  throw new Error(`本地服务在 ${Math.round(timeoutMs / 1000)} 秒内没有就绪\n\n${serverLog.slice(-1200)}`);
}

async function startServer() {
  const entry = path.join(SITE_DIR, 'server.mjs');
  if (!fs.existsSync(entry)) {
    throw new Error(`找不到本地服务：${entry}\n（开发模式请在仓库根目录执行 npm --prefix app/desktop start）`);
  }

  serverPort = await freePort();

  serverProcess = spawn(process.execPath, [entry, String(serverPort)], {
    cwd: SITE_DIR,
    // ELECTRON_RUN_AS_NODE：用 Electron 自带的 Node 跑 server.mjs，不需要额外装 Node
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', FT_DATA_DIR: DATA_DIR, HOST: '127.0.0.1', PORT: String(serverPort) },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const collect = (buf) => {
    serverLog = (serverLog + buf.toString('utf8')).slice(-8000);
  };
  serverProcess.stdout.on('data', collect);
  serverProcess.stderr.on('data', collect);

  serverProcess.on('exit', (code) => {
    if (quitting) return;
    // 端口被占、权限不足之类：别静默留一个白窗口
    dialog.showErrorBox('本地服务退出了', `退出码 ${code}\n\n${serverLog.slice(-1200)}`);
    app.quit();
  });

  await waitHealthy(serverPort);
  return serverPort;
}

function stopServer() {
  if (!serverProcess || serverProcess.exitCode !== null) return;
  try {
    if (process.platform === 'win32') {
      // Windows 上 kill() 只管一层，用 taskkill 连子进程一起收掉
      spawn('taskkill', ['/pid', String(serverProcess.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } else {
      serverProcess.kill('SIGTERM');
    }
  } catch { /* 已经没了 */ }
}

/* ---------------- 窗口 ---------------- */

function isInternal(url) {
  try {
    const u = new URL(url);
    return u.hostname === '127.0.0.1' && Number(u.port) === serverPort;
  } catch {
    return false;
  }
}

function splashHtml() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${HOME_TITLE}</title>
<style>
  html,body{height:100%;margin:0}
  body{display:grid;place-items:center;background:#121316;color:#EFEDE6;
       font-family:system-ui,-apple-system,"Noto Sans SC",sans-serif;-webkit-user-select:none}
  .b{text-align:center}
  .k{font:600 11px/1 ui-monospace,Consolas,monospace;letter-spacing:.22em;color:#E5BE00;margin-bottom:18px}
  h1{margin:0 0 10px;font-size:34px;letter-spacing:-.02em}
  p{margin:0;font-size:12px;color:#8d8b84;font-family:ui-monospace,Consolas,monospace}
  .bar{width:220px;height:2px;background:#2b2d33;margin:22px auto 0;overflow:hidden}
  .bar i{display:block;height:100%;width:40%;background:#E5BE00;animation:run 1.1s ease-in-out infinite}
  @keyframes run{0%{transform:translateX(-110%)}100%{transform:translateX(300%)}}
</style></head><body><div class="b">
  <div class="k">FISH TEMPLE / DESKTOP</div>
  <h1>鱼の灵庙</h1>
  <p>正在启动本地服务…</p>
  <div class="bar"><i></i></div>
</div></body></html>`;
}

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
    title: HOME_TITLE,
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      // 站内是本地 http 服务，不需要任何远程内容权限
      webSecurity: true,
    },
  });

  if (state.maximized) mainWindow.maximize();

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // 站外链接交给系统浏览器：Pixiv / B 站 / 网易云官网都不该在这个窗口里打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternal(url)) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true } };
    shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isInternal(url)) return;
    event.preventDefault();
    shell.openExternal(url).catch(() => {});
  });

  // 站内出错时别留白屏
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    dialog.showErrorBox('页面崩溃了', `原因：${details.reason}\n可以关掉重开一次。`);
  });

  mainWindow.on('close', () => writeState());
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(splashHtml()));
}

async function loadApp(port) {
  if (!mainWindow) return;
  try {
    await mainWindow.loadURL(`http://127.0.0.1:${port}/#/`);
  } catch (err) {
    dialog.showErrorBox('打不开界面', String(err?.message || err));
  }
}

/* ---------------- 菜单 ---------------- */

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
            detail: `本地服务：http://127.0.0.1:${serverPort}/\n数据目录：${DATA_DIR}\n\n站内一切都在本机运行，断网也能用；只有 Pixiv 抽卡、网易云搜索这类要访问外网的功能需要联网。`,
            buttons: ['好'],
          }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------------- 下载 ---------------- */

function setupDownloads() {
  // 工具台的 zip / 图片导出走 <a download>；Electron 默认会弹「另存为」，这里把标题写清楚
  session.defaultSession.on('will-download', (_event, item) => {
    const name = item.getFilename() || 'download';
    item.setSaveDialogOptions({
      title: `保存 ${name}`,
      defaultPath: path.join(app.getPath('downloads'), name),
    });
  });
}

/* ---------------- 启动 ---------------- */

if (!app.requestSingleInstanceLock()) {
  // 已经开着一个了：第二个实例直接退出，把原来的窗口叫到前面
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
      createWindow();
      setupDownloads();
      const port = await startServer();
      buildMenu();
      await loadApp(port);
    } catch (err) {
      const logFile = logCrash(err);
      dialog.showErrorBox('启动失败', `${String(err?.message || err)}\n\n诊断信息已写到：\n${logFile}`);
      app.quit();
    }
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('before-quit', () => {
    quitting = true;
    writeState();
    stopServer();
  });
}
