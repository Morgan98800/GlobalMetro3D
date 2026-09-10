import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_train_asset_manifest_keeps_external_assets_gated() -> None:
    manifest = json.loads((ROOT / "data" / "model-assets-manifest.json").read_text(encoding="utf-8"))

    assert manifest["status"] == "awaiting_human_asset_approval"
    assert manifest["policy"]["external_downloads"] == "blocked_until_human_source_and_license_approval"
    assert manifest["policy"]["train_models_present"] is False
    assert {family["family_id"] for family in manifest["families"]} == {
        "steel_classic",
        "pneumatic",
        "automatic_recent",
    }
    assert all(family["asset"]["source_uri"] is None for family in manifest["families"])
    assert all(family["asset"]["license"] is None for family in manifest["families"])
    assert all(
        family["livery"]["status"] == "awaiting_human_validation"
        for family in manifest["families"]
    )


def test_manifest_carries_all_metro_line_route_colours() -> None:
    manifest = json.loads((ROOT / "data" / "model-assets-manifest.json").read_text(encoding="utf-8"))
    assignments = manifest["line_assignments"]

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
