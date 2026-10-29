# 桌面版（Windows）

> 下载地址：[Releases](../../../releases) → `fish-temple-desktop-x.y.z-win-x64.zip`

**纯本地**：没有本地端口、没有后台服务进程、不加载任何线上网站。
一个 exe、一个窗口、一堆本地文件，拔网线也能用。

## 它是怎么跑起来的

```
FishTemple.exe
 ├─ 主进程从 resources/site 直接读文件，通过 fish://app/… 渲染页面
 └─ /api/* 不经过网络：同一进程里调用 server.mjs 的 handleApiRequest()
```

具体说：

- **页面**走自定义协议 `fish://app/index.html`，主进程自己 `readFile` 回给窗口。
  不是 `http://127.0.0.1:随机端口`，打开任务管理器也找不到「本地服务器」。
- **接口**（音乐代理 / Pixiv / 黄历 / 论坛 / 发布控制台 / 内容读写）全在同一个进程里，
  直接调 `server.mjs` 导出的 `handleApiRequest(request)` —— 这个函数本来就是给
  Netlify Functions 用的（收 Web `Request`、回 Web `Response`），搬过来零改动。
- **数据**写在 `%APPDATA%\FishTemple\data`，第一次启动从包内播种一次，之后只读写这里。
- 断网时：站点、相册、文章、工具台、扫雷全部正常；只有 Pixiv 抽卡、网易云搜索这类
  要访问外网的功能会自己报离线。

> 说清楚一句：界面仍然是 HTML/CSS/JS 渲染的（VS Code、Spotify、Discord 都是这样）。
> 去掉的是「本地起一个网站再套壳」这层；真要用 WinUI/WPF 重画控件，是另一个项目 ——
> 这个仓库三万多行 JS 全在界面上。

## 怎么用

1. 下载 zip，解压到任意目录（**不要放 `C:\Program Files`**，那里默认不可写）
2. 双击 `FishTemple.exe`
3. 第一次启动会慢一两秒：把打包进来的内容清单播种到 `%APPDATA%\FishTemple\data`

| 事情 | 在哪 |
| --- | --- |
| 你的文章 / 公告 / 播放历史 / 论坛数据 | `%APPDATA%\FishTemple\data`（菜单 → 文件 → 打开数据目录） |
| 账号（邮箱 + scrypt 哈希后的密码） | `%APPDATA%\FishTemple\data\auth\users.json` |
| 窗口大小与位置 | `%APPDATA%\FishTemple\window-state.json` |
| 启动失败时的诊断 | `%APPDATA%\FishTemple\startup-error.log` |
| 卸载 | 删掉解压出来的目录 + `%APPDATA%\FishTemple` 即可，没有注册表项 |

## 账号与网易云登录

**本站账号**：桌面版不复用网站的 Auth0，而是自带一套本机账号（`auth-local.mjs`）：

- 顶栏「登录」→ 面板里填邮箱 + 密码，第一次就是注册（面板上有「没有账号？注册一个」切换）
- 密码用 `scrypt` 加盐哈希后存在本机，令牌是 HMAC-SHA256 签名的无状态串，有效期 30 天
- **第一个注册的账号自动是站长**，之后注册的是普通成员
- 登录之后：论坛发帖、发布控制台写入、个人资料、站长后台都能用
- 忘了密码：删掉 `data/auth/users.json`（所有账号一起清掉）。本地账号不做邮箱验证和找回密码，
  这是刻意的取舍 —— 没有邮件服务，说"已发送验证邮件"才是骗人

**网易云登录**：音乐台右上角的账号面板里可以扫码登录（`/api/netease/login/*`）。
它是**第三方登录**，扫码后本站会替你保管一份网易云凭据（AES-256-GCM 加密）。
据公开反馈，第三方客户端登录有被网易云判异常（临时冻结）的风险，所以面板里默认有一段风险提示，
介意的话用小号。登录后能读「我的歌单 / 云盘 / 每日推荐」，播放走带签名的音频链路。

> 网站（Netlify / 自建 VPS）那一边**没有改**：配了 `AUTH0_DOMAIN` + `AUTH0_CLIENT_ID`
> 就还是 Auth0；没有配、又设了 `FT_LOCAL_AUTH=1` 才会启用这套本地账号。
> 桌面版启动时自己设了 `FT_LOCAL_AUTH=1`，所以它永远走本地账号。

## 打包出来的东西长什么样

```
FishTemple-win32-x64/
├── FishTemple.exe          双击这个
├── resources/
│   ├── app.asar            主进程（main.cjs，几十 KB）
│   └── site/               站点文件 + server.mjs  ← 必须留在磁盘上
└── ...                     Electron 运行时
```

`site/` 故意不进 `app.asar`：

- asar 是虚拟文件系统，主进程用 `fs` 读不到里面的文件（现在整页都是主进程读盘渲染的）；
- 反过来也要小心：`site/package.json` 里那行 `"type": "module"` 别删，
  少了它 `server.mjs` 会把 `src/**/*.js` 当 CommonJS，直接
  `SyntaxError: Named export 'canDelete' not found`。

## 自己构建

需要 Node.js 18+（Electron 会自己下载，不需要装 Visual Studio 或 Android SDK）：

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

只想要小体积、不在乎相册：

```bash
node scripts/assemble-site.mjs --lite   # 跳过 assets/img，站点部分 286MB → 51MB
node scripts/package.mjs
```

## 发版

```bash
git tag desktop-v1.1.0 && git push origin desktop-v1.1.0
```

CI（[`.github/workflows/desktop.yml`](../../.github/workflows/desktop.yml)）在 Windows runner 上
装 Electron、组装站点、打包、压缩，然后把 zip 挂到这个 tag 的 Release 上。
手动触发时勾 **lite** 就出精简版。

## 已知限制

- **只有 Windows x64**：加 macOS / Linux 只是给 packager 多传两个参数，但没在真机上验过，不敢直接发。
- **体积**：完整版解压 520MB、zip 386MB，其中 236MB 是相册图。
  想要小就用 `--lite`：站点部分 286MB → 51MB，成品解压 284MB / zip 119MB。
- **不放 `C:\Program Files`**：便携版没有安装程序，数据在 `%APPDATA%`，但内容读取假设目录可读；
  放系统目录里改内容会失败。
- **账号**：桌面版用的是**本站自己的账号系统**（不是 Auth0）。原因见下节。
  数据在 `%APPDATA%\FishTemple\data\auth\users.json`，忘记密码只能删掉这个文件重来。
- **没有自动更新**：站点内容更新要重新下载 zip。
