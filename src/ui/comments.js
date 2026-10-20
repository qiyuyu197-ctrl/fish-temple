/**
 * ui/comments.js — 帖子评论区（自包含组件）
 * ------------------------------------------------------------------
 * 详情页只需要两行：
 *   html:  ${commentsHTML(postId)}
 *   mount: await mountComments(root, postId)
 *
 * 规格（站主确认过）：
 *   · **楼中楼**：回复只挂一层，更深的回复归到同一顶层（模型里 nestTree 处理 ✓）
 *   · **图片评论**：本地选图 → 缩到 ≤640px、JPEG 0.8 → data URL（控制在 80k 字符内 ✓）
 *   · 未登录：显示"登录后可以评论"，点了打开登录面板 ✓
 *   · 自己的评论可删（二次确认 ✓）；正文一律 esc ✓
 */

import { esc } from '../util/dom.js';
import { Toast } from './toast.js';
import { Auth } from '../plugins/auth.js';
import { nestTree, countAll, validateComment } from '../plugins/comment-model.js';

/** 详情页放这个壳，mount 时填内容 ✓ */
export const commentsHTML = (postId) => `
  <section class="panel" id="cmRoot" data-post="${esc(postId)}" style="margin-top:var(--sp-5)">
    <div class="panel__head">
      <span class="panel__title">评论 <b id="cmCount" class="mono">—</b></span>
      <span class="mono" style="font-size:var(--fs-2xs);color:var(--fg-faint)">COMMENTS</span>
    </div>
    <div class="panel__body" id="cmBody">
      <p class="mono" style="font-size:var(--fs-2xs);color:var(--fg-faint)">正在加载评论…</p>
    </div>
  </section>`;

const fmtTime = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const avatar = (c) => (c.picture
  ? `<img class="cm-ava" src="${esc(c.picture)}" alt="" referrerpolicy="no-referrer" loading="lazy" />`
  : `<span class="cm-ava cm-ava--txt">${esc((c.name || '匿')[0])}</span>`);

function commentHTML(c, me) {
  const canDel = me && (me.role === 'owner' || (c.sub && c.sub === me.sub));
  return `
    <div class="cm-item" data-cid="${esc(c.id)}">
      ${avatar(c)}
      <div class="cm-main">
        <div class="cm-meta mono">
          <b>${esc(c.name)}</b> · ${esc(fmtTime(c.at))}
          ${canDel ? `<button class="cm-del" data-del="${esc(c.id)}" title="删掉这条评论">×</button>` : ''}
        </div>
        ${c.body ? `<div class="cm-text">${esc(c.body)}</div>` : ''}
        ${c.image ? `<a class="cm-img" href="${esc(c.image)}" target="_blank" rel="noopener noreferrer"><img src="${esc(c.image)}" alt="评论图片" loading="lazy" /></a>` : ''}
        <button class="cm-reply mono" data-reply="${esc(c.id)}" data-name="${esc(c.name)}">回复</button>
      </div>
    </div>`;
}

function listHTML(items, me) {
  const tree = nestTree(items);
  if (!tree.length) {
    return '<p class="mono" style="font-size:var(--fs-2xs);color:var(--fg-faint)">还没有评论 —— 来做第一个。</p>';
  }
  return tree.map((root) => `
    ${commentHTML(root, me)}
    ${root.replies.length ? `<div class="cm-replies">${root.replies.map((r) => commentHTML(r, me)).join('')}</div>` : ''}
  `).join('');
}

function composerHTML() {
  if (!Auth.enabled) {
    return '<p class="mono" style="font-size:var(--fs-2xs);color:var(--fg-faint)">这个部署没配账号功能，评论暂时不可用。</p>';
  }
  if (!Auth.loggedIn) {
    return `<div class="cm-row"><span class="mono" style="font-size:var(--fs-2xs);color:var(--fg-faint)">登录后可以评论</span>
      <button class="btn btn--sm" id="cmLogin">登录 / 注册</button></div>`;
  }
  return `
    <div id="cmReplyChip" class="cm-chip mono" hidden>
      回复 <b id="cmReplyTo"></b>
      <button class="cm-chip__x" id="cmReplyCancel" aria-label="取消回复">×</button>
    </div>
    <textarea id="cmInput" class="cm-input" rows="3" maxlength="1000" placeholder="说点什么…（可以只发图）"></textarea>
    <div class="cm-row">
      <label class="btn btn--sm">配图<input type="file" id="cmFile" accept="image/*" hidden /></label>
      <span class="mono" style="font-size:var(--fs-2xs);color:var(--fg-faint)" id="cmImgHint"></span>
      <button class="btn btn--sm btn--signal" id="cmSend">发表评论</button>
    </div>`;
}

/** 本地图片压到 ≤640px / JPEG 0.8，保证在 80k 字符以内 ✓ */
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 640;
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.width * s));
        cv.height = Math.max(1, Math.round(img.height * s));
        const ctx = cv.getContext('2d');
        if (!ctx) { reject(new Error('canvas 不可用')); return; }
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = reject;
      img.src = String(fr.result || '');
    };
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

export async function mountComments(root, postId) {
  const body = root.querySelector('#cmBody');
  const countEl = root.querySelector('#cmCount');
  if (!body) return;
  let items = [];
  let parentId = null;
  let pendingImage = '';

  const paint = () => {
    const me = Auth.user ? { sub: Auth.user.sub, role: Auth.user.role } : null;
    body.innerHTML = `${listHTML(items, me)}<div class="cm-compose">${composerHTML()}</div>`;
    if (countEl) countEl.textContent = String(countAll(items));
  };

  const load = async () => {
    const r = await Auth.api(`/forum/posts/${encodeURIComponent(postId)}/comments`, { cache: 'no-store' });
    if (r.ok) {
      items = Array.isArray(r.data?.items) ? r.data.items : [];
      paint();
    } else {
      body.innerHTML = `<p class="mono" style="font-size:var(--fs-2xs);color:var(--fg-faint)">评论加载失败：${esc(r.error || '未知原因')}</p>`;
    }
  };

  const send = async () => {
    const ta = body.querySelector('#cmInput');
    const v = validateComment({ body: ta?.value || '', image: pendingImage });
    if (!v.ok) { Toast.show(v.error, 'err'); return; }
    const btn = body.querySelector('#cmSend');
    if (btn) { btn.disabled = true; btn.textContent = '发送中…'; }
    const r = await Auth.api(`/forum/posts/${encodeURIComponent(postId)}/comments`, {
      method: 'POST',
      body: { body: v.value.body, image: v.value.image, parentId },
    });
    if (btn) { btn.disabled = false; btn.textContent = '发表评论'; }
    if (!r.ok) { Toast.show(r.error || '发送失败', 'err'); return; }
    pendingImage = '';
    parentId = null;
    await load();                 // 重新拉一遍（顺便让计数一致 ✓）
    Toast.ok('评论已发出');
  };

  root.addEventListener('click', async (e) => {
    if (e.target.closest('#cmLogin')) { Auth.login(); return; }
    if (e.target.closest('#cmReplyCancel')) {
      parentId = null;
      const chip = body.querySelector('#cmReplyChip');
      if (chip) chip.hidden = true;
      return;
    }
    const rp = e.target.closest('[data-reply]');
    if (rp) {
      parentId = rp.dataset.reply;
      const chip = body.querySelector('#cmReplyChip');
      const to = body.querySelector('#cmReplyTo');
      if (chip) chip.hidden = false;
      if (to) to.textContent = rp.dataset.name || '';
      body.querySelector('#cmInput')?.focus();
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      if (!confirm('删掉这条评论？删顶层评论会连带删掉它的回复。')) return;
      const r = await Auth.api(`/forum/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(del.dataset.del)}`, { method: 'DELETE' });
      if (!r.ok) { Toast.show(r.error || '删除失败', 'err'); return; }
      await load();
      Toast.ok('已删除');
      return;
    }
    if (e.target.closest('#cmSend')) { await send(); }
  });

  root.addEventListener('change', async (e) => {
    const file = e.target.closest('#cmFile')?.files?.[0];
    if (!file) return;
    try {
      pendingImage = await shrinkImage(file);
      const hint = body.querySelector('#cmImgHint');
      if (hint) hint.textContent = `已选图（约 ${Math.round(pendingImage.length / 1024)}k）`;
    } catch { Toast.show('这张图读不出来', 'err'); }
  });

  await load();
  return () => { /* 组件无定时器，无需清理 ✓ */ };
}
