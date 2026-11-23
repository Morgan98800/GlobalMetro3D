---
name: plan-lumineux-polish
description: Workflow strict d'audit et de polish UI/UX pour Paris Subway 3D respectant la charte Plan Lumineux (DESIGN.md), les 60 FPS WebGL Safari iOS, les cibles tactiles ≥ 44×44 px et WCAG 2.2 AA. Utiliser pour tout audit, refonte visuelle ou polish d'écran.
---

# Plan Lumineux Polish — Workflow & Règles bloquantes

Avant toute modification UI dans `web/src/ui/`, lire impérativement `DESIGN.md` à la racine du dépôt.

## 1. Procédure en passes ciblées (ne jamais tout refaire d'un coup)

1. **Audit Avant** :
   - Capturer l'écran ciblé sur **PC (`1280×800`)** et **iPhone (`390×844`)** en thèmes **Clair** et **Sombre**.
   - Exécuter `@axe-core/playwright` (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`), mesurer les cibles tactiles `< 44×44 px` et vérifier `document.documentElement.scrollWidth <= window.innerWidth`.
2. **Passe Structure & Densité** :
   - Supprimer les cartes imbriquées superflues ; privilégier `<Joint />`, l'espacement et l'alignement.
   - Optimiser la hauteur utile sur iPhone (en-têtes compacts, safe-areas `env(safe-area-inset-*)`).
3. **Passe Surfaces, Typo & États** :
   - Appliquer les tokens `Plan Lumineux` (`--pl-carte`, `--pl-hairline`, ombres multi-couches, `backdrop-filter` **statique** uniquement sur îlots fixes).
   - Vérifier `tabular-nums` sur tous les chiffres et les états complets (`hover`, `focus-visible`, `active`, `disabled`, `loading`).
4. **Passe Motion & Physique** :
   - Animations **GPU uniquement** (`transform`, `opacity`). Interdire `transition: all`, `width`, `height`, `top`, `left`.
   - Pour le `BottomSheet`, utiliser `@use-gesture/react` + `motion/react` (`useMotionValue` + ressort) sans `backdrop-filter`.
5. **Vérification Après** :
   - `npm run typecheck && npm --workspace=web run build`
   - Re-lancer Playwright + `@axe-core/playwright` : **0 violation WCAG 2.2 AA** et **0 cible `< 44×44 px`** sur iPhone.
   - Comparer visuellement les captures Avant / Après.
