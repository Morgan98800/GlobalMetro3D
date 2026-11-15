import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cx } from './cx';

/**
 * Buttons. Five variants with one job each:
 *  primaire   — the single main action of a view (enamel blue; inverts at night)
 *  secondaire — any other action (glazed faïence)
 *  discret    — low-emphasis, inside dense layouts
 *  afficheur  — enters the railway world: Quai 3D, Cabine. One per view.
 *  alerte     — destructive or clearing actions
 */
export type ButtonVariant = 'primaire' | 'secondaire' | 'discret' | 'afficheur' | 'alerte';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconEnd?: ReactNode;
  fullWidth?: boolean;
  loading?: boolean;
  /** Toggle state: renders the selection style and sets aria-pressed */
  pressed?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

const BASE =
  'inline-flex select-none items-center justify-center whitespace-nowrap font-semibold ' +
  'transition-[background-color,box-shadow,color,transform] duration-150 ease-signal ' +
  'active:translate-y-px disabled:pointer-events-none disabled:opacity-45 ' +
  'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 rounded-[8px] px-3 text-[13px] [&_svg]:size-4',
  md: 'h-10 gap-2 rounded-controle px-3.5 text-[14px] [&_svg]:size-[18px]',
  lg: 'h-12 gap-2 rounded-[12px] px-5 text-[16px] [&_svg]:size-5',
};

const GLAZE_ON_FILL = '[box-shadow:inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(9_18_48/0.28)]';
const OUTLINED =
  '[box-shadow:var(--fx-glacure),inset_0_0_0_1px_var(--color-bord),0_1px_2px_rgb(var(--fx-ombre-teinte)/0.06)] ' +
  'hover:[box-shadow:var(--fx-glacure),inset_0_0_0_1px_var(--color-bord-fort),0_1px_2px_rgb(var(--fx-ombre-teinte)/0.08)]';

export const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primaire: cx('bg-action text-action-encre hover:bg-action-survol active:bg-action-presse', GLAZE_ON_FILL),
  secondaire: cx('bg-surface text-encre hover:bg-encart active:bg-encart-survol', OUTLINED),
  discret: 'bg-transparent text-encre hover:bg-encart active:bg-encart-survol',
  afficheur: cx(
    'bg-afficheur text-white [&_svg]:text-ambre-500',
    '[background-image:linear-gradient(180deg,rgb(255_255_255/0.09),rgb(255_255_255/0)_42%)]',
    '[box-shadow:inset_0_0_0_1px_rgb(255_255_255/0.09),0_1px_2px_rgb(0_0_0/0.3)]',
    'hover:[box-shadow:inset_0_0_0_1px_rgb(255_255_255/0.2),0_0_0_3px_rgb(255_184_28/0.16)]',
  ),
  alerte: cx('bg-surface text-signal-encre hover:bg-encart', OUTLINED),
};

const PRESSED =
  'bg-selection text-selection-encre [box-shadow:inset_0_0_0_1px_var(--color-selection-bord)]';

export function Button({
  variant = 'secondaire',
  size = 'md',
  icon,
  iconEnd,
  fullWidth,
  loading,
  className,
  children,
  type = 'button',
  disabled,
  pressed,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-pressed={pressed}
      className={cx(BASE, SIZE[size], pressed ? PRESSED : BUTTON_VARIANT[variant], fullWidth && 'w-full', className)}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children != null && <span className="min-w-0 truncate">{children}</span>}
      {iconEnd}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonProps, 'icon' | 'iconEnd' | 'children' | 'fullWidth'> {
  /** Required: accessible name, also used as tooltip */
  label: string;
  icon: ReactNode;
  /** Toggle state for map controls and switches */
  pressed?: boolean;
  /** Disclosure state (menus, panels): aria-expanded + active look */
  expanded?: boolean;
}

const ICON_SIZE: Record<ButtonSize, string> = {
  sm: 'size-8 rounded-[8px] [&_svg]:size-4',
  md: 'size-10 rounded-controle [&_svg]:size-5',
  lg: 'size-12 rounded-[12px] [&_svg]:size-6',
};

export function IconButton({
  label,
  icon,
  pressed,
  expanded,
  variant = 'discret',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      className={cx(BASE, ICON_SIZE[size], pressed || expanded ? PRESSED : BUTTON_VARIANT[variant], className)}
      {...rest}
    >
      {icon}
    </button>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="animate-spin" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
