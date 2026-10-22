#!/usr/bin/env python3
"""
tools/optimize-covers.py — 压缩文娱板块的本地封面
------------------------------------------------------------------
fetch-covers.mjs 下载的是 AniList 的原图（有的 84KB，有的 200KB+），
这里统一转成渐进式 JPEG（宽 460，质量 84），顺手把 PNG 转成 JPG，
并回写 data/anime-covers.json 里的 bytes 字段。

用法：
  python tools/optimize-covers.py
  python tools/optimize-covers.py --quality 86 --width 520

依赖：Pillow（和 tools/album-build.py、tools/shrink-images.py 同一套开发依赖）。
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
COVER_DIR = ROOT / "assets" / "leisure" / "covers"
MAP_FILE = ROOT / "data" / "anime-covers.json"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quality", type=int, default=84)
    ap.add_argument("--width", type=int, default=460, help="最大宽度像素（不放大）")
    ap.add_argument("--force", action="store_true", help="已优化过的文件也重新编码")
    args = ap.parse_args()

    cover_dir = COVER_DIR
    files = sorted(
        p for p in cover_dir.iterdir()
        if p.suffix.lower() in {".jpg", ".jpeg", ".png"} and not p.name.startswith("_")
    )
    total_before = sum(p.stat().st_size for p in files)
    written: dict[str, int] = {}

    for src in files:
        target = src.with_suffix(".jpg")
        # 已经压过、宽度也够的 JPG 不再二次编码（避免每季掉一次画质）。
        if (
            not args.force
            and src.suffix.lower() in {".jpg", ".jpeg"}
            and src.stat().st_size <= 160_000
        ):
            with Image.open(src) as im:
                if im.width <= args.width:
                    written[target.name] = src.stat().st_size
                    continue
        with Image.open(src) as im:
            im = im.convert("RGB")
            w, h = im.size
            if w > args.width:
                im = im.resize((args.width, max(1, round(h * args.width / w))), Image.LANCZOS)
            tmp = target.with_suffix(".tmp.jpg")
            im.save(tmp, "JPEG", quality=args.quality, optimize=True, progressive=True)
        if src != target:
            src.unlink()
        tmp.replace(target)
        written[target.name] = target.stat().st_size

    total_after = sum(written.values())
    print(f"{len(files)} covers · {total_before / 1024:.0f} KB → {total_after / 1024:.0f} KB")

    if MAP_FILE.exists():
        data = json.loads(MAP_FILE.read_text(encoding="utf-8"))
        for item in data.get("items", {}).values():
            name = Path(item.get("cover", "")).name
            if name in written:
                item["bytes"] = written[name]
        MAP_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"updated {MAP_FILE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
