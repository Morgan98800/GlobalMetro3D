"""Build the native RER metadata and merge it with the metro artifacts."""

from __future__ import annotations

import csv
import io
import json
import math
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


RER_NAMES = {"A", "B", "C", "D", "E"}
RER_ROUTE_TYPE = "2"

# IDFM's mission codes (for example UZAR, ERIO or VACK) are useful for
# operations but are not passenger-facing destinations. Keep the complete
# branch termini in the line metadata so the map and the direction controls
# describe the actual RER network.
RER_DESTINATIONS: dict[str, dict[str, str]] = {
    "A": {
        "0": "Cergy–Le Haut · Poissy · Saint-Germain-en-Laye",
        "1": "Marne-la-Vallée–Chessy · Boissy-Saint-Léger",
    },
    "B": {
        "0": "Aéroport Charles-de-Gaulle 2 TGV · Mitry–Claye",
        "1": "Saint-Rémy-lès-Chevreuse · Robinson",
    },
    "C": {
        "0": "Pontoise · Versailles Château Rive Gauche · Saint-Quentin-en-Yvelines",
        "1": "Massy–Palaiseau · Dourdan–La Forêt · Saint-Martin-d'Étampes",
    },
    "D": {
        "0": "Creil",
        "1": "Malesherbes · Melun",
    },
    "E": {
        "0": "Nanterre–La Folie",
        "1": "Tournan · Chelles–Gournay",
    },
}


def _norm_color(value: str, fallback: str) -> str:
    value = (value or "").strip().lstrip("#")
    return f"#{value.upper()}" if len(value) == 6 else fallback


def _distance_km(coords: list[list[float]]) -> float:
    if len(coords) < 2:
        return 0.0
    total = 0.0
    for a, b in zip(coords, coords[1:]):
        lon1, lat1 = a
        lon2, lat2 = b
        lat = math.radians((lat1 + lat2) / 2)
        dx = math.radians(lon2 - lon1) * math.cos(lat) * 6371.0088
        dy = math.radians(lat2 - lat1) * 6371.0088
        total += math.hypot(dx, dy)
    return total


def build_rer_artifacts(raw_zip: str | Path, processed_dir: str | Path, web_data_dir: str | Path) -> None:
    """Extract A–E from the authoritative GTFS and merge RER stations/lines."""
    processed = Path(processed_dir)
    web_data = Path(web_data_dir)
    processed.mkdir(parents=True, exist_ok=True)
    web_data.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(raw_zip) as archive:
        routes: dict[str, dict[str, Any]] = {}
        with archive.open("routes.txt") as handle:
            for row in csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8-sig")):
                if row.get("route_type") == RER_ROUTE_TYPE and row.get("route_short_name", "").strip() in RER_NAMES:
                    routes[row["route_id"]] = row

        trip_routes: dict[str, str] = {}
        trip_dirs: dict[str, str] = {}
        trip_shapes: dict[str, str] = {}
        heads: dict[str, Counter[str]] = defaultdict(Counter)
        shape_ids: set[str] = set()
        with archive.open("trips.txt") as handle:
            for row in csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8-sig")):
                route_id = row.get("route_id", "")
                if route_id not in routes:
                    continue
                trip_id = row["trip_id"]
                trip_routes[trip_id] = route_id
                trip_dirs[trip_id] = row.get("direction_id", "0")
                shape_id = row.get("shape_id", "").strip()
                trip_shapes[trip_id] = shape_id
                if shape_id:
                    shape_ids.add(shape_id)
                heads[route_id, trip_dirs[trip_id]][row.get("trip_headsign", "").strip()] += 1

        stop_routes: dict[str, set[str]] = defaultdict(set)
        with archive.open("stop_times.txt") as handle:
            for row in csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8-sig")):
                route_id = trip_routes.get(row.get("trip_id", ""))
                if route_id:
                    stop_routes[row["stop_id"].strip()].add(route_id)

        stops: dict[str, dict[str, str]] = {}
        with archive.open("stops.txt") as handle:
            for row in csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8-sig")):
                stops[row["stop_id"].strip()] = row

        rer_stations: dict[str, dict[str, Any]] = {}
        rer_station_samples: dict[str, list[tuple[float, float]]] = defaultdict(list)
        for stop_id, route_ids in stop_routes.items():
            stop = stops.get(stop_id)
            if not stop:
                continue
            station_id = stop.get("parent_station", "").strip() or stop_id
            coordinate = (float(stop.get("stop_lon", 0) or 0), float(stop.get("stop_lat", 0) or 0))
            rer_station_samples[station_id].append(coordinate)
            station = rer_stations.setdefault(
                station_id,
                {
                    "id": station_id,
                    "name": stop.get("stop_name", "").strip(),
                    "coordinates": [round(float(stop.get("stop_lon", 0) or 0), 6), round(float(stop.get("stop_lat", 0) or 0), 6)],
                    "lines": set(),
                    "is_hub": False,
                    "wheelchair_boarding": int(stop.get("wheelchair_boarding", 0) or 0),
                },
            )
            station["lines"].update(route_ids)

        for station_id, station in rer_stations.items():
            samples = rer_station_samples.get(station_id, [])
            if samples:
                lons = sorted(point[0] for point in samples)
                lats = sorted(point[1] for point in samples)
                middle = len(samples) // 2
                lon = lons[middle] if len(samples) % 2 else (lons[middle - 1] + lons[middle]) / 2
                lat = lats[middle] if len(samples) % 2 else (lats[middle - 1] + lats[middle]) / 2
                station["coordinates"] = [round(lon, 6), round(lat, 6)]

        stations_path = processed / "stations.json"
        with stations_path.open(encoding="utf-8") as handle:
            stations = json.load(handle)
        by_station = {station["id"]: station for station in stations}
        for station in rer_stations.values():
            existing = by_station.get(station["id"])
            if existing:
                existing["lines"] = sorted(set(existing.get("lines", [])) | set(station["lines"]))
                existing["is_hub"] = len(existing["lines"]) >= 2
            else:
                station["lines"] = sorted(station["lines"])
                station["is_hub"] = len(station["lines"]) >= 2
                stations.append(station)
        stations.sort(key=lambda station: station["name"])
        for station in stations:
            station["lines"] = sorted(station.get("lines", []))
            station["is_hub"] = len(station["lines"]) >= 2
        for target in (stations_path, web_data / "stations.json"):
            target.write_text(json.dumps(stations, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        lines_path = processed / "lines.json"
        with lines_path.open(encoding="utf-8") as handle:
            lines = json.load(handle)

        # Rebuild RER geometry from the full GTFS shapes. The earlier artifact
        # only contained central sections, so outer stations (notably on A/C/D)
        # could never line up with their tracks. Keep the two longest shapes
        # per direction: this retains the principal branches without dumping
        # every near-duplicate timetable shape into the browser.
        shape_points: dict[str, list[tuple[int, float, float]]] = defaultdict(list)
        with archive.open("shapes.txt") as handle:
            for row in csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8-sig")):
                shape_id = row.get("shape_id", "").strip()
                if shape_id in shape_ids:
                    shape_points[shape_id].append((
                        int(row.get("shape_pt_sequence", 0) or 0),
                        float(row.get("shape_pt_lon", 0) or 0),
                        float(row.get("shape_pt_lat", 0) or 0),
                    ))
        shape_routes: dict[str, set[tuple[str, str]]] = defaultdict(set)
        for trip_id, shape_id in trip_shapes.items():
            if shape_id:
                shape_routes[shape_id].add((trip_routes[trip_id], trip_dirs[trip_id]))

        raw_tracks: list[dict[str, Any]] = []
        route_track_paths: dict[str, list[list[list[float]]]] = defaultdict(list)
        for route_id, route in routes.items():
            for direction in sorted({direction for sid in shape_routes for rid, direction in shape_routes[sid] if rid == route_id}):
                candidates: list[tuple[float, str, list[list[float]]]] = []
                for shape_id, route_dirs in shape_routes.items():
                    if (route_id, direction) not in route_dirs:
                        continue
                    ordered = sorted(shape_points.get(shape_id, []))
                    coordinates = [[round(point[1], 6), round(point[2], 6)] for point in ordered]
                    if len(coordinates) >= 2:
                        candidates.append((_distance_km(coordinates), shape_id, coordinates))
                # Keep every substantial shape (>=15 km). This covers all
                # branch termini while excluding short timetable fragments;
                # the GTFS contains repeated geometry for different runs.
                for distance_km, shape_id, coordinates in sorted(candidates, reverse=True):
                    if distance_km < 15.0:
                        continue
                    item = {
                        "shape_id": shape_id,
                        "route_id": route_id,
                        "name": route.get("route_short_name", "").strip(),
                        "color": _norm_color(route.get("route_color", ""), "#888888"),
                        "coordinates": coordinates,
                        "text_color": _norm_color(route.get("route_text_color", "FFFFFF"), "#FFFFFF"),
                        "short_name": route.get("route_short_name", "").strip(),
                        "direction_id": direction,
                    }
                    raw_tracks.append(item)
                    route_track_paths[route_id].append(coordinates)
        for target in (processed / "rer_lines.json", web_data / "rer_lines.json"):
            target.write_text(json.dumps(raw_tracks, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

        existing_line_ids = {line["id"] for line in lines}
        rer_meta: list[dict[str, Any]] = []
        for route_id, route in sorted(routes.items(), key=lambda pair: pair[1].get("route_short_name", "")):
            short_name = route["route_short_name"].strip()
            direction_heads = {
                direction: (counter.most_common(1)[0][0] if counter else short_name)
                for (rid, direction), counter in heads.items()
                if rid == route_id
            }
            paths = route_track_paths.get(route_id, [])
            coords = max(paths, key=_distance_km) if paths else []
            line = {
                "id": route_id,
                "short_name": short_name,
                "long_name": route.get("route_long_name", "").strip() or f"RER {short_name}",
                "color": _norm_color(route.get("route_color", ""), "#777777"),
                "text_color": _norm_color(route.get("route_text_color", ""), "#FFFFFF"),
                "mode": "rail",
                "destinations": RER_DESTINATIONS.get(short_name, {
                    "0": direction_heads.get("0", short_name),
                    "1": direction_heads.get("1", short_name),
                }),
                "measured_length_km": round(_distance_km(coords), 2),
                "elevation_offset": -2.0,
            }
            rer_meta.append(line)
            existing_index = next((index for index, existing in enumerate(lines) if existing.get("id") == route_id), None)
            if existing_index is not None:
                lines[existing_index] = line
            else:
                lines.append(line)

        lines.sort(key=lambda line: (0 if line.get("mode") == "metro" else 1, line.get("short_name", "")))
        for target in (lines_path, web_data / "lines.json"):
            target.write_text(json.dumps(lines, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        for target in (processed / "rer_lines_meta.json", web_data / "rer_lines_meta.json"):
            target.write_text(json.dumps(rer_meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
