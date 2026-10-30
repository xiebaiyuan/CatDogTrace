"""从 24 张品种头像派生出两张品牌图：社交预览卡与站点图标。

两张都是生成物，可重复跑出逐字节相同结果。素材是 static/assets/breeds/ 里那份，
不复制、不改动。

- static/assets/social-preview.png  1280x640，GitHub 仓库社交预览与 README 头图用
- static/assets/favicon.png         64x64，站点图标用
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

PROJECT = Path(__file__).resolve().parent
BREEDS = PROJECT / "static" / "assets" / "breeds"
OUT = PROJECT / "static" / "assets"

PAPER = (250, 249, 246)
INK = (27, 29, 33)
INK_SOFT = (94, 100, 108)
FONT = "/System/Library/Fonts/SFNS.ttf"

# 与网页同一个顺序：先犬后猫，按指纹库名册
ORDER = [
    "husky", "labrador", "schnauzer", "corgi",
    "golden-retriever", "border-collie", "shiba", "samoyed",
    "alaskan-malamute", "beagle", "poodle", "bulldog",
    "ragdoll", "siamese", "orange-tabby", "british-shorthair",
    "maine-coon", "persian", "american-shorthair", "russian-blue",
    "scottish-fold", "sphinx", "bengal", "norwegian-forest",
]


def check_order() -> None:
    """名册必须与指纹库一致，否则预览卡上的顺序就是错的。"""
    bank = json.loads((PROJECT / "data" / "unified_bank.json").read_text(encoding="utf-8"))
    if [model["id"] for model in bank["models"]] != ORDER:
        raise SystemExit("ORDER 与指纹库名册不一致，先对齐再生成。")


def tile(breed: str, size: int) -> Image.Image:
    image = Image.open(BREEDS / f"{breed}.png").convert("RGB")
    return image.resize((size, size), Image.LANCZOS)


def social_preview() -> Path:
    width, height = 1280, 640
    canvas = Image.new("RGB", (width, height), PAPER)
    draw = ImageDraw.Draw(canvas)

    title = ImageFont.truetype(FONT, 84)
    lead = ImageFont.truetype(FONT, 27)
    kicker = ImageFont.truetype(FONT, 21)

    left = 88
    draw.text((left, 104), "DogCatTrace", font=title, fill=INK)
    draw.text((left, 216), "Twenty-four dog and cat breeds,", font=lead, fill=INK_SOFT)
    draw.text((left, 252), "ranked by the distribution of an integer sequence.", font=lead, fill=INK_SOFT)
    draw.text((left, 320), "A closed-set attribution. Similarity is not lineage.", font=kicker, fill=INK_SOFT)

    # 24 个头像排两行，作为这张卡唯一的图像内容
    # 头像块与标题共用同一条左边缘，整张卡只有一个框
    size, gap = 70, 20
    per_row = 12
    x0 = left
    y0 = height - 48 - (2 * size + gap)
    for index, breed in enumerate(ORDER):
        row, column = divmod(index, per_row)
        canvas.paste(tile(breed, size), (x0 + column * (size + gap), y0 + row * (size + gap)))

    target = OUT / "social-preview.png"
    canvas.save(target, optimize=True)
    return target


def favicon() -> Path:
    # 哈士奇：深灰配白，缩到 64px 仍然认得出
    icon = tile("husky", 64)
    target = OUT / "favicon.png"
    icon.save(target, optimize=True)
    return target


def main() -> None:
    check_order()
    for path in (social_preview(), favicon()):
        print(f"{path.relative_to(PROJECT)}  {path.stat().st_size} 字节")


if __name__ == "__main__":
    main()
