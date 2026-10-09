/**
 * ui/almanac.js — 顶栏「黄历」小组件
 * ------------------------------------------------------------------
 * 形态：搜索图标左边一个小按钮，点开一个贴顶栏的小面板（样式与站内一致：
 *       直角、细边框、等宽小标签、信号黄做强调，不加阴影不加渐变）。
 *
 * 面板里有什么：
 *   · 默认两张卡：今天 / 明天 —— 黄历要素（农历、干支、建除、星宿、黄道黑道、
 *     冲煞方位、宜、忌）与「吉 / 凶」判定，判定理由写在卡里；
 *   · 可以查任意一天（原生 date 输入 + 查询），查到哪天就显示哪天；
 *   · 吉日 → 自动播放吉日之歌（默认赵季平《关羽之歌》）：打开面板时只要
 *     今天或明天是吉日就响，查到某天是吉日也响。播放状态与手动开关在面板底部。
 *
 * 为什么要显示"判定理由"：吉凶本来就是各家通书口径不同的东西，
 * 与其给一个权威脸的结论，不如把规则摊开（规则见 plugins/almanac.js）。
 */

import { $, esc } from '../util/dom.js';
import { bus } from '../core/bus.js';
import { Toast } from './toast.js';
import { Almanac, Anthem } from '../plugins/almanac.js';

let open = false;
/** 'pair' = 今天+明天；'single' = 查询到的某一天 */
let mode = 'pair';
let shown = [];
let busy = false;

const fmtDot = (d) => String(d).replace(/-/g, '.');

function relativeLabel(day) {
  if (day.isToday) return '今天';
  if (day.isTomorrow) return '明天';
  return '';
}

function dayCard(day) {
  const tag = day.lucky
    ? '<span class="almanac__tag almanac__tag--lucky">吉日</span>'
    : '<span class="almanac__tag">凶日</span>';
  const rel = relativeLabel(day);
  const yi = day.yi.length ? day.yi.join(' ') : '—';
  const ji = day.ji.length ? day.ji.join(' ') : '—';

  return `
  <article class="almanac__day${day.lucky ? ' is-lucky' : ''}">
    <header class="almanac__day-head">
      <span class="almanac__day-date">${fmtDot(day.date)}<i class="mono">${esc(day.week)}</i></span>
      ${rel ? `<span class="almanac__rel mono">${rel}</span>` : ''}
      ${tag}
    </header>

    <p class="almanac__line">
      农历 <b>${esc(day.lunarText)}</b>
      <span class="almanac__sep">·</span>${esc(day.ganZhi.year)}年 属${esc(day.shengXiao)}
      ${day.jieQi ? `<span class="almanac__sep">·</span><b class="almanac__jieqi">${esc(day.jieQi)}</b>` : ''}
    </p>
    <p class="almanac__line mono">
      ${esc(day.ganZhi.year)} / ${esc(day.ganZhi.month)} / ${esc(day.ganZhi.day)}
      <span class="almanac__sep">·</span>${esc(day.zhiXing)}日
      <span class="almanac__sep">·</span>${esc(day.xiu)}宿${esc(day.xiuLuck)}
      <span class="almanac__sep">·</span>${esc(day.tianShen)}${esc(day.tianShenType)}
    </p>

    <div class="almanac__yiji">
      <div class="almanac__yiji-row almanac__yiji-row--yi">
        <span class="almanac__yiji-key">宜</span>
        <span class="almanac__yiji-val">${esc(yi)}</span>
      </div>
      <div class="almanac__yiji-row almanac__yiji-row--ji">
        <span class="almanac__yiji-key">忌</span>
        <span class="almanac__yiji-val">${esc(ji)}</span>
      </div>
    </div>

    <footer class="almanac__day-foot mono">
      <span>冲${esc(day.chong)} 煞${esc(day.sha)}</span>
      <span class="almanac__sep">·</span><span>喜神${esc(day.xi)} 财神${esc(day.cai)}</span>
      <br />
      <span class="faint">判${day.lucky ? '吉' : '凶'}依据：${esc(day.reason)}${day.veto ? '' : ` · 评分 ${day.score}`}</span>
    </footer>
  </article>`;
}

function anthemHTML() {
  const cfg = Almanac.config?.anthem || {};
  const name = `${esc(cfg.title || '吉日之歌')}${cfg.artist ? ` · ${esc(cfg.artist)}` : ''}`;
  if (Anthem.playing) {
    return `
    <div class="almanac__anthem is-on" id="almanacAnthemBox">
      <span class="almanac__anthem-wave" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="almanac__anthem-text">正在播放 ${name}<i class="almanac__anthem-note">关闭面板即停止</i></span>
      <button class="btn btn--sm" id="almanacAnthemStop" type="button">停止</button>
    </div>`;
  }
  return `
  <div class="almanac__anthem" id="almanacAnthemBox">
    <span class="almanac__anthem-text faint">吉日之歌 ${name}</span>
    <button class="btn btn--sm" id="almanacAnthemPlay" type="button">▶ 播放</button>
  </div>`;
}

function hintHTML() {
  const lucky = shown.filter((d) => d.lucky);
  const autoplay = Almanac.config?.anthem?.autoplay !== false;
  const bits = [];

  if (lucky.length) {
    const which = lucky.map((d) => relativeLabel(d) || fmtDot(d.date)).join('、');
    bits.push(`${which}是吉日${autoplay ? ` · 已自动播放《${esc(Almanac.config.anthem.title)}》` : ''}`);
  } else if (mode === 'pair') {
    bits.push('今天与明天都不是吉日 · 吉日才会响起吉日之歌');
  } else {
    bits.push('这一天不是吉日 · 吉日才会响起吉日之歌');
  }

  if (Anthem.pausedMusic) bits.push('<button class="almanac__linkbtn" id="almanacResume" type="button">继续播放刚才的歌</button>');
  if (mode === 'single') bits.push('<button class="almanac__linkbtn" id="almanacBackToday" type="button">回到今天</button>');

  return bits.join(' <span class="almanac__sep">·</span> ');
}

/* ---------------- 渲染 ---------------- */

function render() {
  const body = $('#almanacBody');
  const hint = $('#almanacHint');
  const headDate = $('#almanacHeadDate');
  if (!body) return;

  if (busy) {
    body.innerHTML = '<p class="almanac__loading mono">正在加载黄历数据…</p>';
    if (hint) hint.innerHTML = '';
    return;
  }

  if (!shown.length) {
    body.innerHTML = '<p class="almanac__loading mono">暂时取不到黄历数据。</p>';
    if (hint) hint.innerHTML = '';
    return;
  }

  body.innerHTML = shown.map(dayCard).join('');
  const slot = $('#almanacAnthem');
  if (slot) slot.innerHTML = anthemHTML();
  if (headDate) {
    headDate.textContent = mode === 'pair'
      ? `${fmtDot(shown[0].date)} — ${fmtDot(shown[shown.length - 1].date)}`
      : fmtDot(shown[0].date);
  }
  if (hint) hint.innerHTML = hintHTML();

  // 底部按钮随播放状态重绘，这里重新挂一次事件
  wireDynamic();
}

/** 面板里"每次渲染都会重建"的那些按钮 */
function wireDynamic() {
  $('#almanacAnthemPlay')?.addEventListener('click', () => playAnthem('手动播放'));
  $('#almanacAnthemStop')?.addEventListener('click', () => Anthem.stop());
  $('#almanacResume')?.addEventListener('click', () => {
    if (Anthem.resumeMusic()) { Toast.ok('已继续站内播放'); render(); }
  });
  $('#almanacBackToday')?.addEventListener('click', () => showPair());
}

/* ---------------- 数据 ---------------- */

async function loadInto(dates) {
  busy = true;
  render();
  try {
    const list = await Promise.all(dates.map((d) => Almanac.day(d)));
    shown = list;
    mode = list.length > 1 ? 'pair' : 'single';
  } catch (err) {
    shown = [];
    Toast.show(`黄历数据加载失败：${err?.message || err}`, '', { ttl: 6000 });
  } finally {
    busy = false;
    render();
  }
}

async function showPair() {
  const t = Almanac.ymd();
  await loadInto([t, Almanac.addDays(t, 1)]);
  maybeAutoplay();
}

/**
 * 命中吉日就自动播放。
 * 只在"今天或明天是吉日"或"查到的那天是吉日"时触发，且同一首已经在放就不重头再来。
 */
function maybeAutoplay() {
  if (Almanac.config?.anthem?.autoplay === false) return;
  const lucky = shown.find((d) => d.lucky);
  if (!lucky) return;
  const which = relativeLabel(lucky) || fmtDot(lucky.date);
  playAnthem(`${which}是吉日`);
}

async function playAnthem(reason) {
  const res = await Anthem.play({ reason });
  if (!res.ok && res.error) Toast.show(res.error, '', { ttl: 6000 });
  render();
}

/* ---------------- 开关 ---------------- */

function place() {
  const panel = $('#almanac');
  const btn = $('#almanacBtn');
  if (!panel || !btn) return;
  // 宽屏：面板右边缘对齐按钮；窄屏交给 CSS（左右贴边铺满）
  if (window.innerWidth <= 620) { panel.style.right = ''; return; }
  const r = btn.getBoundingClientRect();
  const gutter = 16;
  panel.style.right = `${Math.max(gutter, window.innerWidth - r.right)}px`;
}

async function openPanel() {
  const panel = $('#almanac');
  const btn = $('#almanacBtn');
  if (!panel) return;
  open = true;
  panel.removeAttribute('hidden');
  btn?.setAttribute('aria-expanded', 'true');
  place();
  await showPair();
}

function closePanel() {
  const panel = $('#almanac');
  const btn = $('#almanacBtn');
  if (!panel || !open) return;
  open = false;
  panel.setAttribute('hidden', '');
  btn?.setAttribute('aria-expanded', 'false');
  Anthem.stop({ silent: false });
}

export const AlmanacUI = {
  /** 面板是否打开（注意别叫 open —— 那个名字留给下面的 open() 方法） */
  get isOpen() { return open; },

  init() {
    const panel = $('#almanac');
    const btn = $('#almanacBtn');
    if (!panel || !btn || Almanac.config?.enabled === false) return this;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      open ? closePanel() : openPanel();
    });
    $('#almanacClose')?.addEventListener('click', () => closePanel());

    // 点面板内部不算"点外面"
    panel.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => { if (open) closePanel(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && open) closePanel();
    });
    window.addEventListener('resize', () => { if (open) place(); }, { passive: true });

    // 查某一天
    const input = $('#almanacDate');
    const go = $('#almanacGo');
    if (input) input.value = Almanac.ymd();
    const search = () => {
      const d = Almanac.normalizeDate(input?.value);
      if (!d) { Toast.show('日期格式看不清，用 2026-10-09 这种写法', '', { ttl: 5000 }); return; }
      if (input) input.value = d;
      loadInto([d]).then(() => maybeAutoplay());
    };
    go?.addEventListener('click', search);
    input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
    input?.addEventListener('change', search);

    // 播放状态变化（含手机锁屏/系统暂停）时把面板同步一下
    bus.on('almanac:anthem', () => { if (open) render(); });

    return this;
  },

  toggle() { return open ? (closePanel(), false) : (openPanel(), true); },
  open: openPanel,
  close: closePanel,
};

export default AlmanacUI;
