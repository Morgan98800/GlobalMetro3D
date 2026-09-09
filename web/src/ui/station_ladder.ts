import type { TrainMarker } from '../map/trains_layer';

export interface StationLadderNode {
  id: string;
  name: string;
  distance_m: number;
  coordinates: [number, number];
  is_hub: boolean;
  transfers: Array<{
    id: string;
    short_name: string;
    color: string;
    text_color: string;
  }>;
}

export interface DirectionData {
  terminus: string;
  origin: string;
  stations: StationLadderNode[];
  branches?: Array<{
    terminus: string;
    stations: StationLadderNode[];
  }>;
}

export interface LineLadderData {
  id: string;
  short_name: string;
  color: string;
  text_color: string;
  directions: Record<string, DirectionData>;
}

export class StationLadder {
  private containerEl: HTMLElement;
  private lineData: LineLadderData | null = null;
  private currentDirectionId: string = '0';
  private currentTrains: TrainMarker[] = [];
  private onStationClick: (coords: [number, number], name: string) => void;
  private onTrainClick: (train: TrainMarker) => void;
  private onLineSwitch: (lineId: string) => void;
  private onDirectionChange: (dirId: string) => void;
  private onClose: () => void;

  constructor(options: {
    containerId: string;
    onStationClick: (coords: [number, number], name: string) => void;
    onTrainClick: (train: TrainMarker) => void;
    onLineSwitch: (lineId: string) => void;
    onDirectionChange: (dirId: string) => void;
    onClose: () => void;
  }) {
    this.containerEl = document.getElementById(options.containerId)!;
    this.onStationClick = options.onStationClick;
    this.onTrainClick = options.onTrainClick;
    this.onLineSwitch = options.onLineSwitch;
    this.onDirectionChange = options.onDirectionChange;
    this.onClose = options.onClose;
  }

  public setLine(line: LineLadderData | null, directionId: string = '0') {
    this.lineData = line;
    this.currentDirectionId = directionId;
    this.render();
  }

  public updateTrains(trains: TrainMarker[]) {
    this.currentTrains = trains;
    if (this.lineData) {
      this.updateTrainPositions();
      this.updateHeadwayMetrics();
    }
  }

  public getDirection(): string {
    return this.currentDirectionId;
  }

  private calculateHeadway(): { avgHeadwayS: number; trainCount: number } {
    if (!this.lineData) return { avgHeadwayS: 0, trainCount: 0 };
    const dir = parseInt(this.currentDirectionId, 10);
    const lineTrains = this.currentTrains.filter(
      t => t.line === this.lineData!.id && (dir === 0 || dir === 1 ? (t as any).dir === dir : true)
    );

    if (lineTrains.length < 2) {
      return { avgHeadwayS: 0, trainCount: lineTrains.length };
    }

    // Estimate commercial duration of line in seconds
    const dirData = this.lineData.directions[this.currentDirectionId];
    if (!dirData || dirData.stations.length < 2) {
      return { avgHeadwayS: 0, trainCount: lineTrains.length };
    }
    const totDist = dirData.stations[dirData.stations.length - 1].distance_m;
    // Average speed ~30 km/h = 8.33 m/s
    const approxDurationS = totDist / 8.33;
    const avgHeadwayS = Math.round(approxDurationS / lineTrains.length);

    return { avgHeadwayS, trainCount: lineTrains.length };
  }

  private render() {
    if (!this.lineData) {
      this.containerEl.innerHTML = '';
      return;
    }

    const { short_name, color, text_color, directions } = this.lineData;
    const dirData = directions[this.currentDirectionId] || directions['0'];
    if (!dirData) return;

    const { avgHeadwayS, trainCount } = this.calculateHeadway();
    const headwayText =
      avgHeadwayS > 0
        ? `${Math.floor(avgHeadwayS / 60)} min ${String(avgHeadwayS % 60).padStart(2, '0')} s`
        : 'Calcul...';

    // Direction labels
    const dir0 = directions['0'];
    const dir1 = directions['1'];

    let html = `
      <div class="ladder-header" style="border-left: 4px solid ${color};">
        <div class="ladder-title-row">
          <div class="ladder-badge" style="background-color: ${color}; color: ${text_color};">
            ${short_name}
          </div>
          <div class="ladder-info">
            <div class="ladder-line-title">Ligne ${short_name}</div>
            <div class="ladder-dest-sub">Terminus : <strong>${dirData.terminus}</strong></div>
          </div>
          <button class="ladder-close-btn" id="ladder-close-btn" title="Retour au réseau global">✕</button>
        </div>

        <!-- Direction Switcher Tabs -->
        <div class="ladder-dir-tabs">
          ${
            dir0
              ? `<button class="ladder-dir-tab ${this.currentDirectionId === '0' ? 'active' : ''}" data-dir="0" style="${this.currentDirectionId === '0' ? `border-color: ${color}; color: ${color};` : ''}">
                  → ${dir0.terminus}
                </button>`
              : ''
          }
          ${
            dir1
              ? `<button class="ladder-dir-tab ${this.currentDirectionId === '1' ? 'active' : ''}" data-dir="1" style="${this.currentDirectionId === '1' ? `border-color: ${color}; color: ${color};` : ''}">
                  → ${dir1.terminus}
                </button>`
              : ''
          }
        </div>

        <!-- Live Metrics Bar -->
        <div class="ladder-metrics-bar">
          <div class="ladder-metric">
            <span class="ladder-metric-val" id="ladder-train-count">${trainCount}</span>
            <span class="ladder-metric-lbl">rames</span>
          </div>
          <div class="ladder-metric">
            <span class="ladder-metric-val" id="ladder-headway-val">${headwayText}</span>
            <span class="ladder-metric-lbl">intervalle moyen</span>
          </div>
        </div>
      </div>

      <!-- Vertical Station Track -->
      <div class="ladder-track-container" id="ladder-track-container">
        <div class="ladder-track-line" style="background-color: ${color};"></div>
        <div class="ladder-stations-list" id="ladder-stations-list">
    `;

    for (let i = 0; i < dirData.stations.length; i++) {
      const st = dirData.stations[i];
      const isFirst = i === 0;
      const isLast = i === dirData.stations.length - 1;

      html += `
        <div class="ladder-station-node" data-station-name="${st.name}" data-station-idx="${i}" data-lat="${st.coordinates[1]}" data-lng="${st.coordinates[0]}">
          <div class="ladder-node-bullet ${isFirst || isLast ? 'terminus' : ''} ${st.is_hub ? 'hub' : ''}" style="border-color: ${color};">
            <div class="ladder-node-inner" style="background-color: ${isFirst || isLast || st.is_hub ? color : 'var(--fonte-surface)'};"></div>
          </div>
          <div class="ladder-node-details">
            <span class="ladder-node-name ${st.is_hub ? 'bold' : ''}">${st.name}</span>
            <div class="ladder-node-transfers">
              ${st.transfers
                .map(
                  t => `
                <button class="pill-mini transfer-pill" data-transfer-id="${t.id}" style="background-color: ${t.color}; color: ${t.text_color};" title="Correspondance Ligne ${t.short_name}">
                  ${t.short_name}
                </button>
              `
                )
                .join('')}
            </div>
          </div>
          <div class="ladder-node-train-slot" id="slot-station-${i}"></div>
        </div>
      `;
    }

    html += `
        </div>
      </div>
    `;

    this.containerEl.innerHTML = html;
    this.bindEvents();
    this.updateTrainPositions();
  }

  private bindEvents() {
    // Close button
    const closeBtn = document.getElementById('ladder-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.onClose());
    }

    // Direction switcher tabs
    const dirTabs = this.containerEl.querySelectorAll('.ladder-dir-tab');
    dirTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const dir = (tab as HTMLElement).dataset.dir;
        if (dir && dir !== this.currentDirectionId) {
          this.currentDirectionId = dir;
          this.onDirectionChange(dir);
          this.render();
        }
      });
    });

    // Station nodes click
    const nodes = this.containerEl.querySelectorAll('.ladder-station-node');
    nodes.forEach(node => {
      node.addEventListener('click', (e) => {
        // If clicked on transfer pill, ignore station click
        if ((e.target as HTMLElement).classList.contains('transfer-pill')) return;
        const lat = parseFloat((node as HTMLElement).dataset.lat || '0');
        const lng = parseFloat((node as HTMLElement).dataset.lng || '0');
        const name = (node as HTMLElement).dataset.stationName || '';
        if (lat && lng) {
          this.onStationClick([lng, lat], name);
        }
      });
    });

    // Transfer pill click
    const pills = this.containerEl.querySelectorAll('.transfer-pill');
    pills.forEach(pill => {
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetLineId = (pill as HTMLElement).dataset.transferId;
        if (targetLineId) {
          this.onLineSwitch(targetLineId);
        }
      });
    });
  }

  private updateHeadwayMetrics() {
    const { avgHeadwayS, trainCount } = this.calculateHeadway();
    const countEl = document.getElementById('ladder-train-count');
    const headwayEl = document.getElementById('ladder-headway-val');
    if (countEl) countEl.textContent = String(trainCount);
    if (headwayEl) {
      headwayEl.textContent =
        avgHeadwayS > 0
          ? `${Math.floor(avgHeadwayS / 60)} min ${String(avgHeadwayS % 60).padStart(2, '0')} s`
          : 'Calcul...';
    }
  }

  private updateTrainPositions() {
    if (!this.lineData) return;
    const dirData = this.lineData.directions[this.currentDirectionId];
    if (!dirData) return;

    // Clear all existing slots
    for (let i = 0; i < dirData.stations.length; i++) {
      const slot = document.getElementById(`slot-station-${i}`);
      if (slot) slot.innerHTML = '';
    }

    // Filter trains on this line
    const dirInt = parseInt(this.currentDirectionId, 10);
    const activeLineTrains = this.currentTrains.filter(
      t => t.line === this.lineData!.id && ((t as any).dir === undefined || (t as any).dir === dirInt)
    );

    // Map each train to its closest station or inter-station slot
    for (const tr of activeLineTrains) {
      let matchedIdx = -1;

      // 1. Try to match by station next name
      const trNextLower = tr.next?.toLowerCase() || '';
      for (let i = 0; i < dirData.stations.length; i++) {
        if (dirData.stations[i].name.toLowerCase() === trNextLower) {
          matchedIdx = i;
          break;
        }
      }

      if (matchedIdx >= 0) {
        const slot = document.getElementById(`slot-station-${matchedIdx}`);
        if (slot) {
          const delayBadge =
            tr.delay === 0
              ? '<span class="train-cursor-delay on-time">À l\'heure</span>'
              : tr.delay > 0
              ? `<span class="train-cursor-delay late">+${Math.round(tr.delay / 60)}m</span>`
              : `<span class="train-cursor-delay early">-${Math.round(Math.abs(tr.delay) / 60)}m</span>`;

          const cursor = document.createElement('div');
          cursor.className = 'ladder-train-cursor';
          cursor.title = `Rame en approche de ${dirData.stations[matchedIdx].name} (${tr.spd} km/h)`;
          cursor.innerHTML = `
            <div class="train-cursor-pulse"></div>
            <div class="train-cursor-body">
              <span class="train-cursor-spd">${tr.spd} km/h</span>
              ${delayBadge}
            </div>
          `;
          cursor.addEventListener('click', (e) => {
            e.stopPropagation();
            this.onTrainClick(tr);
          });
          slot.appendChild(cursor);
        }
      }
    }
  }
}
