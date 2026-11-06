#!/usr/bin/env python3
"""Build 3D railway curves for Edinburgh in local metric coordinates centered on Waverley."""

import json, math
import numpy as np
from pyproj import Transformer
from shapely.geometry import shape, LineString, MultiLineString, Point
from shapely.ops import linemerge

to_bng = Transformer.from_crs(4326, 27700, always_xy=True)
to_ll = Transformer.from_crs(27700, 4326, always_xy=True)
ORIGIN_LL = (-3.188674, 55.95223)
E0, N0 = to_bng.transform(*ORIGIN_LL)

# Stations altitude reference from edinburgh_3d.json
with open('cities/edinburgh/assets/models/edinburgh_3d.json') as f:
    e3d = json.load(f)

station_alts = {g['nom']: g['position'][1] * 100.0 for g in e3d['gares']}
print("Station altitudes:", station_alts)

def bng_to_local_m(e, n, alt):
    """Local metric coordinates: X est, Y haut, Z sud (Three.js convention)."""
    return [round(e - E0, 2), round(alt, 2), round(-(n - N0), 2)]

# Load railway datasets
with open('scratch/tram-trains-main/map/data/southeast-scotland-railways.json') as f:
    rj = json.load(f)

# Collect railway lines by direction / corridor
# Corridor A: Haymarket <-> Waverley <-> Calton
# 1. Main line Haymarket to Waverley
def get_corridor_lines():
    features = rj['features']
    lines = []
    for f in features:
        p = f.get('properties', {})
        if p.get('usage') not in ('main', 'branch') or p.get('service'):
            continue
        g = f['geometry']
        if g['type'] == 'LineString':
            pts = [to_bng.transform(c[0], c[1]) for c in g['coordinates']]
            # Only inside metropolitan bbox: Easting 315000 to 335000, Northing 668000 to 678000
            if all(315000 <= pt[0] <= 335000 and 668000 <= pt[1] <= 678000 for pt in pts):
                lines.append(LineString(pts))
    return lines

all_lines = get_corridor_lines()
merged = linemerge(all_lines)
geoms = getattr(merged, 'geoms', [merged])
print(f"Total merged rail tracks: {len(geoms)}")

# Sort by length and take the longest continuous corridors
corridors = []
for i, g in enumerate(sorted(geoms, key=lambda l: -l.length)[:12]):
    if g.length < 500:
        continue
    # Densify every 15 meters
    n_pts = max(3, int(g.length / 15.0) + 1)
    dists = np.linspace(0, g.length, n_pts)
    pts_bng = [g.interpolate(d).coords[0] for d in dists]
    
    # Calculate smooth altitude profile:
    # Waverley is around E=325872, alt=52.7
    # Haymarket is around E=324008, alt=57.3
    # West towards Gateway alt decreases to ~50.3
    # South-west towards Curriehill alt increases to ~110.3
    # Calton tunnels / East alt is ~51.0
    pts_3d = []
    for pt in pts_bng:
        e, n = pt[0], pt[1]
        dist_waverley = math.hypot(e - E0, n - N0)
        # Smooth interpolation based on BNG coordinates
        if e < 323000:
            if n < 671000: # towards Curriehill
                alt = 57.3 + (110.3 - 57.3) * min(1.0, (324000 - e) / 5000.0)
            else: # towards Gateway
                alt = 57.3 - (57.3 - 50.3) * min(1.0, (324000 - e) / 5000.0)
        elif e < 325500: # Haymarket to Mound / Princes St Gardens
            t_h_w = (e - 324000) / 1800.0
            alt = 57.3 - (57.3 - 52.7) * np.clip(t_h_w, 0.0, 1.0)
        elif e < 326500: # Waverley
            alt = 52.7
        else: # Calton / East
            alt = 52.7 - 1.5 * min(1.0, (e - 326500) / 2000.0)
        
        pts_3d.append(bng_to_local_m(e, n, alt))
    
    corridors.append({
        "id": f"rail_corridor_{i}",
        "name": f"Track {i + 1}",
        "length_m": round(g.length, 1),
        "points": pts_3d
    })

print(f"Generated {len(corridors)} main 3D rail corridors.")
out_data = {
    "origin_ll": ORIGIN_LL,
    "origin_bng": [round(E0, 2), round(N0, 2)],
    "unit": "meters",
    "corridors": corridors
}

for path in ['cities/edinburgh/data/rail_curves_3d.json', 'web/public/cities/edinburgh/data/rail_curves_3d.json']:
    with open(path, 'w') as f:
        json.dump(out_data, f, indent=2)
    print("Saved", path)

