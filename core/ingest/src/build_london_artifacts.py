"""
build_london_artifacts.py — Pipeline d'ingestion TfL pour le London Underground (Tube)

Génère l'ensemble des 8 artefacts normalisés dans cities/london/data/ et web/public/cities/london/data/ :
1. lines.json : métadonnées des 11 lignes du Tube
2. stations.json : 272 stations uniques du Tube
3. tracks.json : polylignes simplifiées des voies physiques (Option 1 : voie unique partagée)
4. shapes.bin : binaire SHP2 rééchantillonné au pas régulier de 10 m
5. schedule.json : grille des courses et arrêts au format compact
6. line_ladders.json : thermomètre de ligne ordonné par direction pour le dock
7. station-rankings.json : fréquences théoriques de desserte par station
8. sections.json : classification Deep Tube vs Sub-Surface
9. feed_fingerprint.json : empreinte et provenance des données sources
"""

from __future__ import annotations

import heapq
import json
import math
import os
import re
import shutil
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

from core.ingest.write_shapes_v2 import ResampledShape, write_shapes_v2

# Coordonnées du centre de Londres pour projection équirectangulaire locale
LAT0 = 51.5074
LON0 = -0.1276
R_EARTH = 6371000.0
DEG_TO_RAD = math.pi / 180.0
_LAT_M = R_EARTH * DEG_TO_RAD
_LON_M = R_EARTH * math.cos(LAT0 * DEG_TO_RAD) * DEG_TO_RAD

def equirect_dist_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Distance métrique plane entre deux points WGS84 autour de Londres."""
    dx = (lon2 - lon1) * _LON_M
    dy = (lat2 - lat1) * _LAT_M
    return math.hypot(dx, dy)

def point_to_segment_proj_m(px: float, py: float, x1: float, y1: float, x2: float, y2: float) -> Tuple[float, float]:
    """Projection orthogonale d'un point sur un segment [P1, P2] en coordonnées métriques."""
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

def elizabeth_leg_runtime_s(dist_m: float, is_tunnel: bool = False) -> int:
    """Temps de parcours cinématique inter-station pour le gabarit Class 345 Aventra."""
    v_max = 26.0 if is_tunnel else 33.33  # ~94 km/h en tunnel foré central, 120 km/h en surface
    a = 1.0
    d = 1.0
    d_acc_dec = 0.5 * v_max * v_max / a + 0.5 * v_max * v_max / d
    if dist_m < d_acc_dec:
        v_peak = math.sqrt(dist_m * 2 * a * d / (a + d))
        t_run = v_peak * (1.0 / a + 1.0 / d)
    else:
        t_run = (v_max / a + v_max / d) + (dist_m - d_acc_dec) / v_max
    return max(60, int(round(t_run)))

def overground_leg_runtime_s(dist_m: float) -> int:
    """Temps de parcours cinématique inter-station pour le gabarit Overground (Class 378/710)."""
    v_max = 22.22  # ~80 km/h vitesse moyenne de pointe sur voies suburbaines
    a = 1.0
    d = 1.0
    d_acc_dec = 0.5 * v_max * v_max / a + 0.5 * v_max * v_max / d
    if dist_m < d_acc_dec:
        v_peak = math.sqrt(dist_m * 2 * a * d / (a + d))
        t_run = v_peak * (1.0 / a + 1.0 / d)
    else:
        t_run = (v_max / a + v_max / d) + (dist_m - d_acc_dec) / v_max
    return max(50, int(round(t_run)))

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

def parse_iso_duration_s(d_str: str) -> int:
    """Convertit une durée ISO 8601 (ex: PT2M, PT90S, PT1M30S) en secondes."""
    if not d_str:
        return 0
    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", d_str)
    if not m:
        return 0
    h = int(m.group(1) or 0)
    mins = int(m.group(2) or 0)
    s = int(m.group(3) or 0)
    return h * 3600 + mins * 60 + s

def parse_time_s(t_str: str) -> int:
    """Convertit HH:MM:SS en secondes depuis minuit."""
    parts = [int(p) for p in t_str.strip().split(":")]
    return parts[0] * 3600 + parts[1] * 60 + parts[2]

NAPTAN_ALIAS = {
    '940GZZBPSUS': '940GZZLU991',
    '9400ZZBPSUST': '940GZZLU991',
    '940GZZNEUGS': '940GZZLU990',
    '9400ZZNEUGST': '940GZZLU990',
}

def to_base_sid(atco: str) -> str:
    """Normalise un AtcoCode NaPTAN de quai en identifiant de station 940GZZLU..."""
    if atco in NAPTAN_ALIAS:
        return NAPTAN_ALIAS[atco]
    if atco.startswith('9400'):
        base = '940G' + atco[4:-1]
        return NAPTAN_ALIAS.get(base, base)
    return NAPTAN_ALIAS.get(atco, atco)

LINE_CONFIGS = [
    {
        "id": "bakerloo",
        "short_name": "Bakerloo",
        "long_name": "Bakerloo Line",
        "color": "#B36305",
        "text_color": "#FFFFFF",
        "rep_file": "tfl_1-BAK-_-y05-635201.xml",
        "elevation_offset": -18.0,
        "is_sub_surface": False
    },
    {
        "id": "central",
        "short_name": "Central",
        "long_name": "Central Line",
        "color": "#E32017",
        "text_color": "#FFFFFF",
        "rep_file": "tfl_1-CEN-_-y05-710810.xml",
        "elevation_offset": -20.0,
        "is_sub_surface": False
    },
    {
        "id": "circle",
        "short_name": "Circle",
        "long_name": "Circle Line",
        "color": "#FFD300",
        "text_color": "#113B92",
        "rep_file": "tfl_1-CIR-_-y05-400210.xml",
        "elevation_offset": -6.0,
        "is_sub_surface": True
    },
    {
        "id": "district",
        "short_name": "District",
        "long_name": "District Line",
        "color": "#00782A",
        "text_color": "#FFFFFF",
        "rep_file": "tfl_1-DIS-_-y05-1335100.xml",
        "elevation_offset": -6.0,
        "is_sub_surface": True
    },
    {
        "id": "hammersmith-city",
        "short_name": "Hammersmith & City",
        "long_name": "Hammersmith & City Line",
        "color": "#F3A9BB",
        "text_color": "#113B92",
        "rep_file": "tfl_1-HAM-_-y05-400210.xml",
        "elevation_offset": -6.0,
        "is_sub_surface": True
    },
    {
        "id": "jubilee",
        "short_name": "Jubilee",
        "long_name": "Jubilee Line",
        "color": "#A0A5A9",
        "text_color": "#FFFFFF",
        "rep_file": "tfl_1-JUB-_-y05-190200.xml",
        "elevation_offset": -24.0,
        "is_sub_surface": False
    },
    {
        "id": "metropolitan",
        "short_name": "Metropolitan",
        "long_name": "Metropolitan Line",
        "color": "#9B0056",
        "text_color": "#FFFFFF",
        "rep_file": "tfl_1-MET-_-y05-1035210.xml",
        "elevation_offset": -6.0,
        "is_sub_surface": True
    },
    {
        "id": "northern",
        "short_name": "Northern",
        "long_name": "Northern Line",
        "color": "#000000",
        "text_color": "#FFFFFF",
        "rep_file": "tfl_1-NTN-_-y05-4266806.xml",
        "elevation_offset": -22.0,
        "is_sub_surface": False
    },
    {
        "id": "piccadilly",
        "short_name": "Piccadilly",
        "long_name": "Piccadilly Line",
        "color": "#003688",
        "text_color": "#FFFFFF",
        "rep_file": "tfl_1-PIC-_-y05-1325200.xml",
        "elevation_offset": -26.0,
        "is_sub_surface": False
    },
    {
        "id": "victoria",
        "short_name": "Victoria",
        "long_name": "Victoria Line",
        "color": "#0098D4",
        "text_color": "#FFFFFF",
        "rep_file": "tfl_1-VIC-_-y05-420897.xml",
        "elevation_offset": -20.0,
        "is_sub_surface": False
    },
    {
        "id": "waterloo-city",
        "short_name": "Waterloo & City",
        "long_name": "Waterloo & City Line",
        "color": "#95CDBA",
        "text_color": "#113B92",
        "rep_file": "tfl_1-WAC-_-y05-1215100.xml",
        "elevation_offset": -16.0,
        "is_sub_surface": False
    },
    {
        "id": "dlr",
        "short_name": "DLR",
        "long_name": "Docklands Light Railway",
        "color": "#00A4A7",
        "text_color": "#FFFFFF",
        "mode": "dlr",
        "rep_file": "tfl_25-DLR-_-y05-266.xml",
        "elevation_offset": 3.0,
        "is_sub_surface": False
    },
    {
        "id": "elizabeth",
        "short_name": "Elizabeth",
        "long_name": "Elizabeth line",
        "color": "#6950A1",
        "text_color": "#FFFFFF",
        "mode": "elizabeth-line",
        "rep_file": None,
        "elevation_offset": -15.0,
        "is_sub_surface": False
    },
    {
        "id": "liberty",
        "short_name": "Liberty",
        "long_name": "Liberty Line",
        "color": "#606667",
        "text_color": "#FFFFFF",
        "mode": "overground",
        "rep_file": None,
        "elevation_offset": 2.0,
        "is_sub_surface": False
    },
    {
        "id": "lioness",
        "short_name": "Lioness",
        "long_name": "Lioness Line",
        "color": "#EF9600",
        "text_color": "#FFFFFF",
        "mode": "overground",
        "rep_file": None,
        "elevation_offset": 2.0,
        "is_sub_surface": False
    },
    {
        "id": "mildmay",
        "short_name": "Mildmay",
        "long_name": "Mildmay Line",
        "color": "#2774AE",
        "text_color": "#FFFFFF",
        "mode": "overground",
        "rep_file": None,
        "elevation_offset": 2.0,
        "is_sub_surface": False
    },
    {
        "id": "suffragette",
        "short_name": "Suffragette",
        "long_name": "Suffragette Line",
        "color": "#5BA763",
        "text_color": "#FFFFFF",
        "mode": "overground",
        "rep_file": None,
        "elevation_offset": 2.0,
        "is_sub_surface": False
    },
    {
        "id": "weaver",
        "short_name": "Weaver",
        "long_name": "Weaver Line",
        "color": "#893B67",
        "text_color": "#FFFFFF",
        "mode": "overground",
        "rep_file": None,
        "elevation_offset": 2.0,
        "is_sub_surface": False
    },
    {
        "id": "windrush",
        "short_name": "Windrush",
        "long_name": "Windrush Line",
        "color": "#D22730",
        "text_color": "#FFFFFF",
        "mode": "overground",
        "rep_file": None,
        "elevation_offset": 2.0,
        "is_sub_surface": False
    },
    {
        "id": "tram",
        "short_name": "Tram",
        "long_name": "London Trams",
        "color": "#00BD19",
        "text_color": "#FFFFFF",
        "mode": "tram",
        "rep_file": "tfl_63-TR-_-y05-132.xml",
        "elevation_offset": 1.5,
        "is_sub_surface": False
    }
]

def build_london_artifacts(
    tfl_lul_dir: str | Path = "/tmp/tfl_lul",
    tfl_stations_path: str | Path = "/tmp/tfl_stations.json",
    tfl_lines_path: str | Path = "/tmp/tfl_lines.json",
    output_dir: str | Path = "cities/london/data",
    web_dir: Optional[str | Path] = "web/public/cities/london/data"
) -> None:
    tfl_lul_dir = Path(tfl_lul_dir)
    tfl_stations_path = Path(tfl_stations_path)
    tfl_lines_path = Path(tfl_lines_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    if web_dir:
        web_dir = Path(web_dir)
        web_dir.mkdir(parents=True, exist_ok=True)

    print(f"[london-ingest] Chargement de {tfl_stations_path} et {tfl_lines_path}...")
    with open(tfl_stations_path, encoding="utf-8") as f:
        stations_geojson = json.load(f)
    with open(tfl_lines_path, encoding="utf-8") as f:
        lines_geojson = json.load(f)

    # 1. Indexation des stations GeoJSON
    stations_by_id: Dict[str, dict] = {}
    for feat in stations_geojson["features"]:
        props = feat["properties"]
        coords = feat["geometry"]["coordinates"]
        sid = props["id"]
        stations_by_id[sid] = {
            "id": sid,
            "name": props["name"],
            "coordinates": [round(coords[0], 6), round(coords[1], 6)],
            "lines": set()
        }

    OVERGROUND_TUBE_ALIASES = {
        '910GGNRSBRY': '940GZZLUGBY',
        '910GHARLSDN': '940GZZLUHSN',
        '910GHROW': '940GZZLUHAW',
        '910GKENOLYM': '940GZZLUKOY',
        '910GKENSLG': '940GZZLUKSL',
        '910GKEWGRDN': '940GZZLUKWG',
        '910GKTON': '940GZZLUKEN',
        '910GNWEMBLY': '940GZZLUNWY',
        '910GQPRK': '940GZZLUQPS',
        '910GRICHMND': '940GZZLURMD',
        '910GSKENTON': '940GZZLUSKT',
        '910GSTNBGPK': '940GZZLUSGP',
        '910GWBRMPTN': '940GZZLUWBN',
        '910GWLSDJHL': '940GZZLUWJN',
        '910GWMBY': '940GZZLUWYC',
        '910GUPMNSTR': '940GZZLUUPM',
    }
    for alias_k, canonical_v in OVERGROUND_TUBE_ALIASES.items():
        if canonical_v in stations_by_id and alias_k not in stations_by_id:
            stations_by_id[alias_k] = stations_by_id[canonical_v]

    # 2. Construction du graphe ferroviaire physique à partir de tfl_lines.json
    tube_line_names = {
        "Bakerloo", "Central", "Circle", "District", "Hammersmith & City",
        "Jubilee", "Metropolitan", "Northern", "Piccadilly", "Victoria", "Waterloo & City",
        "DLR", "Elizabeth line"
    }

    ACTIVE_ELIZABETH_FEATURES = {
        'ReadingExtension', 'CrossrailWest', 'PaddStockley', 'PaddLink',
        'CrossrailCentral', 'AbbeyWoodSpur', 'CrossrailT5', 'HeathrowSpur',
        'StratStepLink', 'CrossrailEast1', 'CrossrailEast2', 'CrossrailEast3',
        'CrossrailEastAB', 'CrossrailEast4', 'CrossrailEast5', 'CrossrailEast6',
        'CrossrailEast7', 'CrossrailEast8', 'CrossrailEast9', 'CrossrailEastA',
        'CrossrailEastB', 'CrossrailEastC'
    }

    graph: Dict[str, List[Tuple[str, List[Tuple[float, float]], float]]] = defaultdict(list)
    physical_segments_for_tracks = []

    for feat in lines_geojson["features"]:
        coords = feat["geometry"]["coordinates"]
        props = feat["properties"]
        feat_lines = props.get("lines", [])
        feat_id = props.get("id")
        
        # Segment tube / DLR / Elizabeth ?
        tube_match = [l for l in feat_lines if l.get("name") in tube_line_names]
        if not tube_match:
            continue

        # Filtrer les tracés historiques/fermés de l'Elizabeth line
        is_elizabeth_only = all(l.get("name") == "Elizabeth line" for l in tube_match)
        if is_elizabeth_only and feat_id not in ACTIVE_ELIZABETH_FEATURES:
            continue

        l_m = sum(equirect_dist_m(coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1]) for i in range(1, len(coords)))
        
        # Enregistrer pour Option 1 (voie unique partagée)
        raw_primary = tube_match[0]["name"]
        primary_line_name = "Elizabeth" if raw_primary == "Elizabeth line" else raw_primary
        physical_segments_for_tracks.append({
            "feature_id": feat_id,
            "primary_line": primary_line_name,
            "coordinates": [[round(c[0], 5), round(c[1], 5)] for c in coords]
        })

        for l in tube_match:
            if l.get("name") == "Elizabeth line":
                continue
            u, v = l.get("start_sid"), l.get("end_sid")
            if u and v:
                graph[u].append((v, coords, l_m))
                graph[v].append((u, coords[::-1], l_m))

    # Extension Battersea : Kennington (940GZZLUKNG) -> Nine Elms (940GZZLU990) -> Battersea PS (940GZZLU991)
    for feat in lines_geojson["features"]:
        if feat["properties"].get("id") == "BatterseaExtension":
            coords = feat["geometry"]["coordinates"]
            l_m = sum(equirect_dist_m(coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1]) for i in range(1, len(coords)))
            mid_idx = len(coords) // 2
            seg1 = coords[:mid_idx + 1]
            seg2 = coords[mid_idx:]
            l1 = sum(equirect_dist_m(seg1[i-1][0], seg1[i-1][1], seg1[i][0], seg1[i][1]) for i in range(1, len(seg1)))
            l2 = sum(equirect_dist_m(seg2[i-1][0], seg2[i-1][1], seg2[i][0], seg2[i][1]) for i in range(1, len(seg2)))

            graph['940GZZLUKNG'].append(('940GZZLU990', seg2[::-1], l2))
            graph['940GZZLU990'].append(('940GZZLUKNG', seg2, l2))
            graph['940GZZLU990'].append(('940GZZLU991', seg1[::-1], l1))
            graph['940GZZLU991'].append(('940GZZLU990', seg1, l1))

    # Dijkstra pour trouver le tracé physique entre deux arrêts consécutifs
    shortest_path_cache: Dict[Tuple[str, str], List[Tuple[float, float]]] = {}

    def get_track_between(src: str, dst: str) -> List[Tuple[float, float]]:
        if src == dst:
            return []
        cache_key = (src, dst)
        if cache_key in shortest_path_cache:
            return shortest_path_cache[cache_key]

        pq = [(0.0, src, [])]
        visited = set()
        best_coords = None

        while pq:
            d, curr, segs = heapq.heappop(pq)
            if curr == dst:
                combined = []
                for s in segs:
                    if not combined:
                        combined.extend(s)
                    else:
                        combined.extend(s[1:])
                best_coords = combined
                break
            if curr in visited:
                continue
            visited.add(curr)
            for nxt, seg_coords, seg_l in graph.get(curr, []):
                if nxt not in visited:
                    heapq.heappush(pq, (d + seg_l, nxt, segs + [seg_coords]))

        if best_coords is None:
            # Fallback direct en ligne droite si graphe disjoint
            p_src = stations_by_id[src]["coordinates"]
            p_dst = stations_by_id[dst]["coordinates"]
            best_coords = [p_src, p_dst]

        shortest_path_cache[cache_key] = best_coords
        return best_coords

    # Helper pour nommer les lignes Overground selon l'identifiant de segment
    def get_lo_line_name(fid: str) -> str:
        if fid.startswith('EmersonPark'):
            return 'Liberty'
        if fid.startswith(('EustonSpur', 'BakerlooDC', 'WatfordJSpur', 'WatfordJShared')):
            return 'Lioness'
        if fid.startswith(('DistRichmond', 'NorthLonLine', 'WestBrompton', 'Olympia', 'ClaphamJunctionCombo', 'WestLonLine')):
            return 'Mildmay'
        if fid.startswith(('Goblin', 'BarkingExt')):
            return 'Suffragette'
        if fid.startswith(('LeaValleyLine', 'LivStBeth', 'EnfieldTownSpur', 'ChingfordSpur')):
            return 'Weaver'
        if fid.startswith(('EastLon', 'ShoreditchRetained', 'NewCrossSpur', 'CrystalPSpur', 'SouthLonLine')):
            return 'Windrush'
        return 'Mildmay'

    # Segments exclusifs London Overground pour tracks.json
    for feat in lines_geojson["features"]:
        coords = feat["geometry"]["coordinates"]
        props = feat["properties"]
        feat_lines = props.get("lines", [])
        feat_id = props.get("id", "")

        has_lo = any(l.get("name") == "London Overground" for l in feat_lines)
        has_tube_or_el = any(l.get("name") in tube_line_names for l in feat_lines)
        if has_lo and not has_tube_or_el:
            primary_line_name = get_lo_line_name(feat_id)
            physical_segments_for_tracks.append({
                "feature_id": feat_id,
                "primary_line": primary_line_name,
                "coordinates": [[round(c[0], 5), round(c[1], 5)] for c in coords]
            })

    # Construction du graphe spécifique London Overground (hérite du graphe tube + segments LO orientés)
    lo_graph: Dict[str, List[Tuple[str, List[Tuple[float, float]], float]]] = defaultdict(list)
    for u, edges in graph.items():
        lo_graph[u] = list(edges)

    for feat in lines_geojson["features"]:
        coords = feat["geometry"]["coordinates"]
        props = feat["properties"]
        feat_lines = props.get("lines", [])
        for l in feat_lines:
            if l.get("name") != "London Overground":
                continue
            u = l.get("start_sid")
            v = l.get("end_sid")
            if not u or not v:
                continue
            u = OVERGROUND_TUBE_ALIASES.get(u, u)
            v = OVERGROUND_TUBE_ALIASES.get(v, v)
            if u not in stations_by_id or v not in stations_by_id:
                continue

            seg_coords = coords
            u_c = stations_by_id[u]["coordinates"]
            d0 = equirect_dist_m(coords[0][0], coords[0][1], u_c[0], u_c[1])
            d1 = equirect_dist_m(coords[-1][0], coords[-1][1], u_c[0], u_c[1])
            if d0 > d1:
                seg_coords = coords[::-1]

            l_m = sum(equirect_dist_m(seg_coords[i-1][0], seg_coords[i-1][1], seg_coords[i][0], seg_coords[i][1]) for i in range(1, len(seg_coords)))
            lo_graph[u].append((v, seg_coords, l_m))
            lo_graph[v].append((u, seg_coords[::-1], l_m))

    lo_shortest_path_cache: Dict[Tuple[str, str], List[Tuple[float, float]]] = {}

    def get_lo_track_between(src: str, dst: str) -> List[Tuple[float, float]]:
        if src == dst:
            return []
        cache_key = (src, dst)
        if cache_key in lo_shortest_path_cache:
            return lo_shortest_path_cache[cache_key]

        pq = [(0.0, src, [])]
        visited = set()
        best_coords = None

        while pq:
            d, curr, segs = heapq.heappop(pq)
            if curr == dst:
                combined = []
                for s in segs:
                    if not combined:
                        combined.extend(s)
                    else:
                        combined.extend(s[1:])
                best_coords = combined
                break
            if curr in visited:
                continue
            visited.add(curr)
            for nxt, seg_coords, seg_l in lo_graph.get(curr, []):
                if nxt not in visited:
                    heapq.heappush(pq, (d + seg_l, nxt, segs + [seg_coords]))

        if best_coords is None:
            c1 = stations_by_id[src]["coordinates"]
            c2 = stations_by_id[dst]["coordinates"]
            best_coords = [c1, c2]

        lo_shortest_path_cache[cache_key] = best_coords
        return best_coords

    # Segments exclusifs London Trams pour tracks.json
    for feat in lines_geojson["features"]:
        coords = feat["geometry"]["coordinates"]
        props = feat["properties"]
        feat_lines = props.get("lines", [])
        feat_id = props.get("id", "")

        has_tram = any(l.get("name") == "Tramlink" for l in feat_lines)
        if has_tram:
            physical_segments_for_tracks.append({
                "feature_id": feat_id,
                "primary_line": "Tram",
                "coordinates": [[round(c[0], 5), round(c[1], 5)] for c in coords]
            })

    # Construction du graphe spécifique London Trams (Tramlink)
    tram_graph: Dict[str, List[Tuple[str, List[Tuple[float, float]], float]]] = defaultdict(list)
    for feat in lines_geojson["features"]:
        coords = feat["geometry"]["coordinates"]
        props = feat["properties"]
        feat_lines = props.get("lines", [])
        for l in feat_lines:
            if l.get("name") != "Tramlink":
                continue
            u = l.get("start_sid")
            v = l.get("end_sid")
            if not u or not v:
                continue
            if u not in stations_by_id or v not in stations_by_id:
                continue

            seg_coords = coords
            u_c = stations_by_id[u]["coordinates"]
            d0 = equirect_dist_m(coords[0][0], coords[0][1], u_c[0], u_c[1])
            d1 = equirect_dist_m(coords[-1][0], coords[-1][1], u_c[0], u_c[1])
            if d0 > d1:
                seg_coords = coords[::-1]

            l_m = sum(equirect_dist_m(seg_coords[i-1][0], seg_coords[i-1][1], seg_coords[i][0], seg_coords[i][1]) for i in range(1, len(seg_coords)))
            tram_graph[u].append((v, seg_coords, l_m))
            tram_graph[v].append((u, seg_coords[::-1], l_m))

    tram_shortest_path_cache: Dict[Tuple[str, str], List[Tuple[float, float]]] = {}

    def get_tram_track_between(src: str, dst: str) -> List[Tuple[float, float]]:
        if src == dst:
            return []
        cache_key = (src, dst)
        if cache_key in tram_shortest_path_cache:
            return tram_shortest_path_cache[cache_key]

        pq = [(0.0, src, [])]
        visited = set()
        best_coords = None

        while pq:
            d, curr, segs = heapq.heappop(pq)
            if curr == dst:
                combined = []
                for s in segs:
                    if not combined:
                        combined.extend(s)
                    else:
                        combined.extend(s[1:])
                best_coords = combined
                break
            if curr in visited:
                continue
            visited.add(curr)
            for nxt, seg_coords, seg_l in tram_graph.get(curr, []):
                if nxt not in visited:
                    heapq.heappush(pq, (d + seg_l, nxt, segs + [seg_coords]))

        if best_coords is None:
            c1 = stations_by_id[src]["coordinates"]
            c2 = stations_by_id[dst]["coordinates"]
            best_coords = [c1, c2]

        tram_shortest_path_cache[cache_key] = best_coords
        return best_coords

    # 3. Lecture et conversion des fichiers TransXChange
    ns = {"txc": "http://www.transxchange.org.uk/"}
    
    unique_shape_dict: Dict[Tuple[str, ...], Tuple[str, List[Tuple[float, float]], List[float]]] = {}
    shape_counter = 0

    all_trips_compact = []
    station_call_counts = {
        "weekday": Counter(),
        "saturday": Counter(),
        "sunday": Counter()
    }

    used_station_ids: Set[str] = set()
    termini_by_line_dir: Dict[str, Dict[str, str]] = defaultdict(dict)
    model_trips_for_ladder: Dict[str, Dict[str, dict]] = defaultdict(dict)

    print("[london-ingest] Analyse des grilles horaires TransXChange et synthèse Elizabeth line...")
    for l_conf in LINE_CONFIGS:
        lid = l_conf["id"]
        if lid == "elizabeth":
            # Synthèse canonique de l'Elizabeth line (41 stations, 6 axes nominaux, 24 tph cœur, 12 tph branches)
            el_features = {
                f["properties"].get("id"): f["geometry"]["coordinates"]
                for f in lines_geojson["features"]
                if any(l.get("name") == "Elizabeth line" for l in f["properties"].get("lines", []))
            }

            east_segs = [
                'CrossrailEast1', 'CrossrailEast2', 'CrossrailEast3', 'CrossrailEastAB',
                'CrossrailEast4', 'CrossrailEast5', 'CrossrailEast6', 'CrossrailEast7',
                'CrossrailEast8', 'CrossrailEast9', 'CrossrailEastA', 'CrossrailEastB', 'CrossrailEastC'
            ]
            strat_to_shenfield = []
            for sname in east_segs:
                seg = el_features[sname]
                if not strat_to_shenfield:
                    strat_to_shenfield.extend(seg)
                else:
                    strat_to_shenfield.extend(seg[1:])

            hs_to_t5_junction = el_features['HeathrowSpur'][:39]

            poly_reading_abbey = []
            for seg in [el_features['ReadingExtension'][::-1], el_features['CrossrailWest'], el_features['PaddStockley'], el_features['PaddLink'], el_features['CrossrailCentral'], el_features['AbbeyWoodSpur']]:
                if not poly_reading_abbey: poly_reading_abbey.extend(seg)
                else: poly_reading_abbey.extend(seg[1:])

            poly_t5_abbey = []
            for seg in [el_features['CrossrailT5'][::-1], hs_to_t5_junction[::-1], el_features['PaddStockley'], el_features['PaddLink'], el_features['CrossrailCentral'], el_features['AbbeyWoodSpur']]:
                if not poly_t5_abbey: poly_t5_abbey.extend(seg)
                else: poly_t5_abbey.extend(seg[1:])

            poly_t4_abbey = []
            for seg in [el_features['HeathrowSpur'][::-1], el_features['PaddStockley'], el_features['PaddLink'], el_features['CrossrailCentral'], el_features['AbbeyWoodSpur']]:
                if not poly_t4_abbey: poly_t4_abbey.extend(seg)
                else: poly_t4_abbey.extend(seg[1:])

            poly_padd_shenfield = []
            for seg in [el_features['CrossrailCentral'], el_features['StratStepLink'], strat_to_shenfield]:
                if not poly_padd_shenfield: poly_padd_shenfield.extend(seg)
                else: poly_padd_shenfield.extend(seg[1:])

            poly_t5_shenfield = []
            for seg in [el_features['CrossrailT5'][::-1], hs_to_t5_junction[::-1], el_features['PaddStockley'], el_features['PaddLink'], el_features['CrossrailCentral'], el_features['StratStepLink'], strat_to_shenfield]:
                if not poly_t5_shenfield: poly_t5_shenfield.extend(seg)
                else: poly_t5_shenfield.extend(seg[1:])

            poly_reading_padd = []
            for seg in [el_features['ReadingExtension'][::-1], el_features['CrossrailWest'], el_features['PaddStockley']]:
                if not poly_reading_padd: poly_reading_padd.extend(seg)
                else: poly_reading_padd.extend(seg[1:])

            el_routes = [
                {
                    'id_prefix': 'EL_RD_AB',
                    'stops': ['910GRDNGSTN', '910GTWYFORD', '910GMDNHEAD', '910GTAPLOW', '910GBNHAM', '910GSLOUGH', '910GLANGLEY', '910GIVER', '910GWDRYTON', '910GHAYESAH', '910GSTHALL', '910GHANWELL', '910GWEALING', '910GEALINGB', '910GACTONML', '910GPADTLL', '910GBONDST', '910GTOTCTRD', '910GFNTLSR', '910GLIVST', '910GWCHAPEL', '910G950', '910GCUSTMHS', '910GWOLWXR', '910GABWD'],
                    'poly': poly_reading_abbey,
                    'interval_mins': 15,
                    'first_dep': '05:30:00',
                    'last_dep': '23:45:00'
                },
                {
                    'id_prefix': 'EL_T5_AB',
                    'stops': ['940GZZLUHR5', '940GZZLUHRC', '910GHAYESAH', '910GSTHALL', '910GHANWELL', '910GWEALING', '910GEALINGB', '910GACTONML', '910GPADTLL', '910GBONDST', '910GTOTCTRD', '910GFNTLSR', '910GLIVST', '910GWCHAPEL', '910G950', '910GCUSTMHS', '910GWOLWXR', '910GABWD'],
                    'poly': poly_t5_abbey,
                    'interval_mins': 15,
                    'first_dep': '05:37:00',
                    'last_dep': '23:52:00'
                },
                {
                    'id_prefix': 'EL_T4_AB',
                    'stops': ['940GZZLUHR4', '940GZZLUHRC', '910GHAYESAH', '910GSTHALL', '910GHANWELL', '910GWEALING', '910GEALINGB', '910GACTONML', '910GPADTLL', '910GBONDST', '910GTOTCTRD', '910GFNTLSR', '910GLIVST', '910GWCHAPEL', '910G950', '910GCUSTMHS', '910GWOLWXR', '910GABWD'],
                    'poly': poly_t4_abbey,
                    'interval_mins': 15,
                    'first_dep': '05:45:00',
                    'last_dep': '23:45:00'
                },
                {
                    'id_prefix': 'EL_PD_SH',
                    'stops': ['910GPADTLL', '910GBONDST', '910GTOTCTRD', '910GFNTLSR', '910GLIVST', '910GWCHAPEL', '910GSTFD', '910GMRYLAND', '910GFRSTGT', '910GMANRPK', '910GILFORD', '910GSVNKNGS', '910GGODMAYS', '910GCHDWLHT', '910GROMFORD', '910GGIDEAPK', '910GHRLDWOD', '910GBRTWOOD', '910GSHENFLD'],
                    'poly': poly_padd_shenfield,
                    'interval_mins': 10,
                    'first_dep': '05:40:00',
                    'last_dep': '23:50:00'
                },
                {
                    'id_prefix': 'EL_T5_SH',
                    'stops': ['940GZZLUHR5', '940GZZLUHRC', '910GHAYESAH', '910GSTHALL', '910GHANWELL', '910GWEALING', '910GEALINGB', '910GACTONML', '910GPADTLL', '910GBONDST', '910GTOTCTRD', '910GFNTLSR', '910GLIVST', '910GWCHAPEL', '910GSTFD', '910GMRYLAND', '910GFRSTGT', '910GMANRPK', '910GILFORD', '910GSVNKNGS', '910GGODMAYS', '910GCHDWLHT', '910GROMFORD', '910GGIDEAPK', '910GHRLDWOD', '910GBRTWOOD', '910GSHENFLD'],
                    'poly': poly_t5_shenfield,
                    'interval_mins': 15,
                    'first_dep': '05:42:00',
                    'last_dep': '23:42:00'
                },
                {
                    'id_prefix': 'EL_RD_PD',
                    'stops': ['910GRDNGSTN', '910GTWYFORD', '910GMDNHEAD', '910GTAPLOW', '910GBNHAM', '910GSLOUGH', '910GLANGLEY', '910GIVER', '910GWDRYTON', '910GHAYESAH', '910GSTHALL', '910GHANWELL', '910GWEALING', '910GEALINGB', '910GACTONML', '910GPADTLL'],
                    'poly': poly_reading_padd,
                    'interval_mins': 30,
                    'first_dep': '06:05:00',
                    'last_dep': '23:35:00'
                }
            ]

            line_tuesday_trips = 0

            for r in el_routes:
                poly = r['poly']
                cum_lens = [0.0]
                for i in range(1, len(poly)):
                    cum_lens.append(cum_lens[-1] + equirect_dist_m(poly[i-1][0], poly[i-1][1], poly[i][0], poly[i][1]))

                stop_cum_dists = []
                prev_pos = 0.0
                for sid in r['stops']:
                    s_meta = stations_by_id.get(sid, {})
                    sx, sy = s_meta.get("coordinates", [0.0, 0.0])
                    best_dist = float('inf')
                    best_m = 0.0
                    for i in range(len(poly) - 1):
                        x1, y1 = poly[i]
                        x2, y2 = poly[i+1]
                        t, d = point_to_segment_proj_m(sx, sy, x1, y1, x2, y2)
                        if d < best_dist:
                            seg_len = cum_lens[i+1] - cum_lens[i]
                            m_along = cum_lens[i] + t * seg_len
                            if m_along >= prev_pos - 50:
                                best_dist = d
                                best_m = m_along
                    stop_cum_dists.append(round(best_m, 1))
                    prev_pos = max(prev_pos, best_m)

                leg_runtimes = []
                for i in range(len(stop_cum_dists) - 1):
                    d_m = stop_cum_dists[i+1] - stop_cum_dists[i]
                    is_tun = ('910GPADTLL' in r['stops'][:i+1] and '910GWCHAPEL' in r['stops'][i:])
                    leg_runtimes.append(elizabeth_leg_runtime_s(d_m, is_tun))

                for dir_id in (0, 1):
                    st_seq = r['stops'] if dir_id == 0 else list(reversed(r['stops']))
                    shape_coords = r['poly'] if dir_id == 0 else list(reversed(r['poly']))
                    total_len = cum_lens[-1]
                    shape_cum_dists = stop_cum_dists if dir_id == 0 else [round(total_len - d, 1) for d in reversed(stop_cum_dists)]
                    shape_runtimes = leg_runtimes if dir_id == 0 else list(reversed(leg_runtimes))

                    shape_key = tuple(st_seq)
                    if shape_key not in unique_shape_dict:
                        shape_counter += 1
                        sid_name = f"elizabeth_{dir_id}_{shape_counter}"
                        unique_shape_dict[shape_key] = (sid_name, shape_coords, shape_cum_dists)

                    assigned_shape_id, _, _ = unique_shape_dict[shape_key]

                    for sid in st_seq:
                        used_station_ids.add(sid)
                        if sid in stations_by_id:
                            stations_by_id[sid]["lines"].add("elizabeth")

                    h0, m0, s0 = [int(x) for x in r['first_dep'].split(':')]
                    h1, m1, s1 = [int(x) for x in r['last_dep'].split(':')]
                    t_start = h0 * 3600 + m0 * 60 + s0
                    t_end = h1 * 3600 + m1 * 60 + s1
                    step_s = r['interval_mins'] * 60

                    dep = t_start
                    while dep <= t_end:
                        vj_code = f"{r['id_prefix']}_{dir_id}_{dep // 60}"
                        t_curr = dep
                        t0 = t_curr
                        stops_compact = []
                        stops_compact.append([t0, t0, shape_cum_dists[0], st_seq[0]])

                        for i, rt in enumerate(shape_runtimes):
                            t_arr = t_curr + rt
                            dwell = 30 if i < len(shape_runtimes) - 1 else 0
                            t_dep = t_arr + dwell
                            stops_compact.append([t_arr, t_dep, shape_cum_dists[i + 1], st_seq[i + 1]])
                            t_curr = t_dep

                        t1 = stops_compact[-1][0]
                        dest_station_id = st_seq[-1]
                        dest_station_name = stations_by_id.get(dest_station_id, {}).get("name", dest_station_id)

                        trip_record = {
                            "trip_id": vj_code,
                            "line_id": "elizabeth",
                            "dir_id": dir_id,
                            "shape_id": assigned_shape_id,
                            "t0": t0,
                            "t1": t1,
                            "dest_sid": dest_station_id,
                            "stops": stops_compact
                        }
                        all_trips_compact.append(trip_record)
                        line_tuesday_trips += 1

                        for sid in st_seq:
                            s_name = stations_by_id.get(sid, {}).get("name", sid)
                            station_call_counts["weekday"][s_name] += 1
                            station_call_counts["saturday"][s_name] += 1
                            station_call_counts["sunday"][s_name] += 1

                        d_key = str(dir_id)
                        if d_key not in model_trips_for_ladder["elizabeth"] or len(stops_compact) > len(model_trips_for_ladder["elizabeth"][d_key]["stops"]):
                            model_trips_for_ladder["elizabeth"][d_key] = trip_record

                        dep += step_s

            termini_by_line_dir["elizabeth"]["0"] = "Abbey Wood / Shenfield"
            termini_by_line_dir["elizabeth"]["1"] = "Reading / Heathrow"
            print(f"  [{lid:<16}] {line_tuesday_trips} courses le mardi, {len(unique_shape_dict)} formes cumulées")
            continue

        if lid in ('liberty', 'lioness', 'mildmay', 'suffragette', 'weaver', 'windrush'):
            OVERGROUND_ROUTE_CONFIGS = {
                'liberty': [
                    {
                        'id_prefix': 'LO_LIB',
                        'stops': ['910GROMFORD', '910GEMRSPKH', '940GZZLUUPM'],
                        'interval_mins': 30,
                        'first_dep': '06:00:00',
                        'last_dep': '23:30:00'
                    }
                ],
                'lioness': [
                    {
                        'id_prefix': 'LO_LIO',
                        'stops': ['910GEUSTON', '910GSHMPSTD', '910GKLBRNHR', '940GZZLUQPS', '940GZZLUKSL',
                                  '940GZZLUWJN', '940GZZLUHSN', '940GZZLUSGP', '940GZZLUWYC', '940GZZLUNWY',
                                  '940GZZLUSKT', '940GZZLUKEN', '940GZZLUHAW', '910GHEDSTNL', '910GHTCHEND',
                                  '910GCRPNDPK', '910GBUSHYDC', '910GWATFDHS', '910GWATFJDC'],
                        'interval_mins': 15,
                        'first_dep': '05:45:00',
                        'last_dep': '23:45:00'
                    }
                ],
                'mildmay': [
                    {
                        'id_prefix': 'LO_MIL_RS',
                        'stops': ['940GZZLURMD', '940GZZLUKWG', '940GZZLUGBY', '910GSACTON', '910GACTNCTL',
                                  '940GZZLUWJN', '910GKENR', '910GBRBYPK', '910GBRBY', '910GWHMDSTD',
                                  '910GFNCHLYR', '910GHMPSTDH', '910GGOSPLOK', '910GKNTSHTW', '910GCMDNRD',
                                  '910GCLDNNRB', '910GHGHI', '910GCNNB', '910GDALSKLD', '910GHACKNYC',
                                  '910GHOMRTON', '910GHACKNYW', '910GSTFD'],
                        'interval_mins': 15,
                        'first_dep': '05:50:00',
                        'last_dep': '23:50:00'
                    },
                    {
                        'id_prefix': 'LO_MIL_CS',
                        'stops': ['910GCLPHMJ1', '910GCSEAH', '940GZZLUWBN', '940GZZLUKOY', '910GSHPDSB',
                                  '940GZZLUWJN', '910GKENR', '910GBRBYPK', '910GBRBY', '910GWHMDSTD',
                                  '910GFNCHLYR', '910GHMPSTDH', '910GGOSPLOK', '910GKNTSHTW', '910GCMDNRD',
                                  '910GCLDNNRB', '910GHGHI', '910GCNNB', '910GDALSKLD', '910GHACKNYC',
                                  '910GHOMRTON', '910GHACKNYW', '910GSTFD'],
                        'interval_mins': 15,
                        'first_dep': '05:57:00',
                        'last_dep': '23:42:00'
                    }
                ],
                'suffragette': [
                    {
                        'id_prefix': 'LO_SUF',
                        'stops': ['910GGOSPLOK', '910GUPRHLWY', '910GCROUCHH', '910GHRGYGL', '910GSTOTNHM',
                                  '910GBLCHSRD', '910GWLTHQRD', '910GLEYTNMR', '910GLYTNSHR', '910GWNSTDPK',
                                  '910GWDGRNPK', '910GBARKING', '910GBKRVS'],
                        'interval_mins': 15,
                        'first_dep': '06:00:00',
                        'last_dep': '23:45:00'
                    }
                ],
                'weaver': [
                    {
                        'id_prefix': 'LO_WEA_ET',
                        'stops': ['910GLIVST', '910GBTHNLGR', '910GCAMHTH', '910GLONFLDS', '910GHAKNYNM',
                                  '910GRCTRYRD', '910GSTKNWNG', '910GSTMFDHL', '910GSEVNSIS', '910GBRUCGRV',
                                  '910GWHHRTLA', '910GSIVRST', '910GEDMNGRN', '910GBHILLPK', '910GENFLDTN'],
                        'interval_mins': 30,
                        'first_dep': '05:30:00',
                        'last_dep': '23:30:00'
                    },
                    {
                        'id_prefix': 'LO_WEA_CH',
                        'stops': ['910GLIVST', '910GBTHNLGR', '910GCAMHTH', '910GLONFLDS', '910GHAKNYNM',
                                  '910GRCTRYRD', '910GSTKNWNG', '910GSTMFDHL', '910GSEVNSIS', '910GBRUCGRV',
                                  '910GWHHRTLA', '910GSIVRST', '910GEDMNGRN', '910GSBURY', '910GTURKYST',
                                  '910GTHBLDSG', '910GCHESHNT'],
                        'interval_mins': 30,
                        'first_dep': '05:45:00',
                        'last_dep': '23:45:00'
                    },
                    {
                        'id_prefix': 'LO_WEA_CF',
                        'stops': ['910GLIVST', '910GBTHNLGR', '910GCAMHTH', '910GLONFLDS', '910GHAKNYNM',
                                  '910GCLAPTON', '910GSTJMSST', '910GWLTWCEN', '910GWDST', '910GHGHMSPK',
                                  '910GCHINGFD'],
                        'interval_mins': 15,
                        'first_dep': '05:35:00',
                        'last_dep': '23:50:00'
                    }
                ],
                'windrush': [
                    {
                        'id_prefix': 'LO_WIN_WC',
                        'stops': ['910GHGHI', '910GCNNB', '910GDALS', '910GHAGGERS', '910GHOXTON',
                                  '910GSHRDHST', '910GWCHAPEL', '910GSHADWEL', '910GWAPPING', '910GRTHERHI',
                                  '910GCNDAW', '910GSURREYQ', '910GNEWXGTE', '910GBROCKLY', '910GHONROPK',
                                  '910GFORESTH', '910GSYDENHM', '910GPENEW', '910GANERLEY', '910GNORWDJ',
                                  '910GWCROYDN'],
                        'interval_mins': 15,
                        'first_dep': '05:40:00',
                        'last_dep': '23:40:00'
                    },
                    {
                        'id_prefix': 'LO_WIN_CP',
                        'stops': ['910GHGHI', '910GCNNB', '910GDALS', '910GHAGGERS', '910GHOXTON',
                                  '910GSHRDHST', '910GWCHAPEL', '910GSHADWEL', '910GWAPPING', '910GRTHERHI',
                                  '910GCNDAW', '910GSURREYQ', '910GNEWXGTE', '910GBROCKLY', '910GHONROPK',
                                  '910GFORESTH', '910GSYDENHM', '910GCRYSTLP'],
                        'interval_mins': 15,
                        'first_dep': '05:47:00',
                        'last_dep': '23:47:00'
                    },
                    {
                        'id_prefix': 'LO_WIN_CJ',
                        'stops': ['910GHGHI', '910GCNNB', '910GDALS', '910GHAGGERS', '910GHOXTON',
                                  '910GSHRDHST', '910GWCHAPEL', '910GSHADWEL', '910GWAPPING', '910GRTHERHI',
                                  '910GCNDAW', '910GSURREYQ', '910GPCKHMQD', '910GPCKHMRY', '910GDENMRKH',
                                  '910GCLPHHS', '910GWNDSWRD', '910GCLPHMJ1'],
                        'interval_mins': 15,
                        'first_dep': '05:55:00',
                        'last_dep': '23:55:00'
                    },
                    {
                        'id_prefix': 'LO_WIN_NX',
                        'stops': ['910GDALS', '910GHAGGERS', '910GHOXTON', '910GSHRDHST', '910GWCHAPEL',
                                  '910GSHADWEL', '910GWAPPING', '910GRTHERHI', '910GCNDAW', '910GSURREYQ',
                                  '910GNWCRELL'],
                        'interval_mins': 15,
                        'first_dep': '06:02:00',
                        'last_dep': '23:32:00'
                    }
                ]
            }

            line_tuesday_trips = 0
            route_list = OVERGROUND_ROUTE_CONFIGS.get(lid, [])

            for r in route_list:
                stops = r['stops']
                full_coords = []
                stop_cum_dists = [0.0]
                for i in range(len(stops) - 1):
                    u_id = stops[i]
                    v_id = stops[i+1]
                    leg_c = get_lo_track_between(u_id, v_id)
                    if not full_coords:
                        full_coords.extend(leg_c)
                    else:
                        full_coords.extend(leg_c[1:])
                    seg_dist = sum(equirect_dist_m(full_coords[j-1][0], full_coords[j-1][1], full_coords[j][0], full_coords[j][1]) for j in range(1, len(full_coords)))
                    stop_cum_dists.append(round(seg_dist, 1))

                leg_runtimes = []
                for i in range(len(stop_cum_dists) - 1):
                    d_m = stop_cum_dists[i+1] - stop_cum_dists[i]
                    leg_runtimes.append(overground_leg_runtime_s(d_m))

                for dir_id in (0, 1):
                    st_seq = stops if dir_id == 0 else list(reversed(stops))
                    shape_coords = full_coords if dir_id == 0 else list(reversed(full_coords))
                    shape_cum_dists = stop_cum_dists if dir_id == 0 else [round(stop_cum_dists[-1] - d, 1) for d in reversed(stop_cum_dists)]
                    shape_runtimes = leg_runtimes if dir_id == 0 else list(reversed(leg_runtimes))

                    shape_key = tuple(st_seq)
                    if shape_key not in unique_shape_dict:
                        shape_counter += 1
                        sid_name = f"{lid}_{dir_id}_{shape_counter}"
                        unique_shape_dict[shape_key] = (sid_name, shape_coords, shape_cum_dists)

                    assigned_shape_id, _, _ = unique_shape_dict[shape_key]

                    for sid in st_seq:
                        used_station_ids.add(sid)
                        if sid in stations_by_id:
                            stations_by_id[sid]["lines"].add(lid)

                    h0, m0, s0 = [int(x) for x in r['first_dep'].split(':')]
                    h1, m1, s1 = [int(x) for x in r['last_dep'].split(':')]
                    t_start = h0 * 3600 + m0 * 60 + s0
                    t_end = h1 * 3600 + m1 * 60 + s1
                    step_s = r['interval_mins'] * 60

                    dep = t_start
                    while dep <= t_end:
                        vj_code = f"{r['id_prefix']}_{dir_id}_{dep // 60}"
                        t_curr = dep
                        t0 = t_curr
                        stops_compact = []
                        stops_compact.append([t0, t0, shape_cum_dists[0], st_seq[0]])

                        for i, rt in enumerate(shape_runtimes):
                            t_arr = t_curr + rt
                            dwell = 25 if i < len(shape_runtimes) - 1 else 0
                            t_dep = t_arr + dwell
                            stops_compact.append([t_arr, t_dep, shape_cum_dists[i + 1], st_seq[i + 1]])
                            t_curr = t_dep

                        t1 = stops_compact[-1][0]
                        dest_station_id = st_seq[-1]
                        dest_station_name = stations_by_id.get(dest_station_id, {}).get("name", dest_station_id)

                        trip_record = {
                            "trip_id": vj_code,
                            "line_id": lid,
                            "dir_id": dir_id,
                            "shape_id": assigned_shape_id,
                            "t0": t0,
                            "t1": t1,
                            "dest_sid": dest_station_id,
                            "stops": stops_compact
                        }
                        all_trips_compact.append(trip_record)
                        line_tuesday_trips += 1

                        for sid in st_seq:
                            s_name = stations_by_id.get(sid, {}).get("name", sid)
                            station_call_counts["weekday"][s_name] += 1
                            station_call_counts["saturday"][s_name] += 1
                            station_call_counts["sunday"][s_name] += 1

                        d_key = str(dir_id)
                        if d_key not in model_trips_for_ladder[lid] or len(stops_compact) > len(model_trips_for_ladder[lid][d_key]["stops"]):
                            model_trips_for_ladder[lid][d_key] = trip_record

                        dep += step_s

            if lid == 'liberty':
                termini_by_line_dir[lid]["0"] = "Upminster"
                termini_by_line_dir[lid]["1"] = "Romford"
            elif lid == 'lioness':
                termini_by_line_dir[lid]["0"] = "Watford Junction"
                termini_by_line_dir[lid]["1"] = "London Euston"
            elif lid == 'mildmay':
                termini_by_line_dir[lid]["0"] = "Stratford"
                termini_by_line_dir[lid]["1"] = "Richmond / Clapham Junction"
            elif lid == 'suffragette':
                termini_by_line_dir[lid]["0"] = "Barking Riverside"
                termini_by_line_dir[lid]["1"] = "Gospel Oak"
            elif lid == 'weaver':
                termini_by_line_dir[lid]["0"] = "Enfield Town / Cheshunt / Chingford"
                termini_by_line_dir[lid]["1"] = "Liverpool Street"
            elif lid == 'windrush':
                termini_by_line_dir[lid]["0"] = "West Croydon / Crystal Palace / Clapham Jct"
                termini_by_line_dir[lid]["1"] = "Highbury & Islington"

            print(f"  [{lid:<16}] {line_tuesday_trips} courses le mardi, {len(unique_shape_dict)} formes cumulées")
            continue

        xml_file = tfl_lul_dir / l_conf["rep_file"]
        if not xml_file.exists():
            raise FileNotFoundError(f"Fichier TransXChange introuvable : {xml_file}")

        tree = ET.parse(xml_file)
        root = tree.getroot()

        # Dictionnaire des sections de grille horaire
        jps_links: Dict[str, List[dict]] = {}
        for jps in root.findall("txc:JourneyPatternSections/txc:JourneyPatternSection", ns):
            jps_id = jps.get("id")
            links = []
            for l in jps.findall("txc:JourneyPatternTimingLink", ns):
                fr_raw = l.find("txc:From/txc:StopPointRef", ns).text
                to_raw = l.find("txc:To/txc:StopPointRef", ns).text
                fr_sid = to_base_sid(fr_raw)
                to_sid = to_base_sid(to_raw)
                rt_s = parse_iso_duration_s(l.find("txc:RunTime", ns).text)
                links.append({
                    "from": fr_sid,
                    "to": to_sid,
                    "runtime": rt_s
                })
            jps_links[jps_id] = links

        # Dictionnaire des JourneyPatterns
        jp_definitions: Dict[str, dict] = {}
        for jp in root.findall("txc:Services/txc:Service/txc:StandardService/txc:JourneyPattern", ns):
            jp_id = jp.get("id")
            dir_str = jp.find("txc:Direction", ns).text if jp.find("txc:Direction", ns) is not None else "outbound"
            dir_id = 1 if dir_str == "inbound" else 0
            sec_refs = [r.text for r in jp.findall("txc:JourneyPatternSectionRefs", ns)]
            
            # Assemblage de la séquence complète des liens
            full_links = []
            for sref in sec_refs:
                full_links.extend(jps_links.get(sref, []))

            if not full_links:
                continue

            station_sequence = [full_links[0]["from"]] + [lnk["to"] for lnk in full_links]
            jp_definitions[jp_id] = {
                "dir_id": dir_id,
                "links": full_links,
                "station_sequence": station_sequence
            }

        # Service par défaut
        service_op = root.find("txc:Services/txc:Service/txc:OperatingProfile", ns)
        default_days = ["MondayToFriday"]
        if service_op is not None:
            default_days = [d.tag.split("}")[-1] for d in service_op.findall(".//txc:RegularDayType/txc:DaysOfWeek/*", ns)]

        # Traitement des VehicleJourneys
        line_tuesday_trips = 0
        vjs = root.findall("txc:VehicleJourneys/txc:VehicleJourney", ns)

        for vj in vjs:
            vj_code = vj.find("txc:VehicleJourneyCode", ns).text
            dep_str = vj.find("txc:DepartureTime", ns).text
            jp_ref = vj.find("txc:JourneyPatternRef", ns).text
            if jp_ref not in jp_definitions:
                continue

            jp_def = jp_definitions[jp_ref]
            dir_id = jp_def["dir_id"]
            links = jp_def["links"]
            st_seq = jp_def["station_sequence"]

            # Jours de circulation
            op = vj.find("txc:OperatingProfile", ns)
            if op is not None:
                days = [d.tag.split("}")[-1] for d in op.findall(".//txc:RegularDayType/txc:DaysOfWeek/*", ns)]
            else:
                days = default_days

            is_tuesday = ("Tuesday" in days or "MondayToFriday" in days or "MondayToSunday" in days)
            is_saturday = ("Saturday" in days or "Weekend" in days or "MondayToSunday" in days)
            is_sunday = ("Sunday" in days or "Weekend" in days or "MondayToSunday" in days)

            # Comptabilisation des arrêts pour rankings
            for sid in st_seq:
                s_name = stations_by_id.get(sid, {}).get("name", sid)
                if is_tuesday:
                    station_call_counts["weekday"][s_name] += 1
                if is_saturday:
                    station_call_counts["saturday"][s_name] += 1
                if is_sunday:
                    station_call_counts["sunday"][s_name] += 1

            if not is_tuesday:
                continue

            line_tuesday_trips += 1
            for sid in st_seq:
                used_station_ids.add(sid)
                if sid in stations_by_id:
                    stations_by_id[sid]["lines"].add(lid)

            # Résolution de la shape géométrique
            shape_key = tuple(st_seq)
            if shape_key not in unique_shape_dict:
                shape_counter += 1
                sid_name = f"{lid}_{dir_id}_{shape_counter}"
                
                # Construire la polyline physique continue
                full_coords = []
                stop_cum_dists = [0.0]

                for i in range(len(st_seq) - 1):
                    u_id = st_seq[i]
                    v_id = st_seq[i+1]
                    if lid == "tram":
                        leg_coords = get_tram_track_between(u_id, v_id)
                    else:
                        leg_coords = get_track_between(u_id, v_id)
                    if not full_coords:
                        full_coords.extend(leg_coords)
                    else:
                        full_coords.extend(leg_coords[1:])

                    # Longueur cumulée jusqu'à la station v_id
                    seg_dist = sum(equirect_dist_m(full_coords[j-1][0], full_coords[j-1][1], full_coords[j][0], full_coords[j][1]) for j in range(1, len(full_coords)))
                    stop_cum_dists.append(round(seg_dist, 1))

                unique_shape_dict[shape_key] = (sid_name, full_coords, stop_cum_dists)

            assigned_shape_id, shape_coords, stop_cum_dists = unique_shape_dict[shape_key]

            # Construction des stops compacts : [arr_s, dep_s, dist_m, sid]
            t_curr = parse_time_s(dep_str)
            t0 = t_curr
            stops_compact = []

            # Premier arrêt
            stops_compact.append([t0, t0, stop_cum_dists[0], st_seq[0]])

            for i, lnk in enumerate(links):
                rt = lnk["runtime"]
                t_arr = t_curr + rt
                # Dwell intermédiaire : 20s pour tram, 25s pour tube/dlr si arrêt régulier
                dwell = (20 if lid == "tram" else 25) if i < len(links) - 1 else 0
                t_dep = t_arr + dwell
                stops_compact.append([t_arr, t_dep, stop_cum_dists[i + 1], st_seq[i + 1]])
                t_curr = t_dep

            t1 = stops_compact[-1][0]
            dest_station_id = st_seq[-1]
            dest_station_name = stations_by_id.get(dest_station_id, {}).get("name", dest_station_id)
            termini_by_line_dir[lid][str(dir_id)] = dest_station_name

            trip_record = {
                "trip_id": vj_code,
                "line_id": lid,
                "dir_id": dir_id,
                "shape_id": assigned_shape_id,
                "t0": t0,
                "t1": t1,
                "dest_sid": dest_station_id,
                "stops": stops_compact
            }
            all_trips_compact.append(trip_record)

            # Conserver la course avec le plus d'arrêts pour le ladder
            d_key = str(dir_id)
            if d_key not in model_trips_for_ladder[lid] or len(stops_compact) > len(model_trips_for_ladder[lid][d_key]["stops"]):
                model_trips_for_ladder[lid][d_key] = trip_record

        if lid == 'tram':
            termini_by_line_dir[lid]["0"] = "Wimbledon"
            termini_by_line_dir[lid]["1"] = "Beckenham Jct / Elmers End / New Addington"

        print(f"  [{lid:<16}] {line_tuesday_trips} courses le mardi, {len(unique_shape_dict)} formes cumulées")

    print(f"[london-ingest] Total stations utilisées : {len(used_station_ids)}")
    print(f"[london-ingest] Total courses mardi : {len(all_trips_compact)}")
    print(f"[london-ingest] Total formes shapes : {len(unique_shape_dict)}")

    # =========================================================================
    # Étape A : Génération de stations.json
    # =========================================================================
    # Relier les correspondances entre stations jumelles rail / métro / tram
    HUB_TWIN_STATIONS = [
        ('910GHGHI', '940GZZLUHAI'),
        ('910GEUSTON', '940GZZLUEUS'),
        ('910GCNDAW', '940GZZLUCWR'),
        ('910GBLCHSRD', '940GZZLUBLR'),
        ('910GBARKING', '940GZZLUBKG'),
        ('910GSHPDSB', '940GZZLUSBH'),
        ('940GZZCRWMB', '940GZZLUWIM'),
        ('940GZZCRWCR', '910GWCROYDN'),
    ]
    for r_sid, t_sid in HUB_TWIN_STATIONS:
        if r_sid in stations_by_id and t_sid in stations_by_id:
            union_lines = stations_by_id[r_sid]["lines"] | stations_by_id[t_sid]["lines"]
            stations_by_id[r_sid]["lines"] = set(union_lines)
            stations_by_id[t_sid]["lines"] = set(union_lines)

    stations_list = []
    for sid in sorted(list(used_station_ids)):
        if sid in stations_by_id:
            st = stations_by_id[sid]
            clean_name = st["name"].replace(" (Rail)", "").strip()
            stations_list.append({
                "id": st["id"],
                "name": clean_name,
                "coordinates": st["coordinates"],
                "lines": sorted(list(st["lines"]))
            })

    stations_list.sort(key=lambda s: s["name"])
    print(f"[london-ingest] Écriture de stations.json ({len(stations_list)} stations)")
    with open(output_dir / "stations.json", "w", encoding="utf-8") as f:
        json.dump(stations_list, f, indent=2, ensure_ascii=False)

    # Index des stations pour schedule.json
    unique_station_names = sorted(list(set(s["name"] for s in stations_list)))
    name_to_idx = {name: idx for idx, name in enumerate(unique_station_names)}
    sid_to_name = {s["id"]: s["name"] for s in stations_list}

    # =========================================================================
    # Étape B : Rééchantillonnage métrique et shapes.bin (Format SHP2)
    # =========================================================================
    STEP_M = 10.0
    resampled_shapes: List[ResampledShape] = []

    for shape_key, (sid_name, coords, _) in sorted(unique_shape_dict.items(), key=lambda item: item[1][0]):
        # Distances cumulées des sommets bruts
        raw_cum_dists = [0.0]
        for i in range(1, len(coords)):
            d = equirect_dist_m(coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1])
            raw_cum_dists.append(raw_cum_dists[-1] + d)

        total_len = raw_cum_dists[-1]

        # Rééchantillonner à pas régulier STEP_M
        resampled_coords: List[Tuple[float, float]] = [coords[0]]
        cur_d = STEP_M
        seg_idx = 0
        while cur_d < total_len:
            while seg_idx < len(coords) - 1 and raw_cum_dists[seg_idx + 1] < cur_d:
                seg_idx += 1
            if seg_idx >= len(coords) - 1:
                break
            seg_len = raw_cum_dists[seg_idx + 1] - raw_cum_dists[seg_idx]
            t = (cur_d - raw_cum_dists[seg_idx]) / seg_len if seg_len > 0 else 0.0
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
                shape_id=sid_name,
                coords=resampled_coords,
                step=STEP_M,
                tail_length=round(tail_len, 3)
            )
        )

    print(f"[london-ingest] Écriture de shapes.bin ({len(resampled_shapes)} tracés rééchantillonnés)")
    write_shapes_v2(resampled_shapes, output_dir / "shapes.bin")

    # =========================================================================
    # Étape C : Génération de lines.json
    # =========================================================================
    lines_json_list = []
    line_name_to_hex = {l["short_name"]: l["color"] for l in LINE_CONFIGS}

    for l_conf in LINE_CONFIGS:
        lid = l_conf["id"]
        # Longueur mesurée maximale parmi les tracés de cette ligne
        line_shapes = [item[1] for k, item in unique_shape_dict.items() if item[0].startswith(f"{lid}_")]
        max_len_km = 0.0
        if line_shapes:
            lens = [sum(equirect_dist_m(s[i-1][0], s[i-1][1], s[i][0], s[i][1]) for i in range(1, len(s))) for s in line_shapes]
            max_len_km = round(max(lens) / 1000.0, 2)

        lines_json_list.append({
            "id": lid,
            "short_name": l_conf["short_name"],
            "long_name": l_conf["long_name"],
            "color": l_conf["color"],
            "text_color": l_conf["text_color"],
            "mode": l_conf.get("mode", "tube"),
            "destinations": termini_by_line_dir.get(lid, {"0": "Terminus", "1": "Origin"}),
            "measured_length_km": max_len_km,
            "elevation_offset": l_conf["elevation_offset"]
        })

    print(f"[london-ingest] Écriture de lines.json ({len(lines_json_list)} lignes)")
    with open(output_dir / "lines.json", "w", encoding="utf-8") as f:
        json.dump(lines_json_list, f, indent=2, ensure_ascii=False)

    # =========================================================================
    # Étape D : Génération de tracks.json (Option 1 : voie physique unique partagée)
    # =========================================================================
    line_short_to_id = {l["short_name"]: l["id"] for l in LINE_CONFIGS}
    tracks_list = []

    for seg in physical_segments_for_tracks:
        p_name = seg["primary_line"]
        lid = line_short_to_id.get(p_name, "tube")
        hex_c = line_name_to_hex.get(p_name, "#555555")
        stroke = compute_darkened_contrast_color(hex_c, min_contrast=3.0)

        tracks_list.append({
            "line_id": lid,
            "short_name": p_name,
            "stroke": stroke,
            "coordinates": seg["coordinates"]
        })

    print(f"[london-ingest] Écriture de tracks.json ({len(tracks_list)} segments physiques)")
    with open(output_dir / "tracks.json", "w", encoding="utf-8") as f:
        json.dump(tracks_list, f, separators=(",", ":"))

    # =========================================================================
    # Étape E : Génération de schedule.json
    # =========================================================================
    schedule_trips = []
    for tr in all_trips_compact:
        dest_name = sid_to_name.get(tr["dest_sid"], tr["dest_sid"])
        dest_idx = name_to_idx.get(dest_name, 0)
        
        stops_payload = []
        for s in tr["stops"]:
            s_name = sid_to_name.get(s[3], s[3])
            s_idx = name_to_idx.get(s_name, 0)
            stops_payload.append([s[0], s[1], s[2], s_idx])

        schedule_trips.append([
            tr["trip_id"],
            tr["line_id"],
            tr["dir_id"],
            tr["shape_id"],
            tr["t0"],
            tr["t1"],
            dest_idx,
            stops_payload
        ])

    schedule_trips.sort(key=lambda t: (t[4], t[0]))
    schedule_artifact = {
        "stations": unique_station_names,
        "trips": schedule_trips
    }
    print(f"[london-ingest] Écriture de schedule.json ({len(schedule_trips)} courses)")
    with open(output_dir / "schedule.json", "w", encoding="utf-8") as f:
        json.dump(schedule_artifact, f, separators=(",", ":"))

    # =========================================================================
    # Étape F : Génération de line_ladders.json (Thermomètre de ligne)
    # =========================================================================
    ladders_dict: Dict[str, dict] = {}
    lines_meta_dict = {l["id"]: l for l in lines_json_list}

    for l_conf in LINE_CONFIGS:
        lid = l_conf["id"]
        dirs_dict: Dict[str, dict] = {}

        for d in ("0", "1"):
            model_tr = model_trips_for_ladder[lid].get(d)
            if not model_tr:
                continue

            origin_sid = model_tr["stops"][0][3]
            terminus_sid = model_tr["stops"][-1][3]
            origin_name = sid_to_name.get(origin_sid, origin_sid)
            terminus_name = sid_to_name.get(terminus_sid, terminus_sid)

            stations_ladder = []
            for st_entry in model_tr["stops"]:
                sid = st_entry[3]
                s_meta = stations_by_id.get(sid, {})
                s_name = s_meta.get("name", sid)
                lines_here = s_meta.get("lines", set())
                
                transfers = []
                for other_lid in sorted(list(lines_here)):
                    if other_lid != lid and other_lid in lines_meta_dict:
                        o_meta = lines_meta_dict[other_lid]
                        transfers.append({
                            "id": other_lid,
                            "short_name": o_meta["short_name"],
                            "color": o_meta["color"],
                            "text_color": o_meta["text_color"]
                        })

                stations_ladder.append({
                    "id": sid,
                    "name": s_name,
                    "distance_m": st_entry[2],
                    "coordinates": s_meta.get("coordinates", [0.0, 0.0]),
                    "is_hub": len(transfers) > 0,
                    "transfers": transfers
                })

            dirs_dict[d] = {
                "origin": origin_name,
                "terminus": terminus_name,
                "stations": stations_ladder
            }

        ladders_dict[lid] = {
            "id": lid,
            "short_name": l_conf["short_name"],
            "color": l_conf["color"],
            "text_color": l_conf["text_color"],
            "directions": dirs_dict
        }

    print(f"[london-ingest] Écriture de line_ladders.json ({len(ladders_dict)} lignes)")
    with open(output_dir / "line_ladders.json", "w", encoding="utf-8") as f:
        json.dump(ladders_dict, f, indent=2, ensure_ascii=False)

    # =========================================================================
    # Étape G : Génération de station-rankings.json
    # =========================================================================
    rankings_artifact = {
        "weekday": [{"name": k, "count": v} for k, v in station_call_counts["weekday"].most_common()],
        "saturday": [{"name": k, "count": v} for k, v in station_call_counts["saturday"].most_common()],
        "sunday": [{"name": k, "count": v} for k, v in station_call_counts["sunday"].most_common()]
    }
    print("[london-ingest] Écriture de station-rankings.json")
    with open(output_dir / "station-rankings.json", "w", encoding="utf-8") as f:
        json.dump(rankings_artifact, f, indent=2, ensure_ascii=False)

    # =========================================================================
    # Étape H : sections.json (Deep Tube vs Sub-surface)
    # =========================================================================
    sections_artifact = {
        "schema_version": 1,
        "source": {
            "provider": "Transport for London",
            "classification": {
                "deep_tube": "Lignes profondes en tunnel foré circulaire (Bakerloo, Central, Jubilee, Northern, Piccadilly, Victoria, Waterloo & City)",
                "sub_surface": "Lignes sub-surface à gabarit ferroviaire large (Circle, District, Hammersmith & City, Metropolitan)",
                "light_rail": "Réseau de métro léger automatique sur viaduc et surface (Docklands Light Railway)",
                "crossrail": "Ligne ferroviaire régionale à grande capacité est-ouest (Elizabeth line / Crossrail)",
                "overground": "Réseau ferroviaire suburbain de surface London Overground (Liberty, Lioness, Mildmay, Suffragette, Weaver, Windrush)",
                "tram": "Réseau de tramway urbain en voirie et site propre (London Trams / Tramlink)"
            }
        },
        "summary": {
            "deep_level_lines": 7,
            "sub_surface_lines": 4,
            "light_rail_lines": 1,
            "crossrail_lines": 1,
            "overground_lines": 6,
            "tram_lines": 1,
            "total_lines": 20,
            "network_type": "Tube, Sub-surface, Light Rail (DLR), Elizabeth line, London Overground & London Trams"
        }
    }
    with open(output_dir / "sections.json", "w", encoding="utf-8") as f:
        json.dump(sections_artifact, f, indent=2, ensure_ascii=False)

    # =========================================================================
    # Étape I : feed_fingerprint.json
    # =========================================================================
    fingerprint_artifact = {
        "url": "https://tfl.gov.uk/tfl/syndication/feeds/journey-planner-timetables.zip",
        "source": "Transport for London (TfL Open Data Licence) & Oliver O'Brien / OpenStreetMap contributors (ODbL)",
        "dataset": "LULDLRTRAMRIVERCABLE FULL 21092026.zip",
        "generated_at": "2026-09-25",
        "service_date": "2026-10-06"
    }
    with open(output_dir / "feed_fingerprint.json", "w", encoding="utf-8") as f:
        json.dump(fingerprint_artifact, f, indent=2, ensure_ascii=False)

    # =========================================================================
    # Étape J : Miroir vers web_dir
    # =========================================================================
    if web_dir:
        print(f"[london-ingest] Copie miroir des artefacts vers {web_dir}...")
        for fname in [
            "lines.json", "stations.json", "shapes.bin", "schedule.json",
            "tracks.json", "line_ladders.json", "station-rankings.json",
            "sections.json", "feed_fingerprint.json", "rolling-stock.json"
        ]:
            src_f = output_dir / fname
            if src_f.exists():
                shutil.copy2(src_f, web_dir / fname)

    print("✅ Ingestion de Londres terminée avec succès !")

if __name__ == "__main__":
    build_london_artifacts()
