import { RiCheckLine, RiFileCopyLine, RiLink, RiShareForwardLine } from '@remixicon/react';
import { Fragment, useState } from 'react';
import { Button } from './Button';
import { FriseCeramique } from './HeritageDecor';
import { LineBadgeChip } from './LineBadgeChip';
import { Modale } from './Modale';
import { Plaque } from './Plaque';
import type { Itineraire } from './RoutePlannerDrawer';

export interface ShareItineraryModalProps {
  open: boolean;
  onClose: () => void;
  depart: string;
  arrivee: string;
  itineraire: Itineraire | null;
  shareUrl: string;
  reseau?: string;
}

function buildShareSummary(
  depart: string,
  arrivee: string,
  itineraire: Itineraire | null,
  shareUrl: string,
  reseau: string
): string {
  const lines = itineraire
    ? itineraire.segments.filter((s) => s.type === 'ligne').map((s) => s.ligne.shortName)
    : [];
  const via = lines.length > 0 ? ` via ${lines.join(' → ')}` : '';
  const timing = itineraire ? ` (${itineraire.minutes} min, arrivée ${itineraire.arrivee})` : '';
  return `Itinéraire ${reseau} : ${depart} → ${arrivee}${via}${timing}\n${shareUrl}`;
}

export function ShareItineraryModal({
  open,
  onClose,
  depart,
  arrivee,
  itineraire,
  shareUrl,
  reseau = 'Paris',
}: ShareItineraryModalProps) {
  const [copied, setCopied] = useState<'link' | 'text' | null>(null);
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const summaryText = buildShareSummary(depart, arrivee, itineraire, shareUrl, reseau);

  const handleNativeShare = async () => {
    if (!canNativeShare) return;
    try {
      await navigator.share({
        title: `${depart} → ${arrivee} · Métro ${reseau} 3D`,
        text: summaryText.replace(`\n${shareUrl}`, ''),
        url: shareUrl,
      });
    } catch {
      // Annulation utilisateur dans la feuille iOS/macOS
    }
  };

  const handleCopy = async (kind: 'link' | 'text') => {
    try {
      await navigator.clipboard?.writeText(kind === 'link' ? shareUrl : summaryText);
      setCopied(kind);
      window.setTimeout(() => setCopied((cur) => (cur === kind ? null : cur)), 2000);
    } catch {
      // Fallback silencieux si clipboard bloqué
    }
  };

  const ligneSegments = itineraire?.segments.filter((s) => s.type === 'ligne') ?? [];

  return (
    <Modale
      ouverte={open}
      onClose={onClose}
      titre="Partager l’itinéraire"
      className="max-w-[420px]"
    >
      <div className="space-y-3.5">
        {/* Carte ticket Faïence v2 de prévisualisation */}
        <div className="faience-grain overflow-hidden rounded-[8px] border border-bord bg-encart/70">
          <FriseCeramique className="opacity-85" />
          <div className="space-y-3 p-3.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Plaque size="sm">{depart}</Plaque>
              <span aria-hidden className="text-[13px] font-bold text-encre-3">
                →
              </span>
              <Plaque size="sm">{arrivee}</Plaque>
            </div>

            {itineraire && (
              <div className="flex items-center justify-between gap-2 border-t border-joint pt-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {ligneSegments.map((seg, idx) => (
                    <Fragment key={`${seg.ligne.shortName}-${seg.de}-${idx}`}>
                      {idx > 0 && (
                        <span aria-hidden className="text-[11px] text-encre-3">
                          ›
                        </span>
                      )}
                      <LineBadgeChip {...seg.ligne} size="xs" />
                    </Fragment>
                  ))}
                </div>
                <div className="chiffres text-end">
                  <span className="text-[18px] font-bold text-encre">{itineraire.minutes} min</span>
                  <span className="ml-1.5 text-[12px] text-encre-3">arr. {itineraire.arrivee}</span>
                </div>
              </div>
            )}

            <div className="rounded-[6px] border border-joint bg-surface px-2.5 py-1.5 text-[11px] text-encre-3">
              <span className="block truncate font-mono">{shareUrl}</span>
            </div>
          </div>
        </div>

        {/* Actions de partage (Feuille native iOS/macOS en priorité) */}
        <div className="flex flex-col gap-2">
          {canNativeShare && (
            <Button
              variant="primaire"
              size="lg"
              fullWidth
              icon={<RiShareForwardLine aria-hidden />}
              onClick={handleNativeShare}
            >
              Partager (Messages, AirDrop…)
            </Button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={canNativeShare ? 'secondaire' : 'primaire'}
              size="md"
              fullWidth
              icon={copied === 'link' ? <RiCheckLine aria-hidden /> : <RiLink aria-hidden />}
              onClick={() => handleCopy('link')}
            >
              {copied === 'link' ? 'Lien copié' : 'Copier le lien'}
            </Button>
            <Button
              variant="secondaire"
              size="md"
              fullWidth
              icon={
                copied === 'text' ? <RiCheckLine aria-hidden /> : <RiFileCopyLine aria-hidden />
              }
              onClick={() => handleCopy('text')}
            >
              {copied === 'text' ? 'Copié' : 'Copier le résumé'}
            </Button>
          </div>
        </div>
      </div>
    </Modale>
  );
}
