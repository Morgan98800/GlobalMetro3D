"""
Acceptance Tests for Phase 1 (RER E Geometry) — Metro & RER Parisien 3D

Contract:
1. File format: SHP2 header, version 2, exactly 14 shapes for RER E.
2. Invariant 1: Distance table strictly increasing for every shape.
3. Invariant 2: tail segment length in [0, step) for every shape.
4. Invariant 3: |final_dist - geometric_length| / geometric_length < 0.5% for every shape.
5. Invariant 4: |mean_spacing - step| / step < 2% for every shape.
6. Roundtrip accuracy: max coordinate drift < 0.02 m.
7. End-to-end station alignment: for 5 representative stations along RER E,
   distance(stations.json.coord, coordAtDistance(shape, distance_m)) < 50 m.
"""

import json
import math
import os
from pathlib import Path
import pytest

from core.ingest.tests.test_acceptance_phase_a import TestPhaseAAcceptance
from core.ingest.src.project import project_single_point_constrained, wgs84_to_local_xy
import numpy as np

ROOT = Path(__file__).resolve().parents[3]


class TestPhase1RERAcceptance:

    @pytest.fixture(scope="class")
    def rer_shapes_data(self):
        bin_path = ROOT / "web" / "public" / "data" / "rer_shapes.bin"
        assert bin_path.exists(), f"RER shapes file missing: {bin_path}"
        shapes = TestPhaseAAcceptance._read_shp2(str(bin_path))
        return shapes

    def test_criterion_1_all_rer_shape_count(self, rer_shapes_data):
        """Phase 5: rer_shapes.bin must contain 250 shapes for all 5 RER lines (including RER E)."""
        assert len(rer_shapes_data) == 250, f"Expected 250 RER shapes, got {len(rer_shapes_data)}"
        for sid in rer_shapes_data:
            assert sid.startswith("IDFM:shp_2_"), f"Unexpected shape_id prefix: {sid}"

    def test_criterion_2_shp2_distance_contract(self, rer_shapes_data):
        """Every RER E shape must strictly adhere to the SHP2 distance contract."""
        for shape_id, shape in rer_shapes_data.items():
            coords = shape["coords"]
            step = shape["step"]
            tail = shape["tail"]

            assert step > 0, f"{shape_id}: invalid step {step}"
            assert 0.0 <= tail < step + 1e-4, f"{shape_id}: invalid tail {tail} for step {step}"

            geometric_length = sum(TestPhaseAAcceptance._distance_m(a, b) for a, b in zip(coords, coords[1:]))
            final_distance = (len(coords) - 2) * step + tail

            distances = [0.0]
            distances.extend(i * step for i in range(1, len(coords) - 1))
            distances.append(final_distance)

            # Invariant 1: Strictly increasing
            assert all(b > a for a, b in zip(distances, distances[1:])), f"{shape_id}: distances not strictly increasing"
            assert final_distance > 0, f"{shape_id}: non-positive final distance"

            # Invariant 3: Difference between final distance and geometric length < 0.5%
            geom_err = abs(final_distance - geometric_length) / geometric_length
            assert geom_err < 0.005, f"{shape_id}: geometric length error {geom_err:.4%} >= 0.5%"

            # Invariant 4: Mean spacing on regular points within 2% of step
            regular_length = sum(TestPhaseAAcceptance._distance_m(a, b) for a, b in zip(coords[:-2], coords[1:-1]))
            mean_spacing = regular_length / (len(coords) - 2)
            spacing_err = abs(mean_spacing - step) / step
            assert spacing_err < 0.02, f"{shape_id}: mean spacing error {spacing_err:.4%} >= 2%"

    def test_criterion_3_station_positions_match_five_stations_on_rer_e(self, rer_shapes_data):
        """Station coordinates in stations.json must match within 50m of the projected shape."""
        stations_path = ROOT / "web" / "public" / "data" / "stations.json"
        with open(stations_path, encoding="utf-8") as f:
            stations = json.load(f)

        stations_by_name = {s["name"]: s for s in stations}

        # 5 representative stations across RER E (central trunk & Chelles branch)
        test_cases = [
            ("Haussmann Saint-Lazare", "IDFM:shp_2_418"),
            ("Magenta", "IDFM:shp_2_418"),
            ("Rosa Parks", "IDFM:shp_2_413"),
            ("Pantin", "IDFM:shp_2_413"),
            ("Chelles - Gournay", "IDFM:shp_2_413"),
        ]

        for station_name, shape_id in test_cases:
            station = stations_by_name.get(station_name)
            assert station is not None, f"Station '{station_name}' missing from stations.json"

            shape = rer_shapes_data[shape_id]
            coords = np.array(shape["coords"])
            step = shape["step"]
            tail = shape["tail"]
            last_dist = (len(coords) - 2) * step + tail
            distances = np.array([0.0] + [i * step for i in range(1, len(coords) - 1)] + [last_dist])
            shape_xy = np.array([wgs84_to_local_xy(p[0], p[1]) for p in coords])

            st_xy = wgs84_to_local_xy(*station["coordinates"])
            curv_dist, offset_m, _ = project_single_point_constrained(st_xy, shape_xy, distances)

            # Re-evaluate position along shape at curv_dist
            actual_coord = TestPhaseAAcceptance._coord_at_distance(shape, curv_dist)
            error_m = TestPhaseAAcceptance._distance_m(station["coordinates"], actual_coord)

            print(f"[test] {station_name} on {shape_id}: curv_dist={curv_dist:.1f}m, error={error_m:.1f}m")
            assert error_m < 50.0, f"Station {station_name} error {error_m:.1f}m exceeds 50m tolerance on {shape_id}"


class TestPhase2RERScheduleAcceptance:

    @pytest.fixture(scope="class")
    def schedule_data(self):
        rer_sched_path = ROOT / "web" / "public" / "data" / "rer_schedule.json"
        metro_sched_path = ROOT / "web" / "public" / "data" / "schedule.json"
        rer_shapes_path = ROOT / "web" / "public" / "data" / "rer_shapes.bin"

        assert rer_sched_path.exists(), f"rer_schedule.json missing: {rer_sched_path}"
        assert metro_sched_path.exists(), f"schedule.json missing: {metro_sched_path}"
        assert rer_shapes_path.exists(), f"rer_shapes.bin missing: {rer_shapes_path}"

        with open(rer_sched_path, "r", encoding="utf-8") as f:
            rer_sched = json.load(f)
        with open(metro_sched_path, "r", encoding="utf-8") as f:
            metro_sched = json.load(f)

        rer_shapes = TestPhaseAAcceptance._read_shp2(str(rer_shapes_path))

        return {
            "rer_sched": rer_sched,
            "metro_sched": metro_sched,
            "rer_shapes": rer_shapes,
        }

    def test_criterion_1_all_rer_schedule_format_and_count(self, schedule_data):
        """rer_schedule.json must match schedule.json schema with exactly 2613 trips across 5 RER lines."""
        rer_sched = schedule_data["rer_sched"]
        assert "stations" in rer_sched and "trips" in rer_sched
        trips = rer_sched["trips"]
        assert len(trips) == 2613, f"Expected 2613 active trips across all 5 RER lines, got {len(trips)}"

        expected_counts = {
            "IDFM:C01742": 635,  # A
            "IDFM:C01743": 547,  # B
            "IDFM:C01727": 489,  # C
            "IDFM:C01728": 528,  # D
            "IDFM:C01729": 414,  # E
        }
        actual_counts = {k: 0 for k in expected_counts}

        for trip in trips:
            assert len(trip) == 8, f"Trip tuple length must be 8, got {len(trip)}"
            trip_id, line_id, direction_id, shape_id, start_s, end_s, terminus_idx, stops = trip
            assert line_id in expected_counts, f"Unexpected line_id: {line_id}"
            actual_counts[line_id] += 1
            assert direction_id in (0, 1)
            assert start_s < end_s, f"{trip_id}: start_s {start_s} >= end_s {end_s}"
            assert len(stops) >= 2, f"{trip_id}: less than 2 stops"

        for line_id, exp_count in expected_counts.items():
            assert actual_counts[line_id] == exp_count, f"{line_id}: expected {exp_count} trips, got {actual_counts[line_id]}"

    def test_criterion_2_disjoint_index_space(self, schedule_data):
        """Station indices in rer_schedule must be strictly disjoint from metro indices."""
        metro_sched = schedule_data["metro_sched"]
        rer_sched = schedule_data["rer_sched"]

        metro_indices = set()
        for t in metro_sched["trips"]:
            metro_indices.add(t[6])
            for s in t[7]:
                metro_indices.add(s[3])

        offset = max(metro_indices) + 1

        rer_indices = set()
        for t in rer_sched["trips"]:
            rer_indices.add(t[6])
            for s in t[7]:
                rer_indices.add(s[3])

        assert min(rer_indices) >= offset, f"Min RER index {min(rer_indices)} < offset {offset}"
        assert metro_indices.isdisjoint(rer_indices), "Collision detected between metro and RER station indices!"

        # Ensure stations array can be directly indexed by station_index
        for idx in rer_indices:
            assert idx < len(rer_sched["stations"]), f"Station index {idx} exceeds stations array length {len(rer_sched['stations'])}"
            name = rer_sched["stations"][idx]
            assert isinstance(name, str) and len(name) > 0, f"Invalid station name at index {idx}"

    def test_criterion_3_monotonic_and_bounded_distances(self, schedule_data):
        """For 100% of all 2613 RER trips, stop distances must be strictly increasing and within shape bounds."""
        rer_sched = schedule_data["rer_sched"]
        rer_shapes = schedule_data["rer_shapes"]

        shape_lengths = {}
        for sid, s in rer_shapes.items():
            shape_lengths[sid] = (len(s["coords"]) - 2) * s["step"] + s["tail"]

        for trip in rer_sched["trips"]:
            trip_id = trip[0]
            shape_id = trip[3]
            stops = trip[7]
            shape_len = shape_lengths.get(shape_id)
            assert shape_len is not None, f"{trip_id}: shape {shape_id} missing from rer_shapes.bin"

            for i in range(len(stops) - 1):
                curr_dist = stops[i][2]
                next_dist = stops[i + 1][2]
                assert next_dist > curr_dist, f"{trip_id} ({shape_id}): non-increasing distances at stops {i}->{i+1}: {curr_dist} >= {next_dist}"

            last_dist = stops[-1][2]
            assert last_dist <= shape_len + 0.5, f"{trip_id}: last distance {last_dist} exceeds shape length {shape_len} + 0.5m"

    def test_criterion_4_gtfs_time_bounds(self, schedule_data):
        """Verify time bounds of full 24h RER schedule."""
        rer_sched = schedule_data["rer_sched"]
        min_time = min(trip[4] for trip in rer_sched["trips"])
        max_time = max(trip[5] for trip in rer_sched["trips"])
        assert min_time >= 0, f"Unexpected negative min time: {min_time}"
        assert max_time >= 86400, f"Expected schedule to cover late night past 86400 s, got {max_time}"

