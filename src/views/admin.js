/**
 * views/admin.js — 发布控制台
 * ------------------------------------------------------------------
 * 浏览器无法直接写项目文件，因此提供两条发布通路：
 *   1) 服务器在线（node server.mjs）：保存时同时 POST /api/content，直接落盘到 data/
 *   2) 纯静态托管：内容保存在 localStorage，并可一键导出 Markdown / JSON 手工入库
 * 两条通路对所有内容类型通用，因此新增内容集合时只需扩 CONFIG。
 */

import { $, $$, esc, ICON } from '../util/dom.js';
import { bus } from '../core/bus.js';
import { Posts, News, Api, ReadState, Settings, fmtDate, fmtRelative, normalizeItem, uid } from '../core/store.js';
import { render, excerpt, stats, parseFrontmatter } from '../util/markdown.js';
import { CATEGORIES, SITE, API, STORAGE_PREFIX } from '../config/site.config.js';
import { Toast, copyText, download } from '../ui/toast.js';
import { Motion } from '../core/motion.js';
import { viewhead, emptyState } from '../ui/bits.js';
import { Theme } from '../core/theme.js';

/** 内容类型定义：新增集合时在这里加一项即可获得完整表单 + 列表 */
const KINDS = {
  posts: {
    key: 'posts',
    label: '文章',
    store: () => Posts,
    categories: CATEGORIES.posts,
    icon: ICON.doc,
    routePrefix: '#/logs/',
    fields: ['title', 'category', 'tags', 'cover', 'date', 'author', 'summary', 'content'],
  },
  news: {
    key: 'news',
    label: '公告',
    store: () => News,
    categories: CATEGORIES.news,
    icon: ICON.bell,
    routePrefix: '#/logs/',
    fields: ['title', 'category', 'level', 'tags', 'date', 'summary', 'content'],
  },
};

const TEMPLATES = {
  posts: `## 小节标题

正文段落。支持 **粗体**、*斜体*、\`行内代码\`、[链接](https://example.com) 与 ==高亮==。

> [!NOTE]
> 提示块会渲染成带标签的强调框。

### 三级标题

- 要点一
- 要点二

| 参数 | 说明 |
| --- | --- |
| \`foo\` | 示例 |

\`\`\`js
console.log('code block with language tag');
\`\`\`
`,
  news: `## 变更内容

- 新增：随机插画历史记录
- 优化：移动端播放条布局
- 修复：\`file://\` 下内容无法载入

> [!WARN]
> 本次更新会重置本地示例数据，如需保留请先导出。

维护时间：**02:00 - 02:30 UTC+8**
`,
};

let tab = 'posts';
let draft = null;      // 当前编辑中的记录
let serverOnline = false;

/* ---------------- 表单 ---------------- */

function emptyDraft(kind) {
  const now = new Date().toISOString();
  return {
    id: uid(kind === 'news' ? 'news' : 'post'),
    title: '',
    category: KINDS[kind].categories[0],
    tags: [],
    cover: '',
    summary: '',
    content: TEMPLATES[kind],
    date: now,
    author: SITE.author,
    pinned: false,
    draft: false,
    level: 0,
    local: true,
  };
}

function formHTML(kind) {
  const cfg = KINDS[kind];
  const d = draft;
  const isNews = kind === 'news';
  return `
  <div class="section-block">
    <div class="section-block__head">
      <span>${(KINDS[kind].store().get(d.id)) ? '编辑内容' : '新建内容'}</span>
      <span class="mono faint" style="font-size:var(--fs-2xs)">${esc(d.id)}</span>
    </div>
    <div class="section-block__body">
      <div class="field">
        <div class="field__label"><span class="k-label k-label--ink">标题 *</span><span class="field__hint">TITLE</span></div>
        <input type="text" id="fTitle" value="${esc(d.title)}" placeholder="${isNews ? '例如：v1.2.0 更新公告' : '例如：用零依赖构建静态站点'}" />
      </div>

      <div class="field__grid">
        <div class="field">
          <div class="field__label"><span class="k-label k-label--ink">分类</span><span class="field__hint">CATEGORY</span></div>
          <select id="fCategory">${cfg.categories.map((c) => `<option ${c === d.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        </div>
        <div class="field">
          <div class="field__label"><span class="k-label k-label--ink">日期</span><span class="field__hint">DATE</span></div>
          <input type="text" id="fDate" value="${esc(String(d.date).slice(0, 10))}" placeholder="YYYY-MM-DD" />
        </div>
        <div class="field">
          <div class="field__label"><span class="k-label k-label--ink">标签</span><span class="field__hint">逗号分隔</span></div>
          <input type="text" id="fTags" value="${esc((d.tags || []).join(', '))}" placeholder="前端, 设计" />
        </div>
        ${isNews ? `<div class="field">
          <div class="field__label"><span class="k-label k-label--ink">重要程度</span><span class="field__hint">LEVEL</span></div>
          <select id="fLevel">
            <option value="0" ${d.level === 0 ? 'selected' : ''}>一般</option>
            <option value="1" ${d.level === 1 ? 'selected' : ''}>重要</option>
            <option value="2" ${d.level === 2 ? 'selected' : ''}>紧急</option>
          </select>
        </div>` : `<div class="field">
          <div class="field__label"><span class="k-label k-label--ink">作者</span><span class="field__hint">AUTHOR</span></div>
          <input type="text" id="fAuthor" value="${esc(d.author || SITE.author)}" />
        </div>`}
      </div>

      ${!isNews ? `<div class="field">
        <div class="field__label"><span class="k-label k-label--ink">封面图 URL</span><span class="field__hint">可选</span></div>
        <input type="url" id="fCover" value="${esc(d.cover || '')}" placeholder="https://… 或 assets/img/cover.jpg" />
      </div>` : ''}

      <div class="field">
        <div class="field__label"><span class="k-label k-label--ink">摘要</span><span class="field__hint">留空自动截取正文</span></div>
        <input type="text" id="fSummary" value="${esc(d.summary || '')}" placeholder="一句话概括" />
      </div>

      <div class="field">
        <div class="field__label">
          <span class="k-label k-label--ink">正文 · Markdown</span>
          <span class="field__hint" id="mdHint">0 字 · 1 分钟</span>
        </div>
        <textarea id="fContent" spellcheck="false" placeholder="在这里写 Markdown…">${esc(d.content)}</textarea>
      </div>

      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
        <label class="field field--row" style="cursor:pointer">
          <input type="checkbox" id="fPinned" ${d.pinned ? 'checked' : ''} style="width:auto" />
          <span class="k-label k-label--ink">置顶</span>
        </label>
        <label class="field field--row" style="cursor:pointer">
          <input type="checkbox" id="fDraft" ${d.draft ? 'checked' : ''} style="width:auto" />
          <span class="k-label k-label--ink">存为草稿（前台不可见）</span>
        </label>
      </div>

      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px">
        <button class="btn btn--signal" id="btnSave">${ICON.dl}发布 / 保存</button>
        <button class="btn" id="btnSaveLocal" title="仅保存到浏览器，不写入项目文件">仅保存到本地</button>
        <button class="btn" id="btnExportMd">导出 Markdown</button>
        <button class="btn" id="btnExportJson">导出 JSON</button>
        <button class="btn btn--danger" id="btnReset">重置表单</button>
      </div>
      <p class="faint mono" style="font-size:var(--fs-2xs);margin:0">
        发布通路：<span id="serverState" class="status-dot ${serverOnline ? 'status-dot--on' : 'status-dot--off'}">${serverOnline ? 'SERVER 在线 · 将写入 data/' : 'STATIC 模式 · 仅本地存储'}</span>
        ${serverOnline ? '' : ' · 运行 <b>node server.mjs</b> 后可直接落盘到项目 data/ 目录'}
      </p>
    </div>
  </div>`;
}

function previewHTML() {
  const { html, toc } = render(draft.content || '');
  const s = stats(draft.content || '');
  return `
  <div class="section-block">
    <div class="section-block__head">
      <span>实时预览</span>
      <span class="mono faint" style="font-size:var(--fs-2xs)">${s.chars} CHARS · ${s.minutes} MIN · ${toc.length} SECTIONS</span>
    </div>
    <div class="preview-pane">
      <div class="post__kicker" style="margin-bottom:12px">
        <span class="tag tag--signal">${esc(draft.category)}</span>
        <span class="mono faint" style="font-size:var(--fs-2xs)">${esc(String(draft.date).slice(0, 10))}</span>
      </div>
      <h2 class="display" style="font-size:1.7rem;margin-bottom:12px">${esc(draft.title || '（未填写标题）')}</h2>
      ${draft.summary ? `<p class="muted">${esc(draft.summary)}</p>` : ''}
      <div class="prose" id="previewProse">${html || '<p class="faint">（正文为空）</p>'}</div>
    </div>
  </div>`;
}

function listHTML(kind) {
  const store = KINDS[kind].store();
  const items = store.sorted;
  if (!items.length) return emptyState({ title: `还没有${KINDS[kind].label}`, desc: '用左侧表单创建第一条内容。', icon: '▤' });
  return `
  <div class="datalist">
    ${items.map((it) => `
      <div class="datalist__row">
        <div class="datalist__main">
          <span class="datalist__title">${it.pinned ? '📌 ' : ''}${esc(it.title)}</span>
          <span class="datalist__sub">
            ${fmtDate(it.date)} · ${esc(it.category)}
            ${it.draft ? ' · <span style="color:var(--signal-deep)">草稿</span>' : ''}
            ${it.local ? ' · 本地' : ' · 内置'}
            ${it.updatedAt ? ` · 改于 ${fmtRelative(it.updatedAt)}` : ''}
          </span>
        </div>
        <div class="datalist__acts">
          <a class="iconact" title="查看" href="${KINDS[kind].routePrefix}${esc(it.id)}" data-nav>${ICON.ext}</a>
          <button class="iconact" title="置顶/取消置顶" data-pin="${esc(it.id)}">★</button>
          <button class="iconact" title="编辑" data-edit="${esc(it.id)}">${ICON.edit}</button>
          <button class="iconact" title="复制 JSON" data-copy="${esc(it.id)}">${ICON.copy}</button>
          <button class="iconact iconact--danger" title="删除" data-del="${esc(it.id)}">${ICON.trash}</button>
        </div>
      </div>`).join('')}
  </div>`;
}

function toolsHTML() {
  return `
  <div class="grid grid--2" style="gap:var(--sp-4)">
    <div class="section-block">
      <div class="section-block__head"><span>数据导入</span><span class="mono faint" style="font-size:var(--fs-2xs)">JSON / MD</span></div>
      <div class="section-block__body">
        <div class="field">
          <div class="field__label"><span class="k-label k-label--ink">粘贴 JSON 数组或 Markdown（含 frontmatter）</span></div>
          <textarea id="importText" style="min-height:150px" placeholder='[{"title":"标题","content":"正文"}]  或  ---\ntitle: 标题\n---\n正文'></textarea>
        </div>
        <div class="field__grid">
          <div class="field">
            <div class="field__label"><span class="k-label k-label--ink">导入到</span></div>
            <select id="importTarget">
              <option value="posts">文章</option>
              <option value="news">公告</option>
            </select>
          </div>
          <div class="field">
            <div class="field__label"><span class="k-label k-label--ink">模式</span></div>
            <select id="importMode">
              <option value="merge">合并（同 id 覆盖）</option>
              <option value="replace">替换全部</option>
            </select>
          </div>
        </div>
        <button class="btn btn--block" id="btnImport">执行导入</button>
      </div>
    </div>

    <div class="section-block">
      <div class="section-block__head"><span>数据导出 / 维护</span><span class="mono faint" style="font-size:var(--fs-2xs)">IO</span></div>
      <div class="section-block__body">
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:8px">
          <button class="btn btn--sm" data-export="posts">导出 posts.json</button>
          <button class="btn btn--sm" data-export="news">导出 news.json</button>
          <button class="btn btn--sm" data-export-md="posts">文章转 Markdown</button>
          <button class="btn btn--sm" data-export-md="news">公告转 Markdown</button>
          <button class="btn btn--sm" id="btnCopyAll">复制全部 JSON</button>
          <button class="btn btn--sm" id="btnTree">查看项目文件树</button>
        </div>
        <hr />
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:8px">
          <button class="btn btn--sm" id="btnMarkRead">标记全部已读</button>
          <button class="btn btn--sm" id="btnClearRead">清空已读记录</button>
          <button class="btn btn--sm" id="btnResetSettings">重置界面设置</button>
          <button class="btn btn--sm btn--danger" id="btnResetSeed">恢复内置示例内容</button>
        </div>
        <p class="faint mono" style="font-size:var(--fs-2xs);margin:0">
          本地键名前缀：<b>${esc(STORAGE_PREFIX)}</b> · 清除浏览器数据会丢失本地内容，请定期导出。
        </p>
      </div>
    </div>
  </div>

  <div class="section-block" id="treeBlock" hidden>
    <div class="section-block__head"><span>项目文件树</span><span class="mono faint" style="font-size:var(--fs-2xs)">server.mjs</span></div>
    <div class="section-block__body"><div class="mono" style="font-size:var(--fs-xs);white-space:pre-wrap" id="treeOut">—</div></div>
  </div>`;
}

/* ---------------- 视图 ---------------- */

export default {
  id: 'admin',
  title: '发布控制台',

  render() {
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    tab = params.get('tab') || tab;
    if (!KINDS[tab]) tab = 'posts';

    const editId = params.get('edit');
    const store = KINDS[tab].store();
    if (editId && store.get(editId)) {
      const it = store.get(editId);
      draft = { ...it, tags: [...(it.tags || [])] };
    } else if (params.get('new') || !draft || draft.__kind !== tab) {
      draft = emptyDraft(tab);
    } else {
      draft = { ...draft, tags: [...(draft.tags || [])] };
    }
    draft.__kind = tab;

    const counts = {
      posts: Posts.all.length,
      news: News.all.length,
    };

    return `
    <section class="admin">
      ${viewhead({
        title: 'CONSOLE',
        sub: '在浏览器里撰写、编辑、导出内容。运行 node server.mjs 后，保存会直接写入项目的 data/ 目录；纯静态托管时内容保存在本地浏览器。',
        idx: 'MODULE / 05',
        meta: [
          { label: 'SERVER', value: `<span id="serverMeta">${serverOnline ? 'ONLINE' : 'STATIC'}</span>`, html: true },
          { label: 'POSTS', value: String(counts.posts).padStart(2, '0') },
          { label: 'NOTICES', value: String(counts.news).padStart(2, '0') },
        ],
        actions: `<button class="btn btn--sm" id="checkServer">${ICON.refresh}检测服务器</button>`,
      })}

      <div class="admin__grid">
        <aside class="admin__side">
          <div class="panel">
            <div class="panel__head"><span class="panel__title">内容类型</span></div>
            <div class="admin__tabs" style="border:0">
              <button class="admin__tab${tab === 'posts' ? ' is-on' : ''}" data-tab="posts">文章 <span class="admin__count">${counts.posts}</span></button>
              <button class="admin__tab${tab === 'news' ? ' is-on' : ''}" data-tab="news">公告 <span class="admin__count">${counts.news}</span></button>
              <button class="admin__tab${tab === 'tools' ? ' is-on' : ''}" data-tab="tools">数据 <span class="admin__count">IO</span></button>
            </div>
          </div>

          <div class="panel">
            <div class="panel__head"><span class="panel__title">快捷操作</span></div>
            <div class="panel__body grid" style="gap:6px">
              <button class="btn btn--sm btn--block" id="newItem">+ 新建${KINDS[tab === 'tools' ? 'posts' : tab].label}</button>
              <a class="btn btn--sm btn--block" href="#/logs" data-nav>查看前台文章页</a>
              <a class="btn btn--sm btn--block" href="#/logs" data-nav>查看前台公告页</a>
            </div>
          </div>

          <div class="panel">
            <div class="panel__head"><span class="panel__title">界面</span></div>
            <div class="panel__body grid" style="gap:8px">
              <div class="field">
                <div class="field__label"><span class="k-label">主题</span></div>
                <select id="themeSelect">${Theme.list.map((t) => `<option value="${t.id}" ${t.id === Theme.current ? 'selected' : ''}>${esc(t.label)} · ${esc(t.hint)}</option>`).join('')}</select>
              </div>
              <div class="field">
                <div class="field__label"><span class="k-label">密度</span></div>
                <select id="densitySelect">
                  <option value="normal" ${Settings.get('density') === 'normal' ? 'selected' : ''}>标准</option>
                  <option value="compact" ${Settings.get('density') === 'compact' ? 'selected' : ''}>紧凑</option>
                </select>
              </div>
              <label class="field field--row" style="cursor:pointer">
                <input type="checkbox" id="reduceMotion" ${Settings.get('reduceMotion') ? 'checked' : ''} style="width:auto" />
                <span class="k-label">关闭动效</span>
              </label>
            </div>
          </div>
        </aside>

        <div class="admin__pane">
          ${tab === 'tools'
            ? toolsHTML()
            : `${formHTML(tab)}
               ${previewHTML()}
               <div class="section-block">
                 <div class="section-block__head">
                   <span>已有${KINDS[tab].label}</span>
                   <span class="mono faint" style="font-size:var(--fs-2xs)">${KINDS[tab].store().all.length} ENTRIES</span>
                 </div>
                 <div class="section-block__body" style="padding:0">${listHTML(tab)}</div>
               </div>`}
        </div>
      </div>
    </section>`;
  },

  async mount(root) {
    serverOnline = await Api.probe();
    const paintServerState = () => {
      const state = $('#serverState');
      if (state) {
        state.className = `status-dot ${serverOnline ? 'status-dot--on' : 'status-dot--off'}`;
        state.textContent = serverOnline ? 'SERVER 在线 · 将写入 data/' : 'STATIC 模式 · 仅本地存储';
      }
      const meta = $('#serverMeta');
      if (meta) meta.textContent = serverOnline ? 'ONLINE' : 'STATIC';
    };
    paintServerState();

    const isForm = tab !== 'tools';

    /* ---- 表单绑定 ---- */
    const syncFromForm = () => {
      if (!isForm) return;
      draft.title = $('#fTitle')?.value.trim() ?? '';
      draft.category = $('#fCategory')?.value ?? draft.category;
      draft.summary = $('#fSummary')?.value.trim() ?? '';
      draft.content = $('#fContent')?.value ?? '';
      draft.cover = $('#fCover')?.value.trim() ?? draft.cover;
      draft.author = $('#fAuthor')?.value.trim() ?? draft.author;
      draft.pinned = !!$('#fPinned')?.checked;
      draft.draft = !!$('#fDraft')?.checked;
      draft.level = Number($('#fLevel')?.value || draft.level || 0);
      draft.tags = ($('#fTags')?.value || '').split(/[,，]/).map((s) => s.trim()).filter(Boolean);
      const d = $('#fDate')?.value?.trim();
      if (d) {
        const parsed = new Date(d.length <= 10 ? `${d}T09:00:00` : d);
        if (!Number.isNaN(parsed.getTime())) draft.date = parsed.toISOString();
      }
      const s = stats(draft.content);
      const hint = $('#mdHint');
      if (hint) hint.textContent = `${s.chars} 字 · ${s.minutes} 分钟`;
      const pv = $('#previewProse');
      if (pv) pv.innerHTML = render(draft.content).html || '<p class="faint">（正文为空）</p>';
      const ptitle = $('.preview-pane h2');
      if (ptitle) ptitle.textContent = draft.title || '（未填写标题）';
      const pcat = $('.preview-pane .tag');
      if (pcat) pcat.textContent = draft.category;
    };

    if (isForm) {
      let t;
      root.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(syncFromForm, 120);
      });
      root.addEventListener('change', syncFromForm);
    }

    /* ---- 保存 ---- */
    const doSave = async ({ remote = true, silent = false } = {}) => {
      syncFromForm();
      if (!draft.title) { Toast.err('请先填写标题'); $('#fTitle')?.focus(); return; }
      if (!draft.summary) draft.summary = excerpt(draft.content, 150);
      const store = KINDS[tab].store();
      const saved = store.upsert({ ...draft, __kind: undefined });
      let landed = false;
      if (remote && serverOnline) {
        landed = await Api.save(tab, saved);
        if (!silent) {
          landed ? Toast.ok('已保存并写入 data/ 目录') : Toast.show('已保存到本地（服务器写入失败）');
        }
      } else if (!silent) {
        Toast.ok('已保存到本地浏览器 · 可导出 JSON 入库');
      }
      draft = { ...saved, tags: [...(saved.tags || [])], __kind: tab };
      // 刷新列表区
      const wrap = $$('.section-block').find((el) => el.textContent.includes(`已有${KINDS[tab].label}`));
      const body = wrap?.querySelector('.section-block__body');
      if (body) body.innerHTML = listHTML(tab);
      bus.emit('content:change', { collection: tab });
      return saved;
    };

    $('#btnSave')?.addEventListener('click', () => doSave({ remote: true }));
    $('#btnSaveLocal')?.addEventListener('click', () => doSave({ remote: false }));
    $('#btnReset')?.addEventListener('click', () => { draft = emptyDraft(tab); draft.__kind = tab; bus.emit('route:change', { view: 'admin', refresh: true }); location.hash = `#/admin?tab=${tab}&new=1`; });

    /* ---- 导出当前草稿 ---- */
    const toMarkdown = (it, kind) => {
      const fm = ['---', `title: ${it.title}`, `date: ${String(it.date).slice(0, 10)}`,
        `category: ${it.category}`, `tags: [${(it.tags || []).join(', ')}]`,
        it.pinned ? 'pinned: true' : null, it.draft ? 'draft: true' : null,
        kind === 'news' ? `level: ${it.level || 0}` : `author: ${it.author || ''}`,
        it.summary ? `summary: ${it.summary}` : null,
        `id: ${it.id}`, '---', ''].filter(Boolean).join('\n');
      return `${fm}\n${it.content}\n`;
    };

    $('#btnExportMd')?.addEventListener('click', () => {
      syncFromForm();
      download(`${tab}-${draft.id}.md`, toMarkdown(draft, tab), 'text/markdown;charset=utf-8');
      Toast.ok('已下载 Markdown 文件');
    });
    $('#btnExportJson')?.addEventListener('click', () => {
      syncFromForm();
      download(`${tab}-${draft.id}.json`, JSON.stringify({ ...draft, __kind: undefined }, null, 2), 'application/json');
      Toast.ok('已下载 JSON 文件');
    });

    /* ---- 列表操作 ---- */
    root.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-tab]');
      if (t) { location.hash = `#/admin?tab=${t.dataset.tab}`; return; }

      const edit = e.target.closest('[data-edit]');
      if (edit) {
        const kind = tab === 'tools' ? 'posts' : tab;
        location.hash = `#/admin?tab=${kind}&edit=${edit.dataset.edit}`;
        return;
      }
      const del = e.target.closest('[data-del]');
      if (del) {
        const store = KINDS[tab].store();
        const item = store.get(del.dataset.del);
        if (!item) return;
        if (!confirm(`确定删除「${item.title}」？此操作不可撤销。`)) return;
        store.remove(item.id);
        if (serverOnline) await Api.remove(tab, item.id);
        Toast.ok('已删除');
        $$('.datalist__row').forEach((row) => {
          if (row.querySelector('[data-del]')?.dataset.del === item.id) row.remove();
        });
        return;
      }
      const pin = e.target.closest('[data-pin]');
      if (pin) {
        KINDS[tab].store().togglePin(pin.dataset.pin);
        Toast.show('置顶状态已切换');
        return;
      }
      const cp = e.target.closest('[data-copy]');
      if (cp) {
        const item = KINDS[tab].store().get(cp.dataset.copy);
        copyText(JSON.stringify(item, null, 2), '已复制 JSON');
      }
    });

    $('#newItem')?.addEventListener('click', () => {
      const kind = tab === 'tools' ? 'posts' : tab;
      location.hash = `#/admin?tab=${kind}&new=1`;
    });

    /* ---- 工具区 ---- */
    $('#checkServer')?.addEventListener('click', async () => {
      serverOnline = await Api.probe();
      Toast.show(serverOnline ? '服务器在线，可写入 data/' : '未检测到服务器（静态模式）', serverOnline ? 'ok' : 'err');
      paintServerState();
    });

    $$('[data-export]', root).forEach((btn) => btn.addEventListener('click', () => {
      const kind = btn.dataset.export;
      download(`${kind}.json`, KINDS[kind].store().exportJSON(), 'application/json');
      Toast.ok(`已下载 ${kind}.json`);
    }));

    $$('[data-export-md]', root).forEach((btn) => btn.addEventListener('click', () => {
      const kind = btn.dataset.exportMd;
      const all = KINDS[kind].store().sorted.map((it) => toMarkdown(it, kind)).join('\n\n---\n\n');
      download(`${kind}.md`, all, 'text/markdown;charset=utf-8');
      Toast.ok(`已下载 ${kind}.md`);
    }));

    $('#btnCopyAll')?.addEventListener('click', () => {
      const payload = { posts: JSON.parse(Posts.exportJSON()), news: JSON.parse(News.exportJSON()) };
      copyText(JSON.stringify(payload, null, 2), '已复制全部内容');
    });

    $('#btnTree')?.addEventListener('click', async () => {
      const block = $('#treeBlock');
      const out = $('#treeOut');
      block?.removeAttribute('hidden');
      if (out) out.textContent = '正在读取…';
      const tree = await Api.tree();
      if (out) {
        out.textContent = tree
          ? Object.entries(tree).map(([k, v]) => `${k}\n${(v || []).map((f) => `  · ${f}`).join('\n')}`).join('\n\n')
          : '未检测到服务器。运行 node server.mjs 后可查看项目文件树。';
      }
    });

    $('#btnImport')?.addEventListener('click', () => {
      const raw = $('#importText')?.value?.trim();
      const target = $('#importTarget')?.value || 'posts';
      const mode = $('#importMode')?.value || 'merge';
      if (!raw) { Toast.err('请先粘贴要导入的内容'); return; }
      try {
        let items;
        if (raw.startsWith('[') || raw.startsWith('{')) {
          const json = JSON.parse(raw);
          items = Array.isArray(json) ? json : (json.items || [json]);
        } else {
          // Markdown 批量：以 --- 分隔多个带 frontmatter 的块
          items = raw.split(/\n-{3,}\n/).map((chunk) => {
            const { data, body } = parseFrontmatter(chunk);
            if (!data.title) return null;
            return { ...data, content: body };
          }).filter(Boolean);
        }
        if (!items.length) throw new Error('未解析到有效条目');
        const n = KINDS[target].store().importJSON(items, { replace: mode === 'replace' });
        Toast.ok(`已导入 ${n} 条到${KINDS[target].label}`);
        bus.emit('content:change', { collection: target });
        setTimeout(() => location.reload(), 700);
      } catch (err) {
        Toast.err(`导入失败：${err.message}`);
      }
    });

    $('#btnMarkRead')?.addEventListener('click', () => {
      ReadState.markAll([...News.published, ...Posts.published].map((x) => x.id));
      Toast.ok('全部标记为已读');
    });
    $('#btnClearRead')?.addEventListener('click', () => { ReadState.reset(); Toast.show('已清空已读记录'); });
    $('#btnResetSettings')?.addEventListener('click', () => {
      Settings.reset();
      Toast.show('界面设置已重置，正在刷新…');
      setTimeout(() => location.reload(), 600);
    });
    $('#btnResetSeed')?.addEventListener('click', async () => {
      if (!confirm('将清除本地所有内容并恢复内置示例，确定继续？')) return;
      Object.keys(localStorage).filter((k) => k.startsWith(STORAGE_PREFIX)).forEach((k) => localStorage.removeItem(k));
      Toast.show('正在恢复…');
      setTimeout(() => location.reload(), 700);
    });

    $('#themeSelect')?.addEventListener('change', (e) => Theme.set(e.target.value, { announce: true }));
    $('#densitySelect')?.addEventListener('change', (e) => Theme.setDensity(e.target.value));
    $('#reduceMotion')?.addEventListener('change', (e) => {
      Settings.set('reduceMotion', e.target.checked);
      document.documentElement.dataset.reduceMotion = e.target.checked ? '1' : '0';
    });

    Motion.reveal(root);
  },
};
