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
  private static readonly COLLAPSED_STORAGE_KEY = 'paris-subway-dock-collapsed';
  private dockEl: HTMLElement;
  private linesGridEl: HTMLElement;
  private dockContentEl: HTMLElement;
  private resetBtnEl: HTMLElement;
  private collapseBtnEl: HTMLButtonElement;
  private handleEl: HTMLElement | null;
  private sheetState: 'closed' | 'open' = 'closed';
  private sheetDragStartY = 0;
  private sheetDragStartHeight = 0;
  private sheetDragging = false;
  private suppressSheetClick = false;
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
  private serviceStatus: DockServiceStatus | null = null;
  private realtimeAvailable = false;
  private rollingStockDb: RollingStockDatabase | null = null;
  private latestTrains: TrainMarker[] = [];
  private trafficByLine: Record<string, LineTrafficReport> = {};
  private collapsed = false;
  private hideResetWhileClosed = false;

  private syncCollapsedState() {
    this.dockEl.classList.toggle('dock--collapsed', this.collapsed);
    this.collapseBtnEl.setAttribute('aria-expanded', String(!this.collapsed));
    this.collapseBtnEl.setAttribute('aria-label', this.collapsed ? 'Déployer le panneau' : 'Réduire le panneau');
    this.collapseBtnEl.setAttribute('title', this.collapsed ? 'Déployer le panneau' : 'Réduire le panneau');
    this.resetBtnEl.style.display = this.selectedLineId && !this.collapsed && !this.hideResetWhileClosed ? 'flex' : 'none';
    this.collapseBtnEl.innerHTML = this.collapsed
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>';
  }

  private setSheetState(state: 'closed' | 'open') {
    this.sheetState = state;
    this.dockEl.dataset.sheet = state;
    if (state !== 'closed') this.collapsed = false;
    this.syncCollapsedState();
  }

  constructor(options: {
    onLineSelect: (lineId: string | null, dir?: string) => void;
    onStationClick: (station: StationMetadata) => void;
    onTrainClick: (train: TrainMarker) => void;
    rollingStockDb?: RollingStockDatabase;
    onRecordsOpen?: () => void;
  }) {
    this.dockEl = document.getElementById('dock')!;
    this.linesGridEl = document.getElementById('lines-grid')!;
    this.dockContentEl = document.getElementById('dock-content')!;
    this.resetBtnEl = document.getElementById('dock-reset')!;
    this.collapseBtnEl = document.getElementById('dock-collapse') as HTMLButtonElement;
    this.handleEl = document.getElementById('dock-handle');
    this.collapsed = window.matchMedia('(max-width: 768px)').matches
      ? false
      : localStorage.getItem(SubwayDock.COLLAPSED_STORAGE_KEY) === 'true';
    this.syncCollapsedState();
    this.onLineSelect = options.onLineSelect;
    this.onStationClick = options.onStationClick;
    this.onTrainClick = options.onTrainClick;
    this.rollingStockDb = options.rollingStockDb || null;
    this.onRecordsOpen = options.onRecordsOpen;

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
    // Boucle d'animation 10 Hz : les vitesses des rames évoluent en continu
    // entre les ticks du moteur (1 Hz) pour un rendu fluide.
    this.stationLadder.startAnimation();

    this.resetBtnEl.addEventListener('click', () => {
      this.selectLine(null);
    });

    this.collapseBtnEl.addEventListener('click', () => {
      this.collapsed = !this.collapsed;
      localStorage.setItem(SubwayDock.COLLAPSED_STORAGE_KEY, String(this.collapsed));
      this.syncCollapsedState();
    });

    this.setupInteractivity();
    this.renderContent();
  }

  private setupInteractivity() {
    this.dockEl.dataset.sheet = this.sheetState;

    const onPointerStart = (clientY: number) => {
      this.sheetDragStartY = clientY;
      this.sheetDragStartHeight = this.dockEl.getBoundingClientRect().height;
      this.sheetDragging = true;
      this.suppressSheetClick = false;
      this.dockEl.dataset.dragging = 'true';
    };
    const onPointerMove = (clientY: number) => {
      if (!this.sheetDragging) return;
      const deltaY = this.sheetDragStartY - clientY;
      const newHeight = Math.min(window.innerHeight * 0.56, Math.max(window.innerHeight * 0.3, this.sheetDragStartHeight + deltaY));
      this.dockEl.style.height = `${newHeight}px`;
    };
    const onPointerEnd = () => {
      if (!this.sheetDragging) return;
      const currentHeight = this.dockEl.getBoundingClientRect().height;
      const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const heights = { closed: rootFontSize * 3.5, open: window.innerHeight * 0.56 };
      const nearest = (Object.keys(heights) as Array<'closed' | 'open'>)
        .sort((a, b) => Math.abs(heights[a] - currentHeight) - Math.abs(heights[b] - currentHeight))[0];
      this.suppressSheetClick = Math.abs(currentHeight - this.sheetDragStartHeight) > 8;
      this.sheetDragging = false;
      delete this.dockEl.dataset.dragging;
      this.dockEl.style.height = '';
      this.setSheetState(nearest);
    };
    const start = (event: PointerEvent) => onPointerStart(event.clientY);
    const move = (event: PointerEvent) => onPointerMove(event.clientY);
    const end = () => onPointerEnd();
    this.handleEl?.addEventListener('pointerdown', start);
    this.dockEl.addEventListener('pointermove', move);
    this.dockEl.addEventListener('pointerup', end);
    this.dockEl.addEventListener('pointercancel', end);
    this.handleEl?.addEventListener('click', () => {
      if (this.suppressSheetClick) {
        this.suppressSheetClick = false;
        return;
      }
      if (!this.sheetDragging) {
        if (this.sheetState === 'closed') {
          this.hideResetWhileClosed = false;
          this.setSheetState('open');
        } else {
          this.hideResetWhileClosed = true;
          this.setSheetState('closed');
        }
      }
    });
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
    if (this.selectedLineId === lineId && this.selectedDir === dir) {
      if (lineId && window.matchMedia('(max-width: 768px)').matches && this.sheetState === 'closed') {
        this.hideResetWhileClosed = false;
        this.setSheetState('open');
      }
      return;
    }
    this.selectedLineId = lineId;
    this.selectedDir = dir;
    this.setGridSelected?.(lineId);
    this.hideResetWhileClosed = false;
    this.resetBtnEl.style.display = lineId && !this.collapsed ? 'flex' : 'none';
    this.dockEl.classList.toggle('has-selection', Boolean(lineId));
    this.renderContent();
    if (lineId && window.matchMedia('(max-width: 768px)').matches) {
      this.setSheetState('open');
    }
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
      // Même contrat clavier que .ladder-station-node : div cliquable, donc
      // role + tabindex + Entrée/Espace, sinon la ligne est inutilisable
      // au clavier (LOT 1, point 6).
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.setAttribute('aria-label', `Station ${s.name}`);
      item.innerHTML = `<span class="station-name" title="${s.name}">${s.name}</span>`;
      item.addEventListener('click', () => this.onStationClick(s));
      item.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
        e.preventDefault();
        this.onStationClick(s);
      });
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

    let title = '';
    let message = '';
    if (status.state === 'ended') {
      title = 'Service terminé';
      message = `Premier métro demain à ${status.firstMetroLabel}.`;
    } else if (status.state === 'before_first') {
      title = 'Avant le premier métro';
      message = `Premier métro à ${status.firstMetroLabel}, dans ${formatDuration(status.secondsUntilFirst)}.`;
    }

    this.dockContentEl.replaceChildren();
  }
}
