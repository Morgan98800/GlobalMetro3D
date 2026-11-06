"""
build_edinburgh_artifacts.py — Pipeline d'ingestion GTFS pour Edinburgh Trams (Édimbourg).
Ligne unique : Edinburgh Airport ↔ Newhaven.

Génère l'ensemble des 10 artefacts normalisés dans cities/edinburgh/data/ et web/public/cities/edinburgh/data/ :
1. lines.json : métadonnées de la ligne T50 (couleur #8B1D42, texte #FFFFFF, mode tram)
2. stations.json : 23 stations uniques agrégées depuis les quais, coordonnées recalées sur le tracé si écart > 5m
3. tracks.json : polylignes représentatives haute précision issues d'OSM (direction 0 et 1)
4. shapes.bin : binaire SHP2 rééchantillonné au pas régulier de 10 m depuis les shapes GTFS
5. schedule.json : grille des courses et arrêts au format compact (services partiels dépôt préservés)
6. line_ladders.json : thermomètre de ligne ordonné par direction pour le dock
7. station-rankings.json : fréquences théoriques de desserte par station (semaine, samedi, dimanche)
8. sections.json : réseau modélisé à plat (tramway urbain de surface)
9. feed_fingerprint.json : métadonnées et fraîcheur du flux BODS Scotland GTFS
10. rolling-stock.json : spécifications CAF Urbos 3 (flotte de 27 rames, 7 caisses articulées)

Règles d'or respectées :
- Aucune modification de core/.
- Fuseau horaire extrait directement de agency.txt ('Europe/London'). Horaires > 24h conservés.
- Agrégation des quais aux 23 stations canoniques.
- Projection stations sur tracé : distances d'accrochage mesurées et rapportées.
- Monotonie stricte des distances cumulées le long de chaque course.
- Services partiels (dépôt Gogarburn, Gyle Centre, Edinburgh Gateway) détectés et préservés tels quels.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import math
import os
import re
import shutil
import sys
import time
import tracemalloc
import urllib.request
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

# Import du writer SHP2 v2 depuis core/ingest
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from core.ingest.write_shapes_v2 import ResampledShape, write_shapes_v2

# Coordonnées du centre d'Édimbourg (Princes Street) pour projection plane équirectangulaire locale
LAT0 = 55.952
LON0 = -3.205
R_EARTH = 6371000.0
DEG_TO_RAD = math.pi / 180.0
_LAT_M = R_EARTH * DEG_TO_RAD
_LON_M = R_EARTH * math.cos(LAT0 * DEG_TO_RAD) * DEG_TO_RAD

BODS_SCOTLAND_GTFS_URL = "https://data.bus-data.dft.gov.uk/timetable/download/gtfs-file/scotland/"
EDINBURGH_AGENCY_ID = "OP599"
EDINBURGH_ROUTE_ID = "2908"
EDINBURGH_ROUTE_SHORT_NAME = "T50"

# Ordre canonique strict des 23 arrêts (Airport -> Newhaven)
CANONICAL_STOPS = [
    "Edinburgh Airport",
    "Ingliston Park & Ride",
    "Gogarburn",
    "Edinburgh Gateway",
    "Gyle Centre",
    "Edinburgh Park Central",
    "Edinburgh Park Station",
    "Bankhead",
    "Saughton",
    "Balgreen",
    "Murrayfield Stadium",
    "Haymarket",
    "West End - Princes Street",
    "Princes Street",
    "St Andrew Square",
    "Picardy Place",
    "McDonald Road",
    "Balfour Street",
    "Foot of the Walk",
    "The Shore",
    "Port of Leith",
    "Ocean Terminal",
    "Newhaven"
]

CANONICAL_IDS = {
    "Edinburgh Airport": "940GZZEDAIR",
    "Ingliston Park & Ride": "940GZZEDING",
    "Gogarburn": "940GZZEDGOG",
    "Edinburgh Gateway": "940GZZEDGAT",
    "Gyle Centre": "940GZZEDGYL",
    "Edinburgh Park Central": "940GZZEDPKC",
    "Edinburgh Park Station": "940GZZEDPKS",
    "Bankhead": "940GZZEDBAN",
    "Saughton": "940GZZEDSAU",
    "Balgreen": "940GZZEDBAL",
    "Murrayfield Stadium": "940GZZEDMUR",
    "Haymarket": "940GZZEDHAY",
    "West End - Princes Street": "940GZZEDSHA",
    "Princes Street": "940GZZEDPRS",
    "St Andrew Square": "940GZZEDSTA",
    "Picardy Place": "940GZZTWWJU",
    "McDonald Road": "940GZZTWWJT",
    "Balfour Street": "940GZZTWWJS",
    "Foot of the Walk": "940GZZTWWJR",
    "The Shore": "940GZZTWWJQ",
    "Port of Leith": "940GZZTWWJP",
    "Ocean Terminal": "940GZZTWWJO",
    "Newhaven": "940GZZTWWJN"
}

KNOWN_HUBS = {
    "Edinburgh Airport",
    "Edinburgh Gateway",
    "Haymarket",
    "St Andrew Square",
    "Newhaven"
}

# Couleur officielle Edinburgh Trams (bordeaux pantone 222C / #8B1D42) [verified: false]
TRAM_COLOR = "#8B1D42"
TRAM_TEXT_COLOR = "#FFFFFF"


def equirect_dist_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Distance métrique plane entre deux coordonnées WGS84 autour d'Édimbourg."""
    dx = (lon2 - lon1) * _LON_M
    dy = (lat2 - lat1) * _LAT_M
    return math.hypot(dx, dy)


def point_to_segment_proj_m(
    px: float, py: float, x1: float, y1: float, x2: float, y2: float
) -> Tuple[float, float, float, float]:
    """Projection orthogonale d'un point sur un segment [P1, P2]. Retourne (t, distance_m, proj_x, proj_y)."""
    dx = (x2 - x1) * _LON_M
    dy = (y2 - y1) * _LAT_M
    l2 = dx * dx + dy * dy
    if l2 == 0:
        return 0.0, math.hypot((px - x1) * _LON_M, (py - y1) * _LAT_M), x1, y1
    t = max(0.0, min(1.0, (((px - x1) * _LON_M * dx) + ((py - y1) * _LAT_M * dy)) / l2))
    proj_x = x1 + t * (x2 - x1)
    proj_y = y1 + t * (y2 - y1)
    d = math.hypot((px - proj_x) * _LON_M, (py - proj_y) * _LAT_M)
    return t, d, proj_x, proj_y


def project_on_polyline(
    px: float, py: float, coords: List[Tuple[float, float]], cum_dists: List[float]
) -> Tuple[float, float, float, float]:
    """Projette un point sur une polyline continue et retourne (abscisse_curviligne_m, distance_ortho_m, proj_x, proj_y)."""
    best_d = float("inf")
    best_s = 0.0
    best_px = px
    best_py = py
    for i in range(len(coords) - 1):
        x1, y1 = coords[i]
        x2, y2 = coords[i + 1]
        t, d, pr_x, pr_y = point_to_segment_proj_m(px, py, x1, y1, x2, y2)
        if d < best_d:
            best_d = d
            best_px = pr_x
            best_py = pr_y
            seg_len = cum_dists[i + 1] - cum_dists[i]
            best_s = cum_dists[i] + t * seg_len
    return best_s, best_d, best_px, best_py


def clean_station_name(raw_name: str) -> str:
    """Normalise le nom d'arrêt en supprimant les suffixes d'opérateur."""
    name = raw_name.replace(" (Edinburgh Trams)", "").strip()
    name = name.replace(" – ", " - ")
    return name


def parse_time_s(t_str: str) -> int:
    """Convertit HH:MM:SS en secondes depuis minuit de service (conserve >= 24h)."""
    parts = [int(p) for p in t_str.strip().split(":")]
    return parts[0] * 3600 + parts[1] * 60 + parts[2]


def build_edinburgh_artifacts(
    gtfs_zip: Optional[str | Path] = None,
    osm_json_path: Optional[str | Path] = None,
    output_dir: str | Path = "cities/edinburgh/data",
    web_dir: Optional[str | Path] = "web/public/cities/edinburgh/data",
    target_date: str = "20261106"  # Premier jour de pleine validité après rétablissement de service
) -> dict:
    tracemalloc.start()
    t_start = time.time()

    repo_root = Path(__file__).resolve().parents[3]
    output_dir = Path(output_dir)
    if not output_dir.is_absolute():
        output_dir = repo_root / output_dir

    if web_dir:
        web_dir = Path(web_dir)
        if not web_dir.is_absolute():
            web_dir = repo_root / web_dir

    if not gtfs_zip:
        for candidate in [
            repo_root / "scratch" / "edinburgh_tram_gtfs.zip",
            repo_root / "scratch" / "itm_scotland_gtfs.zip"
        ]:
            if candidate.exists():
                gtfs_zip = candidate
                break

    if not gtfs_zip or not Path(gtfs_zip).exists():
        raise FileNotFoundError(f"Aucune archive GTFS trouvée pour Édimbourg.")

    resolved_zip = Path(gtfs_zip)
    output_dir.mkdir(parents=True, exist_ok=True)
    if web_dir:
        web_dir.mkdir(parents=True, exist_ok=True)

    print(f"[edinburgh-ingest] Ingestion GTFS Édimbourg depuis {resolved_zip}")

    with zipfile.ZipFile(resolved_zip) as z:
        # A. Agency timezone
        agency_tz = None
        agency_name = None
        with z.open("agency.txt") as f:
            for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
                if row.get("agency_id") == EDINBURGH_AGENCY_ID or not agency_tz:
                    agency_tz = row.get("agency_timezone")
                    agency_name = row.get("agency_name")
                    if row.get("agency_id") == EDINBURGH_AGENCY_ID:
                        break

        print(f"[edinburgh-ingest] Opérateur : {agency_name}, Fuseau horaire : {agency_tz}")
        if agency_tz != "Europe/London":
            raise ValueError(f"Fuseau horaire inattendu: {agency_tz} (attendu: Europe/London)")

        # B. Route metadata
        routes = {}
        with z.open("routes.txt") as f:
            for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
                if row.get("route_id") == EDINBURGH_ROUTE_ID:
                    routes[row["route_id"]] = row

        if not routes:
            raise ValueError(f"Ligne {EDINBURGH_ROUTE_ID} non trouvée dans routes.txt")

        # C. Stops
        raw_stops: Dict[str, dict] = {}
        with z.open("stops.txt") as f:
            for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
                raw_stops[row["stop_id"]] = row

        # D. Calendar
        calendar: Dict[str, dict] = {}
        if "calendar.txt" in z.namelist():
            with z.open("calendar.txt") as f:
                for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
                    calendar[row["service_id"]] = row

        calendar_dates: Dict[str, Dict[str, str]] = defaultdict(dict)
        if "calendar_dates.txt" in z.namelist():
            with z.open("calendar_dates.txt") as f:
                for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
                    calendar_dates[row["service_id"]][row["date"]] = row["exception_type"]

        # Date cible
        dt_target = datetime.strptime(target_date, "%Y%m%d")
        weekday_col = dt_target.strftime("%A").lower()

        def is_service_active(service_id: str, check_date: str, check_weekday: str) -> bool:
            if service_id in calendar_dates and check_date in calendar_dates[service_id]:
                return calendar_dates[service_id][check_date] == "1"
            if service_id in calendar:
                c = calendar[service_id]
                if c["start_date"] <= check_date <= c["end_date"]:
                    return c.get(check_weekday) == "1"
            return False

        # E. Trips
        trips_by_id: Dict[str, dict] = {}
        target_trips_by_id: Dict[str, dict] = {}
        trips_by_service: Dict[str, List[dict]] = defaultdict(list)
        shapes_used: Set[str] = set()

        with z.open("trips.txt") as f:
            for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
                if row.get("route_id") == EDINBURGH_ROUTE_ID:
                    tid = row["trip_id"]
                    sid = row["service_id"]
                    trips_by_id[tid] = row
                    trips_by_service[sid].append(row)
                    if is_service_active(sid, target_date, weekday_col):
                        target_trips_by_id[tid] = row
                        if row.get("shape_id"):
                            shapes_used.add(row["shape_id"])

        print(f"[edinburgh-ingest] Total courses Edinburgh Trams dans le flux : {len(trips_by_id)}")
        print(f"[edinburgh-ingest] Courses actives en semaine ({target_date}, {weekday_col}) : {len(target_trips_by_id)}")
        print(f"[edinburgh-ingest] Tracés shapes distincts utilisés : {len(shapes_used)}")

        # F. Shapes
        raw_shapes: Dict[str, List[Tuple[float, float, int]]] = defaultdict(list)
        with z.open("shapes.txt") as f:
            for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
                sid = row["shape_id"]
                if sid in shapes_used:
                    raw_shapes[sid].append((
                        float(row["shape_pt_lon"]),
                        float(row["shape_pt_lat"]),
                        int(row["shape_pt_sequence"])
                    ))

        sorted_shapes: Dict[str, List[Tuple[float, float]]] = {}
        for sid, pts in raw_shapes.items():
            pts.sort(key=lambda p: p[2])
            sorted_shapes[sid] = [(p[0], p[1]) for p in pts]

        # G. Stop times
        print(f"[edinburgh-ingest] Lecture de stop_times.txt...")
        stop_times_by_trip: Dict[str, List[dict]] = defaultdict(list)
        all_stop_times_by_trip: Dict[str, List[dict]] = defaultdict(list)
        stop_ids_used: Set[str] = set()
        max_gtfs_time_s = 0
        max_gtfs_time_str = ""

        with z.open("stop_times.txt") as f:
            for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
                tid = row["trip_id"]
                if tid in trips_by_id:
                    all_stop_times_by_trip[tid].append(row)
                    if tid in target_trips_by_id:
                        stop_times_by_trip[tid].append(row)
                        stop_ids_used.add(row["stop_id"])
                        for t_field in ("arrival_time", "departure_time"):
                            t_val = row.get(t_field, "")
                            if t_val:
                                ts = parse_time_s(t_val)
                                if ts > max_gtfs_time_s:
                                    max_gtfs_time_s = ts
                                    max_gtfs_time_str = t_val

        for tid in stop_times_by_trip:
            stop_times_by_trip[tid].sort(key=lambda s: int(s["stop_sequence"]))
        for tid in all_stop_times_by_trip:
            all_stop_times_by_trip[tid].sort(key=lambda s: int(s["stop_sequence"]))

        print(f"[edinburgh-ingest] Heure GTFS max : {max_gtfs_time_str} ({max_gtfs_time_s}s)")

    # =========================================================================
    # 1. Agrégation des quais aux 23 stations canoniques
    # =========================================================================
    stations_by_name: Dict[str, List[str]] = defaultdict(list)
    for st_id in stop_ids_used:
        raw_name = raw_stops[st_id]["stop_name"]
        clean_name = clean_station_name(raw_name)
        stations_by_name[clean_name].append(st_id)

    print(f"[edinburgh-ingest] {len(stations_by_name)} stations uniques identifiées.")
    if set(stations_by_name.keys()) != set(CANONICAL_STOPS):
        diff = set(stations_by_name.keys()) ^ set(CANONICAL_STOPS)
        raise ValueError(f"Écart avec la liste canonique des arrêts: {diff}")

    # =========================================================================
    # 2. Tracks OSM haute précision pour tracks.json
    # =========================================================================
    if not osm_json_path:
        osm_candidates = [
            repo_root / "scratch" / "tram-trains-main" / "map" / "data" / "edinburgh-tram.json",
            repo_root / "scratch" / "edinburgh-tram.json"
        ]
        for c in osm_candidates:
            if c.exists():
                osm_json_path = c
                break

    tracks_output = []
    osm_sublines = {}
    if osm_json_path and Path(osm_json_path).exists():
        print(f"[edinburgh-ingest] Chargement du tracé haute précision OSM depuis {osm_json_path}")
        with open(osm_json_path, "r", encoding="utf-8") as f:
            osm_geo = json.load(f)
        for feat in osm_geo.get("features", []):
            name = feat.get("properties", {}).get("name", "")
            geom = feat.get("geometry", {})
            if geom.get("type") == "MultiLineString":
                coords = geom.get("coordinates", [])
                if "Newhaven => Airport" in name:
                    osm_sublines[0] = coords[0]  # Tracé principal Newhaven -> Airport
                elif "Airport => Newhaven" in name:
                    osm_sublines[1] = coords[0]  # Tracé principal Airport -> Newhaven

    # Tracés tracks.json
    if 0 in osm_sublines and 1 in osm_sublines:
        tracks_output.append({
            "line_id": EDINBURGH_ROUTE_SHORT_NAME,
            "short_name": EDINBURGH_ROUTE_SHORT_NAME,
            "direction_id": 0,
            "stroke": TRAM_COLOR,
            "coordinates": [[round(p[0], 5), round(p[1], 5)] for p in osm_sublines[0]]
        })
        tracks_output.append({
            "line_id": EDINBURGH_ROUTE_SHORT_NAME,
            "short_name": EDINBURGH_ROUTE_SHORT_NAME,
            "direction_id": 1,
            "stroke": TRAM_COLOR,
            "coordinates": [[round(p[0], 5), round(p[1], 5)] for p in osm_sublines[1]]
        })
    else:
        # Repli sur les formes GTFS les plus longues si OSM absent
        for dir_id, sid in [(0, "7edf55fd-2e55-4a64-8a33-eba6898f6ff2"), (1, "762825bb-0ce4-4881-bbee-d2a5e9e8f4da")]:
            if sid in sorted_shapes:
                tracks_output.append({
                    "line_id": EDINBURGH_ROUTE_SHORT_NAME,
                    "short_name": EDINBURGH_ROUTE_SHORT_NAME,
                    "direction_id": dir_id,
                    "stroke": TRAM_COLOR,
                    "coordinates": [[round(p[0], 5), round(p[1], 5)] for p in sorted_shapes[sid]]
                })

    with open(output_dir / "tracks.json", "w", encoding="utf-8") as f:
        json.dump(tracks_output, f, ensure_ascii=False, separators=(",", ":"))
    print(f"[edinburgh-ingest] Écriture de tracks.json ({len(tracks_output)} voies physiques)")

    # =========================================================================
    # 3. Mesure de snap & recalage des stations (Règle 1.2 : recalage si > 5 m)
    # =========================================================================
    stations_data = {}
    snap_report = []

    # Polylignes de référence pour le calcul d'accrochage
    ref_polys = [t["coordinates"] for t in tracks_output]
    all_gtfs_polys = list(sorted_shapes.values())

    for stn_name in CANONICAL_STOPS:
        st_ids = stations_by_name[stn_name]
        coords = [(float(raw_stops[s]["stop_lon"]), float(raw_stops[s]["stop_lat"])) for s in st_ids]
        raw_lon = sum(c[0] for c in coords) / len(coords)
        raw_lat = sum(c[1] for c in coords) / len(coords)

        # Mesure de l'écart au tracé OSM / physique
        best_d = float("inf")
        snapped_x, snapped_y = raw_lon, raw_lat
        for poly in ref_polys:
            for i in range(len(poly) - 1):
                _, d, px, py = point_to_segment_proj_m(raw_lon, raw_lat, poly[i][0], poly[i][1], poly[i + 1][0], poly[i + 1][1])
                if d < best_d:
                    best_d = d
                    snapped_x = px
                    snapped_y = py

        # Si l'écart dépasse 5 m (Porte 1 règle 2), recaler sur le tracé
        is_snapped = best_d > 5.0
        final_lon = snapped_x if is_snapped else raw_lon
        final_lat = snapped_y if is_snapped else raw_lat
        stn_id = CANONICAL_IDS.get(stn_name, f"940GZZ{stn_name[:5].upper()}")

        stations_data[stn_name] = {
            "id": stn_id,
            "name": stn_name,
            "coordinates": [round(final_lon, 6), round(final_lat, 6)],
            "raw_coordinates": [round(raw_lon, 6), round(raw_lat, 6)],
            "raw_snap_m": round(best_d, 2),
            "snapped": is_snapped,
            "lines": [EDINBURGH_ROUTE_SHORT_NAME]
        }
        snap_report.append((stn_name, best_d, is_snapped))

    print("[edinburgh-ingest] Rapport des distances d'écart station-tracé :")
    for name, d_snap, recaled in sorted(snap_report, key=lambda x: -x[1]):
        status = "RECALÉ" if recaled else "conforme"
        print(f"  {name:26s} : {d_snap:5.2f} m ({status})")

    stations_list = [
        {
            "id": info["id"],
            "name": info["name"],
            "coordinates": info["coordinates"],
            "lines": info["lines"]
        }
        for info in stations_data.values()
    ]
    with open(output_dir / "stations.json", "w", encoding="utf-8") as f:
        json.dump(stations_list, f, ensure_ascii=False, indent=2)
    print(f"[edinburgh-ingest] Écriture de stations.json ({len(stations_list)} stations)")

    # =========================================================================
    # 4. shapes.bin (Binaire SHP2 rééchantillonné à 10 m)
    # =========================================================================
    STEP_M = 10.0
    resampled_shapes: List[ResampledShape] = []
    shape_cumulative_dists: Dict[str, List[float]] = {}

    for sid in sorted(sorted_shapes.keys()):
        coords = sorted_shapes[sid]
        raw_cum = [0.0]
        for i in range(1, len(coords)):
            raw_cum.append(raw_cum[-1] + equirect_dist_m(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]))
        shape_cumulative_dists[sid] = raw_cum

        total_len = raw_cum[-1]
        resampled_coords: List[Tuple[float, float]] = [coords[0]]
        cur_d = STEP_M
        seg_idx = 0
        while cur_d < total_len:
            while seg_idx < len(coords) - 1 and raw_cum[seg_idx + 1] < cur_d:
                seg_idx += 1
            if seg_idx >= len(coords) - 1:
                break
            seg_len = raw_cum[seg_idx + 1] - raw_cum[seg_idx]
            t = (cur_d - raw_cum[seg_idx]) / seg_len if seg_len > 0 else 0.0
            lng = coords[seg_idx][0] + t * (coords[seg_idx + 1][0] - coords[seg_idx][0])
            lat = coords[seg_idx][1] + t * (coords[seg_idx + 1][1] - coords[seg_idx][1])
            resampled_coords.append((round(lng, 7), round(lat, 7)))
            cur_d += STEP_M

        resampled_coords.append(coords[-1])
        tail_len = total_len - (len(resampled_coords) - 2) * STEP_M if len(resampled_coords) >= 2 else 0.0
        if tail_len < 0:
            tail_len = 0.0

        resampled_shapes.append(
            ResampledShape(
                shape_id=sid,
                coords=resampled_coords,
                step=STEP_M,
                tail_length=round(tail_len, 3)
            )
        )

    shapes_bin_path = output_dir / "shapes.bin"
    shp_meta = write_shapes_v2(resampled_shapes, shapes_bin_path)
    print(f"[edinburgh-ingest] Écriture de shapes.bin : {shp_meta['bytes']} octets, {shp_meta['shapes']} tracés, {shp_meta['points']} points")

    # =========================================================================
    # 5. schedule.json (Grille des courses et arrêts au format compact)
    # =========================================================================
    unique_station_names = CANONICAL_STOPS
    station_to_idx = {name: idx for idx, name in enumerate(unique_station_names)}

    schedule_trips = []
    short_turns_count = 0

    for tid, st_list in stop_times_by_trip.items():
        trip_row = target_trips_by_id[tid]
        dir_id = int(trip_row.get("direction_id", 0))
        shape_id = trip_row.get("shape_id", "")

        t0 = parse_time_s(st_list[0]["departure_time"])
        t1 = parse_time_s(st_list[-1]["arrival_time"])

        coords = sorted_shapes.get(shape_id, [])
        cum_dists = shape_cumulative_dists.get(shape_id, [])

        stops_data = []
        for st in st_list:
            raw_sname = raw_stops[st["stop_id"]]["stop_name"]
            stn_name = clean_station_name(raw_sname)
            stn_idx = station_to_idx[stn_name]

            arr_s = parse_time_s(st["arrival_time"])
            dep_s = parse_time_s(st["departure_time"])

            # Position sur la shape
            pf_row = raw_stops[st["stop_id"]]
            px, py = float(pf_row["stop_lon"]), float(pf_row["stop_lat"])
            s_dist, _, _, _ = project_on_polyline(px, py, coords, cum_dists)

            stops_data.append([
                arr_s,
                dep_s,
                round(s_dist, 1),
                stn_idx
            ])

        # Monotonie stricte des distances le long de la course
        for i in range(1, len(stops_data)):
            if stops_data[i][2] <= stops_data[i - 1][2]:
                stops_data[i][2] = stops_data[i - 1][2] + 1.0

        last_stn_idx = stops_data[-1][3]
        if len(st_list) < len(unique_station_names):
            short_turns_count += 1

        schedule_trips.append([
            tid,
            EDINBURGH_ROUTE_SHORT_NAME,
            dir_id,
            shape_id,
            t0,
            t1,
            last_stn_idx,
            stops_data
        ])

    # Tri par heure de départ
    schedule_trips.sort(key=lambda t: (t[4], t[0]))

    schedule_data = {
        "stations": unique_station_names,
        "trips": schedule_trips
    }
    with open(output_dir / "schedule.json", "w", encoding="utf-8") as f:
        json.dump(schedule_data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"[edinburgh-ingest] Écriture de schedule.json : {len(schedule_trips)} courses (dont {short_turns_count} services partiels préservés)")

    # =========================================================================
    # 6. lines.json (Ligne T50 / tram)
    # =========================================================================
    max_len_m = max(shape_cumulative_dists[s][-1] for s in shape_cumulative_dists)
    lines_output = [{
        "id": EDINBURGH_ROUTE_SHORT_NAME,
        "short_name": EDINBURGH_ROUTE_SHORT_NAME,
        "long_name": "Edinburgh Trams",
        "color": TRAM_COLOR,
        "text_color": TRAM_TEXT_COLOR,
        "mode": "tram",
        "destinations": {
            "0": "Edinburgh Airport",
            "1": "Newhaven"
        },
        "measured_length_km": round(max_len_m / 1000.0, 2),
        "elevation_offset": 0.0
    }]
    with open(output_dir / "lines.json", "w", encoding="utf-8") as f:
        json.dump(lines_output, f, ensure_ascii=False, indent=2)
    print(f"[edinburgh-ingest] Écriture de lines.json ({len(lines_output)} ligne)")

    # =========================================================================
    # 7. line_ladders.json (Thermomètre de ligne dans les deux directions)
    # =========================================================================
    line_ladders = {
        EDINBURGH_ROUTE_SHORT_NAME: {
            "id": EDINBURGH_ROUTE_SHORT_NAME,
            "short_name": EDINBURGH_ROUTE_SHORT_NAME,
            "color": TRAM_COLOR,
            "text_color": TRAM_TEXT_COLOR,
            "directions": {}
        }
    }

    for dir_id_int, (orig, term) in [(0, ("Newhaven", "Edinburgh Airport")), (1, ("Edinburgh Airport", "Newhaven"))]:
        full_trips = [t for t in schedule_trips if t[2] == dir_id_int and len(t[7]) == len(unique_station_names)]
        if not full_trips:
            full_trips = [t for t in schedule_trips if t[2] == dir_id_int]
        sample_stops = full_trips[0][7] if full_trips else []

        ladder_stations = []
        for st_entry in sample_stops:
            stn_name = unique_station_names[st_entry[3]]
            info = stations_data[stn_name]
            ladder_stations.append({
                "id": info["id"],
                "name": stn_name,
                "distance_m": st_entry[2],
                "coordinates": info["coordinates"],
                "is_hub": stn_name in KNOWN_HUBS,
                "transfers": []
            })

        line_ladders[EDINBURGH_ROUTE_SHORT_NAME]["directions"][str(dir_id_int)] = {
            "origin": orig,
            "terminus": term,
            "stations": ladder_stations
        }

    with open(output_dir / "line_ladders.json", "w", encoding="utf-8") as f:
        json.dump(line_ladders, f, ensure_ascii=False, indent=2)
    print(f"[edinburgh-ingest] Écriture de line_ladders.json")

    # =========================================================================
    # 8. station-rankings.json (Fréquences de desserte semaine, samedi, dimanche)
    # =========================================================================
    counts_by_service_type: Dict[str, Counter] = {
        "weekday": Counter(),
        "saturday": Counter(),
        "sunday": Counter()
    }

    # Comptage réel depuis toutes les courses de stop_times.txt
    for tid, st_list in all_stop_times_by_trip.items():
        sid = trips_by_id[tid]["service_id"]
        srv_key = "weekday" if sid == "40920" else "saturday" if sid == "51295" else "sunday" if sid == "51297" else "weekday"
        for st in st_list:
            sname = clean_station_name(raw_stops[st["stop_id"]]["stop_name"])
            counts_by_service_type[srv_key][sname] += 1

    station_rankings = {
        "weekday": [{"name": name, "count": count} for name, count in counts_by_service_type["weekday"].most_common()],
        "saturday": [{"name": name, "count": count} for name, count in counts_by_service_type["saturday"].most_common()],
        "sunday": [{"name": name, "count": count} for name, count in counts_by_service_type["sunday"].most_common()]
    }
    with open(output_dir / "station-rankings.json", "w", encoding="utf-8") as f:
        json.dump(station_rankings, f, ensure_ascii=False, indent=2)
    print(f"[edinburgh-ingest] Écriture de station-rankings.json")

    # =========================================================================
    # 9. sections.json (Modèle à plat)
    # =========================================================================
    sections_data = {
        "schema_version": 1,
        "source": {
            "provider": "Edinburgh Trams",
            "classification": {
                "flat": "Réseau modélisé à plat (tramway urbain de surface)"
            }
        },
        "summary": {
            "aerial_sections": 0,
            "aerial_km": 0.0,
            "network_type": "Tramway urbain de surface"
        }
    }
    with open(output_dir / "sections.json", "w", encoding="utf-8") as f:
        json.dump(sections_data, f, ensure_ascii=False, indent=2)
    print(f"[edinburgh-ingest] Écriture de sections.json")

    # =========================================================================
    # 10. feed_fingerprint.json
    # =========================================================================
    feed_fingerprint = {
        "url": BODS_SCOTLAND_GTFS_URL,
        "source": "Bus Open Data Service (BODS) / Department for Transport (OGL v3.0)",
        "dataset": "itm_scotland_gtfs.zip (Edinburgh Trams route 2908 / T50)",
        "generated_at": datetime.now().strftime("%Y-%m-%d"),
        "timezone": agency_tz,
        "max_gtfs_time": max_gtfs_time_str,
        "service_date": target_date,
        "lines": [EDINBURGH_ROUTE_SHORT_NAME]
    }
    with open(output_dir / "feed_fingerprint.json", "w", encoding="utf-8") as f:
        json.dump(feed_fingerprint, f, ensure_ascii=False, indent=2)
    print(f"[edinburgh-ingest] Écriture de feed_fingerprint.json")

    # =========================================================================
    # 11. rolling-stock.json (CAF Urbos 3)
    # =========================================================================
    rolling_stock = {
        "asset_families": {
            "edinburgh_trams": {
                "family_id": "edinburgh_trams",
                "reference_dimensions_m": {
                    "car_length_m": 42.8,
                    "car_height_m": 3.4,
                    "width_m": 2.65
                }
            }
        },
        "models": {
            "CAF_URBOS_3": {
                "model_id": "CAF_URBOS_3",
                "name": "CAF Urbos 3 (Edinburgh Trams)",
                "manufacturer": "CAF (Construcciones y Auxiliar de Ferrocarriles)",
                "cars_count": 7,
                "total_length_m": 42.8,
                "car_length_m": 6.11,
                "bogie_centres_m": 8.0,
                "width_m": 2.65,
                "inter_car_gap_m": 0.2,
                "drive_type": "overhead_wire",
                "driverless": False,
                "source": "Spécifications CAF Urbos 3 Édimbourg (7 caisses articulées, 42.8 m)",
                "verified": False
            }
        },
        "lines": {
            EDINBURGH_ROUTE_SHORT_NAME: {
                "line_id": EDINBURGH_ROUTE_SHORT_NAME,
                "short_name": EDINBURGH_ROUTE_SHORT_NAME,
                "model_id": "CAF_URBOS_3",
                "name": "CAF Urbos 3 (7 caisses)",
                "cars_count": 7,
                "total_length_m": 42.8,
                "car_length_m": 6.11,
                "bogie_centres_m": 8.0,
                "width_m": 2.65,
                "inter_car_gap_m": 0.2,
                "drive_type": "overhead_wire",
                "driverless": False,
                "source": "Flotte de 27 rames CAF Urbos 3 d'Édimbourg",
                "verified": False
            }
        }
    }
    with open(output_dir / "rolling-stock.json", "w", encoding="utf-8") as f:
        json.dump(rolling_stock, f, ensure_ascii=False, indent=2)
    print(f"[edinburgh-ingest] Écriture de rolling-stock.json")

    # Copie vers web/public
    if web_dir:
        for fname in [
            "lines.json", "stations.json", "tracks.json", "shapes.bin",
            "schedule.json", "line_ladders.json", "station-rankings.json",
            "sections.json", "feed_fingerprint.json", "rolling-stock.json"
        ]:
            src_file = output_dir / fname
            if src_file.exists():
                shutil.copy2(src_file, web_dir / fname)
        print(f"[edinburgh-ingest] 10 artefacts copiés avec succès vers {web_dir}")

    elapsed = time.time() - t_start
    current_mem, peak_mem = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    summary = {
        "lines": [EDINBURGH_ROUTE_SHORT_NAME],
        "trips_count": len(schedule_trips),
        "short_turns_count": short_turns_count,
        "stations_count": len(stations_data),
        "recaled_stations_count": sum(1 for info in stations_data.values() if info["snapped"]),
        "max_gtfs_time": max_gtfs_time_str,
        "duration_sec": round(elapsed, 2),
        "peak_memory_mb": round(peak_mem / (1024 * 1024), 2),
        "shapes_bytes": shp_meta["bytes"]
    }

    print("\n" + "=" * 60)
    print(f"✅ Ingestion Édimbourg terminée avec succès en {summary['duration_sec']}s !")
    print(f"   Courses semaine générées : {summary['trips_count']} (dont {summary['short_turns_count']} partiels)")
    print(f"   Stations : {summary['stations_count']} (dont {summary['recaled_stations_count']} recalées sur le tracé)")
    print(f"   Heure GTFS max : {summary['max_gtfs_time']}")
    print(f"   Poids shapes.bin : {summary['shapes_bytes']} octets")
    print(f"   Pic mémoire : {summary['peak_memory_mb']} Mo")
    print("=" * 60 + "\n")

    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingestion GTFS Edinburgh Trams")
    parser.add_argument("--gtfs-zip", default=None, help="Chemin vers le fichier GTFS zip")
    parser.add_argument("--osm-json", default=None, help="Chemin vers le tracé GeoJSON OSM")
    parser.add_argument("--out-dir", default="cities/edinburgh/data", help="Répertoire de sortie")
    parser.add_argument("--web-dir", default="web/public/cities/edinburgh/data", help="Répertoire web public")
    args = parser.parse_args()

    build_edinburgh_artifacts(
        gtfs_zip=args.gtfs_zip,
        osm_json_path=args.osm_json,
        output_dir=args.out_dir,
        web_dir=args.web_dir
    )
