#!/usr/bin/env node
/**
 * tools/test-markdown.mjs — Markdown 渲染器单元自检
 * 用法：node tools/test-markdown.mjs
 */

import { render, parseFrontmatter, excerpt, stats, slugify } from '../src/util/markdown.js';

let pass = 0;
let fail = 0;

function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`\x1b[32m PASS\x1b[0m  ${name}`); }
  else { fail++; console.log(`\x1b[31m FAIL\x1b[0m  ${name}  \x1b[90m${extra}\x1b[0m`); }
}

/* frontmatter */
{
  const { data, body } = parseFrontmatter('---\ntitle: 测试\ntags: [a, b]\npinned: true\nlevel: 2\n---\n正文');
  check('frontmatter 解析标题', data.title === '测试', data.title);
  check('frontmatter 数组', Array.isArray(data.tags) && data.tags.length === 2, JSON.stringify(data.tags));
  check('frontmatter 布尔', data.pinned === true);
  check('frontmatter 数字', data.level === 2);
  check('frontmatter 正文分离', body.trim() === '正文', body);
}

/* 标题 + 目录 */
{
  const { html, toc } = render('# H1\n\n## 小节 A\n\n正文\n\n### 小节 B\n');
  check('h1 渲染', html.includes('<h1'), html.slice(0, 60));
  check('h2 带锚点', /<h2 id="[^"]+">小节 A<\/h2>/.test(html), html);
  check('目录只收 h2/h3', toc.length === 2, JSON.stringify(toc));
}

/* 行内 */
{
  const { html } = render('**粗** *斜* `代码` ~~删~~ ==高亮== [链接](https://a.com) ![图](x.png)');
  check('粗体', html.includes('<strong>粗</strong>'));
  check('斜体', html.includes('<em>斜</em>'));
  check('行内代码', html.includes('<code>代码</code>'));
  check('删除线', html.includes('<del>删</del>'));
  check('高亮', html.includes('<mark>高亮</mark>'));
  check('外链加 target', html.includes('target="_blank"') && html.includes('rel="noopener noreferrer"'));
  check('图片', html.includes('<img src="x.png"'));
}

/* 表格 */
{
  const md = '| 主题 | 气质 |\n| --- | --- |\n| paper | 奶油纸 |\n| night | 暗色 |\n';
  const { html } = render(md);
  check('表格渲染', html.includes('<table>') && html.includes('<th>主题</th>'), html.slice(0, 120));
  check('表头 2 列', (html.match(/<th>/g) || []).length === 2);
  check('表体 2 行', (html.match(/<tr>/g) || []).length === 3, String((html.match(/<tr>/g) || []).length));
}

/* 代码块 */
{
  const { html } = render('```js\nconst a = 1 < 2;\n```');
  check('代码块带语言标记', html.includes('data-lang="js"'), html);
  check('代码块转义', html.includes('1 &lt; 2'), html);
}

/* 列表 */
{
  const { html } = render('- 甲\n- 乙\n\n1. 一\n2. 二\n');
  check('无序列表', (html.match(/<ul>/g) || []).length === 1);
  check('有序列表', (html.match(/<ol>/g) || []).length === 1);
  check('列表项数量', (html.match(/<li>/g) || []).length === 4);
}

/* 引用与提示块 */
{
  const { html } = render('> 普通引用');
  check('引用', html.includes('<blockquote>'), html);
  const { html: h2 } = render('> [!NOTE]\n> 提示内容');
  check('提示块', h2.includes('md-note') && h2.includes('md-note__t'), h2);
  const { html: h3 } = render('> [!WARN]\n> 警告内容');
  check('警告提示块', h3.includes('md-note--warn'), h3);
}

/* 分隔线 */
{
  const { html } = render('上文\n\n---\n\n下文');
  check('分隔线', html.includes('<hr />'), html);
}

/* 转义安全 */
{
  const { html } = render('<script>alert(1)</script>');
  check('HTML 被转义', !html.includes('<script>') && html.includes('&lt;script&gt;'), html);
}

/* 工具函数 */
{
  check('slugify 英文', slugify('Hello World') === 'hello-world', slugify('Hello World'));
  check('slugify 中文保留', slugify('小节 A') === '小节-a', slugify('小节 A'));
  check('slugify 去符号', slugify('a/b:c*d') === 'abcd', slugify('a/b:c*d'));
  const ex = excerpt('---\ntitle: t\n---\n\n## 标题\n\n这是**摘要**内容。');
  check('excerpt 去标记', ex === '标题 这是摘要内容。', ex);
  const st = stats('中文字符测试');
  check('stats 统计中文字数', st.cjk === 6, String(st.cjk));
}

console.log(`\n${'─'.repeat(50)}\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
