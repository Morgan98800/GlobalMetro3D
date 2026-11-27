import type { LineMetadata, LineTrafficReport, StationMetadata } from '@core/types';
import type { Confidence } from '@core/rt/rt_matching';
import type { StationDeparture } from '@core/sim/browser_engine';
import type { LineLadderData, StationLadderNode } from '@core/ui/components/station_ladder';
import { findNearbyStations, haversineDistanceM } from './nearby_stations';

export interface RoutePoint {
  label: string;
  subtitle?: string;
  coordinates: [number, number];
  kind: 'user' | 'station' | 'place';
  station?: StationMetadata;
}

export interface RouteStopRef {
  id: string;
  name: string;
  coordinates: [number, number];
}

export type CarPositionHint = 'Avant' | 'Milieu' | 'Arrière';

export interface ItineraryLeg {
  kind: 'walk' | 'ride' | 'transfer';
  durationSec: number;
  distanceM: number;
  fromLabel: string;
  toLabel: string;
  fromCoords: [number, number];
  toCoords: [number, number];
  lineId?: string;
  lineShortName?: string;
  lineColor?: string;
  lineTextColor?: string;
  directionId?: string;
  terminusName?: string;
  stops?: RouteStopRef[];
  path?: [number, number][];
  waitSec?: number;
  departureConfidence?: Confidence;
  trafficAlert?: LineTrafficReport;
  carPositionHint?: CarPositionHint;
}

export interface TransitItinerary {
  id: string;
  tag: 'fast' | 'few_transfers' | 'walk';
  totalDurationSec: number;
  totalWalkM: number;
  transferCount: number;
  legs: ItineraryLeg[];
  origin: RoutePoint;
  destination: RoutePoint;
}

export function isLineWheelchairAccessible(line: LineMetadata): boolean {
  return line.short_name === '14' || line.mode === 'rail';
}

export interface RouterNetworkInput {
  stations: StationMetadata[];
  lines: LineMetadata[];
  ladders: Record<string, LineLadderData>;
  trafficByLine?: Record<string, LineTrafficReport>;
  getNextDepartures?: (stationName: string) => StationDeparture[];
  accessibleOnly?: boolean;
  avoidLineIds?: string[];
}

interface GraphEdge {
  toState: string;
  costSec: number;
  weightSec: number;
  distanceM: number;
  kind: 'ride' | 'transfer';
  lineId?: string;
  directionId?: string;
  terminusName?: string;
  fromStop: RouteStopRef;
  toStop: RouteStopRef;
}

const WALK_SPEED_MPS = 1.25; // ~4.5 km/h
const WALK_DETOUR_FACTOR = 1.22;
const STOP_DWELL_SEC = 24;
const BOARD_WAIT_SEC = 90;
const BASE_TRANSFER_SEC = 210; // ~3m30 walk + wait between platforms
const MAX_TRANSFER_DISTANCE_M = 160;
const STATION_CLUSTER_DIST_M = 95;

/**
 * Major Paris multi-station interchange complexes whose platforms sit > 160m apart
 * with realistic corridor walking times (seconds).
 */
export const PARIS_INTERCHANGE_CLUSTERS: readonly {
  names: readonly string[];
  walkSec: number;
}[] = [
  { names: ['chatelet', 'chatelet les halles', 'les halles'], walkSec: 270 },
  {
    names: ['saint lazare', 'havre caumartin', 'auber', 'opera', 'haussmann saint lazare'],
    walkSec: 300,
  },
  { names: ['gare du nord', 'magenta', 'la chapelle'], walkSec: 255 },
  { names: ['gare de l est', 'chateau landon'], walkSec: 225 },
  { names: ['montparnasse bienvenue', 'montparnasse'], walkSec: 285 },
  { names: ['gare de lyon', 'reilly diderot'], walkSec: 290 },
  { names: ['saint michel', 'saint michel notre dame', 'cluny la sorbonne'], walkSec: 215 },
];

/**
 * Realistic total corridor transfer durations (seconds) at major Paris hubs,
 * keyed by normalized station name.
 */
export const PARIS_HUB_TRANSFER_SEC: Readonly<Record<string, number>> = {
  chatelet: 360,
  'chatelet les halles': 360,
  'les halles': 330,
  'montparnasse bienvenue': 420,
  montparnasse: 420,
  'saint lazare': 300,
  'gare du nord': 300,
  'gare de lyon': 300,
  'charles de gaulle etoile': 270,
  opera: 270,
  republique: 240,
  nation: 240,
  'place d italie': 240,
  bastille: 240,
  'gare de l est': 240,
  'denfert rochereau': 240,
  'strasbourg saint denis': 240,
  'saint michel': 240,
  'saint michel notre dame': 240,
};

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-’']/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

function estimateWalkSec(straightMeters: number): { distanceM: number; durationSec: number } {
  const distanceM = Math.round(straightMeters * WALK_DETOUR_FACTOR);
  return {
    distanceM,
    durationSec: Math.max(30, Math.round(distanceM / WALK_SPEED_MPS)),
  };
}

function resolveLineTraffic(
  trafficByLine: Record<string, LineTrafficReport> | undefined,
  lineId: string
): LineTrafficReport | undefined {
  if (!trafficByLine) return undefined;
  return trafficByLine[lineId];
}

function isStationClosedOnLine(
  report: LineTrafficReport | undefined,
  stationName: string
): boolean {
  if (!report?.closedStations?.length) return false;
  const target = normalizeName(stationName);
  return report.closedStations.some((closed) => {
    const normClosed = normalizeName(closed);
    return (
      normClosed === target ||
      (normClosed.length >= 4 && (target.includes(normClosed) || normClosed.includes(target)))
    );
  });
}

function resolveWaitInfo(
  input: RouterNetworkInput,
  lineId: string,
  stationName: string,
  directionId?: string,
  terminusName?: string
): { waitSec: number; confidence?: Confidence } {
  if (!input.getNextDepartures) {
    return { waitSec: BOARD_WAIT_SEC };
  }
  const deps = input.getNextDepartures(stationName);
  if (!deps || deps.length === 0) {
    return { waitSec: BOARD_WAIT_SEC };
  }
  const normTerminus = terminusName ? normalizeName(terminusName) : '';
  const dirMatches = deps.filter((d) => {
    if (d.lineId !== lineId) return false;
    if (directionId !== undefined && String(d.direction) === String(directionId)) return true;
    if (normTerminus && normalizeName(d.destName).includes(normTerminus)) return true;
    return false;
  });
  const candidates = dirMatches.length > 0 ? dirMatches : deps.filter((d) => d.lineId === lineId);
  if (candidates.length === 0) {
    return { waitSec: BOARD_WAIT_SEC };
  }
  const sorted = [...candidates].sort((a, b) => a.waitSeconds - b.waitSeconds);
  const chosen = sorted[0];
  const clamped = Math.max(30, Math.min(900, Math.round(chosen.waitSeconds)));
  return { waitSec: clamped, confidence: chosen.confidence };
}

function computeCarPositionHint(
  stops: RouteStopRef[],
  nextTargetCoords: [number, number] | undefined
): CarPositionHint | undefined {
  if (!nextTargetCoords || stops.length < 2) return undefined;
  const last = stops[stops.length - 1];
  const prev = stops[stops.length - 2];
  const cosLat = Math.cos((last.coordinates[1] * Math.PI) / 180);
  const trainDx = (last.coordinates[0] - prev.coordinates[0]) * cosLat;
  const trainDy = last.coordinates[1] - prev.coordinates[1];
  const trainLen = Math.hypot(trainDx, trainDy);
  const targetDx = (nextTargetCoords[0] - last.coordinates[0]) * cosLat;
  const targetDy = nextTargetCoords[1] - last.coordinates[1];
  const targetLen = Math.hypot(targetDx, targetDy);
  if (trainLen < 1e-6 || targetLen < 1e-5) return 'Milieu';
  const dot = (trainDx * targetDx + trainDy * targetDy) / (trainLen * targetLen);
  if (dot > 0.35) return 'Avant';
  if (dot < -0.35) return 'Arrière';
  return 'Milieu';
}

function buildGraph(
  input: RouterNetworkInput,
  transferPenaltyExtraSec: number,
  allowInterruptedFallback = false
): {
  edges: Map<string, GraphEdge[]>;
  hubStatesByStationId: Map<string, string[]>;
  stationByState: Map<string, RouteStopRef>;
  lineById: Map<string, LineMetadata>;
} {
  const lineById = new Map(input.lines.map((line) => [line.id, line]));
  const avoidSet = new Set(
    (input.avoidLineIds ?? []).map((id) => id.trim().toUpperCase()).filter(Boolean)
  );
  const accessibleStationNames = new Set<string>();
  if (input.accessibleOnly) {
    for (const station of input.stations) {
      if (station.wheelchair_boarding === 1) {
        accessibleStationNames.add(normalizeName(station.name));
      }
    }
  }
  const edges = new Map<string, GraphEdge[]>();
  const stationByState = new Map<string, RouteStopRef>();
  const hubGroups = new Map<
    string,
    { hubKey: string; stop: RouteStopRef; stateKeys: Set<string>; lineId: string }[]
  >();

  const addEdge = (fromState: string, edge: GraphEdge) => {
    const list = edges.get(fromState);
    if (list) list.push(edge);
    else edges.set(fromState, [edge]);
  };

  // Canonical hub grouping for each station using normalized name so "Châtelet" / multi-platform hubs connect cleanly
  const registerNode = (
    node: StationLadderNode,
    lineId: string,
    dirId: string,
    terminus: string
  ): { stateKey: string; stop: RouteStopRef } => {
    const hubKey = normalizeName(node.name);
    const stateKey = `${lineId}::${hubKey}`;
    const stop: RouteStopRef = {
      id: node.id,
      name: node.name,
      coordinates: node.coordinates,
    };
    stationByState.set(stateKey, stop);
    const entry = { hubKey, stop, stateKeys: new Set([stateKey]), lineId };
    const existingGroup = hubGroups.get(hubKey);
    if (existingGroup) {
      const sameLine = existingGroup.find((g) => g.lineId === lineId);
      if (!sameLine) existingGroup.push(entry);
    } else {
      hubGroups.set(hubKey, [entry]);
    }
    void dirId;
    void terminus;
    return { stateKey, stop };
  };

  for (const [lineId, ladder] of Object.entries(input.ladders)) {
    const line = lineById.get(lineId);
    if (
      avoidSet.has(lineId.trim().toUpperCase()) ||
      (line && avoidSet.has(line.short_name.trim().toUpperCase()))
    ) {
      continue;
    }
    const lineAccessible = Boolean(line && isLineWheelchairAccessible(line));
    const report = resolveLineTraffic(input.trafficByLine, lineId);
    const isInterrupted = report?.status === 'interrupted';
    if (isInterrupted && !allowInterruptedFallback) continue;
    const isDisrupted = report?.status === 'disrupted';
    const speedMps = line?.mode === 'rail' ? 14.5 : 8.8;
    if (!ladder?.directions) continue;

    for (const [dirId, dirData] of Object.entries(ladder.directions)) {
      const sequences: { stations: StationLadderNode[]; terminus: string }[] = [];
      if (dirData.stations?.length >= 2) {
        sequences.push({ stations: dirData.stations, terminus: dirData.terminus });
      }
      for (const branch of dirData.branches ?? []) {
        if (branch.stations?.length >= 2) {
          sequences.push({
            stations: branch.stations,
            terminus: branch.terminus || dirData.terminus,
          });
        }
      }

      for (const seq of sequences) {
        for (let i = 0; i < seq.stations.length - 1; i += 1) {
          const a = seq.stations[i];
          const b = seq.stations[i + 1];
          if (
            input.accessibleOnly &&
            !lineAccessible &&
            (!accessibleStationNames.has(normalizeName(a.name)) ||
              !accessibleStationNames.has(normalizeName(b.name)))
          ) {
            continue;
          }
          if (
            !allowInterruptedFallback &&
            (isStationClosedOnLine(report, a.name) || isStationClosedOnLine(report, b.name))
          ) {
            continue;
          }
          const regA = registerNode(a, lineId, dirId, seq.terminus);
          const regB = registerNode(b, lineId, dirId, seq.terminus);
          const deltaDist = Math.max(
            180,
            b.distance_m > a.distance_m
              ? b.distance_m - a.distance_m
              : haversineDistanceM(a.coordinates, b.coordinates) * 1.15
          );
          const rideSec = Math.round(deltaDist / speedMps) + STOP_DWELL_SEC;
          const trafficPenaltySec = isInterrupted ? 1800 : isDisrupted ? 20 : 0;
          addEdge(regA.stateKey, {
            toState: regB.stateKey,
            costSec: rideSec,
            weightSec: rideSec + trafficPenaltySec,
            distanceM: deltaDist,
            kind: 'ride',
            lineId,
            directionId: dirId,
            terminusName: seq.terminus,
            fromStop: regA.stop,
            toStop: regB.stop,
          });
        }
      }
    }
  }

  const addTransferPair = (
    a: { hubKey: string; stop: RouteStopRef; lineId: string },
    b: { hubKey: string; stop: RouteStopRef; lineId: string },
    distM: number,
    baseCostSec: number
  ) => {
    const hubMinSec = Math.max(
      PARIS_HUB_TRANSFER_SEC[a.hubKey] ?? 0,
      PARIS_HUB_TRANSFER_SEC[b.hubKey] ?? 0
    );
    const costSec = Math.max(baseCostSec, hubMinSec);
    const rawWalkM = Math.round(distM * WALK_DETOUR_FACTOR);
    const distanceM = hubMinSec
      ? Math.max(rawWalkM, Math.round(Math.max(45, costSec - BOARD_WAIT_SEC) * WALK_SPEED_MPS))
      : rawWalkM;
    const weightSec = costSec + transferPenaltyExtraSec;
    const fromStateA = `${a.lineId}::${a.hubKey}`;
    const toStateB = `${b.lineId}::${b.hubKey}`;
    addEdge(fromStateA, {
      toState: toStateB,
      costSec,
      weightSec,
      distanceM,
      kind: 'transfer',
      fromStop: a.stop,
      toStop: b.stop,
    });
    addEdge(toStateB, {
      toState: fromStateA,
      costSec,
      weightSec,
      distanceM,
      kind: 'transfer',
      fromStop: b.stop,
      toStop: a.stop,
    });
  };

  // Build transfer edges within each named hub + between adjacent hubs (< 160m, e.g., Châtelet <-> Châtelet - Les Halles)
  const allHubEntries = [...hubGroups.values()];
  for (const entries of allHubEntries) {
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const a = entries[i];
        const b = entries[j];
        const dist = haversineDistanceM(a.stop.coordinates, b.stop.coordinates);
        if (dist > 450) continue;
        const walkExtra = Math.round((dist * WALK_DETOUR_FACTOR) / WALK_SPEED_MPS);
        addTransferPair(a, b, dist, BASE_TRANSFER_SEC + walkExtra);
      }
    }
  }

  // Connect close cross-named hubs (such as Châtelet <-> Châtelet - Les Halles or Saint-Lazare <-> Havre-Caumartin)
  for (let i = 0; i < allHubEntries.length; i += 1) {
    for (let j = i + 1; j < allHubEntries.length; j += 1) {
      const groupA = allHubEntries[i];
      const groupB = allHubEntries[j];
      const repA = groupA[0];
      const repB = groupB[0];
      const dist = haversineDistanceM(repA.stop.coordinates, repB.stop.coordinates);
      if (dist > MAX_TRANSFER_DISTANCE_M) continue;
      for (const a of groupA) {
        for (const b of groupB) {
          if (a.lineId === b.lineId) continue;
          const walkExtra = Math.round((dist * WALK_DETOUR_FACTOR) / WALK_SPEED_MPS) + 60;
          addTransferPair(a, b, dist, BASE_TRANSFER_SEC + walkExtra);
        }
      }
    }
  }

  // Explicit Paris mega-hub complex transfers (e.g. Saint-Lazare <-> Auber <-> Opéra, Châtelet <-> Les Halles)
  const clusterByNorm = new Map<string, number>();
  for (let cIdx = 0; cIdx < PARIS_INTERCHANGE_CLUSTERS.length; cIdx += 1) {
    for (const rawName of PARIS_INTERCHANGE_CLUSTERS[cIdx].names) {
      clusterByNorm.set(rawName, cIdx);
    }
  }
  const hubGroupsByCluster = new Map<number, (typeof allHubEntries)[number]>();
  for (const group of allHubEntries) {
    if (!group.length) continue;
    const cIdx = clusterByNorm.get(group[0].hubKey);
    if (cIdx === undefined) continue;
    const list = hubGroupsByCluster.get(cIdx) ?? [];
    list.push(...group);
    hubGroupsByCluster.set(cIdx, list);
  }
  for (const [cIdx, entries] of hubGroupsByCluster.entries()) {
    const baseWalkSec = PARIS_INTERCHANGE_CLUSTERS[cIdx].walkSec;
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const a = entries[i];
        const b = entries[j];
        if (a.lineId === b.lineId || a.hubKey === b.hubKey) continue;
        const dist = haversineDistanceM(a.stop.coordinates, b.stop.coordinates);
        if (dist > 650) continue;
        const fromStateA = `${a.lineId}::${a.hubKey}`;
        const toStateB = `${b.lineId}::${b.hubKey}`;
        const existingA = edges.get(fromStateA)?.some((e) => e.toState === toStateB);
        if (existingA) continue;
        addTransferPair(a, b, dist, baseWalkSec);
      }
    }
  }

  // Map commercial StationMetadata IDs to available graph states
  const hubStatesByStationId = new Map<string, string[]>();
  for (const station of input.stations) {
    const norm = normalizeName(station.name);
    const states: string[] = [];
    for (const lineId of station.lines) {
      const candidate = `${lineId}::${norm}`;
      if (stationByState.has(candidate)) {
        states.push(candidate);
      } else {
        // Fallback match by nearest node on that line
        let bestState: string | null = null;
        let bestD = STATION_CLUSTER_DIST_M * 4;
        for (const [stateKey, stop] of stationByState.entries()) {
          if (!stateKey.startsWith(`${lineId}::`)) continue;
          const d = haversineDistanceM(station.coordinates, stop.coordinates);
          if (d < bestD) {
            bestD = d;
            bestState = stateKey;
          }
        }
        if (bestState) states.push(bestState);
      }
    }
    hubStatesByStationId.set(station.id, states);
  }

  return { edges, hubStatesByStationId, stationByState, lineById };
}

function runSingleDijkstra(
  origin: RoutePoint,
  destination: RoutePoint,
  input: RouterNetworkInput,
  transferPenaltyExtraSec: number,
  tag: 'fast' | 'few_transfers',
  allowInterruptedFallback = false
): TransitItinerary | null {
  const { edges, hubStatesByStationId, stationByState, lineById } = buildGraph(
    input,
    transferPenaltyExtraSec,
    allowInterruptedFallback
  );

  const rawEntryCandidates =
    origin.kind === 'station' && origin.station
      ? [{ station: origin.station, distanceM: 0 }]
      : findNearbyStations(input.stations, origin.coordinates, 4);
  const rawExitCandidates =
    destination.kind === 'station' && destination.station
      ? [{ station: destination.station, distanceM: 0 }]
      : findNearbyStations(input.stations, destination.coordinates, 4);

  const hasAccessibleStations =
    Boolean(input.accessibleOnly) && input.stations.some((s) => s.wheelchair_boarding === 1);
  const preferAccessibleCandidates = (
    candidates: { station: StationMetadata; distanceM: number }[]
  ) => {
    if (!hasAccessibleStations) return candidates;
    const accessibleWithStates = candidates.filter(
      (c) =>
        c.station.wheelchair_boarding === 1 &&
        (hubStatesByStationId.get(c.station.id)?.length ?? 0) > 0
    );
    if (accessibleWithStates.length > 0) return accessibleWithStates;
    const accessibleAny = candidates.filter((c) => c.station.wheelchair_boarding === 1);
    return accessibleAny.length > 0 ? accessibleAny : candidates;
  };

  const entryCandidates = preferAccessibleCandidates(rawEntryCandidates);
  const exitCandidates = preferAccessibleCandidates(rawExitCandidates);
  if (entryCandidates.length === 0 || exitCandidates.length === 0) return null;

  const entryStarts = new Map<
    string,
    {
      walkSec: number;
      walkDistM: number;
      waitSec: number;
      station: StationMetadata;
      entryCoords: [number, number];
    }
  >();
  for (const entry of entryCandidates) {
    if (entry.distanceM > 2200 && entryStarts.size > 0) continue;
    const { distanceM, durationSec } =
      origin.station && origin.station.id === entry.station.id
        ? { distanceM: 0, durationSec: 0 }
        : estimateWalkSec(entry.distanceM);
    const stateIds = hubStatesByStationId.get(entry.station.id) ?? [];
    for (const stateId of stateIds) {
      const stop = stationByState.get(stateId);
      const lineId = stateId.split('::')[0] ?? '';
      const { waitSec } = resolveWaitInfo(input, lineId, stop?.name ?? entry.station.name);
      const existing = entryStarts.get(stateId);
      const candidateCost = durationSec + waitSec;
      if (!existing || candidateCost < existing.walkSec + existing.waitSec) {
        entryStarts.set(stateId, {
          walkSec: durationSec,
          walkDistM: distanceM,
          waitSec,
          station: entry.station,
          entryCoords: stop?.coordinates ?? entry.station.coordinates,
        });
      }
    }
  }

  const exitEnds = new Map<
    string,
    { walkSec: number; walkDistM: number; station: StationMetadata; exitCoords: [number, number] }
  >();
  for (const exit of exitCandidates) {
    if (exit.distanceM > 2200 && exitEnds.size > 0) continue;
    const { distanceM, durationSec } =
      destination.station && destination.station.id === exit.station.id
        ? { distanceM: 0, durationSec: 0 }
        : estimateWalkSec(exit.distanceM);
    const stateIds = hubStatesByStationId.get(exit.station.id) ?? [];
    for (const stateId of stateIds) {
      const stop = stationByState.get(stateId);
      const existing = exitEnds.get(stateId);
      if (!existing || durationSec < existing.walkSec) {
        exitEnds.set(stateId, {
          walkSec: durationSec,
          walkDistM: distanceM,
          station: exit.station,
          exitCoords: stop?.coordinates ?? exit.station.coordinates,
        });
      }
    }
  }

  if (entryStarts.size === 0 || exitEnds.size === 0) return null;

  const distWeight = new Map<string, number>();
  const realSec = new Map<string, number>();
  const prevState = new Map<string, string | null>();
  const prevEdge = new Map<string, GraphEdge | null>();
  const startKeyOf = new Map<string, string>();
  const visited = new Set<string>();
  const queue: string[] = [];

  for (const [stateId, startInfo] of entryStarts.entries()) {
    const initial = startInfo.walkSec + startInfo.waitSec;
    distWeight.set(stateId, initial);
    realSec.set(stateId, initial);
    prevState.set(stateId, null);
    prevEdge.set(stateId, null);
    startKeyOf.set(stateId, stateId);
    queue.push(stateId);
  }

  let bestEndState: string | null = null;
  let bestEndWeight = Number.POSITIVE_INFINITY;

  while (queue.length > 0) {
    let minIdx = 0;
    let minWeight = distWeight.get(queue[0]) ?? Number.POSITIVE_INFINITY;
    for (let i = 1; i < queue.length; i += 1) {
      const w = distWeight.get(queue[i]) ?? Number.POSITIVE_INFINITY;
      if (w < minWeight) {
        minWeight = w;
        minIdx = i;
      }
    }
    const current = queue.splice(minIdx, 1)[0];
    if (visited.has(current)) continue;
    visited.add(current);

    if (minWeight > bestEndWeight) break;

    const exitInfo = exitEnds.get(current);
    if (exitInfo) {
      const candidateEndWeight = minWeight + exitInfo.walkSec;
      if (candidateEndWeight < bestEndWeight) {
        bestEndWeight = candidateEndWeight;
        bestEndState = current;
      }
    }

    const outgoing = edges.get(current) ?? [];
    for (const edge of outgoing) {
      if (visited.has(edge.toState)) continue;
      const nextWeight = minWeight + edge.weightSec;
      const nextReal = (realSec.get(current) ?? 0) + edge.costSec;
      if (nextWeight < (distWeight.get(edge.toState) ?? Number.POSITIVE_INFINITY)) {
        distWeight.set(edge.toState, nextWeight);
        realSec.set(edge.toState, nextReal);
        prevState.set(edge.toState, current);
        prevEdge.set(edge.toState, edge);
        startKeyOf.set(edge.toState, startKeyOf.get(current) ?? current);
        queue.push(edge.toState);
      }
    }
  }

  if (!bestEndState) return null;

  // Reconstruct raw edge sequence
  const rawEdges: GraphEdge[] = [];
  let cursor: string | null = bestEndState;
  while (cursor) {
    const edge = prevEdge.get(cursor);
    if (edge) rawEdges.push(edge);
    cursor = prevState.get(cursor) ?? null;
  }
  rawEdges.reverse();

  // Group contiguous ride edges into transit legs
  const legs: ItineraryLeg[] = [];
  const startStateId = startKeyOf.get(bestEndState)!;
  const startInfo = entryStarts.get(startStateId)!;
  const endInfo = exitEnds.get(bestEndState)!;

  if (startInfo.walkDistM >= 25) {
    legs.push({
      kind: 'walk',
      durationSec: startInfo.walkSec,
      distanceM: startInfo.walkDistM,
      fromLabel: origin.label,
      toLabel: startInfo.station.name,
      fromCoords: origin.coordinates,
      toCoords: startInfo.entryCoords,
      path: [origin.coordinates, startInfo.entryCoords],
    });
  }

  let rideAcc: {
    lineId: string;
    directionId: string;
    terminusName: string;
    durationSec: number;
    distanceM: number;
    stops: RouteStopRef[];
  } | null = null;
  let transferCount = 0;
  let totalWalkM = startInfo.walkDistM;

  const flushRide = () => {
    if (!rideAcc) return;
    const line = lineById.get(rideAcc.lineId);
    const first = rideAcc.stops[0];
    const last = rideAcc.stops[rideAcc.stops.length - 1];
    const isInitialBoarding = !legs.some((l) => l.kind === 'ride');
    const waitInfo = resolveWaitInfo(
      input,
      rideAcc.lineId,
      first.name,
      rideAcc.directionId,
      rideAcc.terminusName
    );
    const trafficAlert = resolveLineTraffic(input.trafficByLine, rideAcc.lineId);
    legs.push({
      kind: 'ride',
      durationSec: rideAcc.durationSec + (isInitialBoarding ? waitInfo.waitSec : 0),
      distanceM: Math.round(rideAcc.distanceM),
      fromLabel: first.name,
      toLabel: last.name,
      fromCoords: first.coordinates,
      toCoords: last.coordinates,
      lineId: rideAcc.lineId,
      lineShortName: line?.short_name ?? rideAcc.lineId,
      lineColor: line?.color ?? '#C9A227',
      lineTextColor: line?.text_color ?? '#111111',
      directionId: rideAcc.directionId,
      terminusName: rideAcc.terminusName,
      stops: rideAcc.stops,
      path: rideAcc.stops.map((s) => s.coordinates),
      waitSec: waitInfo.waitSec,
      departureConfidence: waitInfo.confidence,
      trafficAlert,
    });
    rideAcc = null;
  };

  for (const edge of rawEdges) {
    if (edge.kind === 'ride' && edge.lineId) {
      if (rideAcc && rideAcc.lineId === edge.lineId && rideAcc.directionId === edge.directionId) {
        rideAcc.durationSec += edge.costSec;
        rideAcc.distanceM += edge.distanceM;
        rideAcc.stops.push(edge.toStop);
      } else {
        flushRide();
        rideAcc = {
          lineId: edge.lineId,
          directionId: edge.directionId ?? '0',
          terminusName: edge.terminusName ?? edge.toStop.name,
          durationSec: edge.costSec,
          distanceM: edge.distanceM,
          stops: [edge.fromStop, edge.toStop],
        };
      }
    } else if (edge.kind === 'transfer') {
      flushRide();
      transferCount += 1;
      totalWalkM += edge.distanceM;
      legs.push({
        kind: 'transfer',
        durationSec: edge.costSec,
        distanceM: edge.distanceM,
        fromLabel: edge.fromStop.name,
        toLabel: edge.toStop.name,
        fromCoords: edge.fromStop.coordinates,
        toCoords: edge.toStop.coordinates,
        path: [edge.fromStop.coordinates, edge.toStop.coordinates],
      });
    }
  }
  flushRide();

  // Discard empty itineraries that didn't board any line
  const hasRide = legs.some((leg) => leg.kind === 'ride');
  if (!hasRide) return null;

  if (endInfo.walkDistM >= 25) {
    totalWalkM += endInfo.walkDistM;
    legs.push({
      kind: 'walk',
      durationSec: endInfo.walkSec,
      distanceM: endInfo.walkDistM,
      fromLabel: endInfo.station.name,
      toLabel: destination.label,
      fromCoords: endInfo.exitCoords,
      toCoords: destination.coordinates,
      path: [endInfo.exitCoords, destination.coordinates],
    });
  }

  for (let i = 0; i < legs.length; i += 1) {
    const leg = legs[i];
    if (leg.kind !== 'ride' || !leg.stops || leg.stops.length < 2) continue;
    const nextLeg = legs[i + 1];
    const nextCoords = nextLeg?.toCoords ?? destination.coordinates;
    leg.carPositionHint = computeCarPositionHint(leg.stops, nextCoords);
  }

  const totalDurationSec = legs.reduce((acc, leg) => acc + leg.durationSec, 0);
  const signature = legs
    .filter((l) => l.kind === 'ride')
    .map((l) => `${l.lineShortName}:${l.fromLabel}->${l.toLabel}`)
    .join('|');

  return {
    id: `${tag}:${signature}`,
    tag,
    totalDurationSec,
    totalWalkM,
    transferCount,
    legs,
    origin,
    destination,
  };
}

/**
 * Compute up to 2 distinct walk + Metro/RER itineraries between any two coordinates or stations.
 */
export function computeTransitItineraries(
  origin: RoutePoint,
  destination: RoutePoint,
  input: RouterNetworkInput
): TransitItinerary[] {
  const straightM = haversineDistanceM(origin.coordinates, destination.coordinates);
  const walkOnly = estimateWalkSec(straightM);

  const candidates: TransitItinerary[] = [];
  if (straightM <= 450) {
    candidates.push({
      id: 'walk-direct',
      tag: 'walk',
      totalDurationSec: walkOnly.durationSec,
      totalWalkM: walkOnly.distanceM,
      transferCount: 0,
      legs: [
        {
          kind: 'walk',
          durationSec: walkOnly.durationSec,
          distanceM: walkOnly.distanceM,
          fromLabel: origin.label,
          toLabel: destination.label,
          fromCoords: origin.coordinates,
          toCoords: destination.coordinates,
          path: [origin.coordinates, destination.coordinates],
        },
      ],
      origin,
      destination,
    });
  }

  let fastest = runSingleDijkstra(origin, destination, input, 0, 'fast', false);
  let usedInterruptedFallback = false;
  if (!fastest) {
    fastest = runSingleDijkstra(origin, destination, input, 0, 'fast', true);
    usedInterruptedFallback = Boolean(fastest);
  }
  if (fastest && (straightM > 320 || fastest.totalDurationSec < walkOnly.durationSec + 180)) {
    candidates.push(fastest);
  }

  if (fastest && fastest.transferCount > 0) {
    const fewerTransfers = runSingleDijkstra(
      origin,
      destination,
      input,
      900,
      'few_transfers',
      usedInterruptedFallback
    );
    if (
      fewerTransfers &&
      fewerTransfers.transferCount < fastest.transferCount &&
      !candidates.some((c) => c.id.split(':')[1] === fewerTransfers.id.split(':')[1])
    ) {
      candidates.push(fewerTransfers);
    }
  }

  const hasActiveFilters = Boolean(input.accessibleOnly) || (input.avoidLineIds?.length ?? 0) > 0;
  if (candidates.length === 0 && !hasActiveFilters) {
    candidates.push({
      id: 'walk-fallback',
      tag: 'walk',
      totalDurationSec: walkOnly.durationSec,
      totalWalkM: walkOnly.distanceM,
      transferCount: 0,
      legs: [
        {
          kind: 'walk',
          durationSec: walkOnly.durationSec,
          distanceM: walkOnly.distanceM,
          fromLabel: origin.label,
          toLabel: destination.label,
          fromCoords: origin.coordinates,
          toCoords: destination.coordinates,
          path: [origin.coordinates, destination.coordinates],
        },
      ],
      origin,
      destination,
    });
  }

  candidates.sort((a, b) => a.totalDurationSec - b.totalDurationSec);
  return candidates;
}
