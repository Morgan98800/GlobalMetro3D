import {
  loadShapes,
  decodeShapes,
  coordAtDistance,
  sliceShape as sliceShapeLoader,
  splitIntoCars as splitIntoCarsLoader,
  type Shape,
  type ShapeIndex
} from './shapes_loader.ts';

export type ShapeData = Shape;
export type ShapeEntry = Shape;

export async function loadShapesBin(url: string = '/data/shapes.bin'): Promise<Map<string, ShapeEntry>> {
  return loadShapes(url);
}

export function parseShapesBuffer(arrayBuffer: ArrayBuffer): Map<string, ShapeEntry> {
  return decodeShapes(arrayBuffer);
}

export function interpolatePointAtDistance(shape: ShapeEntry, distM: number): [number, number] {
  return coordAtDistance(shape, distM);
}

export function sliceShape(
  shape: ShapeEntry,
  dStartMeters: number,
  dEndMeters: number
): [number, number][] {
  return sliceShapeLoader(shape, dStartMeters, dEndMeters);
}

export function splitIntoCars(
  shape: ShapeEntry,
  headDistanceM: number,
  carsCount: number,
  carLengthM: number,
  interCarGapM: number,
  direction: 0 | 1 = 1
): [number, number][][] {
  return splitIntoCarsLoader(shape, headDistanceM, carsCount, carLengthM, interCarGapM, direction);
}
