# 琉璃主题（liuli）采纳记录 v1

> 来源：
> · [LilycleHeart/dsh-liuli-ui-enhance](https://github.com/LilycleHeart/dsh-liuli-ui-enhance)（DSH 客户端主题插件，琉璃的原始实现，TS + React）
> · [LilycleHeart/qqnt-liuli-theme](https://github.com/LilycleHeart/qqnt-liuli-theme)（把琉璃移植到 QQNT 的插件，纯 DOM/CSS，是上者的精简提炼）
>
> **只借算法与配方参数，不拷代码、不引依赖** ✓ —— 两个仓库的实现都绑在各自的宿主上
> （一个改 DSH 的 React 组件与 `--dsw-alias-*` 令牌，一个用 592 条选择器硬打 QQ 的 DOM），
> 搬不过来也不该搬。本站的写法全部按鱼庙自己的令牌体系重写。
>
> 这份文件是「为什么这么做」的记录。改琉璃之前先读它。

---

## 一、定位：加一套主题，不动现有五套

琉璃和鱼庙原本的视觉是**两种语言**：

| | 鱼庙（endfield 工业风） | 琉璃（M3 × Fluent 2） |
|---|---|---|
| 形状 | 全局零圆角、切角 | 14 / 10 / 7 / 999 圆角阶梯 |
| 底色 | 奶油纸 `#EFEDE6` 实底 | 壁纸 + 半透明亚克力 |
| 强调 | 信号黄 `#FFD400` 固定 | 从壁纸取色，每张图都不一样 |
| 纹理 | 全屏颗粒 `.grain` + 扫描线 | 噪点只进材质内部，绝不铺全屏 |

所以琉璃是**独立的一条主题线**：`site.config.js` 里 `THEMES`（纯色五套）与 `LIULI_THEMES`
（`liuli` 夜 / `liuli-day` 昼）是两份列表，`ALL_THEMES` 只是给 `Theme.set()` 解析 id 用的。
**两条线互不干扰**（这是站主第二轮反馈的核心）：

| | 顶栏主题按钮 `#themeBtn` | 顶栏水滴 `#liuliBtn` | 命令面板「主题」组 |
|---|---|---|---|
| 循环范围 | 只在纯色五套里 | 只在琉璃两档里（夜 ⇄ 昼） | 只列纯色五套 |
| 进出琉璃 | 按一下就从琉璃回到「上次那个纯色的下一套」 | 从别的主题点进来 → 回到上次待的琉璃那一档 | — |

（第一版把两套琉璃塞进同一个 `THEMES` 循环，结果进/出琉璃都要点七八下，
而且命令面板的「主题」列表里混着琉璃 —— 站主明确要求分开。）

全部规则关在 `html[data-theme^="liuli"]` 里。其它五套主题一个字节都不受影响 —— 这条已实测（见第十节）。

明确不做 ✗：
- 不改 `paper / night / blueprint / matcha / sakura` 的任何取值
- 不把琉璃变成默认主题（默认仍是 `paper`）
- 不引入 Material Color Utilities（103KB）—— 见第三节
- 不做 dock shell、内嵌浏览器、系统音频回环（那是 DSH 客户端插件的能力，网站上无意义）

## 二、琉璃效果拆开是 6 件事，我们各做了什么

| 原项目的做法 | 本站落地 | 位置 |
|---|---|---|
| ① 全屏壁纸层 `fixed; inset:0; z-index:-1`，挂 body 直下 | ✅ 照做（`z-index:-2`，避开 `.shell` 的 `isolation`） | `ui/liuli.js` `ensureLayer()` |
| ② 壁纸取色：64×64 缩略图挑最鲜艳像素 | ✅ 打分公式与阈值逐字对齐 | `ui/liuli-color.js` `extractSourceColor()` |
| ③ MCU 派生 M3 色板（HCT） | ⚠️ 换成 **OKLCH 近似**（3KB vs 103KB） | `ui/liuli-color.js` `deriveTokens()` |
| ④ 亚克力材质：半透明底 + 噪声 + backdrop-filter | ✅ 配方与三铁律照抄 | `styles/liuli.css` 第 2 / 5 / 6 节 |
| ⑤ 级联入场：nth-child 阶梯 + 长属性拆开写 | ✅ 但只补「视图 / 面板 / 列表行」 | `styles/liuli.css` 第 8 节 |
| ⑥ 声纹可视化 | ❌ A 档不做（站内已有 `.mp-wave` 频谱与沉浸舞台，等价物已存在） | — |

## 三、为什么不用 Material Color Utilities

原项目两个仓库都 vendor 了一份 MCU（`mcu.js` 103KB / `material-color-utilities.js` 105KB），
因为 M3 的色板定义在 **HCT**（Hue-Chroma-Tone，基于 CAM16）上。

本站的取舍：

- 站点是零依赖静态站，bundle 已经 669KB；GitHub Pages 弱网吞吐只有 ~20KB/s，
  再塞 103KB 只为一个可选主题不划算（对比：`lunar-javascript` 425KB 是**懒加载**的，
  因为黄历是明确的功能需求）。
- M3 派生的本质是「**固定 tone 表 + 固定彩度比例**」，HCT 只是那个感知均匀空间。
  OKLCH 同样是感知均匀空间，把 tone 换算成 OKLCH 的 L 之后，肉眼差异很小。
- 真要逐值一致，后面可以按 `lunar-javascript` 的套路把 MCU 放进
  `assets/vendor/mcu/`，只在琉璃主题激活时 `import()` —— 派生函数的接口
  （`deriveTokens(sourceHex, isDark) → CSS 变量表`）已经留好，替换实现不用动调用方。

### 踩到的坑：tone 不等于 OKLCH 的 L

第一版直接写 `L = tone / 100`，暗色底黑成了 `#010100`（M3 的 tone 6 实际约 `#131313`）。
原因：M3 的 tone ≈ CIE `L*`，而 OKLab 的 `L ≈ cbrt(Y)`，两条标度不一样。换算：

```
L* > 8   →  L = (L* + 16) / 116
L* <= 8  →  L = cbrt(L* / 903.3)
```

见 `ui/liuli-color.js` 的 `toneToL()`。改完之后暗色纸底 `#0e1419`、亮色 `#f4faff`，
和 M3 baseline 的观感对上了。

### 派生时用到的表（照抄原项目）

| 用途 | 亮 | 暗 |
|---|---|---|
| 表面 tone（appBg/low/mid/high/highest） | 98 / 96 / 94 / 92 / 90 | 6 / 10 / 12 / 17 / 22 |
| 品牌态 hover / pressed / tint / weak / line | 44 / 36 / 90 / 88 / 60 | 76 / 84 / 24 / 32 / 48 |
| scrim（品牌色叠到表面上的强度） | low .05 / mid .08 / high .11 / highest .14 | 同 |
| 角色彩度比例（相对源色） | primary 1 / secondary .34 / tertiary .62 / neutral .09 / neutralVariant .18 | 同 |
| tertiary 色相偏移 | +60° | 同 |

`bg1..bg4 = alphaComposite(primary, neutralTone, scrim)` 这一步不能省 ——
它是「玻璃底带品牌色相而不是死灰」的关键。

### 语义色的两个例外

- `--ok`（通过 / 在线）**不跟源色走**：M3 里 success 常映射 tertiary，但蓝壁纸下 tertiary 是紫色，
  站点里「在线」变成紫色会被当成故障。固定色相 145°（绿），彩度跟源色。
- `--alert` 用 M3 error（色相 25°），亮暗各自取 tone 40 / 80。

## 四、取色：与原项目逐字对齐的部分

```
缩到 64×64 → 遍历像素：
  跳过 a < 128
  l = (max + min) / 2，跳过 l < 35 或 l > 220
  score = (max - min) - |l - 128| * 0.4     // 又鲜又不极端
取分最高的像素；若它的 RGB chroma < 24（太灰）→ 回退默认蓝 #1d9bf0
结果按 url 缓存成 Map<url, Promise<hex|null>>，切主题不重复解码
```

与原项目的差别（都是网站环境逼出来的）：

- 原项目还会跑一次 MCU 的 `sourceColorFromImage()`，和「最鲜艳像素」比 chroma 取更鲜的那个。
  我们不引 MCU，就只用打分这一路（QQNT 版也是这么简化的，注释里写了「效果等价」）。
- **跨域图取不到色**：Pixiv 直链没有 CORS 头，`getImageData` 会抛 SecurityError。
  处理方式是「壁纸照常显示，色板回退默认蓝」—— 显示图片不需要 CORS，只有读像素需要。
  站内相册（`assets/img/album/*`）和 Pixiv 代理（`/api/pixiv/image`）都是同源，不受影响。
  取色时用 `crossOrigin="anonymous"` 加载，失败就静默降级，**不能**因为取色失败而丢掉壁纸。

## 五、材质三铁律（照抄，违反任一条都看得出毛病）

1. **材质只有一个来源**：`--liuli-material-opacity` + `--liuli-material-blur` + `--liuli-acrylic-rgb`。
   任何地方都不许写死 `rgba(...)` 数值，否则「材质不透明度」这类调节会局部失效。
2. **玻璃只挂最外层承载层**。承载层内部的子容器一律 `background: transparent` +
   `backdrop-filter: none` —— 不然 alpha 叠加，同一材质在嵌套处深浅不一（原话："玻璃叠玻璃"）。
3. **中间容器全部打透**，让壁纸透出来。

另外两条实测踩坑，与本站同样成立：

- **弹层 / 菜单不要挂 `backdrop-filter` 或 `transform`**：内部 `position: fixed` 的子菜单会以它为
  包含块而错位。真要模糊就挂在 `::before` 上。（本站 `.cmdk__panel` / `.drawer` / `.almanac`
  目前没有 fixed 子菜单，先直接挂了；以后加右键菜单时要注意。）
- **不要盖全屏噪点层、不要给半透明面上的文字加文字阴影**：字会发虚。所以琉璃下
  `.grain` / `.scanlines` / `.hud-corner` 整层关掉，噪点只进材质自己的 `background-image`。

本站额外的一条：**顶栏做成浮起来的玻璃胶囊**（`top: 10px` + 四角 14px + 浮起阴影 +
`blur-strong` 那一档），而不是横贯屏幕、底边一条 1px 硬线的实心板。
站主实测的原话是「它下来的时候会挡住东西，边缘和其它区域的过渡很割裂」——
浮动 + 更透 + 强模糊之后，内容从它下面过时是「糊的」，不是「被切掉一块」。
base.css 里那条老经验（顶栏必须够实，否则字叠 logo）由强模糊补偿：透，但糊得够狠。
配套还要给 `html` 加 `scroll-padding-top: calc(var(--topbar-h) + 28px)`，
否则锚点跳转和目录点击会把标题压在浮动条底下。

播报条（`.ticker`）在琉璃下**整条打透**：顶栏已经浮起来了，下面再压一条带硬边的
实板会很碎，只留文字和壁纸融合。

### 模糊层预算：谁能挂 backdrop-filter

`backdrop-filter` 的成本 ≈ **面积 × 每帧重算**，所以琉璃下按三档管：

| 档 | 对象 | 处理 |
|---|---|---|
| 内容层 | `.panel` `.card` `.row` `.notice` `.mr-card` `.acard` `.bgpicker` 等 | **半透明材质 + 噪声 + 阴影，不挂模糊**（壁纸已经烤成磨砂图了，再逐个实时模糊几乎看不出差别，代价却是一页十几层） |
| 浮层 | `.drawer` `.cmdk__panel` `.miniplayer` `.almanac` `.authpanel` `.amodal` `.lightbox__bar` `.authbox__menu` | 挂 `--liuli-material-blur`；压在遮罩上的（黄历 / 登录面板 / 番剧弹窗 / 灯箱条 / 账号菜单）用 `blur-strong` 补偿嵌套采样衰减 |
| 全屏层 | `.cmdk__scrim` `.drawer-scrim` `.authpanel__scrim` `.bgpicker__scrim` `.lstage__help` `.anime-modal::backdrop` | **一律 `backdrop-filter: none !important`**，只留半透明压暗 |
| 特例 | `.toast` | 实底（0.94），和原项目一致（它的 toast-bg 直接取 M3 的 onSurface 实色）：提示必须一眼可读，且它出现的时机往往正是页面在忙的时候 |

全屏层那条是硬红线：它背后正好是铺满视口的壁纸图，页面里还有播报条的无限动画在跑，
没有 GPU 合成的环境（软件渲染 / 集显省电模式 / 老安卓 WebView）会每帧付一次全屏高斯
模糊的代价。**以后再加任何铺满视口的浮层，都要去 `liuli.css` 那条规则里挂个名。**

## 六、形状：圆角与阴影（最容易被漏的一块）

本站原本是「全局零圆角」的工业直角：`tokens.css` 里 `--radius: 0px`，而且**没有任何规则消费它**
（实测全站 `var(--radius)` 用量为 0）；`ef.css` 还专门写了「切角 = 可点击」「图片永远直角」。
琉璃要的是 M3 的 14 / 10 / 7 / 999 阶梯，所以只能逐个面给圆角 ——
这正是站主说的「圆角导得不彻底」的来源：靠看截图只能发现个位数。

### 6.1 形状阶梯（`liuli.css` 第 7a–7i 条）

| 档 | 值 | 对象 |
|---|---|---|
| 大容器 | 14px | 面板 / 卡片 / 浮层 / 模块级容器（`.panel` `.card` `.cmdk__panel` `.ne-search` `.np` `.tracks` `.leisure-hero` `.photo-album` …） |
| 控件 | 10px | `button` / `input` / `select` / `textarea` 兜底，加 `.btn` `.row` `.nav__link` 页签与条带 |
| 小件 | 7px | `code` `kbd` `.card__idx` |
| 药丸 | 999px | `.tag` `.chip` 徽标 / 筛选 chip / 头像 `.neacct__avatar` |

兜底用元素选择器（`button` / `input`），再按需要提级 —— 各模块的控件类名有几十个，逐个列一定漏。

### 6.2 三个必须知道的坑

1. **`ef.css` 用四重 `:not()` 把输入框钉成直角**：
   `input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"])`
   特异性 (0,4,1)，压得过 `html[data-theme^="liuli"] input` 的 (0,1,2)。
   必须把它的选择器原样抄一遍再叠主题属性（(0,5,2)）才赢 ——
   **这是「所有 input 还是直角」的唯一原因**，也是审计脚本第一版最有价值的发现。
2. **子元素会把父级的圆角戳掉**：`.panel__head`、`.post__info > div`、海报上的
   `poster__wash / poster__grid / poster__shine` 这些自己画底的子元素，父级圆了它们还是方的。
   两种解法：给子元素同样的圆角（头部用「上圆角」14px 14px 0 0），
   或让父级 `overflow: hidden` 裁掉（媒体类容器 `.acard__poster` `.masonry__item`
   `.hero__media` `.stage` 用这种）。
3. **45° 切角是照 `mask` 实现的，不是 `clip-path`** —— 这是最隐蔽的一条。
   `ef.css` 的 `.btn` / `.chip` / `.iconact` / `.ms-lv` / `.tool-tab` / `.admin__tab` 与
   `.nav__link.is-active`、`components.css` 的播放控制，都挂着
   `mask: linear-gradient(-45deg, transparent calc(var(--cut) - .5px), #000 calc(var(--cut) + .5px))`。
   `mask` 同样不吃 `border-radius`：只要留着一个 `--cut`，圆角旁边就会缺掉一个角。
   处理办法是两条一起：① 把切角令牌 `--ef-cut` / `--ef-cut-sm` 归零（`--cut: var(--ef-cut)` 的那批自动失效）；
   ② 对写死像素的几处（`.hero__media-fab`、播放控制、`.mr-tab.is-on`）显式 `mask: none`。
   **随之还要收回切角预留的右内边距**（`.btn` 24px、`.chip` 14px、`.tool-tab` 22px…），
   否则字会明显偏左 —— 数值取自各自的基础内边距。
   第一版审计只查 `clip-path`，把这一整类漏了；后来给审计加上 `maskImage` 含 `-45deg` 的检查才抓出来。
4. **硬直角阴影**：终末地的 `box-shadow: 6px 6px 0 <color>` 是**方角偏移实心影**，
   配圆角元素时四个角外面会露出方形轮廓 —— 站主原话「后边还有直角的阴影」。
   涉及 `.bgpicker__panel`（14px，最扎眼）、`.dl-card`、`.authpanel`、`.card:hover`、
   `.acard:hover`，琉璃下一律换成软影 / 品牌辉光。
5. **角上的小条装饰与底边线**：`ef.css` 给 `.panel` / `.empty` / `.section-block` 挂了一条
   `::before` 黑条（悬停从 14% 长到 100%），leisure 给 `.acard` 挂了一条 `left/right: -1px`
   的 2px 信号线 —— 在圆角容器上都会从圆角外面戳出来，让容器 `overflow: hidden` 裁掉即可。
6. **泛用类名撞车**：`.row` 既是列表行（`ui/bits.js` 的 `<a class="row">`），
   又是首页大标题的每一行（`views/home.js` 的 `heroTitleHTML()` 返回 `<span class="row">`）。
   第一版把 `.row` 直接写进材质名单，结果**首页标题两行各套上了一个玻璃框**
   （站主截图反馈「这个标题不要给他加琉璃框」）。改成 `a.row` 才对。
   教训：`.row` / `.card` / `.tag` 这种泛用类名，加材质前先确认它在别处没被当布局类用；
   能加元素限定就加。

另外 `clip-path` 不吃 `border-radius`：`.card__idx` 的切角、`.leisure-hero__title-sub` 的
切角、`.lstage__cover` 的切角在琉璃下都要 `clip-path: none`，否则圆角旁边缺一块；
首页那道斜切色块 `.hero__slash` 是纯装饰，直接 `display: none`。

### 6.2.1 滚动条：琉璃下整个拿掉，换成悬浮指示条

`base.css` 的滚动条是「轨道 = `var(--bg-sunk)`、滑杆 = `--ink-25`、2px 实边」的实心条。
纯色主题里没问题，但琉璃下 `--bg-sunk` 是半透明玻璃色 —— 铺在满屏横幅图上就成了一条
发亮的竖带贴在窗口最外沿。

第一版只是把轨道改透明、滑杆内缩成细药丸，站主反馈还是不对：**他要的是「页面占满右边、
不留空白」**。根因不在配色：经典滚动条模型下，它会在窗口最右占掉 10~12px 的槽，
那一条永远是一块平色（`--paper` 或半透明轨道色），压在满屏壁纸上就是一条「空白」。

现在的做法（`liuli.css` + `ui/liuli.js`）：

```css
html[data-theme^="liuli"] { scrollbar-width: none; }   /* Chromium 121+ / Firefox */
html[data-theme^="liuli"] ::-webkit-scrollbar { width: 0; height: 0; }  /* 更老的 Chromium */
```

布局视口 == 窗口宽（实测 `innerWidth - clientWidth = 0`），横幅、壁纸、页脚都贴到屏幕右边；
`100vw` 也不再包含滚动条 —— 顺带修掉首页横幅原来那 5px 的左右偏移（实测 x=0、距右=0）。

**这条最后提到了全站**（`styles/base.css` + `ui/scroll-rail.js`），不再只给琉璃：
站主第二次截图看的是**纯色主题**，那里照样有一条 10px 的槽 —— 滚动条不属于任何一种
视觉语言，本来就该全站统一处理。

位置感由 `ui/scroll-rail.js` 画的一颗悬浮条 `.scroll-rail` 提供：`position: fixed; right: 3px; width: 5px`，
高度按 `viewport / document` 比例算、`translateY` 跟 `scrollY` 走，滚动时提亮到 0.8、
停手 0.9s 后回落到 0.34，内容不足一屏就整条隐藏。它 fixed 定位、不占布局宽度。

### 6.2.2 收根滚动条：三次试错的结论

| 写法 | 实测结果 |
|---|---|
| `html::-webkit-scrollbar { width: 0 }` | **无效** —— 规则在样式表里、选择器也对，但对根滚动条不起作用（Chromium 132 / Electron 34） |
| `::-webkit-scrollbar { width: 0 }`（通用） | 有效，但会把内层可滚区域（命令面板列表 / 播放队列 / 代码块）的滚动条一起藏掉 |
| `html { scrollbar-width: none }` | ✅ **只收根滚动条**：根槽 0，内层 `.cmdk__list` 仍保留 10px |

**`scrollbar-width` 在这个 Chromium 里不遗传**（实测：根 0 / 内层 10），所以这是最干净的一招。
代价：Chromium < 121 不支持该属性，那些环境保留原生滚动条（可接受）。

> 教训：这里连着改错三版，都是因为**在猜用户看到的画面**。最后一次先用 PIL 扫截图右边缘的
> 像素才看清：最右 8~10px 是一块 `#E9E6DD` 的平色 = 滚动条槽。
> **看不清的问题就去量像素，别靠推测。** 而且「CSS 写了」≠「生效」——
> `html::-webkit-scrollbar` 那条规则明明在样式表里、选择器也对，就是不生效，
> 只有运行时实测（改一下、量一次槽宽）才看得出来。

### 6.3 怎么保证下次不漏

写了 `tools/liuli-radius-audit.js`（在页面里跑的表达式，由 `tools/eval.mjs` 驱动）：
遍历 13 个路由，只报告「有底色 / 有边框、又没被圆角父级裁掉」的直角元素，按 `tag.class` 聚合。

- 首轮：**115 类**（87 处筛选 chip、80 处扫雷格、26 处海报叠层…）
- 加上 `mask` 切角检测后再修一轮：**18 类**，剩下的全是**刻意保留直角**的：
  扫雷棋盘 `.ms-cell` / `.ms-board`、表格 `td` / `th`、装饰条码 `.sect__barcode`、
  只有上边框的页脚条与卡片脚注、透明底的标题与包裹层。
- 最终报告里 **切角(mask) 0 条、硬直角阴影 0 条、clip-path 切角 0 条**。
- 白名单写在脚本的 `EXEMPT` 与 `liuli.css` 第 7h 条，两边要一致。

> 一句经验：这类「看起来没导干净」的问题，靠看截图只能发现个位数，靠程序化审计才能一次列全。
> 审计脚本本身也迭代了两版 —— 第一版把「透明底」「被父级裁掉」「只有上圆角」都算成问题，
> 噪声太大，第二版才收敛成能直接照着改的清单。

## 七、特异性陷阱（改这块前必读）

运行时色板写在 `<style id="liuliPalette">` 里，选择器是 `:root[data-theme="liuli"]`，
特异性 **(0,2,0)**；`styles/liuli.css` 的材质规则是 `html[data-theme^="liuli"]`，**(0,1,1)**。
前者赢。

所以：**派生函数绝不能输出 `--bg-alt` / `--bg-sunk`** —— 那两个变量在 liuli.css 里被算成
半透明玻璃底，一旦运行时给出不透明值，玻璃就被自己关掉了。
`ui/liuli-color.js` 的返回值里对这条有注释，别顺手加回去。

反过来，静态兜底块（`[data-theme="liuli"]`，特异性 (0,1,0)）故意比材质规则低，
这样 JS 没跑起来时是不透明的 M3 色板，JS 跑起来后玻璃生效。

## 八、壁纸来源与设置

| 设置 | 存哪 | 怎么改 |
|---|---|---|
| 壁纸来源 `hero`（默认）/ `art` / `album` | `Settings` 的 `liuliMode` | Ctrl+K →「琉璃：壁纸来源」 |
| 固定的那张壁纸 | `localStorage['ft.terminal.liuliWallpaper']`（整条 photo，含标题/作者） | Ctrl+K →「琉璃：换全站壁纸」 |
| 遮罩浓度 `soft/std/deep` | `Settings` 的 `liuliVeil` | Ctrl+K →「琉璃：壁纸浓度」 |
| 磨砂强度 `none/soft/heavy` | `Settings` 的 `liuliBlur` | Ctrl+K →「琉璃：壁纸磨砂」 |

**入口**：顶栏那颗水滴按钮（`index.html` 的 `#liuliBtn`，`ui/liuli.js` 里接）——
它**只在琉璃的两档里循环**：从别的主题点进来 → 回到上次待过的那一档（默认夜）；
再点就在夜 ⇄ 昼之间来回。**它不会回纯色主题** —— 那是旁边主题按钮的事
（`Theme.cycle()` 只走纯色，`Theme.liuliList` 只给水滴用）。
按钮的亮灭与提示文案挂在 `theme:change` 上（主题也可能从别处切），`is-on` 的样式在 `liuli.css`
（只在琉璃下才可能亮着，所以不放进 base.css）。

**默认跟首页横幅**（站主要的就是这个）：全站底色和首页那张横幅是同一张照片，
横幅一换整站跟着换。`views/home.js` 的 `loadHeroPhoto()` 落定时广播一次
`hero:change`（随机 / 换一张 / 固定 / 选图四条路径都经过那里，所以只需要发一处），
`ui/liuli.js` 收到就重新取色派生。不在首页时读 `ft.terminal.heroPinned`
（横幅自己固定下来的那张）兜底，所以「跟横幅」在别的板块也不会断线。

**三种模式都保证有图**（v1 的教训）：第一版默认「相册固定」，而用户没固定过任何图 ——
结果切到琉璃只看到一片纯色，既没有壁纸、颜色也永远是默认蓝，站主的第一句反馈就是
「它并不是全屏的壁纸，主题色不会随着壁纸颜色改变」。一个「跟着壁纸呼吸」的主题，
不该要求用户先手动选一张图。现在的回退链：

```
hero（默认） = 首页横幅 → 随机插画 → 固定的那张
art          = 随机插画 → 首页横幅 → 固定的那张
album        = 固定的那张 → 首页横幅 → 随机插画
```

三条链都空的时候，`refresh()` 会主动 `Stage.random({silent:true})` 抽一张插画兜底
（只抽一次，数据源全挂时不反复重试）。

- 「换全站壁纸」复用现成的选图面板（`ui/background-picker.js`，新加了 `scope: 'site'` →
  标题显示「全站壁纸」），相册选图 / 拖入本地图 / 压缩全走原有逻辑，没有新写一套。
  选完会自动把来源切成 `album`（你手动挑的图，不该被下一张随机横幅顶掉）。
- 自定义图存 localStorage，超配额时 `writePin()` 返回 false，会提示「图太大没存住，本次会话有效」
  （和首页横幅固定同一种降级说法）。
- `refresh()` 按 `图 + 磨砂档 + 明暗 + 遮罩档` 组一个 key 去重：横幅与插画事件很密，
  同一张图不重复解码、不重复烤磨砂图。

### 可读性靠什么：磨砂是主力，遮罩是配角

第一版把遮罩开到暗 0.7 / 亮 0.8，理由是「长文站点，正文直接压在页面底上」。
结果照片被压成一块脏色 —— 站主看不出那是壁纸。

真正压字对比度的是照片的**高频细节**，不是它的颜色。所以正确的分工是：

| 手段 | 取值 | 作用 |
|---|---|---|
| 壁纸磨砂 | `filter: blur(16px) saturate(1.12)` + `scale(1.08)` | 抹掉高频细节，颜色与形状仍然满屏都是（主力） |
| 遮罩浓度 | 暗 0.3 / 0.46 / 0.62，亮 0.42 / 0.6 / 0.76（soft/std/deep） | 只负责把整体明度拉回方案侧（配角） |
| 面板玻璃 | `--liuli-material-opacity` 暗 0.6 / 亮 0.66 | 卡片、面板上的文字有自己的底 |
| 正文垫子 | `.prose` 一块 0.78× 材质 + 14px 圆角 + `--sp-4/--sp-5` 内边距 | 长文直接压在壁纸上会花，给它一页「纸」 |

`.prose` 的垫子刻意**不用负外边距**去补偿 padding：宁可让 74ch 的版面窄一点，
也不要在窄屏上溢出。实测 651px 宽、右边缘不溢出。

`scale(1.08)` 是必需的 —— `blur()` 会在元素边缘采样到透明，不放大就会露出一圈白边/黑边。
所以 `.liuli-bg` 的实测尺寸比视口大 8%（1581×926 vs 1474×857），这是对的，不是 bug。

## 九、性能与降级

| 场景 | 处理 |
|---|---|
| 浏览器不支持 `backdrop-filter` | `@supports not (...)` 里把材质换成不透明 `--paper-2`，宁可少一层质感也不「透字」 |
| 缩放 / 拖动窗口 | JS 打 `html[data-liuli-blur-off]`，220ms 内关掉所有模糊（原项目同款护栏） |
| `prefers-reduced-motion` / 站内「减少动画」 | 入场动画整条关掉（`animation: none !important`） |
| 安卓 App（WebView） | 大面积 `backdrop-filter` 在低端机上会掉帧，靠上面两条兜住；必要时可把 `--liuli-material-blur` 调小 |
| 取色开销 | 只在换壁纸 / 换主题时跑一次，64×64 解码 + 4096 像素遍历，实测 <100ms；结果按 url 缓存 |

## 十、验收

**色板自测**：`node tools/test-liuli-color.mjs` → 74 项全通过
（6 个源色 × 亮暗：色相一致性 ±18°、明度方向、WCAG AA 对比度、灰图回退）。

**浏览器实测**（headless Edge + CDP，跑在 `http://127.0.0.1:5173`）：

| 检查 | 结果 |
|---|---|
| **跟首页横幅**（默认档） | 横幅 `album-300.jpg` → 运行时源色 `#eb2749`，与**独立实现的取色算法**算出的 `#eb2749` 完全一致 |
| 横幅换一张后跟着变 | 横幅 → `album-695.jpg`，源色 → `#ba9981`（独立算出同值），强调色 `#e1bfa6`、纸底 `#151311` |
| 开箱即有壁纸 | 全新 profile、不选图、不写任何设置，切到琉璃后自动铺好磨砂壁纸并取色（源色非默认蓝） |
| 壁纸铺满 | 层尺寸 1581×926 vs 视口 1474×857（`scale(1.08)` 的预期结果）、`blur(16px) saturate(1.12)`、遮罩 `rgba(0,0,0,0.46)`、`fixed z=-2` |
| 壁纸可见度 | 视口 5×5 采样：首页 18/25、文章页 19/25 处最上层元素完全透明（能直接看到壁纸） |
| 颜色跟随壁纸 | 四张不同壁纸 → 源色 `#df5b99`/`#d19b5c`/`#d19b5c`/`#0679ed`，强调色随之变 `#fdaacb`/`#f2bb7b`/`#f2bb7b`/`#165daf` |
| 顶栏浮动 | 距顶 10px、左右留白 47/57px、圆角 14px、底 `rgba(44,46,28,0.66)`、`blur(28px) saturate(1.7)`、边框 `1px rgba(144,147,126,0.26)`、浮起阴影 |
| 锚点让位 | `scroll-padding-top: 92px`（= 顶栏 64 + 28） |
| 播报条打透 | 底色 `rgba(0,0,0,0)`、下边框 0 |
| 正文垫子 | `.prose` 底 `rgba(54,41,39,0.467)`、圆角 14px、内边距 16/24、宽 651px、右边缘不溢出 |
| 面板材质 | 15 个 `.panel`：15 个挂上模糊、15 个 14px 圆角、14 个带噪声（1 个是 `.panel--flush`，本来就该透明） |
| 遮罩切档 | 0.46 → 0.62，`liuliVeil: 'deep'` 已持久化 |
| 昼色方案 | `liuli-day`：signal `#196398`、paper `#f4faff`、标签 999px、按钮 10px、入场 `liuli-in 0.45s` |
| 命令面板 | 搜「琉璃」命中 4 条命令 + 2 条主题项 |
| **顶栏水滴按钮** | `paper` → `liuli`（`is-on`、`aria-pressed=true`）→ `liuli-day` → `liuli`；三次都留在琉璃 |
| **两条线分开** | 从琉璃按主题按钮 → 立刻回到纯色（`night`，即上次纯色的下一套）；再点 6 下依次 `blueprint→matcha→sakura→paper→night`，全程不经过琉璃 |
| 命令面板主题组 | 搜「主题」只列出 5 条纯色主题，**没有 LIULI / 琉璃** |
| 顶栏不被挤爆 | 1474px 视口下顶栏内容宽 = 可视宽（无溢出），右侧 5 个图标按钮共 285px |
| **占满右侧（无滚动条槽）** | **三套主题都是 `innerWidth - clientWidth = 0`**（paper / night / liuli），横幅 x=0、距右=0；内层 `.cmdk__list` 仍保留 10px 滚动条 |
| **悬浮滚动指示条** | 三个主题都在；顶部 `height=195px / translateY(4px)`，滚到 1400 后 `translateY≈321 / opacity .8`（`.scroll-rail`） |
| **圆角审计** | `tools/liuli-radius-audit.js`：115 类 → 18 类；切角(mask) 0 条、硬直角阴影 0 条、clip-path 切角 0 条，剩余全是刻意保留的直角（扫雷格 / 表格 / 条码 / 上边框条） |
| 其它主题未受影响 | 切回 `paper`：圆角 0px、模糊 none、`.grain` 恢复 block、signal 回到 `#FFD400` |

**静态兜底同步**：改完派生逻辑要跑 `node tools/gen-liuli-fallback.mjs`，
它会把 `styles/liuli.css` 里那两个兜底块重写一遍（别手抄）。

## 十一、文件清单

| 文件 | 作用 |
|---|---|
| `src/ui/liuli-color.js` | 取色 + OKLCH 派生（纯函数，可在 node 里自测） |
| `src/ui/liuli.js` | 运行时：壁纸层、写色板、来源/浓度切换、命令注册、性能护栏 |
| `styles/liuli.css` | 主题层：静态兜底色板、材质配方、形状阶梯、级联入场、降级 |
| `tools/test-liuli-color.mjs` | 色板自测（74 项） |
| `tools/gen-liuli-fallback.mjs` | 把派生结果同步进 liuli.css 的兜底块 |
| `src/ui/scroll-rail.js` | 全站悬浮滚动指示条（根滚动条在 `base.css` 里收掉，位置感靠它） |
| `styles/base.css` | `html { scrollbar-width: none }` + `.scroll-rail` 样式（占满整宽的处理已提到全站） |
| `src/config/site.config.js` | `THEMES`（纯色五套）与 `LIULI_THEMES`（琉璃两档）分成两份，`ALL_THEMES` 只给 `Theme.set()` 解析 |
| `tools/build-css.mjs` | `ORDER` 末尾加 `liuli.css`（必须排最后） |
| `src/main.js` | `Liuli.init()`（在 `Stage.init()` 之后） |
| `src/ui/background-picker.js` | `scope: 'site'` 的标题文案 |
| `src/views/home.js` | 横幅落定时广播 `hero:change`（琉璃的默认壁纸来源就靠它） |
| `src/ui/palette.js` | 修 `runCursor()` 里的 `close()` → `closePalette()`（见第十三节） |
| `tools/verify.mjs` | 新增 `window.close` 回归项；两条被历史改动带偏的断言按原意收紧 |
| `tools/eval.mjs` | CDP 调用补超时（原来会无限挂着，分不清"页面卡死"和"页面被关掉"） |

## 十二、A 档之外还能做什么

- **材质设置面板**：模糊半径 / 不透明度 / 遮罩 / 圆角滑条（令牌都已经留好，加 UI 即可）
- **声纹可视化**：把 `core/player.js` 的 AnalyserNode 频谱画到壁纸层或页头
  （原项目的 `HeaderEffects.tsx` 是 canvas 波形；站内已有 `.mp-wave` 与 `ui/audio-energy.js` 可复用）
- **精确 M3 色板**：vendor MCU 到 `assets/vendor/mcu/`，只在琉璃激活时懒加载
- **角色可配**：原项目的 `color-roles.js` 允许「强调色 / 选中项 / 气泡」各用 primary / secondary / tertiary

## 十三、顺手抓到的一个真 bug：命令面板会把标签页关掉

调琉璃的时候，无头浏览器一点命令面板里的命令就"冻住"，`Runtime.evaluate` 120 秒超时。
查下去发现**和琉璃、和性能都没关系**，是 `src/ui/palette.js` 里一个早就存在的笔误：

```js
function runCursor() {
  const it = filtered[cursor];
  if (!it) return;
  close();          // ← 模块里没有 close 这个绑定！
  setTimeout(() => it.run(), 10);
}
```

模块里的函数叫 `closePalette`，`close` 只是 `Palette` 对象上的一个属性名。于是 `close()`
沿作用域链一路找到全局的 **`window.close()`**。浏览器只在「会话历史只有 1 条」时才允许它
生效 —— 而这正好是两种情况：

- **新开标签页直接进站 → `Ctrl+K` → 点任意一条命令 → 标签页被关掉**（真实用户会遇到）
- 无头自检的页面（刚加载完、没跳过路由）→ 页面直接没了，CDP 调用永远不返回，
  看起来就像"页面冻住"

之所以一直没被发现：只要地址栏跳过一次路由（`history.length > 1`），`window.close()`
就会被浏览器拒绝，一切正常。开发时总是在站内点来点去，历史早就 >1 了。

修法就是把 `close()` 改成 `closePalette()`。回归检查加在 `tools/verify.mjs`：
**给 `window.close` 装一个探针，然后点一条命令，断言它被调用 0 次且面板已关**
（挑「琉璃：壁纸浓度」是因为它无副作用 —— 不改主题、不跳转）。

刻意不去凑 `history.length === 1` 的场景：自检跑到那一步历史已经几十条了，
`window.close()` 会被浏览器直接拒绝，测不出任何东西 —— 第一版就是这么写的，
"通过"了但守不住这个 bug。探针方案与历史长度无关。

两个方向的对照都实测过：

| 版本 | `window.close` 被调用 | 面板是否关上 | history.length |
|---|---|---|---|
| 带 bug | **1** | 否 | 1 |
| 修好之后 | 0 | 是 | 1 |

> 顺带两条经验：
> ① 判断"页面卡死"还是"测试工具卡死"，要用**带超时**的 runner。`tools/shot.mjs` 的
> `send()` 有超时，会明确报 `timeout Runtime.evaluate`；`tools/eval.mjs` 原来没有，
> 只会无限挂着 —— 已经给它补上了同样的超时（这次就是靠它才把"卡死"和"页面被关掉"分开）。
> ② 这个仓库的源文件是 UTF-8 无 BOM，**不要用 PowerShell 5.1 的 `Set-Content -Encoding UTF8`
> 改它们**：会写进 BOM 并把中文注释变成乱码（实测把整个 palette.js 的注释毁了一遍，
> 只能 `git checkout` 恢复）。改文件一律走编辑工具。
