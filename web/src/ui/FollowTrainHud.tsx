import { useEffect, useRef, useState } from 'react';
import { RiBox3Line, RiCloseLine } from '@remixicon/react';
import { Button } from '@/components/base/buttons/button';
import { Chip } from '@/components/base/badges/chip';
import { LineBadgeChip } from './LineBadgeChip';
import { useUiStore } from './ui_store';

const CONFIDENCE_LABELS: Record<string, string> = {
  measured: 'Arrêt mesuré',
  bracketed: 'Encadré temps réel',
  extrapolated: 'Extrapolé',
  scheduled: 'Théorique GTFS',
};

export function FollowTrainHud() {
  const { cityConfig, trackedTrain, isFollowing, expertMode, handlers } = useUiStore();
  const [legStartMs, setLegStartMs] = useState<number>(() => performance.now());
  const prevLegKeyRef = useRef<string>('');

  const legKey = trackedTrain ? `${trackedTrain.id}|${trackedTrain.next}` : '';
  useEffect(() => {
    if (legKey && legKey !== prevLegKeyRef.current) {
      prevLegKeyRef.current = legKey;
      setLegStartMs(performance.now());
    }
  }, [legKey]);

  if (!isFollowing || !trackedTrain) return null;

  const progressPct = trackedTrain.atStop
    ? 100
    : Math.min(92, Math.max(14, Math.round(((performance.now() - legStartMs) / 40000) * 100)));

  const isParis = cityConfig?.id === 'paris';
  const speedKmh = Math.round(trackedTrain.spd || (trackedTrain.speedMps ?? 0) * 3.6);
  const confLabel = CONFIDENCE_LABELS[trackedTrain.conf] || 'Théorique GTFS';

  return (
    <aside
      aria-label="Suivi de rame en cours"
      className="pointer-events-auto fixed inset-x-3 bottom-7 z-20 mx-auto flex max-w-md flex-col gap-2.5 overflow-hidden rounded-2xl border border-border-button-default bg-background-primary-default/92 p-3.5 shadow-xl backdrop-blur-md"
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <LineBadgeChip
            shortName={trackedTrain.lineName}
            color={trackedTrain.colorHex}
            textColor={trackedTrain.textColorHex}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-body-medium text-text-primary">
              Vers {trackedTrain.dest}
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-caption-1-medium text-text-secondary">
              <span className="min-w-0 truncate">
                {trackedTrain.atStop
                  ? `À quai · ${trackedTrain.next}`
                  : `Prochain arrêt : ${trackedTrain.next}`}
              </span>
              {trackedTrain.atStop ? (
                <Chip color="lime" variant="caption" className="shrink-0">
                  À quai
                </Chip>
              ) : null}
            </div>
          </div>
        </div>

        <Button
          variant="ghost"
          size="xs"
          iconOnly
          leadingIcon={RiCloseLine}
          aria-label="Quitter le suivi de rame"
          onClick={() => handlers.onStopFollow?.()}
        />
      </div>

      {/* Barre de progression entre stations */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-background-tertiary-default">
        <div
          className="h-full rounded-full bg-accent-500 transition-[width] duration-300 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-caption-1-medium text-text-tertiary">
          {expertMode ? (
            <>
              <span className="shrink-0 tabular-nums text-text-primary">{speedKmh} km/h</span>
              <span className="shrink-0">•</span>
              <span className="truncate">{confLabel}</span>
            </>
          ) : (
            <span className="truncate">Suivi caméra 3D actif</span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {isParis && trackedTrain.lineName?.trim() ? (
            <Button
              variant="primary"
              size="small"
              leadingIcon={RiBox3Line}
              onClick={() =>
                handlers.onOpenParisRide?.({
                  initialLine: trackedTrain.lineName,
                  initialDest: trackedTrain.dest,
                  initialStation: trackedTrain.next,
                  initialTrainId: trackedTrain.id,
                  initialView: 'ride',
                })
              }
            >
              Cabine 3D
            </Button>
          ) : null}
          <Button variant="secondary" size="small" onClick={() => handlers.onStopFollow?.()}>
            Quitter
          </Button>
        </div>
      </div>
    </aside>
  );
}
