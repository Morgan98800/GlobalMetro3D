#!/usr/bin/env python3
"""
build_berlin_train_models.py — Générateur clean-room des modèles 3D GLB pour le U-Bahn de Berlin (BVG).

Génère deux modèles low-poly conformes au contrat de rendu 3D (< 15 Ko chacun) :
1. bvg_kleinprofil__neutral.glb : Caisse standard Kleinprofil (U1 à U4)
   - Longueur : 12.80 m
   - Largeur : 2.30 m
   - Hauteur : 3.18 m
2. bvg_grossprofil__neutral.glb : Caisse standard Großprofil (U5 à U9)
   - Longueur : 15.50 m
   - Largeur : 2.65 m
   - Hauteur : 3.45 m

Contrat géométrique :
- Axe longitudinal : +X (de -car_length_m/2 à +car_length_m/2)
- Hauteur : y = 0 au niveau du champignon du rail (rail head) jusqu'à +car_height_m
- Largeur : z centré (-width_m/2 à +width_m/2)
- Livrée neutre jaune et gris BVG clean-room sans logo officiel ni marque déposée
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
    roof_chamfer_m: float = 0.25,
    skirt_height_m: float = 0.40,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Génère la géométrie d'une caisse de métro chanfreinée."""
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


def create_cleanroom_berlin_atlas() -> bytes:
    """Génère une texture atlas clean-room neutre 256x256 avec la livrée jaune U-Bahn."""
    img = Image.new("RGB", (256, 256), color=(240, 215, 34)) # Jaune signal U-Bahn (#F0D722)
    draw = ImageDraw.Draw(img)

    # Toit gris moyen (Y: 0 à 60)
    draw.rectangle([0, 0, 256, 60], fill=(85, 90, 95))

    # Bande vitrée sombre avec montants jaunes (Y: 90 à 150)
    draw.rectangle([0, 90, 256, 150], fill=(240, 215, 34))
    # Fenêtres
    for x in range(10, 240, 30):
        draw.rectangle([x, 95, x + 20, 145], fill=(35, 45, 55))

    # Portes doubles grises / vitrées
    for dx in [40, 120, 200]:
        draw.rectangle([dx - 5, 80, dx + 15, 175], fill=(210, 215, 220))
        draw.rectangle([dx - 2, 95, dx + 12, 145], fill=(30, 40, 50))

    # Jupe / bas de caisse anthracite (Y: 175 à 256)
    draw.rectangle([0, 175, 256, 256], fill=(45, 48, 52))

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
    name: str = "bvg_train",
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
        "asset": {"version": "2.0", "generator": "ParisSubway3D Berlin Clean-Room GLB Builder"},
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
            },
        ],
        "materials": [{
            "name": f"{name}_mat",
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": 0},
                "metallicFactor": 0.3,
                "roughnessFactor": 0.5,
            },
            "doubleSided": False,
        }],
        "textures": [{"sampler": 0, "source": 0}],
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}],
        "images": [{"bufferView": v_img, "mimeType": "image/png"}],
        "bufferViews": views,
        "buffers": [{"byteLength": offset}],
    }

    js = pad4(json.dumps(gltf, separators=(",", ":")).encode("utf-8"), b" ")
    bin_ = b"".join(blobs)
    total = 12 + 8 + len(js) + 8 + len(bin_)

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A))
        f.write(js)
        f.write(struct.pack("<II", len(bin_), 0x004E4942))
        f.write(bin_)

    return total


def build_berlin_models() -> dict[str, int]:
    """Génère les deux modèles génériques BVG Kleinprofil et Großprofil."""
    png_berlin = create_cleanroom_berlin_atlas()

    # 1. Kleinprofil (U1 - U4) : L = 12.80 m, l = 2.30 m, h = 3.18 m
    P_kp, N_kp, UV_kp, I_kp = build_car_mesh(
        length_m=12.80,
        width_m=2.30,
        height_m=3.18,
        roof_chamfer_m=0.25,
        skirt_height_m=0.40,
    )

    # 2. Großprofil (U5 - U9) : L = 15.50 m, l = 2.65 m, h = 3.45 m
    P_gp, N_gp, UV_gp, I_gp = build_car_mesh(
        length_m=15.50,
        width_m=2.65,
        height_m=3.45,
        roof_chamfer_m=0.28,
        skirt_height_m=0.42,
    )

    destinations = [
        ROOT / "cities" / "berlin" / "assets" / "models" / "train",
        ROOT / "web" / "public" / "cities" / "berlin" / "models" / "train",
        ROOT / "web" / "public" / "models" / "train",
    ]
    if (ROOT / "web" / "dist").exists():
        destinations.append(ROOT / "web" / "dist" / "cities" / "berlin" / "models" / "train")
        destinations.append(ROOT / "web" / "dist" / "models" / "train")

    sizes = {}
    for dest_dir in destinations:
        dest_dir.mkdir(parents=True, exist_ok=True)

        size_kp = write_glb(
            dest_dir / "bvg_kleinprofil__neutral.glb",
            P_kp,
            N_kp,
            UV_kp,
            I_kp,
            png_berlin,
            "bvg_kleinprofil",
        )
        sizes["bvg_kleinprofil__neutral.glb"] = size_kp

        size_gp = write_glb(
            dest_dir / "bvg_grossprofil__neutral.glb",
            P_gp,
            N_gp,
            UV_gp,
            I_gp,
            png_berlin,
            "bvg_grossprofil",
        )
        sizes["bvg_grossprofil__neutral.glb"] = size_gp

    return sizes


if __name__ == "__main__":
    sizes = build_berlin_models()
    print("Modèles GLB Berlin générés avec succès :")
    for name, s in sizes.items():
        kb = s / 1024.0
        print(f"  {name:30s}: {s:6d} octets ({kb:.2f} Ko) — < 15 Ko : {'OUI' if kb < 15.0 else 'NON'}")
