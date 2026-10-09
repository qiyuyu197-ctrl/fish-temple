/**
 * core/registry.js — 可插拔扩展点
 * ------------------------------------------------------------------
 * 站点的所有「可变部分」都通过注册表暴露，第三方脚本或未来的功能模块
 * 只需在 main.js 里调用 Registry.xxx.use(...) 即可接入，无需改动核心代码。
 *
 * 已开放的插槽：
 *   imageProviders  插画数据源（返回图片 URL 列表）
 *   routes          额外视图（{ id, title, render, mount }）
 *   commands        命令面板命令（{ id, label, run }）
 *   nav             导航项
 *   widgets         首页插槽组件（{ id, slot, render }）
 */

import { IMAGE_PROVIDERS, COMMANDS, NAV } from '../config/site.config.js';
import { defineView } from './router.js';

const bags = {
  imageProviders: [...IMAGE_PROVIDERS],
  routes: [],
  commands: [...COMMANDS],
  nav: [...NAV],
  widgets: [],
};

export const Registry = {
  /** 插画数据源：{ id, label, kind, ... } */
  addImageProvider(p) {
    const i = bags.imageProviders.findIndex((x) => x.id === p.id);
    if (i >= 0) bags.imageProviders[i] = p;
    else bags.imageProviders.push(p);
    return p.id;
  },
  get imageProviders() { return [...bags.imageProviders]; },
  getImageProvider(id) { return bags.imageProviders.find((p) => p.id === id) || null; },

  /** 额外路由：等价于 defineView，但记录在案便于调试 */
  addRoute(view) {
    bags.routes.push(view);
    return defineView(view);
  },
  get routes() { return [...bags.routes]; },

  /** 命令面板命令 */
  addCommand(cmd) {
    const i = bags.commands.findIndex((x) => x.id === cmd.id);
    if (i >= 0) bags.commands[i] = cmd;
    else bags.commands.push(cmd);
    return cmd.id;
  },
  get commands() { return [...bags.commands]; },

  /** 导航项 */
  addNav(item) {
    const i = bags.nav.findIndex((x) => x.id === item.id);
    if (i >= 0) bags.nav[i] = item;
    else bags.nav.push(item);
    return item.id;
  },
  get nav() { return [...bags.nav]; },

  /**
   * 首页插槽组件
   * slot: 'hero-actions' | 'after-hero' | 'before-footer'
   * render(ctx) 返回 HTML 字符串
   */
  addWidget(widget) {
    bags.widgets.push(widget);
    return widget.id;
  },
  widgetsFor(slot) { return bags.widgets.filter((w) => w.slot === slot); },
  renderWidgets(slot, ctx) {
    return this.widgetsFor(slot).map((w) => {
      try { return w.render(ctx) || ''; } catch (e) { console.warn(`[widget ${w.id}]`, e); return ''; }
    }).join('');
  },
  /** 挂载插槽组件（调用其可选 mount 钩子），返回统一清理函数 */
  mountWidgets(slot, root, ctx) {
    const cleanups = this.widgetsFor(slot).map((w) => {
      try { return w.mount?.(root, ctx); } catch (e) { console.warn(`[widget ${w.id}]`, e); return null; }
    }).filter(Boolean);
    return () => cleanups.forEach((fn) => { try { fn(); } catch { /* noop */ } });
  },
};
