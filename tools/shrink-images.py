#!/usr/bin/env python3
"""
tools/shrink-images.py — 图片瘦身体检 / 压缩（一次性工具，不参与站点运行）
================================================================================
背景：仓库里 assets/img 有 1500+ 张图、约 177 MB，占了站点体积的 99.5%。
      Netlify 的额度（新 Free 计划是每月 300 积分）跟"部署体积 + 带宽"直接相关，
      所以图片瘦身 = 直接省额度，同时也让首屏更快。

默认只做**体检**（不写任何文件），会分别估算两条路线的收益：
  A) 原地重编码 JPEG：只改像素，**文件名/路径完全不变** → 零风险，引用不用改
  B) 转 WebP：更小，但**要改引用**（data/*.json、HTML、CSS、JS 里的图片路径都要跟着换）

用法：
  python tools/shrink-images.py                     # 体检（抽样 40 张外推全量）
  python tools/shrink-images.py --sample 120        # 多抽一些，估算更准
  python tools/shrink-images.py --write --mode jpeg # 真的原地压（先 git 提交当前状态！）
  python tools/shrink-images.py --write --mode webp # 转 WebP（还要再改引用，脚本会提示）

安全提示：--write 会**覆盖** assets/img 下的图片。跑之前务必先 commit，
         这样不满意可以直接 `git checkout -- assets/img` 回滚。
================================================================================
"""

import argparse
import io
import os
import random
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("需要 Pillow：pip install Pillow（本项目用的是内置运行时自带的 Pillow）")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
IMG_DIR = ROOT / "assets" / "img"
EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def human(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:,.1f} {unit}" if unit != "B" else f"{n:,.0f} B"
        n /= 1024


def collect():
    out = []
    for p in IMG_DIR.rglob("*"):
        if p.is_file() and p.suffix.lower() in EXTS and p.stat().st_size > 0:
            out.append(p)
    return out


def encode(img, mode, max_edge, quality):
    """返回编码后的字节数（不落盘）"""
    w, h = img.size
    scale = min(1.0, max_edge / max(w, h)) if max_edge else 1.0
    if scale < 1.0:
        img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
    buf = io.BytesIO()
    if mode == "webp":
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
        img.save(buf, "WEBP", quality=quality, method=6)
    elif mode == "png":
        img.save(buf, "PNG", optimize=True)
    else:
        if img.mode != "RGB":
            img = img.convert("RGB")
        img.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
    return buf.tell()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=40)
    ap.add_argument("--max-edge", type=int, default=1600)
    ap.add_argument("--quality", type=int, default=82)
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--mode", choices=["jpeg", "webp", "png"], default="jpeg")
    args = ap.parse_args()

    files = collect()
    if not files:
        print(f"没找到图片（{IMG_DIR}）")
        return
    total = sum(p.stat().st_size for p in files)
    print(f"图片 {len(files)} 张 · 现在共 {human(total)} · 上限 {args.max_edge}px · 质量 {args.quality}")
    if args.write:
        print(f"⚠️  即将**原地写入**（模式 {args.mode}）—— 确认你已经 commit 过当前状态")

    random.seed(20261010)
    sample = random.sample(files, min(args.sample, len(files)))
    rows = []
    for p in sample:
        try:
            with Image.open(p) as im:
                im.load()
                orig = p.stat().st_size
                if args.write:
                    new = encode(im, args.mode, args.max_edge, args.quality)
                    if args.mode == "webp":
                        print(f"  跳过写入：webp 会改扩展名，需要同时改引用（这一步先手动做）: {p.name}")
                        continue
                    # 只有真的更小才覆盖，避免"越压越大"
                    if new < orig * 0.98:
                        im2 = im.convert("RGB") if args.mode == "jpeg" and im.mode != "RGB" else im
                        w, h = im2.size
                        scale = min(1.0, args.max_edge / max(w, h))
                        if scale < 1.0:
                            im2 = im2.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
                        im2.save(p, "JPEG", quality=args.quality, optimize=True, progressive=True)
                        rows.append((p, orig, new))
                    else:
                        rows.append((p, orig, orig))
                else:
                    rows.append((p, orig, encode(im, args.mode, args.max_edge, args.quality)))
        except Exception as e:
            print(f"  跳过 {p.name}: {e}")

    if not rows:
        print("没有可统计的样本")
        return
    o = sum(r[1] for r in rows)
    n = sum(r[2] for r in rows)
    ratio = n / o if o else 1
    print(f"\n样本 {len(rows)} 张：{human(o)} → {human(n)}（{(1 - ratio) * 100:.1f}% 省下）")
    print(f"外推全量：{human(total)} → {human(total * ratio)}（预计省 {human(total - total * ratio)}）")
    print("\n最该处理的 10 张（按现在体积）：")
    for p, ob, _ in sorted(rows, key=lambda r: -r[1])[:10]:
        rel = p.relative_to(ROOT).as_posix()
        print(f"  {human(ob):>10}  {rel}")
    if args.mode == "webp" and not args.write:
        print("\n注：走 WebP 的话还要把 data/*.json、HTML/CSS/JS 里的图片引用一起改（脚本会另给一步）")


if __name__ == "__main__":
    main()
