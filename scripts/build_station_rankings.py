"""Compute GTFS station service rankings for the metro + native RER network."""

from __future__ import annotations

import csv
import io
import json
import zipfile
from collections import Counter, defaultdict
from pathlib import Path


DAY_KEYS = ("weekday", "saturday", "sunday")


def build_station_rankings(raw_zip: str | Path, stations_path: str | Path, output_dir: str | Path) -> None:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(raw_zip) as archive:
        routes: dict[str, str] = {}
        with archive.open("routes.txt") as handle:
            for row in csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8-sig")):
                route_type = row.get("route_type", "")
                short_name = row.get("route_short_name", "").strip()
                if route_type == "1" or (route_type == "2" and row.get("agency_id") == "IDFM:71" and short_name in "ABCDE"):
                    routes[row["route_id"]] = short_name

        calendars: dict[str, tuple[bool, bool, bool]] = {}
        with archive.open("calendar.txt") as handle:
            for row in csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8-sig")):
                calendars[row["service_id"]] = (
                    any(row.get(day, "0") == "1" for day in ("monday", "tuesday", "wednesday", "thursday", "friday")),
                    row.get("saturday", "0") == "1",
                    row.get("sunday", "0") == "1",
                )

        stop_station: dict[str, str] = {}
        with archive.open("stops.txt") as handle:
            for row in csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8-sig")):
                stop_id = row["stop_id"].strip()
                stop_station[stop_id] = row.get("parent_station", "").strip() or stop_id

        trips: dict[str, tuple[str, tuple[bool, bool, bool]]] = {}
        with archive.open("trips.txt") as handle:
            for row in csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8-sig")):
                route_id = row.get("route_id", "")
                if route_id not in routes:
                    continue
                flags = calendars.get(row.get("service_id", ""), (True, True, True))
                trips[row["trip_id"]] = (route_id, flags)

        station_line_counts: dict[str, dict[str, Counter[str]]] = defaultdict(lambda: defaultdict(Counter))
        with archive.open("stop_times.txt") as handle:
            reader = csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8-sig"))
            current_trip = ""
            current_stations: set[str] = set()
            current_route = ""
            current_flags = (False, False, False)

            def flush() -> None:
                if not current_trip:
                    return
                for station_id in current_stations:
                    for index, day in enumerate(DAY_KEYS):
                        if current_flags[index]:
                            station_line_counts[station_id][current_route][day] += 1

            for row in reader:
                trip_id = row.get("trip_id", "")
                if trip_id != current_trip:
                    flush()
                    current_trip = trip_id
                    current_stations = set()
                    current_route, current_flags = trips.get(trip_id, ("", (False, False, False)))
                if current_route:
                    station_id = stop_station.get(row.get("stop_id", "").strip())
                    if station_id:
                        current_stations.add(station_id)
            flush()

    with Path(stations_path).open(encoding="utf-8") as handle:
        stations = json.load(handle)
    station_names = {station["id"]: station["name"] for station in stations}

    by_station: dict[str, dict[str, int]] = {}
    by_station_line: list[dict[str, object]] = []
    for station_id, per_line in station_line_counts.items():
        totals = {day: sum(counter[day] for counter in per_line.values()) for day in DAY_KEYS}
        by_station[station_id] = totals
        for line_id, counter in per_line.items():
            by_station_line.append({
                "station_id": station_id,
                "station_name": station_names.get(station_id, station_id),
                "line_id": line_id,
                "counts": {day: counter[day] for day in DAY_KEYS},
            })

    def rank_rows(rows: list[dict[str, object]], key_name: str, day: str) -> list[dict[str, object]]:
        def score(row: dict[str, object]) -> int:
            value = row.get(key_name)
            if isinstance(value, dict):
                return int(value.get(day, 0))
            return int(value or 0)
        return sorted(rows, key=score, reverse=True)

    station_rows = [
        {"station_id": station_id, "station_name": station_names.get(station_id, station_id), "counts": counts}
        for station_id, counts in by_station.items()
    ]
    rankings = {
        "methodology": {
            "source": "IDFM GTFS schedule",
            "definition": "Nombre de passages planifiés par jour type, tous sens et toutes lignes confondus.",
            "station_rule": "Une station commerciale est identifiée par parent_station, sinon stop_id; un passage est compté une fois par course et station.",
            "day_types": "weekday = lundi-vendredi, saturday = samedi, sunday = dimanche",
        },
        "by_station": {
            day: rank_rows(station_rows, "counts", day) for day in DAY_KEYS
        },
        "by_station_line": {
            day: rank_rows(by_station_line, "counts", day) for day in DAY_KEYS
        },
        "ridership": {
            "status": "unavailable",
            "reason": "Le jeu officiel IDFM/RATP 2015 disponible expose le nom et le trafic, mais pas l'identifiant station IDFM requis pour une jointure fiable.",
            "year": 2015,
            "source_dataset": "trafic-annuel-entrant-par-station-du-reseau-ferre-2015",
            "license": "Licence Ouverte (Etalab)",
        },
    }

    for station in stations:
        counts = by_station.get(station["id"], {day: 0 for day in DAY_KEYS})
        station["service_counts"] = counts
        station["service_rank"] = {day: next((i + 1 for i, row in enumerate(rankings["by_station"][day]) if row["station_id"] == station["id"]), None) for day in DAY_KEYS}
        station["service_rank_by_line"] = {
            day: {
                item["line_id"]: index + 1
                for index, item in enumerate(rankings["by_station_line"][day])
                if item["station_id"] == station["id"]
            }
            for day in DAY_KEYS
        }

    for target in (Path(stations_path), output_dir / "stations.json"):
        target.write_text(json.dumps(stations, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for target in (output_dir / "station-rankings.json", Path("web/public/data/station-rankings.json")):
        target.write_text(json.dumps(rankings, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    build_station_rankings(root / "data/raw/IDFM-gtfs.zip", root / "web/public/data/stations.json", root / "web/public/data")
