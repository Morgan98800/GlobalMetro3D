"""
write_shapes_v2.py — écriture du format shapes.bin quantifié.

Mesure de départ : shapes.bin v1 fait 1,67 Mo, servi sans compression, et met
8 980 ms à arriver sur Fast 4G. C'est la ressource la plus lente du chargement.

Deux économies, cumulables :
  - la distance cumulée n'est plus stockée : le rééchantillonnage est à pas
    constant, donc dist[i] = i * step. Seul le dernier segment est irrégulier.
    → un Float32 sur trois disparaît.
  - les coordonnées deviennent des deltas Int16 en 1e-7 degré (~1,1 cm).
    Un pas de 10 m vaut au plus ~900 unités, très en dessous du plafond 32767.
    → 4 octets par point au lieu de 12.

Résultat attendu : ~560 Ko avant compression, ~350 Ko après Brotli.
La précision reste de l'ordre du centimètre, sans dérive : les deltas sont
accumulés en entiers, donc l'erreur ne se propage pas.

À brancher en sortie de resample.py, sur les tracés déjà rééchantillonnés.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass
from pathlib import Path

SCALE = 1e7
MAGIC_V2 = 0x53485032  # 'SHP2'
VERSION = 2
INT16_MAX = 32767


@dataclass
class ResampledShape:
    shape_id: str
    coords: list[tuple[float, float]]  # (lng, lat), pas constant
    step: float                        # pas de rééchantillonnage en mètres
    tail_length: float                 # longueur du dernier segment


def _pad4(buf: bytearray) -> None:
    while len(buf) % 4:
        buf.append(0)


def write_shapes_v2(shapes: list[ResampledShape], path: Path) -> dict:
    if len(shapes) > 65535:
        raise ValueError("plus de 65535 tracés : passer shapeCount en uint32")

    out = bytearray()
    out += struct.pack(">I", MAGIC_V2)
    out += struct.pack("<HH", VERSION, len(shapes))

    max_delta = 0

    for shape in shapes:
        pts = shape.coords
        if len(pts) < 2:
            raise ValueError(f"{shape.shape_id}: moins de deux points")

        ident = shape.shape_id.encode("utf-8")
        out += struct.pack("<H", len(ident))
        out += ident
        _pad4(out)

        out += struct.pack("<I", len(pts))
        out += struct.pack("<f", shape.step)
        out += struct.pack("<f", shape.tail_length)

        lng_q = round(pts[0][0] * SCALE)
        lat_q = round(pts[0][1] * SCALE)
        out += struct.pack("<ii", lng_q, lat_q)

        for lng, lat in pts[1:]:
            next_lng = round(lng * SCALE)
            next_lat = round(lat * SCALE)
            d_lng = next_lng - lng_q
            d_lat = next_lat - lat_q

            if abs(d_lng) > INT16_MAX or abs(d_lat) > INT16_MAX:
                raise ValueError(
                    f"{shape.shape_id}: delta hors Int16 ({d_lng}, {d_lat}). "
                    "Le tracé n'est pas rééchantillonné, ou le pas dépasse ~360 m."
                )

            max_delta = max(max_delta, abs(d_lng), abs(d_lat))
            out += struct.pack("<hh", d_lng, d_lat)
            # accumulation en entiers : le décodeur retrouve exactement ces valeurs
            lng_q = next_lng
            lat_q = next_lat

    path.write_bytes(out)

    total_points = sum(len(s.coords) for s in shapes)
    return {
        "path": str(path),
        "bytes": len(out),
        "shapes": len(shapes),
        "points": total_points,
        "bytes_per_point": round(len(out) / total_points, 2),
        "max_delta_int16": max_delta,
    }


def verify_roundtrip(shapes: list[ResampledShape], path: Path) -> float:
    """
    Relit le fichier et retourne l'écart maximal en mètres par rapport aux
    coordonnées d'origine. Doit rester sous 0,02 m.
    """
    import math

    data = path.read_bytes()
    assert struct.unpack_from(">I", data, 0)[0] == MAGIC_V2
    count = struct.unpack_from("<H", data, 6)[0]
    off = 8
    worst = 0.0

    for s in range(count):
        (id_len,) = struct.unpack_from("<H", data, off)
        off += 2
        shape_id = data[off : off + id_len].decode("utf-8")
        off += id_len
        off += (-off) % 4

        (n,) = struct.unpack_from("<I", data, off)
        off += 12  # pointCount déjà lu, plus step et tail_length

        lng_q, lat_q = struct.unpack_from("<ii", data, off)
        off += 8

        source = next(x for x in shapes if x.shape_id == shape_id)
        decoded = [(lng_q / SCALE, lat_q / SCALE)]

        for _ in range(n - 1):
            d_lng, d_lat = struct.unpack_from("<hh", data, off)
            off += 4
            lng_q += d_lng
            lat_q += d_lat
            decoded.append((lng_q / SCALE, lat_q / SCALE))

        for (lng_a, lat_a), (lng_b, lat_b) in zip(source.coords, decoded):
            dx = (lng_a - lng_b) * 111320 * math.cos(math.radians(lat_a))
            dy = (lat_a - lat_b) * 110574
            worst = max(worst, math.hypot(dx, dy))

    return worst
