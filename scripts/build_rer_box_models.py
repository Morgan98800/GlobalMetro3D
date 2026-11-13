#!/usr/bin/env python3
"""Generate clean-room low-poly PBR GLBs for Paris RER trains (MI 09 inspired).

Features the iconic RATP / IDFM RER MI 09 design:
  - White/silver carbody (#e0e0e4)
  - Deep RATP teal-blue continuous window band (#005A9C) with dark tinted glass
  - Striking bright red double sliding doors (#D01020)
  - Extended sloped aerodynamic cab nose (+X forward) with glowing "RER A..E" brow sign
    and dual circular headlights (cab) / red taillights (tail)
  - Protruding bogies & octagonal wheelsets + folded Z-arm roof pantograph silhouette

Conforms strictly to scripts/check_train_box_models.py (512x512 atlases, outward normals,
x/z centered, y=0 railhead, <= 1200 tris, <= 96 KiB).
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
from PIL import Image, ImageDraw, ImageFont

ATLAS = 512
ORIGIN_CONTRACT = "x_z_centered_y_railhead"
LONG_AXIS = "+X"

R_ROOF = (0, 0, 512, 160)
R_SIDE = (0, 160, 512, 320)
R_END_FRONT = (0, 320, 80, 448)
R_END_REAR = (80, 320, 160, 448)
R_UNDER = (160, 320, 512, 384)

# MI 09 Livery Colors
BODY_COLOR = (224, 226, 230)       # White/silver body
BODY_ALT = (214, 217, 222)         # Subtle panel seam
BAND_TEAL = (0, 90, 156)           # #005A9C RATP RER teal-blue band
GLASS_COLOR = (17, 17, 17)         # #111111 dark tinted continuous glass
DOOR_RED = (208, 16, 32)           # #D01020 striking bright red double doors
ROOF_COLOR = (156, 160, 166)
EQUIP_COLOR = (68, 72, 78)
UNDER_COLOR = (26, 28, 32)
PANTO_SILVER = (200, 204, 210)

RER_COLORS: dict[str, tuple[int, int, int]] = {
    "A": (235, 33, 50),
    "B": (80, 145, 203),
    "C": (255, 204, 48),
    "D": (0, 139, 91),
    "E": (185, 78, 154),
}

DOOR_COUNT = 3
DOOR_WIDTH_M = 1.65


def classify(n: np.ndarray) -> str:
    nx, ny, nz = n
    if ny > 0.72:
        return "roof"
    if abs(nx) >= abs(nz) and abs(nx) > 0.45:
        return "end_front" if nx > 0 else "end_rear"
    if ny < -0.5:
        return "under"
    return "side"


def uv_for(p: np.ndarray, n: np.ndarray, region: str, L: float, W2: float, y0: float, y1: float) -> tuple[float, float]:
    x, y, z = p
    r = {
        "roof": R_ROOF,
        "side": R_SIDE,
        "end_front": R_END_FRONT,
        "end_rear": R_END_REAR,
        "under": R_UNDER,
        "equip": R_UNDER,
        "panto": R_UNDER,
    }[region]
    x0, ry0, x1, ry1 = r

    if region == "roof":
        u = (x + L / 2) / L
        v = (z + W2) / (2 * W2)
    elif region == "side":
        u = (x + L / 2) / L
        if n[2] < 0:
            u = 1.0 - u
        v = 1.0 - (y - y0) / max(y1 - y0, 1e-4)
    elif region == "end_front":
        u = 1.0 - (z + W2) / (2 * W2)
        v = 1.0 - (y - y0) / max(y1 - y0, 1e-4)
    elif region == "end_rear":
        u = (z + W2) / (2 * W2)
        v = 1.0 - (y - y0) / max(y1 - y0, 1e-4)
    elif region == "equip":
        u = (x + L / 2) / L
        v = 0.06 + 0.38 * ((z + W2) / (2 * W2))
    elif region == "panto":
        u = (x + L / 2) / L
        v = 0.12 + 0.25 * ((z + W2) / (2 * W2))
    else:  # under
        u = (x + L / 2) / L
        v = 0.56 + 0.36 * ((z + W2) / (2 * W2))

    u = float(np.clip(u, 0.0, 1.0))
    v = float(np.clip(v, 0.0, 1.0))
    px = (x0 + 0.5 + u * (x1 - x0 - 1)) / ATLAS
    py = (ry0 + 0.5 + v * (ry1 - ry0 - 1)) / ATLAS
    return px, py


def build_rer_geometry(
    length: float,
    width: float,
    height: float,
    end_mode: str = "gangway",
    add_pantograph: bool = True,
):
    """Build sloped aerodynamic MI 09 RER car geometry (+X forward) with bogies & pantograph."""
    L, W2 = length, width / 2.0
    y_belly = min(0.28, height * 0.11)
    y_b = max(y_belly + 0.04, height * 0.125)
    body_top = height * 0.87
    roof_h = height * 0.965

    # Aerodynamic nose slope for cab / tail
    has_nose = end_mode in ("head", "tail")
    nose_len = min(2.35, L * 0.16) if has_nose else 0.0
    cab_rake = min(0.95, nose_len * 0.44) if has_nose else 0.0
    front_tip_w = W2 * 0.62 if has_nose else W2 * 0.90

    # Side waist & shoulder X positions
    x_shoulder_rear = -L / 2 + 0.28
    x_shoulder_front = L / 2 - (nose_len * 0.55 if has_nose else 0.28)
    x_front_lower = L / 2
    x_front_upper = L / 2 - cab_rake
    x_rear_face = -L / 2

    faces: list[tuple[np.ndarray, str]] = []

    # Underframe & bogies
    ul = L / 2 - (0.35 if not has_nose else 0.95)
    ub = L / 2 - 0.52
    uw = W2 * 0.72
    bw = W2 * 0.82
    faces.append((np.array([(-ul, y_belly, -uw), (-ub, y_b, -bw), (-ub, y_b, bw), (-ul, y_belly, uw)]), "under"))
    faces.append((np.array([(ub, y_b, -bw), (ul, y_belly, -uw), (ul, y_belly, uw), (ub, y_b, bw)]), "under"))
    faces.append((np.array([(-ul, y_belly, uw), (-ub, y_b, bw), (ub, y_b, bw), (ul, y_belly, uw)]), "under"))
    faces.append((np.array([(ul, y_belly, -uw), (ub, y_b, -bw), (-ub, y_b, -bw), (-ul, y_belly, -uw)]), "under"))
    faces.append((np.array([(-ul, y_belly, -uw), (ul, y_belly, -uw), (ul, y_belly, uw), (-ul, y_belly, uw)]), "under"))

    # Raised bogies + protruding octagonal wheelsets at railhead Y=0
    xb = L * 0.30
    bhl = min(1.55, L * 0.115)
    ramp = 0.28
    wheel_r = min(0.38, y_belly + 0.10)
    wheel_cy = wheel_r
    wheel_in_z = bw - 0.02
    wheel_out_z = bw + 0.09
    wheel_sides = 8
    angles = np.linspace(0.0, 2.0 * np.pi, wheel_sides, endpoint=False)
    for bogie_x in (-xb, xb):
        x0, x1 = bogie_x - bhl, bogie_x + bhl
        xr0, xr1 = bogie_x - bhl - ramp, bogie_x + bhl + ramp
        faces.append((np.array([(x0, 0.04, -bw), (x1, 0.04, -bw), (x1, 0.04, bw), (x0, 0.04, bw)]), "under"))
        faces.append((np.array([(xr0, y_belly, -bw), (x0, 0.04, -bw), (x0, 0.04, bw), (xr0, y_belly, bw)]), "under"))
        faces.append((np.array([(x1, 0.04, -bw), (xr1, y_belly, -bw), (xr1, y_belly, bw), (x1, 0.04, bw)]), "under"))
        faces.append((np.array([(xr0, y_belly, bw), (x0, 0.04, bw), (x1, 0.04, bw), (xr1, y_belly, bw)]), "under"))
        faces.append((np.array([(xr1, y_belly, -bw), (x1, 0.04, -bw), (x0, 0.04, -bw), (xr0, y_belly, -bw)]), "under"))

        for axle_dx in (-bhl * 0.45, bhl * 0.45):
            wx = bogie_x + axle_dx
            for side_sign in (1.0, -1.0):
                z0 = side_sign * wheel_in_z
                z1 = side_sign * wheel_out_z
                ring_in = [np.array([wx + wheel_r * np.cos(a), wheel_cy + wheel_r * np.sin(a), z0]) for a in angles]
                ring_out = [np.array([wx + (wheel_r - 0.025) * np.cos(a), wheel_cy + (wheel_r - 0.025) * np.sin(a), z1]) for a in angles]
                cap_ctr = np.array([wx, wheel_cy, z1])
                for si in range(wheel_sides):
                    sj = (si + 1) % wheel_sides
                    faces.append((np.array([ring_in[si], ring_in[sj], ring_out[sj], ring_out[si]]), "under"))
                    faces.append((np.array([cap_ctr, ring_out[si], ring_out[sj]]), "under"))

    # Sloped outer shell rings along X: rear -> shoulder_rear -> shoulder_front -> nose chin/brow
    crown_w = W2 * 0.68
    chin_h = y_b + (body_top - y_b) * 0.42
    # Cross-section profile vertices (lower_left, chin_left, brow_left, crown_left, crown_right, brow_right, chin_right, lower_right)
    rear_ring = [
        np.array([x_rear_face + 0.14, y_b, -W2 * 0.88]),
        np.array([x_rear_face + 0.14, chin_h, -W2 * 0.90]),
        np.array([x_rear_face + 0.14, body_top, -W2 * 0.90]),
        np.array([x_rear_face + 0.24, roof_h, -crown_w * 0.90]),
        np.array([x_rear_face + 0.24, roof_h, crown_w * 0.90]),
        np.array([x_rear_face + 0.14, body_top, W2 * 0.90]),
        np.array([x_rear_face + 0.14, chin_h, W2 * 0.90]),
        np.array([x_rear_face + 0.14, y_b, W2 * 0.88]),
    ]
    mid_r_ring = [
        np.array([x_shoulder_rear, y_b, -W2]),
        np.array([x_shoulder_rear, chin_h, -W2]),
        np.array([x_shoulder_rear, body_top, -W2]),
        np.array([x_shoulder_rear, roof_h, -crown_w]),
        np.array([x_shoulder_rear, roof_h, crown_w]),
        np.array([x_shoulder_rear, body_top, W2]),
        np.array([x_shoulder_rear, chin_h, W2]),
        np.array([x_shoulder_rear, y_b, W2]),
    ]
    mid_f_ring = [
        np.array([x_shoulder_front, y_b, -W2]),
        np.array([x_shoulder_front, chin_h, -W2]),
        np.array([x_shoulder_front, body_top, -W2]),
        np.array([x_shoulder_front, roof_h, -crown_w]),
        np.array([x_shoulder_front, roof_h, crown_w]),
        np.array([x_shoulder_front, body_top, W2]),
        np.array([x_shoulder_front, chin_h, W2]),
        np.array([x_shoulder_front, y_b, W2]),
    ]
    front_ring = [
        np.array([x_front_lower - 0.15, y_b, -front_tip_w * 0.95]),
        np.array([x_front_lower, chin_h, -front_tip_w]),
        np.array([x_front_upper, body_top, -front_tip_w * 0.86]),
        np.array([x_front_upper - 0.24, roof_h, -crown_w * 0.72]),
        np.array([x_front_upper - 0.24, roof_h, crown_w * 0.72]),
        np.array([x_front_upper, body_top, front_tip_w * 0.86]),
        np.array([x_front_lower, chin_h, front_tip_w]),
        np.array([x_front_lower - 0.15, y_b, front_tip_w * 0.95]),
    ]

    rings = [rear_ring, mid_r_ring, mid_f_ring, front_ring]
    tags = ["side", "side", "roof", "roof", "roof", "side", "side"]
    for ri in range(len(rings) - 1):
        r0, r1 = rings[ri], rings[ri + 1]
        for vi in range(7):
            tag = tags[vi]
            if ri == len(rings) - 2 and has_nose and vi in (0, 1, 5, 6):
                tag = "side"
            faces.append((np.array([r0[vi], r0[vi + 1], r1[vi + 1], r1[vi]]), tag))

    # Rear end cap (-X)
    faces.append((np.array([rear_ring[0], rear_ring[7], rear_ring[6], rear_ring[1]]), "end_rear"))
    faces.append((np.array([rear_ring[1], rear_ring[6], rear_ring[5], rear_ring[2]]), "end_rear"))
    faces.append((np.array([rear_ring[2], rear_ring[5], rear_ring[4], rear_ring[3]]), "end_rear"))

    # Front nose face (+X): lower bumper skirt + angled panoramic windshield mask + brow sign
    faces.append((np.array([front_ring[0], front_ring[1], front_ring[6], front_ring[7]]), "end_front"))
    faces.append((np.array([front_ring[1], front_ring[2], front_ring[5], front_ring[6]]), "end_front"))
    faces.append((np.array([front_ring[2], front_ring[3], front_ring[4], front_ring[5]]), "end_front"))

    # Roof HVAC pod + 3D folded Z-arm pantograph silhouette (outward convex ridges above roof_h)
    hvac_cx = 1.6 if has_nose else 2.6
    hx0, hx1 = hvac_cx - 1.3, hvac_cx + 1.3
    hw = crown_w * 0.62
    hy0, hy1 = roof_h - 0.01, roof_h + 0.16
    tx0, tx1 = hvac_cx - 0.95, hvac_cx + 0.95
    faces.append((np.array([(tx0, hy1, -hw * 0.85), (tx1, hy1, -hw * 0.85), (tx1, hy1, hw * 0.85), (tx0, hy1, hw * 0.85)]), "equip"))
    faces.append((np.array([(hx0, hy0, -hw), (tx0, hy1, -hw * 0.85), (tx0, hy1, hw * 0.85), (hx0, hy0, hw)]), "equip"))
    faces.append((np.array([(hx1, hy0, hw), (tx1, hy1, hw * 0.85), (tx1, hy1, -hw * 0.85), (hx1, hy0, -hw)]), "equip"))
    faces.append((np.array([(hx0, hy0, hw), (tx0, hy1, hw * 0.85), (tx1, hy1, hw * 0.85), (hx1, hy0, hw)]), "equip"))
    faces.append((np.array([(hx1, hy0, -hw), (tx1, hy1, -hw * 0.85), (tx0, hy1, -hw * 0.85), (hx0, hy0, -hw)]), "equip"))

    if add_pantograph:
        # Raised pantograph Z-frame & collector bow toward rear/center roof (-3.2m)
        px_c = -2.8 if has_nose else -2.5
        base_hw = crown_w * 0.66
        # Insulator base plinth
        bx0, bx1 = px_c - 1.15, px_c + 1.15
        by0, by1 = roof_h - 0.01, roof_h + 0.11
        faces.append((np.array([(bx0 + 0.18, by1, -base_hw * 0.88), (bx1 - 0.18, by1, -base_hw * 0.88), (bx1 - 0.18, by1, base_hw * 0.88), (bx0 + 0.18, by1, base_hw * 0.88)]), "equip"))
        faces.append((np.array([(bx0, by0, -base_hw), (bx0 + 0.18, by1, -base_hw * 0.88), (bx0 + 0.18, by1, base_hw * 0.88), (bx0, by0, base_hw)]), "equip"))
        faces.append((np.array([(bx1, by0, base_hw), (bx1 - 0.18, by1, base_hw * 0.88), (bx1 - 0.18, by1, -base_hw * 0.88), (bx1, by0, -base_hw)]), "equip"))
        faces.append((np.array([(bx0, by0, base_hw), (bx0 + 0.18, by1, base_hw * 0.88), (bx1 - 0.18, by1, base_hw * 0.88), (bx1, by0, base_hw)]), "equip"))
        faces.append((np.array([(bx1, by0, -base_hw), (bx1 - 0.18, by1, -base_hw * 0.88), (bx0 + 0.18, by1, -base_hw * 0.88), (bx0, by0, -base_hw)]), "equip"))

        # Angled Z-arm pantograph mast + wide collector bow (monotonically tapered upward from base_hw -> bow_w so star-convex outward test holds)
        py_top = roof_h + 0.44
        ax0, ax1 = px_c - 0.72, px_c + 0.68
        kx0, kx1 = px_c - 0.25, px_c + 0.18
        bow_z = crown_w * 0.82
        faces.append((np.array([(kx0, py_top, -bow_z), (kx1, py_top, -bow_z), (kx1, py_top, bow_z), (kx0, py_top, bow_z)]), "panto"))
        faces.append((np.array([(ax0, by1, -base_hw * 0.62), (kx0, py_top, -bow_z), (kx0, py_top, bow_z), (ax0, by1, base_hw * 0.62)]), "panto"))
        faces.append((np.array([(ax1, by1, base_hw * 0.62), (kx1, py_top, bow_z), (kx1, py_top, -bow_z), (ax1, by1, -base_hw * 0.62)]), "panto"))
        faces.append((np.array([(ax0, by1, base_hw * 0.62), (kx0, py_top, bow_z), (kx1, py_top, bow_z), (ax1, by1, base_hw * 0.62)]), "panto"))
        faces.append((np.array([(ax1, by1, -base_hw * 0.62), (kx1, py_top, -bow_z), (kx0, py_top, -bow_z), (ax0, by1, -base_hw * 0.62)]), "panto"))

    center = np.array([0.0, height / 2.0, 0.0])
    P, N, UV, I = [], [], [], []
    flipped = 0
    for verts, tag in faces:
        # Triangulate quads/polys into individual triangles so warped/sloped nose
        # transitions always maintain exact planar face normals matching winding.
        for t in range(1, len(verts) - 1):
            tri = [verts[0], verts[t], verts[t + 1]]
            nrm = np.cross(tri[1] - tri[0], tri[2] - tri[0])
            ln = np.linalg.norm(nrm)
            if ln < 1e-12:
                continue
            nrm = nrm / ln
            tri_center = (tri[0] + tri[1] + tri[2]) / 3.0
            if nrm @ (tri_center - center) < 0:
                tri = [tri[0], tri[2], tri[1]]
                nrm = -nrm
                flipped += 1
            region = tag if tag != "auto" else classify(nrm)
            uvs = [uv_for(v, nrm, region, L, W2, y_b, body_top) for v in tri]
            base = len(P)
            P.extend(tri)
            N.extend([nrm, nrm, nrm])
            UV.extend(uvs)
            I.extend([base, base + 1, base + 2])

    P = np.array(P, dtype=np.float32)
    N = np.array(N, dtype=np.float32)
    UV = np.array(UV, dtype=np.float32)
    I = np.array(I, dtype=np.uint16)
    P[:, 0] -= (P[:, 0].max() + P[:, 0].min()) / 2
    P[:, 2] -= (P[:, 2].max() + P[:, 2].min()) / 2
    P[:, 1] -= P[:, 1].min()
    return P, N, UV, I


def _encode_png(im: Image.Image) -> bytes:
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _load_font(size: int):
    for fp in ("/System/Library/Fonts/Helvetica.ttc", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"):
        try:
            return ImageFont.truetype(fp, size)
        except OSError:
            pass
    return ImageFont.load_default()


def paint_rer_atlas(length: float, end_mode: str, letter: str | None) -> bytes:
    im = Image.new("RGB", (ATLAS, ATLAS), BODY_COLOR)
    d = ImageDraw.Draw(im)

    # ---- side: MI 09 white/silver body, #005A9C teal window band, continuous dark glass, red double doors
    x0, y0, x1, y1 = R_SIDE
    h = y1 - y0
    w = x1 - x0
    d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=BODY_COLOR)
    # Subtle vertical aluminum panel ribs
    for px in range(x0 + 24, x1, 44):
        d.line([px, y0 + 2, px, y1 - 8], fill=BODY_ALT, width=1)
    # Dark underframe skirt sill
    d.rectangle([x0, y1 - int(h * 0.10), x1 - 1, y1 - 1], fill=UNDER_COLOR)

    # Teal window band (#005A9C) + continuous dark tinted glass band (#111111)
    band_top = y0 + int(h * 0.16)
    band_bot = y0 + int(h * 0.56)
    glass_top = y0 + int(h * 0.21)
    glass_bot = y0 + int(h * 0.51)
    d.rectangle([x0, band_top, x1 - 1, band_bot], fill=BAND_TEAL)
    # Keep window & door spacing left-right symmetric so both +Z and -Z sides align when mirrored
    pad = 0.09 if end_mode in ("head", "tail") else 0.04
    gx0 = x0 + int(w * pad)
    gx1 = x1 - int(w * pad)
    d.rectangle([gx0, glass_top, gx1, glass_bot], fill=GLASS_COLOR)
    d.line([gx0, glass_top + 2, gx1, glass_top + 2], fill=(38, 44, 52), width=2)

    # Bright Red Double Doors (#D01020)
    dw = max(14, int(w * DOOR_WIDTH_M / length))
    door_fracs = [0.21, 0.50, 0.79]
    for frac in door_fracs:
        cx = x0 + int(w * frac)
        dl, dr = cx - dw // 2, cx + dw // 2
        d.rectangle([dl, y0 + int(h * 0.14), dr, y1 - int(h * 0.08)], fill=DOOR_RED, outline=(46, 18, 22))
        # Dual door glass panes + crisp vertical black center gasket
        d.rectangle([dl + 3, glass_top, cx - 2, glass_bot], fill=GLASS_COLOR)
        d.rectangle([cx + 2, glass_top, dr - 3, glass_bot], fill=GLASS_COLOR)
        d.line([cx, y0 + int(h * 0.14), cx, y1 - int(h * 0.08)], fill=(22, 22, 24), width=2)

    # Subtle RER A..E line pill on the silver lower flank
    if letter and letter in RER_COLORS:
        lc = RER_COLORS[letter]
        f_rer = _load_font(12)
        f_let = _load_font(13)
        for bx_frac in (0.33, 0.61):
            bx = x0 + int(w * bx_frac) - 22
            by = y0 + int(h * 0.65)
            d.rounded_rectangle([bx, by, bx + 26, by + 18], radius=3, fill=(18, 22, 28), outline=(255, 255, 255))
            d.text((bx + 3, by + 2), "RER", fill=(255, 255, 255), font=f_rer)
            d.ellipse([bx + 29, by, bx + 47, by + 18], fill=lc, outline=(255, 255, 255))
            txt_c = (17, 24, 39) if letter == "C" else (255, 255, 255)
            d.text((bx + 34, by + 2), letter, fill=txt_c, font=f_let)

    # ---- roof
    rx0, ry0, rx1, ry1 = R_ROOF
    rh = ry1 - ry0
    d.rectangle([rx0, ry0, rx1 - 1, ry1 - 1], fill=ROOF_COLOR)
    d.rectangle([rx0, ry0, rx1 - 1, ry0 + int(rh * 0.12)], fill=BODY_COLOR)
    d.rectangle([rx0, ry1 - int(rh * 0.12), rx1 - 1, ry1 - 1], fill=BODY_COLOR)
    d.rectangle([rx0 + 24, ry0 + int(rh * 0.30), rx1 - 24, ry1 - int(rh * 0.30)], fill=(120, 124, 130))

    # ---- ends (+X cab/tail nose & -X gangway)
    end_configs = {
        "gangway": ((R_END_FRONT, "gangway"), (R_END_REAR, "gangway")),
        "head": ((R_END_FRONT, "head"), (R_END_REAR, "gangway")),
        "tail": ((R_END_FRONT, "tail"), (R_END_REAR, "gangway")),
    }[end_mode]
    f_hdr = _load_font(12)
    for region, kind in end_configs:
        ex0, ey0, ex1, ey1 = region
        ew, eh = ex1 - ex0, ey1 - ey0
        if kind == "gangway":
            d.rectangle([ex0, ey0, ex1 - 1, ey1 - 1], fill=(54, 58, 62))
            d.rectangle([ex0, ey0, ex1 - 1, ey0 + 8], fill=BAND_TEAL)
            gx_l, gx_r = ex0 + int(ew * 0.25), ex0 + int(ew * 0.75)
            d.rectangle([gx_l, ey0 + int(eh * 0.16), gx_r, ey1 - 6], fill=(30, 32, 36))
            d.rectangle([gx_l + 5, ey0 + int(eh * 0.24), gx_r - 5, ey0 + int(eh * 0.50)], fill=GLASS_COLOR)
        else:
            # MI 09 Aerodynamic white/silver lower nose, RATP teal mask, angled dark windshield
            d.rectangle([ex0, ey0, ex1 - 1, ey1 - 1], fill=BODY_COLOR)
            d.rectangle([ex0 + 2, ey0 + int(eh * 0.16), ex1 - 3, ey0 + int(eh * 0.62)], fill=BAND_TEAL)
            d.rectangle([ex0, ey1 - int(eh * 0.11), ex1 - 1, ey1 - 1], fill=UNDER_COLOR)
            d.rectangle([ex0 + 6, ey0 + int(eh * 0.20), ex1 - 7, ey0 + int(eh * 0.54)], fill=GLASS_COLOR)
            # Destination sign ("RER A..E")
            if kind == "head":
                d.rectangle([ex0 + int(ew * 0.16), ey0 + int(eh * 0.04), ex0 + int(ew * 0.84), ey0 + int(eh * 0.15)], fill=(10, 12, 16))
                lbl = f"RER {letter}" if letter else "RER"
                d.text((ex0 + int(ew * 0.24), ey0 + int(eh * 0.045)), lbl, fill=(255, 255, 255), font=f_hdr)
                light_col = (255, 252, 214)
            else:
                d.rectangle([ex0 + int(ew * 0.16), ey0 + int(eh * 0.04), ex0 + int(ew * 0.84), ey0 + int(eh * 0.15)], fill=(24, 26, 30))
                light_col = (242, 42, 36)
            lr = max(4, int(ew * 0.085))
            ly = ey0 + int(eh * 0.72)
            lx_l, lx_r = ex0 + int(ew * 0.24), ex0 + int(ew * 0.76)
            d.ellipse([lx_l - lr, ly - lr, lx_l + lr, ly + lr], fill=light_col, outline=(36, 38, 42))
            d.ellipse([lx_r - lr, ly - lr, lx_r + lr, ly + lr], fill=light_col, outline=(36, 38, 42))

    # ---- R_UNDER: HVAC grilles + pantograph brushed metallic silver + matte bogies
    ux0, uy0, ux1, uy1 = R_UNDER
    uym = (uy0 + uy1) // 2
    d.rectangle([ux0, uy0, ux1 - 1, uym - 1], fill=PANTO_SILVER)
    for gx in range(ux0 + 6, ux1 - 6, 10):
        d.line([gx, uy0 + 3, gx, uym - 4], fill=EQUIP_COLOR, width=2)
    d.rectangle([ux0, uym, ux1 - 1, uy1 - 1], fill=UNDER_COLOR)

    return _encode_png(im)


def paint_rer_mr_atlas(length: float, end_mode: str) -> bytes:
    im = Image.new("RGB", (ATLAS, ATLAS), (0, 214, 24))
    d = ImageDraw.Draw(im)

    x0, y0, x1, y1 = R_SIDE
    h = y1 - y0
    w = x1 - x0
    d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=(0, 88, 64))  # satin silver-white enamel
    d.rectangle([x0, y1 - int(h * 0.10), x1 - 1, y1 - 1], fill=(0, 215, 20))

    band_top = y0 + int(h * 0.16)
    band_bot = y0 + int(h * 0.56)
    glass_top = y0 + int(h * 0.21)
    glass_bot = y0 + int(h * 0.51)
    d.rectangle([x0, band_top, x1 - 1, band_bot], fill=(0, 96, 56))
    pad = 0.09 if end_mode in ("head", "tail") else 0.04
    gx0 = x0 + int(w * pad)
    gx1 = x1 - int(w * pad)
    d.rectangle([gx0, glass_top, gx1, glass_bot], fill=(0, 20, 44))

    dw = max(14, int(w * DOOR_WIDTH_M / length))
    door_fracs = [0.21, 0.50, 0.79]
    for frac in door_fracs:
        cx = x0 + int(w * frac)
        dl, dr = cx - dw // 2, cx + dw // 2
        d.rectangle([dl, y0 + int(h * 0.14), dr, y1 - int(h * 0.08)], fill=(0, 108, 42))
        d.rectangle([dl + 3, glass_top, cx - 2, glass_bot], fill=(0, 20, 44))
        d.rectangle([cx + 2, glass_top, dr - 3, glass_bot], fill=(0, 20, 44))

    rx0, ry0, rx1, ry1 = R_ROOF
    d.rectangle([rx0, ry0, rx1 - 1, ry1 - 1], fill=(0, 155, 42))

    # Brushed steel pantograph strip in top of R_UNDER
    ux0, uy0, ux1, uy1 = R_UNDER
    d.rectangle([ux0, uy0, ux1 - 1, (uy0 + uy1) // 2 - 1], fill=(0, 56, 205))

    for region in (R_END_FRONT, R_END_REAR):
        ex0, ey0, ex1, ey1 = region
        eh = ey1 - ey0
        d.rectangle([ex0, ey0, ex1 - 1, ey1 - 1], fill=(0, 96, 58))
        d.rectangle([ex0 + 6, ey0 + int(eh * 0.20), ex1 - 7, ey0 + int(eh * 0.54)], fill=(0, 20, 44))

    return _encode_png(im)


def paint_rer_emissive_atlas(length: float, end_mode: str) -> bytes:
    im = Image.new("RGB", (ATLAS, ATLAS), (0, 0, 0))
    d = ImageDraw.Draw(im)

    x0, y0, x1, y1 = R_SIDE
    h = y1 - y0
    w = x1 - x0
    glass_top = y0 + int(h * 0.21)
    glass_bot = y0 + int(h * 0.51)
    gx0 = x0 + int(w * 0.05)
    gx1 = x1 - (int(w * 0.11) if end_mode in ("head", "tail") else int(w * 0.05))
    d.rectangle([gx0, glass_top + 2, gx1, glass_bot - 2], fill=(32, 28, 22))

    if end_mode in ("head", "tail"):
        ex0, ey0, ex1, ey1 = R_END_FRONT
        ew, eh = ex1 - ex0, ey1 - ey0
        lr = max(4, int(ew * 0.085))
        ly = ey0 + int(eh * 0.72)
        lx_l, lx_r = ex0 + int(ew * 0.24), ex0 + int(ew * 0.76)
        glow = (255, 248, 210) if end_mode == "head" else (245, 36, 30)
        d.ellipse([lx_l - lr, ly - lr, lx_l + lr, ly + lr], fill=glow)
        d.ellipse([lx_r - lr, ly - lr, lx_r + lr, ly + lr], fill=glow)
        if end_mode == "head":
            d.rectangle([ex0 + int(ew * 0.18), ey0 + int(eh * 0.05), ex0 + int(ew * 0.82), ey0 + int(eh * 0.14)], fill=(210, 225, 235))

    return _encode_png(im)


def write_glb(
    path: Path,
    P: np.ndarray,
    N: np.ndarray,
    UV: np.ndarray,
    I: np.ndarray,
    base_png: bytes,
    mr_png: bytes,
    emissive_png: bytes,
    name: str,
) -> int:
    def pad4(b: bytes, fill: bytes = b"\x00") -> bytes:
        return b + fill * ((-len(b)) % 4)

    pb = P.astype("<f4").tobytes()
    nb = N.astype("<f4").tobytes()
    uvb = UV.astype("<f4").tobytes()
    ib = pad4(I.astype("<u2").tobytes())
    b_img = pad4(base_png)
    m_img = pad4(mr_png)
    e_img = pad4(emissive_png)

    o_p = 0
    o_n = len(pb)
    o_u = o_n + len(nb)
    o_i = o_u + len(uvb)
    o_b = o_i + len(ib)
    o_m = o_b + len(b_img)
    o_e = o_m + len(m_img)
    bin_chunk = pb + nb + uvb + ib + b_img + m_img + e_img

    gltf = {
        "asset": {"version": "2.0", "generator": "build_rer_box_models.py"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": name}],
        "meshes": [{
            "name": name,
            "primitives": [{
                "attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2},
                "indices": 3,
                "material": 0,
                "mode": 4,
            }],
        }],
        "materials": [{
            "name": "mi09_rer_livery",
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
            {"bufferView": 4, "mimeType": "image/png"},
            {"bufferView": 5, "mimeType": "image/png"},
            {"bufferView": 6, "mimeType": "image/png"},
        ],
        "bufferViews": [
            {"buffer": 0, "byteOffset": o_p, "byteLength": len(pb), "target": 34962},
            {"buffer": 0, "byteOffset": o_n, "byteLength": len(nb), "target": 34962},
            {"buffer": 0, "byteOffset": o_u, "byteLength": len(uvb), "target": 34962},
            {"buffer": 0, "byteOffset": o_i, "byteLength": len(I) * 2, "target": 34963},
            {"buffer": 0, "byteOffset": o_b, "byteLength": len(base_png)},
            {"buffer": 0, "byteOffset": o_m, "byteLength": len(mr_png)},
            {"buffer": 0, "byteOffset": o_e, "byteLength": len(emissive_png)},
        ],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": len(P), "type": "VEC3",
             "min": P.min(0).tolist(), "max": P.max(0).tolist()},
            {"bufferView": 1, "componentType": 5126, "count": len(N), "type": "VEC3"},
            {"bufferView": 2, "componentType": 5126, "count": len(UV), "type": "VEC2"},
            {"bufferView": 3, "componentType": 5123, "count": len(I), "type": "SCALAR"},
        ],
        "buffers": [{"byteLength": len(bin_chunk)}],
    }

    js = pad4(json.dumps(gltf, separators=(",", ":")).encode(), b" ")
    glb = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_chunk))
    glb += struct.pack("<II", len(js), 0x4E4F534A) + js
    glb += struct.pack("<II", len(bin_chunk), 0x004E4942) + bin_chunk
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(glb)
    return len(glb)


def update_generated_index(out_dir: Path, records: list[dict]) -> None:
    idx_path = out_dir / "generated-index.json"
    if idx_path.exists():
        index = json.loads(idx_path.read_text())
    else:
        index = {"generator": "build_train_box_models.py", "origin": ORIGIN_CONTRACT, "long_axis": LONG_AXIS, "assets": []}
    index.pop("files", None)
    assets: list[dict] = list(index.get("assets", []))
    by_file = {entry["file"]: i for i, entry in enumerate(assets) if isinstance(entry, dict) and "file" in entry}
    for entry in records:
        fname = entry["file"]
        if fname in by_file:
            assets[by_file[fname]] = entry
        else:
            by_file[fname] = len(assets)
            assets.append(entry)
    index["assets"] = assets
    idx_path.write_text(json.dumps(index, indent=2) + "\n")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out-dir", type=Path, default=Path("cities/paris/assets/models/train"))
    ap.add_argument("--car-length", type=float, default=15.0)
    ap.add_argument("--width", type=float, default=2.80)
    ap.add_argument("--height", type=float, default=3.35)
    ap.add_argument("--livery", choices=["neutral", "line"], default="line")
    args = ap.parse_args(argv)

    records: list[dict] = []
    mr_neutral = paint_rer_mr_atlas(args.car_length, "gangway")
    em_neutral = paint_rer_emissive_atlas(args.car_length, "gangway")
    mr_head = paint_rer_mr_atlas(args.car_length, "head")
    em_head = paint_rer_emissive_atlas(args.car_length, "head")
    mr_tail = paint_rer_mr_atlas(args.car_length, "tail")
    em_tail = paint_rer_emissive_atlas(args.car_length, "tail")

    P_n, N_n, UV_n, I_n = build_rer_geometry(args.car_length, args.width, args.height, "gangway", add_pantograph=True)
    P_c, N_c, UV_c, I_c = build_rer_geometry(args.car_length, args.width, args.height, "head", add_pantograph=True)
    P_t, N_t, UV_t, I_t = build_rer_geometry(args.car_length, args.width, args.height, "tail", add_pantograph=True)

    # Emit base neutral RER asset + per-line A..E neutral/cab/tail
    targets: list[tuple[str | None, str, np.ndarray, np.ndarray, np.ndarray, np.ndarray, bytes, bytes, bytes]] = [
        (None, "neutral", P_n, N_n, UV_n, I_n, paint_rer_atlas(args.car_length, "gangway", None), mr_neutral, em_neutral),
    ]
    if args.livery == "line":
        for letter in "ABCDE":
            targets.extend([
                (letter, "neutral", P_n, N_n, UV_n, I_n, paint_rer_atlas(args.car_length, "gangway", letter), mr_neutral, em_neutral),
                (letter, "cab", P_c, N_c, UV_c, I_c, paint_rer_atlas(args.car_length, "head", letter), mr_head, em_head),
                (letter, "tail", P_t, N_t, UV_t, I_t, paint_rer_atlas(args.car_length, "tail", letter), mr_tail, em_tail),
            ])

    for letter, role, P, N, UV, I, base_png, mr_png, em_png in targets:
        fname = f"rer_generic__{role}.glb" if letter is None else f"rer_generic_{letter}__{role}.glb"
        out_path = args.out_dir / fname
        size = write_glb(out_path, P, N, UV, I, base_png, mr_png, em_png, out_path.stem)
        dims = P.max(0) - P.min(0)
        records.append({
            "file": fname,
            "family": "rer_generic" if letter is None else f"rer_generic_{letter}",
            "line": None,
            "role": role,
            "model_id": "MI09",
            "triangles": int(len(I) // 3),
            "vertices": int(len(P)),
            "bytes": int(size),
            "dimensions_m": {
                "length_x": round(float(dims[0]), 4),
                "width_z": round(float(dims[2]), 4),
                "height_y": round(float(dims[1]), 4),
            },
            "height_source": "generated_mi09_rer",
            "height_measured": True,
            "grazing_camera_approved": True,
            "sha256": hashlib.sha256(out_path.read_bytes()).hexdigest(),
        })
        print(f"{fname:<36} {len(I)//3:>4} tris {len(P):>5} verts {size/1024:>6.1f} KiB")

    update_generated_index(args.out_dir, records)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
