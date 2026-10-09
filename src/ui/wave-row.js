/**
 * ui/wave-row.js — 首页「正在播放」的波浪条
 * ==================================================================
 * 和底栏那条音浪**同一套外观与同一套数据**（`.mp-wave` + miniaudio.js 的
 * pumpVisualizer），只是铺满首页那一列的宽度，并在左边配一个会转的小封面。
 *
 * 为什么不做圆环了：圆形那一版为了把封面塞进圆心，得反复调「封面 + 凹槽」
 * 与音浪内半径的关系，稍微一动就顶到环根上；波浪条没有这种几何耦合，
 * 也更像站里其它地方的样子（底栏、音乐台都用它）。
 */
import { bus } from '../core/bus.js';
import { Player } from '../core/player.js';
import { pumpVisualizer } from './miniaudio.js';

let stop = null;          // 音浪循环的停止句柄
let boundWave = null;     // 当前绑定的是哪个 .mp-wave（路由切换会换节点）

/** 画一次当前状态：封面、播放态、显隐，并在需要时挂上音浪循环 */
export function paintWaveRow() {
  const row = document.querySelector('.wave-row');
  if (!row) {
    stop?.();
    stop = null;
    boundWave = null;
    return;
  }

  const track = Player.current;
  if (!track) {
    row.hidden = true;
    stop?.();
    stop = null;
    boundWave = null;
    return;
  }

  row.hidden = false;
  row.classList.toggle('is-playing', !!Player.playing);

  const cover = row.querySelector('.wave-row__cover');
  if (cover && cover.dataset.cover !== (track.cover || '')) {
    cover.dataset.cover = track.cover || '';
    cover.style.backgroundImage = track.cover ? `url("${track.cover}")` : '';
    cover.classList.toggle('is-empty', !track.cover);
  }

  const wave = row.querySelector('.mp-wave');
  if (!wave) return;
  wave.classList.toggle('is-live', !!Player.playing);
  if (wave !== boundWave) {                 // 节点变了：重挂循环
    stop?.();
    boundWave = wave;
    const bars = [...wave.querySelectorAll('i')];
    stop = bars.length ? pumpVisualizer(bars, () => Player.playing) : null;
  }
}

/** 绑定总线（main.js 调一次）。没有这块 DOM 时安全空转。 */
export function initWaveRow() {
  bus.on('player:track', () => paintWaveRow());
  bus.on('player:state', () => paintWaveRow());
  bus.on('route:change', () => setTimeout(paintWaveRow, 40));
  paintWaveRow();
  return () => stop?.();
}

export default { initWaveRow, paintWaveRow };
