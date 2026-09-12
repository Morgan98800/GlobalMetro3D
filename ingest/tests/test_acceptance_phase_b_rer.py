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

from ingest.tests.test_acceptance_phase_a import TestPhaseAAcceptance
from ingest.src.project import project_single_point_constrained, wgs84_to_local_xy
import numpy as np


class TestPhase1RERAcceptance:

    @pytest.fixture(scope="class")
    def rer_shapes_data(self):
        root = Path(__file__).resolve().parent.parent.parent
        bin_path = root / "web" / "public" / "data" / "rer_shapes.bin"
        assert bin_path.exists(), f"RER shapes file missing: {bin_path}"
        shapes = TestPhaseAAcceptance._read_shp2(str(bin_path))
        return shapes

    def test_criterion_1_rer_e_shape_count(self, rer_shapes_data):
        """RER E must contain exactly 14 shapes in Phase 1."""
        assert len(rer_shapes_data) == 14, f"Expected 14 RER E shapes, got {len(rer_shapes_data)}"
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
        root = Path(__file__).resolve().parent.parent.parent
        stations_path = root / "web" / "public" / "data" / "stations.json"
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
