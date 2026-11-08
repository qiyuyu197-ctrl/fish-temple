#!/usr/bin/env node
/**
 * tools/test-search-api.mjs — 端到端测试 /api/saucenao/search
 * 用法: node tools/test-search-api.mjs [imagePath]
 */
import { promises as fs } from 'node:fs';

const IMG = process["argv"][2] || 'D:\\fish-temple\\tools\\test-small.jpg';
const buf = await fs.readFile(IMG);
console.log(`[e2e] 图片: ${IMG} (${(buf.length / 1024).toFixed(0)} KB)`);

const b64 = buf.toString('base64');
console.log('[e2e] POST /api/saucenao/search ...');
const t0 = Date.now();

const resp = await fetch('http://localhost:5173/api/saucenao/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ image: `data:image/jpeg;base64,${b64}`, mime: 'image/jpeg' }),
});

const data = await resp.json().catch(() => null);
console.log(`[e2e] HTTP ${resp.status}  总耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);

if (!data || data.ok === false) {
  console.error('[e2e] 失败:', data?.error || '(无响应体)');
  process.exit(1);
}

console.log(`[e2e] ✓ 成功：${data.count} 条结果（服务端 ${data.elapsedMs}ms）`);
for (const r of (data.results || []).slice(0, 6)) {
  console.log('─'.repeat(60));
  console.log(`  ${r.similarity.toFixed(2)}%  [${r.sourceIcon || ''} ${r.sourceSite}]  ${r.hidden ? '(低相似/隐藏)' : ''}`);
  console.log(`  标题: ${r.title || '(无)'}`);
  const who = r.creator || r.member || r.author;
  if (who) console.log(`  作者: ${who}`);
  if (r.source) console.log(`  来源: ${r.source}`);
  if (r.primaryUrl) console.log(`  主链: ${r.primaryUrl}`);
  if (r.thumbnail) console.log(`  缩略: ${r.thumbnail.slice(0, 90)}...`);
  for (const l of (r.links || []).slice(0, 4)) console.log(`  外链: ${l.label || ''} → ${l.url}`);
}
await fs.writeFile('D:\\fish-temple\\tools\\e2e-search-result.json', JSON.stringify(data, null, 2));
console.log('\n[e2e] 完整结果已存 tools/e2e-search-result.json');
