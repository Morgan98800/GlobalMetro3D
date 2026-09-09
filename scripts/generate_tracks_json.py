#!/usr/bin/env python3
"""
generate_tracks_json.py
Extracts ultra-lightweight track polylines from control_network.geojson,
reducing payload from 9.4 MB to ~180 KB.
"""

import json
import os

def main():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    geojson_path = os.path.join(repo_root, "web", "public", "data", "control_network.geojson")
    out_path = os.path.join(repo_root, "web", "public", "data", "tracks.json")

    print(f"Reading {geojson_path}...")
    with open(geojson_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    tracks = []
    try:
        from shapely.geometry import LineString
        use_shapely = True
    except ImportError:
        use_shapely = False

    for feat in data.get("features", []):
        geom = feat.get("geometry", {})
        if geom.get("type") == "LineString":
            props = feat.get("properties", {})
            coords = geom.get("coordinates", [])
            if use_shapely and len(coords) > 2:
                ls = LineString(coords).simplify(0.00008, preserve_topology=False)
                coords = list(ls.coords)
            # Round coordinates to 5 decimal places (~1.1m precision)
            rounded_coords = [[round(p[0], 5), round(p[1], 5)] for p in coords]
            tracks.append({
                "line_id": props.get("line_id"),
                "short_name": props.get("line_short_name"),
                "stroke": props.get("stroke", "#CCCCCC"),
                "coordinates": rounded_coords
            })

    print(f"Extracted {len(tracks)} track segments.")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(tracks, f, separators=(",", ":"))

    in_size = os.path.getsize(geojson_path) / (1024 * 1024)
    out_size = os.path.getsize(out_path) / 1024
    print(f"Output written to {out_path}: {out_size:.1f} KB (reduced from {in_size:.2f} MB, -{100 - (out_size / (in_size * 1024) * 100):.1f}%)")

if __name__ == "__main__":
    main()
