---
name: plan-lumineux-polish
description: Workflow strict d'audit, de nettoyage anti-slop et de polish UI/UX pour Paris Subway 3D (Mac + Safari iOS) respectant DESIGN.md, les 60 FPS WebGL, les cibles tactiles >= 44px et WCAG 2.2 AA.
---

# Plan Lumineux Polish : Workflow Anti-Slop et Validation

Lire impérativement `DESIGN.md` avant toute édition dans `web/src/` ou `core/ui/`.
Travailler **un seul écran et un seul thème à la fois**. Ne jamais lancer une refonte globale en un seul prompt.

## Étape 1 : Audit Avant (lecture seule, zéro modification de code)

1. Capturer l'écran ciblé sur **PC (`1280×800`)** et **iPhone (`390×844` ou Simulateur iOS via `ios-simulator-mcp` / `iwdp-mcp`)**, en mode **Sombre** puis **Clair**.
2. Lancer `@axe-core/playwright` (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`), vérifier `scrollWidth <= innerWidth` et lister toutes les cibles tactiles `< 44×44 px`.
3. Inspecter visuellement les captures et produire un court diagnostic listant uniquement les défauts réels :
   - Boîtes ou bordures imbriquées (> 1 niveau).
   - Contours néon ou cumul de plus d'un accent couleur par vue.
   - Diodes ASVA décoratives sur des éléments non temps réel.
   - Espace mort dans un BottomSheet mobile ou chevauchement avec les safe-areas Safari iOS.
   - Collisions de labels ou écrasement visuel sur la carte MapLibre.
4. Présenter le plan de retouche en 3 à 5 actions précises et **s'arrêter pour validation** avant d'éditer le code si la retouche modifie la structure d'un composant.

## Étape 2 : Passe Structure, Densité et Safe-Areas

- Supprimer les cartes dans les cartes : remplacer les encadrements redondants par `<Joint />`, l'espacement et l'alignement.
- Recalibrer la hauteur des tiroirs mobiles sur leur contenu (`fit-content` pour `Lignes`, `h-dvh` et `env(safe-area-inset-bottom)` partout).
- Remplacer les grilles de tuiles lourdes du dock mobile par une barre d'actions aérée (cibles `>= 44×44 px`).

## Étape 3 : Passe Surfaces, Accents, Typo et États

- Purger les bordures néon sur les états actifs ; basculer sur la densité de fond (`--pl-calotte`) et le contraste d'encre.
- Retirer toute diode ASVA qui ne traduit pas un état temps réel ou une perturbation.
- Vérifier `tabular-nums` sur chaque chiffre et la présence des 5 états (`hover`, `focus-visible`, `active`, `disabled`, `loading`) sur chaque bouton.
- Vérifier que `backdrop-filter` est statique, limité aux îlots fixes et préfixé `-webkit-backdrop-filter`.

## Étape 4 : Passe Motion, MapLibre et Vitrine 3D

- Vérifier l'absence totale de `transition: all` et de toute animation hors `transform` / `opacity`.
- Si la passe touche la carte : contrôler `text-allow-overlap: false`, `text-halo-width` et la discrétion des labels d'arrondissements.
- Si la passe touche la Bibliothèque 3D : contrôler `RoomEnvironment`, le fond radial et `setPixelRatio(Math.min(devicePixelRatio, 2))`.

## Étape 5 : Vérification Après (idéalement via un subagent QA séparé)

Ne pas se contenter de lire le code : prouver le résultat.

1. Exécuter `npm run typecheck && npm --workspace=web run build`.
2. Re-capturer PC (`1280×800`) et iPhone (`390×844` / Simulateur Safari iOS) en Clair et Sombre.
3. Re-lancer `@axe-core/playwright` : exiger **0 violation WCAG 2.2 AA** et **0 cible `< 44×44 px`**.
4. Remplir la grille anti-slop ci-dessous (minimum **4/5 sur chaque axe**, sinon corriger avant de conclure) :
   - **Pureté anti-slop** : 0 bordure néon, 0 carte imbriquée, 0 diode décorative.
   - **Hiérarchie & typo** : lecture immédiate, `tabular-nums`, contrastes APCA/WCAG propres.
   - **Ergonomie Safari iOS** : `h-dvh`, safe-areas respectées, tiroir dimensionné au contenu, 0 zone vide.
   - **Performance WebGL** : 0 `backdrop-filter` animé, 0 transition layout, 0 erreur console.
   - **Fidélité Plan Lumineux** : identité RATP/SIEL intacte sans dérive générique.
5. Présenter un récapitulatif court Avant / Après avec les captures et les métriques.
