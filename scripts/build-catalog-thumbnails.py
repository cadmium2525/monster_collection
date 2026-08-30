#!/usr/bin/env python3
"""図鑑一覧専用の軽量WebPアトラスを、詳細用原画から生成する。"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
IMAGES = ROOT / "assets" / "images"
OUTPUT = IMAGES / "catalog-thumbnails"
CELL = (96, 128)

GROWTH_IDS = (
    "training-life", "training-atk", "training-def", "shugyo-attack", "shugyo-defense",
)


def atlas_cell(path: Path, index: int, columns: int, rows: int) -> Image.Image:
    with Image.open(path) as source:
        source = source.convert("RGB")
        left = round((index % columns) * source.width / columns)
        right = round(((index % columns) + 1) * source.width / columns)
        top = round((index // columns) * source.height / rows)
        bottom = round(((index // columns) + 1) * source.height / rows)
        return source.crop((left, top, right, bottom))


def open_card_art(card_id: str) -> Image.Image:
    if card_id.startswith("monster-"):
        number = int(card_id.rsplit("-", 1)[1])
        if number <= 18:
            return atlas_cell(IMAGES / "monster-atlas.webp", number - 1, 6, 3)
        with Image.open(IMAGES / "booster" / f"{card_id}.webp") as source:
            return source.convert("RGB")

    if card_id in GROWTH_IDS:
        return atlas_cell(IMAGES / "support-card-atlas-v1.webp", GROWTH_IDS.index(card_id), 5, 5)

    number = int(card_id.rsplit("-", 1)[1])
    if number <= 20:
        return atlas_cell(IMAGES / "support-card-atlas-v1.webp", len(GROWTH_IDS) + number - 1, 5, 5)
    with Image.open(IMAGES / "breeders" / f"{card_id}.webp") as source:
        return source.convert("RGB")


def thumbnail(source: Image.Image) -> Image.Image:
    fitted = ImageOps.fit(
        source.convert("RGB"), CELL,
        method=Image.Resampling.LANCZOS,
        centering=(0.5, 0.46),
    )
    return fitted.filter(ImageFilter.UnsharpMask(radius=0.65, percent=85, threshold=3))


def build_atlas(images: list[Image.Image], columns: int, rows: int, destination: Path) -> None:
    if len(images) > columns * rows:
        raise ValueError(f"{destination.name}: atlas capacity is too small")
    atlas = Image.new("RGB", (columns * CELL[0], rows * CELL[1]), "#07101a")
    for index, source in enumerate(images):
        x = (index % columns) * CELL[0]
        y = (index // columns) * CELL[1]
        atlas.paste(thumbnail(source), (x, y))
    destination.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(destination, "WEBP", quality=62, method=6, exact=True, exif=b"", xmp=b"")
    print(f"{destination.relative_to(ROOT).as_posix()}: {atlas.width}x{atlas.height}, {destination.stat().st_size} bytes")


def main() -> None:
    card_ids = [f"monster-{number:03d}" for number in range(1, 25)]
    card_ids.extend(GROWTH_IDS)
    card_ids.extend(f"breeder-{number:03d}" for number in range(1, 53))
    build_atlas([open_card_art(card_id) for card_id in card_ids], 9, 9, OUTPUT / "cards.webp")

    fusion_images: list[Image.Image] = []
    for number in range(1, 49):
        with Image.open(IMAGES / "special-fusions" / f"fusion-{number:03d}.webp") as source:
            fusion_images.append(source.convert("RGB"))
    build_atlas(fusion_images, 8, 6, OUTPUT / "fusions.webp")


if __name__ == "__main__":
    main()
