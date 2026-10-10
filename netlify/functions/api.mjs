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
  return handleApiRequest(request, {
    serverless: true,
    // 本地仿真器（tools/netlify-dev.mjs）会把一个 Blobs 替身挂在这个全局上，
    // 好让"线上写 Blobs → 读覆盖层"这条链路在没有 Netlify 凭据时也能真跑。
    // 真线上没有这个全局，于是自动走 @netlify/blobs。
    blobDriver: globalThis.__FT_BLOB_DRIVER || null,
  });
}

/**
 * 声明路由：/api/* 直接打到本函数。
 *
 * ⚠️ 有了这个 config.path，**不要**再在 netlify.toml 里加
 *    `[[redirects]] from = "/api/*" to = "/.netlify/functions/api/:splat"`：
 *    官方文档写明设了 config.path 之后函数只在该路径可用、默认地址不再存在，
 *    那条重写会把请求转到一个不存在的地址，于是每个接口都变成 Netlify 的
 *    "Page not found" 404（线上真踩过，看起来像"函数根本没部署"）。
 *    原因也写在 netlify.toml 顶部。
 *
 * handleApiRequest 仍会把 /.netlify/functions/api/... 还原成 /api/...
 * 作兜底（本地仿真用 NETLIFY_FAKE_FN_PATH=1 验这条路径）。
 */
export const config = { path: '/api/*' };
