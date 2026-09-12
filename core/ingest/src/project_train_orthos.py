#!/usr/bin/env python3
"""Render internal-only orthographic train-reference projections from GLB files.

This is a hand-run tooling command. It writes derived PNGs only under
assets-src/reference/ and must not be used to create published web assets.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import struct
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[3]
PPM = 64
VIEWS = {
    "side_zplus": ((0, 0, -1), (0, 1, 0)),
    "side_zminus": ((0, 0, 1), (0, 1, 0)),
    "front_xplus": ((-1, 0, 0), (0, 1, 0)),
    "rear_xminus": ((1, 0, 0), (0, 1, 0)),
    "top": ((0, -1, 0), (0, 0, -1)),
    "bottom": ((0, 1, 0), (0, 0, 1)),
}


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def load_glb(path: Path) -> tuple[dict[str, Any], bytes]:
    data = path.read_bytes()
    if len(data) < 20:
        raise ValueError(f"{path}: not a complete GLB file")
    magic, version, length = struct.unpack("<III", data[:12])
    if magic != 0x46546C67 or version != 2 or length != len(data):
        raise ValueError(f"{path}: expected a complete glTF 2.0 binary container")

    offset = 12
    chunks: list[tuple[int, bytes]] = []
    while offset < length:
        if offset + 8 > length:
            raise ValueError(f"{path}: truncated GLB chunk header")
        chunk_length, chunk_type = struct.unpack("<II", data[offset : offset + 8])
        offset += 8
        if offset + chunk_length > length:
            raise ValueError(f"{path}: truncated GLB chunk")
        chunks.append((chunk_type, data[offset : offset + chunk_length]))
        offset += chunk_length
    if len(chunks) != 2 or chunks[0][0] != 0x4E4F534A or chunks[1][0] != 0x004E4942:
        raise ValueError(f"{path}: expected exactly one JSON chunk followed by one BIN chunk")
    return json.loads(chunks[0][1]), chunks[1][1]


def assert_supported_source(gltf: dict[str, Any], path: Path) -> dict[str, Any]:
    meshes = gltf.get("meshes", [])
    if len(meshes) != 1 or len(meshes[0].get("primitives", [])) != 1:
        raise ValueError(f"{path}: expected exactly one mesh with exactly one primitive")
    for node in gltf.get("nodes", []):
        if any(key in node for key in ("matrix", "translation", "rotation", "scale")):
            raise ValueError(f"{path}: node transforms are unsupported; bake them into the mesh")

    primitive = meshes[0]["primitives"][0]
    if primitive.get("mode", 4) != 4:
        raise ValueError(f"{path}: expected triangle primitives")
    if not {"POSITION", "TEXCOORD_0"}.issubset(primitive.get("attributes", {})) or "indices" not in primitive:
        raise ValueError(f"{path}: expected POSITION, TEXCOORD_0, and indices attributes")

    images = gltf.get("images", [])
    textures = gltf.get("textures", [])
    materials = gltf.get("materials", [])
    material_index = primitive.get("material")
    if material_index is None or material_index >= len(materials):
        raise ValueError(f"{path}: expected a material with a base-colour texture")
    texture_index = materials[material_index].get("pbrMetallicRoughness", {}).get("baseColorTexture", {}).get("index")
    if texture_index is None or texture_index >= len(textures) or textures[texture_index].get("source") != 1:
        raise ValueError(f"{path}: expected images[1] to be the primitive base-colour texture")
    if len(images) <= 1 or "bufferView" not in images[1] or "uri" in images[1]:
        raise ValueError(f"{path}: expected embedded images[1] base-colour data")
    return primitive


def accessor(gltf: dict[str, Any], binary: bytes, index: int) -> np.ndarray:
    accessors = gltf.get("accessors", [])
    views = gltf.get("bufferViews", [])
    item = accessors[index]
    view = views[item["bufferView"]]
    if "byteStride" in view:
        raise ValueError("Interleaved GLB attributes are unsupported")
    dtype = {5126: "<f4", 5125: "<u4", 5123: "<u2"}.get(item["componentType"])
    components = {"VEC3": 3, "VEC2": 2, "SCALAR": 1}.get(item["type"])
    if dtype is None or components is None:
        raise ValueError("Unsupported GLB accessor format")
    start = view.get("byteOffset", 0) + item.get("byteOffset", 0)
    size = item["count"] * components * np.dtype(dtype).itemsize
    values = np.frombuffer(binary[start : start + size], dtype=dtype)
    return values.reshape(item["count"], components) if components > 1 else values


def render_view(
    positions: np.ndarray,
    uvs: np.ndarray,
    indices: np.ndarray,
    texture: np.ndarray,
    forward: tuple[int, int, int],
    up_reference: tuple[int, int, int],
) -> Image.Image:
    forward_vector = np.asarray(forward, dtype=np.float64)
    forward_vector /= np.linalg.norm(forward_vector)
    up_vector = np.asarray(up_reference, dtype=np.float64)
    up_vector -= forward_vector * (up_vector @ forward_vector)
    up_vector /= np.linalg.norm(up_vector)
    right_vector = np.cross(up_vector, forward_vector)
    projected_x = positions @ right_vector
    projected_y = -(positions @ up_vector)
    depth = positions @ forward_vector
    margin = 8
    width = int(np.ceil((projected_x.max() - projected_x.min()) * PPM)) + 2 * margin
    height = int(np.ceil((projected_y.max() - projected_y.min()) * PPM)) + 2 * margin
    pixel_x = (projected_x - projected_x.min()) * PPM + margin
    pixel_y = (projected_y - projected_y.min()) * PPM + margin
    image = np.zeros((height, width, 3), dtype=np.float64)
    alpha = np.zeros((height, width), dtype=bool)
    depth_buffer = np.full((height, width), np.inf)
    triangles_x, triangles_y, triangles_depth = pixel_x[indices], pixel_y[indices], depth[indices]
    triangles_uv = uvs[indices]
    texture_height, texture_width = texture.shape[:2]

    for triangle_index in range(len(indices)):
        x = triangles_x[triangle_index]
        y = triangles_y[triangle_index]
        area = (x[1] - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (y[1] - y[0])
        if abs(area) < 1e-12:
            continue
        left, right = max(int(np.floor(x.min())), 0), min(int(np.ceil(x.max())), width - 1)
        top, bottom = max(int(np.floor(y.min())), 0), min(int(np.ceil(y.max())), height - 1)
        if right < left or bottom < top:
            continue
        grid_x, grid_y = np.meshgrid(np.arange(left, right + 1) + 0.5, np.arange(top, bottom + 1) + 0.5)
        weight_0 = ((x[1] - grid_x) * (y[2] - grid_y) - (x[2] - grid_x) * (y[1] - grid_y)) / area
        weight_1 = ((x[2] - grid_x) * (y[0] - grid_y) - (x[0] - grid_x) * (y[2] - grid_y)) / area
        weight_2 = 1 - weight_0 - weight_1
        covered = (weight_0 >= 0) & (weight_1 >= 0) & (weight_2 >= 0)
        if not covered.any():
            continue
        pixel_depth = (weight_0 * triangles_depth[triangle_index, 0] + weight_1 * triangles_depth[triangle_index, 1] + weight_2 * triangles_depth[triangle_index, 2])[covered]
        rows, columns = grid_y[covered].astype(int), grid_x[covered].astype(int)
        visible = pixel_depth < depth_buffer[rows, columns]
        if not visible.any():
            continue
        uv = (
            weight_0[covered, None] * triangles_uv[triangle_index, 0]
            + weight_1[covered, None] * triangles_uv[triangle_index, 1]
            + weight_2[covered, None] * triangles_uv[triangle_index, 2]
        )
        texture_x = np.clip((uv[:, 0] % 1.0) * (texture_width - 1), 0, texture_width - 1).astype(int)
        texture_y = np.clip((uv[:, 1] % 1.0) * (texture_height - 1), 0, texture_height - 1).astype(int)
        depth_buffer[rows[visible], columns[visible]] = pixel_depth[visible]
        image[rows[visible], columns[visible]] = texture[texture_y[visible], texture_x[visible]]
        alpha[rows[visible], columns[visible]] = True
    return Image.fromarray(np.dstack([(image * 255).astype(np.uint8), (alpha * 255).astype(np.uint8)]), "RGBA")


def project_source(family_id: str, source: Path, dimensions: dict[str, float], output_root: Path) -> None:
    gltf, binary = load_glb(source)
    primitive = assert_supported_source(gltf, source)
    positions = accessor(gltf, binary, primitive["attributes"]["POSITION"]).astype(np.float64)
    uvs = accessor(gltf, binary, primitive["attributes"]["TEXCOORD_0"]).astype(np.float64)
    indices = accessor(gltf, binary, primitive["indices"]).astype(np.int64).reshape(-1, 3)
    image_view = gltf["bufferViews"][gltf["images"][1]["bufferView"]]
    start = image_view.get("byteOffset", 0)
    texture = np.asarray(Image.open(io.BytesIO(binary[start : start + image_view["byteLength"]])).convert("RGB"), dtype=np.float64) / 255.0

    source_dimensions = positions.max(axis=0) - positions.min(axis=0)
    if np.any(source_dimensions <= 0):
        raise ValueError(f"{source}: mesh bounds must be non-zero on all axes")
    positions *= np.array([dimensions["car_length_m"], dimensions["car_height_m"], dimensions["width_m"]]) / source_dimensions
    positions[:, 0] -= (positions[:, 0].max() + positions[:, 0].min()) / 2
    positions[:, 2] -= (positions[:, 2].max() + positions[:, 2].min()) / 2
    positions[:, 1] -= positions[:, 1].min()

    destination = output_root / family_id
    destination.mkdir(parents=True, exist_ok=True)
    rendered: dict[str, str] = {}
    for name, (forward, up_reference) in VIEWS.items():
        output = destination / f"ortho_{name}.png"
        render_view(positions, uvs, indices, texture, forward, up_reference).save(output)
        rendered[name] = output.name
    side = Image.open(destination / rendered["side_zplus"])
    front = Image.open(destination / rendered["front_xplus"])
    top = Image.open(destination / rendered["top"])
    sheet = Image.new("RGBA", (max(side.width, top.width) + front.width + 24, side.height + top.height + 24), (18, 20, 24, 255))
    draw = ImageDraw.Draw(sheet)
    for coordinate in range(0, sheet.width, PPM):
        draw.line([(coordinate, 0), (coordinate, sheet.height)], fill=(90, 110, 130, 70))
    for coordinate in range(0, sheet.height, PPM):
        draw.line([(0, coordinate), (sheet.width, coordinate)], fill=(90, 110, 130, 70))
    sheet.alpha_composite(side, (0, 0))
    sheet.alpha_composite(front, (side.width + 24, 0))
    sheet.alpha_composite(top, (0, side.height + 24))
    sheet.save(destination / "blueprint_sheet.png")
    (destination / "blueprint_scale.json").write_text(json.dumps({
        "source": source.name,
        "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "pixels_per_metre": PPM,
        "car_dimensions_m": dimensions,
        "origin": "x,z centred; y = 0 at rail head",
        "projection": "orthographic, unlit albedo, alpha = silhouette",
        "views": rendered,
    }, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        action="append",
        required=True,
        metavar="FAMILY_ID=GLB_PATH",
        help="Source GLB to project; repeat once per rolling-stock reference family.",
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        default=ROOT / "assets-src" / "reference",
        help="Internal source output root (never web/public).",
    )
    args = parser.parse_args()
    stock_path = ROOT / "cities" / "paris" / "data" / "rolling-stock.json"
    if not stock_path.exists():
        stock_path = ROOT / "data" / "rolling-stock.json"
    families = load_json(stock_path).get("asset_families", {})
    for specification in args.input:
        family_id, separator, source_name = specification.partition("=")
        if not separator or not family_id or not source_name:
            raise ValueError(f"Invalid --input {specification!r}; expected FAMILY_ID=GLB_PATH")
        family = families.get(family_id)
        if family is None:
            raise ValueError(f"Unknown asset family {family_id!r} in data/rolling-stock.json")
        dimensions = family.get("reference_dimensions_m", {})
        required_dimensions = {"car_length_m", "car_height_m", "width_m"}
        if set(dimensions) != required_dimensions or any(dimensions[key] <= 0 for key in required_dimensions):
            raise ValueError(f"{family_id}: reference_dimensions_m must define positive length, height, and width")
        project_source(family_id, Path(source_name), dimensions, args.output_root)


if __name__ == "__main__":
    main()