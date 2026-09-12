import https from 'https';
import type { LineTrafficReport } from '../../core/types';

export interface StmSnapshot {
  producedAt: string;
  timestamp: number;
  validUntil: number;
  feedHealthy: boolean;
  serviceActive: boolean;
  serviceMessage?: string;
  lastError: string | null;
  trafficByLine: Record<string, LineTrafficReport>;
}

export const MONTREAL_METRO_LINES = [
  { id: '1', name: '1', displayName: 'Verte', color: '#00B300' },
  { id: '2', name: '2', displayName: 'Orange', color: '#D95700' },
  { id: '4', name: '4', displayName: 'Jaune', color: '#FFD900' },
  { id: '5', name: '5', displayName: 'Bleue', color: '#0095E6' }
];

export const MONTREAL_STATIONS = [
  'Acadie', 'Angrignon', 'Assomption', 'Atwater', 'Beaubien', 'Beaudry', 'Berri-UQAM',
  'Bonaventure', 'Cadillac', 'Cartier', 'Champ-de-Mars', 'Charlevoix', 'Chomedey',
  'Côte-des-Neiges', 'Côte-Sainte-Catherine', 'Côte-Vertu', 'Crémazie', 'D\'Iberville',
  'De Castelnau', 'De Church', 'De Concorde', 'De L\'Église', 'De la Savane',
  'Du Collège', 'Fabre', 'Frontenac', 'Georges-Vanier', 'Guy-Concordia', 'Henri-Bourassa',
  'Honoré-Beaugrand', 'Jarry', 'Jean-Drapeau', 'Jean-Talon', 'Jolicoeur', 'Joliette',
  'Langelier', 'LaSalle', 'Laurier', 'Lionel-Groulx', 'Longueuil-Université-de-Sherbrooke',
  'Lucien-L\'Allier', 'McGill', 'Monk', 'Mont-Royal', 'Montmorency', 'Namur', 'Outremont',
  'Papineau', 'Parc', 'Peel', 'Pie-IX', 'Place-d\'Armes', 'Place-des-Arts', 'Place-Saint-Henri',
  'Plamondon', 'Préfontaine', 'Radisson', 'Rosemont', 'Saint-Laurent', 'Saint-Michel',
  'Sauvé', 'Sherbrooke', 'Snowdon', 'Square-Victoria-OACI', 'Université-de-Montréal',
  'Vendôme', 'Verdun', 'Viau', 'Villa-Maria'
];

/**
 * Operating hours dynamically derived from GTFS schedule (05:15 to 02:00 America/Montreal time).
 */
export function isMontrealMetroServiceHours(
  date: Date = new Date(),
  startMinutes = 5 * 60 + 15,
  endMinutes = 2 * 60 + 0
): boolean {
  const mtlTimeStr = date.toLocaleTimeString('en-CA', {
    timeZone: 'America/Montreal',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  });
  const [h, m] = mtlTimeStr.split(':').map(Number);
  const currentMinutes = h * 60 + m;

  // Overnight lull: between 02:00 and 05:15
  if (currentMinutes >= endMinutes && currentMinutes < startMinutes) {
    return false;
  }
  return true;
}

export function normalizeStationText(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts closed stations from a disruption message using known stations catalog.
 */
export function extractClosedStations(text: string, catalog: string[] = MONTREAL_STATIONS): string[] {
  if (!text) return [];
  const normalizedText = normalizeStationText(text);
  const found: string[] = [];

  for (const st of catalog) {
    const normSt = normalizeStationText(st);
    if (normSt.length > 2 && normalizedText.includes(normSt)) {
      found.push(st);
    }
  }
  return Array.from(new Set(found));
}

/**
 * Parses STM i3 etatservice JSON response and builds LineTrafficReport map.
 */
export function parseStmEtatService(
  raw: any,
  catalog: string[] = MONTREAL_STATIONS
): Record<string, LineTrafficReport> {
  const result: Record<string, LineTrafficReport> = {};
  const nowIso = new Date().toISOString();

  // Initialize all 4 lines as normal
  for (const line of MONTREAL_METRO_LINES) {
    result[line.id] = {
      lineId: line.id,
      status: 'normal',
      severity: 'normal',
      title: `Ligne ${line.id} - ${line.displayName}`,
      message: 'Service normal du métro',
      updatedAt: nowIso
    };
  }

  if (!raw) return result;

  // Locate message list in payload
  let msgList: any[] = [];
  if (Array.isArray(raw)) {
    msgList = raw;
  } else if (Array.isArray(raw.messages)) {
    msgList = raw.messages;
  } else if (Array.isArray(raw.etatservice)) {
    msgList = raw.etatservice;
  } else if (Array.isArray(raw.data)) {
    msgList = raw.data;
  } else if (raw.messages && typeof raw.messages === 'object') {
    msgList = Object.values(raw.messages);
  }

  for (const item of msgList) {
    if (!item) continue;

    // Determine target line(s)
    const lineKey = String(
      item.ligne || item.line || item.route_id || item.codeLigne || item.idLigne || ''
    ).trim();

    const title = String(item.titre || item.title || item.header || '').trim();
    const message = String(
      item.message || item.texte || item.corps || item.description || item.detail || title
    ).trim();
    const fullText = `${title} ${message}`.toLowerCase();

    // Check if this pertains to Montreal Metro
    const targetLineIds: string[] = [];
    if (lineKey === '1' || fullText.includes('ligne 1') || fullText.includes('verte') || fullText.includes('green')) {
      targetLineIds.push('1');
    }
    if (lineKey === '2' || fullText.includes('ligne 2') || fullText.includes('orange')) {
      targetLineIds.push('2');
    }
    if (lineKey === '4' || fullText.includes('ligne 4') || fullText.includes('jaune') || fullText.includes('yellow')) {
      targetLineIds.push('4');
    }
    if (lineKey === '5' || fullText.includes('ligne 5') || fullText.includes('bleue') || fullText.includes('blue')) {
      targetLineIds.push('5');
    }

    if (targetLineIds.length === 0) continue;

    // Detect status & severity
    const isInterrupted =
      fullText.includes('interruption') ||
      fullText.includes('interrompu') ||
      fullText.includes('arrêt de service') ||
      fullText.includes('aucun service') ||
      fullText.includes('panne') ||
      fullText.includes('fermeture');

    const isDisrupted =
      !isInterrupted &&
      (fullText.includes('ralentissement') ||
        fullText.includes('ralenti') ||
        fullText.includes('retard') ||
        fullText.includes('perturbation') ||
        fullText.includes('intervalle prolongé') ||
        fullText.includes('délai'));

    for (const lid of targetLineIds) {
      const lineMeta = MONTREAL_METRO_LINES.find((l) => l.id === lid);
      const lineName = lineMeta ? lineMeta.displayName : lid;

      if (isInterrupted) {
        const closedStations = extractClosedStations(message, catalog);
        const reportTitle = closedStations.length > 0
          ? `Ligne ${lid} - ${lineName} (Interruption partielle)`
          : `Ligne ${lid} - ${lineName} (Interruption de service)`;

        result[lid] = {
          lineId: lid,
          status: 'interrupted',
          severity: 'alert',
          title: reportTitle,
          message: message || 'Interruption de service sur la ligne.',
          updatedAt: item.date || item.updatedAt || nowIso,
          closedStations: closedStations.length > 0 ? closedStations : undefined
        };
      } else if (isDisrupted) {
        result[lid] = {
          lineId: lid,
          status: 'disrupted',
          severity: 'warning',
          title: `Ligne ${lid} - ${lineName} (Ralentissement)`,
          message: message || 'Ralentissement de service.',
          updatedAt: item.date || item.updatedAt || nowIso
        };
      }
    }
  }

  return result;
}

// Global lambda cache
let cachedSnapshot: StmSnapshot | null = null;
let lastFetchEpoch = 0;
let backoffMultiplier = 1;
const DEFAULT_POLL_INTERVAL_S = 120; // 2 minutes

export async function fetchStmEtatService(
  apiKey: string,
  origin: string
): Promise<{ statusCode: number; data?: any; error?: string }> {
  const url = 'https://api.stm.info/pub/od/i3/v1/messages/etatservice/';

  return new Promise((resolve) => {
    const req = https.request(
      url,
      {
        method: 'GET',
        headers: {
          apikey: apiKey,
          origin: origin,
          Accept: 'application/json',
          'User-Agent': 'ParisSubway3D-StmRelay/1.0'
        },
        timeout: 10000
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(body);
              resolve({ statusCode: res.statusCode, data: parsed });
            } catch (e: any) {
              resolve({ statusCode: res.statusCode, error: `Invalid JSON: ${e.message}` });
            }
          } else {
            resolve({
              statusCode: res.statusCode || 500,
              error: `STM API returned HTTP ${res.statusCode}: ${body.slice(0, 200)}`
            });
          }
        });
      }
    );

    req.on('error', (err) => {
      resolve({ statusCode: 500, error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ statusCode: 504, error: 'STM API request timeout' });
    });

    req.end();
  });
}

export const handler = async (event: any, context: any) => {
  const now = Date.now();
  const apiKey = (process.env.STM_API_KEY || '').trim();
  const origin = (process.env.STM_ORIGIN || 'https://parisian3dsubway.netlify.app').trim();

  // 1. Operating hours check (Dynamic GTFS Montreal)
  const isOperating = isMontrealMetroServiceHours(new Date());
  if (!isOperating) {
    const overnightSnapshot: StmSnapshot = {
      producedAt: new Date().toISOString(),
      timestamp: now,
      validUntil: now + 300 * 1000, // 5 min cache
      feedHealthy: true,
      serviceActive: false,
      serviceMessage: 'Service terminé sur le réseau STM (reprise à 05h30)',
      lastError: null,
      trafficByLine: parseStmEtatService(null)
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=120, s-maxage=300',
        'X-STM-Healthy': 'true',
        'X-STM-Operating': 'false'
      },
      body: JSON.stringify(overnightSnapshot)
    };
  }

  // 2. Cache validity check
  if (cachedSnapshot && now < cachedSnapshot.validUntil) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=60, s-maxage=120',
        'X-STM-Healthy': cachedSnapshot.feedHealthy ? 'true' : 'false',
        'X-STM-Cached': 'true'
      },
      body: JSON.stringify(cachedSnapshot)
    };
  }

  // 3. Graceful degradation if STM_API_KEY is not configured
  if (!apiKey) {
    const nominalSnapshot: StmSnapshot = {
      producedAt: new Date().toISOString(),
      timestamp: now,
      validUntil: now + DEFAULT_POLL_INTERVAL_S * 1000,
      feedHealthy: false,
      serviceActive: true,
      serviceMessage: 'STM_API_KEY non configurée (mode théorique GTFS nominal actif)',
      lastError: 'STM_API_KEY non configurée',
      trafficByLine: parseStmEtatService(null)
    };
    cachedSnapshot = nominalSnapshot;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=60, s-maxage=120',
        'X-STM-Healthy': 'false',
        'X-STM-Reason': 'no-key'
      },
      body: JSON.stringify(nominalSnapshot)
    };
  }

  // 4. Query STM i3 API
  const res = await fetchStmEtatService(apiKey, origin);

  if (res.statusCode === 200 && res.data) {
    backoffMultiplier = 1;
    const trafficByLine = parseStmEtatService(res.data);
    const newSnapshot: StmSnapshot = {
      producedAt: new Date().toISOString(),
      timestamp: now,
      validUntil: now + DEFAULT_POLL_INTERVAL_S * 1000,
      feedHealthy: true,
      serviceActive: true,
      lastError: null,
      trafficByLine
    };
    cachedSnapshot = newSnapshot;
    lastFetchEpoch = now;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=60, s-maxage=120',
        'X-STM-Healthy': 'true'
      },
      body: JSON.stringify(newSnapshot)
    };
  }

  // 5. Failure / Backoff handling (429 or 5xx)
  backoffMultiplier = Math.min(8, backoffMultiplier * 2);
  const backoffS = DEFAULT_POLL_INTERVAL_S * backoffMultiplier;

  if (cachedSnapshot) {
    cachedSnapshot.feedHealthy = false;
    cachedSnapshot.lastError = res.error || `STM HTTP ${res.statusCode}`;
    cachedSnapshot.validUntil = now + backoffS * 1000;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=30, s-maxage=60',
        'X-STM-Healthy': 'false',
        'X-STM-Degraded': 'true'
      },
      body: JSON.stringify(cachedSnapshot)
    };
  }

  // Degraded fallback when no cache exists yet
  const fallbackSnapshot: StmSnapshot = {
    producedAt: new Date().toISOString(),
    timestamp: now,
    validUntil: now + backoffS * 1000,
    feedHealthy: false,
    serviceActive: true,
    lastError: res.error || `STM HTTP ${res.statusCode}`,
    trafficByLine: parseStmEtatService(null)
  };
  cachedSnapshot = fallbackSnapshot;

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=30, s-maxage=60',
      'X-STM-Healthy': 'false'
    },
    body: JSON.stringify(fallbackSnapshot)
  };
};
