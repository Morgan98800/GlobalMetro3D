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
    if (total_length - target_dists[-1]) > (step_meters * 0.25):
        target_dists = np.append(target_dists, total_length)
    else:
        target_dists[-1] = total_length

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


def offset_polyline_metric(
    coords_xy: np.ndarray,
    offset_meters: float,
    max_miter: float = 1.5
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

    # Segment tangents and right normals
    dx = np.diff(pts[:, 0])
    dy = np.diff(pts[:, 1])
    L = np.hypot(dx, dy)
    tx = dx / np.maximum(L, 1e-6)
    ty = dy / np.maximum(L, 1e-6)
    nx = ty
    ny = -tx

    # Vertex normals with miter clamping
    vnx = np.zeros(N, dtype=np.float64)
    vny = np.zeros(N, dtype=np.float64)
    vnx[0] = nx[0]
    vny[0] = ny[0]
    vnx[-1] = nx[-1]
    vny[-1] = ny[-1]

    for i in range(1, N - 1):
        mx = nx[i - 1] + nx[i]
        my = ny[i - 1] + ny[i]
        lm = math.hypot(mx, my)
        if lm < 1e-4:
            vnx[i] = nx[i - 1]
            vny[i] = ny[i - 1]
        else:
            ux = mx / lm
            uy = my / lm
            dot = nx[i] * ux + ny[i] * uy
            scale = 1.0 / max(0.2, dot)
            scale = min(max_miter, scale)
            vnx[i] = ux * scale
            vny[i] = uy * scale

    offset_x = pts[:, 0] + offset_meters * vnx
    offset_y = pts[:, 1] + offset_meters * vny
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

    # Convert to local metric coordinates
    local_pts = [wgs84_to_local_xy(lon, lat) for lon, lat in points_lon_lat]
    xy = np.array(local_pts, dtype=np.float64)

    # Lateral offset: +1.8m for dir 0 (circulation à droite), -1.8m for dir 1
    offset_m = 1.8 if direction_id == 0 else (-1.8 if direction_id == 1 else 0.0)

    if abs(offset_m) > 1e-4:
        xy = offset_polyline_metric(xy, offset_m)
        xy = clean_self_intersections_metric(xy)

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
    if (total_length - target_dists[-1]) > (step_meters * 0.25):
        target_dists = np.append(target_dists, total_length)
    else:
        target_dists[-1] = total_length

    interp_xs = np.interp(target_dists, orig_cum_dist, xy[:, 0])
    interp_ys = np.interp(target_dists, orig_cum_dist, xy[:, 1])

    # Convert back to WGS84
    resampled_lons = LON0 + (interp_xs / (R_EARTH * COS_LAT0)) * RAD_TO_DEG
    resampled_lats = LAT0 + (interp_ys / R_EARTH) * RAD_TO_DEG

    resampled_coords = np.column_stack((resampled_lons, resampled_lats)).astype(np.float32)
    return resampled_coords, target_dists.astype(np.float32), total_length

