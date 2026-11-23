import { RiBox3Line, RiBuilding2Line, RiNavigationLine, RiRouteLine, RiShareForwardLine, RiStarLine } from '@remixicon/react';
import { useEffect, useState, type ReactNode } from 'react';
import { palette } from '../../web/src/design/tokens';
import {
  Afficheur, Button, contrast, cx, Horloge, IconButton, Kbd, LineBadgeChip, Marque, Panneau, Passages, PlanDeLigne,
  PlanDeLigneHorizontal, Plaque, SearchTrigger, Segmented, VoitureConseillee, type ButtonVariant,
} from '../../web/src/ui';
import { HEURE, ITINERAIRES, LIGNES, PASSAGES_STRASBOURG } from './fixtures';
import { SCREENS } from './screens';

const ORDRE = LIGNES.map((l) => l.shortName);

function Section({ id, titre, intro, children }: { id: string; titre: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="border-t border-joint">
      <div className="mx-auto max-w-[1180px] px-6 py-16 md:px-10">
        <h2 className="text-titre-lg text-encre">{titre}</h2>
        {intro && <p className="mt-2 max-w-[66ch] text-corps text-encre-2">{intro}</p>}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="mt-3 max-w-[60ch] text-corps-sm text-encre-2">{children}</p>;
}

export function StyleGuide() {
  const [nuit, setNuit] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => void document.documentElement.classList.toggle('dark', nuit), [nuit]);
  return (
    <div className="min-h-dvh bg-fond text-encre">
      <Hero nuit={nuit} setNuit={setNuit} />
      <Matieres />
      <Couleurs />
      <Lignes />
      <Typographie />
      <Controles />
      <Information />
      <RefonteMobile />
      <Ecrans />
      <Mouvement />
      <Redaction />
      <GardeFous />
      <footer className="border-t border-joint">
        <p className="mx-auto max-w-[1180px] px-6 py-10 text-legende text-encre-3 md:px-10">
          Asap par Omnibus-Type (SIL OFL 1.1). Remix Icon (Apache 2.0). Fonds de maquette : tracés et stations d’après Wikipédia (CC BY-SA) via le projet
          metro-de-paris, eau © Apur, parcs © Ville de Paris et contributeurs OpenStreetMap (ODbL). Couleurs de lignes : open data Île-de-France Mobilités.
          Projet non affilié à la RATP, à la SNCF ni à Île-de-France Mobilités.
        </p>
      </footer>
    </div>
  );
}

function Hero({ nuit, setNuit }: { nuit: boolean; setNuit: (v: boolean) => void }) {
  return (
    <header className="carrelage overflow-hidden bg-surface">
      <div className="mx-auto max-w-[1180px] px-6 pb-16 pt-8 md:px-10">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-2.5">
            <Marque size={28} />
            <span className="signaletique text-[16px] font-[650]">Métro & RER Parisiens 3D</span>
          </span>
          <Segmented
            size="sm"
            label="Thème de la planche"
            value={nuit ? 'nuit' : 'jour'}
            onChange={(v) => setNuit(v === 'nuit')}
            options={[{ value: 'jour', label: 'Jour' }, { value: 'nuit', label: 'Nuit' }]}
            className="w-[160px]"
          />
        </div>
        <div className="mt-20 md:mt-28">
          <Plaque as="h1" size="xxl">Faïence</Plaque>
          <p className="mt-7 max-w-[30ch] text-[26px] leading-[34px] text-encre">
            La charte graphique de Métro & RER Parisiens 3D, version 2. Une interface qui se lit comme une station.
          </p>
        </div>
        <div className="mt-14 grid gap-8 md:grid-cols-[auto_auto_1fr] md:items-end md:gap-12">
          <figure>
            <figcaption className="mb-2 text-legende text-encre-3">L’émail nomme</figcaption>
            <Plaque size="md">Strasbourg – Saint-Denis</Plaque>
          </figure>
          <figure>
            <figcaption className="mb-2 text-legende text-encre-3">L’afficheur dit le temps</figcaption>
            <Afficheur size="lg" passages={[{ minutes: 2 }, { minutes: 9 }]} />
          </figure>
          <figure>
            <figcaption className="mb-2 text-legende text-encre-3">La faïence porte le reste</figcaption>
            <div className="faience inline-flex gap-2 rounded-panneau p-2">
              <Button variant="primaire" icon={<RiRouteLine aria-hidden />}>Y aller</Button>
              <Button>Partir d’ici</Button>
            </div>
          </figure>
        </div>
      </div>
    </header>
  );
}

function Matieres() {
  return (
    <Section
      id="matieres"
      titre="Trois matières"
      intro="Chaque élément de l’interface est fait d’une des trois matières d’une station. Le choix de la matière dit le rôle de l’élément avant même de le lire."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Panneau matiere="feuille" className="rounded-panneau p-5">
          <h3 className="text-titre-sm">Émail</h3>
          <p className="mt-1 text-corps-sm text-encre-2">Nomme les lieux et porte l’action principale. Une seule plaque par écran, celle du lieu dont parle l’écran.</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Plaque>Bastille</Plaque>
            <Button variant="primaire">Y aller</Button>
          </div>
        </Panneau>
        <Panneau matiere="feuille" className="rounded-panneau p-5">
          <h3 className="text-titre-sm">Afficheur</h3>
          <p className="mt-1 text-corps-sm text-encre-2">Dit le temps qui reste. L’ambre signifie « en direct » et n’apparaît nulle part ailleurs ; un horaire théorique s’affiche en blanc.</p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Afficheur passages={[{ minutes: 0 }, { minutes: 5 }]} />
            <Afficheur passages={[{ statut: 'quai' }, { minutes: 12, source: 'theorique' }]} />
            <Horloge date={HEURE} />
          </div>
        </Panneau>
        <Panneau matiere="feuille" className="rounded-panneau p-5">
          <h3 className="text-titre-sm">Faïence</h3>
          <p className="mt-1 text-corps-sm text-encre-2">Toutes les surfaces : blanc émaillé, un liseré de lumière en haut, et des joints fins à la place des cartes empilées.</p>
          <ul className="mt-4 divide-y divide-joint border-y border-joint text-corps-sm">
            <li className="py-2">Prochains passages</li>
            <li className="py-2">Correspondances</li>
            <li className="py-2">Accès et sorties</li>
          </ul>
        </Panneau>
      </div>
    </Section>
  );
}

function Ramp({ nom, steps }: { nom: string; steps: Record<string, string> }) {
  return (
    <div className="mb-6">
      <h3 className="mb-2 text-etiquette text-encre-2">{nom}</h3>
      <div className="flex overflow-x-auto rounded-[10px] [box-shadow:0_0_0_1px_var(--color-joint)]">
        {Object.entries(steps).map(([k, v]) => (
          <div key={k} className="min-w-[78px] flex-1">
            <div className="h-14" style={{ background: v }} />
            <div className="bg-surface px-2 py-1.5">
              <p className="text-legende text-encre">{k}</p>
              <p className="chiffres text-micro font-medium text-encre-3">{v}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const PAIRES: [string, string, string, number][] = [
  ['Encre sur faïence', palette.ardoise[900], '#ffffff', 4.5],
  ['Encre 2 sur faïence', palette.ardoise[600], '#ffffff', 4.5],
  ['Encre 3 sur encart, pire cas', palette.ardoise[500], palette.ardoise[100], 4.5],
  ['Anneau de focus, jour', palette.email[600], '#ffffff', 3],
  ['Blanc sur émail', '#ffffff', palette.email[800], 4.5],
  ['Ambre sur afficheur', palette.ambre[500], '#000000', 4.5],
  ['Encre de nuit', '#eef1f7', palette.nuit[850], 4.5],
  ['Encre 3 de nuit', '#8c939f', palette.nuit[850], 4.5],
  ['Anneau de focus, nuit', palette.email[300], palette.nuit[850], 3],
  ['Ancien anneau laiton (v1)', '#c9a227', '#ffffff', 3],
];

function Couleurs() {
  return (
    <Section
      id="couleurs"
      titre="Couleurs"
      intro="Des neutres froids d’ardoise et de zinc, un bleu d’émail, l’ambre des afficheurs. La couleur vive est réservée aux lignes et aux états du trafic : c’est ce qui les rend lisibles d’un coup d’œil."
    >
      <Ramp nom="Émail" steps={palette.email} />
      <Ramp nom="Ardoise" steps={palette.ardoise} />
      <Ramp nom="Nuit" steps={palette.nuit} />
      <Ramp nom="Ambre (sur noir uniquement)" steps={palette.ambre} />
      <Ramp
        nom="États du trafic"
        steps={{ normal: palette.normal[500], vigilance: palette.vigilance[500], signal: palette.signal[500], 'normal texte': palette.normal[700], 'vigilance texte': palette.vigilance[700], 'signal texte': palette.signal[700] }}
      />
      <h3 className="mb-2 mt-10 text-etiquette text-encre-2">Contrastes, calculés dans cette page</h3>
      <div className="overflow-x-auto rounded-[12px] bg-surface [box-shadow:0_0_0_1px_var(--color-joint)]">
        <table className="w-full min-w-[560px] text-start text-corps-sm">
          <tbody className="divide-y divide-joint">
            {PAIRES.map(([label, fg, bg, min]) => {
              const r = contrast(fg, bg);
              const ok = r >= min;
              return (
                <tr key={label}>
                  <td className="px-4 py-2.5">{label}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex h-7 items-center rounded-[6px] px-2 text-[13px] font-semibold" style={{ color: fg, background: bg, boxShadow: '0 0 0 1px rgb(0 0 0 / 0.08)' }}>
                      Aa 21:20
                    </span>
                  </td>
                  <td className="chiffres px-4 py-2.5 font-semibold">{r.toFixed(2)} : 1</td>
                  <td className={cx('px-4 py-2.5 font-semibold', ok ? 'text-normal-encre' : 'text-signal-encre')}>
                    {ok ? `Conforme (${min} : 1)` : `Insuffisant (${min} : 1 requis)`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function Lignes() {
  return (
    <Section
      id="lignes"
      titre="Pastilles de ligne"
      intro="Disque pour le métro, carré arrondi pour le RER : la convention que les voyageurs lisent sur les quais, dessinée dans notre propre géométrie et notre propre caractère. Les couleurs viennent du flux GTFS d’Île-de-France Mobilités."
    >
      <div className="space-y-4">
        {(['xs', 'sm', 'md', 'lg'] as const).map((size) => (
          <div key={size} className="flex flex-wrap items-center gap-2">
            <span className="w-8 text-legende text-encre-3">{size}</span>
            {ORDRE.map((s) => <LineBadgeChip key={s} shortName={s} size={size} />)}
          </div>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap items-end gap-8">
        {[
          ['Normale', <LineBadgeChip shortName="4" size="lg" />],
          ['Sélectionnée', <LineBadgeChip shortName="4" size="lg" selected />],
          ['Atténuée', <LineBadgeChip shortName="4" size="lg" dimmed />],
          ['Trafic perturbé', <LineBadgeChip shortName="13" size="lg" alert="vigilance" />],
          ['Trafic interrompu', <LineBadgeChip shortName="B" size="lg" alert="signal" />],
          ['Bis', <LineBadgeChip shortName="7b" size="lg" />],
        ].map(([label, el]) => (
          <figure key={label as string} className="flex flex-col items-center gap-2">
            {el}
            <figcaption className="text-legende text-encre-2">{label}</figcaption>
          </figure>
        ))}
      </div>
      <Note>
        Une pastille est un pictogramme : son contraste minimal est de 3 : 1, et son nom complet (« Ligne 4, trafic perturbé ») est toujours exposé aux lecteurs
        d’écran. L’encre officielle est conservée dès qu’elle atteint ce seuil. Un liseré apparaît seulement quand la couleur se confond avec la surface.
      </Note>
    </Section>
  );
}

const ECHELLE: [string, string, string, string?][] = [
  ['affiche', '36 / 40', 'Châtelet – Les Halles', 'text-affiche signaletique'],
  ['titre-lg', '24 / 28', 'Itinéraire conseillé', 'text-titre-lg'],
  ['titre', '21 / 26', 'Prochains passages', 'text-titre'],
  ['titre-sm', '18 / 24', 'Lignes du réseau', 'text-titre-sm'],
  ['corps', '16 / 24', 'Montez au milieu du train pour la sortie rue de Lyon.', 'text-corps'],
  ['corps-sm', '14 / 20', 'Trafic ralenti entre Saint-Lazare et Châtillon – Montrouge.', 'text-corps-sm'],
  ['etiquette', '13 / 18', 'Partir d’ici', 'text-etiquette'],
  ['legende', '12 / 16', 'Horaires théoriques', 'text-legende'],
  ['micro', '11 / 14', 'Fond de maquette, données ouvertes', 'text-micro'],
];

function Typographie() {
  return (
    <Section
      id="typographie"
      titre="Typographie"
      intro="Asap, une seule famille en deux largeurs. Texte, à 100 %, pour lire. Signalétique, à 80 %, pour les noms de lieux et les chiffres : plus de caractères par ligne, la densité des plaques de quai."
    >
      <div className="grid gap-6 md:grid-cols-2">
        <Panneau matiere="feuille" className="rounded-panneau p-6">
          <p className="text-legende text-encre-3">Texte, 100 %</p>
          <p className="mt-2 text-[34px] font-[650] leading-[40px]">Bagneux – Lucie Aubrac</p>
        </Panneau>
        <Panneau matiere="feuille" className="rounded-panneau p-6">
          <p className="text-legende text-encre-3">Signalétique, 80 %</p>
          <p className="signaletique mt-2 text-[34px] font-[650] leading-[40px]">Bagneux – Lucie Aubrac</p>
        </Panneau>
      </div>
      <dl className="mt-8 divide-y divide-joint border-y border-joint">
        {ECHELLE.map(([nom, mesure, exemple, cls]) => (
          <div key={nom} className="grid grid-cols-[110px_80px_minmax(0,1fr)] items-baseline gap-4 py-3">
            <dt className="text-etiquette text-encre-2">{nom}</dt>
            <dd className="chiffres text-legende text-encre-3">{mesure}</dd>
            <dd className={cx('min-w-0 truncate text-encre', cls)}>{exemple}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Afficheur size="xl" passages={[{ minutes: 3 }, { minutes: 12 }]} />
        <p className="max-w-[40ch] text-corps-sm text-encre-2">
          Chiffres tabulaires et étroits partout où l’on compte : minutes, heures, durées, pastilles. Les colonnes restent alignées quand le temps défile.
        </p>
      </div>
    </Section>
  );
}

const VARIANTES: [ButtonVariant, string, string][] = [
  ['primaire', 'Y aller', 'L’action principale de la vue, une seule.'],
  ['secondaire', 'Partir d’ici', 'Toutes les autres actions.'],
  ['discret', 'Partir de ma position', 'Dans les listes et les barres denses.'],
  ['afficheur', 'Voir le quai en 3D', 'Fait entrer dans le monde ferroviaire : quai, cabine.'],
  ['alerte', 'Effacer', 'Efface ou supprime.'],
];

function Controles() {
  const [mode, setMode] = useState<'simple' | 'passionne'>('simple');
  const [vue, setVue] = useState(true);
  return (
    <Section id="controles" titre="Boutons et contrôles" intro="Cinq variantes, chacune avec un seul rôle. La taille suit le support : 40 px au pointeur, 48 px au doigt.">
      <div className="divide-y divide-joint border-y border-joint">
        {VARIANTES.map(([v, label, role]) => (
          <div key={v} className="grid items-center gap-4 py-4 md:grid-cols-[200px_minmax(0,1fr)]">
            <div>
              <p className="text-etiquette text-encre">{v}</p>
              <p className="text-legende text-encre-3">{role}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant={v} size="sm">{label}</Button>
              <Button variant={v} icon={v === 'afficheur' ? <RiBox3Line aria-hidden /> : v === 'primaire' ? <RiRouteLine aria-hidden /> : <RiShareForwardLine aria-hidden />}>{label}</Button>
              <Button variant={v} size="lg">{label}</Button>
              <Button variant={v} disabled>{label}</Button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-6">
        <Segmented label="Niveau de détail" value={mode} onChange={setMode} options={[{ value: 'simple', label: 'Simple' }, { value: 'passionne', label: 'Passionné' }]} className="w-[220px]" />
        <Panneau matiere="feuille" className="flex gap-0.5 rounded-panneau p-1">
          <IconButton label="Vue en 3D" pressed={vue} onClick={() => setVue(!vue)} icon={<RiBox3Line aria-hidden />} />
          <IconButton label="Bâtiments en relief" icon={<RiBuilding2Line aria-hidden />} />
          <IconButton label="Me localiser" icon={<RiNavigationLine aria-hidden />} />
          <IconButton label="Favori" icon={<RiStarLine aria-hidden />} />
        </Panneau>
        <div className="flex w-[340px] max-w-full"><SearchTrigger onOpen={() => {}} /></div>
        <span className="flex items-center gap-1.5 text-corps-sm text-encre-2">Rechercher <Kbd>⌘K</Kbd></span>
      </div>
    </Section>
  );
}

function Information() {
  const it = ITINERAIRES[0];
  const seg = it.segments[0];
  return (
    <Section id="information" titre="Information voyageur" intro="On voyage à Paris par ligne et par terminus. Chaque composant d’information part de là.">
      <div className="grid gap-6 lg:grid-cols-2">
        <Panneau matiere="feuille" className="rounded-panneau p-5">
          <Passages groupes={PASSAGES_STRASBOURG} />
        </Panneau>
        <div className="space-y-6">
          <Panneau matiere="feuille" className="rounded-panneau p-5">
            {seg.type === 'ligne' && (
              <PlanDeLigne
                couleur="#ffbe00"
                replier={false}
                arrets={[
                  { nom: seg.de, role: 'depart', correspondances: [{ shortName: '4' }, { shortName: '7' }, { shortName: '11' }, { shortName: '14' }], detail: <VoitureConseillee position="milieu" raison="pour la sortie rue de Lyon" /> },
                  ...seg.arrets.map((nom) => ({ nom })),
                  { nom: seg.a, role: 'arrivee', correspondances: [{ shortName: '5' }, { shortName: '8' }] },
                ]}
              />
            )}
          </Panneau>
          <div className="dark rounded-panneau bg-[radial-gradient(120%_140%_at_20%_0%,#1a2134,#060a18)] p-5">
            <div className="verre rounded-[14px] p-4 text-encre">
              <p className="text-legende text-encre-3">Prochaine station</p>
              <p className="signaletique text-[22px] font-[650] text-white">Villejuif – Gustave Roussy</p>
              <PlanDeLigneHorizontal couleur="#640082" arrets={['Maison-Blanche', 'Hôpital Bicêtre', 'Villejuif', 'L’Haÿ-les-Roses', 'Chevilly-Larue']} index={1} progression={0.55} className="mt-3" />
            </div>
          </div>
        </div>
      </div>
      <h3 className="mb-3 mt-10 text-etiquette text-encre-2">États de l’afficheur</h3>
      <div className="flex flex-wrap items-center gap-3">
        <Afficheur size="md" passages={[{ minutes: 4 }]} max={1} />
        <Afficheur size="md" passages={[{ minutes: 0 }]} max={1} />
        <Afficheur size="md" passages={[{ statut: 'quai' }]} max={1} />
        <Afficheur size="md" passages={[{ minutes: 6, statut: 'retard' }]} max={1} />
        <Afficheur size="md" passages={[{ minutes: 14, source: 'theorique' }]} max={1} />
        <Afficheur size="md" passages={[{ statut: 'supprime' }]} max={1} />
        <Afficheur size="md" passages={[{ statut: 'termine' }]} max={1} />
      </div>
      <Note>Dans l’ordre : en direct, à l’approche, à quai, retardé, horaire théorique, supprimé, service terminé. Chaque état a aussi sa phrase pour les lecteurs d’écran.</Note>
    </Section>
  );
}

function RefonteMobile() {
  const ecrans = SCREENS.filter((s) => s.groupe === 'refonte-mobile');
  return (
    <Section
      id="refonte-mobile"
      titre="Refonte iPhone « Passionné » (proposition)"
      intro="5 écrans 390 × 844 en grammaire Faïence : on retire l’empilement TopNavBar + BarreMobile au profit d’une feuille à 3 crans et d’un HUD cabine en 2 zones, tout en gardant l’ADN ferroviaire (rames live, confiance PRIM, vitesse, matériel, Plaques & Afficheurs). Cliquable et glissable directement dans chaque aperçu."
    >
      <div className="flex flex-wrap gap-8">
        {ecrans.map((s) => (
          <figure key={s.id} className="w-[273px]">
            <div className="overflow-hidden rounded-[22px] [box-shadow:0_0_0_1px_var(--color-joint),var(--shadow-flotte)]" style={{ width: 390 * 0.7, height: 844 * 0.7 }}>
              <iframe
                title={s.titre}
                src={`?screen=${s.id}`}
                loading="eager"
                className="origin-top-left border-0"
                style={{ width: 390, height: 844, transform: 'scale(0.7)' }}
              />
            </div>
            <figcaption className="mt-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-corps-sm font-semibold text-encre">{s.titre}</span>
                <a href={`?screen=${s.id}`} target="_blank" rel="noreferrer" className="shrink-0 text-legende font-semibold text-selection-encre hover:underline">
                  1:1 ↗
                </a>
              </div>
              {s.note && <p className="mt-1 text-legende text-encre-2">{s.note}</p>}
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}

function Ecrans() {
  const ecrans = SCREENS.filter((s) => s.groupe !== 'refonte-mobile');
  return (
    <Section id="ecrans" titre="Écrans v2.1 (actuels)" intro="Les écrans de référence actuels, assemblés. Chaque écran s’ouvre seul avec ?screen=… pour les captures.">
      <div className="grid gap-x-6 gap-y-10 md:grid-cols-2">
        {ecrans.filter((s) => s.width > 500).map((s) => <Vignette key={s.id} s={s} scale={0.37} />)}
      </div>
      <div className="mt-10 flex flex-wrap gap-6">
        {ecrans.filter((s) => s.width <= 500).map((s) => <Vignette key={s.id} s={s} scale={0.62} />)}
      </div>
    </Section>
  );
}

function Vignette({ s, scale }: { s: (typeof SCREENS)[number]; scale: number }) {
  return (
    <figure>
      <div className="overflow-hidden rounded-[12px] [box-shadow:0_0_0_1px_var(--color-joint),var(--shadow-flotte)]" style={{ width: s.width * scale, height: s.height * scale }}>
        <iframe
          title={s.titre}
          src={`?screen=${s.id}`}
          loading="eager"
          className="origin-top-left border-0"
          style={{ width: s.width, height: s.height, transform: `scale(${scale})` }}
        />
      </div>
      <figcaption className="mt-2 text-corps-sm text-encre-2">{s.titre}</figcaption>
    </figure>
  );
}

const COURBES: [string, number[], string, string][] = [
  ['portes', [0.32, 0.72, 0, 1], '320 ms', 'Feuilles, tiroirs, curseur du sélecteur : s’ouvre vite, se pose en douceur.'],
  ['rame', [0.65, 0, 0.35, 1], '640 ms', 'Caméra et déplacements sur la carte : accélère puis freine, comme un train.'],
  ['signal', [0.2, 0, 0, 1], '90 à 160 ms', 'Survol, pression, changement d’état : la réponse immédiate.'],
];

function Mouvement() {
  return (
    <Section
      id="mouvement"
      titre="Mouvement"
      intro="Le mouvement répond à un geste ou signale un changement. Un seul mouvement spontané : les trois points de l’approche. Tout s’arrête quand le système demande moins d’animations."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {COURBES.map(([nom, [x1, y1, x2, y2], duree, usage]) => (
          <Panneau key={nom} matiere="feuille" className="rounded-panneau p-5">
            <svg viewBox="-6 -6 112 112" className="h-28 w-28" aria-hidden>
              <rect x="0" y="0" width="100" height="100" fill="none" stroke="var(--color-joint)" />
              <path d={`M0 100 C${x1 * 100} ${100 - y1 * 100} ${x2 * 100} ${100 - y2 * 100} 100 0`} fill="none" stroke="var(--color-action)" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <p className="mt-3 text-titre-sm">ease-{nom}</p>
            <p className="chiffres text-legende text-encre-3">cubic-bezier({x1}, {y1}, {x2}, {y2}), {duree}</p>
            <p className="mt-2 text-corps-sm text-encre-2">{usage}</p>
          </Panneau>
        ))}
      </div>
    </Section>
  );
}

const MOTS: [string, string][] = [
  ['Sauver', 'Favori'],
  ['Aller ici (B)', 'Y aller'],
  ['Partir (A)', 'Partir d’ici'],
  ['Quai 3D', 'Voir le quai en 3D'],
  ['Zoom 3D', 'Centrer la carte en 3D'],
  ['Temps réel & GTFS', 'En direct, ou Horaires théoriques'],
  ['Réseau en circulation', 'Trafic normal sur 19 lignes sur 21.'],
  ['Rame : Milieu', 'Montez au milieu du train'],
  ['Carte 3D (Esc)', 'Revenir à la carte'],
  ['Définir Domicile', 'Définir le domicile'],
];

function Redaction() {
  return (
    <Section id="redaction" titre="Rédaction" intro="Des verbes simples, à la casse de la phrase. Un bouton dit ce qui va se passer, et garde le même nom tout au long du parcours.">
      <div className="overflow-hidden rounded-[12px] bg-surface [box-shadow:0_0_0_1px_var(--color-joint)]">
        <table className="w-full text-corps-sm">
          <thead className="text-start text-etiquette text-encre-2">
            <tr className="border-b border-joint">
              <th className="px-4 py-2.5 text-start font-semibold">Version 1</th>
              <th className="px-4 py-2.5 text-start font-semibold">Version 2</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-joint">
            {MOTS.map(([a, b]) => (
              <tr key={a}>
                <td className="px-4 py-2.5 text-encre-3 line-through decoration-encre-3/50">{a}</td>
                <td className="px-4 py-2.5 font-semibold">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function GardeFous() {
  return (
    <Section id="garde-fous" titre="Ce que la charte n’emprunte pas" intro="La proximité avec Paris vient de conventions publiques et de matières, jamais des marques déposées.">
      <div className="grid gap-4 md:grid-cols-2">
        <Panneau matiere="feuille" className="rounded-panneau p-5">
          <h3 className="text-titre-sm">Jamais</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-corps-sm text-encre-2">
            <li>La police Parisine, ni aucune police propriétaire de la RATP ou de la SNCF.</li>
            <li>Les logos RATP, SNCF, Île-de-France Mobilités, le « M » cerclé ou le logotype RER.</li>
            <li>Les pictogrammes officiels de ligne, redessinés ou copiés.</li>
            <li>Les jingles et voix d’annonce du réseau.</li>
          </ul>
        </Panneau>
        <Panneau matiere="feuille" className="rounded-panneau p-5">
          <h3 className="text-titre-sm">Librement</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-corps-sm text-encre-2">
            <li>Les couleurs de ligne, publiées en open data par Île-de-France Mobilités.</li>
            <li>Les conventions de lecture : disque pour le métro, chiffres d’attente, terminus.</li>
            <li>Les matières des stations : faïence biseautée, émail, laiton, fonte peinte.</li>
            <li>Le patrimoine du domaine public : entourages Guimard (1900), candélabres Dervaux.</li>
          </ul>
        </Panneau>
      </div>
    </Section>
  );
}
