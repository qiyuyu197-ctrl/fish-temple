/**
 * tools/qzone-import/collect.js — 采集 QQ 群相册清单（一次性工具，不参与站点运行）
 * ------------------------------------------------------------------
 * 为什么需要它：QQ 群相册**没有公开接口**，服务端拿不到；相册封面还有防盗链，
 * 直接外链到我们站点会裂图。而**你自己的浏览器里已经登录了** ——
 * 所以最省事的做法是在那个页面上跑这段脚本：它会自动翻到底、把全部相册和封面收集出来。
 *
 * ⚠️ 隐私与安全：这段脚本**只读当前页面**（相册名/链接/封面地址），
 *    **不读取、不上传任何登录凭据**，也不往任何服务器发数据 —— 结果只显示在你自己的控制台/剪贴板。
 *
 * 用法：
 *   1) 电脑浏览器登录 QQ，打开群相册页（例如 https://qun.qq.com/groupphoto/index?gc=149796228 ）
 *   2) F12 → Console → 粘贴本文件全部内容 → 回车
 *   3) 它会自动往下滚，直到相册数量不再增长（319 个大概十几秒），然后：
 *        · 打印 JSON 清单，并复制到剪贴板
 *        · 需要下载封面时：脚本末尾调用 __qzoneDownloadCovers()（见文末说明）
 *   4) 把 JSON 存成 tools/qzone-import/albums.json，封面图片放进 tools/qzone-import/covers/
 *
 * 如果页面上找不到相册（QQ 改版/选择器变了）：把 page 里打印的 anchors 数量发我，我改选择器。
 * ------------------------------------------------------------------
 */

(() => {
  const GROUP = 149796228;                 // 目标群号（只用于日志）
  const WAIT = 900;                        // 每次滚动后的等待（毫秒），网络慢就调大
  const MAX_ROUNDS = 80;                   // 最多滚多少轮（防死循环）

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const abs = (u) => { try { return new URL(u, location.href).href; } catch { return ''; } };

  /** 从页面里挑出"相册卡片"：一个链接 + 一张封面图 + 一段名字 */
  function harvest() {
    const out = [];
    const seen = new Set();
    // ① 优先找形如相册的链接（groupphoto / album / a= 等），取其邻近的 img 作封面
    for (const a of document.querySelectorAll('a[href]')) {
      const href = abs(a.getAttribute('href'));
      if (!href || !/groupphoto|album|\/a\/|albumid|aid=/i.test(href)) continue;
      const card = a.closest('li,div,section') || a;
      const img = card.querySelector('img[src]') || a.querySelector('img[src]');
      const name = (a.getAttribute('title') || a.textContent || card.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      const cover = img ? abs(img.getAttribute('src') || img.getAttribute('data-src') || '') : '';
      const key = href.replace(/[?&](_|t|from|uin)=\d+/g, '');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name: name || `相册 ${out.length + 1}`, url: href, cover });
    }
    // ② 兜底：如果上一步没结果，就把所有带 img 的卡片按"图片地址"去重收一遍
    if (!out.length) {
      for (const img of document.querySelectorAll('img[src]')) {
        const cover = abs(img.getAttribute('src'));
        if (!cover || seen.has(cover)) continue;
        seen.add(cover);
        const card = img.closest('li,div,section') || img;
        const link = card.querySelector('a[href]');
        const name = (img.getAttribute('alt') || card.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
        out.push({ name: name || `相册 ${out.length + 1}`, url: link ? abs(link.getAttribute('href')) : location.href, cover });
      }
    }
    return out;
  }

  async function collectAll() {
    let last = 0;
    let list = [];
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      list = harvest();
      console.log(`[qzone] 第 ${round} 轮：已收集 ${list.length} 个相册`);
      if (list.length > last) last = list.length;
      else if (round > 3) break;                     // 连续两轮没增长 → 到底了
      window.scrollTo(0, document.body.scrollHeight);
      // 有些实现是内部容器滚动，两个都试一下
      const sc = document.scrollingElement || document.documentElement;
      if (sc) sc.scrollTop = sc.scrollHeight;
      const inner = [...document.querySelectorAll('div')].find((d) => d.scrollHeight > d.clientHeight + 200 && d.clientHeight > 300);
      if (inner) inner.scrollTop = inner.scrollHeight;
      await sleep(WAIT);
    }
    return harvest().length >= list.length ? harvest() : list;
  }

  const run = async () => {
    console.log(`[qzone] 开始采集群 ${GROUP} 的相册清单……（页面加载完再跑，效果最好）`);
    const list = await collectAll();
    const json = JSON.stringify(list, null, 2);
    console.log(`[qzone] 完成：共 ${list.length} 个相册`);
    console.log(json);
    try {
      await navigator.clipboard.writeText(json);
      console.log('[qzone] JSON 已复制到剪贴板 ✓  粘到 tools/qzone-import/albums.json');
    } catch {
      console.log('[qzone] 剪贴板被拦了：请手动从上面的输出里复制 JSON');
    }
    window.__qzoneAlbums = list;
    // 方便你确认封面能不能下：只处理头 5 个
    window.__qzoneDownloadCovers = async (only = 5, delay = 600) => {
      // 文件名带**在清单里的序号**（qzone-007.jpg = albums.json 的第 7 条），
      // 这样后面 build.mjs 能准确对上"哪张封面属于哪个相册"，不会因为顺序错位而张冠李戴。
      const items = (window.__qzoneAlbums || []).map((x, i) => ({ ...x, _i: i })).filter((x) => x.cover).slice(0, only);
      console.log(`[qzone] 试下载 ${items.length} 张封面（保存在浏览器下载目录）`);
      for (const it of items) {
        try {
          const res = await fetch(it.cover, { credentials: 'include' });   // 同源+已登录，才能拿到图
          const blob = await res.blob();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `qzone-${String(it._i + 1).padStart(3, '0')}.jpg`;
          document.body.append(a);
          a.click();
          a.remove();
          console.log(`  ✓ ${it._i + 1}/${(window.__qzoneAlbums || []).length} ${it.cover.slice(0, 60)}…`);
        } catch (err) {
          console.log(`  ✗ ${it._i + 1} 失败：${err.message}`);
        }
        await sleep(delay);                 // 太快会被浏览器拦或触发风控
      }
      console.log('[qzone] 试下载结束。若这 5 张都成功，把 only 改成 999 再跑一次就能全下。');
    };
    console.log('[qzone] 想试下载封面：控制台执行  __qzoneDownloadCovers()   （默认只下 5 张验证通路）');
    console.log('[qzone] 全量下载：        __qzoneDownloadCovers(999, 700)');
    return list;
  };

  return run();
})();
