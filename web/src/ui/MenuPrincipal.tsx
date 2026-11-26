import { RiInformationLine } from '@remixicon/react';
import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { cx } from './cx';
import { Joint, Panneau } from './Panneau';
import { Poussoir } from './plan-lumineux/PlanLumineux';
import { Segmented } from './Segmented';
import type { Experience } from './TopNavBar';

/**
 * Menu ⋮ (v2.1). Remplace la modale « Réglages » : chaque réglage n’a plus qu’un endroit.
 *  - Niveau de détail : ici sur mobile seulement (sur bureau, il est dans la barre).
 *  - Thème & Bâtiments 3D : ici, partout.
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
  batiments3d?: boolean;
  onBatiments3d?: (visible: boolean) => void;
  reseaux?: { id: string; nom: string; actif: boolean; onSelect: () => void }[];
  onAPropos: () => void;
  className?: string;
}

export function MenuPrincipal({
  theme,
  onTheme,
  batiments3d,
  onBatiments3d,
  reseaux,
  onAPropos,
  className,
}: MenuPrincipalProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0.12 : 0.16, ease: [0.2, 0, 0, 1] }}
      className={cx('origin-top-right', className)}
    >
      <Panneau
        as="section"
        role="dialog"
        aria-label="Menu et réglages"
        className="w-[320px] max-w-[calc(100vw-84px)] p-3 md:max-w-[calc(100vw-24px)]"
      >
        <Reglage titre="Thème">
          <Segmented
            size="sm"
            label="Thème"
            value={theme}
            onChange={onTheme}
            options={[
              { value: 'systeme', label: 'Système' },
              { value: 'clair', label: 'Clair' },
              { value: 'sombre', label: 'Sombre' },
            ]}
          />
        </Reglage>
        {typeof batiments3d === 'boolean' && onBatiments3d && (
          <Reglage titre="Bâtiments 3D">
            <Segmented
              size="sm"
              label="Bâtiments 3D"
              value={batiments3d ? 'oui' : 'non'}
              onChange={(v) => onBatiments3d(v === 'oui')}
              options={[
                { value: 'oui', label: 'Oui' },
                { value: 'non', label: 'Non' },
              ]}
            />
          </Reglage>
        )}
        {reseaux && reseaux.length > 1 && (
          <div className="px-1 pb-2">
            <p className="mb-1.5 text-[12px] font-semibold text-encre-3">Réseau</p>
            <div className="flex flex-wrap gap-1.5">
              {reseaux.map((r) => (
                <Poussoir key={r.id} taille="sm" lampe pressed={r.actif} onClick={r.onSelect}>
                  {r.nom}
                </Poussoir>
              ))}
            </div>
          </div>
        )}
        <Joint className="mb-1.5 mt-1" />
        <Ligne icon={<RiInformationLine aria-hidden />} onClick={onAPropos}>
          À propos
        </Ligne>
      </Panneau>
    </motion.div>
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

function Ligne({
  icon,
  children,
  onClick,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pl-menu-entree transition-transform duration-100 ease-signal active:scale-[0.98] motion-reduce:active:scale-100"
    >
      {icon}
      {children}
    </button>
  );
}
