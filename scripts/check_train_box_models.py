#!/usr/bin/env python3
"""Assert the render contract on every GLB produced by build_train_box_models.py.

Ships with the generator because two real defects got through review of the
geometry code and only a check like this caught them: the body shell came out
inside-out (invisible under back-face culling) and the side UVs were normalised
over the wrong vertical extent (livery bands landing in the wrong place).

    python check_train_box_models.py assets-src/models/train
    python check_train_box_models.py assets-src/models/train --render /tmp/preview

Exit code 0 if every file passes. Non-zero prints every failure.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image

MAX_TRIANGLES = 1200
MAX_BYTES = 96 * 1024
MAX_ATLAS = 512
FORBIDDEN_EXTENSIONS = True     # no extension at all: no WASM decoder on the client


def read_glb(path: Path):
    d = path.read_bytes()
    magic, ver, length = struct.unpack("<III", d[:12])
    assert magic == 0x46546C67, f"{path.name}: not a GLB"
    assert ver == 2, f"{path.name}: glTF version {ver}"
    assert length == len(d), f"{path.name}: header length {length} != file size {len(d)}"
    off, chunks = 12, {}
    while off < length:
        clen, ctype = struct.unpack("<II", d[off:off + 8])
        chunks[ctype] = (off + 8, clen)
        off += 8 + clen
    js_off, js_len = chunks[0x4E4F534A]
    bin_off, _ = chunks[0x004E4942]
    return d, json.loads(d[js_off:js_off + js_len]), bin_off


def accessor(d, g, bin_off, idx):
    a = g["accessors"][idx]
    v = g["bufferViews"][a["bufferView"]]
    s = bin_off + v["byteOffset"] + a.get("byteOffset", 0)
    dt = {5126: "<f4", 5125: "<u4", 5123: "<u2"}[a["componentType"]]
    n = {"VEC3": 3, "VEC2": 2, "SCALAR": 1}[a["type"]]
    arr = np.frombuffer(d[s:s + a["count"] * n * np.dtype(dt).itemsize], dtype=dt)
    return arr.reshape(a["count"], n) if n > 1 else arr


def check(path: Path, index: dict | None, render_dir: Path | None = None) -> list[str]:
    fails: list[str] = []

    def want(cond, msg):
        if not cond:
            fails.append(f"{path.name}: {msg}")

    d, g, bin_off = read_glb(path)

    if FORBIDDEN_EXTENSIONS:
        want(not g.get("extensionsUsed"), f"declares extensions {g.get('extensionsUsed')}")
        want(not g.get("extensionsRequired"), "declares extensionsRequired")
    want(path.stat().st_size <= MAX_BYTES,
         f"{path.stat().st_size/1024:.1f} KiB exceeds the {MAX_BYTES/1024:.0f} KiB budget")
    want(len(g["meshes"]) == 1 and len(g["meshes"][0]["primitives"]) == 1,
         "must be exactly one mesh with one primitive (one draw call per instance batch)")
    want(len(g["materials"]) == 1, f"{len(g['materials'])} materials, expected 1")
    want(g["materials"][0].get("doubleSided") is False, "doubleSided must be false")
    node = g["nodes"][0]
    want(not any(k in node for k in ("matrix", "translation", "rotation", "scale")),
         "root node carries a transform; the scale contract must be baked into positions")

    prim = g["meshes"][0]["primitives"][0]
    want(prim.get("mode", 4) == 4, "primitive mode must be triangles")
    P = accessor(d, g, bin_off, prim["attributes"]["POSITION"]).astype(float)
    N = accessor(d, g, bin_off, prim["attributes"]["NORMAL"]).astype(float)
    UV = accessor(d, g, bin_off, prim["attributes"]["TEXCOORD_0"]).astype(float)
    I = accessor(d, g, bin_off, prim["indices"]).astype(int).reshape(-1, 3)

    want(len(I) <= MAX_TRIANGLES, f"{len(I)} triangles exceeds the {MAX_TRIANGLES} budget")
    want(np.allclose(np.linalg.norm(N, axis=1), 1.0, atol=1e-3), "normals are not unit length")
    want(UV.min() >= -1e-6 and UV.max() <= 1 + 1e-6, "UVs fall outside [0,1]")

    # origin contract: x_z_centered_y_railhead, long axis +X
    lo, hi = P.min(0), P.max(0)
    want(abs(hi[0] + lo[0]) < 1e-4, f"X not centred (min {lo[0]:.4f}, max {hi[0]:.4f})")
    want(abs(hi[2] + lo[2]) < 1e-4, f"Z not centred (min {lo[2]:.4f}, max {hi[2]:.4f})")
    want(abs(lo[1]) < 1e-4, f"y=0 is not the rail head (min y {lo[1]:.4f})")
    dims = hi - lo
    want(dims[0] > dims[2] and dims[0] > dims[1], "long axis is not +X")
    want(dims[1] > dims[2], "car should be taller than it is wide")

    # outward winding: for a convex body, every face normal must point away from centre
    ctr = (hi + lo) / 2
    v0, v1, v2 = P[I[:, 0]], P[I[:, 1]], P[I[:, 2]]
    fn = np.cross(v1 - v0, v2 - v0)
    ln = np.linalg.norm(fn, axis=1)
    ok = ln > 1e-12
    want(ok.all(), f"{(~ok).sum()} degenerate triangles")
    fn = fn[ok] / ln[ok, None]
    cen = ((v0 + v1 + v2) / 3)[ok]
    inward = (fn * (cen - ctr)).sum(1) < -1e-6
    want(not inward.any(),
         f"{inward.sum()} triangles wound inward; back-face culling would hollow the body")
    want(np.allclose(np.abs(fn - N[I[ok][:, 0]]).sum(1), 0, atol=0.35),
         "shading normals disagree with winding")

    # atlas
    img = g["images"][0]
    want("bufferView" in img, "texture must be embedded, not a URI")
    bv = g["bufferViews"][img["bufferView"]]
    png = d[bin_off + bv["byteOffset"]: bin_off + bv["byteOffset"] + bv["byteLength"]]
    tex = Image.open(io.BytesIO(png))
    want(tex.size == (MAX_ATLAS, MAX_ATLAS), f"atlas is {tex.size}, expected {MAX_ATLAS}²")

    # the roof must actually carry the line colour: sample the up-facing faces and
    # require them to differ from the neutral variant's roof
    up = fn[:, 1] > 0.7
    if up.any() and index is not None:
        entry = next((a for a in index["assets"] if a["file"] == path.name), None)
        if entry and entry.get("line"):
            uvm = UV[I[ok][up]].mean(1)
            arr = np.asarray(tex.convert("RGB"))
            px = arr[(uvm[:, 1] * (arr.shape[0] - 1)).astype(int),
                     (uvm[:, 0] * (arr.shape[1] - 1)).astype(int)].astype(float)
            sat = (px.max(1) - px.min(1)).mean()
            want(sat > 12, f"roof of line {entry['line']} is not tinted (mean chroma {sat:.1f})")

    if render_dir is not None:
        preview(P, N, UV, tex, I, render_dir / f"{path.stem}.png")

    if index is not None:
        entry = next((a for a in index["assets"] if a["file"] == path.name), None)
        want(entry is not None, "not listed in generated-index.json")
        if entry:
            dd = entry["dimensions_m"]
            for axis, key in ((0, "length_x"), (1, "height_y"), (2, "width_z")):
                want(abs(dims[axis] - dd[key]) < 0.02,
                     f"{key} is {dims[axis]:.3f} m in geometry, {dd[key]} m in the index")
            want(entry["triangles"] == len(I), "triangle count disagrees with the index")
            want(entry["vertices"] == len(P), "vertex count disagrees with the index")
            want(entry["bytes"] == path.stat().st_size, "byte size disagrees with the index")
            want(entry.get("sha256") == hashlib.sha256(d).hexdigest(), "sha256 disagrees with the index")
            want(
                entry.get("height_measured") or not entry.get("grazing_camera_approved"),
                "an unmeasured height cannot be approved for grazing-camera use",
            )
    return fails


def preview(P, N, UV, tex, I, out: Path, elev=20.0, azim=40.0, size=560) -> None:
    """Rasterize a lit oblique preview to validate winding and atlas placement."""
    positions = np.stack([P[:, 0], -P[:, 2], P[:, 1]], 1)
    normals = np.stack([N[:, 0], -N[:, 2], N[:, 1]], 1)
    elevation, azimuth = np.radians(elev), np.radians(azim)
    forward = np.array([np.cos(elevation) * np.cos(azimuth), np.cos(elevation) * np.sin(azimuth), np.sin(elevation)])
    up = np.array([0.0, 0.0, 1.0]); up -= forward * (up @ forward); up /= np.linalg.norm(up)
    right = np.cross(up, forward)
    xs, ys, zs = positions @ right, -(positions @ up), positions @ forward
    scale = size / (max(xs.max() - xs.min(), ys.max() - ys.min()) * 1.12)
    pixels_x = (xs - (xs.max() + xs.min()) / 2) * scale + size / 2
    pixels_y = (ys - (ys.max() + ys.min()) / 2) * scale + size / 2
    lighting = np.clip(normals @ forward, 0, 1) * 0.45 + np.clip(normals @ np.array([0.25, 0.35, 0.9]), 0, 1) * 0.3 + 0.38
    atlas = np.asarray(tex.convert("RGB")).astype(float) / 255.0
    image = np.zeros((size, size, 3)); depth = np.full((size, size), -1e9)
    x, y, z, triangle_uv, triangle_lighting = pixels_x[I], pixels_y[I], zs[I], UV[I], lighting[I]
    areas = (x[:, 1] - x[:, 0]) * (y[:, 2] - y[:, 0]) - (x[:, 2] - x[:, 0]) * (y[:, 1] - y[:, 0])
    for triangle in np.argsort(z.mean(1)):
        if abs(areas[triangle]) < 1e-9: continue
        left, right_edge = max(int(np.floor(x[triangle].min())), 0), min(int(np.ceil(x[triangle].max())), size - 1)
        top, bottom = max(int(np.floor(y[triangle].min())), 0), min(int(np.ceil(y[triangle].max())), size - 1)
        if right_edge < left or bottom < top: continue
        grid_x, grid_y = np.meshgrid(np.arange(left, right_edge + 1) + .5, np.arange(top, bottom + 1) + .5)
        X, Y, area = x[triangle], y[triangle], areas[triangle]
        w0 = ((X[1] - grid_x) * (Y[2] - grid_y) - (X[2] - grid_x) * (Y[1] - grid_y)) / area
        w1 = ((X[2] - grid_x) * (Y[0] - grid_y) - (X[0] - grid_x) * (Y[2] - grid_y)) / area
        w2 = 1 - w0 - w1; covered = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
        if not covered.any(): continue
        pixel_depth = (w0 * z[triangle, 0] + w1 * z[triangle, 1] + w2 * z[triangle, 2])[covered]
        rows, columns = grid_y[covered].astype(int), grid_x[covered].astype(int); visible = pixel_depth > depth[rows, columns]
        if not visible.any(): continue
        uv = w0[covered, None] * triangle_uv[triangle, 0] + w1[covered, None] * triangle_uv[triangle, 1] + w2[covered, None] * triangle_uv[triangle, 2]
        light = w0[covered] * triangle_lighting[triangle, 0] + w1[covered] * triangle_lighting[triangle, 1] + w2[covered] * triangle_lighting[triangle, 2]
        texture_x = np.clip(uv[:, 0] * (atlas.shape[1] - 1), 0, atlas.shape[1] - 1).astype(int); texture_y = np.clip(uv[:, 1] * (atlas.shape[0] - 1), 0, atlas.shape[0] - 1).astype(int)
        depth[rows[visible], columns[visible]] = pixel_depth[visible]; image[rows[visible], columns[visible]] = np.clip(atlas[texture_y[visible], texture_x[visible]] * light[visible, None], 0, 1)
    out.parent.mkdir(parents=True, exist_ok=True); Image.fromarray((image * 255).astype(np.uint8)).save(out)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("directory", type=Path)
    ap.add_argument("--render", type=Path, default=None,
                    help="also write a preview PNG per file (slow, for eyeballing)")
    ap.add_argument("--allow-missing-index", action="store_true")
    a = ap.parse_args(argv)

    idx_path = a.directory / "generated-index.json"
    if not idx_path.exists() and not a.allow_missing_index:
        print(f"error: {idx_path} is missing", file=sys.stderr)
        return 2
    index = json.loads(idx_path.read_text()) if idx_path.exists() else None

    files = sorted(a.directory.glob("*.glb"))
    if not files:
        print(f"error: no .glb in {a.directory}", file=sys.stderr)
        return 2

    all_fails, passed = [], 0
    for f in files:
        try:
            fails = check(f, index, a.render)
        except Exception as exc:
            fails = [f"{f.name}: unreadable ({type(exc).__name__}: {exc})"]
        passed += not fails
        print(f"{'FAIL' if fails else 'ok  '}  {f.name}")
        all_fails += fails

    for m in all_fails:
        print(f"  - {m}", file=sys.stderr)
    print(f"\n{passed}/{len(files)} files pass")
    return 1 if all_fails else 0


if __name__ == "__main__":
    raise SystemExit(main())
