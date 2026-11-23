#!/usr/bin/env python3
"""
Merge detailed multi-node/multi-material library GLBs into a single-mesh,
(0,0,0)-centered GLB grouped by material color (one primitive per distinct
baseColorFactor) so deck.gl ScenegraphLayer (@luma.gl/gltf) renders exact
PBR colors without relying on COLOR_0 vertex-color support.
Preserves all original base models untouched.
"""

from __future__ import annotations

import json
import os
import struct
from collections import defaultdict
from pathlib import Path
from typing import Any

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
LIB_DIR = ROOT / "web" / "public" / "models" / "train" / "library"
OUT_DIR = ROOT / "web" / "public" / "models" / "train" / "map_hd"

COMPONENT_DTYPE = {
    5120: np.int8,
    5121: np.uint8,
    5122: np.int16,
    5123: np.uint16,
    5125: np.uint32,
    5126: np.float32,
}

TYPE_COUNT = {
    "SCALAR": 1,
    "VEC2": 2,
    "VEC3": 3,
    "VEC4": 4,
    "MAT2": 4,
    "MAT3": 9,
    "MAT4": 16,
}


def quat_to_mat4(q: list[float]) -> np.ndarray:
    x, y, z, w = q
    xx, yy, zz = x * x, y * y, z * z
    xy, xz, yz = x * y, x * z, y * z
    wx, wy, wz = w * x, w * y, w * z
    return np.array(
        [
            [1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy), 0.0],
            [2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx), 0.0],
            [2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy), 0.0],
            [0.0, 0.0, 0.0, 1.0],
        ],
        dtype=np.float64,
    )


def node_local_matrix(node: dict[str, Any]) -> np.ndarray:
    if "matrix" in node:
        return np.array(node["matrix"], dtype=np.float64).reshape((4, 4)).T
    m = np.eye(4, dtype=np.float64)
    if "translation" in node:
        t = node["translation"]
        m[0, 3], m[1, 3], m[2, 3] = t[0], t[1], t[2]
    if "rotation" in node:
        m = m @ quat_to_mat4(node["rotation"])
    if "scale" in node:
        s = node["scale"]
        m = m @ np.diag([s[0], s[1], s[2], 1.0])
    return m


def read_accessor(data: dict[str, Any], bin_data: bytes, acc_idx: int) -> np.ndarray:
    acc = data["accessors"][acc_idx]
    bv = data["bufferViews"][acc["bufferView"]]
    offset = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    count = acc["count"]
    n_comp = TYPE_COUNT[acc["type"]]
    dtype = COMPONENT_DTYPE[acc["componentType"]]
    stride = bv.get("byteStride")
    item_bytes = np.dtype(dtype).itemsize * n_comp
    if stride and stride != item_bytes:
        arr = np.empty((count, n_comp), dtype=dtype)
        for i in range(count):
            start = offset + i * stride
            arr[i] = np.frombuffer(bin_data, dtype=dtype, count=n_comp, offset=start)
    else:
        arr = np.frombuffer(bin_data, dtype=dtype, count=count * n_comp, offset=offset)
        arr = arr.reshape((count, n_comp)) if n_comp > 1 else arr
    return arr.astype(np.float32) if dtype == np.float32 else arr


def merge_glb_by_material(src: Path, dst: Path) -> tuple[int, int, int]:
    with src.open("rb") as fp:
        magic, ver, _ = struct.unpack("<III", fp.read(12))
        assert magic == 0x46546C67 and ver == 2
        json_len, _ = struct.unpack("<II", fp.read(8))
        data = json.loads(fp.read(json_len).decode("utf-8"))
        bin_len, _ = struct.unpack("<II", fp.read(8))
        bin_data = fp.read(bin_len)

    nodes = data.get("nodes", [])
    scenes = data.get("scenes", [])
    root_nodes = scenes[data.get("scene", 0)]["nodes"] if scenes else list(range(len(nodes)))
    materials = data.get("materials", [])

    # Group geometry by quantized (r, g, b, metallic, roughness)
    buckets: dict[tuple[float, float, float, float, float], dict[str, Any]] = {}
    global_min = np.array([np.inf, np.inf, np.inf], dtype=np.float64)
    global_max = np.array([-np.inf, -np.inf, -np.inf], dtype=np.float64)

    def get_bucket(mat_idx: int | None) -> dict[str, Any]:
        rgba = (0.75, 0.75, 0.75)
        metallic = 0.1
        roughness = 0.65
        if mat_idx is not None and mat_idx < len(materials):
            mat = materials[mat_idx]
            mname = (mat.get("name") or "").lower()
            pbr = mat.get("pbrMetallicRoughness", {})
            if "vitre" in mname:
                rgba = (0.015, 0.028, 0.048)
                metallic = 0.25
                roughness = 0.18
            else:
                bc = pbr.get("baseColorFactor")
                if bc and len(bc) >= 3:
                    rgba = (round(float(bc[0]), 4), round(float(bc[1]), 4), round(float(bc[2]), 4))
                metallic = round(float(pbr.get("metallicFactor", 0.1)), 3)
                roughness = round(float(pbr.get("roughnessFactor", 0.65)), 3)
        key = (rgba[0], rgba[1], rgba[2], metallic, roughness)
        if key not in buckets:
            buckets[key] = {"pos": [], "nrm": [], "idx": [], "v_off": 0}
        return buckets[key]

    def visit(node_idx: int, parent_mat: np.ndarray) -> None:
        nonlocal global_min, global_max
        node = nodes[node_idx]
        world_mat = parent_mat @ node_local_matrix(node)
        if "mesh" in node:
            mesh = data["meshes"][node["mesh"]]
            rot3 = world_mat[:3, :3]
            try:
                norm_mat = np.linalg.inv(rot3).T
            except np.linalg.LinAlgError:
                norm_mat = rot3
            for prim in mesh.get("primitives", []):
                if prim.get("mode", 4) != 4:
                    continue
                attrs = prim["attributes"]
                if "POSITION" not in attrs:
                    continue
                pos = read_accessor(data, bin_data, attrs["POSITION"]).astype(np.float64)
                n_verts = pos.shape[0]
                if n_verts == 0:
                    continue
                ones = np.ones((n_verts, 1), dtype=np.float64)
                pos_w = (np.hstack([pos, ones]) @ world_mat.T)[:, :3].astype(np.float32)

                global_min = np.minimum(global_min, pos_w.min(axis=0))
                global_max = np.maximum(global_max, pos_w.max(axis=0))

                if "NORMAL" in attrs:
                    nrm = read_accessor(data, bin_data, attrs["NORMAL"]).astype(np.float64)
                    nrm_w = nrm @ norm_mat.T
                    lens = np.linalg.norm(nrm_w, axis=1, keepdims=True)
                    lens[lens == 0] = 1.0
                    nrm_w = (nrm_w / lens).astype(np.float32)
                else:
                    nrm_w = np.tile(np.array([0.0, 1.0, 0.0], dtype=np.float32), (n_verts, 1))

                if "indices" in prim:
                    idx = read_accessor(data, bin_data, prim["indices"]).astype(np.uint32).ravel()
                else:
                    idx = np.arange(n_verts, dtype=np.uint32)

                b = get_bucket(prim.get("material"))
                b["pos"].append(pos_w)
                b["nrm"].append(nrm_w)
                b["idx"].append(idx + b["v_off"])
                b["v_off"] += n_verts

        for child in node.get("children", []):
            visit(child, world_mat)

    for r in root_nodes:
        visit(r, np.eye(4, dtype=np.float64))

    shift = np.array(
        [
            0.5 * (global_min[0] + global_max[0]),
            global_min[1],
            0.5 * (global_min[2] + global_max[2]),
        ],
        dtype=np.float32,
    )

    bin_chunks: list[bytes] = []
    bin_offset = 0
    buffer_views: list[dict[str, Any]] = []
    accessors: list[dict[str, Any]] = []
    primitives_out: list[dict[str, Any]] = []
    materials_out: list[dict[str, Any]] = []
    total_verts = 0

    def pad4(b: bytes) -> bytes:
        rem = len(b) % 4
        return b + (b"\x00" * (4 - rem) if rem else b"")

    for mat_idx, ((r, g, b_col, metallic, roughness), b) in enumerate(buckets.items()):
        pos_arr = np.vstack(b["pos"]) - shift
        nrm_arr = np.vstack(b["nrm"])
        idx_arr = np.concatenate(b["idx"])
        n_v = int(pos_arr.shape[0])
        total_verts += n_v

        use_u16 = n_v < 65535
        idx_out = idx_arr.astype(np.uint16 if use_u16 else np.uint32)
        idx_comp_type = 5123 if use_u16 else 5125

        pos_bytes = pad4(pos_arr.astype(np.float32).tobytes())
        nrm_bytes = pad4(nrm_arr.astype(np.float32).tobytes())
        idx_bytes = pad4(idx_out.tobytes())

        pos_bv = len(buffer_views)
        buffer_views.append({"buffer": 0, "byteOffset": bin_offset, "byteLength": len(pos_bytes), "target": 34962})
        bin_chunks.append(pos_bytes)
        bin_offset += len(pos_bytes)

        nrm_bv = len(buffer_views)
        buffer_views.append({"buffer": 0, "byteOffset": bin_offset, "byteLength": len(nrm_bytes), "target": 34962})
        bin_chunks.append(nrm_bytes)
        bin_offset += len(nrm_bytes)

        idx_bv = len(buffer_views)
        buffer_views.append({"buffer": 0, "byteOffset": bin_offset, "byteLength": len(idx_bytes), "target": 34963})
        bin_chunks.append(idx_bytes)
        bin_offset += len(idx_bytes)

        pos_acc = len(accessors)
        accessors.append(
            {
                "bufferView": pos_bv,
                "componentType": 5126,
                "count": n_v,
                "type": "VEC3",
                "min": [float(v) for v in pos_arr.min(axis=0)],
                "max": [float(v) for v in pos_arr.max(axis=0)],
            }
        )
        nrm_acc = len(accessors)
        accessors.append({"bufferView": nrm_bv, "componentType": 5126, "count": n_v, "type": "VEC3"})
        idx_acc = len(accessors)
        accessors.append({"bufferView": idx_bv, "componentType": idx_comp_type, "count": int(idx_out.size), "type": "SCALAR"})

        materials_out.append(
            {
                "name": f"mat_{mat_idx}",
                "pbrMetallicRoughness": {
                    "baseColorFactor": [r, g, b_col, 1.0],
                    "metallicFactor": metallic,
                    "roughnessFactor": roughness,
                },
                "doubleSided": True,
            }
        )
        primitives_out.append(
            {
                "attributes": {"POSITION": pos_acc, "NORMAL": nrm_acc},
                "indices": idx_acc,
                "material": mat_idx,
            }
        )

    bin_out = b"".join(bin_chunks)
    gltf_out = {
        "asset": {"version": "2.0", "generator": "paris-subway-3d-map-hd"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": dst.stem}],
        "meshes": [{"name": dst.stem, "primitives": primitives_out}],
        "materials": materials_out,
        "buffers": [{"byteLength": len(bin_out)}],
        "bufferViews": buffer_views,
        "accessors": accessors,
    }

    json_bytes = json.dumps(gltf_out, separators=(",", ":")).encode("utf-8")
    while len(json_bytes) % 4 != 0:
        json_bytes += b" "

    total_len = 12 + 8 + len(json_bytes) + 8 + len(bin_out)
    dst.parent.mkdir(parents=True, exist_ok=True)
    with dst.open("wb") as fp:
        fp.write(struct.pack("<III", 0x46546C67, 2, total_len))
        fp.write(struct.pack("<II", len(json_bytes), 0x4E4F534A))
        fp.write(json_bytes)
        fp.write(struct.pack("<II", len(bin_out), 0x004E4942))
        fp.write(bin_out)
    os.chmod(dst, 0o644)
    return total_verts, len(primitives_out), dst.stat().st_size


def main() -> None:
    models = [
        ("mp14_ca", "mp14_ca_cab.glb", "mp14_car.glb"),
        ("mp14_cc", "mp14_cc_cab.glb", "mp14_car.glb"),
        ("mp05", "mp05_cab.glb", "mp05_car.glb"),
        ("mp89_ca", "mp89_ca_cab.glb", "mp89_car.glb"),
        ("mp89_cc", "mp89_cc_cab.glb", "mp89_car.glb"),
        ("mf01", "mf01_cab.glb", "mf01_car.glb"),
        ("mf88", "mf88_cab.glb", "mf88_car.glb"),
        ("mf77", "mf77_cab.glb", "mf77_car.glb"),
        ("mf67", "mf67_cab.glb", "mf67_car.glb"),
        ("mp73", "mp73_cab.glb", "mp73_car.glb"),
        ("mp59", "mp59_cab.glb", "mp59_car.glb"),
        ("mf19", "mf19_cab.glb", "mf19_car.glb"),
    ]
    total_bytes = 0
    seen_cars: set[str] = set()
    for name, cab_file, car_file in models:
        v_cab, p_cab, s_cab = merge_glb_by_material(LIB_DIR / cab_file, OUT_DIR / f"{name}__cab.glb")
        total_bytes += s_cab
        car_out = car_file.replace(".glb", "")
        if car_out not in seen_cars:
            seen_cars.add(car_out)
            v_car, p_car, s_car = merge_glb_by_material(LIB_DIR / car_file, OUT_DIR / f"{car_out}.glb")
            total_bytes += s_car
            print(f"{name}: cab={v_cab}v/{p_cab}m ({s_cab//1024}KB), car({car_out})={v_car}v/{p_car}m ({s_car//1024}KB)")
        else:
            print(f"{name}: cab={v_cab}v/{p_cab}m ({s_cab//1024}KB), car({car_out})=shared")
    print(f"Total map_hd size: {total_bytes / (1024 * 1024):.2f} MB")


if __name__ == "__main__":
    main()
