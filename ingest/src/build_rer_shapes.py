"""
build_rer_shapes.py — Extract, clean, resample and encode RER shapes in SHP2 format.

Phase 1: Validated on RER E (14 GTFS shapes).
Ensures strict SHP2 contract:
- 10m regular resampling
- monotone cumulative distances
- tail segment in [0, step)
- precision < 0.02 m roundtrip
"""

from __future__ import annotations

import csv
import io
import os
import subprocess
import sys
import zipfile
from pathlib import Path
from typing import List, Tuple, Dict, Any

from ingest.src.resample import resample_polyline_10m, remove_uturn_kinks
from ingest.write_shapes_v2 import ResampledShape, write_shapes_v2, verify_roundtrip

RER_E_ROUTE_ID = "IDFM:C01729"
STEP_METERS = 10.0


def extract_rer_e_shapes(raw_zip: Path | str) -> List[ResampledShape]:
    raw_zip = Path(raw_zip)
    if not raw_zip.exists():
        raise FileNotFoundError(f"GTFS archive not found: {raw_zip}")

    print(f"[rer_shapes] Reading RER E shapes from {raw_zip}...")
    with zipfile.ZipFile(raw_zip) as z:
        routes: set[str] = set()
        with z.open("routes.txt") as f:
            for r in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
                if r.get("route_type") == "2" and r.get("route_short_name", "").strip() == "E":
                    routes.add(r["route_id"])

        if not routes:
            raise RuntimeError("RER E route not found in routes.txt")

        shape_ids: set[str] = set()
        with z.open("trips.txt") as f:
            for r in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
                if r.get("route_id") in routes:
                    sid = r.get("shape_id", "").strip()
                    if sid:
                        shape_ids.add(sid)

        print(f"[rer_shapes] Found {len(shape_ids)} distinct shape_ids for RER E")

        shape_points: Dict[str, List[Tuple[int, float, float]]] = {sid: [] for sid in shape_ids}
        with z.open("shapes.txt") as f:
            for r in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
                sid = r.get("shape_id", "").strip()
                if sid in shape_points:
                    shape_points[sid].append((
                        int(r.get("shape_pt_sequence", 0) or 0),
                        float(r.get("shape_pt_lon", 0.0) or 0.0),
                        float(r.get("shape_pt_lat", 0.0) or 0.0),
                    ))

    resampled_shapes: List[ResampledShape] = []
    for sid in sorted(shape_ids):
        pts = shape_points[sid]
        if len(pts) < 2:
            raise ValueError(f"Shape {sid} has insufficient points: {len(pts)}")
        pts.sort(key=lambda x: x[0])
        raw_coords = [(p[1], p[2]) for p in pts]

        # Clean geometry: remove local U-turn kinks
        cleaned_coords = remove_uturn_kinks(raw_coords)

        # Resample at constant step (10m)
        res_coords, dists, total_len = resample_polyline_10m(cleaned_coords, step_meters=STEP_METERS)
        coords = [tuple(p) for p in res_coords.tolist()]
        step = STEP_METERS
        tail = float(total_len - (len(coords) - 2) * step)

        if not (0.0 <= tail < step + 1e-4):
            raise ValueError(f"{sid}: invalid tail length {tail:.4f} m for step {step} m")

        resampled_shapes.append(ResampledShape(
            shape_id=sid,
            coords=coords,
            step=step,
            tail_length=tail,
        ))
        print(f"[rer_shapes] {sid}: {len(coords)} pts, {total_len/1000:.2f} km, tail={tail:.3f} m")

    return resampled_shapes


def compress_brotli(src: Path, dst: Path) -> None:
    """Compress with Brotli quality 11 using node."""
    cmd = [
        "node", "-e",
        """
        const fs = require('fs');
        const zlib = require('zlib');
        const src = process.argv[1];
        const dst = process.argv[2];
        const data = fs.readFileSync(src);
        const compressed = zlib.brotliCompressSync(data, {
            params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: 11
            }
        });
        fs.writeFileSync(dst, compressed);
        console.log(`[rer_shapes] Compressed Brotli: ${data.length} -> ${compressed.length} bytes (${(compressed.length/data.length*100).toFixed(1)}%)`);
        """,
        str(src),
        str(dst)
    ]
    subprocess.run(cmd, check=True)


def build_rer_shapes(raw_zip: Path | str, out_bin_path: Path | str) -> dict:
    shapes = extract_rer_e_shapes(raw_zip)
    out_bin = Path(out_bin_path)
    out_bin.parent.mkdir(parents=True, exist_ok=True)

    meta = write_shapes_v2(shapes, out_bin)
    print(f"[rer_shapes] Written {out_bin}: {meta['bytes']} bytes, {meta['shapes']} shapes, {meta['points']} points")

    worst_err = verify_roundtrip(shapes, out_bin)
    print(f"[rer_shapes] Worst roundtrip error: {worst_err:.4f} m (tolerance: 0.02 m)")
    if worst_err >= 0.02:
        raise ValueError(f"Roundtrip error {worst_err:.4f} m exceeds tolerance 0.02 m")

    br_path = out_bin.with_suffix(out_bin.suffix + ".br")
    compress_brotli(out_bin, br_path)

    return meta


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent.parent
    raw_zip = root / "data" / "raw" / "IDFM-gtfs.zip"
    out_bin = root / "web" / "public" / "data" / "rer_shapes.bin"
    build_rer_shapes(raw_zip, out_bin)
