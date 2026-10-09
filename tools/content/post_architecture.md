## 目录就是架构

```
src/
├── core/        bus · router · registry · store · player · theme · motion
├── ui/          shell · bits · toast · palette · boot · miniaudio
│                embed-host · lyrics · wave-row
├── plugins/     stage（插画）· netease（音乐）· minesweeper（扫雷）
├── views/       home · news · posts · post · music · gallery · mine · admin
└── util/        dom · markdown
styles/          tokens · base · components
data/            posts.json · news.json · album.json
tools/           自检与构建脚本（不属于运行时）
```

## 视图契约

每个页面就是一个对象，路由器按需渲染、挂载、清理：

```js
export default {
  id: 'posts',
  title: '文章',
  render(ctx) { return '<section>…</section>'; },   // 返回 HTML 字符串
  async mount(root, ctx) {                          // 绑事件
    root.addEventListener('click', onClick);
    return () => { /* 卸载时清理定时器等 */ };
  },
};
```

路由切换时会**换掉整个 `#view` 节点**，而不是复用。原因很实际：视图普遍用事件委托，复用节点会让监听器随访问次数累积——实测过"访问 N 次之后，点一张相册图会同时弹出 N 个灯箱"。换节点等于把旧监听器一起丢掉，比要求每个视图自己解绑更不容易漏。

## 扩展点在注册表里

| 想加什么 | 调什么 |
| --- | --- |
| 新页面 | `Registry.addRoute({ id, title, render, mount })` + `Registry.addNav({…})` |
| 新插画数据源 | `Registry.addImageProvider({ id, label, endpoint })` |
| 命令面板命令 | `Registry.addCommand({ id, label, run })` |
| 首页插槽组件 | `Registry.addWidget({ id, slot, render })` |

`#/dashboard` 那个页面本身就是这么注册进来的，没有改动任何核心文件。

## 代价

不打包意味着放弃了一些东西，得心里有数：

- 没有类型检查、没有 tree-shaking、没有依赖生态 → **用自检代替编译器**（178 项断言）
- 模块按需加载，首屏多几个请求（本地是毫秒级）
- 组件复用靠手写模板字符串，没有 JSX

换回来的是：改一行刷新就见效、`file://` 能开、任何人拿到这份源码都能直接读。

## 一个真实的坑

> [!WARN]
> Windows PowerShell 5.1 的 `Set-Content -Encoding UTF8` 会给文件加 **BOM**，用它改 `.mjs`
> 之后 Node 会直接报 `SyntaxError: Invalid or unexpected token`，而错误位置看起来毫无关联。

显式写成不带 BOM 的编码即可：

```powershell
[IO.File]::WriteAllText($p, $t, [Text.UTF8Encoding]::new($false))
```
