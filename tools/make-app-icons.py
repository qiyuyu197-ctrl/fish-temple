#!/usr/bin/env python3
"""
tools/make-app-icons.py — 生成 PWA 与 Android 需要的图标
==================================================================
站内图标（make-brand.py）只覆盖了页签 / 顶栏 / 苹果主屏这三档；
装成 App 之后 Android 与 PWA 安装面板还要另外几档，所以单独放一个脚本，
产物同样直接提交进仓库，运行时不做任何图像处理。

用法：
    python tools/make-app-icons.py

产出：
    assets/icons/icon-192.png            PWA 安装条件里的 192×192
    assets/icons/icon-512-maskable.png   Android 自适应图标的 80% 安全区内构图
    app/android/app/src/main/res/**      各密度的 ic_launcher / ic_launcher_round
    app/android/app/src/main/res/drawable/ic_launcher_foreground.png
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'assets' / 'icons' / 'mark-512.png'
INK = (18, 19, 22)          # 和 styles/tokens.css 的 --ink-100 一致

# Android 各密度启动图标边长（48dp 基准）
DENSITIES = {
    'mdpi': 48,
    'hdpi': 72,
    'xhdpi': 96,
    'xxhdpi': 144,
    'xxxhdpi': 192,
}


def square(art: Image.Image, size: int, pad_ratio: float = 0.0, bg=INK) -> Image.Image:
    """把方形插画放进 size×size 的底板上，四周留 pad_ratio 比例的空白"""
    inner = max(1, int(round(size * (1 - pad_ratio * 2))))
    canvas = Image.new('RGB', (size, size), bg)
    canvas.paste(art.resize((inner, inner), Image.LANCZOS), ((size - inner) // 2,) * 2)
    return canvas


def rounded(img: Image.Image, radius_ratio: float = 0.22) -> Image.Image:
    """圆角遮罩（老版本 Android 的 legacy 图标用）"""
    size = img.size[0]
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size - 1, size - 1), radius=int(size * radius_ratio), fill=255)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(img.convert('RGBA'), (0, 0), mask)
    return out


def circle(img: Image.Image) -> Image.Image:
    size = img.size[0]
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(img.convert('RGBA'), (0, 0), mask)
    return out


def main() -> int:
    if not ART.exists():
        print(f'找不到品牌母版：{ART}')
        return 1
    art = Image.open(ART).convert('RGB')
    # 统一裁成正方形（母版本来就是 1:1，这里只防手滑）
    side = min(art.size)
    art = art.crop(((art.width - side) // 2, (art.height - side) // 2,
                    (art.width + side) // 2, (art.height + side) // 2))

    icons = ROOT / 'assets' / 'icons'
    jobs = [
        ('icon-192.png', square(art, 192)),
        # maskable：视觉主体压到中心 80%，被裁成圆形也不会切到脸
        ('icon-512-maskable.png', square(art, 512, pad_ratio=0.12)),
    ]
    for name, img in jobs:
        img.save(icons / name, 'PNG', optimize=True)
        print(f'assets/icons/{name}  {img.size[0]}x{img.size[1]}')

    res = ROOT / 'app' / 'android' / 'app' / 'src' / 'main' / 'res'
    for density, size in DENSITIES.items():
        d = res / f'mipmap-{density}'
        d.mkdir(parents=True, exist_ok=True)
        icon = square(art, size)
        icon.save(d / 'ic_launcher.png', 'PNG', optimize=True)
        rounded(icon).save(d / 'ic_launcher_round.png', 'PNG', optimize=True)
        print(f'app/android/.../mipmap-{density}/ic_launcher.png  {size}x{size}')

    # 自适应图标的前景层：108dp 画布，内容只占中间 66dp（安全区），背景用纯色
    fg_size = 432                      # 108dp @ xxxhdpi
    fg = Image.new('RGBA', (fg_size, fg_size), (0, 0, 0, 0))
    inner = int(fg_size * 66 / 108)
    art_fg = art.resize((inner, inner), Image.LANCZOS)
    mask = Image.new('L', (inner, inner), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, inner - 1, inner - 1), fill=255)
    fg.paste(art_fg.convert('RGBA'), ((fg_size - inner) // 2,) * 2, mask)
    drawable = res / 'drawable'
    drawable.mkdir(parents=True, exist_ok=True)
    fg.save(drawable / 'ic_launcher_foreground.png', 'PNG', optimize=True)
    print(f'app/android/.../drawable/ic_launcher_foreground.png  {fg_size}x{fg_size}')

    # Windows 桌面版：一个多尺寸 .ico（任务栏 16 / 资源管理器 256 都要认）
    ico = ROOT / 'app' / 'desktop' / 'icon.ico'
    ico.parent.mkdir(parents=True, exist_ok=True)
    square(art, 256).save(ico, format='ICO', sizes=[(16, 16), (24, 24), (32, 32),
                                                   (48, 48), (64, 64), (128, 128), (256, 256)])
    print(f'app/desktop/icon.ico  16~256')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
