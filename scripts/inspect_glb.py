#!/usr/bin/env python3
"""Inspecte un GLB : chunks, gabarit, triangles, matériaux, axe de marche.

Sert d'abord à VÉRIFIER LA CONVENTION D'AXES des GLB métro existants avant
d'intégrer les modèles RER. Si pneumatic_generic__neutral.glb a sa plus grande
dimension sur Z, il faut régénérer le RER avec --forward-axis=-z.

    python3 inspect_glb.py web/public/models/train/*.glb
"""

from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

COMPONENT = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
NUM = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def read_glb(path: Path):
    data = path.read_bytes()
    magic, version, total = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF":
        raise ValueError(f"{path}: ce n'est pas un GLB")
    offset, gltf, binary = 12, None, b""
    while offset < total:
        length, kind = struct.unpack_from("<II", data, offset)
        chunk = data[offset + 8:offset + 8 + length]
        if kind == 0x4E4F534A:
            gltf = json.loads(chunk.decode("utf-8"))
        elif kind == 0x004E4942:
            binary = chunk
        offset += 8 + length
    return version, total, gltf, binary


def report(path: Path) -> None:
    version, total, gltf, binary = read_glb(path)
    accessors = gltf.get("accessors", [])
    tris = 0
    lo = [float("inf")] * 3
    hi = [float("-inf")] * 3
    for mesh in gltf.get("meshes", []):
        for prim in mesh.get("primitives", []):
            if "indices" in prim:
                tris += accessors[prim["indices"]]["count"] // 3
            pos = accessors[prim["attributes"]["POSITION"]]
            for k in range(3):
                lo[k] = min(lo[k], pos["min"][k])
                hi[k] = max(hi[k], pos["max"][k])
    span = [hi[k] - lo[k] for k in range(3)]
    axis = "XYZ"[span.index(max(span))]

    print(f"\n{path.name}")
    print(f"  glTF {version}, {total} octets, bin {len(binary)} octets")
    print(f"  {len(gltf.get('meshes', []))} maillage(s), "
          f"{sum(len(m.get('primitives', [])) for m in gltf.get('meshes', []))} primitive(s), "
          f"{tris} triangles")
    print(f"  gabarit  X {span[0]:6.2f}  Y {span[1]:6.2f}  Z {span[2]:6.2f}  (m)")
    print(f"  origine  X [{lo[0]:.2f}, {hi[0]:.2f}]  "
          f"Y [{lo[1]:.2f}, {hi[1]:.2f}]  Z [{lo[2]:.2f}, {hi[2]:.2f}]")
    print(f"  axe de marche presume : {axis} (plus grande dimension)")
    for mat in gltf.get("materials", []):
        pbr = mat.get("pbrMetallicRoughness", {})
        base = pbr.get("baseColorFactor", [1, 1, 1, 1])
        print(f"  materiau {mat.get('name', '?'):<18} "
              f"base [{base[0]:.2f} {base[1]:.2f} {base[2]:.2f}] "
              f"metal {pbr.get('metallicFactor', 1):.2f} "
              f"rough {pbr.get('roughnessFactor', 1):.2f}")
    if gltf.get("images") or gltf.get("textures"):
        print("  ATTENTION : ce modele porte des textures (le RER n'en a pas)")


if __name__ == "__main__":
    paths = [Path(a) for a in sys.argv[1:]]
    if not paths:
        print(__doc__)
        raise SystemExit(1)
    for p in paths:
        report(p)
    print()
