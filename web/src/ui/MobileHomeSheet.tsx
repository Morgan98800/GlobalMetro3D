import { RiSteering2Line } from '@remixicon/react';
import type { ReactNode } from 'react';
import { BottomSheet, type DetentSheet } from './BottomSheet';
import { Button } from './Button';
import { cx } from './cx';
import { Poussoir } from './plan-lumineux/PlanLumineux';
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
  onSimulateur?: () => void;
}

export function MobileHomeSheet(p: MobileHomeSheetProps) {
  const metro = p.lignes.filter((l) => lineMode(l.shortName) === 'metro');
  const rer = p.lignes.filter((l) => lineMode(l.shortName) === 'rer');
  const hasPerturbations = p.lignes.some((l) => Boolean(l.alert));

  return (
    <BottomSheet
      cran={p.cran}
      onCran={p.onCran}
      repliable
      hauteurs={{ repli: 80, bas: 144, moyen: 336 }}
      ariaLabel="Recherche et lignes du réseau"
      barreRepli={
        <div className="flex items-center gap-2">
          <SearchTrigger onOpen={p.onSearch} size="md" className="min-h-[44px] flex-1" />
          <Button
            variant="secondaire"
            size="md"
            lampe
            pressed={p.direct || hasPerturbations}
            className="min-h-[44px] shrink-0 px-3"
            onClick={() => p.onCran('moyen')}
          >
            Lignes
          </Button>
        </div>
      }
    >
      <div className="shrink-0 px-3.5 pt-0.5 pb-2">
        <SearchTrigger onOpen={p.onSearch} size="lg" className="w-full" />

        <div className={cx('mt-2 grid gap-1.5', p.onSimulateur ? 'grid-cols-4' : 'grid-cols-3')}>
          <RaccourciBouton
            icon={<IconLignes />}
            label="Lignes"
            lampe
            actif={p.cran !== 'bas' || p.direct || hasPerturbations}
            onClick={p.onLignes}
          />
          <RaccourciBouton
            icon={<IconItineraire />}
            label="Itinéraire"
            lampe
            onClick={p.onItineraire}
          />
          <RaccourciBouton
            icon={<IconBibliotheque />}
            label="Bibliothèque"
            lampe
            onClick={p.onBibliotheque}
          />
          {p.onSimulateur && (
            <RaccourciBouton
              icon={<RiSteering2Line aria-hidden />}
              label="Conduire"
              lampe
              actif
              onClick={p.onSimulateur}
            />
          )}
        </div>
      </div>

      {p.cran !== 'bas' && (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-joint pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="px-3.5 pt-2.5">
            <div className="space-y-3">
              {metro.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-xs font-medium tracking-[0.04em] text-encre-2">
                    Métro
                  </h3>
                  <div className="grid grid-cols-7 gap-1.5">
                    {metro.map((l) => (
                      <LineBadgeChip
                        key={l.shortName}
                        {...l}
                        size="md"
                        onClick={() => p.onSelectLine(l.shortName)}
                        className="!h-[44px] !w-[44px] !text-[16px]"
                      />
                    ))}
                  </div>
                </div>
              )}

              {rer.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-xs font-medium tracking-[0.04em] text-encre-2">RER</h3>
                  <div className="flex flex-wrap gap-2">
                    {rer.map((l) => (
                      <LineBadgeChip
                        key={l.shortName}
                        {...l}
                        size="md"
                        onClick={() => p.onSelectLine(l.shortName)}
                        className="!h-[44px] !w-[44px] !text-[16px]"
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
  lampe = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  actif?: boolean;
  lampe?: boolean;
  onClick: () => void;
}) {
  return (
    <Poussoir
      tuile
      variante="faience"
      lampe={lampe}
      actif={Boolean(actif)}
      icone={icon}
      onClick={onClick}
    >
      <span className="max-w-full truncate">{label}</span>
    </Poussoir>
  );
}
