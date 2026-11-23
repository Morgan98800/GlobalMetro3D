import {
  RiBox3Line,
  RiCameraLensLine,
  RiFocus3Line,
  RiNavigationFill,
  RiNavigationLine,
} from '@remixicon/react';
import { IconButton } from './Button';
import { cx } from './cx';
import { MenuBouton, type MenuEntree } from './Menu';
import { Panneau } from './Panneau';

export interface MapControlsProps {
  vue3d: boolean;
  onVue3d: () => void;
  gps: boolean;
  onGps: () => void;
  recentrer?: { label: string; onClick: () => void } | null;
  pointsDeVue?: MenuEntree[];
  className?: string;
}

export function MapControls(p: MapControlsProps) {
  return (
    <div className={cx('pointer-events-none flex flex-col items-end gap-2', p.className)}>
      <Panneau className="flex flex-col gap-1 rounded-[16px] p-1.5 max-md:gap-0.5 max-md:rounded-[14px] max-md:p-1">
        <IconButton label="Vue 3D" pressed={p.vue3d} onClick={p.onVue3d} icon={<RiBox3Line aria-hidden />} />
        <span aria-hidden className="mx-2 my-0.5 h-px bg-joint max-md:mx-1.5" />
        <IconButton
          label="Ma position"
          pressed={p.gps}
          onClick={p.onGps}
          icon={p.gps ? <RiNavigationFill aria-hidden /> : <RiNavigationLine aria-hidden />}
        />
        {p.recentrer && <IconButton label={p.recentrer.label} onClick={p.recentrer.onClick} icon={<RiFocus3Line aria-hidden />} />}
        {p.pointsDeVue && p.pointsDeVue.length > 0 && (
          <MenuBouton size="md" align="gauche" label="Points de vue" icon={<RiCameraLensLine aria-hidden />} entrees={p.pointsDeVue} />
        )}
      </Panneau>
    </div>
  );
}
