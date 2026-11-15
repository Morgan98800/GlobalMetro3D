import type { ElementType, HTMLAttributes, ReactNode, Ref } from 'react';
import { cx } from './cx';

/**
 * Panneau — every surface in the app is one of four materials.
 *  flottant : translucent faïence floating over the map
 *  feuille  : opaque sheet (desktop side panel, mobile bottom sheet)
 *  encart   : inset block inside a surface (fields, grouped rows)
 *  verre    : dark glass over the 3D scene (always paired with `.dark`)
 */
export type PanneauMatiere = 'flottant' | 'feuille' | 'encart' | 'verre';

const MATIERE: Record<PanneauMatiere, string> = {
  flottant: 'flottant rounded-panneau',
  feuille: 'faience rounded-feuille [box-shadow:var(--fx-glacure),0_0_0_1px_var(--color-joint),var(--shadow-flotte)]',
  encart: 'rounded-[12px] bg-encart',
  verre: 'verre rounded-panneau text-encre',
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

/** Thin grout line between groups inside a surface. */
export function Joint({ className }: { className?: string }) {
  return <hr className={cx('m-0 h-px border-0 bg-joint', className)} />;
}
