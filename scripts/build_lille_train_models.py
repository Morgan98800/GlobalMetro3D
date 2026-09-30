#!/usr/bin/env python3
"""
build_lille_train_models.py — Générateur clean-room de modèles GLB pour le métro VAL de Lille.

Génère deux modèles low-poly conformes au contrat de rendu 3D (< 15 Ko chacun) :
1. val_208__neutral.glb : Caisse VAL 208 (longueur 13.0 m, largeur 2.06 m, hauteur 3.25 m)
2. val_52m__neutral.glb : Caisse Boa 52m Alstom Metropolis (longueur 13.0 m, largeur 2.06 m, hauteur 3.25 m)

Contrat géométrique :
- Axe longitudinal : +X (de -car_length_m/2 à +car_length_m/2)
- Hauteur : y=0 au niveau du rail (rail head) jusqu'à +car_height_m
- Largeur : z centré (-width_m/2 à +width_m/2)
- Livery neutre sans marque ni pixel externe (méthode clean-room)
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
    length_m: float = 13.0,
    width_m: float = 2.06,
    height_m: float = 3.25,
    roof_chamfer_m: float = 0.25,
    skirt_height_m: float = 0.40,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Génère la géométrie d'une caisse chanfreinée avec pavillon galbé."""
    half_l = length_m / 2.0
    half_w = width_m / 2.0

    # Profil en section transversale (Y, Z)
    # y=0 rail head, skirt at skirt_height_m
    y0 = skirt_height_m
    y1 = height_m - roof_chamfer_m
    y2 = height_m
    z0 = -half_w
    z1 = half_w
    z_roof0 = -half_w + roof_chamfer_m
    z_roof1 = half_w - roof_chamfer_m

    # Sommets d'une tranche transversale à X:
    # 0: bas gauche (y0, z0)
    # 1: haut gauche (y1, z0)
    # 2: chanfrein toit gauche (y2, z_roof0)
    # 3: chanfrein toit droite (y2, z_roof1)
    # 4: haut droite (y1, z1)
    # 5: bas droite (y0, z1)
    cross_section = [
        (y0, z0),
        (y1, z0),
        (y2, z_roof0),
        (y2, z_roof1),
        (y1, z1),
        (y0, z1),
    ]

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

    # 3. Toit gauche chanfreiné
    n_roof_l = [0.0, roof_chamfer_m, -roof_chamfer_m]
    n_len = math.hypot(n_roof_l[1], n_roof_l[2])
    n_roof_l = [0.0, n_roof_l[1] / n_len, n_roof_l[2] / n_len]
    add_quad(
        [-half_l, y1, z0],
        [half_l, y1, z0],
        [half_l, y2, z_roof0],
        [-half_l, y2, z_roof0],
        n_roof_l,
        [0.0, 0.35],
        [1.0, 0.35],
        [1.0, 0.20],
        [0.0, 0.20],
    )

    # 4. Toit central plat / galbé
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

    # 5. Toit droit chanfreiné
    n_roof_r = [0.0, roof_chamfer_m, roof_chamfer_m]
    n_roof_r = [0.0, n_roof_r[1] / n_len, n_roof_r[2] / n_len]
    add_quad(
        [-half_l, y2, z_roof1],
        [half_l, y2, z_roof1],
        [half_l, y1, z1],
        [-half_l, y1, z1],
        n_roof_r,
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
        [0.3, 0.95],
        [0.3, 0.70],
        [0.0, 0.70],
    )
    # Bout de toit avant
    base = len(positions)
    positions.extend([
        [half_l, y1, z0],
        [half_l, y1, z1],
        [half_l, y2, z_roof1],
        [half_l, y2, z_roof0],
    ])
    normals.extend([[1.0, 0.0, 0.0]] * 4)
    uvs.extend([[0.0, 0.70], [0.3, 0.70], [0.3, 0.65], [0.0, 0.65]])
    indices.extend([base, base + 1, base + 2, base, base + 2, base + 3])

    # 7. Face arrière (-X)
    add_quad(
        [-half_l, y0, z1],
        [-half_l, y0, z0],
        [-half_l, y1, z0],
        [-half_l, y1, z1],
        [-1.0, 0.0, 0.0],
        [0.3, 0.95],
        [0.6, 0.95],
        [0.6, 0.70],
        [0.3, 0.70],
    )
    base = len(positions)
    positions.extend([
        [-half_l, y1, z1],
        [-half_l, y1, z0],
        [-half_l, y2, z_roof0],
        [-half_l, y2, z_roof1],
    ])
    normals.extend([[-1.0, 0.0, 0.0]] * 4)
    uvs.extend([[0.3, 0.70], [0.6, 0.70], [0.6, 0.65], [0.3, 0.65]])
    indices.extend([base, base + 1, base + 2, base, base + 2, base + 3])

    # 8. Dessous (plancher)
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


def create_cleanroom_atlas(is_52m: bool = False) -> bytes:
    """Génère un atlas de texture 256x256 épuré et ultra-léger (< 4 Ko en PNG)."""
    img = Image.new("RGBA", (256, 256), (235, 237, 240, 255))
    draw = ImageDraw.Draw(img)

    # Toit gris technique (y=0..50)
    draw.rectangle([0, 0, 256, 50], fill=(160, 165, 172, 255))
    # Bande d'équipements toiture centrale
    draw.rectangle([0, 10, 256, 35], fill=(110, 115, 122, 255))

    # Bandeau de vitres et portes latérales (y=90..160)
    # Fond vitrage teinté sombre
    draw.rectangle([0, 95, 256, 145], fill=(35, 40, 48, 255))

    # Portes automatiques VAL (2 portes larges par flanc de caisse de 13 m)
    door_color = (205, 210, 215, 255)
    for dx in [40, 150]:
        draw.rectangle([dx, 90, dx + 45, 165], fill=door_color)
        # Vitre de porte
        draw.rectangle([dx + 5, 100, dx + 40, 135], fill=(30, 35, 42, 255))

    # Bas de caisse / jupes (y=165..180)
    draw.rectangle([0, 165, 256, 180], fill=(50, 55, 60, 255))

    # Livrée discrète / accent
    accent = (220, 30, 40, 255) if is_52m else (245, 195, 30, 255)
    draw.rectangle([0, 88, 256, 94], fill=accent)

    # Face avant / arrière (y=180..255)
    draw.rectangle([0, 180, 150, 255], fill=(225, 228, 232, 255))
    # Pare-brise panoramique VAL
    draw.rectangle([10, 190, 70, 230], fill=(25, 30, 38, 255))
    # Feux LED
    draw.ellipse([15, 240, 25, 248], fill=(255, 255, 240, 255))
    draw.ellipse([55, 240, 65, 248], fill=(255, 255, 240, 255))

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def create_cleanroom_tram_atlas() -> bytes:
    """Génère un atlas de texture 256x256 épuré pour le Tramway Ilévia (Breda VLC 30m)."""
    img = Image.new("RGBA", (256, 256), (235, 238, 242, 255))
    draw = ImageDraw.Draw(img)

    # Toit gris technique et climatisation / pantographe (y=0..50)
    draw.rectangle([0, 0, 256, 50], fill=(150, 155, 160, 255))
    draw.rectangle([0, 8, 256, 38], fill=(105, 110, 118, 255))
    # Embase du pantographe
    draw.rectangle([110, 12, 146, 34], fill=(70, 75, 82, 255))

    # Bandeau de vitres et portes tramway (y=90..160)
    draw.rectangle([0, 95, 256, 145], fill=(30, 36, 44, 255))

    # Portes doubles tramway (4 doubles portes réparties le long des 30 m)
    door_color = (210, 215, 220, 255)
    for dx in [25, 85, 145, 205]:
        draw.rectangle([dx, 90, dx + 30, 165], fill=door_color)
        draw.rectangle([dx + 4, 98, dx + 26, 138], fill=(25, 30, 38, 255))

    # Soufflets d'articulation (3 articulations visibles)
    for bx in [65, 125, 185]:
        draw.rectangle([bx - 3, 85, bx + 3, 170], fill=(45, 48, 52, 255))

    # Bas de caisse / carénages bas (y=165..180)
    draw.rectangle([0, 165, 256, 180], fill=(60, 65, 70, 255))

    # Liseré Ilévia bleu cyan (#009FE3)
    draw.rectangle([0, 88, 256, 94], fill=(0, 159, 227, 255))
    # Liseré rouge subtil
    draw.rectangle([0, 84, 256, 87], fill=(227, 6, 19, 255))

    # Face avant / cabine (y=180..255)
    draw.rectangle([0, 180, 150, 255], fill=(230, 233, 238, 255))
    # Pare-brise profilé tramway
    draw.rectangle([10, 188, 75, 228], fill=(20, 26, 34, 255))
    # Bande frontale cyan
    draw.rectangle([10, 230, 75, 235], fill=(0, 159, 227, 255))
    # Phares avant
    draw.rectangle([15, 238, 28, 243], fill=(255, 255, 240, 255))
    draw.rectangle([57, 238, 70, 243], fill=(255, 255, 240, 255))

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def write_glb(path: Path, P: np.ndarray, N: np.ndarray, UV: np.ndarray, I: np.ndarray, png: bytes, name: str) -> int:
    """Écrit le fichier GLB binaire sans extensions propriétaires ni dépendance externe."""
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
        "asset": {"version": "2.0", "generator": "build_lille_train_models.py"},
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
            "name": "body",
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": 0},
                "metallicFactor": 0.05,
                "roughnessFactor": 0.60,
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
    """Génère les modèles VAL 208, VAL 52m et Tramway Breda VLC."""
    P_val, N_val, UV_val, I_val = build_car_mesh(length_m=13.0, width_m=2.06, height_m=3.25)
    P_tram, N_tram, UV_tram, I_tram = build_car_mesh(length_m=30.0, width_m=2.40, height_m=3.42)

    png_val208 = create_cleanroom_atlas(is_52m=False)
    png_val52m = create_cleanroom_atlas(is_52m=True)
    png_tram = create_cleanroom_tram_atlas()

    destinations = [
        ROOT / "cities" / "lille" / "assets" / "models" / "train",
        ROOT / "web" / "public" / "cities" / "lille" / "models" / "train",
        ROOT / "web" / "dist" / "cities" / "lille" / "models" / "train",
    ]

    sizes = {}
    for dest_dir in destinations:
        dest_dir.mkdir(parents=True, exist_ok=True)
        size_208 = write_glb(dest_dir / "val_208__neutral.glb", P_val, N_val, UV_val, I_val, png_val208, "val_208")
        size_52m = write_glb(dest_dir / "val_52m__neutral.glb", P_val, N_val, UV_val, I_val, png_val52m, "val_52m")
        size_tram = write_glb(dest_dir / "breda_vlc__neutral.glb", P_tram, N_tram, UV_tram, I_tram, png_tram, "breda_vlc")
        sizes["val_208__neutral.glb"] = size_208
        sizes["val_52m__neutral.glb"] = size_52m
        sizes["breda_vlc__neutral.glb"] = size_tram

    return sizes


if __name__ == "__main__":
    sizes = build_models()
    print("Modèles GLB générés avec succès :")
    for name, s in sizes.items():
        kb = s / 1024.0
        print(f"  {name:25s}: {s:6d} octets ({kb:.2f} Ko) — < 15 Ko : {'OUI' if kb < 15.0 else 'NON'}")
