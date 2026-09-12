#!/usr/bin/env python3
"""Project internal clean-room train GLBs into the web build input."""

from __future__ import annotations

import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "assets-src" / "models" / "train"
DESTINATION_DIR = ROOT / "web" / "public" / "models" / "train"


def publish_train_models(source_dir: Path = SOURCE_DIR, destination_dir: Path = DESTINATION_DIR) -> list[Path]:
    source_files = sorted(path for path in source_dir.glob("*.glb") if path.is_file())
    if not source_files:
        raise FileNotFoundError(f"no train GLBs found in {source_dir}")

    destination_dir.mkdir(parents=True, exist_ok=True)
    source_names = {path.name for path in source_files}
    for destination in destination_dir.glob("*.glb"):
        if destination.name not in source_names:
            destination.unlink()

    for source in source_files:
        shutil.copy2(source, destination_dir / source.name)
    return [destination_dir / source.name for source in source_files]


def main() -> None:
    for destination in publish_train_models():
        print(f"published {destination.relative_to(ROOT)}")


if __name__ == "__main__":
    main()