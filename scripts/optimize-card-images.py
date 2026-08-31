#!/usr/bin/env python3
"""カード絵を実表示に必要な解像度へ最適化する。Pillowが必要。"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageFilter


TARGETS = {
    "showcase": (640, 853),
    "showcase-fusions": (640, 853),
    "booster": (640, 853),
    "breeders": (640, 853),
}

LEGACY_FUSION_ROW_HEIGHTS = (234, 235, 230, 205, 178, 172)


def save_webp(image: Image.Image, destination: Path, quality: int = 86) -> None:
    image.save(destination, "WEBP", quality=quality, method=6, exact=True, exif=b"", xmp=b"")


def fit_within(image: Image.Image, maximum: tuple[int, int]) -> Image.Image:
    copy = image.copy()
    copy.thumbnail(maximum, Image.Resampling.LANCZOS)
    return copy


def optimize_folder(root: Path, folder: str, maximum: tuple[int, int], dry_run: bool) -> tuple[int, int]:
    changed = 0
    saved = 0
    for path in sorted((root / folder).glob("*.webp")):
        before = path.stat().st_size
        with Image.open(path) as source:
            if source.width <= maximum[0] and source.height <= maximum[1]:
                continue
            output = fit_within(source.convert("RGB"), maximum)
        if not dry_run:
            save_webp(output, path)
            after = path.stat().st_size
        else:
            after = before
        changed += 1
        saved += max(0, before - after)
        print(f"{path.as_posix()}: {source.width}x{source.height} -> {output.width}x{output.height}")
    return changed, saved


def rebuild_legacy_fusions(root: Path, dry_run: bool) -> tuple[int, int]:
    atlas_path = root / "special-fusion-atlas-v1.webp"
    destination = root / "special-fusions"
    with Image.open(atlas_path) as atlas_source:
        atlas = atlas_source.convert("RGB")
    cell_width = atlas.width // 6
    if sum(LEGACY_FUSION_ROW_HEIGHTS) != atlas.height:
        raise ValueError("Unexpected legacy fusion atlas height")
    row_offsets = [0]
    for height in LEGACY_FUSION_ROW_HEIGHTS:
        row_offsets.append(row_offsets[-1] + height)
    changed = 0
    saved = 0
    for index in range(1, 37):
        if index == 14:  # アズールドリルは専用の修正版を維持する。
            continue
        column = (index - 1) % 6
        row = (index - 1) // 6
        row_top = row_offsets[row]
        row_bottom = row_offsets[row + 1]
        cell = atlas.crop(
            (
                column * cell_width,
                row_top,
                (column + 1) * cell_width,
                row_bottom,
            )
        )
        target_height = round(cell.height * (512 / cell.width))
        # 元の縦横比を維持して隣接セル混入を防ぎ、輪郭だけを穏やかに補う。
        output = cell.resize((512, target_height), Image.Resampling.LANCZOS).filter(
            ImageFilter.UnsharpMask(radius=1.35, percent=115, threshold=3)
        )
        path = destination / f"fusion-{index:03d}.webp"
        before = path.stat().st_size if path.exists() else 0
        if not dry_run:
            save_webp(output, path, quality=88)
            after = path.stat().st_size
        else:
            after = before
        changed += 1
        saved += before - after
        print(f"{path.as_posix()}: atlas {cell.width}x{cell.height} -> {output.width}x{output.height}")
    return changed, saved


def optimize_modern_fusions(root: Path, dry_run: bool) -> tuple[int, int]:
    changed = 0
    saved = 0
    for index in range(37, 49):
        path = root / "special-fusions" / f"fusion-{index:03d}.webp"
        before = path.stat().st_size
        with Image.open(path) as source:
            if source.width <= 640 and source.height <= 853:
                continue
            output = fit_within(source.convert("RGB"), (640, 853))
        if not dry_run:
            save_webp(output, path)
            after = path.stat().st_size
        else:
            after = before
        changed += 1
        saved += max(0, before - after)
        print(f"{path.as_posix()}: {source.width}x{source.height} -> {output.width}x{output.height}")
    return changed, saved


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("assets/images"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    root = args.root.resolve()

    totals = [rebuild_legacy_fusions(root, args.dry_run), optimize_modern_fusions(root, args.dry_run)]
    totals.extend(optimize_folder(root, folder, maximum, args.dry_run) for folder, maximum in TARGETS.items())
    changed = sum(item[0] for item in totals)
    saved = sum(item[1] for item in totals)
    mode = "DRY RUN" if args.dry_run else "DONE"
    print(f"{mode}: {changed} files, {saved / 1024 / 1024:+.2f} MiB net reduction")


if __name__ == "__main__":
    main()
