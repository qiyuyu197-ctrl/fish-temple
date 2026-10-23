# 把「FISH 鱼の灵庙」跑在自己电脑上

这是给**看到这个仓库、想在自己机器上跑起来看看**的人准备的安装指南。
照着做，通常 3～5 分钟能打开首页。

不需要注册任何账号、不需要配置数据库、不需要 `npm install`。

---

## 0. 先说清楚它会占你多少地方

| 项目 | 大小 |
| --- | --- |
| 仓库大小（`git clone` 拉下来的内容） | 约 **350～400 MB** |
| 其中相册图片 | 约 177 MB（770 张照片，已随仓库提供） |
| 跑起来之后额外占用 | 几乎为零（缓存会慢慢长到几十 MB，可以随时删） |

> 这是个「内容型」仓库，体积主要来自相册。如果你只是想看代码，用
> `git clone --depth 1` 或直接在 GitHub 上 **Download ZIP** 都可以，体积一样，但少一份 `.git` 历史。

---

## 1. 只需要装一样东西：Node.js

| 需要 | 版本 | 用途 | 能不能不装 |
| --- | --- | --- | --- |
| **Node.js** | **18 或更高**（作者在 24 上验证） | 跑 `server.mjs`，它是本地服务器 + 站内所有接口的代理 | ❌ 不能。不装的话音乐搜索、Pixiv、黄历吉日之歌、发布控制台都用不了 |
| Git | 任意 | 把代码拉下来 | ✅ 能，Download ZIP 即可 |
| Python 3 + Pillow | — | 只有你想**批量重新处理素材**时才需要 | ✅ 能，跑站点完全不需要 |

Node.js 下载：<https://nodejs.org/>（选 LTS 版本即可，一路下一步）。

装完在终端里确认一下：

```bash
node -v      # 应该输出 v18.x.x 或更高
```

> **不需要 `npm install`。** 站点本身零依赖；`package.json` 里那个
> `@netlify/blobs` 只在**线上 Netlify** 环境才会被动态加载，本地跑永远碰不到它。
> 所以拉下来直接 `node server.mjs` 就行，不会构建、不会装包。

---

## 2. 把代码拿到本地

### 方式 A：git clone（推荐，以后能 `git pull` 更新）

```bash
git clone https://github.com/qiyuyu197-ctrl/fish-temple.git
cd fish-temple
```

想快一点、不要历史记录：

```bash
git clone --depth 1 https://github.com/qiyuyu197-ctrl/fish-temple.git
```

> **克隆卡住不动怎么办？** 这个仓库约 380 MB，在部分网络下 `git clone` 会长时间没进度
> （作者实测遇到过一次：卡了十几分钟，`.git` 里一个字节都没下来）。
> 卡住就 `Ctrl + C` 中断重来，或者**直接用下面的方式 B（Download ZIP）**——对弱网更友好。

### 方式 B：下载 ZIP（没装 Git 就用这个）

在仓库页面点 **Code → Download ZIP**，解压到一个**路径里没有中文和空格**的目录，然后进入该目录。

> Windows 上建议放在 `D:\fish-temple` 这类简短路径，避免个别工具对长路径 / 中文路径报错。

---

## 3. 启动

在**仓库根目录**（能看到 `server.mjs` 的那一层）执行：

```bash
node server.mjs
```

**Windows 用户也可以直接双击 `start.cmd`** —— 效果完全一样，它还会先帮你检查 Node.js 装没装。

启动成功后终端会打印这样一段：

```
──────────────────────────────────────────────────────────
  FISH TEMPLE  ·  本地开发服务器
──────────────────────────────────────────────────────────
  站点地址   http://localhost:5173
  发布控制台 http://localhost:5173/#/admin
  内容目录   <你的路径>/data
  ...
  在控制台保存内容会直接写入 data/（旧文件自动备份到 data/.backup）
  Ctrl + C 停止服务
```

然后在浏览器打开：

| 地址 | 是什么 |
| --- | --- |
| <http://localhost:5173> | 站点首页 |
| <http://localhost:5173/#/admin> | 发布控制台（写文章 / 公告） |

⚠️ **不要直接双击 `index.html`。** 浏览器不允许 `file://` 页面加载 ES 模块，脚本会被整个拦掉，
页面只会显示一段提示。必须通过上面那个服务器地址访问。

**停止服务**：回到终端按 `Ctrl + C`，或者直接关掉那个窗口。

---

## 4. 怎么确认真的起来了

打开 <http://localhost:5173/api/health>，应该能看到一段 JSON，重点看这两个字段：

```json
{
  "ok": true,
  "deploy": "local",      // 本地形态
  "storage": "fs",        // 写文件（不是 Netlify Blobs）
  "readonly": false,
  "writable": true
}
```

再随手验一下页面：首页能出图、<http://localhost:5173/#/gallery> 相册有照片、
<http://localhost:5173/#/music> 搜一首歌能搜出结果，就说明一切正常。

---

## 5. 换端口 / 换数据目录

```bash
# 换端口（三种写法等价）
node server.mjs 8080
PORT=8080 node server.mjs
set PORT=8080 && node server.mjs        # Windows cmd

# 把内容数据放到别的目录（默认是仓库里的 data/）
FT_DATA_DIR=D:\my-fish-data node server.mjs
```

服务器**默认监听所有网卡**（实测监听 `::`），所以同一个 Wi-Fi 下的手机可以直接用
`http://<你电脑的局域网IP>:5173` 打开，例如 `http://192.168.1.6:5173`。
只想让本机访问就加 `HOST=127.0.0.1`。

> 手机能打开你的站点，但**不能替你在控制台发布内容** —— 发布权限只给本机回环地址（见上一节）。

---

## 6. 在这里能做什么、什么做不了

大部分功能**开箱即用**，因为相册图片、文娱封面、内容种子数据都已经在仓库里了。

| 功能 | 本地能用吗 | 说明 |
| --- | --- | --- |
| 首页 / 文章 / 公告 / 相册 / 插画 / 文娱 / 工具台 / 扫雷 / 像素小鱼 | ✅ | 纯前端，零配置 |
| 黄历小组件（含判吉规则、吉日之歌） | ✅ | 通书数据已随仓库提供 |
| 音乐台搜索 / 导入歌单 / 站内试听 | ✅ | 需要 `server.mjs` 在跑（它代理网易云接口） |
| 发布控制台写文章 / 公告 | ✅ | **本机访问时自动视为「站长」**，不用登录；内容会直接写进 `data/` |
| 登录 / 账号 / 论坛发帖 / 联机扫雷 | ❌ | 需要自己配 Auth0（见下文）。不配时论坛会显示「浏览不需要登录」的说明，不会报错 |
| 会员 / 版权受限的网易云曲目出声 | ❌ | 匿名态拿不到音频流，这是站点的设计边界，不是 bug。界面会提示并给出可播放的替代版本 |

> **为什么本地不用登录也能发布？** 因为 `server.mjs` 在没有配置 Auth0 时，
> 会把**来自本机回环地址（127.0.0.1 / localhost）的请求**当成长站，其它来源一律拒绝。
> 所以「能改内容」这件事天然只在你自己的电脑上成立。

### 如果你确实要用账号 / 论坛

需要准备一个 Auth0 应用，然后把三个环境变量给它：

```bash
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=xxxxxxxxxxxxxxxx
OWNER_EMAILS=you@example.com      # 逗号分隔，这些邮箱被认作站长
```

启动后再打开 `/api/health`，`auth.enabled` 会变成 `true`。细节见 [README.md](README.md)
里「账号 / 权限 / 论坛」那一节。

---

## 7. 想改内容

三条路，按省事程度排：

1. **在控制台里写**：打开 <http://localhost:5173/#/admin>，写完点保存。
   内容会直接写进 `data/posts.json`、`data/news.json`，旧文件自动备份到 `data/.backup/`。
2. **直接改 JSON**：`data/posts.json`（文章）、`data/news.json`（公告）、
   `data/gallery.json`（本地插画清单）。改完刷新页面就生效。
3. **批量写作**：把 Markdown 放进 `tools/content/`，然后 `node tools/content-build.mjs`。

想换站名、导航、主题、播放列表等，全部集中在 `src/config/site.config.js` 这一个文件里。

---

## 8. 常见问题

| 现象 | 原因 / 怎么办 |
| --- | --- |
| 页面一片空白，或者提示「必须通过 HTTP 服务器打开」 | 你双击了 `index.html`。必须用 `node server.mjs` 起服务，然后访问 `http://localhost:5173` |
| 浏览器提示「无法访问此网站」 | 跑 `node server.mjs` 的那个终端窗口被关了。重新执行即可 |
| 终端里蹦出一大段 `Error: listen EADDRINUSE: address already in use :::5173`（后面还跟着一串 Node 堆栈） | **5173 端口被别的程序占了**，常见原因是上一次的服务器没关干净，或者你在另一个终端里又开了一次。换个端口就好：`node server.mjs 8080`，然后访问 `http://localhost:8080` |
| 音乐台搜不到歌 / 一直转圈 | ① 确认服务在跑；② 网易云接口本身会限流，过一会儿再试；③ 检查电脑能不能上网 |
| 某首歌点了没声音 | 多半是会员 / 版权受限曲目，匿名态拿不到音频流。界面会给出同名的可播放版本 |
| 相册是空的 | 正常情况下不会（图片已随仓库提供）。若真的空，按 `F12` 看控制台报错，通常是文件没下全，重新 clone 一次 |
| 论坛 / 登录按钮点了没反应 | 没配 Auth0 时刻意隐藏了登录控件，避免给出点不动的按钮。这是预期行为 |
| `node -v` 说自己版本太低 | 装 Node.js 18 或更高；低于 18 时 `fetch` 等 API 不存在，服务起不来 |
| Windows 上说 `node` 不是内部或外部命令 | Node.js 没装好，或装完没重开终端窗口 |

---

## 9. 怎么彻底卸载

没有注册表项、没有后台服务、没有开机自启。

- **停止**：`Ctrl + C`
- **删除**：直接把整个 `fish-temple` 目录删掉
- 如果之前跑过控制台写内容，额外看一眼 `data/.cache/`、`data/.backup/` 这类运行期目录，
  以及 `data/users/`、`data/forum/`、`data/history/`（这几项在仓库里是被忽略的，只在你自己本机生成），
  一起删掉即可

---

## 10. 想让它上公网？

本文只管「跑在自己电脑上」。要真正发布出去，看这两份：

| 你的情况 | 看哪里 |
| --- | --- |
| 想用 Netlify（免费额度、自动 HTTPS、带 Functions） | [README · 部署](README.md#部署) |
| 想搬到自己的云服务器（VPS） | [deploy/README.md](deploy/README.md) —— 含 systemd、Caddy 自动 HTTPS、Docker 与备份 |

两者的区别一句话：Netlify 上函数是只读的、内容存 Netlify Blobs；
自己的 VPS 上 `data/` 是可写的真实文件，改完 `git commit` 就是一次内容更新。

---

## 附：这份指南验证过的范围

写这份文档时，是**真的在一个干净目录里克隆下来、按上面的步骤逐条跑通**之后才写的。
以下是实测记录，不是「应该可以」：

| 验证项 | 结果 |
| --- | --- |
| 全新克隆的体积 | **378.4 MB** |
| 克隆里有没有 `node_modules` | 没有，也**没有执行过 `npm install`** |
| `node server.mjs` | 正常启动并打印站点地址 |
| `/api/health` | `deploy: "local"`、`storage: "fs"`、`writable: true`、`auth.enabled: false` |
| `/`、`/data/album.json`、`/assets/img/album/*.jpg`、`/manifest.webmanifest`、`/src/main.js` | 全部 HTTP 200 |
| 控制台能否直接发布（本机访问） | `POST /api/content/posts` 返回 200，内容写进本地 `data/posts.json` |
| 默认监听范围 | 监听 `::`（所有网卡），局域网内其它设备可访问 |
| 端口被占用时的表现 | 进程退出码 1，终端输出 Node 原始 `EADDRINUSE` 堆栈（已在常见问题里写明怎么处理） |

**没有验证的部分**（别当成保证）：

- **macOS / Linux 上的实际运行**：代码里没有平台特定逻辑，但作者只在 Windows 11 上跑过。
- **配置 Auth0 之后的登录流程**：本文只说明需要哪三个环境变量，没有实测走完注册 / 登录。
- **真实手机打开局域网地址**：只确认了服务器监听所有网卡，没有拿真机连过。
- **Node 18 / 20**：作者在 Node 24 上验证；`package.json` 声明的是 `>=18`。
