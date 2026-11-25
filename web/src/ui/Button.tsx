import type { ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from 'react';
import { cx } from './cx';
import {
  BoutonEmbarquement,
  Poussoir,
  type Taille,
  type Variante,
} from './plan-lumineux/PlanLumineux';
import { useUiStore } from './ui_store';

/**
 * Buttons — Plan Lumineux (PILI 1937 + faïence).
 * Five variants with one job each:
 *  primaire   — email cobalt (single main action of a view)
 *  secondaire — faïence blanche (standard action)
 *  discret    — low-emphasis, inside dense layouts
 *  afficheur  — embarquement (orange globe + sliding doors into 3D)
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
  /** Toggle state: renders the PILI brass ring + sets aria-pressed */
  pressed?: boolean;
  /** Shows the PILI ASVA LED (unlit when pressed=false, lit when pressed=true) */
  lampe?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

const VARIANT_MAP: Record<ButtonVariant, Variante> = {
  primaire: 'email',
  secondaire: 'faience',
  discret: 'discret',
  afficheur: 'embarquement',
  alerte: 'alerte',
};

export const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primaire: 'pl-poussoir',
  secondaire: 'pl-poussoir',
  discret: 'pl-poussoir',
  afficheur: 'pl-poussoir',
  alerte: 'pl-poussoir',
};

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
  lampe,
  onClick,
  ref,
  ...rest
}: ButtonProps) {
  const { parisRideLoading } = useUiStore();
  if (variant === 'afficheur') {
    return (
      <BoutonEmbarquement
        taille={size as Taille}
        pleineLargeur={fullWidth}
        loading={Boolean(loading || parisRideLoading)}
        disabled={disabled}
        className={cx('max-md:min-h-[44px] max-md:min-w-[44px]', className)}
        onOuvertes={() => {
          onClick?.({} as MouseEvent<HTMLButtonElement>);
        }}
        {...rest}
      >
        {children ?? 'Monter à bord'}
      </BoutonEmbarquement>
    );
  }

  return (
    <Poussoir
      ref={ref}
      type={type}
      variante={VARIANT_MAP[variant]}
      taille={size as Taille}
      pleineLargeur={fullWidth}
      lampe={lampe ?? false}
      pressed={pressed}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      icone={loading ? <Spinner /> : icon}
      onClick={onClick}
      className={cx('max-md:min-h-[44px] max-md:min-w-[44px]', className)}
      {...rest}
    >
      {children != null && (
        <span className="min-w-0 truncate py-[1px] leading-[1.35]">{children}</span>
      )}
      {iconEnd}
    </Poussoir>
  );
}

export interface IconButtonProps
  extends Omit<ButtonProps, 'icon' | 'iconEnd' | 'children' | 'fullWidth'> {
  /** Required: accessible name, also used as tooltip */
  label: string;
  icon: ReactNode;
  /** Toggle state for map controls and switches */
  pressed?: boolean;
  /** Disclosure state (menus, panels): aria-expanded + active look */
  expanded?: boolean;
}

export function IconButton({
  label,
  icon,
  pressed,
  expanded,
  variant = 'discret',
  size = 'md',
  className,
  type = 'button',
  ref,
  ...rest
}: IconButtonProps) {
  return (
    <Poussoir
      ref={ref}
      type={type}
      rond
      variante={VARIANT_MAP[variant]}
      taille={size as Taille}
      pressed={pressed}
      expanded={expanded}
      aria-label={label}
      title={label}
      icone={icon}
      className={cx('max-md:min-h-[44px] max-md:min-w-[44px]', className)}
      {...rest}
    />
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="animate-spin" aria-hidden>
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
