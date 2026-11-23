#!/usr/bin/env python3
"""Generate lightweight, clean-room Z-up PBR+emissive GLB models for Paris Seine landmarks:
- bateau_mouche.glb (32m Parisian river cruise boat with glowing glass salon & nav lights)
- pont_bir_hakeim.glb (iconic 2-level metallic viaduct carrying Line 6 across the Seine)
- pont_alexandre_iii.glb (Belle Époque single steel arch + 4 gilded limestone pylons)
- viaduc_austerlitz.glb (parabolic steel arch carrying Line 5 across the Seine)
- pont_neuf.glb (warm Lutetian limestone multi-arch bridge with semicircular bastions)

All meshes use Z-up coordinates (+X along span/bow, +Y width, +Z elevation in meters)
matching Deck.gl ScenegraphLayer orientation `[0, yawDeg, 0]`.
"""

from __future__ import annotations

import json
import math
import struct
from pathlib import Path
from typing import Sequence

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "web" / "public" / "models" / "landmarks"


class MeshBuilder:
    """Multi-material indexed triangle builder exporting compact glTF 2.0 GLB."""

    def __init__(self) -> None:
        self.materials: list[dict] = []
        self.primitives: list[tuple[int, list[np.ndarray], list[np.ndarray], list[int]]] = []

    def add_material(
        self,
        name: str,
        rgba: Sequence[float],
        roughness: float = 0.72,
        metallic: float = 0.08,
        emissive: Sequence[float] | None = None,
        double_sided: bool = False,
    ) -> int:
        mat: dict = {
            "name": name,
            "pbrMetallicRoughness": {
                "baseColorFactor": [float(c) for c in rgba],
                "metallicFactor": float(metallic),
                "roughnessFactor": float(roughness),
            },
        }
        if rgba[3] < 0.99:
            mat["alphaMode"] = "BLEND"
        if emissive is not None:
            mat["emissiveFactor"] = [float(c) for c in emissive]
        if double_sided:
            mat["doubleSided"] = True
        idx = len(self.materials)
        self.materials.append(mat)
        self.primitives.append((idx, [], [], []))
        return idx

    def _bucket(self, mat_idx: int):
        return self.primitives[mat_idx]

    def add_quad(self, mat_idx: int, p0, p1, p2, p3) -> None:
        _, verts, norms, idxs = self._bucket(mat_idx)
        v0 = np.asarray(p0, dtype=np.float32)
        v1 = np.asarray(p1, dtype=np.float32)
        v2 = np.asarray(p2, dtype=np.float32)
        v3 = np.asarray(p3, dtype=np.float32)
        n = np.cross(v1 - v0, v2 - v0)
        nlen = float(np.linalg.norm(n))
        n = (n / nlen) if nlen > 1e-7 else np.array([0.0, 0.0, 1.0], dtype=np.float32)
        base = len(verts)
        verts.extend([v0, v1, v2, v3])
        norms.extend([n, n, n, n])
        idxs.extend([base, base + 1, base + 2, base, base + 2, base + 3])

    def add_box(self, mat_idx: int, x0: float, x1: float, y0: float, y1: float, z0: float, z1: float) -> None:
        # 6 outward faces
        # -Z bottom
        self.add_quad(mat_idx, (x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (x1, y0, z0))
        # +Z top
        self.add_quad(mat_idx, (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))
        # -Y front
        self.add_quad(mat_idx, (x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1))
        # +Y back
        self.add_quad(mat_idx, (x1, y1, z0), (x0, y1, z0), (x0, y1, z1), (x1, y1, z1))
        # -X left
        self.add_quad(mat_idx, (x0, y1, z0), (x0, y0, z0), (x0, y0, z1), (x0, y1, z1))
        # +X right
        self.add_quad(mat_idx, (x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1))

    def add_prism_xy(
        self,
        mat_idx: int,
        ring_xy: Sequence[tuple[float, float]],
        z0: float,
        z1: float,
    ) -> None:
        """Extrude a CCW 2D polygon from z0 to z1."""
        n = len(ring_xy)
        for i in range(n):
            x0, y0 = ring_xy[i]
            x1, y1 = ring_xy[(i + 1) % n]
            self.add_quad(mat_idx, (x0, y0, z0), (x1, y1, z0), (x1, y1, z1), (x0, y0, z1))
        # Top cap (fan from centroid)
        cx = sum(p[0] for p in ring_xy) / n
        cy = sum(p[1] for p in ring_xy) / n
        _, verts, norms, idxs = self._bucket(mat_idx)
        base = len(verts)
        verts.append(np.array([cx, cy, z1], dtype=np.float32))
        norms.append(np.array([0.0, 0.0, 1.0], dtype=np.float32))
        for x, y in ring_xy:
            verts.append(np.array([x, y, z1], dtype=np.float32))
            norms.append(np.array([0.0, 0.0, 1.0], dtype=np.float32))
        for i in range(n):
            idxs.extend([base, base + 1 + i, base + 1 + ((i + 1) % n)])

    def add_arch_rib(
        self,
        mat_idx: int,
        x_start: float,
        x_end: float,
        y_center: float,
        half_w: float,
        z_spring: float,
        z_crown: float,
        thickness: float,
        segments: int = 16,
    ) -> None:
        """Build a curved parabolic arch beam along X between x_start and x_end."""
        span = x_end - x_start
        pts_lo: list[tuple[float, float]] = []
        pts_hi: list[tuple[float, float]] = []
        for i in range(segments + 1):
            t = i / segments
            x = x_start + span * t
            arch = 4.0 * t * (1.0 - t)  # 0 at ends, 1 at center
            z_bot = z_spring + (z_crown - z_spring) * arch
            pts_lo.append((x, z_bot))
            pts_hi.append((x, z_bot + thickness))
        y0, y1 = y_center - half_w, y_center + half_w
        for i in range(segments):
            x0, zb0 = pts_lo[i]
            x1, zb1 = pts_lo[i + 1]
            _, zt0 = pts_hi[i]
            _, zt1 = pts_hi[i + 1]
            # Top
            self.add_quad(mat_idx, (x0, y0, zt0), (x1, y0, zt1), (x1, y1, zt1), (x0, y1, zt0))
            # Bottom
            self.add_quad(mat_idx, (x0, y1, zb0), (x1, y1, zb1), (x1, y0, zb1), (x0, y0, zb0))
            # -Y side
            self.add_quad(mat_idx, (x0, y0, zb0), (x1, y0, zb1), (x1, y0, zt1), (x0, y0, zt0))
            # +Y side
            self.add_quad(mat_idx, (x1, y1, zb1), (x0, y1, zb0), (x0, y1, zt0), (x1, y1, zt1))

    def write_glb(self, dest: Path, name: str) -> None:
        buf = bytearray()
        buffer_views: list[dict] = []
        accessors: list[dict] = []
        gltf_prims: list[dict] = []

        def push_bytes(raw: bytes, target: int) -> int:
            while len(buf) % 4 != 0:
                buf.append(0)
            offset = len(buf)
            buf.extend(raw)
            bv_idx = len(buffer_views)
            buffer_views.append(
                {"buffer": 0, "byteOffset": offset, "byteLength": len(raw), "target": target}
            )
            return bv_idx

        for mat_idx, verts, norms, idxs in self.primitives:
            if not verts or not idxs:
                continue
            v_arr = np.asarray(verts, dtype=np.float32)
            n_arr = np.asarray(norms, dtype=np.float32)
            use_u32 = len(verts) > 65535
            i_arr = np.asarray(idxs, dtype=np.uint32 if use_u32 else np.uint16)

            bv_v = push_bytes(v_arr.tobytes(), 34962)
            bv_n = push_bytes(n_arr.tobytes(), 34962)
            bv_i = push_bytes(i_arr.tobytes(), 34963)

            acc_v = len(accessors)
            accessors.append(
                {
                    "bufferView": bv_v,
                    "componentType": 5126,
                    "count": int(v_arr.shape[0]),
                    "type": "VEC3",
                    "min": [float(x) for x in v_arr.min(axis=0)],
                    "max": [float(x) for x in v_arr.max(axis=0)],
                }
            )
            acc_n = len(accessors)
            accessors.append(
                {
                    "bufferView": bv_n,
                    "componentType": 5126,
                    "count": int(n_arr.shape[0]),
                    "type": "VEC3",
                }
            )
            acc_i = len(accessors)
            accessors.append(
                {
                    "bufferView": bv_i,
                    "componentType": 5125 if use_u32 else 5123,
                    "count": int(i_arr.shape[0]),
                    "type": "SCALAR",
                }
            )
            gltf_prims.append(
                {
                    "attributes": {"POSITION": acc_v, "NORMAL": acc_n},
                    "indices": acc_i,
                    "material": mat_idx,
                }
            )

        while len(buf) % 4 != 0:
            buf.append(0)

        gltf = {
            "asset": {"version": "2.0", "generator": "paris-subway-3d-landmarks"},
            "scene": 0,
            "scenes": [{"nodes": [0]}],
            "nodes": [{"name": name, "mesh": 0}],
            "meshes": [{"name": name, "primitives": gltf_prims}],
            "materials": self.materials,
            "buffers": [{"byteLength": len(buf)}],
            "bufferViews": buffer_views,
            "accessors": accessors,
        }
        j_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
        while len(j_bytes) % 4 != 0:
            j_bytes += b" "

        total_len = 12 + 8 + len(j_bytes) + 8 + len(buf)
        header = struct.pack("<III", 0x46546C67, 2, total_len)
        json_chunk = struct.pack("<II", len(j_bytes), 0x4E4F534A) + j_bytes
        bin_chunk = struct.pack("<II", len(buf), 0x004E4942) + bytes(buf)

        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(header + json_chunk + bin_chunk)
        print(f"generated {dest.name} ({dest.stat().st_size / 1024:.1f} KiB)")


def build_bateau_mouche() -> None:
    """32m × 6.4m Parisian Bateau-Mouche / Batobus with warm glowing panoramic cabin."""
    mb = MeshBuilder()
    hull_mat = mb.add_material("hull", (0.14, 0.21, 0.30, 1.0), roughness=0.45, metallic=0.18)
    deck_mat = mb.add_material("deck", (0.94, 0.93, 0.90, 1.0), roughness=0.55, metallic=0.05)
    salon_glow = mb.add_material(
        "salon_glow",
        (0.98, 0.88, 0.64, 1.0),
        roughness=0.15,
        metallic=0.08,
        emissive=(0.95, 0.78, 0.42),
    )
    roof_mat = mb.add_material("roof", (0.88, 0.89, 0.91, 1.0), roughness=0.48, metallic=0.1)
    head_beam = mb.add_material(
        "headlight",
        (1.0, 0.98, 0.88, 1.0),
        roughness=0.1,
        emissive=(1.0, 0.95, 0.78),
    )
    port_red = mb.add_material("port_red", (0.95, 0.16, 0.14, 1.0), emissive=(0.95, 0.16, 0.14))
    star_green = mb.add_material("star_green", (0.12, 0.92, 0.42, 1.0), emissive=(0.12, 0.92, 0.42))

    # Tapered hull (+X = bow)
    hull_ring = [
        (-15.5, -2.5),
        (9.5, -3.1),
        (14.0, -1.9),
        (16.2, 0.0),
        (14.0, 1.9),
        (9.5, 3.1),
        (-15.5, 2.5),
    ]
    mb.add_prism_xy(hull_mat, hull_ring, 0.0, 1.35)

    # White promenade deck lip
    deck_ring = [
        (-15.0, -2.7),
        (9.2, -3.25),
        (13.8, -2.0),
        (15.6, 0.0),
        (13.8, 2.0),
        (9.2, 3.25),
        (-15.0, 2.7),
    ]
    mb.add_prism_xy(deck_mat, deck_ring, 1.35, 1.75)

    # Glowing panoramic glass cabin salon
    mb.add_box(salon_glow, -11.5, 8.8, -2.45, 2.45, 1.75, 3.45)

    # Window mullion ribs along cabin sides
    for rx in (-9.0, -5.5, -2.0, 1.5, 5.0):
        mb.add_box(deck_mat, rx - 0.15, rx + 0.15, -2.55, -2.42, 1.75, 3.55)
        mb.add_box(deck_mat, rx - 0.15, rx + 0.15, 2.42, 2.55, 1.75, 3.55)

    # Upper open-air roof canopy + wheelhouse
    mb.add_box(roof_mat, -11.8, 9.2, -2.6, 2.6, 3.45, 3.78)
    mb.add_box(deck_mat, 6.2, 8.6, -1.35, 1.35, 3.78, 4.55)
    mb.add_box(salon_glow, 7.6, 8.68, -1.15, 1.15, 3.92, 4.42)

    # Forward floodlight + port (red, +Y left) / starboard (green, -Y right) lights
    mb.add_box(head_beam, 14.3, 15.1, -0.45, 0.45, 1.78, 2.22)
    mb.add_box(port_red, 8.0, 8.6, 2.45, 2.8, 3.5, 3.85)
    mb.add_box(star_green, 8.0, 8.6, -2.8, -2.45, 3.5, 3.85)

    mb.write_glb(OUT_DIR / "bateau_mouche.glb", "BateauMouche")


def build_pont_bir_hakeim() -> None:
    """Pont de Bir-Hakeim: 2-level metallic colonnade viaduct carrying Line 6 at +10.2m."""
    mb = MeshBuilder()
    iron = mb.add_material("paris_iron", (0.29, 0.36, 0.34, 1.0), roughness=0.52, metallic=0.55)
    road_deck = mb.add_material("road_deck", (0.34, 0.35, 0.37, 1.0), roughness=0.82, metallic=0.06)
    stone = mb.add_material("limestone", (0.82, 0.78, 0.71, 1.0), roughness=0.82, metallic=0.04)
    lamp = mb.add_material("lamp", (1.0, 0.92, 0.72, 1.0), emissive=(0.95, 0.80, 0.45))

    half_span = 128.0  # 256m full span including Île aux Cygnes
    # Lower road & pedestrian deck (22m wide, z = 4.6..5.4)
    mb.add_box(road_deck, -half_span, half_span, -11.0, 11.0, 4.6, 5.4)
    # Cast-iron side parapets
    mb.add_box(iron, -half_span, half_span, -11.2, -10.7, 5.4, 6.5)
    mb.add_box(iron, -half_span, half_span, 10.7, 11.2, 5.4, 6.5)

    # Central Île aux Cygnes stone masonry pier & monumental triumphal arch (around x = 0)
    mb.add_box(stone, -10.5, 10.5, -12.4, 12.4, -1.0, 5.6)
    # Four stone arch pillars rising up to upper viaduct
    for sx in (-6.5, 6.5):
        for sy in (-5.2, 5.2):
            mb.add_box(stone, sx - 2.0, sx + 2.0, sy - 1.4, sy + 1.4, 5.4, 10.6)
    mb.add_box(stone, -8.5, 8.5, -6.6, 6.6, 9.6, 10.8)

    # River stone piers
    for px in (-82.0, -42.0, 42.0, 82.0):
        mb.add_box(stone, px - 2.6, px + 2.6, -12.0, 12.0, -1.0, 4.8)

    # Metallic arches under lower road deck across both Seine channels
    for a0, a1 in ((-124.0, -82.0), (-82.0, -42.0), (-42.0, -10.5), (10.5, 42.0), (42.0, 82.0), (82.0, 124.0)):
        for yc in (-9.6, 0.0, 9.6):
            mb.add_arch_rib(iron, a0, a1, yc, 0.45, 1.4, 4.4, 0.75, segments=10)

    # Iconic upper metro Line 6 viaduct deck (7.6m wide, z = 9.4..10.2) + colonnade columns
    mb.add_box(iron, -half_span, half_span, -3.9, 3.9, 9.4, 10.2)
    mb.add_box(iron, -half_span, half_span, -4.1, -3.7, 10.2, 11.2)
    mb.add_box(iron, -half_span, half_span, 3.7, 4.1, 10.2, 11.2)

    # Twin cast-iron colonnade rows supporting the Line 6 viaduct
    x_pos = -118.0
    while x_pos <= 118.0:
        if abs(x_pos) > 12.0:
            for yc in (-3.2, 3.2):
                mb.add_box(iron, x_pos - 0.35, x_pos + 0.35, yc - 0.35, yc + 0.35, 5.4, 9.5)
            # Warm globe lamps suspended inside the colonnade promenade
            if int(round(x_pos)) % 24 == 0:
                mb.add_box(lamp, x_pos - 0.3, x_pos + 0.3, -0.3, 0.3, 8.7, 9.2)
        x_pos += 12.0

    mb.write_glb(OUT_DIR / "pont_bir_hakeim.glb", "PontBirHakeim")


def build_pont_alexandre_iii() -> None:
    """Pont Alexandre III: Belle Époque single steel arch + 4 gilded limestone pylons."""
    mb = MeshBuilder()
    steel = mb.add_material("alex_steel", (0.45, 0.48, 0.51, 1.0), roughness=0.48, metallic=0.52)
    stone = mb.add_material("alex_stone", (0.86, 0.82, 0.74, 1.0), roughness=0.78, metallic=0.04)
    gold = mb.add_material("alex_gold", (0.88, 0.70, 0.22, 1.0), roughness=0.28, metallic=0.85)
    deck = mb.add_material("alex_deck", (0.42, 0.42, 0.44, 1.0), roughness=0.84, metallic=0.05)
    lamp = mb.add_material("alex_lamp", (1.0, 0.92, 0.70, 1.0), emissive=(1.0, 0.84, 0.46))

    half_span = 76.0  # 152m total (107m arch + abutments)
    half_w = 18.5  # Wide 37m Belle Époque avenue bridge

    # Sweeping low-rise steel arches (6 parallel ribs)
    for yc in (-17.5, -10.5, -3.5, 3.5, 10.5, 17.5):
        mb.add_arch_rib(steel, -54.0, 54.0, yc, 0.65, 1.8, 6.2, 1.15, segments=18)

    # Flat gently crowned deck + ornate bronze/stone parapets
    mb.add_box(deck, -half_span, half_span, -half_w, half_w, 6.4, 7.2)
    mb.add_box(stone, -half_span, half_span, -half_w - 0.6, -half_w + 0.4, 6.6, 8.3)
    mb.add_box(stone, -half_span, half_span, half_w - 0.4, half_w + 0.6, 6.6, 8.3)

    # Massive river abutments
    for ax in (-64.0, 64.0):
        mb.add_box(stone, ax - 12.0, ax + 12.0, -half_w - 1.5, half_w + 1.5, -1.0, 7.3)

    # 4 iconic 17m limestone pylons topped with gilded Pegasus sculptures
    for px in (-62.0, 62.0):
        for py in (-half_w - 0.6, half_w + 0.6):
            mb.add_box(stone, px - 2.6, px + 2.6, py - 2.6, py + 2.6, 7.2, 20.5)
            mb.add_box(stone, px - 3.1, px + 3.1, py - 3.1, py + 3.1, 20.5, 22.0)
            # Gilded Pegasus crown
            mb.add_box(gold, px - 1.7, px + 1.7, py - 1.4, py + 1.4, 22.0, 26.2)
            mb.add_box(gold, px - 2.4, px + 2.4, py - 0.7, py + 0.7, 23.8, 25.4)

    # Belle Époque gilded candelabras along both parapets
    for lx in (-42.0, -21.0, 0.0, 21.0, 42.0):
        for py in (-half_w - 0.2, half_w + 0.2):
            mb.add_box(steel, lx - 0.28, lx + 0.28, py - 0.28, py + 0.28, 8.2, 11.4)
            mb.add_box(lamp, lx - 0.55, lx + 0.55, py - 0.55, py + 0.55, 11.4, 12.3)

    mb.write_glb(OUT_DIR / "pont_alexandre_iii.glb", "PontAlexandreIII")


def build_viaduc_austerlitz() -> None:
    """Viaduc d'Austerlitz: iconic 140m single parabolic steel arch carrying Metro Line 5."""
    mb = MeshBuilder()
    steel = mb.add_material("aust_steel", (0.33, 0.40, 0.44, 1.0), roughness=0.48, metallic=0.62)
    stone = mb.add_material("aust_stone", (0.80, 0.76, 0.69, 1.0), roughness=0.84, metallic=0.04)
    deck = mb.add_material("aust_deck", (0.28, 0.30, 0.34, 1.0), roughness=0.78, metallic=0.25)

    half_span = 72.0  # 144m clear arch span
    # Twin tall parabolic steel arches rising to +23m above the Seine
    for yc in (-4.4, 4.4):
        mb.add_arch_rib(steel, -half_span, half_span, yc, 0.55, 2.2, 22.5, 1.4, segments=20)

    # Suspended Line 5 metro deck at +9.5m
    mb.add_box(deck, -half_span - 8.0, half_span + 8.0, -4.1, 4.1, 9.2, 10.1)
    mb.add_box(steel, -half_span - 8.0, half_span + 8.0, -4.4, -4.0, 9.6, 11.0)
    mb.add_box(steel, -half_span - 8.0, half_span + 8.0, 4.0, 4.4, 9.6, 11.0)

    # Vertical tension hangers & overhead cross-bracing between arches
    for i in range(1, 12):
        t = i / 12.0
        x = -half_span + 2.0 * half_span * t
        arch_z = 2.2 + (22.5 - 2.2) * (4.0 * t * (1.0 - t))
        if arch_z > 10.5:
            for yc in (-4.4, 4.4):
                mb.add_box(steel, x - 0.16, x + 0.16, yc - 0.16, yc + 0.16, 10.0, arch_z + 0.4)
            if arch_z > 15.0:
                mb.add_box(steel, x - 0.22, x + 0.22, -4.4, 4.4, arch_z + 0.4, arch_z + 0.95)

    # Bank masonry abutments
    for ax in (-half_span - 5.0, half_span + 5.0):
        mb.add_box(stone, ax - 5.0, ax + 5.0, -6.2, 6.2, -1.0, 11.4)

    mb.write_glb(OUT_DIR / "viaduc_austerlitz.glb", "ViaducAusterlitz")


def build_pont_neuf() -> None:
    """Pont Neuf: historic Lutetian limestone multi-arch bridge with semicircular bastions."""
    mb = MeshBuilder()
    stone = mb.add_material("neuf_stone", (0.84, 0.79, 0.70, 1.0), roughness=0.84, metallic=0.03)
    trim = mb.add_material("neuf_trim", (0.76, 0.71, 0.62, 1.0), roughness=0.82, metallic=0.03)
    road = mb.add_material("neuf_road", (0.38, 0.37, 0.36, 1.0), roughness=0.88, metallic=0.04)
    lamp = mb.add_material("neuf_lamp", (1.0, 0.90, 0.66, 1.0), emissive=(0.95, 0.78, 0.42))

    half_span = 104.0  # 208m across Grand & Petit Bras
    half_w = 10.2

    # Continuous limestone deck + parapets
    mb.add_box(road, -half_span, half_span, -half_w + 0.8, half_w - 0.8, 6.2, 6.9)
    mb.add_box(stone, -half_span, half_span, -half_w, -half_w + 0.8, 5.6, 7.9)
    mb.add_box(stone, -half_span, half_span, half_w - 0.8, half_w, 5.6, 7.9)
    # Stone cornice molding
    mb.add_box(trim, -half_span, half_span, -half_w - 0.35, half_w + 0.35, 5.8, 6.3)

    # 8 stone arches & piers with iconic semicircular bastions (demi-lunes)
    arch_edges = [-104.0, -78.0, -52.0, -26.0, 0.0, 26.0, 52.0, 78.0, 104.0]
    for i in range(len(arch_edges) - 1):
        a0, a1 = arch_edges[i], arch_edges[i + 1]
        for yc in (-8.5, 0.0, 8.5):
            mb.add_arch_rib(stone, a0 + 2.0, a1 - 2.0, yc, 1.6, 1.5, 5.3, 0.95, segments=10)
    for px in arch_edges[1:-1]:
        mb.add_box(stone, px - 2.4, px + 2.4, -half_w - 2.2, half_w + 2.2, -1.0, 6.4)
        # Iconic semicircular lookout bastions on both sides
        for sy in (-half_w - 1.4, half_w + 1.4):
            mb.add_box(trim, px - 2.1, px + 2.1, sy - 1.2, sy + 1.2, 6.4, 7.8)
            mb.add_box(lamp, px - 0.32, px + 0.32, sy - 0.32, sy + 0.32, 9.6, 10.3)

    mb.write_glb(OUT_DIR / "pont_neuf.glb", "PontNeuf")


def main() -> int:
    build_bateau_mouche()
    build_pont_bir_hakeim()
    build_pont_alexandre_iii()
    build_viaduc_austerlitz()
    build_pont_neuf()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
