# Jetons et composants — Faïence v2

Référence de l’implémentation. Les principes sont dans [README.md](README.md), le passage depuis la v1 dans [MIGRATION.md](MIGRATION.md).

---

## 1. Installation

```bash
npm i @fontsource-variable/asap @remixicon/react
```

```css
/* point d’entrée CSS de l’app */
@import "tailwindcss";
@import "./fonts.css";   /* Asap, axes graisse + largeur, police de repli calée */
@import "./theme.css";   /* jetons Faïence */
```

Le thème suit la classe `.dark` sur `<html>`, posée selon `prefers-color-scheme` ou le choix *Menu → Paramètres*. Aucun composant n’utilise le préfixe `dark:` : tout passe par les jetons sémantiques. Un élément `class="dark"` crée un **îlot nocturne**. Tous les jetons s’y résolvent à nouveau, car la couche sémantique est déclarée en `@theme inline`. C’est ainsi que le HUD de cabine reste sombre dans une app claire.

## 2. Primitives (`@theme static`)

Les primitives sont toujours émises, pour que Three.js et le canvas puissent les lire. Elles ne s’utilisent jamais directement dans un composant, sauf l’ambre sur un afficheur.

| Rampe | Valeurs |
| :--- | :--- |
| `email` | 50 `#f2f6fe` · 100 `#e4ebfd` · 200 `#c9d7fb` · 300 `#a2b9f5` · 400 `#718fe3` · 500 `#4b68c7` · 600 `#344ea6` · 700 `#263c88` · **800 `#1c2d6c`** · 900 `#132050` · 950 `#091230` |
| `ardoise` | 25 `#fafbfd` · 50 `#f4f6f9` · 100 `#eaedf3` · 150 `#e1e5eb` · 200 `#d5dae3` · 300 `#b7beca` · 400 `#9199a6` · 450 `#7f8794` · 500 `#646c7a` · 600 `#4f5766` · 700 `#38404f` · 800 `#222a39` · 900 `#111928` |
| `nuit` | 600 `#404759` · 700 `#2a3144` · 800 `#1a2134` · 850 `#12192a` · 900 `#0c1222` · 950 `#060a18` |
| `ambre` | 200 `#ffe4a6` · 300 `#ffd46e` · 400 `#ffc640` · **500 `#ffb81c`** · 600 `#e39b00` · 700 `#a87300` · éteint `#4d3906` |
| `normal` / `vigilance` / `signal` | 500 remplissage · 700 texte de jour · 300 texte de nuit |
| `ligne-*` | `ligne-1` … `ligne-14`, `ligne-3b`, `ligne-7b`, `ligne-a` … `ligne-e` (replis open data IDFM) |

Autres primitives :
- **Rayons :** `rounded-plaque` 6, `rounded-controle` 10, `rounded-panneau` 16, `rounded-feuille` 24. Les alias v1 sont conservés : `rounded-2lg` 10 et `rounded-2-5xl` 20.
- **Élévations :** `shadow-pose`, `shadow-flotte`, `shadow-feuille`, `shadow-presse`.
- **Courbes :** `ease-portes`, `ease-rame`, `ease-signal`.
- **Animations :** `animate-approche`, `animate-rafraichir`, `animate-feuille`. Elles s’arrêtent toutes en mouvement réduit.

**Typographie.** Les classes portent taille, interligne, graisse et approche :
- `text-micro`, `text-legende`, `text-etiquette` ;
- `text-corps-sm`, `text-corps` ;
- `text-titre-sm`, `text-titre`, `text-titre-lg`, `text-affiche` ;
- `text-chiffre-sm`, `text-chiffre`, `text-chiffre-lg`, `text-chiffre-xl`.

## 3. Sémantique (`@theme inline`, bascule `.dark`)

| Classe | Jour | Nuit | Usage |
| :--- | :--- | :--- | :--- |
| `bg-fond` | ardoise-50 | nuit-900 | Sol de la carte et des pages |
| `bg-surface` | `#ffffff` | nuit-850 | Panneaux, feuilles |
| `bg-surface-elevee` | `#ffffff` | nuit-800 | Menus, popovers |
| `bg-encart` / `-survol` | ardoise-100 / 150 | nuit-800 / 700 | Champs, pistes, tuiles |
| `border-joint`, `divide-joint` | ardoise-150 | blanc 7,5 % | Joints entre rangées |
| `bord` / `bord-fort` | ardoise-200 / 300 | blanc 12 / 22 % | Contours de contrôle |
| `text-encre` / `-2` / `-3` | ardoise-900 / 600 / 500 | `#eef1f7` / ardoise-300 / `#8c939f` | Textes |
| `text-icone` / `-2` | ardoise-800 / 450 | `#e3e7ef` / `#8c939f` | Icônes |
| `bg-action` / `-survol` / `-presse` | email-800 / 700 / 900 | `#eef1f7` / `#fff` / email-100 | Action principale (s’inverse la nuit) |
| `text-action-encre` | `#ffffff` | email-900 | Texte de l’action principale |
| `outline-focus` | email-600 | email-300 | Anneau de focus |
| `bg-selection`, `text-selection-encre`, `selection-bord` | email-50, email-700, email-200 | émail 14 %, email-200, émail 32 % | États actifs, bascules |
| `bg-plaque`, `text-plaque-encre`, `plaque-filet` | email-800, blanc, blanc 92 % | idem, filet 86 % | Plaques |
| `bg-afficheur`, `text-afficheur-encre` | `#000`, ambre-500 | idem | Afficheurs |
| `text-afficheur-theorique` | `#dfe4ee` | idem | Horaire théorique |
| `bg-normal` · `bg-vigilance` · `bg-signal` | 500 | 500 | Points d’état |
| `text-normal-encre` · `-vigilance-encre` · `-signal-encre` | 700 | 300 | Textes d’état |
| `bg-verre` | nuit-950 à 72 % | idem | HUD sur la 3D |

## 4. Compatibilité BoardUI

Les classes v1 continuent de compiler et pointent vers les nouveaux rôles.

| Classe BoardUI | Rôle Faïence |
| :--- | :--- |
| `text-text-primary` / `-secondary` / `-tertiary` | `encre` / `encre-2` / `encre-3` |
| `bg-background-primary-default` | `surface` |
| `bg-background-secondary-default` / `-hover` | `encart` / `encart-survol` |
| `bg-background-accent-default` / `-hover` | `action` / `action-survol` |
| `border-border-button-default` / `-hover` | `bord` / `bord-fort` |
| `border-border-default` | `joint` |
| `ring-border-focus-ring` | `focus` |
| `text-foreground-icon-primary` / `-secondary` | `icone` / `icone-2` |
| `text-body-2-regular`, `text-body-2-medium`, `text-body-regular`, `text-body-medium`, `text-caption-1-regular`, `text-caption-1-semibold` | mêmes tailles, en Asap |

Les rampes `accent-*` (laiton) n’existent plus. Voir MIGRATION.md, § 3.

## 5. Signatures (`@utility`)

| Utilitaire | Effet |
| :--- | :--- |
| `plaque` | Fond émail, filet blanc intérieur, brillant d’émail, ombre portée légère |
| `afficheur` | Verre noir, reflet haut, encre ambre |
| `faience` | Surface, glaçure de 1 px en haut, joint |
| `flottant` | Faïence à 93 % avec flou, pour les panneaux posés sur la carte |
| `verre` | Verre sombre et flou pour les HUD au-dessus de la 3D |
| `carrelage` | Motif de carreaux 2:1 en quinconce (pseudo-élément, suit le thème) |
| `signaletique` | Largeur 80 %, pour les noms de lieux |
| `chiffres` | Chiffres tabulaires et étroits |

```tsx
<h2 className="plaque signaletique px-3.5 py-[7px] text-[21px] font-[650]">Bastille</h2>
<span className="afficheur chiffres px-2 text-chiffre-sm font-bold">4<small>min</small></span>
<p className="carrelage rounded-[12px] p-6 text-center">Aucun passage annoncé pour le moment.</p>
```

## 6. Composants (`web/src/ui`)

Tous sont exportés par `web/src/ui/index.ts`. Ils sont présentationnels : ils reçoivent des données et des rappels, et laissent les stores à l’app.

### `LineBadgeChip`
Sur-ensemble exact de l’API v1 : les appels existants compilent sans changement.

| Prop | Type | Défaut | Note |
| :--- | :--- | :--- | :--- |
| `shortName` | `string` | — | « 4 », « 3B », « 3bis », « A », « RER A » sont reconnus |
| `color`, `textColor` | `string?` | repli `LINE_FALLBACKS` | Hex du flux GTFS, avec ou sans « # » |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg'` | `'sm'` | 20 / 24 / 32 / 40 px |
| `mode` | `'metro' \| 'rer' \| 'tram' \| 'train' \| 'bus'` | déduit | Disque, carré arrondi ou pastille longue |
| `alert` | `'vigilance' \| 'signal' \| null` | — | `hasAlert` (v1) vaut `vigilance` |
| `selected`, `dimmed`, `interactive`, `onClick`, `label` | | | `label` remplace le nom accessible |

```tsx
<LineBadgeChip shortName={route.short_name} color={route.route_color} textColor={route.route_text_color} size="md" alert="vigilance" onClick={openLine} />
```

### `Button` et `IconButton`
Variantes `primaire` · `secondaire` (défaut) · `discret` · `afficheur` · `alerte`. Tailles `sm` 32, `md` 40 et `lg` 48. Props `icon`, `iconEnd`, `fullWidth`, `loading` et `pressed` (bascule, avec `aria-pressed`). `IconButton` exige `label`, qui sert de nom accessible et d’info-bulle.

```tsx
<Button variant="primaire" icon={<RiRouteLine aria-hidden />} onClick={goHere}>Y aller</Button>
<Button variant="afficheur" icon={<RiBox3Line aria-hidden />} onClick={openQuai}>Voir le quai en 3D</Button>
<IconButton label="Vue en 3D" pressed={is3d} onClick={toggle3d} icon={<RiBox3Line aria-hidden />} />
```

### `Plaque`
`size` `sm` · `md` · `lg` · `xl` · `xxl`, et `as` pour le niveau de titre. Une plaque par écran.

### `Afficheur`, `Horloge`, `Approche`
`Afficheur` reçoit `passages: Passage[]`, `size` (`sm`, `md`, `lg` ou `xl`), `max` (1 ou 2) et, en v2.1, `onPassage?(index)` : chaque horaire devient alors un bouton « Suivre la rame ». Un `Passage` est `{ minutes?, statut?, source?, ligne? }` ; `ligne` dessine l’onglet couleur de la ligne quand un afficheur mélange plusieurs lignes (Autour de moi) :
- `statut` : `approche`, `quai`, `retard`, `supprime` ou `termine` ;
- `source` : `temps-reel` ou `theorique`.

`minutes: 0` affiche les trois points. Chaque passage est accompagné de sa phrase pour les lecteurs d’écran, et `describePassage()` l’expose. `Horloge` reçoit `date?`, `live` (rafraîchie toutes les 15 s) et `size`.

### `Passages`
Le tableau des prochains passages.
- **Props :** `groupes: DepartGroupe[]`, `direct`, `onLigne` et `onSuivre?(groupe, passage)` (mode Passionné).
- **Groupe :** un `DepartGroupe` vaut `{ ligne, direction, passages, detail? }`, soit une rangée par ligne et par terminus ; `detail` porte la confiance en mode Passionné. MIGRATION.md donne une fonction de regroupement.
- **Rendu :** les rangées sont séparées par des joints, et un état vide en carrelage s’affiche s’il n’y a aucun passage.

### `PlanDeLigne` et `PlanDeLigneHorizontal`
Le vertical reçoit `couleur`, `arrets` et `replier`.
- **Arrêt :** un `Arret` vaut `{ nom, role?, correspondances?, detail? }`, où `role` est `depart`, `arrivee` ou `passage`.
- **Repli :** les arrêts intermédiaires se replient en « N arrêts », qu’on peut déplier.

L’horizontal reçoit `couleur`, `arrets`, `index` et `progression` (de 0 à 1). Le train avance avec `ease-rame`.

### `VoitureConseillee`
`position` (`tete`, `milieu` ou `queue`), `voitures` (5 par défaut) et `raison` (« pour la sortie rue de Lyon »).

### `Segmented`
Groupe radio générique `Segmented<T>`, avec `label`, `options`, `value` et `onChange`. Il se pilote aux flèches, et son curseur glisse avec `ease-portes`.

### `Panneau` et `Joint`
`matiere` vaut `flottant`, `feuille`, `encart` ou `verre`. `Joint` trace la ligne de séparation.

### `SearchTrigger`, `Kbd`, `Marque`
`SearchTrigger` garde `id="topbar-search-trigger"` et le même nom accessible qu’en v1. `Marque` est la marque de l’app : une plaque qui porte une station sur une ligne.

### `TopNavBar` et `BarreMobile`
`TopNavBar` reçoit :
- `reseau` et `onReseau` ;
- `onSearch` ;
- `onRubrique(r)` et `actif`, avec `r` parmi `itineraire`, `autour` et `lignes` ;
- `experience` et `onExperience` (`simple` ou `passionne`) ;
- `onMenu` et `horloge?`.

Sous 768 px, la recherche et les rubriques passent dans `BarreMobile`, à placer en bas de l’écran.

### `MapControls`
Props `vue3d`, `onVue3d`, `batiments`, `onBatiments`, `gps` et `onGps` (suivi continu de la position), `recentrer?: { label, onClick }`, `onZoomIn?`, `onZoomOut?`, `cap`, `onNord?`, `pointsDeVue?: MenuEntree[]` et `zoom`.
- `recentrer` n’apparaît que quand la caméra s’est éloignée.
- La boussole n’apparaît que si la carte n’est pas orientée au nord.
- `pointsDeVue` ouvre un menu de presets de ville en noms complets.
- Aucune entrée vers la 3D : elle appartient aux panneaux de sujet.

### `LinesDock`
Deux niveaux : Lignes (pastilles, état du trafic), puis Ligne X dès que `selection` et `detail` sont fournis.
- **Props :** `lignes: LigneEtat[]`, `selection`, `onSelect(shortName | null)`, `onClose?` (absent en Passionné, panneau permanent), `detail?`, `onMonter?` (Paris), `presentation`, `replie` et `onReplier` (poignée mobile).
- **`LigneEtat` :** `LineRef & { alert?, message?, termini? }`.
- **`LigneDetail` :** `{ direction, onInverser, trafic: { niveau, texte }, indicateurs?, arrets, rames?, onArret?, onRame?, onCorrespondance? }`.

### `StationDrawer`
- **Données :** `station { nom, lignes, contexte? }`, `groupes` et `direct`.
- **Bascules :** `favori`, `domicile` et `travail`.
- **Rappels :** `onFavori`, `onDomicile`, `onTravail`, `onPartager`, `onYAller`, `onPartir`, `onQuai3D?` (Paris), `onLigne`, `onClose` et `onSuivre?` (Passionné). Domicile, Travail et Partager vivent dans le menu « Plus d’actions » ; `onCentrer` (Zoom 3D) est supprimé.
- **Station :** `station.accessible` affiche l’étiquette « Accessible en fauteuil » ; `station.alerte` affiche un message de trafic.
- **Présentation :** `presentation` vaut `cote` ou `basse`, et se choisit automatiquement selon la largeur.
- **Accessibilité :** le composant porte `role="dialog"`.

### `RoutePlannerDrawer`
- **Champs :** `depart`, `arrivee`, `onDepart`, `onArrivee`, `onInverser` et `onMaPosition`.
- **Raccourcis :** `domicile`, `travail`, `onRaccourci` et `favoris?` (jusqu’à 4). `onMaPosition` s’affiche dans le champ A tant qu’il est vide.
- **Résultats :** `itineraires: Itineraire[]`, `selection` et `onSelection`.
- **Actions :** `onPartager` et `onClose`. `onEffacer` est supprimé : les ⊗ des champs suffisent.

Un `Itineraire` vaut `{ minutes, arrivee, segments }`. Un segment est soit `{ type: 'marche', minutes, metres?, consigne? }`, soit `{ type: 'ligne', ligne, direction, de, a, arrets, minutes, attente?, voiture?, raisonVoiture? }`.

### `CabHud`
HUD de la vue quai et cabine, toujours en îlot nocturne.
- **Ligne et parcours :** `ligne`, `routes`, `route` et `onRoute`, posés sur le `<select data-ride-route>`.
- **Position :** `station`, `aQuai`, `prochaine`, `direction`, `voie`, `vitesse`, `arrets`, `index` et `progression`.
- **Point de vue :** `vue` et `onVue` (`quai` ou `cabine`).
- **Simulation :** `materiel`, `onMateriel`, `allure`, `onAllure`, `pause` et `onPause`.
- **Données en direct :** `direct` et `onDirect`, posés sur `[data-ride-live]`.
- **Sortie :** `onQuitter`.
- **Point de vue :** `pointDeVue?: { label, onClick }`, contextuel (tour Eiffel sur la ligne 6), posé sur `[data-ride-eiffel]`.
- **Accroches :** les huit `data-ride-*` de la v1 sont posés ; `[data-ride-live]` est un `InterrupteurDirect` (`role="switch"`).

### Ajouts v2.1

| Composant | Rôle | Props principales |
| :--- | :--- | :--- |
| `MenuBouton` | Menu d’actions rares (`role="menu"`) | `label`, `icon`, `entrees: { label, icon?, onSelect, ton? }[]`, `align` (`start`, `end`, `gauche`), `defaultOpen` |
| `Modale` | Feuille centrée (bureau), basse (mobile) ; × seule sortie, Échap, piège du focus | `ouverte`, `titre`, `onClose`, `bandeau?`, `largeur` |
| `InterrupteurDirect` | Bascule temps réel, libellé constant, `role="switch"` | `direct`, `onChange`, `source`, `disponible` |
| `Thermometre` | La ligne entière ; arrêts, rames et correspondances cliquables | `couleur`, `arrets`, `rames?`, `onArret?`, `onRame?`, `onCorrespondance?` |
| `MenuPrincipal` | Menu ⋮ ; remplace la modale Réglages | `experience?` (mobile), `onExperience?`, `theme`, `onTheme`, `onRecords`, `onAPropos` |
| `BandeauTelemetrie` | Télémétrie Passionné | `rames`, `kilometres`, `direct`, `onDirect`, `source`, `disponible` |
| `FollowTrainHud` | Suivi d’une rame ; × seule sortie | `ligne`, `direction`, `prochaine`, `arrivee?`, `arrets`, `index`, `progression`, `vitesse?`, `confiance?`, `onMonter?`, `onArreter` |
| `NearbyDrawer` | Autour de moi | `etat`, `erreur?`, `stations: StationProche[]`, `precision?`, `onStation`, `onReessayer`, `onRechercher`, `onClose` |
| `StationSearchPalette` | Recherche ⌘K (combobox) | `ouverte`, `requete`, `onRequete`, `stations`, `lignes`, `lieux`, `onChoisir`, `onClose` |
| `AProposModale` | À propos et méthode, sans logos | `ouverte`, `onClose`, `methodeHref`, `sources` |
| `RecordsModale` | Records de fréquentation | `ouverte`, `onClose`, `jour`, `onJour`, `plus`, `moins`, `source` |
| `formatNombre` | « 18 450 » lisible en chiffres étroits (U+00A0) | `n: number` |

`IconButton` accepte aussi `expanded` (`aria-expanded`), pour les boutons qui ouvrent un menu ou un panneau.

## 7. Hors React

```ts
import { readToken, onThemeChange, hexToRgba, easeRame } from '@/design/tokens';
import { applyFaienceBasemap, metroLinePaint, metroCasingPaint, stationPaint, deckLineProps } from '@/map/basemap_palette';
import { MATERIAUX, frise, ECLAIRAGE, PUPITRE, drawAfficheurVitesse } from '@/three/paris_palette';

// Carte : restyle au chargement puis à chaque changement de thème
map.on('style.load', () => applyFaienceBasemap(map, document.documentElement.classList.contains('dark') ? 'nuit' : 'jour'));
const stop = onThemeChange((t) => applyFaienceBasemap(map, t));

// deck.gl : transitions de caméra au rythme d’une rame
deck.setProps({ initialViewState: { ...view, transitionDuration: 640, transitionEasing: easeRame } });

// Three.js
const faience = new THREE.MeshPhysicalMaterial(MATERIAUX.faience);
const friseL4 = new THREE.MeshPhysicalMaterial(frise('#a0006e'));
drawAfficheurVitesse(ctx, { vitesse: 42, limite: 70, materiel: 'MF 01', etat: 'AV / QUAI', libelleLigne: '9', couleurLigne: '#d2d200' });
texture.needsUpdate = true;
```

## 8. Points d’accroche conservés

| Accroche | Composant | Statut |
| :--- | :--- | :--- |
| `#topbar-search-trigger` | `SearchTrigger` | Identique |
| `button[aria-label="Ligne 14"]` | `LineBadgeChip` | Identique (« , trafic perturbé » s’ajoute si alerte) |
| `button[aria-label="Monter à bord d’une rame en 3D"]` | `LinesDock` | Identique |
| `[data-ride-route]`, `[data-ride-live]` | `CabHud` | Identiques |
| `[role="dialog"]` | `StationDrawer`, `RoutePlannerDrawer` | Identique |
| `button[aria-label="Choisir une ligne"]` | `TopNavBar` | **Devient** « Lignes, choisir une ligne » (WCAG 2.5.3). Le script de capture accepte les deux. |
| `[data-ride-exit]`, `[data-ride-view]`, `[data-ride-stock]`, `[data-ride-speed]`, `[data-ride-pause]`, `[data-ride-eiffel]` | `CabHud` | Restaurés en v2.1 |
| `button[aria-label="Arrêter le suivi"]` | `FollowTrainHud` | Nouveau |
| `button[aria-label="Favori"]`, `button[aria-label="Plus d’actions"]` | `StationDrawer` | Nouveaux |
