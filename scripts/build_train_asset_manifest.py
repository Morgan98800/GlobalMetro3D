#!/usr/bin/env python3
"""Build the review manifest for train glTF assets and livery colours.

This intentionally does not download or generate train models.  The manifest is
the hand-off between the authoritative rolling-stock/GTFS data and the human
decision about model sources, licences, and physical livery colours.
"""

from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def build_manifest(rolling_stock: dict[str, Any], lines: list[dict[str, Any]]) -> dict[str, Any]:
    line_colours = {item["short_name"]: item for item in lines if item.get("mode") == "metro"}
    models = rolling_stock["models"]
    line_assignments = rolling_stock["lines"]

    families = [
        {
            "family_id": "steel_classic",
            "label": "Matériel fer à roulement classique",
            "drive_type": "steel",
            "candidate_model_ids": [
                model_id for model_id, model in models.items() if model["drive_type"] == "steel"
            ],
            "asset": {
                "status": "awaiting_human_source_and_license",
                "car_only": True,
                "lod_count": 3,
                "compression": ["draco", "meshopt"],
                "max_bytes_per_lod": 150 * 1024,
                "origin": "car_center",
                "long_axis": "+X",
                "materials": "matte_metalness_near_zero",
                "source_uri": None,
                "license": None,
            },
            "livery": {
                "status": "awaiting_human_validation",
                "approved_hex": None,
                "note": "Aucune teinte physique n'est supposée à partir de la couleur de ligne.",
            },
        },
        {
            "family_id": "pneumatic",
            "label": "Matériel pneumatique",
            "drive_type": "tire",
            "candidate_model_ids": [
                model_id
                for model_id, model in models.items()
                if model["drive_type"] == "tire" and not model["driverless"]
            ],
            "asset": {
                "status": "awaiting_human_source_and_license",
                "car_only": True,
                "lod_count": 3,
                "compression": ["draco", "meshopt"],
                "max_bytes_per_lod": 150 * 1024,
                "origin": "car_center",
                "long_axis": "+X",
                "materials": "matte_metalness_near_zero",
                "source_uri": None,
                "license": None,
            },
            "livery": {
                "status": "awaiting_human_validation",
                "approved_hex": None,
                "note": "Aucune teinte physique n'est supposée à partir de la couleur de ligne.",
            },
        },
        {
            "family_id": "automatic_recent",
            "label": "Matériel automatique récent",
            "drive_type": "tire",
            "candidate_model_ids": [
                model_id
                for model_id, model in models.items()
                if model["drive_type"] == "tire" and model["driverless"]
            ],
            "asset": {
                "status": "awaiting_human_source_and_license",
                "car_only": True,
                "lod_count": 3,
                "compression": ["draco", "meshopt"],
                "max_bytes_per_lod": 150 * 1024,
                "origin": "car_center",
                "long_axis": "+X",
                "materials": "matte_metalness_near_zero",
                "source_uri": None,
                "license": None,
            },
            "livery": {
                "status": "awaiting_human_validation",
                "approved_hex": None,
                "note": "Aucune teinte physique n'est supposée à partir de la couleur de ligne.",
            },
        },
    ]

    assignments: list[dict[str, Any]] = []
    for short_name, stock in sorted(line_assignments.items(), key=lambda item: item[0]):
        line = line_colours.get(short_name)
        if line is None:
            raise ValueError(f"Missing authoritative GTFS colour for metro line {short_name}")
        family_id = "automatic_recent" if stock["driverless"] else (
            "pneumatic" if stock["drive_type"] == "tire" else "steel_classic"
        )
        assignments.append(
            {
                "short_name": short_name,
                "model_id": stock["model_id"],
                "family_id": family_id,
                "route_color": line["color"],
                "route_text_color": line["text_color"],
                "livery_color_status": "pending_human_validation",
            }
        )

    train_glb_dir = ROOT / "web" / "public" / "models"
    train_glb_files = sorted(
        path.name
        for path in train_glb_dir.glob("*.glb")
        if path.is_file() and path.name not in {
            "tour_eiffel.glb",
            "arc_de_triomphe.glb",
            "sacre_coeur.glb",
            "notre_dame.glb",
            "invalides.glb",
            "montparnasse.glb",
            "louvre.glb",
            "pantheon.glb",
        }
    )

    return {
        "schema_version": 1,
        "generated_on": date.today().isoformat(),
        "status": "awaiting_human_asset_approval",
        "policy": {
            "external_downloads": "blocked_until_human_source_and_license_approval",
            "marketplace_models": "never_download_without_explicit_license_approval",
            "train_models_present": bool(train_glb_files),
            "train_model_files": train_glb_files,
        },
        "render_contract": {
            "representation": "one_car_instanced_along_curvilinear_path",
            "zoom_model_threshold": 16,
            "crossfade_range": [15.5, 16.0],
            "desktop_instance_cap": 400,
            "mobile_policy": "one_lod_and_lower_cap_after_measurement",
        },
        "families": families,
        "line_assignments": assignments,
        "livery_palette": {
            "status": "awaiting_human_validation",
            "route_colours_are_not_physical_liveries": True,
            "gtfs_route_colours": {
                item["short_name"]: {
                    "route_color": item["color"],
                    "route_text_color": item["text_color"],
                }
                for item in sorted(line_colours.values(), key=lambda value: value["short_name"])
            },
        },
        "next_human_inputs": [
            "Une source ou un fichier glTF pour chacune des trois familles.",
            "La licence autorisant la redistribution dans cette application.",
            "Une teinte de livrée validée pour chaque famille (ou autorisation explicite d'utiliser les couleurs GTFS comme proxy visuel).",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        action="append",
        type=Path,
        default=[Path("data/model-assets-manifest.json")],
        help="Output path; may be supplied more than once.",
    )
    args = parser.parse_args()

    manifest = build_manifest(
        load_json(ROOT / "data" / "rolling-stock.json"),
        load_json(ROOT / "data" / "processed" / "lines.json"),
    )
    for output in args.output:
        destination = output if output.is_absolute() else ROOT / output
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {destination}")


if __name__ == "__main__":
    main()
