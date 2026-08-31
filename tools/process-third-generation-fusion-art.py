"""Normalize generated fusion art into the game's WebP asset sizes."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


CARD_SIZE = (640, 853)
THUMBNAIL_SIZE = (180, 240)


def crop_to_ratio(image: Image.Image, width: int, height: int) -> Image.Image:
    target_ratio = width / height
    source_ratio = image.width / image.height
    if source_ratio > target_ratio:
        crop_width = round(image.height * target_ratio)
        left = (image.width - crop_width) // 2
        return image.crop((left, 0, left + crop_width, image.height))
    crop_height = round(image.width / target_ratio)
    top = (image.height - crop_height) // 2
    return image.crop((0, top, image.width, top + crop_height))


def convert(source: Path, output: Path, size: tuple[int, int], quality: int) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        normalized = crop_to_ratio(image.convert("RGB"), *size)
        normalized = normalized.resize(size, Image.Resampling.LANCZOS)
        normalized.save(output, "WEBP", quality=quality, method=6)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--thumbnail", type=Path)
    args = parser.parse_args()

    convert(args.source, args.output, CARD_SIZE, 88)
    if args.thumbnail:
        convert(args.output, args.thumbnail, THUMBNAIL_SIZE, 81)


if __name__ == "__main__":
    main()
