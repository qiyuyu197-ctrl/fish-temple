/**
 * views/fish-run.js — 像素小鱼（跑酷小游戏）
 * ------------------------------------------------------------------
 * 抄的不是代码，是"那类游戏"的玩法：横向卷轴、单键跳跃、碰到障碍就结束。
 * 这里换成**像素小鱼**：游在水里，躲水母和石头，越久越快。
 *
 * 技术选择：
 *   · 纯 canvas + requestAnimationFrame，零依赖 ✓
 *   · 像素画用**点阵字符串**描述（下面 FISH 那张图），比一堆 fillRect 好改 ✓
 *   · 状态最小：y/vy/速度/障碍数组/分数 ✓ —— 逻辑一眼能看完
 *   · **进去先待机**（started=false）：按空格 / 点画面才开始；结束同理 ✓
 *   · 页面不可见时停掉 rAF，不白烧 CPU ✓
 */

import { viewhead } from '../ui/bits.js';

const BEST_KEY = 'ft.terminal.fishRunBest';

/* 像素小鲨鱼（22×11 网格，朝左）—— 照站主给的那张方格画重画
 * 做法：先用"每行起止列"拼出 身体/背鳍/尾鳍/腹鳍 的**实心**形状，
 * 再给紧邻实心的空格自动描黑边（就是那张画里的黑轮廓 ✓），
 * 最后点上眼睛（深色）和嘴（红色 ✓）。—— 比手抄一张点阵图不容易错。
 */
const GW = 22, GH = 11, PX = 8;
const FILL = 1, OUT = 2, EYE = 3, MOUTH = 4;
const COLORS = { [FILL]: '#2b7fe0', [OUT]: '#121316', [EYE]: '#121316', [MOUTH]: '#e5484d' };

function buildFish() {
  const g = Array.from({ length: GH }, () => new Array(GW).fill(0));
  const put = (x, y, v = FILL) => { if (x >= 0 && x < GW && y >= 0 && y < GH) g[y][x] = v; };
  const span = (y, x0, x1, v = FILL) => { for (let x = x0; x <= x1; x++) put(x, y, v); };

  // 身体：中间两行最宽，上下收窄；头在左 ✓
  span(5, 4, 17);
  span(6, 2, 18);
  span(7, 1, 18);
  span(8, 2, 17);
  span(9, 6, 14);

  // 背鳍（上面那个尖角 ✓）
  span(1, 11, 12);
  span(2, 10, 13);
  span(3, 9, 14);
  span(4, 6, 15);

  // 尾鳍（右边分叉 ✓）
  span(5, 18, 20);
  span(6, 19, 21);
  span(8, 19, 21);
  span(9, 18, 20);

  // 腹鳍（肚子下面那个小三角 ✓）
  span(10, 9, 11);

  // 自动描黑边：紧邻实心的空格 ✓
  const solid = (x, y) => x >= 0 && x < GW && y >= 0 && y < GH && g[y][x] === FILL;
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      if (g[y][x] !== 0) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) {
        for (let dx = -1; dx <= 1; dx++) if (solid(x + dx, y + dy)) { near = true; break; }
      }
      if (near) g[y][x] = OUT;
    }
  }

  // 眼睛与红嘴（描边之后再点，免得被盖住 ✓）
  put(6, 6, EYE); put(6, 7, EYE);
  span(8, 2, 5, MOUTH);
  return g;
}

const FISH_GRID = buildFish();
const FISH_W = GW * PX;
const FISH_H = GH * PX;

function paintFish(ctx, x, y) {
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW; gx++) {
      const v = FISH_GRID[gy][gx];
      if (!v) continue;
      ctx.fillStyle = COLORS[v] || '#2b7fe0';
      ctx.fillRect(x + gx * PX, y + gy * PX, PX, PX);
    }
  }
}

const W = 960, H = 380;      // 画布逻辑尺寸（PC 上放大；CSS 仍按容器缩放 ✓）
const GROUND = H - 34;       // 水底基准线
const GRAVITY = 0.65;
const JUMP_V = -11.5;

let raf = 0;
let running = false;

function makeGame(canvas) {
  const ctx = canvas.getContext('2d');
  const floorY = () => GROUND - FISH_H;   // 落地时鱼的 y

  const st = {
    y: GROUND - FISH_H,
    vy: 0,
    speed: 4.2,
    score: 0,
    best: Number(localStorage.getItem(BEST_KEY) || 0),
    obstacles: [],
    t: 0,
    over: false,
    started: false,      // false = 待机画面（还没开始 ✓）
  };

  const ready = () => {
    st.y = floorY(); st.vy = 0; st.speed = 4.2; st.score = 0;
    st.obstacles = []; st.t = 0; st.over = false; st.started = false;
    running = true;
  };

  const reset = () => {
    ready();
    st.started = true;    // 按下去就算开始 ✓
  };

  /** 空格 / 点击统一入口：待机 → 开始；结束 → 重来；跑着 → 跳 */
  const jump = () => {
    if (!st.started) { if (!running) reset(); else st.started = true; return; }
    if (st.over) { reset(); return; }
    if (st.y >= floorY() - 0.5) st.vy = JUMP_V;
  };

  const spawn = () => {
    const tall = Math.random() < 0.6;
    st.obstacles.push({
      x: W + 20,
      w: tall ? 22 : 14,
      h: tall ? 40 : 18,
      kind: tall ? 'jelly' : 'rock',
    });
  };

  const step = () => {
    if (!st.started) return true;      // 待机：只画不动 ✓
    if (st.over) return false;
    st.t += 1;
    st.score = Math.floor(st.t / 6);
    st.speed = 4.2 + Math.min(4.5, st.t / 900);
    st.vy += GRAVITY;
    st.y += st.vy;
    if (st.y > floorY()) { st.y = floorY(); st.vy = 0; }

    if (st.t % Math.max(38, 78 - Math.floor(st.speed * 6)) === 0) spawn();
    for (const o of st.obstacles) o.x -= st.speed;
    st.obstacles = st.obstacles.filter((o) => o.x + o.w > -30);

    // 碰撞：取鱼身中间 70%，避免像素边缘太苛刻
    const fx = 70 + PX, fw = FISH_W - 2 * PX, fy = st.y + 3, fh = FISH_H - 6;
    for (const o of st.obstacles) {
      const oy = GROUND - o.h;
      if (fx < o.x + o.w && fx + fw > o.x && fy < oy + o.h && fy + fh > oy) {
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

    // 气泡
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
        for (let k = 0; k < 3; k++) ctx.fillRect(o.x + 3 + k * 7, GROUND - o.h + 10, 3, o.h - 10);
      } else {
        ctx.fillStyle = '#8b8b8b';
        ctx.fillRect(o.x, GROUND - o.h, o.w, o.h);
        ctx.strokeStyle = '#121316'; ctx.lineWidth = 2;
        ctx.strokeRect(o.x, GROUND - o.h, o.w, o.h);
      }
    }

    paintFish(ctx, 70, st.y);

    // 分数
    ctx.fillStyle = '#121316';
    ctx.font = '700 20px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(String(st.score).padStart(4, '0'), W - 16, 32);
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillStyle = '#12131699';
    ctx.fillText(`BEST ${String(st.best).padStart(4, '0')}`, W - 16, 50);

    // 待机 / 结束 两种遮罩
    if (!st.started || st.over) {
      ctx.fillStyle = 'rgba(239,237,230,.88)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#121316';
      ctx.textAlign = 'center';
      ctx.font = '700 26px ui-monospace, monospace';
      ctx.fillText(st.over ? 'GAME OVER' : 'PIXEL FISH', W / 2, H / 2 - 10);
      ctx.font = '14px ui-monospace, monospace';
      ctx.fillText(
        st.over ? `跑了 ${st.score} 分 · 按空格 / 点屏幕 重来` : '按空格 / 点屏幕 开始',
        W / 2, H / 2 + 20,
      );
    }
  };

  const loop = () => {
    const alive = step();
    draw();
    if (alive && running) raf = requestAnimationFrame(loop);
    else running = false;
  };

  return { st, jump, reset, ready, loop, get running() { return running; } };
}

let game = null;

export default {
  id: 'fishrun',
  title: '像素小鱼',

  render() {
    return `${viewhead({
      title: 'PIXEL FISH',
      sub: '一条像素小鱼，躲水母和石头。进去先待机，按空格 / 点屏幕开始；撞到就结束，越跑越快，纪录存在本机。',
      idx: 'MINES / FISH',
    })}
    <div class="mr-tabs" role="tablist" aria-label="小游戏">
      <a class="mr-tab" href="#/mine?room=1">扫雷</a>
      <a class="mr-tab is-on" href="#/fishrun" role="tab" aria-selected="true">像素小鱼</a>
    </div>
    <canvas id="fishCanvas" width="${W}" height="${H}"
      style="width:100%;max-width:${W}px;display:block;border:2px solid var(--ink-100);image-rendering:pixelated;background:#eaf3ff"></canvas>
    <p class="mono" style="font-size:var(--fs-2xs);color:var(--fg-soft);margin-top:var(--sp-2)">
      空格 / 点击 开始或重来 · 跑起来后再按是跳 · BEST 存在本机
    </p>`;
  },

  mount(root) {
    const canvas = root.querySelector('#fishCanvas');
    if (!canvas) return undefined;
    game = makeGame(canvas);
    game.ready();                                    // 待机，不自动开始 ✓
    raf = requestAnimationFrame(game.loop);

    const act = () => {
      game.jump();
      if (!game.running) raf = requestAnimationFrame(game.loop);
    };
    const onKey = (e) => {
      if (e.code === 'Space' || e.key === ' ' || e.code === 'ArrowUp') {
        e.preventDefault();
        act();
      }
    };
    const onTap = (e) => {
      if (!e.target.closest('#fishCanvas')) return;
      e.preventDefault();
      act();
    };
    const onVis = () => {
      if (document.hidden) { running = false; cancelAnimationFrame(raf); }
      else if (game && !game.running && game.st.started && !game.st.over) {
        running = true; raf = requestAnimationFrame(game.loop);
      } else if (game && !game.st.started) {
        running = true; raf = requestAnimationFrame(game.loop);
      }
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
