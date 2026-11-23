import {
  RiBriefcase4Line,
  RiHome5Line,
} from '@remixicon/react';
import type { ReactNode } from 'react';
import { BottomSheet, type DetentSheet } from './BottomSheet';
import { Button } from './Button';
import { formatNombre } from './format';
import { Poussoir } from './plan-lumineux/PlanLumineux';
import { InterrupteurDirect } from './InterrupteurDirect';
import { LineBadgeChip } from './LineBadgeChip';
import { lineMode } from './lines';
import type { LigneEtat } from './LinesDock';
import { SearchTrigger } from './SearchTrigger';
import { IconBibliotheque, IconItineraire, IconLignes } from './TransitIcons';

export interface MobileHomeSheetProps {
  cran: DetentSheet;
  onCran: (c: DetentSheet) => void;
  onSearch: () => void;
  hasHome: boolean;
  hasWork: boolean;
  onDomicile: () => void;
  onTravail: () => void;
  onLignes: () => void;
  onItineraire: () => void;
  onBibliotheque: () => void;
  lignes: LigneEtat[];
  onSelectLine: (shortName: string) => void;
  expertMode: boolean;
  totalTrains: number;
  dailyKm: number;
  direct: boolean;
  directDisponible: boolean;
  onDirect?: () => void;
  rtSource?: string;
}

export function MobileHomeSheet(p: MobileHomeSheetProps) {
  const metro = p.lignes.filter((l) => lineMode(l.shortName) === 'metro');
  const rer = p.lignes.filter((l) => lineMode(l.shortName) === 'rer');

  return (
    <BottomSheet
      cran={p.cran}
      onCran={p.onCran}
      repliable
      hauteurs={{ repli: 70, bas: 152, moyen: 336 }}
      ariaLabel="Recherche et lignes du réseau"
      barreRepli={
        <div className="flex items-center gap-2">
          <SearchTrigger onOpen={p.onSearch} size="md" className="min-h-[44px] flex-1" />
          <Button
            variant="secondaire"
            size="md"
            className="min-h-[44px] shrink-0 px-3"
            onClick={() => p.onCran('moyen')}
          >
            Lignes
          </Button>
        </div>
      }
    >
      <div className="shrink-0 px-4 pt-0.5">
        <SearchTrigger onOpen={p.onSearch} size="lg" className="w-full" />

        <div className="mt-2 grid grid-cols-4 gap-1.5">
          <RaccourciBouton
            icon={<RiHome5Line aria-hidden />}
            label="Domicile"
            actif={p.hasHome}
            onClick={p.onDomicile}
          />
          <RaccourciBouton
            icon={<IconLignes />}
            label="Lignes"
            onClick={p.onLignes}
          />
          <RaccourciBouton
            icon={<IconItineraire />}
            label="Itinéraire"
            onClick={p.onItineraire}
          />
          <RaccourciBouton
            icon={<IconBibliotheque />}
            label="Bibliothèque"
            onClick={p.onBibliotheque}
          />
        </div>
      </div>

      {p.cran !== 'bas' && (
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-joint pb-[max(6px,env(safe-area-inset-bottom))]">
          <div className="px-4 pt-2.5">
            <div className="space-y-3.5">
              {metro.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-encre-3">
                    Métro
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {metro.map((l) => (
                      <LineBadgeChip
                        key={l.shortName}
                        {...l}
                        size="md"
                        onClick={() => p.onSelectLine(l.shortName)}
                        className="min-h-[44px] min-w-[44px]"
                      />
                    ))}
                  </div>
                </div>
              )}

              {rer.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-encre-3">
                    RER
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {rer.map((l) => (
                      <LineBadgeChip
                        key={l.shortName}
                        {...l}
                        size="md"
                        onClick={() => p.onSelectLine(l.shortName)}
                        className="min-h-[44px] min-w-[44px]"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

function RaccourciBouton({
  icon,
  label,
  actif,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  actif?: boolean;
  onClick: () => void;
}) {
  return (
    <Poussoir
      tuile
      variante={actif === false ? 'discret' : 'faience'}
      lampe
      actif={Boolean(actif)}
      icone={icon}
      onClick={onClick}
      className={actif === false ? 'opacity-80' : undefined}
    >
      <span className="max-w-full truncate">{label}</span>
    </Poussoir>
  );
}
