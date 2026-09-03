#!/usr/bin/env python3
"""Prepare generated landscape showcase home art and its lightweight picker atlas."""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


ROOT = Path(__file__).resolve().parents[1]
HOME = ROOT / "assets" / "images" / "home"
SHOWCASE = ROOT / "assets" / "images" / "home-showcase"
THUMBNAIL_ATLAS = HOME / "home-artwork-thumbnails.webp"
TARGET_SIZE = (1536, 864)
THUMBNAIL_SIZE = (180, 101)
THUMBNAIL_COLUMNS = 10
MAX_BYTES = 330_000
AUDIT_CELL = (320, 180)


def save_compact_webp(image: Image.Image, destination: Path, quality: int = 80) -> int:
    destination.parent.mkdir(parents=True, exist_ok=True)
    selected = quality
    while True:
        image.save(destination, "WEBP", quality=selected, method=6, exact=True, exif=b"", xmp=b"")
        if destination.stat().st_size <= MAX_BYTES or selected <= 70:
            return selected
        selected -= 2


def prepare(source_path: Path, monster_id: str) -> None:
    destination = SHOWCASE / f"{monster_id}.webp"
    with Image.open(source_path) as source:
        image = ImageOps.fit(source.convert("RGB"), TARGET_SIZE, Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    quality = save_compact_webp(image, destination)
    print(f"{destination.relative_to(ROOT).as_posix()}: {image.width}x{image.height}, {destination.stat().st_size} bytes, q{quality}")


def build_atlas() -> None:
    sources = [HOME / f"monster-{number:03d}.webp" for number in range(1, 31)]
    sources += [SHOWCASE / f"monster-{number:03d}.webp" for number in range(1, 31)]
    missing = [path for path in sources if not path.exists()]
    if missing:
        raise FileNotFoundError(f"Missing home art: {', '.join(path.name for path in missing)}")
    rows = (len(sources) + THUMBNAIL_COLUMNS - 1) // THUMBNAIL_COLUMNS
    atlas = Image.new("RGB", (THUMBNAIL_COLUMNS * THUMBNAIL_SIZE[0], rows * THUMBNAIL_SIZE[1]), "#050c15")
    for index, path in enumerate(sources):
        with Image.open(path) as source:
            thumbnail = ImageOps.fit(source.convert("RGB"), THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
        atlas.paste(thumbnail, ((index % THUMBNAIL_COLUMNS) * THUMBNAIL_SIZE[0], (index // THUMBNAIL_COLUMNS) * THUMBNAIL_SIZE[1]))
    atlas.save(THUMBNAIL_ATLAS, "WEBP", quality=62, method=6, exact=True, exif=b"", xmp=b"")
    print(f"{THUMBNAIL_ATLAS.relative_to(ROOT).as_posix()}: {atlas.width}x{atlas.height}, {THUMBNAIL_ATLAS.stat().st_size} bytes")


def build_audit_sheets() -> None:
    output = ROOT / "tmp" / "home-showcase-audit"
    output.mkdir(parents=True, exist_ok=True)
    for start in (1, 11, 21):
        sheet = Image.new("RGB", (AUDIT_CELL[0] * 5, AUDIT_CELL[1] * 2), "#050c15")
        draw = ImageDraw.Draw(sheet)
        for offset, number in enumerate(range(start, start + 10)):
            path = SHOWCASE / f"monster-{number:03d}.webp"
            with Image.open(path) as source:
                preview = ImageOps.fit(source.convert("RGB"), AUDIT_CELL, Image.Resampling.LANCZOS)
            x = (offset % 5) * AUDIT_CELL[0]
            y = (offset // 5) * AUDIT_CELL[1]
            sheet.paste(preview, (x, y))
            draw.rectangle((x, y + 151, x + 54, y + 178), fill="#07111c")
            draw.text((x + 8, y + 157), f"{number:03d}", fill="#f2cf78")
        destination = output / f"home-special-{start:03d}-{start + 9:03d}.webp"
        sheet.save(destination, "WEBP", quality=84, method=6)
        print(destination.relative_to(ROOT).as_posix())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", nargs="?", type=Path)
    parser.add_argument("monster_id", nargs="?")
    parser.add_argument("--build-atlas", action="store_true")
    parser.add_argument("--build-audit", action="store_true")
    args = parser.parse_args()
    if args.build_atlas:
        build_atlas()
        return
    if args.build_audit:
        build_audit_sheets()
        return
    if not args.source or not args.monster_id or not re.fullmatch(r"monster-\d{3}", args.monster_id):
        parser.error("source and monster_id (monster-001 .. monster-030) are required")
    prepare(args.source, args.monster_id)


if __name__ == "__main__":
    main()
