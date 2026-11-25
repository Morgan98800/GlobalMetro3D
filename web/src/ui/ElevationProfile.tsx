import type { RameThermo } from './Thermometre';

export interface ElevationStopPoint {
  id: string;
  nom: string;
  elevationM: number;
}

export interface ElevationProfileProps {
  couleur: string;
  stops: ElevationStopPoint[];
  rames?: RameThermo[];
}

/**
 * Compact dynamic longitudinal cross-section (altitude vs surface) for a Paris line.
 * Highlights aerial viaducts (L2, L5, L6, L8, L11) above 0m and underground/sub-Seine tunnels below 0m.
 */
export function ElevationProfile({ couleur, stops, rames = [] }: ElevationProfileProps) {
  if (stops.length < 2) return null;

  const W = 320;
  const H = 68;
  const padX = 10;
  const padTop = 10;
  const padBot = 12;

  const elevations = stops.map((s) => s.elevationM);
  const minZ = Math.min(-18, ...elevations) - 2;
  const maxZ = Math.max(8, ...elevations) + 2;
  const spanZ = Math.max(10, maxZ - minZ);

  const xAt = (idxFloat: number) =>
    padX +
    (Math.max(0, Math.min(stops.length - 1, idxFloat)) / (stops.length - 1)) * (W - padX * 2);
  const yAt = (z: number) => padTop + ((maxZ - z) / spanZ) * (H - padTop - padBot);

  const yGround = yAt(0);
  const pts = stops.map((s, i) => `${xAt(i).toFixed(1)},${yAt(s.elevationM).toFixed(1)}`);
  const linePath = `M ${pts.join(' L ')}`;
  const areaPath = `${linePath} L ${xAt(stops.length - 1).toFixed(1)},${H - 2} L ${xAt(0).toFixed(1)},${H - 2} Z`;

  const maxPos = Math.max(...elevations);
  const minPos = Math.min(...elevations);

  return (
    <div className="mt-3 rounded-[10px] border border-bord bg-encart/55 px-2.5 py-2">
      <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-encre-3">
        <span>Profil altimétrique</span>
        <span className="chiffres">
          {minPos.toFixed(0)} m … {maxPos > 0 ? `+${maxPos.toFixed(0)}` : maxPos.toFixed(0)} m
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Profil en long souterrain et aérien de la ligne"
        className="h-[68px] w-full overflow-visible"
      >
        {/* Surface street level reference */}
        <line
          x1={padX}
          y1={yGround}
          x2={W - padX}
          y2={yGround}
          stroke="currentColor"
          strokeOpacity={0.28}
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        <text
          x={padX + 2}
          y={Math.max(9, yGround - 3)}
          fontSize="8.5"
          fill="currentColor"
          opacity={0.55}
        >
          Sol (0 m)
        </text>

        {/* Subsurface fill & track curve */}
        <path d={areaPath} fill={couleur} fillOpacity={0.14} />
        <path
          d={linePath}
          fill="none"
          stroke={couleur}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Station nodes (extremes & aerial viaduct highlights) */}
        {stops.map((s, i) => {
          const isExtreme = i === 0 || i === stops.length - 1 || s.elevationM > 0;
          if (!isExtreme && stops.length > 18 && i % 2 === 1) return null;
          return (
            <circle
              key={s.id}
              cx={xAt(i)}
              cy={yAt(s.elevationM)}
              r={i === 0 || i === stops.length - 1 ? 3 : 2}
              fill={s.elevationM > 0 ? '#fbbf24' : couleur}
              stroke="#0f172a"
              strokeWidth={0.8}
            >
              <title>{`${s.nom} (${s.elevationM > 0 ? '+' : ''}${s.elevationM.toFixed(1)} m)`}</title>
            </circle>
          );
        })}

        {/* Active trains interpolated along the altitude curve */}
        {rames.map((r) => {
          const idx0 = Math.max(0, Math.min(stops.length - 1, r.apres));
          const idx1 = Math.max(0, Math.min(stops.length - 1, idx0 + 1));
          const frac = Math.max(0, Math.min(1, r.progression));
          const x = xAt(idx0 + frac);
          const z =
            stops[idx0].elevationM + (stops[idx1].elevationM - stops[idx0].elevationM) * frac;
          return (
            <circle
              key={r.id}
              cx={x}
              cy={yAt(z)}
              r={3.2}
              fill="#ffffff"
              stroke={couleur}
              strokeWidth={1.6}
            >
              <title>{r.description}</title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
}
