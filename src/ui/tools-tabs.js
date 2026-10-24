/**
 * ui/tools-tabs.js — TOOLS 板块顶部那条页签
 * ------------------------------------------------------------------
 * 工具台不再只是「三个面板」：Tier List、视频提取音频、分离纯音乐/人声都是同一板块下的
 * 独立页面（`#/tools?tab=…`），却各自渲染一遍页签条。抄三份迟早会有一份忘了加
 * `aria-selected`，所以收在这里：谁渲染都调 `toolsTabs('vocal')`。
 *
 * 注意：导航仍然指向 `#/tools`，页签只是板块内部切换 —— 换页签不改变导航高亮。
 */

export const TOOLS_TABS = [
  { id: 'hub', href: '#/tools', label: '工具台' },
  { id: 'tier', href: '#/tools?tab=tier', label: 'Tier List' },
  { id: 'audio', href: '#/tools?tab=audio', label: '提取音频' },
  { id: 'vocal', href: '#/tools?tab=vocal', label: '分离纯音乐/人声' },
];

/** 当前 hash 对应哪一个页签（没有 tab 参数就是工具台） */
export function activeToolsTab(hash = location.hash) {
  const m = /[?&]tab=([a-z-]+)/i.exec(String(hash || ''));
  const id = m ? m[1].toLowerCase() : 'hub';
  return TOOLS_TABS.some((t) => t.id === id) ? id : 'hub';
}

export function toolsTabs(active = 'hub') {
  return `<div class="mr-tabs tools-tabs" role="tablist" aria-label="工具">
    ${TOOLS_TABS.map((t) => `<a class="mr-tab${t.id === active ? ' is-on' : ''}" href="${t.href}"
      role="tab" aria-selected="${t.id === active}">${t.label}</a>`).join('')}
  </div>`;
}

export default { TOOLS_TABS, activeToolsTab, toolsTabs };
