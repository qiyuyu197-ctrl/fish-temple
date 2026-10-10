/**
 * site.config.js — 站点唯一配置入口
 * ------------------------------------------------------------------
 * 改这个文件即可完成 90% 的个性化，无需触碰任何组件代码。
 * 每一项都带注释；删除可选字段时会自动回退到内置默认值。
 */

export const SITE = {
  /** 站点名（顶栏 logo 文案 + 浏览器页签 + 页脚） */
  name: 'FISH 鱼の灵庙',
  /** 顶栏副标题 / 首屏小字标识（建议保留英文，代码里做标识用） */
  subtitle: 'FISH TEMPLE / 001',
  /** 所有者 / 作者署名（页脚、文章作者、控制台默认值） */
  author: 'FISH TEMPLE',
  /**
   * 首屏巨型标题，一行一个元素，最多 3 行。
   *   em  → 描边空心字
   * 想换成别的口号，改这里即可，不用动 src/views/home.js。
   */
  heroTitle: [
    { text: 'FISH 鱼の灵庙' },
    { text: 'TERMINAL', style: 'em' },
  ],
  /** 一句话简介，用于首屏与页脚 */
  tagline: '记录、播放、归档。一个零依赖的静态终端。',
  /** 站点描述（SEO + 页脚 SITE 区） */
  description: '静态站点 · 站内音乐播放 · Pixiv 随机插画 · 公告与文章发布',
  /** 站点语言 */
  lang: 'zh-CN',
  /** 版本号，显示在页脚 BUILD 区 */
  version: '1.0.0',
  /** 建站年份（页脚版权起始年） */
  since: 2024,
  /** 音频/图片未就绪时的占位策略：'placeholder' | 'hide' */
  mediaFallback: 'placeholder',
};

/**
 * 主题。首个为默认主题；切换顺序按数组顺序循环。
 * 新增主题：在 styles/tokens.css 里加 [data-theme="your-id"] 变量块，然后在此追加。
 */
export const THEMES = [
  { id: 'paper',     label: 'PAPER',     hint: '奶油纸 · 日间' },
  { id: 'night',     label: 'NIGHT',     hint: '暗色终端' },
  { id: 'blueprint', label: 'BLUEPRINT', hint: '蓝图 · 冷色' },
];

/** 导航。path 使用 hash 路由；badge 可写 'NEW'、'BETA' 或数字。 */
export const NAV = [
  { id: 'home',    path: '#/',          label: 'HOME',    cn: '首页' },
  { id: 'logs',    path: '#/logs',      label: 'LOGS',    cn: '文章与公告', badgeKey: 'unreadNews' },
  { id: 'forum',   path: '#/forum',     label: 'FORUM',   cn: '论坛' },
  { id: 'music',   path: '#/music',     label: 'MUSIC',   cn: '音乐' },
  { id: 'gallery', path: '#/gallery',   label: 'GALLERY', cn: '插画' },
  { id: 'mine',    path: '#/mine',      label: 'MINES',   cn: '扫雷' },
  { id: 'tools',   path: '#/tools',     label: 'TOOLS',   cn: '工具台' },
  { id: 'admin',   path: '#/admin',     label: 'CONSOLE', cn: '发布' },
];

/** 顶栏滚动播报条内容；{latest} 会替换成最新公告标题 */
export const TICKER = [
  'SYSTEM ONLINE',
  '网易云搜索通道已就绪',
  'PIXIV 随机插画通道已连接',
  '{latest}',
  'CTRL + K 打开命令面板',
];

/** 页脚链接。kind: 'pixiv' 会按 Pixiv 规则补齐参数 */
export const FOOTER_LINKS = [
  { label: 'Pixiv 主页', href: 'https://www.pixiv.net/', kind: 'pixiv' },
  { label: 'Pixiv 发现',  href: 'https://www.pixiv.net/discovery', kind: 'pixiv' },
  { label: 'Pixiv 排行',  href: 'https://www.pixiv.net/ranking.php', kind: 'pixiv' },
  { label: '发送邮件',    href: 'mailto:hello@example.com' },
];

/**
 * Pixiv 集成配置
 * ------------------------------------------------------------------
 * 浏览器端无法直接调用 Pixiv 官方 API（需要 OAuth + 服务端代理），
 * 因此这里采用「深链 + 可插拔代理」方案：
 *   1. 深链：任何作品都能用 id 拼出可访问的 URL，作为兜底与跳转。
 *   2. 代理：把自建的图片代理地址填进 proxy，即可在站内直接显示 Pixiv 缩略图。
 *      合法合规的自建代理通常形如：
 *        https://your-worker.workers.dev/?url={encoded}
 *      其中 {url} 会被替换成 encodeURIComponent(原始图片地址)。
 */
export const PIXIV = {
  /**
   * 图片镜像。
   * 为什么必须有它：pixiv.net 与 i.pximg.net 在国内网络下被 DNS 污染
   * （实测解析到 FaceBook / 已知投毒 IP，直连必然超时），而且 i.pximg.net
   * 有防盗链（Referer 不是 pixiv 就 403）。pixiv.re 这类社区镜像是可达的，
   * 且支持 /{作品id}.jpg 与多图 /{作品id}-{页码}.jpg 两种写法。
   * 首次取某张图时镜像需要回源（可能要 20-40 秒），之后就是秒开。
   */
  mirror: 'https://pixiv.re',
  /** 随机作品接口（由 server.mjs 代理 api.lolicon.app，因为它不返回 CORS 头） */
  randomEndpoint: '/api/pixiv/random',
  /** 是否在站内直接加载 Pixiv 图片（走上面那个镜像） */
  inlineImages: true,
  /** 另一层自建代理模板（可选，{url} 会被替换成图片地址）；留空则直接用镜像 */
  proxy: '',
  /** 随机插画默认搜索关键词（用于 Pixiv 搜索深链） */
  defaultKeyword: '風景',
  /** 常用关键词快捷按钮 */
  keywords: ['風景', '女の子', 'オリジナル', 'メカ', '空', '猫'],
  /** 每天榜单 / 关注 / 发现 等入口 */
  entries: [
    { label: 'Pixiv 发现',   href: 'https://www.pixiv.net/discovery' },
    { label: '综合排行',     href: 'https://www.pixiv.net/ranking.php?mode=daily' },
    { label: '新人排行',     href: 'https://www.pixiv.net/ranking.php?mode=rookie' },
    { label: '关注的新作',   href: 'https://www.pixiv.net/bookmark_new_illust.php' },
  ],
  /** 站内直接显示的插画 id 白名单（在 Pixiv 作品页 URL 中 /artworks/ 后面的数字） */
  seedIds: [],
  /** 每个作品页的 URL 模板 */
  artworkUrl: (id) => `https://www.pixiv.net/artworks/${id}`,
  /** 搜索 URL 模板 */
  searchUrl: (kw, mode = 's_tag_full') =>
    `https://www.pixiv.net/tags/${encodeURIComponent(kw)}/artworks?mode=${mode}`,
};

/**
 * 随机插画数据源（可插拔）
 * ------------------------------------------------------------------
 * 每个 provider: { id, label, kind, ... }
 *   kind: 'remote'  远端 / 本站代理接口，返回图片 URL（或带元数据的对象）
 *         'local'   本地清单（file 指定，默认 data/gallery.json）
 *         'pixiv'   Pixiv 深链，不返回图片本体，只做跳转（永远排在最后兜底）
 *   pick(json) 可以返回字符串数组，也可以返回 [{ url, title, author, pixivId }]
 *   可选：probeTimeout（预加载校验超时，毫秒）、loadingText（加载提示文案）
 *
 * 顺序 = 自动模式的尝试顺序：第一个能出图的源就赢。
 * **手机相册导入的本地照片排第一**（离线可用、秒出图）；
 * PIXIV 随机排在最后但可用 —— 它走 server.mjs 代理 + pixiv.re 镜像，
 * 详见 README「Pixiv 图片为什么在国内显示不出来」一节。
 */
export const IMAGE_PROVIDERS = [
  {
    id: 'album',
    label: '相册 PHOTO ALBUM',
    kind: 'local',
    file: 'data/album.json',
    note: '手机相册导入的本地照片（tools/album-pull.ps1 + tools/album-build.py），完全离线',
  },
  {
    id: 'local',
    label: 'LOCAL 本地画廊',
    kind: 'local',
    file: 'data/gallery.json',
    note: '来自 data/gallery.json，完全离线可用',
  },
  {
    id: 'nekos',
    label: 'NEKOS.BEST',
    kind: 'remote',
    /**
     * ⚠️ 实测：nekos.best 的接口**不返回 CORS 头** —— 服务端 curl 能拿到 200，
     * 但浏览器 fetch 必被拦。也就是说这个源在本地与线上都出不了图，
     * 留着是为了"可插拔数据源"的示范。想让它真能用，得像 pixiv 那样走站内代理
     * （server.mjs / netlify/functions/api.mjs 已经具备这个能力）。
     */
    note: '公开 API（无 CORS 头，浏览器直连不可用；仅作可插拔示例）',
    endpoint: 'https://nekos.best/api/v2/neko?amount=12',
    pick: (json) => (json?.results || []).map((r) => r.url).filter(Boolean),
  },
  {
    id: 'waifu',
    label: 'WAIFU.PICS',
    kind: 'remote',
    /** ⚠️ 同上：接口无 CORS 头；而且本机连这个域名都不通（curl 直接超时），实测不可用 */
    note: '公开 API（无 CORS 头 + 域名不可达，实测不可用；仅作可插拔示例）',
    endpoint: 'https://api.waifu.pics/many/sfw/waifu',
    method: 'POST',
    body: { exclude: [] },
    pick: (json) => (json?.files || []).filter((u) => typeof u === 'string' && !/\.gif$/i.test(u)),
  },
  {
    id: 'pixiv',
    label: 'PIXIV 随机',
    kind: 'remote',
    note: '经 server.mjs 代理取随机作品，图片走 pixiv.re 镜像（首次较慢，之后秒开）',
    /**
     * endpoint 可以是函数：把「本次会话已经展示过的作品 id」报给服务端，
     * 服务端按抽卡池发放，保证不会又发回同一张。
     * num 上限是 20（上游限制），这里一次要 8 张。
     */
    endpoint: ({ exclude } = {}) => {
      const base = `${PIXIV.randomEndpoint}?num=8&r18=0`;
      return exclude?.length ? `${base}&exclude=${encodeURIComponent(exclude.join(','))}` : base;
    },
    /** 每次都重新取一批没见过的（不要用客户端池缓存，否则会在同一批里打转） */
    freshEachDraw: true,
    /**
     * 不做预加载校验，直接显示。
     * 因为图片已经走本站 /api/pixiv/image 代理 + 磁盘缓存：命中是毫秒级，冷启动也只有
     * 几十 KB（上游返回的是 540px 小图）。先探测再显示反而会让用户白等几十秒。
     */
    skipProbe: true,
    pick: (json) => (json?.items || []).map((it) => ({
      url: it.url,
      thumb: it.url,
      full: it.full || '',
      title: it.title || `Pixiv ${it.pid}`,
      author: it.author || 'PIXIV',
      pixivId: it.pid,
      pageUrl: it.pageUrl,
    })),
    // 万一某个源没走代理，还有这个兜底超时
    probeTimeout: 20000,
    loadingText: '正在取 Pixiv 随机作品…',
  },
  {
    id: 'pixiv-link',
    label: 'PIXIV 深链',
    kind: 'pixiv',
    note: '兜底：不代理图片，直接跳转 Pixiv 搜索 / 榜单',
  },
];

/** 相册（本地照片）相关配置 */
export const ALBUM = {
  manifest: 'data/album.json',
  /** 画廊页网格一次渲染多少张（其余靠「加载更多」） */
  pageSize: 24,
};

/**
 * 站内音乐播放列表的「本地音频」部分
 * ------------------------------------------------------------------
 * ⚠️ 当前站点默认不使用本地音频：播放列表整体由网易云曲目组成
 *    （见 src/plugins/netease.js 与 src/views/music.js，列表保存在浏览器本地）。
 *
 * 什么时候需要这个数组？
 *   想往列表里加「自托管的音频」（比如原创 demo、已授权的音乐）时，
 *   把文件放进 assets/audio/，然后按下例填进来即可 —— 两种来源可以混在一个列表里，
 *   界面会自动区分：本地音频走 <audio>（有进度条与真频谱），
 *   网易云曲目走官方外链播放器。
 *
 * 想生成一个可用的示例音频：node tools/make-audio.mjs
 */
export const PLAYLIST = [
  // {
  //   id: 'tr-01',
  //   title: '曲名',
  //   artist: '作者',
  //   src: 'assets/audio/your-track.mp3',
  //   cover: '',
  //   tags: ['demo'],
  // },
];

/** 播放器行为 */
export const PLAYER = {
  /**
   * 自动下一首（本地音频）。
   * 本地音频有真的 `ended` 事件，因此可靠。
   */
  autoplayNext: true,
  /**
   * 网易云曲目优先「站内直放」——经本站 /api/netease/audio 同源转发音频流，
   * 由页面自己的 <audio> 播放，而不是官方 iframe：
   *
   *   true （推荐）<audio> 有真实的 duration / currentTime / ended：
   *                · 一首一定**完整放完**，不会被估算提前掐掉；
   *                · 切歌由媒体管线驱动，**后台标签页 / 最小化 / 移动端息屏都能自动下一首**
   *                  （不再依赖会被浏览器节流的定时器）；
   *                · 顺带获得真进度条、拖动进度、音量与锁屏控制（Media Session）。
   *                  频谱仍是合成音浪：Web Audio 只给自托管音频建图，见 core/player.js
   *                  的 ensureGraph（把直放音频接进 AudioContext 会让播放依赖它，
   *                  上下文一挂就彻底没声音 —— 移动端后台播放优先）。
   *   false        回到官方外链播放器（iframe）的老行为：站内拿不到进度与结束回调，
   *                只能按时长估算切歌 —— 后台被节流时就会出现「放着放着不切了」。
   *
   * 直放不可用的曲目（会员 / 版权受限 / 纯静态部署没有 /api）会自动退回官方播放器，
   * 与这个开关无关。详见 src/plugins/netease.js 顶部的能力边界说明。
   */
  directAudio: true,
  /**
   * 是否在 iOS 上建立 Web Audio 频谱图。
   *
   * 默认 false：iOS 会把 AudioContext 在后台挂起，而 `createMediaElementSource` 之后
   * <audio> 的声音是**经过**这个上下文输出的 —— 上下文一挂，声音就没了（界面还在"播放中"）。
   * 移动端「后台能一直放完并自动切歌」比频谱动画重要，所以 iOS 上退化成合成音浪。
   */
  visualizerOnIOS: false,
  /** 提前多少秒把下一首预取进浏览器缓存（0 = 关闭）。切歌的"丝滑"就靠它 */
  preloadLead: 45,
  /**
   * 自动下一首（网易云外链曲目）—— **默认开启**，因为"放完就接上"才是听歌的常态。
   *
   * ⚠️ 只在 directAudio=false，或者这一首只能走官方播放器时才用得上：
   *    官方 iframe 没有播放结束回调，只能按时长估算，估算在后台必然不可靠。
   */
  embedAutoplayNext: true,
  shuffle: false,
  /** 默认音量 0~1（本地音频与站内直放的网易云曲目都适用；只有退回到官方外链播放器时，音量才需要在播放器内调整） */
  volume: 0.8,
  /** 是否在首次用户交互后自动开始播放（浏览器策略要求用户手势） */
  autoStart: false,
  /** 可视化条数量 */
  bars: 48,
};

/** 文章 / 公告 分类法，用于列表筛选与管理端下拉 */
export const CATEGORIES = {
  posts: ['日志', '技术', '随笔', '评测', '图集'],
  news: ['公告', '更新', '维护', '活动'],
};

/** 内容存储键名与本地存储前缀 */
export const STORAGE_PREFIX = 'ft.terminal';
export const CONTENT_VERSION = 3;

/**
 * 黄历小组件（顶栏搜索左边那个按钮）
 * ------------------------------------------------------------------
 * 打开面板时若「今天」或「明天」是吉日，自动播放吉日之歌；
 * 也可以查某一天，那一天是吉日同样播放。
 *
 * 数据来源：assets/vendor/lunar-javascript（MIT，见同目录 LICENSE），
 * 只在**第一次打开面板**时按需加载，平时不占首屏。
 * 判定规则（宜忌 / 建除十二神 / 二十八宿 / 黄道黑道 → 打分）见 src/plugins/almanac.js，
 * 面板上会把理由一并显示出来，不做"黑箱吉凶"。
 */
export const ALMANAC = {
  enabled: true,

  /**
   * 吉日之歌。命中吉日时播放。
   *   · 默认走站内已有的同源音频转发（依赖 server.mjs 的 /api/netease/audio）；
   *   · 想换成自己手里的文件：把 src 指向 assets/audio/ 下的文件即可（此时忽略 neteaseId）。
   */
  anthem: {
    title: '关羽之歌',
    artist: '赵季平',
    /** 赵季平《三国演义》电视剧配乐 · 关羽之歌（约 81 秒，匿名态可播放） */
    neteaseId: '1345751384',
    src: '',
    volume: 0.9,
    /** 打开面板命中吉日时是否自动播放（关掉就只显示提示，要手动点才放） */
    autoplay: true,
    /** 播放前是否暂停站内正在放的歌（两个音源同时响会很难听） */
    pauseMusic: true,
  },

  /** 判定为吉日所需的最低分（规则见 plugins/almanac.js，面板上会显示理由） */
  luckyScore: 2,
};

/** 管理端可用的内容写入接口（由 server.mjs 提供）；纯静态部署时自动降级为导出文件 */
export const API = {
  base: '/api',
  enabled: true,
  timeout: 4000,
};

/** 命令面板额外注册的命令（可自由增删） */
export const COMMANDS = [
  { id: 'goto-home',   label: '前往首页',        hint: 'G H', run: (ctx) => ctx.navigate('#/') },
  { id: 'goto-music',  label: '打开音乐台（网易云搜索）', hint: 'G M', run: (ctx) => ctx.navigate('#/music') },
  { id: 'goto-gallery',label: '打开插画画廊',    hint: 'G G', run: (ctx) => ctx.navigate('#/gallery') },
  { id: 'random-art',  label: '随机一张插画',    hint: 'R',   run: (ctx) => ctx.randomArt() },
  { id: 'toggle-play', label: '播放 / 暂停',     hint: 'SPC', run: (ctx) => ctx.togglePlay() },
  { id: 'next-track',  label: '下一首',          hint: 'N',   run: (ctx) => ctx.nextTrack() },
  { id: 'theme',       label: '切换主题',        hint: 'T',   run: (ctx) => ctx.cycleTheme() },
  { id: 'new-post',    label: '写一篇新文章',    hint: '',    run: (ctx) => ctx.navigate('#/admin?tab=posts&new=1') },
  { id: 'new-news',    label: '发一条新公告',    hint: '',    run: (ctx) => ctx.navigate('#/admin?tab=news&new=1') },
  { id: 'pixiv',       label: '在 Pixiv 中搜索', hint: '',    run: (ctx) => ctx.openPixiv() },
];
