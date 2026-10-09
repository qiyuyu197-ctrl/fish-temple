/**
 * main.js — 应用入口
 * ------------------------------------------------------------------
 * 启动顺序：
 *   Store 播种 → Theme 应用 → Shell 外壳 → Player 音频 → Stage 画廊
 *   → 注册视图与扩展 → 命令面板 → 路由解析 → 关闭 Boot 动画
 *
 * 想扩展站点？优先在这里用 Registry.* 注册，而不是改视图代码：
 *   Registry.addRoute({...}) / addImageProvider / addCommand / addNav / addWidget
 * 详见 README.md 的「扩展指南」一节。
 */

import { SITE, API } from './config/site.config.js';
import { bus } from './core/bus.js';
import { initStore, Settings, Posts, News, ReadState, Api } from './core/store.js';
import { Theme } from './core/theme.js';
import { Router, defineView } from './core/router.js';
import { Registry } from './core/registry.js';
import { Player } from './core/player.js';
import { Motion } from './core/motion.js';
import { Stage } from './plugins/stage.js';
import { Lyrics } from './plugins/lyrics.js';

import { Shell } from './ui/shell.js';
import { Toast, download } from './ui/toast.js';
import { Palette, openPalette } from './ui/palette.js';
import { MiniPlayer } from './ui/miniaudio.js';
import { AlmanacUI } from './ui/almanac.js';
import { EmbedHost } from './ui/embed-host.js';
import { initLyricsUI } from './ui/lyrics.js';
import { initWaveRow } from './ui/wave-row.js';
import { Boot } from './ui/boot.js';

import home from './views/home.js';
import logs from './views/logs.js';
import music from './views/music.js';
import gallery from './views/gallery.js';
import mine from './views/mine.js';
import tools from './views/tools.js';
import admin from './views/admin.js';
import notfound from './views/notfound.js';
import { redirectView } from './views/redirect.js';

/* ---------------- 插件示例（想精简可以直接删掉这一段） ----------------
 * 演示三种扩展方式：首页插槽组件、命令面板命令、动态路由。
 * 新增插件时照着这里写即可，不必修改任何视图或核心代码。
 * 详见 README.md「扩展指南」以及 src/core/registry.js 的插槽说明。
 */
import { sessionWidget, footerWidget } from './plugins/example-widget.js';
import { dashboardView } from './plugins/dashboard-view.js';
import { bootstrapPlaylist } from './plugins/netease.js';
import { Almanac } from './plugins/almanac.js';
import * as Mines from './plugins/minesweeper.js';
import { MinesLive } from './views/mine.js';

Registry.addWidget(sessionWidget);   // 首页首屏下方：会话状态条
Registry.addWidget(footerWidget);    // 首页页脚前：扩展说明位
Registry.addRoute(dashboardView);    // 新页面：#/dashboard
Registry.addNav({ id: 'dashboard', path: '#/dashboard', label: 'STATUS', cn: '仪表盘' });
Registry.addCommand({
  id: 'export-all',
  label: '导出全部内容为 JSON',
  hint: 'IO',
  run: (c) => c.exportAll(),
});
Registry.addCommand({
  id: 'mine',
  label: '扫雷：新的一局',
  hint: 'GAME',
  run: (c) => {
    // 名字叫「新的一局」，那就真的开新局：不在扫雷板块时先切过去，等视图挂上再重开
    if (location.hash !== '#/mine') {
      c.navigate('#/mine');
      setTimeout(() => MinesLive.current?.newGame(), 420);
    } else {
      MinesLive.current?.newGame();
    }
  },
});

/** 暴露给控制台调试与视图模板使用 */
window.__SITE__ = SITE;

/* ---------------- 命令面板上下文 ---------------- */
const ctx = {
  navigate: (to) => Router.navigate(to),
  refresh: () => Router.resolve(),
  togglePlay: () => Player.toggle(),
  nextTrack: () => Player.next(),
  prevTrack: () => Player.prev(),
  randomArt: async () => {
    const cur = await Stage.random({});
    if (cur) Toast.ok(cur.title ? `已抽取：${cur.title}` : '已抽取新插画');
    return cur;
  },
  cycleTheme: () => Theme.cycle(),
  setTheme: (id) => Theme.set(id, { announce: true }),
  openPixiv: () => Stage.openPixiv(),
  exportAll: () => {
    download('content-export.json', JSON.stringify({
      exportedAt: new Date().toISOString(),
      posts: JSON.parse(Posts.exportJSON()),
      news: JSON.parse(News.exportJSON()),
    }, null, 2), 'application/json');
    Toast.ok('已导出全部内容');
  },
  stats: () => ({
    posts: Posts.published.length,
    news: News.published.length,
    unread: ReadState.unreadNews,
    tracks: Player.tracks.length,
    providers: Registry.imageProviders.length,
  }),
};

/* ---------------- 启动 ---------------- */

async function boot() {
  // 通知内联兜底脚本：应用已成功启动
  document.documentElement.dataset.booted = '1';

  // 0) 先用配置里的站点名设置页签标题，避免首屏闪现占位标题
  // 站名来自 site.config.js 的 SITE.name，这里只负责把它写进页签
  document.title = `${SITE.name} // 终端`;
  document.documentElement.lang = SITE.lang;

  // 1) 数据
  await initStore();

  // 2) 主题与设置
  Theme.init();
  if (Settings.get('reduceMotion')) document.documentElement.dataset.reduceMotion = '1';

  // 3) 外壳
  Toast.init();
  Shell.init();

  // 4) 音频引擎 + 迷你播放条
  Player.init();
  if (Settings.get('shuffle')) Player.setShuffle(true);
  // 播放列表以本地保存的网易云曲目为准（首次访问为空，等用户搜索加入）
  bootstrapPlaylist();
  MiniPlayer.init();

  // 4.5) 黄历小组件（顶栏搜索左边那个按钮）
  //      黄历数据是懒加载的：只有第一次打开面板才会去取，
  //      命中吉日时播放吉日之歌（默认赵季平《关羽之歌》）。
  AlmanacUI.init();

  // 5) 插画引擎
  Stage.init();

  // 5.5) 歌词引擎 + 板块标题栏与首页的歌词显示 + 首页圆形音浪
  Lyrics.init();
  initLyricsUI();
  initWaveRow();

  // 6) 视图注册（顺序即导航顺序，可被 Registry.addNav 覆盖）
  //    文章与公告已合并到 #/logs；#/posts、#/news、#/post/<id>、#/newsItem/<id>
  //    注册成兼容跳转，老链接不会 404（见 views/redirect.js）
  [
    home, logs, music, gallery, mine, tools, admin, notfound,
    redirectView('posts', 'logs'),
    redirectView('post', 'logs'),
    redirectView('news', 'logs'),
    redirectView('newsItem', 'logs'),
  ].forEach(defineView);

  // 7) 由 Registry 追加的路由（插件注册的页面都在这里生效）
  Registry.routes.forEach((v) => defineView(v));

  // 8) 命令面板
  Palette.init(ctx);

  // 8.5) 路由切换时决定网易云播放器的停靠方式：
  //      音乐台内嵌，其他板块折叠停靠在右下角（iframe 不重建，播放不中断）
  bus.on('route:change', (r) => EmbedHost.noteRoute(r?.view));

  // 9) 全局兜底
  window.addEventListener('error', (e) => {
    if (e.message?.includes('ResizeObserver')) return;
    console.error('[global]', e.error || e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[promise]', e.reason);
  });

  // 10) 路由
  await Router.init();

  // 11) 首屏动效与服务器探测（不阻塞渲染）
  Motion.reveal(document);
  setTimeout(() => {
    if (API.enabled) Api.probe().then((ok) => {
      if (ok) console.info('%c[server] 在线：发布内容将直接写入 data/', 'color:#E5BE00');
    });
  }, 1200);

  // 12) 关闭启动动画
  await Boot.run();
}

document.addEventListener('DOMContentLoaded', () => {
  boot().catch((err) => {
    console.error('[boot] 启动失败', err);
    document.getElementById('boot')?.classList.add('is-done');
    const v = document.getElementById('view');
    if (v) {
      v.innerHTML = `<section class="viewhead"><div class="viewhead__row">
        <h1 class="viewhead__title display">启动失败</h1></div>
        <p class="muted" style="margin-top:16px">通常是因为以 <b>file://</b> 直接打开导致模块加载被浏览器拦截。</p>
        <pre class="mono" style="white-space:pre-wrap;margin-top:16px;font-size:12px">${String(err?.stack || err)}</pre>
        <p class="mono" style="margin-top:16px">请在项目目录运行：<b>node server.mjs</b>，然后访问 http://localhost:5173</p>
        </section>`;
    }
  });
});

/* 供调试：window.Terminal.randomArt() 等 */
window.Terminal = { ctx, Player, Stage, Lyrics, Registry, Router, Posts, News, Settings, Theme, Palette, openPalette, EmbedHost, Mines, MinesLive, Almanac, AlmanacUI };
