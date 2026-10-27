/**
 * ui/leaderboard.js — 排行榜 UI（扫雷 / 像素小鱼共用）
 * ------------------------------------------------------------------
 * 两件东西：
 *   ① uploadHTML + mountUpload   一局结束后的「上传成绩」按钮（带昵称记忆 ✓）
 *   ② boardHTML  + mountBoard    前 20 名榜单（GET 公开 ✓）
 *
 * 用 Auth.api 而不是裸 fetch：它统一了「响应体在 data 里」这个坑 ✓，
 * 未登录也能用（排行榜不要求登录 ✓ 让客人也能上榜 ✓）。
 */

import { esc } from '../util/dom.js';
import { Toast } from './toast.js';
import { Auth } from '../plugins/auth.js';
import { BOARDS, getBoard, formatScore, TOP_N } from '../plugins/leaderboard.js';

const NAME_KEY = 'ft.terminal.rankName';

/** 记住上次用的昵称 ✓（不然每局都要重打一遍 ✗） */
export function readName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}
function saveName(n) {
  try { localStorage.setItem(NAME_KEY, n); } catch { /* 隐私模式忽略 */ }
}

/**
 * 「上传成绩」区块。score 由游戏视图传进来（已经在客户端算好了 ✓）
 * @param {string} boardId 'mines' | 'fish'
 * @param {number} score
 * @param {object} meta   扫雷 { level, won } / 小鱼 { level, seconds }
 */
export function uploadHTML(boardId, score, meta = {}) {
  const b = getBoard(boardId);
  if (!b) return '';
  const shown = formatScore(boardId, score);
  return `
    <div class="rank-upload" data-board="${esc(boardId)}">
      <div class="rank-upload__row">
        <span class="rank-upload__score mono">
          本局 ${esc(shown)} ${esc(b.unit)}<i class="rank-upload__hint">${esc(b.label)}</i>
        </span>
        <input class="rank-upload__name mono" id="rankName" type="text" maxlength="12"
               placeholder="昵称（1–12 字）" value="${esc(readName())}" />
        <button class="btn btn--sm btn--signal" id="rankSend">上传成绩</button>
      </div>
      <p class="rank-upload__note mono" id="rankNote"></p>
    </div>`;
}

/** 绑定上传行为。root 必须是包含 uploadHTML 的容器 ✓ */
export function mountUpload(root, { boardId, score, meta = {} }) {
  const box = root.querySelector('.rank-upload');
  if (!box) return;
  const btn = box.querySelector('#rankSend');
  const note = box.querySelector('#rankNote');
  const input = box.querySelector('#rankName');
  if (!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';

  btn.addEventListener('click', async () => {
    const name = String(input?.value || '').trim();
    if (!name) { Toast.show('先填个昵称', 'err'); input?.focus(); return; }
    btn.disabled = true;
    btn.textContent = '上传中…';
    if (note) note.textContent = '';
    const r = await Auth.api(`/leaderboard/${encodeURIComponent(boardId)}`, {
      method: 'POST',
      body: { name, score, meta },
    });
    btn.disabled = false;
    btn.textContent = '上传成绩';
    if (!r.ok) {
      const msg = r.error || '上传失败';
      if (note) note.textContent = msg;
      Toast.show(msg, 'err');
      return;
    }
    saveName(name);
    const rank = r.data?.rank ?? 0;
    const txt = rank > 0 ? `已上榜 · 第 ${rank} 名` : '已上传';
    if (note) note.textContent = txt;
    Toast.ok(`${txt}（${formatScore(boardId, score)} ${getBoard(boardId)?.unit || ''}）`);
  });
}

/** 榜单面板骨架（可放在游戏页面下方 ✓） */
export function boardHTML(boardId, { title = '排行榜' } = {}) {
  const b = getBoard(boardId);
  if (!b) return '';
  return `
    <section class="panel rank-board" data-board="${esc(boardId)}" style="margin-top:var(--sp-5)">
      <div class="panel__head">
        <span class="panel__title">${esc(title)} <i class="mono faint" style="font-size:var(--fs-2xs)">${esc(b.label)}</i></span>
        <button class="btn btn--sm" data-rank-refresh>刷新</button>
      </div>
      <div class="panel__body"><div data-rank-list><p class="mono" style="font-size:var(--fs-2xs);color:var(--fg-faint)">正在加载…</p></div></div>
    </section>`;
}

const rowHTML = (it, i, b) => `
  <li class="rank-row">
    <span class="rank-row__no mono">${String(i + 1).padStart(2, '0')}</span>
    <span class="rank-row__name">${esc(it.name)}</span>
    <span class="rank-row__val mono">${esc(formatScore(b.id, it.score))}<i>${esc(b.unit)}</i></span>
    <span class="rank-row__meta mono">${esc(it.meta?.level || '')}${it.meta?.seconds ? ' · ' + esc(it.meta.seconds) + 's' : ''}</span>
  </li>`;

/** 拉榜单并渲染 ✓ */
export async function mountBoard(root, boardId) {
  const box = root.querySelector('.rank-board');
  if (!box) return;
  const list = box.querySelector('[data-rank-list]');
  const b = getBoard(boardId);
  if (!list || !b) return;

  const paint = async () => {
    const r = await Auth.api(`/leaderboard/${encodeURIComponent(boardId)}`, { cache: 'no-store' });
    if (!r.ok) {
      list.innerHTML = `<p class="mono" style="font-size:var(--fs-2xs);color:var(--fg-faint)">榜单加载失败：${esc(r.error || '未知原因')}</p>`;
      return;
    }
    const items = Array.isArray(r.data?.items) ? r.data.items : [];
    if (!items.length) {
      list.innerHTML = `<p class="mono" style="font-size:var(--fs-2xs);color:var(--fg-faint)">还没有成绩 —— 来做第一个上榜的。</p>`;
      return;
    }
    list.innerHTML = `<ol class="rank-list">${items.slice(0, TOP_N).map((it, i) => rowHTML(it, i, b)).join('')}</ol>`;
  };

  box.querySelector('[data-rank-refresh]')?.addEventListener('click', paint);
  await paint();
}
