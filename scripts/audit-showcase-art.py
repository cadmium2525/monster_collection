#!/usr/bin/env python3
"""Create side-by-side sheets for visually auditing normal and showcase monster art."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


ROOT = Path(__file__).resolve().parents[1]
IMAGES = ROOT / "assets" / "images"
OUTPUT = ROOT / "tmp" / "showcase-audit"
REFERENCES = ROOT / "tmp" / "showcase-references"
GENERATED = ROOT / "tmp" / "showcase-generated"
CELL = (192, 256)


def base_art(number: int) -> Image.Image:
    if number <= 18:
        with Image.open(IMAGES / "monster-atlas.webp") as source:
            atlas = source.convert("RGB")
        width = atlas.width // 6
        height = atlas.height // 3
        index = number - 1
        return atlas.crop(((index % 6) * width, (index // 6) * height, (index % 6 + 1) * width, (index // 6 + 1) * height))
    with Image.open(IMAGES / "booster" / f"monster-{number:03d}.webp") as source:
        return source.convert("RGB")


def showcase_path(number: int) -> Path:
    aliases = {
        19: "showcase-inorganic-01.webp",
        20: "showcase-creation-01.webp",
        21: "showcase-spirit-01.webp",
        22: "showcase-demon-01.webp",
        23: "showcase-beast-01.webp",
        24: "showcase-monster-01.webp",
    }
    staged = GENERATED / f"showcase-monster-{number:03d}.webp"
    if staged.exists():
        return staged
    return IMAGES / "showcase" / aliases.get(number, f"showcase-monster-{number:03d}.webp")


def fit(image: Image.Image) -> Image.Image:
    return ImageOps.fit(image, CELL, Image.Resampling.LANCZOS, centering=(0.5, 0.5))


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    REFERENCES.mkdir(parents=True, exist_ok=True)
    for number in range(1, 25):
        reference = base_art(number)
        reference.save(REFERENCES / f"monster-{number:03d}.webp", "WEBP", quality=90, method=6)
    for start in (1, 11, 21):
        sheet = Image.new("RGB", (5 * CELL[0] * 2, 2 * (CELL[1] + 24)), "#06101a")
        draw = ImageDraw.Draw(sheet)
        for offset, number in enumerate(range(start, start + 10)):
            row, column = divmod(offset, 5)
            x = column * CELL[0] * 2
            y = row * (CELL[1] + 24)
            normal = fit(base_art(number))
            with Image.open(showcase_path(number)) as source:
                special = fit(source.convert("RGB"))
            sheet.paste(normal, (x, y))
            sheet.paste(special, (x + CELL[0], y))
            draw.text((x + 6, y + CELL[1] + 5), f"{number:03d} NORMAL", fill="#a8dfe4")
            draw.text((x + CELL[0] + 6, y + CELL[1] + 5), "SPECIAL", fill="#f2cf78")
        destination = OUTPUT / f"showcase-{start:03d}-{start + 9:03d}.webp"
        sheet.save(destination, "WEBP", quality=82, method=6)
        print(destination)


if __name__ == "__main__":
    main()
