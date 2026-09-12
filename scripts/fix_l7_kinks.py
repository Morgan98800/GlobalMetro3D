#!/usr/bin/env python3
"""Re-encode the already-cleaned canonical shapes for browser delivery."""

import os
import sys
import math
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from ingest.src.sections import _load_v1_shapes
from ingest.src.resample import resample_polyline_10m
from ingest.write_shapes_v2 import ResampledShape, write_shapes_v2, verify_roundtrip


def fix_all():
    bin_path = ROOT / "web" / "public" / "data" / "shapes.bin"
    source_path = ROOT / "data" / "processed" / "shapes.bin"
    source_shapes = _load_v1_shapes(source_path)
    resampled_shapes = []
    for shape in source_shapes:
        sid = shape["shape_id"]
        coords = shape["coords"]
        distances = shape["distances"]
        step = float(distances[1] - distances[0]) if len(distances) > 1 else 0.0
        resampled, distances, total_length = resample_polyline_10m(coords, step)
        coords = [tuple(point) for point in resampled.tolist()]
        step = float(distances[1] - distances[0]) if len(distances) > 1 else step
        tail = float(total_length - (len(coords) - 2) * step)
        if not 0.0 <= tail < step + 1e-4:
            raise ValueError(f"{sid}: invalid SHP2 tail length {tail} for step {step}")
        resampled_shapes.append(ResampledShape(
            shape_id=sid,
            coords=coords,
            step=step,
            tail_length=tail
        ))

    meta = write_shapes_v2(resampled_shapes, bin_path)
    print(f"[fix] Updated {bin_path} ({meta['bytes']} bytes)")

    worst_err = verify_roundtrip(resampled_shapes, bin_path)
    print(f"[fix] Worst roundtrip error: {worst_err:.4f} m")
    assert worst_err < 0.02, f"Roundtrip error {worst_err} m exceeds 0.02 m tolerance"

    # Compress shapes.bin with Brotli using node
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
        console.log();
        """,
        str(bin_path),
        str(ROOT / "web" / "public" / "data" / "shapes.bin.br")
    ]
    subprocess.run(cmd, check=True)

    # Sync to web/dist/data/ if dist exists
    dist_dir = ROOT / "web" / "dist" / "data"
    if dist_dir.exists():
        import shutil
        for fname in ["shapes.bin", "shapes.bin.br", "tracks.json"]:
            src = ROOT / "web" / "public" / "data" / fname
            if src.exists():
                shutil.copy2(src, dist_dir / fname)
        print(f"[fix] Synced updated files to {dist_dir}")

if __name__ == "__main__":
    fix_all()
