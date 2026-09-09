import type { LineMetadata, StationMetadata } from '@paris-subway/shared';
import { StationLadder, LineLadderData } from './station_ladder';
import type { TrainMarker } from '../map/trains_layer';

export class SubwayDock {
  private dockEl: HTMLElement;
  private linesGridEl: HTMLElement;
  private dockContentEl: HTMLElement;
  private resetBtnEl: HTMLElement;
  private handleEl: HTMLElement | null;
  private collapseBtnEl: HTMLElement | null;
  private lines: LineMetadata[] = [];
  private stations: StationMetadata[] = [];
  private laddersData: Record<string, LineLadderData> = {};
  private selectedLineId: string | null = null;
  private selectedDir: string = '0';
  private stationLadder: StationLadder;
  private onLineSelect: (lineId: string | null, dir?: string) => void;
  private onStationClick: (station: StationMetadata) => void;
  private onTrainClick: (train: TrainMarker) => void;

  constructor(options: {
    onLineSelect: (lineId: string | null, dir?: string) => void;
    onStationClick: (station: StationMetadata) => void;
    onTrainClick: (train: TrainMarker) => void;
  }) {
    this.dockEl = document.getElementById('dock')!;
    this.linesGridEl = document.getElementById('lines-grid')!;
    this.dockContentEl = document.getElementById('dock-content')!;
    this.resetBtnEl = document.getElementById('dock-reset')!;
    this.handleEl = document.getElementById('dock-handle');
    this.collapseBtnEl = document.getElementById('dock-collapse');
    this.onLineSelect = options.onLineSelect;
    this.onStationClick = options.onStationClick;
    this.onTrainClick = options.onTrainClick;

    this.stationLadder = new StationLadder({
      containerId: 'dock-content',
      onStationClick: (coords, name) => {
        const st = this.stations.find(s => s.name === name);
        if (st) {
          this.onStationClick(st);
        }
      },
      onTrainClick: (train) => {
        this.onTrainClick(train);
      },
      onLineSwitch: (lineId) => {
        this.selectLine(lineId);
      },
      onDirectionChange: (dirId) => {
        this.selectedDir = dirId;
        this.onLineSelect(this.selectedLineId, dirId);
      },
      onClose: () => {
        this.selectLine(null);
      }
    });

    this.resetBtnEl.addEventListener('click', () => {
      this.selectLine(null);
    });

    const toggleCollapse = () => {
      this.dockEl.classList.toggle('collapsed');
    };

    if (this.handleEl) {
      this.handleEl.addEventListener('click', toggleCollapse);
    }
    if (this.collapseBtnEl) {
      this.collapseBtnEl.addEventListener('click', toggleCollapse);
    }
  }

  public setData(
    lines: LineMetadata[],
    stations: StationMetadata[],
    ladders: Record<string, LineLadderData> = {}
  ) {
    this.lines = lines;
    this.stations = stations;
    this.laddersData = ladders;
    this.renderLinePills();
  }

  public setLaddersData(ladders: Record<string, LineLadderData>) {
    this.laddersData = ladders;
    if (this.selectedLineId && this.laddersData[this.selectedLineId]) {
      this.stationLadder.setLine(this.laddersData[this.selectedLineId], this.selectedDir);
    }
  }

  public updateTrains(trains: TrainMarker[]) {
    this.stationLadder.updateTrains(trains);
  }

  public selectLine(lineId: string | null, dir: string = '0', triggerCallback: boolean = true) {
    this.selectedLineId = lineId;
    this.selectedDir = dir;
    this.updateActivePill();

    if (lineId && this.laddersData[lineId]) {
      this.stationLadder.setLine(this.laddersData[lineId], dir);
      this.dockEl.classList.remove('collapsed');
    } else {
      this.stationLadder.setLine(null);
      this.renderContent();
    }

    this.resetBtnEl.style.display = lineId ? 'inline-block' : 'none';
    if (triggerCallback) {
      this.onLineSelect(lineId, dir);
    }
  }

  private renderLinePills() {
    this.linesGridEl.innerHTML = '';

    // Sort lines: 1..14, 3bis, 7bis
    const sortedLines = [...this.lines].sort((a, b) => {
      const numA = parseInt(a.short_name);
      const numB = parseInt(b.short_name);
      if (!isNaN(numA) && !isNaN(numB)) {
        if (numA !== numB) return numA - numB;
      }
      return a.short_name.localeCompare(b.short_name);
    });

    for (const line of sortedLines) {
      const btn = document.createElement('button');
      btn.className = 'line-badge-btn';
      btn.dataset.lineId = line.id;
      btn.style.backgroundColor = line.color;
      btn.style.color = line.text_color;
      btn.textContent = line.short_name;
      btn.title = `Ligne ${line.short_name} : ${line.long_name}`;

      btn.addEventListener('click', () => {
        if (this.selectedLineId === line.id) {
          this.selectLine(null);
        } else {
          this.selectLine(line.id);
        }
      });

      this.linesGridEl.appendChild(btn);
    }
  }

  private updateActivePill() {
    const buttons = this.linesGridEl.querySelectorAll('.line-badge-btn');
    buttons.forEach((btn: any) => {
      if (btn.dataset.lineId === this.selectedLineId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  private renderContent() {
    if (!this.selectedLineId) {
      this.dockContentEl.innerHTML = `
        <div style="padding: 1rem 0; font-size: 0.8rem; color: var(--ceramique-dim); line-height: 1.5;">
          Sélectionnez une ligne pour filtrer son tracé en 3D et explorer ses stations.
        </div>
      `;
      return;
    }

    const selectedLine = this.lines.find(l => l.id === this.selectedLineId);
    if (!selectedLine) return;

    // Filter stations for this line
    const lineStations = this.stations.filter(s => s.lines.includes(this.selectedLineId!));

    let html = `
      <div style="margin-bottom: 0.75rem; border-bottom: 1px solid var(--fonte-border); padding-bottom: 0.5rem;">
        <div style="font-weight: 600; font-size: 0.95rem; color: var(--ceramique);">
          Ligne ${selectedLine.short_name}
        </div>
        <div style="font-size: 0.75rem; color: var(--ceramique-dim); margin-top: 0.2rem;">
          ${lineStations.length} stations · ${selectedLine.measured_length_km} km
        </div>
        <div style="font-size: 0.7rem; color: var(--laiton); margin-top: 0.2rem;">
          ${selectedLine.destinations['0'] || ''} ↔ ${selectedLine.destinations['1'] || ''}
        </div>
      </div>
      <div class="station-ladder-list">
    `;

    for (const st of lineStations) {
      // Find other lines for transfer badges
      const transfers = st.lines
        .filter(lid => lid !== this.selectedLineId)
        .map(lid => this.lines.find(l => l.id === lid))
        .filter((l): l is LineMetadata => !!l);

      html += `
        <div class="station-item" data-station-id="${st.id}">
          <span class="station-item-name">${st.name}</span>
          <div class="station-item-badges">
            ${transfers.map(t => `
              <span class="pill-mini" style="background-color: ${t.color}; color: ${t.text_color}">
                ${t.short_name}
              </span>
            `).join('')}
          </div>
        </div>
      `;
    }

    html += `</div>`;
    this.dockContentEl.innerHTML = html;

    // Attach click listeners to stations
    const stationItems = this.dockContentEl.querySelectorAll('.station-item');
    stationItems.forEach(item => {
      item.addEventListener('click', () => {
        const sid = (item as HTMLElement).dataset.stationId;
        const st = this.stations.find(s => s.id === sid);
        if (st) {
          this.onStationClick(st);
        }
      });
    });
  }
}
