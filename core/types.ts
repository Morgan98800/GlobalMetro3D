export interface LineMetadata {
  id: string;
  short_name: string;
  long_name: string;
  color: string;
  text_color: string;
  mode: "metro" | "tram" | "rail";
  destinations: {
    "0": string;
    "1": string;
  };
  measured_length_km: number;
  elevation_offset: number;
}

export interface StationMetadata {
  id: string;
  name: string;
  coordinates: [number, number]; // [lng, lat]
  lines: string[];
  is_hub: boolean;
  wheelchair_boarding: number;
  service_counts?: {
    weekday: number;
    saturday: number;
    sunday: number;
  };
  service_rank?: {
    weekday: number | null;
    saturday: number | null;
    sunday: number | null;
  };
  service_rank_by_line?: Record<string, Record<string, number>>;
}

export interface LineTrafficReport {
  lineId: string;
  status: 'normal' | 'disrupted' | 'interrupted';
  severity: 'normal' | 'info' | 'warning' | 'alert';
  title: string;
  message: string;
  updatedAt: string;
  closedStations?: string[];
}

