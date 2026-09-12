export type TrainConfidence = "rt" | "sched";

export interface TrainState {
  id: string;
  line: string;
  dir: 0 | 1;
  pos: [number, number]; // [lng, lat]
  brg: number;
  spd: number;
  delay: number;
  next: string;
  dest: string;
  conf: TrainConfidence;
  stock: string;
}

export type CompactTrainDelta = [
  id: string,
  lng: number,
  lat: number,
  brg: number,
  spd: number,
  delay: number,
  next: string,
  conf: 0 | 1
];
