#!/usr/bin/env python3
"""Sculpt and export detailed, historically accurate low-poly PBR Paris Metro & RER
3D train models (.glb) using Blender's bpy/bmesh pipeline.

Contract preserved for deck.gl ScenegraphLayer & Three.js TrainShowroom3D:
- Blender Z-up exported with export_yup=True -> glTF Y-up:
  - Long axis +X (cab nose faces +X)
  - Width centered at Y=0 (glTF Z=0)
  - Bottom at Z=0 (glTF Y=0 at railhead)
- Standard Principled BSDF materials (no Draco/KTX2 extensions).
"""

from __future__ import annotations

import math
from pathlib import Path
import bpy
import bmesh
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
OUT_SRC = ROOT / "cities" / "paris" / "assets" / "models" / "train"
OUT_PUB = ROOT / "web" / "public" / "models" / "train"


def clear_scene() -> None:
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh, do_unlink=True)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat, do_unlink=True)


def make_mat(
    name: str,
    rgba: tuple[float, float, float, float],
    roughness: float = 0.45,
    metallic: float = 0.1,
    emission: tuple[float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if emission and emission_strength > 0:
            bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def add_box(
    bm: bmesh.types.BMesh,
    center: tuple[float, float, float],
    size: tuple[float, float, float],
    mat_idx: int,
    rot_y: float = 0.0,
) -> None:
    sx, sy, sz = size
    mat = Matrix.Translation(center)
    if abs(rot_y) > 1e-6:
        mat = mat @ Matrix.Rotation(rot_y, 4, "Y")
    mat = mat @ Matrix.Diagonal((sx, sy, sz, 1.0))
    res = bmesh.ops.create_cube(bm, size=1.0, matrix=mat)
    for v in res["verts"]:
        for f in v.link_faces:
            f.material_index = mat_idx


def add_cylinder(
    bm: bmesh.types.BMesh,
    center: tuple[float, float, float],
    radius: float,
    depth: float,
    mat_idx: int,
    axis: str = "Y",
    segments: int = 12,
) -> None:
    rot = Matrix.Identity(4)
    if axis == "Y":
        rot = Matrix.Rotation(math.pi / 2, 4, "X")
    elif axis == "X":
        rot = Matrix.Rotation(math.pi / 2, 4, "Y")
    mat = Matrix.Translation(center) @ rot
    res = bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segments,
        radius1=radius,
        radius2=radius,
        depth=depth,
        matrix=mat,
    )
    for v in res["verts"]:
        for f in v.link_faces:
            f.material_index = mat_idx


def build_train_car(spec: dict, role: str) -> bpy.types.Object:
    """Build a detailed sculpted train car mesh for role in {'neutral', 'cab', 'tail'}."""
    L = spec["length"]
    W = spec["width"]
    H = spec["height"]
    half_L = L * 0.5
    half_W = W * 0.5
    is_cab = role in ("cab", "tail")
    is_tail = role == "tail"
    is_double = spec.get("double_deck", False)
    is_sprague = spec.get("sprague", False)
    is_pneu = spec.get("pneu", False)
    has_pantograph = spec.get("pantograph", False)
    nose_slope = spec.get("nose_slope", 0.22)  # meters of nose bevel/slope

    # Material palette
    m_body = make_mat("Body", spec["body_rgba"], roughness=0.36, metallic=0.18)
    m_accent = make_mat("Accent", spec["accent_rgba"], roughness=0.32, metallic=0.22)
    m_roof = make_mat("Roof", spec["roof_rgba"], roughness=0.62, metallic=0.25)
    m_glass = make_mat("Glass", (0.05, 0.08, 0.12, 1.0), roughness=0.08, metallic=0.25)
    m_dark = make_mat("Underframe", (0.09, 0.10, 0.12, 1.0), roughness=0.78, metallic=0.35)
    m_door = make_mat("Door", spec["door_rgba"], roughness=0.30, metallic=0.25)
    m_head = make_mat(
        "Headlight",
        (1.0, 0.94, 0.78, 1.0),
        roughness=0.1,
        metallic=0.0,
        emission=(1.0, 0.90, 0.65),
        emission_strength=3.2,
    )
    m_tail = make_mat(
        "Taillight",
        (0.95, 0.12, 0.10, 1.0),
        roughness=0.15,
        metallic=0.0,
        emission=(1.0, 0.12, 0.08),
        emission_strength=2.6,
    )
    m_metal = make_mat("Metal", (0.62, 0.66, 0.72, 1.0), roughness=0.30, metallic=0.82)

    mats = [m_body, m_accent, m_roof, m_glass, m_dark, m_door, m_head, m_tail, m_metal]

    bm = bmesh.new()

    # 1. Underframe & Bogies (Z = 0.0 .. 0.72)
    floor_z = 0.72 if not is_double else 0.58
    add_box(bm, (0.0, 0.0, floor_z * 0.58), (L * 0.94, W * 0.78, floor_z * 0.55), 4)

    # Bogies (2 per car)
    bogie_x = L * 0.32
    for bx in (-bogie_x, bogie_x):
        add_box(bm, (bx, 0.0, 0.36), (2.2, W * 0.72, 0.34), 4)
        for wx in (-0.72, 0.72):
            wheel_r = 0.44 if is_pneu else 0.41
            wheel_w = 0.24 if is_pneu else 0.13
            for wy in (-half_W * 0.66, half_W * 0.66):
                add_cylinder(bm, (bx + wx, wy, wheel_r), wheel_r, wheel_w, 4, axis="Y", segments=12)
                # Hubcap / rim
                add_cylinder(
                    bm,
                    (bx + wx, wy + (0.04 if wy > 0 else -0.04), wheel_r),
                    wheel_r * 0.52,
                    wheel_w * 0.9,
                    8,
                    axis="Y",
                    segments=10,
                )
        if is_pneu:
            # Horizontal guide wheels characteristic of Paris pneumatic metro
            for gx in (-1.02, 1.02):
                for gy in (-half_W * 0.78, half_W * 0.78):
                    add_cylinder(bm, (bx + gx, gy, 0.36), 0.20, 0.10, 4, axis="Z", segments=10)

    # 2. Main Body Shell (skirt + upper cabin + curved/domed roof)
    body_h = H - floor_z - 0.34
    body_len = L - (nose_slope if is_cab else 0.16)
    body_cx = -(nose_slope * 0.5) if is_cab else 0.0

    # Lower accent band / skirt
    skirt_h = body_h * (0.28 if not is_double else 0.22)
    add_box(bm, (body_cx, 0.0, floor_z + skirt_h * 0.5), (body_len, W, skirt_h), 1)

    # Upper main body (slightly wider shoulder for MF77 if specified)
    shoulder_w = W * (1.03 if spec.get("curved_sides") else 1.0)
    upper_h = body_h - skirt_h
    add_box(bm, (body_cx, 0.0, floor_z + skirt_h + upper_h * 0.5), (body_len, shoulder_w, upper_h), 0)

    # Secondary upper accent stripe (RER / heritage)
    if spec.get("top_stripe"):
        add_box(
            bm,
            (body_cx, 0.0, floor_z + body_h - 0.12),
            (body_len + 0.01, shoulder_w + 0.015, 0.20),
            1,
        )

    # Roof crown
    roof_z = floor_z + body_h
    if is_sprague:
        # Iconic 1930 domed clerestory roof
        add_box(bm, (body_cx, 0.0, roof_z + 0.13), (body_len * 0.98, W * 0.90, 0.26), 2)
        add_box(bm, (body_cx, 0.0, roof_z + 0.30), (body_len * 0.86, W * 0.52, 0.16), 2)
        # Vintage roof vents
        for vx in (-body_len * 0.32, 0.0, body_len * 0.32):
            add_cylinder(bm, (vx, 0.0, roof_z + 0.42), 0.16, 0.10, 8, axis="Z", segments=8)
    else:
        add_box(bm, (body_cx, 0.0, roof_z + 0.12), (body_len * 0.98, W * 0.88, 0.24), 2)
        # Roof HVAC / equipment pods
        pod_count = 3 if L > 18 else 2
        for i in range(pod_count):
            px = body_cx + ((i - (pod_count - 1) * 0.5) * (body_len * 0.34))
            add_box(bm, (px, 0.0, roof_z + 0.29), (2.3, W * 0.56, 0.16), 4)

    # Folded roof pantograph for RER
    if has_pantograph:
        px = -body_len * 0.24
        add_box(bm, (px, 0.0, roof_z + 0.32), (1.4, 0.85, 0.10), 4)
        add_box(bm, (px + 0.15, 0.0, roof_z + 0.48), (1.1, 0.12, 0.08), 8, rot_y=0.28)
        add_box(bm, (px + 0.15, 0.0, roof_z + 0.62), (1.1, 0.12, 0.08), 8, rot_y=-0.28)
        add_box(bm, (px - 0.35, 0.0, roof_z + 0.72), (0.14, 1.35, 0.06), 8)

    # 3. Doors & Side Windows (both sides Y = ±shoulder_w/2)
    door_count = spec.get("doors", 4)
    door_spacing = (body_len * 0.78) / door_count
    door_h = body_h * 0.78 if not is_double else body_h * 0.54
    door_z = floor_z + door_h * 0.5 + 0.06

    for side in (-1.0, 1.0):
        sy = side * (shoulder_w * 0.5 + 0.012)
        for i in range(door_count):
            dx = body_cx + (i - (door_count - 1) * 0.5) * door_spacing
            # Door leaf frame
            add_box(bm, (dx, sy, door_z), (1.26, 0.03, door_h), 5)
            # Door glass window
            add_box(
                bm,
                (dx, sy + side * 0.01, door_z + door_h * 0.16),
                (0.96, 0.02, door_h * 0.44),
                3,
            )

        # Side windows between doors
        if is_double:
            # Two superposed window bands (RER A MI 09 double-decker!)
            lower_wz = floor_z + body_h * 0.26
            upper_wz = floor_z + body_h * 0.74
            for wz in (lower_wz, upper_wz):
                add_box(bm, (body_cx, sy + side * 0.006, wz), (body_len * 0.88, 0.02, body_h * 0.24), 3)
        else:
            win_z = floor_z + body_h * 0.62
            win_h = body_h * 0.36
            add_box(bm, (body_cx, sy + side * 0.005, win_z), (body_len * 0.90, 0.02, win_h), 3)

    # 4. Sculpted Cab Nose (+X) OR Gangway End
    if is_cab:
        nose_x = body_cx + body_len * 0.5
        if is_sprague:
            # Flat 1930 heritage front with 3 windows, protruding round brass headlights & buffers
            add_box(bm, (nose_x + 0.08, 0.0, floor_z + body_h * 0.5), (0.18, W * 0.96, body_h), 0)
            for wy in (-0.64, 0.0, 0.64):
                add_box(bm, (nose_x + 0.18, wy, floor_z + body_h * 0.66), (0.04, 0.48, body_h * 0.36), 3)
            # Vintage round protruding headlights
            light_mat = 7 if is_tail else 6
            for wy in (-0.72, 0.72):
                add_cylinder(bm, (nose_x + 0.24, wy, floor_z + 0.42), 0.16, 0.16, 8, axis="X", segments=12)
                add_cylinder(bm, (nose_x + 0.32, wy, floor_z + 0.42), 0.12, 0.04, light_mat, axis="X", segments=12)
            # Heavy front buffer beam
            add_box(bm, (nose_x + 0.22, 0.0, floor_z - 0.05), (0.22, W * 0.92, 0.22), 4)
        else:
            # Aerodynamic / sloped modern Paris cab nose
            add_box(
                bm,
                (nose_x + nose_slope * 0.42, 0.0, floor_z + skirt_h * 0.55),
                (nose_slope * 0.95, W * 0.96, skirt_h * 1.05),
                1,
            )
            add_box(
                bm,
                (nose_x + nose_slope * 0.28, 0.0, floor_z + skirt_h + upper_h * 0.48),
                (nose_slope * 0.85, shoulder_w * 0.94, upper_h * 0.96),
                0,
                rot_y=-0.16 if spec.get("sloped_windshield") else -0.07,
            )
            # Panoramic wrap-around windshield
            add_box(
                bm,
                (nose_x + nose_slope * 0.68, 0.0, floor_z + body_h * 0.64),
                (0.08, shoulder_w * 0.84, body_h * 0.44),
                3,
                rot_y=-0.16 if spec.get("sloped_windshield") else -0.07,
            )
            # LED Headlight / Taillight cluster
            light_mat = 7 if is_tail else 6
            for wy in (-half_W * 0.62, half_W * 0.62):
                add_box(
                    bm,
                    (nose_x + nose_slope * 0.88, wy, floor_z + 0.42),
                    (0.08, 0.36, 0.14),
                    light_mat,
                )
            # Front coupler
            add_box(bm, (nose_x + nose_slope * 0.95, 0.0, 0.48), (0.36, 0.34, 0.22), 4)

        # Rear gangway accordion (-X)
        rear_x = body_cx - body_len * 0.5 - 0.10
        add_box(bm, (rear_x, 0.0, floor_z + body_h * 0.46), (0.22, W * 0.72, body_h * 0.82), 4)
    else:
        # Both ends gangway accordion
        for sx in (-1.0, 1.0):
            gx = sx * (body_len * 0.5 + 0.08)
            add_box(bm, (gx, 0.0, floor_z + body_h * 0.46), (0.20, W * 0.72, body_h * 0.82), 4)

    mesh = bpy.data.meshes.new(f"{spec['key']}_{role}_mesh")
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(f"{spec['key']}_{role}", mesh)
    bpy.context.collection.objects.link(obj)
    for m in mats:
        obj.data.materials.append(m)

    return obj


PARIS_SPECS = [
    {
        "key": "paris_idfm_pneu",
        "length": 15.0,
        "width": 2.44,
        "height": 3.48,
        "pneu": True,
        "doors": 3,
        "nose_slope": 0.68,
        "sloped_windshield": True,
        "body_rgba": (0.86, 0.89, 0.92, 1.0),
        "accent_rgba": (0.00, 0.61, 0.87, 1.0),  # IDFM sky blue
        "roof_rgba": (0.24, 0.28, 0.34, 1.0),
        "door_rgba": (0.93, 0.95, 0.97, 1.0),
    },
    {
        "key": "paris_idfm_steel",
        "length": 15.15,
        "width": 2.44,
        "height": 3.46,
        "pneu": False,
        "doors": 3,
        "nose_slope": 0.52,
        "sloped_windshield": False,
        "body_rgba": (0.84, 0.87, 0.90, 1.0),
        "accent_rgba": (0.00, 0.58, 0.84, 1.0),
        "roof_rgba": (0.22, 0.25, 0.30, 1.0),
        "door_rgba": (0.91, 0.93, 0.96, 1.0),
    },
    {
        "key": "paris_mf77",
        "length": 15.49,
        "width": 2.46,
        "height": 3.46,
        "pneu": False,
        "curved_sides": True,
        "doors": 3,
        "nose_slope": 0.72,
        "sloped_windshield": True,
        "top_stripe": True,
        "body_rgba": (0.92, 0.93, 0.94, 1.0),    # iconic MF77 off-white
        "accent_rgba": (0.14, 0.38, 0.54, 1.0),  # slate-blue STIF/RATP band
        "roof_rgba": (0.30, 0.33, 0.38, 1.0),
        "door_rgba": (0.86, 0.88, 0.90, 1.0),
    },
    {
        "key": "pneumatic_generic",
        "length": 15.0,
        "width": 2.45,
        "height": 3.48,
        "pneu": True,
        "doors": 4,
        "nose_slope": 0.34,
        "top_stripe": True,
        "body_rgba": (0.90, 0.92, 0.93, 1.0),
        "accent_rgba": (0.00, 0.66, 0.56, 1.0),  # RATP Jade green (MP59/MP73)
        "roof_rgba": (0.15, 0.21, 0.34, 1.0),
        "door_rgba": (0.82, 0.86, 0.88, 1.0),
    },
    {
        "key": "steel_classic",
        "length": 14.2,
        "width": 2.40,
        "height": 3.42,
        "pneu": False,
        "sprague": True,
        "doors": 3,
        "nose_slope": 0.24,
        "top_stripe": True,
        "body_rgba": (0.13, 0.34, 0.25, 1.0),    # Sprague-Thomson 1930 heritage green
        "accent_rgba": (0.72, 0.16, 0.14, 1.0),  # 1st-class carmine accent
        "roof_rgba": (0.26, 0.25, 0.23, 1.0),
        "door_rgba": (0.85, 0.82, 0.72, 1.0),    # cream heritage doors
    },
    {
        "key": "rer_generic_A",
        "length": 21.2,
        "width": 2.90,
        "height": 4.30,
        "pneu": False,
        "double_deck": True,
        "pantograph": True,
        "doors": 3,
        "nose_slope": 0.92,
        "sloped_windshield": True,
        "top_stripe": True,
        "body_rgba": (0.87, 0.89, 0.92, 1.0),
        "accent_rgba": (0.84, 0.07, 0.12, 1.0),  # RER A red
        "roof_rgba": (0.20, 0.23, 0.28, 1.0),
        "door_rgba": (0.78, 0.82, 0.86, 1.0),
    },
    {
        "key": "rer_generic_B",
        "length": 21.0,
        "width": 2.86,
        "height": 4.05,
        "pneu": False,
        "double_deck": False,
        "pantograph": True,
        "doors": 4,
        "nose_slope": 0.58,
        "top_stripe": True,
        "body_rgba": (0.90, 0.91, 0.93, 1.0),
        "accent_rgba": (0.26, 0.54, 0.80, 1.0),  # RER B blue
        "roof_rgba": (0.18, 0.22, 0.30, 1.0),
        "door_rgba": (0.82, 0.85, 0.89, 1.0),
    },
]


def export_all() -> None:
    OUT_SRC.mkdir(parents=True, exist_ok=True)
    OUT_PUB.mkdir(parents=True, exist_ok=True)

    for spec in PARIS_SPECS:
        key = spec["key"]
        for role, suffix in (("neutral", ""), ("cab", "__cab"), ("tail", "__tail")):
            clear_scene()
            build_train_car(spec, role)

            if key.startswith("rer_generic_"):
                # RER naming: rer_generic_A__neutral.glb, rer_generic_A__cab.glb, rer_generic_A__tail.glb
                fname = f"{key}__{role}.glb"
            else:
                # Metro naming: paris_idfm_pneu__neutral.glb, paris_idfm_pneu__neutral__cab.glb, ...
                fname = f"{key}__neutral{suffix}.glb"

            src_path = OUT_SRC / fname
            pub_path = OUT_PUB / fname
            bpy.ops.export_scene.gltf(
                filepath=str(src_path),
                export_format="GLB",
                export_yup=True,
                export_apply=True,
                export_materials="EXPORT",
            )
            pub_path.write_bytes(src_path.read_bytes())
            size_kb = src_path.stat().st_size / 1024
            print(f"[blender] exported {fname} ({size_kb:.1f} KiB)")


if __name__ == "__main__":
    export_all()
