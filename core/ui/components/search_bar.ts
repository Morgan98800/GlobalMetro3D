import type { StationMetadata, LineMetadata } from '@core/types';

export interface SearchBarOptions {
  triggerId?: string;
  stations: StationMetadata[];
  lines: LineMetadata[];
  onStationSelect: (station: StationMetadata) => void;
}

export class SubwaySearchBar {
  private stations: StationMetadata[] = [];
  private linesMap = new Map<string, LineMetadata>();
  private onStationSelect: (station: StationMetadata) => void;
  private triggerEl: HTMLElement | null = null;

  private backdropEl!: HTMLElement;
  private dialogEl!: HTMLElement;
  private inputEl!: HTMLInputElement;
  private resultsEl!: HTMLElement;
  private closeBtnEl!: HTMLButtonElement;

  private activeIndex: number = -1;
  private currentMatches: StationMetadata[] = [];
  private isOpen: boolean = false;

  constructor(options: SearchBarOptions) {
    this.stations = options.stations;
    this.onStationSelect = options.onStationSelect;
    if (options.triggerId) {
      this.triggerEl = document.getElementById(options.triggerId);
    }

    for (const l of options.lines) {
      this.linesMap.set(l.id, l);
    }

    this.createPalette();
    this.bindEvents();
  }

  public setTriggerElement(el: HTMLElement) {
    this.triggerEl = el;
  }

  public setData(stations: StationMetadata[], lines: LineMetadata[]) {
    this.stations = stations;
    this.linesMap.clear();
    for (const l of lines) {
      this.linesMap.set(l.id, l);
    }
  }

  public open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.backdropEl.classList.add('is-open');
    this.backdropEl.setAttribute('aria-hidden', 'false');
    this.inputEl.value = '';
    this.activeIndex = -1;
    this.inputEl.setAttribute('aria-expanded', 'true');
    this.inputEl.removeAttribute('aria-activedescendant');
    this.renderResults('');

    // Focus input after DOM render
    requestAnimationFrame(() => {
      this.inputEl.focus();
    });
  }

  public close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.backdropEl.classList.remove('is-open');
    this.backdropEl.setAttribute('aria-hidden', 'true');
    this.inputEl.setAttribute('aria-expanded', 'false');
    this.inputEl.removeAttribute('aria-activedescendant');
    this.inputEl.blur();

    // Return focus to the trigger button
    if (this.triggerEl) {
      this.triggerEl.focus();
    }
  }

  private createPalette() {
    // Remove any previous instance if exists
    document.getElementById('cmd-palette-backdrop')?.remove();

    this.backdropEl = document.createElement('div');
    this.backdropEl.id = 'cmd-palette-backdrop';
    this.backdropEl.className = 'cmd-palette-backdrop';
    this.backdropEl.setAttribute('role', 'dialog');
    this.backdropEl.setAttribute('aria-modal', 'true');
    this.backdropEl.setAttribute('aria-label', 'Rechercher une station');
    this.backdropEl.setAttribute('aria-hidden', 'true');

    this.dialogEl = document.createElement('div');
    this.dialogEl.className = 'cmd-palette-dialog';

    this.dialogEl.innerHTML = `
      <div class="cmd-palette-header">
        <svg class="cmd-palette-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input
          type="text"
          class="cmd-palette-input"
          id="cmd-palette-input"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="false"
          aria-controls="cmd-palette-results"
          placeholder="Rechercher une station…"
          autocomplete="off"
          spellcheck="false"
        />
        <button type="button" class="cmd-palette-close" id="cmd-palette-close" aria-label="Fermer la recherche">×</button>
      </div>
      <div class="cmd-palette-results" id="cmd-palette-results" role="listbox" aria-label="Résultats de recherche"></div>
      <div class="cmd-palette-footer">
        <span><kbd>↑</kbd> <kbd>↓</kbd> naviguer</span>
        <span><kbd>Entrée</kbd> sélectionner</span>
        <span><kbd>Échap</kbd> fermer</span>
      </div>
    `;

    this.backdropEl.appendChild(this.dialogEl);
    document.body.appendChild(this.backdropEl);

    this.inputEl = this.dialogEl.querySelector('#cmd-palette-input')!;
    this.resultsEl = this.dialogEl.querySelector('#cmd-palette-results')!;
    this.closeBtnEl = this.dialogEl.querySelector('#cmd-palette-close')!;
  }

  private normalize(str: string): string {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private bindEvents() {
    // 1. Close on backdrop click (outside dialog)
    this.backdropEl.addEventListener('click', (e) => {
      if (e.target === this.backdropEl) {
        this.close();
      }
    });

    // 2. Close on close button click
    this.closeBtnEl.addEventListener('click', () => {
      this.close();
    });

    // 3. Input typing listener
    this.inputEl.addEventListener('input', () => {
      const q = this.normalize(this.inputEl.value.trim());
      this.activeIndex = -1;
      this.renderResults(q);
    });

    // 4. Keyboard navigation (ArrowDown, ArrowUp, Enter, Escape)
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.currentMatches.length > 0) {
          this.activeIndex = (this.activeIndex + 1) % this.currentMatches.length;
          this.updateActiveHighlight();
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.currentMatches.length > 0) {
          this.activeIndex = (this.activeIndex - 1 + this.currentMatches.length) % this.currentMatches.length;
          this.updateActiveHighlight();
        }
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (this.activeIndex >= 0 && this.activeIndex < this.currentMatches.length) {
          this.selectStation(this.currentMatches[this.activeIndex]);
        } else if (this.currentMatches.length > 0) {
          this.selectStation(this.currentMatches[0]);
        }
      }
    });

    // 5. Global keyboard shortcut: Cmd+K / Ctrl+K
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (this.isOpen) {
          this.close();
        } else {
          this.open();
        }
      }
    });
  }

  private renderResults(query: string) {
    if (!query) {
      // Show top major hubs when input is empty
      this.currentMatches = this.stations
        .filter(s => s.lines.length >= 3 || s.is_hub)
        .slice(0, 8);
    } else {
      this.currentMatches = this.stations
        .filter(s => this.normalize(s.name).includes(query))
        .slice(0, 10);
    }

    if (this.currentMatches.length === 0) {
      this.resultsEl.innerHTML = `<div class="cmd-palette-empty">Aucune station trouvée</div>`;
      return;
    }

    this.resultsEl.innerHTML = this.currentMatches
      .map((st, index) => {
        const badges = st.lines
          .map(lid => this.linesMap.get(lid))
          .filter((l): l is LineMetadata => !!l)
          .map(l => `<span class="search-line-pill" style="background:${l.color}; color:${l.text_color};">${l.short_name.replace(/bis$/i, 'b')}</span>`)
          .join('');

        const hubTag = st.is_hub || st.lines.length >= 3 ? `<span class="cmd-palette-hub">Pôle</span>` : '';

        return `
          <div
            class="cmd-palette-item ${index === this.activeIndex ? 'is-active' : ''}"
            id="cmd-result-${index}"
            role="option"
            aria-selected="${index === this.activeIndex ? 'true' : 'false'}"
            data-index="${index}"
          >
            <div class="cmd-palette-item-name">
              <span>${st.name}</span>
              ${hubTag}
            </div>
            <div class="cmd-palette-item-badges">${badges}</div>
          </div>
        `;
      })
      .join('');

    // Click handler for result rows
    this.resultsEl.querySelectorAll('.cmd-palette-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.getAttribute('data-index') || '0', 10);
        if (this.currentMatches[idx]) {
          this.selectStation(this.currentMatches[idx]);
        }
      });
      el.addEventListener('mouseenter', () => {
        this.activeIndex = parseInt(el.getAttribute('data-index') || '0', 10);
        this.updateActiveHighlight();
      });
    });
  }

  private updateActiveHighlight() {
    const items = this.resultsEl.querySelectorAll('.cmd-palette-item');
    items.forEach((item, index) => {
      const isActive = index === this.activeIndex;
      item.classList.toggle('is-active', isActive);
      item.setAttribute('aria-selected', String(isActive));
      if (isActive) {
        item.scrollIntoView({ block: 'nearest' });
        this.inputEl.setAttribute('aria-activedescendant', `cmd-result-${index}`);
      }
    });
    if (this.activeIndex === -1) {
      this.inputEl.removeAttribute('aria-activedescendant');
    }
  }

  private selectStation(station: StationMetadata) {
    this.close();
    this.onStationSelect(station);
  }
}
