"""
build_washington_artifacts.py — Pipeline d'ingestion GTFS pour le Métro de Washington (WMATA Metrorail)
PHASE 5 : Les 6 lignes Metrorail (Red, Orange, Silver, Blue, Green, Yellow).

Génère l'ensemble des artefacts normalisés dans cities/washington/data/ et web/public/cities/washington/data/ :
1. lines.json : métadonnées des 6 lignes Metrorail
2. stations.json : 98 stations uniques agrégées depuis les quais parent_station
3. tracks.json : polylignes représentatives des deux voies principales par ligne (12 tracés)
4. shapes.bin : binaire SHP2 rééchantillonné au pas régulier de 10 m
5. schedule.json : grille des courses et arrêts au format compact (service nominal 51_R)
6. line_ladders.json : thermomètre de ligne ordonné par direction pour le dock (avec correspondances et hubs)
7. station-rankings.json : fréquences théoriques de desserte par station (semaine, samedi, dimanche)
8. sections.json : réseau modélisé à plat (tracé 2D sans élévation, relief hors périmètre)
9. feed_fingerprint.json : métadonnées et fraîcheur du flux WMATA
10. rolling-stock.json : spécifications séries génériques WMATA (verified: false)

Règles d'or respectées :
- Clé lue depuis l'environnement WMATA_API_KEY ou argument --api-key / fixture --gtfs-zip.
  Sans clé ni fixture, le build échoue avec un message clair et n'écrit aucun artefact.
- Aucune modification de core/.
- Fuseau horaire extrait directement de agency.txt ('America/New_York'). Horaires > 24h conservés.
- Agrégation quai -> station parente.
- Projection stations sur tracé : les terminus physiques en fin de voie (Vienna K08 et Branch Ave F11)
  sont projetés le long de l'axe de voie sans distorsion.
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

# Coordonnées du centre de Washington DC pour projection équirectangulaire locale
LAT0 = 38.9072
LON0 = -77.0369
R_EARTH = 6371000.0
DEG_TO_RAD = math.pi / 180.0
_LAT_M = R_EARTH * DEG_TO_RAD
_LON_M = R_EARTH * math.cos(LAT0 * DEG_TO_RAD) * DEG_TO_RAD

ORDERED_METRORAIL_LINES = ["RED", "ORANGE", "SILVER", "BLUE", "GREEN", "YELLOW"]

LINE_DESTINATIONS = {
    "RED": {"0": "Glenmont", "1": "Shady Grove"},
    "ORANGE": {"0": "New Carrollton", "1": "Vienna"},
    "SILVER": {"0": "Downtown Largo", "1": "Ashburn"},
    "BLUE": {"0": "Downtown Largo", "1": "Franconia-Springfield"},
    "GREEN": {"0": "Greenbelt", "1": "Branch Ave"},
    "YELLOW": {"0": "Mt Vernon Sq", "1": "Huntington"}
}

# Formules de contraste WCAG pour textColorFor (conforme à core/ui/components/line_badge.ts)
def _luminance(r: int, g: int, b: int) -> float:
    vals = []
    for c in (r, g, b):
        sc = c / 255.0
        vals.append(sc / 12.92 if sc <= 0.03928 else ((sc + 0.055) / 1.055) ** 2.4)
    return 0.2126 * vals[0] + 0.7152 * vals[1] + 0.0722 * vals[2]


def contrast_ratio(c1_hex: str, c2_hex: str) -> float:
    def hex_to_rgb(h: str) -> Tuple[int, int, int]:
        h = h.lstrip("#")
        return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    l1 = _luminance(*hex_to_rgb(c1_hex))
    l2 = _luminance(*hex_to_rgb(c2_hex))
    brightest = max(l1, l2)
    darkest = min(l1, l2)
    return (brightest + 0.05) / (darkest + 0.05)


def text_color_for(background_hex: str, provided_hex: Optional[str] = None) -> str:
    """Calcule la couleur de texte d'indice avec contraste suffisant (ratio >= 3.0)."""
    if provided_hex:
        prov = "#" + provided_hex.lstrip("#")
        if contrast_ratio(prov, background_hex) >= 3.0:
            return prov
    cr_black = contrast_ratio("#000000", background_hex)
    cr_white = contrast_ratio("#FFFFFF", background_hex)
    return "#000000" if cr_black >= cr_white else "#FFFFFF"


def equirect_dist_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Distance métrique plane entre deux coordonnées WGS84 autour de Washington DC."""
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
    """
    Nettoie le nom brut de station WMATA :
    - Retire le suffixe redondant 'METRORAIL STATION'
    - Normalise en Title Case propre tout en conservant les acronymes usuels (UDC, AU, CUA, GMU, etc.)
    """
    name = re.sub(r"\s+METRORAIL STATION\s*$", "", raw_name, flags=re.IGNORECASE).strip()
    name = re.sub(r"\s+", " ", name)

    title_words = []
    for word in name.split(" "):
        w_upper = word.upper()
        if w_upper in {"UDC", "AU", "CUA", "U", "SQ", "AVE", "NW", "NE", "SW", "SE", "VT", "MD", "GMU", "MU"}:
            if w_upper in {"UDC", "AU", "CUA", "U", "VT", "MD", "GMU", "MU"}:
                title_words.append(w_upper)
            elif w_upper == "SQ":
                title_words.append("Sq")
            elif w_upper == "AVE":
                title_words.append("Ave")
            else:
                title_words.append(w_upper)
        elif "-" in word:
            subparts = word.split("-")
            sub_cleaned = []
            for sp in subparts:
                sp_u = sp.upper()
                if sp_u in {"UDC", "AU", "CUA", "U", "VT", "MD", "GMU", "MU"}:
                    sub_cleaned.append(sp_u)
                elif sp_u == "NOMA":
                    sub_cleaned.append("NoMa")
                else:
                    sub_cleaned.append(sp.capitalize())
            title_words.append("-".join(sub_cleaned))
        elif "/" in word:
            subparts = word.split("/")
            sub_cleaned = []
            for sp in subparts:
                sp_u = sp.upper()
                if sp_u in {"UDC", "AU", "CUA", "U", "VT", "MD", "GMU", "MU"}:
                    sub_cleaned.append(sp_u)
                else:
                    sub_cleaned.append(sp.capitalize())
            title_words.append("/".join(sub_cleaned))
        elif word.lower() == "l'enfant":
            title_words.append("L'Enfant")
        else:
            title_words.append(word.capitalize())

    cleaned = " ".join(title_words)
    return cleaned


def parse_time_s(t_str: str) -> int:
    """Convertit HH:MM:SS en secondes depuis minuit de service (conserve >= 24h)."""
    parts = [int(p) for p in t_str.strip().split(":")]
    return parts[0] * 3600 + parts[1] * 60 + parts[2]


def download_wmata_gtfs(api_key: str, dest_path: Path) -> Path:
    """Télécharge l'archive rail GTFS statique depuis l'API officielle WMATA avec la clé."""
    url = "https://api.wmata.com/gtfs/rail-gtfs-static.zip"
    print(f"[washington-ingest] Téléchargement du GTFS statique officiel WMATA...")
    req = urllib.request.Request(
        url,
        headers={
            "api_key": api_key,
            "User-Agent": "ParisSubway3D-Ingest/1.0"
        }
    )
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(req) as resp, open(dest_path, "wb") as f_out:
        shutil.copyfileobj(resp, f_out)
    print(f"[washington-ingest] GTFS téléchargé avec succès ({dest_path.stat().st_size} octets) -> {dest_path}")
    return dest_path


def build_washington_artifacts(
    zip_path: Optional[str | Path] = None,
    api_key: Optional[str] = None,
    output_dir: Optional[str | Path] = None,
    web_dir: Optional[str | Path] = None,
    target_service_id: str = "51_R",
    allowed_lines: Optional[List[str]] = None
) -> dict:
    repo_root = Path(__file__).resolve().parents[3]
    if output_dir is None:
        output_dir = repo_root / "cities" / "washington" / "data"
    else:
        output_dir = Path(output_dir)

    if web_dir is None:
        web_dir = repo_root / "web" / "public" / "cities" / "washington" / "data"
    else:
        web_dir = Path(web_dir)

    if allowed_lines is None:
        allowed_lines = list(ORDERED_METRORAIL_LINES)
    else:
        allowed_lines = [l.strip().upper() for l in allowed_lines if l.strip()]

    print(f"[washington-ingest] Lignes à ingérer : {allowed_lines}")

    # 1. Source GTFS
    resolved_zip: Optional[Path] = None
    if zip_path and Path(zip_path).exists():
        resolved_zip = Path(zip_path)
    elif api_key or os.environ.get("WMATA_API_KEY"):
        key = api_key or os.environ.get("WMATA_API_KEY")
        cache_zip = repo_root / "scratch" / "rail-gtfs-static.zip"
        resolved_zip = download_wmata_gtfs(key, cache_zip)
    else:
        local_fixture = repo_root / "scratch" / "rail-gtfs-static.zip"
        if local_fixture.exists():
            resolved_zip = local_fixture
            print(f"[washington-ingest] Utilisation de la fixture locale : {local_fixture}")
        else:
            sys.exit(
                "❌ [washington-ingest] ERREUR : Clé API WMATA non trouvée (variable d'environnement "
                "WMATA_API_KEY requise) et aucune fixture locale trouvée (--gtfs-zip). "
                "Aucun artefact vide n'a été écrit."
            )

    output_dir.mkdir(parents=True, exist_ok=True)
    if web_dir:
        web_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(resolved_zip) as z:
        # A. Fuseau horaire agency.txt
        agency_tz = None
        agency_name = None
        with z.open("agency.txt") as f:
            for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
                agency_tz = row.get("agency_timezone")
                agency_name = row.get("agency_name")
                break

        print(f"[washington-ingest] Opérateur : {agency_name}, Fuseau horaire : {agency_tz}")
        if agency_tz != "America/New_York":
            raise ValueError(f"Fuseau inattendu dans agency.txt: {agency_tz} (attendu: America/New_York)")

        # B. Métadonnées des routes filtrées
        routes_meta: Dict[str, dict] = {}
        with z.open("routes.txt") as f:
            for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
                rid = row.get("route_id", "")
                if rid in allowed_lines and row.get("route_type") == "1":
                    routes_meta[rid] = row

        print(f"[washington-ingest] Routes trouvées ({len(routes_meta)}) : {list(routes_meta.keys())}")

        # C. Arrêts et quais
        raw_stops: Dict[str, dict] = {}
        with z.open("stops.txt") as f:
            for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
                raw_stops[row["stop_id"]] = row

        # D. Courses (trips.txt)
        trips_by_id: Dict[str, dict] = {}
        trips_by_service: Dict[str, List[dict]] = defaultdict(list)
        shapes_used: Set[str] = set()

        with z.open("trips.txt") as f:
            for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
                rid = row.get("route_id")
                if rid in allowed_lines:
                    tid = row["trip_id"]
                    trips_by_id[tid] = row
                    trips_by_service[row["service_id"]].append(row)
                    if row.get("shape_id"):
                        shapes_used.add(row["shape_id"])

        print(f"[washington-ingest] Total des courses dans trips.txt pour {allowed_lines} : {len(trips_by_id)}")

        # E. Tracés (shapes.txt)
        raw_shapes: Dict[str, List[Tuple[float, float, int]]] = defaultdict(list)
        with z.open("shapes.txt") as f:
            for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
                sid = row["shape_id"]
                raw_shapes[sid].append((
                    float(row["shape_pt_lon"]),
                    float(row["shape_pt_lat"]),
                    int(row["shape_pt_sequence"])
                ))

        sorted_shapes: Dict[str, List[Tuple[float, float]]] = {}
        for sid, pts in raw_shapes.items():
            pts.sort(key=lambda p: p[2])
            sorted_shapes[sid] = [(p[0], p[1]) for p in pts]

        # F. Horaires (stop_times.txt)
        stop_times_by_trip: Dict[str, List[dict]] = defaultdict(list)
        stop_ids_used: Set[str] = set()
        max_gtfs_time_s = 0
        max_gtfs_time_str = ""

        with z.open("stop_times.txt") as f:
            for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
                tid = row["trip_id"]
                if tid in trips_by_id:
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

        print(f"[washington-ingest] Heure GTFS max : {max_gtfs_time_str} ({max_gtfs_time_s}s)")

    # =========================================================================
    # Étape 1 : Agrégation des quais aux stations parentes & lignes desservies
    # =========================================================================
    platforms_by_parent: Dict[str, Set[str]] = defaultdict(set)
    lines_by_station: Dict[str, Set[str]] = defaultdict(set)

    for tid, st_list in stop_times_by_trip.items():
        tr_line = trips_by_id[tid]["route_id"]
        for st in st_list:
            pf_id = st["stop_id"]
            pf_row = raw_stops[pf_id]
            parent_id = pf_row.get("parent_station", "").strip()
            if not parent_id or parent_id not in raw_stops:
                raise ValueError(f"Le quai {pf_id} n'a pas de parent_station valide dans stops.txt")
            platforms_by_parent[parent_id].add(pf_id)
            lines_by_station[parent_id].add(tr_line)

    print(f"[washington-ingest] {len(platforms_by_parent)} stations uniques agrégées depuis {len(stop_ids_used)} quais de voyageurs.")

    # =========================================================================
    # Étape 2 : Projection des stations et calcul des coordonnées
    # =========================================================================
    station_projections: Dict[str, dict] = {}
    for parent_id in sorted(platforms_by_parent.keys()):
        stn_row = raw_stops[parent_id]
        sx, sy = float(stn_row["stop_lon"]), float(stn_row["stop_lat"])
        name = clean_station_name(stn_row["stop_name"])
        station_projections[parent_id] = {
            "name": name,
            "coordinates": [round(sx, 6), round(sy, 6)],
            "lines": sorted(list(lines_by_station[parent_id]), key=lambda l: ORDERED_METRORAIL_LINES.index(l) if l in ORDERED_METRORAIL_LINES else 99)
        }

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
    print(f"[washington-ingest] Écriture de shapes.bin : {shp_meta['bytes']} octets, {shp_meta['shapes']} tracés, {shp_meta['points']} points")

    # =========================================================================
    # Étape 4 : Détection des services partiels et génération de schedule.json
    # =========================================================================
    unique_station_names = sorted(list({proj["name"] for proj in station_projections.values()}))
    station_to_idx = {name: idx for idx, name in enumerate(unique_station_names)}

    target_trips = trips_by_service.get(target_service_id, [])
    if not target_trips:
        print(f"[washington-ingest] Attention: service {target_service_id} introuvable, utilisation du premier service")
        target_service_id = list(trips_by_service.keys())[0]
        target_trips = trips_by_service[target_service_id]

    print(f"[washington-ingest] Service nominal retenu pour schedule.json : {target_service_id} ({len(target_trips)} courses)")

    schedule_trips = []
    for tr in target_trips:
        tid = tr["trip_id"]
        st_list = stop_times_by_trip.get(tid, [])
        if len(st_list) < 2:
            continue

        rid = tr["route_id"]
        dir_id = int(tr.get("direction_id", 0) or 0)
        sid = tr.get("shape_id", "")
        t0 = parse_time_s(st_list[0]["departure_time"])
        t1 = parse_time_s(st_list[-1]["arrival_time"])

        last_parent = raw_stops[st_list[-1]["stop_id"]]["parent_station"]
        last_name = station_projections[last_parent]["name"]
        dest_idx = station_to_idx[last_name]

        shape_coords = sorted_shapes.get(sid, [])
        cum_dists = shape_cumulative_dists.get(sid, [])

        stops_compact = []
        for st in st_list:
            arr_s = parse_time_s(st["arrival_time"])
            dep_s = parse_time_s(st["departure_time"])
            parent = raw_stops[st["stop_id"]]["parent_station"]
            s_name = station_projections[parent]["name"]
            s_idx = station_to_idx[s_name]

            px, py = station_projections[parent]["coordinates"]
            s_m, _ = project_on_polyline(px, py, shape_coords, cum_dists)
            stops_compact.append([arr_s, dep_s, round(s_m, 1), s_idx])

        schedule_trips.append([
            tid,
            rid,
            dir_id,
            sid,
            t0,
            t1,
            dest_idx,
            stops_compact
        ])

    # Tri par heure de départ
    schedule_trips.sort(key=lambda t: (t[4], t[0]))

    schedule_artifact = {
        "stations": unique_station_names,
        "trips": schedule_trips
    }
    schedule_path = output_dir / "schedule.json"
    with open(schedule_path, "w", encoding="utf-8") as f:
        json.dump(schedule_artifact, f, separators=(",", ":"))
    print(f"[washington-ingest] Écriture de schedule.json : {schedule_path.stat().st_size} octets, {len(schedule_trips)} courses")

    # =========================================================================
    # Étape 5 : stations.json
    # =========================================================================
    stations_json_list = []
    for parent_id in sorted(platforms_by_parent.keys()):
        proj = station_projections[parent_id]
        stations_json_list.append({
            "id": parent_id,
            "name": proj["name"],
            "coordinates": proj["coordinates"],
            "lines": proj["lines"]
        })

    stations_json_list.sort(key=lambda s: s["name"])
    stations_path = output_dir / "stations.json"
    with open(stations_path, "w", encoding="utf-8") as f:
        json.dump(stations_json_list, f, indent=2, ensure_ascii=False)
    print(f"[washington-ingest] Écriture de stations.json : {len(stations_json_list)} stations")

    # =========================================================================
    # Étape 6 : lines.json
    # =========================================================================
    lines_json_list = []
    for rid in allowed_lines:
        rmeta = routes_meta[rid]
        bg_col = f"#{rmeta['route_color']}"
        txt_col = text_color_for(bg_col, rmeta.get("route_text_color"))

        # Trouver la shape la plus longue pour cette ligne
        line_shapes = {tr["shape_id"] for tr in target_trips if tr["route_id"] == rid and tr.get("shape_id")}
        max_len_m = max((shape_cumulative_dists[s][-1] for s in line_shapes if s in shape_cumulative_dists), default=50000.0)

        lines_json_list.append({
            "id": rid,
            "short_name": rmeta["route_short_name"],
            "long_name": rmeta["route_long_name"],
            "color": bg_col,
            "text_color": txt_col,
            "mode": "metro",
            "destinations": LINE_DESTINATIONS.get(rid, {"0": "Terminus 0", "1": "Terminus 1"}),
            "measured_length_km": round(max_len_m / 1000.0, 2),
            "elevation_offset": 0.0
        })

    lines_path = output_dir / "lines.json"
    with open(lines_path, "w", encoding="utf-8") as f:
        json.dump(lines_json_list, f, indent=2, ensure_ascii=False)
    print(f"[washington-ingest] Écriture de lines.json : {len(lines_json_list)} lignes")

    # =========================================================================
    # Étape 7 : tracks.json
    # =========================================================================
    # Pour chaque ligne, 2 tracés principaux représentatifs (Dir 0 et Dir 1, forme la plus longue)
    tracks_list = []
    for rid in allowed_lines:
        rmeta = routes_meta[rid]
        bg_col = f"#{rmeta['route_color']}"
        for d in ("0", "1"):
            d_trips = [tr for tr in target_trips if tr["route_id"] == rid and tr.get("direction_id") == d and tr.get("shape_id")]
            if not d_trips:
                continue
            # Sélection de la shape ayant le plus de points
            best_shape_id = max({tr["shape_id"] for tr in d_trips}, key=lambda s: len(sorted_shapes.get(s, [])))
            coords = sorted_shapes[best_shape_id]
            tracks_list.append({
                "line_id": rid,
                "short_name": rmeta["route_short_name"],
                "stroke": bg_col,
                "coordinates": [[round(p[0], 5), round(p[1], 5)] for p in coords]
            })

    tracks_path = output_dir / "tracks.json"
    with open(tracks_path, "w", encoding="utf-8") as f:
        json.dump(tracks_list, f, separators=(",", ":"))
    print(f"[washington-ingest] Écriture de tracks.json : {len(tracks_list)} tracés")

    # =========================================================================
    # Étape 8 : line_ladders.json (Thermomètre de ligne avec hubs et transferts)
    # =========================================================================
    lines_meta_dict = {l["id"]: l for l in lines_json_list}
    ladders_dict: Dict[str, dict] = {}

    for rid in allowed_lines:
        rmeta = routes_meta[rid]
        bg_col = f"#{rmeta['route_color']}"
        txt_col = text_color_for(bg_col, rmeta.get("route_text_color"))

        dirs_dict: Dict[str, dict] = {}
        for d in ("0", "1"):
            candidate_trips = [t for t in schedule_trips if t[1] == rid and str(t[2]) == d]
            if not candidate_trips:
                continue
            longest_trip = max(candidate_trips, key=lambda t: len(t[7]))
            trip_stops = longest_trip[7]

            origin_name = unique_station_names[trip_stops[0][3]]
            terminus_name = unique_station_names[trip_stops[-1][3]]

            stations_ladder = []
            for st in trip_stops:
                s_name = unique_station_names[st[3]]
                parent_id = next(pid for pid, proj in station_projections.items() if proj["name"] == s_name)
                station_lines = station_projections[parent_id]["lines"]

                transfers = []
                for other_rid in station_lines:
                    if other_rid != rid and other_rid in lines_meta_dict:
                        o_line = lines_meta_dict[other_rid]
                        transfers.append({
                            "id": o_line["id"],
                            "short_name": o_line["short_name"],
                            "color": o_line["color"],
                            "text_color": o_line["text_color"]
                        })

                stations_ladder.append({
                    "id": parent_id,
                    "name": s_name,
                    "distance_m": st[2],
                    "coordinates": station_projections[parent_id]["coordinates"],
                    "is_hub": len(transfers) > 0,
                    "transfers": transfers
                })

            dirs_dict[d] = {
                "origin": origin_name,
                "terminus": terminus_name,
                "stations": stations_ladder
            }

        ladders_dict[rid] = {
            "id": rid,
            "short_name": rmeta["route_short_name"],
            "color": bg_col,
            "text_color": txt_col,
            "directions": dirs_dict
        }

    ladders_path = output_dir / "line_ladders.json"
    with open(ladders_path, "w", encoding="utf-8") as f:
        json.dump(ladders_dict, f, indent=2, ensure_ascii=False)
    print(f"[washington-ingest] Écriture de line_ladders.json ({len(ladders_dict)} lignes)")

    # =========================================================================
    # Étape 9 : station-rankings.json
    # =========================================================================
    station_counts = {
        "weekday": Counter(),
        "saturday": Counter(),
        "sunday": Counter()
    }
    for tid, st_list in stop_times_by_trip.items():
        sid = trips_by_id[tid]["service_id"]
        for st in st_list:
            parent = raw_stops[st["stop_id"]]["parent_station"]
            s_name = station_projections[parent]["name"]
            if sid in ("51_R", "50_R"):
                station_counts["weekday"][s_name] += 1
            elif sid in ("46_R", "47_R"):
                station_counts["saturday"][s_name] += 1
            elif sid in ("48_R", "49_R"):
                station_counts["sunday"][s_name] += 1

    rankings_artifact = {
        "weekday": [{"name": k, "count": v} for k, v in station_counts["weekday"].most_common()],
        "saturday": [{"name": k, "count": v} for k, v in station_counts["saturday"].most_common()],
        "sunday": [{"name": k, "count": v} for k, v in station_counts["sunday"].most_common()]
    }
    rankings_path = output_dir / "station-rankings.json"
    with open(rankings_path, "w", encoding="utf-8") as f:
        json.dump(rankings_artifact, f, indent=2, ensure_ascii=False)
    print(f"[washington-ingest] Écriture de station-rankings.json")

    # =========================================================================
    # Étape 10 : sections.json (Tracé à plat sans élévation)
    # =========================================================================
    sections_artifact = {
        "schema_version": 1,
        "source": {
          "provider": "Washington Metropolitan Area Transit Authority (WMATA)",
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
    sections_path = output_dir / "sections.json"
    with open(sections_path, "w", encoding="utf-8") as f:
        json.dump(sections_artifact, f, indent=2, ensure_ascii=False)
    print(f"[washington-ingest] Écriture de sections.json")

    # =========================================================================
    # Étape 11 : rolling-stock.json (Séries WMATA, verified: false)
    # =========================================================================
    rolling_lines = {}
    for rid in allowed_lines:
        rmeta = routes_meta[rid]
        rolling_lines[rid] = {
            "line_id": rid,
            "short_name": rmeta["route_short_name"],
            "model_id": "WMATA_GENERIC_8V",
            "name": f"Rame Metrorail {rmeta['route_short_name']} (8 voitures)",
            "cars_count": 8,
            "total_length_m": 182.88,
            "car_length_m": 22.86,
            "bogie_centres_m": 16.46,
            "width_m": 3.09,
            "inter_car_gap_m": 0.0,
            "drive_type": "steel",
            "driverless": False,
            "source": f"Parc Metrorail {rmeta['route_short_name']} Line WMATA (formation 8 voitures par défaut)",
            "verified": False
        }

    rolling_stock_artifact = {
        "asset_families": {
            "wmata_married_pair": {
                "family_id": "wmata_married_pair",
                "reference_dimensions_m": {
                    "car_length_m": 22.86,
                    "car_height_m": 3.30,
                    "width_m": 3.09
                }
            }
        },
        "models": {
            "WMATA_GENERIC_8V": {
                "model_id": "WMATA_GENERIC_8V",
                "name": "Rame Metrorail WMATA (8 voitures - 183 m)",
                "manufacturer": "Constructeurs Metrorail (parc mixte)",
                "cars_count": 8,
                "total_length_m": 182.88,
                "car_length_m": 22.86,
                "bogie_centres_m": 16.46,
                "width_m": 3.09,
                "inter_car_gap_m": 0.0,
                "drive_type": "steel",
                "driverless": False,
                "source": "Spécifications techniques génériques WMATA Metrorail (caisse standard 75ft / 22.86m, gabarit 3.09m, formation 8 voitures)",
                "verified": False
            },
            "WMATA_GENERIC_6V": {
                "model_id": "WMATA_GENERIC_6V",
                "name": "Rame Metrorail WMATA (6 voitures - 137 m)",
                "manufacturer": "Constructeurs Metrorail (parc mixte)",
                "cars_count": 6,
                "total_length_m": 137.16,
                "car_length_m": 22.86,
                "bogie_centres_m": 16.46,
                "width_m": 3.09,
                "inter_car_gap_m": 0.0,
                "drive_type": "steel",
                "driverless": False,
                "source": "Formation 6 voitures WMATA Metrorail (3 married-pairs de 2 caisses de 75ft)",
                "verified": False
            }
        },
        "lines": rolling_lines
    }
    rolling_stock_path = output_dir / "rolling-stock.json"
    with open(rolling_stock_path, "w", encoding="utf-8") as f:
        json.dump(rolling_stock_artifact, f, indent=2, ensure_ascii=False)
    print(f"[washington-ingest] Écriture de rolling-stock.json")

    # =========================================================================
    # Étape 12 : feed_fingerprint.json
    # =========================================================================
    fingerprint_artifact = {
        "url": "https://api.wmata.com/gtfs/rail-gtfs-static.zip",
        "source": "Washington Metropolitan Area Transit Authority (WMATA) Open Data",
        "dataset": f"rail-gtfs-static.zip (WMATA Metrorail: {', '.join(allowed_lines)})",
        "generated_at": datetime.now().strftime("%Y-%m-%d"),
        "timezone": agency_tz,
        "max_gtfs_time": max_gtfs_time_str,
        "service_id": target_service_id,
        "lines": allowed_lines
    }
    fingerprint_path = output_dir / "feed_fingerprint.json"
    with open(fingerprint_path, "w", encoding="utf-8") as f:
        json.dump(fingerprint_artifact, f, indent=2, ensure_ascii=False)
    print(f"[washington-ingest] Écriture de feed_fingerprint.json")

    # =========================================================================
    # Étape 13 : Copie vers web/public/cities/washington/data/ si demandé
    # =========================================================================
    if web_dir:
        print(f"[washington-ingest] Copie des artefacts vers {web_dir}...")
        for filename in [
            "lines.json",
            "stations.json",
            "tracks.json",
            "shapes.bin",
            "schedule.json",
            "line_ladders.json",
            "station-rankings.json",
            "sections.json",
            "rolling-stock.json",
            "feed_fingerprint.json"
        ]:
            src = output_dir / filename
            dst = web_dir / filename
            if src.exists():
                shutil.copy2(src, dst)

    # Récapitulatif des poids
    artifact_weights = {}
    for filename in [
        "lines.json",
        "stations.json",
        "tracks.json",
        "shapes.bin",
        "schedule.json",
        "line_ladders.json",
        "station-rankings.json",
        "sections.json",
        "rolling-stock.json",
        "feed_fingerprint.json"
    ]:
        p = output_dir / filename
        artifact_weights[filename] = p.stat().st_size

    summary = {
        "lines": allowed_lines,
        "trips_in_gtfs": len(trips_by_id),
        "trips_in_schedule": len(schedule_trips),
        "target_service_id": target_service_id,
        "max_gtfs_time": max_gtfs_time_str,
        "platforms_count": len(stop_ids_used),
        "stations_count": len(platforms_by_parent),
        "shapes_count": len(resampled_shapes),
        "artifact_weights": artifact_weights
    }

    print(f"\n[washington-ingest] Synthèse de l'ingestion ({len(allowed_lines)} lignes) :")
    print(f"  • Total courses dans le GTFS : {summary['trips_in_gtfs']}")
    print(f"  • Courses nominales dans schedule.json : {summary['trips_in_schedule']} ({target_service_id})")
    print(f"  • Heure GTFS maximale : {summary['max_gtfs_time']}")
    print(f"  • Poids total des artefacts : {sum(artifact_weights.values()) / 1024:.1f} Ko")
    for f_name, f_size in artifact_weights.items():
        print(f"     - {f_name:22s} : {f_size:7d} octets ({f_size / 1024:.1f} Ko)")

    return summary


def main():
    parser = argparse.ArgumentParser(description="Ingestion GTFS WMATA pour le Métro de Washington DC")
    parser.add_argument("--gtfs-zip", type=str, help="Chemin vers l'archive GTFS statique locale")
    parser.add_argument("--api-key", type=str, help="Clé d'API WMATA (ou via variable d'environnement WMATA_API_KEY)")
    parser.add_argument("--output-dir", type=str, help="Dossier de sortie des artefacts (défaut: cities/washington/data)")
    parser.add_argument("--web-dir", type=str, help="Dossier web public (défaut: web/public/cities/washington/data)")
    parser.add_argument("--service-id", type=str, default="51_R", help="Service GTFS pour schedule.json (défaut: 51_R)")
    parser.add_argument("--lines", type=str, default="RED,ORANGE,SILVER,BLUE,GREEN,YELLOW", help="Lignes à ingérer, séparées par virgule")
    args = parser.parse_args()

    lines_list = [l.strip().upper() for l in args.lines.split(",") if l.strip()]

    build_washington_artifacts(
        zip_path=args.gtfs_zip,
        api_key=args.api_key,
        output_dir=args.output_dir,
        web_dir=args.web_dir,
        target_service_id=args.service_id,
        allowed_lines=lines_list
    )


if __name__ == "__main__":
    main()
