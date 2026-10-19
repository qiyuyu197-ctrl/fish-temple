/**
 * views/tierlist.js — Tier List 视图（TOOLS 板块里的一个工具）
 * ------------------------------------------------------------------
 * 规则/数据在 plugins/tierlist.js（纯逻辑，已自测 ✓），这里只负责画与交互。
 *
 * 交互：
 *   · 素材区：名字 + 图片（URL 或本地选图）→ 加卡；卡片可拖到任意档
 *   · 档位行：把卡片拖进来就换档；拖到某张卡上就是"插到它前面"（档内排序 ✓）
 *   · 点卡片右上角 × 删除；档位名可改、可加/删档（最后一档删不掉 ✓）
 *   · 自动存 localStorage；刷新页面还在 ✓
 *   · 导出：先用"复制 JSON"，PNG 导出下一步做（canvas 手绘，要单独验 ✓）
 *
 * 样式先内联在标记里 —— 这个工具还在迭代，等结构定了再抽进 styles/ ✓
 */

import { esc } from '../util/dom.js';
import { Toast } from '../ui/toast.js';
import { viewhead } from '../ui/bits.js';
import {
  createBoard, addItem, removeItem, moveItem, itemsIn, unassigned,
  updateTier, addTier, removeTier, serialize, deserialize,
} from '../plugins/tierlist.js';

const SAVE_KEY = 'ft.terminal.tierlist';

let board = null;
let dragId = null;       // 正在拖的卡片 id

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const b = raw ? deserialize(raw) : null;
    return b || createBoard();
  } catch { return createBoard(); }
}
function save() { try { localStorage.setItem(SAVE_KEY, serialize(board)); } catch { /* 隐私模式忽略 */ } }

/* ---------------- 片段 ---------------- */

const cardHTML = (item) => `
  <div class="tl-card" draggable="true" data-item="${esc(item.id)}" title="拖到档位里；点 × 删除">
    ${item.image ? `<img src="${esc(item.image)}" alt="" loading="lazy" />` : ''}
    ${item.label ? `<span>${esc(item.label)}</span>` : ''}
    <button class="tl-x" data-del="${esc(item.id)}" aria-label="删除 ${esc(item.label || '卡片')}">×</button>
  </div>`;

const trayHTML = () => {
  const list = unassigned(board);
  return `
    <div class="tl-tray" data-drop="tray">
      <div class="tl-tray__head mono">素材区（${list.length}）<span>拖到下面的档位里</span></div>
      <div class="tl-tray__body">${list.map(cardHTML).join('') || '<span class="tl-empty mono">还没有卡片 · 用上面的输入框加一张</span>'}</div>
    </div>`;
};

const tiersHTML = () => board.tiers.map((t) => {
  const list = itemsIn(board, t.id);
  return `
    <div class="tl-row" data-drop="${esc(t.id)}">
      <div class="tl-label" style="--tl-c:${esc(t.color)}">
        <input class="tl-label__in mono" value="${esc(t.label)}" data-tier-label="${esc(t.id)}" maxlength="6" aria-label="档位名" />
        <button class="tl-label__del" data-del-tier="${esc(t.id)}" title="删掉这一档（里面的卡会退回素材区）">×</button>
      </div>
      <div class="tl-drop">${list.map(cardHTML).join('') || '<span class="tl-empty mono">拖卡片到这里</span>'}</div>
    </div>`;
}).join('');

const boardHTML = () => `
  <div class="tl-tools">
    <input class="tl-in mono" id="tlLabel" maxlength="40" placeholder="卡片名字（可空，只放图也行）" />
    <input class="tl-in mono" id="tlImage" placeholder="图片地址（https://…）可空" />
    <label class="btn btn--sm tl-file">选本地图<input type="file" id="tlFile" accept="image/*" multiple hidden /></label>
    <button class="btn btn--sm btn--signal" id="tlAdd">加入素材区</button>
  </div>
  ${trayHTML()}
  <div class="tl-tiers">${tiersHTML()}</div>
  <div class="tl-tools" style="margin-top:var(--sp-4)">
    <button class="btn btn--sm" id="tlAddTier">+ 加一档</button>
    <button class="btn btn--sm" id="tlReset">清空重来</button>
    <button class="btn btn--sm btn--signal" id="tlExport">导出 PNG</button>
    <button class="btn btn--sm" id="tlCopy">复制存档 JSON</button>
  </div>`;

/* ---------------- 逻辑 ---------------- */

function paint() {
  const host = document.getElementById('tlRoot');
  if (host) host.innerHTML = boardHTML();
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ''));
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

/* ---------------- 导出 PNG（canvas 手绘，零依赖） ----------------
 * 为什么要小心：
 *   · **远程图片**（http(s)）如果服务器没给 CORS 头，画进 canvas 会"污染"它，
 *     之后 toBlob 直接抛 SecurityError ✗ → 所以这里逐张加载并 catch，失败的卡只画名字 ✓
 *   · 本地选的图是 data URL ✓，永远不会污染 ✓
 * 布局：每档一行（左侧色块 + 档名），右侧横排卡片；未分级的素材区画在最下面。
 */
async function exportPNG() {
  const ROW_H = 92, LABEL_W = 88, PAD = 10, CARD_W = 64, CARD_H = 64, GAP = 8, TOP = 8;
  const inTier = (id) => itemsIn(board, id);
  const tray = unassigned(board);
  const maxN = Math.max(1, ...board.tiers.map((t) => inTier(t.id).length), tray.length);
  const W = LABEL_W + PAD * 2 + maxN * (CARD_W + GAP);
  const H = TOP * 2 + board.tiers.length * (ROW_H + 4) + (tray.length ? ROW_H + 8 : 0);

  const cv = document.createElement('canvas');
  cv.width = Math.max(320, W);
  cv.height = Math.max(120, H);
  const ctx = cv.getContext('2d');
  if (!ctx) return { ok: false, error: '浏览器不支持 canvas' };

  // 预加载图片（失败的留空，后面只画名字）
  const imgs = new Map();
  await Promise.all(board.items.filter((i) => i.image).map((i) => new Promise((resolve) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => { imgs.set(i.id, im); resolve(); };
    im.onerror = () => resolve();
    im.src = i.image;
  })));

  const drawCard = (item, x, y) => {
    ctx.save();
    ctx.fillStyle = '#EFEDE6';
    ctx.fillRect(x, y, CARD_W, CARD_H);
    ctx.strokeStyle = '#121316';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, CARD_W, CARD_H);
    const im = imgs.get(item.id);
    if (im) {
      // object-fit: cover 的等价画法
      const s = Math.max(CARD_W / im.width, CARD_H / im.height);
      const w = im.width * s, h = im.height * s;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 2, y + 2, CARD_W - 4, CARD_H - 4);
      ctx.clip();
      ctx.drawImage(im, x + (CARD_W - w) / 2, y + (CARD_H - h) / 2, w, h);
      ctx.restore();
    }
    // 名字画在卡片下方（有就画）
    if (item.label) {
      ctx.fillStyle = '#121316';
      ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(item.label.slice(0, 12), x + CARD_W / 2, y + CARD_H + 13, CARD_W + GAP);
    }
    ctx.restore();
  };

  // 背景
  ctx.fillStyle = '#EFEDE6';
  ctx.fillRect(0, 0, cv.width, cv.height);

  let y = TOP;
  for (const t of board.tiers) {
    // 档位块
    ctx.fillStyle = t.color || '#8b8b8b';
    ctx.fillRect(PAD, y, LABEL_W, ROW_H);
    ctx.strokeStyle = '#121316';
    ctx.lineWidth = 2;
    ctx.strokeRect(PAD, y, LABEL_W, ROW_H);
    ctx.fillStyle = '#121316';
    ctx.font = '700 26px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(t.label || '?').slice(0, 4), PAD + LABEL_W / 2, y + ROW_H / 2);

    // 这一档的卡片
    let x = PAD + LABEL_W + GAP;
    for (const item of inTier(t.id)) {
      drawCard(item, x, y + (ROW_H - CARD_H) / 2 - 6);
      x += CARD_W + GAP;
    }
    y += ROW_H + 4;
  }

  // 素材区
  if (tray.length) {
    y += 8;
    ctx.fillStyle = '#c9c6bd';
    ctx.fillRect(PAD, y, LABEL_W, ROW_H);
    ctx.strokeStyle = '#121316';
    ctx.lineWidth = 2;
    ctx.strokeRect(PAD, y, LABEL_W, ROW_H);
    ctx.fillStyle = '#121316';
    ctx.font = '700 14px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('素材', PAD + LABEL_W / 2, y + ROW_H / 2);
    let x = PAD + LABEL_W + GAP;
    for (const item of tray) {
      drawCard(item, x, y + (ROW_H - CARD_H) / 2 - 6);
      x += CARD_W + GAP;
    }
  }

  const blob = await new Promise((resolve) => {
    try { cv.toBlob((b) => resolve(b), 'image/png'); }
    catch { resolve(null); }        // 跨域污染时这里会抛 ✗
  });
  if (!blob) return { ok: false, error: '有远程图片没给跨域头，画布被污染了 —— 用本地选的图，或换支持 CORS 的图床' };

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tier-list-${new Date().toISOString().slice(0, 10)}.png`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return { ok: true, size: blob.size };
}

/* ---------------- 视图 ---------------- */

export default {
  id: 'tierlist',
  title: 'Tier List',

  render() {
    board = board || load();
    return `${viewhead({
      title: 'TIER LIST',
      sub: '把卡片拖进档位里排个高低。拖到某张卡上就是插到它前面，档内顺序也管用；自动存在本机，刷新还在。',
      idx: 'TOOLS / TIER',
    })}
    <div id="tlRoot">${boardHTML()}</div>
    <style>
      .tl-tools { display: flex; gap: var(--sp-2); flex-wrap: wrap; align-items: center; margin-bottom: var(--sp-4); }
      .tl-in { flex: 1 1 200px; min-width: 0; border: 2px solid var(--ink-100); background: var(--paper); color: var(--fg); font-size: var(--fs-sm); padding: 6px 10px; }
      .tl-file { cursor: pointer; }
      .tl-tray { border: 2px dashed var(--border-hard); padding: var(--sp-3); margin-bottom: var(--sp-4); }
      .tl-tray__head { display: flex; justify-content: space-between; gap: var(--sp-3); font-size: var(--fs-2xs); color: var(--fg-soft); margin-bottom: var(--sp-2); flex-wrap: wrap; }
      .tl-tray__body { display: flex; gap: var(--sp-2); flex-wrap: wrap; min-height: 64px; align-items: flex-start; }
      .tl-tiers { display: grid; gap: 2px; }
      .tl-row { display: flex; align-items: stretch; background: var(--bg-sunk); border: 2px solid var(--ink-100); }
      .tl-label { position: relative; width: 76px; flex: none; display: grid; place-items: center; background: var(--tl-c); border-right: 2px solid var(--ink-100); }
      .tl-label__in { width: 92%; text-align: center; background: transparent; border: 0; color: #121316; font-weight: 700; font-size: 1.1rem; }
      .tl-label__in:focus { outline: 2px solid #fff3; }
      .tl-label__del { position: absolute; top: 0; right: 0; width: 18px; height: 18px; line-height: 1; background: #12131622; color: #121316; border: 0; cursor: pointer; }
      .tl-drop { flex: 1 1 auto; display: flex; gap: var(--sp-2); flex-wrap: wrap; padding: var(--sp-2); min-height: 72px; align-content: flex-start; }
      .tl-drop.is-over, .tl-tray.is-over { outline: 2px dashed var(--signal); outline-offset: -2px; }
      .tl-card { position: relative; width: 72px; display: grid; gap: 2px; justify-items: center; background: var(--paper); border: 2px solid var(--ink-100); padding: 3px; cursor: grab; }
      .tl-card img { width: 100%; height: 64px; object-fit: cover; display: block; }
      .tl-card span { font-size: var(--fs-2xs); text-align: center; line-height: 1.2; word-break: break-word; }
      .tl-card:active { cursor: grabbing; }
      .tl-x { position: absolute; top: -6px; right: -6px; width: 16px; height: 16px; line-height: 1; border: 1px solid var(--ink-100); background: var(--paper); color: var(--fg); cursor: pointer; font-size: 11px; }
      .tl-empty { color: var(--fg-faint); font-size: var(--fs-2xs); }
    </style>`;
  },

  mount(root) {
    const host = root.querySelector('#tlRoot');
    if (!host) return undefined;

    let pendingFile = '';   // 选中的本地图（data URL）

    // 加卡
    root.addEventListener('click', async (e) => {
      if (e.target.closest('#tlAdd')) {
        const label = root.querySelector('#tlLabel')?.value || '';
        const url = root.querySelector('#tlImage')?.value || '';
        const r = addItem(board, { label, image: pendingFile || url });
        if (r.error) { Toast.show(r.error, 'err'); return; }
        board = r.board; save(); paint();
        pendingFile = '';
        const l = root.querySelector('#tlLabel'); if (l) l.value = '';
        const u = root.querySelector('#tlImage'); if (u) u.value = '';
        return;
      }
      if (e.target.closest('#tlAddTier')) {
        const r = addTier(board);
        board = r.board; save(); paint(); return;
      }
      if (e.target.closest('#tlReset')) {
        if (!confirm('清空所有卡片和自定义档位？')) return;
        board = createBoard(); save(); paint(); return;
      }
      if (e.target.closest('#tlExport')) {
        const btn = e.target.closest('#tlExport');
        if (btn) { btn.disabled = true; btn.textContent = '导出中…'; }
        const r = await exportPNG();
        if (btn) { btn.disabled = false; btn.textContent = '导出 PNG'; }
        if (r.ok) Toast.ok(`PNG 已导出（${Math.round(r.size / 1024)} KB）`);
        else Toast.show(r.error || '导出失败', 'err');
        return;
      }
      if (e.target.closest('#tlCopy')) {
        try { await navigator.clipboard.writeText(serialize(board)); Toast.ok('存档 JSON 已复制'); }
        catch { Toast.show('剪贴板被拦了：用浏览器的"另存"或截图保存', 'err'); }
        return;
      }
      const del = e.target.closest('[data-del]');
      if (del) { board = removeItem(board, del.dataset.del); save(); paint(); return; }
      const delTier = e.target.closest('[data-del-tier]');
      if (delTier) {
        const r = removeTier(board, delTier.dataset.delTier);
        if (r.error) { Toast.show(r.error, 'err'); return; }
        board = r.board; save(); paint();
      }
    });

    // 改档位名
    root.addEventListener('input', (e) => {
      const inp = e.target.closest('[data-tier-label]');
      if (!inp) return;
      board = updateTier(board, inp.dataset.tierLabel, { label: inp.value });
      save();
    });

    // 选本地图：**选完直接进素材区**（不再要你多点一次"加入素材区" ✗）
    //   · 支持一次选多张（multiple ✓）
    //   · 卡片名自动取文件名（去掉扩展名），省得每张都手打 ✓
    //   · 文件名太长的截断到 40 字（引擎也有一道上限 ✓）
    root.addEventListener('change', async (e) => {
      const input = e.target.closest('#tlFile');
      const files = input?.files;
      if (!files || !files.length) return;
      let added = 0;
      let failed = 0;
      for (const file of Array.from(files)) {
        try {
          const data = await readFileAsDataURL(file);
          const label = String(file.name || '').replace(/\.[^.]+$/, '').slice(0, 40);
          const r = addItem(board, { label, image: data });
          if (r.error) { failed += 1; continue; }
          board = r.board;
          added += 1;
        } catch { failed += 1; }
      }
      save();
      paint();
      if (added) Toast.ok(`已加入素材区 ${added} 张`);
      if (failed) Toast.show(`有 ${failed} 张没能加入（格式不支持或读取失败）`, 'err');
      try { input.value = ''; } catch { /* 允许重复选同一张 */ }
    });

    // 拖拽：卡片 → 某个档 / 素材区
    root.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.tl-card');
      if (!card) return;
      dragId = card.dataset.item;
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', dragId); } catch { /* 忽略 */ }
    });
    root.addEventListener('dragover', (e) => {
      const zone = e.target.closest('[data-drop]');
      if (!zone || !dragId) return;
      e.preventDefault();
      zone.classList.add('is-over');
    });
    root.addEventListener('dragleave', (e) => {
      const zone = e.target.closest('[data-drop]');
      if (zone) zone.classList.remove('is-over');
    });
    root.addEventListener('drop', (e) => {
      const zone = e.target.closest('[data-drop]');
      if (!zone) return;
      e.preventDefault();
      zone.classList.remove('is-over');
      const target = e.target.closest('.tl-card');
      const dropId = target?.dataset?.item || null;
      const tierId = zone.dataset.drop === 'tray' ? null : zone.dataset.drop;
      // 落在某张卡上 → 插到它前面（档内排序）
      let at = null;
      if (dropId && dropId !== dragId) {
        const siblings = tierId === null ? unassigned(board) : itemsIn(board, tierId);
        const idx = siblings.findIndex((i) => i.id === dropId);
        if (idx >= 0) at = idx;
      }
      if (!dragId) return;
      const r = moveItem(board, dragId, tierId, at);
      dragId = null;
      if (r.error) { Toast.show(r.error, 'err'); return; }
      board = r.board; save(); paint();
    });

    // 切走时把待选的图清掉（board 本身留在内存里，回来接着用 ✓）
    return () => { pendingFile = ''; dragId = null; };
  },
};
