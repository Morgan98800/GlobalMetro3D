import type { StationMetadata, LineMetadata } from '@paris-subway/shared';

export interface SearchBarOptions {
  containerId: string;
  stations: StationMetadata[];
  lines: LineMetadata[];
  onStationSelect: (station: StationMetadata) => void;
}

export class SubwaySearchBar {
  private containerEl: HTMLElement;
  private stations: StationMetadata[] = [];
  private linesMap = new Map<string, LineMetadata>();
  private onStationSelect: (station: StationMetadata) => void;

  private wrapperEl!: HTMLElement;
  private inputEl!: HTMLInputElement;
  private resultsEl!: HTMLElement;

  constructor(options: SearchBarOptions) {
    this.containerEl = document.getElementById(options.containerId)!;
    this.stations = options.stations;
    this.onStationSelect = options.onStationSelect;

    for (const l of options.lines) {
      this.linesMap.set(l.id, l);
    }

    this.render();
    this.bindEvents();
  }

  public setData(stations: StationMetadata[], lines: LineMetadata[]) {
    this.stations = stations;
    this.linesMap.clear();
    for (const l of lines) {
      this.linesMap.set(l.id, l);
    }
  }

  private render() {
    this.wrapperEl = document.createElement('div');
    this.wrapperEl.className = 'subway-search-bar';

    this.wrapperEl.innerHTML = `
      <div class="search-input-wrapper">
        <span class="search-icon">🔍</span>
        <input 
          type="text" 
          class="search-input" 
          id="station-search-input" 
          placeholder="Rechercher une station..." 
          autocomplete="off"
          spellcheck="false"
        />
        <kbd class="search-kbd">⌘K</kbd>
      </div>
      <div class="search-dropdown" id="search-dropdown" style="display: none;"></div>
    `;

    this.containerEl.appendChild(this.wrapperEl);

    this.inputEl = this.wrapperEl.querySelector('#station-search-input')!;
    this.resultsEl = this.wrapperEl.querySelector('#search-dropdown')!;
  }

  private normalize(str: string): string {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private bindEvents() {
    // Input listener
    this.inputEl.addEventListener('input', () => {
      const q = this.normalize(this.inputEl.value.trim());
      if (q.length < 2) {
        this.resultsEl.style.display = 'none';
        this.resultsEl.innerHTML = '';
        return;
      }
      this.search(q);
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (!this.wrapperEl.contains(e.target as Node)) {
        this.resultsEl.style.display = 'none';
      }
    });

    // Focus / open
    this.inputEl.addEventListener('focus', () => {
      if (this.inputEl.value.trim().length >= 2) {
        this.resultsEl.style.display = 'block';
      }
    });

    // Global keyboard shortcut: Cmd+K or Ctrl+K
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.inputEl.focus();
        this.inputEl.select();
      }
      if (e.key === 'Escape') {
        this.resultsEl.style.display = 'none';
        this.inputEl.blur();
      }
    });
  }

  private search(query: string) {
    const matches = this.stations
      .filter(s => this.normalize(s.name).includes(query))
      .slice(0, 7);

    if (matches.length === 0) {
      this.resultsEl.innerHTML = `<div class="search-no-result">Aucune station trouvée</div>`;
      this.resultsEl.style.display = 'block';
      return;
    }

    this.resultsEl.innerHTML = matches
      .map(st => {
        const badges = st.lines
          .map(lid => this.linesMap.get(lid))
          .filter((l): l is LineMetadata => !!l)
          .map(l => `<span class="search-line-pill" style="background:${l.color}; color:${l.text_color};">${l.short_name}</span>`)
          .join('');

        const hubTag = st.is_hub ? `<span class="search-hub-tag">Hub</span>` : '';

        return `
          <div class="search-item" data-station-id="${st.id}">
            <div class="search-item-name">${st.name} ${hubTag}</div>
            <div class="search-item-lines">${badges}</div>
          </div>
        `;
      })
      .join('');

    this.resultsEl.style.display = 'block';

    // Click handler for items
    this.resultsEl.querySelectorAll('.search-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.getAttribute('data-station-id');
        const st = this.stations.find(s => s.id === id);
        if (st) {
          this.inputEl.value = st.name;
          this.resultsEl.style.display = 'none';
          this.onStationSelect(st);
        }
      });
    });
  }
}
