#!/usr/bin/env python3
"""Build the review manifest for train glTF assets and livery colours.

This intentionally does not download or generate train models.  The manifest is
the hand-off between the authoritative rolling-stock/GTFS data and the human
decision about model sources, licences, and physical livery colours.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import copy
from datetime import date
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PLACEHOLDER_PREFIX = "<to be filled"
RER_SHORT_NAMES = ("A", "B", "C", "D", "E")


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_placeholder(value: object) -> bool:
    return isinstance(value, str) and value.startswith(PLACEHOLDER_PREFIX)


def provenance_is_complete(provenance: dict[str, object]) -> bool:
    required_fields = ("source_location", "source_sha256")
    return all(
        isinstance(provenance.get(field), str)
        and provenance[field].strip()
        and not is_placeholder(provenance[field])
        for field in required_fields
    )


def validate_asset_lifecycle(families: list[dict[str, Any]]) -> None:
    for family in families:
        asset = family["asset"]
        if asset.get("license") == "unresolved" and (
            asset.get("status") == "active" or asset.get("role") == "instanced"
        ):
            raise ValueError(
                f"{family['family_id']}: an unresolved licence cannot be active or instanced"
            )


def build_served_manifest(canonical: dict[str, Any]) -> dict[str, Any]:
    """Return the public manifest through an explicit, fail-closed allowlist."""
    return {
        "schema_version": canonical["schema_version"],
        "generated_on": canonical["generated_on"],
        "status": canonical["status"],
        "policy": {"train_models_present": canonical["policy"]["train_models_present"]},
        "families": [
            {
                "family_id": family["family_id"],
                "status": family["asset"]["status"],
                "dimensions_m": family.get("dimensions_m"),
                "asset_file": family["asset"].get("asset_file"),
                "sha256": family["asset"].get("sha256"),
            }
            for family in canonical["families"]
        ],
    }


def build_manifest(rolling_stock: dict[str, Any], lines: list[dict[str, Any]]) -> dict[str, Any]:
    line_colours = {item["short_name"]: item for item in lines if item.get("mode") == "metro"}
    models = rolling_stock["models"]
    line_assignments = rolling_stock["lines"]

    reference_families = rolling_stock.get("asset_families", {})
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
        {
            "family_id": "pneumatic_generic",
            "label": "Référence pneumatique générique interne",
            "drive_type": "tire",
            "candidate_model_ids": [],
            "dimensions_m": reference_families.get("pneumatic_generic", {}).get("reference_dimensions_m"),
            "asset": {
                "status": "awaiting_human_asset_approval",
                "role": "reference",
                "car_only": True,
                "lod_count": 0,
                "compression": [],
                "max_bytes_per_lod": 0,
                "origin": "x,z centred; y = 0 at rail head",
                "long_axis": "+X",
                "materials": "not_for_distribution",
                "source_uri": None,
                "license": "unresolved",
                "provenance": {
                    "source_kind": "reference_hero",
                    "source_location": "<to be filled: external storage location>",
                    "source_sha256": "<to be filled: SHA-256>",
                    "derivative_policy": "internal_reference_only_never_publish",
                    "reference_directory": "assets-src/reference/pneumatic_generic",
                },
            },
            "livery": {
                "status": "not_for_distribution",
                "approved_hex": None,
                "note": "Dérivés de référence internes uniquement ; livrée, logos, lettrage et pictogrammes non redistribuables.",
            },
        },
        {
            "family_id": "rer_generic",
            "label": "Matériel RER générique clean-room",
            "drive_type": "steel",
            "candidate_model_ids": ["rer_generic"],
            "dimensions_m": {
                "car_length_m": 15.0,
                "car_height_m": 2.85,
                "width_m": 2.8,
            },
            "asset": {
                "status": "awaiting_human_asset_approval",
                "role": "reference",
                "car_only": True,
                "lod_count": 0,
                "compression": [],
                "max_bytes_per_lod": 0,
                "origin": "x,z centred; y = 0 at rail head",
                "long_axis": "+X",
                "materials": "matte_metalness_near_zero",
                "source_uri": None,
                "license": "unresolved",
                "provenance": {
                    "source_kind": "clean_room_generated",
                    "source_location": "assets-src/models/train/rer_generic__neutral.glb",
                    "source_sha256": "<to be filled: SHA-256>",
                    "derivative_policy": "internal_reference_only_never_publish",
                    "reference_directory": "assets-src/models/train",
                },
            },
            "livery": {
                "status": "not_for_distribution",
                "approved_hex": None,
                "note": "Modèle neutre ; aucune livrée physique n'est supposée.",
            },
        },
    ]

    rer_template = families[-1]
    families.pop()
    for short_name in RER_SHORT_NAMES:
        rer_family = copy.deepcopy(rer_template)
        asset_file = f"train/rer_generic_{short_name}__neutral.glb"
        asset_path = ROOT / "web" / "public" / "models" / asset_file
        rer_family["family_id"] = f"rer_generic_{short_name}"
        rer_family["candidate_model_ids"] = [f"rer_generic_{short_name}"]
        rer_family["asset"]["asset_file"] = asset_file
        rer_family["asset"]["sha256"] = sha256_file(asset_path)
        rer_family["asset"]["provenance"]["source_location"] = (
            f"assets-src/models/train/rer_generic_{short_name}__neutral.glb"
        )
        rer_family["asset"]["provenance"]["source_sha256"] = rer_family["asset"]["sha256"]
        families.append(rer_family)

    assignments: list[dict[str, Any]] = []
    for short_name, stock in sorted(line_assignments.items(), key=lambda item: item[0]):
        line = line_colours.get(short_name) or next(
            (item for item in lines if item.get("short_name") == short_name), None
        )
        if line is None:
            continue
        family_id = f"rer_generic_{short_name}" if short_name in RER_SHORT_NAMES else (
            "automatic_recent" if stock["driverless"] else (
            "pneumatic" if stock["drive_type"] == "tire" else "steel_classic"
            )
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
        path.relative_to(train_glb_dir).as_posix()
        for path in train_glb_dir.rglob("*.glb")
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

    manifest = {
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
    validate_asset_lifecycle(families)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        action="append",
        type=Path,
        default=None,
        help="Output path; may be supplied more than once.",
    )
    args = parser.parse_args()

    manifest = build_manifest(
        load_json(ROOT / "data" / "rolling-stock.json"),
        load_json(ROOT / "data" / "processed" / "lines.json"),
    )
    for output in args.output or [Path("data/model-assets-manifest.json")]:
        destination = output if output.is_absolute() else ROOT / output
        destination.parent.mkdir(parents=True, exist_ok=True)
        output_manifest = build_served_manifest(manifest) if destination == ROOT / "web" / "public" / "data" / "model-assets-manifest.json" else manifest
        destination.write_text(json.dumps(output_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {destination}")


if __name__ == "__main__":
    main()
