/**
 * tools/liuli-radius-audit.js — 琉璃圆角审计（在页面里跑的表达式，不是独立脚本）
 * ------------------------------------------------------------------
 * 用法：
 *   node tools/eval.mjs "http://127.0.0.1:5173/#/" @tools/liuli-radius-audit.js 10000
 *
 * 为什么需要它：本站原本是「全局零圆角」的工业直角（tokens.css 的 --radius 是 0 且没人消费），
 * 所以琉璃主题只能逐个面给圆角。靠肉眼找漏网一定会漏 —— 第一版审计就查出 115 类，
 * 其中 87 处是筛选 chip、80 处是扫雷格子。这个脚本遍历所有板块，只报告
 * 「有底色 / 有边框、又没被圆角父级裁掉」的直角元素，按 tag.class 聚合。
 *
 * 刻意排除（白名单，见 liuli.css 第 7h 条）：
 *   · 扫雷棋盘 button.ms-cell —— 格子圆角会毁掉「哪格挨着哪格」的读图性
 *   · 表格 td / th —— 同理
 *
 * 判据说明：
 *   · 「被父级裁掉」= 某个祖先同时有 overflow≠visible 和 border-radius>0，
 *     这时子元素的直角看不见，不算问题（海报上的 wash / grid / shine 就属于这种）
 *   · 没底没边的元素看不出来，也不报
 *   · 面板头那类「只有上圆角」的形状是故意的，不报
 */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const routes = ['#/', '#/logs', '#/logs/post_overview', '#/forum', '#/music', '#/gallery',
    '#/leisure', '#/mine', '#/tools', '#/tools?tab=tier', '#/tools?tab=audio', '#/download', '#/saucenao'];
  const found = new Map();
  const EXEMPT = /^(button\.ms-cell|td|th|tr|tbody|thead|table)$/;

  const sig = (el) => {
    const c = (typeof el.className === 'string') ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.') : '';
    const id = el.id ? `#${el.id}` : '';
    return el.tagName.toLowerCase() + id + (c ? `.${c}` : '');
  };
  const note = (key, kind, detail) => {
    if (!found.has(key)) found.set(key, { n: 0, kinds: new Set(), sample: '' });
    const e = found.get(key);
    e.n += 1;
    e.kinds.add(kind);
    if (!e.sample) e.sample = detail;
  };
  const clippedBy = (el) => {
    for (let p = el.parentElement; p && p.id !== 'view'; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.overflow !== 'visible' && parseFloat(s.borderTopLeftRadius) > 0) return sig(p);
    }
    return '';
  };
  const realBg = (s) => s.backgroundColor !== 'rgba(0, 0, 0, 0)' || /url\(/.test(s.backgroundImage || '');

  const scan = () => {
    for (const el of document.querySelectorAll('#view *, .topbar *, .ticker *, .miniplayer, .footer *')) {
      const r = el.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) continue;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) continue;
      const key = sig(el);
      if (EXEMPT.test(key)) continue;
      const radius = s.borderTopLeftRadius;
      const nonUniform = !String(s.borderRadius).split(/\s+/).every((p, i, a) => p === a[0]);
      const clipped = s.clipPath && s.clipPath !== 'none';
      // 切角还有第二种实现：mask 渐变（ef.css 的 --ef-cut）。mask 同样不吃 border-radius，
      // 所以圆角旁边会缺掉一个角 —— 第一版审计只查 clip-path，把这类全漏了。
      const maskImg = s.maskImage || s.webkitMaskImage || 'none';
      const maskedCut = maskImg && maskImg !== 'none' && /-45deg/.test(maskImg);
      const hardShadow = /^-?\d+(\.\d+)?px\s+-?\d+(\.\d+)?px\s+0(px)?\s/.test(s.boxShadow || '');
      const visibleBox = realBg(s) || (parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none');
      if (hardShadow) note(key, '硬直角阴影', (s.boxShadow || '').slice(0, 46));
      if (clipped) note(key, 'clip-path切角', s.clipPath.slice(0, 46));
      if (maskedCut) note(key, '切角(mask)', maskImg.slice(0, 46));
      if (!visibleBox) continue;
      if (clippedBy(el)) continue;
      if (radius === '0px') note(key, '完全直角', `bg=${s.backgroundColor.slice(0, 26)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      else if (nonUniform && !/^14px 14px 0px 0px$|^0px 0px 14px 14px$/.test(s.borderRadius)) note(key, '圆角不统一', s.borderRadius);
    }
  };

  // 切到琉璃（用顶栏水滴按钮，三态循环里第一下就是「夜」）
  const btn = document.getElementById('liuliBtn') || document.getElementById('themeBtn');
  for (let i = 0; i < 10; i += 1) {
    if (document.documentElement.dataset.theme.startsWith('liuli')) break;
    btn.click();
    await sleep(200);
  }
  await sleep(1200);
  for (const rt of routes) {
    location.hash = rt;
    await sleep(1300);
    try { scan(); } catch (e) { /* 单个板块出错不影响整体 */ }
  }
  const rows = [...found.entries()]
    .map(([k, v]) => ({ 选择器: k, 次数: v.n, 问题: [...v.kinds].join('+'), 样例: v.sample }))
    .sort((a, b) => b.次数 - a.次数);
  return { 主题: document.documentElement.dataset.theme, 剩余种类: rows.length, 明细: rows.slice(0, 30) };
})()
