#!/usr/bin/env python3
"""Ajoute un marquage RER clean-room aux textures latérales des modèles GLB."""

from __future__ import annotations

import io
import json
import struct
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


RER_COLORS = {
    "A": (235, 33, 50),
    "B": (80, 145, 203),
    "C": (255, 204, 48),
    "D": (0, 139, 91),
    "E": (185, 78, 154),
}


def pad4(data: bytes, fill: bytes = b"\x00") -> bytes:
    return data + fill * ((-len(data)) % 4)


def read_glb(path: Path) -> tuple[dict, bytes, int, int]:
    data = path.read_bytes()
    magic, version, total = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2:
        raise ValueError(f"{path}: GLB 2.0 attendu")
    offset = 12
    gltf = None
    binary = b""
    while offset < total:
        length, kind = struct.unpack_from("<II", data, offset)
        chunk = data[offset + 8:offset + 8 + length]
        if kind == 0x4E4F534A:
            gltf = json.loads(chunk.decode("utf-8"))
        elif kind == 0x004E4942:
            binary = chunk
        offset += 8 + length
    if gltf is None:
        raise ValueError(f"{path}: JSON glTF absent")
    return gltf, binary, version, total


def patch_model(path: Path, letter: str) -> None:
    gltf, binary, version, _ = read_glb(path)
    image = gltf.get("images", [{}])[0]
    view = gltf["bufferViews"][image["bufferView"]]
    start = view.get("byteOffset", 0)
    end = start + view["byteLength"]
    texture = Image.open(io.BytesIO(binary[start:end])).convert("RGB")
    draw = ImageDraw.Draw(texture)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 34)
    except OSError:
        font = ImageFont.load_default()

    # La zone latérale correspond à la moitié centrale de l'atlas 512x512.
    # Le marquage reste volontairement typographique et non une reproduction
    # d'un logo propriétaire.
    color = RER_COLORS[letter]
    draw.rectangle((18, 245, 150, 302), fill=color)
    draw.text((28, 252), f"RER {letter}", fill=(255, 255, 255), font=font)

    encoded = io.BytesIO()
    texture.save(encoded, format="PNG", optimize=True)
    new_binary = binary[:start] + pad4(encoded.getvalue()) + binary[end:]
    delta = len(pad4(encoded.getvalue())) - view["byteLength"]
    view["byteLength"] = len(pad4(encoded.getvalue()))
    for other in gltf["bufferViews"]:
        if other is not view and other.get("byteOffset", 0) > start:
            other["byteOffset"] += delta
    gltf["buffers"][0]["byteLength"] = len(new_binary)

    json_chunk = pad4(json.dumps(gltf, separators=(",", ":")).encode("utf-8"), b" ")
    binary_chunk = pad4(new_binary)
    total = 12 + 8 + len(json_chunk) + 8 + len(binary_chunk)
    with path.open("wb") as output:
        output.write(struct.pack("<III", 0x46546C67, version, total))
        output.write(struct.pack("<II", len(json_chunk), 0x4E4F534A))
        output.write(json_chunk)
        output.write(struct.pack("<II", len(binary_chunk), 0x004E4942))
        output.write(binary_chunk)


def main() -> int:
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("web/public/models/train")
    for letter in RER_COLORS:
        path = root / f"rer_generic_{letter}__neutral.glb"
        if not path.is_file():
            raise FileNotFoundError(path)
        patch_model(path, letter)
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())