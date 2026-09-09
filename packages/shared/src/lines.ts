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
}
