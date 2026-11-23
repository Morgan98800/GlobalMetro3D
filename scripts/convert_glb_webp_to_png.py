#!/usr/bin/env python3
"""
Convert embedded EXT_texture_webp images inside GLB 2.0 files to standard
glTF 2.0 PNG textures (texture.source + image/png) and remove EXT_texture_webp
from extensionsUsed / extensionsRequired.

Preserves all existing binary bufferViews/accessors (including meshopt)
untouched by appending the converted PNG bytes to the binary chunk.
"""

from __future__ import annotations

import io
import json
import struct
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
TARGET_DIRS = [
    ROOT / "web" / "public" / "models" / "train" / "library",
    ROOT / "web" / "public" / "models" / "train" / "map_hd",
]


def pad4(data: bytes, pad_byte: bytes) -> bytes:
    rem = len(data) % 4
    return data if rem == 0 else data + pad_byte * (4 - rem)


def convert_glb(path: Path) -> bool:
    raw = path.read_bytes()
    magic, version, _total_len = struct.unpack("<III", raw[:12])
    if magic != 0x46546C67 or version != 2:
        raise ValueError(f"Not a valid GLB 2.0 file: {path}")

    json_len, json_type = struct.unpack("<II", raw[12:20])
    if json_type != 0x4E4F534A:
        raise ValueError(f"Expected JSON chunk in {path}")
    gltf = json.loads(raw[20 : 20 + json_len].decode("utf-8"))

    bin_start = 20 + json_len
    bin_len, bin_type = struct.unpack("<II", raw[bin_start : bin_start + 8])
    if bin_type != 0x004E4942:
        raise ValueError(f"Expected BIN chunk in {path}")
    orig_bin = raw[bin_start + 8 : bin_start + 8 + bin_len]

    images = gltf.get("images", [])
    textures = gltf.get("textures", [])
    buffer_views = gltf.get("bufferViews", [])

    has_webp = any(img.get("mimeType") == "image/webp" for img in images) or any(
        "EXT_texture_webp" in tex.get("extensions", {}) for tex in textures
    )
    if not has_webp:
        return False

    new_bin = bytearray(pad4(orig_bin, b"\x00"))

    for img in images:
        if img.get("mimeType") != "image/webp":
            continue
        bv_idx = img.get("bufferView")
        if bv_idx is None:
            continue
        bv = buffer_views[bv_idx]
        offset = bv.get("byteOffset", 0)
        length = bv["byteLength"]
        webp_bytes = orig_bin[offset : offset + length]

        with Image.open(io.BytesIO(webp_bytes)) as pil_img:
            out_buf = io.BytesIO()
            pil_img.save(out_buf, format="PNG", optimize=True)
            png_bytes = out_buf.getvalue()

        new_offset = len(new_bin)
        new_bin.extend(pad4(png_bytes, b"\x00"))

        new_bv_idx = len(buffer_views)
        buffer_views.append(
            {
                "buffer": bv.get("buffer", 0),
                "byteOffset": new_offset,
                "byteLength": len(png_bytes),
            }
        )
        img["bufferView"] = new_bv_idx
        img["mimeType"] = "image/png"

    for tex in textures:
        exts = tex.get("extensions")
        if exts and "EXT_texture_webp" in exts:
            webp_ext = exts.pop("EXT_texture_webp")
            if "source" in webp_ext:
                tex["source"] = webp_ext["source"]
            if not exts:
                tex.pop("extensions", None)

    for key in ("extensionsUsed", "extensionsRequired"):
        if key in gltf:
            gltf[key] = [e for e in gltf[key] if e != "EXT_texture_webp"]
            if not gltf[key]:
                gltf.pop(key, None)

    if gltf.get("buffers"):
        gltf["buffers"][0]["byteLength"] = len(new_bin)

    json_bytes = pad4(json.dumps(gltf, separators=(",", ":")).encode("utf-8"), b" ")
    bin_bytes = pad4(bytes(new_bin), b"\x00")
    total_length = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)

    out = bytearray()
    out.extend(struct.pack("<III", 0x46546C67, 2, total_length))
    out.extend(struct.pack("<II", len(json_bytes), 0x4E4F534A))
    out.extend(json_bytes)
    out.extend(struct.pack("<II", len(bin_bytes), 0x004E4942))
    out.extend(bin_bytes)

    path.write_bytes(bytes(out))
    return True


def main() -> None:
    converted = 0
    total = 0
    for d in TARGET_DIRS:
        if not d.exists():
            continue
        for glb in sorted(d.glob("*.glb")):
            total += 1
            if convert_glb(glb):
                converted += 1
    print(f"Converted {converted}/{total} GLB files from EXT_texture_webp to standard PNG.")


if __name__ == "__main__":
    main()
