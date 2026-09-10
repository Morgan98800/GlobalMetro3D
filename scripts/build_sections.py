#!/usr/bin/env python3
"""Build the OSM-derived section inventory used by the camera policy."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ingest.src.sections import build_sections_artifact


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--osm-json", type=Path, help="Use a cached Overpass response instead of fetching it")
    parser.add_argument("--output", type=Path, default=Path("data/processed/sections.json"))
    parser.add_argument("--overrides", type=Path, default=Path("data/sections-overrides.json"))
    parser.add_argument("--web-output", type=Path, help="Also copy the generated artifact to the web public data directory")
    args = parser.parse_args()

    osm_ways = None
    if args.osm_json:
        payload = json.loads(args.osm_json.read_text(encoding="utf-8"))
        osm_ways = payload.get("elements", payload)

    artifact = build_sections_artifact(
        "data/processed/shapes.bin",
        "data/processed/lines.json",
        "data/processed/stations.json",
        args.output,
        osm_ways=osm_ways,
        overrides_path=args.overrides,
    )
    if args.web_output:
        args.web_output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(args.output, args.web_output)
    summary = artifact["summary"]
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print("\nSections aériennes:")
    for section in artifact["aerial_sections"]:
        print(
            f"- ligne {section['line']} / sens {section['direction']}: "
            f"{section['station_start'] or '?'} → {section['station_end'] or '?'} "
            f"({section['length_m']:.0f} m)"
        )


if __name__ == "__main__":
    main()
