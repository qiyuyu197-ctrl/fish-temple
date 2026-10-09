/**
 * ui/miniaudio.js — 常驻播放界面
 * ------------------------------------------------------------------
 * 包含两块：
 *   1) MiniPlayer   底部迷你播放条
 *   2) EmbedHost    网易云官方播放器的全局宿主
 *
 * EmbedHost 是「切板块不断播」的关键：
 *   iframe 只创建一次，永久挂在 #view 之外。进入音乐台时把它"内嵌"到页面里的
 *   占位槽，离开时改成固定停靠（右下角折叠条）。整个过程不移动也不重建 DOM，
 *   只切换 CSS 定位，因此 iframe 的浏览上下文保留，播放不会中断。
 *
 * 只订阅 bus 事件，不直接操作 <audio>。
 */

import { $ } from '../util/dom.js';
import { bus } from '../core/bus.js';
import { Player } from '../core/player.js';
import { Toast } from './toast.js';
import { EmbedHost } from './embed-host.js';

let bars = [];        // 音浪条元素
let stopWave = null;  // 音浪循环的停止句柄

const WAVE_BARS = 40;

/**
 * 构建播放条内部元素。
 *
 * 播放条现在只做「正在播放」展示：[封面唱片] [曲目信息] [音浪条]。
 * 传输控制 / 进度 / 时间 / 音量 / 关闭按钮都已移除（播放控制统一在音乐台页面），
 * 所以这里只剩音浪条的构建。
 */
function build() {
  const root = $('#miniplayer');
  if (!root) return;
  root.hidden = false;
  document.body.classList.add('has-miniplayer');

  // 音浪条：先插一条中线，再放条形
  const wave = $('#mpBars');
  if (wave) {
    wave.innerHTML = '<span class="mp-wave__mid" aria-hidden="true"></span>';
    bars = Array.from({ length: WAVE_BARS }, () => {
      const i = document.createElement('i');
      wave.append(i);
      return i;
    });
  }
}

/**
 * 计算 n 个音浪条的幅度（0..1）。迷你条、音乐台频谱、首页的圆环都共用这一个来源，
 * 保证「同一时刻各处的音浪是同一套波动」，不会各跳各的。
 *
 * 本地音频取真频谱；网易云曲目（或拿不到频谱时）用合成音浪：
 * 慢速包络 + 中速摆动 + 逐条随机脉冲，模拟"鼓点带动若干频段跳动"。
 *
 * @param {number} n 条数
 * @param {boolean} active 是否处于播放态（非播放态一律压到最低）
 * @param {number} [t] 秒级时间戳（默认取 performance.now）
 */
export function waveLevels(n, active, t = performance.now() / 1000) {
  const out = new Array(n);
  const real = active ? Player.spectrum(n) : null;
  for (let i = 0; i < n; i++) {
    if (!active) { out[i] = 0.05; continue; }
    if (real) {
      // 真频谱：做一次幂映射让低频更突出，观感接近真实播放器
      out[i] = Math.pow(real[i], 0.8);
      continue;
    }
    const k = i / n;
    const slow = 0.34 + 0.28 * Math.sin(t * 1.15 - k * 2.6);          // 整体起伏
    const mid = 0.5 + 0.5 * Math.sin(t * 2.7 + k * 8.4);              // 条间差异
    const flutter = 0.5 + 0.5 * Math.sin(t * 6.1 + k * 17.3);         // 细碎抖动
    const pulse = Math.random() < 0.05 ? 0.6 + Math.random() * 0.4 : 0; // 偶发脉冲
    const env = 1 - Math.abs(k - 0.45) * 0.7;                         // 中间高两端低
    out[i] = (slow * 0.42 + mid * 0.34 + flutter * 0.24 + pulse) * env;
  }
  return out;
}

/**
 * 可视化循环：迷你条的音浪条与音乐台的频谱共用这一套。
 *
 * 关键点（曾经的 bug）：循环**绝不能因为「没在播放」就停掉**。
 * 早期实现在 isActive() 为假时直接 return，不再调度下一帧，
 * 于是暂停一次之后循环永久死亡，恢复播放时音浪再也不动。
 * 现在循环始终运行，只是非播放态的幅度压到最低。
 *
 * @param {HTMLElement[]} els 条形元素
 * @param {() => boolean} isActive 是否处于播放态
 * @returns {() => void} 停止该循环（只取消自己的帧）
 */
export function pumpVisualizer(els, isActive) {
  if (!els?.length) return () => {};
  const N = els.length;
  let myRaf = 0;
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    const active = isActive();
    const levels = waveLevels(N, active);
    // 非播放态必须显式清掉高亮类：只靠下面的 v 判断不够，
    // 因为暂停时 v 是常量，残留的 is-hot 永远不会被移除。
    for (let i = 0; i < N; i++) {
      const v = levels[i];
      els[i].style.height = `${Math.max(5, Math.min(100, v * 100)).toFixed(1)}%`;
      els[i].classList.toggle('is-hot', active && v > 0.42);
    }
    myRaf = requestAnimationFrame(tick);
  };

  myRaf = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(myRaf);
  };
}

function paintTrack({ track, index } = {}) {
  if (!track) {
    $('#mpTitle').textContent = '—';
    $('#mpArtist').textContent = '—';
    return;
  }
  const isNe = track.provider === 'netease';
  $('#mpTitle').textContent = track.title || '—';
  $('#mpArtist').textContent = `${track.artist || 'UNKNOWN'} · ${String(index + 1).padStart(2, '0')}${isNe ? ' · 网易云' : ''}`;
  const disc = $('#mpDisc');
  if (track.cover) {
    disc.style.background = '';
    disc.style.backgroundImage = `url("${track.cover}")`;
    disc.style.backgroundSize = 'cover';
    disc.style.backgroundPosition = 'center';
  } else {
    disc.style.backgroundImage = '';
    disc.style.background = isNe
      ? 'repeating-linear-gradient(-45deg, var(--alert) 0 3px, var(--ink-100) 3px 6px)'
      : 'repeating-linear-gradient(45deg, var(--ink-100) 0 3px, var(--ink-60) 3px 4px)';
  }
  const cover = $('#mpCover');
  if (cover) {
    // 封面现在是「播放 / 暂停」按钮，这里只记录曲目信息，标题文案由 paintState 合成
    cover.dataset.track = track.title || '';
    // 提示按"这一首实际会怎么放"来写：站内直放 / 官方播放器 / 真的没配文件
    cover.dataset.hint = Player.isEmbed
      ? '网易云官方播放器'
      : (Player.audioUrl(track) ? '' : '未配置音频文件');
  }
}

/**
 * 重绘播放条。
 * 有些 player:state 事件只带部分字段（例如 buffering / shuffle 变化），
 * 所以这里对缺失字段一律回退到引擎的当前状态，避免把进度覆盖成 0。
 */
function paintState(state = {}) {
  const playing = state.playing ?? Player.playing;
  const isEmbed = state.isEmbed ?? Player.isEmbed;
  const time = state.time ?? Player.currentTime;
  const duration = state.duration ?? Player.duration;
  const root = $('#miniplayer');

  // 唱片旋转 + 音浪条点亮状态
  root?.classList.toggle('is-playing', !!playing);
  $('#mpBars')?.classList.toggle('is-live', !!playing);
  // is-embed 只作为「当前是网易云 iframe 来源」的状态钩子保留，方便以后按来源做样式
  root?.classList.toggle('is-embed', !!isEmbed);

  // 顶沿的信号黄进度指示（底栏唯一的进度显示，很细，不抢音浪）：
  // 只有官方外链播放器读不到真实进度（保持 0，而不是给一个永远不动的假进度）；
  // 本地音频与站内直放的网易云曲目都有真实 currentTime，进度条照常走。
  const p = duration && !isEmbed ? (time / duration) * 100 : 0;
  root?.style.setProperty('--mp-progress', `${p.toFixed(2)}%`);

  // 封面的提示文案随播放状态变化，避免「点了才发现是暂停」
  const cover = $('#mpCover');
  if (cover) {
    const action = playing ? '暂停' : '播放';
    const name = cover.dataset.track || '';
    const hint = cover.dataset.hint ? `（${cover.dataset.hint}）` : '';
    const label = name ? `${action}：${name}${hint}` : action;
    cover.title = label;
    cover.setAttribute('aria-label', label);
  }
}

export const MiniPlayer = {
  init() {
    build();
    EmbedHost.init();
    const root = $('#miniplayer');
    if (!root) return;

    // 封面 = 播放 / 暂停：这是底栏唯一能直接开播的入口，不必先跳到音乐台
    $('#mpCover')?.addEventListener('click', () => {
      // 从「折叠停靠」状态开始播放时，先把官方播放器展开几秒：
      // 让 iframe 在被渲染的状态下加载 auto=1（更稳的自动播放），同时给一个可见反馈
      if (!Player.playing) EmbedHost.expandBriefly();
      Player.toggle();
    });
    // 曲目信息 = 进音乐台（搜索 / 播放列表 / 粘贴链接都在那一页）
    $('#mpMeta')?.addEventListener('click', () => { location.hash = '#/music'; });

    bus.on('player:track', (p) => {
      root.hidden = false;
      document.body.classList.add('has-miniplayer');
      paintTrack(p);
    });
    bus.on('player:state', paintState);
    bus.on('player:noaudio', ({ track }) => {
      Toast.show(`「${track?.title || '曲目'}」尚未配置音频文件 · 见 config/site.config.js`, '', { ttl: 5000 });
    });

    // 网易云官方播放器：交给全局宿主管理，离开音乐台也不会中断
    bus.on('player:embed', ({ track, autoplay }) => {
      if (track?.neteaseId) EmbedHost.show(track, { autoplay: !!autoplay });
      else EmbedHost.hide();
      EmbedHost.noteRoute(location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] || 'home');
    });

    // 立即用引擎当前状态渲染一次（不依赖事件时序，避免出现空白播放条）
    if (Player.current) paintTrack({ track: Player.current, index: Player.index });
    paintState({ playing: Player.playing, isEmbed: Player.isEmbed });

    // 音浪循环：只启动一次，常驻运行（暂停时不停止，只压低幅度）
    stopWave?.();
    stopWave = pumpVisualizer(bars, () => Player.playing);
  },
  /** 让播放条重新出现（音乐页调用；底栏平时不会被收起，这里只做兜底） */
  show() {
    const root = $('#miniplayer');
    if (!root) return;
    root.hidden = false;
    document.body.classList.add('has-miniplayer');
  },
};
