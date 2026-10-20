# 论坛评论功能（设计）

> 状态：**未实现**，只有设计。实现时先读这份，再动 `server.mjs` / `views/post.js`。
> 为什么要写这一份：评论牵扯**权限**（谁能发、谁能删）和**存储**（双驱动 + 忽略规则），
> 不先定清楚，最容易出的错是"能发不能删"或"删了又复活"。

## 一、数据

```
data/forum-comments/<postId>.json      ← 本地驱动
collections/forum-comments/<postId>.json ← 线上 Blobs（同一套 writeItem 接口 ✓）
```

形状：

```json
{
  "postId": "p_xxx",
  "items": [
    { "id": "c_xxx", "sub": "auth0|...", "name": "昵称快照", "picture": "",
      "body": "正文", "at": "2026-10-20T04:00:00.000Z" }
  ],
  "updatedAt": "2026-10-20T04:00:00.000Z"
}
```

- `name` / `picture` 是**快照**（和帖子作者快照同一个思路 ✓）：用户改昵称后旧评论不跟着变，
  避免"历史评论全被改写"那种副作用。
- `.gitignore` 加 `data/forum-comments/`（运行期数据、含正文 ✓ 公开仓库不能进 ✗）。

## 二、接口（全部走已有 `/api` 与 storage 双驱动）

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/forum/posts/:id/comments` | 公开 | 返回 `{ ok, items }`，按时间正序 |
| POST | `/api/forum/posts/:id/comments` | **必须登录** | body `{ body }`；1–1000 字；30 秒内只能发一条（限频） |
| DELETE | `/api/forum/posts/:id/comments/:cid` | **本人或站长** | 非本人且非站长 → 403 |

校验：
- 正文 `trim()` 后为空 → 400；超 1000 字 → 400；含控制字符 → 400
- 帖子不存在 → 404（不能给不存在的帖子留孤儿评论）
- 存储写失败 → 503 + 人话（照发帖那处的做法 ✓）

## 三、帖子上的计数

- `GET /api/forum/posts`（列表）里给每帖附 `commentCount` ✓（读评论文档的 `items.length`；
  帖子少、评论文档小，直接读没问题；以后多了再上索引 ✓）
- 列表 UI 显示「💬 3」，详情页显示「评论（3）」✓

## 四、界面（`views/post.js` 或 logs 详情页底部）

```
评论（3）
─────────────────────────
[头像] 昵称 · 2026-10-20 12:00            ×（仅自己的评论 / 站长）
       正文
─────────────────────────
[输入框………………………………]  [发送]
   未登录时：登录后可以评论（按钮 → 打开登录面板）
```

- 正文一律 `esc()`（评论是典型的 XSS 入口 ✗）
- 发送后**立刻把新评论插到最下面**（不等重新拉列表 ✓），失败则回滚 + toast ✓
- 删除要二次确认 ✓，成功后从 DOM 移除并更新计数 ✓

## 五、断言（补到现有套件里，不新建套件）

`tools/verify-auth.mjs`（服务端，用模拟 IdP ✓）：
1. 未登录发评论 → **401**
2. 登录能发、能读回（列表末尾是它 ✓）
3. 空正文 / 超 1000 字 → **400**
4. 别人删不掉 → **403**；本人能删 → 200
5. 站长能删别人的 → 200
6. 帖子不存在 → 404
7. `.gitignore` 挡住 `data/forum-comments/` ✓

`tools/verify.mjs`（浏览器 ✓）：
8. 帖子详情页渲染出「评论（N）」区块；未登录时显示"登录后可以评论"而不是输入框 ✓

## 六、不做的事（更新：站主确认**要做**楼中楼与图片评论 ✓）

- 楼中楼 ✓ **做**（只做一层：回复的回复归到同一顶层 ✓）
- 图片评论 ✓ **做**（单张；data URL ≤80k 字符或 http(s) ✓）
- 不做敏感词过滤 / 待审 ✗（站长自己的站；真要做得在服务端过滤 ✓）
- 不做编辑评论 ✗（只支持删了重发 ✓）
- 不做表情包 / 多图 ✗（图片会让存储与体积失控 ✗，单张足够 ✓）

## 七、状态

| 部分 | 状态 |
|---|---|
| 纯逻辑模型 `src/plugins/comment-model.js` | ✓ 已实现 + 17 条自测 |
| 服务端接口（GET/POST/DELETE + 限频 + 连带删回复） | ✓ 已实现（冒烟过：200 / 501 / 404 各走对分支） |
| 评论区组件 `src/ui/comments.js` + 样式 `styles/comments.css` | ✓ 已实现 |
| 接进详情页 `views/post.js` | ✓ 已接 |
| **断言 8 条** | ✗ **还没补**（下面第 8 节是可直接粘进去的代码） |

## 八、断言代码（下次直接粘进 `tools/verify-auth.mjs`，放在"仓库卫生"那段之前）

```js
  /* ---- 6.7 论坛评论（楼中楼 + 图片 + 权限）----
   * 自己建一篇帖子，避免依赖前面用例的顺序 ✓ */
  const cp = await api('/api/forum/posts', { method: 'POST', token: memberToken, body: { title: '评论用例', body: '正文' } });
  const cpId = cp.json?.post?.id;
  check('评论：能建测试帖（前置）', cp.status === 200 && !!cpId, JSON.stringify({ status: cp.status }));

  const cAnon = await api(`/api/forum/posts/${cpId}/comments`, { method: 'POST', body: { body: 'hi' } });
  check('评论：未登录发评论 → 401', cAnon.status === 401, `${cAnon.status}`);

  const cBad = await api(`/api/forum/posts/${cpId}/comments`, { method: 'POST', token: memberToken, body: { body: '   ' } });
  check('评论：空正文且无图 → 400', cBad.status === 400, `${cBad.status}`);

  const cXss = await api(`/api/forum/posts/${cpId}/comments`, { method: 'POST', token: memberToken, body: { body: 'x', image: 'javascript:alert(1)' } });
  check('评论：javascript: 图片被拒 → 400', cXss.status === 400, `${cXss.status}`);

  const cOk = await api(`/api/forum/posts/${cpId}/comments`, { method: 'POST', token: memberToken, body: { body: '第一条评论' } });
  const cid = cOk.json?.comment?.id;
  check('评论：登录能发（拿到 id 与计数）', cOk.status === 200 && !!cid && cOk.json.count >= 1, JSON.stringify({ status: cOk.status, count: cOk.json?.count }));

  const cList = await api(`/api/forum/posts/${cpId}/comments`, {});
  check('评论：公开能读回', cList.status === 200 && (cList.json?.items || []).some((c) => c.id === cid), JSON.stringify(cList.json?.count));

  const cReply = await api(`/api/forum/posts/${cpId}/comments`, { method: 'POST', token: member2Token, body: { body: '回复', parentId: cid } });
  check('评论：楼中楼能回复（带 parentId）', cReply.status === 200 && cReply.json?.comment?.parentId === cid, JSON.stringify({ status: cReply.status }));

  const cDelOther = await api(`/api/forum/posts/${cpId}/comments/${cid}`, { method: 'DELETE', token: member2Token });
  check('评论：别人删不掉 → 403', cDelOther.status === 403, `${cDelOther.status}`);

  const cDelTop = await api(`/api/forum/posts/${cpId}/comments/${cid}`, { method: 'DELETE', token: memberToken });
  const cLeft = await api(`/api/forum/posts/${cpId}/comments`, {});
  check('评论：作者能删，且连带删掉它的回复（不留孤儿）',
    cDelTop.status === 200 && !(cLeft.json?.items || []).some((c) => c.id === cid || c.parentId === cid),
    JSON.stringify({ status: cDelTop.status, left: (cLeft.json?.items || []).length }));

  const cRate = await api(`/api/forum/posts/${cpId}/comments`, { method: 'POST', token: memberToken, body: { body: '紧接着再发一条' } });
  check('评论：30 秒限频 → 429', cRate.status === 429, `${cRate.status}`);

  check('⚠️ .gitignore 挡住了评论数据（data/forum-comments/）', /^\s*data\/forum-comments\/\s*$/m.test(ignore), '已忽略');
  const cleanup = await api(`/api/forum/posts/${cpId}`, { method: 'DELETE', token: memberToken });
  check('评论：测试帖能清掉（收尾）', cleanup.status === 200, `${cleanup.status}`);
```

浏览器侧（`tools/verify.mjs`，在详情页那条附近）：

```js
  const cmUI = await evaluate(`(() => {
    const root = document.getElementById('cmRoot');
    return {
      hasBlock: !!root,
      count: document.getElementById('cmCount')?.textContent || '',
      hasComposer: !!document.getElementById('cmInput') || !!document.getElementById('cmLogin'),
      noRawTag: !(root && /<script/i.test(root.innerHTML)),
    };
  })()`);
  record('评论：详情页渲染出评论区（计数 + 输入框/登录提示，且没有裸 HTML）',
    cmUI?.hasBlock === true && cmUI?.hasComposer === true && cmUI?.noRawTag === true,
    JSON.stringify(cmUI));
```

