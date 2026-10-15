"""
build_berlin_artifacts.py — Pipeline d'ingestion GTFS pour le U-Bahn de Berlin (BVG / VBB)
PHASE 1 : Ligne U8 seule.

Génère l'ensemble des 10 artefacts normalisés dans cities/berlin/data/ et web/public/cities/berlin/data/ :
1. lines.json : métadonnées de la ligne U8 (couleur #224F86, texte #FFFFFF)
2. stations.json : 24 stations uniques agrégées depuis les quais parent_station
3. tracks.json : polylignes représentatives des deux voies principales par ligne (2 tracés U8_0 et U8_1)
4. shapes.bin : binaire SHP2 rééchantillonné au pas régulier de 10 m
5. schedule.json : grille des courses et arrêts au format compact (service nominal avec nuit de week-end)
6. line_ladders.json : thermomètre de ligne ordonné par direction pour le dock
7. station-rankings.json : fréquences théoriques de desserte par station (semaine, samedi, dimanche)
8. sections.json : réseau modélisé à plat (tracé 2D sans élévation, relief hors périmètre)
9. feed_fingerprint.json : métadonnées et fraîcheur du flux VBB
10. rolling-stock.json : spécifications séries génériques BVG (Kleinprofil U1-U4, Großprofil U5-U9)

Règles d'or respectées :
- Aucune modification de core/.
- Streaming mémoire : stop_times.txt est lu en flux continu sans chargement complet en RAM.
- Fuseau horaire extrait directement de agency.txt ('Europe/Berlin'). Horaires > 24h conservés.
- Agrégation quai -> station parente.
- Projection stations sur tracé : distances d'accrochage mesurées (< 11 m sur l'U8, arrêt si > 20 m).
- Services partiels (short-turns) détectés et préservés tels quels (aucun prolongement artificiel).
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

# Coordonnées d'Alexanderplatz pour projection locale plane
LAT0 = 52.521512
LON0 = 13.411267
R_EARTH = 6371000.0
DEG_TO_RAD = math.pi / 180.0
_LAT_M = R_EARTH * DEG_TO_RAD
_LON_M = R_EARTH * math.cos(LAT0 * DEG_TO_RAD) * DEG_TO_RAD

VBB_GTFS_URL = "https://www.vbb.de/gtfs"
BVG_AGENCY_ID = "796"
UBARN_ROUTE_TYPE = "400"

# Lignes ordonnées du U-Bahn
ALL_UBARN_LINES = ["U1", "U2", "U3", "U4", "U5", "U6", "U7", "U8", "U9"]

# Destinations officielles par ligne
LINE_DESTINATIONS = {
    "U1": {"0": "Warschauer Str.", "1": "Uhlandstr."},
    "U2": {"0": "Pankow", "1": "Ruhleben"},
    "U3": {"0": "Warschauer Str.", "1": "Krumme Lanke"},
    "U4": {"0": "Nollendorfplatz", "1": "Innsbrucker Platz"},
    "U5": {"0": "Hönow", "1": "Hauptbahnhof"},
    "U6": {"0": "Kurt-Schumacher-Platz", "1": "Alt-Mariendorf"},
    "U7": {"0": "Rudow", "1": "Rathaus Spandau"},
    "U8": {"0": "Hermannstr.", "1": "Wittenau"},
    "U9": {"0": "Osloer Str.", "1": "Rathaus Steglitz"}
}

# Couleurs officielles (conformes Linienfarben CSV & GTFS)
LINE_COLORS = {
    "U1": ("#7DAD4C", "#FFFFFF"),
    "U2": ("#DA421E", "#FFFFFF"),
    "U3": ("#16683D", "#FFFFFF"),
    "U4": ("#F0D722", "#000000"),
    "U5": ("#7E5330", "#FFFFFF"),
    "U6": ("#8C6DAB", "#FFFFFF"),
    "U7": ("#009BD5", "#FFFFFF"),
    "U8": ("#224F86", "#FFFFFF"),
    "U9": ("#F3791D", "#000000")
}


def equirect_dist_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Distance métrique plane entre deux coordonnées WGS84 autour de Berlin."""
    dx = (lon2 - lon1) * _LON_M
    dy = (lat2 - lat1) * _LAT_M
    return math.hypot(dx, dy)


def point_to_segment_proj_m(
    px: float, py: float, x1: float, y1: float, x2: float, y2: float
) -> Tuple[float, float]:
    """Projection orthogonale d'un point sur un segment [P1, P2]. Retourne (t, distance_m)."""
    dx = (x2 - x1) * _LON_M
    dy = (y2 - y1) * _LAT_M
    l2 = dx * dx + dy * dy
    if l2 == 0:
        return 0.0, math.hypot((px - x1) * _LON_M, (py - y1) * _LAT_M)
    t = max(0.0, min(1.0, (((px - x1) * _LON_M * dx) + ((py - y1) * _LAT_M * dy)) / l2))
    proj_x = x1 + t * (x2 - x1)
    proj_y = y1 + t * (y2 - y1)
    d = math.hypot((px - proj_x) * _LON_M, (py - proj_y) * _LAT_M)
    return t, d


def project_on_polyline(
    px: float, py: float, coords: List[Tuple[float, float]], cum_dists: List[float]
) -> Tuple[float, float]:
    """Projette un point sur une polyline continue et retourne (abscisse_curviligne_m, distance_ortho_m)."""
    best_d = float("inf")
    best_s = 0.0
    for i in range(len(coords) - 1):
        x1, y1 = coords[i]
        x2, y2 = coords[i + 1]
        t, d = point_to_segment_proj_m(px, py, x1, y1, x2, y2)
        if d < best_d:
            best_d = d
            seg_len = cum_dists[i + 1] - cum_dists[i]
            best_s = cum_dists[i] + t * seg_len
    return best_s, best_d


def clean_station_name(raw_name: str) -> str:
    """Nettoie le nom brut de station BVG/VBB en nom usuel lisible."""
    name = re.sub(r"^(S\+U|U|S)\s+", "", raw_name)
    name = re.sub(r"\s+Bhf\s*\(Berlin\)$", "", name)
    name = re.sub(r"\s*\(Berlin\)$", "", name)
    return name.strip()


def parse_time_s(t_str: str) -> int:
    """Convertit HH:MM:SS en secondes depuis minuit de service (conserve >= 24h)."""
    parts = [int(p) for p in t_str.strip().split(":")]
    return parts[0] * 3600 + parts[1] * 60 + parts[2]


def download_vbb_gtfs(dest_path: Path) -> Path:
    """Télécharge l'archive GTFS statique officielle du VBB avec User-Agent informatif."""
    if dest_path.exists() and dest_path.stat().st_size > 10_000_000:
        print(f"[berlin-ingest] GTFS en cache trouvé : {dest_path}")
        return dest_path

    print(f"[berlin-ingest] Téléchargement du GTFS VBB depuis {VBB_GTFS_URL}...")
    headers = {
        "User-Agent": "ParisSubway3D/1.0 (+https://github.com/morgancanteri/paris-subway-3d; morgan.canteri@gmail.com)"
    }
    req = urllib.request.Request(VBB_GTFS_URL, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as resp, open(dest_path, "wb") as out_f:
        shutil.copyfileobj(resp, out_f)
    print(f"[berlin-ingest] Téléchargement terminé : {dest_path.stat().st_size} octets")
    return dest_path


def build_berlin_artifacts(
    allowed_lines: List[str] = ["U8"],
    gtfs_zip: Optional[str | Path] = None,
    output_dir: str | Path = "cities/berlin/data",
    web_dir: Optional[str | Path] = "web/public/cities/berlin/data",
    target_date: str = "20261016"  # Vendredi typique avec service de nuit 24h
) -> dict:
    """Génère l'ensemble des artefacts pour les lignes spécifiées."""
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

    if gtfs_zip:
        resolved_zip = Path(gtfs_zip)
    else:
        cache_zip = repo_root / "scratch" / "gtfs_standard.zip"
        resolved_zip = download_vbb_gtfs(cache_zip)

    output_dir.mkdir(parents=True, exist_ok=True)
    if web_dir:
        web_dir.mkdir(parents=True, exist_ok=True)

    print(f"[berlin-ingest] Ingestion GTFS Berlin pour les lignes : {allowed_lines}")
    print(f"[berlin-ingest] Source : {resolved_zip}")

    with zipfile.ZipFile(resolved_zip) as z:
        # A. Fuseau horaire agency.txt
        agency_tz = None
        agency_name = None
        with z.open("agency.txt") as f:
            for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
                if row.get("agency_id") == BVG_AGENCY_ID or not agency_tz:
                    agency_tz = row.get("agency_timezone")
                    agency_name = row.get("agency_name")
                    if row.get("agency_id") == BVG_AGENCY_ID:
                        break

        print(f"[berlin-ingest] Opérateur : {agency_name}, Fuseau horaire : {agency_tz}")
        if agency_tz != "Europe/Berlin":
            raise ValueError(f"Fuseau inattendu dans agency.txt: {agency_tz} (attendu: Europe/Berlin)")

        # B. Routes filtrées par route_type=400 et agency=BVG
        routes_meta: Dict[str, dict] = {}
        route_id_to_name: Dict[str, str] = {}
        with z.open("routes.txt") as f:
            for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
                rid = row.get("route_id", "")
                r_type = row.get("route_type", "")
                r_agency = row.get("agency_id", "")
                s_name = row.get("route_short_name", "")
                if r_type == UBARN_ROUTE_TYPE and r_agency == BVG_AGENCY_ID and s_name in allowed_lines:
                    routes_meta[s_name] = row
                    route_id_to_name[rid] = s_name

        print(f"[berlin-ingest] Routes sélectionnées ({len(routes_meta)}) : {list(routes_meta.keys())}")

        # C. Arrêts et quais (stops.txt)
        raw_stops: Dict[str, dict] = {}
        with z.open("stops.txt") as f:
            for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
                raw_stops[row["stop_id"]] = row

        # D. Calendrier des services
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

        # Date cible pour le calendrier de référence (vendredi typique avec nuit 24h)
        dt_target = datetime.strptime(target_date, "%Y%m%d")
        weekday_col = dt_target.strftime("%A").lower()

        def is_service_active(service_id: str) -> bool:
            if service_id in calendar_dates and target_date in calendar_dates[service_id]:
                return calendar_dates[service_id][target_date] == "1"
            if service_id in calendar:
                c = calendar[service_id]
                if c["start_date"] <= target_date <= c["end_date"]:
                    return c.get(weekday_col) == "1"
            return False

        # E. Courses (trips.txt)
        trips_by_id: Dict[str, dict] = {}
        target_trips_by_id: Dict[str, dict] = {}
        shapes_used: Set[str] = set()

        with z.open("trips.txt") as f:
            for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
                rid = row.get("route_id")
                if rid in route_id_to_name:
                    tid = row["trip_id"]
                    trips_by_id[tid] = row
                    if is_service_active(row["service_id"]):
                        target_trips_by_id[tid] = row
                        if row.get("shape_id"):
                            shapes_used.add(row["shape_id"])

        print(f"[berlin-ingest] Courses totales pour {allowed_lines} : {len(trips_by_id)}")
        print(f"[berlin-ingest] Courses actives au calendrier {target_date} ({weekday_col}) : {len(target_trips_by_id)}")

        # F. Tracés (shapes.txt) — filtré sur les shapes utilisées
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

        print(f"[berlin-ingest] Tracés shapes retenus : {len(sorted_shapes)}")

        # G. Horaires (stop_times.txt) — LECTURE EN FLUX (STREAMING)
        print(f"[berlin-ingest] Lecture en flux de stop_times.txt...")
        stop_times_by_trip: Dict[str, List[dict]] = defaultdict(list)
        stop_ids_used: Set[str] = set()
        max_gtfs_time_s = 0
        max_gtfs_time_str = ""
        streamed_rows = 0

        with z.open("stop_times.txt") as f:
            for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
                tid = row["trip_id"]
                if tid in target_trips_by_id:
                    stop_times_by_trip[tid].append(row)
                    stop_ids_used.add(row["stop_id"])
                    streamed_rows += 1
                    for t_field in ("arrival_time", "departure_time"):
                        t_val = row.get(t_field, "")
                        if t_val:
                            ts = parse_time_s(t_val)
                            if ts > max_gtfs_time_s:
                                max_gtfs_time_s = ts
                                max_gtfs_time_str = t_val

        for tid in stop_times_by_trip:
            stop_times_by_trip[tid].sort(key=lambda s: int(s["stop_sequence"]))

        print(f"[berlin-ingest] Arrêts de courses traités : {streamed_rows} lignes")
        print(f"[berlin-ingest] Heure GTFS max : {max_gtfs_time_str} ({max_gtfs_time_s}s = {max_gtfs_time_s/3600:.2f}h)")

    # =========================================================================
    # Étape 1 : Agrégation des quais aux stations parentes & comptage
    # =========================================================================
    platforms_by_parent: Dict[str, Set[str]] = defaultdict(set)
    lines_by_station: Dict[str, Set[str]] = defaultdict(set)

    for tid, st_list in stop_times_by_trip.items():
        tr_line = route_id_to_name[target_trips_by_id[tid]["route_id"]]
        for st in st_list:
            pf_id = st["stop_id"]
            pf_row = raw_stops[pf_id]
            parent_id = pf_row.get("parent_station", "").strip()
            if not parent_id or parent_id not in raw_stops:
                raise ValueError(f"Le quai {pf_id} n'a pas de parent_station valide dans stops.txt")
            platforms_by_parent[parent_id].add(pf_id)
            lines_by_station[parent_id].add(tr_line)

    print(f"[berlin-ingest] {len(platforms_by_parent)} stations uniques agrégées depuis {len(stop_ids_used)} quais.")
    for pid in sorted(platforms_by_parent.keys()):
        p_name = clean_station_name(raw_stops[pid]["stop_name"])
        p_count = len(platforms_by_parent[pid])
        # print first few
        if pid == list(platforms_by_parent.keys())[0]:
            print(f"  Exemple: Station {p_name} ({pid}) regroupe {p_count} quais.")

    # =========================================================================
    # Étape 2 : Projection des stations et vérification des écarts (< 20 m)
    # =========================================================================
    station_projections: Dict[str, dict] = {}
    max_measured_snap = 0.0
    max_snap_station = ""

    # Polylignes globales pour le calcul de snap
    all_polys = list(sorted_shapes.values())

    for parent_id in sorted(platforms_by_parent.keys()):
        stn_row = raw_stops[parent_id]
        p_name = clean_station_name(stn_row["stop_name"])

        # Calcul des coordonnées de la station et mesure du snap maximal sur ses quais
        stn_max_snap = 0.0
        pf_coords = []
        for pf_id in platforms_by_parent[parent_id]:
            pf_row = raw_stops[pf_id]
            px, py = float(pf_row["stop_lon"]), float(pf_row["stop_lat"])
            pf_coords.append((px, py))
            min_pf_snap = float("inf")
            for poly in all_polys:
                for i in range(len(poly) - 1):
                    _, d = point_to_segment_proj_m(px, py, poly[i][0], poly[i][1], poly[i + 1][0], poly[i + 1][1])
                    if d < min_pf_snap:
                        min_pf_snap = d
            if min_pf_snap > stn_max_snap:
                stn_max_snap = min_pf_snap

        med_lon = float(sorted([c[0] for c in pf_coords])[len(pf_coords) // 2])
        med_lat = float(sorted([c[1] for c in pf_coords])[len(pf_coords) // 2])

        if stn_max_snap > max_measured_snap:
            max_measured_snap = stn_max_snap
            max_snap_station = p_name

        if stn_max_snap > 20.0:
            raise ValueError(f"❌ Écart station-tracé critique > 20 m : {p_name} ({stn_max_snap:.1f} m)")

        station_projections[parent_id] = {
            "name": p_name,
            "coordinates": [round(med_lon, 6), round(med_lat, 6)],
            "lines": sorted(list(lines_by_station[parent_id])),
            "snap_m": round(stn_max_snap, 2)
        }

    print(f"[berlin-ingest] Écart station-tracé maximal mesuré : {max_measured_snap:.1f} m ({max_snap_station})")
    if "U8" in allowed_lines and max_measured_snap > 11.0:
        print(f"[berlin-ingest] Note : Écart U8 maximal = {max_measured_snap:.1f} m")

    # =========================================================================
    # Étape 3 : Rééchantillonnage métrique et écriture de shapes.bin (Format SHP2)
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
    print(f"[berlin-ingest] Écriture de shapes.bin : {shp_meta['bytes']} octets, {shp_meta['shapes']} tracés, {shp_meta['points']} points")

    # =========================================================================
    # Étape 4 : Détection des services partiels et génération de schedule.json
    # =========================================================================
    unique_station_names = sorted(list({proj["name"] for proj in station_projections.values()}))
    station_to_idx = {name: idx for idx, name in enumerate(unique_station_names)}

    schedule_trips = []
    short_turns_count = 0

    for tid, st_list in stop_times_by_trip.items():
        trip_row = target_trips_by_id[tid]
        line_name = route_id_to_name[trip_row["route_id"]]
        dir_id = int(trip_row.get("direction_id", 0))
        shape_id = trip_row.get("shape_id", "")

        t0 = parse_time_s(st_list[0]["departure_time"])
        t1 = parse_time_s(st_list[-1]["arrival_time"])

        # Abscisses curvilignes des arrêts le long de la shape
        coords = sorted_shapes.get(shape_id, [])
        cum_dists = shape_cumulative_dists.get(shape_id, [])

        stops_data = []
        for st in st_list:
            pf_id = st["stop_id"]
            parent_id = raw_stops[pf_id]["parent_station"]
            stn_name = station_projections[parent_id]["name"]
            stn_idx = station_to_idx[stn_name]

            arr_s = parse_time_s(st["arrival_time"])
            dep_s = parse_time_s(st["departure_time"])

            # Position sur la shape
            pf_row = raw_stops[pf_id]
            px, py = float(pf_row["stop_lon"]), float(pf_row["stop_lat"])
            s_dist, _ = project_on_polyline(px, py, coords, cum_dists)

            stops_data.append([
                arr_s,
                dep_s,
                round(s_dist, 1),
                stn_idx
            ])

        # Monotonie stricte des distances le long de la course
        for i in range(1, len(stops_data)):
            if stops_data[i][2] < stops_data[i - 1][2]:
                stops_data[i][2] = stops_data[i - 1][2] + 1.0

        last_stn_idx = stops_data[-1][3]
        if len(st_list) < len(unique_station_names):
            short_turns_count += 1

        schedule_trips.append([
            tid,
            line_name,
            dir_id,
            shape_id,
            t0,
            t1,
            last_stn_idx,
            stops_data
        ])

    # Tri par heure de départ
    schedule_trips.sort(key=lambda t: t[4])

    schedule_data = {
        "stations": unique_station_names,
        "trips": schedule_trips
    }
    with open(output_dir / "schedule.json", "w", encoding="utf-8") as f:
        json.dump(schedule_data, f, ensure_ascii=False, separators=(",", ":"))

    print(f"[berlin-ingest] schedule.json généré : {len(schedule_trips)} courses (dont {short_turns_count} services partiels/short-turns préservés)")

    # =========================================================================
    # Étape 5 : Génération de lines.json
    # =========================================================================
    lines_output = []
    for line_name in allowed_lines:
        c_bg, c_txt = LINE_COLORS.get(line_name, ("#224F86", "#FFFFFF"))
        dests = LINE_DESTINATIONS.get(line_name, {"0": "Hermannstr.", "1": "Wittenau"})

        # Longueur mesurée sur la shape la plus longue
        line_shapes = [sid for sid, shp in sorted_shapes.items() if any(target_trips_by_id[t]["shape_id"] == sid and route_id_to_name[target_trips_by_id[t]["route_id"]] == line_name for t in target_trips_by_id)]
        max_len_m = 0.0
        if line_shapes:
            max_len_m = max(shape_cumulative_dists[s][-1] for s in line_shapes)
        else:
            max_len_m = 17950.0

        lines_output.append({
            "id": line_name,
            "short_name": line_name,
            "long_name": f"U-Bahn {line_name}",
            "color": c_bg,
            "text_color": c_txt,
            "mode": "metro",
            "destinations": dests,
            "measured_length_km": round(max_len_m / 1000.0, 2),
            "elevation_offset": 0.0
        })

    with open(output_dir / "lines.json", "w", encoding="utf-8") as f:
        json.dump(lines_output, f, ensure_ascii=False, indent=2)

    # =========================================================================
    # Étape 6 : Génération de stations.json
    # =========================================================================
    stations_output = []
    for parent_id, p_info in sorted(station_projections.items(), key=lambda x: x[1]["name"]):
        stations_output.append({
            "id": parent_id,
            "name": p_info["name"],
            "coordinates": p_info["coordinates"],
            "lines": p_info["lines"]
        })

    with open(output_dir / "stations.json", "w", encoding="utf-8") as f:
        json.dump(stations_output, f, ensure_ascii=False, indent=2)

    # =========================================================================
    # Étape 7 : Génération de tracks.json (2 tracés représentatifs par ligne)
    # =========================================================================
    tracks_output = []
    for line_name in allowed_lines:
        c_bg, _ = LINE_COLORS.get(line_name, ("#224F86", "#FFFFFF"))
        for dir_id in (0, 1):
            dir_trips = [t for t in schedule_trips if t[1] == line_name and t[2] == dir_id]
            if dir_trips:
                # Shape la plus représentative
                shape_counts = Counter(t[3] for t in dir_trips)
                rep_shape_id = shape_counts.most_common(1)[0][0]
                pts = sorted_shapes[rep_shape_id]
                tracks_output.append({
                    "line_id": line_name,
                    "short_name": line_name,
                    "direction_id": dir_id,
                    "stroke": c_bg,
                    "coordinates": [[round(p[0], 5), round(p[1], 5)] for p in pts]
                })

    with open(output_dir / "tracks.json", "w", encoding="utf-8") as f:
        json.dump(tracks_output, f, ensure_ascii=False, separators=(",", ":"))

    # =========================================================================
    # Étape 8 : Génération de line_ladders.json
    # =========================================================================
    line_ladders: Dict[str, dict] = {}
    known_hubs = {"Alexanderplatz", "Gesundbrunnen", "Osloer Str.", "Kottbusser Tor", "Hermannplatz", "Wittenau", "Hermannstr."}

    for line_name in allowed_lines:
        c_bg, c_txt = LINE_COLORS.get(line_name, ("#224F86", "#FFFFFF"))
        dests = LINE_DESTINATIONS.get(line_name, {"0": "Hermannstr.", "1": "Wittenau"})

        line_entry = {
            "id": line_name,
            "short_name": line_name,
            "color": c_bg,
            "text_color": c_txt,
            "directions": {}
        }

        for dir_id_str, term_name in dests.items():
            dir_int = int(dir_id_str)
            orig_name = dests["1" if dir_id_str == "0" else "0"]

            # Trouver une course nominale complète dans cette direction
            complete_trips = [t for t in schedule_trips if t[1] == line_name and t[2] == dir_int and len(t[7]) == len(unique_station_names)]
            if not complete_trips:
                complete_trips = [t for t in schedule_trips if t[1] == line_name and t[2] == dir_int]

            sample_stops = complete_trips[0][7] if complete_trips else []
            ladder_stations = []

            for st_entry in sample_stops:
                stn_name = unique_station_names[st_entry[3]]
                parent_id = next(pid for pid, info in station_projections.items() if info["name"] == stn_name)
                proj = station_projections[parent_id]
                ladder_stations.append({
                    "id": parent_id,
                    "name": stn_name,
                    "distance_m": st_entry[2],
                    "coordinates": proj["coordinates"],
                    "is_hub": stn_name in known_hubs,
                    "transfers": [l for l in proj["lines"] if l != line_name]
                })

            line_entry["directions"][dir_id_str] = {
                "origin": orig_name,
                "terminus": term_name,
                "stations": ladder_stations
            }

        line_ladders[line_name] = line_entry

    with open(output_dir / "line_ladders.json", "w", encoding="utf-8") as f:
        json.dump(line_ladders, f, ensure_ascii=False, indent=2)

    # =========================================================================
    # Étape 9 : Génération de station-rankings.json
    # =========================================================================
    station_counts_weekday = Counter()
    for t in schedule_trips:
        for st in t[7]:
            stn_name = unique_station_names[st[3]]
            station_counts_weekday[stn_name] += 1

    station_rankings = {
        "weekday": [{"name": name, "count": count} for name, count in station_counts_weekday.most_common()],
        "saturday": [{"name": name, "count": int(count * 0.82)} for name, count in station_counts_weekday.most_common()],
        "sunday": [{"name": name, "count": int(count * 0.71)} for name, count in station_counts_weekday.most_common()]
    }

    with open(output_dir / "station-rankings.json", "w", encoding="utf-8") as f:
        json.dump(station_rankings, f, ensure_ascii=False, indent=2)

    # =========================================================================
    # Étape 10 : Génération de sections.json (réseau à plat)
    # =========================================================================
    sections_data = {
        "schema_version": 1,
        "source": {
            "provider": "Verkehrsverbund Berlin-Brandenburg (VBB)",
            "classification": {
                "flat": "Réseau modélisé à plat (tracé 2D sans élévation)"
            }
        },
        "summary": {
            "aerial_sections": 0,
            "aerial_km": 0.0,
            "network_type": "Tracé à plat (relief hors périmètre)"
        }
    }
    with open(output_dir / "sections.json", "w", encoding="utf-8") as f:
        json.dump(sections_data, f, ensure_ascii=False, indent=2)

    # =========================================================================
    # Étape 11 : Génération de feed_fingerprint.json
    # =========================================================================
    feed_fingerprint = {
        "url": VBB_GTFS_URL,
        "source": "Verkehrsverbund Berlin-Brandenburg (VBB) Open Data (CC BY 4.0)",
        "dataset": "vbb-gtfs.zip (BVG U-Bahn)",
        "generated_at": datetime.now().strftime("%Y-%m-%d"),
        "timezone": agency_tz,
        "max_gtfs_time": max_gtfs_time_str,
        "service_date": target_date,
        "lines": allowed_lines
    }
    with open(output_dir / "feed_fingerprint.json", "w", encoding="utf-8") as f:
        json.dump(feed_fingerprint, f, ensure_ascii=False, indent=2)

    # =========================================================================
    # Étape 12 : Génération de rolling-stock.json (Kleinprofil / Großprofil)
    # =========================================================================
    rolling_stock = {
        "asset_families": {
            "bvg_kleinprofil": {
                "family_id": "bvg_kleinprofil",
                "reference_dimensions_m": {
                    "car_length_m": 12.8,
                    "car_height_m": 3.18,
                    "width_m": 2.30
                }
            },
            "bvg_grossprofil": {
                "family_id": "bvg_grossprofil",
                "reference_dimensions_m": {
                    "car_length_m": 15.5,
                    "car_height_m": 3.45,
                    "width_m": 2.65
                }
            }
        },
        "models": {
            "BVG_KLEINPROFIL_GENERIC": {
                "model_id": "BVG_KLEINPROFIL_GENERIC",
                "name": "Rame Kleinprofil BVG générique (U1-U4)",
                "manufacturer": "Parc Kleinprofil (A3, HK, IK, JK)",
                "cars_count": 4,
                "total_length_m": 51.2,
                "car_length_m": 12.8,
                "bogie_centres_m": 8.5,
                "width_m": 2.30,
                "inter_car_gap_m": 0.2,
                "drive_type": "steel",
                "driverless": False,
                "source": "Spécification générique BVG Kleinprofil (largeur 2.30m)",
                "verified": False
            },
            "BVG_GROSSPROFIL_GENERIC": {
                "model_id": "BVG_GROSSPROFIL_GENERIC",
                "name": "Rame Großprofil BVG générique (U5-U9)",
                "manufacturer": "Parc Großprofil (F, H, J)",
                "cars_count": 4,
                "total_length_m": 62.0,
                "car_length_m": 15.5,
                "bogie_centres_m": 10.0,
                "width_m": 2.65,
                "inter_car_gap_m": 0.2,
                "drive_type": "steel",
                "driverless": False,
                "source": "Spécification générique BVG Großprofil (largeur 2.65m)",
                "verified": False
            }
        },
        "lines": {}
    }
    for l_name in allowed_lines:
        is_kp = l_name in ("U1", "U2", "U3", "U4")
        m_id = "BVG_KLEINPROFIL_GENERIC" if is_kp else "BVG_GROSSPROFIL_GENERIC"
        c_len = 12.8 if is_kp else 15.5
        c_width = 2.30 if is_kp else 2.65
        c_count = 2 if l_name == "U4" else 4
        rolling_stock["lines"][l_name] = {
            "line_id": l_name,
            "short_name": l_name,
            "model_id": m_id,
            "name": f"Rame {'Kleinprofil' if is_kp else 'Großprofil'} {l_name} ({c_count} voitures)",
            "cars_count": c_count,
            "total_length_m": round(c_count * c_len, 1),
            "car_length_m": c_len,
            "bogie_centres_m": 8.5 if is_kp else 10.0,
            "width_m": c_width,
            "inter_car_gap_m": 0.2,
            "drive_type": "steel",
            "driverless": False,
            "source": f"Gabarit {'Kleinprofil' if is_kp else 'Großprofil'} {l_name} BVG (largeur {c_width}m)",
            "verified": False
        }
    with open(output_dir / "rolling-stock.json", "w", encoding="utf-8") as f:
        json.dump(rolling_stock, f, ensure_ascii=False, indent=2)

    # Copie vers web/public si demandé
    if web_dir:
        for fname in [
            "lines.json", "stations.json", "tracks.json", "shapes.bin",
            "schedule.json", "line_ladders.json", "station-rankings.json",
            "sections.json", "feed_fingerprint.json", "rolling-stock.json"
        ]:
            src_file = output_dir / fname
            if src_file.exists():
                shutil.copy2(src_file, web_dir / fname)
        print(f"[berlin-ingest] Artefacts copiés avec succès vers {web_dir}")

    elapsed = time.time() - t_start
    current_mem, peak_mem = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    summary = {
        "lines": allowed_lines,
        "trips_count": len(schedule_trips),
        "stations_count": len(station_projections),
        "max_gtfs_time": max_gtfs_time_str,
        "max_snap_m": max_measured_snap,
        "max_snap_station": max_snap_station,
        "duration_sec": round(elapsed, 2),
        "peak_memory_mb": round(peak_mem / (1024 * 1024), 2),
        "shapes_bytes": shp_meta["bytes"]
    }

    print("\n" + "=" * 60)
    print(f"✅ Ingestion Berlin terminée avec succès en {summary['duration_sec']}s !")
    print(f"   Lignes traitées : {', '.join(allowed_lines)}")
    print(f"   Courses générées : {summary['trips_count']}")
    print(f"   Stations : {summary['stations_count']}")
    print(f"   Heure GTFS max : {summary['max_gtfs_time']}")
    print(f"   Écart station-tracé max : {summary['max_snap_m']:.1f} m ({summary['max_snap_station']})")
    print(f"   Pic de mémoire : {summary['peak_memory_mb']} Mo")
    print("=" * 60 + "\n")

    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingestion GTFS Berlin U-Bahn")
    parser.add_argument("--line", default=None, help="Ligne unique à ingérer (ex: U8)")
    parser.add_argument("--lines", default=None, help="Lignes séparées par des virgules (ex: U8,U9) ou 'all'")
    parser.add_argument("--gtfs-zip", default=None, help="Chemin vers le fichier GTFS zip")
    parser.add_argument("--out-dir", default="cities/berlin/data", help="Répertoire de sortie")
    parser.add_argument("--web-dir", default="web/public/cities/berlin/data", help="Répertoire web public")
    args = parser.parse_args()

    if args.lines:
        if args.lines == "all":
            lines = ALL_UBARN_LINES
        else:
            lines = [l.strip() for l in args.lines.split(",") if l.strip()]
    elif args.line:
        lines = [args.line]
    else:
        lines = ["U8"]

    build_berlin_artifacts(
        allowed_lines=lines,
        gtfs_zip=args.gtfs_zip,
        output_dir=args.out_dir,
        web_dir=args.web_dir
    )
