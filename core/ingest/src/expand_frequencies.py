"""
expand_frequencies.py — Développement des fréquences GTFS en courses discrètes

Transforme les courses modèles et les blocs de frequencies.txt en instances concrètes
indiscernables d'une grille horaire théorique explicite (ex: Paris IDFM).

Règles impératives (§5.1 du cahier des charges) :
1. Calcul des offsets relatifs par rapport au premier départ de la course modèle.
2. Borne STRICTEMENT INFÉRIEURE : t_dep < end_time (l'égalité à end_time produirait
   un doublon systématique à chaque frontière de bloc horaire).
3. Heures absolues = heure de départ de l'instance + offsets relatifs.
4. Déduplication déterministe sur clé (service_id, trip_id, dep_time).
5. Identifiants stables et reproductibles : {template_trip_id}__f{dep_time}.
6. Traitement des heures > 24:00:00 rattachées au jour de service (secondes depuis minuit).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)


def parse_gtfs_time_to_seconds(time_str: str) -> int:
    """
    Convertit un horaire GTFS (HH:MM:SS) en secondes depuis le minuit de service.
    Supporte les heures supérieures à 24 (ex: 25:30:00 -> 91800 s).
    """
    parts = time_str.strip().split(":")
    if len(parts) != 3:
        raise ValueError(f"Format d'horaire GTFS invalide: {time_str}")
    h, m, s = int(parts[0]), int(parts[1]), int(parts[2])
    return h * 3600 + m * 60 + s


def format_seconds_to_gtfs_time(seconds: int) -> str:
    """Convertit un total de secondes depuis minuit en chaîne HH:MM:SS."""
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60
    return f"{h:02d}:{m:02d}:{s:02d}"


@dataclass
class FrequencyBlock:
    trip_id: str
    start_time_s: int
    end_time_s: int
    headway_secs: int
    exact_times: int = 0


@dataclass
class TemplateStopTime:
    stop_id: str
    stop_sequence: int
    arrival_offset_s: int
    departure_offset_s: int
    shape_dist_traveled: Optional[float] = None


@dataclass
class ExpandedTrip:
    trip_id: str
    template_trip_id: str
    service_id: str
    route_id: str
    direction_id: int
    shape_id: str
    start_departure_s: int
    end_arrival_s: int
    stop_times: List[Tuple[int, int, str, int, Optional[float]]]
    # (arrival_s, departure_s, stop_id, stop_sequence, dist_m)


@dataclass
class ExpansionStats:
    template_trips_count: int = 0
    frequency_blocks_count: int = 0
    instances_generated: int = 0
    duplicates_discarded: int = 0
    instances_retained: int = 0


def build_stop_time_offsets(
    stop_times_for_trip: List[dict],
) -> List[TemplateStopTime]:
    """
    Calcule les offsets relatifs (en secondes) de chaque arrêt par rapport
    au premier départ de la course.
    """
    sorted_stops = sorted(stop_times_for_trip, key=lambda s: int(s["stop_sequence"]))
    if not sorted_stops:
        return []

    first_dep_s = parse_gtfs_time_to_seconds(sorted_stops[0]["departure_time"])

    offsets: List[TemplateStopTime] = []
    for row in sorted_stops:
        arr_s = parse_gtfs_time_to_seconds(row["arrival_time"])
        dep_s = parse_gtfs_time_to_seconds(row["departure_time"])
        dist = (
            float(row["shape_dist_traveled"])
            if "shape_dist_traveled" in row and row["shape_dist_traveled"] != ""
            else None
        )
        offsets.append(
            TemplateStopTime(
                stop_id=row["stop_id"],
                stop_sequence=int(row["stop_sequence"]),
                arrival_offset_s=arr_s - first_dep_s,
                departure_offset_s=dep_s - first_dep_s,
                shape_dist_traveled=dist,
            )
        )
    return offsets


def expand_frequencies(
    trips: List[dict],
    stop_times: List[dict],
    frequencies: List[dict],
) -> Tuple[List[ExpandedTrip], ExpansionStats]:
    """
    Développe l'ensemble des blocs frequencies.txt en courses individuelles.
    
    Retourne la liste des courses développées et les statistiques d'expansion.
    """
    stats = ExpansionStats()

    stop_times_by_trip: Dict[str, List[dict]] = {}
    for st in stop_times:
        stop_times_by_trip.setdefault(st["trip_id"], []).append(st)

    trips_by_id = {t["trip_id"]: t for t in trips}

    template_offsets: Dict[str, List[TemplateStopTime]] = {}
    for trip_id, st_list in stop_times_by_trip.items():
        template_offsets[trip_id] = build_stop_time_offsets(st_list)

    blocks_by_trip: Dict[str, List[FrequencyBlock]] = {}
    for f in frequencies:
        t_id = f["trip_id"]
        blocks_by_trip.setdefault(t_id, []).append(
            FrequencyBlock(
                trip_id=t_id,
                start_time_s=parse_gtfs_time_to_seconds(f["start_time"]),
                end_time_s=parse_gtfs_time_to_seconds(f["end_time"]),
                headway_secs=int(f["headway_secs"]),
                exact_times=int(f.get("exact_times", 0) or 0),
            )
        )

    stats.template_trips_count = len(blocks_by_trip)
    stats.frequency_blocks_count = sum(len(b) for b in blocks_by_trip.values())

    seen_instances: Set[Tuple[str, str, int]] = set()
    expanded_trips: List[ExpandedTrip] = []

    for trip_id, blocks in blocks_by_trip.items():
        trip_meta = trips_by_id.get(trip_id)
        if not trip_meta:
            logger.warning("trip_id %s présent dans frequencies.txt mais absent de trips.txt", trip_id)
            continue

        offsets = template_offsets.get(trip_id, [])
        if not offsets:
            logger.warning("trip_id %s sans arrêts dans stop_times.txt", trip_id)
            continue

        service_id = trip_meta.get("service_id", "")
        route_id = trip_meta.get("route_id", "")
        direction_id = int(trip_meta.get("direction_id", 0) or 0)
        shape_id = trip_meta.get("shape_id", "")

        for block in blocks:
            dep_s = block.start_time_s
            headway = block.headway_secs
            if headway <= 0:
                logger.error("headway_secs <= 0 pour trip_id %s : ignoré", trip_id)
                continue

            # =========================================================================
            # BORNE STRICTE : dep_s < block.end_time_s
            # Conformément au standard GTFS et au cahier des charges §5.1, l'heure de départ
            # doit être STRICTEMENT INFÉRIEURE à end_time. L'inclusion (<=) engendrerait
            # un doublon systématique sur les frontières de tranches horaires contiguës.
            # =========================================================================
            while dep_s < block.end_time_s:
                stats.instances_generated += 1

                dedup_key = (service_id, trip_id, dep_s)
                if dedup_key in seen_instances:
                    stats.duplicates_discarded += 1
                    dep_s += headway
                    continue

                seen_instances.add(dedup_key)

                instance_trip_id = f"{trip_id}__f{dep_s}"

                instance_stop_times: List[Tuple[int, int, str, int, Optional[float]]] = []
                for off in offsets:
                    arr_time = dep_s + off.arrival_offset_s
                    dep_time = dep_s + off.departure_offset_s
                    instance_stop_times.append(
                        (arr_time, dep_time, off.stop_id, off.stop_sequence, off.shape_dist_traveled)
                    )

                start_dep = instance_stop_times[0][1]
                end_arr = instance_stop_times[-1][0]

                expanded_trips.append(
                    ExpandedTrip(
                        trip_id=instance_trip_id,
                        template_trip_id=trip_id,
                        service_id=service_id,
                        route_id=route_id,
                        direction_id=direction_id,
                        shape_id=shape_id,
                        start_departure_s=start_dep,
                        end_arrival_s=end_arr,
                        stop_times=instance_stop_times,
                    )
                )

                dep_s += headway

    expanded_trips.sort(key=lambda t: (t.start_departure_s, t.trip_id))
    stats.instances_retained = len(expanded_trips)

    logger.info(
        "Développement des fréquences terminé : %d générées, %d doublons écartés, %d retenues",
        stats.instances_generated,
        stats.duplicates_discarded,
        stats.instances_retained,
    )

    return expanded_trips, stats
