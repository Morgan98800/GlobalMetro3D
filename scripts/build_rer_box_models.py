#!/usr/bin/env python3
"""Génération clean-room des modèles glTF du matériel roulant RER.

Aucune dépendance externe : le GLB est sérialisé à la main (bibliothèque
standard uniquement), comme scripts/build_train_box_models.py.

Rien n'est copié d'un modèle existant. La géométrie est entièrement
paramétrique et dérivée du gabarit déclaré dans rolling-stock.json.

  rer_generic__neutral.glb   voiture de rame, répétée le long de l'abscisse
                             curviligne par le ScenegraphLayer
  rer_generic__cab.glb       variante avec nez (OPTIONNEL, voir README)

Convention d'axes par défaut : longueur sur +X, hauteur sur +Y, largeur sur Z,
origine au niveau du rail (y = 0) et centrée en largeur. Si les GLB métro
utilisent -Z comme axe de marche, passer --forward-axis=-z. Vérifier avec
inspect_glb.py avant d'intégrer.
"""

from __future__ import annotations

import argparse
import json
import math
import struct
from pathlib import Path

# ---------------------------------------------------------------- gabarit RER
# Valeurs par défaut alignées sur l'entrée `rer_generic` de rolling-stock.json.
# ATTENTION : car_length doit être IDENTIQUE à car_length_m dans ce fichier,
# sinon les voitures se chevauchent ou laissent des trous à la découpe.
DEFAULTS = dict(
    car_length=15.0,   # m — cf. rolling-stock.json (voir note de réalisme, README)
    width=2.80,        # m — gabarit RER (métro : ~2,40)
    height=3.80,       # m — du plan de rail à la toiture
    floor=0.95,        # m — dessous de caisse
    corner_r=0.34,     # m — rayon des angles de caisse
    chamfer=0.22,      # m — retrait d'about, dessine le joint entre voitures
    nose_length=2.40,  # m — longueur du nez de la variante cabine
)

# Deux bandeaux vitrés : signature visuelle du RER à deux niveaux.
GLAZING_BANDS = ((1.18, 1.78), (2.42, 3.02))  # (y_bas, y_haut) en m
DOORS_PER_SIDE = 2
DOOR_WIDTH = 1.30  # m


# --------------------------------------------------------------------- outils

def rounded_rect_profile(width: float, y_bottom: float, y_top: float,
                         radius: float, corner_segments: int) -> list[tuple[float, float]]:
    """Section transversale fermée dans le plan (z, y), sens anti-horaire."""
    half = width / 2.0
    r = min(radius, half * 0.9, (y_top - y_bottom) * 0.45)
    pts: list[tuple[float, float]] = []

    def arc(cz: float, cy: float, start: float, end: float) -> None:
        for i in range(corner_segments + 1):
            a = start + (end - start) * i / corner_segments
            pts.append((cz + r * math.cos(a), cy + r * math.sin(a)))

    arc(half - r, y_bottom + r, -math.pi / 2, 0.0)          # bas droite
    arc(half - r, y_top - r, 0.0, math.pi / 2)              # haut droite
    arc(-(half - r), y_top - r, math.pi / 2, math.pi)       # haut gauche
    arc(-(half - r), y_bottom + r, math.pi, 3 * math.pi / 2)  # bas gauche

    deduped: list[tuple[float, float]] = []
    for p in pts:
        if not deduped or abs(p[0] - deduped[-1][0]) > 1e-9 or abs(p[1] - deduped[-1][1]) > 1e-9:
            deduped.append(p)
    if abs(deduped[0][0] - deduped[-1][0]) < 1e-9 and abs(deduped[0][1] - deduped[-1][1]) < 1e-9:
        deduped.pop()
    return deduped


def side_z_at(profile: list[tuple[float, float]], y: float) -> float:
    """Demi-largeur de la caisse à la hauteur y (pour poser les vitrages)."""
    best = 0.0
    for z, py in profile:
        if abs(py - y) < 0.35:
            best = max(best, abs(z))
    return best or max(abs(z) for z, _ in profile)


class Mesh:
    """Accumulateur de triangles avec normales par face, winding auto-corrigé."""

    def __init__(self) -> None:
        self.positions: list[tuple[float, float, float]] = []
        self.normals: list[tuple[float, float, float]] = []
        self.indices: list[int] = []
        self._index: dict[tuple, int] = {}

    def _vertex(self, p: tuple[float, float, float], n: tuple[float, float, float]) -> int:
        key = (round(p[0], 5), round(p[1], 5), round(p[2], 5),
               round(n[0], 3), round(n[1], 3), round(n[2], 3))
        got = self._index.get(key)
        if got is not None:
            return got
        self.positions.append(p)
        self.normals.append(n)
        idx = len(self.positions) - 1
        self._index[key] = idx
        return idx

    def add_quad(self, a, b, c, d, outward) -> None:
        self.add_tri(a, b, c, outward)
        self.add_tri(a, c, d, outward)

    def add_tri(self, a, b, c, outward) -> None:
        u = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
        v = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
        n = (u[1] * v[2] - u[2] * v[1],
             u[2] * v[0] - u[0] * v[2],
             u[0] * v[1] - u[1] * v[0])
        length = math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2)
        if length < 1e-12:
            return
        n = (n[0] / length, n[1] / length, n[2] / length)
        # La normale doit pointer vers l'extérieur : sinon on inverse le triangle.
        if n[0] * outward[0] + n[1] * outward[1] + n[2] * outward[2] < 0.0:
            a, c = c, a
            n = (-n[0], -n[1], -n[2])
        for p in (a, b, c):
            self.indices.append(self._vertex(p, n))

    @property
    def triangle_count(self) -> int:
        return len(self.indices) // 3


# ------------------------------------------------------------------ géométrie

def build_shell(rings: list[tuple[float, float, float, float]],
                profile: list[tuple[float, float]],
                y_bottom: float, y_top: float,
                cap_front: bool, cap_back: bool) -> dict[str, Mesh]:
    """Extrude la section le long de X.

    rings : (x, scale_z, scale_y, y_shift). Un segment par couple consécutif,
    avec duplication des sommets aux ruptures de pente pour des arêtes nettes.
    """
    parts = {"caisse": Mesh(), "soubassement": Mesh(), "toiture": Mesh()}
    y_mid = (y_bottom + y_top) / 2.0

    def bucket(y: float) -> Mesh:
        if y < Y_SKIRT_TOP:
            return parts["soubassement"]
        if y > Y_ROOF_BASE:
            return parts["toiture"]
        return parts["caisse"]

    def ring_points(ring) -> list[tuple[float, float, float]]:
        x, sz, sy, dy = ring
        out = []
        for z, y in profile:
            out.append((x, y_bottom + (y - y_bottom) * sy + dy, z * sz))
        return out

    for i in range(len(rings) - 1):
        a_pts = ring_points(rings[i])
        b_pts = ring_points(rings[i + 1])
        n = len(profile)
        for j in range(n):
            k = (j + 1) % n
            p0, p1, p2, p3 = a_pts[j], a_pts[k], b_pts[k], b_pts[j]
            cz = (p0[2] + p1[2]) / 2.0
            mean_y = (p0[1] + p1[1] + p2[1] + p3[1]) / 4.0
            cy = (p0[1] + p1[1]) / 2.0 - y_mid
            norm = math.sqrt(cz * cz + cy * cy) or 1.0
            bucket(mean_y).add_quad(p0, p1, p2, p3, (0.0, cy / norm, cz / norm))

    for do_cap, ring, outward in ((cap_front, rings[0], (-1.0, 0.0, 0.0)),
                                  (cap_back, rings[-1], (1.0, 0.0, 0.0))):
        if not do_cap:
            continue
        pts = ring_points(ring)
        centre = (ring[0], y_mid, 0.0)
        for j in range(len(pts)):
            a, b = pts[j], pts[(j + 1) % len(pts)]
            bucket((a[1] + b[1] + y_mid) / 3.0).add_tri(centre, a, b, outward)
    return parts


def build_belt(profile: list[tuple[float, float]], length: float,
               x_start: float) -> Mesh:
    """Ceinture d'inter-niveau : bandeau plein entre les deux rangs de vitres.

    C'est cette bande qui porte la couleur de ligne avec --livery=line.
    """
    mesh = Mesh()
    y0, y1 = BELT_BAND
    half = side_z_at(profile, (y0 + y1) / 2.0) + 0.014
    xa, xb = x_start + 0.16, x_start + length - 0.16
    if xb <= xa:
        return mesh
    for sign in (1.0, -1.0):
        z = half * sign
        mesh.add_quad((xa, y0, z), (xb, y0, z), (xb, y1, z), (xa, y1, z),
                      (0.0, 0.0, sign))
    return mesh


def build_glazing(profile: list[tuple[float, float]], length: float,
                  x_start: float, car_length: float) -> Mesh:
    """Bandeaux vitrés et vantaux de portes, en léger relief sur les flancs."""
    mesh = Mesh()
    inset = 0.30
    for y0, y1 in GLAZING_BANDS:
        half = side_z_at(profile, (y0 + y1) / 2.0) + 0.012
        xa, xb = x_start + inset, x_start + length - inset
        if xb <= xa:
            continue
        for sign in (1.0, -1.0):
            z = half * sign
            out = (0.0, 0.0, sign)
            mesh.add_quad((xa, y0, z), (xb, y0, z), (xb, y1, z), (xa, y1, z), out)

    # Portes : réparties le long de la voiture, du bas de caisse au haut du
    # premier bandeau, ce qui reste cohérent quand la voiture est répétée.
    door_top = GLAZING_BANDS[0][1] + 0.10
    door_bottom = 0.98
    for d in range(DOORS_PER_SIDE):
        centre = x_start + car_length * (d + 0.5) / DOORS_PER_SIDE
        xa, xb = centre - DOOR_WIDTH / 2.0, centre + DOOR_WIDTH / 2.0
        xa, xb = max(xa, x_start + 0.05), min(xb, x_start + length - 0.05)
        if xb <= xa:
            continue
        half = side_z_at(profile, (door_bottom + door_top) / 2.0) + 0.008
        for sign in (1.0, -1.0):
            z = half * sign
            out = (0.0, 0.0, sign)
            mesh.add_quad((xa, door_bottom, z), (xb, door_bottom, z),
                          (xb, door_top, z), (xa, door_top, z), out)
    return mesh


def body_car(cfg: dict, corner_segments: int) -> dict[str, Mesh]:
    length = cfg["car_length"]
    profile = rounded_rect_profile(cfg["width"], cfg["floor"], cfg["height"],
                                   cfg["corner_r"], corner_segments)
    c = cfg["chamfer"]
    inset = 0.955
    rings = [
        (0.0, inset, inset, 0.0),
        (c, 1.0, 1.0, 0.0),
        (length - c, 1.0, 1.0, 0.0),
        (length, inset, inset, 0.0),
    ]
    parts = build_shell(rings, profile, cfg["floor"], cfg["height"],
                        cap_front=True, cap_back=True)
    parts["vitrage"] = build_glazing(profile, length, 0.0, length)
    parts["ceinture"] = build_belt(profile, length, 0.0)
    return parts


def cab_car(cfg: dict, corner_segments: int) -> dict[str, Mesh]:
    length = cfg["car_length"]
    nose = cfg["nose_length"]
    profile = rounded_rect_profile(cfg["width"], cfg["floor"], cfg["height"],
                                   cfg["corner_r"], corner_segments)
    c = cfg["chamfer"]
    # Le facteur vertical (sy) abaisse la TOITURE en gardant le dessous de
    # caisse fixe : c'est ce qui donne un nez incliné sans faire plonger la
    # caisse sous le plan de rail. Aucun décalage vertical, donc.
    drop = 0.0
    rings = [
        (0.0, 0.46, 0.58, drop),
        (nose * 0.18, 0.64, 0.74, drop),
        (nose * 0.42, 0.83, 0.89, drop),
        (nose * 0.72, 0.95, 0.97, drop),
        (nose, 1.0, 1.0, 0.0),
        (length - c, 1.0, 1.0, 0.0),
        (length, 0.955, 0.955, 0.0),
    ]
    parts = build_shell(rings, profile, cfg["floor"], cfg["height"],
                        cap_front=True, cap_back=True)
    parts["vitrage"] = build_glazing(profile, length - nose, nose, length - nose)
    parts["ceinture"] = build_belt(profile, length - nose, nose)

    # Pare-brise et bandeau d'afficheur de mission : deux surfaces sombres sur
    # le nez. Aucun texte, aucune marque — juste les surfaces vitrees.
    windscreen = parts["vitrage"]
    half_w = cfg["width"] / 2.0
    y_low, y_high = 2.30, 3.05
    x_front, x_back = nose * 0.30, nose * 0.92
    for sign in (1.0, -1.0):
        windscreen.add_quad(
            (x_front, y_low, sign * half_w * 0.30),
            (x_back, y_low, sign * half_w * 0.78),
            (x_back, y_high, sign * half_w * 0.74),
            (x_front, y_high, sign * half_w * 0.28),
            (-0.55, 0.35, sign * 0.75))
    display_y = (1.55, 1.92)
    windscreen.add_quad(
        (x_front * 0.72, display_y[0], -half_w * 0.26),
        (x_front * 0.72, display_y[0], half_w * 0.26),
        (x_front * 0.72, display_y[1], half_w * 0.26),
        (x_front * 0.72, display_y[1], -half_w * 0.26),
        (-1.0, 0.0, 0.0))
    return parts


# ----------------------------------------------------------- sérialisation GLB

def pad4(data: bytearray, fill: int = 0) -> None:
    while len(data) % 4:
        data.append(fill)


def write_glb(path: Path, primitives: list[tuple[Mesh, int]],
              materials: list[dict], name: str) -> int:
    """primitives : liste de (mesh, index de matériau)."""
    binary = bytearray()
    buffer_views: list[dict] = []
    accessors: list[dict] = []
    gltf_primitives: list[dict] = []

    for mesh, material in primitives:
        if mesh.triangle_count == 0:
            continue
        pos_offset = len(binary)
        for p in mesh.positions:
            binary += struct.pack("<3f", *p)
        pad4(binary)
        nrm_offset = len(binary)
        for n in mesh.normals:
            binary += struct.pack("<3f", *n)
        pad4(binary)
        idx_offset = len(binary)
        for i in mesh.indices:
            binary += struct.pack("<H", i)
        pad4(binary)

        mins = [min(p[k] for p in mesh.positions) for k in range(3)]
        maxs = [max(p[k] for p in mesh.positions) for k in range(3)]

        base = len(buffer_views)
        buffer_views += [
            {"buffer": 0, "byteOffset": pos_offset,
             "byteLength": len(mesh.positions) * 12, "target": 34962},
            {"buffer": 0, "byteOffset": nrm_offset,
             "byteLength": len(mesh.normals) * 12, "target": 34962},
            {"buffer": 0, "byteOffset": idx_offset,
             "byteLength": len(mesh.indices) * 2, "target": 34963},
        ]
        acc = len(accessors)
        accessors += [
            {"bufferView": base, "componentType": 5126, "count": len(mesh.positions),
             "type": "VEC3", "min": mins, "max": maxs},
            {"bufferView": base + 1, "componentType": 5126, "count": len(mesh.normals),
             "type": "VEC3"},
            {"bufferView": base + 2, "componentType": 5123, "count": len(mesh.indices),
             "type": "SCALAR"},
        ]
        gltf_primitives.append({
            "attributes": {"POSITION": acc, "NORMAL": acc + 1},
            "indices": acc + 2,
            "material": material,
            "mode": 4,
        })

    gltf = {
        "asset": {"version": "2.0", "generator": "build_rer_box_models.py (clean-room)"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": name}],
        "meshes": [{"name": name, "primitives": gltf_primitives}],
        "materials": materials,
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": len(binary)}],
    }

    json_chunk = bytearray(json.dumps(gltf, separators=(",", ":")).encode("utf-8"))
    pad4(json_chunk, 0x20)
    pad4(binary)

    total = 12 + 8 + len(json_chunk) + 8 + len(binary)
    out = bytearray()
    out += struct.pack("<4sII", b"glTF", 2, total)
    out += struct.pack("<II", len(json_chunk), 0x4E4F534A)
    out += json_chunk
    out += struct.pack("<II", len(binary), 0x004E4942)
    out += binary

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(bytes(out))
    return len(out)


def srgb_to_linear(component: float) -> float:
    if component <= 0.04045:
        return component / 12.92
    return ((component + 0.055) / 1.055) ** 2.4


def grey(srgb: float) -> list[float]:
    """Ton neutre saisi en sRGB, converti en lineaire.

    PIEGE : baseColorFactor est en espace LINEAIRE dans glTF. Saisir 0,80 en
    pensant a un gris clair d'ecran donne en realite du quasi-blanc et efface
    toute la stratification. On saisit donc les tons comme on les veut a
    l'ecran, et on convertit.
    """
    v = round(srgb_to_linear(srgb), 4)
    return [v, v, v, 1.0]


def hex_to_linear(value: str) -> list[float]:
    value = value.lstrip("#")
    rgb = [int(value[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return [round(srgb_to_linear(c), 4) for c in rgb] + [1.0]


# Cinq tons neutres stratifies comme une caisse reelle, saisis en sRGB.
# Aucune livree inventee, aucune marque : seule la structure tonale est
# modelisee. Le moteur applique la teinte de ligne par-dessus
# (getNeutralBodyColor garantit un contraste >= 3:1) et les ecarts relatifs
# entre tons survivent a cette teinte.
MATERIALS = [
    {   # 0 — caisse : le ton dominant
        "name": "caisse_neutre",
        "pbrMetallicRoughness": {"baseColorFactor": grey(0.78),
                                 "metallicFactor": 0.16, "roughnessFactor": 0.50},
        "doubleSided": False,
    },
    {   # 1 — vitrage : bandeaux, portes, pare-brise
        "name": "vitrage_sombre",
        "pbrMetallicRoughness": {"baseColorFactor": grey(0.09),
                                 "metallicFactor": 0.32, "roughnessFactor": 0.24},
        "doubleSided": False,
    },
    {   # 2 — soubassement : sous la ligne de plancher, toujours dans l'ombre
        "name": "soubassement",
        "pbrMetallicRoughness": {"baseColorFactor": grey(0.21),
                                 "metallicFactor": 0.22, "roughnessFactor": 0.72},
        "doubleSided": False,
    },
    {   # 3 — toiture : mate, nettement plus sombre (equipements, salissure)
        "name": "toiture",
        "pbrMetallicRoughness": {"baseColorFactor": grey(0.44),
                                 "metallicFactor": 0.10, "roughnessFactor": 0.86},
        "doubleSided": False,
    },
    {   # 4 — ceinture : bandeau d'inter-niveau, porte la couleur de ligne
        #     avec --livery=line
        "name": "ceinture",
        "pbrMetallicRoughness": {"baseColorFactor": grey(0.34),
                                 "metallicFactor": 0.20, "roughnessFactor": 0.46},
        "doubleSided": False,
    },
]

# Couleurs GTFS autoritaires (cf. audit geographique du reseau). Utilisees
# uniquement avec --livery=line, pour teinter la ceinture a la generation.
RER_COLOURS = {"A": "#EB2132", "B": "#5091CB", "C": "#FFCC30",
               "D": "#008B5B", "E": "#B94E9A"}
RER_LINE_IDS = {"A": "C01742", "B": "C01743", "C": "C01727",
                "D": "C01728", "E": "C01729"}

# Bornes verticales de stratification, en metres depuis le plan de rail.
Y_SKIRT_TOP = 1.06     # au-dessous : soubassement
Y_ROOF_BASE = 3.28     # au-dessus : toiture
BELT_BAND = (1.88, 2.32)   # ceinture, entre les deux bandeaux vitres


def srgb_to_linear(component: float) -> float:
    if component <= 0.04045:
        return component / 12.92
    return ((component + 0.055) / 1.055) ** 2.4


def hex_to_linear(value: str) -> list[float]:
    value = value.lstrip("#")
    rgb = [int(value[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return [round(srgb_to_linear(c), 4) for c in rgb] + [1.0]


# Ordre de rendu et affectation des matériaux.
PART_MATERIAL = (("soubassement", 2), ("caisse", 0), ("toiture", 3),
                 ("ceinture", 4), ("vitrage", 1))


def rotate_to_negative_z(mesh: Mesh) -> None:
    """Passe de +X vers -Z comme axe de marche (rotation de -90 degres sur Y)."""
    mesh.positions = [(-p[2], p[1], -p[0]) for p in mesh.positions]
    mesh.normals = [(-n[2], n[1], -n[0]) for n in mesh.normals]


def center_on_rail_head(mesh: Mesh, car_length: float, floor: float) -> None:
    """Centre la voiture sur X et place son dessous de caisse sur Y=0."""
    mesh.positions = [
        (x - car_length / 2.0, y - floor, z)
        for x, y, z in mesh.positions
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", default="web/public/models/train")
    parser.add_argument("--car-length", type=float, default=DEFAULTS["car_length"])
    parser.add_argument("--width", type=float, default=DEFAULTS["width"])
    parser.add_argument("--height", type=float, default=DEFAULTS["height"])
    parser.add_argument("--corner-segments", type=int, default=3)
    parser.add_argument("--cab-corner-segments", type=int, default=2,
                        help="la cabine a plus d'anneaux : on tesselle moins "
                             "les angles pour rester sous 15 Ko")
    parser.add_argument("--forward-axis", choices=["x", "-z"], default="x",
                        help="axe de marche ; doit correspondre aux GLB metro")
    parser.add_argument("--livery", choices=["neutral", "line"], default="neutral",
                        help="neutral (defaut, comme les GLB metro : le moteur "
                             "applique la teinte) ou line (ceinture teintee a la "
                             "couleur GTFS, un fichier par ligne RER)")
    parser.add_argument("--no-cab", action="store_true",
                        help="ne pas generer la variante cabine")
    args = parser.parse_args()

    cfg = dict(DEFAULTS)
    cfg.update(car_length=args.car_length, width=args.width, height=args.height)
    out_dir = Path(args.out_dir)

    builders = [("neutral", body_car)]
    if not args.no_cab:
        builders.append(("cab", cab_car))

    if args.livery == "line":
        variants = [(letter, RER_COLOURS[letter]) for letter in "ABCDE"]
    else:
        variants = [(None, None)]

    print(f"{'fichier':<38}{'triangles':>10}{'sommets':>9}{'octets':>9}")
    total_bytes = 0
    for letter, colour in variants:
        materials = [dict(m) for m in MATERIALS]
        if colour is not None:
            materials[4] = {
                "name": f"ceinture_rer_{letter}",
                "pbrMetallicRoughness": {
                    "baseColorFactor": hex_to_linear(colour),
                    "metallicFactor": 0.18, "roughnessFactor": 0.44},
                "doubleSided": False,
            }
        for kind, builder in builders:
            suffix = f"__{kind}" if letter is None else f"_{letter}__{kind}"
            name = f"rer_generic{suffix}"
            segments = args.cab_corner_segments if kind == "cab" else args.corner_segments
            parts = builder(cfg, segments)
            primitives = []
            for key, material in PART_MATERIAL:
                mesh = parts.get(key)
                if mesh is None or mesh.triangle_count == 0:
                    continue
                center_on_rail_head(mesh, cfg["car_length"], cfg["floor"])
                if args.forward_axis == "-z":
                    rotate_to_negative_z(mesh)
                primitives.append((mesh, material))
            size = write_glb(out_dir / f"{name}.glb", primitives, materials, name)
            tris = sum(m.triangle_count for m, _ in primitives)
            verts = sum(len(m.positions) for m, _ in primitives)
            total_bytes += size
            print(f"{name + '.glb':<38}{tris:>10}{verts:>9}{size:>9}")
    print(f"{'total':<38}{'':>10}{'':>9}{total_bytes:>9}")


if __name__ == "__main__":
    main()
