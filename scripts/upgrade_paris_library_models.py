#!/usr/bin/env python3
"""Repair, center, and upgrade the 13 Paris Metro & MS61 CAD GLBs in `library/`
and generate clean, extension-free `map_hd/` GLBs (including dedicated `__tail.glb`
models with separated headlights vs red taillights).

Run via Blender 5.3:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/upgrade_paris_library_models.py
"""

from __future__ import annotations

import json
import math
import os
import shutil
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
BACKUP_DIR = Path("/tmp/backup_library_glb")

# 12 Metro series rendered in map_hd (ms61 is library/ride showcase only)
MAP_HD_MODELS = [
    ("mf01", "mf01_cab.glb", "mf01_car.glb"),
    ("mf19", "mf19_cab.glb", "mf19_car.glb"),
    ("mf67", "mf67_cab.glb", "mf67_car.glb"),
    ("mf77", "mf77_cab.glb", "mf77_car.glb"),
    ("mf88", "mf88_cab.glb", "mf88_car.glb"),
    ("mp05", "mp05_cab.glb", "mp05_car.glb"),
    ("mp14_ca", "mp14_ca_cab.glb", "mp14_car.glb"),
    ("mp14_cc", "mp14_cc_cab.glb", "mp14_car.glb"),
    ("mp59", "mp59_cab.glb", "mp59_car.glb"),
    ("mp73", "mp73_cab.glb", "mp73_car.glb"),
    ("mp89_ca", "mp89_ca_cab.glb", "mp89_car.glb"),
    ("mp89_cc", "mp89_cc_cab.glb", "mp89_car.glb"),
]


def clear_scene() -> None:
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh, do_unlink=True)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat, do_unlink=True)
    for img in list(bpy.data.images):
        bpy.data.images.remove(img, do_unlink=True)


def world_bbox(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    mw = obj.matrix_world
    for v in obj.data.vertices:
        wc = mw @ v.co
        mn.x = min(mn.x, wc.x)
        mn.y = min(mn.y, wc.y)
        mn.z = min(mn.z, wc.z)
        mx.x = max(mx.x, wc.x)
        mx.y = max(mx.y, wc.y)
        mx.z = max(mx.z, wc.z)
    return mn, mx


def scene_bbox(meshes: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for obj in meshes:
        if not obj.data.vertices:
            continue
        omn, omx = world_bbox(obj)
        mn.x = min(mn.x, omn.x)
        mn.y = min(mn.y, omn.y)
        mn.z = min(mn.z, omn.z)
        mx.x = max(mx.x, omx.x)
        mx.y = max(mx.y, omx.y)
        mx.z = max(mx.z, omx.z)
    return mn, mx


def bake_world_transforms(meshes: list[bpy.types.Object]) -> None:
    """Clear parenting keeping transforms, make mesh data single-user, and apply all transforms."""
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    if meshes:
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
        bpy.ops.object.make_single_user(object=True, obdata=True)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # Remove non-mesh empties
    for obj in list(bpy.data.objects):
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
    bpy.context.view_layer.update()


def make_pbr_mat(
    name: str,
    base_rgb: tuple[float, float, float],
    roughness: float = 0.35,
    metallic: float = 0.1,
    alpha: float = 1.0,
    emission_rgb: tuple[float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*base_rgb, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Alpha"].default_value = alpha
        if "Coat Weight" in bsdf.inputs:
            bsdf.inputs["Coat Weight"].default_value = 0.0
        if emission_rgb is not None and emission_strength > 0:
            bsdf.inputs["Emission Color"].default_value = (*emission_rgb, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
        else:
            bsdf.inputs["Emission Strength"].default_value = 0.0
    if alpha < 0.99:
        mat.blend_method = "BLEND" if hasattr(mat, "blend_method") else "HASHED"
    return mat


def add_box_object(
    name: str,
    center: tuple[float, float, float],
    size: tuple[float, float, float],
    mat: bpy.types.Material,
) -> bpy.types.Object:
    bm = bmesh.new()
    mat_t = Matrix.Translation(center) @ Matrix.Diagonal((size[0], size[1], size[2], 1.0))
    bmesh.ops.create_cube(bm, size=1.0, matrix=mat_t)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def fix_mf67(meshes: list[bpy.types.Object], is_cab: bool) -> list[bpy.types.Object]:
    """Fix floating PorteD1_AR.001 + Loquet and add realistic tinted window glass."""
    caisse = next((o for o in meshes if "Caisse" in o.name), None)
    p1 = next((o for o in meshes if o.name.endswith("PorteD1_AR.001")), None)
    p2 = next((o for o in meshes if o.name.endswith("PorteD1_AR.002")), None)
    loq = next((o for o in meshes if o.name.endswith("PorteD1_AR_Loquet")), None)

    if caisse and p1 and p2:
        _, cmx = world_bbox(caisse)
        p1_mn, p1_mx = world_bbox(p1)
        p2_mn, _ = world_bbox(p2)
        if p1_mx.x > cmx.x + 1.0:
            target_max_x = p2_mn.x - 0.008
            dx = target_max_x - p1_mx.x
            p1.data.transform(Matrix.Translation((dx, 0.0, 0.0)))
            p1.data.update()
            if loq:
                loq.data.transform(Matrix.Translation((dx, 0.0, 0.0)))
                loq.data.update()

    # Add opaque dark glossy front cab windshields on MF67 (behind openings sits a grey wall)
    has_front_glass = any("Vitre" in o.name or "Baie" in o.name or "Glass_MF67" in o.name for o in meshes)
    if caisse and is_cab and not has_front_glass:
        cmn, cmx = world_bbox(caisse)
        cy = 0.5 * (cmn.y + cmx.y)
        glass_mat = make_pbr_mat(
            "Glass_MF67_Front",
            base_rgb=(0.014, 0.024, 0.038),
            roughness=0.06,
            metallic=0.35,
            alpha=1.0,
        )
        fx = cmx.x + 0.004
        for side_tag, wy_off in (("L", 0.55), ("R", -0.55)):
            obj = add_box_object(
                f"MF67_Glass_Front_{side_tag}",
                (fx, cy + wy_off, 2.41),
                (0.014, 0.86, 0.88),
                glass_mat,
            )
            meshes.append(obj)
    return meshes


def fix_ms61(meshes: list[bpy.types.Object]) -> None:
    """Remove stray underground vertices (z < -0.15) from MS61 Caisse."""
    for obj in meshes:
        if "Caisse" not in obj.name:
            continue
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bad = [v for v in bm.verts if v.co.z < -0.15]
        if bad:
            bmesh.ops.delete(bm, geom=bad, context="VERTS")
            bm.to_mesh(obj.data)
            obj.data.update()
        bm.free()


def enhance_mp14_idfm(meshes: list[bpy.types.Object], is_cab: bool) -> list[bpy.types.Object]:
    """Add authentic Île-de-France Mobilités (IDFM) sky-blue lower skirt band
    hugging the MP 14 carbody (±1.208 m) and front chin."""
    caisse = next((o for o in meshes if "Caisse" in o.name), None)
    if not caisse:
        return meshes
    cmn, cmx = world_bbox(caisse)
    cy = 0.5 * (cmn.y + cmx.y)
    idfm_blue = make_pbr_mat(
        "IDFM_SkyBlue",
        base_rgb=(0.02, 0.42, 0.78),
        roughness=0.28,
        metallic=0.18,
    )
    # Clean lower skirt band along both sides hugging the body shell (1.20m half-width)
    skirt_z = cmn.z + 0.98
    band_len = (cmx.x - cmn.x) - (0.72 if is_cab else 0.16)
    band_cx = 0.5 * (cmn.x + cmx.x) - (0.28 if is_cab else 0.0)
    for sign, tag in ((1.0, "G"), (-1.0, "D")):
        by = cy + sign * 1.208
        meshes.append(
            add_box_object(
                f"MP14_IDFM_Skirt_{tag}",
                (band_cx, by, skirt_z),
                (band_len, 0.012, 0.13),
                idfm_blue,
            )
        )
    return meshes


def center_all_meshes(meshes: list[bpy.types.Object]) -> None:
    """Center whole train on X=0, Y=0 (from Caisse), and Z_min=0 at railhead."""
    caisse = next((o for o in meshes if "Caisse" in o.name), meshes[0])
    c_verts = [caisse.matrix_world @ v.co for v in caisse.data.vertices]
    cx = 0.5 * (min(v.x for v in c_verts) + max(v.x for v in c_verts))
    cy = 0.5 * (min(v.y for v in c_verts) + max(v.y for v in c_verts))
    all_z = [
        (obj.matrix_world @ v.co).z
        for obj in meshes
        for v in obj.data.vertices
    ]
    min_z = min(all_z) if all_z else 0.0
    shift = Matrix.Translation((-cx, -cy, -min_z))
    seen_data: set[bpy.types.Mesh] = set()
    for obj in meshes:
        if obj.data in seen_data:
            obj.data = obj.data.copy()
        seen_data.add(obj.data)
        obj.data.transform(shift)
        obj.data.update()


def apply_light_and_glass_materials(
    meshes: list[bpy.types.Object],
    role: str,
    for_map_hd: bool,
) -> None:
    """Separate headlights (Phare/Feu0) vs taillights (Feu*) and refine glass."""
    em_strength_head = 1.0 if for_map_hd else 2.6
    em_strength_tail = 1.0 if for_map_hd else 2.8
    em_strength_ecl = 1.0 if for_map_hd else 0.85
    em_strength_ind = 1.0 if for_map_hd else 1.5

    mat_head_on = make_pbr_mat(
        "Headlight_On",
        base_rgb=(1.0, 0.96, 0.86),
        roughness=0.10,
        metallic=0.0,
        emission_rgb=(1.0, 0.92, 0.72),
        emission_strength=em_strength_head,
    )
    mat_head_off = make_pbr_mat(
        "Headlight_Off",
        base_rgb=(0.14, 0.16, 0.18),
        roughness=0.12,
        metallic=0.25,
    )
    mat_tail_on = make_pbr_mat(
        "Taillight_On",
        base_rgb=(1.0, 0.10, 0.08),
        roughness=0.12,
        metallic=0.0,
        emission_rgb=(1.0, 0.08, 0.05),
        emission_strength=em_strength_tail,
    )
    mat_tail_off = make_pbr_mat(
        "Taillight_Off",
        base_rgb=(0.24, 0.03, 0.03),
        roughness=0.15,
        metallic=0.1,
    )
    mat_ecl = make_pbr_mat(
        "Saloon_Light",
        base_rgb=(1.0, 0.96, 0.86),
        roughness=0.2,
        metallic=0.0,
        emission_rgb=(0.65, 0.60, 0.48) if for_map_hd else (1.0, 0.93, 0.78),
        emission_strength=em_strength_ecl,
    )
    mat_ind = make_pbr_mat(
        "Line_Sign_Glow",
        base_rgb=(0.98, 0.96, 0.88),
        roughness=0.15,
        metallic=0.0,
        emission_rgb=(0.75, 0.70, 0.56) if for_map_hd else (1.0, 0.92, 0.76),
        emission_strength=em_strength_ind,
    )
    mat_hd_glass = make_pbr_mat(
        "Vitre_MapHD",
        base_rgb=(0.02, 0.035, 0.055),
        roughness=0.12,
        metallic=0.30,
        alpha=1.0,
    )
    mat_lib_glass = make_pbr_mat(
        "Vitre_Tinted",
        base_rgb=(0.04, 0.07, 0.10),
        roughness=0.08,
        metallic=0.25,
        alpha=0.42,
    )

    for obj in meshes:
        lname = obj.name.lower()
        is_headlight = "phare" in lname or "feu0" in lname
        is_taillight = ("feu" in lname) and not is_headlight
        is_ecl = "eclairage" in lname
        is_ind = "indiceligne" in lname
        is_glass = "vitre" in lname or "baie" in lname

        if is_headlight:
            obj.data.materials.clear()
            obj.data.materials.append(mat_head_off if role == "tail" else mat_head_on)
        elif is_taillight:
            obj.data.materials.clear()
            obj.data.materials.append(mat_tail_on if role == "tail" else mat_tail_off)
        elif is_ecl:
            obj.data.materials.clear()
            obj.data.materials.append(mat_ecl)
        elif is_ind:
            obj.data.materials.clear()
            obj.data.materials.append(mat_ind)
        elif is_glass:
            obj.data.materials.clear()
            obj.data.materials.append(mat_hd_glass if for_map_hd else mat_lib_glass)

    # Strip clearcoat/specular/extra extensions from all remaining PaletteMaterials
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if not bsdf:
            continue
        if "Coat Weight" in bsdf.inputs:
            bsdf.inputs["Coat Weight"].default_value = 0.0
        if for_map_hd:
            # Ensure no material uses alpha blend or emission strength != 0/1
            if bsdf.inputs["Alpha"].default_value < 0.99:
                bsdf.inputs["Alpha"].default_value = 1.0
            if hasattr(mat, "blend_method"):
                mat.blend_method = "OPAQUE"
            if bsdf.inputs["Emission Strength"].default_value > 0:
                bsdf.inputs["Emission Strength"].default_value = 1.0


def sanitize_map_hd_glb(glb_path: Path) -> None:
    """Strip any non-core glTF extensions (e.g. KHR_materials_emissive_strength)
    so deck.gl ScenegraphLayer loads pure glTF 2.0 with extensionsUsed=[]."""
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


def prepare_model(src_path: Path, stem: str, role: str, for_map_hd: bool) -> None:
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(src_path))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    bake_world_transforms(meshes)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]

    is_cab = role in ("cab", "tail")
    if stem.startswith("mf67"):
        meshes = fix_mf67(meshes, is_cab=is_cab)
    elif stem.startswith("ms61"):
        fix_ms61(meshes)
    elif stem.startswith("mp14"):
        meshes = enhance_mp14_idfm(meshes, is_cab=is_cab)

    center_all_meshes(meshes)
    apply_light_and_glass_materials(meshes, role=role, for_map_hd=for_map_hd)

    if for_map_hd:
        bpy.ops.object.select_all(action="DESELECT")
        for o in meshes:
            o.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()
        meshes[0].name = f"{stem}_{role}"


def export_library_glb(dst_path: Path) -> None:
    with tempfile.TemporaryDirectory() as td:
        raw_glb = Path(td) / "raw.glb"
        bpy.ops.export_scene.gltf(
            filepath=str(raw_glb),
            export_format="GLB",
            export_yup=True,
            export_apply=True,
            export_materials="EXPORT",
            export_image_format="AUTO",
        )
        subprocess.run(
            [
                "npx",
                "gltf-transform",
                "optimize",
                str(raw_glb),
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


def export_map_hd_glb(dst_path: Path) -> None:
    dst_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(dst_path),
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
    )
    sanitize_map_hd_glb(dst_path)


def main() -> None:
    src_dir = BACKUP_DIR if BACKUP_DIR.exists() else LIB_DIR
    print(f"[upgrade] reading CAD sources from {src_dir}")

    # 1. Upgrade all 24 existing library/*.glb
    lib_files = sorted(src_dir.glob("*.glb"))
    for src in lib_files:
        stem = src.stem
        role = "cab" if stem.endswith("_cab") else "neutral"
        prepare_model(src, stem=stem, role=role, for_map_hd=False)
        dst = LIB_DIR / src.name
        export_library_glb(dst)
        print(f"  [library] {dst.name:22} {dst.stat().st_size // 1024:4d} KiB")

    # 2. Export all 12 Metro series for map_hd (car, __cab, __tail)
    seen_cars: set[str] = set()
    for name, cab_file, car_file in MAP_HD_MODELS:
        cab_src = src_dir / cab_file
        for role in ("cab", "tail"):
            prepare_model(cab_src, stem=name, role=role, for_map_hd=True)
            out_cab = MAP_HD_DIR / f"{name}__{role}.glb"
            export_map_hd_glb(out_cab)
            print(f"  [map_hd ] {out_cab.name:22} {out_cab.stat().st_size // 1024:4d} KiB")

        car_stem = car_file.replace(".glb", "")
        if car_stem not in seen_cars:
            seen_cars.add(car_stem)
            prepare_model(src_dir / car_file, stem=car_stem, role="neutral", for_map_hd=True)
            out_car = MAP_HD_DIR / car_file
            export_map_hd_glb(out_car)
            print(f"  [map_hd ] {out_car.name:22} {out_car.stat().st_size // 1024:4d} KiB")


if __name__ == "__main__":
    main()
