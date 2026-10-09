/**
 * views/notfound.js — 404
 */

import { esc, ICON } from '../util/dom.js';
import { Router } from '../core/router.js';
import { viewhead } from '../ui/bits.js';

export default {
  id: 'notfound',
  title: '404',

  render(ctx) {
    const target = ctx?.raw || location.hash;
    // 已注册的视图数（含插件注册的栏目），动态显示避免写死
    const moduleCount = String(Router.views.size).padStart(2, '0');
    return `
    <section style="padding-top:var(--sp-8)">
      ${viewhead({
        title: 'SIGNAL LOST',
        sub: '请求的路径不在终端索引中。可能原因：链接拼写错误、内容已被删除，或该模块尚未安装。',
        idx: 'ERROR / 404',
        meta: [
          { label: 'REQUEST', value: String(target).slice(0, 46) },
          { label: 'MODULES', value: `${moduleCount} ONLINE` },
        ],
        actions: `<a class="btn btn--signal" href="#/" data-nav>${ICON.up}返回首页</a>
                  <a class="btn" href="#/logs" data-nav>浏览文章</a>`,
      })}
      <div class="mono faint" style="margin-top:var(--sp-7);font-size:var(--fs-xs);line-height:2">
        <div>· 使用 <b>Ctrl/Cmd + K</b> 打开命令面板，可搜索任意页面与内容</div>
        <div>· 若你是站主，请检查 <b>src/core/router.js</b> 中的视图 id 是否拼写一致</div>
        <div>· 目标：${esc(String(target))}</div>
      </div>
    </section>`;
  },
};
