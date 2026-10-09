/**
 * plugins/example-widget.js — 扩展点演示：首页插槽组件
 * ------------------------------------------------------------------
 * Registry.addWidget({ id, slot, render(ctx) })
 *   slot: 'hero-actions' | 'after-hero' | 'before-footer'
 * 把 widget 注册进来后，首页会在对应位置渲染它。
 *
 * 复制这个文件即可创建新组件，然后在 main.js 里 import 并注册。
 */

import { esc } from '../util/dom.js';
import { SITE } from '../config/site.config.js';

/** 记录站点会话开始时间，用于展示运行时长 */
const SESSION_START = Date.now();

function fmtUptime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export const sessionWidget = {
  id: 'session-status',
  slot: 'after-hero',
  render() {
    return `
      <div class="panel" style="margin-top:var(--sp-5);padding:var(--sp-3) var(--sp-4);display:flex;gap:var(--sp-5);flex-wrap:wrap;align-items:center">
        <span class="status-dot status-dot--on">SESSION ACTIVE</span>
        <span class="mono faint" style="font-size:var(--fs-2xs)">本次会话时长 <b id="widgetUptime">0s</b></span>
        <span class="mono faint" style="font-size:var(--fs-2xs)">作者 <b>${esc(SITE.author)}</b></span>
        <span class="mono faint" style="font-size:var(--fs-2xs)">版本 <b>${esc(SITE.version)}</b></span>
      </div>`;
  },
  /** 可选：组件挂载后执行，返回清理函数 */
  mount(root) {
    const el = root.querySelector('#widgetUptime');
    if (!el) return;
    const t = setInterval(() => { el.textContent = fmtUptime(Date.now() - SESSION_START); }, 1000);
    el.textContent = fmtUptime(Date.now() - SESSION_START);
    return () => clearInterval(t);
  },
};

/** 页脚前的推广位：演示如何插入一段完全自定义的 HTML */
export const footerWidget = {
  id: 'footer-note',
  slot: 'before-footer',
  render() {
    return `
      <section class="sect">
        <div class="panel hatch" style="height:8px;border:0"></div>
        <div class="panel" style="padding:var(--sp-5);margin-top:var(--sp-4);display:flex;gap:var(--sp-5);flex-wrap:wrap;align-items:center;justify-content:space-between">
          <div>
            <span class="k-label k-label--signal">EXTENSIBLE</span>
            <h3 style="margin-top:6px;font-size:1.4rem">这套骨架是为你改的</h3>
            <p class="muted" style="margin:6px 0 0;max-width:60ch;font-size:var(--fs-sm)">
              在 <span class="mono">src/main.js</span> 里用 <span class="mono">Registry.*</span> 注册新的插画源、路由、命令或首页组件，
              就能在不改动核心代码的前提下扩展功能。当前这个区块本身就是通过
              <span class="mono">Registry.addWidget()</span> 注入的。
            </p>
          </div>
          <a class="btn btn--signal" href="#/dashboard" data-nav>打开仪表盘 →</a>
        </div>
      </section>`;
  },
};
