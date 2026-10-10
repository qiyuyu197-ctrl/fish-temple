/**
 * views/mine-room.js — 联机扫雷（合作模式）的房间界面
 * ------------------------------------------------------------------
 * 服务端权威 + 版本轮询（见 plugins/mine-room.js）。
 *
 * **棋盘与反馈复用单人局那一整套**（站主要求：和单人局一样）：
 *   同样的 .ms-hud / .ms-stage > .ms-scroll > .ms-board > .ms-cell、同样的 --ms-cell 尺寸、
 *   data-n 数字配色，以及同一批状态类：is-open / is-flag / is-mine / is-boom / is-wrong /
 *   is-pre（和弦预亮）/ is-nope（旗不够晃一下）/ is-pop（揭开放大）/ is-flagged（插旗弹动）/
 *   is-cascade（踩雷级联）/ is-win（通关波浪），舞台踩雷时 is-shake 震屏。
 *
 * ⚠️ 两个踩过的坑（都写在注释里，免得再犯）：
 *   ① 引擎的终局是 **over / won 布尔**，不是 state === 'won'/'lost' ——
 *      之前按 state 判断，导致结算条、雷区级联、翻雷全都不触发。
 *   ② 轮询每 250ms 一次，如果每次都把所有格子重画一遍，棋盘会**抖**
 *      （文字节点重排 + 动画类反复加删）。所以这里只画**真正变化的格子**，
 *      悬停预亮也只在"指针换到另一格"时才触发。
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

let ui = { level: 'beginner', mode: 'dig' };   // mode: dig 挖开 / flag 只插旗
let prev = null;                                // 上一帧棋盘（差异对比 + 动画触发）
let lastHover = -1;                             // 上一次预亮的格（防止悬停时反复晃）

const hueOf = (sub) => { let h = 0; const s = String(sub); for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) % 360; return h; };
const inviteLink = (id) => `${location.origin}${location.pathname}#/mine?room=${encodeURIComponent(id)}`;
const isOnline = (m) => m && m.lastAt && (Date.now() - Date.parse(m.lastAt) < ONLINE_MS);
const isFinal = (g) => !!g && (!!g.over || !!g.won);
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
  const st = g.won ? 'CLEAR' : g.over ? 'BOOM' : (g.startedAt ? 'RUN' : 'READY');
  return `
    <div class="ms-hud" style="margin-top:var(--sp-5)">
      <div class="ms-hud__group ms-hud__levels">
        <span class="ms-lv" aria-selected="true" title="难度由房主建房时选定">
          <span class="mono">${esc(lv.label)}</span><span class="ms-lv__cn">${lv.cols}×${lv.rows} · ${lv.mines}</span>
        </span>
      </div>
      <div class="ms-hud__group ms-hud__meters">
        <span class="ms-meter" title="剩余雷数"><em class="mono">MINES</em><b id="mrMines">${room.minesLeft}</b></span>
        <span class="ms-meter" title="用时"><em class="mono">TIME</em><b id="mrTime">${secs}s</b></span>
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

/** 结算条（与单人局的 .ms-banner 同构）+ 本局统计与 MVP */
function bannerHTML(room) {
  const g = room.game;
  const won = !!g.won;
  // 统计：步数多者为 MVP（并列时看谁揭开的格子多）
  const rows = room.members.map((m) => {
    const s = (room.stats || {})[m.sub] || { steps: 0, opened: 0, flags: 0 };
    return { name: m.name, sub: m.sub, steps: s.steps || 0, opened: s.opened || 0, flags: s.flags || 0 };
  }).sort((a, b) => b.steps - a.steps || b.opened - a.opened);
  const mvp = rows.length && rows[0].steps > 0 ? rows[0].sub : null;
  return `<div class="ms-banner ${won ? 'is-win' : ''}" style="margin-top:var(--sp-4)">
    <div class="ms-banner__main">
      <b class="mono">${won ? 'ALL CLEAR' : 'BOOM'}</b>
      <span>${won ? '全部扫清，合作通关！' : '踩到雷了 —— 雷已经全翻出来了，让房主开新局'}</span>
    </div>
    <div class="mr-stats mono" style="display:grid;grid-template-columns:1fr 44px 44px 44px;gap:4px;align-items:center;margin-top:var(--sp-3);font-size:var(--fs-2xs);text-align:right">
      <span style="text-align:left;color:var(--fg-faint)">本局统计</span><span style="color:var(--fg-faint)">步数</span><span style="color:var(--fg-faint)">揭开</span><span style="color:var(--fg-faint)">插旗</span>
      ${rows.map((r) => `
        <span style="text-align:left;${r.sub === mvp ? 'font-weight:700' : ''}">${esc(r.name)}${r.sub === mvp ? '<i style="font-style:normal;background:var(--signal);color:var(--signal-ink);padding:0 4px;margin-left:4px">MVP</i>' : ''}</span>
        <b style="${r.sub === mvp ? 'color:var(--signal-deep)' : ''}">${r.steps}</b>
        <b>${r.opened}</b>
        <b>${r.flags}</b>`).join('')}
    </div>
  </div>`;
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
  const done = room.finished || isFinal(room.game);
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
      ${done ? bannerHTML(room) : ''}
      <div class="mr-row" style="margin-top:var(--sp-4)">
        ${room.isHost ? `<button class="btn btn--sm ${done ? 'btn--signal' : ''}" id="mrRestart">开新局（房主）</button>` : ''}
        <button class="btn btn--sm" id="mrLeave">${room.isHost ? '解散房间' : '退出房间'}</button>
      </div>
      <p class="mr-note">左键揭格、右键插旗、点已揭开的数字和弦（与单人局手势一致）；触屏长按插旗，或用右上角的“挖开/插旗”切换。</p>
    </section>
    ${MineRoom.error ? `<div class="mr-err mono">${esc(MineRoom.error)}</div>` : ''}`;
}

/* ---------------- 差异同步（只画变化的格子，避免抖动） ---------------- */

const cellOf = (i) => document.querySelector(`#mrBoard .ms-cell[data-i="${i}"]`);

function play(kind, i, delay = 0) {
  const el = cellOf(i);
  if (!el) return;
  if (delay) el.style.setProperty('--ms-d', `${delay}ms`);
  el.classList.add(kind);
  if (kind !== 'is-flag' && kind !== 'is-nope') setTimeout(() => el.classList.remove(kind), 700);
}

/** 只改这一格真正需要改的东西（不重设相同的文本/类，避免反复重排） */
function paintCell(i, c) {
  const el = cellOf(i);
  if (!el) return;
  const want = {
    isOpen: !!c.open,
    isFlag: !!c.flag && !c.open,
    isMine: !!c.mine && !!c.open,
    isBoom: !!c.boom,
  };
  if (el.classList.contains('is-open') !== want.isOpen) el.classList.toggle('is-open', want.isOpen);
  if (el.classList.contains('is-flag') !== want.isFlag) el.classList.toggle('is-flag', want.isFlag);
  if (el.classList.contains('is-mine') !== want.isMine) el.classList.toggle('is-mine', want.isMine);
  if (el.classList.contains('is-boom') !== want.isBoom) el.classList.toggle('is-boom', want.isBoom);
  const n = c.open && c.adj && !c.mine ? String(c.adj) : '';
  if ((el.getAttribute('data-n') || '') !== n) { if (n) el.setAttribute('data-n', n); else el.removeAttribute('data-n'); }
  const glyph = cellGlyph(c);
  if (el.textContent !== glyph) el.textContent = glyph;
}

function syncBoard(room) {
  const g = room.game;
  if (!document.getElementById('mrBoard')) return;

  if (!prev || prev.cols !== g.cols || prev.count !== g.cells.length) {
    const stage = document.getElementById('mrStage');
    if (stage) stage.outerHTML = boardHTML(room);
    prev = { cols: g.cols, count: g.cells.length, over: g.over, won: g.won, cells: g.cells.map((c) => ({ ...c })) };
    return;
  }

  const opened = [];
  const flagged = [];
  g.cells.forEach((c, i) => {
    const p = prev.cells[i] || {};
    const changed = c.open !== p.open || c.flag !== p.flag || c.boom !== p.boom || c.adj !== p.adj || c.mine !== p.mine;
    if (!changed) return;
    if (c.open && !p.open) opened.push(i);
    if (!!c.flag !== !!p.flag && !c.open) flagged.push(i);
    paintCell(i, c);
  });
  opened.forEach((i, k) => play('is-pop', i, Math.min(k, 40) * 12));
  flagged.forEach((i) => play('is-flagged', i));

  // 终局（按引擎真实字段 over / won 判断）
  const stage = document.getElementById('mrStage');
  if (g.over && !g.won && !(prev.over && !prev.won)) {
    g.cells.forEach((c, i) => { if (c.flag && !c.mine) play('is-wrong', i); });
    g.cells.forEach((c, i) => { if (c.mine && c.open) play('is-cascade', i); });
    if (stage) { stage.classList.add('is-shake'); setTimeout(() => stage.classList.remove('is-shake'), 420); }
  }
  if (g.won && !prev.won) {
    g.cells.forEach((c, i) => { if (c.open) play('is-win', i, Math.min(i, 60) * 8); });
  }

  const m = document.getElementById('mrMines'); if (m) { const v = String(room.minesLeft); if (m.textContent !== v) m.textContent = v; }
  const t = document.getElementById('mrTime'); if (t) { const v = `${Math.round((room.elapsedMs || 0) / 1000)}s`; if (t.textContent !== v) t.textContent = v; }
  const p = document.getElementById('mrProg'); if (p) p.style.width = `${Math.round((room.progress || 0) * 100)}%`;
  const st = document.getElementById('mrState');
  if (st) {
    const v = g.won ? 'CLEAR' : g.over ? 'BOOM' : (g.startedAt ? 'RUN' : 'READY');
    const b = st.querySelector('b');
    if (b && b.textContent !== v) b.textContent = v;
  }

  prev = { cols: g.cols, count: g.cells.length, over: g.over, won: g.won, cells: g.cells.map((c) => ({ ...c })) };
}

/** 和弦预亮 / 旗不够晃一下（只在指针换格时触发，避免抖动） */
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
    lastHover = -1;
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
    const snapshot = () => {
      if (!MineRoom.active) { prev = null; return; }
      const g = MineRoom.room.game;
      prev = { cols: g.cols, count: g.cells.length, over: g.over, won: g.won, cells: g.cells.map((c) => ({ ...c })) };
    };

    const repaint = (withBoard = false) => {
      const host = root.querySelector('#mrRoot');
      if (!host) return;
      host.innerHTML = panelHTML();
      snapshot();
      if (withBoard && MineRoom.active) syncBoard(MineRoom.room);
    };

    // 轮询更新：只做定点同步，不整块重画（避免闪与抖）
    MineRoom.onUpdate = (room) => {
      if (!room) { repaint(); return; }
      if (!document.getElementById('mrBoard')) { repaint(true); return; }
      syncBoard(room);
      const mem = document.getElementById('mrMembers');
      if (mem) mem.innerHTML = membersHTML(room);
      const cnt = mem?.closest('.mr-card')?.querySelector('b.mono');
      if (cnt) cnt.textContent = `队友（${room.members.length}）`;
      // 结算条只补一次（终局判定已改为 over / won）
      const done = room.finished || isFinal(room.game);
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
        else if (isFinal(MineRoom.room.game)) repaint(true);   // 终局：补结算条
      }
    });

    root.addEventListener('pointerover', (e) => {
      const cell = e.target.closest('#mrBoard .ms-cell');
      if (!cell || !MineRoom.active) return;
      const i = Number(cell.dataset.i);
      if (i === lastHover) return;            // 同一格不重复播（否则悬停时会一直抖）
      if (lastHover >= 0) hoverFeedback(lastHover, false);
      lastHover = i;
      hoverFeedback(i, true);
    });
    root.addEventListener('pointerleave', () => {
      if (lastHover >= 0) hoverFeedback(lastHover, false);
      lastHover = -1;
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
