/**
 * views/mine-room.js — 联机扫雷（合作模式）的房间界面
 * ------------------------------------------------------------------
 * 服务端权威 + 版本轮询（见 plugins/mine-room.js）。
 *
 * **棋盘与反馈复用单人局那一整套**（站主要求：UI 与交互反馈和单人局一样）：
 *   · 同样的标记 `.ms-stage > .ms-scroll > .ms-board > .ms-cell`、同样的 `--ms-cell` 尺寸变量、
 *     `data-n` 数字配色，以及同一批状态类：
 *     is-open / is-flag / is-mine / is-boom / is-wrong / is-pre（和弦预亮）/ is-nope（旗不够晃一下）/
 *     is-pop（揭开放大）/ is-flagged（插旗弹动）/ is-cascade（踩雷级联）/ is-win（通关波浪），
 *     舞台踩雷时加 is-shake 震屏
 *   · 同样的 HUD：剩余雷数 / 计时 / 进度条 / 状态灯 / 左键模式切换（触屏单手也能只插旗）
 *   · 长按插旗、右键插旗、点已揭开的数字和弦 —— 手势与单人局一致
 * 唯一差别是"状态从哪来"：单人局是本机引擎，这里是轮询服务端的权威棋盘，
 * 所以动画靠**对比上一帧**触发（单人局靠引擎返回的事件）。
 *
 * 联机自己才有的东西：邀请链接/房间号、队友列表（在线 + 色标）、房主开新局。
 */

import { esc } from '../util/dom.js';
import { Toast } from '../ui/toast.js';
import { viewhead } from '../ui/bits.js';
import { Auth } from '../plugins/auth.js';
import { MineRoom } from '../plugins/mine-room.js';
import { LEVELS, getLevel } from '../plugins/minesweeper.js';

const ONLINE_MS = 25 * 1000;
const LONG_PRESS = 500;

let ui = { level: 'beginner', mode: 'dig' };   // mode: dig 挖开 / flag 只插旗（与单人局同一个概念）
let prev = null;                                // 上一帧棋盘，用来决定播哪些动画

/** 队友色标：由账号 id 哈希出稳定色相（同一个人在列表里颜色不变） */
function hueOf(sub) { let h = 0; for (let k = 0; k < String(sub).length; k++) h = (h * 31 + String(sub).charCodeAt(k)) % 360; return h; }

const inviteLink = (id) => `${location.origin}${location.pathname}#/mine?room=${encodeURIComponent(id)}`;
const isOnline = (m) => m && m.lastAt && (Date.now() - Date.parse(m.lastAt) < ONLINE_MS);
const cellGlyph = (c) => {
  if (c.flag && !c.open) return '⚑';
  if (!c.open) return '';
  if (c.mine) return '✸';
  return c.adj ? String(c.adj) : '';
};

/* ---------------- 片段 ---------------- */

function hudHTML(room) {
  const g = room.game;
  const lv = getLevel(room.level);
  const secs = Math.round((room.elapsedMs || 0) / 1000);
  const st = g.state === 'won' ? 'CLEAR' : g.state === 'lost' ? 'BOOM' : (g.startedAt ? 'RUN' : 'READY');
  return `
    <div class="ms-hud" style="margin-top:var(--sp-5)">
      <div class="ms-hud__group ms-hud__levels">
        <span class="ms-lv" aria-selected="true" title="难度由房主建房时选定">
          <span class="mono">${esc(lv.label)}</span><span class="ms-lv__cn">${lv.cols}×${lv.rows} · ${lv.mines}</span>
        </span>
      </div>
      <div class="ms-hud__group ms-hud__meters">
        <span class="ms-meter" title="剩余雷数"><em class="mono">MINES</em><b id="mrMines">${room.minesLeft}</b></span>
        <span class="ms-meter" title="用时（第一下起表）"><em class="mono">TIME</em><b id="mrTime">${secs}s</b></span>
        <span class="ms-progress" title="已挖开比例"><i id="mrProg" style="width:${Math.round((room.progress || 0) * 100)}%"></i></span>
        <span class="ms-state" id="mrState"><span class="status-dot"></span><b class="mono">${st}</b></span>
      </div>
      <div class="ms-hud__group ms-hud__modes">
        <button class="ms-mode" id="mrMode" aria-pressed="${ui.mode === 'flag'}" title="切换左键行为（触屏也能只插旗）">
          <span class="ms-mode__ico">${ui.mode === 'flag' ? '⚑' : '⛏'}</span><span class="ms-mode__txt">${ui.mode === 'flag' ? '插旗' : '挖开'}</span>
        </button>
      </div>
    </div>`;
}

function boardHTML(room) {
  const g = room.game;
  const size = g.cols > 16 ? 26 : 30;
  const cells = g.cells.map((c, i) => {
    const cls = ['ms-cell', c.open ? 'is-open' : '', c.flag && !c.open ? 'is-flag' : '', c.mine && c.open ? 'is-mine' : '', c.boom ? 'is-boom' : ''].filter(Boolean).join(' ');
    const n = c.open && c.adj && !c.mine ? ` data-n="${c.adj}"` : '';
    return `<button class="${cls}" data-i="${i}" data-r="${Math.floor(i / g.cols)}" data-c="${i % g.cols}" role="gridcell" tabindex="-1"${n}
      aria-label="第 ${Math.floor(i / g.cols) + 1} 行第 ${(i % g.cols) + 1} 列">${esc(cellGlyph(c))}</button>`;
  }).join('');
  return `
    <div class="ms-stage" id="mrStage">
      <div class="ms-scroll" id="mrScroll">
        <div class="ms-board" id="mrBoard" tabindex="0" role="grid" aria-label="共享棋盘"
             style="--ms-cell:${size}px;grid-template-columns:repeat(${g.cols},var(--ms-cell))">${cells}</div>
      </div>
    </div>`;
}

function membersHTML(room) {
  return `<ul class="mr-members mono">${room.members.map((m) => `
    <li class="${isOnline(m) ? 'is-on' : ''}">
      <span class="mr-dot" aria-hidden="true"></span>
      <span style="display:inline-block;width:10px;height:10px;background:hsl(${hueOf(m.sub)} 72% 52%);border:1px solid var(--ink-100)" title="这个颜色代表 ${esc(m.name)}" aria-hidden="true"></span>
      <b>${esc(m.name)}</b>
      ${m.host ? '<i class="mr-tag">房主</i>' : ''}
      <span class="mr-state">${isOnline(m) ? '在线' : '离线'}</span>
    </li>`).join('')}</ul>`;
}

function panelHTML() {
  if (!Auth.enabled) {
    return `<div class="mr-card"><b class="mono">本站还没启用账号功能</b>
      <p class="mr-note">联机扫雷需要注册账号。当前部署没配 Auth0，所以联机不可用，单人扫雷照常。</p></div>`;
  }
  if (!Auth.loggedIn) {
    return `<div class="mr-card"><b class="mono">联机扫雷只对注册用户开放</b>
      <p class="mr-note">登录后就能创建房间、把邀请链接发给朋友，一起挖同一块棋盘。</p>
      <button class="btn btn--signal" id="mrLogin">登录 / 注册</button></div>`;
  }
  if (!MineRoom.active) {
    return `
      <div class="mr-card">
        <b class="mono">创建房间</b>
        <p class="mr-note">同一块棋盘，谁揭开的都同步给全房间（合作模式）。</p>
        <div class="ms-hud" style="margin-top:var(--sp-3)">
          <div class="ms-hud__group ms-hud__levels" role="tablist" aria-label="难度">
            ${LEVELS.map((l) => `<button class="ms-lv" data-level="${l.id}" role="tab" aria-selected="${l.id === ui.level}"
              title="${esc(l.cn || l.label)} · ${l.cols}×${l.rows} · ${l.mines} 雷">
              <span class="mono">${esc(l.label)}</span><span class="ms-lv__cn">${l.cols}×${l.rows} · ${l.mines}</span></button>`).join('')}
          </div>
        </div>
        <button class="btn btn--signal" id="mrCreate" style="margin-top:var(--sp-3)">创建房间</button>
      </div>
      <div class="mr-card">
        <b class="mono">用房间号加入</b>
        <p class="mr-note">找房主要那 6 位房间号，或者直接打开他给的邀请链接。</p>
        <div class="mr-row">
          <input class="mr-input mono" id="mrCode" maxlength="8" placeholder="ABC123" autocomplete="off" spellcheck="false" />
          <button class="btn" id="mrJoin">加入</button>
        </div>
      </div>
      ${MineRoom.error ? `<div class="mr-err mono">${esc(MineRoom.error)}</div>` : ''}`;
  }

  const room = MineRoom.room;
  const done = room.finished || room.game.state === 'won' || room.game.state === 'lost';
  return `
    <div class="mr-card">
      <div class="mr-head">
        <b class="mono">房间 <span class="mr-code">${esc(room.code)}</span></b>
        <span class="mr-meta mono">${esc(getLevel(room.level).label)} · 版本 ${room.version}</span>
      </div>
      <div class="mr-row">
        <input class="mr-input mono" id="mrLink" readonly value="${esc(inviteLink(room.id))}" aria-label="邀请链接" />
        <button class="btn btn--sm" id="mrCopy">复制</button>
      </div>
      <p class="mr-note">把链接发给已注册的站友，他们打开就自动进这间房（没登录会先引导登录）。</p>
    </div>

    <div class="mr-card">
      <b class="mono">队友（${room.members.length}）</b>
      <div id="mrMembers">${membersHTML(room)}</div>
    </div>

    <section class="ms">
      ${hudHTML(room)}
      ${boardHTML(room)}
      ${done ? `<div class="ms-banner ${room.game.state === 'won' ? 'is-win' : ''}" style="margin-top:var(--sp-4)">
        <div class="ms-banner__main">
          <b class="mono">${room.game.state === 'won' ? 'ALL CLEAR' : 'BOOM'}</b>
          <span>${room.game.state === 'won' ? '全部扫清，合作通关！' : '踩到雷了 —— 让房主开新局'}</span>
        </div>
      </div>` : ''}
      <div class="mr-row" style="margin-top:var(--sp-4)">
        ${room.isHost ? `<button class="btn btn--sm ${done ? 'btn--signal' : ''}" id="mrRestart">开新局（房主）</button>` : ''}
        <button class="btn btn--sm" id="mrLeave">${room.isHost ? '解散房间' : '退出房间'}</button>
      </div>
      <p class="mr-note">左键揭格、右键插旗、点已揭开的数字和弦（与单人局手势一致）；触屏长按插旗，或用右上角的“挖开/插旗”切换。<br>
        队友列表里每个人都带一个色标 —— 用于对照"这一局是谁在和你一起挖"。</p>
    </section>
    ${MineRoom.error ? `<div class="mr-err mono">${esc(MineRoom.error)}</div>` : ''}`;
}

/* ---------------- 把"与上一帧的差异"变成单人局那套动画 ---------------- */

const cellOf = (i) => document.querySelector(`#mrBoard .ms-cell[data-i="${i}"]`);

function play(kind, i, delay = 0) {
  const el = cellOf(i);
  if (!el) return;
  if (delay) el.style.setProperty('--ms-d', `${delay}ms`);
  el.classList.add(kind);
  if (kind !== 'is-flag' && kind !== 'is-nope') setTimeout(() => el.classList.remove(kind), 700);
}

function paintCell(i) {
  const room = MineRoom.room;
  const el = cellOf(i);
  if (!el || !room) return;
  const c = room.game.cells[i];
  el.classList.toggle('is-open', !!c.open);
  el.classList.toggle('is-flag', !!c.flag && !c.open);
  el.classList.toggle('is-mine', !!c.mine && !!c.open);
  el.classList.toggle('is-boom', !!c.boom);
  if (c.open && c.adj && !c.mine) el.setAttribute('data-n', String(c.adj));
  else el.removeAttribute('data-n');
  el.textContent = cellGlyph(c);
}

function syncBoard(room) {
  const g = room.game;
  const board = document.getElementById('mrBoard');
  if (!board) return;
  if (!prev || prev.cols !== g.cols || prev.count !== g.cells.length) {
    // 新局/换难度：整块舞台重画（HUD 由 panelHTML 负责，这里只管棋盘）
    const stage = document.getElementById('mrStage');
    if (stage) stage.outerHTML = boardHTML(room);
    prev = { cols: g.cols, count: g.cells.length, state: g.state, cells: g.cells.map((c) => ({ ...c })) };
    return;
  }

  const opened = [];
  const flagged = [];
  g.cells.forEach((c, i) => {
    const p = prev.cells[i] || {};
    if (c.open && !p.open) opened.push(i);
    if (!!c.flag !== !!p.flag && !c.open) flagged.push(i);
  });
  g.cells.forEach((c, i) => paintCell(i));
  opened.forEach((i, k) => play('is-pop', i, Math.min(k, 40) * 14));
  flagged.forEach((i) => play('is-flagged', i));

  const stage = document.getElementById('mrStage');
  if (g.state === 'lost' && prev.state !== 'lost') {
    g.cells.forEach((c, i) => { if (c.flag && !c.mine) play('is-wrong', i); });
    g.cells.forEach((c, i) => { if (c.mine && c.open) play('is-cascade', i); });
    if (stage) { stage.classList.add('is-shake'); setTimeout(() => stage.classList.remove('is-shake'), 420); }
  }
  if (g.state === 'won' && prev.state !== 'won') {
    g.cells.forEach((c, i) => { if (c.open) play('is-win', i, Math.min(i, 60) * 8); });
  }

  const m = document.getElementById('mrMines'); if (m) m.textContent = String(room.minesLeft);
  const t = document.getElementById('mrTime'); if (t) t.textContent = `${Math.round((room.elapsedMs || 0) / 1000)}s`;
  const p = document.getElementById('mrProg'); if (p) p.style.width = `${Math.round((room.progress || 0) * 100)}%`;
  const st = document.getElementById('mrState');
  if (st) st.querySelector('b').textContent = g.state === 'won' ? 'CLEAR' : g.state === 'lost' ? 'BOOM' : (g.startedAt ? 'RUN' : 'READY');

  prev = { cols: g.cols, count: g.cells.length, state: g.state, cells: g.cells.map((c) => ({ ...c })) };
}

/** 和弦预亮 / 旗不够晃一下（与单人局同一套 is-pre / is-nope） */
function hoverFeedback(i, on) {
  const room = MineRoom.room;
  if (!room) return;
  const g = room.game;
  const c = g.cells[i];
  if (!c) return;
  const r = Math.floor(i / g.cols);
  const col = i % g.cols;
  const around = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const nr = r + dr; const nc = col + dc;
    if (nr >= 0 && nc >= 0 && nr < g.rows && nc < g.cols) around.push(nr * g.cols + nc);
  }
  const flags = around.filter((j) => g.cells[j].flag && !g.cells[j].open).length;
  const enough = !!c.open && c.adj > 0 && flags === c.adj;
  around.forEach((j) => {
    const el = cellOf(j);
    if (!el || g.cells[j].open) return;
    el.classList.toggle('is-pre', on && enough);
    if (on && c.open && c.adj > 0 && !enough) { el.classList.add('is-nope'); setTimeout(() => el.classList.remove('is-nope'), 300); }
    else if (!on) el.classList.remove('is-nope');
  });
}

/* ---------------- 视图 ---------------- */

export default {
  id: 'mine-room',
  title: '联机扫雷',

  render() {
    prev = null;
    return `${viewhead({
      title: 'MINESWEEPER · 联机',
      sub: '一块共享棋盘，谁揭开的都同步给全房间；棋盘与反馈和单人局一致。只对注册用户开放，建房后把邀请链接发给朋友即可。',
      idx: 'MINES / ONLINE',
    })}
    <div class="mr-tabs" role="tablist" aria-label="扫雷模式">
      <a class="mr-tab" href="#/mine" role="tab">单人</a>
      <a class="mr-tab is-on" href="#/mine?room=1" role="tab" aria-selected="true">联机</a>
    </div>
    <div id="mrRoot">${panelHTML()}</div>`;
  },

  mount(root) {
    const repaint = (freshBoard = false) => {
      const host = root.querySelector('#mrRoot');
      if (!host) return;
      host.innerHTML = panelHTML();
      // 整块重画之后要把"上一帧"重置成当前状态，否则下一次差异对比会把整盘都当成新揭开，
      // 满屏乱播 is-pop（也会让踩雷/通关的判定取到错的上一帧）
      if (MineRoom.active) {
        const g = MineRoom.room.game;
        prev = freshBoard || !prev
          ? { cols: g.cols, count: g.cells.length, state: g.state, cells: g.cells.map((c) => ({ ...c })) }
          : prev;
      }
    };

    // 轮询更新：只同步棋盘与 HUD + 队友列表（不整块重画，免得打断动画）
    MineRoom.onUpdate = (room) => {
      if (!room) { repaint(); return; }
      const board = document.getElementById('mrBoard');
      if (!board) { repaint(true); return; }
      syncBoard(room);
      // 队友列表也要刷新 —— 否则房主看不到有人进来（站主实测反馈）
      const mem = document.getElementById('mrMembers');
      if (mem) mem.innerHTML = membersHTML(room);
      const cnt = mem?.closest('.mr-card')?.querySelector('b.mono');
      if (cnt) cnt.textContent = `队友（${room.members.length}）`;
      // 结算：按单人局的方式给结算条（只在刚分出胜负那一下整块重画一次）
      const done = room.game.state === 'won' || room.game.state === 'lost';
      if (done && !document.querySelector('.ms-banner')) repaint(true);
    };

    const m = /[?&]room=([A-Za-z0-9_-]{4,40})/.exec(String(location.hash || ''));
    const invited = m && m[1] !== '1' ? m[1] : null;
    if (invited && Auth.loggedIn && (!MineRoom.active || MineRoom.id !== invited)) {
      void MineRoom.joinById(invited).then((r) => {
        if (!r.ok) Toast.show(r.error || '加入房间失败', 'err');
        repaint(true);
      });
    } else if (MineRoom.active) {
      MineRoom.startPolling();
      repaint(true);
    }

    root.addEventListener('click', async (e) => {
      const lv = e.target.closest('[data-level]');
      if (lv && !MineRoom.active) { ui.level = lv.dataset.level; repaint(); return; }
      if (e.target.closest('#mrLogin')) { Auth.login(); return; }
      if (e.target.closest('#mrMode')) { ui.mode = ui.mode === 'flag' ? 'dig' : 'flag'; repaint(true); return; }
      if (e.target.closest('#mrCreate')) {
        const r = await MineRoom.create(ui.level);
        if (!r.ok) Toast.show(r.error, 'err');
        repaint(true);
        return;
      }
      if (e.target.closest('#mrJoin')) {
        const code = root.querySelector('#mrCode')?.value || '';
        const r = await MineRoom.joinByCode(code);
        if (!r.ok) Toast.show(r.error, 'err');
        repaint(true);
        return;
      }
      if (e.target.closest('#mrCopy')) {
        const val = root.querySelector('#mrLink')?.value || '';
        try { await navigator.clipboard.writeText(val); Toast.ok('邀请链接已复制'); }
        catch { root.querySelector('#mrLink')?.select(); Toast.show('自动复制被浏览器拦了：链接已选中，按 Ctrl+C', 'err'); }
        return;
      }
      if (e.target.closest('#mrRestart')) {
        const r = await MineRoom.restart();
        if (!r.ok) Toast.show(r.error, 'err');
        repaint(true);
        return;
      }
      if (e.target.closest('#mrLeave')) { await MineRoom.leave(); Toast.ok('已退出房间'); repaint(); return; }

      const cell = e.target.closest('.ms-cell');
      if (cell && MineRoom.active && !cell.disabled) {
        const r0 = Number(cell.dataset.r);
        const c0 = Number(cell.dataset.c);
        const cur = MineRoom.room.game.cells[Number(cell.dataset.i)];
        const action = ui.mode === 'flag' ? 'flag' : ((cur && cur.open && cur.adj) ? 'chord' : 'reveal');
        const res = await MineRoom.move(action, r0, c0);
        if (!res.ok) Toast.show(res.error, 'err');
      }
    });

    root.addEventListener('pointerover', (e) => {
      const cell = e.target.closest('#mrBoard .ms-cell');
      if (cell && MineRoom.active) hoverFeedback(Number(cell.dataset.i), true);
    });
    root.addEventListener('pointerout', (e) => {
      const cell = e.target.closest('#mrBoard .ms-cell');
      if (cell && MineRoom.active) hoverFeedback(Number(cell.dataset.i), false);
    });

    let pressTimer = null;
    root.addEventListener('contextmenu', (e) => {
      const cell = e.target.closest('#mrBoard .ms-cell');
      if (!cell || !MineRoom.active) return;
      e.preventDefault();
      void MineRoom.move('flag', Number(cell.dataset.r), Number(cell.dataset.c)).then((r) => { if (!r.ok) Toast.show(r.error, 'err'); });
    });
    root.addEventListener('touchstart', (e) => {
      const cell = e.target.closest('#mrBoard .ms-cell');
      if (!cell || !MineRoom.active) return;
      pressTimer = setTimeout(() => {
        void MineRoom.move('flag', Number(cell.dataset.r), Number(cell.dataset.c)).then((r) => { if (!r.ok) Toast.show(r.error, 'err'); });
      }, LONG_PRESS);
    }, { passive: true });
    root.addEventListener('touchend', () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } });

    return () => {
      MineRoom.stopPolling();
      MineRoom.onUpdate = null;
      if (pressTimer) clearTimeout(pressTimer);
    };
  },
};
