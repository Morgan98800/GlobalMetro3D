import type { TrainState } from '@paris-subway/shared';

export class SubwayWebSocketClient {
  private url: string;
  private ws: WebSocket | null = null;
  private trainsMap: Map<string, TrainState> = new Map();
  private onTrainsUpdate: (trains: TrainState[]) => void;
  private onStatusChange: (status: 'connected' | 'reconnecting' | 'disconnected') => void;
  private reconnectTimer: any = null;

  constructor(options: {
    url?: string;
    onTrainsUpdate: (trains: TrainState[]) => void;
    onStatusChange: (status: 'connected' | 'reconnecting' | 'disconnected') => void;
  }) {
    // Default to local engine or window origin
    const host = window.location.hostname === 'localhost' ? 'localhost:4000' : 'localhost:4000';
    this.url = options.url || `ws://${host}`;
    this.onTrainsUpdate = options.onTrainsUpdate;
    this.onStatusChange = options.onStatusChange;
  }

  public connect() {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[ws] Connected to Subway Engine at', this.url);
        this.onStatusChange('connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.t === 'snapshot') {
            this.trainsMap.clear();
            for (const train of msg.trains) {
              this.trainsMap.set(train.id, train);
            }
            this.onTrainsUpdate(Array.from(this.trainsMap.values()));
          } else if (msg.t === 'delta') {
            // Update trains
            for (const train of msg.upd) {
              this.trainsMap.set(train.id, train);
            }
            // Delete finished trains
            for (const id of msg.del || []) {
              this.trainsMap.delete(id);
            }
            this.onTrainsUpdate(Array.from(this.trainsMap.values()));
          }
        } catch (e) {
          console.error('[ws] Message parse error:', e);
        }
      };

      this.ws.onclose = () => {
        this.onStatusChange('reconnecting');
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch (e) {
      this.onStatusChange('reconnecting');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log('[ws] Attempting reconnect...');
      this.connect();
    }, 4000);
  }
}
