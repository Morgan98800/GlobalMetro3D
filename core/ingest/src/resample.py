"""
Resampling and Local Metric Projection Utilities for Subway Polyline Geometries

Converts WGS84 (lon, lat) to local Cartesian coordinates (meters) centered on Paris,
allowing high-speed sub-millimeter geometry operations, linear resampling at constant step (10m),
and accurate curvilinear distance computations.
"""

import math
from typing import List, Tuple, Optional
import numpy as np

# Paris Center Reference (Notre-Dame)
LON0 = 2.3488
LAT0 = 48.8534
R_EARTH = 6371000.0  # Mean earth radius in meters
DEG_TO_RAD = math.pi / 180.0
RAD_TO_DEG = 180.0 / math.pi
COS_LAT0 = math.cos(LAT0 * DEG_TO_RAD)

_LON_M = R_EARTH * COS_LAT0 * DEG_TO_RAD  # metres per degree lon at Paris lat
_LAT_M = R_EARTH * DEG_TO_RAD              # metres per degree lat


def remove_uturn_kinks(
    points_lon_lat: List[Tuple[float, float]],
    bearing_change_threshold: float = 120.0,
    min_segment_m: float = 2.0,
) -> List[Tuple[float, float]]:
    """
    Remove points that cause U-turn kinks (bearing change > threshold degrees)
    where both adjacent segments are longer than min_segment_m.

    Applied iteratively until no more kinks remain. Runs in O(n) per pass.
    The 150° angle test (in the pipeline test) uses angle-at-vertex;
    this function uses bearing-change which is equivalent: angle = 180 - |delta_bearing|.
    So bearing_change_threshold=120 ↔ angle_threshold=60°, but for genuine U-turns
    (bearing > 120°) the angle is < 60°, far below any legitimate curve.
    """
    pts = list(points_lon_lat)
    changed = True
    while changed:
        changed = False
        new_pts: List[Tuple[float, float]] = [pts[0]]
        i = 1
        while i < len(pts) - 1:
            prev = new_pts[-1]
            curr = pts[i]
            nxt  = pts[i + 1]

            dx1 = (curr[0] - prev[0]) * _LON_M
            dy1 = (curr[1] - prev[1]) * _LAT_M
            d1  = math.hypot(dx1, dy1)

            dx2 = (nxt[0] - curr[0]) * _LON_M
            dy2 = (nxt[1] - curr[1]) * _LAT_M
            d2  = math.hypot(dx2, dy2)

            if d1 >= min_segment_m and d2 >= min_segment_m:
                b1 = math.degrees(math.atan2(dx1, dy1))
                b2 = math.degrees(math.atan2(dx2, dy2))
                delta = ((b2 - b1) + 180.0) % 360.0 - 180.0
                if abs(delta) > bearing_change_threshold:
                    # Drop this kink point
                    changed = True
                    i += 1
                    continue

            new_pts.append(curr)
            i += 1
        new_pts.append(pts[-1])
        pts = new_pts
    return pts



def wgs84_to_local_xy(lon: float, lat: float) -> Tuple[float, float]:
    """Projects WGS84 (lon, lat) in degrees to local metric (x, y) in meters."""
    x = (lon - LON0) * DEG_TO_RAD * R_EARTH * COS_LAT0
    y = (lat - LAT0) * DEG_TO_RAD * R_EARTH
    return x, y


def local_xy_to_wgs84(x: float, y: float) -> Tuple[float, float]:
    """Unprojects local metric (x, y) back to WGS84 (lon, lat) in degrees."""
    lon = LON0 + (x / (R_EARTH * COS_LAT0)) * RAD_TO_DEG
    lat = LAT0 + (y / R_EARTH) * RAD_TO_DEG
    return lon, lat


def haversine_distance(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Computes exact great-circle distance between two points in meters."""
    phi1 = lat1 * DEG_TO_RAD
    phi2 = lat2 * DEG_TO_RAD
    dphi = (lat2 - lat1) * DEG_TO_RAD
    dlambda = (lon2 - lon1) * DEG_TO_RAD

    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    return 2.0 * R_EARTH * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def resample_polyline_10m(
    points_lon_lat: List[Tuple[float, float]], step_meters: float = 10.0
) -> Tuple[np.ndarray, np.ndarray, float]:
    """
    Resamples a polyline of (lon, lat) points at a constant curvilinear distance step.
    Returns:
        resampled_coords: np.ndarray of shape (N, 2) [lon, lat]
        cum_distances: np.ndarray of shape (N,) cumulative distance in meters from start
        total_length: float total length of the polyline in meters
    """
    if len(points_lon_lat) < 2:
        coords = np.array(points_lon_lat, dtype=np.float32)
        return coords, np.zeros(len(coords), dtype=np.float32), 0.0

    # Convert to local metric coordinates
    local_pts = [wgs84_to_local_xy(lon, lat) for lon, lat in points_lon_lat]
    xs = np.array([p[0] for p in local_pts], dtype=np.float64)
    ys = np.array([p[1] for p in local_pts], dtype=np.float64)

    # Compute segment lengths and cumulative distances
    dx = np.diff(xs)
    dy = np.diff(ys)
    seg_lengths = np.hypot(dx, dy)
    orig_cum_dist = np.concatenate(([0.0], np.cumsum(seg_lengths)))
    total_length = float(orig_cum_dist[-1])

    if total_length <= step_meters:
        coords = np.array(points_lon_lat, dtype=np.float32)
        return coords, orig_cum_dist.astype(np.float32), total_length

    # Create target sample distances
    target_dists = np.arange(0.0, total_length, step_meters, dtype=np.float64)
    remainder = total_length - target_dists[-1]
    if remainder > 1e-6:
        target_dists = np.append(target_dists, total_length)

    # Linear interpolation along polyline
    interp_xs = np.interp(target_dists, orig_cum_dist, xs)
    interp_ys = np.interp(target_dists, orig_cum_dist, ys)

    # Convert back to WGS84
    resampled_lons = LON0 + (interp_xs / (R_EARTH * COS_LAT0)) * RAD_TO_DEG
    resampled_lats = LAT0 + (interp_ys / R_EARTH) * RAD_TO_DEG

    resampled_coords = np.column_stack((resampled_lons, resampled_lats)).astype(np.float32)
    return resampled_coords, target_dists.astype(np.float32), total_length


def segments_intersect(
    p1: Tuple[float, float],
    p2: Tuple[float, float],
    p3: Tuple[float, float],
    p4: Tuple[float, float]
) -> Tuple[bool, Optional[Tuple[float, float]]]:
    """Checks if line segment (p1, p2) intersects with (p3, p4) and returns intersection point."""
    def ccw(A, B, C):
        return (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0])

    if max(min(p1[0], p2[0]), min(p3[0], p4[0])) > min(max(p1[0], p2[0]), max(p3[0], p4[0])):
        return False, None
    if max(min(p1[1], p2[1]), min(p3[1], p4[1])) > min(max(p1[1], p2[1]), max(p3[1], p4[1])):
        return False, None

    A, B, C, D = p1, p2, p3, p4
    if (ccw(A, C, D) != ccw(B, C, D)) and (ccw(A, B, C) != ccw(A, B, D)):
        denom = (B[0] - A[0]) * (D[1] - C[1]) - (B[1] - A[1]) * (D[0] - C[0])
        if abs(denom) < 1e-9:
            return False, None
        t = ((C[0] - A[0]) * (D[1] - C[1]) - (C[1] - A[1]) * (D[0] - C[0])) / denom
        u = ((C[0] - A[0]) * (B[1] - A[1]) - (C[1] - A[1]) * (B[0] - A[0])) / denom
        if 0.001 < t < 0.999 and 0.001 < u < 0.999:
            ix = A[0] + t * (B[0] - A[0])
            iy = A[1] + t * (B[1] - A[1])
            return True, (float(ix), float(iy))
    return False, None


def clean_self_intersections_metric(coords_xy: np.ndarray, max_lookahead: int = 25) -> np.ndarray:
    """Removes local self-intersections and swallow-tails created by offsetting into tight curves."""
    pts = [tuple(p) for p in coords_xy]
    changed = True
    iterations = 0
    while changed and iterations < 12:
        changed = False
        iterations += 1
        n = len(pts)
        for i in range(n - 3):
            limit = min(n - 1, i + max_lookahead)
            found = False
            for j in range(i + 2, limit):
                inter, q = segments_intersect(pts[i], pts[i + 1], pts[j], pts[j + 1])
                if inter and q is not None:
                    # Clip out self-intersection loop and replace with junction point q
                    pts = pts[:i + 1] + [q] + pts[j + 1:]
                    changed = True
                    found = True
                    break
            if found:
                break
    return np.array(pts, dtype=np.float64)


def remove_uturn_kinks_metric(coords_xy: np.ndarray, bearing_change_threshold: float = 120.0) -> np.ndarray:
    """Remove sharp reversals after lateral offsetting, in metres."""
    pts = [tuple(point) for point in coords_xy]
    changed = True
    while changed and len(pts) > 2:
        changed = False
        cleaned = [pts[0]]
        for i in range(1, len(pts) - 1):
            prev = cleaned[-1]
            curr = pts[i]
            nxt = pts[i + 1]
            first = (curr[0] - prev[0], curr[1] - prev[1])
            second = (nxt[0] - curr[0], nxt[1] - curr[1])
            first_length = math.hypot(*first)
            second_length = math.hypot(*second)
            if first_length >= 2.0 and second_length >= 2.0:
                bearing_a = math.atan2(first[0], first[1])
                bearing_b = math.atan2(second[0], second[1])
                delta = (bearing_b - bearing_a + math.pi) % (2 * math.pi) - math.pi
                if abs(math.degrees(delta)) > bearing_change_threshold:
                    changed = True
                    continue
            cleaned.append(curr)
        cleaned.append(pts[-1])
        pts = cleaned
    return np.array(pts, dtype=np.float64)


def offset_polyline_metric(
    coords_xy: np.ndarray,
    offset_meters: float,
    tangent_window_m: float = 30.0,
) -> np.ndarray:
    """
    Applies a lateral offset in meters to 2D local Cartesian coordinates.
    Positive offset shifts to the right of travel direction; negative shifts to the left.
    """
    if abs(offset_meters) < 1e-4 or len(coords_xy) < 2:
        return coords_xy.copy()

    # Deduplicate micro-segments (< 5cm)
    filtered = [coords_xy[0]]
    for i in range(1, len(coords_xy)):
        if np.hypot(coords_xy[i, 0] - filtered[-1][0], coords_xy[i, 1] - filtered[-1][1]) > 0.05:
            filtered.append(coords_xy[i])
    pts = np.array(filtered, dtype=np.float64)
    N = len(pts)
    if N < 2:
        return coords_xy.copy()

    segment_lengths = np.hypot(np.diff(pts[:, 0]), np.diff(pts[:, 1]))
    cumulative = np.concatenate(([0.0], np.cumsum(segment_lengths)))
    offset_x = np.empty(N, dtype=np.float64)
    offset_y = np.empty(N, dtype=np.float64)

    for i in range(N):
        center = cumulative[i]
        prev = max(0.0, center - tangent_window_m)
        next_ = min(cumulative[-1], center + tangent_window_m)
        prev_i = int(np.searchsorted(cumulative, prev, side="left"))
        next_i = int(np.searchsorted(cumulative, next_, side="right") - 1)
        if next_i <= prev_i:
            prev_i = max(0, i - 1)
            next_i = min(N - 1, i + 1)

        tangent_x = pts[next_i, 0] - pts[prev_i, 0]
        tangent_y = pts[next_i, 1] - pts[prev_i, 1]
        tangent_length = math.hypot(tangent_x, tangent_y) or 1.0
        tangent_x /= tangent_length
        tangent_y /= tangent_length

        # Right-hand normal: rotate the unit tangent by -90 degrees.
        normal_x = tangent_y
        normal_y = -tangent_x
        normal_length = math.hypot(normal_x, normal_y) or 1.0
        normal_x /= normal_length
        normal_y /= normal_length

        offset_x[i] = pts[i, 0] + offset_meters * normal_x
        offset_y[i] = pts[i, 1] + offset_meters * normal_y

    return np.column_stack([offset_x, offset_y])


def offset_and_resample_shape(
    points_lon_lat: List[Tuple[float, float]],
    direction_id: int,
    step_meters: float = 10.0
) -> Tuple[np.ndarray, np.ndarray, float]:
    """
    Offsets polyline laterally based on direction_id (+1.8m for dir 0, -1.8m for dir 1),
    cleans self-intersections in tight curves, and resamples at constant 10m step.
    """
    if len(points_lon_lat) < 2:
        coords = np.array(points_lon_lat, dtype=np.float32)
        return coords, np.zeros(len(coords), dtype=np.float32), 0.0

    # Remove U-turn kinks before offsetting and resampling
    points_lon_lat = remove_uturn_kinks(points_lon_lat)

    # Convert to local metric coordinates
    local_pts = [wgs84_to_local_xy(lon, lat) for lon, lat in points_lon_lat]
    xy = np.array(local_pts, dtype=np.float64)

    # Offset latéral en mètres dans le repère local, perpendiculaire à la voie.
    offset_m = 1.8 if direction_id == 0 else (-1.8 if direction_id == 1 else 0.0)

    if abs(offset_m) > 1e-4:
        xy = offset_polyline_metric(xy, offset_m)
        xy = clean_self_intersections_metric(xy)
        xy = remove_uturn_kinks_metric(xy)

    # Compute segment lengths and cumulative distances
    dx = np.diff(xy[:, 0])
    dy = np.diff(xy[:, 1])
    seg_lengths = np.hypot(dx, dy)
    orig_cum_dist = np.concatenate(([0.0], np.cumsum(seg_lengths)))
    total_length = float(orig_cum_dist[-1])

    if total_length <= step_meters:
        lon_lat = [local_xy_to_wgs84(p[0], p[1]) for p in xy]
        coords = np.array(lon_lat, dtype=np.float32)
        return coords, orig_cum_dist.astype(np.float32), total_length

    # Resample at step_meters
    target_dists = np.arange(0.0, total_length, step_meters, dtype=np.float64)
    remainder = total_length - target_dists[-1]
    if remainder > 1e-6:
        target_dists = np.append(target_dists, total_length)

    interp_xs = np.interp(target_dists, orig_cum_dist, xy[:, 0])
    interp_ys = np.interp(target_dists, orig_cum_dist, xy[:, 1])

    # Convert back to WGS84
    resampled_lons = LON0 + (interp_xs / (R_EARTH * COS_LAT0)) * RAD_TO_DEG
    resampled_lats = LAT0 + (interp_ys / R_EARTH) * RAD_TO_DEG

    resampled_coords = np.column_stack((resampled_lons, resampled_lats)).astype(np.float32)
    return resampled_coords, target_dists.astype(np.float32), total_length

