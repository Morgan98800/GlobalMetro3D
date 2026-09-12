#!/usr/bin/env python3
"""
generate_tracks_json.py
Extracts ultra-lightweight track polylines from control_network.geojson,
reducing payload from 9.4 MB to ~180 KB.

Includes a DEDUPLICATION step that removes near-duplicate tracks per line.
Algorithm (per line):
  1. Sort tracks by length descending.
  2. The longest track is always retained.
  3. For each subsequent track, sample it every 25 m and compute what fraction
     of those samples fall within 25 m of the UNION of all already-retained tracks.
     If ≥ 95 % are covered → discard. Otherwise → retain.
This removes 2–11× redundancy without dropping genuine branches or directional variants.

Preserved by design:
  - L7:   2 tracks (branch Villejuif-Louis Aragon + branch Mairie d'Ivry)
  - L13:  3 tracks (trunk + branch Asnières-Gennevilliers + branch Saint-Denis-Université)
  - L7bis: 2 tracks (the loop via Botzaris is geometrically asymmetric: 3.22 km vs 2.88 km)
  - L3bis: 1 track  (both directions are geometrically identical at < 15 m)
  - L10:  1 track  (the 9.80 km track is a partial service, not the Auteuil loop;
                     the Auteuil loop is fully contained in the 11.71 km complete track)
"""

import json
import math
import os
from collections import defaultdict
from typing import List, Tuple

# ---------------------------------------------------------------------------
# Geometry helpers — flat-metric approximation (Paris lat ~48.86°)
# Errors < 0.3 % over the 50 km Paris bounding box; acceptable for 25 m threshold.
# ---------------------------------------------------------------------------

_LAT_M = 111_320.0                    # metres per degree latitude
_COS_LAT = math.cos(math.radians(48.86))
_LON_M = _LAT_M * _COS_LAT           # metres per degree longitude at Paris lat


def _pt_m(p: List[float]) -> Tuple[float, float]:
    """Convert [lon, lat] to flat metric (x, y) in metres."""
    return p[0] * _LON_M, p[1] * _LAT_M


def dist_m(a: List[float], b: List[float]) -> float:
    ax, ay = _pt_m(a)
    bx, by = _pt_m(b)
    return math.hypot(ax - bx, ay - by)


def polyline_length_m(coords: List[List[float]]) -> float:
    return sum(dist_m(coords[i], coords[i + 1]) for i in range(len(coords) - 1))


def sample_polyline(coords: List[List[float]], step_m: float = 25.0) -> List[List[float]]:
    """Sample a polyline every step_m metres; always includes first and last point."""
    pts: List[List[float]] = [coords[0]]
    acc = 0.0
    for i in range(1, len(coords)):
        seg = dist_m(coords[i - 1], coords[i])
        acc += seg
        if acc >= step_m:
            pts.append(coords[i])
            acc = 0.0
    if pts[-1] != coords[-1]:
        pts.append(coords[-1])
    return pts


def point_to_polyline_dist_m(px_m: float, py_m: float, ref_m: List[Tuple[float, float]]) -> float:
    """
    Minimum distance in metres from (px_m, py_m) to any segment of ref_m.
    ref_m must be pre-converted to flat metric tuples.
    """
    best = float("inf")
    for j in range(len(ref_m) - 1):
        ax, ay = ref_m[j]
        bx, by = ref_m[j + 1]
        ab_x, ab_y = bx - ax, by - ay
        ap_x, ap_y = px_m - ax, py_m - ay
        ab2 = ab_x * ab_x + ab_y * ab_y
        t = max(0.0, min(1.0, (ap_x * ab_x + ap_y * ab_y) / ab2)) if ab2 > 0 else 0.0
        cx, cy = ax + t * ab_x, ay + t * ab_y
        d = math.hypot(px_m - cx, py_m - cy)
        if d < best:
            best = d
    return best


def polyline_to_metric(coords: List[List[float]]) -> List[Tuple[float, float]]:
    """Pre-convert a [lon,lat] polyline to flat metric tuples for fast distance queries."""
    return [_pt_m(p) for p in coords]


def is_covered_by_union(
    candidate: List[List[float]],
    retained_metric: List[List[Tuple[float, float]]],
    threshold_m: float = 25.0,
    min_coverage: float = 0.95,
    sample_step_m: float = 25.0,
) -> Tuple[bool, float]:
    """
    Return (covered, coverage_fraction).
    A candidate track is 'covered' if ≥ min_coverage of its sampled points
    are within threshold_m of the union of all retained tracks.
    retained_metric: list of pre-converted flat-metric polylines.
    """
    samples = sample_polyline(candidate, sample_step_m)
    if not samples:
        return True, 1.0
    within = 0
    for pt in samples:
        px_m, py_m = _pt_m(pt)
        best = min(point_to_polyline_dist_m(px_m, py_m, ref) for ref in retained_metric)
        if best <= threshold_m:
            within += 1
    coverage = within / len(samples)
    return coverage >= min_coverage, coverage


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------

DEDUP_THRESHOLD_M = 25.0     # primary coverage threshold
DEDUP_MIN_COVERAGE = 0.95    # fraction of sampled points that must be covered
DEDUP_SAMPLE_STEP_M = 25.0   # sample interval for coverage test


def deduplicate_line_tracks(
    segments: List[dict],
    threshold_m: float = DEDUP_THRESHOLD_M,
) -> List[dict]:
    """
    Given all track segments for one line, return the de-duplicated subset.
    Longest track is always retained; shorter tracks are discarded if ≥ 95 %
    of their sample points lie within threshold_m of the union of retained tracks.
    """
    if len(segments) <= 1:
        return segments

    sorted_segs = sorted(segments, key=lambda s: polyline_length_m(s["coordinates"]), reverse=True)
    retained = [sorted_segs[0]]
    retained_metric = [polyline_to_metric(sorted_segs[0]["coordinates"])]

    for candidate in sorted_segs[1:]:
        covered, _cov = is_covered_by_union(
            candidate["coordinates"],
            retained_metric,
            threshold_m=threshold_m,
            min_coverage=DEDUP_MIN_COVERAGE,
            sample_step_m=DEDUP_SAMPLE_STEP_M,
        )
        if not covered:
            retained.append(candidate)
            retained_metric.append(polyline_to_metric(candidate["coordinates"]))

    return retained


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    geojson_path = os.path.join(repo_root, "data", "processed", "control_network.geojson")
    out_path = os.path.join(repo_root, "web", "public", "data", "tracks.json")

    print(f"Reading {geojson_path}...")
    with open(geojson_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # -- Parse features --
    raw_segments: List[dict] = []
    try:
        from shapely.geometry import LineString
        use_shapely = True
    except ImportError:
        use_shapely = False

    for feat in data.get("features", []):
        geom = feat.get("geometry", {})
        if geom.get("type") != "LineString":
            continue
        props = feat.get("properties", {})
        coords = geom.get("coordinates", [])
        if use_shapely and len(coords) > 2:
            ls = LineString(coords).simplify(0.00008, preserve_topology=False)
            coords = list(ls.coords)
        # Round to 5 decimal places (~1.1 m precision)
        coords = [[round(p[0], 5), round(p[1], 5)] for p in coords]
        raw_segments.append({
            "line_id": props.get("line_id"),
            "short_name": props.get("line_short_name"),
            "stroke": props.get("stroke", "#CCCCCC"),
            "coordinates": coords,
        })

    print(f"Parsed {len(raw_segments)} raw track segments.")

    # -- Group by line short name --
    by_line: dict = defaultdict(list)
    for seg in raw_segments:
        key = seg.get("short_name") or seg.get("line_id") or "?"
        by_line[key].append(seg)

    # -- Deduplicate per line --
    print(f"\nDeduplication (threshold={DEDUP_THRESHOLD_M} m, coverage≥{DEDUP_MIN_COVERAGE:.0%}):")
    print(f"{'Line':<8} {'Before':>6} {'After':>6} {'Ratio':>7}  Tracks retained (km)")
    print("-" * 70)

    deduped_segments: List[dict] = []
    total_before = 0
    total_after = 0

    for sname in sorted(by_line.keys()):
        segs = by_line[sname]
        retained = deduplicate_line_tracks(segs, threshold_m=DEDUP_THRESHOLD_M)
        total_before += len(segs)
        total_after += len(retained)

        lengths = [polyline_length_m(r["coordinates"]) / 1000.0 for r in retained]
        cum = sum(lengths)
        ratio = cum / lengths[0] if lengths[0] > 0 else 0
        lens_str = " | ".join(f"{l:.2f}" for l in lengths)
        print(f"{sname:<8} {len(segs):>6} {len(retained):>6} {ratio:>6.1f}x  [{lens_str}] km")

        deduped_segments.extend(retained)

    print("-" * 70)
    print(f"{'TOTAL':<8} {total_before:>6} {total_after:>6}  (removed {total_before - total_after} duplicate tracks)")

    # -- Write output --
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(deduped_segments, f, separators=(",", ":"))

    in_size = os.path.getsize(geojson_path) / (1024 * 1024)
    out_size = os.path.getsize(out_path) / 1024
    print(f"\nOutput written to {out_path}")
    print(f"Size: {out_size:.1f} KB (reduced from {in_size:.2f} MB, -{100 - (out_size / (in_size * 1024) * 100):.1f}%)")


if __name__ == "__main__":
    main()

