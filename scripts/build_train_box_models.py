#!/usr/bin/env python3
"""Generate low-poly, clean-room train body GLBs from repository data.

One car per file. Geometry is a chamfered box with a crowned roof, ~80 triangles,
long axis +X, origin x/z centred with y = 0 at rail head. A single embedded 512x512
albedo atlas carries an authored livery: no logo, no lettering, no pictograms, no
pixel traced from any generative or photographic source. The roof band is tinted
per line so the line identity the capsule carried survives the LOD switch.

No glTF extension, no Draco, no meshopt, no KTX2, therefore no WASM decoder and no
loaders.gl texture plugin on the client.

Design note on per-line variants: deck.gl's ScenegraphLayer binds textures from the
glTF and cannot repaint a texture region at runtime without splitting the mesh into
two materials. Splitting costs a second draw call per instance batch and a second
material to keep in sync, so this generator bakes one file per (family, line)
instead. Each file is a few tens of kilobytes and geometry is byte-identical
across variants.

Usage:
    python build_train_box_models.py \
        --rolling-stock data/rolling-stock.json \
        --lines data/lines.json \
        --out assets-src/models/train

    # emit the served copies as a build step
    python build_train_box_models.py ... --serve-dir web/public/models/train

Refuses to guess: unknown drive_type values, missing fields and unmapped lines are
hard errors listing what was found.
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
from PIL import Image, ImageDraw

# --------------------------------------------------------------------------------------
# constants that are contract, not taste

ATLAS = 512                 # px, square
DEFAULT_HEIGHT_RATIO = 3.48 / 2.45   # derived from pneumatic_generic reference dims
ORIGIN_CONTRACT = "x_z_centered_y_railhead"
LONG_AXIS = "+X"

# atlas regions, in pixels: (x0, y0, x1, y1)
R_ROOF = (0, 0, 512, 160)
R_SIDE = (0, 160, 512, 320)
R_END = (0, 320, 160, 448)
R_UNDER = (160, 320, 512, 384)

# authored livery geometry, in metres or fractions of body height
DOOR_WIDTH_M = 1.30
WINDOW_BAND = (0.42, 0.74)   # fraction of body height, bottom..top
SKIRT_TOP = 0.14             # fraction of body height
ROOF_STRIP_FRAC = 0.38       # grey equipment strip, fraction of body width
BODY_COLOR = (232, 234, 236)
LIVERY_BLUE = (0, 114, 188)
GLASS_COLOR = (26, 30, 34)
DOOR_COLOR = (200, 204, 208)
ROOF_COLOR = (150, 156, 162)
EQUIP_COLOR = (96, 101, 106)
UNDER_COLOR = (22, 24, 27)
END_COLOR = (44, 48, 52)

# drive_type alone selects the body family. Driverless remains metadata and never
# changes the physical steel-versus-pneumatic body choice.
DRIVE_TYPE_TO_FAMILY = {
    "steel": "steel_classic",
    "fer": "steel_classic",
    "iron": "steel_classic",
    "tire": "pneumatic_generic",
    "pneumatic": "pneumatic_generic",
    "pneu": "pneumatic_generic",
    "rubber": "pneumatic_generic",
    "rubber_tyre": "pneumatic_generic",
}


class DataError(RuntimeError):
    pass


# --------------------------------------------------------------------------------------
# repository data


def _get(d: dict, keys: list[str], where: str):
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    raise DataError(f"{where}: none of {keys} present. Keys found: {sorted(d)}")


def derive_family(model_id: str, model: dict) -> str:
    raw = _get(model, ["drive_type"], f"models.{model_id}")
    key = str(raw).strip().lower().replace("-", "_").replace(" ", "_")
    if key not in DRIVE_TYPE_TO_FAMILY:
        raise DataError(
            f"models.{model_id}.drive_type = {raw!r} is not mapped to an asset family. "
            f"Known values: {sorted(set(DRIVE_TYPE_TO_FAMILY))}. "
            "Add it to DRIVE_TYPE_TO_FAMILY rather than letting it fall through."
        )
    return DRIVE_TYPE_TO_FAMILY[key]


def load_models(path: Path, height_ratio: float) -> dict[str, dict]:
    doc = json.loads(path.read_text(encoding="utf-8"))
    models = _get(doc, ["models"], path.name)
    lines = _get(doc, ["lines"], path.name)

    out = {}
    for model_id, m in models.items():
        length = float(_get(m, ["car_length_m"], f"models.{model_id}"))
        width = float(_get(m, ["width_m"], f"models.{model_id}"))
        if "height_m" in m and m["height_m"]:
            height = float(m["height_m"])
            height_source = "declared"
            measured = True
        else:
            height = round(width * height_ratio, 3)
            height_source = "derived_from_pneumatic_generic_reference"
            measured = False
        if not (5.0 < length < 30.0 and 1.5 < width < 4.0 and 2.0 < height < 5.0):
            raise DataError(
                f"models.{model_id}: implausible dimensions "
                f"{length} x {width} x {height} m. Refusing to generate."
            )
        out[model_id] = {
            "model_id": model_id,
            "family": derive_family(model_id, m),
            "length_m": length,
            "width_m": width,
            "height_m": height,
            "height_source": height_source,
            "height_measured": measured,
            "cars_count": m.get("cars_count"),
            "driverless": bool(m.get("driverless", False)),
        }

    # line -> model_id, accepting either a bare string or an object
    line_model = {}
    for short_name, entry in lines.items():
        mid = entry if isinstance(entry, str) else _get(entry, ["model_id"], f"lines.{short_name}")
        if mid not in out:
            raise DataError(
                f"lines.{short_name}.model_id = {mid!r} is not present in models. "
                f"Known models: {sorted(out)}"
            )
        line_model[str(short_name)] = mid
    return out, line_model


def load_line_colors(path: Path) -> dict[str, tuple[int, int, int]]:
    doc = json.loads(path.read_text(encoding="utf-8"))
    entries = doc["lines"] if isinstance(doc, dict) and "lines" in doc else doc
    if isinstance(entries, dict):
        entries = [dict(v, short_name=v.get("short_name", k)) for k, v in entries.items()]

    colors = {}
    for e in entries:
        sn = str(_get(e, ["short_name"], "lines.json entry"))
        if e.get("mode") != "metro":
            continue
        colors[sn] = hex_to_rgb(_get(e, ["color"], f"lines.json[{sn}]"))
    return colors


def partition_line_models(line_model: dict[str, str], path: Path) -> tuple[dict[str, str], int]:
    doc = json.loads(path.read_text(encoding="utf-8"))
    entries = doc["lines"] if isinstance(doc, dict) and "lines" in doc else doc
    modes = {str(entry["short_name"]): entry.get("mode") for entry in entries}
    missing = sorted(set(line_model) - set(modes))
    unknown = sorted((line, mode) for line, mode in modes.items() if line in line_model and mode not in {"metro", "rer", "rail"})
    if missing or unknown:
        raise DataError(f"Line-mode partition failed; missing={missing}, unknown={unknown}")
    metro = {line: model_id for line, model_id in line_model.items() if modes[line] == "metro"}
    return metro, len(line_model) - len(metro)


def hex_to_rgb(v) -> tuple[int, int, int]:
    if isinstance(v, (list, tuple)) and len(v) >= 3:
        return tuple(int(c) for c in v[:3])
    s = str(v).strip().lstrip("#")
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    if len(s) != 6:
        raise DataError(f"colour {v!r} is not a 6-digit hex value or an RGB triple")
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


# --------------------------------------------------------------------------------------
# geometry


def build_geometry(length: float, width: float, height: float):
    """Chamfered box, crowned roof, tapered ends. Returns (P, N, UV, I, stats)."""
    L, W2 = length, width / 2.0
    # y = 0 is the rail head; `height` is rail head to the top of the crowned roof
    y_uf, y_b = 0.0, 1.05                        # underframe bottom, body floor
    if height <= y_b + 1.5:
        raise DataError(f"height {height} m leaves no body above a {y_b} m floor line")
    crown = 0.055 * (height - y_b)
    y_r = height - crown                         # roof shoulder line
    c = min(0.18, 0.35 * W2)                     # lower chamfer
    c2 = min(0.22, 0.30 * (y_r - y_b))           # shoulder height
    c3 = min(0.20, 0.30 * W2)                    # shoulder inset
    taper = 0.55                                 # end taper length along X
    taper_z = 0.82                               # end section width factor

    profile = np.array([
        (-W2, y_b + c), (-W2 + c, y_b), (W2 - c, y_b), (W2, y_b + c),
        (W2, y_r - c2), (W2 - c3, y_r), (0.0, y_r + crown), (-W2 + c3, y_r), (-W2, y_r - c2),
    ])
    stations = [(-L / 2, taper_z), (-L / 2 + taper, 1.0), (L / 2 - taper, 1.0), (L / 2, taper_z)]

    rings = []
    for x, sz in stations:
        ring = np.stack([
            np.full(len(profile), x),
            y_b + (profile[:, 1] - y_b) * (1.0 if sz == 1.0 else 0.97),
            profile[:, 0] * sz,
        ], axis=1)
        rings.append(ring)

    faces: list[tuple[np.ndarray, str]] = []
    n = len(profile)
    for k in range(len(rings) - 1):
        a, b = rings[k], rings[k + 1]
        for i in range(n):
            j = (i + 1) % n
            faces.append((np.array([a[i], a[j], b[j], b[i]]), "auto"))
    # end caps, fanned from the profile centroid
    for ring, flip in ((rings[0], True), (rings[-1], False)):
        ctr = ring.mean(axis=0)
        for i in range(n):
            j = (i + 1) % n
            tri = np.array([ctr, ring[j], ring[i]]) if flip else np.array([ctr, ring[i], ring[j]])
            faces.append((tri, "end"))
    # underframe: plain inset box, one dark quad set, no bogies
    uw, ul = W2 * 0.80, L / 2 - 0.35
    box = [
        [(-ul, y_uf, -uw), (ul, y_uf, -uw), (ul, y_b, -uw), (-ul, y_b, -uw)],
        [(ul, y_uf, uw), (-ul, y_uf, uw), (-ul, y_b, uw), (ul, y_b, uw)],
        [(-ul, y_uf, -uw), (ul, y_uf, -uw), (ul, y_uf, uw), (-ul, y_uf, uw)],
        [(-ul, y_uf, -uw), (-ul, y_b, -uw), (-ul, y_b, uw), (-ul, y_uf, uw)],
        [(ul, y_uf, uw), (ul, y_b, uw), (ul, y_b, -uw), (ul, y_uf, -uw)],
    ]
    for q in box:
        faces.append((np.array(q, dtype=float), "under"))

    # every surface of the body and of the underframe box is on a convex hull, so
    # windings can be oriented outward mechanically instead of by hand. Without this
    # the shell comes out inside-out, which back-face culling turns into a hollow car.
    center = np.array([0.0, (y_uf + y_r + crown) / 2.0, 0.0])

    P, N, UV, I = [], [], [], []
    flipped = 0
    for verts, tag in faces:
        nrm = np.cross(verts[1] - verts[0], verts[2] - verts[0])
        ln = np.linalg.norm(nrm)
        if ln < 1e-12:
            continue
        nrm = nrm / ln
        if nrm @ (verts.mean(axis=0) - center) < 0:
            verts = verts[::-1]
            nrm = -nrm
            flipped += 1
        region = tag if tag != "auto" else classify(nrm)
        uvs = np.array([uv_for(v, region, L, W2, y_b, y_r + crown) for v in verts])
        base = len(P)
        P.extend(verts)
        N.extend([nrm] * len(verts))
        UV.extend(uvs)
        for t in range(1, len(verts) - 1):
            I.extend([base, base + t, base + t + 1])

    P = np.array(P, dtype=np.float32)
    N = np.array(N, dtype=np.float32)
    UV = np.array(UV, dtype=np.float32)
    I = np.array(I, dtype=np.uint16)
    # contract: x/z centred, y = 0 at rail head, long axis +X
    P[:, 0] -= (P[:, 0].max() + P[:, 0].min()) / 2
    P[:, 2] -= (P[:, 2].max() + P[:, 2].min()) / 2
    P[:, 1] -= P[:, 1].min()
    if flipped:
        print(f"  oriented {flipped} faces outward", file=sys.stderr)
    return P, N, UV, I


def classify(nrm) -> str:
    if abs(nrm[2]) > 0.5:
        return "side"
    if nrm[1] > 0.5:
        return "roof"
    if nrm[1] < -0.5:
        return "under"
    return "end"


def region_uv(region: str, u: float, v: float) -> tuple[float, float]:
    x0, y0, x1, y1 = {"roof": R_ROOF, "side": R_SIDE, "end": R_END, "under": R_UNDER}[region]
    pad = 1.5
    return (
        (x0 + pad + u * (x1 - x0 - 2 * pad)) / ATLAS,
        (y0 + pad + v * (y1 - y0 - 2 * pad)) / ATLAS,
    )


def uv_for(p, region: str, L: float, W2: float, y_b: float, y_top: float):
    x, y, z = p
    if region == "side":
        u = (x + L / 2) / L
        v = (y_top - y) / (y_top - y_b)
        if z < 0:
            u = 1.0 - u
    elif region == "roof":
        u = (x + L / 2) / L
        v = (z + W2) / (2 * W2)
    elif region == "end":
        u = (z + W2) / (2 * W2)
        v = (y_top - y) / (y_top - y_b)
    else:
        u, v = 0.5, 0.5
    return region_uv(region, float(np.clip(u, 0, 1)), float(np.clip(v, 0, 1)))


# --------------------------------------------------------------------------------------
# atlas


def paint_atlas(length: float, height: float, doors_per_side: int,
                line_color: tuple[int, int, int] | None, livery: str) -> bytes:
    band = (line_color or ROOF_COLOR) if livery == "line_coded" else LIVERY_BLUE
    im = Image.new("RGB", (ATLAS, ATLAS), UNDER_COLOR)
    d = ImageDraw.Draw(im)

    # ---- side: body, skirt, window band, doors, shoulder stripe
    x0, y0, x1, y1 = R_SIDE
    h = y1 - y0
    d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=BODY_COLOR)
    d.rectangle([x0, y1 - int(h * SKIRT_TOP), x1 - 1, y1 - 1], fill=(58, 62, 66))
    wb0 = y1 - int(h * WINDOW_BAND[1])
    wb1 = y1 - int(h * WINDOW_BAND[0])
    d.rectangle([x0, wb0, x1 - 1, wb1], fill=GLASS_COLOR)
    d.rectangle([x0, y0, x1 - 1, y0 + max(4, int(h * 0.19))], fill=band)
    dw = max(6, int((x1 - x0) * DOOR_WIDTH_M / length))
    for i in range(doors_per_side):
        cx = x0 + int((x1 - x0) * (i + 0.5) / doors_per_side)
        d.rectangle([cx - dw // 2, y0 + int(h * 0.10), cx + dw // 2, y1 - int(h * SKIRT_TOP) - 1],
                    fill=DOOR_COLOR)
        d.rectangle([cx - dw // 2 + 2, wb0, cx + dw // 2 - 2, wb1], fill=GLASS_COLOR)
        d.line([cx, y0 + int(h * 0.10), cx, y1 - int(h * SKIRT_TOP) - 1], fill=(120, 126, 132))

    # ---- roof
    x0, y0, x1, y1 = R_ROOF
    hh = y1 - y0
    d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=band if livery == "line_coded" else ROOF_COLOR)
    if livery == "line_coded":
        s0 = y0 + int(hh * (0.5 - ROOF_STRIP_FRAC / 2))
        s1 = y0 + int(hh * (0.5 + ROOF_STRIP_FRAC / 2))
    else:
        edge = max(4, int(hh * 0.16))
        d.rectangle([x0, y0, x1 - 1, y0 + edge], fill=LIVERY_BLUE)
        d.rectangle([x0, y1 - 1 - edge, x1 - 1, y1 - 1], fill=LIVERY_BLUE)
        s0, s1 = y0 + int(hh * 0.28), y1 - int(hh * 0.28)
    d.rectangle([x0, s0, x1 - 1, s1], fill=ROOF_COLOR)
    for i in range(4):
        cx = x0 + int((x1 - x0) * (i + 0.5) / 4)
        w = int((x1 - x0) * 0.06)
        d.rectangle([cx - w, s0 + 3, cx + w, s1 - 3], fill=EQUIP_COLOR)
    d.line([x0, y0, x1 - 1, y0], fill=(30, 32, 36))
    d.line([x0, y1 - 1, x1 - 1, y1 - 1], fill=(30, 32, 36))

    # ---- end: dark panel, glazing, band at the top
    x0, y0, x1, y1 = R_END
    d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=END_COLOR)
    d.rectangle([x0 + 8, y0 + int((y1 - y0) * 0.20), x1 - 9, y0 + int((y1 - y0) * 0.52)],
                fill=GLASS_COLOR)
    d.rectangle([x0, y0, x1 - 1, y0 + 4], fill=band)

    # ---- underframe
    x0, y0, x1, y1 = R_UNDER
    d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=UNDER_COLOR)

    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


# --------------------------------------------------------------------------------------
# glTF writer


def write_glb(path: Path, P, N, UV, I, png: bytes, name: str) -> None:
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

    v_pos = add(P.astype("<f4").tobytes(), target=34962)
    v_nrm = add(N.astype("<f4").tobytes(), target=34962)
    v_uv = add(UV.astype("<f4").tobytes(), target=34962)
    v_idx = add(I.astype("<u2").tobytes(), target=34963)
    v_img = add(png)

    gltf = {
        "asset": {"version": "2.0", "generator": "build_train_box_models.py"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": name}],
        "meshes": [{"name": name, "primitives": [{
            "attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2},
            "indices": 3, "material": 0, "mode": 4}]}],
        "accessors": [
            {"bufferView": v_pos, "componentType": 5126, "count": len(P), "type": "VEC3",
             "min": [float(x) for x in P.min(0)], "max": [float(x) for x in P.max(0)]},
            {"bufferView": v_nrm, "componentType": 5126, "count": len(N), "type": "VEC3"},
            {"bufferView": v_uv, "componentType": 5126, "count": len(UV), "type": "VEC2"},
            {"bufferView": v_idx, "componentType": 5123, "count": len(I), "type": "SCALAR"},
        ],
        "materials": [{
            "name": "body",
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": 0},
                "metallicFactor": 0.0,
                "roughnessFactor": 0.65,
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
    with path.open("wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack("<II", len(bin_), 0x004E4942)); f.write(bin_)


# --------------------------------------------------------------------------------------


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--rolling-stock", type=Path, required=True)
    ap.add_argument("--lines", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True, help="source-of-truth output directory")
    ap.add_argument("--serve-dir", type=Path, default=None, help="optional served copy")
    ap.add_argument("--doors-per-side", type=int, default=4)
    ap.add_argument("--livery", choices=("realistic", "line_coded"), default="realistic")
    ap.add_argument("--allow-line-colors", action="store_true",
                    help="Required to bake GTFS route colours into model textures.")
    ap.add_argument("--height-ratio", type=float, default=DEFAULT_HEIGHT_RATIO)
    ap.add_argument("--only-family", action="append", default=None)
    ap.add_argument("--neutral-only", action="store_true",
                    help="skip per-line variants, emit the grey-band body only")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)

    try:
        models, line_model = load_models(a.rolling_stock, a.height_ratio)
        if a.livery == "realistic" and not a.neutral_only:
            print("realistic livery is identical on every line: emitting one file per family", file=sys.stderr)
            a.neutral_only = True
        if not a.neutral_only and not a.allow_line_colors:
            print("refusing unapproved GTFS route colours: emitting neutral bodies only", file=sys.stderr)
            a.neutral_only = True
        metro_colors = load_line_colors(a.lines)
        metro_line_model, rer_count = partition_line_models(line_model, a.lines)
        print(f"line partition: {len(metro_line_model)} metro retained, {rer_count} RER excluded", file=sys.stderr)
        colors = {} if a.neutral_only else metro_colors
        if not metro_line_model:
            raise DataError("No metro rolling-stock lines have an authoritative line colour")
        families: dict[str, dict] = {}
        for model_id in sorted(set(metro_line_model.values())):
            m = models[model_id]
            fam = m["family"]
            prev = families.get(fam)
            if prev and (prev["length_m"], prev["width_m"], prev["height_m"]) != \
                        (m["length_m"], m["width_m"], m["height_m"]):
                print(f"note: family {fam} spans differing dimensions "
                      f"({prev['model_id']} vs {m['model_id']}); using the larger car",
                      file=sys.stderr)
                if m["length_m"] < prev["length_m"]:
                    continue
            families[fam] = m
        combos: dict[str, set[str]] = {}
        for line, mid in metro_line_model.items():
            combos.setdefault(models[mid]["family"], set()).add(line)
    except (DataError, KeyError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    if a.only_family:
        families = {k: v for k, v in families.items() if k in set(a.only_family)}

    a.out.mkdir(parents=True, exist_ok=True)
    previous_index = a.out / "generated-index.json"
    if previous_index.exists() and not a.dry_run:
        for entry in json.loads(previous_index.read_text(encoding="utf-8")).get("assets", []):
            stale = a.out / entry.get("file", "")
            if stale.suffix == ".glb" and stale.is_file():
                stale.unlink()
        for family in {*DRIVE_TYPE_TO_FAMILY.values(), "automatic_recent"}:
            for stale in a.out.glob(f"{family}__*.glb"):
                stale.unlink()
    if a.serve_dir:
        a.serve_dir.mkdir(parents=True, exist_ok=True)

    index = {"generator": "build_train_box_models.py", "origin": ORIGIN_CONTRACT,
             "long_axis": LONG_AXIS, "atlas_px": ATLAS, "livery": "clean_room_authored",
             "line_colors_baked": bool(a.allow_line_colors and not a.neutral_only),
             "assets": []}

    for fam, m in sorted(families.items()):
        P, N, UV, I = build_geometry(m["length_m"], m["width_m"], m["height_m"])
        tris = len(I) // 3
        variants = [(None, "neutral")] + (
            [] if a.neutral_only else [(colors[l], l) for l in sorted(combos.get(fam, ()))])
        for color, label in variants:
            png = paint_atlas(m["length_m"], m["height_m"], a.doors_per_side, color, a.livery)
            name = f"{fam}__{label}"
            dest = a.out / f"{name}.glb"
            if not a.dry_run:
                write_glb(dest, P, N, UV, I, png, name)
                if a.serve_dir:
                    (a.serve_dir / dest.name).write_bytes(dest.read_bytes())
            size = dest.stat().st_size if dest.exists() else 0
            index["assets"].append({
                "file": dest.name, "family": fam, "line": None if label == "neutral" else label,
                "model_id": m["model_id"], "triangles": tris, "vertices": len(P),
                "bytes": size,
                "dimensions_m": {"length_x": m["length_m"], "width_z": m["width_m"],
                                 "height_y": m["height_m"]},
                "height_source": m["height_source"], "height_measured": m["height_measured"],
                "grazing_camera_approved": m["height_measured"],
                "sha256": hashlib.sha256(dest.read_bytes()).hexdigest() if dest.exists() else None,
            })
            print(f"{dest.name:38s} {tris:4d} tris  {len(P):4d} verts  {size/1024:6.1f} KiB")

    if not a.dry_run:
        (a.out / "generated-index.json").write_text(json.dumps(index, indent=2), encoding="utf-8")
    print(f"\n{len(index['assets'])} files -> {a.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
