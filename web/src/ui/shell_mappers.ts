import type { StationDeparture } from '@core/sim/browser_engine';
import type { RollingStockDatabase } from '@core/sim/rolling_stock';
import { buildHubRegistry, resolveLineElevationAt } from '@core/ui/map/station_levels';
import type { LineMetadata, LineTrafficReport, StationMetadata } from '@core/types';
import type { LineLadderData } from '@core/ui/components/station_ladder';
import type { TrainMarker } from '@core/ui/map/trains_layer';
import type { NearbyStationResult } from '@core/ui/utils/nearby_stations';
import type { TransitItinerary } from '@core/ui/utils/transit_router';
import type { Passage } from './Afficheur';
import type { StationRecord, JourType } from './InfoModals';
import type { LineAlert } from './LineBadgeChip';
import type { LigneDetail, LigneEtat } from './LinesDock';
import type { StationProche } from './NearbyDrawer';
import type { DepartGroupe } from './Passages';
import type { Itineraire, Segment } from './RoutePlannerDrawer';
import type { PositionRame } from './VoitureConseillee';
import type { LineRef } from './lines';

export function mapTrafficAlert(report?: LineTrafficReport | null): LineAlert | null {
  if (!report || report.status === 'normal') return null;
  if (report.status === 'interrupted') return 'signal';
  return 'vigilance';
}

export function toLineRef(
  line: Pick<LineMetadata, 'short_name' | 'color' | 'text_color'>
): LineRef {
  return {
    shortName: line.short_name,
    color: line.color,
    textColor: line.text_color,
  };
}

export function mapLineToEtat(line: LineMetadata, traffic?: LineTrafficReport | null): LigneEtat {
  const termini: [string, string] | undefined =
    line.destinations?.['0'] && line.destinations?.['1']
      ? [line.destinations['0'], line.destinations['1']]
      : undefined;
  return {
    ...toLineRef(line),
    alert: mapTrafficAlert(traffic),
    message: traffic?.message,
    termini,
  };
}

export function buildLigneDetail(params: {
  activeLine: LineMetadata;
  activeLadder: LineLadderData | null;
  activeDir: string;
  traffic: LineTrafficReport | null;
  rollingStockDb: RollingStockDatabase | null;
  trains: TrainMarker[];
  stations: StationMetadata[];
  linesById: Map<string, LineMetadata>;
  expertMode: boolean;
  onInverser: () => void;
  onArret: (stationName: string) => void;
  onRame: (train: TrainMarker) => void;
  onCorrespondance: (shortName: string) => void;
}): LigneDetail {
  const {
    activeLine,
    activeLadder,
    activeDir,
    traffic,
    rollingStockDb,
    trains,
    stations,
    linesById,
    expertMode,
  } = params;

  const dirKey = activeDir === '1' ? '1' : '0';
  const ladderDir = activeLadder?.directions?.[dirKey] ?? activeLadder?.directions?.['0'];
  const direction =
    ladderDir?.terminus ||
    activeLine.destinations?.[dirKey] ||
    activeLine.destinations?.['0'] ||
    'Terminus';

  const lineTrains = trains.filter((t) => t.line === activeLine.id);
  const alert = mapTrafficAlert(traffic);
  const trafic = alert
    ? { niveau: alert, texte: traffic?.message || traffic?.title || 'Perturbé' }
    : {
        niveau: 'normal' as const,
        texte: `Trafic normal · ${lineTrains.length} rame${lineTrains.length > 1 ? 's' : ''}`,
      };

  const stockInfo =
    rollingStockDb?.lines?.[activeLine.short_name] ??
    rollingStockDb?.lines?.[activeLine.id] ??
    null;

  const indicateurs = expertMode
    ? [
        { label: 'Rames en ligne', valeur: String(lineTrains.length) },
        {
          label: 'Longueur',
          valeur:
            activeLine.measured_length_km > 0
              ? `${activeLine.measured_length_km.toFixed(1)} km`
              : '—',
        },
        { label: 'Matériel', valeur: stockInfo?.name || 'Standard' },
        {
          label: 'Exploitation',
          valeur: stockInfo?.driverless ? 'Automatique' : 'Conducteur',
        },
      ]
    : undefined;

  const stationByName = new Map(stations.map((s) => [s.name, s]));
  const hubRegistry = buildHubRegistry(stations, Array.from(linesById.values()));
  const ladderStations = ladderDir?.stations ?? [];
  const arrets = ladderStations.map((st, idx) => {
    const meta = stationByName.get(st.name);
    const correspondances: LineRef[] = (meta?.lines ?? [])
      .filter((id) => id !== activeLine.id)
      .map((id) => linesById.get(id))
      .filter((l): l is LineMetadata => Boolean(l))
      .slice(0, 5)
      .map(toLineRef);

    const elevationM = st.coordinates
      ? resolveLineElevationAt(st.coordinates, activeLine, hubRegistry)
      : activeLine.elevation_offset;

    return {
      id: st.name,
      nom: st.name,
      terminus: idx === 0 || idx === ladderStations.length - 1,
      correspondances,
      elevationM,
    };
  });

  const dirTrains = lineTrains.filter(
    (t) => t.dest === direction || activeLine.destinations?.[dirKey] === t.dest
  );
  const indexByName = new Map(ladderStations.map((s, i) => [s.name, i]));
  const rames = dirTrains
    .map((t) => {
      const idx = indexByName.get(t.next);
      if (idx === undefined) return null;
      const apres = t.atStop ? idx : Math.max(0, idx - 1);
      return {
        id: t.id,
        apres,
        progression: t.atStop ? 0 : 0.5,
        description: `Rame vers ${t.dest}, ${t.atStop ? 'à quai à' : 'approche de'} ${t.next}`,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const trainById = new Map(dirTrains.map((t) => [t.id, t]));

  return {
    direction,
    onInverser: params.onInverser,
    trafic,
    indicateurs,
    arrets,
    rames,
    onArret: params.onArret,
    onRame: (id) => {
      const tr = trainById.get(id);
      if (tr) params.onRame(tr);
    },
    onCorrespondance: params.onCorrespondance,
  };
}

export function grouperPassages(departures: StationDeparture[]): {
  groupes: DepartGroupe[];
  refs: Array<Array<{ tripId: string; lineId: string }>>;
} {
  const map = new Map<
    string,
    { groupe: DepartGroupe; refs: Array<{ tripId: string; lineId: string }> }
  >();
  const sorted = [...departures].sort((a, b) => a.waitSeconds - b.waitSeconds);

  for (const dep of sorted) {
    const key = `${dep.lineId}|${dep.destName}`;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        groupe: {
          ligne: {
            shortName: dep.lineShortName,
            color: dep.colorHex,
            textColor: dep.textColorHex,
          },
          direction: dep.destName,
          passages: [],
        },
        refs: [],
      };
      map.set(key, entry);
    }
    if (entry.groupe.passages.length < 2) {
      const isLive = dep.confidence === 'measured' || dep.confidence === 'bracketed';
      entry.groupe.passages.push({
        minutes: dep.waitMinutes,
        statut: dep.atStop ? 'quai' : undefined,
        source: isLive ? 'temps-reel' : 'theorique',
      });
      entry.refs.push({ tripId: dep.tripId, lineId: dep.lineId });
    }
  }

  const values = [...map.values()].sort(
    (a, b) =>
      a.groupe.ligne.shortName.localeCompare(b.groupe.ligne.shortName, 'fr', {
        numeric: true,
      }) || a.groupe.direction.localeCompare(b.groupe.direction, 'fr')
  );

  return {
    groupes: values.map((v) => v.groupe),
    refs: values.map((v) => v.refs),
  };
}

export function buildNearbyStations(
  nearbyStations: NearbyStationResult[],
  nearbyDepartures: Record<string, StationDeparture[]>,
  linesById: Map<string, LineMetadata>
): StationProche[] {
  return nearbyStations.map(({ station, distanceM, walkMinutes }) => {
    const lignes = station.lines
      .map((id) => linesById.get(id))
      .filter((l): l is LineMetadata => Boolean(l))
      .map(toLineRef);

    const deps = (nearbyDepartures[station.name] ?? []).slice(0, 2);
    const passages: Passage[] = deps.map((dep) => ({
      minutes: dep.waitMinutes,
      statut: dep.atStop ? 'quai' : undefined,
      source:
        dep.confidence === 'measured' || dep.confidence === 'bracketed'
          ? 'temps-reel'
          : 'theorique',
      ligne: {
        shortName: dep.lineShortName,
        color: dep.colorHex,
        textColor: dep.textColorHex,
      },
    }));

    return {
      id: station.id,
      nom: station.name,
      lignes,
      minutes: walkMinutes,
      metres: Math.round(distanceM),
      passages,
    };
  });
}

function mapCarPosition(hint?: string): PositionRame | undefined {
  if (!hint) return undefined;
  const norm = hint.toLowerCase();
  if (norm.includes('avant') || norm.includes('tête') || norm.includes('tete')) return 'tete';
  if (norm.includes('milieu')) return 'milieu';
  if (norm.includes('arrière') || norm.includes('arriere') || norm.includes('queue'))
    return 'queue';
  return undefined;
}

export function mapItineraires(
  candidates: TransitItinerary[],
  now = new Date(),
  timezone = 'Europe/Paris'
): Itineraire[] {
  const timeFmt = new Intl.DateTimeFormat('fr-FR', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return candidates.map((cand) => {
    const arrivalDate = new Date(now.getTime() + cand.totalDurationSec * 1000);
    const arrivee = timeFmt.format(arrivalDate);

    const rideLegs = cand.legs.filter((l) => l.kind === 'ride');
    const lastRideIdx = cand.legs.reduce((acc, l, i) => (l.kind === 'ride' ? i : acc), -1);

    const segments: Segment[] = cand.legs.map((leg, idx) => {
      if (leg.kind === 'walk') {
        return {
          type: 'marche',
          minutes: Math.max(1, Math.round(leg.durationSec / 60)),
          metres: Math.round(leg.distanceM),
          consigne: leg.toLabel ? `Vers ${leg.toLabel}` : undefined,
        };
      }
      if (leg.kind === 'transfer') {
        return {
          type: 'marche',
          minutes: Math.max(1, Math.round(leg.durationSec / 60)),
          metres: leg.distanceM > 0 ? Math.round(leg.distanceM) : undefined,
          consigne:
            leg.fromLabel && leg.toLabel && leg.fromLabel !== leg.toLabel
              ? `Correspondance ${leg.fromLabel} → ${leg.toLabel}`
              : leg.toLabel
                ? `Correspondance à ${leg.toLabel}`
                : 'Correspondance à pied',
        };
      }
      const stops = leg.stops ?? [];
      const arrets = stops.length > 2 ? stops.slice(1, -1).map((s) => s.name) : [];
      const isLive =
        leg.departureConfidence === 'measured' || leg.departureConfidence === 'bracketed';
      const voiture = mapCarPosition(leg.carPositionHint);
      const isLastRide = idx === lastRideIdx || rideLegs.length <= 1;
      const raisonVoiture = voiture
        ? isLastRide
          ? `Pour la sortie à ${leg.toLabel}`
          : `Pour la correspondance à ${leg.toLabel}`
        : undefined;
      return {
        type: 'ligne',
        ligne: {
          shortName: leg.lineShortName || '?',
          color: leg.lineColor,
          textColor: leg.lineTextColor,
        },
        direction: leg.terminusName || leg.toLabel,
        de: leg.fromLabel,
        a: leg.toLabel,
        arrets,
        minutes: Math.max(1, Math.round(leg.durationSec / 60)),
        attente:
          typeof leg.waitSec === 'number'
            ? {
                minutes: Math.max(0, Math.round(leg.waitSec / 60)),
                source: isLive ? 'temps-reel' : 'theorique',
              }
            : undefined,
        voiture,
        raisonVoiture,
      };
    });

    return {
      minutes: Math.max(1, Math.round(cand.totalDurationSec / 60)),
      arrivee,
      segments,
    };
  });
}

export function buildRecordsLists(params: {
  stationRankings: Record<string, unknown> | null;
  jour: JourType;
  stations: StationMetadata[];
  linesById: Map<string, LineMetadata>;
}): { plus: StationRecord[]; moins: StationRecord[] } {
  const key =
    params.jour === 'semaine' ? 'weekday' : params.jour === 'samedi' ? 'saturday' : 'sunday';
  const byStation =
    (
      params.stationRankings as {
        by_station?: Record<
          string,
          Array<{ station_name: string; counts?: Record<string, number> }>
        >;
      } | null
    )?.by_station ?? {};
  const rows = byStation[key] ?? [];
  const stationByName = new Map(params.stations.map((s) => [s.name, s]));

  const toRecord = (row: {
    station_name: string;
    counts?: Record<string, number>;
  }): StationRecord => {
    const st = stationByName.get(row.station_name);
    const lignes = (st?.lines ?? [])
      .map((id) => params.linesById.get(id))
      .filter((l): l is LineMetadata => Boolean(l))
      .slice(0, 5)
      .map(toLineRef);
    return {
      nom: row.station_name,
      lignes,
      valeur: Number(row.counts?.[key] || 0),
    };
  };

  return {
    plus: rows.slice(0, 5).map(toRecord),
    moins: rows.slice(-5).reverse().map(toRecord),
  };
}
