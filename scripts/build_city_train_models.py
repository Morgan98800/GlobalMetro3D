#!/usr/bin/env python3
"""
Generate clean-room low-poly PBR GLB models (neutral, cab, tail) for multi-city fleets
(Washington, Berlin, Lille, Edinburgh) reusing the geometric & PBR pipeline in
build_train_box_models.py.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from build_train_box_models import (
    build_geometry,
    paint_atlas,
    paint_emissive_atlas,
    paint_mr_atlas,
    write_glb,
)


@dataclass(frozen=True)
class CityStockSpec:
    city: str
    family: str
    length_m: float
    width_m: float
    height_m: float
    doors_per_side: int
    body_color: tuple[int, int, int]
    band_color: tuple[int, int, int]
    single_unit: bool = False


SPECS: tuple[CityStockSpec, ...] = (
    CityStockSpec(
        city="washington",
        family="wmata_generic",
        length_m=22.86,
        width_m=3.09,
        height_m=3.30,
        doors_per_side=3,
        body_color=(186, 192, 200),
        band_color=(64, 70, 78),
    ),
    CityStockSpec(
        city="berlin",
        family="bvg_kleinprofil",
        length_m=12.80,
        width_m=2.30,
        height_m=3.18,
        doors_per_side=3,
        body_color=(240, 202, 0),
        band_color=(46, 50, 56),
    ),
    CityStockSpec(
        city="berlin",
        family="bvg_grossprofil",
        length_m=15.50,
        width_m=2.65,
        height_m=3.45,
        doors_per_side=3,
        body_color=(240, 202, 0),
        band_color=(46, 50, 56),
    ),
    CityStockSpec(
        city="lille",
        family="val_208",
        length_m=13.00,
        width_m=2.06,
        height_m=3.25,
        doors_per_side=3,
        body_color=(234, 236, 240),
        band_color=(205, 34, 48),
    ),
    CityStockSpec(
        city="lille",
        family="val_52m",
        length_m=13.00,
        width_m=2.06,
        height_m=3.25,
        doors_per_side=3,
        body_color=(234, 236, 240),
        band_color=(184, 28, 42),
    ),
    CityStockSpec(
        city="lille",
        family="breda_vlc",
        length_m=30.00,
        width_m=2.40,
        height_m=3.42,
        doors_per_side=4,
        body_color=(234, 236, 240),
        band_color=(215, 62, 52),
        single_unit=True,
    ),
    CityStockSpec(
        city="edinburgh",
        family="scotrail_class_385",
        length_m=71.00,
        width_m=2.80,
        height_m=3.75,
        doors_per_side=8,
        body_color=(220, 224, 230),
        band_color=(0, 66, 122),
        single_unit=True,
    ),
)


def main() -> int:
    for spec in SPECS:
        geom_neutral = build_geometry(spec.length_m, spec.width_m, spec.height_m, cab=False)
        geom_cab = build_geometry(spec.length_m, spec.width_m, spec.height_m, cab=True)
        mr_png = paint_mr_atlas(spec.length_m, spec.doors_per_side)

        out_src = ROOT / "cities" / spec.city / "assets" / "models" / "train"
        out_pub = ROOT / "web" / "public" / "cities" / spec.city / "models" / "train"
        out_src.mkdir(parents=True, exist_ok=True)
        out_pub.mkdir(parents=True, exist_ok=True)

        roles = (
            ("neutral", geom_neutral, "double" if spec.single_unit else "gangway"),
            ("cab", geom_cab, "double" if spec.single_unit else "head"),
            ("tail", geom_cab, "tail"),
        )
        for role, (P, N, UV, I), end_mode in roles:
            png = paint_atlas(
                spec.length_m,
                spec.height_m,
                spec.doors_per_side,
                spec.band_color,
                "line_coded",
                end_mode=end_mode,
                body_color=spec.body_color,
            )
            emi = paint_emissive_atlas(spec.length_m, spec.doors_per_side, end_mode=end_mode)
            name = f"{spec.family}__{role}"
            dest_src = out_src / f"{name}.glb"
            write_glb(dest_src, P, N, UV, I, png, mr_png, emi, name)
            (out_pub / dest_src.name).write_bytes(dest_src.read_bytes())
            size = dest_src.stat().st_size
            print(f"{spec.city:10s} {dest_src.name:34s} {len(I)//3:4d} tris  {size/1024:5.1f} KiB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
