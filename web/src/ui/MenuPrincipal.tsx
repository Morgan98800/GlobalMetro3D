import { RiBarChartHorizontalLine, RiInformationLine } from '@remixicon/react';
import type { ReactNode } from 'react';
import { cx } from './cx';
import { Joint, Panneau } from './Panneau';
import { Segmented } from './Segmented';
import type { Experience } from './TopNavBar';

/**
 * Menu ⋮ (v2.1). Remplace la modale « Réglages » : chaque réglage n’a plus qu’un endroit.
 *  - Niveau de détail : ici sur mobile seulement (sur bureau, il est dans la barre).
 *  - Thème : ici, partout.
 *  - Bâtiments en relief : dans MapControls, plus ici.
 * Les réglages s’appliquent immédiatement : pas de bouton « Terminer ».
 * C’est un dialogue non modal (il contient des groupes radio), pas un role="menu".
 */
export type ThemeChoix = 'systeme' | 'clair' | 'sombre';

export interface MenuPrincipalProps {
  /** Niveau de détail (Simple / Passionné) */
  experience?: Experience;
  onExperience?: (e: Experience) => void;
  theme: ThemeChoix;
  onTheme: (t: ThemeChoix) => void;
  reseaux?: { id: string; nom: string; actif: boolean; onSelect: () => void }[];
  onRecords: () => void;
  onAPropos: () => void;
  className?: string;
}

export function MenuPrincipal({ experience, onExperience, theme, onTheme, reseaux, onRecords, onAPropos, className }: MenuPrincipalProps) {
  return (
    <Panneau as="section" role="dialog" aria-label="Menu et réglages" className={cx('w-[320px] max-w-[calc(100vw-24px)] p-3 animate-feuille', className)}>
      {experience && onExperience && (
        <Reglage titre="Niveau de détail" aide="Passionné ajoute la télémétrie, les indicateurs de ligne et le suivi des rames.">
          <Segmented size="sm" label="Niveau de détail" value={experience} onChange={onExperience} options={[{ value: 'simple', label: 'Simple' }, { value: 'passionne', label: 'Passionné' }]} />
        </Reglage>
      )}
      <Reglage titre="Thème">
        <Segmented
          size="sm"
          label="Thème"
          value={theme}
          onChange={onTheme}
          options={[{ value: 'systeme', label: 'Système' }, { value: 'clair', label: 'Clair' }, { value: 'sombre', label: 'Sombre' }]}
        />
      </Reglage>
      {reseaux && reseaux.length > 1 && (
        <div className="px-1 pb-2">
          <p className="mb-1.5 text-[12px] font-semibold text-encre-3">Réseau</p>
          <div className="flex flex-wrap gap-1">
            {reseaux.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={r.actif}
                onClick={r.onSelect}
                className={cx(
                  'h-8 rounded-controle px-2.5 text-[12px] font-semibold transition-colors duration-150 ease-signal outline-none focus-visible:outline-2 focus-visible:outline-focus',
                  r.actif ? 'bg-selection text-selection-encre' : 'bg-encart text-encre hover:bg-joint',
                )}
              >
                {r.nom}
              </button>
            ))}
          </div>
        </div>
      )}
      <Joint className="mb-1.5 mt-1" />
      <Ligne icon={<RiBarChartHorizontalLine aria-hidden />} onClick={onRecords}>Records de fréquentation</Ligne>
      <Ligne icon={<RiInformationLine aria-hidden />} onClick={onAPropos}>À propos et méthode</Ligne>
    </Panneau>
  );
}

function Reglage({ titre, aide, children }: { titre: string; aide?: string; children: ReactNode }) {
  return (
    <div className="px-1 pb-3">
      <p className="mb-1.5 text-[12px] font-semibold text-encre-3">{titre}</p>
      {children}
      {aide && <p className="mt-1.5 text-legende text-encre-3">{aide}</p>}
    </div>
  );
}

function Ligne({ icon, children, onClick }: { icon: ReactNode; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-start text-[14px] font-medium text-encre outline-none transition-colors duration-150 ease-signal hover:bg-encart focus-visible:outline-2 focus-visible:outline-focus [&_svg]:size-[18px] [&_svg]:text-icone-2"
    >
      {icon}
      {children}
    </button>
  );
}
