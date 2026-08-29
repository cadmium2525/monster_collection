#!/usr/bin/env python3
"""Web配信用画像の寸法と容量を監査する。Pillowが必要。"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

from PIL import Image


def collect(root: Path) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for path in sorted(root.rglob("*.webp")):
        with Image.open(path) as image:
            width, height = image.size
        rows.append(
            {
                "path": path.relative_to(root.parent.parent).as_posix(),
                "folder": path.parent.relative_to(root).as_posix() or ".",
                "width": width,
                "height": height,
                "bytes": path.stat().st_size,
            }
        )
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("assets/images"))
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    rows = collect(args.root.resolve())
    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
        return

    folders: dict[str, dict[str, int]] = defaultdict(lambda: {"count": 0, "bytes": 0})
    for row in rows:
        folders[str(row["folder"])]["count"] += 1
        folders[str(row["folder"])]["bytes"] += int(row["bytes"])
    print(f"{'folder':<28} {'files':>6} {'MiB':>9}")
    for folder, values in sorted(folders.items(), key=lambda item: item[1]["bytes"], reverse=True):
        print(f"{folder:<28} {values['count']:>6} {values['bytes'] / 1024 / 1024:>9.2f}")
    print(f"{'TOTAL':<28} {len(rows):>6} {sum(int(row['bytes']) for row in rows) / 1024 / 1024:>9.2f}")


if __name__ == "__main__":
    main()
