"""把一张网格图切成每个品种一张方形头像。

用法：

    python3 slice_breed_avatars.py --sheet sheet-dogs.png --family dog
    python3 slice_breed_avatars.py --sheet sheet-cats.png --family cat

默认把结果写进 static/assets/breeds/<品种 id>.png，同时输出一张拼版预览，
方便一眼看出哪格切歪了。

切法：
1. 按 --rows / --cols 均分网格，不依赖图上任何分隔线。
2. 每格用四角取样估背景色，把与背景接近的像素当透明，裁到内容包围盒。
3. 内容等比重排进 size×size 的方形画布，居中，四周留 --pad 比例的呼吸位。
4. 输出带 alpha 的 PNG，网页与插件都能跟着页面主题走。

为什么不用固定背景色写死：出图工具每次给的底色可能差几个色阶，四角取样能自适应。
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

PROJECT = Path(__file__).resolve().parent
BANK_PATH = PROJECT / "data" / "unified_bank.json"
DEFAULT_OUT = PROJECT / "static" / "assets" / "breeds"

# 品种名册的唯一事实源是指纹库，不是这个脚本。切图顺序必须与出图提示词里的顺序一致。
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
    """指纹库里的全部品种 id，用来拒绝写错品种名。"""
    return [model["id"] for model in json.loads(BANK_PATH.read_text(encoding="utf-8"))["models"]]


def corner_color(cell: Image.Image) -> tuple[int, int, int]:
    """四角各取 8x8 中位色，返回出现最多的那个：出图工具偶尔在角上留一点噪点。"""
    width, height = cell.size
    corners = []
    for x, y in ((0, 0), (width - 9, 0), (0, height - 9), (width - 9, height - 9)):
        patch = cell.crop((x, y, x + 8, y + 8)).convert("RGB")
        # 逐像素读，不用 getdata()：Pillow 12 起它被弃用，8x8 的循环代价可以忽略。
        pixels = sorted((patch.getpixel((px, py)) for py in range(8) for px in range(8)),
                        key=sum)
        corners.append(pixels[len(pixels) // 2])
    return max(set(corners), key=corners.count)


def cut_out(cell: Image.Image, tolerance: int) -> Image.Image:
    """把背景变透明并裁到内容包围盒。"""
    rgb = cell.convert("RGB")
    background = corner_color(rgb)
    mask = Image.new("L", rgb.size, 0)
    source = rgb.load()
    target = mask.load()
    width, height = rgb.size
    for y in range(height):
        for x in range(width):
            pixel = source[x, y]
            distance = max(abs(pixel[0] - background[0]),
                           abs(pixel[1] - background[1]),
                           abs(pixel[2] - background[2]))
            # 与背景差距超过容差的算内容；太小会把抗锯齿边留下，太大会吃掉深色毛。
            target[x, y] = 255 if distance > tolerance else 0
    box = mask.getbbox()
    if box is None:
        raise SystemExit("这一格是空的：整格都被判成背景色，检查 --tolerance 或网格尺寸。")
    cut = rgb.crop(box).convert("RGBA")
    cut.putalpha(mask.crop(box))
    return cut


def fit_square(cut: Image.Image, size: int, pad: float) -> Image.Image:
    """等比重排进方形画布，居中，留 pad 比例的边。"""
    inner = max(1, int(round(size * (1 - 2 * pad))))
    scale = min(inner / cut.width, inner / cut.height)
    scaled = cut.resize((max(1, int(round(cut.width * scale))),
                         max(1, int(round(cut.height * scale)))), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(scaled, ((size - scaled.width) // 2, (size - scaled.height) // 2), scaled)
    return canvas


def contact_sheet(tiles, size: int, columns: int) -> Image.Image:
    """把切好的格子按原顺序贴回一张拼版图，用来人眼验收有没有错位。"""
    rows = (len(tiles) + columns - 1) // columns
    gap = max(2, size // 16)
    width = columns * size + (columns + 1) * gap
    height = rows * size + (rows + 1) * gap
    sheet = Image.new("RGBA", (width, height), (242, 239, 233, 255))
    for index, (_name, tile) in enumerate(tiles):
        row, column = divmod(index, columns)
        sheet.paste(tile, (gap + column * (size + gap), gap + row * (size + gap)), tile)
    return sheet


def main() -> None:
    parser = argparse.ArgumentParser(description="把网格头像图切成每个品种一张")
    parser.add_argument("--sheet", required=True, type=Path)
    parser.add_argument("--family", required=True, choices=sorted(FAMILY_ORDER))
    parser.add_argument("--rows", type=int, default=3)
    parser.add_argument("--cols", type=int, default=4)
    parser.add_argument("--size", type=int, default=128)
    parser.add_argument("--pad", type=float, default=0.06)
    parser.add_argument("--tolerance", type=int, default=26,
                        help="与背景色的最大通道差；背景不干净时调大，吃掉毛色时调小")
    parser.add_argument("--outdir", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--preview", type=Path, default=None)
    args = parser.parse_args()

    order = FAMILY_ORDER[args.family]
    expected_cells = args.rows * args.cols
    if len(order) != expected_cells:
        raise SystemExit(f"{args.family} 名册有 {len(order)} 个，但 {args.rows}x{args.cols} "
                         f"= {expected_cells} 格，对不上。")

    known = bank_ids()
    unknown = [name for name in order if name not in known]
    if unknown:
        raise SystemExit(f"这些品种在指纹库里找不到：{unknown}")

    sheet = Image.open(args.sheet).convert("RGB")
    cell_width = sheet.width / args.cols
    cell_height = sheet.height / args.rows
    args.outdir.mkdir(parents=True, exist_ok=True)

    tiles = []
    for index, name in enumerate(order):
        row, column = divmod(index, args.cols)
        box = (int(round(column * cell_width)), int(round(row * cell_height)),
               int(round((column + 1) * cell_width)), int(round((row + 1) * cell_height)))
        tile = fit_square(cut_out(sheet.crop(box), args.tolerance), args.size, args.pad)
        target = args.outdir / f"{name}.png"
        tile.save(target)
        tiles.append((name, tile))
        print(f"{name:20s} <- cell {index + 1:2d} ({box[0]},{box[1]})  {target}")

    preview = args.preview or args.outdir.parent / f"breeds-preview-{args.family}.png"
    contact_sheet(tiles, args.size, args.cols).save(preview)
    print(f"\n{len(tiles)} 张已写入 {args.outdir}")
    print(f"拼版预览：{preview}")


if __name__ == "__main__":
    main()
