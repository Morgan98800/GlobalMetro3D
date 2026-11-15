# Audit du layout actuel & des boutons (avant migration Faïence v2)

Ce document recense **l’architecture réelle des écrans, panneaux, boutons et contrôles** de l’application actuelle (`web/src/ui/` et `web/src/paris_ride_view.ts`), afin de décider avec le designer Faïence v2 :
1. Sur quels éléments appliquer les composants/tokens Faïence v2.
2. Quels boutons sont **redondants ou superflus** (et peuvent être fusionnés ou supprimés).
3. Quels écrans existants ne sont **pas encore couverts** par le pack Faïence v2.

---

## 1. Architecture générale du layout

L’interface repose sur une carte 3D plein écran (MapLibre + deck.gl) recouverte par `SubwayAppShell` (`web/src/ui/SubwayAppShell.tsx`, `fixed inset-0 z-10 pointer-events-none`), ou remplacée en mode immersif par la vue 3D Three.js (`web/src/paris_ride_view.ts`).

Zones affichées à l’écran :
1. **Alerte de fraîcheur des données** (`stalenessWarning`, bandeau centré en haut sous la barre).
2. **`TopNavBar`** (`#topbar`) : barre flottante en haut (+ bandeau télémétrie en dessous si `expertMode` est actif).
3. **`MapControls`** (`#map-controls`) : pile verticale de boutons icônes à droite (en haut à droite sur mobile, en bas à droite sur desktop).
4. **`LineDetailsPanel`** (`#dock`) : panneau latéral gauche sur desktop / tiroir bas sur mobile (ouvert si `expertMode` ou `lineDrawerOpen`, masqué pendant le suivi d’une rame).
5. **`FollowTrainHud`** : carte flottante centrée en bas lorsqu’une rame est suivie sur la carte (`isFollowing && trackedTrain`).
6. **Tiroirs latéraux / bas (un à la fois selon l’état)** :
   - **`StationDrawer`** : fiche d’une station sélectionnée.
   - **`NearbyDrawer`** : stations autour de la position utilisateur.
   - **`RoutePlannerDrawer`** : calculateur d’itinéraire A → B.
7. **`StationSearchPalette`** : palette de recherche globale (`⌘K`).
8. **`InfoModals`** : 4 modales (`about`, `records`, `method`, `settings`).
9. **Vue immersive 3D (`paris_ride_view.ts`)** : scène Quai 3D / Cabine 3D avec HUD superposé.

---

## 2. Inventaire détaillé des écrans et boutons

### A. `TopNavBar.tsx` — Barre supérieure
| Élément | Type / Libellé | Rôle | Couvert en v2 ? |
| :--- | :--- | :--- | :--- |
| Sélecteur de réseau | Dropdown (`Paris`, etc.) | Changer de ville/réseau | Oui (`TopNavBar` pill réseau) |
| Recherche globale | Bouton trigger (`Où allez-vous ?…` / `Où ?` + `⌘K`) | Ouvre `StationSearchPalette` | Oui (`SearchTrigger` + `BarreMobile`) |
| `Itinéraire` | Bouton secondaire (icône seule < `lg`) | Ouvre `RoutePlannerDrawer` | Oui (`TopNavBar` / `BarreMobile`) |
| `Autour de moi` | Bouton secondaire (icône seule < `md`) | Géolocalisation + ouvre `NearbyDrawer` | Oui (`TopNavBar` / `BarreMobile`) |
| `Lignes` | Bouton secondaire (badge ligne active + `Lignes`) | Ouvre/ferme `LineDetailsPanel` | Oui (`TopNavBar` / `BarreMobile`) |
| `Simple` / `Passionné` | Switch (`expertMode`, masqué < `sm`) | Active télémétrie, KPIs, suivi de rame, horloge | Oui (`Segmented` dans `TopNavBar`) |
| Menu `⋮` | Dropdown (`Menu et informations`) | Contient switch `Mode Passionné` (mobile) + 4 items : `Réglages`, `Records du réseau`, `Méthode & Données`, `À propos du réseau` | Oui (`TopNavBar` bouton menu) |

**Bandeau télémétrie (affiché uniquement si `expertMode` est actif) :**
- Indicateurs passifs : horloge temps réel, `X rames en circulation`, `Y km estimés`.
- Bouton `PRIM Live actif` / `PRIM Live (Théorique)` (ou `TfL Live`, `WMATA Live`, `VBB Live`) : active/désactive le temps réel. *(Absents si `provider === 'none'`, remplacé par `Cadence GTFS`)*
- Bouton icône trophée (`Records du réseau`, masqué sur mobile `< sm`) : ouvre la modale `records`.

---

### B. `MapControls.tsx` — Contrôles de carte (à droite)
| Bouton | Libellé / Tooltip | Rôle | Couvert en v2 ? |
| :--- | :--- | :--- | :--- |
| Presets Édimbourg (`W`, `C`, `H`, `S`, `V`) | 5 boutons texte + `Suivre un train` | Uniquement si `cityConfig.id === 'edinburgh'` | **Non** |
| Vue 3D / 2D | `Basculer entre la vue 3D et 2D` | Toggle `pitch3D` | Oui (`MapControls`) |
| Bâtiments 3D | `Bâtiments 3D (B)` | Toggle `buildingsVisible` | Oui (`MapControls`) |
| GPS en direct | `Ma position GPS en direct` / `Arrêter GPS en direct` | Toggle `gpsWatchActive` | Oui (`MapControls`) |
| Cabine & Quai 3D | `Cabine & Quai 3D` (Paris uniquement) | Ouvre `paris_ride_view` sur la rame suivie ou la ligne active | Oui (`MapControls`) |
| Recentrer | `recenterLabel` (conditionnel `recenterVisible`) | Recentre la caméra sur la ville/utilisateur | Oui (`MapControls`) |

---

### C. `LineDetailsPanel.tsx` — Panneau des lignes (`#dock`)
- **En-tête :**
  - Bouton `Toutes` (si une ligne est sélectionnée) : désélectionne la ligne.
  - Bouton `Réduire` / `Ouvrir` (`md:hidden`) : replie/déplie le panneau sur mobile.
  - Bouton fermer `×` (si `!expertMode`) : ferme le panneau.
- **Grille de pastilles (`LineBadgeChip`)** : sélectionne / désélectionne une ligne.
- **Quand une ligne est sélectionnée :**
  - `SegmentedControl` de direction (`Terminus A` / `Terminus B`, si 2 sens).
  - Encart état du trafic (normal + nb de rames, ou alerte rose).
  - 4 cartes KPI (**uniquement en `expertMode`**) : `Rames en ligne`, `Longueur`, `Matériel`, `Exploitation`.
  - Bouton primaire pleine largeur (**Paris uniquement**) : `Cabine 3D en direct` (si `expertMode`) ou `Voir la rame en 3D` (sinon).
  - Thermomètre interactif (`StationLadder`) : clic station → `StationDrawer`, clic train → `FollowTrainHud`, clic correspondance → change de ligne.

---

### D. `StationDrawer.tsx` — Fiche station
- **Barre d’actions rapides en haut (4 boutons) :**
  - `Sauver` / `Favori` (étoile)
  - `Domicile`
  - `Travail`
  - `Partager` / `Lien copié`
- **Pastilles de lignes desservant la station** (`LineBadgeChip` cliquables → sélectionne la ligne, ouvre `LineDetailsPanel` et ferme la fiche) + badge `Accessible PMR` si applicable.
- **Alertes trafic** éventuelles.
- **Liste des prochains passages :**
  - En `expertMode` : affiche la confiance (`PRIM mesuré`, `Encadré RT`, `Extrapolé`, `Théorique GTFS`) + secondes + bouton `Suivre` sur chaque passage.
- **Pied de tiroir (`DrawerFooter`, jusqu’à 5 boutons !) :**
  - `Zoom 3D` (centre la carte à zoom 20 sur la station)
  - `Aller ici (B)` (ouvre `RoutePlannerDrawer` avec destination = station)
  - `Partir (A)` (ouvre `RoutePlannerDrawer` avec origine = station)
  - `Ligne X` (ouvre `LineDetailsPanel` sur la 1re ligne)
  - `Quai 3D` (bouton primaire, Paris uniquement → ouvre `paris_ride_view` en vue `vault`)

---

### E. `RoutePlannerDrawer.tsx` — Calculateur d’itinéraire
- **Raccourcis quotidiens :** `Domicile` (ou `Définir Domicile` si destination remplie), `Travail` (ou `Définir Travail`), et jusqu’à 4 favoris.
- **Champs A / B :**
  - `Départ (A)` avec bouton `Ma position` + autocomplétion stations/lieux.
  - Bouton icône `Inverser départ et arrivée`.
  - `Arrivée (B)` avec autocomplétion stations/lieux.
- **Résultats :**
  - Cartes de trajets candidats cliquables.
  - Détail des tronçons (marche, correspondance, métro/RER avec attente, indice voiture `Rame : …`, alerte trafic).
- **Pied de tiroir :** `Effacer`, `Partager` / `Lien copié`, `Fermer`.

---

### F. `NearbyDrawer.tsx` — Autour de moi *(non inclus dans le pack v2)*
- En cas d’erreur GPS : `Réessayer`, `Rechercher une station` (ouvre `⌘K`).
- Liste de cartes-boutons cliquables par station proche (distance, temps de marche, pastilles de lignes, 2 prochains passages) → ouvre `StationDrawer`.
- Pied de tiroir : `Fermer`.

---

### G. `FollowTrainHud.tsx` — Suivi d’une rame sur la carte *(non inclus dans le pack v2)*
- Bouton `×` en haut à droite + bouton `Quitter` en bas à droite (même action : arrêter le suivi).
- Barre de progression entre stations.
- En `expertMode` : vitesse (`km/h`) et confiance (`Arrêt mesuré`, etc.).
- Bouton primaire `Cabine 3D` (Paris uniquement) → ouvre `paris_ride_view`.

---

### H. `StationSearchPalette.tsx` — Recherche `⌘K` *(non inclus dans le pack v2)*
- Champ de recherche + raccourci fixe `Itinéraire entre 2 points (A → B)` + résultats Adresses/Lieux, Stations, Lignes.

---

### I. `InfoModals.tsx` — Modales d’information *(non incluses dans le pack v2)*
- **`about` (`À propos`)** : pour Paris, affiche un **SVG de ticket de métro contenant les logos `RATP`, `SNCF`, `optile`, `Île-de-France mobilités`** + sources + lien `/methode` (`Documentation technique`) + `Fermer`.
- **`records` (`Records du réseau`)** : onglets `Semaine` / `Samedi` / `Dimanche` (Top 5 et Flop 5 fréquentation) + `Fermer`.
- **`method` (`Méthode & Simulation`)** : 3 paragraphes explicatifs + lien `/methode` (`Lire la page méthode complète`) + `Fermer`.
- **`settings` (`Réglages`)** : `SegmentedControl` Thème (`Système` / `Clair` / `Sombre`), Switch `Mode Passionné`, Switch `Bâtiments 3D`, bouton `Terminer`.

---

### J. `paris_ride_view.ts` — Vue 3D Quai & Cabine
Contrôles DOM actuels :
- Sélecteur `<select data-ride-route>` (choix de ligne)
- Bouton fermer `[data-ride-exit]`
- Bouton `[data-ride-live]` (`EN DIRECT`)
- Toggle `[data-ride-view]` : `Quai` / `Cabine`
- Bouton `[data-ride-stock]` (`MP 14` / rame historique Sprague)
- Bouton `[data-ride-eiffel]` (`Tour Eiffel`, masqué par défaut)
- Bouton `[data-ride-speed]` (`1×`, vitesse de lecture)
- Bouton `[data-ride-pause]` (`Pause`)

---

## 3. Doublons, frictions & points à arbitrer avec le designer v2

1. **Points d’entrée redondants vers la 3D (`Cabine & Quai 3D`)** :
   Présent à **4 endroits** : `MapControls`, `LineDetailsPanel`, `StationDrawer` (`Quai 3D`), et `FollowTrainHud` (`Cabine 3D`). Faut-il tous les garder ou n’en garder que certains selon le contexte ?
2. **Surcharge du `StationDrawer`** :
   Jusqu’à **9 boutons** dans une seule fiche (`Sauver`, `Domicile`, `Travail`, `Partager`, `Zoom 3D`, `Aller ici (B)`, `Partir (A)`, `Ligne X`, `Quai 3D`), alors que la charte v2 préconise *une action principale par vue* (`Y aller` + `Voir le quai en 3D`).
   - `Ligne X` en pied de tiroir fait doublon avec les pastilles cliquables juste au-dessus.
   - `Domicile` et `Travail` dans la fiche station font doublon avec `RoutePlannerDrawer`.
   - `Zoom 3D` est-il utile si la sélection d’une station recentre déjà la carte ou si on passe en `Quai 3D` ?
3. **Doublons dans `FollowTrainHud`** :
   Deux boutons font exactement la même chose : l’icône `×` en haut à droite et le bouton `Quitter` en bas.
4. **Réglages et Mode Passionné éparpillés** :
   - `Mode Passionné` est modifiable à **3 endroits** (`TopNavBar` desktop, menu `⋮` mobile, modale `Réglages`).
   - `Bâtiments 3D` est à **2 endroits** (`MapControls` et modale `Réglages`).
   - `Records du réseau` est à **2 endroits** (menu `⋮` et icône trophée du bandeau télémétrie).
   - `À propos` et `Méthode & Simulation` pointent tous deux vers `/methode`.
5. **Éléments absents du pack Faïence v2 à designer ou adapter** :
   - `FollowTrainHud` (carte flottante de suivi de rame)
   - `NearbyDrawer` (`Autour de moi`)
   - `StationSearchPalette` (`⌘K`)
   - `InfoModals` (`about`, `records`, `method`, `settings`) — **attention juridique** : la modale `about` actuelle contient un SVG avec les marques `RATP`, `SNCF`, `optile` et `Île-de-France mobilités`, ce que le § 13 de Faïence v2 interdit explicitement.
   - Presets Édimbourg dans `MapControls` (`W, C, H, S, V` + suivi train) et bouton `Tour Eiffel` dans `paris_ride_view.ts`.
