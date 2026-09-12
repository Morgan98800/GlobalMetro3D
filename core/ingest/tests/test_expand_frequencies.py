"""
test_expand_frequencies.py — Tests unitaires pour l'expansion des fréquences GTFS
"""

import pytest
from core.ingest.src.expand_frequencies import (
    expand_frequencies,
    parse_gtfs_time_to_seconds,
    format_seconds_to_gtfs_time,
)


def test_parse_and_format_time():
    assert parse_gtfs_time_to_seconds("00:00:00") == 0
    assert parse_gtfs_time_to_seconds("08:30:15") == 8 * 3600 + 30 * 60 + 15
    assert parse_gtfs_time_to_seconds("24:15:00") == 24 * 3600 + 15 * 60
    assert parse_gtfs_time_to_seconds("25:48:00") == 25 * 3600 + 48 * 60
    assert format_seconds_to_gtfs_time(92880) == "25:48:00"


def test_strict_end_time_boundary():
    """
    Vérifie la borne stricte : t_dep < end_time.
    Une plage 06:00 à 07:00 avec headway 600s doit produire exactement 6 instances,
    et AUCUNE instance à 07:00:00.
    """
    trips = [
        {
            "trip_id": "T_M1",
            "route_id": "1",
            "service_id": "SEM",
            "direction_id": "0",
            "shape_id": "shp_1",
        }
    ]
    stop_times = [
        {
            "trip_id": "T_M1",
            "stop_id": "ST_A",
            "stop_sequence": "1",
            "arrival_time": "06:00:00",
            "departure_time": "06:00:00",
            "shape_dist_traveled": "0.0",
        },
        {
            "trip_id": "T_M1",
            "stop_id": "ST_B",
            "stop_sequence": "2",
            "arrival_time": "06:03:00",
            "departure_time": "06:03:30",
            "shape_dist_traveled": "1500.0",
        },
    ]
    frequencies = [
        {
            "trip_id": "T_M1",
            "start_time": "06:00:00",
            "end_time": "07:00:00",
            "headway_secs": "600",
        }
    ]

    expanded, stats = expand_frequencies(trips, stop_times, frequencies)

    # Doit avoir 6 départs : 06:00, 06:10, 06:20, 06:30, 06:40, 06:50
    assert len(expanded) == 6
    assert stats.instances_generated == 6
    assert stats.duplicates_discarded == 0
    assert stats.instances_retained == 6

    dep_times = [t.start_departure_s for t in expanded]
    assert dep_times == [
        21600,         # 06:00
        21600 + 600,   # 06:10
        21600 + 1200,  # 06:20
        21600 + 1800,  # 06:30
        21600 + 2400,  # 06:40
        21600 + 3000,  # 06:50
    ]
    # L'heure limite 07:00:00 (25200s) ne doit pas être incluse
    assert 25200 not in dep_times


def test_contiguous_blocks_no_boundary_duplicate():
    """
    Vérifie que deux blocs contigus (06:00->07:00 puis 07:00->08:00)
    ne créent aucun doublon à 07:00:00.
    """
    trips = [
        {"trip_id": "T1", "route_id": "1", "service_id": "S1", "direction_id": "0", "shape_id": "S1"}
    ]
    stop_times = [
        {"trip_id": "T1", "stop_id": "A", "stop_sequence": "1", "arrival_time": "06:00:00", "departure_time": "06:00:00"},
        {"trip_id": "T1", "stop_id": "B", "stop_sequence": "2", "arrival_time": "06:05:00", "departure_time": "06:05:00"},
    ]
    frequencies = [
        {"trip_id": "T1", "start_time": "06:00:00", "end_time": "07:00:00", "headway_secs": "600"},
        {"trip_id": "T1", "start_time": "07:00:00", "end_time": "08:00:00", "headway_secs": "300"},
    ]

    expanded, stats = expand_frequencies(trips, stop_times, frequencies)

    # Bloc 1 (6 départs) + Bloc 2 (12 départs) = 18 départs
    assert len(expanded) == 18
    assert stats.duplicates_discarded == 0

    # Vérifie qu'il n'y a exactement qu'un seul départ à 07:00:00
    dep_0700 = [t for t in expanded if t.start_departure_s == 7 * 3600]
    assert len(dep_0700) == 1


def test_overlapping_blocks_deduplication():
    """
    Vérifie la déduplication obligatoire si deux blocs se chevauchent.
    """
    trips = [
        {"trip_id": "T1", "route_id": "1", "service_id": "S1", "direction_id": "0", "shape_id": "S1"}
    ]
    stop_times = [
        {"trip_id": "T1", "stop_id": "A", "stop_sequence": "1", "arrival_time": "06:00:00", "departure_time": "06:00:00"},
    ]
    # Blocs qui se chevauchent à 06:10:00
    frequencies = [
        {"trip_id": "T1", "start_time": "06:00:00", "end_time": "06:20:00", "headway_secs": "600"},
        {"trip_id": "T1", "start_time": "06:10:00", "end_time": "06:30:00", "headway_secs": "600"},
    ]

    expanded, stats = expand_frequencies(trips, stop_times, frequencies)

    # Bloc 1: 06:00, 06:10
    # Bloc 2: 06:10 (doublon écarté !), 06:20
    assert stats.duplicates_discarded == 1
    assert len(expanded) == 3
    dep_times = [t.start_departure_s for t in expanded]
    assert dep_times == [21600, 22200, 22800]


def test_post_midnight_service_hours():
    """
    Vérifie les départs > 24:00:00 (jour de service).
    """
    trips = [
        {"trip_id": "T_NIGHT", "route_id": "2", "service_id": "S1", "direction_id": "1", "shape_id": "S2"}
    ]
    stop_times = [
        {"trip_id": "T_NIGHT", "stop_id": "A", "stop_sequence": "1", "arrival_time": "23:50:00", "departure_time": "23:50:00"},
        {"trip_id": "T_NIGHT", "stop_id": "B", "stop_sequence": "2", "arrival_time": "24:10:00", "departure_time": "24:10:00"},
    ]
    frequencies = [
        {"trip_id": "T_NIGHT", "start_time": "23:50:00", "end_time": "25:30:00", "headway_secs": "1200"},
    ]

    expanded, stats = expand_frequencies(trips, stop_times, frequencies)

    # 23:50 (85800), 24:10 (87000), 24:30 (88200), 24:50 (89400), 25:10 (90600) -> 5 courses
    assert len(expanded) == 5
    assert all(t.trip_id.startswith("T_NIGHT__f") for t in expanded)
    # Vérifie le décalage relatif du 2ème arrêt (+20 minutes = +1200s)
    for trip in expanded:
        arr_stop2 = trip.stop_times[1][0]
        dep_stop1 = trip.start_departure_s
        assert arr_stop2 - dep_stop1 == 1200
