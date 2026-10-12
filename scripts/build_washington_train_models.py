#!/usr/bin/env python3
"""
build_washington_train_models.py — Générateur clean-room du modèle 3D GLB pour le Metrorail de Washington (WMATA).

Génère un modèle low-poly conforme au contrat de rendu 3D (< 15 Ko) :
- wmata_generic__neutral.glb : Caisse standard Metrorail (longueur 22.86 m = 75 ft, largeur 3.09 m, hauteur 3.30 m)

Contrat géométrique :
- Axe longitudinal : +X (de -car_length_m/2 à +car_length_m/2) -> car_length_m = 22.86 m
- Hauteur : y=0 au niveau du champignon du rail (rail head) jusqu'à +car_height_m (3.30 m)
- Largeur : z centré (-width_m/2 à +width_m/2) -> width_m = 3.09 m
- Livery neutre en acier inoxydable / aluminium brossé sans logo ni marque (méthode clean-room)
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
    length_m: float = 22.86,
    width_m: float = 3.09,
    height_m: float = 3.30,
    roof_chamfer_m: float = 0.35,
    skirt_height_m: float = 0.45,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Génère la géométrie d'une caisse chanfreinée avec pavillon galbé."""
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
    len_cg = math.sqrt(n_cg[0] ** 2 + n_cg[1] ** 2)
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

    # 4. Toit plat supérieur
    add_quad(
        [-half_l, y2, z_roof0],
        [half_l, y2, z_roof0],
        [half_l, y2, z_roof1],
        [-half_l, y2, z_roof1],
        [0.0, 1.0, 0.0],
        [0.0, 0.20],
        [1.0, 0.20],
        [1.0, 0.0],
        [0.0, 0.0],
    )

    # 5. Chanfrein toit droit
    norm_cd = [0.0, n_cg[1] / len_cg, n_cg[0] / len_cg]
    add_quad(
        [-half_l, y2, z_roof1],
        [half_l, y2, z_roof1],
        [half_l, y1, z1],
        [-half_l, y1, z1],
        norm_cd,
        [0.0, 0.0],
        [1.0, 0.0],
        [1.0, 0.35],
        [0.0, 0.35],
    )

    # 6. Face avant (+X = cabine / nez)
    add_quad(
        [half_l, y0, z0],
        [half_l, y0, z1],
        [half_l, y1, z1],
        [half_l, y1, z0],
        [1.0, 0.0, 0.0],
        [0.0, 1.0],
        [0.5, 1.0],
        [0.5, 0.70],
        [0.0, 0.70],
    )
    add_quad(
        [half_l, y1, z0],
        [half_l, y1, z1],
        [half_l, y2, z_roof1],
        [half_l, y2, z_roof0],
        [1.0, 0.5, 0.0],
        [0.0, 0.70],
        [0.5, 0.70],
        [0.4, 0.65],
        [0.1, 0.65],
    )

    # 7. Face arrière (-X = intercirculation)
    add_quad(
        [-half_l, y0, z1],
        [-half_l, y0, z0],
        [-half_l, y1, z0],
        [-half_l, y1, z1],
        [-1.0, 0.0, 0.0],
        [0.5, 1.0],
        [1.0, 1.0],
        [1.0, 0.70],
        [0.5, 0.70],
    )
    add_quad(
        [-half_l, y1, z1],
        [-half_l, y1, z0],
        [-half_l, y2, z_roof0],
        [-half_l, y2, z_roof1],
        [-1.0, 0.5, 0.0],
        [0.5, 0.70],
        [1.0, 0.70],
        [0.9, 0.65],
        [0.6, 0.65],
    )

    # 8. Dessous / châssis
    add_quad(
        [-half_l, y0, z1],
        [half_l, y0, z1],
        [half_l, y0, z0],
        [-half_l, y0, z0],
        [0.0, -1.0, 0.0],
        [0.6, 0.95],
        [1.0, 0.95],
        [1.0, 0.70],
        [0.6, 0.70],
    )

    return (
        np.array(positions, dtype="<f4"),
        np.array(normals, dtype="<f4"),
        np.array(uvs, dtype="<f4"),
        np.array(indices, dtype="<u2"),
    )


def create_cleanroom_wmata_atlas() -> bytes:
    """Génère un atlas de texture 256x256 épuré pour le Metrorail WMATA (inox/alu brossé, < 4 Ko en PNG)."""
    # Teinte de base acier inoxydable / aluminium brossé neutre
    img = Image.new("RGBA", (256, 256), (220, 224, 228, 255))
    draw = ImageDraw.Draw(img)

    # Toit gris technique (y=0..50)
    draw.rectangle([0, 0, 256, 50], fill=(165, 170, 176, 255))
    # Équipements de toiture et climatiseurs (2 groupes par caisse de 23m)
    draw.rectangle([30, 8, 110, 42], fill=(125, 130, 138, 255))
    draw.rectangle([146, 8, 226, 42], fill=(125, 130, 138, 255))

    # Cannelures longitudinales toiture
    for ry in [15, 25, 35]:
        draw.line([0, ry, 256, ry], fill=(145, 150, 158, 255), width=1)

    # Bandeau de vitres et portes latérales (y=90..165)
    # Vitrage teinté sombre continu
    draw.rectangle([0, 95, 256, 145], fill=(32, 36, 44, 255))

    # 3 paires de portes coulissantes par flanc (disposition standard Metrorail 75ft)
    door_color = (200, 205, 212, 255)
    for dx in [20, 108, 196]:
        draw.rectangle([dx, 90, dx + 40, 165], fill=door_color)
        # 2 vitres de porte par paire
        draw.rectangle([dx + 4, 98, dx + 18, 138], fill=(28, 32, 40, 255))
        draw.rectangle([dx + 22, 98, dx + 36, 138], fill=(28, 32, 40, 255))

    # Cannelures inox flanc bas de caisse
    for cy in [148, 154, 160]:
        draw.line([0, cy, 256, cy], fill=(185, 190, 198, 255), width=1)

    # Bas de caisse / carénages bogies (y=165..180)
    draw.rectangle([0, 165, 256, 180], fill=(55, 60, 66, 255))

    # Face avant / nez cabine (y=180..255, x=0..128)
    draw.rectangle([0, 180, 128, 255], fill=(215, 220, 226, 255))
    # Pare-brise profilé noir
    draw.rectangle([10, 188, 70, 228], fill=(22, 26, 34, 255))
    # Bandeau noir entre phares
    draw.rectangle([10, 232, 70, 240], fill=(40, 44, 50, 255))
    # Phares doubles
    draw.ellipse([14, 234, 24, 240], fill=(255, 255, 240, 255))
    draw.ellipse([56, 234, 66, 240], fill=(255, 255, 240, 255))

    # Face arrière (y=180..255, x=128..256)
    draw.rectangle([128, 180, 256, 255], fill=(195, 200, 206, 255))
    # Porte d'intercirculation
    draw.rectangle([140, 190, 175, 255], fill=(60, 65, 72, 255))
    draw.rectangle([146, 198, 169, 222], fill=(28, 32, 40, 255))

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def write_glb(path: Path, P: np.ndarray, N: np.ndarray, UV: np.ndarray, I: np.ndarray, png: bytes, name: str) -> int:
    """Écrit le fichier GLB binaire conforme glTF 2.0 sans dépendance externe."""
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

    v_pos = add(P.tobytes(), target=34962)
    v_nrm = add(N.tobytes(), target=34962)
    v_uv = add(UV.tobytes(), target=34962)
    v_idx = add(I.tobytes(), target=34963)
    v_img = add(png)

    gltf = {
        "asset": {"version": "2.0", "generator": "build_washington_train_models.py"},
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
            }]
        }],
        "accessors": [
            {
                "bufferView": v_pos,
                "componentType": 5126,
                "count": len(P),
                "type": "VEC3",
                "min": [float(x) for x in P.min(0)],
                "max": [float(x) for x in P.max(0)],
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
                "metallicFactor": 0.4,
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


def build_models() -> dict[str, int]:
    """Génère le modèle générique de rame Metrorail WMATA (22.86 m)."""
    P_car, N_car, UV_car, I_car = build_car_mesh(
        length_m=22.86,
        width_m=3.09,
        height_m=3.30,
        roof_chamfer_m=0.35,
        skirt_height_m=0.45
    )

    png_wmata = create_cleanroom_wmata_atlas()

    destinations = [
        ROOT / "cities" / "washington" / "assets" / "models" / "train",
        ROOT / "web" / "public" / "cities" / "washington" / "models" / "train",
        ROOT / "web" / "public" / "models" / "train",
    ]
    if (ROOT / "web" / "dist").exists():
        destinations.append(ROOT / "web" / "dist" / "cities" / "washington" / "models" / "train")
        destinations.append(ROOT / "web" / "dist" / "models" / "train")

    sizes = {}
    for dest_dir in destinations:
        dest_dir.mkdir(parents=True, exist_ok=True)
        size_car = write_glb(
            dest_dir / "wmata_generic__neutral.glb",
            P_car,
            N_car,
            UV_car,
            I_car,
            png_wmata,
            "wmata_generic"
        )
        sizes["wmata_generic__neutral.glb"] = size_car

    return sizes


if __name__ == "__main__":
    sizes = build_models()
    print("Modèles GLB Washington générés avec succès :")
    for name, s in sizes.items():
        kb = s / 1024.0
        print(f"  {name:30s}: {s:6d} octets ({kb:.2f} Ko) — < 15 Ko : {'OUI' if kb < 15.0 else 'NON'}")
