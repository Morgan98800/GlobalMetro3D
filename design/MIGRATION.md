# Migration v1 → v2

Les noms de jetons BoardUI sont conservés : remplacer `theme.css` suffit à faire basculer l’essentiel de l’interface. Les étapes suivantes retirent le laiton de l’UI, branchent les nouveaux composants et alignent la carte et la 3D.

## 1. Dépendances

```bash
npm i @fontsource-variable/asap @remixicon/react
npm i -D vite-plugin-singlefile d3-geo @types/d3-geo playwright   # planche et captures uniquement
```

Retirez les `@font-face` et imports de Switzer et la variable `--font-inter`.

Ajoutez au `package.json` :

```json
{
  "scripts": {
    "design:showcase": "vite build --config design/showcase-src/vite.config.mjs",
    "design:dev": "vite --config design/showcase-src/vite.config.mjs",
    "design:captures": "node design/capture_showcase.mjs maquettes"
  }
}
```

## 2. Styles

1. Remplacez `web/styles/theme.css` et ajoutez `web/styles/fonts.css`.
2. Ordre d’import : `tailwindcss`, puis `fonts.css`, puis `theme.css`.
3. Posez toujours la classe `.dark` sur `<html>` : la logique *Système / Clair / Sombre* existante ne change pas.

## 3. Classes à remplacer

```bash
grep -rnE "accent-[0-9]{2,3}" web/src     # le laiton ne compile plus
grep -rnE "#[0-9a-fA-F]{6}" web/src/ui     # aucune couleur en dur dans les composants
grep -rn "dark:" web/src/ui                # aucun préfixe dark:
```

| v1 | v2 |
| :--- | :--- |
| `bg-accent-500` ou `bg-accent-600` (bouton laiton) | `<Button variant="primaire">`, ou `bg-action text-action-encre` |
| Bouton laiton « Quai 3D » | `<Button variant="afficheur">` |
| `bg-accent-50` ou `bg-accent-100` (état actif) | `bg-selection text-selection-encre` |
| `text-accent-600` ou `text-accent-700` | `text-selection-encre` |
| `border-accent-*` | `border-selection-bord` |
| Cartes empilées `rounded-xl border` pour chaque passage | `<Passages>` (rangées et joints) |
| Panneau `bg-background-primary-default/90 backdrop-blur-md shadow-*` | `<Panneau>` ou l’utilitaire `flottant` |
| `text-text-*`, `bg-background-*`, `border-border-*`, `ring-border-focus-ring` | Inchangés |

Si la migration se fait en plusieurs fois, ce bloc temporaire garde les anciennes classes `accent-*` compilables, renvoyées vers l’émail. Retirez-le une fois le `grep` vide :

```css
@theme {
  --color-accent-50: var(--color-email-50);   --color-accent-100: var(--color-email-100);
  --color-accent-200: var(--color-email-200); --color-accent-300: var(--color-email-300);
  --color-accent-400: var(--color-email-400); --color-accent-500: var(--color-email-700);
  --color-accent-600: var(--color-email-800); --color-accent-700: var(--color-email-800);
  --color-accent-800: var(--color-email-900); --color-accent-900: var(--color-email-950);
  --color-accent-950: var(--color-email-950);
}
```

## 4. Composants

Copiez `web/src/ui/`. `LineBadgeChip` est un remplacement direct. Les autres sont présentationnels : branchez-les sur vos stores.

```tsx
const desktop = useIsDesktop();
<TopNavBar
  reseau="Paris"
  onReseau={uiStore.openNetworkPicker}
  onSearch={() => uiStore.setSearchOpen(true)}
  onRubrique={(r) => uiStore.togglePanel(r)}        // 'itineraire' | 'autour' | 'lignes'
  actif={uiStore.panel}
  experience={uiStore.mode}                          // 'simple' | 'passionne'
  onExperience={uiStore.setMode}
  onMenu={uiStore.openMenu}
/>
{!desktop && <BarreMobile onSearch={() => uiStore.setSearchOpen(true)} onRubrique={uiStore.togglePanel} actif={uiStore.panel} />}
```

Pour la fiche station, regroupez les passages par ligne et par terminus, deux par rangée. Adaptez `Brut` à la forme de vos données PRIM et GTFS :

```ts
import type { DepartGroupe } from './ui';

type Brut = { ligne: string; couleur?: string; encre?: string; terminus: string; minutes: number | null; tempsReel: boolean; aQuai?: boolean };

export function grouperPassages(bruts: Brut[]): DepartGroupe[] {
  const groupes = new Map<string, DepartGroupe>();
  for (const b of [...bruts].sort((x, y) => (x.minutes ?? 999) - (y.minutes ?? 999))) {
    const cle = `${b.ligne}|${b.terminus}`;
    const g = groupes.get(cle) ?? { ligne: { shortName: b.ligne, color: b.couleur, textColor: b.encre }, direction: b.terminus, passages: [] };
    if (g.passages.length < 2)
      g.passages.push({ minutes: b.minutes, statut: b.aQuai ? 'quai' : undefined, source: b.tempsReel ? 'temps-reel' : 'theorique' });
    groupes.set(cle, g);
  }
  return [...groupes.values()].sort((a, b) =>
    a.ligne.shortName.localeCompare(b.ligne.shortName, 'fr', { numeric: true }) || a.direction.localeCompare(b.direction, 'fr'),
  );
}
```

Dans `paris_ride_view.ts`, remplacez le HUD DOM existant par `<CabHud>`. `data-ride-route` et `data-ride-live` sont déjà posés.

## 5. Carte

Appelez `applyFaienceBasemap(map, theme)` sur `style.load` et dans `onThemeChange`. Pour les couches de lignes :
- dessinez d’abord `metroCasingPaint(theme)`, puis `metroLinePaint(couleur)` ;
- côté deck.gl, utilisez `deckLineProps()`.

En mode itinéraire, passez les lignes hors trajet en `dimmed`.

## 6. 3D

1. Remplacez les couleurs en dur de `station_detail_lod.ts` et de `paris_ride_view.ts` par `MATERIAUX` et `frise(couleurDeLigne)`.
2. Pour le pupitre, `drawAfficheurVitesse()` remplace le canvas du tachymètre et du KVB.
3. Les totems « M » de surface deviennent des mâts inspirés des candélabres Dervaux, du domaine public, sans le « M » cerclé.

## 7. Captures

`node design/capture_showcase.mjs` accepte `app`, `maquettes`, ou rien pour lancer les deux. Les sélecteurs v2 sont essayés en premier, puis les sélecteurs v1, ce qui permet de capturer pendant la migration. `CHROMIUM_PATH` réutilise un navigateur déjà installé.

## 8. Contrôle avant fusion

- [ ] Les trois `grep` du § 3 ne renvoient rien.
- [ ] Un parcours complet au clavier montre toujours l’anneau de focus, et la sélection ne lui ressemble pas.
- [ ] Avec `prefers-reduced-motion`, les trois points restent fixes et les feuilles apparaissent sans glisser.
- [ ] Les écrans à 390 px ne débordent pas (le script le vérifie).
- [ ] Les passages théoriques s’affichent en blanc, jamais en ambre.
- [ ] Il y a une seule plaque et un seul bouton `primaire` par écran.
- [ ] Les nouveaux contrastes sont vérifiés dans la planche (`design/showcase.html`, section Couleurs).

## Changements cassants

- Le nom accessible du bouton Lignes devient « Lignes, choisir une ligne ».
- `--color-accent-*` est supprimé (alias temporaire au § 3).
- Les variantes de bouton sont renommées : `primaire`, `secondaire`, `discret`, `afficheur`, `alerte`.
- `Kbd` vit dans `web/src/ui/Kbd.tsx`.

---

## v2 → v2.1 : arbitrage du layout

Décisions et raisons : [`docs/arbitrage_faience_v2.md`](../docs/arbitrage_faience_v2.md).

### Changements d’API

| Composant | Avant (v2) | Après (v2.1) |
| :--- | :--- | :--- |
| `StationDrawer` | Tuiles Favori, Domicile, Travail, Partager ; `onCentrer` | Favori en `IconButton` d’en-tête ; Domicile, Travail, Partager dans « Plus d’actions » ; `onCentrer` supprimé ; `onQuai3D` optionnel ; `onSuivre?` ; `station.accessible`, `station.alerte` |
| `LinesDock` | `onSelect(shortName)`, `onVoirSurCarte` | `onSelect(shortName \| null)`, `detail?: LigneDetail` (niveau Ligne X), `onClose?`, poignée mobile ; `onVoirSurCarte` supprimé |
| `MapControls` | `onLocaliser` | `gps` et `onGps`, `recentrer?`, `pointsDeVue?` |
| `RoutePlannerDrawer` | `onEffacer` ; « Partir de ma position » en bouton | `onEffacer` supprimé ; position dans le champ A ; `favoris?` |
| `TopNavBar` | — | `menuOuvert?`, `ligneActive?` ; icônes seules sous 1024 px |
| `CabHud` | Bascule direct maison, 2 accroches | `InterrupteurDirect`, les 8 `data-ride-*`, `pointDeVue?` |
| `Afficheur`, `Passages` | — | `onPassage`, `ligne` par passage ; `onSuivre`, `detail` par groupe |

### Suppressions côté app

- [ ] La modale **Réglages** : thème dans `MenuPrincipal`, Passionné dans la barre (bureau) ou le menu (mobile), bâtiments dans `MapControls`.
- [ ] Les modales **about** et **method**, fusionnées en `AProposModale`.
- [ ] Le SVG du ticket aux logos.
- [ ] L’entrée **Cabine & Quai 3D** de `MapControls`.
- [ ] Le **trophée** du bandeau télémétrie.
- [ ] Le bouton **Quitter** du suivi de rame.
- [ ] Les pieds **Effacer** et **Fermer** de l’itinéraire.
- [ ] Le **Fermer** en pied d’Autour de moi.
- [ ] Les boutons **Zoom 3D** et **Ligne X** de la fiche station.
- [ ] Le **Fermer** ou **Terminer** en pied des modales.

### Comportements à implémenter

- **Sélection d’une station :** cadrage quartier en Simple, cadrage rapproché en 3D en Passionné. `MapControls.recentrer` devient « Recentrer sur <station> » quand la caméra s’en éloigne.
- **Horaire touché en Passionné :** il lance le suivi de la rame correspondante (`onSuivre`).
- **Bouton tour Eiffel :** il n’apparaît que sur le tronçon concerné. En 3D, la tour n’est jamais rendue avec ses illuminations ni son scintillement.
