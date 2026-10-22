# 文娱板块（`#/leisure`）设计

## 目标

给站点加一个「自己的番剧档案」：不追热点速度，而是把**当季值得先看的番**和**随时可以重看的推荐**整理成一张可浏览、可筛选、可追番的目录。

参考 `2x.nz` 的文娱 / 追番：卡片网格 + 标题 + 一句短评。这里保留这个信息结构，但视觉换成 FISH 的纸 / 墨 / 信号黄，并且**不依赖海报图床**。

## 结构

```
#/leisure              当季新番（默认；按放送日排）
#/leisure?tab=picks    推荐动漫
#/leisure?tab=mine     我的追番（只存在本机 localStorage）
#/leisure?random=1     随机打开一部（命令面板 / 深链）
```

页面自上而下：

1. **viewhead** — LEISURE / MODULE 09 / 季档 / 收录数 / 追番数
2. **季档横幅** — 左：年份 + 大字「秋」；中：本季标题、简介、四项统计；右：今日更新
3. **页签** — 当季新番 / 推荐动漫 / 我的追番
4. **本周放送表** — 周一～周日，今天标黄；点条目直接开详情（仅当季页签）
5. **工具栏** — 搜索 / 类型（或追番状态）/ 排序 / 清空 / 结果数
6. **卡片网格**
7. **详情弹层** — 海报、日文名、评分条、简介、推荐理由、放送信息、声优、外链、上一部 / 下一部

## 数据（`data/anime.json`）

```jsonc
{
  "season": {
    "year": 2026, "name": "秋", "nameEn": "AUTUMN",
    "start": "2026-09-27", "end": "2026-12-31",
    "headline": "秋天到了。", "headlineEm": "先从哪部开始？",
    "intro": "……", "note": "……"
  },
  "sources": [{ "label": "出处", "url": "https://…" }],
  "current": [{
    "id": "kusuriya-s3",
    "title": "药屋少女的呢喃 第三期",       // 中文名（卡片主标题）
    "titleJa": "薬屋のひとりごと 第3期",    // 日文名（海报竖排 / 详情）
    "posterJa": "薬屋のひとりごと",         // 可选：海报上更短的日文名
    "day": 5, "time": "23:00",               // 1=周一 … 7=周日
    "premiere": "2026-10-02", "station": "日本テレビ系",
    "episodes": "放送中", "status": "续作",  // 新作 / 续作 / 特别篇
    "genres": ["古风", "推理", "宫廷"],
    "cast": ["悠木碧", "大塚剛央", "小西克幸"],
    "hook": "猫猫又回宫了。…",               // 卡片上一句话
    "synopsis": "……",                       // 详情简介
    "note": "……",                           // 详情「值得看」
    "score": 9.6,                            // 0–10，主观
    "poster": { "h": 8, "h2": 38, "accent": "#f0b45a",
                "mark": "orb", "layout": "a", "rot": -12 }
  }],
  "recommended": [{
    "id": "frieren",
    "title": "葬送的芙莉莲", "titleJa": "葬送のフリーレン",
    "year": 2023, "episodes": "28 话", "studio": "MADHOUSE",
    "badge": "必看",                         // 必看 / 私心 / 下饭 / 睡前
    "genres": [], "hook": "……", "synopsis": "……",
    "note": "推荐理由", "audience": "适合谁",
    "score": 9.5, "poster": { … }
  }]
}
```

- `current` 与 `recommended` 的字段是**刻意分开**的：当季需要放送日 / 声优，推荐需要年份 / 制作。
- `score` 在编辑条目里是站内主观评分；自动条目是 AniList 参考评分，通过 `scoreLabel` 区分，详情里写明。
- 卡片搜索会匹配中文名、日文名、声优、类型、简介、推荐语。
- 自动生成的当季条目还会带 `anilistId` / `anilistUrl` / `auto` / `scoreLabel`（AniList 参考评分）；有 override 的条目 `auto` 为 false。

封面单独放在 `data/anime-covers.json`（不塞进上面这份编辑数据）：

```jsonc
{
  "source": "AniList",
  "sourceUrl": "https://anilist.co",
  "fetched": "2026-10-20",
  "note": "……",
  "items": {
    "kusuriya-s3": {
      "anilistId": 195516,
      "anilistUrl": "https://anilist.co/anime/195516",
      "cover": "assets/leisure/covers/kusuriya-s3.jpg",
      "remote": "https://s4.anilist.co/…",
      "bytes": 36005
    }
  }
}
```

页面加载时会把 `items[id].cover` 合并到对应条目；没有记录、文件 404 或解码失败，就自动退回下面的 CSS 排版海报。

## 封面：为什么是 AniList，不是 Bangumi

`bgm.tv` / `api.bgm.tv` / `lain.bgm.tv` 在开发机上**不可达**（DNS 被污染到无关 IP，连接超时；试过公共代理也回 522）。所以：

- 用 **AniList GraphQL** 按日文名 + 年份匹配，拿 `coverImage.extraLarge`；
- `tools/fetch-covers.mjs` 下载到 `assets/leisure/covers/<id>.jpg`，并写 `data/anime-covers.json`；
- `tools/optimize-covers.py` 把图压成宽 460 的渐进式 JPEG（当前 32 张约 2.4MB），顺手把 PNG 转成 JPG；
- 运行时不访问外网，也没有防盗链/图床挂掉的问题。

> 想换成 Bangumi 的图：把 `assets/leisure/covers/` 下的同名文件替换掉即可，`cover` 路径不用改。
> 注意封面版权归原作者 / 制作方，站点只做检索展示，不二次分发原图包。

重新抓取：

```bash
node tools/fetch-covers.mjs --dry   # 只看匹配结果
node tools/fetch-covers.mjs         # 下载缺失的封面
python tools/optimize-covers.py     # 压缩 + 回写 bytes
```

AniList 有速率限制，脚本里做了 429 等待与 950ms 间隔；遇到个别条目匹配不准，在 `OVERRIDES` / `QUERY_OVERRIDES` 里锁 id 或换搜索词。

## 海报系统（无封面时的兜底）

**有封面时**用 `poster__cover` 铺满 3:4 区域，叠一层暗角，只保留左上角季档小签；竖排标题、幽灵编号、几何母题全部隐藏，避免和封面本身的构图打架。详情弹层同理，并在左下角标 `COVER / AniList`。

**没有封面时**才使用排版海报，由 `poster` 字段生成：

| 字段 | 作用 | 取值 |
| --- | --- | --- |
| `h` / `h2` | 两个色相（0–360） | 主光 / 底部反光 |
| `accent` | 母题与季档标签的颜色 | `#rrggbb` |
| `mark` | 几何母题 | `orb` `lines` `blade` `eye` `dots` `wave` `plus` `star` |
| `layout` | 标题版式 | `a`（右下）/ `b`（左下）/ `c`（顶部居中）/ `d`（左上） |
| `rot` | 母题旋转角 | -40–40 |

海报内部用 `cqw`（容器查询单位），所以同一套规则在 230px 的卡片和 320px 的详情大图里都能等比缩放。竖排日文标题、幽灵编号、季档标签、母题四层叠加，形成「唱片封套 / 剧场小册子」的感觉。封面 404 时，`dropBrokenCover()` 会摘掉 `.poster--cover`，这套排版海报自动回来。

## 追番

- 存储键：`ft.terminal.leisure.watch`
- 结构：`{ [animeId]: "watching" | "plan" | "done" }`
- 卡片右上角按钮循环：未加入 → 想看 → 在看 → 看完 → 移除
- 详情弹层可以直接选状态或移除
- 「我的追番」页签按状态分组，状态筛选的计数实时更新
- 「清空追番」有二次确认

只写 `localStorage`，不经过服务端；换设备 / 清站点数据就没了，这是刻意的。
换季后不在 `current` / `recommended` 里的条目会从「我的追番」消失（`pruneWatch` 只保留当前数据里存在的 id）；要做跨季档案得另存一份带标题的快照，目前没做。

## 换季：roll-season + overrides + GitHub Action

`tools/roll-season.mjs` 负责把「当前是哪一季」变成数据：

```bash
node tools/roll-season.mjs --dry                  # 预览当前季
node tools/roll-season.mjs --write                # 当前季已是最新则跳过
node tools/roll-season.mjs --write --force        # 强制重建当前季
node tools/roll-season.mjs --write --next         # 生成下一季
node tools/roll-season.mjs --write --season=2027-winter
```

它会：

1. 按日期算季（冬 1–3 / 春 4–6 / 夏 7–9 / 秋 10–12）；
2. 拉 AniList 该季 TV 动画（`format: TV`、`isAdult: false`、按热度取 `--limit`，默认 24）；
3. 从 AniList 字段做兜底：放送时间按 JST 换算，首播日、话数、类型、简介、参考评分都自动填；
4. 用 `data/anime-overrides.json` 覆盖标题 / 短评 / 声优 / 放送局等编辑字段；
5. 写 `data/anime.json`（`recommended` 原样保留），旧文件备份到 `data/.backup/`。

**override 结构**（按 AniList subject id 为 key，只写想改的字段）：

```jsonc
{
  "seasons": {
    "2026-autumn": { "headline": "秋天到了。", "headlineEm": "先从哪部开始？", "note": "…" }
  },
  "items": {
    "195516": {
      "id": "kusuriya-s3",
      "title": "药屋少女的呢喃 第三期",
      "titleJa": "薬屋のひとりごと 第3期",
      "posterJa": "薬屋のひとりごと",
      "day": 5, "time": "23:00", "station": "日本テレビ系",
      "episodes": "放送中", "status": "续作",
      "genres": ["古风", "推理", "宫廷"],
      "cast": ["悠木碧", "大塚剛央", "小西克幸"],
      "hook": "…", "synopsis": "…", "note": "…",
      "score": 9.6, "auto": false,
      "poster": { "h": 8, "h2": 38, "accent": "#f0b45a", "mark": "orb", "layout": "a", "rot": -12 }
    }
  }
}
```

当前 2026 秋 22 部的编辑字段已经迁进这个文件，所以即使 `--force` 重建当前季也不会把中文名 / 短评 / 声优冲掉。没有 override 的新番会显示日文名 + AniList 英文简介，卡片脚注标「参考评分」；补一次 override 就成正片。

> 以后改这 22 部的文案请改 overrides，不要只改 `anime.json`；`--force` 会用 overrides 覆盖回去。

> `--force` 会按 AniList 热度前 24 重排当前季，可能挤掉原本手工挑的条目（override 只能改字段，不能把没进前 24 的番加回来）。它只用于新季或确实要重建；日常刷新先跑不带 `--force` 的 `--write`。

**自动跑**：`.github/workflows/season-roll.yml` 在每季首日 10:00 JST（01:00 UTC）执行：

```
roll-season --write  →  fetch-covers  →  optimize-covers  →  git commit/push
```

push 后由 Netlify 自动部署。当前季没变时 `roll-season` 直接跳过，不产生空提交；失败会开一个 `[换季失败]` issue（AniList 还没收录新季 / 429 / push 被分支保护拦下都在里面）。

> 任何自动方案都不是 100%：GitHub 的 schedule 可能延迟，仓库 60 天无活动时 scheduled workflow 会被停用，AniList 也会限流。失败 issue 就是提醒；也可以在 Actions 页面手动 `Run workflow`，用 `season` / `force` 输入补跑。

## 注意

- 放送时间以 AniList 的日本放送时间为准；`24:30` 这类跨日节目按节目表原样保留，不换算成次日 00:30。
- 换季用 `node tools/roll-season.mjs --write`，别手改 `season` / `current`；页面会按 `start` / `end` 自动显示「当季」或「ARCHIVE / 已完结」。
- 封面已缓存到 `assets/leisure/covers/`，来自 AniList；版权归原作者 / 制作方，只做站内检索展示，不要再打包分发原图。
- 换季后跑 `node tools/fetch-covers.mjs && python tools/optimize-covers.py`，别只改 `anime.json`，否则新条目会退回排版海报。
- 自动抓来的标题是日文、简介是英文；要么在 `anime-overrides.json` 补，要么接受「参考评分 / 自动收录」的草稿状态。不要把自动数据当成精编数据。
- 没有封面时也不要为了「更像番剧网站」把官方 key visual 批量抓进仓库；排版海报就是兜底。
