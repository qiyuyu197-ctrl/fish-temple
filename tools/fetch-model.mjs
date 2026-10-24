#!/usr/bin/env node
/**
 * tools/fetch-model.mjs — 下载 AI 分轨模型（可选）
 * ------------------------------------------------------------------
 * 模型不进仓库（每份 ~64MB），正常从 GitHub Release（tag model-v1）取。
 * 什么时候用：
 *   · 本地 / 自托管第一次跑 AI 分轨；
 *   · 想换一个 MDX-Net 模型（页面里也能直接选本地 .onnx）。
 *
 * 用法：
 *   node tools/fetch-model.mjs                # 两份都下（伴奏 + 人声）
 *   node tools/fetch-model.mjs --model inst   # 只下伴奏模型
 *   node tools/fetch-model.mjs --model vocal  # 只下人声模型
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
const SIZE = 66_759_214;
const MODELS = {
  inst: { name: 'UVR-MDX-NET-Inst_HQ_3.onnx', label: '伴奏模型' },
  vocal: { name: 'Kim_Vocal_2.onnx', label: '人声模型' },
};

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const which = arg('--model', 'all');
const targets = which === 'all' ? Object.values(MODELS) : MODELS[which] ? [MODELS[which]] : null;
if (!targets) {
  console.error('--model 只支持 inst / vocal / all');
  process.exit(1);
}
if (arg('--out') && targets.length > 1) {
  console.error('--out 只能和单个 --model 一起用');
  process.exit(1);
}

const sizeOf = async (p) => {
  try { return (await stat(p)).size; } catch { return 0; }
};

const mirrorsFor = (name) => [
  `https://github.com/qiyuyu197-ctrl/fish-temple/releases/download/model-v1/${name}`,
  `https://aifasthub.com/Blane187/all_public_uvr_models/resolve/main/${name}`,
  `https://hf-mirror.com/Blane187/all_public_uvr_models/resolve/main/${name}`,
  `https://huggingface.co/Blane187/all_public_uvr_models/resolve/main/${name}`,
];

/** 下一次尝试：从已有字节续传；服务器不认 Range 就从头来 */
async function once(url, tmp) {
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

async function download(target) {
  const out = path.resolve(ROOT, arg('--out', `assets/models/${target.name}`));
  const tmp = `${out}.part`;
  const urls = arg('--url', '') ? [arg('--url')] : mirrorsFor(target.name);

  console.log(`\n== ${target.label}：${out}`);
  if (await sizeOf(out) >= SIZE) {
    console.log('   已经有完整文件，跳过');
    return true;
  }
  console.log(`   已有：${((await sizeOf(tmp)) / 1048576).toFixed(1)} MB`);

  for (const url of urls) {
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        console.log(`   尝试 ${new URL(url).host}（第 ${attempt + 1} 次）`);
        await once(url, tmp);
      } catch (err) {
        console.log(`     失败：${err.message}`);
      }
      if (await sizeOf(tmp) >= SIZE) break;
    }
    if (await sizeOf(tmp) >= SIZE) break;
  }

  const got = await sizeOf(tmp);
  if (got < SIZE) {
    console.error(`   没下完：${got} / ${SIZE} 字节。文件留在 ${tmp}，再跑一次会续传。`);
    return false;
  }
  await rename(tmp, out);
  console.log(`   完成：${(got / 1048576).toFixed(1)} MB`);
  return true;
}

async function main() {
  let ok = true;
  for (const target of targets) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await download(target))) ok = false;
  }
  if (!ok) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
