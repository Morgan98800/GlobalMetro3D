export interface RouteParams {
  city: string;
  lineShortName: string | null;
  dir: string | null;
}

export class SubwayRouter {
  private currentCity: string = 'paris';
  private onRouteChange: (params: RouteParams) => void;

  constructor(onRouteChange: (params: RouteParams) => void) {
    this.onRouteChange = onRouteChange;

    // Handle root redirect to last-visited city or default 'paris'
    this.ensureCityPath();

    window.addEventListener('popstate', () => {
      this.onRouteChange(this.parseCurrentUrl());
    });
  }

  public getInitialRoute(): RouteParams {
    return this.parseCurrentUrl();
  }

  public getCurrentCity(): string {
    return this.parseCurrentUrl().city;
  }

  public setCity(city: string) {
    this.currentCity = city;
    try {
      localStorage.setItem('paris-subway-last-city', city);
    } catch {
      // ignore storage failure in private browsing
    }
    const newPath = `/${encodeURIComponent(city)}`;
    if (window.location.pathname !== newPath) {
      window.history.pushState({ city, lineShortName: null, dir: '0' }, '', newPath);
      this.onRouteChange(this.parseCurrentUrl());
    }
  }

  public setRoute(lineShortName: string | null, dir: string = '0', city?: string) {
    const activeCity = city || this.currentCity;
    try {
      localStorage.setItem('paris-subway-last-city', activeCity);
    } catch {
      // ignore
    }

    let newPath = `/${encodeURIComponent(activeCity)}`;
    if (lineShortName) {
      newPath = `/${encodeURIComponent(activeCity)}/ligne/${encodeURIComponent(lineShortName)}?dir=${encodeURIComponent(dir)}`;
    }

    if (window.location.pathname + window.location.search !== newPath) {
      window.history.pushState({ city: activeCity, lineShortName, dir }, '', newPath);
    }
  }

  private ensureCityPath(): void {
    const pathname = window.location.pathname;
    if (pathname === '/' || pathname === '') {
      let lastCity = 'paris';
      try {
        lastCity = localStorage.getItem('paris-subway-last-city') || 'paris';
      } catch {
        // ignore
      }
      this.currentCity = lastCity;
      window.history.replaceState({ city: lastCity, lineShortName: null, dir: '0' }, '', `/${lastCity}`);
    }
  }

  public parseCurrentUrl(): RouteParams {
    const pathname = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    const dir = searchParams.get('dir');

    // Root or empty path: default to stored last city or paris
    if (pathname === '/' || pathname === '') {
      let lastCity = 'paris';
      try {
        lastCity = localStorage.getItem('paris-subway-last-city') || 'paris';
      } catch {
        // ignore
      }
      return { city: lastCity, lineShortName: null, dir: null };
    }

    // Pattern: /:city/ligne/:shortName
    const cityLineMatch = pathname.match(/^\/([^/?#]+)\/ligne\/([^/?#]+)/);
    if (cityLineMatch) {
      const city = decodeURIComponent(cityLineMatch[1]);
      const lineShortName = decodeURIComponent(cityLineMatch[2]);
      this.currentCity = city;
      return { city, lineShortName, dir: dir || '0' };
    }

    // Legacy pattern: /ligne/:shortName (treat as paris)
    const legacyLineMatch = pathname.match(/^\/ligne\/([^/?#]+)/);
    if (legacyLineMatch) {
      const lineShortName = decodeURIComponent(legacyLineMatch[1]);
      return { city: 'paris', lineShortName, dir: dir || '0' };
    }

    // Pattern: /:city
    const cityMatch = pathname.match(/^\/([^/?#]+)/);
    if (cityMatch) {
      const city = decodeURIComponent(cityMatch[1]);
      this.currentCity = city;
      return { city, lineShortName: null, dir: null };
    }

    return { city: 'paris', lineShortName: null, dir: null };
  }
}
