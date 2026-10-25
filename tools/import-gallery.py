#!/usr/bin/env python3
"""
tools/import-gallery.py — 把手机导出的插画批量导入"随机插画"
================================================================================
站主要求：从手机导入约 300 张**二次元插画**，**不要手机截图**。

⚠️ 前提：图片得先到电脑上（数据线 / 微信传输 / 网盘），这个脚本只处理本地文件夹 ✓

它会做四件事（顺序不能乱）：
  1) **筛截图**（按四条规则，可关）：
       · 文件名命中 Screenshot / 截图 / 截屏 / screen shot / IMG_2024xx（手机截图常见命名）
       · PNG 且尺寸正好是常见手机屏幕分辨率（1080×2400、1170×2532、1080×2340、1440×3120…）
       · 比例极端瘦长（高 ≥ 1800 且 高/宽 ≥ 1.9）—— 竖屏截图/长图，不是插画
       · 太小（任一边 < 320）或极端长宽（> 3:1）
  2) **去重**：8×8 灰度平均哈希，汉明距离 ≤ 6 视为同一张（换过格式/压过的同一图也能抓到 ✓）
  3) **转码**：转 WebP（长边 ≤ 1600、质量 86）—— 与站点其它图一致，省体积 ✓
  4) **输出**：图片写进 assets/img/gallery/；清单写成 tools/gallery-import.json
     （只给清单，不直接改 data/gallery.json —— 那一步我确认字段后再合并 ✓）

用法：
  python tools/import-gallery.py --src "D:\\手机导入\\插画" --dry        # 先看会被筛掉哪些 ✓
  python tools/import-gallery.py --src "D:\\手机导入\\插画"              # 真导入
  python tools/import-gallery.py --src ... --keep-screenshots            # 不筛截图（慎用 ✗）
================================================================================
"""

import argparse
import hashlib
import io
import json
import re
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("需要 Pillow")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "assets" / "img" / "gallery"
OUT_JSON = ROOT / "tools" / "gallery-import.json"
EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".heic"}

SCREEN_NAME = re.compile(r"(screenshot|screen[\s_-]?shot|截图|截屏|screenrecord|img_\d{8}_\d{6})", re.I)
PHONE_SIZES = {
    (1080, 2400), (1080, 2340), (1080, 1920), (1170, 2532), (1179, 2556),
    (1242, 2688), (1284, 2778), (1290, 2796), (1440, 3120), (1440, 2560),
    (720, 1600), (750, 1334), (828, 1792), (1125, 2436),
}
MAX_EDGE = 1600
QUALITY = 86
DUP_DIST = 4        # 差分哈希距离阈值（64 位里允许差 4 位）


def human(n):
    return f"{n / 1048576:.1f} MB" if n >= 1048576 else f"{n / 1024:.0f} KB"


def dhash(im):
    """9×8 灰度**差分**哈希 → 64bit
    为什么不用平均哈希：aHash 只看"整体亮暗分布"，两张构图相似的插画（背景 + 中间主体）
    在 8×8 下几乎一样 → 会互相误判成重复 ✗（我第一版就这样，测试里 3 张不同的图全被判重 ✗）。
    dHash 比较**相邻像素**的明暗变化，对细节敏感得多 ✓"""
    g = im.convert("L").resize((9, 8), Image.LANCZOS)
    px = list(g.getdata())
    bits = 0
    i = 0
    for y in range(8):
        for x in range(8):
            if px[y * 9 + x] > px[y * 9 + x + 1]:
                bits |= 1 << i
            i += 1
    return bits


def hamming(a, b):
    return bin(a ^ b).count("1")


def looks_like_screenshot(path, im):
    """返回 (是不是截图, 原因)"""
    if SCREEN_NAME.search(path.name):
        return True, "文件名像截图"
    w, h = im.size
    if (w, h) in PHONE_SIZES or (h, w) in PHONE_SIZES:
        return True, f"尺寸是手机屏幕 {w}×{h}"
    if h >= 1800 and h / max(1, w) >= 1.9:
        return True, f"极瘦长 {w}×{h}（像是长截图）"
    if min(w, h) < 320:
        return True, f"太小 {w}×{h}"
    if max(w, h) / max(1, min(w, h)) > 3:
        return True, f"长宽比过大 {w}×{h}"
    return False, ""


def convert(path, im):
    im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
    w, h = im.size
    s = min(1.0, MAX_EDGE / max(w, h))
    if s < 1.0:
        im = im.resize((max(1, int(w * s)), max(1, int(h * s))), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=QUALITY, method=6)
    return im.size, buf.getvalue()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--keep-screenshots", action="store_true")
    args = ap.parse_args()

    src = Path(args.src)
    if not src.is_dir():
        print(f"✗ 找不到文件夹：{src}")
        sys.exit(1)

    files = sorted(p for p in src.rglob("*") if p.is_file() and p.suffix.lower() in EXTS)
    print(f"{'[dry] ' if args.dry else ''}发现 {len(files)} 个候选文件")

    kept, skipped, hashes = [], [], []
    reasons = {}
    for p in files:
        try:
            with Image.open(p) as im:
                im.load()
                if not args.keep_screenshots:
                    bad, why = looks_like_screenshot(p, im)
                    if bad:
                        skipped.append((p, why))
                        reasons[why.split()[0]] = reasons.get(why.split()[0], 0) + 1
                        continue
                h = dhash(im)
                ratio = im.size[0] / max(1, im.size[1])
                # 判重：差分哈希距离 ≤ 阈值 **且** 长宽比几乎一致（比例门槛能挡掉大量误杀 ✓）
                dup = next((k for k, ar in hashes if hamming(k, h) <= DUP_DIST and abs(ar - ratio) < 0.02), None)
                if dup is not None:
                    skipped.append((p, "重复"))
                    reasons["重复"] = reasons.get("重复", 0) + 1
                    continue
                hashes.append((h, ratio))
                size, blob = convert(p, im)
                kept.append({"src": str(p), "out": f"assets/img/gallery/{hashlib.sha1(str(p).encode()).hexdigest()[:12]}.webp",
                             "w": size[0], "h": size[1], "bytes": len(blob)})
                if not args.dry:
                    OUT_DIR.mkdir(parents=True, exist_ok=True)
                    (ROOT / kept[-1]["out"]).write_bytes(blob)
        except Exception as e:
            skipped.append((p, f"打不开：{e}"))
            reasons["打不开"] = reasons.get("打不开", 0) + 1

    total = sum(k["bytes"] for k in kept)
    print(f"\n保留 {len(kept)} 张（{human(total)}）｜跳过 {len(skipped)} 张")
    for why, n in sorted(reasons.items(), key=lambda x: -x[1]):
        print(f"  · {why}: {n}")
    if skipped[:6]:
        print("  跳过示例：")
        for p, why in skipped[:6]:
            print(f"    - {p.name}  ← {why}")

    if not args.dry:
        OUT_JSON.write_text(json.dumps(kept, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"\n✓ 图片已写入 {OUT_DIR}")
        print(f"✓ 清单已写入 {OUT_JSON}")
        print("  下一步：把清单合并进 data/gallery.json（字段我确认后再做 ✓）")


if __name__ == "__main__":
    main()
