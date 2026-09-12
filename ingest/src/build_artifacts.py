"""
Artifacts Builder for Metro Parisien 3D (Phase A)
Generates:
- lines.json
- stations.json
- shapes.bin
- network.sqlite
- projection_metrics.json
- control_network.geojson
"""

import os
import json
import sqlite3
import struct
import unicodedata
from collections import defaultdict
from typing import Dict, List, Any, Tuple, Set
import numpy as np

from .filter_metro import MetroGTFSData, extract_metro_data
from .resample import resample_polyline_10m, offset_and_resample_shape
from .project import project_trip_stops_monotonically
from .export_geojson import export_control_geojson


STATION_COUNT_DRIFT_TOLERANCE = 0.02


def assert_station_count_drift_within_tolerance(
    previous_count: int,
    current_count: int,
    tolerance: float = STATION_COUNT_DRIFT_TOLERANCE,
) -> None:
    """Reject silent station-count drift between successive ingestion runs."""
    if previous_count <= 0 or current_count < 0:
        raise ValueError(f"Invalid station counts: previous={previous_count}, current={current_count}")
    drift = abs(current_count - previous_count) / previous_count
    if drift > tolerance:
        raise RuntimeError(
            "Metro station count drift exceeds the allowed "
            f"{tolerance:.1%}: previous={previous_count}, current={current_count}, drift={drift:.1%}"
        )


def normalize_text(text: str) -> str:
    """Removes accents and converts to lowercase for fast search."""
    nfkd = unicodedata.normalize('NFKD', text)
    return "".join([c for c in nfkd if not unicodedata.combining(c)]).lower().strip()


def time_to_seconds(time_str: str) -> int:
    """Converts GTFS HH:MM:SS string to seconds since midnight (supports >= 24h)."""
    parts = time_str.strip().split(":")
    if len(parts) == 3:
        h, m, s = int(parts[0]), int(parts[1]), int(parts[2])
        return h * 3600 + m * 60 + s
    return 0


# Elevation offsets per line (meters) to cleanly visualize underground intersections
LINE_ELEVATION_OFFSETS = {
    "1": 0.0,
    "2": 2.0,
    "3": 4.0,
    "3bis": 1.0,
    "4": 6.0,
    "5": 3.0,
    "6": 5.0,
    "7": 7.0,
    "7bis": 2.5,
    "8": 8.0,
    "9": 9.0,
    "10": 4.5,
    "11": 10.0,
    "12": 11.0,
    "13": 12.0,
    "14": 14.0
}


def build_all_phase_a_artifacts(zip_path: str, output_dir: str) -> None:
    """Main pipeline for Phase A: processes GTFS data and outputs all artifacts."""
    os.makedirs(output_dir, exist_ok=True)

    print("[build] Extracting metro data from GTFS...")
    data: MetroGTFSData = extract_metro_data(zip_path)

    # -------------------------------------------------------------------------
    # 1. Resample Shapes & Select Canonical Shapes per (route, direction)
    # -------------------------------------------------------------------------
    print("[build] Resampling shapes at 10m step...")
    # Map each shape_id to its (route_id, direction_id)
    shape_to_route = {}
    for t in data.trips.values():
        sid = t["shape_id"]
        if sid and sid not in shape_to_route:
            shape_to_route[sid] = (t["route_id"], t["direction_id"])

    resampled_shapes: Dict[str, Dict[str, Any]] = {}

    for sid, pts in data.shapes.items():
        if len(pts) < 2:
            continue
        coords_lon_lat = [(p[1], p[0]) for p in pts] # lon, lat
        r_id, d_id = shape_to_route.get(sid, ("", 0))
        res_coords, cum_dists, total_len = offset_and_resample_shape(
            coords_lon_lat,
            direction_id=d_id,
            step_meters=10.0
        )
        if sid in {"IDFM:shp_1_118", "IDFM:shp_1_114"} and len(res_coords) > 1600:
            # IDFM carries a short out-and-back loop near Place d'Italie in both
            # directions. Remove the measured loop before projecting stops.
            cut_start, cut_end = 1450, 1600
            removed_length = float(cum_dists[cut_end] - cum_dists[cut_start])
            res_coords = np.concatenate((res_coords[:cut_start], res_coords[cut_end:]))
            cum_dists = np.concatenate((
                cum_dists[:cut_start],
                cum_dists[cut_end:] - removed_length,
            ))
            total_len -= removed_length
        resampled_shapes[sid] = {
            "shape_id": sid,
            "route_id": r_id,
            "direction_id": d_id,
            "coords": res_coords, # np.ndarray (N, 2)
            "cum_dists": cum_dists, # np.ndarray (N,)
            "total_len_m": total_len,
            "point_count": len(res_coords)
        }

    print(f"[build] Resampled {len(resampled_shapes)} shapes.")

    # -------------------------------------------------------------------------
    # 2. Project Trip Stops Monotonically & Compute Offset Metrics
    # -------------------------------------------------------------------------
    print("[build] Projecting trip stops with strict monotonicity constraint...")
    trip_stop_projections: Dict[str, List[Dict[str, Any]]] = {}
    stop_sequence_cache: Dict[Tuple[str, Tuple[str, ...]], List[Dict[str, Any]]] = {}
    all_offsets: List[float] = []
    outliers_80m: List[Dict[str, Any]] = []

    # Map stop_id -> stop dict
    stops_dict = data.stops

    trips_processed = 0
    monotonicity_violations = 0

    for tid, trip in data.trips.items():
        sid = trip["shape_id"]
        if sid not in resampled_shapes:
            continue

        shape_info = resampled_shapes[sid]
        st_list = data.stop_times.get(tid, [])
        if not st_list:
            continue

        stop_ids_tuple = tuple(st["stop_id"] for st in st_list)
        cache_key = (sid, stop_ids_tuple)

        if cache_key in stop_sequence_cache:
            projections = stop_sequence_cache[cache_key]
        else:
            stop_tuples = []
            for st in st_list:
                stop_id = st["stop_id"]
                if stop_id in stops_dict:
                    stop_obj = stops_dict[stop_id]
                    stop_tuples.append((stop_id, stop_obj["lon"], stop_obj["lat"]))

            if not stop_tuples:
                continue

            projections = project_trip_stops_monotonically(
                stop_tuples,
                shape_info["coords"],
                shape_info["cum_dists"],
                min_station_gap_m=1.0
            )
            stop_sequence_cache[cache_key] = projections

        trip_stop_projections[tid] = projections
        trips_processed += 1

        # Check offsets & verify monotonicity
        prev_d = -1.0
        for p in projections:
            d = p["curv_dist_m"]
            off = p["offset_m"]
            all_offsets.append(off)

            if off > 80.0:
                outliers_80m.append({
                    "trip_id": tid,
                    "stop_id": p["stop_id"],
                    "offset_m": round(off, 2)
                })

            if d <= prev_d:
                monotonicity_violations += 1
            prev_d = d

    max_offset = float(np.max(all_offsets)) if all_offsets else 0.0
    mean_offset = float(np.mean(all_offsets)) if all_offsets else 0.0
    print(f"[build] Unique stop sequences projected: {len(stop_sequence_cache)}")
    print(f"[build] Processed {trips_processed} trips ({len(all_offsets)} stops projected).")
    print(f"[build] Projection offset: Mean={mean_offset:.2f} m, Max={max_offset:.2f} m. Monotonicity violations={monotonicity_violations}")

    # Write projection metrics
    metrics_path = os.path.join(output_dir, "projection_metrics.json")
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump({
            "total_projections": len(all_offsets),
            "mean_projection_distance_m": round(mean_offset, 2),
            "max_projection_distance_m": round(max_offset, 2),
            "outliers_exceeding_80m": outliers_80m
        }, f, indent=2)

    # -------------------------------------------------------------------------
    # 3. Build lines.json & stations.json
    # -------------------------------------------------------------------------
    print("[build] Building lines.json and stations.json...")

    # Group trips by route to extract destinations and compute commercial lengths
    route_trips = defaultdict(list)
    for tid, trip in data.trips.items():
        route_trips[trip["route_id"]].append(trip)

    lines_artifact = []
    # Map for stations: station_id -> {id, name, lon, lat, lines: set()}
    stations_map: Dict[str, Dict[str, Any]] = {}
    station_coordinate_samples: Dict[str, List[Tuple[float, float]]] = defaultdict(list)

    for rid, r in sorted(data.routes.items(), key=lambda x: x[1]["short_name"]):
        sname = r["short_name"]
        trips_of_route = route_trips.get(rid, [])

        # Find destinations per direction
        destinations = {"0": "", "1": ""}
        shape_lengths = []
        canonical_shapes = {}

        for t in trips_of_route:
            d_id = str(t["direction_id"])
            headsign = t.get("trip_headsign", "")
            if headsign and not destinations.get(d_id):
                destinations[d_id] = headsign

            sid = t["shape_id"]
            if sid in resampled_shapes:
                s_len = resampled_shapes[sid]["total_len_m"]
                shape_lengths.append(s_len)
                if d_id not in canonical_shapes or s_len > canonical_shapes[d_id]["total_len_m"]:
                    canonical_shapes[d_id] = resampled_shapes[sid]

        # For commercial line length, the standard representation is the max canonical branch length
        measured_length_km = (max(shape_lengths) / 1000.0) if shape_lengths else 0.0

        # Register canonical shapes route_id & direction
        for d_id, s_info in canonical_shapes.items():
            s_info["route_id"] = rid
            s_info["direction_id"] = int(d_id)

        elevation = LINE_ELEVATION_OFFSETS.get(sname, 0.0)

        lines_artifact.append({
            "id": rid,
            "short_name": sname,
            "long_name": r["long_name"],
            "color": r["color"],
            "text_color": r["text_color"],
            "mode": r["mode"],
            "destinations": destinations,
            "measured_length_km": round(measured_length_km, 2),
            "elevation_offset": elevation
        })

    # Consolidate stations
    for tid, trip in data.trips.items():
        rid = trip["route_id"]
        st_list = data.stop_times.get(tid, [])
        for st in st_list:
            stop_id = st["stop_id"]
            if stop_id in stops_dict:
                s = stops_dict[stop_id]
                parent = s.get("parent_station", "")
                station_key = parent if parent else stop_id

                # Keep every active metro stop-point for this commercial
                # station. A station may expose several platform IDs and the
                # first one encountered is not a stable geographic anchor.
                station_coordinate_samples[station_key].append((s["lon"], s["lat"]))
                if station_key not in stations_map:
                    stations_map[station_key] = {
                        "id": station_key,
                        "name": s["name"],
                        "coordinates": [round(s["lon"], 6), round(s["lat"], 6)],
                        "lines": set(),
                        "wheelchair_boarding": s.get("wheelchair_boarding", 0)
                    }
                stations_map[station_key]["lines"].add(rid)

    stations_artifact = []
    for s_id, s_obj in stations_map.items():
        samples = station_coordinate_samples.get(s_id, [])
        if samples:
            lons = sorted(point[0] for point in samples)
            lats = sorted(point[1] for point in samples)
            middle = len(samples) // 2
            median_lon = lons[middle] if len(samples) % 2 else (lons[middle - 1] + lons[middle]) / 2
            median_lat = lats[middle] if len(samples) % 2 else (lats[middle - 1] + lats[middle]) / 2
            s_obj["coordinates"] = [round(median_lon, 6), round(median_lat, 6)]
        lines_list = sorted(list(s_obj["lines"]))
        stations_artifact.append({
            "id": s_id,
            "name": s_obj["name"],
            "coordinates": s_obj["coordinates"],
            "lines": lines_list,
            "is_hub": len(lines_list) >= 2,
            "wheelchair_boarding": s_obj["wheelchair_boarding"]
        })

    stations_artifact.sort(key=lambda x: x["name"])

    # Write lines.json and stations.json
    lines_path = os.path.join(output_dir, "lines.json")
    with open(lines_path, "w", encoding="utf-8") as f:
        json.dump(lines_artifact, f, ensure_ascii=False, indent=2)

    stations_path = os.path.join(output_dir, "stations.json")
    if os.path.exists(stations_path):
        with open(stations_path, "r", encoding="utf-8") as f:
            previous_stations = json.load(f)
        # A previous in-place build can already include native RER stations;
        # compare only the metro subset so the guard still catches real metro
        # drift without rejecting a normal metro+RER rebuild.
        previous_metro_count = sum(
            1 for station in previous_stations
            if any(line_id in data.routes for line_id in station.get("lines", []))
        )
        assert_station_count_drift_within_tolerance(previous_metro_count, len(stations_artifact))
    with open(stations_path, "w", encoding="utf-8") as f:
        json.dump(stations_artifact, f, ensure_ascii=False, indent=2)

    print(f"[build] Saved {len(lines_artifact)} lines to lines.json and {len(stations_artifact)} stations to stations.json")

    # -------------------------------------------------------------------------
    # 4. Build shapes.bin (Compact Binary File)
    # -------------------------------------------------------------------------
    print("[build] Building shapes.bin binary format...")
    shapes_bin_path = os.path.join(output_dir, "shapes.bin")

    # Format specification:
    # Header: Magic "MSHP" (4B), Version 1 (uint16), Shape count (uint16), Offset to table (uint32), 20B pad
    # Table entries (64B each): shape_id (32B), route_id (16B), dir (uint8), reserved (3B), count (uint32), length (float32), offset (uint32)
    # Buffer: float32 triples (lng, lat, cum_dist)

    active_shapes_list = list(resampled_shapes.values())
    shape_count = len(active_shapes_list)
    header_size = 32
    entry_size = 64
    table_size = shape_count * entry_size
    data_start_offset = header_size + table_size

    with open(shapes_bin_path, "wb") as f:
        # Write header
        header = struct.pack("<4sHHI20s", b"MSHP", 1, shape_count, header_size, b"\x00" * 20)
        f.write(header)

        # Precompute offsets
        curr_offset = 0
        entries = []
        for s in active_shapes_list:
            sid_bytes = s["shape_id"].encode("utf-8")[:32].ljust(32, b"\x00")
            rid_bytes = s.get("route_id", "").encode("utf-8")[:16].ljust(16, b"\x00")
            dir_id = int(s.get("direction_id", 0))
            pt_count = s["point_count"]
            tot_len = float(s["total_len_m"])

            entry = struct.pack("<32s16sB3sIfI", sid_bytes, rid_bytes, dir_id, b"\x00" * 3, pt_count, tot_len, curr_offset)
            entries.append(entry)
            curr_offset += pt_count * 12  # 3 * 4 bytes per point

        # Write index table
        for entry in entries:
            f.write(entry)

        # Write point buffer
        for s in active_shapes_list:
            coords = s["coords"] # (N, 2)
            dists = s["cum_dists"] # (N,)
            for (lon, lat), dist in zip(coords, dists):
                pt_bytes = struct.pack("<fff", float(lon), float(lat), float(dist))
                f.write(pt_bytes)

    print(f"[build] Saved shapes.bin ({os.path.getsize(shapes_bin_path) / 1024:.1f} KB)")

    # -------------------------------------------------------------------------
    # 5. Build network.sqlite
    # -------------------------------------------------------------------------
    print("[build] Building network.sqlite database...")
    db_path = os.path.join(output_dir, "network.sqlite")
    if os.path.exists(db_path):
        os.remove(db_path)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("PRAGMA journal_mode = WAL;")
    cur.execute("PRAGMA synchronous = NORMAL;")

    # Table: trip_stops (Used by Acceptance Criterion 2)
    cur.execute("""
        CREATE TABLE trip_stops (
            trip_id TEXT NOT NULL,
            stop_sequence INT NOT NULL,
            stop_id TEXT NOT NULL,
            arrival_time INT NOT NULL,
            departure_time INT NOT NULL,
            shape_dist_traveled REAL NOT NULL,
            PRIMARY KEY (trip_id, stop_sequence)
        );
    """)

    # Table: trips_index
    cur.execute("""
        CREATE TABLE trips_index (
            trip_id TEXT PRIMARY KEY,
            route_id TEXT NOT NULL,
            direction_id INT NOT NULL,
            service_id TEXT NOT NULL,
            shape_id TEXT NOT NULL,
            start_time_s INT NOT NULL,
            end_time_s INT NOT NULL,
            block_id TEXT
        );
    """)

    # Table: services
    cur.execute("""
        CREATE TABLE services (
            service_id TEXT PRIMARY KEY,
            monday INT, tuesday INT, wednesday INT, thursday INT, friday INT, saturday INT, sunday INT,
            start_date TEXT, end_date TEXT
        );
    """)

    # Table: service_exceptions
    cur.execute("""
        CREATE TABLE service_exceptions (
            service_id TEXT NOT NULL,
            date TEXT NOT NULL,
            exception_type INT NOT NULL,
            PRIMARY KEY (service_id, date)
        );
    """)

    # Table: station_search
    cur.execute("""
        CREATE TABLE station_search (
            stop_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            normalized_name TEXT NOT NULL,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            lines_csv TEXT NOT NULL
        );
    """)

    # Populate services
    services_rows = [
        (s["service_id"], s["monday"], s["tuesday"], s["wednesday"], s["thursday"], s["friday"], s["saturday"], s["sunday"], s["start_date"], s["end_date"])
        for s in data.calendar.values()
    ]
    cur.executemany("INSERT INTO services VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);", services_rows)

    # Populate service_exceptions
    exceptions_rows = [
        (e["service_id"], e["date"], e["exception_type"])
        for e in data.calendar_dates
    ]
    cur.executemany("INSERT OR REPLACE INTO service_exceptions VALUES (?, ?, ?);", exceptions_rows)

    # Populate trips_index & trip_stops
    trip_rows = []
    trip_stop_rows = []

    for tid, trip in data.trips.items():
        st_list = data.stop_times.get(tid, [])
        proj_list = trip_stop_projections.get(tid, [])
        if not st_list or not proj_list or len(st_list) != len(proj_list):
            continue

        start_time_s = time_to_seconds(st_list[0]["departure_time"])
        end_time_s = time_to_seconds(st_list[-1]["arrival_time"])

        trip_rows.append((
            tid,
            trip["route_id"],
            trip["direction_id"],
            trip["service_id"],
            trip["shape_id"],
            start_time_s,
            end_time_s,
            trip.get("block_id", "")
        ))

        for st, proj in zip(st_list, proj_list):
            arr_s = time_to_seconds(st["arrival_time"])
            dep_s = time_to_seconds(st["departure_time"])
            curv_dist = proj["curv_dist_m"]

            trip_stop_rows.append((
                tid,
                st["stop_sequence"],
                st["stop_id"],
                arr_s,
                dep_s,
                curv_dist
            ))

    cur.executemany("INSERT INTO trips_index VALUES (?, ?, ?, ?, ?, ?, ?, ?);", trip_rows)
    cur.executemany("INSERT INTO trip_stops VALUES (?, ?, ?, ?, ?, ?);", trip_stop_rows)

    # Populate station_search
    station_search_rows = [
        (st["id"], st["name"], normalize_text(st["name"]), st["coordinates"][1], st["coordinates"][0], ",".join(st["lines"]))
        for st in stations_artifact
    ]
    cur.executemany("INSERT INTO station_search VALUES (?, ?, ?, ?, ?, ?);", station_search_rows)

    # Create indexes
    cur.execute("CREATE INDEX idx_trips_active ON trips_index(service_id, start_time_s, end_time_s);")
    cur.execute("CREATE INDEX idx_trips_route_dir ON trips_index(route_id, direction_id);")
    cur.execute("CREATE INDEX idx_trip_stops_trip ON trip_stops(trip_id, stop_sequence);")
    cur.execute("CREATE INDEX idx_station_norm_name ON station_search(normalized_name);")

    conn.commit()
    conn.close()
    print(f"[build] Created network.sqlite ({os.path.getsize(db_path) / 1024 / 1024:.1f} MB, {len(trip_rows)} trips, {len(trip_stop_rows)} stop entries)")

    # -------------------------------------------------------------------------
    # 6. Export Control GeoJSON
    # -------------------------------------------------------------------------
    print("[build] Generating control GeoJSON...")
    geojson_path = os.path.join(output_dir, "control_network.geojson")

    # Format shapes for GeoJSON export
    shapes_for_geojson = {}
    for sid, s in resampled_shapes.items():
        shapes_for_geojson[sid] = {
            "coordinates": [[round(float(p[0]), 5), round(float(p[1]), 5)] for p in s["coords"]],
            "route_id": s.get("route_id", ""),
            "direction_id": s.get("direction_id", 0),
            "length_m": s["total_len_m"]
        }

    export_control_geojson(lines_artifact, stations_artifact, shapes_for_geojson, geojson_path)
    print("[build] Phase A artifacts generation complete!")
