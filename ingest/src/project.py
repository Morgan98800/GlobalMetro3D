"""
Monotonic Stop-to-Shape Projection Module
Projects subway stops along a polyline track enforcing strictly increasing curvilinear distance.
Prevents retrograde jumps on loops, parallel branches, and switches.
"""

from typing import List, Tuple, Dict, Any, Optional
import numpy as np
from .resample import wgs84_to_local_xy, local_xy_to_wgs84


def project_single_point_constrained(
    stop_xy: Tuple[float, float],
    shape_coords_xy: np.ndarray,
    shape_cum_dists: np.ndarray,
    min_curv_dist: float = 0.0
) -> Tuple[float, float, Tuple[float, float]]:
    """
    Projects a single point (stop_xy) onto polyline segments subject to curvilinear distance >= min_curv_dist.
    Returns:
        best_curv_dist: float
        best_offset_m: float (distance from stop to track)
        best_point_xy: (x, y) projected on track
    """
    sx, sy = stop_xy
    N = len(shape_coords_xy)
    if N < 2:
        pt = shape_coords_xy[0] if N == 1 else (0.0, 0.0)
        dist_m = float(np.hypot(sx - pt[0], sy - pt[1]))
        return 0.0, dist_m, (float(pt[0]), float(pt[1]))

    best_offset = float("inf")
    best_curv_dist = min_curv_dist
    best_pt = (shape_coords_xy[0][0], shape_coords_xy[0][1])

    # Segments
    for i in range(N - 1):
        dA = shape_cum_dists[i]
        dB = shape_cum_dists[i + 1]

        # Segment lies completely before the allowed distance threshold
        if dB < min_curv_dist - 1e-4:
            continue

        xA, yA = shape_coords_xy[i]
        xB, yB = shape_coords_xy[i + 1]

        dx = xB - xA
        dy = yB - yA
        L = float(np.hypot(dx, dy))
        if L < 1e-6:
            continue

        # Unit vector along segment
        ux = dx / L
        uy = dy / L

        # Projection of vector A -> stop onto segment
        proj_t = (sx - xA) * ux + (sy - yA) * uy

        # Determine valid bounds for t to satisfy min_curv_dist
        if dA < min_curv_dist:
            min_t = min_curv_dist - dA
        else:
            min_t = 0.0

        max_t = L

        if min_t > max_t:
            continue

        clamped_t = max(min_t, min(max_t, proj_t))
        proj_x = xA + clamped_t * ux
        proj_y = yA + clamped_t * uy

        offset = float(np.hypot(sx - proj_x, sy - proj_y))
        curv_dist = float(dA + clamped_t)

        if offset < best_offset:
            best_offset = offset
            best_curv_dist = curv_dist
            best_pt = (proj_x, proj_y)

    return best_curv_dist, best_offset, best_pt


def project_trip_stops_monotonically(
    stops_coords: List[Tuple[str, float, float]], # List of (stop_id, lon, lat)
    shape_coords_lon_lat: np.ndarray,
    shape_cum_dists: np.ndarray,
    min_station_gap_m: float = 1.0
) -> List[Dict[str, Any]]:
    """
    Projects all stops of a trip sequentially along the shape.
    Enforces that stop[k+1].curv_dist >= stop[k].curv_dist + min_station_gap_m.
    Returns list of dicts with:
        stop_id, curv_dist_m, offset_m, proj_lon, proj_lat
    """
    shape_xy = np.array([wgs84_to_local_xy(p[0], p[1]) for p in shape_coords_lon_lat], dtype=np.float64)

    results = []
    current_min_dist = 0.0

    for idx, (stop_id, lon, lat) in enumerate(stops_coords):
        s_xy = wgs84_to_local_xy(lon, lat)
        curv_dist, offset_m, proj_xy = project_single_point_constrained(
            s_xy, shape_xy, shape_cum_dists, min_curv_dist=current_min_dist
        )

        proj_lon, proj_lat = local_xy_to_wgs84(proj_xy[0], proj_xy[1])
        results.append({
            "stop_id": stop_id,
            "curv_dist_m": curv_dist,
            "offset_m": offset_m,
            "proj_lon": proj_lon,
            "proj_lat": proj_lat,
            "orig_lon": lon,
            "orig_lat": lat
        })

        # Next stop must be at least min_station_gap_m ahead
        current_min_dist = curv_dist + min_station_gap_m

    return results
