#!/usr/bin/env node
/**
 * tools/fetch-model.mjs — 下载 AI 分轨模型（可选）
 * ------------------------------------------------------------------
 * 模型不进仓库（~64MB），正常从 GitHub Release（tag model-v1）取。
 * 什么时候用：
 *   · 本地 / 自托管第一次跑 AI 分轨；
 *   · 想换一个 MDX-Net 模型（页面里也能直接选本地 .onnx）。
 *
 * 用法：
 *   node tools/fetch-model.mjs
 *   node tools/fetch-model.mjs --url https://example.com/xxx.onnx --out assets/models/xxx.onnx
 *
 * 说明：先试 GitHub Release，再试 aifasthub / hf-mirror / 官方（国内网络备用），
 * 断了会从已有字节继续（Range）。下载完会校验大小；文件被 .gitignore 忽略。
 */

import { createWriteStream } from 'node:fs';
import { stat, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'UVR-MDX-NET-Inst_HQ_3.onnx';
const SIZE = 66_759_214;
const MIRRORS = [
  `https://github.com/qiyuyu197-ctrl/fish-temple/releases/download/model-v1/${NAME}`,
  `https://aifasthub.com/Blane187/all_public_uvr_models/resolve/main/${NAME}`,
  `https://hf-mirror.com/Blane187/all_public_uvr_models/resolve/main/${NAME}`,
  `https://huggingface.co/Blane187/all_public_uvr_models/resolve/main/${NAME}`,
];

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const out = path.resolve(ROOT, arg('--out', `assets/models/${NAME}`));
const urls = arg('--url', '') ? [arg('--url')] : MIRRORS;
const tmp = `${out}.part`;

const sizeOf = async (p) => {
  try { return (await stat(p)).size; } catch { return 0; }
};

/** 下一次尝试：从已有字节续传；服务器不认 Range 就从头来 */
async function once(url) {
  const have = await sizeOf(tmp);
  const headers = have > 0 ? { Range: `bytes=${have}-` } : {};
  const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(600_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const append = have > 0 && res.status === 206;
  if (!append && have > 0) await rm(tmp, { force: true });
  const total = append ? have + Number(res.headers.get('content-length') || 0) : Number(res.headers.get('content-length') || 0);
  const stream = createWriteStream(tmp, { flags: append ? 'a' : 'w' });
  let got = await sizeOf(tmp);
  let last = Date.now();
  try {
    for await (const chunk of res.body) {
      if (!stream.write(chunk)) await new Promise((r) => stream.once('drain', r));
      got += chunk.length;
      if (Date.now() - last > 1000) {
        last = Date.now();
        process.stdout.write(`\r  ${(got / 1048576).toFixed(1)} MB${total ? ` / ${(total / 1048576).toFixed(1)} MB` : ''}   `);
      }
    }
  } finally {
    await new Promise((r) => stream.end(r));
  }
  process.stdout.write('\n');
}

async function main() {
  console.log(`目标：${out}`);
  console.log(`已有：${((await sizeOf(tmp)) / 1048576).toFixed(1)} MB\n`);
  for (const url of urls) {
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        console.log(`尝试 ${new URL(url).host}（第 ${attempt + 1} 次）`);
        await once(url);
      } catch (err) {
        console.log(`  失败：${err.message}`);
      }
      if (await sizeOf(tmp) >= SIZE) break;
    }
    if (await sizeOf(tmp) >= SIZE) break;
  }

  const got = await sizeOf(tmp);
  if (got < SIZE) {
    console.error(`\n没下完：${got} / ${SIZE} 字节。文件留在 ${tmp}，再跑一次会续传。`);
    process.exit(1);
  }
  await rename(tmp, out);
  console.log(`\n完成：${out}（${(got / 1048576).toFixed(1)} MB）`);
}

main().catch((e) => { console.error(e); process.exit(1); });
