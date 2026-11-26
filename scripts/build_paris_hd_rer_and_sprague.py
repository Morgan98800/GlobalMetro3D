#!/usr/bin/env python3
"""Sculpt high-detail, historically faithful 3D Paris RER (A, B, C, D, E) and
1930 Sprague-Thomson models in Blender 5.3.

Outputs:
  - library/<id>_cab.glb & library/<id>_car.glb (realistic length, semi-transparent
    tinted glass revealing 3D interior, meshopt-compressed without WebP)
  - map_hd/<id>__cab.glb, map_hd/<id>__tail.glb, map_hd/<id>_car.glb
    (15.0 m map-contract length with circular wheels, opaque reflective glass,
    separated headlights vs red taillights, pure glTF 2.0 with extensionsUsed=[])
"""

from __future__ import annotations

import json
import math
import struct
import subprocess
import tempfile
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
LIB_DIR = ROOT / "cities" / "paris" / "assets" / "models" / "train" / "library"
MAP_HD_DIR = ROOT / "cities" / "paris" / "assets" / "models" / "train" / "map_hd"


def clear_scene() -> None:
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh, do_unlink=True)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat, do_unlink=True)


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgb(hex_str: str) -> tuple[float, float, float]:
    h = hex_str.lstrip("#")
    r, g, b = (int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4))
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b))


def make_mat(
    name: str,
    rgb: tuple[float, float, float],
    roughness: float = 0.36,
    metallic: float = 0.12,
    alpha: float = 1.0,
    emission: tuple[float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Alpha"].default_value = alpha
        if "Coat Weight" in bsdf.inputs:
            bsdf.inputs["Coat Weight"].default_value = 0.0
        if emission is not None and emission_strength > 0:
            bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    if alpha < 0.99 and hasattr(mat, "blend_method"):
        mat.blend_method = "BLEND"
    return mat


def add_box(
    bm: bmesh.types.BMesh,
    center: tuple[float, float, float],
    size: tuple[float, float, float],
    mat_idx: int,
    rot_y: float = 0.0,
    rot_z: float = 0.0,
) -> None:
    sx, sy, sz = size
    if sx <= 1e-5 or sy <= 1e-5 or sz <= 1e-5:
        return
    m = Matrix.Translation(center)
    if abs(rot_z) > 1e-6:
        m = m @ Matrix.Rotation(rot_z, 4, "Z")
    if abs(rot_y) > 1e-6:
        m = m @ Matrix.Rotation(rot_y, 4, "Y")
    m = m @ Matrix.Diagonal((sx, sy, sz, 1.0))
    res = bmesh.ops.create_cube(bm, size=1.0, matrix=m)
    for v in res["verts"]:
        for f in v.link_faces:
            f.material_index = mat_idx


def add_cyl(
    bm: bmesh.types.BMesh,
    center: tuple[float, float, float],
    radius: float,
    depth: float,
    mat_idx: int,
    axis: str = "Y",
    segments: int = 16,
    rot_y: float = 0.0,
) -> None:
    rot = Matrix.Identity(4)
    if axis == "Y":
        rot = Matrix.Rotation(math.pi / 2, 4, "X")
    elif axis == "X":
        rot = Matrix.Rotation(math.pi / 2, 4, "Y")
    m = Matrix.Translation(center)
    if abs(rot_y) > 1e-6:
        m = m @ Matrix.Rotation(rot_y, 4, "Y")
    m = m @ rot
    res = bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segments,
        radius1=radius,
        radius2=radius,
        depth=depth,
        matrix=m,
    )
    for v in res["verts"]:
        for f in v.link_faces:
            f.material_index = mat_idx


def add_lofted_shell(
    bm: bmesh.types.BMesh,
    x_stations: list[tuple[float, float, float, float, float]],
    profile_yz: list[tuple[float, float]],
    mat_idx: int,
    cap_rear: bool = True,
    cap_front: bool = True,
) -> None:
    """Loft a closed cross-section along X stations.
    Each station: (x_base, y_scale, z_scale, z_shift, rake_x_factor).
    """
    z_vals = [p[1] for p in profile_yz]
    z_min, z_max = min(z_vals), max(z_vals)
    z_span = max(0.1, z_max - z_min)
    rings: list[list[bmesh.types.BMVert]] = []
    for x_base, ys, zs, z_off, rake in x_stations:
        ring = []
        for py, pz in profile_yz:
            frac = (pz - z_min) / z_span
            vx = x_base - rake * frac
            vy = py * ys
            vz = z_min + (pz - z_min) * zs + z_off
            ring.append(bm.verts.new((vx, vy, vz)))
        rings.append(ring)

    n = len(profile_yz)
    for ri in range(len(rings) - 1):
        r0, r1 = rings[ri], rings[ri + 1]
        for i in range(n):
            j = (i + 1) % n
            f = bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
            f.material_index = mat_idx
    if cap_rear:
        f = bm.faces.new(tuple(reversed(rings[0])))
        f.material_index = mat_idx
    if cap_front:
        f = bm.faces.new(tuple(rings[-1]))
        f.material_index = mat_idx


def add_bogies(
    bm: bmesh.types.BMesh,
    L: float,
    W: float,
    m_dark: int,
    m_metal: int,
    is_sprague: bool = False,
) -> None:
    """Add two detailed rail bogies with flanged wheels tangent to Z=0, axle boxes,
    springs, and underfloor traction/compressor equipment."""
    bogie_x = L * 0.31
    half_gauge = 0.74
    wheel_r = 0.42 if not is_sprague else 0.40
    for bx in (-bogie_x, bogie_x):
        # Side frames & central bolster
        for sy in (-half_gauge - 0.14, half_gauge + 0.14):
            add_box(bm, (bx, sy, 0.44), (2.55, 0.14, 0.24), m_dark)
            # Coil springs or leaf springs
            for sp_dx in (-0.18, 0.18):
                if is_sprague:
                    add_box(bm, (bx + sp_dx, sy, 0.34), (0.65, 0.16, 0.09), m_dark)
                else:
                    add_cyl(bm, (bx + sp_dx, sy, 0.44), 0.085, 0.24, m_metal, axis="Z", segments=10)
        add_box(bm, (bx, 0.0, 0.48), (0.72, (half_gauge + 0.16) * 2, 0.22), m_dark)

        if is_sprague:
            # Wooden 3rd-rail collector beam + shoe
            for sign in (-1.0, 1.0):
                add_box(bm, (bx, sign * (half_gauge + 0.30), 0.26), (1.75, 0.08, 0.10), m_dark)
                add_box(bm, (bx, sign * (half_gauge + 0.35), 0.18), (0.36, 0.08, 0.07), m_metal)

        # Two wheelsets per bogie (tangent to Z = 0.0)
        for ax_dx in (-0.92, 0.92):
            wx = bx + ax_dx
            add_cyl(bm, (wx, 0.0, wheel_r), 0.085, half_gauge * 2.05, m_dark, axis="Y", segments=10)
            for sign in (-1.0, 1.0):
                wy = sign * half_gauge
                # Wheel tread
                add_cyl(bm, (wx, wy, wheel_r), wheel_r, 0.13, m_metal, axis="Y", segments=18)
                # Inner flange
                add_cyl(
                    bm,
                    (wx, wy - sign * 0.065, wheel_r),
                    wheel_r + 0.032,
                    0.025,
                    m_metal,
                    axis="Y",
                    segments=18,
                )
                # Outer axle box
                add_box(bm, (wx, wy + sign * 0.15, wheel_r), (0.28, 0.14, 0.24), m_dark)

    # Underfloor traction & air-tank boxes between bogies
    mid_span = L * 0.38
    if mid_span > 2.2:
        add_box(bm, (-mid_span * 0.24, 0.0, 0.48), (mid_span * 0.44, W * 0.68, 0.36), m_dark)
        add_box(bm, (mid_span * 0.24, 0.0, 0.46), (mid_span * 0.36, W * 0.62, 0.32), m_dark)
        add_cyl(bm, (0.0, W * 0.26, 0.42), 0.18, 1.35, m_dark, axis="X", segments=12)


def add_pantograph(
    bm: bmesh.types.BMesh,
    cx: float,
    roof_z: float,
    m_dark: int,
    m_metal: int,
    compact: bool = False,
) -> None:
    """Add an articulated 3D single-arm (unijambiste) railway pantograph."""
    # 3 ceramic insulator cones + base frame
    bw = 0.90 if compact else 1.05
    add_box(bm, (cx, 0.0, roof_z + 0.03), (1.15, bw, 0.05), m_dark)
    for ix, iy in ((-0.42, -bw * 0.38), (-0.42, bw * 0.38), (0.42, 0.0)):
        add_cyl(bm, (cx + ix, iy, roof_z + 0.10), 0.065, 0.12, m_metal, axis="Z", segments=10)
    # Lower arm tilted backward (-X), upper arm tilted forward (+X)
    z0 = roof_z + 0.16
    add_box(bm, (cx - 0.18, 0.0, z0 + 0.14), (1.05, 0.07, 0.06), m_metal, rot_y=-0.26)
    add_box(bm, (cx - 0.15, 0.0, z0 + 0.36), (1.05, 0.055, 0.05), m_metal, rot_y=0.22)
    # Bow suspension + dual carbon contact strips
    bow_x = cx + 0.34
    bow_z = z0 + 0.50
    add_box(bm, (bow_x, 0.0, bow_z), (0.08, 1.46, 0.045), m_metal)
    for dx in (-0.11, 0.11):
        add_box(bm, (bow_x + dx, 0.0, bow_z + 0.035), (0.05, 1.56, 0.03), m_dark)
    # Curved pantograph horns
    for sy in (-0.82, 0.82):
        add_box(bm, (bow_x, sy, bow_z), (0.28, 0.06, 0.035), m_metal)


def add_hvac_pod(
    bm: bmesh.types.BMesh,
    cx: float,
    roof_z: float,
    length: float,
    width: float,
    height: float,
    m_roof: int,
    m_dark: int,
) -> None:
    add_box(bm, (cx, 0.0, roof_z + height * 0.45), (length, width, height), m_roof)
    # Recessed intake grilles on top
    for gy in (-width * 0.25, width * 0.25):
        add_box(bm, (cx, gy, roof_z + height * 0.92), (length * 0.78, width * 0.34, 0.03), m_dark)


def add_double_door(
    bm: bmesh.types.BMesh,
    dx: float,
    side_y: float,
    side_sign: float,
    z_bot: float,
    z_top: float,
    door_w: float,
    m_door: int,
    m_glass: int,
    m_dark: int,
    win_z_bot: float,
    win_z_top: float,
) -> None:
    dh = z_top - z_bot
    zc = 0.5 * (z_bot + z_top)
    leaf_w = door_w * 0.485
    # Recessed outer door frame
    add_box(bm, (dx, side_y + side_sign * 0.008, zc), (door_w + 0.06, 0.025, dh + 0.03), m_dark)
    # Two sliding leaves
    for lx_sign in (-1.0, 1.0):
        lx = dx + lx_sign * (leaf_w * 0.5 + 0.006)
        add_box(bm, (lx, side_y + side_sign * 0.015, zc), (leaf_w, 0.022, dh), m_door)
        wh = win_z_top - win_z_bot
        wc = 0.5 * (win_z_bot + win_z_top)
        add_box(
            bm,
            (lx, side_y + side_sign * 0.024, wc),
            (leaf_w * 0.74, 0.014, wh),
            m_glass,
        )
    # Center black rubber gasket
    add_box(bm, (dx, side_y + side_sign * 0.025, zc), (0.022, 0.018, dh), m_dark)


def add_interior(
    bm: bmesh.types.BMesh,
    x0: float,
    x1: float,
    W: float,
    floor_z: float,
    double_deck: bool,
    m_floor: int,
    m_seat: int,
    m_light: int,
) -> None:
    length = max(2.0, x1 - x0)
    cx = 0.5 * (x0 + x1)
    add_box(bm, (cx, 0.0, floor_z), (length, W * 0.84, 0.06), m_floor)
    # Longitudinal or transverse seats
    seat_count = max(3, int(length / 2.4))
    for i in range(seat_count):
        sx = x0 + 1.0 + (i + 0.5) * ((length - 2.0) / seat_count)
        for sy in (-W * 0.28, W * 0.28):
            add_box(bm, (sx, sy, floor_z + 0.25), (0.95, 0.42, 0.36), m_seat)
    if double_deck:
        upper_floor = floor_z + 1.72
        add_box(bm, (cx, 0.0, upper_floor), (length * 0.86, W * 0.82, 0.06), m_floor)
        for i in range(seat_count):
            sx = x0 + 1.4 + (i + 0.5) * ((length - 2.8) / seat_count)
            for sy in (-W * 0.26, W * 0.26):
                add_box(bm, (sx, sy, upper_floor + 0.24), (0.90, 0.40, 0.34), m_seat)
        add_box(bm, (cx, 0.0, upper_floor + 1.38), (length * 0.85, 0.38, 0.04), m_light)
    else:
        add_box(bm, (cx, 0.0, floor_z + 2.05), (length * 0.88, 0.40, 0.04), m_light)


def build_hd_model(spec: dict, role: str, length: float, for_map_hd: bool) -> bpy.types.Object:
    clear_scene()
    key = spec["key"]
    W = spec["width"]
    H = spec["height"]
    half_W = W * 0.5
    half_L = length * 0.5
    is_cab = role in ("cab", "tail")
    is_tail = role == "tail"
    is_double = spec.get("double_deck", False)
    is_sprague = spec.get("sprague", False)
    is_rer_ng = key == "rer_e_rerng"

    em_head = 1.0 if for_map_hd else 2.6
    em_tail = 1.0 if for_map_hd else 2.8
    em_sign = 1.0 if for_map_hd else 1.8
    em_saloon = 1.0 if for_map_hd else 0.75

    # Material slots
    m_body_mat = make_mat("Body", spec["body_rgb"], roughness=0.34, metallic=0.18)
    m_accent_mat = make_mat("Accent", spec["accent_rgb"], roughness=0.34, metallic=0.16)
    m_accent2_mat = make_mat("Accent2", spec.get("accent2_rgb", spec["accent_rgb"]), roughness=0.36, metallic=0.14)
    m_door_mat = make_mat("Door", spec["door_rgb"], roughness=0.30, metallic=0.22)
    m_roof_mat = make_mat("Roof", spec["roof_rgb"], roughness=0.58, metallic=0.25)
    m_dark_mat = make_mat("Underframe", (0.04, 0.045, 0.052), roughness=0.72, metallic=0.30)
    m_metal_mat = make_mat("BrushedMetal", (0.52, 0.56, 0.62), roughness=0.28, metallic=0.82)
    m_mask_mat = make_mat("FrontMask", (0.025, 0.028, 0.035), roughness=0.20, metallic=0.20)
    m_glass_mat = make_mat(
        "Glass_Reflective",
        (0.008, 0.015, 0.026),
        roughness=0.14,
        metallic=0.12,
        alpha=1.0,
    )
    m_floor_mat = make_mat("InteriorFloor", (0.14, 0.15, 0.17), roughness=0.80, metallic=0.05)
    m_seat_mat = make_mat("InteriorSeats", spec["seat_rgb"], roughness=0.72, metallic=0.02)
    m_saloon_mat = make_mat(
        "SaloonLight",
        (1.0, 0.95, 0.84),
        roughness=0.2,
        metallic=0.0,
        emission=(0.55, 0.50, 0.40) if for_map_hd else (1.0, 0.92, 0.78),
        emission_strength=em_saloon,
    )
    m_head_mat = make_mat(
        "Headlight",
        (1.0, 0.96, 0.86) if not is_tail else (0.14, 0.15, 0.17),
        roughness=0.10,
        metallic=0.0 if not is_tail else 0.2,
        emission=(1.0, 0.92, 0.72) if not is_tail else None,
        emission_strength=em_head if not is_tail else 0.0,
    )
    m_tail_mat = make_mat(
        "Taillight",
        (1.0, 0.10, 0.08) if is_tail else (0.24, 0.03, 0.03),
        roughness=0.12,
        metallic=0.0,
        emission=(1.0, 0.08, 0.05) if is_tail else None,
        emission_strength=em_tail if is_tail else 0.0,
    )
    m_sign_mat = make_mat(
        "MissionSign",
        spec["sign_rgb"] if not is_tail else (0.06, 0.06, 0.07),
        roughness=0.16,
        metallic=0.0,
        emission=spec["sign_rgb"] if not is_tail else None,
        emission_strength=em_sign if not is_tail else 0.0,
    )
    m_carmine_mat = make_mat("CarmineAccent", hex_rgb("#C91940"), roughness=0.34, metallic=0.15)

    mats = [
        m_body_mat,     # 0
        m_accent_mat,   # 1
        m_accent2_mat,  # 2
        m_door_mat,     # 3
        m_roof_mat,     # 4
        m_dark_mat,     # 5
        m_metal_mat,    # 6
        m_mask_mat,     # 7
        m_glass_mat,    # 8
        m_floor_mat,    # 9
        m_seat_mat,     # 10
        m_saloon_mat,   # 11
        m_head_mat,     # 12
        m_tail_mat,     # 13
        m_sign_mat,     # 14
        m_carmine_mat,  # 15
    ]
    BODY, ACC1, ACC2, DOOR, ROOF, DARK, METAL, MASK, GLASS, FLOOR, SEAT, SALOON, HEAD, TAIL, SIGN, CARMINE = range(16)

    bm = bmesh.new()

    # 1. Bogies & Underframe (Z = 0 .. 0.72)
    add_bogies(bm, length, W, DARK, METAL, is_sprague=is_sprague)

    # 2. Main Body Shell (with curved tumblehome + crown)
    floor_z = 0.62 if (is_double or is_rer_ng) else (0.94 if is_sprague else 0.82)
    roof_base_z = H - (0.34 if is_sprague else 0.24)
    body_h = roof_base_z - floor_z
    shoulder_z = roof_base_z - 0.26
    waist_z = floor_z + body_h * 0.40

    # Cross-section profile (Y, Z)
    prof = [
        (-half_W * 0.90, floor_z),
        (half_W * 0.90, floor_z),
        (half_W, floor_z + 0.28),
        (half_W, waist_z),
        (half_W * 0.97, shoulder_z),
        (half_W * 0.72, roof_base_z - 0.04),
        (0.0, roof_base_z + 0.06),
        (-half_W * 0.72, roof_base_z - 0.04),
        (-half_W * 0.97, shoulder_z),
        (-half_W, waist_z),
        (-half_W, floor_z + 0.28),
    ]

    nose_len = 0.0
    if is_cab:
        nose_len = 0.14 if is_sprague else (1.55 if is_rer_ng else 1.25)

    x_rear = -half_L + 0.14
    x_body_front = half_L - nose_len
    body_len = x_body_front - x_rear
    body_cx = 0.5 * (x_rear + x_body_front)

    # Effective roof height at the front end (RER NG cab is single-deck at front)
    eff_roof_z = floor_z + body_h * 0.89 if (is_rer_ng and is_cab) else roof_base_z
    eff_body_h = eff_roof_z - floor_z

    # Main body shell (for RER NG cab: lower cab front rises at mid-rear to double-deck!)
    if is_rer_ng and is_cab:
        # Step from single-deck cab up to full double-deck at rear 38%
        x_step0 = x_rear + body_len * 0.34
        x_step1 = x_rear + body_len * 0.44
        stations = [
            (x_rear, 0.94, 0.98, 0.0, 0.0),
            (x_rear + 0.35, 1.0, 1.0, 0.0, 0.0),
            (x_step0, 1.0, 1.0, 0.0, 0.0),
            (x_step1, 1.0, 0.89, 0.0, 0.0),
            (x_body_front, 1.0, 0.89, 0.0, 0.0),
            (half_L, 0.86, 0.84, 0.0, spec.get("nose_rake", 0.82)),
        ]
        add_lofted_shell(bm, stations, prof, BODY)
    elif is_cab and not is_sprague:
        stations = [
            (x_rear, 0.94, 0.98, 0.0, 0.0),
            (x_rear + 0.35, 1.0, 1.0, 0.0, 0.0),
            (x_body_front, 1.0, 1.0, 0.0, 0.0),
            (half_L, 0.86, 0.94, 0.0, spec.get("nose_rake", 0.72)),
        ]
        add_lofted_shell(bm, stations, prof, BODY)
    else:
        stations = [
            (x_rear, 0.94, 0.98, 0.0, 0.0),
            (x_rear + 0.32, 1.0, 1.0, 0.0, 0.0),
            (x_body_front - 0.32, 1.0, 1.0, 0.0, 0.0),
            (x_body_front, 0.94, 0.98, 0.0, 0.0),
        ]
        add_lofted_shell(bm, stations, prof, BODY)

    # Carbody Livery Bands, Windows & Doors on both sides
    side_span = body_len - 0.55
    side_cx = body_cx

    # Lower sill & skirt accent band
    for sign in (-1.0, 1.0):
        sy = sign * half_W
        # Dark chassis sill
        add_box(bm, (side_cx, sy * 0.96, floor_z + 0.06), (side_span, 0.06, 0.14), DARK)

        if key == "rer_a_mi09":
            # MI 09: RATP/STIF deep slate-blue window bands + crisp light center deck divider + jade pinstripe
            add_box(bm, (side_cx, sy + sign * 0.004, floor_z + body_h * 0.52), (side_span, 0.015, body_h * 0.66), ACC1)
            add_box(bm, (side_cx, sy + sign * 0.008, floor_z + body_h * 0.51), (side_span, 0.015, body_h * 0.13), BODY)
            add_box(bm, (side_cx, sy + sign * 0.005, floor_z + 0.24), (side_span, 0.014, 0.09), ACC2)
            # 2-level continuous dark window bands
            add_box(bm, (side_cx, sy + sign * 0.012, floor_z + body_h * 0.31), (side_span * 0.96, 0.015, body_h * 0.20), GLASS)
            add_box(bm, (side_cx, sy + sign * 0.012, floor_z + body_h * 0.72), (side_span * 0.96, 0.015, body_h * 0.20), GLASS)
            door_fracs = (-0.33, 0.0, 0.33)
            for df in door_fracs:
                add_double_door(
                    bm, side_cx + df * side_span, sy, sign,
                    floor_z + 0.12, roof_base_z - 0.32, 1.78, DOOR, GLASS, DARK,
                    floor_z + body_h * 0.42, floor_z + body_h * 0.78,
                )

        elif key == "rer_b_mi79":
            # MI 79/84: IDFM sky blue lower skirt + thin carmine line + dark window ribbon + 4 silver doors
            add_box(bm, (side_cx, sy + sign * 0.004, floor_z + 0.28), (side_span, 0.014, 0.24), ACC1)
            add_box(bm, (side_cx, sy + sign * 0.006, floor_z + 0.43), (side_span, 0.014, 0.055), CARMINE)
            add_box(bm, (side_cx, sy + sign * 0.004, floor_z + body_h * 0.62), (side_span, 0.014, body_h * 0.42), ACC2)
            add_box(bm, (side_cx, sy + sign * 0.010, floor_z + body_h * 0.62), (side_span * 0.96, 0.015, body_h * 0.34), GLASS)
            for df in (-0.37, -0.125, 0.125, 0.37):
                add_double_door(
                    bm, side_cx + df * side_span, sy, sign,
                    floor_z + 0.12, roof_base_z - 0.28, 1.38, DOOR, GLASS, DARK,
                    floor_z + body_h * 0.44, floor_z + body_h * 0.78,
                )

        elif key in ("rer_c_z2n", "rer_d_z20500"):
            # Z 2N / Z 20500: Iconic 2 vestibule doors at ends + long central double-deck bay!
            if key == "rer_c_z2n":
                add_box(bm, (side_cx, sy + sign * 0.004, floor_z + body_h * 0.52), (side_span, 0.015, body_h * 0.72), ACC1)
                add_box(bm, (side_cx, sy + sign * 0.005, floor_z + 0.22), (side_span, 0.015, 0.14), ACC2)
            else:
                add_box(bm, (side_cx, sy + sign * 0.005, floor_z + 0.22), (side_span, 0.015, 0.16), ACC1)
                add_box(bm, (side_cx, sy + sign * 0.004, floor_z + body_h * 0.52), (side_span, 0.014, body_h * 0.66), ACC2)
            # Clear horizontal deck divider between lower & upper decks
            add_box(bm, (side_cx, sy + sign * 0.008, floor_z + body_h * 0.50), (side_span, 0.015, body_h * 0.13), BODY)

            well_len = side_span * 0.54
            mullion_mat = ACC1 if key == "rer_c_z2n" else MASK
            for wz in (floor_z + body_h * 0.30, floor_z + body_h * 0.70):
                add_box(bm, (side_cx, sy + sign * 0.012, wz), (well_len, 0.016, body_h * 0.20), GLASS)
                for mx in (-0.36, -0.12, 0.12, 0.36):
                    add_box(bm, (side_cx + mx * well_len, sy + sign * 0.015, wz), (0.09, 0.016, body_h * 0.21), mullion_mat)
            for df in (-0.38, 0.38):
                add_double_door(
                    bm, side_cx + df * side_span, sy, sign,
                    floor_z + 0.14, roof_base_z - 0.32, 1.65, DOOR, GLASS, DARK,
                    floor_z + body_h * 0.40, floor_z + body_h * 0.76,
                )

        elif key == "rer_e_rerng":
            # RER NG: IDFM blue lower skirt, black continuous window ribbon linking panoramic bays, flush doors
            add_box(bm, (side_cx, sy + sign * 0.005, floor_z + 0.22), (side_span, 0.015, 0.18), ACC1)
            if is_cab:
                add_box(bm, (side_cx + side_span * 0.18, sy + sign * 0.008, floor_z + body_h * 0.48), (side_span * 0.52, 0.014, body_h * 0.39), MASK)
                add_box(bm, (side_cx + side_span * 0.18, sy + sign * 0.012, floor_z + body_h * 0.48), (side_span * 0.48, 0.015, body_h * 0.32), GLASS)
                add_box(bm, (side_cx - side_span * 0.26, sy + sign * 0.008, floor_z + body_h * 0.50), (side_span * 0.40, 0.014, body_h * 0.65), MASK)
                add_box(bm, (side_cx - side_span * 0.26, sy + sign * 0.009, floor_z + body_h * 0.50), (side_span * 0.40, 0.014, body_h * 0.13), BODY)
                add_box(bm, (side_cx - side_span * 0.26, sy + sign * 0.012, floor_z + body_h * 0.30), (side_span * 0.38, 0.016, body_h * 0.20), GLASS)
                add_box(bm, (side_cx - side_span * 0.26, sy + sign * 0.012, floor_z + body_h * 0.70), (side_span * 0.38, 0.016, body_h * 0.20), GLASS)
                door_fs = (-0.36, 0.10)
            else:
                add_box(bm, (side_cx, sy + sign * 0.008, floor_z + body_h * 0.50), (side_span * 0.96, 0.014, body_h * 0.65), MASK)
                add_box(bm, (side_cx, sy + sign * 0.009, floor_z + body_h * 0.50), (side_span * 0.96, 0.014, body_h * 0.13), BODY)
                for wz in (floor_z + body_h * 0.30, floor_z + body_h * 0.70):
                    add_box(bm, (side_cx, sy + sign * 0.012, wz), (side_span * 0.94, 0.016, body_h * 0.20), GLASS)
                door_fs = (-0.33, 0.33)
            for df in door_fs:
                add_double_door(
                    bm, side_cx + df * side_span, sy, sign,
                    floor_z + 0.14, roof_base_z - 0.44, 1.62, DOOR, GLASS, DARK,
                    floor_z + body_h * 0.38, floor_z + body_h * 0.72,
                )

        elif is_sprague:
            # Sprague-Thomson 1930: riveted belt rail + cream/gold trim + 3 central windows between 4 doors
            add_box(bm, (side_cx, sy + sign * 0.006, floor_z + body_h * 0.42), (side_span, 0.016, 0.06), ACC1)
            add_box(bm, (side_cx, sy + sign * 0.006, floor_z + 0.12), (side_span, 0.016, 0.06), ACC1)
            # 3 wide framed windows centered strictly in the bays between the 4 doors (-0.39, -0.13, +0.13, +0.39)
            for wf in (-0.26, 0.0, 0.26):
                wx = side_cx + wf * side_span
                add_box(bm, (wx, sy + sign * 0.008, floor_z + body_h * 0.64), (1.36, 0.016, body_h * 0.42), ACC1)
                add_box(bm, (wx, sy + sign * 0.013, floor_z + body_h * 0.64), (1.22, 0.016, body_h * 0.36), GLASS)
                add_box(bm, (wx, sy + sign * 0.018, floor_z + body_h * 0.74), (1.24, 0.014, 0.03), ACC1)
            # 4 classic sliding doors
            for df in (-0.39, -0.13, 0.13, 0.39):
                add_double_door(
                    bm, side_cx + df * side_span, sy, sign,
                    floor_z + 0.08, roof_base_z - 0.16, 1.12, DOOR, GLASS, DARK,
                    floor_z + body_h * 0.50, floor_z + body_h * 0.80,
                )

    # 3. Roof Crown, Clerestory / HVAC / Pantograph
    if is_sprague:
        # Iconic 1930 domed clerestory roof + torpedo vents
        add_box(bm, (body_cx, 0.0, roof_base_z + 0.06), (body_len * 0.96, W * 0.86, 0.12), ROOF)
        add_box(bm, (body_cx, 0.0, roof_base_z + 0.22), (body_len * 0.86, W * 0.48, 0.20), ROOF)
        for vx in (-0.36, -0.18, 0.0, 0.18, 0.36):
            add_cyl(bm, (body_cx + vx * body_len, 0.0, roof_base_z + 0.35), 0.13, 0.09, METAL, axis="Z", segments=10)
    elif is_rer_ng and is_cab:
        # Stepped roof equipment flush on actual 0.89-scaled forward crown
        x_step0 = x_rear + body_len * 0.34
        x_step1 = x_rear + body_len * 0.44
        rear_len = max(1.0, x_step0 - x_rear - 0.3)
        rear_cx = 0.5 * (x_rear + 0.2 + x_step0 - 0.1)
        fwd_start = x_step1 + 0.15
        fwd_end = x_body_front - 0.15
        fwd_len = max(1.0, fwd_end - fwd_start)
        fwd_cx = 0.5 * (fwd_start + fwd_end)
        actual_fwd_roof_z = floor_z + (roof_base_z + 0.06 - floor_z) * 0.89
        add_box(bm, (rear_cx, 0.0, roof_base_z + 0.05), (rear_len, W * 0.64, 0.06), ROOF)
        add_box(bm, (fwd_cx, 0.0, actual_fwd_roof_z + 0.01), (fwd_len, W * 0.62, 0.05), ROOF)
        add_hvac_pod(bm, fwd_cx, actual_fwd_roof_z + 0.02, min(3.2, fwd_len * 0.50), W * 0.48, 0.17, ROOF, DARK)
        if spec.get("pantograph"):
            add_pantograph(bm, rear_cx, roof_base_z + 0.06, DARK, METAL, compact=True)
    else:
        # Roof equipment strip & HVAC / braking resistor pods
        add_box(bm, (body_cx, 0.0, roof_base_z + 0.05), (body_len * 0.92, W * 0.66, 0.06), ROOF)
        hvac_x = body_cx + body_len * 0.16
        add_hvac_pod(bm, hvac_x, roof_base_z + 0.06, min(3.4, body_len * 0.24), W * 0.52, 0.18, ROOF, DARK)
        if key == "rer_b_mi79":
            # Characteristic MI 79 braking resistor banks
            add_hvac_pod(bm, body_cx - body_len * 0.05, roof_base_z + 0.06, 2.2, W * 0.42, 0.14, DARK, METAL)
        if not is_cab:
            add_hvac_pod(bm, body_cx - body_len * 0.22, roof_base_z + 0.06, min(2.8, body_len * 0.20), W * 0.50, 0.16, ROOF, DARK)
        if spec.get("pantograph"):
            panto_x = body_cx - body_len * 0.28 if is_cab else body_cx + body_len * 0.26
            add_pantograph(bm, panto_x, roof_base_z + 0.06, DARK, METAL, compact=(key == "rer_e_rerng"))

    # 4. Rear Gangway Accordion (-X) & Front End (+X)
    rear_gx = x_rear - 0.06
    add_box(bm, (rear_gx, 0.0, floor_z + body_h * 0.46), (0.16, W * 0.72, body_h * 0.82), DARK)

    if not is_cab:
        front_gx = x_body_front + 0.06
        add_box(bm, (front_gx, 0.0, floor_z + body_h * 0.46), (0.16, W * 0.72, body_h * 0.82), DARK)
    else:
        # Detailed Cab Nose (+X)
        if is_sprague:
            nx = x_body_front
            # Flat vertical front wall fitted cleanly under the clerestory roof
            add_box(bm, (nx + 0.04, 0.0, floor_z + body_h * 0.46), (0.12, W * 0.88, body_h * 0.88), BODY)
            for wy in (-0.64, 0.0, 0.64):
                add_box(bm, (nx + 0.10, wy, floor_z + body_h * 0.58), (0.04, 0.48, body_h * 0.42), ACC1)
                add_box(bm, (nx + 0.115, wy, floor_z + body_h * 0.58), (0.03, 0.40, body_h * 0.34), GLASS)
            # Heavy front buffer beam + 2 round protruding buffers
            add_box(bm, (nx + 0.16, 0.0, floor_z - 0.02), (0.24, W * 0.90, 0.22), DARK)
            for by in (-0.78, 0.78):
                add_cyl(bm, (nx + 0.34, by, floor_z - 0.02), 0.11, 0.22, DARK, axis="X", segments=12)
                add_cyl(bm, (nx + 0.46, by, floor_z - 0.02), 0.17, 0.05, METAL, axis="X", segments=14)
            # Two large protruding brass-rimmed round lamps (headlights OR taillights)
            lamp_mat = TAIL if is_tail else HEAD
            for ly in (-0.68, 0.68):
                add_cyl(bm, (nx + 0.18, ly, floor_z + 0.32), 0.15, 0.16, METAL, axis="X", segments=16)
                add_cyl(bm, (nx + 0.26, ly, floor_z + 0.32), 0.12, 0.03, lamp_mat, axis="X", segments=16)
            # Upper destination lantern box
            add_box(bm, (nx + 0.14, 0.0, roof_base_z - 0.08), (0.12, 0.62, 0.22), DARK)
            add_box(bm, (nx + 0.20, 0.0, roof_base_z - 0.08), (0.02, 0.48, 0.13), SIGN)
        else:
            rake = spec.get("nose_rake", 0.72)
            zs_front = 0.84 if is_rer_ng else 0.94
            front_h = (roof_base_z + 0.06 - floor_z) * zs_front
            tilt = -math.atan2(rake, front_h)

            def front_x(z: float) -> float:
                return half_L - rake * ((z - floor_z) / front_h)

            # Black front mask strictly parallel and +0.015m proud of planar nose
            mask_zc = floor_z + front_h * 0.54
            add_box(bm, (front_x(mask_zc) + 0.005, 0.0, mask_zc), (0.06, W * 0.76, front_h * 0.68), MASK, rot_y=tilt)
            if key == "rer_b_mi79":
                win_zc = floor_z + front_h * 0.58
                for wy in (-0.46, 0.46):
                    add_box(bm, (front_x(win_zc) + 0.030, wy, win_zc), (0.03, 0.68, front_h * 0.36), GLASS, rot_y=tilt)
                add_box(bm, (front_x(win_zc) + 0.034, 0.0, win_zc), (0.03, 0.12, front_h * 0.38), MASK, rot_y=tilt)
            elif key in ("rer_c_z2n", "rer_d_z20500"):
                win_zc = floor_z + front_h * 0.58
                for wy in (-0.44, 0.44):
                    add_box(bm, (front_x(win_zc) + 0.030, wy, win_zc), (0.03, 0.66, front_h * 0.34), GLASS, rot_y=tilt)
                apron_zc = floor_z + 0.34
                add_box(bm, (front_x(apron_zc) + 0.015, 0.0, apron_zc), (0.08, W * 0.76, 0.40), ACC1, rot_y=tilt)
            else:
                win_zc = floor_z + front_h * 0.54
                add_box(bm, (front_x(win_zc) + 0.030, 0.0, win_zc), (0.03, W * 0.68, front_h * 0.40), GLASS, rot_y=tilt)
                apron_zc = floor_z + 0.25
                add_box(bm, (front_x(apron_zc) + 0.015, 0.0, apron_zc), (0.08, W * 0.76, 0.28), ACC1 if key == "rer_e_rerng" else BODY, rot_y=tilt)

            # Upper glowing Mission / Line indicator (RER A..E)
            sign_zc = floor_z + front_h * 0.85
            add_box(bm, (front_x(sign_zc) + 0.025, 0.0, sign_zc), (0.06, 0.82, 0.18), DARK, rot_y=tilt)
            add_box(bm, (front_x(sign_zc) + 0.045, 0.0, sign_zc), (0.03, 0.66, 0.11), SIGN, rot_y=tilt)

            # Headlights & Taillights flush on lower nose face
            lz = floor_z + 0.44
            lx = front_x(lz) + 0.035
            if is_rer_ng:
                lmat = TAIL if is_tail else HEAD
                for sign in (-1.0, 1.0):
                    add_box(bm, (lx, sign * 0.72, lz + 0.06), (0.05, 0.34, 0.07), lmat, rot_z=sign * 0.22)
                    add_box(bm, (front_x(lz + 0.24) + 0.035, sign * 0.84, lz + 0.24), (0.05, 0.07, 0.28), lmat, rot_y=tilt)
            else:
                for sign in (-1.0, 1.0):
                    add_box(bm, (lx, sign * 0.70, lz), (0.05, 0.22, 0.11), HEAD, rot_y=tilt)
                    add_box(bm, (lx, sign * 0.46, lz), (0.05, 0.15, 0.09), TAIL, rot_y=tilt)

            # Z 2N (RER C) iconic side buffers flanking Scharfenberg coupler
            if key == "rer_c_z2n":
                for by in (-0.84, 0.84):
                    add_cyl(bm, (half_L + 0.04, by, 0.66), 0.10, 0.20, DARK, axis="X", segments=12)
                    add_cyl(bm, (half_L + 0.15, by, 0.66), 0.16, 0.04, METAL, axis="X", segments=14)

            # Scharfenberg automatic coupler
            add_box(bm, (half_L + 0.08, 0.0, 0.56), (0.42, 0.32, 0.22), DARK)
            add_cyl(bm, (half_L + 0.29, 0.0, 0.56), 0.18, 0.16, METAL, axis="X", segments=10)

    mesh = bpy.data.meshes.new(f"{key}_{role}_mesh")
    bm.to_mesh(mesh)
    bm.free()

    # Center strictly: X=0, Y=0, Z_min=0
    verts = [v.co for v in mesh.vertices]
    cx = 0.5 * (min(v.x for v in verts) + max(v.x for v in verts))
    cy = 0.5 * (min(v.y for v in verts) + max(v.y for v in verts))
    min_z = min(v.z for v in verts)
    mesh.transform(Matrix.Translation((-cx, -cy, -min_z)))
    mesh.update()

    # Smooth shade curved surfaces + auto edge split
    for poly in mesh.polygons:
        poly.use_smooth = False

    obj = bpy.data.objects.new(f"{key}_{role}", mesh)
    bpy.context.collection.objects.link(obj)
    for m in mats:
        obj.data.materials.append(m)
    return obj


SPECS = [
    {
        "key": "rer_a_mi09",
        "lib_length": 20.8,
        "map_length": 15.0,
        "width": 2.90,
        "height": 4.32,
        "double_deck": True,
        "pantograph": True,
        "nose_rake": 0.92,
        "body_rgb": hex_rgb("#E8EAEE"),      # Pearl silver-white
        "accent_rgb": hex_rgb("#1B365D"),    # RATP/STIF deep slate-blue window band
        "accent2_rgb": hex_rgb("#008C74"),   # RATP jade pinstripe
        "door_rgb": hex_rgb("#D01020"),      # Bright red MI 09 double doors
        "roof_rgb": hex_rgb("#7A8088"),
        "seat_rgb": hex_rgb("#0E4D92"),
        "sign_rgb": (1.0, 0.68, 0.14),       # Amber LED sign
        "for_map_hd": True,
    },
    {
        "key": "rer_b_mi79",
        "lib_length": 20.6,
        "map_length": 15.0,
        "width": 2.88,
        "height": 4.00,
        "double_deck": False,
        "pantograph": True,
        "nose_rake": 0.58,
        "body_rgb": hex_rgb("#E6E8EC"),
        "accent_rgb": hex_rgb("#009CDE"),    # IDFM sky blue lower skirt
        "accent2_rgb": hex_rgb("#1E2836"),   # Dark grey-blue window band
        "door_rgb": hex_rgb("#C9CED4"),      # Brushed silver doors
        "roof_rgb": hex_rgb("#6E747C"),
        "seat_rgb": hex_rgb("#1A5A8A"),
        "sign_rgb": (1.0, 0.72, 0.18),
        "for_map_hd": True,
    },
    {
        "key": "rer_c_z2n",
        "lib_length": 21.2,
        "map_length": 15.0,
        "width": 2.90,
        "height": 4.32,
        "double_deck": True,
        "pantograph": True,
        "nose_rake": 0.86,
        "body_rgb": hex_rgb("#D8DCE2"),      # Brushed silver-grey
        "accent_rgb": hex_rgb("#162A4C"),    # Transilien deep navy blue
        "accent2_rgb": hex_rgb("#C91940"),   # Carmillon carmine stripe
        "door_rgb": hex_rgb("#C91940"),      # Carmillon red doors
        "roof_rgb": hex_rgb("#646A72"),
        "seat_rgb": hex_rgb("#1B3668"),
        "sign_rgb": (1.0, 0.80, 0.18),
        "for_map_hd": True,
    },
    {
        "key": "rer_d_z20500",
        "lib_length": 21.2,
        "map_length": 15.0,
        "width": 2.90,
        "height": 4.32,
        "double_deck": True,
        "pantograph": True,
        "nose_rake": 0.86,
        "body_rgb": hex_rgb("#EDF0F4"),      # Bright IDFM white-silver
        "accent_rgb": hex_rgb("#009CDE"),    # IDFM sky blue
        "accent2_rgb": hex_rgb("#262D38"),   # Dark slate window band
        "door_rgb": hex_rgb("#CFD6DE"),
        "roof_rgb": hex_rgb("#6C727A"),
        "seat_rgb": hex_rgb("#0072B2"),
        "sign_rgb": (0.20, 0.95, 0.45),      # Green/white LED
        "for_map_hd": True,
    },
    {
        "key": "rer_e_rerng",
        "lib_length": 18.6,
        "map_length": 15.0,
        "width": 2.99,
        "height": 4.32,
        "double_deck": True,
        "pantograph": True,
        "nose_rake": 1.10,
        "body_rgb": hex_rgb("#F0F2F5"),      # Clean IDFM pearl white
        "accent_rgb": hex_rgb("#009CDE"),    # IDFM sky blue
        "accent2_rgb": hex_rgb("#181C22"),
        "door_rgb": hex_rgb("#DCE2E8"),
        "roof_rgb": hex_rgb("#5A6068"),
        "seat_rgb": hex_rgb("#0078BF"),
        "sign_rgb": (0.95, 0.45, 0.90),      # RER E magenta LED
        "for_map_hd": True,
    },
    {
        "key": "sprague",
        "lib_length": 14.2,
        "map_length": 14.2,
        "width": 2.40,
        "height": 3.46,
        "double_deck": False,
        "pantograph": False,
        "sprague": True,
        "body_rgb": hex_rgb("#1C4A38"),      # 2nd-class CMP historical green (cab)
        "car_body_rgb": hex_rgb("#9A2226"),  # 1st-class carmine red (trailer car!)
        "accent_rgb": hex_rgb("#E6DEC8"),    # Cream/ivory window frames & belt trim
        "accent2_rgb": hex_rgb("#1C4A38"),
        "door_rgb": hex_rgb("#DDD4BC"),      # Heritage cream doors
        "roof_rgb": hex_rgb("#484642"),      # Dark weathered steel roof
        "seat_rgb": hex_rgb("#7A4E24"),      # Varnished oak wooden benches
        "sign_rgb": (1.0, 0.88, 0.56),
        "for_map_hd": False,
    },
]


def sanitize_pure_gltf2(glb_path: Path) -> None:
    raw = glb_path.read_bytes()
    magic, version, _ = struct.unpack("<III", raw[:12])
    assert magic == 0x46546C67 and version == 2
    jlen, _ = struct.unpack("<II", raw[12:20])
    gltf = json.loads(raw[20 : 20 + jlen].decode("utf-8"))
    bin_off = 20 + jlen
    blen, _ = struct.unpack("<II", raw[bin_off : bin_off + 8])
    bin_bytes = raw[bin_off + 8 : bin_off + 8 + blen]

    for mat in gltf.get("materials", []):
        mat.pop("extensions", None)
        if mat.get("alphaMode") == "BLEND":
            mat["alphaMode"] = "OPAQUE"
    for node in gltf.get("nodes", []):
        for k in ("matrix", "translation", "rotation", "scale"):
            node.pop(k, None)
    gltf.pop("extensionsUsed", None)
    gltf.pop("extensionsRequired", None)

    js = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    while len(js) % 4 != 0:
        js += b" "
    while len(bin_bytes) % 4 != 0:
        bin_bytes += b"\x00"
    total = 12 + 8 + len(js) + 8 + len(bin_bytes)
    out = (
        struct.pack("<III", 0x46546C67, 2, total)
        + struct.pack("<II", len(js), 0x4E4F534A)
        + js
        + struct.pack("<II", len(bin_bytes), 0x004E4942)
        + bin_bytes
    )
    glb_path.write_bytes(out)


def export_library(dst_path: Path) -> None:
    dst_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        raw = Path(td) / "raw.glb"
        bpy.ops.export_scene.gltf(
            filepath=str(raw),
            export_format="GLB",
            export_yup=True,
            export_apply=True,
            export_materials="EXPORT",
        )
        subprocess.run(
            [
                "npx",
                "gltf-transform",
                "optimize",
                str(raw),
                str(dst_path),
                "--compress",
                "meshopt",
                "--texture-compress",
                "false",
                "--simplify",
                "false",
            ],
            cwd=str(ROOT),
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )


def export_map_hd(dst_path: Path) -> None:
    dst_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(dst_path),
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
    )
    sanitize_pure_gltf2(dst_path)


def main() -> None:
    for spec in SPECS:
        key = spec["key"]

        # 1. Library exports (_cab.glb & _car.glb)
        for role, suffix in (("cab", "_cab.glb"), ("neutral", "_car.glb")):
            s_copy = dict(spec)
            if role == "neutral" and "car_body_rgb" in spec:
                s_copy["body_rgb"] = spec["car_body_rgb"]
            build_hd_model(s_copy, role=role, length=spec["lib_length"], for_map_hd=False)
            out_lib = LIB_DIR / f"{key}{suffix}"
            export_library(out_lib)
            print(f"  [library] {out_lib.name:24} {out_lib.stat().st_size // 1024:4d} KiB")

        # 2. Map HD exports (for the 5 RER models)
        if spec.get("for_map_hd"):
            for role, suffix in (("cab", "__cab.glb"), ("tail", "__tail.glb"), ("neutral", "_car.glb")):
                build_hd_model(spec, role=role, length=spec["map_length"], for_map_hd=True)
                out_hd = MAP_HD_DIR / f"{key}{suffix}"
                export_map_hd(out_hd)
                print(f"  [map_hd ] {out_hd.name:24} {out_hd.stat().st_size // 1024:4d} KiB")


if __name__ == "__main__":
    main()
