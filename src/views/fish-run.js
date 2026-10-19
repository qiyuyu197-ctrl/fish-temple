/**
 * views/fish-run.js — 像素小鱼（跑酷小游戏，MINES 板块里的一个页签）
 * ------------------------------------------------------------------
 * 抄的不是代码，是"那类游戏"的玩法：横向卷轴、单键跳跃、碰到障碍就结束。
 * 这里换成**像素小鱼**：水面上游，躲水母和石头，越久越快。
 *
 * 技术选择：
 *   · 纯 canvas + requestAnimationFrame，零依赖 ✓
 *   · 像素画用**点阵字符串**描述（下面 FISH 那张图），比一堆 fillRect 好改 ✓
 *   · 状态最小：x/y/vy/速度/障碍数组/分数 ✓ —— 逻辑一眼能看完
 *   · 切走时把 rAF 停掉（页面不可见也停），不白烧 CPU ✓
 */

import { esc } from '../util/dom.js';
import { viewhead } from '../ui/bits.js';

const BEST_KEY = 'ft.terminal.fishRunBest';

/* 像素小鱼（8×5）：o=身体 · =高光 e=眼睛 · ·=空 */
const FISH = [
  '  oooo  ',
  ' oo==oo ',
  'oeooooo ',
  ' oooooo ',
  '  oooo  ',
];
const PX = 6;   // 一个像素点画多大

const W = 640, H = 240;      // 画布逻辑尺寸（CSS 会按容器缩放）
const GROUND = H - 34;       // 水底基准线
const GRAVITY = 0.65;
const JUMP_V = -11.5;

let raf = 0;
let running = false;

function paintFish(ctx, x, y) {
  FISH.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      const ch = row[rx];
      if (ch === ' ') continue;
      ctx.fillStyle = ch === 'e' ? '#121316' : ch === '=' ? '#FFD400' : '#3b82f6';
      ctx.fillRect(x + rx * PX, y + ry * PX, PX, PX);
    }
  });
}

function makeGame(canvas) {
  const ctx = canvas.getContext('2d');
  const st = {
    y: GROUND - 5 * PX,
    vy: 0,
    speed: 4.2,
    score: 0,
    best: Number(localStorage.getItem(BEST_KEY) || 0),
    obstacles: [],
    t: 0,
    over: false,
  };

  const jump = () => {
    if (st.over) { reset(); return; }
    if (st.y >= GROUND - 5 * PX - 0.5) { st.vy = JUMP_V; }
  };

  const reset = () => {
    st.y = GROUND - 5 * PX; st.vy = 0; st.speed = 4.2; st.score = 0;
    st.obstacles = []; st.t = 0; st.over = false;
    running = true;
  };

  const spawn = () => {
    // 水母（高，要跳）与石头（低，随便过）交替，间隔随速度收紧
    const tall = Math.random() < 0.6;
    st.obstacles.push({
      x: W + 20,
      w: tall ? 22 : 14,
      h: tall ? 40 : 18,
      kind: tall ? 'jelly' : 'rock',
    });
  };

  const step = () => {
    if (st.over) return false;
    st.t += 1;
    st.score = Math.floor(st.t / 6);
    st.speed = 4.2 + Math.min(4.5, st.t / 900);     // 越跑越快，但有上限
    st.vy += GRAVITY;
    st.y += st.vy;
    const floor = GROUND - 5 * PX;
    if (st.y > floor) { st.y = floor; st.vy = 0; }

    if (st.t % Math.max(38, 78 - Math.floor(st.speed * 6)) === 0) spawn();
    for (const o of st.obstacles) o.x -= st.speed;
    st.obstacles = st.obstacles.filter((o) => o.x + o.w > -30);

    // 碰撞：鱼身取中间 70% 宽，避免像素边缘太苛刻
    const fx = 70 + PX, fw = 6 * PX, fy = st.y + 4, fh = 5 * PX - 8;
    for (const o of st.obstacles) {
      const oh = o.kind === 'jelly' ? o.h : o.h;
      const oy = GROUND - oh;
      if (fx < o.x + o.w && fx + fw > o.x && fy < oy + oh && fy + fh > oy) {
        st.over = true;
        if (st.score > st.best) {
          st.best = st.score;
          try { localStorage.setItem(BEST_KEY, String(st.best)); } catch { /* 隐私模式忽略 */ }
        }
        return false;
      }
    }
    return true;
  };

  const draw = () => {
    // 水
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#eaf3ff');
    g.addColorStop(1, '#cfe4f7');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 水底
    ctx.fillStyle = '#c9c6bd';
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.strokeStyle = '#121316';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(W, GROUND); ctx.stroke();

    // 气泡（装饰，跟着速度移动）
    ctx.fillStyle = 'rgba(59,130,246,.25)';
    for (let i = 0; i < 8; i++) {
      const bx = (W - ((st.t * 0.6 + i * 97) % (W + 40)));
      const by = 30 + ((i * 53) % 120) + Math.sin((st.t + i * 30) / 40) * 6;
      ctx.beginPath(); ctx.arc(bx, by, 3 + (i % 3), 0, Math.PI * 2); ctx.fill();
    }

    // 障碍
    for (const o of st.obstacles) {
      if (o.kind === 'jelly') {
        ctx.fillStyle = 'rgba(229,72,77,.85)';
        ctx.beginPath();
        ctx.arc(o.x + o.w / 2, GROUND - o.h + 10, o.w / 2, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = 'rgba(229,72,77,.55)';
        for (let k = 0; k < 3; k++) {
          ctx.fillRect(o.x + 3 + k * 7, GROUND - o.h + 10, 3, o.h - 10);
        }
      } else {
        ctx.fillStyle = '#8b8b8b';
        ctx.fillRect(o.x, GROUND - o.h, o.w, o.h);
        ctx.strokeStyle = '#121316'; ctx.lineWidth = 2;
        ctx.strokeRect(o.x, GROUND - o.h, o.w, o.h);
      }
    }

    // 小鱼
    paintFish(ctx, 70, st.y);

    // 分数
    ctx.fillStyle = '#121316';
    ctx.font = '700 20px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(String(st.score).padStart(4, '0'), W - 16, 32);
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillStyle = '#12131699';
    ctx.fillText(`BEST ${String(st.best).padStart(4, '0')}`, W - 16, 50);

    if (st.over) {
      ctx.fillStyle = 'rgba(239,237,230,.88)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#121316';
      ctx.textAlign = 'center';
      ctx.font = '700 26px ui-monospace, monospace';
      ctx.fillText('GAME OVER', W / 2, H / 2 - 8);
      ctx.font = '14px ui-monospace, monospace';
      ctx.fillText(`跑了 ${st.score} 分 · 按空格 / 点一下 重来`, W / 2, H / 2 + 22);
    }
  };

  const loop = () => {
    const alive = step();
    draw();
    if (alive && running) raf = requestAnimationFrame(loop);
    else running = false;
  };

  return { st, jump, reset, loop, draw, get running() { return running; } };
}

let game = null;

export default {
  id: 'fishrun',
  title: '像素小鱼',

  render() {
    return `${viewhead({
      title: 'PIXEL FISH',
      sub: '一条像素小鱼，躲水母和石头。空格 / 点画面跳，撞到就结束；越跑越快，纪录存在本机。',
      idx: 'MINES / FISH',
    })}
    <div class="mr-tabs" role="tablist" aria-label="小游戏">
      <a class="mr-tab" href="#/mine?room=1">扫雷</a>
      <a class="mr-tab is-on" href="#/fishrun" role="tab" aria-selected="true">像素小鱼</a>
    </div>
    <canvas id="fishCanvas" width="${W}" height="${H}"
      style="width:100%;max-width:${W}px;display:block;border:2px solid var(--ink-100);image-rendering:pixelated;background:#eaf3ff"></canvas>
    <p class="mono" style="font-size:var(--fs-2xs);color:var(--fg-soft);margin-top:var(--sp-2)">
      空格 / 点击跳 · 撞上就结束 · BEST 记录存在本机
    </p>`;
  },

  mount(root) {
    const canvas = root.querySelector('#fishCanvas');
    if (!canvas) return undefined;
    game = makeGame(canvas);
    game.reset();
    raf = requestAnimationFrame(game.loop);

    const onKey = (e) => {
      if (e.code === 'Space' || e.key === ' ' || e.code === 'ArrowUp') {
        e.preventDefault();
        game.jump();
        if (!game.running) { game.reset(); raf = requestAnimationFrame(game.loop); }
      }
    };
    const onTap = (e) => {
      if (!e.target.closest('#fishCanvas')) return;
      game.jump();
      if (!game.running) { game.reset(); raf = requestAnimationFrame(game.loop); }
    };
    const onVis = () => {
      if (document.hidden) { running = false; cancelAnimationFrame(raf); }
      else if (game && !game.running && !game.st.over) { running = true; raf = requestAnimationFrame(game.loop); }
    };

    document.addEventListener('keydown', onKey);
    canvas.addEventListener('pointerdown', onTap);
    document.addEventListener('visibilitychange', onVis);

    return () => {
      document.removeEventListener('keydown', onKey);
      canvas.removeEventListener('pointerdown', onTap);
      document.removeEventListener('visibilitychange', onVis);
      cancelAnimationFrame(raf);
      running = false;
    };
  },
};
