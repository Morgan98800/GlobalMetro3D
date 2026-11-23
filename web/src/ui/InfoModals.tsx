import { RiArrowRightUpLine } from '@remixicon/react';
import type { ReactNode } from 'react';
import { formatNombre } from './format';
import { LineBadgeChip } from './LineBadgeChip';
import type { LineRef } from './lines';
import { Marque } from './Marque';
import { Modale } from './Modale';
import { Plaque } from './Plaque';
import { Segmented } from './Segmented';

/**
 * Modales d’information (v2.1). Quatre deviennent deux :
 *  - « À propos et méthode » fusionne about + method : un seul lien vers /methode.
 *    Le ticket SVG aux logos RATP / SNCF / optile / IDFM est remplacé par notre plaque
 *    sur carrelage ; les organismes sont crédités en texte, sans logo (§ 13).
 *  - « Records de fréquentation ».
 * « Réglages » disparaît : voir MenuPrincipal. Aucun bouton « Fermer » en pied.
 */
export interface Source {
  usage: string;
  credit: string;
}

export const SOURCES_PAR_DEFAUT: Source[] = [
  { usage: 'Horaires & temps réel', credit: 'Île-de-France Mobilités (GTFS & PRIM)' },
  { usage: 'Fond de carte & 3D', credit: '© OpenStreetMap · OpenFreeMap · Overture Maps · Parchment Landmarks (CC0)' },
  { usage: 'Audio réel métro', credit: 'Wikimedia Commons : Litlok (CC BY-SA 4.0), Thesupermat (CC BY-SA 3.0)' },
  { usage: 'Typographie & icônes', credit: 'Asap (SIL OFL 1.1) · Remix Icon (Apache 2.0)' },
];

export function AProposModale({
  ouverte,
  onClose,
  methodeHref = '/methode',
  sources = SOURCES_PAR_DEFAUT,
}: {
  ouverte: boolean;
  onClose: () => void;
  methodeHref?: string;
  sources?: Source[];
}) {
  return (
    <Modale
      ouverte={ouverte}
      onClose={onClose}
      titre="À propos et méthode"
      bandeau={
        <div className="carrelage flex h-[136px] shrink-0 items-end gap-3 bg-encart px-5 pb-5 md:px-6">
          <Marque size={40} />
          <Plaque as="p" size="lg">Métro & RER Parisiens 3D</Plaque>
        </div>
      }
    >
      <p className="text-corps text-encre">
        Le métro et le RER de Paris en trois dimensions : prochains passages en direct, itinéraires, quais et cabines de conduite.
      </p>
      <Rubrique titre="Méthode">
        <p className="text-corps-sm text-encre-2">
          La position de chaque rame est déduite des prochains passages publiés en temps réel et des horaires théoriques, puis interpolée
          entre deux stations. En mode Passionné, chaque position indique son degré de confiance : mesurée, encadrée, extrapolée ou théorique.
        </p>
        <a
          href={methodeHref}
          className="-ml-2 mt-2 inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2 text-[13px] font-semibold text-selection-encre outline-none hover:bg-selection focus-visible:outline-2 focus-visible:outline-focus [&_svg]:size-4"
        >
          <RiArrowRightUpLine aria-hidden />
          Lire la méthode complète
        </a>
      </Rubrique>
      <Rubrique titre="Données et licences">
        <dl className="divide-y divide-joint border-y border-joint text-corps-sm">
          {sources.map((s) => (
            <div key={s.usage} className="grid gap-x-4 gap-y-0.5 py-2 md:grid-cols-[170px_minmax(0,1fr)]">
              <dt className="text-encre-2">{s.usage}</dt>
              <dd className="text-encre">{s.credit}</dd>
            </div>
          ))}
        </dl>
      </Rubrique>
      <p className="mt-4 text-legende text-encre-3">
        Projet indépendant, non affilié à la RATP, à la SNCF, à optile ni à Île-de-France Mobilités. Ces noms ne sont cités que pour créditer
        les données que ces organismes publient.
      </p>
    </Modale>
  );
}

export type JourType = 'semaine' | 'samedi' | 'dimanche';

export interface StationRecord {
  nom: string;
  lignes: LineRef[];
  /** Entrées moyennes par jour */
  valeur: number;
}


export function RecordsModale({
  ouverte,
  onClose,
  jour,
  onJour,
  plus,
  moins,
  source = 'Entrées moyennes par jour, d’après les données de fréquentation publiées en open data.',
}: {
  ouverte: boolean;
  onClose: () => void;
  jour: JourType;
  onJour: (j: JourType) => void;
  plus: StationRecord[];
  moins: StationRecord[];
  source?: string;
}) {
  return (
    <Modale ouverte={ouverte} onClose={onClose} titre="Records de fréquentation" largeur="lg">
      <Segmented
        label="Type de jour"
        value={jour}
        onChange={onJour}
        options={[{ value: 'semaine', label: 'En semaine' }, { value: 'samedi', label: 'Le samedi' }, { value: 'dimanche', label: 'Le dimanche' }]}
        className="max-w-[420px]"
      />
      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <Classement titre="Les plus fréquentées" stations={plus} />
        <Classement titre="Les moins fréquentées" stations={moins} />
      </div>
      <p className="mt-4 text-legende text-encre-3">{source}</p>
    </Modale>
  );
}

function Rubrique({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-1.5 text-titre-sm text-encre">{titre}</h3>
      {children}
    </section>
  );
}

function Classement({ titre, stations }: { titre: string; stations: StationRecord[] }) {
  return (
    <section>
      <h3 className="pb-2 text-[13px] font-semibold text-encre-2">{titre}</h3>
      <ol className="divide-y divide-joint border-y border-joint">
        {stations.map((s, i) => (
          <li key={s.nom} className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2.5 py-2">
            <span className="chiffres text-[13px] font-semibold text-encre-3">{i + 1}</span>
            <span className="min-w-0">
              <span className="signaletique block truncate text-[15px] font-semibold leading-[19px] text-encre">{s.nom}</span>
              <span className="mt-1 flex gap-1">{s.lignes.map((l) => <LineBadgeChip key={l.shortName} {...l} size="xs" />)}</span>
            </span>
            <span className="chiffres text-[15px] font-semibold text-encre">{formatNombre(s.valeur)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
