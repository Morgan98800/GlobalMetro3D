import type { TrainMarker } from '@core/ui/map/trains_layer';

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

  // Animation 10 Hz : on ne reconstruit pas le DOM à chaque tick (clignotement),
  // on interpole la vitesse affichée entre les ticks du moteur (1 Hz).
  private animTimer: number | null = null;
  private lastTickAt = 0;
  // Vitesse cible (km/h) par id de rame, telle que fournie par le moteur.
  private speedTargets = new Map<string, number>();
  // Vitesse affichée courante (km/h) par id de rame, interpolée.
  private speedShown = new Map<string, number>();
  // État « à quai » stable par id de rame (flag booléen, pas recalculé à 10 Hz).
  private atStopState = new Map<string, boolean>();
  private trainCursorElements = new Map<string, HTMLElement>();

  private clampSpeed(speed: number): number {
    if (!Number.isFinite(speed)) return 0;
    return Math.max(0, Math.min(140, speed));
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    }[character] || character));
  }

  private renderSignal(speed: number, dest: string, atQuai: boolean): string {
    const chevron = '<svg class="sig__arrow" viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M3 1l3 3-3 3"/></svg>';
    const safeDest = this.escapeHtml(dest);
    const safeSpeed = this.clampSpeed(speed);
    const content = atQuai
      ? '<span class="sig__dot" aria-hidden="true"></span><span class="sig__quai">à quai</span>'
      : `<span class="sig__num">${Math.round(safeSpeed)}</span><span class="sig__unit">km/h</span>`;
    const color = this.speedColor(safeSpeed);

    return `<span class="sig${atQuai ? ' sig--quai' : ''}" style="--speed-color: ${color}">
      ${content}
      <span class="sig__sep"></span>
      ${chevron}
      <span class="sig__dest">${safeDest}</span>
    </span>`;
  }

  constructor(options: {
    containerId: string;
    onStationClick: (coords: [number, number], name: string) => void;
    onTrainClick: (train: TrainMarker) => void;
    onLineSwitch: (lineId: string) => void;
  }) {
    this.containerEl = document.getElementById(options.containerId)!;
    this.onStationClick = options.onStationClick;
    this.onTrainClick = options.onTrainClick;
    this.onLineSwitch = options.onLineSwitch;
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
    }
  }

  /** Démarre la boucle d'animation 10 Hz (appelé une fois, à la construction). */
  public startAnimation() {
    if (this.animTimer !== null) return;
    this.lastTickAt = performance.now();
    this.animTimer = window.setInterval(() => this.animate(), 100);
  }

  /** Arrête la boucle (nettoyage). */
  public stopAnimation() {
    if (this.animTimer !== null) {
      clearInterval(this.animTimer);
      this.animTimer = null;
    }
  }

  private speedColor(speed: number): string {
    const stops = [
      { speed: 0, color: [217, 70, 60] },
      { speed: 15, color: [242, 142, 66] },
      { speed: 35, color: [213, 201, 0] },
      { speed: 60, color: [110, 202, 151] },
      { speed: 110, color: [70, 180, 220] },
    ];
    const clamped = Math.max(0, Math.min(110, speed));
    const upperIndex = stops.findIndex(stop => stop.speed >= clamped);
    const upper = stops[upperIndex] || stops[stops.length - 1];
    const lower = stops[Math.max(0, upperIndex - 1)];
    const range = upper.speed - lower.speed || 1;
    const ratio = (clamped - lower.speed) / range;
    const rgb = lower.color.map((value, index) => Math.round(value + (upper.color[index] - value) * ratio));
    return `rgb(${rgb.join(', ')})`;
  }

  /** Interpole la vitesse affichée vers la cible, puis met à jour le DOM. */
  private animate() {
    if (document.hidden || !this.lineData || !this.containerEl.offsetParent) return;
    const now = performance.now();
    const dt = Math.min((now - this.lastTickAt) / 1000, 0.5);
    this.lastTickAt = now;

    // Lissage exponentiel : on se rapproche de la cible sans saut.
    const k = 1 - Math.exp(-dt * 6); // ~converge en ~0.5 s

    for (const [id, target] of this.speedTargets) {
      const shown = this.speedShown.get(id) ?? target;
      const next = this.clampSpeed(shown + (target - shown) * k);
      this.speedShown.set(id, next);
      const cursor = this.trainCursorElements.get(id);
      const el = cursor?.querySelector<HTMLElement>('.sig__num, .sig__quai');
      if (el) {
        const atStop = this.atStopState.get(id) ?? false;
        const signal = el.closest<HTMLElement>('.sig');
        cursor?.classList.toggle('ladder-train-cursor--quai', atStop);
        signal?.classList.toggle('sig--quai', atStop);
        el.className = atStop ? 'sig__quai' : 'sig__num';
        el.textContent = atStop ? 'à quai' : `${Math.round(next)}`;
        if (!atStop) signal?.style.setProperty('--speed-color', this.speedColor(next));
        const unit = signal?.querySelector<HTMLElement>('.sig__unit');
        unit?.classList.toggle('hidden', atStop);
        const dot = signal?.querySelector<HTMLElement>('.sig__dot');
        if (dot) dot.hidden = !atStop;
      }
    }
  }

  private render() {
    if (!this.lineData) {
      this.containerEl.innerHTML = '';
      return;
    }

    const { color, directions } = this.lineData;
    const dirData = directions[this.currentDirectionId] || directions['0'];
    if (!dirData) return;

    let html = `
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
        <div class="ladder-station-node" role="button" tabindex="0" aria-label="Station ${st.name}" data-station-name="${st.name}" data-station-idx="${i}" data-lat="${st.coordinates[1]}" data-lng="${st.coordinates[0]}">
          <div class="ladder-node-bullet ${isFirst || isLast ? 'terminus' : ''} ${st.is_hub ? 'hub' : ''}" style="border-color: ${color};">
            <div class="ladder-node-inner" style="background-color: ${isFirst || isLast || st.is_hub ? color : 'var(--fonte-surface)'};"></div>
          </div>
          <div class="ladder-node-details">
            <span class="ladder-node-name ${st.is_hub ? 'bold' : ''}" title="${st.name}">${st.name}</span>
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
    this.trainCursorElements.clear();
    this.bindEvents();
    this.updateTrainPositions();
  }

  private bindEvents() {
    // Activation d'une station : partagée entre souris et clavier.
    const activateNode = (node: HTMLElement) => {
      const lat = parseFloat(node.dataset.lat || '0');
      const lng = parseFloat(node.dataset.lng || '0');
      const name = node.dataset.stationName || '';
      if (lat && lng) {
        this.onStationClick([lng, lat], name);
      }
    };

    // Station nodes click
    const nodes = this.containerEl.querySelectorAll('.ladder-station-node');
    nodes.forEach(node => {
      node.addEventListener('click', (e) => {
        // If clicked on transfer pill, ignore station click
        if ((e.target as HTMLElement).classList.contains('transfer-pill')) return;
        activateNode(node as HTMLElement);
      });

      // Les noeuds sont des role="button" : ils doivent s'activer à Entrée
      // et à Espace (Espace est neutralisé pour ne pas faire défiler le tiroir).
      node.addEventListener('keydown', (e) => {
        const ke = e as KeyboardEvent;
        if (ke.key !== 'Enter' && ke.key !== ' ' && ke.key !== 'Spacebar') return;
        if ((ke.target as HTMLElement).classList.contains('transfer-pill')) return;
        ke.preventDefault();
        activateNode(node as HTMLElement);
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

  private geoDistanceM(c1: [number, number], c2: [number, number]): number {
    const dLng = (c2[0] - c1[0]) * Math.cos(((c1[1] + c2[1]) / 2) * Math.PI / 180) * 111320;
    const dLat = (c2[1] - c1[1]) * 110574;
    return Math.sqrt(dLng * dLng + dLat * dLat);
  }

  private updateTrainPositions() {
    if (!this.lineData) return;
    const dirData = this.lineData.directions[this.currentDirectionId] || this.lineData.directions['0'];
    if (!dirData) return;

    // Filter trains on this line and direction
    const dirInt = parseInt(this.currentDirectionId, 10);
    const activeLineTrains = this.currentTrains.filter(t => {
      if (t.line !== this.lineData!.id) return false;
      const trainDir = t.direction !== undefined ? t.direction : (t as any).dir;
      return trainDir === undefined || trainDir === dirInt;
    });

    const isRer = this.lineData.id.startsWith('IDFM:C0172') || this.lineData.id.startsWith('IDFM:C0174');
    const trainsByStation = new Map<number, Array<{ train: TrainMarker; distance: number; atQuai: boolean }>>();
    const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const tr of activeLineTrains) {
      let matchedIdx = -1;
      let matchedDistance = Number.POSITIVE_INFINITY;

      // 1. Tenter le match par nom de prochaine station (tr.next)
      if (tr.next) {
        const nextNorm = norm(tr.next);
        for (let i = 0; i < dirData.stations.length; i++) {
          const stNorm = norm(dirData.stations[i].name);
          if (stNorm === nextNorm || (nextNorm.length > 4 && stNorm.includes(nextNorm)) || (stNorm.length > 4 && nextNorm.includes(stNorm))) {
            matchedIdx = i;
            if (tr.pos && dirData.stations[i].coordinates) {
              matchedDistance = this.geoDistanceM(tr.pos, dirData.stations[i].coordinates);
            } else if (tr.currentDistM !== undefined) {
              matchedDistance = Math.abs(dirData.stations[i].distance_m - tr.currentDistM);
            } else {
              matchedDistance = 0;
            }
            break;
          }
        }
      }

      // 2. Fallback géographique ou curviligne si non trouvé
      if (matchedIdx === -1) {
        if (tr.pos && tr.pos[0] && tr.pos[1]) {
          for (let i = 0; i < dirData.stations.length; i++) {
            const st = dirData.stations[i];
            if (st.coordinates) {
              const d = this.geoDistanceM(tr.pos, st.coordinates);
              if (d < matchedDistance) {
                matchedIdx = i;
                matchedDistance = d;
              }
            }
          }
        } else if (tr.currentDistM !== undefined) {
          for (let i = 0; i < dirData.stations.length; i++) {
            const d = Math.abs(dirData.stations[i].distance_m - tr.currentDistM);
            if (d < matchedDistance) {
              matchedIdx = i;
              matchedDistance = d;
            }
          }
        }
      }

      // 3. Validation de proximité (RER interstations larges vs métro dense)
      const maxToleranceM = isRer ? 4000 : 600;
      if (matchedIdx >= 0 && matchedDistance <= maxToleranceM) {
        const atQuai = Boolean(tr.atStop || matchedDistance < 40);
        const trains = trainsByStation.get(matchedIdx) || [];
        trains.push({ train: tr, distance: matchedDistance, atQuai });
        trainsByStation.set(matchedIdx, trains);
      }
    }

    // Collecter les ids de rames encore présentes pour nettoyer les disparues.
    const activeIds = new Set<string>();

    for (const [matchedIdx, entries] of trainsByStation) {
      const slot = document.getElementById(`slot-station-${matchedIdx}`);
      if (!slot) continue;

      // La plus proche est prioritaire ; au-delà de deux, on ignore
      // silencieusement les rames supplémentaires.
      entries.sort((a, b) => a.distance - b.distance);
      const visibleTrains = entries.slice(0, 2);
      slot.classList.toggle('ladder-node-train-slot--double', visibleTrains.length > 1);
      const existingCursors = Array.from(slot.querySelectorAll<HTMLElement>('.ladder-train-cursor'));
      const usedCursors = new Set<HTMLElement>();

      for (const [trainIndex, entry] of visibleTrains.entries()) {
        const { train: tr, distance, atQuai } = entry;
        activeIds.add(tr.id);

        // Stocker l'état « à quai » stable (pas recalculé à 10 Hz).
        this.atStopState.set(tr.id, atQuai);

        // Mettre à jour la cible de vitesse pour l'animation.
        const speed = this.clampSpeed(tr.spd);
        this.speedTargets.set(tr.id, speed);
        // Initialiser la vitesse affichée si c'est une nouvelle rame.
        if (!this.speedShown.has(tr.id)) {
          this.speedShown.set(tr.id, speed);
        }

        // Réutiliser d'abord le curseur de même id, sinon le curseur du même
        // emplacement. Les ids GTFS peuvent changer entre deux ticks.
        let cursor = slot.querySelector<HTMLElement>(`[data-train-id="${tr.id}"]`);
        if (cursor && usedCursors.has(cursor)) cursor = null;
        if (!cursor) {
          cursor = existingCursors[trainIndex] && !usedCursors.has(existingCursors[trainIndex])
            ? existingCursors[trainIndex]
            : existingCursors.find(candidate => !usedCursors.has(candidate)) || null;
        }
        if (cursor) {
          usedCursors.add(cursor);
          cursor.setAttribute('data-train-id', tr.id);
          this.trainCursorElements.set(tr.id, cursor);
          // Mise à jour rapide : classe « à quai » et badge de retard.
          cursor.className = atQuai
            ? 'ladder-train-cursor ladder-train-cursor--quai'
            : 'ladder-train-cursor';
          const signal = cursor.querySelector<HTMLElement>('.sig');
          if (signal) {
            signal.outerHTML = this.renderSignal(speed, tr.dest, atQuai);
          }
          cursor.querySelector('.train-cursor-delay')?.remove();
          // Le texte de vitesse est mis à jour par animate() à 10 Hz.
        } else {
          // Créer un nouveau curseur.
          const speed = this.clampSpeed(tr.spd);
          const speedLabel = atQuai ? 'à quai' : `${speed} km/h`;
          const speedColor = this.speedColor(speed);
          cursor = document.createElement('div');
          cursor.className = atQuai
            ? 'ladder-train-cursor ladder-train-cursor--quai'
            : 'ladder-train-cursor';
          cursor.setAttribute('data-train-id', tr.id);
          cursor.title = `Rame en approche de ${dirData.stations[matchedIdx].name} (${speedLabel})`;
          cursor.innerHTML = `
            <div class="train-cursor-body">
              ${this.renderSignal(speed, tr.dest, atQuai)}
            </div>
          `;
          cursor.addEventListener('click', (e) => {
            e.stopPropagation();
            const currentId = (e.currentTarget as HTMLElement).dataset.trainId;
            const currentTrain = this.currentTrains.find(train => train.id === currentId);
            if (currentTrain) this.onTrainClick(currentTrain);
          });
          slot.appendChild(cursor);
        }
        this.trainCursorElements.set(tr.id, cursor);
      }

      existingCursors.forEach(cursor => {
        if (!usedCursors.has(cursor)) cursor.remove();
      });

    }

    this.containerEl.querySelectorAll<HTMLElement>('.ladder-node-train-slot').forEach(slot => {
      if (!trainsByStation.has(Number(slot.id.replace('slot-station-', '')))) {
        slot.classList.remove('ladder-node-train-slot--double');
        slot.querySelectorAll('.ladder-train-cursor').forEach(element => element.remove());
      }
    });

    // Nettoyer les rames disparues des maps d'animation.
    for (const id of this.speedTargets.keys()) {
      if (!activeIds.has(id)) {
        this.speedTargets.delete(id);
        this.speedShown.delete(id);
        this.atStopState.delete(id);
        this.trainCursorElements.delete(id);
      }
    }

  }
}

