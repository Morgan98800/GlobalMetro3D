#!/usr/bin/env python3
"""Generate low-poly, clean-room train body GLBs from repository data.

One car per file. Geometry is a chamfered box with a crowned roof, ~80 triangles,
long axis +X, origin x/z centred with y = 0 at rail head. A single embedded 512x512
albedo atlas carries an authored livery: no logo, no lettering, no pictograms, no
pixel traced from any generative or photographic source. The roof band is tinted
per line so the line identity the capsule carried survives the LOD switch.

No glTF extension, no Draco, no meshopt, no KTX2, therefore no WASM decoder and no
loaders.gl texture plugin on the client.

Design note on per-line variants: deck.gl's ScenegraphLayer binds textures from the
glTF and cannot repaint a texture region at runtime without splitting the mesh into
two materials. Splitting costs a second draw call per instance batch and a second
material to keep in sync, so this generator bakes one file per (family, line)
instead. Each file is a few tens of kilobytes and geometry is byte-identical
across variants.

Usage:
    python build_train_box_models.py \
        --rolling-stock data/rolling-stock.json \
        --lines data/lines.json \
        --out assets-src/models/train

    # emit the served copies as a build step
    python build_train_box_models.py ... --serve-dir web/public/models/train

Refuses to guess: unknown drive_type values, missing fields and unmapped lines are
hard errors listing what was found.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

# --------------------------------------------------------------------------------------
# constants that are contract, not taste

ATLAS = 512                 # px, square
DEFAULT_HEIGHT_RATIO = 3.48 / 2.45   # derived from pneumatic_generic reference dims
ORIGIN_CONTRACT = "x_z_centered_y_railhead"
LONG_AXIS = "+X"

# atlas regions, in pixels: (x0, y0, x1, y1)
R_ROOF = (0, 0, 512, 160)
R_SIDE = (0, 160, 512, 320)
R_END_FRONT = (0, 320, 80, 448)
R_END_REAR = (80, 320, 160, 448)
R_UNDER = (160, 320, 512, 384)

# authored livery geometry, in metres or fractions of body height
DOOR_WIDTH_M = 1.32
WINDOW_BAND = (0.44, 0.76)   # fraction of body height, bottom..top
SKIRT_TOP = 0.25             # iconic RATP MF 67 / MP 89 lower teal band height fraction
ROOF_STRIP_FRAC = 0.38       # grey equipment strip, fraction of body width
BODY_COLOR = (240, 240, 240) # off-white 0xf0f0f0
LIVERY_BLUE = (0, 138, 138)  # RATP teal 0x008a8a
GLASS_COLOR = (17, 17, 17)   # deep reflective glass 0x111111
DOOR_COLOR = (224, 226, 228) # clean light sliding doors
ROOF_COLOR = (166, 170, 174)
EQUIP_COLOR = (84, 88, 94)
UNDER_COLOR = (26, 28, 32)
END_COLOR = (240, 240, 240)

# drive_type alone selects the body family. Driverless remains metadata and never
# changes the physical steel-versus-pneumatic body choice.
DRIVE_TYPE_TO_FAMILY = {
    "steel": "steel_classic",
    "fer": "steel_classic",
    "iron": "steel_classic",
    "tire": "pneumatic_generic",
    "pneumatic": "pneumatic_generic",
    "pneu": "pneumatic_generic",
    "rubber": "pneumatic_generic",
    "rubber_tyre": "pneumatic_generic",
}


class DataError(RuntimeError):
    pass


# --------------------------------------------------------------------------------------
# repository data


def _get(d: dict, keys: list[str], where: str):
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    raise DataError(f"{where}: none of {keys} present. Keys found: {sorted(d)}")


def derive_family(model_id: str, model: dict) -> str:
    raw = _get(model, ["drive_type"], f"models.{model_id}")
    key = str(raw).strip().lower().replace("-", "_").replace(" ", "_")
    if key not in DRIVE_TYPE_TO_FAMILY:
        raise DataError(
            f"models.{model_id}.drive_type = {raw!r} is not mapped to an asset family. "
            f"Known values: {sorted(set(DRIVE_TYPE_TO_FAMILY))}. "
            "Add it to DRIVE_TYPE_TO_FAMILY rather than letting it fall through."
        )
    return DRIVE_TYPE_TO_FAMILY[key]


def load_models(path: Path, height_ratio: float) -> dict[str, dict]:
    doc = json.loads(path.read_text(encoding="utf-8"))
    models = _get(doc, ["models"], path.name)
    lines = _get(doc, ["lines"], path.name)

    out = {}
    for model_id, m in models.items():
        length = float(_get(m, ["car_length_m"], f"models.{model_id}"))
        width = float(_get(m, ["width_m"], f"models.{model_id}"))
        if "height_m" in m and m["height_m"]:
            height = float(m["height_m"])
            height_source = "declared"
            measured = True
        else:
            height = round(width * height_ratio, 3)
            height_source = "derived_from_pneumatic_generic_reference"
            measured = False
        if not (5.0 < length < 30.0 and 1.5 < width < 4.0 and 2.0 < height < 5.0):
            raise DataError(
                f"models.{model_id}: implausible dimensions "
                f"{length} x {width} x {height} m. Refusing to generate."
            )
        out[model_id] = {
            "model_id": model_id,
            "family": derive_family(model_id, m),
            "length_m": length,
            "width_m": width,
            "height_m": height,
            "height_source": height_source,
            "height_measured": measured,
            "cars_count": m.get("cars_count"),
            "driverless": bool(m.get("driverless", False)),
        }

    # line -> model_id, accepting either a bare string or an object
    line_model = {}
    for short_name, entry in lines.items():
        mid = entry if isinstance(entry, str) else _get(entry, ["model_id"], f"lines.{short_name}")
        if mid not in out:
            raise DataError(
                f"lines.{short_name}.model_id = {mid!r} is not present in models. "
                f"Known models: {sorted(out)}"
            )
        line_model[str(short_name)] = mid
    return out, line_model


def load_line_colors(path: Path) -> dict[str, tuple[int, int, int]]:
    doc = json.loads(path.read_text(encoding="utf-8"))
    entries = doc["lines"] if isinstance(doc, dict) and "lines" in doc else doc
    if isinstance(entries, dict):
        entries = [dict(v, short_name=v.get("short_name", k)) for k, v in entries.items()]

    colors = {}
    for e in entries:
        sn = str(_get(e, ["short_name"], "lines.json entry"))
        if e.get("mode") != "metro":
            continue
        colors[sn] = hex_to_rgb(_get(e, ["color"], f"lines.json[{sn}]"))
    return colors


def partition_line_models(line_model: dict[str, str], path: Path) -> tuple[dict[str, str], int]:
    doc = json.loads(path.read_text(encoding="utf-8"))
    entries = doc["lines"] if isinstance(doc, dict) and "lines" in doc else doc
    modes = {str(entry["short_name"]): entry.get("mode") for entry in entries}
    missing = sorted(set(line_model) - set(modes))
    unknown = sorted((line, mode) for line, mode in modes.items() if line in line_model and mode not in {"metro", "rer", "rail"})
    if missing or unknown:
        raise DataError(f"Line-mode partition failed; missing={missing}, unknown={unknown}")
    metro = {line: model_id for line, model_id in line_model.items() if modes[line] == "metro"}
    return metro, len(line_model) - len(metro)


def hex_to_rgb(v) -> tuple[int, int, int]:
    if isinstance(v, (list, tuple)) and len(v) >= 3:
        return tuple(int(c) for c in v[:3])
    s = str(v).strip().lstrip("#")
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    if len(s) != 6:
        raise DataError(f"colour {v!r} is not a 6-digit hex value or an RGB triple")
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


# --------------------------------------------------------------------------------------
# geometry


def build_geometry(length: float, width: float, height: float, cab: bool = False):
    """Chamfered box with crowned roof, rooftop HVAC pods, bogies, and optional sloped cab at +X."""
    L, W2 = length, width / 2.0
    # y = 0 is the rail head; `height` is rail head to the highest rooftop point
    y_uf, y_b = 0.0, 1.02                        # bogie bottom, body floor
    y_belly = 0.32                               # raised center underframe clearance
    hvac_h = 0.13                                # rooftop HVAC fairing height above body crown
    body_top = height - hvac_h
    if body_top <= y_b + 1.4:
        raise DataError(f"height {height} m leaves no body above a {y_b} m floor line")
    crown = 0.055 * (body_top - y_b)
    y_r = body_top - crown                       # roof shoulder line
    c = min(0.18, 0.35 * W2)                     # lower chamfer
    c2 = min(0.22, 0.30 * (y_r - y_b))           # shoulder height
    c3 = min(0.20, 0.30 * W2)                    # shoulder inset
    rear_taper = 0.45
    rear_taper_z = 0.86
    front_taper = 0.82 if cab else 0.45
    front_taper_z = 0.78 if cab else 0.86
    cab_rake = min(0.55, L * 0.045) if cab else 0.0

    profile = np.array([
        (-W2, y_b + c), (-W2 + c, y_b), (W2 - c, y_b), (W2, y_b + c),
        (W2, y_r - c2), (W2 - c3, y_r), (0.0, y_r + crown), (-W2 + c3, y_r), (-W2, y_r - c2),
    ])

    def build_ring(x_pos: float, sz: float, rake: float):
        y_sill = y_b + c + 0.15
        y_span = max(body_top - y_sill, 0.5)
        r_frac = np.clip((profile[:, 1] - y_sill) / y_span, 0.0, 1.0)
        xs = x_pos - rake * (r_frac ** 1.15)
        ys = y_b + (profile[:, 1] - y_b) * (1.0 if sz == 1.0 else (0.95 if cab and rake > 0 else 0.97))
        zs = profile[:, 0] * sz
        return np.stack([xs, ys, zs], axis=1)

    stations = [
        (-L / 2, rear_taper_z, 0.0),
        (-L / 2 + rear_taper, 1.0, 0.0),
        (L / 2 - front_taper, 1.0, 0.0),
        (L / 2, front_taper_z, cab_rake),
    ]
    rings = [build_ring(x, sz, rake) for x, sz, rake in stations]

    faces: list[tuple[np.ndarray, str]] = []
    n = len(profile)
    for k in range(len(rings) - 1):
        a, b = rings[k], rings[k + 1]
        for i in range(n):
            j = (i + 1) % n
            quad = np.array([a[i], a[j], b[j], b[i]])
            if cab and k == len(rings) - 2:
                # Split raked cab facets into planar triangles so shading normals match winding exactly
                faces.append((np.array([quad[0], quad[1], quad[2]]), "auto"))
                faces.append((np.array([quad[0], quad[2], quad[3]]), "auto"))
            else:
                faces.append((quad, "auto"))
    # end caps, fanned from the profile centroid
    for ring, flip in ((rings[0], True), (rings[-1], False)):
        ctr = ring.mean(axis=0)
        for i in range(n):
            j = (i + 1) % n
            tri = np.array([ctr, ring[j], ring[i]]) if flip else np.array([ctr, ring[i], ring[j]])
            faces.append((tri, "end"))

    # Underframe with protruding bogie trucks & raised center equipment belly
    uw = W2 * 0.78
    bw = W2 * 0.87
    ul = L / 2 - 0.35
    xb = min(L * 0.30, ul - 1.25)
    bhl = min(1.05, max(0.75, L * 0.07))
    ramp = min(bhl * 1.15, max(0.95, (y_belly - y_uf) * max(xb - bhl, 1.0) / max(height * 0.36, 0.9)))
    if xb - bhl - ramp > 0.35 and ul > xb + bhl + 0.55:
        uf_prof = [
            (-ul, y_belly, uw),
            (-xb - bhl - 0.35, y_belly, uw),
            (-xb - bhl, y_uf, bw),
            (-xb + bhl * 0.45, y_uf, bw),
            (-xb + bhl * 0.45 + ramp, y_belly, uw),
            (xb - bhl * 0.45 - ramp, y_belly, uw),
            (xb - bhl * 0.45, y_uf, bw),
            (xb + bhl, y_uf, bw),
            (xb + bhl + 0.35, y_belly, uw),
            (ul, y_belly, uw),
        ]
        uf_rings = [
            np.array([(x, y_lo, -wz), (x, y_lo, wz), (x, y_b, wz), (x, y_b, -wz)], dtype=float)
            for x, y_lo, wz in uf_prof
        ]
        for k in range(len(uf_rings) - 1):
            ra, rb = uf_rings[k], uf_rings[k + 1]
            for i in (0, 1, 3):  # bottom, +Z side, -Z side (skip hidden top face inside body)
                j = (i + 1) % 4
                faces.append((np.array([ra[i], ra[j], rb[j], rb[i]]), "under"))
        faces.append((np.array([uf_rings[0][0], uf_rings[0][1], uf_rings[0][2], uf_rings[0][3]]), "under"))
        faces.append((np.array([uf_rings[-1][0], uf_rings[-1][3], uf_rings[-1][2], uf_rings[-1][1]]), "under"))
    else:
        box = [
            [(-ul, y_uf, -uw), (ul, y_uf, -uw), (ul, y_b, -uw), (-ul, y_b, -uw)],
            [(ul, y_uf, uw), (-ul, y_uf, uw), (-ul, y_b, uw), (ul, y_b, uw)],
            [(-ul, y_uf, -uw), (ul, y_uf, -uw), (ul, y_uf, uw), (-ul, y_uf, uw)],
            [(-ul, y_uf, -uw), (-ul, y_b, -uw), (-ul, y_b, uw), (-ul, y_uf, uw)],
            [(ul, y_uf, uw), (ul, y_b, uw), (ul, y_b, -uw), (ul, y_uf, -uw)],
        ]
        for q in box:
            faces.append((np.array(q, dtype=float), "under"))

    # Rooftop HVAC equipment pods (beveled ramps guaranteed outward relative to centroid)
    pod_y0 = body_top - 0.03
    pod_y1 = height
    pod_w0 = min(W2 * 0.44, 0.56)
    pod_w1 = pod_w0 * 0.84
    if L >= 10.0:
        pod_hl = min(1.50, L * 0.095)
        max_safe_xc = max(0.0, (pod_hl * 0.55) * max(pod_y0 - height * 0.5, 0.5) / max(pod_y1 - pod_y0, 0.1) * 0.72)
        xc_offset = min(0.22 * L, L / 2 - 2.4, max_safe_xc)
        pod_centers = [-xc_offset, xc_offset] if xc_offset >= 1.8 else [0.0]
    else:
        pod_hl = min(1.10, L * 0.16)
        pod_centers = [0.0]

    for xc in pod_centers:
        ramp_x = min(pod_hl * 0.62, max(0.45, (pod_y1 - pod_y0) * (abs(xc) + pod_hl) / max(pod_y0 - height * 0.5, 0.4) * 0.55))
        deck_hl = max(0.25, pod_hl - ramp_x)
        x0, x1 = xc - pod_hl, xc + pod_hl
        tx0, tx1 = xc - deck_hl, xc + deck_hl
        faces.append((np.array([(tx0, pod_y1, -pod_w1), (tx1, pod_y1, -pod_w1), (tx1, pod_y1, pod_w1), (tx0, pod_y1, pod_w1)]), "equip"))
        faces.append((np.array([(x0, pod_y0, -pod_w0), (tx0, pod_y1, -pod_w1), (tx0, pod_y1, pod_w1), (x0, pod_y0, pod_w0)]), "equip"))
        faces.append((np.array([(x1, pod_y0, pod_w0), (tx1, pod_y1, pod_w1), (tx1, pod_y1, -pod_w1), (x1, pod_y0, -pod_w0)]), "equip"))
        faces.append((np.array([(x0, pod_y0, pod_w0), (tx0, pod_y1, pod_w1), (tx1, pod_y1, pod_w1), (x1, pod_y0, pod_w0)]), "equip"))
        faces.append((np.array([(x1, pod_y0, -pod_w0), (tx1, pod_y1, -pod_w1), (tx0, pod_y1, -pod_w1), (x0, pod_y0, -pod_w0)]), "equip"))

    # Protruding bogie wheels (outer octagonal caps + shallow bevel rim facing +/-Z cleanly)
    if xb - bhl - ramp > 0.35 and ul > xb + bhl + 0.55:
        wheel_r = min(0.36, y_belly * 0.92 + 0.08)
        wheel_cy = wheel_r
        wheel_in_z = bw - 0.01
        wheel_out_z = bw + 0.075
        wheel_sides = 8
        angles = np.linspace(0.0, 2.0 * np.pi, wheel_sides, endpoint=False)
        for bogie_x in (-xb, xb):
            for axle_dx in (-bhl * 0.44, bhl * 0.44):
                wx = bogie_x + axle_dx
                for side_sign in (1.0, -1.0):
                    z0 = side_sign * wheel_in_z
                    z1 = side_sign * wheel_out_z
                    ring_in = [
                        np.array([wx + wheel_r * np.cos(a), wheel_cy + wheel_r * np.sin(a), z0], dtype=float)
                        for a in angles
                    ]
                    ring_out = [
                        np.array([wx + (wheel_r - 0.025) * np.cos(a), wheel_cy + (wheel_r - 0.025) * np.sin(a), z1], dtype=float)
                        for a in angles
                    ]
                    cap_ctr = np.array([wx, wheel_cy, z1], dtype=float)
                    for si in range(wheel_sides):
                        sj = (si + 1) % wheel_sides
                        faces.append((np.array([ring_in[si], ring_in[sj], ring_out[sj], ring_out[si]]), "under"))
                        faces.append((np.array([cap_ctr, ring_out[si], ring_out[sj]]), "under"))

    # Optional front destination brow crest on cab cars (subtle MF 67 brow profile)
    if cab:
        bx0 = L / 2 - cab_rake - 0.14
        bx1 = L / 2 - cab_rake * 0.52 + 0.06
        by0 = body_top - 0.24
        by1 = body_top + 0.02
        bw2 = min(W2 * 0.44, 0.58)
        faces.append((np.array([(bx1, by0, -bw2), (bx1, by0, bw2), (bx1, by1, bw2), (bx1, by1, -bw2)]), "end"))
        faces.append((np.array([(bx0, by1, -bw2), (bx1, by1, -bw2), (bx1, by1, bw2), (bx0, by1, bw2)]), "roof"))
        faces.append((np.array([(bx0, by0, bw2), (bx1, by0, bw2), (bx1, by1, bw2), (bx0, by1, bw2)]), "side"))
        faces.append((np.array([(bx1, by0, -bw2), (bx0, by0, -bw2), (bx0, by1, -bw2), (bx1, by1, -bw2)]), "side"))

    # every surface is on a convex shell relative to the car centroid
    center = np.array([0.0, height / 2.0, 0.0])

    P, N, UV, I = [], [], [], []
    flipped = 0
    for verts, tag in faces:
        nrm = np.cross(verts[1] - verts[0], verts[2] - verts[0])
        ln = np.linalg.norm(nrm)
        if ln < 1e-12:
            continue
        nrm = nrm / ln
        if nrm @ (verts.mean(axis=0) - center) < 0:
            verts = verts[::-1]
            nrm = -nrm
            flipped += 1
        region = tag if tag != "auto" else classify(nrm)
        uvs = np.array([uv_for(v, region, L, W2, y_b, body_top) for v in verts])
        base = len(P)
        P.extend(verts)
        N.extend([nrm] * len(verts))
        UV.extend(uvs)
        for t in range(1, len(verts) - 1):
            I.extend([base, base + t, base + t + 1])

    P = np.array(P, dtype=np.float32)
    N = np.array(N, dtype=np.float32)
    UV = np.array(UV, dtype=np.float32)
    I = np.array(I, dtype=np.uint16)
    # contract: x/z centred, y = 0 at rail head, long axis +X
    P[:, 0] -= (P[:, 0].max() + P[:, 0].min()) / 2
    P[:, 2] -= (P[:, 2].max() + P[:, 2].min()) / 2
    P[:, 1] -= P[:, 1].min()
    if flipped:
        print(f"  oriented {flipped} faces outward", file=sys.stderr)
    return P, N, UV, I


def classify(nrm) -> str:
    if abs(nrm[2]) > 0.5:
        return "side"
    if nrm[1] > 0.5:
        return "roof"
    if nrm[1] < -0.5:
        return "under"
    return "end"


def region_uv(region: str, u: float, v: float) -> tuple[float, float]:
    if region == "equip":
        x0, y0, x1, y1 = R_UNDER
        y1 = y0 + (y1 - y0) // 2
    else:
        x0, y0, x1, y1 = {
            "roof": R_ROOF,
            "side": R_SIDE,
            "end_front": R_END_FRONT,
            "end_rear": R_END_REAR,
            "under": R_UNDER,
        }[region]
    pad = 1.5
    return (
        (x0 + pad + u * (x1 - x0 - 2 * pad)) / ATLAS,
        (y0 + pad + v * (y1 - y0 - 2 * pad)) / ATLAS,
    )


def uv_for(p, region: str, L: float, W2: float, y_b: float, y_top: float):
    x, y, z = p
    if region == "side":
        u = (x + L / 2) / L
        v = (y_top - y) / (y_top - y_b)
        if z < 0:
            u = 1.0 - u
    elif region == "roof":
        u = (x + L / 2) / L
        v = (z + W2) / (2 * W2)
    elif region == "end":
        region = "end_front" if x >= 0 else "end_rear"
        u = (z + W2) / (2 * W2)
        v = (y_top - y) / (y_top - y_b)
    elif region == "equip":
        u = ((x + L / 2) / L * 4.0) % 1.0
        v = np.clip((z + W2 * 0.5) / W2, 0.0, 1.0)
    else:
        return (
            (R_UNDER[0] + (R_UNDER[2] - R_UNDER[0]) * 0.5) / ATLAS,
            (R_UNDER[1] + (R_UNDER[3] - R_UNDER[1]) * 0.78) / ATLAS,
        )
    return region_uv(region, float(np.clip(u, 0, 1)), float(np.clip(v, 0, 1)))


# --------------------------------------------------------------------------------------
# atlas


def _iter_side_windows(x0: int, x1: int, wb0: int, wb1: int, doors_per_side: int, length: float):
    """Yield passenger window rectangles cleanly separated by door bays and structural pillars."""
    total_w = x1 - x0
    dw = max(6, int(total_w * DOOR_WIDTH_M / length))
    bay_edges = [x0 + 4]
    for i in range(doors_per_side):
        cx = x0 + int(total_w * (i + 0.5) / doors_per_side)
        bay_edges.append(cx - dw // 2 - 3)
        bay_edges.append(cx + dw // 2 + 3)
    bay_edges.append(x1 - 5)
    for k in range(0, len(bay_edges), 2):
        left, right = bay_edges[k], bay_edges[k + 1]
        if right - left < 6:
            continue
        # Split wide inter-door bays into 2 discrete window panes with a thin pillar
        if right - left >= 28:
            mid = (left + right) // 2
            yield (left, wb0 + 1, mid - 2, wb1 - 1)
            yield (mid + 2, wb0 + 1, right, wb1 - 1)
        else:
            yield (left, wb0 + 1, right, wb1 - 1)


def _encode_png(im: Image.Image) -> bytes:
    """Losslessly quantize flat/banded atlases to indexed PNG without dithering."""
    q = im.quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    buf = io.BytesIO()
    q.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def paint_atlas(length: float, height: float, doors_per_side: int,
                line_color: tuple[int, int, int] | None, livery: str,
                end_mode: str = "gangway",
                body_color: tuple[int, int, int] = BODY_COLOR) -> bytes:
    """end_mode: 'gangway' (middle car), 'head' (front cab at +X), 'tail' (rear cab at +X), 'double'."""
    band = (line_color or ROOF_COLOR) if livery == "line_coded" else LIVERY_BLUE
    im = Image.new("RGB", (ATLAS, ATLAS), UNDER_COLOR)
    d = ImageDraw.Draw(im)

    # ---- side: MF 67 style off-white body, deep RATP teal bottom band, dark glass windows, crisp doors
    x0, y0, x1, y1 = R_SIDE
    h = y1 - y0
    d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=body_color)
    skirt_px = int(h * SKIRT_TOP)
    d.rectangle([x0, y1 - skirt_px, x1 - 1, y1 - 1], fill=band)
    d.rectangle([x0, y1 - 6, x1 - 1, y1 - 1], fill=(28, 30, 34))
    wb0 = y1 - int(h * WINDOW_BAND[1])
    wb1 = y1 - int(h * WINDOW_BAND[0])
    # Dark window surround frieze, satin aluminum mullions, then glossy dark glass panes
    d.rectangle([x0, wb0 - 2, x1 - 1, wb1 + 2], fill=(38, 42, 46))
    for wx0, wy0, wx1, wy1 in _iter_side_windows(x0, x1, wb0, wb1, doors_per_side, length):
        d.rectangle([wx0 - 1, wy0 - 1, wx1 + 1, wy1 + 1], outline=(168, 174, 182))
        d.rectangle([wx0, wy0, wx1, wy1], fill=GLASS_COLOR)
    # Subtle off-white upper header border & crisp teal/metallic beltline rule
    d.rectangle([x0, y0, x1 - 1, y0 + 4], fill=ROOF_COLOR)
    d.line([x0, y1 - skirt_px, x1 - 1, y1 - skirt_px], fill=(215, 224, 224), width=1)
    # Inter-car end gasket bevel
    d.rectangle([x0, y0, x0 + 2, y1 - 1], fill=(34, 36, 40))
    d.rectangle([x1 - 3, y0, x1 - 1, y1 - 1], fill=(34, 36, 40))

    dw = max(6, int((x1 - x0) * DOOR_WIDTH_M / length))
    for i in range(doors_per_side):
        cx = x0 + int((x1 - x0) * (i + 0.5) / doors_per_side)
        dl, dr = cx - dw // 2, cx + dw // 2
        d.rectangle([dl, y0 + int(h * 0.12), dr, y1 - 7], fill=DOOR_COLOR)
        d.rectangle([dl, y1 - skirt_px, dr, y1 - 7], fill=band)
        # Door frame seal & dual door glass panes + crisp dark center gasket
        d.rectangle([dl, y0 + int(h * 0.12), dr, y1 - 7], outline=(48, 52, 56))
        d.rectangle([dl + 2, wb0 + 1, cx - 2, wb1 - 1], fill=GLASS_COLOR)
        d.rectangle([cx + 2, wb0 + 1, dr - 2, wb1 - 1], fill=GLASS_COLOR)
        d.line([cx, y0 + int(h * 0.12), cx, y1 - 7], fill=(18, 20, 22), width=2)
        # Overhead orange/red door status pilot dot
        d.rectangle([cx - 2, y0 + int(h * 0.06), cx + 2, y0 + int(h * 0.10)], fill=(235, 118, 38))

    # ---- roof
    x0, y0, x1, y1 = R_ROOF
    hh = y1 - y0
    d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=band if livery == "line_coded" else ROOF_COLOR)
    if livery == "line_coded":
        s0 = y0 + int(hh * (0.5 - ROOF_STRIP_FRAC / 2))
        s1 = y0 + int(hh * (0.5 + ROOF_STRIP_FRAC / 2))
    else:
        edge = max(4, int(hh * 0.14))
        d.rectangle([x0, y0, x1 - 1, y0 + edge], fill=body_color)
        d.rectangle([x0, y1 - 1 - edge, x1 - 1, y1 - 1], fill=body_color)
        s0, s1 = y0 + int(hh * 0.24), y1 - int(hh * 0.24)
    d.rectangle([x0, s0, x1 - 1, s1], fill=ROOF_COLOR)
    for i in range(4):
        cx = x0 + int((x1 - x0) * (i + 0.5) / 4)
        w = int((x1 - x0) * 0.06)
        d.rectangle([cx - w, s0 + 3, cx + w, s1 - 3], fill=EQUIP_COLOR)
    d.line([x0, y0, x1 - 1, y0], fill=(42, 46, 50))
    d.line([x0, y1 - 1, x1 - 1, y1 - 1], fill=(42, 46, 50))

    # ---- ends (+X and -X)
    end_configs = {
        "gangway": ((R_END_FRONT, "gangway"), (R_END_REAR, "gangway")),
        "head": ((R_END_FRONT, "head"), (R_END_REAR, "gangway")),
        "tail": ((R_END_FRONT, "tail"), (R_END_REAR, "gangway")),
        "double": ((R_END_FRONT, "head"), (R_END_REAR, "tail")),
    }[end_mode]
    for region, kind in end_configs:
        x0, y0, x1, y1 = region
        ew, eh = x1 - x0, y1 - y0
        if kind == "gangway":
            d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=(56, 60, 64))
            d.rectangle([x0, y0, x1 - 1, y0 + 6], fill=band)
            gx0, gx1 = x0 + int(ew * 0.24), x0 + int(ew * 0.76)
            d.rectangle([gx0, y0 + int(eh * 0.14), gx1, y1 - 4], fill=(32, 34, 38))
            d.rectangle([gx0 + 5, y0 + int(eh * 0.22), gx1 - 5, y0 + int(eh * 0.50)], fill=GLASS_COLOR)
        else:
            # Modern Paris Metro / MP 14 / MF 01 style dark panoramic face mask over body shell + bumper
            d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=body_color)
            d.rectangle([x0 + 2, y0 + int(eh * 0.24), x1 - 3, y1 - 5], fill=band)
            # Lower anti-climber skirt + Scharfenberg coupler pocket
            d.rectangle([x0, y1 - 8, x1 - 1, y1 - 1], fill=(24, 26, 28))
            d.rectangle([x0 + int(ew * 0.36), y1 - 7, x0 + int(ew * 0.64), y1 - 2], fill=(48, 52, 58))
            # Dark wraparound cab face surround + wraparound panoramic windshield + center wiper seam
            d.rectangle([x0 + 4, y0 + int(eh * 0.15), x1 - 5, y0 + int(eh * 0.60)], fill=(22, 25, 29))
            d.rectangle([x0 + 6, y0 + int(eh * 0.18), x1 - 7, y0 + int(eh * 0.54)], fill=GLASS_COLOR)
            d.line([(x0 + x1) // 2, y0 + int(eh * 0.20), (x0 + x1) // 2 + 2, y0 + int(eh * 0.52)],
                   fill=(46, 52, 58), width=2)
            if kind == "head":
                # Warm amber LED destination header box at brow top
                d.rectangle([x0 + int(ew * 0.18), y0 + int(eh * 0.04), x0 + int(ew * 0.82), y0 + int(eh * 0.14)],
                            fill=(12, 16, 14))
                d.rectangle([x0 + int(ew * 0.23), y0 + int(eh * 0.07), x0 + int(ew * 0.77), y0 + int(eh * 0.11)],
                            fill=(255, 185, 58))
                light_color = (255, 252, 212)
            else:
                d.rectangle([x0 + int(ew * 0.18), y0 + int(eh * 0.04), x0 + int(ew * 0.82), y0 + int(eh * 0.14)],
                            fill=(26, 28, 30))
                light_color = (242, 46, 40)
            # Crisp circular dual headlights / taillights with metallic bezel + white RATP fleet plate
            lr = max(4, int(ew * 0.09))
            ly = y0 + int(eh * 0.68)
            lx_l, lx_r = x0 + int(ew * 0.23), x0 + int(ew * 0.77)
            d.ellipse([lx_l - lr - 1, ly - lr - 1, lx_l + lr + 1, ly + lr + 1], fill=(175, 182, 190))
            d.ellipse([lx_r - lr - 1, ly - lr - 1, lx_r + lr + 1, ly + lr + 1], fill=(175, 182, 190))
            d.ellipse([lx_l - lr, ly - lr, lx_l + lr, ly + lr], fill=light_color, outline=(36, 38, 42))
            d.ellipse([lx_r - lr, ly - lr, lx_r + lr, ly + lr], fill=light_color, outline=(36, 38, 42))
            d.rectangle([x0 + int(ew * 0.38), y0 + int(eh * 0.77), x0 + int(ew * 0.62), y0 + int(eh * 0.87)],
                        fill=(248, 248, 248), outline=(36, 38, 42))

    # ---- underframe (bottom half) + HVAC fan louvres (top half) in R_UNDER
    x0, y0, x1, y1 = R_UNDER
    ym = (y0 + y1) // 2
    d.rectangle([x0, y0, x1 - 1, ym - 1], fill=(92, 96, 102))
    for gx in range(x0 + 6, x1 - 6, 10):
        d.line([gx, y0 + 3, gx, ym - 4], fill=(48, 52, 56), width=3)
    d.rectangle([x0, ym, x1 - 1, y1 - 1], fill=UNDER_COLOR)

    return _encode_png(im)


def paint_mr_atlas(length: float, doors_per_side: int) -> bytes:
    """Paint glTF metallicRoughnessTexture (G=roughness, B=metallic)."""
    # Default matte underframe / roof equipment: roughness 0.86 (220), metallic 0.05 (13)
    im = Image.new("RGB", (ATLAS, ATLAS), (0, 220, 13))
    d = ImageDraw.Draw(im)

    # Side painted body: satin off-white + RATP teal enamel (roughness 0.38 -> 97, metallic 0.24 -> 61)
    x0, y0, x1, y1 = R_SIDE
    h = y1 - y0
    d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=(0, 97, 61))
    # Lower rubber/composite sill: matte dark composite (roughness 0.84 -> 214, metallic 0.08 -> 20)
    d.rectangle([x0, y1 - 6, x1 - 1, y1 - 1], fill=(0, 214, 20))

    wb0 = y1 - int(h * WINDOW_BAND[1])
    wb1 = y1 - int(h * WINDOW_BAND[0])
    # Side doors: satin enamel/metal (roughness 0.34 -> 87, metallic 0.36 -> 92)
    dw = max(6, int((x1 - x0) * DOOR_WIDTH_M / length))
    for i in range(doors_per_side):
        cx = x0 + int((x1 - x0) * (i + 0.5) / doors_per_side)
        dl, dr = cx - dw // 2, cx + dw // 2
        d.rectangle([dl, y0 + int(h * 0.12), dr, y1 - 7], fill=(0, 87, 92))
        d.rectangle([dl + 2, wb0 + 1, cx - 2, wb1 - 1], fill=(0, 20, 40))
        d.rectangle([cx + 2, wb0 + 1, dr - 2, wb1 - 1], fill=(0, 20, 40))

    # Passenger window glass: glossy tinted glass (roughness 0.08 -> 20, metallic 0.16 -> 40)
    for wx0, wy0, wx1, wy1 in _iter_side_windows(x0, x1, wb0, wb1, doors_per_side, length):
        d.rectangle([wx0, wy0, wx1, wy1], fill=(0, 20, 40))

    # Roof body: semi-matte painted shell (roughness 0.58 -> 148, metallic 0.16 -> 41)
    rx0, ry0, rx1, ry1 = R_ROOF
    d.rectangle([rx0, ry0, rx1 - 1, ry1 - 1], fill=(0, 148, 41))

    # Ends: satin shell + glossy windshield
    for region in (R_END_FRONT, R_END_REAR):
        ex0, ey0, ex1, ey1 = region
        eh = ey1 - ey0
        d.rectangle([ex0, ey0, ex1 - 1, ey1 - 1], fill=(0, 102, 58))
        d.rectangle([ex0 + 6, ey0 + int(eh * 0.18), ex1 - 7, ey0 + int(eh * 0.54)], fill=(0, 20, 40))

    return _encode_png(im)


def paint_emissive_atlas(length: float, doors_per_side: int, end_mode: str = "gangway") -> bytes:
    """Paint emissive atlas: subtle warm interior windows + directional headlights/taillights."""
    im = Image.new("RGB", (ATLAS, ATLAS), (0, 0, 0))
    d = ImageDraw.Draw(im)

    # Subtle warm interior saloon glow through passenger & door windows
    x0, y0, x1, y1 = R_SIDE
    h = y1 - y0
    wb0 = y1 - int(h * WINDOW_BAND[1])
    wb1 = y1 - int(h * WINDOW_BAND[0])
    cabin_glow = (34, 29, 20)
    for wx0, wy0, wx1, wy1 in _iter_side_windows(x0, x1, wb0, wb1, doors_per_side, length):
        d.rectangle([wx0 + 1, wy0 + 1, wx1 - 1, wy1 - 1], fill=cabin_glow)
    dw = max(6, int((x1 - x0) * DOOR_WIDTH_M / length))
    for i in range(doors_per_side):
        cx = x0 + int((x1 - x0) * (i + 0.5) / doors_per_side)
        dl, dr = cx - dw // 2, cx + dw // 2
        if cx - dl >= 5:
            d.rectangle([dl + 3, wb0 + 2, cx - 2, wb1 - 2], fill=cabin_glow)
            d.rectangle([cx + 2, wb0 + 2, dr - 3, wb1 - 2], fill=cabin_glow)

    end_configs = {
        "gangway": (),
        "head": ((R_END_FRONT, "head"),),
        "tail": ((R_END_FRONT, "tail"),),
        "double": ((R_END_FRONT, "head"), (R_END_REAR, "tail")),
    }[end_mode]
    for region, kind in end_configs:
        ex0, ey0, ex1, ey1 = region
        ew, eh = ex1 - ex0, ey1 - ey0
        lr = max(4, int(ew * 0.09))
        ly = ey0 + int(eh * 0.68)
        lx_l, lx_r = ex0 + int(ew * 0.23), ex0 + int(ew * 0.77)
        light_color = (255, 248, 200) if kind == "head" else (255, 42, 36)
        d.ellipse([lx_l - lr, ly - lr, lx_l + lr, ly + lr], fill=light_color)
        d.ellipse([lx_r - lr, ly - lr, lx_r + lr, ly + lr], fill=light_color)
        if kind == "head":
            d.rectangle([ex0 + int(ew * 0.23), ey0 + int(eh * 0.07), ex0 + int(ew * 0.77), ey0 + int(eh * 0.11)],
                        fill=(255, 185, 58))
            d.rectangle([ex0 + 8, ey0 + int(eh * 0.22), ex1 - 9, ey0 + int(eh * 0.48)], fill=(24, 21, 16))

    return _encode_png(im)


# --------------------------------------------------------------------------------------
# glTF writer


def write_glb(path: Path, P, N, UV, I, png: bytes, mr_png: bytes, emissive_png: bytes, name: str) -> None:
    def pad4(b: bytes, fill=b"\x00") -> bytes:
        return b + fill * ((-len(b)) % 4)

    blobs, views = [], []
    offset = 0

    def add(data: bytes, **extra):
        nonlocal offset
        data = pad4(data)
        views.append(dict(buffer=0, byteOffset=offset, byteLength=len(data), **extra))
        blobs.append(data)
        offset += len(data)
        return len(views) - 1

    v_pos = add(P.astype("<f4").tobytes(), target=34962)
    v_nrm = add(N.astype("<f4").tobytes(), target=34962)
    v_uv = add(UV.astype("<f4").tobytes(), target=34962)
    v_idx = add(I.astype("<u2").tobytes(), target=34963)
    v_img = add(png)
    v_mr = add(mr_png)
    v_emi = add(emissive_png)

    gltf = {
        "asset": {"version": "2.0", "generator": "build_train_box_models.py"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": name}],
        "meshes": [{"name": name, "primitives": [{
            "attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2},
            "indices": 3, "material": 0, "mode": 4}]}],
        "accessors": [
            {"bufferView": v_pos, "componentType": 5126, "count": len(P), "type": "VEC3",
             "min": [float(x) for x in P.min(0)], "max": [float(x) for x in P.max(0)]},
            {"bufferView": v_nrm, "componentType": 5126, "count": len(N), "type": "VEC3"},
            {"bufferView": v_uv, "componentType": 5126, "count": len(UV), "type": "VEC2"},
            {"bufferView": v_idx, "componentType": 5123, "count": len(I), "type": "SCALAR"},
        ],
        "materials": [{
            "name": "body",
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": 0},
                "metallicRoughnessTexture": {"index": 1},
                "metallicFactor": 1.0,
                "roughnessFactor": 1.0,
            },
            "emissiveTexture": {"index": 2},
            "emissiveFactor": [1.0, 1.0, 1.0],
            "doubleSided": False,
        }],
        "textures": [
            {"sampler": 0, "source": 0},
            {"sampler": 0, "source": 1},
            {"sampler": 0, "source": 2},
        ],
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}],
        "images": [
            {"bufferView": v_img, "mimeType": "image/png"},
            {"bufferView": v_mr, "mimeType": "image/png"},
            {"bufferView": v_emi, "mimeType": "image/png"},
        ],
        "bufferViews": views,
        "buffers": [{"byteLength": offset}],
    }

    js = pad4(json.dumps(gltf, separators=(",", ":")).encode("utf-8"), b" ")
    bin_ = b"".join(blobs)
    total = 12 + 8 + len(js) + 8 + len(bin_)
    with path.open("wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack("<II", len(bin_), 0x004E4942)); f.write(bin_)


# --------------------------------------------------------------------------------------


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--rolling-stock", type=Path, required=True)
    ap.add_argument("--lines", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True, help="source-of-truth output directory")
    ap.add_argument("--serve-dir", type=Path, default=None, help="optional served copy")
    ap.add_argument("--doors-per-side", type=int, default=4)
    ap.add_argument("--livery", choices=("realistic", "line_coded"), default="realistic")
    ap.add_argument("--allow-line-colors", action="store_true",
                    help="Required to bake GTFS route colours into model textures.")
    ap.add_argument("--height-ratio", type=float, default=DEFAULT_HEIGHT_RATIO)
    ap.add_argument("--only-family", action="append", default=None)
    ap.add_argument("--neutral-only", action="store_true",
                    help="skip per-line variants, emit the grey-band body only")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)

    try:
        models, line_model = load_models(a.rolling_stock, a.height_ratio)
        if a.livery == "realistic" and not a.neutral_only:
            print("realistic livery is identical on every line: emitting one file per family", file=sys.stderr)
            a.neutral_only = True
        if not a.neutral_only and not a.allow_line_colors:
            print("refusing unapproved GTFS route colours: emitting neutral bodies only", file=sys.stderr)
            a.neutral_only = True
        metro_colors = load_line_colors(a.lines)
        metro_line_model, rer_count = partition_line_models(line_model, a.lines)
        print(f"line partition: {len(metro_line_model)} metro retained, {rer_count} RER excluded", file=sys.stderr)
        colors = {} if a.neutral_only else metro_colors
        if not metro_line_model:
            raise DataError("No metro rolling-stock lines have an authoritative line colour")
        families: dict[str, dict] = {}
        for model_id in sorted(set(metro_line_model.values())):
            m = models[model_id]
            fam = m["family"]
            prev = families.get(fam)
            if prev and (prev["length_m"], prev["width_m"], prev["height_m"]) != \
                        (m["length_m"], m["width_m"], m["height_m"]):
                print(f"note: family {fam} spans differing dimensions "
                      f"({prev['model_id']} vs {m['model_id']}); using the larger car",
                      file=sys.stderr)
                if m["length_m"] < prev["length_m"]:
                    continue
            families[fam] = m
        combos: dict[str, set[str]] = {}
        for line, mid in metro_line_model.items():
            combos.setdefault(models[mid]["family"], set()).add(line)
    except (DataError, KeyError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    if a.only_family:
        families = {k: v for k, v in families.items() if k in set(a.only_family)}

    a.out.mkdir(parents=True, exist_ok=True)
    previous_index = a.out / "generated-index.json"
    if previous_index.exists() and not a.dry_run:
        for entry in json.loads(previous_index.read_text(encoding="utf-8")).get("assets", []):
            stale = a.out / entry.get("file", "")
            if stale.suffix == ".glb" and stale.is_file():
                stale.unlink()
        for family in {*DRIVE_TYPE_TO_FAMILY.values(), "automatic_recent"}:
            for stale in a.out.glob(f"{family}__*.glb"):
                stale.unlink()
    if a.serve_dir:
        a.serve_dir.mkdir(parents=True, exist_ok=True)

    index = {"generator": "build_train_box_models.py", "origin": ORIGIN_CONTRACT,
             "long_axis": LONG_AXIS, "atlas_px": ATLAS, "livery": "clean_room_authored",
             "line_colors_baked": bool(a.allow_line_colors and not a.neutral_only),
             "assets": []}

    for fam, m in sorted(families.items()):
        geom_neutral = build_geometry(m["length_m"], m["width_m"], m["height_m"], cab=False)
        geom_cab = build_geometry(m["length_m"], m["width_m"], m["height_m"], cab=True)
        mr_png = paint_mr_atlas(m["length_m"], a.doors_per_side)
        emissive_gangway = paint_emissive_atlas(m["length_m"], a.doors_per_side, "gangway")
        emissive_head = paint_emissive_atlas(m["length_m"], a.doors_per_side, "head")
        emissive_tail = paint_emissive_atlas(m["length_m"], a.doors_per_side, "tail")

        variants = [(None, "neutral")] + (
            [] if a.neutral_only else [(colors[l], l) for l in sorted(combos.get(fam, ()))])
        for color, label in variants:
            roles = (
                ("", geom_neutral, "gangway", emissive_gangway),
                ("__cab", geom_cab, "head", emissive_head),
                ("__tail", geom_cab, "tail", emissive_tail),
            )
            for suffix, (P, N, UV, I), end_mode, emi_png in roles:
                tris = len(I) // 3
                png = paint_atlas(m["length_m"], m["height_m"], a.doors_per_side, color, a.livery, end_mode)
                name = f"{fam}__{label}{suffix}"
                dest = a.out / f"{name}.glb"
                if not a.dry_run:
                    write_glb(dest, P, N, UV, I, png, mr_png, emi_png, name)
                    if a.serve_dir:
                        (a.serve_dir / dest.name).write_bytes(dest.read_bytes())
                size = dest.stat().st_size if dest.exists() else 0
                index["assets"].append({
                    "file": dest.name, "family": fam, "line": None if label == "neutral" else label,
                    "role": suffix.lstrip("_") or "neutral",
                    "model_id": m["model_id"], "triangles": tris, "vertices": len(P),
                    "bytes": size,
                    "dimensions_m": {"length_x": m["length_m"], "width_z": m["width_m"],
                                     "height_y": m["height_m"]},
                    "height_source": m["height_source"], "height_measured": m["height_measured"],
                    "grazing_camera_approved": m["height_measured"],
                    "sha256": hashlib.sha256(dest.read_bytes()).hexdigest() if dest.exists() else None,
                })
                print(f"{dest.name:42s} {tris:4d} tris  {len(P):4d} verts  {size/1024:6.1f} KiB")

    if not a.dry_run:
        (a.out / "generated-index.json").write_text(json.dumps(index, indent=2), encoding="utf-8")
    print(f"\n{len(index['assets'])} files -> {a.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
