/**
 * ui/scroll-rail.js — 全站悬浮滚动指示条
 * ------------------------------------------------------------------
 * 为什么要有它：站点把**根滚动条**藏掉了（`html::-webkit-scrollbar { width: 0 }`，
 * 见 styles/base.css）。原因是经典滚动条模型会在窗口最右占掉 10~12px 的槽，
 * 那一条永远是平色（纸色 / --bg），压在全屏横幅或壁纸旁边就是「右边空了一条」。
 * 藏掉之后布局视口 == 窗口宽，页面真正占满右侧（实测 innerWidth - clientWidth = 0）。
 *
 * 位置感由这颗悬浮条补：`position: fixed`，不占布局宽度，按 viewport/document 比例
 * 算长度、跟 scrollY 走；滚动时提亮，停手 0.9s 回落；内容不足一屏就整条隐藏。
 * **对所有主题生效**，不再是琉璃专属。
 */

import { bus } from '../core/bus.js';

const ID = 'scrollRail';
const CLASS = 'scroll-rail';

let el = null;
let timer = 0;

function ensure() {
  if (el && document.body.contains(el)) return el;
  const node = document.createElement('div');
  node.id = ID;
  node.className = CLASS;
  node.setAttribute('aria-hidden', 'true');
  node.hidden = true;
  document.body.appendChild(node);
  el = node;
  return node;
}

export const ScrollRail = {
  init() {
    window.addEventListener('scroll', () => this.paint(true), { passive: true });
    window.addEventListener('resize', () => this.paint(), { passive: true });
    // 换板块 / 换主题都会改变内容高度，等排版落定再量一次
    bus.on('route:change', () => setTimeout(() => this.paint(), 260));
    bus.on('theme:change', () => this.paint());
    this.paint();
  },

  /** @param {boolean} moving 正在滚动（提亮，停手后自动回落） */
  paint(moving = false) {
    const node = ensure();
    const winH = window.innerHeight;
    const docH = document.documentElement.scrollHeight;
    if (docH <= winH + 4) { node.hidden = true; return; }
    node.hidden = false;
    const pad = 4;
    const track = winH - pad * 2;
    const thumb = Math.max(28, Math.round(track * (winH / docH)));
    const maxScroll = docH - winH;
    const top = pad + Math.round((window.scrollY / maxScroll) * (track - thumb));
    node.style.height = `${thumb}px`;
    node.style.transform = `translateY(${top}px)`;
    if (moving) {
      node.classList.add('is-moving');
      clearTimeout(timer);
      timer = setTimeout(() => node.classList.remove('is-moving'), 900);
    }
  },
};
