import { DateTime } from 'luxon';

export interface CityItem {
  id: string;
  slug: string;
  displayName: string;
}

export interface TopBarOptions {
  lineCount: number;
  stationCount: number;
  cities?: CityItem[];
  activeCityId?: string;
  timezone?: string;
  displayName?: string;
  onCitySelect?: (cityId: string) => void;
  onSearch?: () => void;
  onToggleRealtime?: () => void;
  onAbout?: () => void;
  onRecords?: () => void;
  onToggleBuildings?: (active: boolean) => void;
  onToggleTheme?: (theme: 'dark' | 'light') => void;
}

const LED_MATRICES: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000']
};

function renderLedClock(value: string, scale = 5): string {
  const gap = scale;
  const dotRadius = scale * 0.34;
  const characterWidth = 5 * gap;
  const characterSpacing = scale * 0.65;
  const width = value.length * characterWidth + (value.length - 1) * characterSpacing;
  const height = 7 * gap;
  const dots: string[] = [];

  [...value].forEach((character, characterIndex) => {
    const matrix = LED_MATRICES[character];
    if (!matrix) return;
    const offsetX = characterIndex * (characterWidth + characterSpacing);
    matrix.forEach((row, y) => {
      [...row].forEach((enabled, x) => {
        if (enabled === '1') {
          dots.push(`<circle cx="${offsetX + x * gap + gap / 2}" cy="${y * gap + gap / 2}" r="${dotRadius}"/>`);
        }
      });
    });
  });

  return `<svg class="topbar__clock-svg" viewBox="0 0 ${width} ${height}" role="img" aria-hidden="true">${dots.join('')}</svg>`;
}

export class TopBar {
  private el: HTMLElement;
  private countValueEl: HTMLElement;
  private countLabelEl: HTMLElement;
  private distanceEl: HTMLElement;
  private rtStatusEl: HTMLElement;
  private rtLabelEl: HTMLElement;
  private clockEl: HTMLTimeElement;
  private clockTimer: ReturnType<typeof setTimeout> | null = null;
  private searchBtn: HTMLButtonElement;
  private menuBtn!: HTMLButtonElement;
  private dropdownMenu!: HTMLElement;
  private buildingsBtn!: HTMLButtonElement;
  private isBuildingsActive: boolean = true;
  private themeBtn!: HTMLButtonElement;
  private activeCityId: string;
  private timezone: string;
  private displayName: string;

  constructor(private options: TopBarOptions) {
    this.el = document.createElement('header');
    this.el.className = 'topbar';
    this.el.id = 'topbar';

    this.activeCityId = this.options.activeCityId || 'paris';
    this.timezone = this.options.timezone || 'Europe/Paris';
    this.displayName = this.options.displayName || 'Paris';

    // Sélecteur de ville (liste accessible avec remplissage pour la ville active)
    const citiesNav = document.createElement('nav');
    citiesNav.className = 'topbar__cities';
    citiesNav.setAttribute('aria-label', 'Choix du réseau métropolitain');

    const citiesList = document.createElement('ul');
    citiesList.className = 'topbar__cities-list';

    const cities = this.options.cities || [
      { id: 'paris', slug: 'paris', displayName: 'paris' },
      { id: 'montreal', slug: 'montreal', displayName: 'montréal' }
    ];

    cities.forEach(city => {
      const li = document.createElement('li');
      li.className = 'topbar__city-item';

      const link = document.createElement('a');
      link.href = `/${city.slug}`;
      link.className = 'topbar__city-btn';
      link.dataset.cityId = city.id;
      const isActive = city.id === this.activeCityId;
      if (isActive) {
        link.classList.add('is-active');
        link.setAttribute('aria-current', 'page');
      }

      link.innerHTML = `
        <svg class="topbar__mark" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/>
          <circle cx="12" cy="12" r="5" fill="currentColor"/>
        </svg>
        <span class="topbar__city-name">${city.displayName.toLowerCase()}</span>
      `;

      link.addEventListener('click', (e) => {
        e.preventDefault();
        if (city.id !== this.activeCityId) {
          this.options.onCitySelect?.(city.id);
        }
      });

      li.appendChild(link);
      citiesList.appendChild(li);
    });

    citiesNav.appendChild(citiesList);

    this.clockEl = document.createElement('time');
    this.clockEl.className = 'topbar__clock';
    this.clockEl.setAttribute('aria-label', `Heure de ${this.displayName}`);
    this.updateCityClock();

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

    // Distance totale
    this.distanceEl = document.createElement('span');
    this.distanceEl.className = 'topbar__distance';
    this.distanceEl.title = 'Distance cumulée calculée sur les horaires théoriques GTFS depuis le début du service.';
    this.distanceEl.textContent = '0,0 km · depuis le début du service';

    // Bloc 4: Statut temps réel discret (point 6px sans texte au repos, texte visible si live ou erreur)
    this.rtStatusEl = document.createElement('div');
    this.rtStatusEl.className = 'rt-status';
    this.rtStatusEl.dataset.state = 'standby';
    this.rtStatusEl.title = 'Mode nominal : circulation calculée sur la grille horaire officielle GTFS.';

    this.rtLabelEl = document.createElement('span');
    this.rtLabelEl.className = 'rt-status__label';
    this.rtLabelEl.textContent = ''; // Aucun libellé au repos

    this.rtStatusEl.appendChild(this.rtLabelEl);

    if (this.options.onToggleRealtime) {
      this.rtStatusEl.style.cursor = 'pointer';
      this.rtStatusEl.setAttribute('role', 'button');
      this.rtStatusEl.setAttribute('tabindex', '0');
      this.rtStatusEl.addEventListener('click', () => this.options.onToggleRealtime?.());
      this.rtStatusEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.options.onToggleRealtime?.();
        }
      });
    }

    // Bloc 5: Déclencheur unique de recherche
    this.searchBtn = document.createElement('button');
    this.searchBtn.type = 'button';
    this.searchBtn.className = 'topbar__search-trigger';
    this.searchBtn.id = 'topbar-search-trigger';
    this.searchBtn.setAttribute('aria-label', 'Rechercher une station (⌘K)');
    this.searchBtn.innerHTML = `
      <svg class="topbar__search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
      <span class="topbar__search-text">rechercher une station</span>
      <kbd class="topbar__search-kbd">⌘K</kbd>
    `;
    this.searchBtn.addEventListener('click', () => this.options.onSearch?.());

    // Bloc 6: Menu ☰ navigation
    const menuContainer = document.createElement('div');
    menuContainer.className = 'topbar__menu-container';

    this.menuBtn = document.createElement('button');
    this.menuBtn.type = 'button';
    this.menuBtn.className = 'topbar__menu-btn';
    this.menuBtn.setAttribute('aria-label', 'Menu principal');
    this.menuBtn.setAttribute('aria-expanded', 'false');
    this.menuBtn.setAttribute('aria-haspopup', 'true');
    this.menuBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="4" y1="7" x2="20" y2="7"></line>
        <line x1="4" y1="12" x2="20" y2="12"></line>
        <line x1="4" y1="17" x2="20" y2="17"></line>
      </svg>
    `;

    this.dropdownMenu = document.createElement('div');
    this.dropdownMenu.className = 'topbar__dropdown-menu';
    this.dropdownMenu.setAttribute('role', 'menu');
    this.dropdownMenu.innerHTML = `
      <button type="button" class="topbar__menu-item" id="menu-item-about" role="menuitem">
        <span aria-hidden="true">ⓘ</span>
        <span>À propos</span>
      </button>
      <button type="button" class="topbar__menu-item" id="menu-item-records" role="menuitem">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
          <path d="M4 22h16"></path>
          <path d="M10 14.66V17c0 .55-.45 1-1 1H7v2h10v-2h-2c-.55 0-1-.45-1-1v-2.34"></path>
          <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>
        </svg>
        <span>Records</span>
      </button>
      <button type="button" class="topbar__menu-item" id="menu-item-buildings" role="menuitemcheckbox" aria-checked="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M3 21h18M5 21V7l8-4v18M13 10l6 3v8"></path>
        </svg>
        <span style="flex: 1;">Bâti 3D</span>
        <span class="topbar__menu-toggle-state is-active" id="menu-buildings-state">Actif</span>
      </button>
      <button type="button" class="topbar__menu-item" id="menu-item-theme" role="menuitemcheckbox">
        <span aria-hidden="true">◐</span>
        <span style="flex: 1;">Mode clair</span>
        <span class="topbar__menu-toggle-state" id="menu-theme-state"></span>
      </button>
    `;

    this.buildingsBtn = this.dropdownMenu.querySelector('#menu-item-buildings') as HTMLButtonElement;
    this.themeBtn = this.dropdownMenu.querySelector('#menu-item-theme') as HTMLButtonElement;
    this.syncThemeState();

    this.menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = this.dropdownMenu.classList.toggle('is-open');
      this.menuBtn.setAttribute('aria-expanded', String(isOpen));
    });

    this.dropdownMenu.querySelector('#menu-item-records')?.addEventListener('click', () => {
      this.closeMenu();
      this.options.onRecords?.();
    });

    this.dropdownMenu.querySelector('#menu-item-about')?.addEventListener('click', () => {
      this.closeMenu();
      this.options.onAbout?.();
    });

    this.buildingsBtn?.addEventListener('click', () => {
      this.setBuildingsActive(!this.isBuildingsActive);
      this.options.onToggleBuildings?.(this.isBuildingsActive);
    });

    this.themeBtn?.addEventListener('click', () => {
      const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.theme = theme;
      localStorage.setItem('paris-subway-theme', theme);
      this.syncThemeState();
      this.options.onToggleTheme?.(theme);
    });

    document.addEventListener('click', (e) => {
      if (!menuContainer.contains(e.target as Node)) {
        this.closeMenu();
      }
    });

    menuContainer.appendChild(this.menuBtn);
    menuContainer.appendChild(this.dropdownMenu);

    // Assemblage final
    this.el.appendChild(citiesNav);
    this.el.appendChild(this.clockEl);
    this.el.appendChild(spacer);
    this.el.appendChild(countContainer);
    this.el.appendChild(this.distanceEl);
    this.el.appendChild(this.rtStatusEl);
    this.el.appendChild(this.searchBtn);
    this.el.appendChild(menuContainer);
  }

  public getSearchTriggerElement(): HTMLElement {
    return this.searchBtn;
  }

  public setActiveCity(cityId: string, timezone: string, displayName: string): void {
    this.activeCityId = cityId;
    this.timezone = timezone;
    this.displayName = displayName;
    this.el.querySelectorAll('.topbar__city-btn').forEach(btn => {
      const el = btn as HTMLAnchorElement;
      const isActive = el.dataset.cityId === cityId;
      el.classList.toggle('is-active', isActive);
      if (isActive) {
        el.setAttribute('aria-current', 'page');
      } else {
        el.removeAttribute('aria-current');
      }
    });
    if (this.clockTimer) {
      clearTimeout(this.clockTimer);
      this.clockTimer = null;
    }
    this.updateCityClock();
  }

  private updateCityClock = (): void => {
    const now = new Date();
    const dt = DateTime.fromJSDate(now).setZone(this.timezone);
    const hour = dt.toFormat('HH');
    const minute = dt.toFormat('mm');
    const requestedTestValue = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('clockTest')
      : null;
    const value = requestedTestValue && /^[0-9]{2}:[0-9]{2}$/.test(requestedTestValue)
      ? requestedTestValue
      : `${hour}:${minute}`;
    this.clockEl.dateTime = now.toISOString();
    this.clockEl.setAttribute('aria-label', `Heure de ${this.displayName} : ${value}`);
    this.clockEl.innerHTML = renderLedClock(value);
    const delay = 1000 - (Date.now() % 1000);
    this.clockTimer = setTimeout(this.updateCityClock, delay);
  };

  public setBuildingsActive(active: boolean) {
    this.isBuildingsActive = active;
    if (this.buildingsBtn) {
      this.buildingsBtn.setAttribute('aria-checked', String(active));
      const stateEl = this.buildingsBtn.querySelector('#menu-buildings-state');
      if (stateEl) {
        stateEl.textContent = active ? 'Actif' : 'Inactif';
        stateEl.classList.toggle('is-active', active);
      }
    }
  }

  private syncThemeState() {
    const light = document.documentElement.dataset.theme === 'light';
    this.themeBtn?.setAttribute('aria-checked', String(light));
    const state = this.themeBtn?.querySelector('#menu-theme-state');
    if (state) state.textContent = light ? 'Actif' : '';
  }

  public closeMenu() {
    this.dropdownMenu.classList.remove('is-open');
    this.menuBtn.setAttribute('aria-expanded', 'false');
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
    // Conservé pour compatibilité avec les appelants existants.
  }

  public setNetworkDistance(distanceKm: number, theoretical = true) {
    const value = Number.isFinite(distanceKm)
      ? distanceKm.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : '0,0';
    this.distanceEl.textContent = `${value} km · depuis le début du service`;
    this.distanceEl.title = theoretical
      ? 'Distance cumulée calculée sur les horaires théoriques GTFS depuis le début du service.'
      : 'Distance parcourue depuis le début du service.';
  }

  public setRealtimeState(status: any) {
    if (typeof status === 'string') {
      this.rtStatusEl.dataset.state = status;
      if (status === 'live') {
        this.rtLabelEl.textContent = 'recalé';
        this.rtStatusEl.title = 'Suivi cinématique temps réel recalé sur les estimations PRIM (Île-de-France Mobilités).';
      } else if (status === 'error') {
        this.rtLabelEl.textContent = 'temps réel indisponible';
        this.rtStatusEl.title = 'Service temps réel PRIM indisponible : repli sur les horaires théoriques GTFS.';
      } else {
        this.rtLabelEl.textContent = '';
        this.rtStatusEl.title = 'Mode nominal : circulation calculée sur la grille horaire officielle GTFS.';
      }
    } else if (status && status.active && status.minutesAgo !== undefined && status.minutesAgo <= 10) {
      this.rtStatusEl.dataset.state = 'live';
      if (status.minutesAgo <= 1) {
        this.rtLabelEl.textContent = 'recalé · à l\'instant';
      } else {
        this.rtLabelEl.textContent = `recalé · il y a ${status.minutesAgo} min`;
      }
      this.rtStatusEl.title = 'Suivi cinématique temps réel recalé sur les estimations PRIM (Île-de-France Mobilités).';
    } else if (status && status.error) {
      this.rtStatusEl.dataset.state = 'error';
      this.rtLabelEl.textContent = 'temps réel indisponible';
      this.rtStatusEl.title = 'Service temps réel PRIM indisponible : repli sur les horaires théoriques GTFS.';
    } else {
      this.rtStatusEl.dataset.state = 'standby';
      this.rtLabelEl.textContent = '';
      this.rtStatusEl.title = 'Mode nominal : circulation calculée sur la grille horaire officielle GTFS.';
    }
  }
}
