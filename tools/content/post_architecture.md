## 目录就是架构

```
src/
├── core/        bus · router · registry · store · player · theme · motion · history
├── ui/          shell · bits · toast · palette · boot · comments · leaderboard
├── plugins/     netease · stage · minesweeper · mine-room · auth · tierlist
├── views/       home · logs · forum · music · gallery · leisure · mine · tools · admin
└── util/        dom · markdown
styles/          14 份源样式 → app.bundle.css
data/            posts · news · album · anime 等静态种子
netlify/         Functions v2 入口（复用 server.mjs）
tools/           自检、打包、抓取脚本（不属于运行时）
```

## 运行时零依赖，发布时打一个包

源码是原生 ES 模块：没有框架、没有运行时 npm 依赖，浏览器直接就能解释。但发布到公网时不再让浏览器逐个请求模块：

- 78 个 JS 文件由 esbuild 合成一个 `app.bundle.js`
- 14 份样式按固定顺序合成一个 `styles/app.bundle.css`
- Service Worker 的壳资源清单和版本指纹由脚本生成

这么做不是为了“现代化”，而是被网络教做人：静态托管在并发高时会对单个模块返回 503，模块瀑布里任何一个失败，首屏就停在启动画面；14 个样式表也意味着 14 次往返。合成单文件后，首屏只赌一个请求，失败还有三次重挂兜底。

源码仍然是可读的那份，打包只是发布步骤。改一行刷新就能看到效果，这个开发体验没有丢。

## 视图契约

每个页面是一个对象，路由器按需渲染、挂载、清理：

```js
export default {
  id: 'logs',
  title: '文章与公告',
  render(ctx) { return '<section>…</section>'; },
  async mount(root, ctx) {
    root.addEventListener('click', onClick);
    return () => { /* 卸载时清理定时器 */ };
  },
};
```

路由切换会换掉整个 `#view` 节点，而不是复用。原因很实际：视图普遍用事件委托，复用节点会让监听器随访问次数累积——实测过“访问 N 次之后，点一张相册图会同时弹出 N 个灯箱”。换节点等于把旧监听器一起丢掉，比要求每个视图自己解绑更不容易漏。

## 扩展点

| 想加什么 | 调什么 |
| --- | --- |
| 新页面 | `Registry.addRoute({ id, title, render, mount })` + `Registry.addNav({…})` |
| 新插画数据源 | `Registry.addImageProvider({ id, label, endpoint })` |
| 命令面板命令 | `Registry.addCommand({ id, label, run })` |
| 首页插槽组件 | `Registry.addWidget({ id, slot, render })` |

仪表盘、论坛、文娱和几个游戏页面都是通过注册表接进来的，核心文件不需要知道它们的存在。

## 数据与接口

- `data/*.json` 是站点自带的种子内容；发布控制台写入后，由接口层合并。
- 开发环境写文件，部署环境写 Netlify Blobs；`storage.mjs` 把两种后端藏在同一个接口后面。
- 线上读取是**覆盖层**：静态种子之上叠加 Blobs 里的修改，再按墓碑字段剔除已删除项。这样“仓库里的现有文案”不会因为一次部署消失。
- 论坛列表额外维护一份轻量索引，否则每次列表都要逐条读 Blob，读配额很快见底。
- `netlify/functions/api.mjs` 复用的就是 `server.mjs` 的 `handleApiRequest`，同一套代理、鉴权和校验不用写两遍。

## 代价

不打包、无框架换来了透明，也放弃了一些东西：

- 没有类型检查、没有 tree-shaking、没有依赖生态 → **用自检代替编译器**
- 发布前必须重新生成 bundle 和 Service Worker，不能只改源文件
- 组件复用靠手写模板字符串，没有 JSX
- 单文件包变大后，首次加载会比按需加载慢一点；现在用 modulepreload、版本查询和缓存头把这一下压住

换回来的是：任何人拿到源码都能直接读，改完刷新就见效，出问题能一路查到浏览器原生的那一层。

## 一个真实的坑

> [!WARN]
> Windows PowerShell 5.1 的 `Set-Content -Encoding UTF8` 会给文件加 **BOM**，用它改 `.mjs`
> 之后 Node 会直接报 `SyntaxError: Invalid or unexpected token`，而错误位置看起来毫无关联。

显式写成不带 BOM 的编码即可：

```powershell
[IO.File]::WriteAllText($p, $t, [Text.UTF8Encoding]::new($false))
```
