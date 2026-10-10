/**
 * ui/shell.js — 应用外壳
 * 负责顶栏导航、移动抽屉、时钟、滚动播报条、页脚、主题切换入口，
 * 并在路由变化时同步高亮状态与未读角标。
 * 导航项统一从 Registry 读取，因此 Registry.addNav() 注册的页面会自动出现在顶栏。
 */

import { $, ICON, esc } from '../util/dom.js';
import { bus } from '../core/bus.js';
import { Router } from '../core/router.js';
import { Theme } from '../core/theme.js';
import { Registry } from '../core/registry.js';
import { News, ReadState, Settings } from '../core/store.js';
import { SITE, TICKER, FOOTER_LINKS, STORAGE_PREFIX } from '../config/site.config.js';
import { Toast } from './toast.js';
import { Auth } from '../plugins/auth.js';

const navItems = () => Registry.nav;

function unreadBadge() {
  const n = ReadState.unreadNews;
  return n > 0 ? `<span class="nav__badge" title="未读公告">${n > 99 ? '99+' : n}</span>` : '';
}

function tickerHTML() {
  const latest = News.published[0]?.title || '暂无公告';
  const items = TICKER.map((t, i) => {
    const text = t.replace('{latest}', `最新公告：${latest}`);
    return `<span class="ticker__item"><i>${String(i + 1).padStart(2, '0')}</i><b>${esc(text)}</b></span>`;
  }).join('');
  // 复制一份实现无缝滚动
  return items + items;
}

export const Shell = {
  init() {
    const year = $('#year');
    if (year) year.textContent = String(new Date().getFullYear());
    const bn = $('#brandName');
    const bs = $('#brandSub');
    if (bn) bn.textContent = SITE.name;
    if (bs) bs.textContent = SITE.subtitle;

    this.paintNav(null);
    this.paintTicker();
    this.paintFooter();
    this.paintAuth();
    this.clock();
    this.wire();

    bus.on('route:change', (r) => { this.paintNav(r); this.closeDrawer(); });
    bus.on('content:change', () => { this.paintTicker(); this.paintNav(Router.current); });
    bus.on('theme:change', () => this.paintThemeBtn());
    this.paintThemeBtn();

    // 账号状态：ready 是配置读完（决定要不要显示入口），user 是登录态变化，
    // error 只弹一条说明 —— 界面别因为一次网络抖动就变形
    bus.on('auth:ready', () => this.paintAuth());
    bus.on('auth:user', ({ notice } = {}) => { this.paintAuth(); if (notice) Toast.show(notice, '', { ttl: 7000 }); });
    bus.on('auth:error', ({ message } = {}) => { this.paintAuth(); if (message) Toast.show(message, 'err', { ttl: 8000 }); });
  },

  /**
   * 顶栏右侧的账号控件。
   *
   * 三种形态：
   *   · 账号功能没启用（纯静态部署 / 服务端没配 Auth0）→ 整块保持 hidden，顶栏和以前一模一样；
   *   · 未登录 → 一个小「登录」按钮（窄屏只留图标，见 CSS）；
   *   · 已登录 → 头像/首字母 + 名字，点开是下拉（邮箱、角色、退出）。
   * 这里只管"画出来"，鉴权一律交给服务端；界面上藏起来的按钮永远不是安全边界。
   */
  paintAuth() {
    const box = $('#authBox');
    if (!box) return;

    // 配置还没读回来时也先不显示：避免"闪一下登录按钮又消失"
    if (!Auth.enabled || Auth.state === 'loading') {
      box.hidden = true;
      box.innerHTML = '';
      delete box.dataset.open;
      return;
    }

    box.hidden = false;
    const user = Auth.user;

    if (!user) {
      box.innerHTML = `<button class="authbox__btn" id="authLogin" type="button" title="登录 / 注册（Auth0）">
        ${ICON.user}<span class="authbox__label">登录</span>
      </button>`;
      delete box.dataset.open;
      return;
    }

    const name = user.name || user.email || '已登录';
    const initial = String(name).trim().slice(0, 1).toUpperCase() || 'U';
    const avatar = user.picture
      ? `<img class="authbox__avatar" src="${esc(user.picture)}" alt="" width="22" height="22" loading="lazy" referrerpolicy="no-referrer" />`
      : `<span class="authbox__initial" aria-hidden="true">${esc(initial)}</span>`;

    box.innerHTML = `
      <button class="authbox__btn is-user" id="authToggle" type="button"
              aria-expanded="${box.dataset.open === '1' ? 'true' : 'false'}" aria-haspopup="menu"
              title="${esc(name)}${user.email ? ` · ${esc(user.email)}` : ''}">
        ${avatar}<span class="authbox__label clamp-1">${esc(name)}</span>
      </button>
      <div class="authbox__menu" role="menu">
        <div class="authbox__head">
          ${avatar}
          <span class="authbox__id">
            <b class="clamp-1">${esc(name)}</b>
            <i class="mono clamp-1">${esc(user.email || '（未提供邮箱）')}</i>
          </span>
        </div>
        <div class="authbox__rows mono">
          <span><i>角色</i><b>${Auth.isOwner ? '站长 OWNER' : '普通用户 MEMBER'}</b></span>
          <span><i>邮箱</i><b>${user.verified ? '已验证' : (Auth.enabled ? '未验证' : '—')}</b></span>
          ${user.source === 'token' ? '<span><i>身份</i><b>服务端未确认</b></span>' : ''}
        </div>
        <button class="authbox__item" id="authEdit" type="button" role="menuitem">编辑资料</button>
        <button class="authbox__logout" id="authLogout" type="button" role="menuitem">退出登录</button>
      </div>`;

    if (box.dataset.open === '1') box.dataset.open = '1';
    else delete box.dataset.open;
  },

  closeAuthMenu() {
    const box = $('#authBox');
    if (!box) return;
    delete box.dataset.open;
    $('#authToggle')?.setAttribute('aria-expanded', 'false');
  },

  /* ---------------- 页内登录面板（只收邮箱，密码交给 Auth0） ---------------- */

  /**
   * 为什么要有这个面板：Auth0 的 Universal Login 是**整页跳转**到它托管的页面，
   * 观感上"离开了本站"。我们的底线是密码绝不经过我们的代码（Auth0 也废弃了 SPA 的
   * embedded login，跨域 iframe 会被浏览器拦），所以折中成这样：
   * 用我们自己的风格收一个邮箱 → 带着 `login_hint` 跳到 Auth0 → 用户在那边只输密码。
   *
   * 面板 DOM 是**打开时现建、关闭时移除**：不留常驻节点，也不会漏监听。
   */
  openAuthPanel() {
    if ($('#authPanel')) return;
    if (!Auth.enabled) { Toast.show(Auth.notice || '本站未启用账号功能', 'err'); return; }

    const scrim = document.createElement('div');
    scrim.className = 'authpanel__scrim';
    scrim.id = 'authPanelScrim';
    scrim.innerHTML = `
      <div class="authpanel" id="authPanel" role="dialog" aria-modal="true" aria-labelledby="authPanelTitle">
        <div class="authpanel__head">
          <b id="authPanelTitle">登录 / 注册</b>
          <button class="authpanel__x" id="authPanelClose" type="button" aria-label="关闭">×</button>
        </div>
        <p class="authpanel__lead">输入邮箱，下一步在 <b>Auth0</b> 页面输入密码 —— 我们不接触你的密码。</p>
        <form class="authpanel__form" id="authPanelForm" novalidate>
          <label class="authpanel__label mono" for="authPanelEmail">邮箱</label>
          <input class="authpanel__input" id="authPanelEmail" type="email" name="email" required
                 autocomplete="email" inputmode="email" spellcheck="false" placeholder="you@example.com" />
          <p class="authpanel__err mono" id="authPanelErr" role="alert" hidden></p>
          <button class="btn btn--signal authpanel__go" id="authPanelGo" type="submit">继续</button>
        </form>
        <button class="authpanel__alt" id="authPanelDirect" type="button">不填邮箱，直接跳转登录</button>
        <p class="authpanel__foot mono">密码、邮箱验证、找回密码都由 Auth0 负责</p>
      </div>`;
    document.body.append(scrim);

    const panel = $('#authPanel');
    const input = $('#authPanelEmail');
    const err = $('#authPanelErr');

    const showErr = (msg) => {
      err.textContent = msg;
      err.hidden = false;
      input?.setAttribute('aria-invalid', 'true');
    };
    const clearErr = () => {
      err.hidden = true;
      err.textContent = '';
      input?.removeAttribute('aria-invalid');
    };

    const close = () => {
      scrim.remove();
      // 焦点还给「登录」按钮：键盘用户不该被丢在空处
      $('#authLogin')?.focus?.();
    };
    this._closeAuthPanel = close;

    scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
    scrim.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    $('#authPanelClose')?.addEventListener('click', close);

    // 逃生通道：不填邮箱，走和以前一模一样的那条整页跳转
    $('#authPanelDirect')?.addEventListener('click', () => { close(); Auth.login(); });

    $('#authPanelForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = String(input?.value || '').trim();
      if (!email) { showErr('请先填邮箱'); input?.focus(); return; }
      // 只做本地形状校验：真正的校验永远是 Auth0 那边
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showErr('邮箱格式看起来不对，检查一下'); input?.focus(); return; }
      clearErr();
      Auth.login({ loginHint: email });
    });
    input?.addEventListener('input', () => { if (!err.hidden) clearErr(); });

    panel?.setAttribute('tabindex', '-1');
    input?.focus?.();
  },

  closeAuthPanel() {
    if (typeof this._closeAuthPanel === 'function') {
      const fn = this._closeAuthPanel;
      this._closeAuthPanel = null;
      fn();
    }
  },

  /* ---------------- 编辑资料（昵称 / 头像） ---------------- */

  /**
   * 头像**先在浏览器里降采样**再上传。
   *
   * 为什么必须在客户端做：原图动辄几百 KB ~ 几 MB，转成 data URL 写进用户文档、
   * 再扩散到帖子快照里，会把存储（尤其论坛那一个索引文档）撑爆。
   * 统一画成**最长边 192px 的方形（cover 裁剪）**，导出 image/jpeg 0.82 ——
   * 通常 8–20KB，而它实际显示尺寸只有 22–48px，完全够。
   * 解码失败会 throw，由调用方给行内提示（不静默失败）。
   */
  async _downscaleAvatar(file) {
    const side = 192;
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext('2d');
    let src = null;
    let revoke = null;
    if (typeof createImageBitmap === 'function') {
      src = await createImageBitmap(file);
    } else {
      // 老浏览器兜底：走 <img> + objectURL（用完要 revoke，否则泄漏）
      const url = URL.createObjectURL(file);
      revoke = url;
      src = await new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => rej(new Error('这张图片解不开'));
        img.src = url;
      });
    }
    const w0 = src.width || src.naturalWidth || 0;
    const h0 = src.height || src.naturalHeight || 0;
    if (!w0 || !h0) throw new Error('这张图片没有有效的尺寸');
    const scale = Math.max(side / w0, side / h0);       // cover：短边铺满，长边裁掉
    const w = w0 * scale;
    const h = h0 * scale;
    ctx.drawImage(src, (side - w) / 2, (side - h) / 2, w, h);
    src.close?.();
    if (revoke) URL.revokeObjectURL(revoke);
    return canvas.toDataURL('image/jpeg', 0.82);
  },

  /** 打开"编辑资料"面板：改昵称、换头像（上传或贴地址）、清除自定义 */
  openProfilePanel() {
    if ($('#profilePanel')) return;
    if (!Auth.enabled || !Auth.user) { Toast.show('登录后才能编辑资料', 'err'); return; }

    const u = Auth.user;
    const name0 = String(u.displayName || '');
    // pic = **自定义**头像（空 = 用 Auth0 的）；avatarTouched 决定保存时要不要发 picture 字段 ——
    // 只改昵称却顺手把头像清空，是很容易踩的坑。
    let pic = String(u.avatar || '');
    let avatarTouched = false;
    const initial = String(u.name || u.email || 'U').trim().slice(0, 1).toUpperCase() || 'U';
    const previewHTML = (val) => (val
      ? `<img class="profile__img" id="profilePreview" src="${esc(val)}" alt="" referrerpolicy="no-referrer" />`
      : `<span class="profile__initial" id="profilePreview" aria-hidden="true">${esc(initial)}</span>`);

    const scrim = document.createElement('div');
    scrim.className = 'authpanel__scrim';
    scrim.id = 'profileScrim';
    scrim.innerHTML = `
      <div class="authpanel profile" id="profilePanel" role="dialog" aria-modal="true" aria-labelledby="profileTitle">
        <div class="authpanel__head">
          <b id="profileTitle">编辑资料</b>
          <button class="authpanel__x" id="profileClose" type="button" aria-label="关闭">×</button>
        </div>
        <p class="authpanel__lead">昵称与头像存在本站自己的存储里（不动 Auth0 账号）。留空即用 Auth0 的原始资料。</p>
        <form class="authpanel__form" id="profileForm" novalidate>
          <label class="authpanel__label mono" for="profileName">昵称（最多 24 字）</label>
          <input class="authpanel__input" id="profileName" type="text" name="name" maxlength="24"
                 autocomplete="nickname" spellcheck="false" placeholder="${esc(u.name || '给自己起个名字')}" value="${esc(name0)}" />

          <span class="authpanel__label mono">头像</span>
          <div class="profile__row">
            <span class="profile__avatar" id="profileAvatarBox">${previewHTML(pic)}</span>
            <div class="profile__acts">
              <label class="btn btn--sm profile__file">
                选择图片
                <input id="profileFile" type="file" accept="image/*" hidden />
              </label>
              <button class="btn btn--sm" id="profileClear" type="button">清除自定义</button>
            </div>
          </div>
          <input class="authpanel__input profile__url" id="profileAvatarUrl" type="url" inputmode="url"
                 spellcheck="false" placeholder="或粘贴图片地址 https://…" value="${esc(/^https?:/i.test(pic) ? pic : '')}" />

          <p class="authpanel__err mono" id="profileErr" role="alert" hidden></p>
          <p class="authpanel__foot mono" id="profileHint" hidden></p>
          <div class="profile__foot">
            <button class="btn btn--signal" id="profileSave" type="submit">保存</button>
            <button class="btn" id="profileCancel" type="button">取消</button>
          </div>
        </form>
      </div>`;
    document.body.append(scrim);

    const panel = $('#profilePanel');
    const err = $('#profileErr');
    const hint = $('#profileHint');
    const box = $('#profileAvatarBox');
    const urlInput = $('#profileAvatarUrl');
    const nameInput = $('#profileName');
    const saveBtn = $('#profileSave');

    const showErr = (msg) => { err.textContent = msg; err.hidden = false; err.setAttribute('role', 'alert'); };
    const clearErr = () => { err.hidden = true; err.textContent = ''; };
    const showHint = (msg) => { hint.textContent = msg; hint.hidden = !msg; };

    const repaintPreview = () => {
      box.innerHTML = previewHTML(pic);
    };

    const close = () => {
      scrim.remove();
      // 焦点还给账号 chip：键盘用户不该被丢在空处（菜单项在面板打开时已被收起）
      $('#authToggle')?.focus?.();
    };
    this._closeProfilePanel = close;

    scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
    scrim.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
    $('#profileClose')?.addEventListener('click', close);
    $('#profileCancel')?.addEventListener('click', close);
    nameInput?.addEventListener('input', () => { if (!err.hidden) clearErr(); });

    urlInput?.addEventListener('input', () => {
      const v = String(urlInput.value || '').trim();
      if (!v) return;                                  // 清空输入框不立刻丢头像，等「清除自定义」
      if (!/^https?:\/\//i.test(v)) { showErr('图片地址要以 http:// 或 https:// 开头'); return; }
      clearErr();
      pic = v;
      avatarTouched = true;
      repaintPreview();
    });

    $('#profileClear')?.addEventListener('click', () => {
      pic = '';
      avatarTouched = true;
      if (urlInput) urlInput.value = '';
      clearErr();
      showHint('已清除自定义头像，保存后会用 Auth0 的原始头像');
      repaintPreview();
    });

    $('#profileFile')?.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      clearErr();
      showHint('正在处理图片…');
      try {
        pic = await this._downscaleAvatar(file);
        avatarTouched = true;
        repaintPreview();
        showHint(`已选择图片（约 ${Math.round(pic.length / 1024)}KB，已压到 192px 方形）`);
      } catch (ex) {
        showHint('');
        const why = String(ex?.message || ex);
        // 真实世界最常见的就是"格式浏览器解不开"：iPhone 拍的 HEIC 在 Windows 版 Chrome/Edge 上
        // 就是这样。别只甩一句英文报错，直接告诉用户怎么办。
        showErr(/decod|decode|解不开|解不了/i.test(why)
          ? '这张图片浏览器解不开：可能是文件损坏，或格式不支持（比如 iPhone 的 HEIC 照片）。换一张 JPG / PNG 再试。'
          : `这张图片用不了：${why}`);
      } finally {
        e.target.value = '';                           // 允许再次选同一个文件
      }
    });

    $('#profileForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErr();
      const name = String(nameInput?.value ?? '').trim();
      // 客户端校验只是体验：服务端才是权威（超长/空白/危险协议都在那边拦）
      if (name.length > 24) { showErr('昵称最多 24 个字'); nameInput?.focus(); return; }
      const body = { name };
      if (avatarTouched) body.picture = pic;
      saveBtn.disabled = true;
      const r = await Auth.saveProfile(body);
      saveBtn.disabled = false;
      if (!r.ok) {
        showErr(r.error || '保存失败，请稍后再试');
        return;
      }
      Toast.ok('资料已更新');
      close();
    });

    panel?.setAttribute('tabindex', '-1');
    nameInput?.focus?.();
  },

  closeProfilePanel() {
    if (typeof this._closeProfilePanel === 'function') {
      const fn = this._closeProfilePanel;
      this._closeProfilePanel = null;
      fn();
    }
  },

  paintNav(current) {
    const nav = $('#nav');
    const drawer = $('#drawerNav');
    if (nav) {
      nav.innerHTML = navItems().map((n, i) => {
        const active = current?.view === n.id || (n.id === 'posts' && current?.view === 'post') ? ' is-active' : '';
        const badge = n.badgeKey === 'unreadNews'
          ? unreadBadge()
          : (n.badge ? `<span class="nav__badge">${esc(n.badge)}</span>` : '');
        return `<a class="nav__link${active}" href="${n.path}" data-nav data-view="${n.id}" title="${esc(n.cn || n.label)}">
          <span class="nav__idx">${String(i + 1).padStart(2, '0')}</span>${esc(n.label)}${badge}
          <span class="sr-only">${esc(n.cn || '')}</span></a>`;
      }).join('');
    }
    if (drawer) {
      drawer.innerHTML = navItems().map((n, i) => {
        const active = current?.view === n.id ? ' class="is-active"' : '';
        const badge = n.badgeKey === 'unreadNews' ? unreadBadge() : '';
        return `<a href="${n.path}"${active} data-nav><span>${esc(n.label)} · ${esc(n.cn || '')}</span>
          <span class="mono faint">${String(i + 1).padStart(2, '0')}${badge}</span></a>`;
      }).join('');
    }
    const foot = $('#drawerFoot');
    if (foot) {
      foot.innerHTML = `${esc(SITE.author)}<br />BUILD ${esc(SITE.version)}<br />${esc(SITE.tagline)}`;
    }
  },

  paintTicker() {
    const run = $('#tickerRun');
    if (run) run.innerHTML = tickerHTML();
  },

  paintFooter() {
    const meta = $('#footerMeta');
    if (meta) meta.innerHTML = `${esc(SITE.author)}<br />${esc(SITE.description)}`;
    const links = $('#footerLinks');
    if (links) {
      links.innerHTML = FOOTER_LINKS.map((l) =>
        `<a href="${l.href}" ${/^https?:/.test(l.href) ? 'target="_blank" rel="noopener noreferrer"' : ''}>${ICON.ext}${esc(l.label)}</a>`
      ).join('');
    }
    const build = $('#footerBuild');
    if (build) {
      build.innerHTML = `VERSION ${esc(SITE.version)}<br />SINCE ${SITE.since}<br />NOTICES ${String(News.published.length).padStart(3, '0')}`;
    }
  },

  clock() {
    const t = $('#clockTime');
    const d = $('#clockDate');
    const pad = (n) => String(n).padStart(2, '0');
    const tick = () => {
      const now = new Date();
      if (t) t.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      if (d) d.textContent = `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())} / ${'日一二三四五六'[now.getDay()]}`;
    };
    tick();
    setInterval(tick, 1000);
  },

  paintThemeBtn() {
    const btn = $('#themeBtn');
    if (!btn) return;
    const idx = Theme.list.findIndex((t) => t.id === Theme.current);
    btn.dataset.themeIdx = String(idx);
    btn.title = `切换主题（当前：${Theme.list[idx]?.label || Theme.current}）`;
  },

  openDrawer() {
    $('#drawer')?.removeAttribute('hidden');
    $('#drawerScrim')?.removeAttribute('hidden');
    $('#menuBtn')?.setAttribute('aria-expanded', 'true');
    document.body.classList.add('is-locked');
  },
  closeDrawer() {
    $('#drawer')?.setAttribute('hidden', '');
    $('#drawerScrim')?.setAttribute('hidden', '');
    $('#menuBtn')?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('is-locked');
  },

  wire() {
    $('#themeBtn')?.addEventListener('click', () => Theme.cycle());

    /* 账号控件：#authBox 是 index.html 里的静态容器，里面的按钮由 paintAuth() 动态画，
       所以这里一律用容器上的事件委托，避免"重画一次就丢监听"。 */
    const authBox = $('#authBox');
    authBox?.addEventListener('click', (e) => {
      // 登录改成先开我们自己的面板（只收邮箱），再带 login_hint 跳 Auth0：
      // 直接整页跳转会让用户觉得"离开了本站"，而密码仍只交给 Auth0。
      if (e.target.closest('#authLogin')) { this.openAuthPanel(); return; }
      if (e.target.closest('#authEdit')) { this.closeAuthMenu(); this.openProfilePanel(); return; }
      if (e.target.closest('#authLogout')) {
        Auth.logout();
        this.closeAuthMenu();
        Toast.show('已退出登录');
        return;
      }
      if (e.target.closest('#authToggle')) {
        const open = authBox.dataset.open === '1';
        if (open) this.closeAuthMenu();
        else {
          authBox.dataset.open = '1';
          $('#authToggle')?.setAttribute('aria-expanded', 'true');
        }
      }
    });
    // 点空白处收起下拉（Esc 也收，见下面的全局快捷键）
    document.addEventListener('click', (e) => {
      if (!authBox || authBox.hidden) return;
      if (e.target.closest('#authBox')) return;
      this.closeAuthMenu();
    });
    $('#menuBtn')?.addEventListener('click', () => {
      const hidden = $('#drawer')?.hasAttribute('hidden');
      hidden ? this.openDrawer() : this.closeDrawer();
    });
    $('#drawerScrim')?.addEventListener('click', () => this.closeDrawer());

    // 长按品牌图标：清除本地内容，恢复内置示例
    let pressTimer;
    const brand = document.querySelector('.brand__glyph');
    brand?.addEventListener('pointerdown', () => {
      pressTimer = setTimeout(() => {
        Toast.show('本地内容已重置为内置示例，正在重新载入…');
        Object.keys(localStorage)
          .filter((k) => k.startsWith(STORAGE_PREFIX))
          .forEach((k) => localStorage.removeItem(k));
        setTimeout(() => location.reload(), 900);
      }, 1200);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) =>
      brand?.addEventListener(ev, () => clearTimeout(pressTimer)));

    // 全局快捷键
    window.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
      if (typing) return;
      if (e.key === 'Escape') { this.closeDrawer(); this.closeAuthMenu(); this.closeAuthPanel(); this.closeProfilePanel(); }
      if (e.key.toLowerCase() === 't' && !e.metaKey && !e.ctrlKey) Theme.cycle();
    });

    // 外部链接统一新窗口打开
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="http"]');
      if (a && !a.target) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    });
  },
};
