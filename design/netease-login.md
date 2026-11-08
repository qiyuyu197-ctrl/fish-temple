# 网易云扫码登录：Folia 怎么做的，网页端为什么必须重做一遍

> 这份文档对应三块代码：`netease-eapi.mjs`（协议层）、`netease-login.mjs`（会话与个人数据）、
> `src/plugins/netease-login.js`（界面）。读的顺序建议也是这个顺序。
>
> 结论先说：**扫码登录本身的协议没有秘密，难点全在"失败时能不能说清原因"和
> "凭据放在哪、谁能拿到"。** Folia 在桌面端把前者做到了极致；后者它不需要解决
> （cookie 就在用户自己的电脑上），而网页端恰恰相反。

---

## 一、Folia 的做法（Electron 桌面端）

Folia 把网易云的第三方 API 包 `@neteasecloudmusicapienhanced/api` 直接跑在**主进程**里，
在 `127.0.0.1` 上起一个本地 HTTP 服务，渲染进程再去调它。围绕这个服务有五层：

### 1. 启动顺序（`electron/neteaseBackend.cjs`）

```
预建 anonymous_token（上游 require 时同步读，缺文件直接 ENOENT 崩掉）
  → 取 util/index 生成 deviceId
  → 用 require.cache 替换 util/request 与 module/login_qr_check
  → 加载上游 main / server
  → start()：port → runtime(cnIp, deviceId) → xeapi-key → anonymous-token → listen
```

两个细节值得抄：

- **必须在任何 `require` 上游之前把临时文件建好。** 上游 `util/request` 在模块加载时
  同步 `readFileSync(os.tmpdir()/anonymous_token)`，文件不存在就是 ENOENT —— 这不是登录失败，
  是整个进程起不来。
- **替换模块必须赶在上游首次 `require` 之前。** 赋值左侧会先求值，所以是
  `const p = require.resolve(x); require(p); require.cache[p].exports = ...`，
  写成一行的 `require.cache[require.resolve(x)].exports = ...` 反而拿不到。
- **并发拉起共用同一个 Promise。** `serveNcmApi` 没有关闭入口，第二次调用会泄漏一个监听端口。

每一段启动都通过 `createStartupRecorder` 记下耗时和错误，失败时状态里带着"卡在哪一步"。

### 2. 请求管线（从外到内）

`neteaseBackend.cjs` 把上游 `util/request` 包了四层，顺序是刻意排的：

```
身份轮换（最外层，只看重试之后的结局）
  → 扫码网络层重试（每一次尝试都单独经过诊断）
    → 来源 IP 策略（不带 X-Real-IP / X-Forwarded-For）
      → 登录请求记录（最内层，记录每一次真正发出去的请求）
        → 上游 request
```

### 3. 扫码本身

- `POST /eapi/login/qrcode/unikey` `{type:3}` → `unikey`
- 二维码内容就是 `https://music.163.com/login?codekey=<unikey>`，用 `qrcode` 包在本地画
- `POST /eapi/login/qrcode/client/login` `{key, type:3}` 轮询：
  `800` 过期 / `801` 等待扫码 / `802` 已扫码待确认 / `803` 成功（响应里带 `Set-Cookie`）

eapi 的加密规则（`util/crypto.js`）：

```
text   = JSON.stringify({...data, e_r, header})
digest = md5(`nobody${url}use${text}md5forencrypt`)
plain  = `${url}-36cd479b6b5-${text}-36cd479b6b5-${digest}`
params = AES-128-ECB(plain, key="e82ckenh8dichen8") → 大写十六进制
```

`header` 里那几个字段（`deviceId` / `os` / `appver` / `osver` / `requestId` / `channel`）
既写进 Cookie，又原样放进 body —— 两边不一致就会被当成指纹不匹配。

### 4. 失败处理：这套东西真正的价值

| 现象 | Folia 的处理 | 为什么 |
| --- | --- | --- |
| 扫码请求连接被重置 | 同一轮**不换身份**，只记"待轮换"；下一次要 `unikey` 前才换 `deviceId` | 一轮里换 deviceId 会把扫码状态弄丢；换了之后同一 IP 通常就能继续 |
| 上游 `login_qr_check` 的 catch 分支引用 try 内变量 | 直接替换整个模块 | 请求一被拒就抛 ReferenceError，server 只能回 `404 Not Found`，真实原因（8821 风控 / 连接重置）全丢 |
| 请求带了伪造 `X-Real-IP` | 只对显式要求 `randomCNIP` 的请求带；其余一律清空 | 上游默认会把 `127.0.0.1` 或随机国内 IP 写进去，和手机扫码时的位置对不上，确认会失败 |
| 扫码某个请求偶发重置 | 扫码两步（要码、轮询）各重试一次，间隔 300ms | 用户贴回的报告里，同一身份前后请求都正常，说明是逐连接的偶发事件 |
| 用户报告"扫了没反应" | 生成诊断报告：后端状态、启动步骤、登录请求记录、身份、最近连接 | 没有这个，只能猜 |

### 5. 凭据去向

`803` 响应里的 `Set-Cookie`（`MUSIC_U` 等）被渲染进程存下来，后续请求带上。
桌面端里"凭据在用户自己电脑上"是默认成立的 —— 这正是网页端不能照抄的地方。

---

## 二、网页端为什么不能照抄

| 前提 | Folia（桌面） | 本站（网页） |
| --- | --- | --- |
| 谁在登录 | 本机用户 | 任何访问者 |
| cookie 存哪 | 用户自己的磁盘 | 服务器（要按人分开） |
| 多实例 | 单进程 | Netlify 可能每次请求落在不同实例 |
| 出事影响谁 | 本机用户的账号 | 所有把账号交进来的人 |
| 出口 IP | 用户家宽 | 机房 IP（更容易被风控） |

所以网页端多出来四件事，Folia 一件都不用做：

1. **先有本站身份（Auth0）**，否则服务器就是一个"谁都能用的网易云代理"。
2. **cookie 落库、按 sub 隔离、加密存储、永不下发浏览器。**
3. **扫码状态不能只放内存**（多实例）。我们用 HMAC 签名的 state 把
   `sub + deviceId + key + 过期时间` 钉在一起，服务端**不存任何扫码会话**。
4. **默认只对站长开放。** 第三方登录可能触发网易云风控（README 里引过 YesPlayMusic /
   SPlayer 的公告），这个风险应该由愿意承担的人自己选，而不是默认摊给每个来访者。

---

## 三、本站的实现

### 文件分工

| 文件 | 职责 | 对应 Folia 的哪一块 |
| --- | --- | --- |
| `netease-eapi.mjs` | eapi 加密、请求、Cookie 编解码、错误归一化、节流 | `util/crypto.js` + `util/request.js` |
| `netease-login.mjs` | 扫码状态机、state 签名、绑定存储与加密、个人数据 | `neteaseBackend` + `neteaseLoginIdentity` + 诊断 |
| `netease-qr.mjs` | 二维码编码（byte 模式 / v1–10 / L·M）→ SVG | 上游的 `qrcode` 包 |
| `src/plugins/netease-login.js` | 音乐台里的状态带 + 扫码面板 + 歌单/推荐 | 渲染进程的登录界面 |

### 状态机

```
GET  /api/netease/login/qr          → unikey + SVG + 签名的 state
GET  /api/netease/login/qr/check    → waiting | scanned | confirmed | expired | risk | network | error
confirmed 时：Set-Cookie → 只留 4 个字段 → 加密 → 写 netease-auth/<sha1(sub)>
```

`800/801/802/803` 是**正常状态**，不当错误处理；只有 `8821`（风控）才需要人去做行为验证。
网络失败会重试一次，仍失败就回 `network` 让前端继续轮询几次 —— 比把人踢回第一步体验好得多。

### 存储与加密

- 本地：`data/netease-auth/<hash>.json`；线上：Netlify Blobs 同一个 key 规则。
- cookie 用 **AES-256-GCM** 加密，只保留 `MUSIC_U / __csrf / MUSIC_A / NMTID`。
- 密钥优先取 `FT_COOKIE_KEY`；没配就在存储里生成一把随机密钥（`netease-meta/secret`）。
  **诚实说明**：密钥和密文在同一个 store 里，防的是备份/日志/截图泄露，不防"整个存储被拿走"。
  线上多实例部署请务必配 `FT_COOKIE_KEY`。
- 解绑 = 直接删掉那条记录，不做软删除。

### 能做什么

| 能力 | 接口 | 说明 |
| --- | --- | --- |
| 我的歌单（含私密） | `/api/netease/login/playlists` | 匿名接口拿不到的那部分 |
| 我喜欢的音乐 | `/api/netease/login/playlist?id=` | `specialType=5` 那条歌单 |
| 每日推荐 | `/api/netease/login/recommend` | 按账号算，不是公开榜单 |
| 红心 / 取消 | `POST /api/netease/login/like` | 写操作，只影响自己账号 |
| 诊断 | `/api/netease/login/diagnostics` | 仅站长，不含 cookie |

### 明确不做

- **不拿登录态去取 VIP 音频流。** 登录只解锁"属于你的数据"，播放仍走匿名可用的同源直放。
  这条边界没变，`/api/netease/audio` 的代码一行没动。
- **不上报播放记录（scrobble）。** 需要另一个接口族，而且"写进别人账号"的操作应该单独讨论、
  单独开关。
- **不把 cookie 回显给前端**，也不写日志。

### 3.4 云盘：唯一"用登录态取音频"的地方

云盘（`/api/v1/cloud/get`）只认登录态：列表、详情、播放地址，匿名一律拿不到。
它和 VIP 曲目的性质完全不同 —— **云盘里是用户自己上传的文件**，不涉及版权方的付费档，
所以这里可以用登录态取原始音频，但仍然加了三条约束，防止它变成通用后门：

1. **只认云盘 id**：播放前先 `/api/v1/cloud/get/byids` 精确查一次，不在你云盘里的 id 一律 403。
   没有这一步，`/login/audio?id=任意会员曲目` 就成"拿站长 cookie 换任意音频"了。
2. **只走 `weapi`**：上游给云盘接口指定的加密方式就是 weapi（AES-CBC 双层 + RSA 无填充），
   eapi 不认。`netease-eapi.mjs` 里因此补了 `weapiRequest`。
3. **音频 URL 带签名**：`<audio src>` 是浏览器自己发的请求，**带不上 Bearer 令牌**。
   列表接口把「sub + 歌曲 id + 30 天过期」用同一把 HMAC 密钥签进 URL；
   音频端点只认签名（或回落本站 Bearer）。解绑后签名仍在，但读不到绑定 → 403。

码率请求 `br=999000`：云盘放的是**上传者自己的文件**，不存在"免费档/付费档"的区分；
128k 那条限制只针对版权曲目（见 README 的「码率规则」）。

**云盘曲目必须绕开匿名探测**（2026-10-25 实机踩到）：音乐台有个 `checkSound()`，
拿 `/api/netease/playable` 判断"匿名访客能不能播"。云盘歌匿名必然 `false`，于是它会
给曲目打上 `embedOnly = true`，播放器切成官方 iframe —— 而 iframe 对云盘同样放不出来。
结果就是**没声音、没报错、界面还显示在播**。现在：

- `checkSound()` 遇到 `cloud` 曲目直接返回，不做判断；
- `Player.resolveProviderId()` 对 `cloud` 曲目永远选直放（`embedOnly` 对它没有意义）；
- 进音乐台时用 `/api/netease/login/cloud/urls` 统一换新签名，并顺手清掉历史遗留的 `embedOnly`。

**云盘匹配要按 id 全量做，不能只看 `cloud` 标记**：云盘里的歌也会出现在普通歌单 /
「我喜欢的音乐」里（实测 8 首云盘歌同时出现在该用户的喜欢列表，id 完全相同）。
从歌单导入走的是普通 `toTrack`，没有 cloud 标记、没有签名地址 —— 播放器把它当匿名曲目，
照样没声。所以 `refreshCloudUrls()` 现在拉一次云盘列表，按 id 把**任何**匹配的曲目改成
云盘曲目；导入歌单后也会强制跑一次。

**启动时的时序坑**：`Player.setTracks()` 会立刻 `prepare(0)`，那时云盘匹配还没跑完，
`<audio>` 可能先被设成匿名地址（404 → `MediaError 4`）。等云盘标记补上、`track.src`
换成签名地址后，**元素不会自己跟着换**；而点列表里"当前这一行"走的是 `toggle()`，
不是重新 `prepare()` —— 于是怎么点都没声。修法两处：

- `Player.play()` 播放前对 `getAttribute('src')` 与来源算出的地址做一次比对，不一致就重设；
  元素处于错误态时显式 `load()` 重试；
- `Player.toggle()` 遇到 `audio.error` 时改为重新 `prepare()`（而不是"暂停"）；
- 云盘匹配改写了当前曲目时，立即按新地址 `prepare()` 一次。

缓存：列表 3 分钟、归属检查 5 分钟、播放地址 10 分钟 —— 都是为了"反复点同一首不重复打上游"。

### 3.6 会员曲目：用绑定账号自己的会话（2026-10-25 追加）

站主明确要求"我有会员，为什么站里听不了"，于是这里做了一次**边界调整**，而不是悄悄放开。

**默认关闭**：账号状态带的「设置」里有「用这个账号播放会员曲目」的勾选（localStorage['ft.terminal.neteaseUseLoginAudio']）。
不勾选时，匿名体验与以前完全一致；勾选后才走下面这套。这样做也保住了自检的确定性 ——
套件默认按匿名契约跑，不该因为服务器上恰好有个绑定就变红。

- **只对绑定者本人**：`POST /api/netease/login/urls` 签出「kind + sub + 歌曲 id + 30 天」，
  音频端点再读一次绑定。别人的 token 拿到也放不了，匿名访客完全不受影响。
- **不伪造权限**：走 v1 接口的 `level` 档位，账号是什么权限就拿什么档位；
  失败后照样回退官方播放器。
- **触发方式**：`provider.onError` 里对非云盘曲目先试一次登录态（60 秒冷却），
  成功就换地址重播；`checkSound()` 在"已绑定"时不再给会员曲目打 `embedOnly`，
  否则它会在播放前就被判死、切到 iframe。
- **风险**：第三方客户端使用会员流有被风控的可能；这是站主用自己的账号做的取舍。

**音质：照 Folia 的 `level` 方案重做了一遍。** 第一版只发 `br=999000`，能响就行；
Folia 的渲染进程用的是
`/song/url/v1?id=…&level=…`（默认 `exhigh`，可选 `standard / exhigh / lossless / hires`），
由服务端按账号权限决定实际档位。我们照这个改成：

- `resolveTrackAudio(identity, id, { level })` 走 **v1 接口**，档位写进签名（改 URL 无效）；
- **逐级降级**：请求的档位拿不到就往下试（hires → lossless → exhigh → standard）；
- 返回里带 `level`，`X-Netease-Audio-Via` 显示 `login@lossless` 这种实际档位；
- 没抄 `randomCNIP=true`（不伪造来源 IP）；`https=true` 用我们自己的白名单升级代替。

匿名路径 `/api/netease/audio` 一行没改：仍然只问免费档，拿不到就 404。

### 3.5 实机踩坑（2026-10-25）：扫码被风控拦下

第一次真机扫码，手机弹出「检测到当前设备环境异常 / 本次操作已拦截」，而服务端事件环里
从头到尾只有 `801 等待扫码` —— **App 在确认那一步就拦了，根本没把"已扫码"告诉服务端**。

第一轮修了三件"自己造成的问题"：deviceId 每次换新、NMTID 没带回去、手快连点。
结果**再扫还是被拦**。于是回去逐行对 Folia 的真实请求（不是看它调哪个接口，而是看它
**发出去的字节**），差别集中在 `util/request.js` 的 `processCookieObject`：

| 项 | Folia 实际发的 | 我们第一版发的 |
| --- | --- | --- |
| 设备画像 | `os=pc`、`appver=3.1.17.204416`、`osver=Microsoft-Windows-10-...`（上游 `osMap.pc` 默认） | 自编的 `os=iPhone OS`、`appver=9.0.90`、`osver=16.2` |
| Cookie | `_ntes_nuid`、`_ntes_nnid`、`WNMCID`、`WEVNSM`、`__remember_me`、`ntes_kaola_ad` + 设备画像 | 只有 `deviceId` 等少数几项 |
| body 里的 header | 上面那套的子集 + `MUSIC_A` / `MUSIC_U` / `NMTID` | 同左，但没有 `MUSIC_A` |
| 匿名账号 | 启动时 `register_anonimous`（xeapi）→ `MUSIC_A`，之后每个 eapi 请求都带 | 没有这一步 |
| UA | 仍然是 **iPhone UA**（尽管 os 写的是 pc） | iPhone UA |

也就是说：我们发的请求是"一台从没装过 App、没有匿名身份、每 30 秒换一台机器"的设备。
官方客户端、以及所有基于上游包的客户端，发的是"一台装过 App、有匿名账号、设备 ID 稳定"的机器。

**补上的东西**（都在协议层，业务层不用改）：

1. `createIdentity()` 现在会补全 `_ntes_nuid / _ntes_nnid / WNMCID / WEVNSM / __remember_me /
   ntes_kaola_ad`，并按 `OS_PROFILES.pc` 声明设备画像（和上游默认一致）；
2. 这些字段和 deviceId 一起存进 `netease-meta/device`，跨请求、跨重启都稳定；
3. **xeapi 匿名注册**：`netease-eapi.mjs` 里实现了 X25519 密钥协商 + HKDF + AES-128-GCM +
   C/S/R 封装，用 `/api/bsr/sk/get` 拿服务端公钥、`/xeapi/register/anonimous` 注册，
   得到 `MUSIC_A` 后缓存进 `netease-meta/anonymous`；
4. `identityFor(store, cookie)` 统一出口：有 `MUSIC_U` 就不带 `MUSIC_A`，没有就补上匿名身份；
5. 要码与轮询用**同一份身份**（含同一轮 NMTID），设备变了二维码直接作废。

注册匿名账号这一步会被**按出口 IP 节流**：连续注册几次之后网易云回 `{"code":400}`，
换 deviceId / 换身份 cookie 都一样。所以失败后安静 10 分钟（`ANON_FAIL_COOLDOWN_MS`），
这段时间用"没有 MUSIC_A 的身份"照常扫码 —— 它是加分项，不是前置条件。

**仍然可能被拦**：这是网易云对第三方登录的策略，指纹一致只是把"看起来像机器人"这条
排除掉，不能保证对方一定放行。账号一旦进了风控状态（提示里写着 24H），换什么指纹都
要等。所以补了一条**备用通道**：粘贴浏览器里的 `MUSIC_U`（见 `bindByCookie`）。
它绕开了"扫码确认"这个风控点，但 `MUSIC_U` 本身就是完整登录态，比扫码会话更敏感 ——
所以端点会先调 `account/get` 验证，验证不过直接 401，绝不入库。

> 这一节留着是为了提醒后来人：**协议对 ≠ 能登录**。识别一个二维码只要几毫秒，
> 但让对方的风控相信"这是一台正常设备"需要一整套指纹一致性 ——
> 设备 ID、身份 cookie、匿名账号、指纹跨请求稳定，缺一项都可能前功尽弃。

---

## 四、从 Folia 还能学什么（这次没做）

按"值得做 / 成本"排序：

1. **封面本地缓存**（`localCoverAssets.cjs`）：站点的封面现在每次从网易云 CDN 拉。
   本地缓存 + 内容哈希命名，弱网下首屏会明显稳。
2. **播放记录上报**（scrobble）：`/api/feedback/weblog`，需要用户显式开关 + 失败静默。
   做了之后"听歌计入自己账号"才成立。
3. **诊断导出**：Folia 是把报告写进剪贴板让用户贴给开发者。本站可以做一个
   "复制诊断"按钮，把 `/api/netease/login/diagnostics` 的 JSON 复制走。
4. **音频分析**（BPM / 接歌点，`analysis/` + `beat_this`）：对应站点的自动接歌。
   成本高（模型 + wasm），收益在"连续混音"这种场景，不急。
5. **主题生成**（`generate-theme` + AI）：站点已有主题系统，但按封面生成配色属于锦上添花，
   而且会把第三方 API key 带进服务端。

---

## 五、风险与边界（给未来的自己看）

- 第三方登录可能触发网易云风控，**默认只给站长**，文案里写清楚，别偷偷放开。
- 机房 IP 比家宽更容易被拒。扫码失败时先看 `/diagnostics` 里的事件环：
  `unikey` 失败通常是 IP/风控，`check` 停在 801 是没人扫，跳到 `risk` 就是 8821。
- cookie 过期（网易云那边失效）表现为后续接口 `code=301`，我们统一翻成 HTTP 401，
  前端把面板打回"扫码"这一步。
- 这套接口是未公开的，随时可能变。所有 eapi 调用都集中在 `netease-eapi.mjs`，
  真变了只改一个文件。
