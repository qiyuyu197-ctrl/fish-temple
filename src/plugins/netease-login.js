/**
 * plugins/netease-login.js — 网易云扫码登录（前端）
 * ==================================================================
 * 和后端的分工：
 *   · 服务端（netease-login.mjs）持有 cookie、负责所有带登录态的请求；
 *   · 这里**永远拿不到 cookie**，只拿到昵称 / 头像 / 歌单 / 曲目这些能显示的东西。
 *
 * 为什么做成"音乐台里的一条状态带 + 一个面板"，而不是顶栏上再挂一个头像：
 *   · 顶栏那个账号控件是**本站账号**（Auth0），网易云账号只是它的一个附属绑定；
 *     两个头像并排会让人以为要登两次、且分不清哪个是哪个。
 *   · 扫码登录的使用场景就在音乐台（想听自己的歌单），离开这个板块时它不该占屏幕。
 *
 * 状态机（和服务端一一对应）：
 *   waiting → scanned → confirmed
 *   waiting → expired（3 分钟没人扫）
 *   任意 → risk（8821 风控）/ network（网络波动，继续轮询几次）/ error
 */

import { Auth } from './auth.js';
import { bus } from '../core/bus.js';
import { Toast } from '../ui/toast.js';
import { $, esc } from '../util/dom.js';
import { Player } from '../core/player.js';
import { fetchSongs, PLAYLIST_IMPORT_LIMIT, applyImport, savePlaylist, probeApi, refreshCloudUrls, useLoginAudio, setUseLoginAudio, getAudioLevel, setAudioLevel } from './netease.js';

/** 面板里轮询的节奏。太快没意义（人扫码要几秒），太慢会让人觉得卡住。 */
const POLL_MS = 2200;
/** 网络连续失败多少次就停下来（别让人盯着一个假"正在重试"）。 */
const NETWORK_RETRY = 3;

const state = {
  loaded: false,
  available: true,        // 服务端在不在（纯静态部署时没有这些接口）
  enabled: false,         // 站点有没有开网易云登录
  mode: 'owner',
  canBind: false,
  reason: '',
  riskNotice: '',
  siteUser: null,
  bound: null,
  error: '',
  busy: false,
};

/* ------------------------------------------------------------------ */
/* 与后端对话                                                          */
/* ------------------------------------------------------------------ */

/**
 * 统一走 Auth.api：它会自动带本站令牌、401 时刷新一次。
 * 返回 { ok, status, data, error }，不抛异常 —— 界面上每个分支都要能显示原因。
 */
async function api(path, opts) {
  try {
    return await Auth.api(path, opts);
  } catch (err) {
    return { ok: false, status: 0, data: null, error: String(err?.message || err) };
  }
}

async function loadStatus() {
  const r = await api('/netease/login/status');
  if (r.status === 0) {
    // 服务端不在：整条状态带直接不出现，别在纯静态部署里显示一个点不动的入口
    state.available = false;
    state.loaded = true;
    return state;
  }
  if (!r.ok || !r.data) {
    /**
     * 接口回了 404/501，但**代理还活着** —— 这是"服务端进程还是旧版本"的典型症状：
     * 静态文件从磁盘读，刷新就是新的；可 `/api/*` 的代码只在进程启动时加载。
     * 这时候把整条藏起来最气人（"你不是说加了吗？"），所以改成明说"重启一下"。
     * 纯静态托管下 `/api/health` 也不通，probe 失败 → 照旧整条隐藏。
     */
    const looksStale = r.status === 404 || r.status === 501;
    const proxyAlive = looksStale ? await probeApi(true).catch(() => false) : false;
    state.available = proxyAlive;
    state.stale = proxyAlive;
    state.loaded = true;
    state.error = r.error || `HTTP ${r.status}`;
    return state;
  }
  const d = r.data;
  Object.assign(state, {
    available: true,
    stale: false,
    loaded: true,
    enabled: !!d.enabled,
    mode: d.mode || 'owner',
    canBind: !!d.canBind,
    reason: d.reason || '',
    riskNotice: d.riskNotice || '',
    siteUser: d.siteUser || null,
    bound: d.bound || null,
    error: '',
  });
  return state;
}

/* ------------------------------------------------------------------ */
/* 状态带（嵌在音乐台里）                                               */
/* ------------------------------------------------------------------ */

function avatarHTML(bound) {
  const initial = String(bound?.nickname || '?').trim().slice(0, 1) || '?';
  return bound?.avatarUrl
    ? `<img class="neacct__avatar" src="${esc(bound.avatarUrl)}" alt="" width="34" height="34" loading="lazy" referrerpolicy="no-referrer" />`
    : `<span class="neacct__avatar neacct__avatar--text" aria-hidden="true">${esc(initial)}</span>`;
}

function stripInner() {
  if (!state.available) return '';
  if (state.stale) {
    return `<div class="neacct__row">
      <span class="neacct__state mono">OLD</span>
      <div class="neacct__who">
        <b class="neacct__name">服务端还是旧版本</b>
        <span class="neacct__meta">静态文件已经是新的，但 <span class="mono">/api</span> 的代码只在进程启动时加载 ——
          重启一下 <span class="mono">node server.mjs</span>（或 <span class="mono">start.cmd</span>），刷新后这里就有扫码入口了。</span>
      </div>
    </div>`;
  }
  if (!state.enabled) {
    return `<div class="neacct__row">
      <span class="neacct__state mono">OFF</span>
      <span class="muted">本站没有开启网易云登录</span>
    </div>`;
  }
  if (state.bound) {
    const b = state.bound;
    return `
      <div class="neacct__row">
        ${avatarHTML(b)}
        <div class="neacct__who">
          <b class="neacct__name">${esc(b.nickname || '网易云账号')}</b>
          <span class="neacct__meta mono">UID ${esc(b.uid || '—')} · 已绑定</span>
        </div>
        <span class="grow"></span>
        <button class="btn btn--sm" id="neLibrary" type="button">我的歌单</button>
        <button class="btn btn--sm" id="neRecommend" type="button">每日推荐</button>
        <button class="btn btn--sm" id="neCloud" type="button">云盘</button>
        <button class="btn btn--sm" id="neAccountSettings" type="button">设置</button>
        <button class="btn btn--sm btn--danger" id="neUnbind" type="button">解绑</button>
      </div>`;
  }
  if (!state.canBind) {
    return `<div class="neacct__row">
      <span class="neacct__state mono">${state.mode === 'owner' ? 'OWNER' : 'CLOSED'}</span>
      <span class="muted">${esc(state.reason || '当前账号不能绑定网易云')}</span>
      ${state.siteUser ? '' : '<span class="grow"></span><span class="muted">先在右上角登录本站账号</span>'}
    </div>`;
  }
  return `
    <div class="neacct__row">
      <span class="neacct__state mono">OFFLINE</span>
      <div class="neacct__who">
        <b class="neacct__name">还没连接网易云</b>
        <span class="neacct__meta">扫码后可以导入自己的歌单、看我喜欢的音乐、读每日推荐</span>
      </div>
      <span class="grow"></span>
      <button class="btn btn--sm btn--signal" id="neLogin" type="button">扫码登录</button>
    </div>`;
}

export function stripHTML() {
  return `
    <section class="neacct" id="neAccount" aria-live="polite" hidden>
      <div class="neacct__head">
        <span class="ne-eyebrow">// NETEASE ACCOUNT</span>
        <b>网易云账号</b>
      </div>
      <div class="neacct__body" id="neAccountBody">
        <div class="neacct__row"><span class="neacct__state mono">CHECK</span><span class="muted">正在读取登录状态…</span></div>
      </div>
    </section>`;
}

function paintStrip() {
  const box = $('#neAccount');
  const body = $('#neAccountBody');
  if (!box || !body) return;
  if (!state.available) { box.hidden = true; return; }
  box.hidden = false;
  body.innerHTML = stripInner();
}

/* ------------------------------------------------------------------ */
/* 面板：二维码                                                        */
/* ------------------------------------------------------------------ */

let panel = null;
let pollTimer = null;
let qrSession = null;   // { key, state, expiresAt }
let networkFails = 0;

function closePanel() {
  stopPolling();
  if (panel) { panel.remove(); panel = null; }
}

function stopPolling() {
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  qrSession = null;
  networkFails = 0;
}

function panelShell(title, bodyHTML) {
  const scrim = document.createElement('div');
  scrim.className = 'authpanel__scrim';
  scrim.innerHTML = `
    <div class="authpanel neacct__panel" role="dialog" aria-modal="true" aria-labelledby="nePanelTitle">
      <div class="authpanel__head">
        <b id="nePanelTitle">${esc(title)}</b>
        <button class="authpanel__x" id="nePanelClose" type="button" aria-label="关闭">×</button>
      </div>
      <div class="neacct__panelbody">${bodyHTML}</div>
    </div>`;
  scrim.addEventListener('click', (e) => { if (e.target === scrim) closePanel(); });
  scrim.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); closePanel(); } });
  scrim.querySelector('#nePanelClose')?.addEventListener('click', closePanel);
  document.body.append(scrim);
  return scrim;
}

const riskHTML = () => (state.riskNotice
  ? `<p class="neacct__risk mono">${esc(state.riskNotice)}</p>`
  : '<p class="neacct__risk mono">扫码后本站会保管一个登录凭据；建议用小号。</p>');

function qrBodyHTML() {
  return `
    <p class="authpanel__lead">打开网易云 App → 左上角扫一扫，扫描下面的二维码。</p>
    <div class="neacct__qr" id="neQrBox">
      <div class="neacct__qrph mono">正在生成二维码…</div>
    </div>
    <p class="neacct__status mono" id="neQrStatus">准备中…</p>
    <div class="neacct__actions">
      <button class="btn btn--sm" id="neQrRefresh" type="button">重新生成</button>
    </div>
    <p class="neacct__hint mono">
      手机提示「检测到当前设备环境异常 / 本次操作已拦截」时，那是<b>网易云自己的风控</b>，不是二维码坏了。
      先别再刷新（越点越像异常），隔一会儿或换网络再试；急用就走下面这条。
    </p>
    <details class="neacct__manual">
      <summary>扫码被拦？改用浏览器里的 MUSIC_U 连接</summary>
      <ol class="neacct__steps">
        <li>在浏览器打开 <span class="mono">music.163.com</span> 并登录（你已经登录过就跳过）</li>
        <li>F12 → Application（应用）→ Cookies → <span class="mono">https://music.163.com</span></li>
        <li>找到 <span class="mono">MUSIC_U</span>，复制它的值（很长的一串），粘到下面</li>
      </ol>
      <textarea id="neCookieInput" class="neacct__cookieinput" rows="3" spellcheck="false"
        placeholder="MUSIC_U=…（只粘值也可以）"></textarea>
      <div class="neacct__actions">
        <button class="btn btn--sm btn--signal" id="neCookieGo" type="button">用这个 Cookie 连接</button>
      </div>
      <p class="neacct__risk mono">MUSIC_U 等于完整登录态，比扫码拿到的会话更敏感：只填给你自己的站点，别发给任何人。</p>
    </details>
    ${riskHTML()}`;
}

/** 打开面板：已绑定 → 直接看资料；未绑定 → 生成二维码。 */
export async function openPanel() {
  if (panel) { panel.querySelector('#nePanelClose')?.focus?.(); return; }
  if (!state.available) { Toast.show('这个部署没有服务端，网易云登录不可用', 'err'); return; }
  if (!state.enabled) { Toast.show('本站没有开启网易云登录', 'err'); return; }
  if (!state.canBind) { Toast.show(state.reason || '当前账号不能绑定网易云', 'err'); return; }

  if (state.bound) { renderBoundPanel(); return; }

  panel = panelShell('连接网易云账号', qrBodyHTML());
  panel.querySelector('#neQrRefresh')?.addEventListener('click', () => { void beginQr(); });
  panel.querySelector('#neCookieGo')?.addEventListener('click', () => { void bindWithCookie(); });
  await beginQr();
}

function renderBoundPanel() {
  closePanel();
  const b = state.bound;
  panel = panelShell('网易云账号', `
    <div class="neacct__profile">
      ${avatarHTML(b)}
      <div class="neacct__who">
        <b class="neacct__name">${esc(b.nickname || '网易云账号')}</b>
        <span class="neacct__meta mono">UID ${esc(b.uid || '—')}${b.vipType ? ' · VIP' : ''}</span>
        <span class="neacct__meta mono">绑定于 ${esc(String(b.boundAt || '').slice(0, 10))}</span>
      </div>
    </div>
    <div class="neacct__actions">
      <button class="btn btn--sm btn--signal" id="nePanelLibrary" type="button">我的歌单</button>
      <button class="btn btn--sm" id="nePanelRecommend" type="button">每日推荐</button>
      <button class="btn btn--sm" id="nePanelCloud" type="button">云盘</button>
      <button class="btn btn--sm btn--danger" id="nePanelUnbind" type="button">解绑</button>
    </div>
    <label class="neacct__replace">
      <input type="checkbox" id="neUseVip" ${useLoginAudio() ? 'checked' : ''}/>
      用这个账号播放会员曲目（经由本站转发，可能触发网易云风控）
    </label>
    <label class="neacct__replace">音质
      <select id="neAudioLevel" class="neacct__select">
        ${[['standard', '标准 128k'], ['exhigh', '高 320k'], ['lossless', '无损'], ['hires', 'Hi-Res']]
    .map(([v, label]) => `<option value="${v}" ${getAudioLevel() === v ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
      <span class="muted" style="font-size:var(--fs-2xs)">实际档位由网易云按账号权限决定</span>
    </label>
    ${riskHTML()}`);
  panel.querySelector('#nePanelLibrary')?.addEventListener('click', () => { closePanel(); void openLibrary('playlists'); });
  panel.querySelector('#nePanelRecommend')?.addEventListener('click', () => { closePanel(); void openLibrary('recommend'); });
  panel.querySelector('#nePanelCloud')?.addEventListener('click', () => { closePanel(); void openLibrary('cloud'); });
  panel.querySelector('#nePanelUnbind')?.addEventListener('click', () => { void unbind(); });
  const LEVEL_LABEL = { standard: '标准 128k', exhigh: '高 320k', lossless: '无损', hires: 'Hi-Res' };
  panel.querySelector('#neAudioLevel')?.addEventListener('change', (e) => {
    const level = setAudioLevel(e.target.value);
    Toast.show(`音质：${LEVEL_LABEL[level] || level}（切下一首生效）`);
    // 已经签过的会员音频地址里钉着旧档位，重新签一遍
    void refreshCloudUrls({ force: true });
  });
  panel.querySelector('#neUseVip')?.addEventListener('change', (e) => {
    setUseLoginAudio(e.target.checked);
    Toast.show(e.target.checked
      ? '已开启：会员曲目会用你的账号播放（拿不到会自动回退官方播放器）'
      : '已关闭：会员曲目仍交给官方播放器');
    if (e.target.checked) void refreshCloudUrls({ force: true });
  });
}

/**
 * 备用通道：用浏览器里的 MUSIC_U 建立绑定。
 * 服务端会先拿它问一次「我是谁」，问得到才存 —— 所以粘错了会立刻得到一句人话。
 */
async function bindWithCookie() {
  const input = panel?.querySelector('#neCookieInput');
  const btn = panel?.querySelector('#neCookieGo');
  const raw = String(input?.value || '').trim();
  if (!raw) { Toast.show('先把 MUSIC_U 粘进来'); input?.focus(); return; }

  btn?.setAttribute('disabled', '');
  if (btn) btn.textContent = '正在验证…';
  const r = await api('/netease/login/cookie', { method: 'POST', body: { cookie: raw } });
  btn?.removeAttribute('disabled');
  if (btn) btn.textContent = '用这个 Cookie 连接';

  if (!r.ok || !r.data) {
    const msg = r.error || `HTTP ${r.status}`;
    setQrStatus(msg, 'err');
    Toast.err(`没连上：${msg}`);
    return;
  }
  stopPolling();
  state.bound = r.data.binding || null;
  paintStrip();
  void refreshCloudUrls();
  Toast.ok(`已连接：${r.data.profile?.nickname || '网易云账号'}`);
  renderBoundPanel();
}

/** 生成一把新 key 并开始轮询 */
async function beginQr() {
  stopPolling();
  const box = panel?.querySelector('#neQrBox');
  const status = panel?.querySelector('#neQrStatus');
  if (!box || !status) return;

  box.innerHTML = '<div class="neacct__qrph mono">正在生成二维码…</div>';
  status.textContent = '正在向网易云要一把扫码 key…';
  status.dataset.kind = '';

  const r = await api('/netease/login/qr');
  if (!r.ok || !r.data?.qrSvg) {
    box.innerHTML = `<div class="neacct__qrph mono">二维码生成失败</div>`;
    status.textContent = r.error || `HTTP ${r.status}`;
    status.dataset.kind = 'err';
    return;
  }

  box.innerHTML = r.data.qrSvg;   // 服务端用自家编码器生成的 SVG，内容只有矩形路径
  status.textContent = '等待扫码…';
  qrSession = {
    key: r.data.key,
    state: r.data.state,
    expiresAt: Date.now() + (Number(r.data.expiresIn) || 180) * 1000,
  };
  networkFails = 0;
  schedulePoll(600);
}

function schedulePoll(delay = POLL_MS) {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(() => { void pollOnce(); }, delay);
}

function setQrStatus(text, kind = '') {
  const el = panel?.querySelector('#neQrStatus');
  if (!el) return;
  el.textContent = text;
  el.dataset.kind = kind;
}

async function pollOnce() {
  pollTimer = null;
  if (!qrSession || !panel) return;
  if (Date.now() > qrSession.expiresAt) {
    setQrStatus('二维码过期了，点「重新生成」再来一次', 'warn');
    return;
  }

  const { key, state: st } = qrSession;
  const r = await api(`/netease/login/qr/check?key=${encodeURIComponent(key)}&state=${encodeURIComponent(st)}`);

  if (!panel) return;

  if (!r.ok || !r.data) {
    // 服务端 4xx/5xx：状态校验失败之类，重试没有意义
    const msg = r.error || `HTTP ${r.status}`;
    if (r.status >= 500) {
      networkFails += 1;
      if (networkFails <= NETWORK_RETRY) {
        setQrStatus(`网络波动，正在重试（${networkFails}/${NETWORK_RETRY}）…`, 'warn');
        schedulePoll(2500);
        return;
      }
    }
    setQrStatus(msg, 'err');
    return;
  }

  const d = r.data;
  switch (d.status) {
    case 'waiting':
      setQrStatus('等待扫码…（还没识别到）');
      schedulePoll();
      return;
    case 'scanned':
      setQrStatus('已扫码 —— 请在手机上点「确认登录」', 'ok');
      schedulePoll(1500);
      return;
    case 'confirmed':
      stopPolling();
      state.bound = d.binding || null;
      paintStrip();
      void refreshCloudUrls();   // 播放列表里已有的云盘曲目，换一遍新签名
      if (d.profile) Toast.ok(`已连接网易云：${d.profile.nickname || '账号'}`);
      renderBoundPanel();
      return;
    case 'expired':
      stopPolling();
      setQrStatus('二维码过期了，点「重新生成」再来一次', 'warn');
      return;
    case 'risk':
      stopPolling();
      setQrStatus(d.message || '网易云判定这次登录有风险', 'err');
      return;
    case 'network':
      networkFails += 1;
      if (networkFails <= NETWORK_RETRY) {
        setQrStatus(`网络波动，正在重试（${networkFails}/${NETWORK_RETRY}）…`, 'warn');
        schedulePoll(2500);
      } else {
        setQrStatus('连不上网易云，稍后再试', 'err');
      }
      return;
    default:
      stopPolling();
      setQrStatus(d.message || '登录失败', 'err');
  }
}

/* ------------------------------------------------------------------ */
/* 面板：我的歌单 / 每日推荐                                            */
/* ------------------------------------------------------------------ */

let library = null;   // { mode, playlists?, songs? }

async function openLibrary(mode = 'playlists') {
  if (!state.bound) { Toast.show('先连接网易云账号'); return; }
  closePanel();
  library = { mode, loading: true };
  const titles = { playlists: '我的歌单', recommend: '每日推荐', cloud: '云盘' };
  panel = panelShell(titles[mode] || '我的歌单', `
    <div class="neacct__tabs" role="tablist">
      <button class="neacct__tab${mode === 'playlists' ? ' is-on' : ''}" data-lib="playlists" type="button" role="tab">歌单</button>
      <button class="neacct__tab${mode === 'recommend' ? ' is-on' : ''}" data-lib="recommend" type="button" role="tab">每日推荐</button>
      <button class="neacct__tab${mode === 'cloud' ? ' is-on' : ''}" data-lib="cloud" type="button" role="tab">云盘</button>
    </div>
    <div class="neacct__lib" id="neLibBody"><div class="neacct__qrph mono">读取中…</div></div>`);

  panel.querySelectorAll('[data-lib]').forEach((btn) => {
    btn.addEventListener('click', () => {
      panel?.querySelectorAll('.neacct__tab').forEach((b) => b.classList.toggle('is-on', b === btn));
      library.mode = btn.dataset.lib;
      void loadLibrary();
    });
  });
  await loadLibrary();
}

/**
 * 云盘播放自检：把"播放器现在到底看到了什么"一次性列出来。
 * 线上出问题时，让用户点一下这个比让他开 F12 靠谱得多。
 */
async function showCloudDiagnostics(body) {
  if (!body || !library?.songs?.length) return;
  const cur = Player.current;
  const song = (cur?.cloud && library.songs.find((s) => String(s.id) === String(cur.neteaseId))) || library.songs[0];
  const track = Player.tracks.find((t) => String(t.neteaseId) === String(song.id));
  const a = Player.audio;
  const lines = [];
  const add = (k, v) => lines.push(`${k}: ${v}`);

  add('曲目', `${song.name} (id ${song.id})`);
  add('播放器', `provider=${Player.providerId} playing=${Player.playing} isEmbed=${Player.isEmbed}`);
  add('列表条目', track ? `cloud=${!!track.cloud} embedOnly=${!!track.embedOnly}` : '不在站内列表里');
  add('audio', `volume=${a?.volume} muted=${a?.muted} paused=${a?.paused} ready=${a?.readyState} err=${a?.error?.code ?? 'none'} t=${Number(a?.currentTime || 0).toFixed(2)} dur=${Number.isFinite(a?.duration) ? a.duration.toFixed(2) : '—'}`);
  add('官方 iframe', document.querySelector('#embedHost iframe') ? '存在' : '无');

  const url = track?.src || song.audio;
  add('地址尾部', String(url).slice(-16));
  try {
    const r = await fetch(url, { headers: { Range: 'bytes=0-4095' } });
    const buf = await r.arrayBuffer();
    const magic = [...new Uint8Array(buf).slice(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join('');
    add('HTTP', `${r.status} ${r.headers.get('content-type')} ${r.headers.get('content-range') || ''} magic=${magic}`);
  } catch (err) {
    add('HTTP', `失败：${String(err?.message || err)}`);
  }

  const probe = document.createElement('audio');
  probe.muted = true;
  probe.preload = 'metadata';
  probe.src = url;
  const ev = await new Promise((resolve) => {
    let done = false;
    const fin = (why) => { if (done) return; done = true; resolve(why); };
    probe.addEventListener('loadedmetadata', () => fin('loadedmetadata'), { once: true });
    probe.addEventListener('error', () => fin('error'), { once: true });
    setTimeout(() => fin('timeout'), 8000);
  });
  add('独立探测', `${ev} ready=${probe.readyState} err=${probe.error?.code ?? 'none'} dur=${Number.isFinite(probe.duration) ? probe.duration.toFixed(2) : '—'}`);
  probe.remove();

  body.innerHTML = `<pre class="neacct__diag mono">${esc(lines.join('\n'))}</pre>
    <div class="neacct__actions"><button class="btn btn--sm" id="neDiagBack" type="button">返回列表</button></div>`;
  body.querySelector('#neDiagBack')?.addEventListener('click', () => void loadLibrary());
}

async function loadLibrary() {
  const body = panel?.querySelector('#neLibBody');
  if (!body || !library) return;
  body.innerHTML = '<div class="neacct__qrph mono">读取中…</div>';

  if (library.mode === 'cloud') {
    const r = await api('/netease/login/cloud?limit=200');
    if (!panel) return;
    if (!r.ok || !r.data) {
      body.innerHTML = `<div class="neacct__err mono">${esc(r.error || `HTTP ${r.status}`)}</div>`;
      return;
    }
    library.songs = r.data.songs || [];
    if (!library.songs.length) {
      body.innerHTML = '<div class="neacct__qrph mono">云盘里还没有歌（在网易云 App 里「上传到云盘」之后这里会出现）</div>';
      return;
    }
    body.innerHTML = `
      <p class="muted neacct__libnote">云盘里是<b>你自己上传</b>的文件，所以能用登录态取到原始音频 —— 这不是 VIP 曲目。</p>
      <div class="neacct__libbar">
        <span class="mono faint">${library.songs.length} 首</span>
        <span class="grow"></span>
        <button class="btn btn--sm" id="neCloudDiag" type="button">自检</button>
        <button class="btn btn--sm btn--signal" id="neCloudImport" type="button">全部加入</button>
      </div>
      <ul class="neacct__songs">${library.songs.map((s, i) => `
        <li class="neacct__song" data-i="${i}">
          <span class="mono neacct__songidx">${String(i + 1).padStart(2, '0')}</span>
          <span class="neacct__songmain">
            <b>${esc(s.name)}</b>
            <span class="muted">${esc(s.artist || '未知歌手')}${s.matched ? '' : ' · 未匹配'}</span>
          </span>
          <button class="btn btn--sm" data-cloud-play="${i}" type="button">播放</button>
          <button class="btn btn--sm" data-cloud-add="${i}" type="button">加入</button>
        </li>`).join('')}</ul>`;

    const trackOf = (song) => ({ ...convert(song), cloud: true, src: song.audio || '' });

    /**
     * 取一首云盘歌在站内列表里的条目：**存在就用刚签好的地址覆盖它**。
     *
     * 为什么要覆盖：云盘列表里的 `audio` 是刚刚签过的新地址，而列表里那条可能是
     * 几天前（或签名还没修好时）存下的旧地址。`Player.add` 遇到同 id 只会 `prepare`，
     * 不会更新 `src`——于是点多少次「播放」都是在放那个坏地址。
     */
    const ensureTrack = (song, { play = false } = {}) => {
      const fresh = trackOf(song);
      const idx = Player.tracks.findIndex((t) => t.neteaseId === String(song.id));
      if (idx >= 0) {
        Object.assign(Player.tracks[idx], {
          src: fresh.src,
          cloud: true,
          embedOnly: false,
          cover: Player.tracks[idx].cover || fresh.cover,
          duration: Player.tracks[idx].duration || fresh.duration,
        });
        savePlaylist(Player.tracks);
        if (play) Player.prepare(idx, { autoplay: true });
        return { added: false, index: idx };
      }
      const r = Player.add(fresh, { play });
      savePlaylist(Player.tracks);
      return r;
    };

    body.querySelectorAll('[data-cloud-play]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const song = library.songs[Number(btn.dataset.cloudPlay)];
        if (!song) return;
        ensureTrack(song, { play: true });
        Toast.ok(`播放：${song.name || '云盘曲目'}`);
      });
    });
    body.querySelectorAll('[data-cloud-add]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const song = library.songs[Number(btn.dataset.cloudAdd)];
        if (!song) return;
        const r2 = ensureTrack(song);
        Toast.show(r2.added ? `已加入：${song.name || '云盘曲目'}` : '这首已经在列表里了（已换成新地址）');
      });
    });
    body.querySelector('#neCloudImport')?.addEventListener('click', () => {
      let added = 0;
      let updated = 0;
      for (const song of library.songs) {
        const r = ensureTrack(song);
        if (r.added) added += 1;
        else updated += 1;
      }
      savePlaylist(Player.tracks);
      Toast.ok([
        added ? `已加入 ${added} 首` : '',
        updated ? `${updated} 首已在列表（地址已刷新）` : '',
      ].filter(Boolean).join(' · ') || '云盘曲目都已在列表里');
    });
    body.querySelector('#neCloudDiag')?.addEventListener('click', () => { void showCloudDiagnostics(body); });
    return;
  }

  if (library.mode === 'recommend') {
    const r = await api('/netease/login/recommend?limit=30');
    if (!panel) return;
    if (!r.ok || !r.data) { body.innerHTML = `<div class="neacct__err mono">${esc(r.error || `HTTP ${r.status}`)}</div>`; return; }
    library.songs = r.data.songs || [];
    if (!library.songs.length) { body.innerHTML = '<div class="neacct__qrph mono">今天还没有推荐（或账号太新）</div>'; return; }
    body.innerHTML = `
      <div class="neacct__libbar">
        <span class="mono faint">${library.songs.length} 首</span>
        <span class="grow"></span>
        <button class="btn btn--sm btn--signal" id="neRecImport" type="button">全部导入</button>
      </div>
      <ul class="neacct__songs">${library.songs.map((s, i) => `
        <li class="neacct__song" data-i="${i}">
          <span class="mono neacct__songidx">${String(i + 1).padStart(2, '0')}</span>
          <span class="neacct__songmain"><b>${esc(s.name)}</b><span class="muted">${esc(s.artist || '')}</span></span>
          <button class="btn btn--sm" data-play="${i}" type="button">播放</button>
        </li>`).join('')}</ul>`;
    body.querySelector('#neRecImport')?.addEventListener('click', () => importSongs(library.songs, { replace: false }));
    body.querySelectorAll('[data-play]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const song = library.songs[Number(btn.dataset.play)];
        if (!song) return;
        Player.add(convert(song), { play: true });
        savePlaylist(Player.tracks);
        Toast.ok(`播放：${song.name || '曲目'}`);
      });
    });
    return;
  }

  const r = await api('/netease/login/playlists?limit=80');
  if (!panel) return;
  if (!r.ok || !r.data) { body.innerHTML = `<div class="neacct__err mono">${esc(r.error || `HTTP ${r.status}`)}</div>`; return; }
  const list = r.data.playlists || [];
  library.playlists = list;
  if (!list.length) { body.innerHTML = '<div class="neacct__qrph mono">这个账号还没有歌单</div>'; return; }

  body.innerHTML = `
    <p class="muted neacct__libnote">这里能读到私密歌单和「我喜欢的音乐」—— 匿名接口拿不到的那一部分。</p>
    <ul class="neacct__pls">${list.map((p, i) => `
      <li class="neacct__pl" data-i="${i}">
        <span class="neacct__plcover">${p.cover
          ? `<img src="${esc(p.cover)}" alt="" width="44" height="44" loading="lazy" referrerpolicy="no-referrer" />`
          : '<span class="neacct__plno" aria-hidden="true">♪</span>'}</span>
        <span class="neacct__plmain">
          <b>${esc(p.name)}</b>
          <span class="muted mono">${p.trackCount} 首${p.specialType === 5 ? ' · 我喜欢的音乐' : ''}${p.subscribed ? ' · 收藏' : ''}</span>
        </span>
        <button class="btn btn--sm" data-import="${i}" type="button">导入</button>
      </li>`).join('')}</ul>
    <label class="neacct__replace"><input type="checkbox" id="neReplace" /> 导入前清空站内现有列表</label>`;

  body.querySelectorAll('[data-import]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pl = library.playlists?.[Number(btn.dataset.import)];
      if (pl) void importPlaylist(pl, { replace: !!body.querySelector('#neReplace')?.checked });
    });
  });
}

/* ------------------------------------------------------------------ */
/* 导入                                                                */
/* ------------------------------------------------------------------ */

/** 把服务端给的 SearchSong 形状转成播放器曲目（和 netease.js 的 toTrack 等价）。 */
function convert(song) {
  return {
    id: `ne-${song.id}`,
    provider: 'netease',
    neteaseId: String(song.id),
    title: song.name || '',
    artist: song.artist || '',
    album: song.album || '',
    cover: song.cover || '',
    duration: Number(song.duration) || 0,
    fee: Number(song.fee) || 0,
    tags: [],
  };
}

/** 一批曲目并进站内列表（Player.setTracks 会广播 playlist:change，列表自己会重画） */
function importSongs(songs, { replace = false } = {}) {
  if (!songs?.length) { Toast.show('没有可导入的曲目'); return; }
  const res = applyImport(songs, { replace });
  // 导入的曲目里可能包含"云盘里也有一份"的歌：立刻按 id 换成云盘地址
  void refreshCloudUrls({ force: true });
  const bits = [`${replace ? '已替换为' : '已导入'} ${res.total} 首`];
  if (!replace && res.skipped) bits.push(`已在列表中 ${res.skipped} 首`);
  Toast.ok(bits.join(' · '));
  closePanel();
}

async function importPlaylist(pl, { replace = false } = {}) {
  Toast.show(`正在读取「${pl.name}」…`);
  const r = await api(`/netease/login/playlist?id=${encodeURIComponent(pl.id)}&limit=${PLAYLIST_IMPORT_LIMIT}`);
  if (!r.ok || !r.data?.playlist) {
    Toast.err(`读取歌单失败：${r.error || `HTTP ${r.status}`}`);
    return;
  }
  const detail = r.data.playlist;
  const ids = (detail.trackIds || []).slice(0, PLAYLIST_IMPORT_LIMIT);
  if (!ids.length) { Toast.show('这个歌单里没有可读取的曲目'); return; }

  // 曲目详情走公开的 /api/netease/songs（50 首一批），不需要登录态
  const songs = [];
  for (let i = 0; i < ids.length; i += 50) {
    try {
      const part = await fetchSongs(ids.slice(i, i + 50));
      songs.push(...part);
    } catch { /* 单批失败不整体失败：能拿多少算多少 */ }
  }
  if (!songs.length) { Toast.err('曲目详情一首都没拿到（可能被风控），稍后再试'); return; }

  importSongs(songs, { replace });
  const tail = detail.trackCount > ids.length ? `（共 ${detail.trackCount} 首，按上限导入前 ${ids.length} 首）` : '';
  Toast.show(`「${detail.name}」${tail}`, '', { ttl: 6000 });
}

/* ------------------------------------------------------------------ */
/* 解绑 / 挂载                                                         */
/* ------------------------------------------------------------------ */

async function unbind() {
  if (!confirm('解绑网易云账号？\n\n本站会删除保存的登录凭据，不会影响你在网易云上的任何数据。')) return;
  const r = await api('/netease/login/logout', { method: 'POST' });
  if (!r.ok) { Toast.err(`解绑失败：${r.error || `HTTP ${r.status}`}`); return; }
  state.bound = null;
  paintStrip();
  closePanel();
  Toast.ok('已解绑');
}

/** 音乐台挂载时调用：读状态、画状态带、挂按钮。 */
export async function mount(root) {
  const box = root?.querySelector?.('#neAccount') || $('#neAccount');
  if (!box) return;

  // 首次进入才请求；之后每次进音乐台直接画（避免来回切板块反复打接口）
  if (!state.loaded) await loadStatus();
  paintStrip();
  // 播放列表里已有的云盘曲目可能拿着旧签名：进音乐台统一换一遍（30 秒防抖）
  if (state.bound) void refreshCloudUrls();

  // 事件委托挂在状态带上：它自己的 innerHTML 会随绑定状态重画
  box.addEventListener('click', (e) => {
    if (e.target.closest('#neLogin')) { void openPanel(); return; }
    if (e.target.closest('#neLibrary')) { void openLibrary('playlists'); return; }
    if (e.target.closest('#neRecommend')) { void openLibrary('recommend'); return; }
    if (e.target.closest('#neCloud')) { void openLibrary('cloud'); return; }
    if (e.target.closest('#neAccountSettings')) { void openPanel(); return; }
    if (e.target.closest('#neUnbind')) { void unbind(); }
  });
}

/** 离开音乐台时调用：停掉轮询、关掉面板。 */
export function unmount() {
  closePanel();
}

/** 本站账号变了（登录 / 退出 / 刷新）→ 重新问一次状态 */
async function onAuthChanged() {
  state.loaded = false;
  await loadStatus();
  // 站点账号换了人：上一份绑定不属于这个身份，服务端会按新身份重新回答
  paintStrip();
}

/** 启动时先问一次（顶栏/音乐台都要用），失败不阻塞启动 */
export async function init() {
  try {
    await loadStatus();
  } catch { /* 静默：没有服务端时整条状态带都不会出现 */ }
  bus.on('auth:user', () => { void onAuthChanged(); });
  bus.on('auth:ready', () => { void onAuthChanged(); });
}

export const NeteaseLogin = {
  state,
  init,
  mount,
  unmount,
  stripHTML,
  open: openPanel,
  refresh: loadStatus,
};

export default NeteaseLogin;
