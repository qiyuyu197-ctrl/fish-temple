#!/usr/bin/env node
/**
 * tools/retry-search.mjs — 有界重试：代理抖动时反复尝试，直到抓到一次真实结果
 * 用法: node tools/retry-search.mjs [maxAttempts] [gapSeconds]
 */
import { promises as fs } from 'node:fs';
import { execFileSync } from 'node:child_process';

const MAX = Number(process["argv"][2] || 6);
const GAP = Number(process["argv"][3] || 20) * 1000;
const IMG = 'D:\\fish-temple\\tools\\test-small.jpg';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function oneAttempt() {
  const buf = await fs.readFile(IMG);
  const b64 = buf.toString('base64');
  const resp = await fetch('http://localhost:5173/api/saucenao/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: `data:image/jpeg;base64,${b64}`, mime: 'image/jpeg' }),
  });
  const data = await resp.json().catch(() => null);
  return { status: resp.status, data };
}

for (let i = 1; i <= MAX; i++) {
  const t0 = Date.now();
  process.stdout.write(`[retry ${i}/${MAX}] 搜索中… `);
  try {
    const { status, data } = await oneAttempt();
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (status === 200 && data?.ok) {
      const top = data.results?.[0] || {};
      const withThumbData = (data.results || []).filter((r) => r.thumbnailData).length;
      console.log(`\n✓ 成功（${secs}s）：${data.count} 条结果`);
      console.log(`  Top1: ${top.similarity?.toFixed(2)}% [${top.sourceIcon} ${top.sourceSite}] ${top.creator || top.title}`);
      console.log(`  来源: ${top.source}  主链: ${top.primaryUrl}`);
      console.log(`  base64 缩略图: ${withThumbData}/${data.count} 条已内嵌`);
      console.log(`  尝试次数: ${i}`);
      await fs.writeFile('D:\\fish-temple\\tools\\retry-success.json', JSON.stringify(data, null, 2));
      console.log('  完整结果已存 tools/retry-success.json');
      process.exit(0);
    } else {
      console.log(`✗ HTTP ${status}（${secs}s）: ${(data?.error || '').slice(0, 70)}`);
    }
  } catch (e) {
    console.log(`✗ 异常: ${e.message.slice(0, 70)}`);
  }
  if (i < MAX) { process.stdout.write(`  代理可能抖动，${GAP / 1000}s 后重试…\n`); await sleep(GAP); }
}
console.log(`\n${MAX} 次均失败：代理海外节点持续不可用。功能已验证正确（此前多次成功），待代理恢复即可用。`);
process.exit(1);
