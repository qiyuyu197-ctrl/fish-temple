#!/usr/bin/env python3
"""
tools/make-brand.py — 从品牌原图生成站内用到的整套图标
==================================================================
站点没有图形处理依赖（浏览器里只有 canvas），所以品牌图这块用项目自带的
Python + Pillow 生成，产物直接提交进 assets/icons/，浏览器只负责显示。

用法：
    python tools/make-brand.py                      # 用默认原图和裁切
    python tools/make-brand.py --src 新图.jpg --box 647,47,1407,807

产出：
    assets/icons/mark-512.png          母版（开机画面等大尺寸用）
    assets/icons/mark-64.png           顶栏 32px / 页脚 22px 用
    assets/icons/favicon-32.png        浏览器页签（墨色底 + 留白 2px）
    assets/icons/apple-touch-icon.png  iOS 主屏图标 180（墨色底 + 留白 12px）

裁切坐标是在 2109x1850 的原图上量出来的：标记取「头 + 肩胸」那一块（只露一颗头
看着很怪），页签另取更紧的「脸」，让 32px 的顶栏标记和 16px 的页签都还认得出。
"""
import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageOps

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parent.parent
INK = (18, 19, 22)          # --ink-100，和站内令牌一致

DEFAULT_SRC = ROOT / 'assets' / 'img' / 'brand' / 'source.jpg'
DEFAULT_BOX = (560, 170, 1500, 1150)        # 头 + 肩胸（正方形 940x940）：顶栏/页脚/开机画面用
DEFAULT_ICON_BOX = (747, 200, 1307, 760)    # 更紧的「脸」：16px 的页签只有用这个才看得出是张画


def artwork(src: Path, box, size: int, boost: float = 1.45) -> Image.Image:
    """裁成正方形、缩到目标尺寸，并提一点对比度（线稿很浅，小尺寸会糊）"""
    im = Image.open(src).convert('RGB')
    crop = im.crop(box).resize((size, size), Image.LANCZOS)
    crop = ImageOps.autocontrast(crop, cutoff=1)
    return ImageEnhance.Contrast(crop).enhance(boost)


def framed(src: Path, box, size: int, pad: int, boost: float = 1.45) -> Image.Image:
    """墨色底 + 留白的方图标（页签 / 主屏图标用：白色线稿直接放页签会糊成一块白）"""
    canvas = Image.new('RGB', (size, size), INK)
    art = artwork(src, box, size - pad * 2, boost)
    canvas.paste(art, (pad, pad))
    return canvas


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=str(DEFAULT_SRC))
    ap.add_argument('--box', default=','.join(str(v) for v in DEFAULT_BOX),
                    help='标记的裁切框 x1,y1,x2,y2（原图像素）')
    ap.add_argument('--icon-box', default=','.join(str(v) for v in DEFAULT_ICON_BOX),
                    help='页签/主屏图标的裁切框（一般比标记更紧一点）')
    ap.add_argument('--out', default=str(ROOT / 'assets' / 'icons'))
    args = ap.parse_args()

    src = Path(args.src)
    if not src.exists():
        print(f'找不到原图：{src}')
        return 1
    box = tuple(int(v) for v in args.box.split(','))
    icon_box = tuple(int(v) for v in args.icon_box.split(','))
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    jobs = [
        ('mark-512.png', artwork(src, box, 512)),
        ('mark-64.png', artwork(src, box, 64)),
        ('favicon-32.png', framed(src, icon_box, 32, 2)),
        ('apple-touch-icon.png', framed(src, icon_box, 180, 12)),
    ]
    for name, img in jobs:
        p = out / name
        img.save(p, 'PNG', optimize=True)
        print(f'{p.relative_to(ROOT)}  {img.size[0]}x{img.size[1]}  {p.stat().st_size / 1024:.1f} KB')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
