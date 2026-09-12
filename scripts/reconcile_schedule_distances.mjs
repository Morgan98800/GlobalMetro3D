import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(import.meta.dirname, '..');
const schedulePath = path.join(root, 'web', 'public', 'data', 'schedule.json');
const sqlitePath = path.join(root, 'data', 'processed', 'network.sqlite');
const shapesPath = path.join(root, 'web', 'public', 'data', 'shapes.bin');
const sourceShapesPath = path.join(root, 'data', 'processed', 'shapes.bin');
const float32ToleranceM = 0.5;

const schedule = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));
const db = new DatabaseSync(sqlitePath);
const shapeLengths = new Map();
const sourceShapeLengths = new Map();
const shapes = fs.readFileSync(shapesPath);
if (shapes.toString('ascii', 0, 4) !== 'SHP2') {
  throw new Error(`Format SHP2 attendu dans ${shapesPath}`);
}

const sourceShapes = fs.readFileSync(sourceShapesPath);
const sourceShapeCount = sourceShapes.readUInt16LE(6);
for (let index = 0; index < sourceShapeCount; index += 1) {
  const sourceOffset = 32 + index * 64;
  const shapeId = sourceShapes.toString('utf8', sourceOffset, sourceOffset + 32).replace(/\0/g, '');
  sourceShapeLengths.set(shapeId, sourceShapes.readFloatLE(sourceOffset + 56));
}
const shapeCount = shapes.readUInt16LE(6);
let offset = 8;
for (let index = 0; index < shapeCount; index += 1) {
  const idLength = shapes.readUInt16LE(offset);
  offset += 2;
  const shapeId = shapes.toString('utf8', offset, offset + idLength);
  offset += idLength;
  offset = (offset + 3) & ~3;
  const pointCount = shapes.readUInt32LE(offset);
  const step = shapes.readFloatLE(offset + 4);
  const tail = shapes.readFloatLE(offset + 8);
  offset += 12 + 8 + (pointCount - 1) * 4;
  shapeLengths.set(shapeId, (pointCount - 2) * step + tail);
}

const tripStops = db.prepare(`
  SELECT stop_sequence, stop_id, shape_dist_traveled
  FROM trip_stops
  WHERE trip_id = ?
  ORDER BY stop_sequence
`);
const tripShape = db.prepare('SELECT shape_id FROM trips_index WHERE trip_id = ?');

let updatedStops = 0;
let checkedTrips = 0;
for (const trip of schedule.trips) {
  const tripId = trip[0];
  const shapeId = trip[3];
  const dbShape = tripShape.get(tripId);
  if (!dbShape) throw new Error(`Course absente de network.sqlite: ${tripId}`);
  if (dbShape.shape_id !== shapeId) {
    throw new Error(`Shape incohérente pour ${tripId}: ${shapeId} != ${dbShape.shape_id}`);
  }
  const rows = tripStops.all(tripId);
  if (rows.length !== trip[7].length) {
    throw new Error(`Nombre d'arrêts incohérent pour ${tripId}: ${trip[7].length} != ${rows.length}`);
  }
  const length = shapeLengths.get(shapeId);
  if (length === undefined) throw new Error(`Shape absente de SHP2: ${shapeId}`);
  const sourceLength = sourceShapeLengths.get(shapeId);
  if (sourceLength === undefined) throw new Error(`Shape source absente: ${shapeId}`);
  const distanceScale = length / sourceLength;
  for (let index = 0; index < rows.length; index += 1) {
    const stop = trip[7][index];
    const row = rows[index];
    const reconciledDistance = row.shape_dist_traveled * distanceScale;
    if (reconciledDistance > length + float32ToleranceM) {
      throw new Error(`Distance hors SHP2 pour ${tripId}: ${reconciledDistance} > ${length}`);
    }
    stop[2] = Math.round(reconciledDistance * 10) / 10;
    updatedStops += 1;
  }
  checkedTrips += 1;
}

fs.writeFileSync(schedulePath, `${JSON.stringify(schedule)}\n`, 'utf8');
console.log(`[schedule] Reconciled ${checkedTrips} trips and ${updatedStops} stops from network.sqlite`);
