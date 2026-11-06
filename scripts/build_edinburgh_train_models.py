#!/usr/bin/env python3
"""
build_edinburgh_train_models.py — Générateur clean-room du modèle 3D GLB pour le tramway d'Édimbourg (CAF Urbos 3).

Génère un modèle low-poly conforme au contrat de rendu 3D (< 15 Ko) :
- Modèle : caf_urbos_3__neutral.glb
- Longueur hors-tout : 42.80 m (rame de 7 modules articulés)
- Largeur : 2.65 m
- Hauteur : 3.40 m

Contrat géométrique :
- Axe longitudinal : +X (de -total_length/2 à +total_length/2)
- Hauteur : y = 0 au niveau du champignon du rail (rail head) jusqu'à +car_height_m
- Largeur : z centré (-width_m/2 à +width_m/2)
- Livrée neutre bordeaux pantone 222C (#8B1D42) et blanc cassé clean-room sans logo officiel
"""

from __future__ import annotations

import io
import json
import math
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]


def build_car_mesh(
    length_m: float,
    width_m: float,
    height_m: float,
    roof_chamfer_m: float = 0.20,
    skirt_height_m: float = 0.35,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Génère la géométrie d'une caisse de tramway chanfreinée."""
    half_l = length_m / 2.0
    half_w = width_m / 2.0

    y0 = skirt_height_m
    y1 = height_m - roof_chamfer_m
    y2 = height_m
    z0 = -half_w
    z1 = half_w
    z_roof0 = -half_w + roof_chamfer_m
    z_roof1 = half_w - roof_chamfer_m

    positions = []
    normals = []
    uvs = []
    indices = []

    def add_quad(p0, p1, p2, p3, n, uv0, uv1, uv2, uv3):
        base = len(positions)
        positions.extend([p0, p1, p2, p3])
        normals.extend([n, n, n, n])
        uvs.extend([uv0, uv1, uv2, uv3])
        indices.extend([base, base + 1, base + 2, base, base + 2, base + 3])

    # 1. Flanc gauche (Z = -half_w)
    add_quad(
        [-half_l, y0, z0],
        [half_l, y0, z0],
        [half_l, y1, z0],
        [-half_l, y1, z0],
        [0.0, 0.0, -1.0],
        [0.0, 0.65],
        [1.0, 0.65],
        [1.0, 0.35],
        [0.0, 0.35],
    )

    # 2. Flanc droit (Z = +half_w)
    add_quad(
        [-half_l, y1, z1],
        [half_l, y1, z1],
        [half_l, y0, z1],
        [-half_l, y0, z1],
        [0.0, 0.0, 1.0],
        [0.0, 0.35],
        [1.0, 0.35],
        [1.0, 0.65],
        [0.0, 0.65],
    )

    # 3. Chanfrein toit gauche
    n_cg = [-roof_chamfer_m, roof_chamfer_m, 0.0]
    len_cg = math.hypot(n_cg[0], n_cg[1])
    norm_cg = [0.0, n_cg[1] / len_cg, -n_cg[0] / len_cg]
    add_quad(
        [-half_l, y1, z0],
        [half_l, y1, z0],
        [half_l, y2, z_roof0],
        [-half_l, y2, z_roof0],
        norm_cg,
        [0.0, 0.35],
        [1.0, 0.35],
        [1.0, 0.20],
        [0.0, 0.20],
    )

    # 4. Toit central plat
    add_quad(
        [-half_l, y2, z_roof0],
        [half_l, y2, z_roof0],
        [half_l, y2, z_roof1],
        [-half_l, y2, z_roof1],
        [0.0, 1.0, 0.0],
        [0.0, 0.20],
        [1.0, 0.20],
        [1.0, 0.05],
        [0.0, 0.05],
    )

    # 5. Chanfrein toit droit
    n_cd = [roof_chamfer_m, roof_chamfer_m, 0.0]
    len_cd = math.hypot(n_cd[0], n_cd[1])
    norm_cd = [0.0, n_cd[1] / len_cd, n_cd[0] / len_cd]
    add_quad(
        [-half_l, y2, z_roof1],
        [half_l, y2, z_roof1],
        [half_l, y1, z1],
        [-half_l, y1, z1],
        norm_cd,
        [0.0, 0.05],
        [1.0, 0.05],
        [1.0, 0.20],
        [0.0, 0.20],
    )

    # 6. Face avant (+X)
    add_quad(
        [half_l, y0, z0],
        [half_l, y0, z1],
        [half_l, y1, z1],
        [half_l, y1, z0],
        [1.0, 0.0, 0.0],
        [0.0, 0.95],
        [0.5, 0.95],
        [0.5, 0.70],
        [0.0, 0.70],
    )

    # 7. Face arrière (-X)
    add_quad(
        [-half_l, y0, z1],
        [-half_l, y0, z0],
        [-half_l, y1, z0],
        [-half_l, y1, z1],
        [-1.0, 0.0, 0.0],
        [0.5, 0.95],
        [1.0, 0.95],
        [1.0, 0.70],
        [0.5, 0.70],
    )

    # 8. Dessous / Jupe
    add_quad(
        [-half_l, y0, z1],
        [half_l, y0, z1],
        [half_l, y0, z0],
        [-half_l, y0, z0],
        [0.0, -1.0, 0.0],
        [0.0, 0.98],
        [1.0, 0.98],
        [1.0, 1.0],
        [0.0, 1.0],
    )

    return (
        np.array(positions, dtype=np.float32),
        np.array(normals, dtype=np.float32),
        np.array(uvs, dtype=np.float32),
        np.array(indices, dtype=np.uint16),
    )


def create_cleanroom_edinburgh_atlas() -> bytes:
    """Génère une texture atlas clean-room neutre 256x256 avec la livrée bordeaux et blanc cassé Edinburgh Trams."""
    # Fond blanc cassé (#F4F4F6)
    img = Image.new("RGB", (256, 256), color=(244, 244, 246))
    draw = ImageDraw.Draw(img)

    # Toit gris technique (Y: 0 à 50)
    draw.rectangle([0, 0, 256, 50], fill=(95, 100, 105))

    # Bandeau bordeaux supérieur (#8B1D42) (Y: 50 à 75)
    draw.rectangle([0, 50, 256, 75], fill=(139, 29, 66))

    # Bande vitrée continue avec baies panoramiques (Y: 75 à 150)
    draw.rectangle([0, 75, 256, 150], fill=(220, 222, 225))
    for x in range(15, 245, 28):
        draw.rectangle([x, 82, x + 18, 142], fill=(30, 40, 50))

    # Ligne de ceinture fine bordeaux sous les vitres (Y: 150 à 160)
    draw.rectangle([0, 150, 256, 160], fill=(139, 29, 66))

    # Portes doubles bordeaux (#8B1D42)
    for dx in [35, 95, 155, 215]:
        draw.rectangle([dx - 6, 75, dx + 14, 185], fill=(139, 29, 66))
        draw.rectangle([dx - 3, 85, dx + 11, 145], fill=(30, 40, 50))

    # Jupe / bas de caisse anthracite (Y: 185 à 256)
    draw.rectangle([0, 185, 256, 256], fill=(45, 48, 52))

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def pad4(b: bytes, pad_byte: bytes = b"\x00") -> bytes:
    rem = len(b) % 4
    return b + (pad_byte * (4 - rem)) if rem != 0 else b


def write_glb(
    path: Path,
    P: np.ndarray,
    N: np.ndarray,
    UV: np.ndarray,
    I: np.ndarray,
    png_bytes: bytes,
    name: str = "caf_urbos_3",
) -> int:
    """Écrit un fichier glTF 2.0 binaire (GLB)."""
    p_bytes = P.tobytes()
    n_bytes = N.tobytes()
    uv_bytes = UV.tobytes()
    i_bytes = I.tobytes()

    views = []
    blobs = []
    offset = 0

    def add_view(data: bytes, target: int | None = None) -> int:
        nonlocal offset
        padded = pad4(data)
        v = {
            "buffer": 0,
            "byteOffset": offset,
            "byteLength": len(data),
        }
        if target:
            v["target"] = target
        views.append(v)
        blobs.append(padded)
        idx = len(views) - 1
        offset += len(padded)
        return idx

    v_pos = add_view(p_bytes, 34962)
    v_nrm = add_view(n_bytes, 34962)
    v_uv = add_view(uv_bytes, 34962)
    v_idx = add_view(i_bytes, 34963)
    v_img = add_view(png_bytes)

    min_p = P.min(axis=0).tolist()
    max_p = P.max(axis=0).tolist()

    gltf = {
        "asset": {"version": "2.0", "generator": "ParisSubway3D Edinburgh Clean-Room GLB Builder"},
        "scenes": [{"nodes": [0]}],
        "nodes": [{"name": name, "mesh": 0}],
        "meshes": [{
            "name": f"{name}_mesh",
            "primitives": [{
                "attributes": {
                    "POSITION": 0,
                    "NORMAL": 1,
                    "TEXCOORD_0": 2,
                },
                "indices": 3,
                "material": 0,
            }],
        }],
        "accessors": [
            {
                "bufferView": v_pos,
                "componentType": 5126,
                "count": len(P),
                "type": "VEC3",
                "min": min_p,
                "max": max_p,
            },
            {
                "bufferView": v_nrm,
                "componentType": 5126,
                "count": len(N),
                "type": "VEC3",
            },
            {
                "bufferView": v_uv,
                "componentType": 5126,
                "count": len(UV),
                "type": "VEC2",
            },
            {
                "bufferView": v_idx,
                "componentType": 5123,
                "count": len(I),
                "type": "SCALAR",
                "min": [int(I.min())],
                "max": [int(I.max())],
            },
        ],
        "materials": [{
            "name": f"{name}_mat",
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": 0},
                "metallicFactor": 0.1,
                "roughnessFactor": 0.6,
            },
        }],
        "textures": [{"sampler": 0, "source": 0}],
        "images": [{"bufferView": v_img, "mimeType": "image/png"}],
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}],
        "bufferViews": views,
        "buffers": [{"byteLength": offset}],
    }

    json_str = json.dumps(gltf, separators=(",", ":"))
    json_bytes = pad4(json_str.encode("utf-8"), b" ")
    bin_bytes = b"".join(blobs)

    header = struct.pack(
        "<4sII",
        b"glTF",
        2,
        12 + 8 + len(json_bytes) + 8 + len(bin_bytes),
    )
    c0 = struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
    c1 = struct.pack("<II", len(bin_bytes), 0x004E4942) + bin_bytes

    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as f:
        f.write(header)
        f.write(c0)
        f.write(c1)

    return path.stat().st_size


def build_models() -> None:
    source_dir = ROOT / "cities" / "edinburgh" / "assets" / "models" / "train"
    web_dir = ROOT / "web" / "public" / "models" / "train"

    png_bytes = create_cleanroom_edinburgh_atlas()

    # CAF Urbos 3 Édimbourg : rame complète 7 caisses articulées (longueur 42.80 m, largeur 2.65 m, hauteur 3.40 m)
    P, N, UV, I = build_car_mesh(length_m=42.80, width_m=2.65, height_m=3.40)
    
    for dest_dir in [source_dir, web_dir]:
        dest_file = dest_dir / "caf_urbos_3__neutral.glb"
        sz = write_glb(dest_file, P, N, UV, I, png_bytes, name="caf_urbos_3")
        print(f"Generated {dest_file.relative_to(ROOT)} ({sz} bytes, {sz/1024:.2f} KB)")


if __name__ == "__main__":
    build_models()
