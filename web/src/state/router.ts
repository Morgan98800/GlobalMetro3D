export interface RouteParams {
  lineShortName: string | null;
  dir: string | null;
}

export class SubwayRouter {
  private onRouteChange: (params: RouteParams) => void;

  constructor(onRouteChange: (params: RouteParams) => void) {
    this.onRouteChange = onRouteChange;

    window.addEventListener('popstate', () => {
      this.onRouteChange(this.parseCurrentUrl());
    });
  }

  public getInitialRoute(): RouteParams {
    return this.parseCurrentUrl();
  }

  public setRoute(lineShortName: string | null, dir: string = '0') {
    let newPath = '/';
    if (lineShortName) {
      newPath = `/ligne/${encodeURIComponent(lineShortName)}?dir=${encodeURIComponent(dir)}`;
    }

    if (window.location.pathname + window.location.search !== newPath) {
      window.history.pushState({ lineShortName, dir }, '', newPath);
    }
  }

  private parseCurrentUrl(): RouteParams {
    const pathname = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    const dir = searchParams.get('dir');

    // Pattern: /ligne/:shortName
    const match = pathname.match(/\/ligne\/([^/?#]+)/);
    if (match) {
      const lineShortName = decodeURIComponent(match[1]);
      return { lineShortName, dir: dir || '0' };
    }

    return { lineShortName: null, dir: null };
  }
}
