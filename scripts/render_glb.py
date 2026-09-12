#!/usr/bin/env python3
"""Rendu d'aperçu d'un GLB texturé : rastériseur avec z-buffer et UV.

Nécessaire parce qu'un tri de faces par profondeur ne suffit plus : avec une
texture, il faut interpoler les UV en barycentrique pour voir les fenêtres.
"""

from __future__ import annotations

import json
import math
import struct
import sys
import zlib
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

LIGHT = np.array([0.38, 0.74, 0.56])
LIGHT /= np.linalg.norm(LIGHT)
BACKGROUND = np.array([0.09, 0.086, 0.10])


def decode_png(data: bytes) -> np.ndarray:
    """PNG RGB8 non entrelacé, filtres 0–4."""
    pos = 8
    width = height = 0
    idat = bytearray()
    while pos < len(data):
        length = struct.unpack_from(">I", data, pos)[0]
        tag = data[pos + 4:pos + 8]
        payload = data[pos + 8:pos + 8 + length]
        if tag == b"IHDR":
            width, height, depth, colour = struct.unpack_from(">IIBB", payload, 0)
            assert depth == 8 and colour == 2, "attendu RGB8"
        elif tag == b"IDAT":
            idat += payload
        pos += 12 + length

    raw = zlib.decompress(bytes(idat))
    stride = width * 3
    out = np.zeros((height, stride), dtype=np.uint8)
    prev = np.zeros(stride, dtype=np.int32)
    off = 0
    for row in range(height):
        ftype = raw[off]
        off += 1
        line = np.frombuffer(raw[off:off + stride], dtype=np.uint8).astype(np.int32).copy()
        off += stride
        if ftype == 1:
            for i in range(3, stride):
                line[i] = (line[i] + line[i - 3]) & 255
        elif ftype == 2:
            line = (line + prev) & 255
        elif ftype == 3:
            for i in range(stride):
                left = line[i - 3] if i >= 3 else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 255
        elif ftype == 4:
            for i in range(stride):
                a = line[i - 3] if i >= 3 else 0
                b = prev[i]
                c = prev[i - 3] if i >= 3 else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pred) & 255
        out[row] = line.astype(np.uint8)
        prev = line
    return out.reshape(height, width, 3).astype(np.float32) / 255.0


def load(path: Path):
    data = path.read_bytes()
    _, _, total = struct.unpack_from("<4sII", data, 0)
    pos, gltf, binary = 12, None, b""
    while pos < total:
        length, kind = struct.unpack_from("<II", data, pos)
        chunk = data[pos + 8:pos + 8 + length]
        if kind == 0x4E4F534A:
            gltf = json.loads(chunk.decode("utf-8"))
        elif kind == 0x004E4942:
            binary = chunk
        pos += 8 + length

    prim = gltf["meshes"][0]["primitives"][0]

    def read(acc_index, dtype, size):
        acc = gltf["accessors"][acc_index]
        bv = gltf["bufferViews"][acc["bufferView"]]
        arr = np.frombuffer(binary, dtype=dtype, count=acc["count"] * size,
                            offset=bv["byteOffset"])
        return arr.reshape(-1, size).astype(np.float64) if size > 1 else arr

    pos_a = read(prim["attributes"]["POSITION"], "<f4", 3)
    uv_a = read(prim["attributes"]["TEXCOORD_0"], "<f4", 2)
    idx = read(prim["indices"], "<u2", 1).astype(int).reshape(-1, 3)

    image = None
    if gltf.get("images"):
        bv = gltf["bufferViews"][gltf["images"][0]["bufferView"]]
        image = decode_png(binary[bv["byteOffset"]:bv["byteOffset"] + bv["byteLength"]])
    return pos_a, uv_a, idx, image


def basis(elev_deg: float, azim_deg: float):
    e, a = math.radians(elev_deg), math.radians(azim_deg)
    forward = np.array([math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)])
    right = np.cross(np.array([0.0, 0.0, 1.0]), forward)
    right /= np.linalg.norm(right)
    up = np.cross(forward, right)
    return right, up, forward


def render(batches, elev, azim, width, height, pad=0.6):
    right, up, forward = basis(elev, azim)
    frame = np.tile(BACKGROUND, (height, width, 1)).astype(np.float32)
    depth = np.full((height, width), -1e18)

    tris = []
    for positions, uvs, indices, image, offset in batches:
        world = positions.copy()
        world[:, 0] += offset
        world = np.stack([world[:, 0], world[:, 2], world[:, 1]], axis=1)
        for tri in indices:
            p = world[tri]
            n = np.cross(p[1] - p[0], p[2] - p[0])
            ln = np.linalg.norm(n)
            if ln < 1e-12:
                continue
            n /= ln
            if n @ forward > 0.02:
                continue
            lit = 0.34 + 0.80 * max(0.0, float(n @ LIGHT))
            tris.append((p, uvs[tri], lit, image))

    if not tris:
        return frame
    allp = np.concatenate([t[0] for t in tris])
    sx, sy = allp @ right, allp @ up
    lo = np.array([sx.min(), sy.min()])
    hi = np.array([sx.max(), sy.max()])
    centre = (lo + hi) / 2
    scale = min(width / (hi[0] - lo[0] + pad), height / (hi[1] - lo[1] + pad))

    for p, uv, lit, image in tris:
        px = (p @ right - centre[0]) * scale + width / 2
        py = height / 2 - (p @ up - centre[1]) * scale
        pz = p @ forward
        x0 = max(0, int(np.floor(px.min())))
        x1 = min(width - 1, int(np.ceil(px.max())))
        y0 = max(0, int(np.floor(py.min())))
        y1 = min(height - 1, int(np.ceil(py.max())))
        if x1 < x0 or y1 < y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        d = ((py[1] - py[2]) * (px[0] - px[2]) + (px[2] - px[1]) * (py[0] - py[2]))
        if abs(d) < 1e-9:
            continue
        w0 = ((py[1] - py[2]) * (xs - px[2]) + (px[2] - px[1]) * (ys - py[2])) / d
        w1 = ((py[2] - py[0]) * (xs - px[2]) + (px[0] - px[2]) * (ys - py[2])) / d
        w2 = 1.0 - w0 - w1
        inside = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
        if not inside.any():
            continue
        zz = w0 * pz[0] + w1 * pz[1] + w2 * pz[2]
        sub = depth[y0:y1 + 1, x0:x1 + 1]
        better = inside & (zz > sub)
        if not better.any():
            continue
        uu = w0 * uv[0, 0] + w1 * uv[1, 0] + w2 * uv[2, 0]
        vv = w0 * uv[0, 1] + w1 * uv[1, 1] + w2 * uv[2, 1]
        th, tw = image.shape[:2]
        tx = np.clip((uu * tw).astype(int), 0, tw - 1)
        ty = np.clip((vv * th).astype(int), 0, th - 1)
        colour = image[ty, tx] * lit
        target = frame[y0:y1 + 1, x0:x1 + 1]
        target[better] = np.clip(colour[better], 0, 1)
        sub[better] = zz[better]
    return frame


if __name__ == "__main__":
    body_path, cab_path, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    body = load(body_path)
    cab = load(cab_path)

    def batch(model, offset):
        return (model[0], model[1], model[2], model[3], offset)

    panels = [
        ("Rame assemblee : cabine + 3 voitures, jeu d'intercirculation 0,8 m",
         [batch(cab, 0.0), batch(body, 15.8), batch(body, 31.6), batch(body, 47.4)],
         22, -118, 1600, 300),
        ("Voiture de rame : deux rangs de fenetres, deux portes, ceinture de ligne",
         [batch(body, 0.0)], 14, -118, 1600, 330),
        ("Cabine : nez incline, pare-brise",
         [batch(cab, 0.0)], 5, -92, 1600, 300),
        ("Trois quarts avant",
         [batch(cab, 0.0)], 18, -142, 1600, 380),
    ]

    fig, axes = plt.subplots(len(panels), 1, figsize=(13.5, 9.5), facecolor="#17161A")
    for ax, (title, batches, elev, azim, w, h) in zip(axes, panels):
        ax.imshow(render(batches, elev, azim, w, h))
        ax.set_axis_off()
        ax.set_title(title, fontsize=9.5, color="#C9C4BC", pad=3)
    fig.subplots_adjust(left=0.01, right=0.99, top=0.955, bottom=0.01, hspace=0.28)
    fig.savefig(out, dpi=116, facecolor="#17161A")
    print("ecrit", out)
