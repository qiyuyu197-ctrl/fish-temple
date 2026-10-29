/**
 * ui/pwa.js — 把站点装成 App 的那个「壳」相关的一切
 * ------------------------------------------------------------------
 * 只做三件小事，失败了也不该影响站点本身：
 *
 *   1. 注册 Service Worker（sw.js，由 tools/gen-service-worker.mjs 生成）
 *      → 装到主屏后能离线打开、二次启动不再等网络
 *   2. 有新版本时提示「点一下刷新」
 *      → 用 sw 的 waiting 状态 + SKIP_WAITING，不做「静默换掉正在看的页面」
 *   3. 断网 / 恢复时给一句人话
 *      → 免得用户以为站点坏了
 *
 * 为什么不用 beforeinstallprompt 自己画安装按钮：
 * 那是 Chromium 专属的时机，画在界面上反而会跟浏览器菜单里的「安装」重复；
 * iOS 又没有这个事件。所以安装入口统一交给浏览器，这里只管「装完之后好不好用」。
 */

import { Toast } from './toast.js';

const state = {
  registered: false,
  updateReady: false,
  version: '',
};

/** 把一条提示变成可点的：点一下就应用更新 */
function notifyUpdate(worker) {
  if (state.updateReady) return;
  state.updateReady = true;

  const el = Toast.show('新版本已就绪 · 点这里刷新', 'ok', { ttl: 12000 });
  if (!el) return;
  el.style.cursor = 'pointer';
  el.title = '应用新版本';
  el.addEventListener('click', () => {
    worker?.postMessage({ type: 'SKIP_WAITING' });
    // 有些浏览器里 controllerchange 来得慢，兜一个定时器
    setTimeout(() => location.reload(), 900);
  }, { once: true });
}

export function initPWA() {
  // 桌面 / 手机的本地文件、旧内核、隐私模式都可能没有它
  if (!('serviceWorker' in navigator)) return;
  // file:// 下注册一定失败，安静跳过
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;

  const start = async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js', { scope: './' });
      state.registered = true;

      const adopt = (worker) => {
        if (worker && worker.state === 'installed' && navigator.serviceWorker.controller) {
          notifyUpdate(worker);
        }
      };

      adopt(reg.waiting);
      adopt(reg.installing);

      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          // 第一次装（没有 controller）不算更新，别弹「新版本」
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            notifyUpdate(worker);
          }
        });
      });

      // 回到前台时顺手查一次更新（长驻的 App 不会自然刷新）
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });

      if (navigator.serviceWorker.controller) state.version = 'active';
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // 只有在「用户点了刷新」之后才 reload，避免打断正在听歌的人
        if (state.updateReady) location.reload();
      });
    } catch (err) {
      // 注册失败不影响站点：只是没有离线能力
      console.warn('[pwa] Service Worker 注册失败', err);
    }
  };

  // boot() 跑完时 load 可能早就过去了（本地缓存命中时尤其快），所以按 readyState 决定
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });

  window.addEventListener('offline', () => {
    Toast.show('断网了 · 已缓存的页面还能翻', '', { ttl: 4200 });
  });
  window.addEventListener('online', () => {
    Toast.ok('网络回来了');
  });
}

export const PWA = state;
