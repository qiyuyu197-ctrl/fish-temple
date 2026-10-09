/**
 * plugins/almanac.js — 黄历（宜忌 · 吉日判定 · 吉日之歌）
 * ------------------------------------------------------------------
 * 干什么：
 *   · 给出某一天的黄历：农历 / 干支 / 生肖 / 建除十二神 / 二十八宿 / 黄道黑道 /
 *     冲煞方位 / 宜 / 忌 / 吉神 / 凶煞；
 *   · 按一套**写在明处**的规则判定这一天是不是「吉日」（见 judge()），
 *     面板上会把理由一起显示出来，不做黑箱吉凶；
 *   · 命中吉日时播放「吉日之歌」（默认赵季平的《关羽之歌》）。
 *
 * 数据从哪来：
 *   宜忌 / 建除 / 星宿 / 黄道黑道这些不是能拍脑袋算出来的东西，通书数据才是权威。
 *   所以这里用了 assets/vendor/lunar-javascript（MIT，6tail 2018，见同目录 LICENSE）——
 *   它带的就是各家黄历 App 用的那套通书数据。它按需加载：
 *   只有用户**第一次点开黄历面板**时才下载（400 多 KB），平时不占首屏，
 *   原文件逐字未改，只是用一层全局垫片把它当普通脚本跑（它是 CommonJS 包）。
 *
 * 判定口径（传统通书里的常见做法，权重写在下面，可自行调整）：
 *   硬否决   宜 / 忌 里出现「诸事不宜」 → 直接判凶
 *   黄道黑道 黄道 +2 / 黑道 -2
 *   建除十二神 除危定执成开 +1 / 建满平收破闭 -1
 *   二十八宿 吉宿 +1 / 凶宿 -1
 *   宜 ≥6 项 +1   忌 ≥6 项 -1
 *   吉神 ≥3 位 +1 凶煞 ≥4 位 -1
 *   总分 ≥ ALMANAC.luckyScore（默认 2）→ 吉日
 * 这套规则只是把"老黄历怎么看"量化成可解释的分数：同一天不同通书本来就有出入，
 * 所以面板永远把「为什么判吉/凶」摆在台面上。
 */

import { bus } from '../core/bus.js';
import { Player } from '../core/player.js';
import { ALMANAC } from '../config/site.config.js';

const VENDOR_SRC = 'assets/vendor/lunar-javascript/lunar.js';

/** 建除十二神里偏吉的六位；建、满、平、收、破、闭偏凶 */
const ZHI_XING_GOOD = new Set(['除', '危', '定', '执', '成', '开']);

/** 「诸事不宜」——通书里最硬的否决项 */
const VETO = '诸事不宜';

let api = null;
let loading = null;

/**
 * 按需加载黄历数据（只在第一次打开面板时发生）。
 * 原文件是 CommonJS 包，浏览器里没有 module/exports，所以这里垫一个全局 module，
 * 用 <script> 当普通脚本跑一遍，再把它导出的对象拿回来 —— 这样 vendor 文件保持逐字未改。
 */
function loadCalendar() {
  if (api) return Promise.resolve(api);
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    const prev = window.module;
    window.module = { exports: {} };
    const el = document.createElement('script');
    el.src = VENDOR_SRC;
    el.async = true;
    const done = (ok) => {
      const exported = window.module?.exports || {};
      window.module = prev;                      // 不把垫片留在全局
      if (ok && exported.Solar && exported.Lunar) {
        api = exported;
        bus.emit('almanac:ready', { ok: true });
        resolve(api);
      } else {
        loading = null;
        bus.emit('almanac:ready', { ok: false });
        reject(new Error('黄历数据加载失败：' + VENDOR_SRC));
      }
    };
    el.onload = () => done(true);
    el.onerror = () => { el.remove(); done(false); };
    document.head.append(el);
  });

  return loading;
}

/* ---------------- 日期工具（一律用本地时区） ---------------- */

const pad = (n) => String(n).padStart(2, '0');

/** Date → 'YYYY-MM-DD'（**不能用 toISOString()**：那是 UTC，东八区晚上会差一天） */
export function ymd(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 'YYYY-MM-DD' 加减天数 */
export function addDays(dateStr, n) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return ymd(dt);
}

/** 校验并规范化用户输入的日期 */
export function normalizeDate(input) {
  const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(String(input || '').trim());
  if (!m) return '';
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (y < 1901 || y > 2099 || mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  const dt = new Date(y, mo - 1, d);
  if (dt.getMonth() !== mo - 1 || dt.getDate() !== d) return '';   // 例如 2-30
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/* ---------------- 吉日判定 ---------------- */

/**
 * 给一天的黄历打分。返回的 detail 会直接显示在面板上，
 * 所以每一项都要能读懂（这也是"不做黑箱"的意思）。
 */
function judge(lunar) {
  const yi = lunar.getDayYi() || [];
  const ji = lunar.getDayJi() || [];
  const zhiXing = lunar.getZhiXing();
  const xiuLuck = lunar.getXiuLuck();
  const tianShen = lunar.getDayTianShen();
  const tianShenType = lunar.getDayTianShenType();
  const jiShen = lunar.getDayJiShen() || [];
  const xiongSha = lunar.getDayXiongSha() || [];

  const veto = yi.includes(VETO) || ji.includes(VETO);
  const parts = [];
  let score = 0;

  if (tianShenType === '黄道') { score += 2; } else { score -= 2; }
  parts.push(`${tianShen}${tianShenType}`);

  const zxGood = ZHI_XING_GOOD.has(zhiXing);
  score += zxGood ? 1 : -1;
  parts.push(`${zhiXing}日`);

  const xiuGood = xiuLuck === '吉';
  score += xiuGood ? 1 : -1;
  parts.push(`${lunar.getXiu()}宿${xiuLuck}`);

  if (yi.length >= 6) score += 1;
  if (ji.length >= 6) score -= 1;
  if (jiShen.length >= 3) score += 1;
  if (xiongSha.length >= 4) score -= 1;

  if (veto) {
    score = -99;                                // 硬否决：宜或忌里写了「诸事不宜」
    parts.unshift('宜忌见「诸事不宜」');           // 决定性的一条放最前面，读起来才不绕
  }

  const limit = Number(ALMANAC.luckyScore);
  const min = Number.isFinite(limit) ? limit : 2;

  return {
    yi, ji, zhiXing, xiu: lunar.getXiu(), xiuLuck,
    tianShen, tianShenType, tianShenLuck: lunar.getDayTianShenLuck(),
    jiShen, xiongSha,
    score: veto ? -99 : score,
    veto,
    lucky: !veto && score >= min,
    reason: parts.join(' · '),
  };
}

/* ---------------- 对外：某一天的黄历 ---------------- */

/**
 * 取某一天的黄历。dateStr 形如 'YYYY-MM-DD'；不传就是今天。
 * 返回的字段只有"面板要显示的"和"判定要用的"，不把整个通书倒出来。
 */
export async function dayInfo(dateStr) {
  const cal = await loadCalendar();
  const date = normalizeDate(dateStr) || ymd();
  const [y, m, d] = date.split('-').map(Number);
  const solar = cal.Solar.fromYmd(y, m, d);
  const lunar = solar.getLunar();
  const verdict = judge(lunar);

  return {
    date,
    week: `星期${solar.getWeekInChinese()}`,
    isToday: date === ymd(),
    isTomorrow: date === addDays(ymd(), 1),
    /** 二〇二六年八月廿九 */
    lunarText: `${lunar.getYearInChinese()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
    /** 干支纪年 / 月 / 日（月用节气月，与通书一致） */
    ganZhi: {
      year: lunar.getYearInGanZhi(),
      month: lunar.getMonthInGanZhiExact(),
      day: lunar.getDayInGanZhi(),
    },
    shengXiao: lunar.getYearShengXiao(),
    /** 当天节气（不是节气日则为空） */
    jieQi: lunar.getJieQi() || '',
    nextJieQi: (() => {
      const n = lunar.getNextJieQi();
      return n ? { name: n.getName(), date: n.getSolar().toYmd() } : null;
    })(),
    chong: lunar.getDayChongDesc(),
    sha: lunar.getDaySha(),
    xi: lunar.getDayPositionXiDesc(),
    cai: lunar.getDayPositionCaiDesc(),
    ...verdict,
  };
}

/** 今天（默认连明天一起取，面板首屏就是这两张卡） */
export async function todayPair() {
  const t = ymd();
  const list = [await dayInfo(t)];
  list.push(await dayInfo(addDays(t, 1)));
  return list;
}

/* ---------------- 吉日之歌 ---------------- */

/**
 * 吉日之歌。
 *
 * 为什么不用 Player（站内播放器）：那是用户的**歌单**。为了一个小组件把《关羽之歌》
 * 塞进歌单、顶掉"正在播放"，是越权。所以这里用一个独立的一次性 <audio>：
 *   · 播放前把站内正在放的歌**暂停**（两个音源同时响很难听），面板上会说明，
 *     并给一个「继续播放」按钮 —— 不自动续播，免得用户莫名其妙地被切回来；
 *   · 只做一次 700ms 的淡入淡出，避免突然炸响；
 *   · 不进 Media Session（那是站内播放器的系统面板，不该被它抢走）。
 */
export const Anthem = {
  el: null,
  playing: false,
  /** 播放原因，面板上显示（例如「今天是吉日」） */
  reason: '',
  /** 这次播放是不是我们把站内播放暂停了 */
  pausedMusic: false,
  _fade: null,

  get title() { return ALMANAC.anthem?.title || '吉日之歌'; },
  get artist() { return ALMANAC.anthem?.artist || ''; },

  /** 音频地址：优先自托管文件，否则走站内同源转发（server.mjs 的 /api/netease/audio） */
  url() {
    const cfg = ALMANAC.anthem || {};
    if (cfg.src) return cfg.src;
    if (cfg.neteaseId) return `/api/netease/audio?id=${encodeURIComponent(cfg.neteaseId)}`;
    return '';
  },

  ensure() {
    if (this.el) return this.el;
    const el = document.createElement('audio');
    el.id = 'anthem';
    el.preload = 'auto';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    el.addEventListener('ended', () => this._finish());
    el.addEventListener('error', () => {
      const url = this.url();
      bus.emit('toast', { message: `「${this.title}」加载失败：${url}`, kind: 'err' });
      this._finish();
    });
    document.body.append(el);
    this.el = el;
    return el;
  },

  _targetVolume() {
    const v = Number(ALMANAC.anthem?.volume);
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.9;
  },

  _fadeTo(to, ms = 700) {
    const el = this.el;
    if (!el) return;
    clearInterval(this._fade);
    const from = el.volume;
    const steps = Math.max(1, Math.round(ms / 50));
    let i = 0;
    this._fade = setInterval(() => {
      i += 1;
      const k = Math.min(1, i / steps);
      el.volume = Math.min(1, Math.max(0, from + (to - from) * k));
      if (k >= 1) { clearInterval(this._fade); this._fade = null; }
    }, 50);
  },

  _finish() {
    clearInterval(this._fade);
    this._fade = null;
    this.playing = false;
    bus.emit('almanac:anthem', { playing: false, reason: this.reason, title: this.title });
  },

  /**
   * 播放。返回 { ok, error? }。
   * reason 只是给界面看的一句话（例如「明天是吉日」）。
   */
  async play({ reason = '' } = {}) {
    const url = this.url();
    if (!url) return { ok: false, error: '没有配置吉日之歌的音源（见 site.config.js 的 ALMANAC.anthem）' };

    // 已经在放同一首就不要重头再来（反复开关面板会很吵）
    if (this.playing && this.el && !this.el.paused) {
      this.reason = reason || this.reason;
      bus.emit('almanac:anthem', { playing: true, reason: this.reason, title: this.title });
      return { ok: true, already: true };
    }

    const el = this.ensure();
    if (el.getAttribute('src') !== url) {
      el.src = url;
      try { el.load(); } catch { /* 个别浏览器对空 src 会抛错 */ }
    }

    // 站内正在放歌就先暂停它（面板上有「继续播放」）
    if (ALMANAC.anthem?.pauseMusic !== false && Player.playing) {
      this.pausedMusic = true;
      Player.pause();
    }

    this.reason = reason;
    el.volume = 0;
    try {
      await el.play();                            // 由点击打开面板触发，属于用户手势
    } catch (err) {
      this.playing = false;
      bus.emit('almanac:anthem', { playing: false, reason, title: this.title });
      return { ok: false, error: '浏览器拦住了自动播放，点一下「▶ ' + this.title + '」即可' };
    }
    this._fadeTo(this._targetVolume(), 700);
    this.playing = true;
    bus.emit('almanac:anthem', { playing: true, reason, title: this.title });
    return { ok: true };
  },

  /** 停止（淡出后暂停并回到开头） */
  stop({ silent = false } = {}) {
    const el = this.el;
    if (!el) return;
    this._fadeTo(0, 300);
    clearTimeout(this._stopTimer);
    this._stopTimer = setTimeout(() => {
      try { el.pause(); el.currentTime = 0; } catch { /* noop */ }
    }, 320);
    this.playing = false;
    if (!silent) bus.emit('almanac:anthem', { playing: false, reason: '', title: this.title });
  },

  toggle(opts) {
    return this.playing ? (this.stop(), { ok: true, playing: false }) : this.play(opts);
  },

  /** 把刚被我们暂停的站内播放交还给用户（不自动续播，由用户决定） */
  resumeMusic() {
    if (!this.pausedMusic) return false;
    this.pausedMusic = false;
    Player.play();
    return true;
  },
};

export const Almanac = {
  load: loadCalendar,
  day: dayInfo,
  todayPair,
  ymd,
  addDays,
  normalizeDate,
  anthem: Anthem,
  get config() { return ALMANAC; },
  get loaded() { return !!api; },
};

export default Almanac;
