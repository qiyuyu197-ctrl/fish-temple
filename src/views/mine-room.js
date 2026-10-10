/**
 * views/mine-room.js — 联机扫雷（合作模式）的房间界面
 * ------------------------------------------------------------------
 * 服务端权威 + 版本轮询（见 plugins/mine-room.js）。这里只画：
 *   · 没登录 → 引导登录（联机只对已注册用户开放）
 *   · 没进房间 → 创建房间（三档难度）+ 房间号加入
 *   · 进了房间 → 邀请链接/房间号（可复制）+ 成员列表（谁在线）+ **共享棋盘** + 房主开新局 + 退出
 *
 * 共享棋盘：左键揭、右键（或长按）插旗，和弦沿用单机习惯（点已揭开的数字）。
 * 每一格按 `revealers` 上色，看得到"这格是谁开的"。
 */

import { esc } from '../util/dom.js';
import { Toast } from '../ui/toast.js';
import { viewhead } from '../ui/bits.js';
import { Auth } from '../plugins/auth.js';
import { MineRoom } from '../plugins/mine-room.js';
import { LEVELS, getLevel } from '../plugins/minesweeper.js';

const ONLINE_MS = 25 * 1000;   // 25 秒内有过动作算"在线"

let ui = { level: 'beginner', code: '', render: null };

const inviteLink = (id) => `${location.origin}${location.pathname}#/mine?room=${encodeURIComponent(id)}`;
const isOnline = (m) => m && m.lastAt && (Date.now() - Date.parse(m.lastAt) < ONLINE_MS);
const mineCount = (c) => (c.mine ? '✸' : '');
const glyphOf = (c) => {
  if (c.flag) return '⚑';
  if (!c.open) return '';
  if (c.mine) return '✸';
  return c.adj ? String(c.adj) : '';
};

/** 一格一格的共享棋盘（用 data-r/data-c 让事件委托好接） */
function boardHTML(room) {
  const g = room.game;
  const mine = room.members.find((m) => m.sub === room.host);   // 房主颜色只用于图例
  const cells = g.cells.map((c, i) => {
    const r = Math.floor(i / g.cols);
    const col = i % g.cols;
    const who = room.revealers[`${r},${col}`];
    const cls = ['mr-cell', c.open ? 'is-open' : '', c.flag ? 'is-flag' : '', c.mine && c.open ? 'is-mine' : ''].filter(Boolean).join(' ');
    // 按"谁开的"给一道淡色（没有就不加），色相由 sub 的哈希决定，稳定不跳色
    let tint = '';
    if (who) {
      let h = 0;
      for (let k = 0; k < who.length; k++) h = (h * 31 + who.charCodeAt(k)) % 360;
      tint = `--mr-tint:hsl(${h} 70% 55%);`;
    }
    const label = c.open ? (c.mine ? '雷' : (c.adj || '空')) : (c.flag ? '旗' : '未开');
    return `<button class="${cls}" style="${tint}" data-r="${r}" data-c="${col}" aria-label="第 ${r + 1} 行第 ${col + 1} 列 ${label}"${c.open ? ' disabled' : ''}>${esc(glyphOf(c))}</button>`;
  }).join('');
  return `<div class="mr-board" style="--mr-cols:${g.cols}" role="grid" aria-label="共享棋盘">${cells}</div>`;
}

function membersHTML(room) {
  return `<ul class="mr-members mono">${room.members.map((m) => `
    <li class="${isOnline(m) ? 'is-on' : ''}">
      <span class="mr-dot" aria-hidden="true"></span>
      <b>${esc(m.name)}</b>
      ${m.host ? '<i class="mr-tag">房主</i>' : ''}
      <span class="mr-state">${isOnline(m) ? '在线' : '离线'}</span>
    </li>`).join('')}</ul>`;
}

/** 面板主体 */
function panelHTML() {
  if (!Auth.enabled) {
    return `<div class="mr-card"><b class="mono">本站还没启用账号功能</b>
      <p class="mr-note">联机扫雷需要注册账号（用来识别"谁开的格子"）。当前部署没配 Auth0，所以联机不可用，单机扫雷照常。</p></div>`;
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
        <div class="mr-row">
          ${LEVELS.map((l) => `<button class="btn btn--sm ${l.id === ui.level ? 'btn--signal' : ''}" data-level="${l.id}">${esc(l.label)} ${l.cols}×${l.rows}</button>`).join('')}
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
  const g = room.game;
  const done = room.finished || g.state === 'won' || g.state === 'lost';
  const link = inviteLink(room.id);
  return `
    <div class="mr-card">
      <div class="mr-head">
        <b class="mono">房间 <span class="mr-code">${esc(room.code)}</span></b>
        <span class="mr-meta mono">${esc(getLevel(room.level).label)} · ${g.cols}×${g.rows} · ${g.mines} 雷 · 版本 ${room.version}</span>
      </div>
      <div class="mr-row">
        <input class="mr-input mono" id="mrLink" readonly value="${esc(link)}" aria-label="邀请链接" />
        <button class="btn btn--sm" id="mrCopy">复制</button>
      </div>
      <p class="mr-note">把上面的链接发给**已注册**的站友；他们打开就自动进这间房（没登录会先引导登录）。</p>
    </div>

    <div class="mr-card">
      <b class="mono">队友（${room.members.length}）</b>
      ${membersHTML(room)}
    </div>

    <div class="mr-card">
      <div class="mr-head">
        <b class="mono">共享棋盘</b>
        <span class="mr-meta mono">剩 ${room.minesLeft} 雷 · 进度 ${Math.round((room.progress || 0) * 100)}% · ${Math.round((room.elapsedMs || 0) / 1000)}s</span>
      </div>
      ${done ? `<div class="mr-over mono">${g.state === 'won' ? '全部扫清，合作通关！' : '踩到雷了 —— 让房主开新局'}</div>` : ''}
      ${boardHTML(room)}
      <p class="mr-note">左键揭格、右键插旗、点已揭开的数字和弦。每格左上角的淡色代表"是谁开的"。</p>
      <div class="mr-row" style="margin-top:var(--sp-3)">
        ${room.isHost ? `<button class="btn btn--sm btn--signal" id="mrRestart">开新局（房主）</button>` : ''}
        <button class="btn btn--sm" id="mrLeave">${room.isHost ? '解散房间' : '退出房间'}</button>
      </div>
    </div>
    ${MineRoom.error ? `<div class="mr-err mono">${esc(MineRoom.error)}</div>` : ''}`;
}

export default {
  id: 'mine-room',
  title: '联机扫雷',

  render() {
    return `${viewhead({
      title: 'MINESWEEPER · 联机',
      sub: '一块共享棋盘，谁揭开的都同步给全房间。只对注册用户开放；房主建房后把邀请链接发给朋友即可。',
      idx: 'MINES / ONLINE',
    })}
    <div class="mr-tabs" role="tablist" aria-label="扫雷模式">
      <a class="mr-tab" href="#/mine" role="tab">单人</a>
      <a class="mr-tab is-on" href="#/mine?room=1" role="tab" aria-selected="true">联机</a>
    </div>
    <div id="mrRoot">${panelHTML()}</div>`;
  },

  mount(root) {
    const host = root.querySelector('#mrRoot');
    const repaint = () => { if (host) host.innerHTML = panelHTML(); };

    // 视图一挂上就订阅房间更新（轮询里只有 version 变了才回调，不会白重画）
    MineRoom.onUpdate = () => repaint();

    // 邀请链接进来：URL 里带 ?room=<id> 时自动加入
    const m = /[?&]room=([A-Za-z0-9_-]{4,40})/.exec(String(location.hash || ''));
    const invited = m && m[1] !== '1' ? m[1] : null;
    if (invited && Auth.loggedIn && (!MineRoom.active || MineRoom.id !== invited)) {
      void MineRoom.joinById(invited).then((r) => {
        if (!r.ok) Toast.show(r.error || '加入房间失败', 'err');
        repaint();
      });
    } else if (MineRoom.active) {
      MineRoom.startPolling();
    }

    root.addEventListener('click', async (e) => {
      const lv = e.target.closest('[data-level]');
      if (lv) { ui.level = lv.dataset.level; repaint(); return; }
      if (e.target.closest('#mrLogin')) { Auth.login(); return; }
      if (e.target.closest('#mrCreate')) {
        const r = await MineRoom.create(ui.level);
        if (!r.ok) Toast.show(r.error, 'err');
        repaint();
        return;
      }
      if (e.target.closest('#mrJoin')) {
        const code = host.querySelector('#mrCode')?.value || '';
        const r = await MineRoom.joinByCode(code);
        if (!r.ok) Toast.show(r.error, 'err');
        repaint();
        return;
      }
      if (e.target.closest('#mrCopy')) {
        const val = host.querySelector('#mrLink')?.value || '';
        try {
          await navigator.clipboard.writeText(val);
          Toast.ok('邀请链接已复制');
        } catch {
          host.querySelector('#mrLink')?.select();
          Toast.show('自动复制被浏览器拦了：链接已选中，按 Ctrl+C 复制', 'err');
        }
        return;
      }
      if (e.target.closest('#mrRestart')) {
        const r = await MineRoom.restart();
        if (!r.ok) Toast.show(r.error, 'err');
        repaint();
        return;
      }
      if (e.target.closest('#mrLeave')) {
        await MineRoom.leave();
        Toast.ok('已退出房间');
        repaint();
        return;
      }
      const cell = e.target.closest('.mr-cell');
      if (cell && MineRoom.active) {
        const r = Number(cell.dataset.r);
        const c = Number(cell.dataset.c);
        const room = MineRoom.room;
        const cur = room.game.cells[r * room.game.cols + c];
        // 点已揭开的数字 → 和弦（沿用单机的习惯）
        const action = (cur && cur.open && cur.adj) ? 'chord' : 'reveal';
        const res = await MineRoom.move(action, r, c);
        if (!res.ok) Toast.show(res.error, 'err');
        repaint();
      }
    });

    // 右键插旗（触屏用长按）
    let pressTimer = null;
    root.addEventListener('contextmenu', (e) => {
      const cell = e.target.closest('.mr-cell');
      if (!cell || !MineRoom.active) return;
      e.preventDefault();
      void MineRoom.move('flag', Number(cell.dataset.r), Number(cell.dataset.c)).then((r) => {
        if (!r.ok) Toast.show(r.error, 'err');
        repaint();
      });
    });
    root.addEventListener('touchstart', (e) => {
      const cell = e.target.closest('.mr-cell');
      if (!cell || !MineRoom.active) return;
      pressTimer = setTimeout(() => {
        void MineRoom.move('flag', Number(cell.dataset.r), Number(cell.dataset.c)).then((r) => {
          if (!r.ok) Toast.show(r.error, 'err');
          repaint();
        });
      }, 500);
    }, { passive: true });
    root.addEventListener('touchend', () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } });

    // 切走：停轮询、摘掉回调（房间还在服务端，回来重新加入即可）
    return () => {
      MineRoom.stopPolling();
      MineRoom.onUpdate = null;
      if (pressTimer) clearTimeout(pressTimer);
    };
  },
};
