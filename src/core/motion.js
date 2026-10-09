/**
 * core/motion.js — 动效与交互增强
 * ------------------------------------------------------------------
 * 1) reveal      : 滚动进入视口时逐级浮现
 * 2) parallax    : 首屏随鼠标轻微位移（英雄区背景）
 * 3) countup     : 数字滚动
 * 4) magnetic    : 按钮轻微吸附指针
 * 全部尊重 prefers-reduced-motion。
 */

import { $$, rafThrottle } from '../util/dom.js';

const reduced = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.reduceMotion === '1';

let revealObserver;

export const Motion = {
  /** 扫描 root 内所有 [data-reveal] 并注册观察 */
  reveal(root = document) {
    if (reduced()) return;
    if (!revealObserver) {
      revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const el = en.target;
          const delay = Number(el.dataset.revealDelay || 0);
          setTimeout(() => el.classList.add('is-in'), delay);
          revealObserver.unobserve(el);
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    }
    $$('[data-reveal]:not(.is-in)', root).forEach((el) => {
      el.classList.add('reveal');
      revealObserver.observe(el);
    });
    // 兜底：2s 后强制显示，避免观察器异常导致内容不可见
    setTimeout(() => $$('.reveal:not(.is-in)', root).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight) el.classList.add('is-in');
    }), 1600);
  },

  /** 英雄区视差 */
  parallax(selector, strength = 14) {
    if (reduced()) return () => {};
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) return () => {};
    const onMove = rafThrottle((e) => {
      const nx = (e.clientX / window.innerWidth - 0.5) * 2;
      const ny = (e.clientY / window.innerHeight - 0.5) * 2;
      el.style.transform = `translate3d(${(-nx * strength).toFixed(2)}px, ${(-ny * strength).toFixed(2)}px, 0)`;
    });
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  },

  /** 数字滚动：把元素文本从 0 补间到 target */
  countup(el, target, { duration = 900, pad = 0 } = {}) {
    if (!el) return;
    const fmt = (n) => String(Math.round(n)).padStart(pad, '0');
    if (reduced()) { el.textContent = fmt(target); return; }
    const start = performance.now();
    const from = Number(el.dataset.from || 0);
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(from + (target - from) * eased);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },

  /** 鼠标吸附（指针设备且非降级动效时生效） */
  magnetic(root = document) {
    if (reduced() || !window.matchMedia?.('(hover: hover)').matches) return;
    $$('.btn, .pbtn, .iconbtn', root).forEach((btn) => {
      if (btn.dataset.magnetic) return;
      btn.dataset.magnetic = '1';
      btn.addEventListener('pointermove', (e) => {
        const r = btn.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
        const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        btn.style.transform = `translate(${(dx * 3).toFixed(2)}px, ${(dy * 3).toFixed(2)}px)`;
      });
      btn.addEventListener('pointerleave', () => { btn.style.transform = ''; });
    });
  },

  /** 滚动进度条 */
  readProgress(el) {
    if (!el) return;
    const onScroll = rafThrottle(() => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      const p = h > 0 ? Math.min(1, window.scrollY / h) : 0;
      el.style.width = `${(p * 100).toFixed(2)}%`;
    });
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  },

  scrollToTop(smooth = true) {
    window.scrollTo({ top: 0, behavior: smooth && !reduced() ? 'smooth' : 'auto' });
  },
};
