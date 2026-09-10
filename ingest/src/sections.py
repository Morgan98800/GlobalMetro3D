"""Derive Metro Paris above-ground/ground/tunnel sections from OpenStreetMap.

The OSM ways are deliberately kept as an input to this step: no list of aerial
sections is hard-coded.  Ways are classified from ``tunnel``/``bridge``/``layer``
tags, then projected onto the canonical, resampled GTFS shapes already produced
by the ingestion pipeline.
"""

from __future__ import annotations

import json
import math
import re
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import requests


OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter"
DEFAULT_BBOX = (48.72, 1.95, 49.08, 2.75)  # south, west, north, east


def _numeric_layers(value: str | None) -> list[float]:
    if not value:
        return []
    result: list[float] = []
    for raw in re.split(r"[;,]", value):
        try:
            result.append(float(raw.strip()))
        except ValueError:
            continue
    return result


def classify_osm_way(tags: dict[str, Any]) -> tuple[str, str | None]:
    """Return the requested section class and a conflict marker if applicable."""
    tunnel = str(tags.get("tunnel", "")).lower()
    bridge = str(tags.get("bridge", "")).lower()
    layers = _numeric_layers(str(tags.get("layer", "")))
    has_subterranean = tunnel == "yes" or any(layer < 0 for layer in layers)
    has_aerial = bridge in {"yes", "viaduct"} or any(layer > 0 for layer in layers)
    if has_subterranean and has_aerial:
        return "souterrain", "subterranean_and_aerial_tags"
    if has_subterranean:
        return "souterrain", None
    if has_aerial:
        return "aerien", None
    return "sol", None


def parse_osm_line_name(tags: dict[str, Any], supported_line_names: set[str]) -> str | None:
    """Resolve a way to one of the 16 GTFS metro line names when possible."""
    candidates = [str(tags.get("ref", "")), str(tags.get("name", ""))]
    for value in candidates:
        value = value.strip()
        if value in supported_line_names:
            return value
        match = re.search(r"(?:m[eé]tro|ligne)\s*([0-9]+(?:bis)?)\b", value, flags=re.IGNORECASE)
        if match and match.group(1) in supported_line_names:
            return match.group(1)
    return None


def fetch_osm_ways(
    bbox: tuple[float, float, float, float] = DEFAULT_BBOX,
    endpoint: str = OVERPASS_ENDPOINT,
    timeout_s: int = 120,
) -> list[dict[str, Any]]:
    """Fetch ways in four requests to keep Overpass responses cacheable and small."""
    south, west, north, east = bbox
    mid_lat = (south + north) / 2
    mid_lon = (west + east) / 2
    boxes = [
        (south, west, mid_lat, mid_lon),
        (south, mid_lon, mid_lat, east),
        (mid_lat, west, north, mid_lon),
        (mid_lat, mid_lon, north, east),
    ]
    ways: dict[int, dict[str, Any]] = {}
    query_template = "[out:json][timeout:90];way[railway=subway]({});out tags geom;"
    session = requests.Session()
    session.headers.update({"User-Agent": "paris-subway-3d/sections-ingest"})
    for index, (s, w, n, e) in enumerate(boxes):
        query = query_template.format(f"{s},{w},{n},{e}")
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                response = session.post(endpoint, data={"data": query}, timeout=timeout_s)
                response.raise_for_status()
                payload = response.json()
                for way in payload.get("elements", []):
                    if way.get("type") == "way" and way.get("geometry"):
                        ways[int(way["id"])] = way
                break
            except Exception as exc:  # pragma: no cover - endpoint-dependent retry path
                last_error = exc
                time.sleep(1.5 * (attempt + 1))
        if last_error is not None:
            raise RuntimeError(f"Overpass request {index + 1}/4 failed") from last_error
    return list(ways.values())


def _load_v1_shapes(path: Path) -> list[dict[str, Any]]:
    import struct

    data = path.read_bytes()
    if data[:4] != b"MSHP":
        raise ValueError(f"Unsupported shapes.bin format: {path}")
    count = struct.unpack_from("<H", data, 6)[0]
    shapes: list[dict[str, Any]] = []
    header_size = 32
    entry_size = 64
    data_start = header_size + count * entry_size
    for index in range(count):
        entry = header_size + index * entry_size
        sid = data[entry : entry + 32].split(b"\0", 1)[0].decode("utf-8")
        route_id = data[entry + 32 : entry + 48].split(b"\0", 1)[0].decode("utf-8")
        direction = data[entry + 48]
        point_count = struct.unpack_from("<I", data, entry + 52)[0]
        offset = struct.unpack_from("<I", data, entry + 60)[0]
        values = struct.unpack_from(f"<{point_count * 3}f", data, data_start + offset)
        coords = [(values[i * 3], values[i * 3 + 1]) for i in range(point_count)]
        distances = [values[i * 3 + 2] for i in range(point_count)]
        shapes.append(
            {
                "shape_id": sid,
                "route_id": route_id,
                "direction_id": str(direction),
                "coords": coords,
                "distances": distances,
                "length_m": distances[-1] if distances else 0.0,
            }
        )
    return shapes


def _xy(point: tuple[float, float], origin: tuple[float, float]) -> tuple[float, float]:
    lon, lat = point
    lon0, lat0 = origin
    scale = 111_320.0
    return ((lon - lon0) * scale * math.cos(math.radians(lat0)), (lat - lat0) * scale)


def _project_point(point: tuple[float, float], coords: list[tuple[float, float]]) -> tuple[float, float]:
    """Return (distance-to-shape in metres, curvilinear distance in metres)."""
    if len(coords) < 2:
        return (float("inf"), 0.0)
    origin = coords[0]
    px, py = _xy(point, origin)
    best_dist = float("inf")
    best_s = 0.0
    accumulated = 0.0
    for a, b in zip(coords, coords[1:]):
        ax, ay = _xy(a, origin)
        bx, by = _xy(b, origin)
        vx, vy = bx - ax, by - ay
        length_sq = vx * vx + vy * vy
        if length_sq <= 1e-9:
            fraction = 0.0
        else:
            fraction = max(0.0, min(1.0, ((px - ax) * vx + (py - ay) * vy) / length_sq))
        qx, qy = ax + fraction * vx, ay + fraction * vy
        distance = math.hypot(px - qx, py - qy)
        segment_length = math.sqrt(length_sq)
        if distance < best_dist:
            best_dist = distance
            best_s = accumulated + fraction * segment_length
        accumulated += segment_length
    return best_dist, best_s


class _ShapeProjector:
    """Fast nearest-segment projection using a small vertex index per shape."""

    def __init__(self, coords: list[tuple[float, float]]):
        import numpy as np
        from scipy.spatial import cKDTree

        self.coords = coords
        self.origin = coords[0]
        self.xy = np.array([_xy(point, self.origin) for point in coords], dtype=float)
        self.distances = np.zeros(len(coords), dtype=float)
        if len(coords) > 1:
            self.distances[1:] = np.cumsum(np.linalg.norm(self.xy[1:] - self.xy[:-1], axis=1))
        self.tree = cKDTree(self.xy)

    def project(self, point: tuple[float, float]) -> tuple[float, float]:
        import numpy as np

        p = np.array(_xy(point, self.origin), dtype=float)
        _, vertex_index = self.tree.query(p)
        best_distance = float("inf")
        best_s = 0.0
        first = max(0, int(vertex_index) - 2)
        last = min(len(self.xy) - 1, int(vertex_index) + 2)
        for index in range(first, last):
            a = self.xy[index]
            b = self.xy[index + 1]
            vector = b - a
            length_sq = float(vector @ vector)
            fraction = 0.0 if length_sq <= 1e-9 else max(0.0, min(1.0, float(((p - a) @ vector) / length_sq)))
            candidate = a + fraction * vector
            distance = float(np.linalg.norm(p - candidate))
            if distance < best_distance:
                best_distance = distance
                best_s = float(self.distances[index] + fraction * math.sqrt(length_sq))
        return best_distance, best_s


def _nearest_station(d: float, stations: list[dict[str, Any]], shape: dict[str, Any], projector: _ShapeProjector) -> str | None:
    candidates = []
    for station in stations:
        _, station_s = projector.project(tuple(station["coordinates"]))
        candidates.append((abs(station_s - d), station["name"]))
    if not candidates:
        return None
    return min(candidates)[1]


def _merge_intervals(intervals: list[dict[str, Any]], stations: list[dict[str, Any]], shape: dict[str, Any], projector: _ShapeProjector) -> list[dict[str, Any]]:
    if not intervals:
        return []
    intervals = sorted(intervals, key=lambda item: item["d_start_m"])
    merged: list[dict[str, Any]] = []
    for current in intervals:
        if merged and current["d_start_m"] <= merged[-1]["d_end_m"] + 80.0:
            merged[-1]["d_end_m"] = max(merged[-1]["d_end_m"], current["d_end_m"])
            merged[-1]["osm_way_ids"].extend(current["osm_way_ids"])
        else:
            merged.append({**current, "osm_way_ids": list(current["osm_way_ids"])})
    for item in merged:
        item["osm_way_ids"] = sorted(set(item["osm_way_ids"]))
        item["station_start"] = _nearest_station(item["d_start_m"], stations, shape, projector)
        item["station_end"] = _nearest_station(item["d_end_m"], stations, shape, projector)
        item["length_m"] = round(item["d_end_m"] - item["d_start_m"], 1)
        item["d_start_m"] = round(item["d_start_m"], 1)
        item["d_end_m"] = round(item["d_end_m"], 1)
    return merged


def derive_sections(
    osm_ways: Iterable[dict[str, Any]],
    shapes: list[dict[str, Any]],
    lines: list[dict[str, Any]],
    stations: list[dict[str, Any]],
    max_projection_error_m: float = 120.0,
) -> dict[str, Any]:
    line_name_by_id = {line["id"]: line["short_name"] for line in lines}
    supported_line_names = set(line_name_by_id.values())
    route_shapes: dict[tuple[str, str], dict[str, Any]] = {}
    for shape in shapes:
        line_name = line_name_by_id.get(shape["route_id"])
        if line_name not in supported_line_names:
            continue
        key = (line_name, shape["direction_id"])
        if key not in route_shapes or shape["length_m"] > route_shapes[key]["length_m"]:
            route_shapes[key] = shape

    station_by_line: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for station in stations:
        for route_id in station.get("lines", []):
            line_name = line_name_by_id.get(route_id)
            if line_name in supported_line_names:
                station_by_line[line_name].append(station)

    projectors = {key: _ShapeProjector(shape["coords"]) for key, shape in route_shapes.items()}

    projected: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    unresolved: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []
    classified_counts = defaultdict(int)
    way_count = 0
    osm_way_count = 0
    for way in osm_ways:
        osm_way_count += 1
        tags = way.get("tags", {})
        line_name = parse_osm_line_name(tags, supported_line_names)
        if line_name is None:
            unresolved.append(
                {
                    "osm_way_id": int(way.get("id", 0)),
                    "ref": tags.get("ref"),
                    "name": tags.get("name"),
                    "section_type": classify_osm_way(tags)[0],
                }
            )
            continue
        geometry = [(float(node["lon"]), float(node["lat"])) for node in way.get("geometry", [])]
        if len(geometry) < 2:
            continue
        section_type, conflict = classify_osm_way(tags)
        classified_counts[section_type] += 1
        way_count += 1
        if conflict:
            conflicts.append({"osm_way_id": way["id"], "line": line_name, "reason": conflict})

        for direction in ("0", "1"):
            shape = route_shapes.get((line_name, direction))
            if not shape:
                continue
            projections = [projectors[(line_name, direction)].project(point) for point in geometry]
            errors = [distance for distance, _ in projections]
            if not errors or sum(errors) / len(errors) > max_projection_error_m:
                continue
            start = min(value[1] for value in projections)
            end = max(value[1] for value in projections)
            if end - start < 5.0:
                continue
            projected[(line_name, direction, section_type)].append(
                {
                    "d_start_m": start,
                    "d_end_m": end,
                    "osm_way_ids": [int(way["id"])],
                }
            )

    section_lines_by_key: dict[tuple[str, str], dict[str, Any]] = {}
    for (line_name, direction, section_type), intervals in sorted(projected.items()):
        shape = route_shapes[(line_name, direction)]
        line_sections = _merge_intervals(intervals, station_by_line[line_name], shape, projectors[(line_name, direction)])
        if line_sections:
            entry = section_lines_by_key.setdefault(
                (line_name, direction),
                {
                    "line": line_name,
                    "direction": int(direction),
                    "shape_id": shape["shape_id"],
                    "shape_length_m": round(shape["length_m"], 1),
                    "sections": [],
                },
            )
            entry["sections"].extend({"type": section_type, **section} for section in line_sections)
    section_lines = sorted(section_lines_by_key.values(), key=lambda item: (item["line"], item["direction"]))

    aerial_by_direction: dict[tuple[str, int], float] = defaultdict(float)
    aerial_sections: list[dict[str, Any]] = []
    manual_review_sections: list[dict[str, Any]] = []
    for line in section_lines:
        for section in line["sections"]:
            if section["type"] == "aerien":
                aerial_by_direction[(line["line"], line["direction"])] += section["length_m"]
                review_flags: list[str] = []
                if section["length_m"] < 100.0:
                    review_flags.append("short_section")
                if section["station_start"] and section["station_start"] == section["station_end"]:
                    review_flags.append("same_endpoint_station")
                aerial_row = {
                    "line": line["line"],
                    "direction": line["direction"],
                    "d_start_m": section["d_start_m"],
                    "d_end_m": section["d_end_m"],
                    "station_start": section["station_start"],
                    "station_end": section["station_end"],
                    "length_m": section["length_m"],
                    "osm_way_ids": section["osm_way_ids"],
                    "review_flags": review_flags,
                }
                aerial_sections.append(aerial_row)
                if review_flags:
                    manual_review_sections.append(aerial_row)
    per_line_physical: dict[str, float] = {}
    for line_name in sorted(supported_line_names):
        values = [value for (name, _direction), value in aerial_by_direction.items() if name == line_name]
        if values:
            per_line_physical[line_name] = round(sum(values) / len(values), 1)

    return {
        "schema_version": 1,
        "source": {
            "provider": "OpenStreetMap Overpass",
            "query": "way[railway=subway]",
            "bbox": list(DEFAULT_BBOX),
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "classification": {
                "souterrain": "tunnel=yes OR layer < 0",
                "aerien": "bridge=yes OR layer > 0",
                "sol": "neither",
                "conflict_precedence": "souterrain",
            },
        },
        "summary": {
            "osm_ways_fetched": osm_way_count,
            "osm_ways_considered": way_count,
            "classified_way_counts": dict(sorted(classified_counts.items())),
            "unresolved_line_ways": len(unresolved),
            "tag_conflicts": len(conflicts),
            "aerial_sections": len(aerial_sections),
            "aerial_sections_needing_manual_review": len(manual_review_sections),
            "aerial_km_directional": round(sum(aerial_by_direction.values()) / 1000.0, 3),
            "aerial_km_network_physical_estimate": round(sum(per_line_physical.values()) / 1000.0, 3),
            "aerial_km_by_line": {key: value / 1000.0 for key, value in sorted(per_line_physical.items())},
        },
        "aerial_sections": sorted(aerial_sections, key=lambda item: (item["line"], item["direction"], item["d_start_m"])),
        "manual_review_sections": sorted(manual_review_sections, key=lambda item: (item["line"], item["direction"], item["d_start_m"])),
        "sections_by_line_direction": section_lines,
        "tag_conflicts": conflicts,
        "unresolved_line_ways": unresolved,
    }


def apply_overrides(artifact: dict[str, Any], overrides: dict[str, Any] | None) -> dict[str, Any]:
    """Apply reviewed human corrections without modifying the OSM derivation."""
    if not overrides:
        artifact["overrides_applied"] = 0
        return artifact

    by_key: dict[tuple[str, int], dict[str, Any]] = {
        (item["line"], int(item["direction"])): item
        for item in artifact["sections_by_line_direction"]
    }
    applied = 0

    def matches(section: dict[str, Any], rule: dict[str, Any]) -> bool:
        if section.get("type") != rule.get("type"):
            return False
        return abs(float(section.get("d_start_m", 0)) - float(rule.get("d_start_m", 0))) <= 1.0 and abs(
            float(section.get("d_end_m", 0)) - float(rule.get("d_end_m", 0))
        ) <= 1.0

    for rule in overrides.get("remove", []):
        entry = by_key.get((str(rule["line"]), int(rule["direction"])))
        if entry:
            before = len(entry["sections"])
            entry["sections"] = [section for section in entry["sections"] if not matches(section, rule)]
            applied += before - len(entry["sections"])

    for rule in overrides.get("replace", []):
        entry = by_key.get((str(rule["line"]), int(rule["direction"])))
        if not entry:
            continue
        for index, section in enumerate(entry["sections"]):
            if matches(section, rule):
                replacement = {**section, **rule}
                replacement.pop("line", None)
                replacement.pop("direction", None)
                entry["sections"][index] = replacement
                applied += 1

    for rule in overrides.get("add", []):
        key = (str(rule["line"]), int(rule["direction"]))
        entry = by_key.get(key)
        if not entry:
            entry = {
                "line": key[0],
                "direction": key[1],
                "shape_id": None,
                "shape_length_m": None,
                "sections": [],
            }
            artifact["sections_by_line_direction"].append(entry)
            by_key[key] = entry
        section = {key_name: value for key_name, value in rule.items() if key_name not in {"line", "direction"}}
        section.setdefault("osm_way_ids", [])
        section.setdefault("length_m", round(float(section["d_end_m"]) - float(section["d_start_m"]), 1))
        entry["sections"].append(section)
        applied += 1

    artifact["sections_by_line_direction"] = sorted(
        artifact["sections_by_line_direction"], key=lambda item: (item["line"], item["direction"])
    )
    artifact["overrides_applied"] = applied
    return artifact


def build_sections_artifact(
    shapes_path: str | Path,
    lines_path: str | Path,
    stations_path: str | Path,
    output_path: str | Path,
    osm_ways: list[dict[str, Any]] | None = None,
    overrides_path: str | Path | None = None,
) -> dict[str, Any]:
    if osm_ways is None:
        osm_ways = fetch_osm_ways()
    shapes = _load_v1_shapes(Path(shapes_path))
    lines = json.loads(Path(lines_path).read_text(encoding="utf-8"))
    stations = json.loads(Path(stations_path).read_text(encoding="utf-8"))
    artifact = derive_sections(osm_ways, shapes, lines, stations)
    overrides = json.loads(Path(overrides_path).read_text(encoding="utf-8")) if overrides_path else None
    artifact = apply_overrides(artifact, overrides)
    Path(output_path).write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return artifact
