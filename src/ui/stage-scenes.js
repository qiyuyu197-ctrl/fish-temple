/**
 * ui/stage-scenes.js — 沉浸舞台的可视化场景层
 * ==================================================================
 * 三套场景，全部由**真实音频瞬态**驱动：
 *   · AudioEnergy 每帧给出各频段的 level / transient / sustained / onset；
 *   · 鼓点（bass onset）打到才震、才亮、才溅开 —— 不是匀速 sin 波；
 *   · 歌词逐字点亮时，会在那颗字的位置打出一圈涟漪（pulseAt），
 *     所以画面和"正在唱哪颗字"是同一个时间轴。
 *
 * 官方 iframe 读不到频谱：此时 energy 为 null，场景只画一帧很淡的静态底，
 * 按钮上会写"无频谱" —— 不假装跟着节奏。
 *
 * 零依赖：2D canvas + CSS 变量（--fg / --signal），深浅色主题自动换混合模式。
 */
import { Player } from '../core/player.js';
import { AudioEnergy } from './audio-energy.js';

export const SCENES = [
  { id: 'off', name: 'OFF', label: '关闭' },
  { id: 'lattice', name: 'LATTICE', label: '格栅' },
  { id: 'orbit', name: 'ORBIT', label: '星环' },
  { id: 'drift', name: 'DRIFT', label: '雾海' },
];

const KEY = 'ft.terminal.stageScene';

export function getSceneId() {
  try {
    const v = localStorage.getItem(KEY);
    return SCENES.some((s) => s.id === v) ? v : 'lattice';
  } catch { return 'lattice'; }
}

export function setSceneId(id) {
  const next = SCENES.some((s) => s.id === id) ? id : 'off';
  try { localStorage.setItem(KEY, next); } catch { /* noop */ }
  return next;
}

export function nextSceneId(id) {
  const i = SCENES.findIndex((s) => s.id === id);
  return SCENES[(i + 1) % SCENES.length].id;
}

export function sceneName(id) {
  return SCENES.find((s) => s.id === id)?.name || 'OFF';
}

/* ---------------- 主题 ---------------- */

function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  return {
    fg: cs.getPropertyValue('--fg').trim() || '#111',
    signal: cs.getPropertyValue('--signal').trim() || '#ffd400',
    dark: document.documentElement.dataset.scheme === 'dark',
  };
}

/* ---------------- 涟漪（歌词逐字 / 鼓点共用） ---------------- */

function drawPulses(ctx, pulses, theme, now) {
  for (const p of pulses) {
    // 歌词循环可能比这一帧的 rAF 时间戳稍新几毫秒（age 为负），直接算半径会负数 → arc() 抛错
    const age = Math.min(1, Math.max(0, (now - p.at) / 620));
    if (age >= 1) continue;
    const r = Math.max(2, 6 + age * (60 + p.strength * 55));
    ctx.save();

    if (theme.dark) {
      // 深色：信号色单环，够亮
      ctx.globalAlpha = (1 - age) * 0.55 * p.strength;
      ctx.strokeStyle = p.color || theme.signal;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // 浅色：黄环在白纸上几乎看不见 —— 主环用墨色，外面套一圈信号黄，
      // 再加一个"落点"小水滴，才像雨滴砸在字上。
      ctx.globalAlpha = (1 - age) * 0.8 * p.strength;
      ctx.strokeStyle = theme.fg;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = (1 - age) * 0.55 * p.strength;
      ctx.strokeStyle = theme.signal;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, r * 0.82), 0, Math.PI * 2);
      ctx.stroke();

      if (age < 0.38) {
        ctx.globalAlpha = (1 - age / 0.38) * 0.95 * p.strength;
        ctx.fillStyle = theme.fg;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

/* ---------------- 场景 ---------------- */

const draws = {
  /** 格栅：频谱墙，鼓点砸下来整面墙一起亮、一起抬 */
  lattice(ctx, { w, h, t, levels, energy, theme, active }) {
    const beat = energy?.beat || 0;
    const bass = energy?.bands?.bass?.level || 0;
    const cols = 40;
    const gap = w / cols;
    const bottom = h;
    const maxH = h * (0.6 + beat * 0.05);
    ctx.save();
    ctx.globalCompositeOperation = theme.dark ? 'screen' : 'multiply';

    for (let i = 0; i < cols; i += 1) {
      const v = levels[Math.floor((i / cols) * levels.length)] || 0;
      const bh = maxH * (0.1 + v * 0.9);
      const x = i * gap + gap / 2;
      const g = ctx.createLinearGradient(0, bottom, 0, bottom - bh);
      g.addColorStop(0, theme.signal);
      g.addColorStop(1, 'transparent');
      ctx.globalAlpha = (active ? 0.12 + v * 0.42 : 0.05);
      ctx.fillStyle = g;
      ctx.fillRect(x - gap * 0.3, bottom - bh, gap * 0.6, bh);
    }

    // 横线：跟着鼓点往上扫一格
    const step = 46;
    const off = ((t * 22 + beat * 90) % step);
    ctx.globalAlpha = 0.05 + beat * 0.1;
    ctx.strokeStyle = theme.fg;
    ctx.lineWidth = 1;
    for (let y = bottom - off; y > bottom - maxH; y -= step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 低频光带：鼓点像一条冲击波
    ctx.globalAlpha = active ? 0.16 + bass * 0.32 : 0.1;
    ctx.fillStyle = theme.signal;
    ctx.fillRect(0, bottom - 2 - bass * 24 - beat * 20, w, 2 + beat * (theme.dark ? 4 : 2));
    // 向上扫的扫描线：跟鼓点走，给"墙"一点纵深
    const scanY = bottom - ((t * 70 + beat * 160) % maxH);
    ctx.globalAlpha = 0.02;
    ctx.fillStyle = theme.signal;
    ctx.fillRect(0, scanY, w, 1.5);
    ctx.restore();
    return { x: w / 2, y: bottom - 40, strength: 1 };
  },

  /** 星环：环随低频呼吸，鼓点时向外弹一下，高频打亮圆弧 */
  orbit(ctx, { w, h, t, levels, energy, theme, active }) {
    const beat = energy?.beat || 0;
    const bass = energy?.bands?.bass?.level || 0;
    const treble = energy?.bands?.treble?.level || 0;
    const cx = w * 0.5;
    const cy = h * 0.46;
    const base = Math.min(w, h) * 0.16;
    ctx.save();
    ctx.globalCompositeOperation = theme.dark ? 'screen' : 'multiply';
    ctx.translate(cx, cy);

    for (let i = 0; i < 4; i += 1) {
      const r = base * (1 + i * 0.34) + bass * 12 + beat * (theme.dark ? 26 - i * 4 : 8 - i * 2);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.globalAlpha = 0.06 + i * 0.012;
      ctx.strokeStyle = theme.fg;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const speed = 0.25 + (energy?.bands?.mid?.sustained || 0) * 0.8;
    for (let k = 0; k < 2; k += 1) {
      const r = base * 1.5 + beat * 20;
      const a0 = t * speed * (k ? -1 : 1);
      ctx.beginPath();
      ctx.arc(0, 0, r, a0, a0 + 0.7 + treble * 0.9);
      ctx.globalAlpha = (theme.dark ? 0.35 : 0.22) + treble * (theme.dark ? 0.4 : 0.25);
      ctx.strokeStyle = theme.signal;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, base * (1.1 + beat * 0.35));
    glow.addColorStop(0, theme.signal);
    glow.addColorStop(1, 'transparent');
    ctx.globalAlpha = active ? 0.1 + bass * 0.18 : 0.08;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, base * 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return { x: cx, y: cy, strength: 1 };
  },

  /** 雾海：柔光团随低频膨胀，鼓点把它们往外推一下 */
  drift(ctx, { w, h, t, levels, energy, theme, active }) {
    const beat = energy?.beat || 0;
    const bass = energy?.bands?.bass?.level || 0;
    const n = 6;
    ctx.save();
    ctx.globalCompositeOperation = theme.dark ? 'screen' : 'multiply';
    for (let i = 0; i < n; i += 1) {
      const seed = i * 1.7;
      const x = w * (0.5 + 0.34 * Math.sin(t * 0.06 + seed) + beat * 0.03 * Math.sin(seed));
      const y = h * (0.48 + 0.26 * Math.cos(t * 0.05 + seed * 1.3) + beat * 0.03 * Math.cos(seed));
      const r = Math.min(w, h) * (0.16 + 0.08 * Math.sin(t * 0.09 + seed) + bass * 0.14 + beat * 0.1);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, i % 3 === 0 ? theme.signal : theme.fg);
      g.addColorStop(1, 'transparent');
      ctx.globalAlpha = (active ? 0.06 + bass * 0.07 : 0.045);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return { x: w * 0.5, y: h * 0.48, strength: 1 };
  },
};

/**
 * 挂一层场景到 canvas。
 * @param {HTMLCanvasElement} canvas
 */
export function createSceneLayer(canvas) {
  let id = getSceneId();
  let raf = 0;
  let running = false;
  let w = 0; let h = 0; let dpr = 1;
  let energy = null;
  const energyReader = new AudioEnergy();
  let pulses = [];
  let lastBeatAt = 0;
  let onBeat = null;
  let lastPaintAt = 0;

  const thisDt = (now) => {
    const dt = lastPaintAt ? Math.min(64, now - lastPaintAt) : 16;
    lastPaintAt = now;
    return dt;
  };

  const reduced = (() => {
    try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  })();

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = Math.max(1, Math.round(rect.width));
    h = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  };

  const paint = (now) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const active = !!Player.playing;
    const dt = thisDt(now);
    if (active) {
      energy = energyReader.read(now);
      if (energy?.beat >= 1 && now - lastBeatAt > 180) {
        lastBeatAt = now;
        onBeat?.(energy);
      }
    }

    // 没有 analyser（官方 iframe）时 energy 为 null：只画静态底，不假装跟节奏。
    // 有 analyser 但这一帧全零（上下文挂起 / 还没出声）→ 用合成波形兜底，别让画面死掉。
    pulses = pulses.filter((p) => now - p.at < 700);
    const liveTap = !!Player.analyser && !!Player.playing;
    const levels = (energy && Player.spectrum(48)) || fallbackLevels(48, now / 1000, liveTap);
    const theme = readTheme();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const draw = draws[id];
    if (!draw) return;

    // 不做整层位移：那是"晃眼"的主要来源，现在只让图形自己动
    ctx.save();
    const tag = draw(ctx, { w, h, t: now / 1000, levels, energy, theme, active: !!energy || liveTap });
    ctx.restore();

    // 鼓点：在场景指定的位置补一圈涟漪（低频冲击的可见形状）
    if (tag && energy?.beat >= 1 && now - lastBeatAt < 40) {
      pulses.push({ x: tag.x, y: tag.y, at: now, strength: 0.5 });
      if (pulses.length > 24) pulses = pulses.slice(-24);
    }
    drawPulses(ctx, pulses, theme, now);
  };

  const loop = (now) => {
    if (!running) return;
    // 单帧异常不能把整层动画打死（以前一个负数半径就让 rAF 停了）
    try { paint(now); } catch (err) { console.warn('[scene] frame failed', err); }
    raf = requestAnimationFrame(loop);
  };

  const api = {
    get id() { return id; },
    get hasSpectrum() { return !!energy; },
    get energy() { return energy; },
    set(next) {
      id = setSceneId(next);
      canvas.dataset.scene = id;
      if (!running || reduced) paint(performance.now());
      return id;
    },
    /** 歌词逐字点亮时打一圈涟漪（x/y 为视口坐标） */
    pulseAt(x, y, strength = 0.6) {
      if (!running || reduced) return;
      pulses.push({ x, y, at: performance.now(), strength });
      if (pulses.length > 24) pulses = pulses.slice(-24);
    },
    /** 鼓点回调（舞台用来做 lyric 的同步震动） */
    set onBeat(fn) { onBeat = fn; },
    get onBeat() { return onBeat; },
    start() {
      if (running) return;
      running = true;
      resize();
      if (reduced) { paint(0); return; }
      raf = requestAnimationFrame(loop);
    },
    stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      pulses = [];
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
  canvas.dataset.scene = id;
  try {
    window.addEventListener('resize', () => {
      if (!running) return;
      resize();
      if (reduced) paint(performance.now());
    });
  } catch { /* 非浏览器环境 */ }
  return api;
}

function fallbackLevels(n, t, active) {
  const out = new Array(n);
  for (let i = 0; i < n; i += 1) {
    if (!active) { out[i] = 0.03; continue; }
    const x = i / n;
    out[i] = Math.max(0.03, Math.min(0.9, 0.15 + Math.sin(t * 2 + x * 6) * 0.1));
  }
  return out;
}
