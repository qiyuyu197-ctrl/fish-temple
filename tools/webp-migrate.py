#!/usr/bin/env python3
"""
tools/webp-migrate.py — 两阶段把 assets/img 转 WebP 并改写引用（安全版）
================================================================================
为什么要有它：站点 99.5% 的体积是图；Netlify 的额度跟"部署体积 + 带宽"挂钩。
实测转 WebP 能省约 29.8%（176.75 MB → 124.08 MB）。

⚠️ 上一版一边转码一边删原图，删到"被占用/只读"的文件就整个中断，
   于是留下**引用只改了一半**的中间态（自检直接掉到 210/212）。这一版按两点重写：

  1) **分阶段**：
       --phase convert  转码 + 精确改写引用（**不删任何原图**）→ 此时原图还在，站点绝不会裂图
       --phase check    核对：还有没有指向 jpg/png 的引用、引用的 webp 是否都存在
       --phase delete   只删"已成功转码"的原图；**只读属性先清掉**，失败只跳过并列入清单
  2) **精确改写**：用"转换成功的完整相对路径 → .webp"的映射表做替换（按路径长度从长到短），
     不再靠正则猜；同时处理 data/*.json 里只写文件名（含 thumbs/ 子目录同名）的情况。

用法：
  python tools/webp-migrate.py --phase convert
  python tools/webp-migrate.py --phase check
  python tools/webp-migrate.py --phase delete
  （回滚：git checkout -- assets/img data README.md && git clean -fd -- assets/img）
================================================================================
"""

import argparse
import os
import re
import stat
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("需要 Pillow")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "assets" / "img"
SRC_EXTS = (".jpg", ".jpeg", ".png")
TEXT_GLOBS = ["data/*.json", "index.html", "src/**/*.js", "styles/**/*.css", "README.md"]
MAX_EDGE, QUALITY = 1600, 82
RE_ASSETS_REF = re.compile(r"assets/img/[^\s\"'`)\]]+\.(?:jpg|jpeg|png)", re.I)


def human(n):
    return f"{n / 1048576:.2f} MB" if n >= 1048576 else f"{n / 1024:.1f} KB"


def images():
    return [p for p in sorted(IMG.rglob("*")) if p.is_file() and p.suffix.lower() in SRC_EXTS and p.stat().st_size > 0]


def text_files():
    out = []
    for g in TEXT_GLOBS:
        out.extend(sorted(ROOT.glob(g)))
    return [p for p in out if p.is_file()]


def phase_convert():
    files = images()
    tfiles = text_files()
    print(f"图片 {len(files)} 张 · 文本文件 {len(tfiles)} 个")
    converted = {}          # 完整相对路径(posix) -> (old, new)
    old_total = new_total = 0
    for p in files:
        rel = p.relative_to(ROOT).as_posix()
        old = p.stat().st_size
        old_total += old
        webp = p.with_suffix(".webp")
        try:
            # 已经转过且更小就直接用（重跑时省掉一次全量转码）
            if webp.exists() and webp.stat().st_size < old * 0.98:
                converted[rel] = (old, webp.stat().st_size)
                new_total += webp.stat().st_size
                continue
            with Image.open(p) as im:
                im.load()
                w, h = im.size
                scale = min(1.0, MAX_EDGE / max(w, h))
                if scale < 1.0:
                    im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
                if im.mode not in ("RGB", "RGBA"):
                    im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
                im.save(webp, "WEBP", quality=QUALITY, method=6)
            new = webp.stat().st_size
        except Exception as e:
            print(f"  ✗ 转码失败（保留原图与原引用）{rel}: {e}")
            new_total += old
            continue
        if new < old * 0.98:
            converted[rel] = (old, new)
            new_total += new
        else:
            webp.unlink(missing_ok=True)     # 没更小就别留，免得引用换成更大的
            new_total += old
    print(f"  可替换 {len(converted)} 张｜保持原样 {len(files) - len(converted)} 张")
    print(f"  体积：{human(old_total)} → {human(new_total)}（省 {human(old_total - new_total)}，{(1 - new_total / max(1, old_total)) * 100:.1f}%）")

    # 精确改写：完整路径（长 → 短）。
    # ⚠️ 上一版还有一步"按文件名兜底替换"，结果把**未转换**的同名文件（例如 thumbs/ 下转了、
    #    正图没转）也改成了 .webp，造成 44 处指向不存在的文件、自检掉到 210/212。
    #    现在只在**无歧义**时按文件名替换：该文件名只对应一个转换结果，且没有同名文件被保留。
    full_pairs = sorted(((k, re.sub(r"\.(jpg|jpeg|png)$", ".webp", k, flags=re.I)) for k in converted), key=lambda x: -len(x[0]))
    kept_bases = {Path(p.relative_to(ROOT).as_posix()).name.lower() for p in files if p.relative_to(ROOT).as_posix() not in converted}
    by_base = {}
    for k in converted:
        by_base.setdefault(Path(k).name.lower(), set()).add(re.sub(r"\.(jpg|jpeg|png)$", ".webp", Path(k).name, flags=re.I))
    ambiguous = {b for b, v in by_base.items() if len(v) != 1 or b in kept_bases}
    changed = []
    for tf in tfiles:
        raw = tf.read_text(encoding="utf-8")
        before = raw
        # 先把**完整路径**换掉（这一步永远是精确的）
        for a, b in full_pairs:
            if a in raw:
                raw = raw.replace(a, b)
        # 再处理"只写文件名"的情形：只在该文件名无歧义、且它此刻**不是**完整路径的一部分时
        if tf.suffix == ".json":
            def repl(m):
                s = m.group(0)
                if "/" in s:                       # 带目录的一律交给上面的完整路径替换，别在这里动
                    return s
                name = Path(s).name
                if name.lower() in ambiguous:
                    return s
                repl_set = by_base.get(name.lower())
                if not repl_set:
                    return s
                return s[: len(s) - len(name)] + sorted(repl_set)[0]
            raw = re.sub(r"[\w.-]+\.(?:jpg|jpeg|png)", repl, raw, flags=re.I)
        if raw != before:
            tf.write_text(raw, encoding="utf-8")
            changed.append(tf.relative_to(ROOT).as_posix())
    print(f"  改写引用的文件（{len(changed)}）：{', '.join(changed) if changed else '（无）'}")
    return converted


def phase_check():
    converted = [p for p in IMG.rglob("*.webp")]
    left_refs, missing, dangling = [], [], []
    for tf in text_files():
        raw = tf.read_text(encoding="utf-8")
        for m in RE_ASSETS_REF.finditer(raw):
            left_refs.append(f"{tf.relative_to(ROOT).as_posix()}: {m.group(0)}")
            if not (ROOT / m.group(0)).exists():
                dangling.append(m.group(0))       # 指向 jpg 但文件已被删 = 真裂图
        for m in re.finditer(r"assets/img/[^\s\"'`)\]]+\.webp", raw):
            if not (ROOT / m.group(0)).exists():
                missing.append(m.group(0))
    originals = images()
    print(f"  webp 文件 {len(converted)} 个｜仍保留的原图 {len(originals)} 个")
    print(f"  仍指向 jpg/png 的引用：{len(left_refs)} 处（多为'转了但没更小'的图，属正常）")
    print(f"  ⚠️ 指向已不存在的 jpg/png（真裂图）：{len(set(dangling))} 处" + (f"（{'; '.join(sorted(set(dangling))[:3])}）" if dangling else " ✓"))
    print(f"  ⚠️ 引用了但不存在的 webp：{len(set(missing))} 处" + (f"（{'; '.join(sorted(set(missing))[:3])}）" if missing else " ✓"))
    return len(set(dangling)), len(set(missing))


def phase_delete():
    files = images()
    ok, failed, skipped = 0, [], 0
    for p in files:
        webp = p.with_suffix(".webp")
        if not webp.exists() or webp.stat().st_size >= p.stat().st_size * 0.98:
            skipped += 1                       # 没转成功/没更小 → 原图必须留着
            continue
        try:
            os.chmod(p, stat.S_IWRITE)         # 先清只读属性（上一版就是卡在这里）
            p.unlink()
            ok += 1
        except Exception as e:
            failed.append(f"{p.relative_to(ROOT).as_posix()}（{type(e).__name__}: {e}）")
    print(f"  删除原图 {ok} 张｜保留（未转成功/未更小）{skipped} 张｜删除失败 {len(failed)} 张")
    for x in failed[:10]:
        print(f"    ✗ {x}")
    if failed:
        print("  说明：这些原图只是没删掉（多占空间），引用已指向 webp，站点不受影响；占用解除后可重跑本阶段。")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase", choices=["convert", "check", "delete"], required=True)
    args = ap.parse_args()
    if args.phase == "convert":
        phase_convert()
    elif args.phase == "check":
        phase_check()
    else:
        phase_delete()


if __name__ == "__main__":
    main()
