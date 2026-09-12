#!/usr/bin/env python3
"""Génération clean-room des modèles glTF du matériel roulant RER — v2.

Changement par rapport à la v1 : la caisse n'est plus peinte par cinq
`baseColorFactor` sur cinq primitives, mais par une **texture d'albédo générée
procéduralement** appliquée sur un dépliage UV cylindrique. Cela aligne le
modèle de matériau sur celui des GLB métro (`baseColorTexture`), supprime
l'incohérence de rendu entre les deux familles, et permet des fenêtres
individualisées plutôt que des bandeaux continus.

Aucune dépendance externe : le PNG est encodé à la main avec `zlib`, le GLB est
sérialisé à la main. Rien n'est copié d'un modèle existant, aucune marque n'est
reproduite.

Convention d'axes (alignée sur les GLB métro, vérifiée) :
  longueur sur X, CENTRÉE  -> X ∈ [-L/2, +L/2]
  hauteur sur Y, origine au DESSOUS DE CAISSE -> Y ∈ [0, H]
  largeur sur Z, centrée   -> Z ∈ [-W/2, +W/2]

Dépliage UV : u = (x + L/2) / L, v = abscisse curviligne le long du profil,
normalisée. La caisse étant une extrusion de section fermée, c'est un cylindre
déplié : le mapping est exact et sans couture visible hors du bas de caisse.
"""

from __future__ import annotations

import argparse
import json
import math
import struct
import zlib
from pathlib import Path

# ---------------------------------------------------------------- gabarit RER
# car_length DOIT être identique à car_length_m dans rolling-stock.json, sinon
# les voitures se chevauchent ou laissent des trous à la découpe.
DEFAULTS = dict(
    car_length=15.0,   # m
    width=2.80,        # m — gabarit RER (métro : ~2,40)
    height=2.85,       # m — du dessous de caisse à la toiture
    corner_r=0.34,     # m — rayon des angles de caisse
    chamfer=0.22,      # m — retrait d'about, dessine le joint entre voitures
    nose_length=2.40,  # m — longueur du nez de la variante cabine
)

# Stratification verticale, en mètres depuis le dessous de caisse.
# C'est la seule source de vérité : la géométrie ne la connaît pas, seule la
# texture la peint, en fonction du y réel de chaque ligne de pixels.
SKIRT_TOP = 0.34
WINDOWS_LOWER = (0.56, 1.16)
BELT = (1.26, 1.56)
WINDOWS_UPPER = (1.70, 2.30)
ROOF_BASE = 2.44

# Découpe horizontale, en fraction de la longueur de voiture.
DOOR_COUNT = 2
DOOR_WIDTH_M = 1.30
WINDOW_WIDTH_M = 1.05
WINDOW_GAP_M = 0.30

TEX_WIDTH = 1024
TEX_HEIGHT = 320
V_BODY = 0.92          # le profil occupe v ∈ [0, V_BODY]
V_SOLID = 0.965        # bande réservée aux faces d'about (couleur unie)

# Tons saisis en sRGB 0–255, comme on les veut à l'écran. Une texture PNG est
# interprétée en sRGB par glTF : ici, pas de conversion linéaire à faire —
# contrairement à baseColorFactor, qui est en espace linéaire. C'est
# précisément le piège qui délavait la v1.
TONE_BODY = (196, 199, 201)
TONE_BODY_ALT = (186, 189, 192)   # léger panneautage vertical
TONE_SKIRT = (54, 56, 58)
TONE_ROOF = (112, 115, 117)
TONE_ROOF_EDGE = (92, 95, 97)
TONE_GLASS = (23, 26, 30)
TONE_GLASS_HL = (38, 44, 52)      # reflet haut de vitre
TONE_DOOR = (150, 154, 157)
TONE_DOOR_EDGE = (70, 73, 76)
TONE_BELT = (108, 112, 115)       # remplacé par la couleur de ligne si --livery=line
TONE_FILET = (86, 89, 92)
TONE_GANGWAY = (58, 60, 63)        # faces d'about : soufflet d'intercirculation

# Couleurs GTFS autoritaires (cf. audit géographique du réseau).
RER_COLOURS = {"A": "#EB2132", "B": "#5091CB", "C": "#FFCC30",
               "D": "#008B5B", "E": "#B94E9A"}
RER_LINE_IDS = {"A": "C01742", "B": "C01743", "C": "C01727",
                "D": "C01728", "E": "C01729"}


# --------------------------------------------------------------- encodeur PNG

def write_png(pixels: bytearray, width: int, height: int) -> bytes:
    """PNG RGB8 minimal, sans dépendance (zlib + struct)."""
    raw = bytearray()
    stride = width * 3
    for row in range(height):
        raw.append(0)  # filtre None
        raw += pixels[row * stride:(row + 1) * stride]

    def chunk(tag: bytes, payload: bytes) -> bytes:
        return (struct.pack(">I", len(payload)) + tag + payload
                + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF))

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", header)
            + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
            + chunk(b"IEND", b""))


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


# ------------------------------------------------------------------- géométrie

def rounded_rect_profile(width: float, height: float, radius: float,
                         corner_segments: int) -> list[tuple[float, float]]:
    """Section fermée dans le plan (z, y), sens anti-horaire, y ∈ [0, height]."""
    half = width / 2.0
    r = min(radius, half * 0.9, height * 0.45)
    pts: list[tuple[float, float]] = []

    def arc(cz: float, cy: float, start: float, end: float) -> None:
        for i in range(corner_segments + 1):
            a = start + (end - start) * i / corner_segments
            pts.append((cz + r * math.cos(a), cy + r * math.sin(a)))

    arc(half - r, r, -math.pi / 2, 0.0)
    arc(half - r, height - r, 0.0, math.pi / 2)
    arc(-(half - r), height - r, math.pi / 2, math.pi)
    arc(-(half - r), r, math.pi, 3 * math.pi / 2)

    out: list[tuple[float, float]] = []
    for p in pts:
        if not out or abs(p[0] - out[-1][0]) > 1e-9 or abs(p[1] - out[-1][1]) > 1e-9:
            out.append(p)
    if abs(out[0][0] - out[-1][0]) < 1e-9 and abs(out[0][1] - out[-1][1]) < 1e-9:
        out.pop()
    return out


def profile_arclength(profile: list[tuple[float, float]]) -> list[float]:
    """Abscisse curviligne cumulée, avec un point final dupliqué à s = périmètre.

    Le doublon évite la couture : sans lui, le dernier quad interpolerait v de
    0,92 vers 0, et la texture entière défilerait à l'envers sur ce quad.
    """
    s = [0.0]
    n = len(profile)
    for i in range(1, n + 1):
        a, b = profile[i - 1], profile[i % n]
        s.append(s[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    return s


class Mesh:
    def __init__(self) -> None:
        self.positions: list[tuple[float, float, float]] = []
        self.normals: list[tuple[float, float, float]] = []
        self.uvs: list[tuple[float, float]] = []
        self.indices: list[int] = []
        self._index: dict[tuple, int] = {}

    def _vertex(self, p, n, uv) -> int:
        key = (round(p[0], 5), round(p[1], 5), round(p[2], 5),
               round(n[0], 3), round(n[1], 3), round(n[2], 3),
               round(uv[0], 5), round(uv[1], 5))
        got = self._index.get(key)
        if got is not None:
            return got
        self.positions.append(p)
        self.normals.append(n)
        self.uvs.append(uv)
        self._index[key] = len(self.positions) - 1
        return self._index[key]

    def add_tri(self, verts, uvs, outward) -> None:
        a, b, c = verts
        u = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
        v = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
        n = (u[1] * v[2] - u[2] * v[1],
             u[2] * v[0] - u[0] * v[2],
             u[0] * v[1] - u[1] * v[0])
        ln = math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2)
        if ln < 1e-12:
            return
        n = (n[0] / ln, n[1] / ln, n[2] / ln)
        if n[0] * outward[0] + n[1] * outward[1] + n[2] * outward[2] < 0.0:
            verts = (c, b, a)
            uvs = (uvs[2], uvs[1], uvs[0])
            n = (-n[0], -n[1], -n[2])
        for p, uv in zip(verts, uvs):
            self.indices.append(self._vertex(p, n, uv))

    def add_quad(self, verts, uvs, outward) -> None:
        self.add_tri((verts[0], verts[1], verts[2]), (uvs[0], uvs[1], uvs[2]), outward)
        self.add_tri((verts[0], verts[2], verts[3]), (uvs[0], uvs[2], uvs[3]), outward)

    @property
    def triangle_count(self) -> int:
        return len(self.indices) // 3


def build_body(rings, profile, height, length) -> Mesh:
    """Extrusion de la section le long de X, avec dépliage UV cylindrique."""
    mesh = Mesh()
    arc = profile_arclength(profile)
    perimeter = arc[-1]
    n = len(profile)
    half_len = length / 2.0
    y_mid = height / 2.0

    def ring_points(ring):
        x, sz, sy = ring
        pts = []
        for j in range(n + 1):
            z, y = profile[j % n]
            pts.append((x - half_len, y * sy, z * sz))
        return pts

    for i in range(len(rings) - 1):
        a_pts, b_pts = ring_points(rings[i]), ring_points(rings[i + 1])
        ua = rings[i][0] / length
        ub = rings[i + 1][0] / length
        for j in range(n):
            p0, p1, p2, p3 = a_pts[j], a_pts[j + 1], b_pts[j + 1], b_pts[j]
            v0 = arc[j] / perimeter * V_BODY
            v1 = arc[j + 1] / perimeter * V_BODY
            cz = (p0[2] + p1[2]) / 2.0
            cy = (p0[1] + p1[1]) / 2.0 - y_mid
            norm = math.hypot(cz, cy) or 1.0
            mesh.add_quad((p0, p1, p2, p3),
                          ((ua, v0), (ua, v1), (ub, v1), (ub, v0)),
                          (0.0, cy / norm, cz / norm))

    # Faces d'about : renvoyées vers la bande unie réservée de la texture.
    for ring, outward in ((rings[0], (-1.0, 0.0, 0.0)), (rings[-1], (1.0, 0.0, 0.0))):
        pts = ring_points(ring)
        centre = (ring[0] - half_len, y_mid, 0.0)
        solid = (0.5, V_SOLID)
        for j in range(n):
            mesh.add_tri((centre, pts[j], pts[j + 1]), (solid, solid, solid), outward)
    return mesh


def body_car(cfg: dict, corner_segments: int) -> Mesh:
    length, c = cfg["car_length"], cfg["chamfer"]
    profile = rounded_rect_profile(cfg["width"], cfg["height"],
                                   cfg["corner_r"], corner_segments)
    inset = 0.955
    rings = [(0.0, inset, inset), (c, 1.0, 1.0),
             (length - c, 1.0, 1.0), (length, inset, inset)]
    return build_body(rings, profile, cfg["height"], length)


def cab_car(cfg: dict, corner_segments: int) -> Mesh:
    length, c, nose = cfg["car_length"], cfg["chamfer"], cfg["nose_length"]
    profile = rounded_rect_profile(cfg["width"], cfg["height"],
                                   cfg["corner_r"], corner_segments)
    # sy < 1 abaisse la TOITURE en gardant le dessous de caisse fixe : nez
    # incliné sans faire plonger la caisse sous le plan de rail.
    rings = [(0.0, 0.46, 0.58), (nose * 0.18, 0.64, 0.74),
             (nose * 0.42, 0.83, 0.89), (nose * 0.72, 0.95, 0.97),
             (nose, 1.0, 1.0), (length - c, 1.0, 1.0), (length, 0.955, 0.955)]
    return build_body(rings, profile, cfg["height"], length)


# --------------------------------------------------------------- texture

def make_rer_badge(letter: str, line_rgb: tuple[int, int, int], target_w: int = 38, target_h: int = 14, scale: int = 3):
    """Génère le faux logo RER + pastille de ligne anti-aliasé en supersampling."""
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        return None

    H = target_h * scale
    W = target_w * scale
    pill_w = 22 * scale
    circle_d = 14 * scale
    gap = 2 * scale

    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 1. Cartouche RER sombre
    pill_bg = (18, 22, 28, 255)
    border_col = (255, 255, 255, 230)
    draw.rounded_rectangle([0, 0, pill_w - 1, H - 1], radius=int(2.5 * scale), fill=pill_bg, outline=border_col, width=max(1, int(1 * scale)))

    try:
        font_rer = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", int(7.5 * scale))
        font_letter = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", int(9 * scale))
    except Exception:
        font_rer = font_letter = ImageFont.load_default()

    bb = draw.textbbox((0, 0), "RER", font=font_rer)
    tx = (pill_w - (bb[2] - bb[0])) // 2
    ty = (H - (bb[3] - bb[1])) // 2 - int(0.5 * scale)
    draw.text((tx, ty), "RER", fill=(255, 255, 255), font=font_rer)

    # 2. Pastille circulaire avec lettre de ligne
    cx = pill_w + gap
    draw.ellipse([cx, 0, cx + circle_d - 1, H - 1], fill=line_rgb + (255,), outline=(255, 255, 255, 230), width=max(1, int(1 * scale)))

    # Contraste optimal (noir sur fond jaune pour le RER C, blanc sur les autres lignes)
    text_col = (17, 24, 39) if letter == "C" else (255, 255, 255)
    bb2 = draw.textbbox((0, 0), letter, font=font_letter)
    lx = cx + (circle_d - (bb2[2] - bb2[0])) // 2
    ly = (H - (bb2[3] - bb2[1])) // 2 - int(0.5 * scale)
    draw.text((lx, ly), letter, fill=text_col, font=font_letter)

    return img.resize((target_w, target_h), Image.Resampling.LANCZOS)


def paint_texture(cfg: dict, corner_segments: int, belt_rgb, is_cab: bool, line_letter: str | None = None) -> bytes:
    """Peint l'albédo, ligne de pixels par ligne de pixels.

    Pour chaque rangée v on retrouve le point du profil correspondant, donc son
    y réel : la texture connaît exactement la stratification de la caisse, sans
    qu'aucune constante ne soit dupliquée entre géométrie et peinture.
    """
    profile = rounded_rect_profile(cfg["width"], cfg["height"],
                                   cfg["corner_r"], corner_segments)
    arc = profile_arclength(profile)
    perimeter = arc[-1]
    length = cfg["car_length"]
    n = len(profile)

    def y_at_v(v: float) -> tuple[float, float]:
        """(y, |z|) du profil à la position v ∈ [0, V_BODY]."""
        s = max(0.0, min(v / V_BODY, 1.0)) * perimeter
        for i in range(n):
            if arc[i] <= s <= arc[i + 1]:
                span = arc[i + 1] - arc[i]
                t = 0.0 if span < 1e-9 else (s - arc[i]) / span
                z0, y0 = profile[i]
                z1, y1 = profile[(i + 1) % n]
                return y0 + t * (y1 - y0), abs(z0 + t * (z1 - z0))
        return profile[0][1], abs(profile[0][0])

    half_w = cfg["width"] / 2.0

    # Découpe longitudinale : fenêtres régulières, interrompues par les portes.
    doors = []
    for d in range(DOOR_COUNT):
        centre = length * (d + 0.5) / DOOR_COUNT
        doors.append((centre - DOOR_WIDTH_M / 2.0, centre + DOOR_WIDTH_M / 2.0))

    def in_door(x: float) -> int:
        for a, b in doors:
            if a <= x <= b:
                return 2 if (x - a < 0.06 or b - x < 0.06) else 1
        return 0

    pitch = WINDOW_WIDTH_M + WINDOW_GAP_M

    def in_window(x: float) -> bool:
        if x < 0.45 or x > length - 0.45:
            return False
        phase = (x - 0.45) % pitch
        return phase < WINDOW_WIDTH_M

    nose_u = (cfg["nose_length"] / length) if is_cab else 0.0

    pixels = bytearray(TEX_WIDTH * TEX_HEIGHT * 3)
    for row in range(TEX_HEIGHT):
        v = (row + 0.5) / TEX_HEIGHT
        if v > V_BODY:
            colour_row = TONE_GANGWAY       # bande unie des faces d'about
            y = side = None
        else:
            y, side = y_at_v(v)
            colour_row = None
        for col in range(TEX_WIDTH):
            u = (col + 0.5) / TEX_WIDTH
            x = u * length
            if colour_row is not None:
                rgb = colour_row
            elif y < SKIRT_TOP:
                rgb = TONE_SKIRT
            elif y > ROOF_BASE:
                rgb = TONE_ROOF_EDGE if y < ROOF_BASE + 0.10 else TONE_ROOF
            elif side < half_w * 0.72:
                rgb = TONE_ROOF_EDGE        # congé de pavillon, hors flanc droit
            elif BELT[0] <= y <= BELT[1]:
                rgb = belt_rgb
            elif u < nose_u * 0.95:
                # Nez : pare-brise sur la partie haute, tôle sinon.
                rgb = TONE_GLASS if y > WINDOWS_UPPER[0] else TONE_BODY
            else:
                door = in_door(x)
                if door == 2:
                    rgb = TONE_DOOR_EDGE
                elif door == 1:
                    band = (WINDOWS_LOWER[0] + 0.22 <= y <= WINDOWS_LOWER[1]
                            or WINDOWS_UPPER[0] <= y <= WINDOWS_UPPER[1])
                    rgb = TONE_GLASS if band else TONE_DOOR
                elif ((WINDOWS_LOWER[0] <= y <= WINDOWS_LOWER[1]
                       or WINDOWS_UPPER[0] <= y <= WINDOWS_UPPER[1])
                      and in_window(x)):
                    top = (WINDOWS_LOWER[1] if y <= WINDOWS_LOWER[1]
                           else WINDOWS_UPPER[1])
                    rgb = TONE_GLASS_HL if top - y < 0.09 else TONE_GLASS
                elif abs(y - (SKIRT_TOP + 0.06)) < 0.022:
                    rgb = TONE_FILET        # filet de bas de caisse
                else:
                    rgb = TONE_BODY_ALT if int(x / 2.5) % 2 else TONE_BODY
            off = (row * TEX_WIDTH + col) * 3
            pixels[off] = rgb[0]
            pixels[off + 1] = rgb[1]
            pixels[off + 2] = rgb[2]

    if line_letter:
        badge = make_rer_badge(line_letter, belt_rgb)
        if badge:
            bw, bh = badge.size
            badge_rgba = badge.convert("RGBA")
            badge_data = list(badge_rgba.getdata())
            positions_u = [2.0 / length, 7.5 / length, 13.0 / length]
            for center_row in (43, 191):
                for pu in positions_u:
                    start_col = int(pu * TEX_WIDTH) - bw // 2
                    start_row = center_row - bh // 2
                    for by in range(bh):
                        ty = start_row + by
                        if ty < 0 or ty >= TEX_HEIGHT:
                            continue
                        for bx in range(bw):
                            tx = start_col + bx
                            if tx < 0 or tx >= TEX_WIDTH:
                                continue
                            pix = badge_data[by * bw + bx]
                            alpha = pix[3] / 255.0
                            if alpha <= 0:
                                continue
                            idx = (ty * TEX_WIDTH + tx) * 3
                            if alpha >= 1.0:
                                pixels[idx] = pix[0]
                                pixels[idx + 1] = pix[1]
                                pixels[idx + 2] = pix[2]
                            else:
                                pixels[idx] = int(pixels[idx] * (1.0 - alpha) + pix[0] * alpha)
                                pixels[idx + 1] = int(pixels[idx + 1] * (1.0 - alpha) + pix[1] * alpha)
                                pixels[idx + 2] = int(pixels[idx + 2] * (1.0 - alpha) + pix[2] * alpha)

    return write_png(pixels, TEX_WIDTH, TEX_HEIGHT)


# ----------------------------------------------------------- sérialisation GLB

def pad4(data: bytearray, fill: int = 0) -> None:
    while len(data) % 4:
        data.append(fill)


def write_glb(path: Path, mesh: Mesh, texture_png: bytes, name: str) -> int:
    binary = bytearray()

    pos_off = len(binary)
    for p in mesh.positions:
        binary += struct.pack("<3f", *p)
    pad4(binary)
    nrm_off = len(binary)
    for n in mesh.normals:
        binary += struct.pack("<3f", *n)
    pad4(binary)
    uv_off = len(binary)
    for uv in mesh.uvs:
        binary += struct.pack("<2f", *uv)
    pad4(binary)
    idx_off = len(binary)
    for i in mesh.indices:
        binary += struct.pack("<H", i)
    pad4(binary)
    img_off = len(binary)
    binary += texture_png
    pad4(binary)

    mins = [min(p[k] for p in mesh.positions) for k in range(3)]
    maxs = [max(p[k] for p in mesh.positions) for k in range(3)]

    gltf = {
        "asset": {"version": "2.0",
                  "generator": "build_rer_box_models.py v2 (clean-room)"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": name}],
        "meshes": [{"name": name, "primitives": [{
            "attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2},
            "indices": 3, "material": 0, "mode": 4}]}],
        "materials": [{
            "name": "caisse_rer",
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": 0, "texCoord": 0},
                "metallicFactor": 0.16,
                "roughnessFactor": 0.52,
            },
            "doubleSided": False,
        }],
        "textures": [{"sampler": 0, "source": 0}],
        "samplers": [{"magFilter": 9729, "minFilter": 9987,
                      "wrapS": 33071, "wrapT": 33071}],
        "images": [{"bufferView": 4, "mimeType": "image/png"}],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": len(mesh.positions),
             "type": "VEC3", "min": mins, "max": maxs},
            {"bufferView": 1, "componentType": 5126, "count": len(mesh.normals),
             "type": "VEC3"},
            {"bufferView": 2, "componentType": 5126, "count": len(mesh.uvs),
             "type": "VEC2"},
            {"bufferView": 3, "componentType": 5123, "count": len(mesh.indices),
             "type": "SCALAR"},
        ],
        "bufferViews": [
            {"buffer": 0, "byteOffset": pos_off,
             "byteLength": len(mesh.positions) * 12, "target": 34962},
            {"buffer": 0, "byteOffset": nrm_off,
             "byteLength": len(mesh.normals) * 12, "target": 34962},
            {"buffer": 0, "byteOffset": uv_off,
             "byteLength": len(mesh.uvs) * 8, "target": 34962},
            {"buffer": 0, "byteOffset": idx_off,
             "byteLength": len(mesh.indices) * 2, "target": 34963},
            {"buffer": 0, "byteOffset": img_off, "byteLength": len(texture_png)},
        ],
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


def rotate_to_negative_z(mesh: Mesh) -> None:
    mesh.positions = [(-p[2], p[1], -p[0]) for p in mesh.positions]
    mesh.normals = [(-n[2], n[1], -n[0]) for n in mesh.normals]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", default="web/public/models/train")
    parser.add_argument("--car-length", type=float, default=DEFAULTS["car_length"])
    parser.add_argument("--width", type=float, default=DEFAULTS["width"])
    parser.add_argument("--height", type=float, default=DEFAULTS["height"])
    parser.add_argument("--corner-segments", type=int, default=3)
    parser.add_argument("--cab-corner-segments", type=int, default=2)
    parser.add_argument("--forward-axis", choices=["x", "-z"], default="x",
                        help="axe de marche ; doit correspondre aux GLB metro")
    parser.add_argument("--livery", choices=["neutral", "line"], default="line",
                        help="line (defaut) : ceinture a la couleur GTFS, un "
                             "fichier par ligne RER ; neutral : ceinture grise")
    parser.add_argument("--no-cab", action="store_true")
    parser.add_argument("--dump-texture", metavar="PNG",
                        help="ecrit aussi la texture seule, pour inspection")
    args = parser.parse_args()

    cfg = dict(DEFAULTS)
    cfg.update(car_length=args.car_length, width=args.width, height=args.height)
    out_dir = Path(args.out_dir)

    builders = [("neutral", body_car, False)]
    if not args.no_cab:
        builders.append(("cab", cab_car, True))

    if args.livery == "line":
        variants = [(letter, hex_to_rgb(RER_COLOURS[letter])) for letter in "ABCDE"]
    else:
        variants = [(None, TONE_BELT)]

    print(f"{'fichier':<38}{'tri':>6}{'sommets':>9}{'texture':>9}{'octets':>9}")
    total = 0
    for letter, belt in variants:
        for kind, builder, is_cab in builders:
            suffix = f"__{kind}" if letter is None else f"_{letter}__{kind}"
            name = f"rer_generic{suffix}"
            segments = args.cab_corner_segments if is_cab else args.corner_segments
            mesh = builder(cfg, segments)
            if args.forward_axis == "-z":
                rotate_to_negative_z(mesh)
            png = paint_texture(cfg, segments, belt, is_cab, line_letter=letter)
            if args.dump_texture and letter in (None, "A") and not is_cab:
                Path(args.dump_texture).write_bytes(png)
            size = write_glb(out_dir / f"{name}.glb", mesh, png, name)
            total += size
            print(f"{name + '.glb':<38}{mesh.triangle_count:>6}"
                  f"{len(mesh.positions):>9}{len(png):>9}{size:>9}")
    print(f"{'total':<38}{'':>6}{'':>9}{'':>9}{total:>9}")


if __name__ == "__main__":
    main()
