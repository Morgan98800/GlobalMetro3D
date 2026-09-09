import { TrainState, CompactTrainDelta } from "./train";

export type SeverityLevel = "info" | "warning" | "interrupted";

export interface TrafficAlert {
  id: string;
  line: string;
  title: string;
  message: string;
  severity: SeverityLevel;
  updated_at: number;
}

export interface SnapshotMessage {
  t: "snapshot";
  ts: number;
  trains: TrainState[];
  alerts?: TrafficAlert[];
}

export interface DeltaMessage {
  t: "delta";
  ts: number;
  upd: TrainState[] | CompactTrainDelta[];
  del: string[];
}

export interface AlertMessage {
  t: "alert";
  ts: number;
  alert: TrafficAlert;
}

export type ServerMessage = SnapshotMessage | DeltaMessage | AlertMessage;

export interface SubscribeMessage {
  t: "sub";
  bbox?: [number, number, number, number];
  zoom?: number;
  line?: string;
  trainId?: string;
}

export interface PingMessage {
  t: "ping";
  ts: number;
}

export type ClientMessage = SubscribeMessage | PingMessage;
