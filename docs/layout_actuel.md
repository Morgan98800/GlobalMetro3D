# Architecture du Layout — Paris Subway 3D (Faïence v2.1)

Document de référence visuel (ASCII) décrivant l'interface actuelle de `SubwayAppShell` (`web/src/ui/SubwayAppShell.tsx`) et de la vue 3D (`web/src/ui/CabHud.tsx`).

---

## 1. Vue Desktop (`>= 768px`)

La carte MapLibre + Deck.gl occupe `100vw × 100vh` en arrière-plan (`#map`, `z-0`). Toute l'interface React flotte par-dessus (`pointer-events-none` sur le conteneur racine, `pointer-events-auto` sur chaque panneau).

```text
+---------------------------------------------------------------------------------------------------+
| [Marque] Paris v | [🔍 Où allez-vous ?    ⌘K] | [Itinéraire] [Autour] [● Lignes]  [21:20] [S|P] [⋮]|
+---------------------------------------------------------------------------------------------------+
|  (TopNavBar compacte, flottante en haut)                    [ 312 rames | 18 450 km | ● Temps réel ] |  <- BandeauTelemetrie (Passionné uniquement)
|                                                                                                   |
|  +---------------------------+                                                                    |
|  | < Toutes les lignes       |                                                                    |
|  | (4) Ligne 4               |                                                                    |
|  |     Clignancourt – Bagneux|                                                                    |
|  | [=======================] |                                                                    |
|  | Direction: Bagneux   [⇅]  |                         CARTE 3D INTERACTIVE                       |
|  | ● Trafic normal, 27 rames |                    (MapLibre + Deck.gl + Rames .glb)               |
|  | ------------------------- |                                                                    |
|  | Rames: 27 | Long: 14 km   |   <-- Passionné                                                    |
|  | Mat: MP89 | Auto          |                                                                    |
|  | ------------------------- |                                                                    |
|  | o Porte de Clignancourt   |                                                                    |
|  | |  Simplon                |                                                                    |
|  | o  Marcadet (12)          |                                                                    |
|  | |  ...                    |                                                      +-----------+ |
|  | [ 🧊 Monter à bord ]      |                                                      | [3D]      | |
|  +---------------------------+                                                      | [Bât] *   | |
|  (Panneau gauche `372px` :                                                          | [GPS]     | |
|   LinesDock OU StationDrawer                                                        | [Recentr] | |
|   OU NearbyDrawer OU RoutePlannerDrawer)                                            | [+ / -] * | |
|                                                                                     +-----------+ |
|  * Bâtiments & +/- uniquement en mode Passionné                                     (MapControls) |
|                                                                                                   |
|                              +-------------------------------------------+                        |
|                              | (4) Ligne 4 -> Bagneux               [×] |                        |
|                              | Prochaine: Châtelet              [ 1 min ]|                        |
|                              | o------o------▼------o------o             |                        |
|                              | [ 🧊 Monter dans cette rame ]             |                        |
|                              +-------------------------------------------+                        |
|                               (FollowTrainHud centré en bas si rame suivie)                       |
+---------------------------------------------------------------------------------------------------+
```

### Règles de placement Desktop
- **Un seul tiroir gauche ouvert à la fois** (`372px` de large, `left-4 bottom-4`, `top: 84px` en Simple / `top: 132px` en Passionné).
- **Priorité d'affichage à gauche** : `RoutePlannerDrawer` > `StationDrawer` > `NearbyDrawer` > `LinesDock`.
- **`FollowTrainHud`** : centré en bas (`bottom-4`), masque `LinesDock` pendant le suivi d'une rame.
- **`MenuPrincipal` (⋮)** : popover non modal sous le bouton `⋮` regroupant : Thème (`Système / Clair / Sombre`), Changement de réseau (`Paris`, `Londres`, `Montréal`, `Washington`, `Berlin`, `Lille`, `Édimbourg`), `Records`, `À propos et méthode`.
- **`StationSearchPalette` (`⌘K`)** : modale centrée de recherche unifiée (Stations, Lignes, Adresses & lieux, + 1re option « Itinéraire entre deux points »).

---

## 2. Vue Mobile (`< 768px`, ex. iPhone 390×844)

Sur mobile, la barre haute est allégée (recherche + réseau + horloge + menu `⋮`), les contrôles carte passent en colonne à droite, et la navigation principale est ancrée en bas (`BarreMobile`), au-dessus d'éventuelles feuilles coulissantes (**swipes tactiles** via `useSheetSwipe`).

```text
+---------------------------------------+
| [Marque] [🔍 Où allez-vous ?] [21:20] [⋮]|  <- TopNavBar mobile
+---------------------------------------+
|  (si Hors-ligne: [📡 Hors ligne · th.])|
|                                  +---+|
|                                  |[3D]||
|                                  |[GPS|
|         CARTE 3D                 |[Rec||
|   (plein écran tactile :         +---+|  <- MapControls (droite, haut)
|    pincement zoom + rotation          |
|    2 doigts sans boutons +/-)         |
|                                       |
+---------------------------------------+
|               -------                 |  <- Poignée (swipe ↓ ferme/réduit, swipe ↑ déplie)
|  [BASTILLE]                [★] [⋯] [×]|  <- Feuille basse (StationDrawer / Nearby /
|  (1) (5) (8)                          |     RoutePlanner / LinesDock)
|  Prochains passages:                  |
|  (1) Château de Vincennes   [ 2 min ] |
|  (5) Bobigny – Pablo Picasso[ 4 min ] |
|  [ Y aller ] [Partir] [Quai 3D]       |
+---------------------------------------+
|  [🔍]   [⇅ Itinéraire]  [📍 Autour] [● Lignes] |  <- BarreMobile (fixée en bas)
+---------------------------------------+
```

### Gestes tactiles (Mobile)
- **Swipe vers le bas (`>= 48px`)** sur la poignée ou l'en-tête d'une feuille (`LinesDock`, `StationDrawer`, `NearbyDrawer`, `RoutePlannerDrawer`) : réduit (`LinesDock`) ou ferme la feuille sans avoir à viser le bouton `×`.
- **Swipe vers le haut** sur la poignée de `LinesDock` réduit : déplie la liste des lignes.
- **Carte libre** : aucun bouton flottant superflu (`Domicile` / `Travail` sont uniquement dans `RoutePlannerDrawer` en 1 tap).

---

## 3. Vue 3D Quai & Cabine (`paris_ride_view.ts` + `CabHud.tsx`)

Plein écran WebGL Three.js par-dessus la carte (toujours en îlot sombre `.dark` haute lisibilité).

```text
+---------------------------------------------------------------------------------------------------+
| +-------------------------+                     +-----------------------------------------------+ |
| | [  CHÂTELET          v ]|                     | (14) [Ligne 14, St-Denis – Orly v] | [Esc]    | |
| +-------------------------+                     +-----------------------------------------------+ |
|  Plaque émail interactive                                 Sélecteur ligne/sens + Quitter          |
|  (clic -> <select> station)                                                                       |
|                                                                                                   |
|                                 SCÈNE 3D THREE.JS (Faïence v2)                                    |
|                    Voûte faïence biseautée, frise ligne, laiton, inox,                            |
|                    pupitre cabine avec afficheur vitesse verre noir & ambre                       |
|                                                                                                   |
| +-------------------------------------------+                    +------------------------------+ |
| | À quai, prochaine station      +--------+ |                    | [ Quai | Cabine ]  [MP14 CA] | |
| | Pyramides                      | 42 km/h| |                    | [1×]  [⏸]                    | |
| | Direction Aéroport d'Orly      +--------+ |                    +------------------------------+ |
| | o-----o-----▼-----o-----o   (arrêts       |                       Point de vue + Matériel       |
| | Châtelet  Pyramides  Madeleine  cliquables|                       (bascule Sprague 1930) +      |
| | En tunnel · Ligne 14       [● Temps réel] |                       Allure & Pause                |
| +-------------------------------------------+                                                     |
+---------------------------------------------------------------------------------------------------+
```

### Interactions clés de la vue 3D
- **Choix de station** : cliquer sur la **Plaque émail** en haut à gauche ouvre le sélecteur de toutes les stations de la ligne ; cliquer sur un point/nom dans le **ruban d'arrêts** en bas à gauche téléporte immédiatement à cette station.
- **Temps réel (`InterrupteurDirect`)** : synchronisé sur la rame live la plus proche de la station/direction active sur la carte 3D.

---

## 4. Hiérarchie des Pastilles & Variantes Faïence v2.1

- **Pastilles Métro (`1–14`, `3bis`, `7bis`)** : cercles parfaits (`rounded-[9999px] aspect-square`).
- **Pastilles RER (`A–E`) & Transilien** : carrés arrondis (`rounded-[28%] aspect-square`).
- **Variantes de boutons** (au plus un `primaire` et un `afficheur` par vue) :
  - `primaire` : bleu Émail (`--color-email`), action principale (ex. `Y aller`).
  - `secondaire` : Faïence claire/sombre avec bordure.
  - `discret` : sans fond au repos, barres et listes denses.
  - `afficheur` : verre noir + ambre, entrée vers la 3D (`Monter à bord`, `Voir le quai en 3D`, `Monter dans cette rame`).
