/**
 * netlify/functions/api.mjs — 线上版 /api/*（Netlify Functions）
 * ------------------------------------------------------------------
 * 站点里「需要访问外部网站」的功能（随机插画 / Pixiv 抽卡与图片、网易云搜索与试听、
 * 黄历吉日之歌）都不是浏览器能直连的：
 *   · api.lolicon.app / nekos.best / waifu.pics 不给 CORS 头 → 浏览器 direct fetch 被拦；
 *   · i.pixiv.re 的图浏览器直连会失败（国内被墙 / 无 referer 白名单）；
 *   · music.163.com 的接口同样没有 CORS 头，音频流还要带 Referer。
 * 所以在本地是靠 server.mjs 代理的。Netlify 上没有常驻 Node 进程，
 * 这个函数就是那块缺掉的代理：它 **import 同一个 server.mjs**，
 * 复用一模一样的实现 —— 线上与本地只有一份逻辑，不会各修各的。
 *
 * 与本地不同的三件事（由 server.mjs 的 serverless 模式处理，见 handleApiRequest）：
 *   1. 内容接口只读：没有可写磁盘，写操作回 501 并说明原因（公开页面照旧读仓库里的 data/*.json）；
 *   2. 音频不搬运：/api/netease/audio 回 302 把浏览器指向网易云 CDN（Range/拖动进度由 CDN 原生支持），
 *      避免同步函数几 MB~十几 MB 的响应被平台截断；
 *   3. 图片不落盘：交给 Netlify 边缘缓存（Netlify-CDN-Cache-Control），
 *      等价于本地那份磁盘缓存。
 *
 * ⚠️ 路径还原（这里踩过坑，别再简化）：
 *   /api/* 是通过 netlify.toml 的 **rewrite** 转到本函数的，而 Netlify 在这种
 *   重写下给 `event.path` / `event.rawUrl` 的到底是「客户端请求的原始路径」还是
 *   「函数自己的路径」（/.netlify/functions/api/...），官方文档与 netlify dev 的历史
 *   行为并不一致（见 netlify/cli#559、#3316、#3620 这几处修正）。
 *   所以这里不赌：两种形状都认，并把自己最终怎么还原的记录在 meta 里，
 *   /api/health 会回显出来 —— 线上到底给的是哪一种，一个请求就能看到。
 *
 * 为什么用 v1 的 event/context 签名：它在 Netlify 上稳定多年、不挑 Functions 版本，
 * 配合 netlify.toml 里 /api/* 的重写即可。二进制响应（图片）用 base64 回。
 */

import { handleApiRequest } from '../../server.mjs';

/** 把「函数自己的路径」也还原成 /api/xxx，兼容两种 event 语义 */
function resolveApiPath(event) {
  const paths = [];
  if (event.rawUrl) {
    try { paths.push(new URL(event.rawUrl).pathname); } catch { /* rawUrl 不合法就用下面的 */ }
  }
  if (typeof event.path === 'string' && event.path) paths.push(event.path);

  // ① 已经是 /api/...（Netlify 给的是原始路径）
  for (const p of paths) {
    if (/^\/api(\/|$)/.test(p)) return { path: p, by: 'original' };
  }
  // ② 是函数自己的路径（/.netlify/functions/api/...）→ 还原成 /api/...
  for (const p of paths) {
    const m = /^\/\.netlify\/functions\/api(\/.*)?$/.exec(p);
    if (m) return { path: `/api${m[1] || ''}`, by: 'normalized' };
  }
  // ③ 都不是（例如函数被直接以别的路径调用）：交给 server.mjs 去回 404，别猜
  return { path: paths[0] || '/api', by: paths.length ? 'unrecognized' : 'missing' };
}

export async function handler(event) {
  const host = event.headers?.host || 'localhost';
  const rawUrl = event.rawUrl || `https://${host}${event.path || '/'}`;

  let parsed;
  try { parsed = new URL(rawUrl); } catch { parsed = new URL(`https://${host}${event.path || '/'}`); }

  const { path: apiPath, by } = resolveApiPath(event);
  const search = parsed.search || (event.rawQuery ? `?${event.rawQuery}` : '');
  const target = `${parsed.origin}${apiPath}${search}`;

  const headers = new Headers();
  for (const [k, v] of Object.entries(event.headers || {})) {
    if (typeof v === 'string' && v) headers.set(k, v);
  }

  const method = (event.httpMethod || 'GET').toUpperCase();
  const hasBody = !['GET', 'HEAD'].includes(method) && event.body != null;
  const body = hasBody
    ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body)
    : undefined;

  const response = await handleApiRequest(
    new Request(target, { method, headers, body }),
    {
      serverless: true,
      // 诊断信息：/api/health 会把它回显出来，用来确认线上事件语义
      meta: { rawUrl: event.rawUrl || null, path: event.path || null, rawQuery: event.rawQuery || null, resolvedPath: apiPath, resolvedBy: by },
    },
  );

  const buf = Buffer.from(await response.arrayBuffer());
  const type = response.headers.get('content-type') || '';
  const textual = /^(text\/|application\/(json|javascript|xml)|image\/svg)/i.test(type);

  const outHeaders = {};
  response.headers.forEach((v, k) => {
    // 长度交给平台自己算（base64 之后长度会变，写死反而会出错）
    if (k.toLowerCase() === 'content-length') return;
    outHeaders[k] = v;
  });

  return {
    statusCode: response.status,
    headers: outHeaders,
    body: textual ? buf.toString('utf8') : buf.toString('base64'),
    isBase64Encoded: !textual,
  };
}

export default handler;
