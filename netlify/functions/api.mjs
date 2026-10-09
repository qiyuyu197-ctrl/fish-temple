/**
 * netlify/functions/api.mjs — 线上版 /api/*（Netlify Functions）
 * ------------------------------------------------------------------
 * 站点里「需要访问外部网站」的功能（随机插画 / Pixiv 抽卡与图片、网易云搜索与试听、
 * 黄历吉日之歌）都不是浏览器能直连的：
 *   · api.lolicon.app / nekos.best / waifu.pics 不给 CORS 头 → 浏览器 direct fetch 被拦；
 *   · i.pixiv.re 的图浏览器直连会失败（国内被墙 / 无 referer 白名单）；
 *   · music.163.com 的接口同样没有 CORS 头，音频流还要带 Referer。
 * 本地是靠 server.mjs 代理的；Netlify 上没有常驻 Node 进程，这个函数就是那块缺掉的代理：
 * 它 **import 同一个 server.mjs**，复用一模一样的实现 —— 线上线下只有一份逻辑。
 *
 * 为什么是 **Functions v2 形态**（`export default` + `config.path`，返回 Web Response）：
 * 线上实测过两种失败，都是"本地怎么测都测不出来"的类型，写在这里免得再走一遍：
 *   1. 顶层 `const __filename = …` → 打包成 CJS 后与 Node 包装器形参撞名，
 *      函数**加载阶段**就 SyntaxError，所有 /api/* 回 502（见 server.mjs 顶部的说明）；
 *   2. 文件里既有 `export default` 又有 v1 的 `{statusCode, body}` 返回值时，
 *      Netlify 按 v2 调用，于是报
 *      「Function returned an unsupported value. Accepted types are 'Response'…」。
 * 现在只保留 v2 这一种：直接收 Web `Request`、返回 Web `Response`，
 * 不再有 event 形状的歧义，也就不需要 v1 那层适配。
 *
 * 与本地不同的三件事（由 server.mjs 的 serverless 模式处理，见 handleApiRequest）：
 *   1. 内容接口只读：没有可写磁盘，写操作回 501 并说明原因（公开页面照旧读仓库里的 data/*.json）；
 *   2. 音频不搬运：/api/netease/audio 回 302 把浏览器指向网易云 CDN（Range/拖动进度由 CDN 原生支持），
 *      避免函数扛几 MB 流量、也不会撞上响应体积上限；
 *   3. 图片不落盘：交给 Netlify 边缘缓存（Netlify-CDN-Cache-Control），等价于本地那份磁盘缓存。
 */

import { handleApiRequest } from '../../server.mjs';

/** v2 形态：收 Web Request，返回 Web Response */
export default async function api(request) {
  return handleApiRequest(request, { serverless: true });
}

/**
 * 声明路由：/api/* 直接打到本函数。
 * netlify.toml 里那条 [[redirects]] 是双保险（万一运行时不认 config.path），
 * 两种情况 handleApiRequest 都能把路径还原成 /api/xxx。
 */
export const config = { path: '/api/*' };
