export interface RollingStockModel {
  model_id: string;
  name: string;
  manufacturer: string;
  cars_count: number;
  total_length_m: number;
  car_length_m: number;
  bogie_centres_m?: number;
  width_m: number;
  inter_car_gap_m: number;
  drive_type: 'tire' | 'steel';
  driverless: boolean;
  source: string;
  verified: boolean;
}

export interface LineRollingStock {
  line_id: string;
  short_name: string;
  model_id: string;
  name: string;
  cars_count: number;
  total_length_m: number;
  car_length_m: number;
  bogie_centres_m?: number;
  width_m: number;
  inter_car_gap_m: number;
  drive_type: 'tire' | 'steel';
  driverless: boolean;
  source: string;
  verified: boolean;
}

/** Distance entre pivots de bogies ("corde" rigide) ; valeur de repli si absente des données. */
const DEFAULT_BOGIE_CENTRES_M = 11.0;

export function getBogieCentresM(stock: RollingStockModel | LineRollingStock): number {
  return stock.bogie_centres_m ?? DEFAULT_BOGIE_CENTRES_M;
}

export interface RollingStockDatabase {
  models: Record<string, RollingStockModel>;
  lines: Record<string, LineRollingStock>;
}

export async function loadRollingStock(
  url: string = '/data/rolling-stock.json'
): Promise<RollingStockDatabase> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load rolling stock specifications: ${res.statusText}`);
  }
  const data: RollingStockDatabase = await res.json();

  // Audit verified: false entries and emit warning
  const unverifiedLines: Array<{ short_name: string; model: string; source: string }> = [];
  for (const item of Object.values(data.lines)) {
    if (!item.verified) {
      unverifiedLines.push({
        short_name: item.short_name,
        model: item.name,
        source: item.source
      });
    }
  }

  if (unverifiedLines.length > 0) {
    const listStr = unverifiedLines.map((l) => `Ligne ${l.short_name} (${l.model})`).join(', ');
    console.warn(
      `⚠️ [rolling-stock] Attention: Dimensions non vérifiées sur plan constructeur pour les lignes suivantes (${unverifiedLines.length}/${Object.keys(data.lines).length}) :\n  ${listStr}`
    );
  } else {
    console.log('[rolling-stock] All rolling stock models verified against manufacturer plans.');
  }

  return data;
}

/**
 * Returns rolling stock specification for a line by its IDFM id or short name.
 * Falls back to generic 5-car 75m train if not found.
 */
export function getRollingStockForLine(
  db: RollingStockDatabase,
  lineIdOrShortName: string
): LineRollingStock {
  // Try direct match by short name (e.g. "1", "14", "7bis")
  if (db.lines[lineIdOrShortName]) {
    return db.lines[lineIdOrShortName];
  }

  // Try match by line_id (e.g. "IDFM:C01371")
  for (const lineStock of Object.values(db.lines)) {
    if (lineStock.line_id === lineIdOrShortName) {
      return lineStock;
    }
  }

  // Fallback generic metro
  return {
    line_id: lineIdOrShortName,
    short_name: lineIdOrShortName,
    model_id: 'GENERIC',
    name: 'Matériel standard',
    cars_count: 5,
    total_length_m: 75.0,
    car_length_m: 15.0,
    bogie_centres_m: DEFAULT_BOGIE_CENTRES_M,
    width_m: 2.40,
    inter_car_gap_m: 0.95,
    drive_type: 'steel',
    driverless: false,
    source: 'Gabarit moyen estimé',
    verified: false
  };
}
