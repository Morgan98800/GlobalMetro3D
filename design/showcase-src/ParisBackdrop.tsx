import { geoPath, geoTransform } from 'd3-geo';
import { useMemo } from 'react';
import { BASEMAP } from '../../web/src/map/basemap_palette';
import { resolveLine } from '../../web/src/ui/lines';
import raw from './data/paris_backdrop.json';

/**
 * Mockup basemap drawn from open data with the Faïence map palette.
 * Lines and stations: Wikipédia (CC BY-SA) via metro-de-paris; water © Apur,
 * parks © Ville de Paris / OSM (ODbL). Mockups only — the app keeps its own data.
 */
type Station = { n: string; c: [number, number]; l: string[] };
type Data = {
  attribution: string;
  water: number[][][][][];
  parks: number[][][][][];
  lines: Record<string, number[][][]>;
  stations: Station[];
};
const data = raw as unknown as Data;
export const ATTRIBUTION = data.attribution;
const typo = (s: string) => s.replace(/ - /g, ' – ').replace(/'/g, '’');
const lignesDe = (s: Station) => s.l.filter((l) => l !== 'Couloirs');

export interface BackdropProps {
  width: number;
  height: number;
  theme: 'jour' | 'nuit';
  center: [number, number];
  zoom: number;
  offset?: [number, number];
  highlight?: string[];
  route?: { line: string; stops: string[] };
  focus?: string;
  labels?: string[];
  /** Rames dessinées sur la ligne : entre deux stations (noms), t de 0 à 1 */
  trains?: { line: string; from: string; to: string; t: number; suivi?: boolean }[];
  /** Position de l’utilisateur [lon, lat] */
  utilisateur?: [number, number];
}

export function ParisBackdrop({ width, height, theme, center, zoom, offset = [0, 0], highlight = [], route, focus, labels = [], trains = [], utilisateur }: BackdropProps) {
  const c = BASEMAP[theme];
  // Planar Web Mercator: winding-agnostic (d3's spherical mode would invert
  // RFC 7946 polygons and flood the map with water).
  const path = useMemo(() => {
    const k = (256 * 2 ** zoom) / (2 * Math.PI);
    const my = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
    const x0 = (center[0] * Math.PI) / 180;
    const y0 = my(center[1]);
    const cx = width / 2 + offset[0];
    const cy = height / 2 + offset[1];
    const project = (lon: number, lat: number): [number, number] => [cx + ((lon * Math.PI) / 180 - x0) * k, cy - (my(lat) - y0) * k];
    const transform = geoTransform({
      point(lon, lat) {
        const [x, y] = project(lon, lat);
        this.stream.point(x, y);
      },
    });
    return { project, d: geoPath(transform) };
  }, [width, height, zoom, center, offset]);
  const xy = (p: [number, number]) => path.project(p[0], p[1]);

  const w = zoom < 12 ? 2.4 : zoom < 13.5 ? 4 : zoom < 14.6 ? 6 : 7;
  const casing = w + (zoom < 12 ? 2.4 : 3.5);
  const keys = Object.keys(data.lines).filter((k) => k !== 'Couloirs');
  const hi = new Set(highlight);
  const isDim = (k: string) => hi.size > 0 && !hi.has(k);
  const color = (k: string) => resolveLine({ shortName: k }).color;
  const ml = (k: string) => path.d({ type: 'MultiLineString', coordinates: data.lines[k] }) ?? '';
  const byName = new Map(data.stations.map((s) => [s.n, s]));
  const routePts = route?.stops.map((n) => byName.get(n)?.c).filter(Boolean) as [number, number][] | undefined;
  const near = zoom >= 13;
  const fold = (x: string) => x.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[’']/g, "'").replace(/ – | - /g, ' ');
  const trouve = (n: string) => byName.get(n) ?? data.stations.find((s) => fold(s.n).startsWith(fold(n)));

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 select-none" aria-hidden>
      <rect width={width} height={height} fill={c.fond} />
      <g fill={c.parc} fillRule="evenodd">
        {data.parks.map((mp, i) => <path key={i} d={path.d({ type: 'MultiPolygon', coordinates: mp }) ?? ''} />)}
      </g>
      <g fill={c.eau} fillRule="evenodd">
        {data.water.map((mp, i) => <path key={i} d={path.d({ type: 'MultiPolygon', coordinates: mp }) ?? ''} />)}
      </g>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {keys.map((k) => <path key={`c${k}`} d={ml(k)} stroke={c.lisere} strokeWidth={isDim(k) ? casing * 0.7 : casing} />)}
        {keys.filter(isDim).map((k) => (
          <path key={`d${k}`} d={ml(k)} stroke={color(k)} strokeWidth={w * 0.7} opacity={theme === 'jour' ? 0.3 : 0.28} />
        ))}
        {keys.filter((k) => !isDim(k)).map((k) => <path key={`h${k}`} d={ml(k)} stroke={c.lisere} strokeWidth={casing} />)}
        {keys.filter((k) => !isDim(k)).map((k) => <path key={k} d={ml(k)} stroke={color(k)} strokeWidth={w} />)}
        {routePts && route && (
          <>
            <path d={path.d({ type: 'LineString', coordinates: routePts }) ?? ''} stroke={color(route.line)} strokeWidth={w * 4.2} opacity={theme === 'nuit' ? 0.22 : 0.18} />
            <path d={path.d({ type: 'LineString', coordinates: routePts }) ?? ''} stroke={c.lisere} strokeWidth={w * 1.7 + 4} />
            <path d={path.d({ type: 'LineString', coordinates: routePts }) ?? ''} stroke={color(route.line)} strokeWidth={w * 1.7} />
          </>
        )}
      </g>
      <g>
        {data.stations.map((s) => {
          const ls = lignesDe(s);
          const multi = ls.length > 1;
          const dim = hi.size > 0 && !ls.some((l) => hi.has(l));
          if (!near && (!multi || dim)) return null;
          const [x, y] = xy(s.c);
          if (x < -20 || y < -20 || x > width + 20 || y > height + 20) return null;
          const onRoute = route?.stops.includes(s.n);
          const r = near ? (multi || onRoute ? 5.2 : 3.4) : zoom < 12 ? 2.3 : 3;
          return (
            <circle
              key={s.n}
              cx={x}
              cy={y}
              r={r}
              fill={c.station}
              stroke={multi || !near ? c.stationBord : color(ls[0])}
              strokeWidth={near ? 2.2 : 1.3}
              opacity={dim ? 0.5 : 1}
            />
          );
        })}
        {focus && byName.get(focus) && (() => {
          const [x, y] = xy(byName.get(focus)!.c);
          return (
            <g>
              <circle cx={x} cy={y} r={22} fill="var(--color-email-400)" opacity={0.18} />
              <circle cx={x} cy={y} r={9} fill={c.station} stroke={c.stationBord} strokeWidth={3.2} />
            </g>
          );
        })()}
        {trains.map((tr, i) => {
          const a = trouve(tr.from)?.c;
          const b = trouve(tr.to)?.c;
          if (!a || !b) return null;
          const [x0, y0] = xy(a);
          const [x1, y1] = xy(b);
          const x = x0 + (x1 - x0) * tr.t;
          const y = y0 + (y1 - y0) * tr.t;
          return tr.suivi ? (
            <g key={i}>
              <circle cx={x} cy={y} r={26} fill="var(--color-email-400)" opacity={0.2} />
              <circle cx={x} cy={y} r={10} fill={color(tr.line)} stroke="#fff" strokeWidth={3.5} />
            </g>
          ) : (
            <circle key={i} cx={x} cy={y} r={near ? 5.5 : 3.5} fill={color(tr.line)} stroke="#fff" strokeWidth={2} />
          );
        })}
        {utilisateur && (() => {
          const [x, y] = xy(utilisateur);
          return (
            <g>
              <circle cx={x} cy={y} r={34} fill="var(--color-email-500)" opacity={0.12} />
              <circle cx={x} cy={y} r={8.5} fill="var(--color-email-600)" stroke="#fff" strokeWidth={3} />
            </g>
          );
        })()}
      </g>
      <g fontFamily="var(--font-sans)" style={{ fontStretch: '80%' }} fontWeight={650} paintOrder="stroke" strokeLinejoin="round">
        {labels.map((n) => {
          const s = byName.get(n);
          if (!s) return null;
          const [x, y] = xy(s.c);
          const big = n === focus || route?.stops[0] === n || route?.stops.at(-1) === n;
          return (
            <text
              key={n}
              x={x + (near ? 11 : 7)}
              y={y}
              dominantBaseline="middle"
              fontSize={big ? 15 : near ? 13 : 12}
              fill={big ? (theme === 'jour' ? '#111928' : '#eef1f7') : c.texte}
              stroke={c.halo}
              strokeWidth={3.6}
            >
              {typo(n)}
            </text>
          );
        })}
      </g>
    </svg>
  );
}
