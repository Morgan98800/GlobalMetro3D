#!/usr/bin/env python3
"""Generate clean-room Paris rolling-stock livery variants (IDFM sky blue, MF 77 renovated)
using build_train_box_models primitives without altering core family contracts.
"""

from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from build_train_box_models import (  # noqa: E402
    DEFAULT_HEIGHT_RATIO,
    build_geometry,
    paint_atlas,
    paint_emissive_atlas,
    paint_mr_atlas,
    write_glb,
)

LIVERY_SPECS = (
    # IDFM silver + sky blue for MP14 (Lines 4, 11, 14)
    ("paris_idfm_pneu", 15.0, 2.44, (0, 156, 222), (235, 239, 244)),
    # IDFM silver + sky blue for MF01 / modern steel (Lines 2, 5, 9, 7bis)
    ("paris_idfm_steel", 15.15, 2.44, (0, 156, 222), (235, 239, 244)),
    # MF77 STIF / RATP renovated slate-blue + off-white (Lines 7, 8, 13)
    ("paris_mf77", 15.49, 2.46, (38, 102, 138), (242, 244, 246)),
)


def main() -> int:
    out_src = ROOT / "cities" / "paris" / "assets" / "models" / "train"
    out_pub = ROOT / "web" / "public" / "models" / "train"
    out_src.mkdir(parents=True, exist_ok=True)
    out_pub.mkdir(parents=True, exist_ok=True)

    for key, length_m, width_m, band_rgb, body_rgb in LIVERY_SPECS:
        height_m = round(width_m * DEFAULT_HEIGHT_RATIO, 3)
        geom_neutral = build_geometry(length_m, width_m, height_m, cab=False)
        geom_cab = build_geometry(length_m, width_m, height_m, cab=True)
        mr_png = paint_mr_atlas(length_m, 4)
        emi_gangway = paint_emissive_atlas(length_m, 4, "gangway")
        emi_head = paint_emissive_atlas(length_m, 4, "head")
        emi_tail = paint_emissive_atlas(length_m, 4, "tail")

        roles = (
            ("", geom_neutral, "gangway", emi_gangway),
            ("__cab", geom_cab, "head", emi_head),
            ("__tail", geom_cab, "tail", emi_tail),
        )
        for suffix, (P, N, UV, I), end_mode, emi_png in roles:
            png = paint_atlas(
                length_m,
                height_m,
                4,
                band_rgb,
                "line_coded",
                end_mode,
                body_color=body_rgb,
            )
            name = f"{key}__neutral{suffix}"
            src_dest = out_src / f"{name}.glb"
            pub_dest = out_pub / f"{name}.glb"
            write_glb(src_dest, P, N, UV, I, png, mr_png, emi_png, name)
            pub_dest.write_bytes(src_dest.read_bytes())
            print(f"generated {name}.glb ({src_dest.stat().st_size / 1024:.1f} KiB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
