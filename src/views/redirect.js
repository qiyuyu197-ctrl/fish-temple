/**
 * views/redirect.js — 旧路由的兼容跳转
 * ------------------------------------------------------------------
 * 文章与公告合并成 #/logs 之后，`#/posts`、`#/news`、`#/post/<id>`、`#/newsItem/<id>`
 * 这些老链接（以及外部收藏、README 里写过的地址）不应该 404。
 *
 * 做法：注册一个空视图，mount 时用 location.replace 换成新地址 ——
 * 用 replace 而不是 hash 赋值，是为了不在历史里留一条"空页面"。
 */
export function redirectView(id, target) {
  return {
    id,
    title: '',
    render: () => '',
    mount() {
      // 保留 id / 子路径与查询串：#/post/abc → #/logs/abc
      const rest = location.hash.replace(/^#\/[^/?]*/, '');
      const to = `#/${target}${rest}`;
      if (location.hash !== to) location.replace(to);
    },
  };
}

export default redirectView;
