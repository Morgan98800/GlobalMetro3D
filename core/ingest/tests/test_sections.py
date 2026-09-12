from core.ingest.src.sections import classify_osm_way, derive_sections


def test_osm_section_classification_precedence():
    assert classify_osm_way({"tunnel": "yes"}) == ("souterrain", None)
    assert classify_osm_way({"bridge": "yes"}) == ("aerien", None)
    assert classify_osm_way({"layer": "1"}) == ("aerien", None)
    assert classify_osm_way({"layer": "-1"}) == ("souterrain", None)
    assert classify_osm_way({"tunnel": "yes", "bridge": "yes", "layer": "1"}) == (
        "souterrain",
        "subterranean_and_aerial_tags",
    )


def test_sections_project_to_both_directions_and_flag_short_sections():
    lines = [{"id": "line-1", "short_name": "1"}]
    shapes = [
        {
            "shape_id": "shape-1-0",
            "route_id": "line-1",
            "direction_id": "0",
            "coords": [(2.30, 48.85), (2.31, 48.85), (2.32, 48.85)],
            "length_m": 1500.0,
        },
        {
            "shape_id": "shape-1-1",
            "route_id": "line-1",
            "direction_id": "1",
            "coords": [(2.32, 48.85), (2.31, 48.85), (2.30, 48.85)],
            "length_m": 1500.0,
        },
    ]
    stations = [
        {"id": "a", "name": "A", "coordinates": [2.30, 48.85], "lines": ["line-1"]},
        {"id": "b", "name": "B", "coordinates": [2.32, 48.85], "lines": ["line-1"]},
    ]
    ways = [
        {
            "id": 42,
            "tags": {"railway": "subway", "ref": "1", "bridge": "yes"},
            "geometry": [{"lon": 2.305, "lat": 48.85}, {"lon": 2.306, "lat": 48.85}],
        }
    ]

    artifact = derive_sections(ways, shapes, lines, stations)
    assert artifact["summary"]["aerial_sections"] == 2
    assert artifact["summary"]["aerial_sections_needing_manual_review"] == 2
    assert {entry["direction"] for entry in artifact["aerial_sections"]} == {0, 1}
