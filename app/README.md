# 装成 App

站点本来是个网页。下面三种「App」互相独立，可以只用其中一个：

| 形态 | 怎么拿到 | 谁的活 |
| --- | --- | --- |
| **PWA**（推荐先试） | 手机浏览器打开站点 → 菜单里「安装应用 / 添加到主屏幕」 | 已经在仓库里了，部署上去就生效 |
| **Android APK** | 到 [Releases](../../../releases) 下载 `.apk` 装上（当前：[1.0.3](../../../releases/download/app-v1.0.3/fish-temple-1.0.3.apk)，226KB） | GitHub Actions 自动构建，见下面的「发版」 |
| **Windows 桌面版** | 到 [Releases](../../../releases) 下载 `fish-temple-desktop-*-win-x64.zip`，解压双击 `FishTemple.exe` | 断网可用，站点和 server.mjs 都在包里，见 [desktop/README.md](desktop/README.md) |

三者都不上架应用商店：PWA 不需要，APK 与桌面版都是直接下载。

> ⚠️ **地址要先定下来。** PWA 和 APK 都是「壳 + 线上站点」，站点打不开就是兜底页。
> 默认地址是 GitHub Pages（`https://<用户名>.github.io/<仓库名>/`）。
> 第一次要手动开一下 Pages，见「站点地址」一节；站点搬家只改一个变量，不用改代码。
> 桌面版不受这条限制 —— 它把站点打进包里了，断网也能用。

---

## 一、PWA：装到主屏，断网也能开

已经做好的部分（都在仓库里，不需要构建）：

| 文件 | 作用 |
| --- | --- |
| `manifest.webmanifest` | 名称 / 图标（192、512、maskable）/ 启动地址 / 三个快捷方式 / 安装面板截图 |
| `sw.js` | Service Worker：预缓存壳资源、图片走缓存优先、接口不缓存 |
| `offline.html` | 断网时的兜底页（可以点一下重试） |
| `src/ui/pwa.js` | 注册 SW、新版本提示、断网提示 |
| `assets/icons/icon-192.png`、`icon-512-maskable.png` | Chromium 的安装条件与 Android 自适应图标 |
| `assets/pwa/screenshot-*.png` | manifest 里的安装面板截图 |

**怎么装**

- **Android / 桌面 Chrome、Edge**：打开站点 → 地址栏右侧的安装图标，或菜单 →「安装应用 / Install app」。
- **iOS Safari**：分享 →「添加到主屏幕」。iOS 没有安装提示，只能这样加。
- 装完从主屏启动是独立窗口（`standalone`），没有地址栏。

**离线边界**（重要，别期待成离线 App）

- ✅ 外壳、样式、脚本、`data/*.json` 内容、看过的图片 → 断网也能打开
- ❌ 音乐搜索/试听、Pixiv 抽卡、论坛、登录 → 必须联网（这些走 `/api/*`，本来就要服务器）
- 断网打开会看到站点本身 + 一句「断网了」，而不是白屏

**改了站点文件之后**：`src/`、`styles/`、`data/` 有任何改动，跑一次

```bash
npm run pwa:sw        # = node tools/gen-service-worker.mjs
```

它会重算版本指纹并重写 `sw.js`。不跑也不会坏（壳资源是「先给缓存、后台更新」），
只是新版本提示不会弹，用户要等下一次冷启动才拿到新版。

**自检**（要本机有 Edge / Chrome）：

```bash
node server.mjs 5188          # 另开一个窗口
npm run verify:pwa -- http://127.0.0.1:5188
```

会检查：manifest 的图标档位、截图能不能取到、SW 是否激活并接管页面、
Chromium 判定可安装、**断网重开外壳还在**、断网切板块、接口断网时不走缓存。当前 17 项全过。

---

## 二、Android APK：一个没有地址栏的窗口

工程在 `app/android/`，纯原生 Java（不引 AndroidX、不引 Capacitor），
整个 App 就是 **一个 Activity + 一个 WebView**。APK 约 100KB 量级，
因为站点资源不打进包里 —— 打开时加载线上地址。

**浏览器里没有、但装上之后必须有的，这一层补了：**

| 场景 | 处理 |
| --- | --- |
| 点站外链接（Pixiv / B 站 / 网易云官网） | 交给系统浏览器，不在无地址栏窗口里迷路 |
| 工具台导出 zip、Tier List 存图、AI 分离导出音频 | `blob:` 下载浏览器会自己做，WebView 不做 → JS 桥转 base64 存进「下载」目录 |
| 论坛发图 `<input type="file">` | 接系统文件选择器（含多选） |
| 返回键 | 先退站内历史，到底了才退出 App |
| 打不开首页 | 本地兜底页（`res/raw/offline.html`），带「重新连接」 |
| 网易云官方播放器 iframe | 允许第三方 cookie，沿用浏览器里的登录态 |
| 转屏 / 分屏 | `configChanges` 里吃掉，WebView 不重建，音乐不断 |

**发版（在 GitHub 上点两下就行）**

```bash
git tag app-v1.0.0
git push origin app-v1.0.0
```

推上去之后 `.github/workflows/android.yml` 会自动构建 APK，并挂到这个 tag 的 Release 上。
想先看看能不能建出来、不发版：Actions → **Android APK** → Run workflow（只留 Artifacts）。

**用户怎么装**：Releases → 下载 `fish-temple-x.y.z.apk` → 手机上点开 →
系统提示「不允许安装未知来源应用」→ 去设置里给浏览器/文件管理器打开这个权限 → 继续安装。

**签名与升级**：APK 用 debug 签名（CI 里把 keystore 缓存住复用）。
只要还是这个仓库、这个缓存，新版本能直接覆盖安装；
缓存被清掉后重新构建会换一把钥匙，用户得先卸载再装（本地数据会丢）。
真要长期发版，换成自己的 keystore + `secrets`，或者上架商店。

---

## 三、Windows 桌面版：唯一能真正离线的

到 [Releases](../../../releases) 下载 `fish-temple-desktop-*-win-x64.zip`，解压双击 `FishTemple.exe`。

**纯本地**：没有本地端口、没有后台服务进程。页面走 `fish://app/`，主进程自己从磁盘读；
`/api/*` 也在同一进程里调 `server.mjs` 的 `handleApiRequest()`（Netlify Functions 用的就是它）。
所以断网、关机重启、拔网线，它都是同一个样子。

- 数据在 `%APPDATA%\FishTemple\data`（菜单 → 文件 → 打开数据目录）
- 完整版解压 520MB / zip 386MB；`--lite` 版本解压 284MB / zip 119MB（没有相册图）
- 只支持 Windows x64；登录（Auth0）因为 origin 是 `fish://app`，暂时用不了

构建、目录结构、踩过的坑都写在 **[desktop/README.md](desktop/README.md)**。

```bash
git tag desktop-v1.1.0 && git push origin desktop-v1.1.0
```

---

## 站点地址（App 打开哪个网址）

优先级从高到低：

1. 手动跑工作流时填的 `app_url`
2. 仓库变量 `APP_URL`（Settings → Secrets and variables → Actions → **Variables** → New variable）
3. 默认：`https://<用户名>.github.io/<仓库名>/`（GitHub Pages）

所以站点搬家只需要改 `APP_URL` 再跑一次工作流，代码一行不用动。

本地构建（需要 JDK 17 + Android SDK）：

```bash
gradle -p app/android assembleDebug -PappUrl=https://example.com/
# 产物：app/android/app/build/outputs/apk/debug/app-debug.apk
```

### 如果暂时没有可用的站点地址

Netlify 的免费额度被限流时站点会 503（App 也打不开，会停在兜底页）。两条路：

- **恢复原来的站点**：处理好 Netlify 那边的额度，App 不用重装。
- **换到 GitHub Pages**（免费、不按流量暂停）：本仓库已经切过去了，地址是
  `https://qiyuyu197-ctrl.github.io/fish-temple/`。新仓库才需要做下面这一步。

**第一次要手动开一下 Pages**（仓库设置需要管理员权限，工作流自己开不了）：

1. 仓库 → **Settings → Pages**
2. **Build and deployment → Source** 选 **GitHub Actions**（不是 "Deploy from a branch"）
3. 回到 **Actions → Deploy to GitHub Pages → Run workflow**

跑完会得到 `https://<用户名>.github.io/<仓库名>/`，也就是 APK 默认指向的地址。
之后只要 `main` 上的站点内容有变动，Pages 会自动重新发布，不用再管。

> 这个工作流故意只发布站点运行时需要的东西（`tools/`、`deploy/`、`app/` 都不上公网），
> 所以仓库里那些开发脚本不会跟着暴露出去。

> ⚠️ **Pages 在国内的访问质量很差**（实测并行拉 10 个 JS 文件要 10 秒上下、还会偶发失败）。
> 站点是 76 个请求的模块图，首屏会卡在启动画面上。给国内用户发 APK 时建议换成
> 自己的域名（Cloudflare Pages / VPS + Caddy），或者等 Netlify 恢复额度后把 `APP_URL` 改回去。

---

## 已知限制

- **必须联网**：App 不含站点资源（仓库里 288MB 主要是插画，模型还不在仓库里），所以只做壳。
- **iOS 后台音频**：`<audio>` + MediaSession 在 Android 上没问题；iOS 的 WebView/PWA 切后台会被系统挂起，
  这是系统限制，不是这里能修的。
- **AI 人声分离**：模型 64MB、wasm 40MB，手机上跑得动但很慢，建议留在桌面浏览器用。
- **登录（Auth0）**：回调地址按当前页面的 `origin` 拼。用远端模式（加载线上地址）时 origin 就是站点域名，
  Auth0 后台已经配过就不用改；如果把站点打进 App（本地 `https://localhost`）才需要额外加回调。
- **导出到下载目录**：Android 10 以下需要存储权限；目前只在 29+ 走 MediaStore，老设备会存到 App 私有目录并提示路径。
- **上架商店**：没做。App Store 4.2（网站壳）、第三方音乐内容版权、国内商店备案都是另外的事。
