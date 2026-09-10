import type { LineMetadata, StationMetadata } from '@paris-subway/shared';
import { StationLadder, LineLadderData } from './station_ladder';
import type { TrainMarker } from '../map/trains_layer';
import { lineBadgeGrid, LineLike } from './line_badge';
import type { RollingStockDatabase } from '../sim/rolling_stock';
import { getRollingStockForLine } from '../sim/rolling_stock';
import type { LineTrafficReport } from '../sim/prim_client';

export interface DockServiceStatus {
  state: 'loading' | 'before_first' | 'active' | 'ended';
  firstMetroLabel: string;
  secondsUntilFirst: number;
  nowCivilSeconds: number;
}

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
  private setGridSelected: ((lineId: string | null) => void) | null = null;
  private stationLadder: StationLadder;
  private onLineSelect: (lineId: string | null, dir?: string) => void;
  private onStationClick: (station: StationMetadata) => void;
  private onTrainClick: (train: TrainMarker) => void;
  private onRecordsOpen?: () => void;
  private onMethodOpen?: () => void;
  private serviceStatus: DockServiceStatus | null = null;
  private realtimeAvailable = false;
  private rollingStockDb: RollingStockDatabase | null = null;
  private latestTrains: TrainMarker[] = [];
  private trafficByLine: Record<string, LineTrafficReport> = {};

  constructor(options: {
    onLineSelect: (lineId: string | null, dir?: string) => void;
    onStationClick: (station: StationMetadata) => void;
    onTrainClick: (train: TrainMarker) => void;
    rollingStockDb?: RollingStockDatabase;
    onRecordsOpen?: () => void;
    onMethodOpen?: () => void;
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
    this.rollingStockDb = options.rollingStockDb || null;
    this.onRecordsOpen = options.onRecordsOpen;
    this.onMethodOpen = options.onMethodOpen;

    this.stationLadder = new StationLadder({
      containerId: 'dock-content',
      onStationClick: (coords, name) => {
        const st = this.stations.find(s => s.name === name);
        if (st) this.onStationClick(st);
      },
      onTrainClick: (train) => {
        this.onTrainClick(train);
      },
      onLineSwitch: (lineId) => {
        this.selectLine(lineId);
      }
    });

    this.resetBtnEl.addEventListener('click', () => {
      this.selectLine(null);
    });

    this.setupInteractivity();
    this.renderContent();
  }

  private setupInteractivity() {
    let isCollapsed = false;
    this.collapseBtnEl?.addEventListener('click', () => {
      isCollapsed = !isCollapsed;
      this.dockEl.classList.toggle('dock--collapsed', isCollapsed);
      this.collapseBtnEl?.setAttribute('aria-expanded', String(!isCollapsed));
      this.collapseBtnEl?.setAttribute('aria-label', isCollapsed ? 'Déplier le panneau' : 'Replier le panneau');
    });

    let startY = 0;
    let startHeight = 0;
    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
      startHeight = this.dockEl.getBoundingClientRect().height;
    };
    const onTouchMove = (e: TouchEvent) => {
      const deltaY = startY - e.touches[0].clientY;
      const newH = Math.min(window.innerHeight * 0.85, Math.max(120, startHeight + deltaY));
      this.dockEl.style.height = `${newH}px`;
      document.documentElement.style.setProperty('--dock-height', `${newH}px`);
    };
    this.handleEl?.addEventListener('touchstart', onTouchStart, { passive: true });
    this.handleEl?.addEventListener('touchmove', onTouchMove, { passive: true });
  }

  public setData(
    lines: LineMetadata[],
    stations: StationMetadata[],
    ladders: Record<string, LineLadderData> = {}
  ) {
    this.lines = lines;
    this.stations = stations;
    this.laddersData = ladders;

    const sortMetroLines = (a: LineMetadata, b: LineMetadata) => {
      const numA = parseInt(a.short_name);
      const numB = parseInt(b.short_name);
      if (!isNaN(numA) && !isNaN(numB)) {
        if (numA !== numB) return numA - numB;
      }
      return a.short_name.localeCompare(b.short_name);
    };
    const metroLines = this.lines.filter(line => line.mode === 'metro').sort(sortMetroLines);
    const rerLines = this.lines.filter(line => line.mode === 'rail').sort((a, b) => a.short_name.localeCompare(b.short_name));
    const setters: Array<(lineId: string | null) => void> = [];
    const fragment = document.createDocumentFragment();
    const appendGroup = (label: string, groupLines: LineMetadata[]) => {
      if (!groupLines.length) return;
      const group = document.createElement('section');
      group.className = 'line-group';
      const heading = document.createElement('div');
      heading.className = 'line-group-title';
      heading.textContent = label;
      group.appendChild(heading);
      const lineLikes: LineLike[] = groupLines.map(l => ({
        line_id: l.id,
        short_name: l.short_name,
        route_color: l.color,
        route_text_color: l.text_color
      }));
      const { element, setSelected } = lineBadgeGrid(lineLikes, (lineId) => this.selectLine(lineId));
      element.setAttribute('aria-label', `Lignes ${label}`);
      group.appendChild(element);
      fragment.appendChild(group);
      setters.push(setSelected);
    };
    appendGroup('Métro', metroLines);
    appendGroup('RER', rerLines);
    this.setGridSelected = (lineId) => setters.forEach(setSelected => setSelected(lineId));
    this.linesGridEl.replaceChildren(fragment);
    this.renderContent();
  }

  public setLoadingState(message: string) {
    if (!this.selectedLineId) {
      this.dockContentEl.innerHTML = `<div class="dock-empty-state"><p>${message}</p></div>`;
    }
  }

  public setServiceStatus(status: DockServiceStatus) {
    this.serviceStatus = status;
    if (!this.selectedLineId) this.renderContent();
  }

  public setTraffic(traffic: Record<string, LineTrafficReport>) {
    this.trafficByLine = traffic;
    if (this.selectedLineId) {
      this.renderContent();
    }
  }

  public setRealtimeState(status: any) {
    this.realtimeAvailable =
      status === 'live' || Boolean(status && status.active && (status.minutesAgo ?? 0) <= 10 && status.feedHealthy);
    if (status && status.trafficByLine) {
      this.trafficByLine = status.trafficByLine;
    }
    if (this.selectedLineId) {
      this.refreshRealtimeNotice();
      this.renderContent();
    }
  }

  public updateTrains(trains: TrainMarker[]) {
    this.latestTrains = trains;
    if (this.selectedLineId) {
      const lineTrains = trains.filter(t => t.line === this.selectedLineId);
      this.stationLadder.updateTrains(lineTrains);
      this.updateLineStats();
    }
  }

  public selectLine(lineId: string | null, dir: string = '0') {
    if (this.selectedLineId === lineId && this.selectedDir === dir) return;
    this.selectedLineId = lineId;
    this.selectedDir = dir;
    this.setGridSelected?.(lineId);
    this.resetBtnEl.style.display = lineId ? 'flex' : 'none';
    this.renderContent();
    this.onLineSelect(lineId, dir);
  }

  private renderContent() {
    this.dockContentEl.innerHTML = '';
    if (!this.selectedLineId) {
      this.stationLadder.setLine(null);
      this.renderEmptyState();
      return;
    }
    const line = this.lines.find(l => l.id === this.selectedLineId);
    if (!line) {
      this.stationLadder.setLine(null);
      this.renderEmptyState();
      return;
    }
    const ladder = this.laddersData[this.selectedLineId];
    if (ladder) {
      const lineStations = this.stations.filter(s => s.lines.includes(line.id));
      const lineTrains = this.latestTrains.filter(t => t.line === line.id);
      this.renderLineDetails(line, lineStations);
      this.stationLadder.setLine(ladder, this.selectedDir);
      this.stationLadder.updateTrains(lineTrains);
    } else {
      this.stationLadder.setLine(null);
      this.renderLineStationsList(line);
    }
  }

  private renderLineStationsList(line: LineMetadata) {
    const lineStations = this.stations.filter(s => s.lines.includes(line.id));
    const title = document.createElement('div');
    title.className = 'dock-line-title';
    title.innerHTML = `<span class="dock-badge" style="background:${line.color}; color:${line.text_color};">${line.short_name}</span> ${line.long_name || line.short_name}`;
    const list = document.createElement('div');
    list.className = 'station-list';
    for (const s of lineStations) {
      const item = document.createElement('div');
      item.className = 'station-item';
      item.innerHTML = `<span class="station-name">${s.name}</span>`;
      item.addEventListener('click', () => this.onStationClick(s));
      list.appendChild(item);
    }
    this.dockContentEl.appendChild(title);
    this.dockContentEl.appendChild(list);
  }

  private renderLineDetails(line: LineMetadata, stations: StationMetadata[]) {
    const stock = this.rollingStockDb ? getRollingStockForLine(this.rollingStockDb, line.id) : null;
    const serviceLabel = this.serviceStatus?.state === 'ended'
      ? 'Service terminé'
      : this.serviceStatus?.state === 'before_first'
        ? `Avant le premier métro (${this.serviceStatus.firstMetroLabel})`
        : this.serviceStatus?.state === 'active'
          ? 'Nominal'
          : 'Horaires en cours de chargement';
    const rerConfidence = line.short_name === 'A' || line.short_name === 'B'
      ? '<span class="dock-line-note">RER A/B : qualité des estimations variable selon l’exploitant et le tronçon.</span>'
      : '';

    // Info Trafic display (Respecting --carmin for alerts)
    const traffic = this.trafficByLine[line.id];
    let trafficBlock = '';
    if (traffic && traffic.status !== 'normal') {
      trafficBlock = `
        <div class="dock-traffic-alert dock-traffic-alert--carmin" role="alert">
          <div class="dock-traffic-head">
            <span class="dock-traffic-icon">⚠️</span>
            <strong>${traffic.title}</strong>
          </div>
          <div class="dock-traffic-msg">${traffic.message}</div>
        </div>
      `;
    } else {
      trafficBlock = `
        <div class="dock-traffic-alert dock-traffic-alert--normal">
          <span class="dock-traffic-dot"></span> Trafic normal sur la ligne
        </div>
      `;
    }

    const summary = document.createElement('section');
    summary.className = 'dock-line-summary';
    summary.innerHTML = `
      <div class="dock-line-summary-head">
        <div class="dock-line-summary-title"><span class="dock-line-summary-badge" style="background:${line.color}; color:${line.text_color};">${line.short_name.replace(/bis$/i, 'b')}</span> Indicateurs de la ligne ${line.short_name}</div>
        <button type="button" class="dock-line-close" aria-label="Désélectionner la ligne" title="Retour au réseau global">×</button>
      </div>
      ${trafficBlock}
      <div class="dock-line-directions" role="group" aria-label="Directions de la ligne ${line.short_name}">
        ${(['0', '1'] as const).filter(dir => line.destinations[dir]).map(dir => `
          <button type="button" class="dock-line-direction ${this.selectedDir === dir ? 'active' : ''}" data-dock-dir="${dir}">
            → ${line.destinations[dir]}
          </button>
        `).join('')}
      </div>
      <div class="dock-line-summary-grid">
        <div><span class="dock-stat-label">Rames → ${line.destinations['0'] || 'sens 1'}</span><strong id="dock-line-count-0">0</strong></div>
        <div><span class="dock-stat-label">Rames → ${line.destinations['1'] || 'sens 2'}</span><strong id="dock-line-count-1">0</strong></div>
        <div><span class="dock-stat-label">Intervalle moyen sens 1</span><strong id="dock-line-headway-0">—</strong></div>
        <div><span class="dock-stat-label">Intervalle moyen sens 2</span><strong id="dock-line-headway-1">—</strong></div>
        <div><span class="dock-stat-label">Vitesse moyenne</span><strong id="dock-line-speed">—</strong></div>
        <div><span class="dock-stat-label">Stations · longueur</span><strong>${stations.length.toLocaleString('fr-FR')} · ${line.measured_length_km.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km</strong></div>
        <div><span class="dock-stat-label">Matériel roulant</span><strong>${stock?.name || 'Non renseigné'}</strong></div>
        <div><span class="dock-stat-label">État du service</span><strong id="dock-line-service">${serviceLabel}</strong></div>
      </div>
      ${rerConfidence}
    `;
    summary.querySelector<HTMLButtonElement>('.dock-line-close')?.addEventListener('click', () => this.selectLine(null));
    summary.querySelectorAll<HTMLButtonElement>('[data-dock-dir]').forEach(button => {
      button.addEventListener('click', () => {
        const direction = button.dataset.dockDir;
        if (direction && direction !== this.selectedDir) this.selectLine(this.selectedLineId, direction);
      });
    });
    this.dockContentEl.prepend(summary);
    this.updateLineStats();
  }

  private updateLineStats() {
    if (!this.selectedLineId) return;
    const line = this.lines.find(item => item.id === this.selectedLineId);
    if (!line) return;
    const lineTrains = this.latestTrains.filter(train => train.line === line.id);
    const byDirection = [0, 0];
    const speeds = lineTrains.map(train => train.spd).filter(speed => Number.isFinite(speed));
    for (const train of lineTrains) {
      const direction = train.direction === 1 ? 1 : 0;
      byDirection[direction] += 1;
    }
    const durationSeconds = Math.max(1, (line.measured_length_km / 30) * 3600);
    const formatHeadway = (count: number) => {
      if (!count) return '—';
      const seconds = Math.round(durationSeconds / count);
      return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s`;
    };
    const setText = (id: string, value: string) => {
      const element = this.dockContentEl.querySelector<HTMLElement>(`#${id}`);
      if (element) element.textContent = value;
    };
    setText('dock-line-count-0', String(byDirection[0]));
    setText('dock-line-count-1', String(byDirection[1]));
    setText('dock-line-headway-0', formatHeadway(byDirection[0]));
    setText('dock-line-headway-1', formatHeadway(byDirection[1]));
    setText('dock-line-speed', speeds.length
      ? `${(speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km/h`
      : '—');
    const serviceElement = this.dockContentEl.querySelector<HTMLElement>('#dock-line-service');
    if (serviceElement && this.serviceStatus) {
      serviceElement.textContent = this.serviceStatus.state === 'active'
        ? 'Nominal'
        : this.serviceStatus.state === 'ended'
          ? 'Service terminé'
          : this.serviceStatus.state === 'before_first'
            ? `Avant le premier métro (${this.serviceStatus.firstMetroLabel})`
            : 'Horaires en cours de chargement';
    }
  }

  private renderEmptyState() {
    const status = this.serviceStatus;
    if (!status || status.state === 'loading') {
      this.dockContentEl.innerHTML = `
        <div class="dock-empty-state">
          <p>Chargement des lignes, stations et horaires GTFS…</p>
        </div>
      `;
      return;
    }

    const formatDuration = (seconds: number) => {
      const totalMinutes = Math.max(0, Math.ceil(seconds / 60));
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return hours > 0 ? `${hours} h ${String(minutes).padStart(2, '0')}` : `${minutes} min`;
    };

    let title = 'Service en cours';
    let message = 'Sélectionnez une ligne pour afficher ses stations et son service.';
    if (status.state === 'ended') {
      title = 'Service terminé';
      message = `Premier métro demain à ${status.firstMetroLabel}.`;
    } else if (status.state === 'before_first') {
      title = 'Avant le premier métro';
      message = `Premier métro à ${status.firstMetroLabel}, dans ${formatDuration(status.secondsUntilFirst)}.`;
    }

    const realtimeNotice = this.realtimeAvailable
      ? ''
      : '<p class="dock-feed-note">Flux temps réel indisponible : affichage théorique GTFS.</p>';
    this.dockContentEl.innerHTML = `
      <div class="dock-empty-state">
        <div class="dock-empty-kicker">${title}</div>
        <p>${message}</p>
        ${realtimeNotice}
        <div class="dock-actions-row">
          <button type="button" class="dock-records-btn" id="dock-records">Records du réseau</button>
          <button type="button" class="dock-method-btn" id="dock-method">Méthode & Données</button>
        </div>
      </div>
    `;
    this.dockContentEl.querySelector<HTMLButtonElement>('#dock-records')?.addEventListener('click', () => this.onRecordsOpen?.());
    this.dockContentEl.querySelector<HTMLButtonElement>('#dock-method')?.addEventListener('click', () => this.onMethodOpen?.());
  }

  private refreshRealtimeNotice() {
    this.dockContentEl.querySelector('.dock-feed-note')?.remove();
    if (!this.realtimeAvailable) {
      const note = document.createElement('p');
      note.className = 'dock-feed-note';
      note.textContent = 'Flux temps réel indisponible : affichage théorique GTFS.';
      this.dockContentEl.prepend(note);
    }
  }
}
