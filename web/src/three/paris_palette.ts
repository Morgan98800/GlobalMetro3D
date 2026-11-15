/**
 * Faïence v2 for the 3D scenes (station_detail_lod.ts, paris_ride_view.ts).
 * Physical materials first: the interface borrows its look from these, so
 * the station on screen and the station in 3D speak the same language.
 * Brass lives here now — a material, not an interface colour.
 */
import { hexToInt, palette } from '../design/tokens';

type Std = { color: number; roughness: number; metalness: number };
type Phys = Std & { clearcoat?: number; clearcoatRoughness?: number; emissive?: number; emissiveIntensity?: number };

export const MATERIAUX: Record<string, Phys> = {
  /** Bevelled white tile, 15 × 7.5 cm, running bond */
  faience: { color: 0xf4f3ef, roughness: 0.16, metalness: 0, clearcoat: 0.65, clearcoatRoughness: 0.1 },
  joint: { color: 0xc9ccd1, roughness: 0.92, metalness: 0 },
  /** Station name plates and line friezes */
  plaqueEmail: { color: hexToInt(palette.email[800]), roughness: 0.2, metalness: 0, clearcoat: 0.9, clearcoatRoughness: 0.06 },
  laiton: { color: 0xb38f3a, roughness: 0.3, metalness: 1 },
  laitonPatine: { color: 0x8d7334, roughness: 0.46, metalness: 1 },
  inox: { color: 0xc6cbd2, roughness: 0.26, metalness: 1 },
  quai: { color: 0x8b8a85, roughness: 0.86, metalness: 0 },
  bordureQuai: { color: 0xd9d6cc, roughness: 0.7, metalness: 0 },
  bandeEveil: { color: 0xe6e2d6, roughness: 0.62, metalness: 0 },
  voute: { color: 0xefede7, roughness: 0.22, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.2 },
  tunnel: { color: 0x3b3a36, roughness: 0.96, metalness: 0 },
  ballast: { color: 0x55534d, roughness: 1, metalness: 0 },
  rail: { color: 0x9aa0a6, roughness: 0.35, metalness: 1 },
  /** Cast-iron green of 1900 entrances (public-domain heritage) */
  fonteVerte: { color: 0x5b7a5f, roughness: 0.55, metalness: 0.2 },
  lanterne: { color: 0xffd9a0, roughness: 0.4, metalness: 0, emissive: 0xffa94d, emissiveIntensity: 0.7 },
};

/** Frieze in the line colour, with the same glaze as the plates. */
export function frise(lineHex: string): Phys {
  return { color: hexToInt(lineHex), roughness: 0.24, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.08 };
}

export const ECLAIRAGE = {
  station: { color: 0xfff1dd, intensity: 1.15 },
  tunnel: { color: 0xffe2b8, intensity: 0.35 },
  cabine: { color: 0xf3f6ff, intensity: 0.9 },
  ciel: { jour: 0xdfe6ee, nuit: hexToInt(palette.nuit[900]) },
};

/** Cab displays (KVB, speed): black glass, amber numerals — the afficheur. */
export const PUPITRE = {
  fond: '#000000',
  chiffres: palette.ambre[500],
  unite: palette.ambre[300],
  theorique: '#dfe4ee',
  ok: palette.normal[300],
  alerte: palette.signal[300],
  graduation: 'rgba(255,255,255,0.5)',
  police: "'Asap Variable', 'Asap', system-ui, sans-serif",
};

/**
 * Draws the speed display on a canvas used as a texture in the cab.
 * Call on every speed change; set texture.needsUpdate = true afterwards.
 */
export function drawAfficheurVitesse(
  ctx: CanvasRenderingContext2D,
  o: { vitesse: number; limite?: number; materiel?: string; etat?: string; couleurLigne?: string; libelleLigne?: string },
) {
  const { width: w, height: h } = ctx.canvas;
  const u = h / 100;
  ctx.save();
  ctx.fillStyle = PUPITRE.fond;
  ctx.fillRect(0, 0, w, h);
  const glaze = ctx.createLinearGradient(0, 0, 0, h * 0.4);
  glaze.addColorStop(0, 'rgba(255,255,255,0.07)');
  glaze.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glaze;
  ctx.fillRect(0, 0, w, h * 0.4);
  (ctx as CanvasRenderingContext2D & { fontStretch?: string }).fontStretch = 'condensed';

  if (o.libelleLigne && o.couleurLigne) {
    ctx.fillStyle = o.couleurLigne;
    ctx.beginPath();
    ctx.arc(10 * u, 13 * u, 7 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.font = `700 ${8 * u}px ${PUPITRE.police}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(o.libelleLigne, 10 * u, 13.5 * u);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  if (o.materiel) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 ${9 * u}px ${PUPITRE.police}`;
    ctx.fillText(o.materiel, 20 * u, 16.5 * u);
  }
  if (o.etat) {
    ctx.fillStyle = PUPITRE.chiffres;
    ctx.font = `700 ${7.5 * u}px ${PUPITRE.police}`;
    ctx.textAlign = 'right';
    ctx.fillText(o.etat, w - 6 * u, 16 * u);
  }
  ctx.textAlign = 'right';
  ctx.fillStyle = PUPITRE.chiffres;
  ctx.font = `700 ${46 * u}px ${PUPITRE.police}`;
  ctx.fillText(String(Math.round(o.vitesse)), w * 0.62, 72 * u);
  ctx.textAlign = 'left';
  ctx.fillStyle = PUPITRE.unite;
  ctx.font = `600 ${10 * u}px ${PUPITRE.police}`;
  ctx.fillText('km/h', w * 0.64, 72 * u);

  if (o.limite) {
    const x = 6 * u, y = 84 * u, bw = w - 12 * u, bh = 5 * u;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y, bw, bh);
    const r = Math.min(1, o.vitesse / o.limite);
    ctx.fillStyle = r > 0.97 ? PUPITRE.alerte : PUPITRE.ok;
    ctx.fillRect(x, y, bw * r, bh);
    ctx.fillStyle = PUPITRE.graduation;
    ctx.font = `600 ${6 * u}px ${PUPITRE.police}`;
    ctx.fillText(`Limite ${o.limite} km/h`, x, y - 2 * u);
  }
  ctx.restore();
}
