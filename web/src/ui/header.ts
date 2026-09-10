/**
 * header.ts — Composant TopBar sobre, accessible et performant.
 */

export interface TopBarOptions {
  lineCount: number;
  stationCount: number;
  onSearch?: () => void;
  onToggleRealtime?: () => void;
  onMethod?: () => void;
}

export class TopBar {
  private el: HTMLElement;
  private metaEl: HTMLElement;
  private countValueEl: HTMLElement;
  private countLabelEl: HTMLElement;
  private distanceEl: HTMLElement;
  private rtStatusEl: HTMLElement;
  private rtLabelEl: HTMLElement;

  constructor(private options: TopBarOptions) {
    this.el = document.createElement('header');
    this.el.className = 'topbar';
    this.el.id = 'topbar';

    // 1. Marque & Titre
    const brand = document.createElement('a');
    brand.className = 'topbar__brand';
    brand.href = '#';
    brand.setAttribute('aria-label', 'Accueil Métro de Paris');

    const mark = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    mark.setAttribute('class', 'topbar__mark');
    mark.setAttribute('viewBox', '0 0 24 24');
    mark.innerHTML = `<circle cx="12" cy="12" r="10" stroke="var(--ceramique)" stroke-width="2" fill="none"/>
      <circle cx="12" cy="12" r="5" fill="var(--guimard)"/>`;

    const name = document.createElement('span');
    name.className = 'topbar__name';
    name.textContent = 'Métro de Paris';

    brand.appendChild(mark);
    brand.appendChild(name);

    // Métadonnées réseau (masquées sur mobile via CSS)
    this.metaEl = document.createElement('span');
    this.metaEl.className = 'topbar__meta';
    this.metaEl.textContent = `${options.lineCount} lignes · ${options.stationCount} stations`;

    // Spacer
    const spacer = document.createElement('div');
    spacer.className = 'topbar__spacer';

    // Compteur de rames
    const countContainer = document.createElement('div');
    countContainer.className = 'topbar__count';

    this.countValueEl = document.createElement('span');
    this.countValueEl.className = 'topbar__count-value topbar__count-value--pending';
    this.countValueEl.textContent = '—';

    this.countLabelEl = document.createElement('span');
    this.countLabelEl.className = 'topbar__count-label';
    this.countLabelEl.textContent = 'calcul des rames...';

    countContainer.appendChild(this.countValueEl);
    countContainer.appendChild(this.countLabelEl);

    // Statut temps réel (un état, pas un contrôle)
    this.rtStatusEl = document.createElement('div');
    this.rtStatusEl.className = 'rt-status';
    this.rtStatusEl.dataset.state = 'standby';

    const dot = document.createElement('span');
    dot.className = 'rt-status__dot';

    this.rtLabelEl = document.createElement('span');
    this.rtLabelEl.className = 'rt-status__label';
    this.rtLabelEl.textContent = 'théorique';

    this.rtStatusEl.appendChild(dot);
    this.rtStatusEl.appendChild(this.rtLabelEl);

    if (this.options.onToggleRealtime) {
      this.rtStatusEl.style.cursor = 'pointer';
      this.rtStatusEl.setAttribute('role', 'button');
      this.rtStatusEl.setAttribute('tabindex', '0');
      this.rtStatusEl.setAttribute('title', 'Cliquer pour activer / désactiver le suivi en direct PRIM');
      this.rtStatusEl.addEventListener('click', () => this.options.onToggleRealtime?.());
      this.rtStatusEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.options.onToggleRealtime?.();
        }
      });
    }

    // Recherche desktop
    const searchBtn = document.createElement('button');
    searchBtn.type = 'button';
    searchBtn.className = 'topbar__search';
    searchBtn.setAttribute('aria-label', 'Rechercher une station (⌘K)');
    searchBtn.innerHTML = `
      <svg class="topbar__search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
      <span class="topbar__search-text">Rechercher</span>
      <kbd class="topbar__search-kbd">⌘K</kbd>
    `;
    searchBtn.addEventListener('click', () => this.options.onSearch?.());

    // Bouton loupe mobile (cible 44px)
    const searchIconBtn = document.createElement('button');
    searchIconBtn.type = 'button';
    searchIconBtn.className = 'topbar__search-icon-btn';
    searchIconBtn.setAttribute('aria-label', 'Rechercher une station');
    searchIconBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
    `;
    searchIconBtn.addEventListener('click', () => this.options.onSearch?.());

    const methodBtn = document.createElement('button');
    methodBtn.type = 'button';
    methodBtn.className = 'topbar__method-btn';
    methodBtn.setAttribute('aria-label', 'Méthode & Données');
    methodBtn.textContent = 'Méthode';
    methodBtn.addEventListener('click', () => this.options.onMethod?.());

    // Assemblage
    this.el.appendChild(brand);
    this.el.appendChild(this.metaEl);
    this.el.appendChild(spacer);
    this.el.appendChild(countContainer);
    this.distanceEl = document.createElement('span');
    this.distanceEl.className = 'topbar__distance';
    this.distanceEl.title = 'Distance calculée sur les horaires GTFS, pas mesurée par géolocalisation.';
    this.distanceEl.textContent = '0,0 km · depuis le début du service';
    this.el.appendChild(this.distanceEl);
    this.el.appendChild(this.rtStatusEl);
    this.el.appendChild(methodBtn);
    this.el.appendChild(searchBtn);
    this.el.appendChild(searchIconBtn);
  }

  public mount(parent: HTMLElement = document.body) {
    parent.prepend(this.el);
    this.updateChromeTop();
    window.addEventListener('resize', () => this.updateChromeTop());
  }

  public updateChromeTop() {
    const h = this.el.getBoundingClientRect().height || 52;
    document.documentElement.style.setProperty('--chrome-top', `${h}px`);
  }

  public setTrainCount(count: number | null | undefined) {
    if (count === null || count === undefined) {
      this.countValueEl.textContent = '—';
      this.countValueEl.classList.add('topbar__count-value--pending');
      this.countLabelEl.textContent = 'calcul des rames...';
    } else if (count === 0) {
      this.countValueEl.textContent = '0';
      this.countValueEl.classList.remove('topbar__count-value--pending');
      this.countLabelEl.textContent = 'rame · service terminé';
    } else {
      this.countValueEl.textContent = count.toLocaleString('fr-FR');
      this.countValueEl.classList.remove('topbar__count-value--pending');
      this.countLabelEl.textContent = count > 1 ? 'rames en circulation' : 'rame en circulation';
    }
  }

  public setCounts(lineCount: number, stationCount: number) {
    if (this.metaEl) {
      this.metaEl.textContent = `${lineCount} lignes · ${stationCount} stations`;
    }
  }

  public setNetworkDistance(distanceKm: number, theoretical = true) {
    const value = Number.isFinite(distanceKm)
      ? distanceKm.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : '0,0';
    this.distanceEl.textContent = `${value} km · depuis le début du service`;
    this.distanceEl.title = theoretical
      ? 'Distance théorique calculée sur les horaires GTFS depuis le début du service.'
      : 'Distance parcourue depuis le début du service.';
  }

  public setRealtimeState(status: any) {
    if (typeof status === 'string') {
      this.rtStatusEl.dataset.state = status;
      if (status === 'live') this.rtLabelEl.textContent = 'temps réel';
      else this.rtLabelEl.textContent = 'théorique';
    } else if (status && status.active && status.minutesAgo !== undefined && status.minutesAgo <= 10) {
      this.rtStatusEl.dataset.state = 'live';
      if (status.minutesAgo <= 1) {
        this.rtLabelEl.textContent = 'temps réel (à l\'instant)';
      } else {
        this.rtLabelEl.textContent = `temps réel (mis à jour il y a ${status.minutesAgo} min)`;
      }
    } else {
      this.rtStatusEl.dataset.state = 'standby';
      this.rtLabelEl.textContent = 'théorique';
    }
  }
}
