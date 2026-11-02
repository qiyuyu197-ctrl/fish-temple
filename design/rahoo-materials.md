# rahoo.online 素材审查 / 取舍

> 结论先说：**能直接用**的是「设计工具」生成的几何纹理与版式语言，以及 **Noto Serif SC（OFL）**；
> 封面模板里的游戏立绘、Gilroy / Derlantica 商业字体、Endfield 专属徽章**没有搬**。
> 本文对应网页改动，App 包等审核后再打。

## 1. 来源与页面

| 页面 | 去看什么 |
| --- | --- |
| `https://rahoo.online/` | 封面模板：cover-a ～ cover-j、scene-a / scene-b，信号黄编号、切角、斜排标签 |
| `/design-tool` | 素材生成器：同心圆、半调、HUD 线、刻度圆、条形码、点阵、等高线、放射线等，可导出 SVG |
| `/keynote-player` | 深色 keynote 版式与 `keynote-bg` 烟雾底 |
| `/infographicA` `/infographicB` | 一图流 / 信息图版式 |
| `/manual` | 使用说明与素材说明 |

## 2. 可用性判断

### 已经用上的

| 素材 | 用法 | 许可 / 备注 |
| --- | --- | --- |
| **Noto Serif SC 900**（rahoo 的 `SourceHanSerifCN-Heavy` woff2） | 文章详情大标题 `styles/patterns.css` | SIL Open Font License 1.1，许可证已放 `assets/fonts/NotoSerifSC-OFL.txt` |
| **同心圆 / 刻度环 / 条形码**（design-tool 的生成语言） | 首页 hero 右侧 HUD、分区标题末尾刻度 | 用我们的 `assets/patterns/*.svg` 重新画，避免直接搬文件 |
| **封面编号贴纸**（cover 模板的 `01 / FILE` 信号黄标签） | 文章卡片右上角 | 只取版式；没有使用模板里的任何立绘 |
| **深色底 + 信号黄 + 硬阴影** | HUD 环、卡片 hover | 与本站既有 `--ink` / `--signal` 变量一致 |

具体改动：

- `assets/patterns/hud-rings.svg`、`hud-ticks.svg`、`barcode.svg`、`dot-matrix.svg`、`twill.svg`
- `styles/patterns.css`：hero HUD、`.sect__barcode`、`.card > .card__idx`、`.post__title.display`
- `src/views/home.js`：hero 里新增 `.hero__hud`
- `src/ui/bits.js`：`sectionHead()` 增加条形码
- `assets/fonts/NotoSerifSC-Heavy.woff2` + `NotoSerifSC-OFL.txt`
- `tools/gen-service-worker.mjs`：把 `assets/patterns/*.svg` 加进预缓存

### 可以继续用、但这次没上的

| 素材 | 为什么先不上 |
| --- | --- |
| **黑色斜纹 `black-twill` 14×14** | 本站已有全局 grain + scanlines，再加会脏；适合以后做「深色封面卡」的单独纹理 |
| **半调 / 点阵 / 等高线 / 放射线**（design-tool 其他预设） | 适合做音乐台封面占位、文章头图，当前先上 HUD 环和条形码，避免一次改太多 |
| **`keynote-bg.jpg` 烟雾底** | 适合沉浸舞台的暗部叠加，但来源/授权链不明确，先不复制 |
| **`endfield-dot` / badge layers** | 明显是 Endfield 风格的专属图形，容易变成游戏 IP 挪用；不做 |

### 明确不用的

| 素材 | 原因 |
| --- | --- |
| cover-a ～ cover-j、scene-a/b、keynote-thumbnail 的**角色立绘 / 截图** | 是《明日方舟 / 终末地》等游戏版权素材，不能搬进本站仓库 |
| **Gilroy Heavy / HeavyItalic** | Radomir Tinkov 商业字体，rahoo 能用不代表本站有授权 |
| **Derlantica Beauty** | 商业字体，授权不明 |
| **transparent-pattern.jpg** | 只是棋盘格透明底，不是设计素材 |

## 3. 审核时看哪里

- 首页：右上 HUD 同心圆 + 刻度环；每个分区标题右侧的条形码；文章卡片右上角 `01 / FILE` 贴纸
- 文章详情（例如 `#/logs/post_overview`）：标题是否接受宋体 Heavy
- 手机：HUD 环会自动缩小、靠右；卡片贴纸和条形码保留
- 深色 / Blueprint 主题：环和条形码跟 `currentColor` 走
- 减少动效：环和刻度不转

如果哪一项不喜欢，可以单独回退：

- 只去掉 hero 环：删 `home.js` 的 `.hero__hud` 或 `patterns.css` 的 `heroHud*`
- 只去掉宋体：删 `patterns.css` 第 04 节和 `tokens.css` 的 `--font-serif-display`
- 只去掉贴纸：删 `patterns.css` 的 `.card > .card__idx` 规则

## 4. App 迁移

这次**没有打 App 包**。网页审核通过后，再：

1. `node tools/gen-service-worker.mjs`
2. 确认 Android `assets/site` / 桌面版 `resources/site` 重新组装
3. 按需要升版本、构建 APK / 桌面 zip

> 说明：网页上用的图案是 SVG + `mask-image`，Android WebView 与 Electron 都支持；
> 字体是 woff2，两者也都支持；真正要确认的是手机小屏上 HUD 环的密度和宋体标题的换行。
