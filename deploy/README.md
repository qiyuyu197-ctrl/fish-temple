# 搬到自己的云服务器（VPS）

这份文档的目标是：**照着敲就能把站点跑在你自己的服务器上**，并且知道数据在哪、怎么备份、出事怎么查。

- 默认路径：**Ubuntu 22.04 / 24.04 + systemd + Caddy（自动 HTTPS）**
- 备选路径：**Docker / docker-compose**（见文末「第二种做法」）
- Netlify 那条通道**保留不动**（`netlify/` 目录与 `netlify.toml` 都不需要改），可以两边并存做备用

> 先记住三件事，后面所有步骤都围绕它们：
> 1. **站点零依赖** —— 不需要 `npm install`，只要一个 Node 20+。（唯一的 npm 依赖 `@netlify/blobs` 只在 Netlify 上被动态引入，VPS 上根本不会加载它。）
> 2. **数据是文件** —— 线上的 Netlify 版把内容存在 Netlify Blobs；VPS 版存在仓库下的 `data/`（可改到别处）。存储驱动是**自动切换**的，同一条命令、同一份代码。
> 3. **VPS 上"改内容"必须登录** —— 本机（loopback）访问时内容写入免登录；一旦从公网进来，就必须是站长账号（Auth0）才能改。所以 **Auth0 那三项环境变量必须配好**，否则你只能浏览、不能发布。

---

## 0. 前置条件

| 需要什么 | 说明 |
|---|---|
| 一台 VPS | **1 核 1G 就够**（纯静态托管 + 轻代理；内存占用主要在 Node 本身）。系统盘 20G+，因为相册图片会占空间 |
| **一个你自己的域名** | 必填。HTTPS 与 Auth0 回调都要求域名，`http://<IP>:5173` 这种形式无法登录（Auth0 不接受 IP 作为回调） |
| DNS | 一条 **A 记录**把你的域名（或其子域）指向服务器公网 IP |
| 防火墙 | 放行 **80** 与 **443**（Caddy 申请证书用 80，正式流量走 443）。应用端口 5173 **不要**对公网开放 |
| 一个 Auth0 应用 | 类型 **Single Page Application**。若你之前已经为 Netlify 建过，可以直接复用同一个应用，只需**追加**新域名 |

---

## 1. 装 Node 20+

二选一：

**（A）NodeSource（系统级，推荐服务器用）**

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v      # 应显示 v20.x 或更高
which node   # 记下这个路径，多半是 /usr/bin/node，systemd 里要用
```

**（B）nvm（装到某个用户下，适合你不想动系统包）**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
which node   # 会类似 /home/<你>/.nvm/versions/node/v20.x/bin/node
```

> ⚠️ 用 nvm 的话，systemd 里不能只写 `node`（它不在 systemd 的 PATH 里），要写**绝对路径**，
> 例如 `ExecStart=/home/fish/.nvm/versions/node/v20.18.0/bin/node server.mjs`。

---

## 2. 建专用用户，把仓库放上去

**不要用 root 跑应用。** 建一个没有登录 shell 的系统用户：

```bash
sudo adduser --system --group --home /srv/fish-temple --shell /usr/sbin/nologin fish
sudo mkdir -p /srv/fish-temple
sudo chown -R fish:fish /srv
```

拉代码（二选一）：

```bash
# 方式一：git clone（推荐，后面能 git pull 更新）
sudo -u fish git clone https://github.com/qiyuyu197-ctrl/fish-temple.git /srv/fish-temple

# 方式二：从你本机 rsync（仓库已经是最新、或你改了没推）
#   在你自己的电脑上执行（Windows 可用 WSL / Git Bash）：
#   rsync -av --delete --exclude '.git' --exclude 'data/.cache' \
#     ./fish-temple/ fish@<服务器IP>:/srv/fish-temple/
```

**不需要 `npm install`。** 只有在一种情况下才需要：你打算在 VPS 上跑 `tools/` 里那些自检脚本，
它们里的 Node 脚本同样零依赖；真正需要装依赖的只有"用 Netlify 的 Blobs 驱动"这一件事，而 VPS 上不会走那条路。

---

## 3. 配环境变量

```bash
sudo cp /srv/fish-temple/deploy/fish-temple.env.example /etc/fish-temple.env
sudo nano /etc/fish-temple.env          # 改成你的真实值
sudo chown root:root /etc/fish-temple.env
sudo chmod 600 /etc/fish-temple.env     # 里面有邮箱与 client id，别让其他用户读到
```

三个**必填**（Auth0）项的意义：

| 变量 | 说明 |
|---|---|
| `AUTH0_DOMAIN` | Auth0 应用页上的 **Domain**。**只填域名**，不要 `https://`，不要末尾斜杠 |
| `AUTH0_CLIENT_ID` | 应用页上的 **Client ID**（不是 Client Secret，Secret 用不着） |
| `OWNER_EMAILS` | 站长邮箱白名单（逗号分隔）。**只有在这里、且该邮箱在 Auth0 已验证**，才会被认成站长 |

不配会怎样：站点照常浏览，`/api/auth/config` 报 `enabled:false`，顶栏不显示登录入口，
**你在 VPS 上就改不了内容**（公网来源不是 loopback，写入会被拒 401/501）—— 所以这一步别跳。

> 关于"本机免登录"的准确说法（烟测实测过）：**只有没配 Auth0 时**，来自 loopback 的写入才免登录
> （那是给本地开发用的）。**一旦配了 Auth0，任何来源的写入都要站长令牌** —— 烟测里从
> `127.0.0.1` 和局域网 IP 写公告都是 `401`。对 VPS 来说这是更安全的默认值，不用去改。

---

## 4. 装 systemd 服务

```bash
sudo cp /srv/fish-temple/deploy/fish-temple.service /etc/systemd/system/fish-temple.service
# 如果你的 Node 不在 /usr/bin/node（例如用 nvm 装的），先改这一行：
sudo nano /etc/systemd/system/fish-temple.service     # 改 ExecStart 与（如需要）User/WorkingDirectory
sudo systemctl daemon-reload
sudo systemctl enable --now fish-temple
systemctl status fish-temple --no-pager      # 应显示 active (running)
journalctl -u fish-temple -n 30 --no-pager   # 看启动日志
```

本机自测（**别用 curl 测公网**，先在服务器内部确认应用是活的）：

```bash
curl -s http://127.0.0.1:5173/api/health | head -c 300
# 期望能看到 "deploy":"local" 与 "storage":"fs"
```

`deploy/fish-temple.service` 里已经写好的要点：

- `User=fish` / `WorkingDirectory=/srv/fish-temple` / `EnvironmentFile=/etc/fish-temple.env`
- `Environment=HOST=127.0.0.1`：**只监听本机**，公网必须经 Caddy。想让局域网直连就把这行删掉
  （`server.mjs` 默认绑所有网卡，它认 `HOST` 与 `PORT` 两个环境变量）
- `Restart=always`：崩了自动拉起
- 加固项（`NoNewPrivileges` / `PrivateTmp` / `ProtectSystem=full` / `ProtectHome` …）：
  它们**不影响** `data/` 的写入（`ProtectSystem=full` 只把 `/usr` `/boot` `/etc` 变只读），
  另外用 `ReadWritePaths=/srv/fish-temple/data` 显式声明可写目录
- 日志走 journald：`journalctl -u fish-temple -f` 实时看

---

## 5. 装 Caddy（自动 HTTPS）

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

sudo cp /srv/fish-temple/deploy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile        # 把第一行的域名换成你的
sudo systemctl reload caddy
journalctl -u caddy -n 30 --no-pager  # 看证书申请是否成功
```

`deploy/Caddyfile` 做了三件事：自动申请/续期证书、反代到 `127.0.0.1:5173`、把真实
`Host` / `X-Forwarded-For` / `X-Forwarded-Proto` 传给应用。**为什么要保留真实 Host**：
应用会用它拼回调与判断来源，转发成 `localhost` 会导致登录回跳、分享链接都指向错误地址。

验证（这时应该已经能通过域名访问了）：

```bash
curl -I https://<你的域名>/
curl -s https://<你的域名>/api/health | head -c 200
```

---

## 6. 在 Auth0 里加上新域名（否则登录会失败）

Auth0 → 你的应用 → **Settings**：

| 字段 | 追加的内容 |
|---|---|
| Allowed Callback URLs | `https://<你的域名>/`（**含末尾斜杠**） |
| Allowed Logout URLs | `https://<你的域名>/` |
| Allowed Web Origins | `https://<你的域名>`（**不带**末尾斜杠） |

保存后，在站点上点「登录」实测一次。**注意**：Auth0 的免费版对 Allowed URLs 数量有上限
（早期是每个字段若干条），如果提示超限，可以把已不用的地址（例如旧的预览域名）删掉。

另外两个容易踩的点：

- 站点的登录是**我们自己的邮箱面板 + Auth0 输密码**（PKCE）。密码不经过我们的服务器，所以
  VPS 上**不需要**任何 Auth0 的密钥/Client Secret。
- 站长权限要求 `email_verified === true`。新注册的邮箱要去点验证邮件；没验证就只是普通用户。

---

## 7. 数据与备份（**这一节最重要**）

VPS 版的**唯一真实数据源**是 `data/`：

```
data/
├── posts.json / news.json / gallery.json / album.json   # 公告、文章、插画清单、相册清单
├── users/<哈希>.json      # 账号资料（邮箱、昵称、头像、角色）—— 含个人数据
├── forum/<id>.json        # 论坛帖（正文、作者快照）
├── forum-index.json       # 论坛列表索引（派生数据，可重建）
├── history/<哈希>.json    # 每个账号的站内播放历史 —— 个人数据
├── .backup/               # 服务器写入内容时的自动备份（最多 20 份/集合）
└── .cache/                # Pixiv 图片磁盘缓存（纯缓存，随时可删）
```

`.gitignore` **已经挡住** `data/users/`、`data/forum/`、`data/history/`、`data/forum-index.json`、
`data/.backup/`、`data/.cache/` —— 这些是运行期数据（含邮箱与个人收听记录），
**千万不要**手动 `git add -f` 提交进这个公开仓库。

**备份（建议每天一次）**

```bash
sudo mkdir -p /var/backups/fish-temple
# 一行搞定：打包 data/，排除缓存，按日期命名
sudo tar czf /var/backups/fish-temple/data-$(date +%F).tar.gz \
  -C /srv/fish-temple --exclude='data/.cache' data
# 只留最近 14 份
sudo find /var/backups/fish-temple -name 'data-*.tar.gz' -mtime +14 -delete
```

放进定时任务（`sudo crontab -e`）：

```cron
15 4 * * * tar czf /var/backups/fish-temple/data-$(date +\%F).tar.gz -C /srv/fish-temple --exclude='data/.cache' data && find /var/backups/fish-temple -name 'data-*.tar.gz' -mtime +14 -delete
```

想更稳就再 `rsync` 一份到别处（对象存储/NAS/另一台机器）：

```bash
rsync -av --delete /srv/fish-temple/data/ user@backup-host:/backups/fish-temple/data/
```

仓库里还附了 `deploy/backup.sh`，就是上面这套的可执行版本（含保留份数、可选 rsync 目标），
可以直接 `sudo cp deploy/backup.sh /usr/local/bin/fish-temple-backup && sudo chmod +x /usr/local/bin/fish-temple-backup` 后用。

**恢复**

```bash
sudo systemctl stop fish-temple
sudo tar xzf /var/backups/fish-temple/data-2026-10-10.tar.gz -C /tmp/restore
sudo rsync -av /tmp/restore/data/ /srv/fish-temple/data/
sudo chown -R fish:fish /srv/fish-temple/data
sudo systemctl start fish-temple
```

> 更细的"反悔"手段：`data/.backup/` 里是每次写入内容集合时自动留的旧版本，
> 想回滚某一次改动可以直接把对应文件拷回去。

---

## 8. 从 Netlify 搬过来的注意事项

这是最容易误判的一点：

- **仓库里的 `data/*.json`（公告、文章、相册清单）会照旧生效** ✓
- **线上存在 Netlify Blobs 里的东西，不在仓库里** ✗ —— 包括：**论坛帖、账号资料（昵称/头像）、
  站内播放历史**。换到 VPS 后这些以仓库里的 `data/` 为起点，等于**从零开始**：
  你需要重新发帖、重新设置昵称/头像；播放历史本来就在各自浏览器里（登录后会重新累积）。
- 如果你一定要把 Blobs 里的数据搬过来：现在没有导出接口，需要临时加一个（在 Netlify 函数里
  遍历 `forum/`、`users/`、`history/` 前缀再把 JSON 拉下来），属于一次性工作，**不在本文档范围内**。
- 两边**同时对外服务**会造成困惑：同一个站点的内容却各不相同（Netlify 用 Blobs、VPS 用文件）。
  建议：**只对外宣称一个地址**，另一个留作备用（例如 Netlify 继续用它的预览部署通道做灰度）。

---

## 9. 日常更新与回滚

```bash
# 更新
cd /srv/fish-temple
sudo -u fish git pull
sudo systemctl restart fish-temple
curl -s http://127.0.0.1:5173/api/health | head -c 120     # 确认起来了

# 回滚到上一个提交
sudo -u fish git log --oneline -5          # 找到要回去的提交
sudo -u fish git checkout <旧提交哈希>
sudo systemctl restart fish-temple
# 想回到最新：sudo -u fish git checkout main && sudo -u fish git pull
```

> 静态站没有"构建"步骤，所以更新就是 `git pull` + 重启；**数据不会被覆盖**（`data/` 不在版本控制里）。

---

## 10. 故障排查

| 现象 | 先看这里 |
|---|---|
| 502 / 页面打不开 | `systemctl status fish-temple --no-pager`、`journalctl -u fish-temple -n 50 --no-pager` |
| 应用没起来，日志说端口占用 | `sudo ss -lptn 'sport = :5173'`；确认没有第二个实例；或改 `/etc/fish-temple.env` 里的 `PORT` 并同步改 Caddyfile |
| 本机 curl 通、域名不通 | Caddy：`journalctl -u caddy -n 50 --no-pager`；DNS 是否已生效（`dig +short <你的域名>`）；80/443 是否放行 |
| Caddy 申请证书失败 | 域名 A 记录没指对 / 80 被运营商或防火墙挡 / 开了 Cloudflare 代理但没配好。（临时可用 `tls internal` 自签测试，但浏览器会警告） |
| 登录后跳回站点仍显示未登录 | Auth0 的 Callback/Web Origins 是否**精确**包含 `https://<你的域名>/`（末尾斜杠！）；浏览器控制台看是否有 CORS 报错 |
| 能登录但改不了公告 | 你的邮箱是否在 `OWNER_EMAILS`、且 Auth0 里已验证（账号菜单应显示「站长 OWNER」） |
| 上传头像后刷新就没了 | `data/` 是否可写：`sudo -u fish touch /srv/fish-temple/data/.wtest`；检查 systemd 的 `ReadWritePaths` 与目录属主 |
| 磁盘被占满 | `du -sh /srv/fish-temple/data/*`；`data/.cache/` 是图片缓存，可安全删除 |
| 想临时停服 | `sudo systemctl stop fish-temple`；永久停用 `sudo systemctl disable --now fish-temple` |

**健康检查**（可接到你的监控/短信告警）：`GET /api/health` 返回 JSON，关键字段
`deploy:"local"`（说明跑的是本机 server.mjs）、`storage:"fs"`（文件驱动）、`writable:true`（数据目录可写）。

---

## 第二种做法：Docker / docker-compose

如果你更喜欢容器（`deploy/Dockerfile`、`deploy/docker-compose.yml` 都已备好）：

```bash
cd /srv/fish-temple
sudo cp deploy/fish-temple.env.example deploy/fish-temple.env   # 改成真实值（这个文件别提交）
sudo docker compose -f deploy/docker-compose.yml up -d --build
sudo docker compose -f deploy/docker-compose.yml logs -f
```

要点（也是注释里写明的）：

- 镜像基于 `node:20-alpine`，**不执行 `npm install`**（零依赖），以 `USER node` 运行；
- **`data/` 必须挂成 volume**（compose 里已挂 `../data:/app/data`）——
  容器内文件系统是临时的，不挂就等于每次重启丢论坛帖、账号资料、播放历史；
- 端口默认只映射到 `127.0.0.1:5173`，**前面仍然用 Caddy 反代**（TLS 交给 Caddy，证书续期它自动做）；
- 环境变量走 `env_file`（默认复用 `/etc/fish-temple.env`，与 systemd 路径一致，少一处配置漂移）；
- 升级：`git pull` → `docker compose ... up -d --build`。

---

## 附：这套部署的"已验证 / 未验证"边界

**已实测**（在开发机上用**假 Auth0 值** + `FT_DATA_DIR` 临时目录 + **5195** 端口跑的真实 smoke，
命令与输出见本次提交说明；这些是"应用行为"，不是"服务器行为"）：

- `netstat` 确认监听在 **`0.0.0.0:5195`（所有网卡）**，并且用本机局域网 IP
  （`http://192.168.1.6:5195/api/health`）访问返回 **200** —— 证明不是只绑 `127.0.0.1`；
- `/api/health`：`deploy:"local"`、`storage:"fs"`、`writable:true`（说明走的是文件驱动、数据目录可写）；
- `/`、`/api/forum/posts` 均 200；`/api/auth/config` 用假值时返回 `enabled:true` + 假域名/假 clientId
  + `ownerConfigured:true`（**仅用于验证读取路径，不是真实 Auth0 配置**）；
- **写内容被拒**：配了 Auth0（假值）之后，从 **局域网 IP** 与 **127.0.0.1** 写 `/api/content/news`
  都是 **401** —— 即"配了 Auth0 就必须站长身份"，与是否 loopback 无关；
- 静态文件缓存头：本地 `node server.mjs` 对 `/`、`/data/album.json`、`/styles/base.css` 都回
  `Cache-Control: no-cache`（**如实记录**：本地不做长缓存；Netlify 上有自己的 CDN 规则，那是另一套）；
- 跑完已停服务、删临时数据目录。

**未验证**（需要真实 Linux 服务器才能验，这里只保证文档与资产按标准写法给出）：

- **收到 `SIGTERM` 的优雅退出**：代码已实现（停止接收新连接 → 等在途请求收尾 → 最多 8 秒强制退出），
  但开发机是 Windows，`Stop-Process` 是强杀、发不出 `SIGTERM`，所以这条**只做了代码审查 + `node --check`**；
- Caddy 的真实证书申请与续期、HTTP→HTTPS 跳转；
- 真实域名下的 Auth0 回调、登出跳转；
- systemd 单元在 Linux 上的实际行为（本文档在 Windows 上编写，`systemd-analyze verify` 都没跑过）；
- Docker 镜像的构建与运行（本机没有 Docker 守护进程）。
