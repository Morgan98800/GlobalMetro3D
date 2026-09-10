/**
 * shapes_loader.ts — chargement unique et décodage des tracés.
 *
 * Corrige deux défauts mesurés :
 *  1. shapes.bin était téléchargé DEUX FOIS en parallèle (main.ts pour deck.gl,
 *     browser_engine.ts pour le moteur) : 1,75 Mo gaspillés, 4,5 s de 4G.
 *     → le fetch est mémoïsé au niveau du module, tous les appelants partagent
 *       la même promesse.
 *  2. Le format v1 stockait [lng, lat, dist] en Float32, soit 12 octets par point,
 *     sans compression : 1,67 Mo, 8 980 ms sur Fast 4G.
 *     → le format v2 stocke des deltas Int16 en 1e-7 degré (4 octets par point) et
 *       ne stocke plus la distance, qui se déduit du pas de rééchantillonnage.
 */

export interface Shape {
  id: string;
  /** [lng, lat, lng, lat, ...] en degrés */
  coords: Float64Array;
  /** distance cumulée en mètres, une entrée par point */
  dist: Float32Array;
  length: number;
  totalLengthM?: number;
  ptCount?: number;
}

export type ShapeIndex = Map<string, Shape>;

const SCALE = 1e-7;
const MAGIC_V2 = 0x53485032; // 'SHP2'

let pending: Promise<ShapeIndex> | null = null;

/**
 * Charge et décode les tracés. Appelable depuis n'importe quel module :
 * le téléchargement n'a lieu qu'une fois.
 */
export function loadShapes(url = '/data/shapes.bin'): Promise<ShapeIndex> {
  if (!pending) {
    pending = fetch(url, { cache: 'force-cache' })
      .then((res) => {
        if (!res.ok) throw new Error(`shapes: HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then(decodeShapes)
      .catch((err) => {
        pending = null; // permet un nouvel essai après échec réseau
        throw err;
      });
  }
  return pending;
}

/** À n'utiliser qu'en test, pour repartir d'un état propre. */
export function resetShapesCache(): void {
  pending = null;
}

export function decodeShapes(buffer: ArrayBuffer): ShapeIndex {
  const view = new DataView(buffer);
  return view.getUint32(0, false) === MAGIC_V2
    ? decodeV2(buffer)
    : decodeV1(buffer);
}

/* -------------------------------------------------------------------------
   Format v2 — quantifié
   -------------------------------------------------------------------------
   header  : magic uint32 BE 'SHP2' | version uint16 | shapeCount uint16
   par tracé (aligné 4 octets) :
     idLen uint16 | idBytes utf8 | pointCount uint32
     step float32            pas de rééchantillonnage en mètres
     tailLength float32      longueur du dernier segment, souvent < step
     lng0 int32 | lat0 int32 origine en 1e-7 degré
     (pointCount - 1) paires de deltas int16, en 1e-7 degré
   ------------------------------------------------------------------------- */
function decodeV2(buffer: ArrayBuffer): ShapeIndex {
  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  const shapes: ShapeIndex = new Map();

  const shapeCount = view.getUint16(6, true);
  let off = 8;

  for (let s = 0; s < shapeCount; s++) {
    const idLen = view.getUint16(off, true);
    off += 2;
    const id = decoder.decode(new Uint8Array(buffer, off, idLen));
    off += idLen;
    off += (4 - (off % 4)) % 4; // réalignement

    const pointCount = view.getUint32(off, true);
    off += 4;
    const step = view.getFloat32(off, true);
    off += 4;
    const tailLength = view.getFloat32(off, true);
    off += 4;

    let lngQ = view.getInt32(off, true);
    off += 4;
    let latQ = view.getInt32(off, true);
    off += 4;

    const coords = new Float64Array(pointCount * 2);
    const dist = new Float32Array(pointCount);

    coords[0] = lngQ * SCALE;
    coords[1] = latQ * SCALE;
    dist[0] = 0;

    for (let i = 1; i < pointCount; i++) {
      lngQ += view.getInt16(off, true);
      off += 2;
      latQ += view.getInt16(off, true);
      off += 2;
      coords[i * 2] = lngQ * SCALE;
      coords[i * 2 + 1] = latQ * SCALE;
      dist[i] = i === pointCount - 1 ? (i - 1) * step + tailLength : i * step;
    }

    shapes.set(id, {
      id,
      coords,
      dist,
      length: dist[pointCount - 1],
      totalLengthM: dist[pointCount - 1],
      ptCount: pointCount
    });
  }

  return shapes;
}

/* -------------------------------------------------------------------------
   Format v1 — triplets Float32 [lng, lat, dist], conservé en repli.
   Adapter la lecture d'en-tête si celle du projet diffère.
   ------------------------------------------------------------------------- */
function decodeV1(buffer: ArrayBuffer): ShapeIndex {
  const view = new DataView(buffer);
  const decoder = new TextDecoder('utf-8');
  const shapes: ShapeIndex = new Map();

  const magic = decoder.decode(new Uint8Array(buffer, 0, 4));
  if (magic === 'MSHP') {
    const shapeCount = view.getUint16(6, true);
    const tableOffset = 32;
    const entrySize = 64;
    const dataStart = tableOffset + shapeCount * entrySize;

    for (let i = 0; i < shapeCount; i++) {
      const entryStart = tableOffset + i * entrySize;
      const sidBytes = new Uint8Array(buffer, entryStart, 32);
      let sidLen = 0;
      while (sidLen < 32 && sidBytes[sidLen] !== 0) sidLen++;
      const id = decoder.decode(sidBytes.subarray(0, sidLen));

      const ptCount = view.getUint32(entryStart + 52, true);
      const byteOffset = view.getUint32(entryStart + 60, true);
      const raw = new Float32Array(buffer, dataStart + byteOffset, ptCount * 3);

      const coords = new Float64Array(ptCount * 2);
      const dist = new Float32Array(ptCount);
      for (let j = 0; j < ptCount; j++) {
        coords[j * 2] = raw[j * 3];
        coords[j * 2 + 1] = raw[j * 3 + 1];
        dist[j] = raw[j * 3 + 2];
      }

      shapes.set(id, {
        id,
        coords,
        dist,
        length: dist[ptCount - 1] || 0,
        totalLengthM: dist[ptCount - 1] || 0,
        ptCount
      });
    }
    return shapes;
  }

  // Generic fallback TOC
  const shapeCount = view.getUint32(0, true);
  let off = 4;
  const toc: { id: string; offset: number; count: number }[] = [];
  for (let s = 0; s < shapeCount; s++) {
    const idLen = view.getUint16(off, true);
    off += 2;
    const id = decoder.decode(new Uint8Array(buffer, off, idLen));
    off += idLen;
    const offset = view.getUint32(off, true);
    off += 4;
    const count = view.getUint32(off, true);
    off += 4;
    toc.push({ id, offset, count });
  }

  for (const entry of toc) {
    const raw = new Float32Array(buffer, entry.offset, entry.count * 3);
    const coords = new Float64Array(entry.count * 2);
    const dist = new Float32Array(entry.count);
    for (let i = 0; i < entry.count; i++) {
      coords[i * 2] = raw[i * 3];
      coords[i * 2 + 1] = raw[i * 3 + 1];
      dist[i] = raw[i * 3 + 2];
    }
    shapes.set(entry.id, {
      id: entry.id,
      coords,
      dist,
      length: dist[entry.count - 1] || 0,
    });
  }

  return shapes;
}

/* -------------------------------------------------------------------------
   Accès géométrique
   ------------------------------------------------------------------------- */

/** Index du sommet précédant la distance d, par dichotomie. */
export function indexAtDistance(shape: Shape, d: number): number {
  const { dist } = shape;
  let lo = 0;
  let hi = dist.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (dist[mid] <= d) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Position [lng, lat] à la distance d le long du tracé. */
export function coordAtDistance(shape: Shape, d: number): [number, number] {
  const n = shape.dist.length;
  if (d <= 0) return [shape.coords[0], shape.coords[1]];
  if (d >= shape.length) return [shape.coords[(n - 1) * 2], shape.coords[(n - 1) * 2 + 1]];

  const i = indexAtDistance(shape, d);
  const j = Math.min(i + 1, n - 1);
  const span = shape.dist[j] - shape.dist[i];
  const f = span > 0 ? (d - shape.dist[i]) / span : 0;

  return [
    shape.coords[i * 2] + f * (shape.coords[j * 2] - shape.coords[i * 2]),
    shape.coords[i * 2 + 1] + f * (shape.coords[j * 2 + 1] - shape.coords[i * 2 + 1]),
  ];
}

/**
 * Tranche de tracé entre deux distances — brique de base du rendu en capsule.
 * Tronque proprement aux extrémités.
 */
export function sliceShape(
  shape: Shape,
  dStart: number,
  dEnd: number
): [number, number][] {
  const isReverse = dStart > dEnd;
  const minD = Math.min(dStart, dEnd);
  const maxD = Math.max(dStart, dEnd);

  const a = Math.max(0, Math.min(minD, shape.length));
  const b = Math.max(0, Math.min(maxD, shape.length));
  if (b - a < 0.5) {
    const pt = coordAtDistance(shape, a);
    return [pt, [pt[0], pt[1]]];
  }

  const out: [number, number][] = [coordAtDistance(shape, a)];
  const i0 = indexAtDistance(shape, a);
  const i1 = indexAtDistance(shape, b);
  for (let i = i0 + 1; i <= i1; i++) {
    out.push([shape.coords[i * 2], shape.coords[i * 2 + 1]]);
  }
  out.push(coordAtDistance(shape, b));

  if (isReverse) {
    out.reverse();
  }
  return out;
}

/**
 * Découpe une rame en ses caisses individuelles le long du tracé.
 */
export function splitIntoCars(
  shape: Shape,
  headDistanceM: number,
  carsCount: number,
  carLengthM: number,
  interCarGapM: number,
  direction: 0 | 1 = 1
): [number, number][][] {
  const cars: [number, number][][] = [];
  const total = shape.length;

  for (let i = 0; i < carsCount; i++) {
    let carHead: number;
    let carTail: number;

    if (direction === 1) {
      carHead = headDistanceM - i * (carLengthM + interCarGapM);
      carTail = carHead - carLengthM;
    } else {
      carHead = headDistanceM + i * (carLengthM + interCarGapM);
      carTail = carHead + carLengthM;
    }

    const clampedHead = Math.max(0, Math.min(total, carHead));
    const clampedTail = Math.max(0, Math.min(total, carTail));

    const carPolyline = sliceShape(shape, clampedTail, clampedHead);
    cars.push(carPolyline);
  }

  return cars;
}

