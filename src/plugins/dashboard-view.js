/**
 * plugins/dashboard-view.js — 扩展点演示：注册一个新路由
 * ------------------------------------------------------------------
 * 这个文件没有放进 src/views/，而是通过 main.js 里的
 *   Registry.addRoute(dashboardView)
 * 注册。它证明「新增一个页面」不需要改路由表或导航数组。
 *
 * 仪表盘展示全站统计：内容分布、发布节奏、运行状态。
 */

import { esc } from '../util/dom.js';
import { Posts, News, ReadState, fmtDate } from '../core/store.js';
import { Registry } from '../core/registry.js';
import { Player } from '../core/player.js';
import { Theme } from '../core/theme.js';
import { Stage } from './stage.js';
import { Motion } from '../core/motion.js';
import { viewhead } from '../ui/bits.js';

/** 极简柱状图 */
function barChart(pairs, { height = 120 } = {}) {
  const max = Math.max(1, ...pairs.map((p) => p[1]));
  return `
  <div class="grid" style="gap:10px">
    ${pairs.map(([label, value]) => `
      <div class="grid" style="grid-template-columns:110px 1fr 46px;gap:10px;align-items:center">
        <span class="mono faint" style="font-size:var(--fs-2xs);text-align:right;overflow:hidden;text-overflow:ellipsis">${esc(label)}</span>
        <span style="height:14px;background:var(--bg-sunk);border:1px solid var(--border);display:block;position:relative">
          <i style="position:absolute;inset:0 auto 0 0;width:${((value / max) * 100).toFixed(1)}%;background:var(--signal);display:block"></i>
        </span>
        <b class="mono" style="font-size:var(--fs-xs)">${String(value).padStart(2, '0')}</b>
      </div>`).join('')}
  </div>`;
}

/** 环形图 */
function donut(pairs, size = 150) {
  const total = pairs.reduce((a, [, v]) => a + v, 0) || 1;
  const R = size / 2 - 12;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const colors = ['var(--signal)', 'var(--ink-100)', 'var(--alert)', 'var(--ok)', 'var(--ink-40)', 'var(--ink-25)'];
  const arcs = pairs.map(([label, v], i) => {
    const frac = v / total;
    const dash = `${(frac * C).toFixed(2)} ${C.toFixed(2)}`;
    const offset = -acc * C;
    acc += frac;
    return `<circle r="${R}" cx="${size / 2}" cy="${size / 2}" fill="none"
      stroke="${colors[i % colors.length]}" stroke-width="14"
      stroke-dasharray="${dash}" stroke-dashoffset="${offset.toFixed(2)}" />`;
  }).join('');
  return `
  <div style="display:flex;gap:var(--sp-4);align-items:center;flex-wrap:wrap">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg);flex:0 0 auto">
      <circle r="${R}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="var(--bg-sunk)" stroke-width="14" />
      ${arcs}
    </svg>
    <div class="grid" style="gap:6px">
      ${pairs.map(([label, v], i) => `
        <div style="display:flex;align-items:center;gap:8px">
          <span style="width:10px;height:10px;background:${colors[i % colors.length]};display:block;border:1px solid var(--border)"></span>
          <span style="font-size:var(--fs-sm)">${esc(label)}</span>
          <b class="mono" style="font-size:var(--fs-2xs);color:var(--fg-faint)">${v}</b>
        </div>`).join('')}
    </div>
  </div>`;
}

function countBy(list, keyFn) {
  const m = new Map();
  list.forEach((it) => {
    const k = keyFn(it) || '未分类';
    m.set(k, (m.get(k) || 0) + 1);
  });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export const dashboardView = {
  id: 'dashboard',
  title: '仪表盘',

  render() {
    const posts = Posts.sorted;
    const news = News.sorted;
    const all = [...posts, ...news];
    const byCategory = countBy(all, (x) => x.category);
    const totalChars = all.reduce((a, x) => a + (x.stats?.chars || 0), 0);
    const totalMinutes = all.reduce((a, x) => a + (x.stats?.minutes || 0), 0);

    // 近 6 个月发布量
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const n = all.filter((x) => String(x.date).slice(0, 7) === key).length;
      months.push([key, n]);
    }

    const providers = Registry.imageProviders;
    const tracks = Player.tracks;

    return `
    <section>
      ${viewhead({
        title: 'DASHBOARD',
        sub: '这一页不在内置导航里，而是由 Registry.addRoute() 动态注册的插件视图 —— 演示如何在不修改核心代码的前提下新增完整页面。',
        idx: 'PLUGIN / DASHBOARD',
        meta: [
          { label: 'ENTRIES', value: String(all.length).padStart(2, '0') },
          { label: 'CHARS', value: totalChars.toLocaleString('en-US') },
          { label: 'READ TIME', value: `${totalMinutes} MIN` },
          { label: 'PROVIDERS', value: String(providers.length) },
        ],
        actions: `<a class="btn btn--sm" href="#/" data-nav>← 返回首页</a>`,
      })}

      <div class="grid grid--3" style="margin-top:var(--sp-6)">
        <div class="panel" data-reveal>
          <div class="panel__head"><span class="panel__title">内容分布</span><span class="mono faint" style="font-size:var(--fs-2xs)">CATEGORY</span></div>
          <div class="panel__body">${byCategory.length ? donut(byCategory.slice(0, 6)) : '<p class="faint mono">暂无数据</p>'}</div>
        </div>

        <div class="panel" data-reveal data-reveal-delay="60" style="grid-column:span 2">
          <div class="panel__head"><span class="panel__title">近 6 个月发布节奏</span><span class="mono faint" style="font-size:var(--fs-2xs)">TIMELINE</span></div>
          <div class="panel__body">${barChart(months)}</div>
        </div>
      </div>

      <div class="grid grid--2" style="margin-top:var(--sp-4)">
        <div class="panel" data-reveal>
          <div class="panel__head"><span class="panel__title">运行状态</span><span class="status-dot status-dot--on">LIVE</span></div>
          <div class="panel__body grid" style="gap:10px">
            ${[
              ['主题', Theme.current.toUpperCase()],
              ['插画数据源', `${providers.length} 个`],
              ['插画历史', `${Stage.history.length} / 40`],
              ['曲目', `${tracks.filter((t) => Player.audioUrl(t)).length} / ${tracks.length} 可播放`],
              ['可视化', Player.analyser ? 'ANALYSER（同源）' : 'SYNTHETIC（跨域/待机）'],
              ['未读', `${ReadState.unreadNews + ReadState.unreadPosts} 条`],
              ['已注册路由', `${Registry.routes.length} 个插件视图`],
              ['已注册命令', `${Registry.commands.length} 条`],
            ].map(([k, v]) => `
              <div style="display:flex;justify-content:space-between;gap:var(--sp-4);border-bottom:1px solid var(--border);padding-bottom:8px">
                <span class="k-label">${esc(k)}</span>
                <b class="mono" style="font-size:var(--fs-sm)">${esc(String(v))}</b>
              </div>`).join('')}
          </div>
        </div>

        <div class="panel" data-reveal data-reveal-delay="60">
          <div class="panel__head"><span class="panel__title">最近更新</span><span class="mono faint" style="font-size:var(--fs-2xs)">ACTIVITY</span></div>
          <div class="panel__body grid" style="gap:10px">
            ${all.slice(0, 8).map((x) => `
              <a href="#/${x.id.startsWith('news') ? 'news' : 'posts'}/${x.id}" data-nav style="display:flex;justify-content:space-between;gap:var(--sp-3);border-bottom:1px solid var(--border);padding-bottom:8px">
                <span class="clamp-1" style="font-size:var(--fs-sm)">${esc(x.title)}</span>
                <span class="mono faint" style="font-size:var(--fs-2xs);flex:0 0 auto">${fmtDate(x.date)}</span>
              </a>`).join('') || '<p class="faint mono">暂无内容</p>'}
          </div>
        </div>
      </div>

      <div class="panel" style="margin-top:var(--sp-4)" data-reveal>
        <div class="panel__head"><span class="panel__title">如何再扩展一个页面</span></div>
        <div class="panel__body">
          <div class="prose" style="max-width:80ch">
            <p>在任意插件文件里定义视图对象，然后在 <span class="mono">src/main.js</span> 中注册：</p>
            <pre data-lang="js"><code>import { Registry } from './core/registry.js';

Registry.addRoute({
  id: 'lab',
  title: '实验室',
  render(ctx) { return '&lt;h1&gt;LAB&lt;/h1&gt;'; },
  mount(root, ctx) { /* 绑定交互 */ },
});

Registry.addNav({ id: 'lab', path: '#/lab', label: 'LAB', cn: '实验室' });</code></pre>
            <p>导航、命令面板索引、路由解析都会自动同步，无需改动其他文件。</p>
          </div>
        </div>
      </div>
    </section>`;
  },

  mount(root) {
    Motion.reveal(root);
  },
};
