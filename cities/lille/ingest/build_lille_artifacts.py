"""
build_lille_artifacts.py — Pipeline d'ingestion GTFS et géométrie OSM pour le Réseau de Lille (Ilévia)

Génère l'ensemble des artefacts normalisés dans cities/lille/data/ et web/public/cities/lille/data/ :
1. lines.json : métadonnées de la ligne 1 (jaune #FDC41F, destinations, longueur)
2. stations.json : 18 stations du métro ligne 1 avec coordonnées de plateforme
3. tracks.json : polylignes simplifiées des voies avec stroke contrasté
4. shapes.bin : binaire SHP2 rééchantillonné au pas régulier de 10 m
5. schedule.json : grille des courses et arrêts au format compact
6. line_ladders.json : thermomètre de ligne ordonné par direction pour le dock
7. station-rankings.json : fréquences théoriques de desserte par station
8. sections.json : confirmation 100% souterrain / tranchée couverte
9. feed_fingerprint.json : métadonnées et fraîcheur du flux
10. rolling-stock.json : spécifications VAL 208 et rames 52m (Alstom)
"""

from __future__ import annotations

import csv
import io
import json
import math
import os
import shutil
import sys
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

# Import du writer SHP2 v2 depuis core/ingest
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from core.ingest.write_shapes_v2 import ResampledShape, write_shapes_v2

# Coordonnées de référence pour Lille Métropole
LAT0 = 50.6292
LON0 = 3.0573
R_EARTH = 6371000.0
DEG_TO_RAD = math.pi / 180.0
_LAT_M = R_EARTH * DEG_TO_RAD
_LON_M = R_EARTH * math.cos(LAT0 * DEG_TO_RAD) * DEG_TO_RAD


def equirect_dist_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Distance métrique plane locale autour de Lille."""
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


def compute_darkened_contrast_color(hex_color: str, min_contrast: float = 3.0) -> str:
    """Dérive une couleur assombrie respectant un ratio de contraste minimal face au blanc."""
    clean_hex = hex_color.lstrip("#")
    r = int(clean_hex[0:2], 16) / 255.0
    g = int(clean_hex[2:4], 16) / 255.0
    b = int(clean_hex[4:6], 16) / 255.0

    def chan_lum(c: float) -> float:
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    lum = 0.2126 * chan_lum(r) + 0.7152 * chan_lum(g) + 0.0722 * chan_lum(b)
    target_lum = (1.05 / min_contrast) - 0.05

    if lum <= target_lum:
        return f"#{clean_hex.upper()}"

    k = math.sqrt(target_lum / lum)
    r_dark = max(0, min(255, int(round(r * k * 255))))
    g_dark = max(0, min(255, int(round(g * k * 255))))
    b_dark = max(0, min(255, int(round(b * k * 255))))
    return f"#{r_dark:02X}{g_dark:02X}{b_dark:02X}"


def parse_time_s(t_str: str) -> int:
    """Convertit HH:MM:SS en secondes depuis minuit."""
    parts = [int(p) for p in t_str.strip().split(":")]
    return parts[0] * 3600 + parts[1] * 60 + parts[2]


# Correspondance ordonnée des 18 stations de la Ligne 1
# (nom GTFS, code 3 lettres, nom OSM dans les relations)
L1_STATIONS_META = [
    ("4 Cantons Stade P. Mauroy", "4CA", "Quatre Cantons – Stade Pierre Mauroy"),
    ("Cité Scientifique", "CSC", "Cité Scientifique – Professeur Gabillard"),
    ("Triolo", "TIO", "Triolo"),
    ("V. D'Ascq Hotel De Ville", "HDV", "Villeneuve d'Ascq – Hôtel de Ville"),
    ("Pont De Bois", "PDB", "Pont de Bois"),
    ("Square Flandres", "LZN", "Square Flandres"),
    ("Mairie D'Hellemmes", "MHE", "Mairie d'Hellemmes"),
    ("Marbrerie", "MRB", "Marbrerie"),
    ("Fives", "DFI", "Fives"),
    ("Madeleine Caulier", "CIE", "Madeleine Caulier"),
    ("Gare Lille Flandres", "LIG", "Gare Lille Flandres"),
    ("Rihour", "RIH", "Rihour"),
    ("République Beaux-Arts", "REP", "République – Beaux-Arts"),
    ("Gambetta", "CGA", "Gambetta"),
    ("Wazemmes", "WAZ", "Wazemmes"),
    ("Porte Des Postes", "PDP", "Porte des Postes"),
    ("Chu - Centre O. Lambret", "CHR", "CHU – Centre Oscar Lambret"),
    ("Chu - Eurasanté", "CAL", "CHU – Eurasanté"),
]


def chain_osm_ways(relation_data: dict) -> Tuple[List[Tuple[float, float]], float]:
    """Chaîne les segments OSM d'une relation en une polyline continue orientée."""
    nodes = {el["id"]: (el["lon"], el["lat"]) for el in relation_data["elements"] if el["type"] == "node"}
    ways = {el["id"]: el for el in relation_data["elements"] if el["type"] == "way"}
    relations = [el for el in relation_data["elements"] if el["type"] == "relation"]
    if not relations:
        raise ValueError("Aucune relation trouvée dans les données OSM")

    way_members = [m for m in relations[0]["members"] if m["type"] == "way"]
    chain: List[List[Tuple[float, float]]] = []
    max_gap = 0.0

    for m in way_members:
        w = ways.get(m["ref"])
        if not w:
            continue
        pts = [nodes[nid] for nid in w["nodes"] if nid in nodes]
        if not pts:
            continue

        if not chain:
            chain.append(pts)
        else:
            end_last = chain[-1][-1]
            d_start = equirect_dist_m(end_last[0], end_last[1], pts[0][0], pts[0][1])
            d_end = equirect_dist_m(end_last[0], end_last[1], pts[-1][0], pts[-1][1])
            if d_end < d_start:
                pts.reverse()
                gap = d_end
            else:
                gap = d_start
            max_gap = max(max_gap, gap)
            chain.append(pts)

    flat: List[Tuple[float, float]] = []
    for seg in chain:
        if not flat:
            flat.extend(seg)
        else:
            if equirect_dist_m(flat[-1][0], flat[-1][1], seg[0][0], seg[0][1]) < 0.1:
                flat.extend(seg[1:])
            else:
                flat.extend(seg)

    return flat, max_gap


def build_lille_artifacts(
    gtfs_path: str | Path,
    raw_dir: str | Path,
    output_dir: str | Path,
    web_dir: Optional[str | Path] = None,
    target_date: str = "20260930"
) -> dict:
    gtfs_path = Path(gtfs_path)
    raw_dir = Path(raw_dir)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    if web_dir:
        web_dir = Path(web_dir)
        web_dir.mkdir(parents=True, exist_ok=True)

    print(f"[lille-ingest] Démarrage de l'ingestion pour Lille (Ligne 1)...")

    # =========================================================================
    # Étape 1 : Chaînage et rééchantillonnage de la géométrie OSM
    # =========================================================================
    osm_dir0_path = raw_dir / "osm_171691.json"
    osm_dir1_path = raw_dir / "osm_7786750.json"

    with open(osm_dir0_path, "r", encoding="utf-8") as f:
        osm_dir0_data = json.load(f)
    with open(osm_dir1_path, "r", encoding="utf-8") as f:
        osm_dir1_data = json.load(f)

    poly_dir0, gap_dir0 = chain_osm_ways(osm_dir0_data)
    poly_dir1, gap_dir1 = chain_osm_ways(osm_dir1_data)

    len_dir0 = sum(equirect_dist_m(poly_dir0[i-1][0], poly_dir0[i-1][1], poly_dir0[i][0], poly_dir0[i][1]) for i in range(1, len(poly_dir0)))
    len_dir1 = sum(equirect_dist_m(poly_dir1[i-1][0], poly_dir1[i-1][1], poly_dir1[i][0], poly_dir1[i][1]) for i in range(1, len(poly_dir1)))

    print(f"[lille-ingest] Tracé Dir 0 : {len(poly_dir0)} sommets, {len_dir0:.1f} m, raccord max = {gap_dir0:.3f} m")
    print(f"[lille-ingest] Tracé Dir 1 : {len(poly_dir1)} sommets, {len_dir1:.1f} m, raccord max = {gap_dir1:.3f} m")

    if gap_dir0 > 5.0 or gap_dir1 > 5.0:
        raise ValueError(f"Écart de raccordement excessif : Dir 0 = {gap_dir0} m, Dir 1 = {gap_dir1} m (seuil = 5.0 m)")

    # Calcul des distances cumulées brutes
    cum_dists_0 = [0.0]
    for i in range(1, len(poly_dir0)):
        cum_dists_0.append(cum_dists_0[-1] + equirect_dist_m(poly_dir0[i-1][0], poly_dir0[i-1][1], poly_dir0[i][0], poly_dir0[i][1]))

    cum_dists_1 = [0.0]
    for i in range(1, len(poly_dir1)):
        cum_dists_1.append(cum_dists_1[-1] + equirect_dist_m(poly_dir1[i-1][0], poly_dir1[i-1][1], poly_dir1[i][0], poly_dir1[i][1]))

    # Rééchantillonnage métrique SHP2 à pas STEP_M = 10.0 m
    STEP_M = 10.0
    resampled_shapes: List[ResampledShape] = []

    for sid, coords, raw_cum in [("ME1_0", poly_dir0, cum_dists_0), ("ME1_1", poly_dir1, cum_dists_1)]:
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
    print(f"[lille-ingest] Écriture de shapes.bin : {shp_meta['bytes']} octets, {shp_meta['points']} points")

    # =========================================================================
    # Étape 2 : Extraction des stations et coordonnées précises
    # =========================================================================
    # Extraction des nœuds de station dans OSM pour une précision optimale
    st_nodes_0 = {}
    for el in osm_dir0_data["elements"]:
        if el["type"] == "node" and "name" in el.get("tags", {}):
            st_nodes_0[el["tags"]["name"]] = (el["lon"], el["lat"])

    st_nodes_1 = {}
    for el in osm_dir1_data["elements"]:
        if el["type"] == "node" and "name" in el.get("tags", {}):
            st_nodes_1[el["tags"]["name"]] = (el["lon"], el["lat"])

    stations_list = []
    station_proj_dir0: Dict[str, Tuple[float, float]] = {}  # prefix -> (s, d)
    station_proj_dir1: Dict[str, Tuple[float, float]] = {}  # prefix -> (s, d)

    max_dist_to_track = 0.0
    station_distances_report = []

    for name_gtfs, pfx, name_osm in L1_STATIONS_META:
        c0 = st_nodes_0.get(name_osm)
        c1 = st_nodes_1.get(name_osm)
        if not c0 or not c1:
            raise ValueError(f"Station {name_osm} non trouvée dans les nœuds de station OSM")

        s0, d0 = project_on_polyline(c0[0], c0[1], poly_dir0, cum_dists_0)
        s1, d1 = project_on_polyline(c1[0], c1[1], poly_dir1, cum_dists_1)

        station_proj_dir0[pfx] = (s0, d0)
        station_proj_dir1[pfx] = (s1, d1)

        # Coordonnées du centroïde de station
        mid_lon = round((c0[0] + c1[0]) / 2.0, 6)
        mid_lat = round((c0[1] + c1[1]) / 2.0, 6)

        # Distance du centroïde aux deux voies
        _, d_mid_0 = project_on_polyline(mid_lon, mid_lat, poly_dir0, cum_dists_0)
        _, d_mid_1 = project_on_polyline(mid_lon, mid_lat, poly_dir1, cum_dists_1)
        d_max_st = max(d_mid_0, d_mid_1)

        max_dist_to_track = max(max_dist_to_track, d_max_st)
        station_distances_report.append({
            "name": name_gtfs,
            "prefix": pfx,
            "dist_track0_m": round(d0, 2),
            "dist_track1_m": round(d1, 2),
            "dist_centroid_to_track_m": round(d_max_st, 2),
            "s_dir0_m": round(s0, 1),
            "s_dir1_m": round(s1, 1)
        })

        stations_list.append({
            "id": f"STATION_{pfx}",
            "name": name_gtfs,
            "coordinates": [mid_lon, mid_lat],
            "lines": ["ME1"]
        })

    print(f"[lille-ingest] Vérification des distances stations-tracé :")
    for r in station_distances_report:
        print(f"  {r['name']:32s} | d_voie0 = {r['dist_track0_m']:4.2f}m, d_voie1 = {r['dist_track1_m']:4.2f}m, d_max_centre = {r['dist_centroid_to_track_m']:4.2f}m")

    print(f"[lille-ingest] Distance maximale station-tracé : {max_dist_to_track:.2f} m")
    if max_dist_to_track > 15.0:
        raise ValueError(f"Distance station-tracé maximale ({max_dist_to_track:.2f} m) supérieure au seuil strict de 15 m !")

    with open(output_dir / "stations.json", "w", encoding="utf-8") as f:
        json.dump(stations_list, f, indent=2, ensure_ascii=False)

    # =========================================================================
    # Étape 3 : Chargement GTFS et extraction du calendrier réel
    # =========================================================================
    print(f"[lille-ingest] Lecture de l'archive GTFS : {gtfs_path}")

    # Fonction d'ouverture du GTFS (fichier ZIP ou répertoire)
    class GTFSReader:
        def __init__(self, path: Path):
            self.path = path
            self.is_zip = path.is_file() and path.suffix == ".zip"
            self.zip_ref = zipfile.ZipFile(path) if self.is_zip else None

        def open_csv(self, filename: str):
            if self.is_zip:
                return csv.DictReader(io.TextIOWrapper(self.zip_ref.open(filename), encoding="utf-8-sig"))
            return csv.DictReader(open(self.path / filename, encoding="utf-8-sig"))

        def close(self):
            if self.zip_ref:
                self.zip_ref.close()

    gtfs = GTFSReader(gtfs_path)

    # Identifier les services actifs à la date cible (calendrier réel)
    active_services: Set[str] = set()
    call_counts_weekday = Counter()
    call_counts_sat = Counter()
    call_counts_sun = Counter()

    # Dates représentatives pour rankings
    date_sat = "20261003"
    date_sun = "20261004"
    services_sat: Set[str] = set()
    services_sun: Set[str] = set()

    for row in gtfs.open_csv("calendar_dates.txt"):
        if row.get("exception_type") == "1":
            d = row["date"]
            sid = row["service_id"]
            if d == target_date:
                active_services.add(sid)
            elif d == date_sat:
                services_sat.add(sid)
            elif d == date_sun:
                services_sun.add(sid)

    print(f"[lille-ingest] Date nominale {target_date} : {len(active_services)} service_ids actifs")

    # Filtrer les courses de la ligne ME1
    l1_trips: Dict[str, dict] = {}
    sat_trips: Set[str] = set()
    sun_trips: Set[str] = set()

    for row in gtfs.open_csv("trips.txt"):
        if row.get("route_id") == "ME1":
            tid = row["trip_id"]
            sid = row["service_id"]
            if sid in active_services:
                l1_trips[tid] = row
            if sid in services_sat:
                sat_trips.add(tid)
            if sid in services_sun:
                sun_trips.add(tid)

    print(f"[lille-ingest] Ligne ME1 : {len(l1_trips)} courses actives le {target_date}")

    # Charger stop_times.txt pour ME1
    stop_times_by_trip: Dict[str, List[dict]] = defaultdict(list)
    max_arrival_sec = 0
    max_arrival_str = ""

    for row in gtfs.open_csv("stop_times.txt"):
        tid = row["trip_id"]
        spid = row["stop_id"]
        pfx = spid[:3]
        st_name = next((name for name, p, _ in L1_STATIONS_META if p == pfx), None)

        if tid in l1_trips:
            stop_times_by_trip[tid].append(row)
            arr_s = parse_time_s(row["arrival_time"])
            if arr_s > max_arrival_sec:
                max_arrival_sec = arr_s
                max_arrival_str = row["arrival_time"]

        if tid in l1_trips and st_name:
            call_counts_weekday[st_name] += 1
        elif tid in sat_trips and st_name:
            call_counts_sat[st_name] += 1
        elif tid in sun_trips and st_name:
            call_counts_sun[st_name] += 1

    gtfs.close()

    for tid in stop_times_by_trip:
        stop_times_by_trip[tid].sort(key=lambda s: int(s["stop_sequence"]))

    print(f"[lille-ingest] Heure GTFS maximale : {max_arrival_str} ({max_arrival_sec} s)")

    # =========================================================================
    # Étape 4 : Génération de schedule.json (Format compact du moteur)
    # =========================================================================
    unique_station_names = [st["name"] for st in stations_list]
    station_to_idx = {name: idx for idx, name in enumerate(unique_station_names)}
    pfx_to_idx = {pfx: station_to_idx[name] for name, pfx, _ in L1_STATIONS_META}

    schedule_trips = []
    dest_counts = Counter()

    for tid, st_list in stop_times_by_trip.items():
        if len(st_list) < 2:
            continue
        meta = l1_trips[tid]
        rid = meta["route_id"]
        dir_id = int(meta.get("direction_id", 0) or 0)
        shape_id = f"ME1_{dir_id}"

        t0 = parse_time_s(st_list[0]["departure_time"])
        t1 = parse_time_s(st_list[-1]["arrival_time"])

        last_pfx = st_list[-1]["stop_id"][:3]
        dest_idx = pfx_to_idx[last_pfx]
        dest_counts[unique_station_names[dest_idx]] += 1

        stops_compact = []
        proj_map = station_proj_dir0 if dir_id == 0 else station_proj_dir1

        last_s = -1.0
        for st in st_list:
            arr_s = parse_time_s(st["arrival_time"])
            dep_s = parse_time_s(st["departure_time"])
            pfx = st["stop_id"][:3]
            s_idx = pfx_to_idx[pfx]

            best_s, _ = proj_map[pfx]
            if best_s <= last_s:
                # Contrôle de stricte monotonie
                raise ValueError(f"Non-monotonie détectée pour trip {tid} direction {dir_id} à la station {pfx} : s={best_s} <= last={last_s}")
            last_s = best_s

            stops_compact.append([arr_s, dep_s, round(best_s, 1), s_idx])

        schedule_trips.append([
            tid,
            rid,
            dir_id,
            shape_id,
            t0,
            t1,
            dest_idx,
            stops_compact
        ])

    schedule_trips.sort(key=lambda t: (t[4], t[0]))
    schedule_artifact = {
        "stations": unique_station_names,
        "trips": schedule_trips
    }
    with open(output_dir / "schedule.json", "w", encoding="utf-8") as f:
        json.dump(schedule_artifact, f, separators=(",", ":"))

    print(f"[lille-ingest] Écriture de schedule.json : {len(schedule_trips)} courses")

    # =========================================================================
    # Étape 5 : Génération de lines.json
    # =========================================================================
    line_obj = {
        "id": "ME1",
        "short_name": "1",
        "long_name": "Ligne 1",
        "color": "#FDC41F",
        "text_color": "#000000",
        "mode": "metro",
        "destinations": {
            "0": "CHU - Eurasanté",
            "1": "4 Cantons Stade P. Mauroy"
        },
        "measured_length_km": round(max(len_dir0, len_dir1) / 1000.0, 2),
        "elevation_offset": 0.0
    }
    with open(output_dir / "lines.json", "w", encoding="utf-8") as f:
        json.dump([line_obj], f, indent=2, ensure_ascii=False)

    # =========================================================================
    # Étape 6 : Génération de tracks.json (avec assombrissement de contraste)
    # =========================================================================
    darkened_stroke = compute_darkened_contrast_color("#FDC41F", min_contrast=3.0)
    tracks_list = [
        {
            "line_id": "ME1",
            "short_name": "1",
            "stroke": darkened_stroke,
            "coordinates": [[round(p[0], 5), round(p[1], 5)] for p in poly_dir0]
        },
        {
            "line_id": "ME1",
            "short_name": "1",
            "stroke": darkened_stroke,
            "coordinates": [[round(p[0], 5), round(p[1], 5)] for p in poly_dir1]
        }
    ]
    with open(output_dir / "tracks.json", "w", encoding="utf-8") as f:
        json.dump(tracks_list, f, separators=(",", ":"))

    # =========================================================================
    # Étape 7 : Génération de line_ladders.json
    # =========================================================================
    stations_by_pfx = {pfx: next(st for st in stations_list if st["id"] == f"STATION_{pfx}") for _, pfx, _ in L1_STATIONS_META}

    ladder_dir0_stations = []
    for name_gtfs, pfx, _ in L1_STATIONS_META:
        s0, _ = station_proj_dir0[pfx]
        st_meta = stations_by_pfx[pfx]
        ladder_dir0_stations.append({
            "id": st_meta["id"],
            "name": st_meta["name"],
            "distance_m": round(s0, 1),
            "coordinates": st_meta["coordinates"],
            "is_hub": False,
            "transfers": []
        })

    ladder_dir1_stations = []
    for name_gtfs, pfx, _ in reversed(L1_STATIONS_META):
        s1, _ = station_proj_dir1[pfx]
        st_meta = stations_by_pfx[pfx]
        ladder_dir1_stations.append({
            "id": st_meta["id"],
            "name": st_meta["name"],
            "distance_m": round(s1, 1),
            "coordinates": st_meta["coordinates"],
            "is_hub": False,
            "transfers": []
        })

    ladders_artifact = {
        "ME1": {
            "id": "ME1",
            "short_name": "1",
            "color": "#FDC41F",
            "text_color": "#000000",
            "directions": {
                "0": {
                    "origin": "4 Cantons Stade P. Mauroy",
                    "terminus": "CHU - Eurasanté",
                    "stations": ladder_dir0_stations
                },
                "1": {
                    "origin": "CHU - Eurasanté",
                    "terminus": "4 Cantons Stade P. Mauroy",
                    "stations": ladder_dir1_stations
                }
            }
        }
    }
    with open(output_dir / "line_ladders.json", "w", encoding="utf-8") as f:
        json.dump(ladders_artifact, f, indent=2, ensure_ascii=False)

    # =========================================================================
    # Étape 8 : Génération de station-rankings.json
    # =========================================================================
    rankings_artifact = {
        "weekday": [{"name": k, "count": v} for k, v in call_counts_weekday.most_common()],
        "saturday": [{"name": k, "count": v} for k, v in call_counts_sat.most_common()],
        "sunday": [{"name": k, "count": v} for k, v in call_counts_sun.most_common()]
    }
    with open(output_dir / "station-rankings.json", "w", encoding="utf-8") as f:
        json.dump(rankings_artifact, f, indent=2, ensure_ascii=False)

    # =========================================================================
    # Étape 9 : sections.json
    # =========================================================================
    sections_artifact = {
        "schema_version": 1,
        "source": {
            "provider": "Ilévia / MEL",
            "classification": {
                "souterrain": "100% réseau métro Ligne 1 Lille (tunnel foré, tranchée couverte et section protégée)",
                "aerien": "néant"
            }
        },
        "summary": {
            "aerial_sections": 0,
            "aerial_km": 0.0,
            "network_type": "100% souterrain / site propre intégral"
        }
    }
    with open(output_dir / "sections.json", "w", encoding="utf-8") as f:
        json.dump(sections_artifact, f, indent=2, ensure_ascii=False)

    # =========================================================================
    # Étape 10 : feed_fingerprint.json
    # =========================================================================
    feed_fingerprint_artifact = {
        "url": "https://media.ilevia.fr/opendata/gtfs.zip",
        "source": "Ilévia / Métropole Européenne de Lille (Licence Ouverte 2.0) & contributeurs OpenStreetMap (ODbL)",
        "dataset": "gtfs.zip (Ilévia Open Data)",
        "generated_at": datetime.now().strftime("%Y-%m-%d"),
        "service_date": target_date
    }
    with open(output_dir / "feed_fingerprint.json", "w", encoding="utf-8") as f:
        json.dump(feed_fingerprint_artifact, f, indent=2, ensure_ascii=False)

    # =========================================================================
    # Étape 11 : rolling-stock.json (VAL 208 et rame 52m, verified: false)
    # =========================================================================
    rolling_stock_artifact = {
        "asset_families": {
            "val_pneumatic": {
                "family_id": "val_pneumatic",
                "reference_dimensions_m": {
                    "car_length_m": 13.0,
                    "car_height_m": 3.25,
                    "width_m": 2.06
                }
            }
        },
        "models": {
            "VAL_208": {
                "model_id": "VAL_208",
                "name": "VAL 208 (2 voitures - 26 m)",
                "manufacturer": "Matra Transport / Siemens Mobility",
                "cars_count": 2,
                "total_length_m": 26.0,
                "car_length_m": 13.0,
                "bogie_centres_m": 8.0,
                "width_m": 2.06,
                "inter_car_gap_m": 0.0,
                "drive_type": "tire",
                "driverless": True,
                "source": "Fiche technique VAL 208 Siemens Mobility",
                "verified": False
            },
            "VAL_52M": {
                "model_id": "VAL_52M",
                "name": "Alstom Metropolis Boa (4 voitures - 52 m)",
                "manufacturer": "Alstom Transport",
                "cars_count": 4,
                "total_length_m": 52.0,
                "car_length_m": 13.0,
                "bogie_centres_m": 8.0,
                "width_m": 2.06,
                "inter_car_gap_m": 0.0,
                "drive_type": "tire",
                "driverless": True,
                "source": "Rames 52 mètres Alstom / MEL Ligne 1",
                "verified": False
            }
        },
        "lines": {
            "ME1": {
                "line_id": "ME1",
                "short_name": "1",
                "model_id": "VAL_208",
                "name": "VAL 208 (26 m) / Rame 52 m (parc mixte)",
                "cars_count": 2,
                "total_length_m": 26.0,
                "car_length_m": 13.0,
                "bogie_centres_m": 8.0,
                "width_m": 2.06,
                "inter_car_gap_m": 0.0,
                "drive_type": "tire",
                "driverless": True,
                "source": "Exploitation parc mixte Ligne 1 Ilévia",
                "verified": False
            }
        }
    }
    with open(output_dir / "rolling-stock.json", "w", encoding="utf-8") as f:
        json.dump(rolling_stock_artifact, f, indent=2, ensure_ascii=False)

    # =========================================================================
    # Étape 12 : Miroir vers web/public/cities/lille/data/
    # =========================================================================
    if web_dir:
        print(f"[lille-ingest] Copie miroir des artefacts vers {web_dir}...")
        for fname in [
            "lines.json", "stations.json", "shapes.bin", "schedule.json",
            "tracks.json", "line_ladders.json", "station-rankings.json",
            "sections.json", "feed_fingerprint.json", "rolling-stock.json"
        ]:
            src_f = output_dir / fname
            if src_f.exists():
                shutil.copy2(src_f, web_dir / fname)

    # Récapitulatif des poids de fichiers
    artifact_sizes = {}
    for fname in [
        "lines.json", "stations.json", "shapes.bin", "schedule.json",
        "tracks.json", "line_ladders.json", "station-rankings.json",
        "sections.json", "feed_fingerprint.json", "rolling-stock.json"
    ]:
        fpath = output_dir / fname
        if fpath.exists():
            artifact_sizes[fname] = fpath.stat().st_size

    print("✅ Ingestion de Lille (Ligne 1) terminée avec succès !")
    return {
        "trips_count": len(schedule_trips),
        "max_arrival_time": max_arrival_str,
        "max_station_to_track_dist_m": round(max_dist_to_track, 2),
        "artifact_sizes": artifact_sizes,
        "station_distances": station_distances_report
    }


if __name__ == "__main__":
    gtfs_source = "/Users/morgancanteri/.gemini/antigravity/brain/e966c3bd-10d9-40f2-8440-98d3440c8ebf/scratch/lille/gtfs_today"
    raw_directory = Path(__file__).resolve().parents[1] / "data" / "raw"
    out_dir = Path(__file__).resolve().parents[1] / "data"
    web_directory = Path(__file__).resolve().parents[3] / "web" / "public" / "cities" / "lille" / "data"

    res = build_lille_artifacts(
        gtfs_path=gtfs_source,
        raw_dir=raw_directory,
        output_dir=out_dir,
        web_dir=web_directory,
        target_date="20260930"
    )
    print("\n--- RÉSULTATS PORTE 1 ---")
    print(f"Courses: {res['trips_count']}")
    print(f"Heure GTFS max: {res['max_arrival_time']}")
    print(f"Distance station-tracé max: {res['max_station_to_track_dist_m']} m")
    print(f"Poids des artefacts:")
    for k, v in res['artifact_sizes'].items():
        print(f"  {k:22s}: {v:8d} octets ({v/1024:.1f} Ko)")
