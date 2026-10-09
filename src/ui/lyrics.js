/**
 * ui/lyrics.js — 板块标题栏里的歌词显示 + 完整歌词浮层
 * ==================================================================
 * 位置就是每个板块 header 右侧那块空白（viewhead 生成的 .lyricbox），
 * 所以它跟着板块走、不遮挡内容；显示逻辑全部来自 plugins/lyrics.js。
 *
 * 只在这里做三件事：
 *   1. 把 Lyrics 的状态画进 #lyricBox（标题栏那一小块）
 *   2. 点它打开完整歌词浮层（当前行高亮 + 自动跟随滚动）
 *   3. 监听总线，路由切换后重新挂一次（视图会重建 DOM）
 */
import { $, esc } from '../util/dom.js';
import { bus } from '../core/bus.js';
import { Lyrics } from '../plugins/lyrics.js';

let offs = [];
let overlay = null;

/** 歌词换句的「翻页」动效
 * ------------------------------------------------------------------
 * 直接换 textContent 太生硬，这里让它像机械翻牌那样转一下：
 *   旧的往上翻出去（rotateX + 上移 + 淡出）→ 换文案 → 新的从下往上转进来。
 * 用 Web Animations API 而不是 CSS 类名，是因为换句的时机是事件驱动的，
 * 用类名还要自己管「动画结束」的状态，容易在快速连换时卡住。
 * prefers-reduced-motion 打开时直接换文案。
 */
const reduced = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  || document.documentElement.dataset.reduceMotion === '1';

const OUT_MS = 170;
const IN_MS = 260;

/** 当前曲目「可能放不出声」时的额外说明（会员曲目），由音乐台设置 */
let silentNote = '';

/** 设置/清除「可能无声」标记；传空串清除 */
export function setLyricNote(note) {
  const next = String(note || '');
  if (next === silentNote) return;
  silentNote = next;
  paintLyricBox();
}

function rollText(el, next, { distance = '0.7em' } = {}) {
  if (!el) return;
  const text = String(next ?? '');
  if (el.dataset.text === text) return;      // 文案没变就不动
  el.dataset.text = text;
  if (reduced() || !el.animate) { el.textContent = text; return; }

  el._rollOut?.cancel();
  el._rollIn?.cancel();
  const out = el.animate(
    [{ opacity: 1, transform: 'none' },
      { opacity: 0, transform: `translateY(-${distance}) rotateX(62deg)` }],
    { duration: OUT_MS, easing: 'cubic-bezier(.4,0,1,.6)', fill: 'forwards' },
  );
  el._rollOut = out;
  out.finished.then(() => {
    // 期间又换了句就别插手：这一轮已经被新的那轮接管了
    if (el._rollOut !== out) return;
    el.textContent = text;
    const inn = el.animate(
      [{ opacity: 0, transform: `translateY(${distance}) rotateX(-62deg)` },
        { opacity: 1, transform: 'none' }],
      { duration: IN_MS, easing: 'cubic-bezier(.16,.84,.3,1)', fill: 'forwards' },
    );
    el._rollIn = inn;
    // 动画结束状态与元素默认状态一致，可以放心 cancel，不留挂着的动画
    //（一首歌要换几十次句，挂着会越积越多）。
    // 同样要先确认自己还是「当前那一轮」，否则会把新一轮的动画误杀，
    // 而新一轮的 finished 被 reject 后就再也没人回收它了。
    inn.finished.then(() => {
      if (el._rollIn !== inn) return;
      inn.cancel();
      out.cancel();
      el._rollIn = null;
      el._rollOut = null;
    }).catch(() => {});
  }).catch(() => {});
}

/** 标题栏那块小显示 */
export function paintLyricBox() {
  const box = $('#lyricBox');
  if (!box) return;
  const label = $('#lyricLabel');
  const cur = $('#lyricCur');
  const next = $('#lyricNext');
  const track = Lyrics.track;

  if (!track) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.classList.toggle('is-silent', !!silentNote);

  const setLabel = (text, tone = '') => {
    if (!label) return;
    label.textContent = silentNote ? `${text} · ${silentNote}` : text;
    label.dataset.tone = silentNote ? 'alert' : tone;
  };

  const title = track.title || '未命名曲目';
  switch (Lyrics.status) {
    case 'loading':
      setLabel(`NOW PLAYING · ${title}`);
      rollText(cur, '正在取歌词 …');
      rollText(next, '');
      break;
    case 'ready': {
      const line = Lyrics.current();
      const nxt = Lyrics.next();
      setLabel(`LYRICS · ${title}`);
      // 唱到句子里就是那一句，还没开口（前奏）用一个占位符
      rollText(cur, line ? line.text : '· · ·');
      rollText(next, nxt ? nxt.text : '');
      break;
    }
    case 'empty':
      setLabel(`NOW PLAYING · ${title}`, 'muted');
      rollText(cur, Lyrics._msg || '没有可显示的歌词');
      rollText(next, '');
      break;
    case 'error':
      setLabel(`NOW PLAYING · ${title}`, 'muted');
      rollText(cur, Lyrics._msg || '歌词获取失败');
      rollText(next, '');
      break;
    case 'local':
      setLabel(`NOW PLAYING · ${title}`, 'muted');
      rollText(cur, '本地音频 · 没有歌词来源');
      rollText(next, '');
      break;
    default:
      box.hidden = true;
  }
}

/* ---------------- 完整歌词浮层 ---------------- */

function closeOverlay() {
  overlay?.remove();
  overlay = null;
  document.removeEventListener('keydown', onKey);
  document.body.classList.remove('is-locked');
}

function onKey(e) {
  if (e.key === 'Escape') closeOverlay();
}

function paintOverlay() {
  if (!overlay) return;
  const list = overlay.querySelector('.lyricfull__list');
  if (!list) return;
  const track = Lyrics.track;
  const title = overlay.querySelector('.lyricfull__title');
  if (title) title.textContent = track?.title || '—';
  const artist = overlay.querySelector('.lyricfull__artist');
  if (artist) artist.textContent = track?.artist || '';

  if (!Lyrics.lines.length) {
    list.innerHTML = `<p class="lyricfull__empty">${esc(Lyrics._msg || '这首歌没有可显示的歌词')}</p>`;
    return;
  }
  const html = Lyrics.lines.map((l, i) =>
    `<p class="lyricfull__line${i === Lyrics.index ? ' is-cur' : ''}" data-line="${i}">${esc(l.text)}</p>`).join('');
  if (list.dataset.count !== String(Lyrics.lines.length)) {
    list.innerHTML = html;
    list.dataset.count = String(Lyrics.lines.length);
  } else {
    list.querySelectorAll('.lyricfull__line').forEach((el, i) => {
      el.classList.toggle('is-cur', i === Lyrics.index);
    });
  }
  // 当前行保持在视野中间
  const active = list.querySelector('.lyricfull__line.is-cur');
  if (active) {
    const target = active.offsetTop - list.clientHeight / 2 + active.offsetHeight / 2;
    const smooth = Math.abs(list.scrollTop - target) < list.clientHeight;
    list.scrollTo({ top: Math.max(0, target), behavior: smooth ? 'smooth' : 'auto' });
  }
}

export function openLyrics() {
  if (overlay || !Lyrics.track) return;
  overlay = document.createElement('div');
  overlay.className = 'lyricfull';
  overlay.innerHTML = `
    <div class="lyricfull__panel" role="dialog" aria-label="完整歌词">
      <div class="lyricfull__head">
        <span class="lyricfull__meta">
          <b class="lyricfull__title">—</b>
          <i class="lyricfull__artist mono"></i>
        </span>
        <span class="lyricfull__acts">
          <span class="mono lyricfull__hint">歌词按 LRC 时间轴跟唱 · 位置为估算值</span>
          <button class="btn btn--sm" id="lyricOffsetBack" title="歌词提前 0.5 秒">−0.5s</button>
          <button class="btn btn--sm" id="lyricOffsetFwd" title="歌词延后 0.5 秒">+0.5s</button>
          <button class="btn btn--sm" id="lyricClose">✕ 关闭</button>
        </span>
      </div>
      <div class="lyricfull__list mono"></div>
    </div>`;
  document.body.append(overlay);
  document.body.classList.add('is-locked');
  document.addEventListener('keydown', onKey);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) return closeOverlay();
    const id = e.target.closest('button')?.id;
    if (id === 'lyricClose') return closeOverlay();
    if (id === 'lyricOffsetFwd') { Lyrics.setOffset(Lyrics.offset + 500); return; }
    if (id === 'lyricOffsetBack') { Lyrics.setOffset(Lyrics.offset - 500); return; }
    const line = e.target.closest('.lyricfull__line');
    if (line) {
      // 点某一行 = 手动把这行当成当前行（无法 seek，就把显示拨过去）
      const i = Number(line.dataset.line);
      const t = Lyrics.lines[i]?.t;
      if (Number.isFinite(t)) { Lyrics.index = i; Lyrics.setOffset(-t); }
    }
  });
  paintOverlay();
}

/** 绑定总线：main.js 调一次 */
export function initLyricsUI() {
  if (offs.length) return;
  const repaint = () => { paintLyricBox(); paintOverlay(); };
  offs = [
    bus.on('lyrics:ready', repaint),
    bus.on('lyrics:line', repaint),
    bus.on('lyrics:idle', repaint),
    bus.on('route:change', () => setTimeout(repaint, 40)),
  ];
  // 标题栏是按钮，交给这里统一委托（视图重建也不影响）
  document.addEventListener('click', (e) => {
    if (e.target.closest('#lyricBox')) openLyrics();
  });
  paintLyricBox();
  return offs;
}

export default { paintLyricBox, openLyrics, initLyricsUI };
