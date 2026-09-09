"""
Main CLI Entry Point for Phase A Ingestion Pipeline
Executes the full pipeline:
1. Downloads IDFM GTFS if needed (data/raw/IDFM-gtfs.zip)
2. Filters metro network (16 lines, shapes, calendar, stops)
3. Performs monotonic station-to-track projections
4. Generates compact binary formats (shapes.bin) and indexed SQLite (network.sqlite)
5. Exports lines.json, stations.json, projection_metrics.json
6. Produces control_network.geojson for visual validation on geojson.io
"""

import os
import sys
import argparse
import time

from .fetch import download_gtfs
from .build_artifacts import build_all_phase_a_artifacts


def run_pipeline(force_download: bool = False) -> None:
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    raw_zip = os.path.join(base_dir, "data", "raw", "IDFM-gtfs.zip")
    output_dir = os.path.join(base_dir, "data", "processed")

    start_time = time.time()
    print("=" * 70)
    print(" PARIS SUBWAY 3D — PHASE A INGESTION PIPELINE")
    print("=" * 70)

    # 1. Download GTFS if not present
    download_gtfs(raw_zip, force=force_download)

    # 2. Build all artifacts
    build_all_phase_a_artifacts(raw_zip, output_dir)

    elapsed = time.time() - start_time
    print("=" * 70)
    print(f" PIPELINE COMPLETED IN {elapsed:.2f} s")
    print(f" Output files written to: {output_dir}")
    print("=" * 70)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run Phase A Ingestion Pipeline")
    parser.add_argument("--force-download", action="store_true", help="Force re-download of GTFS zip")
    args = parser.parse_args()

    run_pipeline(force_download=args.force_download)
