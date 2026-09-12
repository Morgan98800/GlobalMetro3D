import json
import hashlib
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from build_train_asset_manifest import provenance_is_complete, validate_asset_lifecycle


def test_train_asset_manifest_keeps_external_assets_gated() -> None:
    manifest = json.loads((ROOT / "data" / "model-assets-manifest.json").read_text(encoding="utf-8"))

    assert manifest["status"] == "awaiting_human_asset_approval"
    assert manifest["policy"]["external_downloads"] == "blocked_until_human_source_and_license_approval"
    assert manifest["policy"]["train_models_present"] is True
    assert {family["family_id"] for family in manifest["families"]} == {
        "steel_classic",
        "pneumatic",
        "automatic_recent",
        "pneumatic_generic",
        "rer_generic_A",
        "rer_generic_B",
        "rer_generic_C",
        "rer_generic_D",
        "rer_generic_E",
    }
    standard_families = [
        family for family in manifest["families"]
        if family["family_id"] not in {"pneumatic_generic", "rer_generic_A", "rer_generic_B", "rer_generic_C", "rer_generic_D", "rer_generic_E"}
    ]
    assert all(family["asset"]["source_uri"] is None for family in standard_families)
    assert all(family["asset"]["license"] is None for family in standard_families)
    assert all(
        family["livery"]["status"] == "awaiting_human_validation"
        for family in standard_families
    )

    reference = next(family for family in manifest["families"] if family["family_id"] == "pneumatic_generic")
    assert reference["asset"]["status"] == "awaiting_human_asset_approval"
    assert reference["asset"]["license"] == "unresolved"
    assert reference["asset"]["provenance"]["source_kind"] == "reference_hero"
    assert reference["asset"]["provenance"]["derivative_policy"] == "internal_reference_only_never_publish"
    assert not provenance_is_complete(reference["asset"]["provenance"])

    rer_families = [family for family in manifest["families"] if family["family_id"].startswith("rer_generic_")]
    assert len(rer_families) == 5
    assert all(family["asset"]["status"] == "awaiting_human_asset_approval" for family in rer_families)
    assert all(family["asset"]["provenance"]["source_kind"] == "clean_room_generated" for family in rer_families)
    assert all(len(family["asset"]["sha256"]) == 64 for family in rer_families)


def test_unresolved_reference_cannot_be_active_or_instanced() -> None:
    reference = {
        "family_id": "pneumatic_generic",
        "asset": {"license": "unresolved", "status": "active", "role": "reference"},
    }
    with pytest.raises(ValueError, match="cannot be active or instanced"):
        validate_asset_lifecycle([reference])

    reference["asset"] = {"license": "unresolved", "status": "awaiting_human_asset_approval", "role": "instanced"}
    with pytest.raises(ValueError, match="cannot be active or instanced"):
        validate_asset_lifecycle([reference])


def test_served_manifest_excludes_canonical_provenance() -> None:
    manifest = json.loads((ROOT / "web" / "public" / "data" / "model-assets-manifest.json").read_text(encoding="utf-8"))
    reference = next(family for family in manifest["families"] if family["family_id"] == "pneumatic_generic")
    assert set(reference) == {"family_id", "status", "dimensions_m", "asset_file", "sha256"}
    assert "provenance" not in json.dumps(manifest)


def test_manifest_carries_all_metro_line_route_colours() -> None:
    manifest = json.loads((ROOT / "data" / "model-assets-manifest.json").read_text(encoding="utf-8"))
    assignments = [
        assignment for assignment in manifest["line_assignments"]
        if assignment["short_name"] not in {"A", "B", "C", "D", "E"}
    ]

    assert len(assignments) == 16
    assert {assignment["short_name"] for assignment in assignments} == {
        "1",
        "2",
        "3",
        "3bis",
        "4",
        "5",
        "6",
        "7",
        "7bis",
        "8",
        "9",
        "10",
        "11",
        "12",
        "13",
        "14",
    }
    assert all(assignment["livery_color_status"] == "pending_human_validation" for assignment in assignments)


def test_manifest_carries_all_rer_assignments() -> None:
    manifest = json.loads((ROOT / "data" / "model-assets-manifest.json").read_text(encoding="utf-8"))
    rer = [assignment for assignment in manifest["line_assignments"] if assignment["short_name"] in {"A", "B", "C", "D", "E"}]

    assert len(rer) == 5
    assert {assignment["family_id"] for assignment in rer} == {
        "rer_generic_A",
        "rer_generic_B",
        "rer_generic_C",
        "rer_generic_D",
        "rer_generic_E",
    }


def test_rer_manifest_hashes_match_published_assets() -> None:
    manifest = json.loads((ROOT / "data" / "model-assets-manifest.json").read_text(encoding="utf-8"))
    rer_families = [family for family in manifest["families"] if family["family_id"].startswith("rer_generic_")]

    for family in rer_families:
        asset_path = ROOT / "web" / "public" / "models" / family["asset"]["asset_file"]
        digest = hashlib.sha256(asset_path.read_bytes()).hexdigest()
        assert family["asset"]["sha256"] == digest
        assert family["asset"]["provenance"]["source_sha256"] == digest
