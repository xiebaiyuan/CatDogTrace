"""把一张 4x3 的网格图切成 24 个品种头像（每个 128px，不透明方图）。

用法：

    python3 slice_breed_avatars.py --sheet sheet-dogs.png --family dog

## 为什么不做透明抠图

这套插画是扁平矢量风，动物身上的浅色部位（口鼻、胸口、白毛）**与背景是同一个米色**。
任何基于颜色的背景移除都会把这些部位一起挖掉——实测萨摩耶、波斯、布偶都会变成虫蛀状。
所以这里只做两件事：按内容包围盒裁剪，再放到同色方形画布上居中。画师的每一笔原样保留。

代价是头像带一块米色底。这在浅色页面上与页面底色几乎融合；在深色主题下是一块可见的方片，
配 CSS 圆角就是一个正常的产品头像块，不是瑕疵。

## 顺序

品种顺序必须与出图提示词一致，且与指纹库名册对齐（脚本会校验，名册对不上直接拒绝运行）。
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

PROJECT = Path(__file__).resolve().parent
BANK_PATH = PROJECT / "data" / "unified_bank.json"
DEFAULT_OUT = PROJECT / "static" / "assets" / "breeds"

FAMILY_ORDER = {
    "dog": [
        "husky", "labrador", "schnauzer", "corgi",
        "golden-retriever", "border-collie", "shiba", "samoyed",
        "alaskan-malamute", "beagle", "poodle", "bulldog",
    ],
    "cat": [
        "ragdoll", "siamese", "orange-tabby", "british-shorthair",
        "maine-coon", "persian", "american-shorthair", "russian-blue",
        "scottish-fold", "sphinx", "bengal", "norwegian-forest",
    ],
}


def bank_ids() -> list[str]:
    return [model["id"] for model in json.loads(BANK_PATH.read_text(encoding="utf-8"))["models"]]


def corner_color(cell: Image.Image) -> tuple[int, int, int]:
    """四角各取 8x8 中位色：出图工具给的底色每次差几个色阶，取样比写死稳。"""
    width, height = cell.size
    patches = []
    for x, y in ((0, 0), (width - 8, 0), (0, height - 8), (width - 8, height - 8)):
        patch = cell.crop((x, y, x + 8, y + 8)).convert("RGB")
        pixels = sorted((patch.getpixel((px, py)) for py in range(8) for px in range(8)), key=sum)
        patches.append(pixels[len(pixels) // 2])
    return max(set(patches), key=patches.count)


def content_box(cell: Image.Image, background: tuple[int, int, int], tolerance: int) -> tuple[int, int, int, int]:
    """找出与背景不同的像素的包围盒。这里判错只会多裁或少裁一点边，不会挖掉身体。"""
    rgb = cell.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()
    left, top, right, bottom = width, height, -1, -1
    for y in range(height):
        for x in range(width):
            r, g, b = pixels[x, y]
            if (abs(r - background[0]) > tolerance
                    or abs(g - background[1]) > tolerance
                    or abs(b - background[2]) > tolerance):
                if x < left:
                    left = x
                if x > right:
                    right = x
                if y < top:
                    top = y
                if y > bottom:
                    bottom = y
    if right < 0:
        return (0, 0, width, height)
    return (left, top, right + 1, bottom + 1)


def fit_square(cut: Image.Image, size: int, pad: float, background: tuple[int, int, int]) -> Image.Image:
    """等比重排进方形画布，居中，四周留 pad 比例。画布用该格的背景色，输出不透明。"""
    inner = max(1, int(round(size * (1 - 2 * pad))))
    scale = min(inner / cut.width, inner / cut.height)
    scaled = cut.resize((max(1, int(round(cut.width * scale))),
                         max(1, int(round(cut.height * scale)))), Image.LANCZOS)
    canvas = Image.new("RGB", (size, size), background)
    canvas.paste(scaled, ((size - scaled.width) // 2, (size - scaled.height) // 2))
    return canvas


def contact_sheet(tiles: list[tuple[str, Image.Image]], size: int, columns: int) -> Image.Image:
    rows = (len(tiles) + columns - 1) // columns
    gap = max(2, size // 16)
    width = columns * size + (columns + 1) * gap
    height = rows * size + (rows + 1) * gap
    sheet = Image.new("RGB", (width, height), (250, 248, 244))
    for index, (_name, tile) in enumerate(tiles):
        row, column = divmod(index, columns)
        sheet.paste(tile, (gap + column * (size + gap), gap + row * (size + gap)))
    return sheet


def main() -> None:
    parser = argparse.ArgumentParser(description="把网格头像图切成每个品种一张")
    parser.add_argument("--sheet", required=True, type=Path)
    parser.add_argument("--family", required=True, choices=sorted(FAMILY_ORDER))
    parser.add_argument("--rows", type=int, default=3)
    parser.add_argument("--cols", type=int, default=4)
    parser.add_argument("--size", type=int, default=128)
    parser.add_argument("--pad", type=float, default=0.04)
    parser.add_argument("--tolerance", type=int, default=10)
    parser.add_argument("--colors", type=int, default=64,
                        help="调色板色数：扁平插画 64 色几乎无损，体积约为真彩的四成")
    parser.add_argument("--outdir", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    order = FAMILY_ORDER[args.family]
    if len(order) != args.rows * args.cols:
        raise SystemExit(f"{args.family} 名册有 {len(order)} 个，"
                         f"{args.rows}x{args.cols} = {args.rows * args.cols} 格，对不上。")
    known = bank_ids()
    unknown = [name for name in order if name not in known]
    if unknown:
        raise SystemExit(f"这些品种在指纹库里找不到：{unknown}")

    sheet = Image.open(args.sheet).convert("RGB")
    cell_width = sheet.width / args.cols
    cell_height = sheet.height / args.rows
    args.outdir.mkdir(parents=True, exist_ok=True)

    tiles: list[tuple[str, Image.Image]] = []
    for index, name in enumerate(order):
        row, column = divmod(index, args.cols)
        box = (int(round(column * cell_width)), int(round(row * cell_height)),
               int(round((column + 1) * cell_width)), int(round((row + 1) * cell_height)))
        cell = sheet.crop(box)
        background = corner_color(cell)
        cut = cell.crop(content_box(cell, background, args.tolerance))
        tile = fit_square(cut, args.size, args.pad, background)
        # 量化 + optimize：24 张从 502KB 压到约 190KB，离线单文件内联得起。
        saved = tile.quantize(colors=args.colors, method=Image.MEDIANCUT, dither=Image.NONE)
        saved.save(args.outdir / f"{name}.png", optimize=True)
        tiles.append((name, tile))
        print(f"{name:20s} <- cell {index + 1:2d}  bg={background}  "
              f"content={cut.width}x{cut.height}  -> {name}.png")

    preview = args.outdir.parent / f"breeds-preview-{args.family}.png"
    contact_sheet(tiles, args.size, args.cols).save(preview)
    print(f"\n{len(tiles)} 张已写入 {args.outdir}")
    print(f"拼版预览：{preview}")


if __name__ == "__main__":
    main()
