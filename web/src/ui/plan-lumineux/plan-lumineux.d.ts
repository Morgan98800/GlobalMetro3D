export function initialiser(root?: HTMLElement): () => void;
export function genererFaience(): void;
export function observerLampes(root?: HTMLElement): () => void;
export function tracer(thermo: HTMLElement, cible: number, options?: { depuis?: number }): void;
export function embarquer(bouton: HTMLButtonElement, options?: { onOuvertes?: () => void }): void;
export function clavier(groupe: HTMLElement): () => void;

export interface SielLigne {
  destination: string;
  minutes: number;
}

export class Siel {
  constructor(
    canvas: HTMLCanvasElement,
    options?: {
      lignes?: SielLigne[];
      onSuivre?: (index: number) => void;
    }
  );
  maj(lignes: SielLigne[]): void;
  detruire(): void;
}
