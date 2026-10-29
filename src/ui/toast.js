/**
 * ui/toast.js — 轻提示
 * 用法：Toast.show('已保存', 'ok')  或  bus.emit('toast', {...})
 */

import { $, h } from '../util/dom.js';
import { bus } from '../core/bus.js';

let host;
const MAX = 4;

function ensure() {
  // 页面重渲染会把 #toasts 换掉；缓存节点一旦脱离文档，提示就会写进"看不见的"节点里
  if (!host || !host.isConnected) host = $('#toasts');
  return host;
}

export const Toast = {
  show(message, kind = '', { ttl = 3200 } = {}) {
    const root = ensure();
    if (!root) return;
    // 同一条消息连续出现（连点「换一张」/ 反复切场景）时不要叠一摞，
    // 刷新同一条的停留时间并轻轻"顶"一下，更像一个会呼吸的提示。
    const key = `${kind}|${message}`;
    const dup = [...root.children].find((c) => c.dataset.key === key && !c.classList.contains('is-out'));
    if (dup) {
      clearTimeout(dup._hide);
      dup._hide = setTimeout(() => {
        dup.classList.add('is-out');
        setTimeout(() => dup.remove(), 260);
      }, ttl);
      dup.classList.remove('toast--bump');
      void dup.offsetWidth;
      dup.classList.add('toast--bump');
      return dup;
    }
    while (root.children.length >= MAX) root.firstElementChild?.remove();
    const el = h('div.toast', { class: kind ? `toast--${kind}` : '', role: 'status' }, [
      h('span.toast__i', { text: kind === 'err' ? '!' : kind === 'ok' ? '✓' : '›' }),
      h('span', { text: message }),
    ]);
    el.dataset.key = key;
    root.append(el);
    el._hide = setTimeout(() => {
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 260);
    }, ttl);
    return el;
  },
  err(msg) { return this.show(msg, 'err', { ttl: 4200 }); },
  ok(msg) { return this.show(msg, 'ok'); },
  init() {
    bus.on('toast', ({ message, kind, ttl }) => this.show(message, kind, { ttl }));
  },
};

/**
 * 复制到剪贴板（带降级）
 */
export async function copyText(text, okMsg = '已复制到剪贴板') {
  try {
    await navigator.clipboard.writeText(text);
    Toast.ok(okMsg);
    return true;
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', top: '-1000px' } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand?.('copy');
    ta.remove();
    ok ? Toast.ok(okMsg) : Toast.err('复制失败，请手动选择文本');
    return ok;
  }
}

/** 触发文件下载 */
export function download(filename, text, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
