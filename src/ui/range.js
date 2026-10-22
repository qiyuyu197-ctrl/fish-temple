/**
 * ui/range.js — 零依赖横向滑块
 * ------------------------------------------------------------------
 * 音乐台的进度条与音量条都用它。为什么不用 <input type="range">：
 *   · 站点的播放器是「硬边 + 信号黄」的一套自定义控件，原生 range 在
 *     各浏览器里的轨道 / 滑块样式很难统一；
 *   · 音乐页只有一个真正的输入框（#neInput），自检和键盘焦点都更干净。
 *
 * 交互：指针拖动、点击定位、方向键 / Home / End。拖动过程中只回调 onInput，
 * 松手才回调 onCommit（避免每移动 1px 就 seek 一次）。`set()` 用于播放进度回写，
 * 用户正在拖动时不会抢走手柄。
 */

const clamp01 = (n) => Math.min(1, Math.max(0, Number(n) || 0));

export function bindRange(el, { onInput, onCommit, step = 0.02, disabled = false } = {}) {
  if (!el) return null;
  let dragging = false;
  let ratio = clamp01(el.dataset.ratio);

  const paint = (r) => {
    ratio = clamp01(r);
    el.dataset.ratio = ratio.toFixed(4);
    el.style.setProperty('--r', `${(ratio * 100).toFixed(2)}%`);
    el.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    return ratio;
  };

  const fromEvent = (e) => {
    const box = el.getBoundingClientRect();
    if (!box.width) return ratio;
    return clamp01((e.clientX - box.left) / box.width);
  };

  const emit = (r, commit = false) => {
    const v = paint(r);
    if (disabled) return v;
    onInput?.(v, commit);
    if (commit) onCommit?.(v);
    return v;
  };

  const down = (e) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    el.classList.add('is-drag');
    try { el.setPointerCapture(e.pointerId); } catch { /* 旧浏览器 */ }
    emit(fromEvent(e));
  };
  const move = (e) => {
    if (!dragging || disabled) return;
    emit(fromEvent(e));
  };
  const release = (e) => {
    dragging = false;
    el.classList.remove('is-drag');
    try { el.releasePointerCapture(e.pointerId); } catch { /* 已释放 */ }
  };
  const up = (e) => {
    if (!dragging) return;
    release(e);
    emit(fromEvent(e), true);
  };
  // 指针被系统取消（来电 / 手势被接管）时按当前值落定，不要把 0 当成点击位置
  const cancel = (e) => {
    if (!dragging) return;
    release(e);
    emit(ratio, true);
  };

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('keydown', (e) => {
    if (disabled) return;
    let next = ratio;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = ratio - step;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = ratio + step;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 1;
    else return;
    e.preventDefault();
    emit(next, true);
  });

  paint(ratio);
  el.classList.toggle('is-disabled', !!disabled);
  el.setAttribute('aria-disabled', String(!!disabled));
  el.tabIndex = disabled ? -1 : 0;

  return {
    /** 播放进度回写：拖动时不要动用户手里的手柄 */
    set(r) {
      if (dragging) return;
      paint(r);
    },
    get ratio() { return ratio; },
    get dragging() { return dragging; },
  };
}

export default bindRange;
