/**
 * tools/content-build.mjs — 批量写作：Markdown → data/posts.json / data/news.json
 * 用法：node tools/content-build.mjs
 *
 * 内容与元数据分开：正文是 tools/content/*.md（编辑器里能直接预览），
 * 这里只负责补 id / 标题 / 分类 / 标签 / 日期这些结构化字段，
 * 并做一遍基本校验（必填、id 唯一、正文长度）。
 *
 * 为什么需要它：站点自带的写作入口是 CONSOLE（一次一篇，直接落盘），
 * 但**批量重写**内容时一篇篇敲表太慢 —— 把 Markdown 丢进 tools/content/、
 * 改下面两个数组，跑一条命令即可全量重建。
 * 注意：它会**整份覆盖** data/*.json，跑之前先在 CONSOLE 里导出备份
 *（旧版会留在 data/.backup/ 里，但那是服务端写入时的自动备份）。
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'tools', 'content');
const DATA = path.join(ROOT, 'data');
const AUTHOR = 'FISH TEMPLE';

/** 日期刻意排在最近两个月内，读起来像"刚刚写下的" */
const POSTS = [
  {
    id: 'post_overview', file: 'post_overview.md',
    title: '鱼灵庙现在的样子：八个板块一页看完',
    summary: '站点总览：有哪些板块、各自能做什么、三条自我约束（不打包 / 不碰音频流 / 不做登录），以及怎么在本地跑起来。',
    category: '日志', tags: ['总览', '站点', '开始'],
    date: '2026-10-06T09:10:00+08:00', pinned: true,
  },
  {
    id: 'post_architecture', file: 'post_architecture.md',
    title: '零依赖是怎么落地的',
    summary: '没有打包器的前端怎么组织：视图契约、注册表扩展点、事件总线，以及为什么路由切换要换掉整个 #view 节点。',
    category: '技术', tags: ['架构', '前端', '设计'],
    date: '2026-09-28T14:30:00+08:00',
  },
  {
    id: 'post_music', file: 'post_music.md',
    title: '音乐台：官方播放器 + 自建歌词',
    summary: '一个输入框分派三种意图、官方嵌入只能给四个参数的困境、自建歌词时钟的取舍，以及会员曲目为什么会被明确提示。',
    category: '技术', tags: ['音乐', '网易云', '歌词'],
    date: '2026-09-22T20:05:00+08:00',
  },
  {
    id: 'post_album', file: 'post_album.md',
    title: '770 张照片与一条插画管线',
    summary: '相册导入管线（去重 / EXIF / 缩放 / 汇总）、画廊三件事，以及 Pixiv 直连失败的来龙去脉和把冷加载从 33 秒压到 0.1 秒的做法。',
    category: '技术', tags: ['相册', 'Pixiv', '缓存'],
    date: '2026-09-16T11:20:00+08:00',
  },
  {
    id: 'post_mines', file: 'post_mines.md',
    title: '扫雷：把规则引擎和画面拆开',
    summary: '引擎与视图分家的好处、首点安全与和弦的实现，以及测试抓到的三个真 bug（下标错传、循环测量、长按吞点击）。',
    category: '技术', tags: ['扫雷', '游戏', '状态'],
    date: '2026-09-11T19:40:00+08:00',
  },
  {
    id: 'post_design', file: 'post_design.md',
    title: '信号黄、直角与 HUD 角标',
    summary: '设计令牌、三套主题、为什么全站零圆角、动效只做有信息量的那几种，以及品牌标记的生成与 favicon 缓存坑。',
    category: '设计', tags: ['设计', '排版', 'UI'],
    date: '2026-09-05T16:40:00+08:00',
  },
  {
    id: 'post_selfcheck', file: 'post_selfcheck.md',
    title: '162 项自检是怎么长出来的',
    summary: '没有编译器兜底，就用真实浏览器跑自动化检查：覆盖范围、被它抓出来的三个问题，以及"断言不变量而不是像素"的教训。',
    category: '技术', tags: ['自检', '测试', 'CDP'],
    date: '2026-08-30T08:15:00+08:00',
  },
];

const NEWS = [
  {
    id: 'news_launch', file: 'news_launch.md',
    title: 'FISH 鱼の灵庙 上线：八个板块、162 项自检',
    summary: '站点正式启用：音乐台、相册与随机插画、扫雷、发布控制台与仪表盘，全部零依赖，可直接静态托管。',
    category: '公告', tags: ['上线', '版本'],
    date: '2026-10-06T10:00:00+08:00', level: 1, pinned: true,
  },
  {
    id: 'news_mines', file: 'news_mines.md',
    title: '新增板块：MINES 扫雷',
    summary: '三档难度、首点安全、和弦、键盘与触屏都能玩；切板块与刷新都不会中断对局。',
    category: '更新', tags: ['扫雷', '新板块'],
    date: '2026-09-11T20:10:00+08:00', level: 0,
  },
  {
    id: 'news_lyrics', file: 'news_lyrics.md',
    title: '歌词跟唱上线，会员曲目不再「假播放」',
    summary: '各板块标题栏显示歌词、首页配波浪音浪；会员曲目会提前判定并给出可播放的同名版本。',
    category: '更新', tags: ['歌词', '音乐'],
    date: '2026-09-22T21:00:00+08:00', level: 0,
  },
  {
    id: 'news_export', file: 'news_export.md',
    title: '边界说明：不做账号登录，内容请定期导出',
    summary: '为什么不实现网易云登录、想听 VIP 曲目该怎么办，以及静态模式下内容存在浏览器里需要备份。',
    category: '维护', tags: ['说明', '备份'],
    date: '2026-09-30T09:30:00+08:00', level: 1,
  },
];

const readBody = async (file) => {
  const raw = await fs.readFile(path.join(SRC, file), 'utf8');
  return raw.replace(/\r\n/g, '\n').trim() + '\n';
};

const build = async (list, kind) => {
  const out = [];
  for (const item of list) {
    const content = await readBody(item.file);
    if (content.length < 120) throw new Error(`${item.id} 正文过短（${content.length}）`);
    const rec = {
      id: item.id,
      title: item.title,
      summary: item.summary,
      category: item.category,
      tags: item.tags || [],
      cover: item.cover || '',
      author: AUTHOR,
      date: item.date,
      pinned: !!item.pinned,
      level: item.level ?? 0,
      draft: false,
      content,
      updatedAt: new Date(item.date).toISOString(),
    };
    out.push(rec);
  }
  const ids = new Set(out.map((r) => r.id));
  if (ids.size !== out.length) throw new Error(`${kind}: id 有重复`);
  return out.sort((a, b) => new Date(b.date) - new Date(a.date));
};

const posts = await build(POSTS, 'posts');
const news = await build(NEWS, 'news');
await fs.writeFile(path.join(DATA, 'posts.json'), JSON.stringify(posts, null, 2) + '\n');
await fs.writeFile(path.join(DATA, 'news.json'), JSON.stringify(news, null, 2) + '\n');

const stat = (list) => `${list.length} 篇 / 正文共 ${list.reduce((a, x) => a + x.content.length, 0)} 字`;
console.log('已写入 data/posts.json  ', stat(posts));
console.log('已写入 data/news.json   ', stat(news));
console.log('文章：', posts.map((p) => `${p.id}（${p.category}）`).join(' · '));
console.log('公告：', news.map((p) => `${p.id}（level ${p.level}${p.pinned ? ' · 置顶' : ''}）`).join(' · '));
