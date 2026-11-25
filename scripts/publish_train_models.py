#!/usr/bin/env python3
"""Project internal clean-room train GLBs into the web build input."""

from __future__ import annotations

import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "cities" / "paris" / "assets" / "models" / "train"
DESTINATION_DIR = ROOT / "web" / "public" / "models" / "train"


def publish_train_models(destination_dir: Path = DESTINATION_DIR) -> list[Path]:
    source_dirs = [
        ROOT / "cities" / "paris" / "assets" / "models" / "train",
        ROOT / "cities" / "washington" / "assets" / "models" / "train",
        ROOT / "cities" / "berlin" / "assets" / "models" / "train",
        ROOT / "cities" / "edinburgh" / "assets" / "models" / "train",
        ROOT / "cities" / "lille" / "assets" / "models" / "train",
    ]
    source_files = []
    for sdir in source_dirs:
        if sdir.exists():
            source_files.extend(sorted(path for path in sdir.glob("*.glb") if path.is_file()))

    if not source_files:
        raise FileNotFoundError(f"no train GLBs found in source dirs")

    destination_dir.mkdir(parents=True, exist_ok=True)
    source_names = {path.name for path in source_files}
    for destination in destination_dir.glob("*.glb"):
        if destination.name not in source_names:
            destination.unlink()

    for source in source_files:
        shutil.copy2(source, destination_dir / source.name)
    published = [destination_dir / source.name for source in source_files]

    for subdir in ("library", "map_hd"):
        sub_sources: list[Path] = []
        for sdir in source_dirs:
            candidate_dir = sdir / subdir
            if candidate_dir.exists():
                sub_sources.extend(sorted(p for p in candidate_dir.glob("*.glb") if p.is_file()))
        if not sub_sources:
            continue
        sub_dest = destination_dir / subdir
        sub_dest.mkdir(parents=True, exist_ok=True)
        sub_names = {p.name for p in sub_sources}
        for existing in sub_dest.glob("*.glb"):
            if existing.name not in sub_names:
                existing.unlink()
        for src in sub_sources:
            shutil.copy2(src, sub_dest / src.name)
            published.append(sub_dest / src.name)

    return published


def main() -> None:
    for destination in publish_train_models():
        print(f"published {destination.relative_to(ROOT)}")


if __name__ == "__main__":
    main()