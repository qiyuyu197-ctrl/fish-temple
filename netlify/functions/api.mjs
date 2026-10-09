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
 * 为什么用 v1 的 event/context 签名：它在 Netlify 上稳定多年、不挑 Functions 版本，
 * 配合 netlify.toml 里 /api/* 的重写即可。二进制响应（图片）用 base64 回。
 */

import { handleApiRequest } from '../../server.mjs';

export async function handler(event) {
  // 重写之后 event.path 可能是函数自己的路径，所以优先用 rawUrl 还原**原始**请求
  const raw = event.rawUrl
    || `https://${event.headers?.host || 'localhost'}${event.path || '/'}${event.rawQuery ? `?${event.rawQuery}` : ''}`;

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
    new Request(raw, { method, headers, body }),
    { serverless: true },
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
