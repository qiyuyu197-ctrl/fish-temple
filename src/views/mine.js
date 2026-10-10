/**
 * views/mine.js — 扫雷（板块 / MINES）
 * ------------------------------------------------------------------
 * 规则在 plugins/minesweeper.js，这里只管画面与交互。
 *
 * 交互一览（尽量让每一步都有反馈）：
 *   左键     挖开；点到已挖开的数字＝和弦（周围旗数够了就一次开完）
 *   右键     插旗 / 取消
 *   长按     触屏插旗（500ms）
 *   悬停     数字周围旗数够了 → 预亮将要被挖开的格子；没够 → 轻轻晃一下
 *   键盘     ↑↓←→ 移动光标，空格/回车挖开，F 插旗，R 重开
 *   动效     洪水展开逐格落下、插旗弹一下、踩雷震屏 + 雷区级联翻出、通关整盘信号色波浪
 *   状态     计时器（第一下才起表）、剩余雷数、进度条、难度切换、战绩（本地保存）
 */

import { esc } from '../util/dom.js';
import { Toast } from '../ui/toast.js';
import { Motion } from '../core/motion.js';
import { viewhead } from '../ui/bits.js';
import {
  LEVELS, getLevel, createGame, reveal, toggleFlag, chord, canChord,
  revealMines, wrongFlags, minesLeft, elapsed, elapsedMs, progress,
  loadStats, recordResult, resetStats, neighbors,
  serializeGame, deserializeGame, saveGame, loadGame,
} from '../plugins/minesweeper.js';

const CELL_MAX = 34;   // 格子最大边长（px）
const CELL_MIN = 22;   // 最小边长；再小就靠横向滚动
const LONG_PRESS = 500;

let live = null;       // 当前这一局的运行时句柄（自检也用它）
let handoff = null;    // 会话内的对局交接：切板块时留在这里，切回来直接用

/* ---------------- 片段 ---------------- */

const pad2 = (n) => String(Math.max(0, Math.min(999, Math.floor(n)))).padStart(3, '0');
const glyphOf = (n) => (n > 0 ? String(n) : '');

function statsHTML(stats, levelId) {
  const s = stats[levelId] || { played: 0, won: 0, best: 0 };
  const rate = s.played ? Math.round((s.won / s.played) * 100) : 0;
  return `
    <span class="ms-stat"><em>已玩</em><b class="mono">${String(s.played).padStart(2, '0')}</b></span>
    <span class="ms-stat"><em>胜局</em><b class="mono">${String(s.won).padStart(2, '0')}</b></span>
    <span class="ms-stat"><em>胜率</em><b class="mono">${rate}%</b></span>
    <span class="ms-stat"><em>最佳</em><b class="mono">${s.best ? `${s.best}s` : '--'}</b></span>`;
}

/* ---------------- 视图 ---------------- */

export default {
  id: 'mine',
  title: '扫雷',

  render() {
    const stats = loadStats();
    const lv = LEVELS[0];
    return `
    <section class="ms">
      ${viewhead({
        title: 'MINESWEEPER',
        sub: '一块干净的布雷场。左键挖开、右键插旗，数字表示相邻八格里的雷数；点到已挖开的数字可以和弦，一次开完周围。第一下永远安全，计时从第一下开始。',
        idx: 'MODULE / 06',
        meta: [
          { label: 'GRID', value: `${lv.cols} × ${lv.rows}`, id: 'msMetaGrid' },
          { label: 'MINES', value: String(lv.mines).padStart(2, '0'), id: 'msMetaMines' },
          { label: 'BEST', value: '--', id: 'msMetaBest' },
        ],
        actions: `<button class="btn btn--sm" id="msNew">${'⟳'} 新的一局</button>`,
      })}

      <div class="ms-hud" style="margin-top:var(--sp-5)">
        <div class="ms-hud__group ms-hud__levels" role="tablist" aria-label="难度">
          ${LEVELS.map((l) => `<button class="ms-lv" data-level="${l.id}" role="tab"
              aria-selected="${l.id === lv.id}" title="${l.cn} · ${l.cols}×${l.rows} · ${l.mines} 雷">
              <span class="mono">${esc(l.label)}</span><span class="ms-lv__cn">${l.cols}×${l.rows} · ${l.mines}</span>
            </button>`).join('')}
        </div>

        <div class="ms-hud__group ms-hud__meters">
          <span class="ms-meter" title="剩余雷数（旗插多了会变负）">
            <em class="k-label">MINES</em><b class="mono" id="msMines">${pad2(lv.mines)}</b>
          </span>
          <span class="ms-meter" title="用时（第一下起表）">
            <em class="k-label">TIME</em><b class="mono" id="msTime">000</b>
          </span>
          <span class="ms-progress" title="已挖开比例">
            <i id="msProgress" style="width:0%"></i>
          </span>
          <span class="ms-state" id="msState"><span class="status-dot"></span><b class="mono">READY</b></span>
        </div>

        <div class="ms-hud__group ms-hud__modes">
          <button class="ms-mode" id="msMode" aria-pressed="false" title="切换左键行为（触屏也能只插旗）">
            <span class="ms-mode__ico">⛏</span><span class="ms-mode__txt">挖开</span>
          </button>
        </div>
      </div>

      <div class="ms-stage" id="msStage">
        <span class="hud-corner hud-corner--tl"></span>
        <span class="hud-corner hud-corner--tr"></span>
        <span class="hud-corner hud-corner--bl"></span>
        <span class="hud-corner hud-corner--br"></span>
        <div class="ms-scroll" id="msScroll">
          <div class="ms-board" id="msBoard" tabindex="0" role="grid"
               aria-label="扫雷棋盘：方向键移动，空格挖开，F 插旗"></div>
        </div>
      </div>
      <div class="ms-banner" id="msBanner" hidden>
        <div class="ms-banner__main">
          <b class="mono" id="msBannerTitle">—</b>
          <span class="mono faint" id="msBannerSub"></span>
        </div>
        <button class="btn btn--sm btn--signal" id="msAgain">再来一局</button>
      </div>

      <div class="grid grid--split" style="margin-top:var(--sp-5);align-items:start">
        <div class="panel" data-reveal>
          <div class="panel__head">
            <span class="panel__title">本机战绩</span>
            <span class="mono faint" style="font-size:var(--fs-2xs)" id="msStatsFor">BEGINNER</span>
          </div>
          <div class="panel__body">
            <div class="ms-stats" id="msStats">${statsHTML(stats, lv.id)}</div>
            <div style="display:flex;gap:6px;margin-top:var(--sp-4);flex-wrap:wrap">
              <button class="btn btn--sm btn--danger" id="msReset">清空战绩</button>
              <span class="faint mono" style="font-size:var(--fs-2xs);align-self:center">只存在这台设备上</span>
            </div>
          </div>
        </div>

        <div class="panel" data-reveal data-reveal-delay="60">
          <div class="panel__head">
            <span class="panel__title">操作</span>
            <span class="mono faint" style="font-size:var(--fs-2xs)">CONTROLS</span>
          </div>
          <div class="panel__body">
            <div class="ms-keys">
              ${[
                ['左键', '挖开；点到数字＝和弦'],
                ['右键 / 长按', '插旗、取消'],
                ['方向键 + 空格', '键盘操作整盘'],
                ['F', '光标处插旗'],
                ['R', '重开一局'],
                ['⛏ / ⚑', '切换左键行为'],
              ].map(([k, v]) => `<div class="ms-key"><kbd>${esc(k)}</kbd><span>${esc(v)}</span></div>`).join('')}
            </div>
            <p class="faint" style="font-size:var(--fs-2xs);margin:var(--sp-4) 0 0;line-height:1.7">
              和弦的前提是「数字周围的旗数 = 数字」；旗插错了，和弦会直接踩雷 —— 和经典规则一致。
              第一次点击的格子及其八邻域必定没有雷，所以开局第一下一定能展开一片。
            </p>
          </div>
        </div>
      </div>
    </section>`;
  },

  mount(root) {
    Motion.reveal(root);
    Motion.reveal(root);

    const $ = (sel) => root.querySelector(sel);
    const boardEl = $('#msBoard');
    const scrollEl = $('#msScroll');
    const stageEl = $('#msStage');
    const els = {
      mines: $('#msMines'),
      time: $('#msTime'),
      progress: $('#msProgress'),
      state: $('#msState'),
      stats: $('#msStats'),
      statsFor: $('#msStatsFor'),
      banner: $('#msBanner'),
      bannerTitle: $('#msBannerTitle'),
      bannerSub: $('#msBannerSub'),
      metaGrid: $('#msMetaGrid'),
      metaMines: $('#msMetaMines'),
      metaBest: $('#msMetaBest'),
      mode: $('#msMode'),
    };

    let levelId = LEVELS[0].id;
    let s = createGame(levelId);
    let cellEls = [];
    let cursor = 0;
    let flagMode = false;         // 左键 = 插旗
    let timer = 0;
    let pressTimer = 0;
    let longPressed = false;
    let restored = false;         // 这一局是从快照还原的

    /** 对局快照：切板块前 / 每次操作后都会写一份 */
    const snapshot = () => serializeGame(s, {
      cursor, flagMode, elapsedBefore: elapsedMs(s) / 1000,   // 用毫秒精度，秒级取整会丢时间
    });
    const persist = () => saveGame(snapshot());

    /* ---------- 尺寸：按容器宽度算格子边长 ----------
       必须量「舞台的父容器」而不是舞台本身：舞台是 width:fit-content（尺寸由棋盘决定），
       拿它当基准会形成循环 —— 越量越小，最后缩到最小格子。 */
    const fitCells = () => {
      const host = stageEl.parentElement || document.body;
      const pad = (parseFloat(getComputedStyle(stageEl).paddingLeft) || 0) * 2 + 2;
      const avail = Math.max(180, host.clientWidth - pad);
      const size = Math.max(CELL_MIN, Math.min(CELL_MAX, Math.floor(avail / s.cols) - 2));
      boardEl.style.setProperty('--ms-cell', `${size}px`);
      boardEl.style.setProperty('--ms-cols', String(s.cols));
    };

    /* ---------- 渲染 ---------- */
    const buildBoard = () => {
      boardEl.style.setProperty('--ms-cols', String(s.cols));
      boardEl.innerHTML = s.cells.map((_, i) => {
        const r = Math.floor(i / s.cols);
        const c = i % s.cols;
        return `<button class="ms-cell" data-i="${i}" role="gridcell" tabindex="-1"
                aria-label="第 ${r + 1} 行第 ${c + 1} 列"></button>`;
      }).join('');
      cellEls = [...boardEl.querySelectorAll('.ms-cell')];
      fitCells();
    };

    const paintMeta = () => {
      const lv = getLevel(levelId);
      const st = loadStats()[levelId] || { best: 0 };
      if (els.metaGrid) els.metaGrid.textContent = `${lv.cols} × ${lv.rows}`;
      if (els.metaMines) els.metaMines.textContent = String(lv.mines).padStart(2, '0');
      if (els.metaBest) els.metaBest.textContent = st.best ? `${st.best}s` : '--';
      if (els.statsFor) els.statsFor.textContent = lv.cn;
      if (els.stats) els.stats.innerHTML = statsHTML(loadStats(), levelId);
      root.querySelectorAll('.ms-lv').forEach((b) => {
        b.setAttribute('aria-selected', String(b.dataset.level === levelId));
      });
    };

    const paintHud = () => {
      if (els.mines) els.mines.textContent = pad2(minesLeft(s));
      if (els.time) els.time.textContent = pad2(elapsed(s));
      if (els.progress) els.progress.style.width = `${(progress(s) * 100).toFixed(1)}%`;
      if (els.state) {
        const dot = els.state.querySelector('.status-dot');
        const txt = els.state.querySelector('b');
        const phase = s.over ? (s.won ? 'CLEARED' : 'DETONATED') : (s.placed ? 'SWEEPING' : 'READY');
        dot.className = `status-dot${s.over ? (s.won ? ' status-dot--on' : ' status-dot--alert') : (s.placed ? ' status-dot--on' : '')}`;
        txt.textContent = phase;
      }
    };

    /** 单格重绘（只碰变化的格子，动画类也在这里挂） */
    const paintCell = (i, { delay = 0, kind = '' } = {}) => {
      const cell = s.cells[i];
      const el = cellEls[i];
      if (!el) return;
      el.classList.toggle('is-open', cell.open);
      el.classList.toggle('is-flag', cell.flag && !cell.open);
      el.classList.toggle('is-mine', cell.mine && cell.open);
      el.classList.toggle('is-boom', !!cell.boom);
      el.classList.toggle('is-wrong', el.classList.contains('is-wrong'));
      const n = cell.open && !cell.mine ? cell.adj : 0;
      el.dataset.n = String(n);
      el.textContent = cell.open ? (cell.mine ? '✱' : glyphOf(cell.adj)) : (cell.flag ? '⚑' : '');
      if (kind && delay !== undefined) {
        el.style.setProperty('--ms-d', `${delay}ms`);
        el.classList.add(kind);
      }
    };

    const paintAll = () => { s.cells.forEach((_, i) => paintCell(i)); paintHud(); clearCursorClasses(); };

    const clearCursorClasses = () => {
      cellEls.forEach((el, i) => {
        el.classList.toggle('is-cursor', !s.over && i === cursor);
        el.classList.remove('is-pre', 'is-nope');
      });
    };

    /** 把一格标成「将被和弦挖开」的预告，或「旗数不够」的否定反馈 */
    const previewChord = (i, on) => {
      if (s.over) return;
      const r = Math.floor(i / s.cols);
      const c = i % s.cols;
      const cell = s.cells[i];
      const target = on && canChord(s, r, c) ? 'is-pre' : (on && cell.open && cell.adj > 0 ? 'is-nope' : null);
      neighbors(s, r, c).forEach(([nr, nc]) => {
        const ni = nr * s.cols + nc;
        const n = s.cells[ni];
        if (n.open || n.flag) return;
        cellEls[ni].classList.toggle('is-pre', target === 'is-pre');
        if (target === 'is-nope') {
          cellEls[ni].classList.remove('is-nope');
          if (on) { cellEls[ni].classList.add('is-nope'); }
        } else {
          cellEls[ni].classList.remove('is-nope');
        }
      });
    };

    /* ---------- 结算 ---------- */
    const stopTimer = () => { clearInterval(timer); timer = 0; };
    const startTimer = () => {
      if (timer) return;
      timer = setInterval(() => { paintHud(); }, 250);
    };

    /** 结算条：还原已结束的对局时只画状态，不再播动画、也不再记账 */
    const paintBanner = (won, { animate = true } = {}) => {
      if (!els.banner) return;
      els.banner.hidden = false;
      els.banner.classList.toggle('is-win', !!won);
      const secs = elapsed(s);
      const st = loadStats()[levelId] || { best: 0 };
      els.bannerTitle.textContent = won ? 'AREA CLEARED' : 'DETONATED';
      els.bannerSub.textContent = won
        ? `${getLevel(levelId).label} · 用时 ${secs} 秒${st.best === secs ? ' · 新纪录' : ''}`
        : `已经挖开 ${s.opened} 格 · 再试一次`;
      els.banner.style.animation = animate ? '' : 'none';
    };

    const settle = (won) => {
      stopTimer();
      paintHud();
      const secs = elapsed(s);
      const stats = recordResult(levelId, won, secs);
      if (els.stats) els.stats.innerHTML = statsHTML(stats, levelId);
      const st = stats[levelId] || { best: 0 };
      if (els.metaBest) els.metaBest.textContent = st.best ? `${st.best}s` : '--';

      if (won) {
        // 通关：从左上到右下扫一道信号色
        cellEls.forEach((el, i) => {
          const r = Math.floor(i / s.cols);
          const c = i % s.cols;
          el.style.setProperty('--ms-d', `${(r + c) * 26}ms`);
          el.classList.add('is-win');
        });
        Toast.ok(`通关：${getLevel(levelId).label} · ${secs}s`);
      } else {
        const { mines } = revealMines(s, cellEls.findIndex((el) => el.classList.contains('is-boom')));
        mines.forEach((mi, k) => {
          paintCell(mi, { delay: k * 22, kind: 'is-cascade' });
        });
        wrongFlags(s).forEach((wi) => cellEls[wi].classList.add('is-wrong'));
        stageEl.classList.add('is-shake');
        setTimeout(() => stageEl.classList.remove('is-shake'), 420);
        Toast.err(`踩雷了 · 用时 ${secs}s`);
      }

      paintBanner(won, { animate: true });
      paintHud();
      persist();
    };

    /* ---------- 操作 ---------- */
    const doReveal = (i) => {
      const r = Math.floor(i / s.cols);
      const c = i % s.cols;
      const cell = s.cells[i];

      // 点已挖开的数字 = 和弦
      if (cell.open) {
        if (!canChord(s, r, c)) {
          cellEls[i].classList.add('is-nope');
          setTimeout(() => cellEls[i]?.classList.remove('is-nope'), 320);
          return;
        }
        const res = chord(s, r, c);
        res.opened.forEach((oi, k) => paintCell(oi, { delay: k * 16, kind: 'is-pop' }));
        paintHud();
        if (res.boom) settle(false);
        else if (res.won) settle(true);
        else persist();
        return;
      }

      const res = reveal(s, r, c);
      if (!res.ok) return;
      startTimer();
      if (res.boom) {
        paintCell(i, { delay: 0, kind: 'is-pop' });
        settle(false);
        return;
      }
      res.opened.forEach((oi, k) => paintCell(oi, { delay: k * 14, kind: 'is-pop' }));
      paintHud();
      if (res.won) settle(true);
      else persist();
    };

    const doFlag = (i) => {
      // toggleFlag 收的是行/列，这里把一维下标换算过去（踩过坑：直接传下标会被判定越界）
      const r = Math.floor(i / s.cols);
      const c = i % s.cols;
      const res = toggleFlag(s, r, c);
      if (!res.ok) return;
      paintCell(i, { delay: 0, kind: res.flag ? 'is-flagged' : '' });
      if (!res.flag) cellEls[i].classList.remove('is-flagged');
      paintHud();
      persist();
    };

    const act = (i) => (flagMode ? doFlag(i) : doReveal(i));

    const newGame = (nextLevel = levelId) => {
      stopTimer();
      levelId = nextLevel;
      s = createGame(levelId);
      cursor = 0;
      restored = false;
      if (els.banner) { els.banner.hidden = true; els.banner.style.animation = ''; }
      stageEl.classList.remove('is-shake');
      buildBoard();
      paintAll();
      paintMeta();
      persist();
      boardEl.focus({ preventScroll: true });
    };

    /* ---------- 指针交互 ---------- */
    boardEl.addEventListener('contextmenu', (e) => e.preventDefault());

    boardEl.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.ms-cell');
      if (!el) return;
      const i = Number(el.dataset.i);
      longPressed = false;
      clearTimeout(pressTimer);
      // 触屏（或按住不动）长按插旗
      pressTimer = setTimeout(() => {
        if (e.pointerType === 'touch' || e.pointerType === 'pen') {
          longPressed = true;
          doFlag(i);
        }
      }, LONG_PRESS);
    });

    const endPress = () => {
      clearTimeout(pressTimer);
      // 长按结束后浏览器通常会补一个 click 把它吃掉；万一没补（或指针被取消），
      // 这个标记会一直挂着、把下一次普通点击吞掉 —— 兜底 400ms 后清掉
      if (longPressed) setTimeout(() => { longPressed = false; }, 400);
    };
    boardEl.addEventListener('pointerup', endPress);
    boardEl.addEventListener('pointercancel', endPress);
    boardEl.addEventListener('pointerleave', endPress);

    boardEl.addEventListener('click', (e) => {
      const el = e.target.closest('.ms-cell');
      if (!el) return;
      if (longPressed) { longPressed = false; return; }
      const i = Number(el.dataset.i);
      cursor = i;
      clearCursorClasses();
      if (e.button === 2) return;
      act(i);
    });

    boardEl.addEventListener('auxclick', (e) => {
      const el = e.target.closest('.ms-cell');
      if (!el || e.button !== 1) return;      // 中键 = 和弦
      e.preventDefault();
      const i = Number(el.dataset.i);
      if (s.cells[i].open) doReveal(i);
    });

    // 右键插旗（交给 pointerdown 保证在 click 之前处理）
    boardEl.addEventListener('mousedown', (e) => {
      const el = e.target.closest('.ms-cell');
      if (!el || e.button !== 2) return;
      e.preventDefault();
      const i = Number(el.dataset.i);
      if (s.cells[i].open) doReveal(i);       // 右键点数字也当和弦
      else doFlag(i);
    });

    // 悬停预告
    boardEl.addEventListener('mouseover', (e) => {
      const el = e.target.closest('.ms-cell');
      if (!el) return;
      previewChord(Number(el.dataset.i), true);
    });
    boardEl.addEventListener('mouseout', (e) => {
      const el = e.target.closest('.ms-cell');
      if (!el) return;
      previewChord(Number(el.dataset.i), false);
    });

    /* ---------- 键盘 ---------- */
    const onKey = (e) => {
      const cols = s.cols;
      const rows = s.rows;
      const r = Math.floor(cursor / cols);
      const c = cursor % cols;
      let next = null;
      if (e.key === 'ArrowUp') next = [Math.max(0, r - 1), c];
      else if (e.key === 'ArrowDown') next = [Math.min(rows - 1, r + 1), c];
      else if (e.key === 'ArrowLeft') next = [r, Math.max(0, c - 1)];
      else if (e.key === 'ArrowRight') next = [r, Math.min(cols - 1, c + 1)];
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); doReveal(cursor); return; }
      else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); doFlag(cursor); return; }
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); newGame(); return; }
      if (next) {
        e.preventDefault();
        cursor = next[0] * cols + next[1];
        clearCursorClasses();
        paintCell(cursor);
      }
    };
    boardEl.addEventListener('keydown', onKey);

    /* ---------- HUD 按钮 ---------- */
    const onHudClick = (e) => {
      const lv = e.target.closest('[data-level]');
      if (lv) { newGame(lv.dataset.level); return; }
      if (e.target.closest('#msNew') || e.target.closest('#msAgain')) { newGame(); return; }
      if (e.target.closest('#msMode')) {
        flagMode = !flagMode;
        els.mode.setAttribute('aria-pressed', String(flagMode));
        els.mode.querySelector('.ms-mode__ico').textContent = flagMode ? '⚑' : '⛏';
        els.mode.querySelector('.ms-mode__txt').textContent = flagMode ? '插旗' : '挖开';
        Toast.show(flagMode ? '左键：插旗' : '左键：挖开');
        return;
      }
      if (e.target.closest('#msReset')) {
        if (!confirm('清空本机的扫雷战绩？')) return;
        resetStats();
        paintMeta();
        Toast.show('战绩已清空');
      }
    };
    root.addEventListener('click', onHudClick);

    /* ---------- 启动：优先接着上一局 ---------- */
    // 切板块时视图会被整个换掉（router 会换 #view 节点），所以对局状态不能放在视图里。
    // handoff 是本次会话的内存交接（最快），localStorage 那份额外管「刷新页面」。
    const handoffSnapshot = handoff;
    handoff = null;
    const restoredGame = deserializeGame(handoffSnapshot) || loadGame();
    if (restoredGame) {
      s = restoredGame.game;
      levelId = s.level;
      cursor = restoredGame.cursor;
      flagMode = restoredGame.flagMode;
      restored = true;
    }

    const onResize = () => fitCells();
    window.addEventListener('resize', onResize);

    buildBoard();
    paintAll();
    paintMeta();

    if (restored) {
      // 光标 / 模式按钮都要跟着还原
      clearCursorClasses();
      els.mode.setAttribute('aria-pressed', String(flagMode));
      els.mode.querySelector('.ms-mode__ico').textContent = flagMode ? '⚑' : '⛏';
      els.mode.querySelector('.ms-mode__txt').textContent = flagMode ? '插旗' : '挖开';
      if (s.over) {
        // 已经结算过的局：只画结果，绝不再记一次战绩
        if (!s.won) {
          wrongFlags(s).forEach((wi) => cellEls[wi]?.classList.add('is-wrong'));
          cellEls.forEach((el, i) => { if (s.cells[i].boom) el.classList.add('is-boom'); });
        } else {
          cellEls.forEach((el) => el.classList.add('is-win'));
        }
        paintBanner(s.won, { animate: false });
      } else if (s.opened > 0) {
        Toast.show('已恢复上一局，接着玩');
      }
    }

    // 计时器只在第一下之后才有数字（elapsed 会返回 0）
    startTimer();
    fitCells();

    live = {
      get state() { return s; },
      get level() { return levelId; },
      get restored() { return restored; },
      newGame, doReveal, doFlag, paintAll,
      get cursor() { return cursor; },
      keys: onKey,
    };

    return () => {
      stopTimer();
      clearTimeout(pressTimer);
      window.removeEventListener('resize', onResize);
      // 离开先把快照交接出去（内存 + localStorage），回来时接着玩
      const payload = snapshot();
      handoff = payload;
      saveGame(payload);
      if (live) live = null;
    };
  },
};

/** 供自检直接驱动引擎（window.Terminal.Mines.live） */
export const MinesLive = { get current() { return live; } };
