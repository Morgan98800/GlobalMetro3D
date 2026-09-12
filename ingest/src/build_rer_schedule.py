"""
build_rer_schedule.py — Extract, truncate, project and build rer_schedule.json for RER E.

Phase 2 requirements:
- Strictly identical format to schedule.json: {"stations": [...], "trips": [...]}
- Disjoint station indices computed dynamically as max(existing metro index) + 1
- Clean truncation for trips with stops out of published scope (Tournan)
- Real GTFS calendar (nominal weekday reference day, matching schedule.json)
- Monotonic projected distances along SHP2 shapes from rer_shapes.bin
"""

from __future__ import annotations

import csv
import io
import json
import os
import zipfile
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, Any, Tuple, Set
import numpy as np

from ingest.src.project import project_trip_stops_monotonically
from ingest.tests.test_acceptance_phase_a import TestPhaseAAcceptance

RER_E_ROUTE_ID = "IDFM:C01729"
NOMINAL_WEEKDAY_DATE = "20260916"  # Wednesday, standard nominal service


def time_to_seconds(time_str: str) -> int:
    parts = time_str.strip().split(":")
    return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])


def build_rer_schedule(
    raw_zip_path: Path | str,
    metro_schedule_path: Path | str,
    stations_path: Path | str,
    rer_shapes_path: Path | str,
    out_schedule_path: Path | str,
    reference_date: str = NOMINAL_WEEKDAY_DATE,
) -> Dict[str, Any]:
    raw_zip = Path(raw_zip_path)
    metro_sched_path = Path(metro_schedule_path)
    stations_json_path = Path(stations_path)
    rer_shapes_bin_path = Path(rer_shapes_path)
    out_path = Path(out_schedule_path)

    # 1. Load metro schedule to determine dynamic offset
    with open(metro_sched_path, "r", encoding="utf-8") as f:
        metro_sched = json.load(f)

    metro_stations: List[str] = metro_sched.get("stations", [])
    metro_indices: Set[int] = set()
    for t in metro_sched.get("trips", []):
        metro_indices.add(t[6])  # terminus_index
        for s in t[7]:
            metro_indices.add(s[3])  # station_index

    if not metro_indices:
        raise ValueError(f"No station indices found in {metro_sched_path}")

    max_metro_index = max(metro_indices)
    offset = max_metro_index + 1
    print(f"[rer_schedule] Metro stations: {len(metro_stations)}, max index: {max_metro_index}, dynamic offset: {offset}")

    # 2. Load published stations to check bounding scope
    with open(stations_json_path, "r", encoding="utf-8") as f:
        stations_data = json.load(f)
    published_stations = {s["id"]: s for s in stations_data}
    print(f"[rer_schedule] Loaded {len(published_stations)} published stations")

    # 3. Load RER shapes in SHP2 format
    rer_shapes = TestPhaseAAcceptance._read_shp2(str(rer_shapes_bin_path))
    print(f"[rer_schedule] Loaded {len(rer_shapes)} RER shapes from {rer_shapes_bin_path}")

    # 4. Extract trips, calendar, stops from GTFS
    print(f"[rer_schedule] Reading GTFS archive: {raw_zip}")
    with zipfile.ZipFile(raw_zip) as z:
        calendar: Dict[str, Dict[str, str]] = {}
        with z.open("calendar.txt") as f:
            for r in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
                calendar[r["service_id"]] = r

        cal_dates: Dict[str, Dict[str, int]] = defaultdict(dict)
        with z.open("calendar_dates.txt") as f:
            for r in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
                cal_dates[r["service_id"]][r["date"]] = int(r["exception_type"])

        # Filter active trips for RER E on reference_date
        active_trips: List[Dict[str, Any]] = []
        with z.open("trips.txt") as f:
            for r in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
                if r.get("route_id") == RER_E_ROUTE_ID:
                    sid = r["service_id"]
                    c = calendar.get(sid)
                    active = False
                    if c and c["start_date"] <= reference_date <= c["end_date"]:
                        # Wednesday is day 2 in 0-indexed Monday..Sunday
                        if int(c.get("wednesday", 0)) == 1:
                            active = True
                    exc = cal_dates.get(sid, {}).get(reference_date)
                    if exc == 1:
                        active = True
                    elif exc == 2:
                        active = False

                    if active:
                        active_trips.append(r)

        print(f"[rer_schedule] Active RER E trips on {reference_date}: {len(active_trips)}")

        # Load stops and parent stations
        stops: Dict[str, Dict[str, Any]] = {}
        with z.open("stops.txt") as f:
            for r in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
                stops[r["stop_id"].strip()] = r

        parent_map = {sid: r.get("parent_station", "").strip() or sid for sid, r in stops.items()}

        active_trip_ids = set(t["trip_id"] for t in active_trips)
        trip_stop_times: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        with z.open("stop_times.txt") as f:
            for r in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
                tid = r["trip_id"]
                if tid in active_trip_ids:
                    trip_stop_times[tid].append(r)

    active_trips.sort(key=lambda t: t["trip_id"])

    rer_station_names: List[str] = []
    station_name_to_index: Dict[str, int] = {}

    out_trips: List[List[Any]] = []
    truncated_trips_count = 0
    dropped_stops_count = 0
    min_gtfs_time = float("inf")
    max_gtfs_time = 0

    for trip in active_trips:
        tid = trip["trip_id"]
        st_list = sorted(trip_stop_times[tid], key=lambda s: int(s["stop_sequence"]))
        if not st_list:
            continue

        # Check scope against published stations
        in_scope = []
        for st in st_list:
            sid = st["stop_id"].strip()
            parent = parent_map.get(sid, sid)
            in_scope.append(parent in published_stations or sid in published_stations)

        first_in = next((i for i, fl in enumerate(in_scope) if fl), None)
        if first_in is None:
            continue
        last_in = len(in_scope) - 1 - next(i for i, fl in enumerate(reversed(in_scope)) if fl)

        dropped = len(st_list) - (last_in - first_in + 1)
        if dropped > 0:
            truncated_trips_count += 1
            dropped_stops_count += dropped

        kept_st_list = st_list[first_in : last_in + 1]
        if len(kept_st_list) < 2:
            continue

        shape_id = trip.get("shape_id", "").strip()
        if shape_id not in rer_shapes:
            raise ValueError(f"Trip {tid} references shape {shape_id} missing from rer_shapes.bin")

        shape_info = rer_shapes[shape_id]
        shape_coords = np.array(shape_info["coords"])
        step = shape_info["step"]
        tail = shape_info["tail"]
        last_dist = (len(shape_coords) - 2) * step + tail
        cum_dists = np.array([0.0] + [i * step for i in range(1, len(shape_coords) - 1)] + [last_dist])

        stop_tuples: List[Tuple[str, float, float]] = []
        stop_station_names: List[str] = []
        for st in kept_st_list:
            sid = st["stop_id"].strip()
            stop_obj = stops[sid]
            parent = parent_map.get(sid, sid)
            st_meta = published_stations.get(parent) or published_stations.get(sid)
            station_name = st_meta["name"] if st_meta else stop_obj.get("stop_name", "").strip()
            stop_tuples.append((sid, float(stop_obj["stop_lon"]), float(stop_obj["stop_lat"])))
            stop_station_names.append(station_name)

        # Monotonic projection onto SHP2 shape
        projections = project_trip_stops_monotonically(
            stop_tuples,
            shape_coords,
            cum_dists,
            min_station_gap_m=1.0,
        )

        trip_stops_data: List[List[Any]] = []
        for st, proj, st_name in zip(kept_st_list, projections, stop_station_names):
            if st_name not in station_name_to_index:
                station_name_to_index[st_name] = offset + len(rer_station_names)
                rer_station_names.append(st_name)
            st_idx = station_name_to_index[st_name]

            arr_s = time_to_seconds(st["arrival_time"])
            dep_s = time_to_seconds(st["departure_time"])
            curv_dist = round(proj["curv_dist_m"], 1)

            min_gtfs_time = min(min_gtfs_time, arr_s, dep_s)
            max_gtfs_time = max(max_gtfs_time, arr_s, dep_s)

            trip_stops_data.append([arr_s, dep_s, curv_dist, st_idx])

        # Recalculate trip timing & terminus
        start_s = trip_stops_data[0][1]
        end_s = trip_stops_data[-1][0]
        terminus_idx = trip_stops_data[-1][3]
        dir_id = int(trip.get("direction_id", 0))

        out_trips.append([
            tid,
            RER_E_ROUTE_ID,
            dir_id,
            shape_id,
            start_s,
            end_s,
            terminus_idx,
            trip_stops_data,
        ])

    # Assertions
    rer_indices = set(station_name_to_index.values())
    assert min(rer_indices) >= offset, f"Min RER index {min(rer_indices)} < offset {offset}"
    assert metro_indices.isdisjoint(rer_indices), "COLLISION detected between metro and RER station indices!"

    full_stations = list(metro_stations)
    assert len(full_stations) == offset, f"Length mismatch: {len(full_stations)} != {offset}"
    full_stations.extend(rer_station_names)

    rer_schedule = {
        "stations": full_stations,
        "trips": out_trips,
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(rer_schedule, f, ensure_ascii=False, separators=(",", ":"))

    file_size = out_path.stat().st_size
    print(f"[rer_schedule] Saved {out_path}: {file_size} bytes ({file_size/1024:.1f} KB)")
    print(f"[rer_schedule] Trips: {len(out_trips)}, Truncated: {truncated_trips_count}, Dropped stops: {dropped_stops_count}")
    print(f"[rer_schedule] Min time: {min_gtfs_time} s, Max time: {max_gtfs_time} s")

    return {
        "trips_count": len(out_trips),
        "truncated_trips": truncated_trips_count,
        "dropped_stops": dropped_stops_count,
        "rer_stations_count": len(rer_station_names),
        "offset": offset,
        "file_bytes": file_size,
        "min_gtfs_time": int(min_gtfs_time),
        "max_gtfs_time": int(max_gtfs_time),
    }


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent.parent
    raw_zip = root / "data" / "raw" / "IDFM-gtfs.zip"
    metro_sched = root / "web" / "public" / "data" / "schedule.json"
    stations = root / "web" / "public" / "data" / "stations.json"
    rer_shapes = root / "web" / "public" / "data" / "rer_shapes.bin"
    out_sched = root / "web" / "public" / "data" / "rer_schedule.json"

    build_rer_schedule(raw_zip, metro_sched, stations, rer_shapes, out_sched)
