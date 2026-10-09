/**
 * ui/embed-host.js — 网易云官方播放器的全局宿主
 * ------------------------------------------------------------------
 * 解决的问题：官方播放器是 iframe，如果挂在 #view 里，切换板块时视图重建
 * 会把 iframe 一起销毁，播放随即中断。
 *
 * 做法：
 *   · iframe 只创建一次，永久挂在 <body> 下的 #embedHost 里（#view 之外）
 *   · 音乐台页面提供一个占位槽（[data-embed-slot]），宿主通过切换 CSS 定位
 *     在「内嵌到槽位」与「右下角固定停靠」两种状态之间切换
 *   · 关键：iframe 元素本身从不移除、不重建 —— 移动 DOM 节点会让 iframe
 *     重新加载（播放中断），所以这里只改样式，不动 DOM
 *
 * 对外接口：
 *   EmbedHost.show(track, { autoplay })   确保播放器存在并显示指定曲目
 *   EmbedHost.hide()                      收起并停止（移除 iframe）
 *   EmbedHost.dock(mode)                  'inline' | 'docked' | 'none'
 *   EmbedHost.noteRoute(viewId)           路由变化时决定停靠方式
 */

import { $ } from '../util/dom.js';
import { bus } from '../core/bus.js';
import { Player } from '../core/player.js';
import { embedUrl, Position } from '../plugins/netease.js';

const CROP_KEY = 'ft-embed-crop';   // '1' = 只显示控制条，'0' = 显示官方完整播放器

let frame = null;        // 唯一的 iframe 元素
let currentId = '';      // 当前 iframe 里加载的歌曲 id
let currentAutoplay = -1; // 当前 iframe 的 auto 参数（0 / 1），-1 表示尚未创建
let dockMode = 'none';
let cropMode = true;     // 默认只留控制条：官方原皮那圈白色卡片和站内风格冲突
let pinned = false;      // 是否"固定展开"（移动端请用户点 ▶ 期间，见 pinExpanded）

function host() { return $('#embedHost'); }
function slotEl() { return $('#embedFrameSlot'); }

/**
 * 把「显示形态」写到宿主与 <body> 上（纯 CSS 生效，不动 iframe）。
 * 默认的紧凑形态只保留官方播放器的「进度条 + 时间 + 传输键 + 播放列表」那一条，
 * 封面和标题裁掉 —— 它们站内自己的卡片里已经有了，留着只是重复和刺眼。
 */
function applyCrop() {
  const h = host();
  if (h) h.dataset.crop = cropMode ? '1' : '0';
  document.body.dataset.embedCrop = cropMode ? '1' : '0';
  bus.emit('embed:crop', { crop: cropMode });
}

/** 创建一个新的官方播放器 iframe */
function createFrame(track, autoplay) {
  const el = document.createElement('iframe');
  el.id = 'neFrame';
  el.title = '网易云音乐官方播放器';
  el.setAttribute('frameborder', '0');
  el.setAttribute('scrolling', 'no');
  el.setAttribute('allow', 'autoplay; encrypted-media');
  el.dataset.autoplay = autoplay ? '1' : '0';
  el.src = embedUrl(track.neteaseId, { autoplay });
  // 载入完成 ≈ 音频即将开始。播放引擎用它校正「已播时长」的估算锚点，
  // 否则会把 iframe 的加载与缓冲时间算成已经播过了 —— 表现为自动下一首提前掐歌。
  el.addEventListener('load', () => {
    if (frame !== el) return;                    // 已经被下一次换歌取代了
    bus.emit('embed:loaded', { id: currentId, autoplay: currentAutoplay === 1 });
  });
  // 用户点进 iframe（拖进度条 / 按它自己的暂停键）时能**间接**察觉：
  // 顶层文档失焦、activeElement 变成这个 iframe。跨域读不到它的进度，
  // 所以一旦发生，站内的"已播时长"估算就不再有意义 —— 通知播放引擎放弃这一首的自动切歌。
  //
  // 但要防误报：窗口切到后台、或被别的窗口盖住时，iframe 也可能收到 focus，
  // 那时候位置根本没变，误判会变成"后台放着放着就不切歌了"。所以额外要求
  // **窗口有焦点且页面可见**，才算"用户真的点进来了"。
  el.addEventListener('focus', () => {
    if (frame !== el) return;
    if (document.hidden || !document.hasFocus()) return;
    bus.emit('embed:touched', { reason: 'iframe-focus' });
  });
  return el;
}

/**
 * 用指定 auto 参数重建播放器。
 *
 * 为什么必须重建：官方播放器是跨域 iframe，外部拿不到它的 window
 * （contentWindow 被同源策略挡住、不接受 postMessage、也没有 currentTime），
 * 唯一能让它「真正静音」的开关就是重新加载一个 auto=0 的播放器。
 *
 * ⚠️ 已知且无法绕过的代价：重建会让播放回到 0:00。
 *    官方嵌入参数只有 type / id / auto / height，没有 startTime，
 *    所以「暂停后从原处续播」这个方案做不到。详见 README。
 */
function rebuild(track, autoplay) {
  currentId = String(track.neteaseId);
  currentAutoplay = autoplay ? 1 : 0;
  frame?.remove();
  frame = createFrame(track, autoplay);
  slotEl()?.append(frame);
  return frame;
}

function paintMeta(track) {
  const cover = $('#embedMiniCover');
  const title = $('#embedMiniTitle');
  const artist = $('#embedMiniArtist');
  if (title) title.textContent = track?.title || '—';
  if (artist) artist.textContent = track?.artist || '—';
  if (cover) {
    if (track?.cover) {
      cover.style.backgroundImage = `url("${track.cover}")`;
      cover.style.backgroundSize = 'cover';
      cover.style.backgroundPosition = 'center';
    } else {
      cover.style.backgroundImage = '';
    }
  }
}

export const EmbedHost = {
  /** 当前是否已经挂着播放器 */
  get active() { return !!frame; },
  get songId() { return currentId; },
  get docked() { return dockMode === 'docked'; },
  /** 是否处于「只显示控制条」的紧凑形态 */
  get cropped() { return cropMode; },

  init() {
    // 记住上次选的形态（默认紧凑）
    try { cropMode = localStorage.getItem(CROP_KEY) !== '0'; } catch { /* 隐私模式 */ }
    applyCrop();

    $('#embedClose')?.addEventListener('click', () => this.stop());
    $('#embedMini')?.addEventListener('click', () => {
      // 回到音乐台，播放器重新内嵌（不重建，继续播放）
      location.hash = '#/music';
    });

    /**
     * 「这首只能靠官方播放器」时把它推到你眼前。
     *
     * 为什么必须有这一步：跨域 iframe 的自动播放由**对方页面 + 浏览器策略**决定。
     * PC 上通常能自动起播（所以 PC 听着一切正常），而移动端 iOS/Android 一律要求
     * 用户点 iframe 自己的 ▶ —— 只把 iframe 静默切过去，手机上就是"显示在播放、
     * 却一点声音没有"。所以这里：确保它被渲染出来（折叠态会 display:none）、
     * 滚到视口中央、再明确告诉用户点哪儿。
     *
     * ⚠️ 刻意**不**调用 setCrop(false)：紧凑形态保留的就是「进度条 + 传输键」那一条，
     *    ▶ 本来就在里面，够点了；而 setCrop 会把用户的形态偏好写进 localStorage ——
     *    为了提示一次就永久改掉用户的界面选择，是越界的。
     */
    bus.on('embed:needsTap', ({ track } = {}) => {
      if (!frame) return;
      // 窄屏/触屏：**固定到屏幕底部并保持展开**。手机页面很长，靠滚动把它带进视口
      // 不可靠（线上实测：布局会随嵌入槽撑开而变长，滚完仍可能停在屏幕外几百像素），
      // 而贴底全宽一定看得见、点得到 —— 这是"用户必须点 ▶"时唯一稳的做法。
      const narrow = (window.matchMedia && window.matchMedia('(hover: none)').matches) || window.innerWidth < 720;
      if (narrow) {
        this.dock('docked');
        this.pinExpanded(true);
      } else {
        if (dockMode === 'docked') this.expandBriefly(9000);
        this.bringIntoView();       // 宽屏：音乐台里的内嵌槽位，滚到视口中央
      }
      bus.emit('toast', {
        message: `「${track?.title || '这首歌'}」需要在${narrow ? '屏幕底部' : '下方'}官方播放器里点 ▶ 播放（移动端不允许它自动起播）`,
        kind: 'warn',
        ttl: 8000,
      });
    });

    // 用户动过官方播放器（点进 iframe / 拖进度）→ 他要的目的达到了，"请点 ▶"状态解除，
    // 之后按正常的停靠规则走
    bus.on('embed:touched', () => this.pinExpanded(false));

    // 视口变化 / 页面滚动时把内嵌位置重新对齐到槽位
    const realign = () => { if (dockMode === 'inline') this._align(); };
    window.addEventListener('resize', realign, { passive: true });
    window.addEventListener('scroll', realign, { passive: true });

    // 布局变化（字体载入、图片撑开、窗口缩放）也要重新对齐
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        if (dockMode === 'inline') this._align();
      });
      const attach = () => {
        const slot = document.querySelector('[data-embed-slot]');
        const view = document.getElementById('view');
        ro.disconnect();
        if (slot) ro.observe(slot);
        // 也要盯着整个视图：#view 的高度变了，说明槽位上方的元素（搜索结果、
        // 导入状态、播放列表长度…）改变了高度，槽位的 Y 坐标随之移动。
        // 只观察槽位本身是不够的 —— 它自身尺寸没变，只是被顶上去了。
        if (view) ro.observe(view);
      };
      bus.on('route:change', () => setTimeout(attach, 60));
      setTimeout(attach, 200);
    }

    return this;
  },

  /** 切换「控制条 / 官方完整播放器」形态（iframe 不重建，播放不受影响） */
  setCrop(on) {
    cropMode = !!on;
    try { localStorage.setItem(CROP_KEY, cropMode ? '1' : '0'); } catch { /* 忽略 */ }
    applyCrop();
    if (dockMode === 'inline') {
      // 槽位高度会变（紧凑形态矮一半），等布局落定后再对齐一次
      requestAnimationFrame(() => this._align());
      setTimeout(() => { if (dockMode === 'inline') this._align(); }, 120);
    }
    return cropMode;
  },

  toggleCrop() { return this.setCrop(!cropMode); },

  /** 停止播放并收起播放器（宿主上的 ✕ 和音乐台槽位里的「停止」都走这里）
   *  顺序很重要：先 pause（网易云会重建一个 auto=0 的播放器来静音），
   *  再 hide 把 iframe 收掉；反过来的话会被 pause 里那次重建「救活」。
   */
  stop() {
    Player.pause();
    Position.stop();
    this.hide();
    // 槽位靠这个事件重渲染回「待机」形态
    bus.emit('player:track', { track: Player.current, index: Player.index });
    bus.emit('toast', { message: '已停止播放并收起播放器' });
  },

  /**
   * 对齐到音乐台的占位槽。
   * 宿主在 #view 之外，用 fixed 定位跟随槽位，因此必须用视口坐标。
   * 槽位里除标题外还可能有一行说明文字，必须把它们的高度也算进去，
   * 否则播放器会盖住这些内容。
   * 槽位末尾那个 [data-embed-stage] 是「留给播放器的空位」，只用来撑开高度，
   * 计算偏移时要跳过它 —— 播放器正是要落在它的位置上。
   */
  _align() {
    const slot = document.querySelector('[data-embed-slot]');
    const h = host();
    if (!slot || !h) return false;
    const r = slot.getBoundingClientRect();
    if (r.width < 40) return false;
    const cs = getComputedStyle(slot);
    const padTop = parseFloat(cs.paddingTop) || 0;
    const padX = parseFloat(cs.paddingLeft) || 0;
    // 累加槽位内所有"在播放器之前"的兄弟元素高度（标题 + 说明文字）
    let offset = padTop;
    for (const child of slot.children) {
      if (child === h || child.dataset?.embedStage !== undefined) continue;
      const c = getComputedStyle(child);
      if (c.display === 'none' || c.position === 'absolute') continue;
      const cr = child.getBoundingClientRect();
      offset += cr.height + (parseFloat(c.marginBottom) || 0);
    }
    h.style.setProperty('--embed-slot-x', `${Math.round(r.left + padX)}px`);
    h.style.setProperty('--embed-slot-y', `${Math.round(r.top + offset)}px`);
    h.style.setProperty('--embed-slot-w', `${Math.round(r.width - padX * 2)}px`);
    return true;
  },

  /**
   * 显示指定曲目。
   * 同一首歌且 auto 状态一致时不重建 —— 这是「切板块不打断播放」的核心。
   * 只有换歌、或需要切换播放/暂停时才重建。
   */
  show(track, { autoplay = false } = {}) {
    if (!track?.neteaseId) return;
    const h = host();
    if (!h) return;
    h.hidden = false;
    paintMeta(track);

    const want = autoplay ? 1 : 0;
    if (frame && currentId === String(track.neteaseId)) {
      if (want === currentAutoplay) return;   // 状态一致，绝不重建
      this._applyAutoplay(want === 1, track);
      return;
    }
    // 换歌了：上一首"请点 ▶"的固定展开随之作废
    this.pinExpanded(false);
    // 折叠成小条时它的 frame 是 display:none —— 这种状态下新 iframe 常常起不了播。
    // 自动接播切歌正好会走到这里（用户可能正在别的板块、后台听歌），所以先展开再重建，
    // 让它以"被渲染"的状态完成 auto=1 的加载。
    if (autoplay && this.dockedCollapsed) this.expandBriefly(2000);
    rebuild(track, autoplay);
  },

  /**
   * 折叠状态（停在右下角小条）下临时把播放器展开几秒。
   *
   * 使用场景有两个：
   *   1. 用户点底栏封面开始播放 —— 给一个看得见的反馈；
   *   2. **自动接播切歌时**（见 show()）—— 折叠态的 frame 是 display:none，
   *      浏览器对「不可见的跨域 iframe 自动播放」判定更严，下一首会起不来，
   *      表现就是「后台放着放着就不出声 / 不换歌了」。
   * 两个作用都靠"让它被渲染"实现，到时间自动收回小条，音频不受影响。
   */
  expandBriefly(ms = 5000) {
    const h = host();
    if (!h || dockMode === 'inline') return;
    if (pinned) return;                 // 已被 pinExpanded 固定展开，别把它收回去
    h.dataset.expanded = '1';
    clearTimeout(this._expandTimer);
    this._expandTimer = setTimeout(() => {
      delete h.dataset.expanded;
      this._expandTimer = null;
    }, ms);
  },

  /**
   * 固定展开（不受 expandBriefly 的定时器影响）。
   * 移动端"这首需要你去官方播放器点 ▶"期间用它：播放器一直露着，直到换歌 / 收起。
   */
  pinExpanded(on) {
    const h = host();
    if (!h) return;
    pinned = !!on;
    if (on) {
      clearTimeout(this._expandTimer);
      this._expandTimer = null;
      h.dataset.expanded = '1';
    } else if (!this._expandTimer) {
      delete h.dataset.expanded;
    }
  },

  /** 当前是不是"折叠成小条"的状态（供外部判断要不要先展开） */
  get dockedCollapsed() {
    const h = host();
    return dockMode === 'docked' && !!h && h.dataset.expanded !== '1';
  },

  /**
   * 把播放器带进视口（移动端"要点 ▶"时必须真的看得见）。
   *
   * 为什么不能只 scrollIntoView 一次：宿主是 `position: fixed`，靠 `--embed-slot-y`
   * 对齐槽位；而**嵌入槽一撑开，页面就变长**（实测 2669 → 3604），于是"按旧布局滚过去"
   * 之后槽位仍在视口下方几百像素 —— 播放器渲染了，但用户根本看不到、点不到。
   * 所以这里：先看是否已在视口内，不在就居中滚过去，布局还在变就再确认一次。
   */
  bringIntoView(tries = 0) {
    const el = slotEl();
    if (!el) return false;
    const vh = window.innerHeight || 0;
    const r = el.getBoundingClientRect();
    if (r.height < 20) {
      if (tries < 3) setTimeout(() => this.bringIntoView(tries + 1), 400);
      return false;
    }
    const visible = r.top >= 0 && r.bottom <= vh;
    if (!visible) {
      try {
        window.scrollBy({ top: r.top - (vh - r.height) / 2, behavior: 'smooth' });
      } catch {
        window.scrollBy(0, r.top - (vh - r.height) / 2);   // 老浏览器不支持 options
      }
    }
    // 布局刚变化（槽位撑开、字体/图片落位）时再确认一次，最多三次
    if (tries < 3) setTimeout(() => {
      const rr = slotEl()?.getBoundingClientRect();
      if (!rr || rr.top < 0 || rr.bottom > (window.innerHeight || 0)) this.bringIntoView(tries + 1);
    }, 450);
    return !visible;
  },

  /** 切换播放器的 auto 参数（从外部实现暂停 / 播放）。
   * 注意：这必然重建 iframe，因此播放位置会回到起点。
   */  _applyAutoplay(autoplay, track) {
    const t = track || Player.current;
    if (!t?.neteaseId) return;
    rebuild(t, autoplay);
    this.dock(dockMode === 'none' ? 'inline' : dockMode);
    return frame;
  },

  /** 暂停：重建为 auto=0，真正静音（位置会回到 0:00，官方参数限制） */
  pause() {
    if (!frame) return false;
    this._applyAutoplay(false);
    return true;
  },

  /** 播放：重建为 auto=1（从头开始，官方参数限制） */
  resume() {
    if (!frame) return false;
    this._applyAutoplay(true);
    return true;
  },

  /** 收起播放器（停止发声并释放 iframe） */
  hide() {
    frame?.remove();
    frame = null;
    currentId = '';
    currentAutoplay = -1;
    clearTimeout(this._expandTimer);
    this._expandTimer = null;
    pinned = false;
    const h = host();
    if (h) {
      h.hidden = true;
      h.dataset.dock = 'none';
      delete h.dataset.expanded;
      document.body.classList.remove('has-docked-embed');
    }
    dockMode = 'none';
  },

  /**
   * 切换停靠方式：
   *   inline  对齐音乐台的占位槽（页面里正常显示）
   *   docked  固定停靠在右下角（离开音乐台后仍可控制，播放不中断）
   *   none    隐藏（没有曲目或已收起）
   */
  dock(mode) {
    const h = host();
    if (!h) return;
    if (!frame) mode = 'none';
    dockMode = mode;
    h.dataset.dock = mode;
    h.hidden = mode === 'none';
    // 离开折叠态就撤销临时展开
    if (mode !== 'docked') {
      delete h.dataset.expanded;
      clearTimeout(this._expandTimer);
      this._expandTimer = null;
      pinned = false;
    }
    document.body.classList.toggle('has-docked-embed', mode === 'docked');
    if (mode === 'inline') this._align();
  },

  /** 路由变化：在音乐台内嵌，其他板块右下角停靠 */
  noteRoute(viewId) {
    if (!frame) return;
    // 「请用户点 ▶」期间（pinned）**不要**把它从屏幕底部拉回音乐台的内嵌槽：
    // 音乐台页面很长，一拉回去它就落到视口下方（线上实测滚完仍在屏幕外几百像素），
    // 用户看不到也就点不到。这条尤其重要 —— 音乐台每次重绘都会调 noteRoute('music')。
    if (pinned) { this.dock('docked'); return; }
    this.dock(viewId === 'music' ? 'inline' : 'docked');
  },
};

export default EmbedHost;
