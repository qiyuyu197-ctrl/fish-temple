#!/usr/bin/env node
/**
 * tools/verify-all.mjs — 一条命令按顺序跑完所有自检
 * ==================================================================
 * 为什么需要它：这个仓库有五套会**开真浏览器**的自检，而我们踩过一个坑 ——
 * 几个浏览器套件同时跑会互相抢资源（CPU/GPU/网络），时序敏感的断言就会抖：
 * 音频加载卡住、黄历懒加载超时、`Stage.busy` 竞态…… 于是出现"看起来是回归、
 * 其实只是抢占"的假失败，浪费大量时间去查根本不存在的问题。
 *
 * 所以这个脚本只做一件事：**串行 + 隔离 + 汇总**。
 *   · 自己起两个服务（本地形态的 server.mjs、部署形态的 netlify-dev.mjs），
 *     跑完就杀掉，绝不占用你正在用的 5173；
 *   · 六套严格串行，套件之间留冷却时间，等上一个浏览器进程彻底退出；
 *   · 每套的输出实时转发给你看，同时留一份尾部，失败时原样贴出来（不吞细节）；
 *   · 结束时一张汇总表 + 总耗时，任何一套失败则本进程退出码 1。
 *
 * 用法：
 *   node tools/verify-all.mjs                      # 默认全跑（自己起服务）
 *   node tools/verify-all.mjs --only verify,responsive
 *   node tools/verify-all.mjs --base https://yumiao.netlify.app   # 不起服务，对着真实站点跑
 *   node tools/verify-all.mjs --cooldown 5000      # 改套件间冷却（毫秒）
 *
 * 口径说明：`--only` 的值是脚本名去掉 `tools/` 与 `.mjs`，例如 `verify`、`verify-playback`。
 */

import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---------------- 参数 ---------------- */

function parseArgs(argv) {
  const out = { only: null, base: null, cooldown: 2500, keep: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') out.only = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--base') out.base = String(argv[++i] || '').replace(/\/+$/, '') || null;
    else if (a === '--cooldown') out.cooldown = Math.max(0, Number(argv[++i]) || 0);
    else if (a === '--keep') out.keep = true;              // 调试用：跑完不杀服务
    else if (a === '-h' || a === '--help') { out.help = true; }
  }
  return out;
}

/* ---------------- 套件清单 ----------------
 * needsBase：需要站点地址（--base 或我们起的服务）
 * extraArgs：额外固定参数（responsive 的 hash）
 * 顺序就是执行顺序：先跑最基础的全站自检，再跑链路/账号/部署/界面，最后跑布局。
 */
const SUITES = [
  { id: 'verify', file: 'verify.mjs', title: '全站自检（路由/交互/内容/网易云/Markdown）', needsBase: true },
  { id: 'verify-playback', file: 'verify-playback.mjs', title: '播放链路 + 移动端', needsBase: true },
  { id: 'verify-auth', file: 'verify-auth.mjs', title: '账号 / 权限 / 论坛（API 层，自带模拟 IdP）', needsBase: false },
  { id: 'verify-deploy', file: 'verify-deploy.mjs', title: '部署形态（serverless + Blobs）', needsBase: true },
  { id: 'verify-forum-ui', file: 'verify-forum-ui.mjs', title: '账号 / 论坛界面（真浏览器，自带模拟 IdP）', needsBase: false },
  { id: 'responsive', file: 'responsive.mjs', title: '移动端 13 个宽度', needsBase: true, extraArgs: ['#/'] },
];

/* ---------------- 小工具 ---------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const c = {
  dim: (s) => `\x1b[90m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

/**
 * 找一个**真正空闲**的端口。
 * 为什么不用固定端口：同一台机器上可能同时开着别的会话/user 自己的开发服务器，
 * 固定值一撞就是"服务起不来 → 一整套假失败"。这里逐个试，并且在**绑定成功**后才算数
 * （只 connect 探测会漏掉"已被监听但拒绝连接"的情况）。
 */
async function freePort({ from = 5400, to = 5999, avoid = [] } = {}) {
  for (let i = 0; i < 60; i++) {
    const port = from + Math.floor(Math.random() * (to - from));
    if (avoid.includes(port)) continue;
    const ok = await new Promise((resolve) => {
      const srv = net.createServer();
      srv.once('error', () => resolve(false));
      srv.once('listening', () => srv.close(() => resolve(true)));
      srv.listen(port, '127.0.0.1');
    });
    if (ok) return port;
  }
  throw new Error(`找不到空闲端口（${from}-${to} 都被占了）`);
}

async function portInUse(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', (err) => resolve(err.code === 'EADDRINUSE'));
    srv.once('listening', () => srv.close(() => resolve(false)));
    srv.listen(port, '127.0.0.1');
  });
}

/** 等一个服务的 /api/health 起来（两个服务都提供这个端点） */
async function waitHealthy(base, { timeoutMs = 40000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = '';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return { ok: true, health: await res.json().catch(() => null) };
      lastErr = `HTTP ${res.status}`;
    } catch (err) {
      lastErr = String(err?.message || err);
    }
    await sleep(300);
  }
  return { ok: false, error: lastErr };
}

/* ---------------- 起/停自己用的服务 ---------------- */

const services = [];

/**
 * 起一个后台服务。
 * 服务自己的输出**不实时打印**（netlify-dev 会记录每个请求，刷屏会淹掉自检结果），
 * 而是存进环形缓冲；只有"起不来"或"异常退出"时才把它倒出来 —— 那时它才是排错的关键。
 */
function startService({ label, args, port }) {
  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });
  const svc = { label, port, child, log: [], exited: null };
  const keep = (buf) => {
    for (const line of String(buf).split('\n')) {
      if (!line.trim()) continue;
      svc.log.push(line);
      if (svc.log.length > 120) svc.log.shift();
    }
  };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  child.on('exit', (code, signal) => { svc.exited = { code, signal }; });
  child.on('error', (err) => { svc.log.push(`spawn error: ${err.code || err.message}`); });
  services.push(svc);
  return svc;
}

function dumpService(svc, why) {
  console.log(c.yellow(`\n  ⚠️ ${svc.label}（端口 ${svc.port}）${why}，它的输出如下：`));
  for (const line of svc.log.slice(-40)) console.log(c.dim('    ' + line));
}

async function stopServices({ quiet = false } = {}) {
  if (!services.length) return;
  if (!quiet) console.log(c.dim('\n  收尾：停掉自己起的服务…'));
  for (const svc of services) {
    try { svc.child.kill(); } catch { /* 已经退了 */ }
  }
  // 等端口真的释放：Windows 上进程退出与端口释放之间可能有一小段延迟，
  // 不等的话下一次运行可能"撞端口"（这是我们踩过的坑之一）。
  for (const svc of services) {
    for (let i = 0; i < 20; i++) {
      if (!(await portInUse(svc.port))) break;
      await sleep(150);
    }
    const still = await portInUse(svc.port);
    if (still) console.log(c.yellow(`  ⚠️ 端口 ${svc.port} 仍被占用（${svc.label}）—— 可能残留了进程，请手动检查`));
  }
  services.length = 0;
}

/* ---------------- 跑一套自检 ---------------- */

/** 从输出里提取"通过 / 总数"。各脚本措辞不同，这里兼容它们的两种写法。 */
function parseCounts(text) {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    // verify.mjs：总计 204 项，通过 204，失败 0
    let m = /总计\s*(\d+)\s*项[，,]\s*通过\s*(\d+)[，,]\s*失败\s*(\d+)/.exec(lines[i]);
    if (m) return { total: Number(m[1]), pass: Number(m[2]), fail: Number(m[3]) };
    // 其余四套：结果  通过 40 / 40
    m = /通过\s*(\d+)\s*\/\s*(\d+)/.exec(lines[i]);
    if (m) return { total: Number(m[2]), pass: Number(m[1]), fail: Number(m[2]) - Number(m[1]) };
  }
  return null;   // responsive.mjs 只打表格、没有汇总数字
}

function runSuite(suite, { baseUrl }) {
  return new Promise((resolve) => {
    const args = [path.join('tools', suite.file)];
    if (suite.needsBase && baseUrl) args.push(baseUrl);
    if (suite.extraArgs) args.push(...suite.extraArgs);

    console.log(c.bold(`\n${'─'.repeat(66)}`));
    console.log(c.bold(`▶ ${suite.id}`) + c.dim(`  ${suite.title}`));
    console.log(c.dim(`  ${process.execPath.split(path.sep).pop()} ${args.join(' ')}`));

    const started = Date.now();
    const child = spawn(process.execPath, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let all = '';
    const tee = (buf) => {
      const text = String(buf);
      all += text;
      process.stdout.write(text);          // 实时转发：跑的时候就能看到进度
    };
    child.stdout.on('data', tee);
    child.stderr.on('data', tee);
    child.on('error', (err) => {
      all += `\nspawn error: ${err.message}`;
      console.log(c.red(`  ✖ 起不来：${err.message}`));
    });
    child.on('close', (code) => {
      const ms = Date.now() - started;
      const counts = parseCounts(all);
      const pass = code === 0;
      console.log(pass
        ? c.green(`  ✔ ${suite.id} 通过（${((ms / 1000).toFixed(1))}s）`)
        : c.red(`  ✖ ${suite.id} 失败（退出码 ${code}，${((ms / 1000).toFixed(1))}s）`));
      resolve({ suite, code, ms, counts, tail: all.split('\n').slice(-30).join('\n') });
    });
  });
}

/* ---------------- 主流程 ---------------- */

async function main() {
  const opt = parseArgs(process.argv);
  if (opt.help) {
    console.log(`用法：
  node tools/verify-all.mjs [--only a,b] [--base <url>] [--cooldown <ms>] [--keep]

套件：${SUITES.map((s) => s.id).join(' / ')}`);
    return 0;
  }

  const wanted = opt.only && opt.only.length
    ? SUITES.filter((s) => opt.only.includes(s.id))
    : SUITES;
  if (!wanted.length) {
    console.log(c.red(`--only 没匹配到任何套件。可用：${SUITES.map((s) => s.id).join(', ')}`));
    return 1;
  }

  const startedAll = Date.now();
  console.log(c.bold('\n全部自检（串行执行）'));
  console.log(c.dim(`  项目根目录：${ROOT}`));
  console.log(c.dim(`  套件：${wanted.map((s) => s.id).join(' → ')}`));
  if (opt.base) console.log(c.dim(`  对着已有站点跑：${opt.base}（不起自己的服务）`));

  let localBase = opt.base;
  let deployBase = opt.base;

  try {
    if (!opt.base) {
      // 两个服务都用随机空闲端口，避开 5173（用户自己的）与别人会话可能占用的固定值
      const portA = await freePort({ from: 5300, to: 5699, avoid: [5173] });
      const portB = await freePort({ from: 5700, to: 5999, avoid: [5173, portA] });
      localBase = `http://127.0.0.1:${portA}`;
      deployBase = `http://127.0.0.1:${portB}`;

      console.log(c.dim(`\n  起本地形态服务 server.mjs → 端口 ${portA}`));
      const a = startService({ label: 'server.mjs', args: ['server.mjs', String(portA)], port: portA });
      const readyA = await waitHealthy(localBase);
      if (!readyA.ok) {
        dumpService(a, `没起来（${readyA.error}）`);
        return 1;
      }
      console.log(c.green(`  ✔ 本地形态就绪：${localBase}（deploy=${readyA.health?.deploy}）`));

      console.log(c.dim(`  起部署形态仿真 netlify-dev.mjs → 端口 ${portB}`));
      const b = startService({ label: 'netlify-dev.mjs', args: [path.join('tools', 'netlify-dev.mjs'), String(portB)], port: portB });
      const readyB = await waitHealthy(deployBase);
      if (!readyB.ok) {
        dumpService(b, `没起来（${readyB.error}）`);
        return 1;
      }
      console.log(c.green(`  ✔ 部署形态就绪：${deployBase}（deploy=${readyB.health?.deploy}，storage=${readyB.health?.storage}）`));
    }

    const results = [];
    for (let i = 0; i < wanted.length; i++) {
      const suite = wanted[i];
      // 需要站点的套件各自对着正确的形态：部署形态那套要看 netlify-dev 的仿真
      const baseUrl = suite.id === 'verify-deploy' ? deployBase : localBase;
      results.push(await runSuite(suite, { baseUrl }));
      if (i < wanted.length - 1) {
        await sleep(opt.cooldown);          // 冷却：等上一个浏览器进程彻底退出，别抢资源
      }
    }

    /* ---------------- 汇总 ---------------- */
    const totalMs = Date.now() - startedAll;
    console.log(c.bold(`\n${'═'.repeat(66)}`));
    console.log(c.bold('汇总'));
    console.log(c.bold(`${'═'.repeat(66)}`));
    console.log('  ' + '套件'.padEnd(20) + '通过 / 总数'.padEnd(16) + '耗时'.padEnd(10) + '状态');
    for (const r of results) {
      const counts = r.counts ? `${r.counts.pass} / ${r.counts.total}` : '—';
      const status = r.code === 0 ? c.green('PASS') : c.red(`FAIL(${r.code})`);
      console.log('  ' + r.suite.id.padEnd(20) + counts.padEnd(16) + `${(r.ms / 1000).toFixed(1)}s`.padEnd(10) + status);
    }
    const failed = results.filter((r) => r.code !== 0);
    console.log(c.dim(`\n  总耗时 ${(totalMs / 1000 / 60).toFixed(1)} 分钟；${results.length - failed.length}/${results.length} 套通过`));

    if (failed.length) {
      // 失败明细原样贴出来：汇总表只说明"哪套挂了"，这里给"挂在哪一条"
      console.log(c.red(`\n失败明细（每套最后 30 行）`));
      for (const r of failed) {
        console.log(c.red(`\n──── ${r.suite.id}（退出码 ${r.code}）────`));
        console.log(r.tail.trimEnd());
      }
      console.log(c.yellow('\n提示：若失败集中在音频 / 黄历 / 插画这类时序断言，先单独重跑那一套 ——'));
      console.log(c.yellow('      多套浏览器同时跑会抢资源导致假失败，这正是本脚本强制串行的原因。'));
    }

    return failed.length ? 1 : 0;
  } finally {
    if (!opt.keep) await stopServices({ quiet: opt.base !== null });
    else console.log(c.yellow('\n--keep：保留了自己起的服务，请自行结束进程'));
  }
}

/* 中断也要收尾：不然会留下占着端口的 node 进程 */
let cleaning = false;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    if (cleaning) return;
    cleaning = true;
    console.log(c.yellow(`\n收到 ${sig}，正在收尾…`));
    await stopServices({ quiet: true });
    process.exit(130);
  });
}

main()
  .then((code) => { process.exitCode = code; })
  .catch(async (err) => {
    console.error(c.red(`\n自检编排器自身出错：${err?.stack || err}`));
    await stopServices({ quiet: true });
    process.exitCode = 1;
  });
