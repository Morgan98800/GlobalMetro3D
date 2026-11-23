import type { ElementType, HTMLAttributes, ReactNode, Ref } from 'react';
import { cx } from './cx';

/**
 * Panneau — Plan Lumineux opaque surfaces (no backdrop-filter over WebGL).
 *  flottant : opaque warm stone/graphite card (.pl-carte)
 *  feuille  : generated running-bond faïence tile wall (.pl-mur)
 *  encart   : subtle inset block inside a surface
 *  verre    : permanent dark island for 3D cab/quai HUD (.pl-hud)
 */
export type PanneauMatiere = 'flottant' | 'feuille' | 'encart' | 'verre';

const MATIERE: Record<PanneauMatiere, string> = {
  flottant: 'pl-carte rounded-panneau',
  feuille: 'bg-surface text-encre rounded-feuille [box-shadow:0_0_0_1px_var(--color-joint),var(--shadow-flotte)]',
  encart: 'rounded-[10px] bg-encart',
  verre: 'pl-hud rounded-panneau text-encre',
};

export interface PanneauProps extends HTMLAttributes<HTMLElement> {
  matiere?: PanneauMatiere;
  as?: ElementType;
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
}

export function Panneau({ matiere = 'flottant', as: Tag = 'div', className, children, ...rest }: PanneauProps) {
  return (
    <Tag className={cx('pointer-events-auto', MATIERE[matiere], className)} {...rest}>
      {children}
    </Tag>
  );
}

/** Crisp hairline divider inside a surface. */
export function Joint({ className }: { className?: string }) {
  return <hr className={cx('m-0 h-px border-0 bg-joint', className)} />;
}
