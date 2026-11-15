import {
  RiAddLine, RiBox3Line, RiBuilding2Line, RiCameraLensLine, RiCompass3Line, RiFocus3Line, RiNavigationFill,
  RiNavigationLine, RiSubtractLine,
} from '@remixicon/react';
import { IconButton } from './Button';
import { cx } from './cx';
import { MenuBouton, type MenuEntree } from './Menu';
import { Panneau } from './Panneau';

/**
 * Contrôles de carte (v2.1) : uniquement des IconButton, uniquement des actions
 * sur la carte. L’entrée « Cabine & Quai 3D » est retirée : entrer en 3D est une
 * action sur un sujet (ligne, station, rame) et vit dans le panneau de ce sujet.
 */
export interface MapControlsProps {
  vue3d: boolean;
  onVue3d: () => void;
  /** Seul endroit du réglage « Bâtiments en relief » (optionnel en mode Simple) */
  batiments?: boolean;
  onBatiments?: () => void;
  /** Suivi continu de la position (GPS en direct) */
  gps: boolean;
  onGps: () => void;
  /** Affiché seulement quand la caméra s’est éloignée : « Recentrer sur Paris », « Recentrer sur Bastille » */
  recentrer?: { label: string; onClick: () => void } | null;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  /** Cap en degrés ; la boussole n’apparaît que hors nord */
  cap?: number;
  onNord?: () => void;
  /** Points de vue propres à une ville (Édimbourg…), en noms complets */
  pointsDeVue?: MenuEntree[];
  zoom?: boolean;
  className?: string;
}

export function MapControls(p: MapControlsProps) {
  const cap = p.cap ?? 0;
  return (
    <div className={cx('pointer-events-none flex flex-col items-end gap-2', p.className)}>
      <Panneau className="flex flex-col gap-0.5 p-1">
        <IconButton label="Vue en 3D" pressed={p.vue3d} onClick={p.onVue3d} icon={<RiBox3Line aria-hidden />} />
        {p.onBatiments && (
          <IconButton label="Bâtiments en relief" pressed={Boolean(p.batiments)} onClick={p.onBatiments} icon={<RiBuilding2Line aria-hidden />} />
        )}
        <span aria-hidden className="mx-2 my-0.5 h-px bg-joint" />
        <IconButton
          label="Suivre ma position"
          pressed={p.gps}
          onClick={p.onGps}
          icon={p.gps ? <RiNavigationFill aria-hidden /> : <RiNavigationLine aria-hidden />}
        />
        {p.recentrer && <IconButton label={p.recentrer.label} onClick={p.recentrer.onClick} icon={<RiFocus3Line aria-hidden />} />}
        {Math.abs(cap) > 1 && p.onNord && (
          <IconButton label="Revenir au nord" onClick={p.onNord} icon={<RiCompass3Line aria-hidden style={{ transform: `rotate(${-cap}deg)` }} />} />
        )}
        {p.pointsDeVue && p.pointsDeVue.length > 0 && (
          <MenuBouton size="md" align="gauche" label="Points de vue" icon={<RiCameraLensLine aria-hidden />} entrees={p.pointsDeVue} />
        )}
      </Panneau>
      {(p.zoom ?? true) && p.onZoomIn && p.onZoomOut && (
        <Panneau className="hidden flex-col gap-0.5 p-1 md:flex">
          <IconButton label="Zoom avant" onClick={p.onZoomIn} icon={<RiAddLine aria-hidden />} />
          <span aria-hidden className="mx-2 h-px bg-joint" />
          <IconButton label="Zoom arrière" onClick={p.onZoomOut} icon={<RiSubtractLine aria-hidden />} />
        </Panneau>
      )}
    </div>
  );
}
