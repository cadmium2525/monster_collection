#!/usr/bin/env python3
"""Resize generated special art to the game's compact WebP delivery format."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageOps


TARGET_SIZE = (640, 853)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--quality", type=int, default=82)
    args = parser.parse_args()

    with Image.open(args.source) as source:
        image = ImageOps.fit(source.convert("RGB"), TARGET_SIZE, Image.Resampling.LANCZOS)
    args.destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(args.destination, "WEBP", quality=args.quality, method=6, exact=True, exif=b"", xmp=b"")
    print(f"{args.destination}: {image.width}x{image.height}, {args.destination.stat().st_size} bytes")


if __name__ == "__main__":
    main()
