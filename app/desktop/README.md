# 桌面版（Windows）

> 下载地址：[Releases](../../../releases) → `fish-temple-desktop-x.y.z-win-x64.zip`

和安卓壳最大的区别：**桌面版不联网也能用**。

站点文件、相册、`server.mjs` 全部打进安装目录，Electron 启动时在本机
`127.0.0.1` 的随机端口上把服务跑起来，窗口加载这个本地地址。
所以 `/api/*` 是真的在跑 —— 音乐代理、插画通道、黄历、论坛、发布控制台全都正常，
断网也不会变成一张白纸。

## 怎么用

1. 下载 zip，解压到任意目录（**不要放 `C:\Program Files`**，那里默认不可写）
2. 双击 `FishTemple.exe`
3. 第一次启动会慢两三秒：把打包进来的内容清单播种到 `%APPDATA%\FishTemple\data`

| 事情 | 在哪 |
| --- | --- |
| 你的文章 / 公告 / 播放历史 / 论坛数据 | `%APPDATA%\FishTemple\data`（菜单 → 文件 → 打开数据目录） |
| 窗口大小与位置 | `%APPDATA%\FishTemple\window-state.json` |
| 启动失败时的诊断 | `%APPDATA%\FishTemple\startup-error.log`（含本地服务日志尾部） |
| 卸载 | 删掉解压出来的目录 + `%APPDATA%\FishTemple` 即可，没有注册表项 |

## 打包出来的东西长什么样

```
FishTemple-win32-x64/
├── FishTemple.exe          双击这个
├── resources/
│   ├── app.asar            主进程（main.cjs，几十 KB）
│   └── site/               站点 + server.mjs  ← 必须留在磁盘上，不能塞进 asar
└── ...                     Electron 运行时
```

`site/` 故意不进 `app.asar`：asar 是虚拟文件系统，被 `spawn` 出来的
`server.mjs` 读不到里面的文件（这个坑踩过一次，表现为启动直接失败）。

`site/package.json` 只有一行 `"type": "module"` 是有用的，别删：
少了它，`server.mjs` 里 `import './src/plugins/comment-model.js'` 会把对方当 CommonJS，
直接 `SyntaxError: Named export 'canDelete' not found`。

## 自己构建

需要 Node.js 18+（Electron 会自己下载，不需要装 Visual Studio 或 SDK）：

```bash
cd app/desktop
npm install                 # 装 electron + @electron/packager
npm start                   # 开发模式：直接开窗口（用的是仓库里的站点）
npm run dist                # 出成品：dist/FishTemple-win32-x64/
```

国内网络装不上 Electron 时加镜像：

```powershell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_CUSTOM_DIR = "{{ version }}"
npm install
```

只想快速出一个能跑的包、不在乎相册：

```bash
node scripts/assemble-site.mjs --lite   # 跳过 assets/img，约 286MB → 50MB
node scripts/package.mjs
```

## 发版

```bash
git tag desktop-v1.0.0 && git push origin desktop-v1.0.0
```

CI（[`.github/workflows/desktop.yml`](../../.github/workflows/desktop.yml)）在 Windows runner 上
装 Electron、组装站点、打包、压缩，然后把 zip 挂到这个 tag 的 Release 上。
手动触发时勾 **lite** 就出精简版。

## 已知限制

- **只有 Windows x64**：加 macOS / Linux 只是给 packager 多传两个参数，但没在真机上验过，不敢直接发。
- **体积**：完整版解压 520MB、zip 约 300MB，其中 236MB 是相册图。想要小就用 `--lite`。
- **不放 `C:\Program Files`**：便携版没有安装程序，写数据靠 `%APPDATA%`，但相对路径的内容读取
  仍假设目录可写；放系统目录里改内容会失败。
- **登录（Auth0）**：回调地址是按当前页面 `origin` 拼的，桌面版的 origin 是
  `http://127.0.0.1:<随机端口>`，端口每次都不一样 —— 所以 Auth0 登录在桌面版里用不了。
  要么不用登录（发布、论坛只在本机写），要么改成固定端口 + 在 Auth0 后台登记。
- **没有自动更新**：站点内容更新要重新下载 zip。想自动更新就得引入签名与更新服务器，
  那是另一个量级的事情。
