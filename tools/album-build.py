#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
tools/album-build.py — 把手机相册原图处理成站点素材
====================================================================
输入：tools/album-pull.ps1 从 iPhone 拷下来的 staging 目录（原图，可能很大）
输出：
  assets/img/album/album-001.jpg …        长边 ≤ --max-edge 的正图（灯箱用）
  assets/img/album/thumbs/album-001.jpg … 长边 ≤ --thumb-edge 的缩略图（网格用）
  data/album.json                         相册清单（含尺寸，前端据此排布）

为什么要两道尺寸：相册有 100-200 张，网格如果直接加载 1600px 的原图，
首屏要拉几十 MB；缩略图只有几十 KB，懒加载后体验差别很大。

隐私：**会剥掉所有 EXIF**（含 GPS、设备型号、拍摄参数）后再写入 JPEG，
      只保留像素。原始文件不会被改动。

用法：
  python tools/album-build.py                       # 用默认路径与参数
  python tools/album-build.py --src D:\\phone-pull --max-edge 2000 --quality 88
"""

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime

try:
    from PIL import Image, ImageOps
except ImportError:                                    # pragma: no cover
    sys.exit("需要 Pillow：请使用本项目自带的 Python 运行时运行本脚本。")

# 中文输出在 Windows 控制台默认是 GBK，容易被写成乱码；这里固定成 UTF-8
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:                                      # pragma: no cover
    pass

# ---------------------------------------------------------------- 常量

JPEG_SOI = b"\xff\xd8\xff"
PNG_SIG = b"\x89PNG\r\n\x1a\n"
FTYP_BRANDS_HEIC = {b"heic", b"heix", b"hevc", b"hevx", b"heim", b"heis",
                    b"mif1", b"msf1", b"avif", b"avis"}
FTYP_BRANDS_VIDEO = {b"qt  ", b"isom", b"mp41", b"mp42", b"3gp4", b"M4V ", b"M4A "}

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 原图暂存区：站点搬到 D 盘之后也一起搬到了 D:\ft-album-staging。
# 找不到就退回老位置（%USERPROFILE%\Downloads\ft-album-staging），两边都能跑。
DEFAULT_SRC = next(
    (p for p in (r"D:\ft-album-staging",
                 os.path.join(os.path.expanduser("~"), "Downloads", "ft-album-staging"))
     if os.path.isdir(p)),
    r"D:\ft-album-staging",
)
DEFAULT_OUT = os.path.join(ROOT, "assets", "img", "album")
DEFAULT_JSON = os.path.join(ROOT, "data", "album.json")


def sniff(path):
    """读文件头判断真实格式 —— MTP 给的扩展名经常是错的（实测有 JPEG 叫 .PNG）。"""
    with open(path, "rb") as fh:
        head = fh.read(32)
    if head.startswith(JPEG_SOI):
        return "jpeg"
    if head.startswith(PNG_SIG):
        return "png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"                                  # Pillow 原生支持，别当 unknown 跳过
    if len(head) >= 12 and head[4:8] == b"ftyp":
        brand = head[8:12]
        if brand in FTYP_BRANDS_HEIC:
            return "heif"
        if brand in FTYP_BRANDS_VIDEO:
            return "video"
        return "ftyp?"
    if head[:3] == b"GIF":
        return "gif"
    return "unknown"


def month_of(album):
    """相册分组名形如 202610_a → 2026-10"""
    m = re.match(r"^(\d{4})(\d{2})", album or "")
    return f"{m.group(1)}-{m.group(2)}" if m else ""


def main():
    ap = argparse.ArgumentParser(description="手机相册 → 站点素材")
    ap.add_argument("--src", default=DEFAULT_SRC, help="staging 目录（原图）")
    ap.add_argument("--out", default=DEFAULT_OUT, help="输出目录（默认 assets/img/album）")
    ap.add_argument("--json", default=DEFAULT_JSON, help="清单输出路径")
    ap.add_argument("--max-edge", type=int, default=1600, help="正图长边上限（默认 1600）")
    ap.add_argument("--quality", type=int, default=82, help="JPEG 质量（默认 82）")
    ap.add_argument("--thumb-edge", type=int, default=480, help="缩略图长边（默认 480）")
    ap.add_argument("--thumb-quality", type=int, default=78, help="缩略图质量（默认 78）")
    ap.add_argument("--limit", type=int, default=0, help="最多处理几张（0 = 全部）")
    ap.add_argument("--start-index", type=int, default=1, help="起始序号（默认 1）")
    args = ap.parse_args()

    if not os.path.isdir(args.src):
        sys.exit(f"源目录不存在：{args.src}\n先运行 tools/album-pull.ps1 从手机拷照片。")

    out_dir = args.out
    thumb_dir = os.path.join(out_dir, "thumbs")
    os.makedirs(thumb_dir, exist_ok=True)

    # 收集源文件：按 <相册>/<文件名> 排序 → 天然的按时间顺序
    files = []
    for album in sorted(os.listdir(args.src)):
        album_dir = os.path.join(args.src, album)
        if not os.path.isdir(album_dir):
            continue
        for name in sorted(os.listdir(album_dir)):
            p = os.path.join(album_dir, name)
            if os.path.isfile(p):
                files.append((album, name, p))

    print(f"源文件 {len(files)} 个  ← {args.src}")
    if not files:
        sys.exit("源目录里没有文件。")

    manifest = []
    seen_hash = {}
    stats = {"ok": 0, "dup": 0, "video": 0, "unsupported": 0, "corrupt": 0}
    idx = args.start_index - 1

    for album, name, path in files:
        if args.limit and stats["ok"] >= args.limit:
            break

        kind = sniff(path)
        if kind == "video":
            stats["video"] += 1
            continue
        if kind not in ("jpeg", "png", "webp"):
            # HEIF/AVIF 需要额外解码器（Pillow 默认不带），GIF 是动图，都跳过
            stats["unsupported"] += 1
            print(f"  跳过（{kind}）{album}/{name}")
            continue

        try:
            digest = hashlib.md5(open(path, "rb").read()).hexdigest()
        except OSError as exc:
            stats["corrupt"] += 1
            print(f"  读取失败 {album}/{name}: {exc}")
            continue
        if digest in seen_hash:
            stats["dup"] += 1
            print(f"  跳过（重复于 {seen_hash[digest]}）{album}/{name}")
            continue
        seen_hash[digest] = f"{album}/{name}"

        try:
            with Image.open(path) as im:
                # exif_transpose 按 EXIF 方向摆正像素，之后就不再需要 EXIF 了
                im = ImageOps.exif_transpose(im)
                if im.mode not in ("RGB", "L"):
                    im = im.convert("RGB")
                elif im.mode == "L":
                    im = im.convert("RGB")

                src_w, src_h = im.size
                idx += 1
                base = f"album-{idx:03d}"

                # 正图
                big = im.copy()
                big.thumbnail((args.max_edge, args.max_edge), Image.LANCZOS)
                big_path = os.path.join(out_dir, base + ".jpg")
                big.save(big_path, "JPEG", quality=args.quality,
                         optimize=True, progressive=True)
                # 显式不带 exif= 参数 → Pillow 不会写入任何元数据（含 GPS）

                # 缩略图
                small = im.copy()
                small.thumbnail((args.thumb_edge, args.thumb_edge), Image.LANCZOS)
                small_path = os.path.join(thumb_dir, base + ".jpg")
                small.save(small_path, "JPEG", quality=args.thumb_quality,
                           optimize=True, progressive=True)

                manifest.append({
                    "id": base,
                    "url": f"assets/img/album/{base}.jpg",
                    "thumb": f"assets/img/album/thumbs/{base}.jpg",
                    "title": os.path.splitext(name)[0],
                    "author": f"相册 · {month_of(album)}" if month_of(album) else "手机相册",
                    "album": album,
                    "width": big.size[0],
                    "height": big.size[1],
                    "srcWidth": src_w,
                    "srcHeight": src_h,
                    "bytes": os.path.getsize(big_path),
                    "thumbBytes": os.path.getsize(small_path),
                })
                stats["ok"] += 1
                if stats["ok"] % 10 == 0 or stats["ok"] == 1:
                    done_bytes = sum(m["bytes"] + m["thumbBytes"] for m in manifest)
                    print(f"  已处理 {stats['ok']} 张  {done_bytes/1024/1024:.1f}MB  ({base})")
        except Exception as exc:                        # noqa: BLE001
            stats["corrupt"] += 1
            print(f"  处理失败 {album}/{name}: {exc}")

    payload = {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "maxEdge": args.max_edge,
        "quality": args.quality,
        "count": len(manifest),
        "items": manifest,
    }
    os.makedirs(os.path.dirname(args.json), exist_ok=True)
    with open(args.json, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    total = sum(m["bytes"] + m["thumbBytes"] for m in manifest)
    print("\n================ 汇总 ================")
    print(f"  处理成功  {stats['ok']} 张")
    print(f"  跳过重复  {stats['dup']} 张")
    print(f"  跳过视频  {stats['video']} 个")
    print(f"  不支持格式 {stats['unsupported']} 张（HEIF/AVIF/GIF 等，需要额外解码器）")
    print(f"  损坏/失败 {stats['corrupt']} 张")
    print(f"  产出体积  {total/1024/1024:.1f}MB（正图 + 缩略图）")
    print(f"  清单      {args.json}")
    if stats["unsupported"]:
        print("\n提示：iPhone 默认用 HEIC 拍摄。本次拷下来的是可解码的 JPEG/PNG，")
        print("      若出现大量 HEIF，请在 设置 → 相机 → 格式 里改成「兼容性最佳」后重拷。")


if __name__ == "__main__":
    main()
