"""
Metro Filter & Extractor for GTFS IDFM
Extracts and filters routes, trips, shapes, stops, and calendar data for metro (route_type = 1).
Maintains flag for tram (route_type = 0) and rail (route_type = 2) for future extensibility.
"""

import csv
import io
import zipfile
from typing import Dict, List, Set, Tuple, Any, Optional

# Supported transport modes
MODE_METRO = 1
MODE_TRAM = 0
MODE_RAIL = 2

# Allowed modes for this project (metro only in v1)
ACTIVE_MODES = {MODE_METRO}


def normalize_short_name(name: str) -> str:
    """Normalizes short names (e.g. '3b' -> '3bis', '7b' -> '7bis')."""
    n = name.strip().lower()
    if n in ("3b", "3bis"):
        return "3bis"
    if n in ("7b", "7bis"):
        return "7bis"
    return name.strip()


def normalize_color(color_hex: str, default: str = "#000000") -> str:
    """Ensures hex color starts with '#' and is uppercase."""
    c = color_hex.strip().lstrip("#")
    if len(c) == 6:
        return f"#{c.upper()}"
    return default


class MetroGTFSData:
    def __init__(self):
        # route_id -> route dict
        self.routes: Dict[str, Dict[str, Any]] = {}
        # trip_id -> trip dict
        self.trips: Dict[str, Dict[str, Any]] = {}
        # shape_id -> list of (lat, lon, seq, dist)
        self.shapes: Dict[str, List[Tuple[float, float, int, float]]] = {}
        # stop_id -> stop dict
        self.stops: Dict[str, Dict[str, Any]] = {}
        # trip_id -> list of stop_time dicts
        self.stop_times: Dict[str, List[Dict[str, Any]]] = {}
        # service_id -> calendar dict
        self.calendar: Dict[str, Dict[str, Any]] = {}
        # (service_id, date) -> exception_type
        self.calendar_dates: List[Dict[str, Any]] = []


def extract_metro_data(zip_path: str, include_tram: bool = False, include_rail: bool = False) -> MetroGTFSData:
    """
    Extracts only metro data from the full IDFM GTFS zip file in a single streaming pass.
    """
    allowed_modes = {MODE_METRO}
    if include_tram:
        allowed_modes.add(MODE_TRAM)
    if include_rail:
        allowed_modes.add(MODE_RAIL)

    data = MetroGTFSData()

    print(f"[filter] Opening GTFS archive: {zip_path}")
    with zipfile.ZipFile(zip_path, "r") as zf:
        file_list = zf.namelist()
        print(f"[filter] Archive contains {len(file_list)} files: {file_list[:10]}")

        # 1. routes.txt -> Filter route_type
        routes_file = next((f for f in file_list if f.endswith("routes.txt")), None)
        assert routes_file, "routes.txt not found in archive"

        active_route_ids: Set[str] = set()
        with zf.open(routes_file) as f:
            reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
            for row in reader:
                rtype = int(row.get("route_type", -1))
                if rtype in allowed_modes:
                    rid = row["route_id"]
                    sname = normalize_short_name(row.get("route_short_name", ""))
                    color = normalize_color(row.get("route_color", "000000"))
                    text_color = normalize_color(row.get("route_text_color", "FFFFFF"))

                    data.routes[rid] = {
                        "id": rid,
                        "short_name": sname,
                        "long_name": row.get("route_long_name", "").strip(),
                        "color": color,
                        "text_color": text_color,
                        "mode": "metro" if rtype == MODE_METRO else ("tram" if rtype == MODE_TRAM else "rail"),
                        "raw_route_type": rtype,
                    }
                    active_route_ids.add(rid)

        print(f"[filter] Filtered {len(data.routes)} metro routes (route_type=1).")
        lines_summary = sorted(list({r['short_name'] for r in data.routes.values()}))
        print(f"[filter] Line short names found: {lines_summary}")

        # 2. trips.txt -> Keep trips for active routes
        trips_file = next((f for f in file_list if f.endswith("trips.txt")), None)
        assert trips_file, "trips.txt not found in archive"

        active_trip_ids: Set[str] = set()
        active_shape_ids: Set[str] = set()
        active_service_ids: Set[str] = set()

        with zf.open(trips_file) as f:
            reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
            for row in reader:
                rid = row["route_id"]
                if rid in active_route_ids:
                    tid = row["trip_id"]
                    sid = row.get("shape_id", "").strip()
                    srv_id = row.get("service_id", "").strip()
                    direction_id = int(row.get("direction_id", 0))

                    data.trips[tid] = {
                        "trip_id": tid,
                        "route_id": rid,
                        "service_id": srv_id,
                        "shape_id": sid,
                        "direction_id": direction_id,
                        "trip_headsign": row.get("trip_headsign", "").strip(),
                        "block_id": row.get("block_id", "").strip(),
                    }
                    active_trip_ids.add(tid)
                    if sid:
                        active_shape_ids.add(sid)
                    if srv_id:
                        active_service_ids.add(srv_id)

        print(f"[filter] Filtered {len(data.trips)} metro trips, {len(active_shape_ids)} shapes, {len(active_service_ids)} services.")

        # 3. shapes.txt -> Keep shapes used by active trips
        shapes_file = next((f for f in file_list if f.endswith("shapes.txt")), None)
        if shapes_file:
            with zf.open(shapes_file) as f:
                reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
                for row in reader:
                    sid = row["shape_id"].strip()
                    if sid in active_shape_ids:
                        if sid not in data.shapes:
                            data.shapes[sid] = []
                        lat = float(row["shape_pt_lat"])
                        lon = float(row["shape_pt_lon"])
                        seq = int(row["shape_pt_sequence"])
                        dist = float(row.get("shape_dist_traveled", 0.0) or 0.0)
                        data.shapes[sid].append((lat, lon, seq, dist))

            # Sort shape points by sequence
            for sid in data.shapes:
                data.shapes[sid].sort(key=lambda p: p[2])

            print(f"[filter] Loaded {len(data.shapes)} shapes with coordinates.")

        # 4. stop_times.txt -> Keep stop times for active trips
        stop_times_file = next((f for f in file_list if f.endswith("stop_times.txt")), None)
        assert stop_times_file, "stop_times.txt not found in archive"

        active_stop_ids: Set[str] = set()
        with zf.open(stop_times_file) as f:
            reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
            for row in reader:
                tid = row["trip_id"]
                if tid in active_trip_ids:
                    if tid not in data.stop_times:
                        data.stop_times[tid] = []

                    stop_id = row["stop_id"].strip()
                    active_stop_ids.add(stop_id)

                    arr_time = row["arrival_time"].strip()
                    dep_time = row["departure_time"].strip()
                    seq = int(row["stop_sequence"])
                    shape_dist = float(row.get("shape_dist_traveled", -1.0) or -1.0)

                    data.stop_times[tid].append({
                        "stop_id": stop_id,
                        "stop_sequence": seq,
                        "arrival_time": arr_time,
                        "departure_time": dep_time,
                        "shape_dist_traveled": shape_dist,
                        "pickup_type": int(row.get("pickup_type", 0) or 0),
                        "drop_off_type": int(row.get("drop_off_type", 0) or 0),
                    })

        for tid in data.stop_times:
            data.stop_times[tid].sort(key=lambda s: s["stop_sequence"])

        print(f"[filter] Loaded stop_times for {len(data.stop_times)} trips, referencing {len(active_stop_ids)} unique stops.")

        # 5. stops.txt -> Keep stops referenced by active stop_times
        stops_file = next((f for f in file_list if f.endswith("stops.txt")), None)
        assert stops_file, "stops.txt not found in archive"

        parent_station_ids: Set[str] = set()
        with zf.open(stops_file) as f:
            reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
            all_stops_dict = {}
            for row in reader:
                sid = row["stop_id"].strip()
                all_stops_dict[sid] = row
                if sid in active_stop_ids:
                    p = row.get("parent_station", "").strip()
                    if p:
                        parent_station_ids.add(p)

            # Store both active stops and their parent stations
            for sid, row in all_stops_dict.items():
                if sid in active_stop_ids or sid in parent_station_ids:
                    data.stops[sid] = {
                        "id": sid,
                        "name": row.get("stop_name", "").strip(),
                        "lat": float(row.get("stop_lat", 0.0) or 0.0),
                        "lon": float(row.get("stop_lon", 0.0) or 0.0),
                        "parent_station": row.get("parent_station", "").strip(),
                        "location_type": int(row.get("location_type", 0) or 0),
                        "wheelchair_boarding": int(row.get("wheelchair_boarding", 0) or 0),
                    }

        print(f"[filter] Loaded {len(data.stops)} relevant stops & parent stations.")

        # 6. calendar.txt & calendar_dates.txt
        calendar_file = next((f for f in file_list if f.endswith("calendar.txt")), None)
        if calendar_file:
            with zf.open(calendar_file) as f:
                reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
                for row in reader:
                    sid = row["service_id"].strip()
                    if sid in active_service_ids:
                        data.calendar[sid] = {
                            "service_id": sid,
                            "monday": int(row["monday"]),
                            "tuesday": int(row["tuesday"]),
                            "wednesday": int(row["wednesday"]),
                            "thursday": int(row["thursday"]),
                            "friday": int(row["friday"]),
                            "saturday": int(row["saturday"]),
                            "sunday": int(row["sunday"]),
                            "start_date": row["start_date"].strip(),
                            "end_date": row["end_date"].strip(),
                        }

        cal_dates_file = next((f for f in file_list if f.endswith("calendar_dates.txt")), None)
        if cal_dates_file:
            with zf.open(cal_dates_file) as f:
                reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
                for row in reader:
                    sid = row["service_id"].strip()
                    if sid in active_service_ids:
                        data.calendar_dates.append({
                            "service_id": sid,
                            "date": row["date"].strip(),
                            "exception_type": int(row["exception_type"]),
                        })

        print(f"[filter] Calendar loaded: {len(data.calendar)} services, {len(data.calendar_dates)} date exceptions.")

    return data
