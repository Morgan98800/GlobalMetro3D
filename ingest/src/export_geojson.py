"""
Control GeoJSON Exporter for Paris Subway Visual Validation
Generates control_network.geojson containing all canonical tracks and station nodes.
Ready for drag-and-drop into geojson.io to compare with the official network map.
"""

import json
import os
from typing import Dict, List, Any


def export_control_geojson(
    lines_data: List[Dict[str, Any]],
    stations_data: List[Dict[str, Any]],
    shapes_data: Dict[str, Dict[str, Any]],
    output_path: str
) -> str:
    """
    Exports a comprehensive GeoJSON FeatureCollection with:
    1. LineString features for all tracks, styled with authoritative route_color.
    2. Point features for all stations, annotated with served lines.
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    features = []

    # Map line_id to line dict
    line_by_id = {l["id"]: l for l in lines_data}

    # 1. Add Track Polylines (LineString)
    for sid, sinfo in shapes_data.items():
        coords = sinfo["coordinates"]  # list of [lon, lat]
        if len(coords) < 2:
            continue

        rid = sinfo.get("route_id", "")
        line_info = line_by_id.get(rid, {})
        color = line_info.get("color", "#CCCCCC")
        sname = line_info.get("short_name", "")
        dir_id = sinfo.get("direction_id", 0)
        dest = line_info.get("destinations", {}).get(str(dir_id), "")
        length_km = round(sinfo.get("length_m", 0.0) / 1000.0, 2)

        features.append({
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": coords
            },
            "properties": {
                "feature_type": "track",
                "shape_id": sid,
                "line_id": rid,
                "line_short_name": sname,
                "direction_id": dir_id,
                "destination": dest,
                "stroke": color,
                "stroke-width": 4,
                "stroke-opacity": 0.9,
                "length_km": length_km
            }
        })

    # 2. Add Station Nodes (Point)
    for st in stations_data:
        coords = st["coordinates"] # [lon, lat]
        # Resolve line short names for popup
        served_names = [line_by_id[lid]["short_name"] for lid in st.get("lines", []) if lid in line_by_id]
        served_names = sorted(list(set(served_names)), key=lambda x: (len(x), x))

        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": coords
            },
            "properties": {
                "feature_type": "station",
                "station_id": st["id"],
                "name": st["name"],
                "lines": served_names,
                "lines_str": "M" + ", M".join(served_names),
                "is_hub": st.get("is_hub", False),
                "marker-color": "#EFE9DD",
                "marker-size": "small" if not st.get("is_hub") else "medium"
            }
        })

    feature_collection = {
        "type": "FeatureCollection",
        "name": "Paris Metro 3D - Control Network",
        "features": features
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(feature_collection, f, ensure_ascii=False, indent=2)

    print(f"[export] Saved control GeoJSON to {output_path} ({len(features)} features)")
    return output_path
