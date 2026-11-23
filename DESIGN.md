# DESIGN.md — Charte « Plan Lumineux » (Paris Subway 3D)

Document de référence non négociable pour toute modification UI/UX sur **Paris Subway 3D**.  
Objectif : préserver l’identité physique **Plan Lumineux** (PILI 1937 + faïence RATP + afficheurs SIEL) avec une finition **Apple Plans / Flighty**, tout en garantissant **60 FPS WebGL sur Safari iOS** et **0 violation WCAG 2.2 AA**.

---

## 1. Identité visuelle verrouillée

Sources de vérité : [`web/src/design/tokens.ts`](web/src/design/tokens.ts) et [`web/src/ui/plan-lumineux/plan-lumineux.css`](web/src/ui/plan-lumineux/plan-lumineux.css).

- **Surfaces & thèmes** :
  - **Jour** : faïence claire (`--pl-surface: #f4f5f7`, `--pl-carte: rgba(255, 255, 255, .88)`, `--pl-calotte: #ffffff`, encre `#141923`).
  - **Nuit** : faïence sombre (`--pl-surface: #12151b`, `--pl-carte: rgba(22, 26, 34, .86)`, `--pl-calotte: #1e232d`, encre `#f2f4f7`).
  - **Îlot HUD cabine (`.pl-hud`)** : toujours sombre et opaque, sans `backdrop-filter`.
- **Couleurs d’accent & signalisation** :
  - **Vert Jade RATP** (`--pl-cobalt: #007a68`, `--pl-laiton-1: #00a98f` jour ; `#1fc7ac` nuit) : anneaux actifs et actions principales.
  - **Diodes ASVA / ampoules PILI** (`--pl-asva: #ff6200`, `--pl-ambre: #ffb22e`) et **LED SIEL** (`--pl-led: #ff9d14`) : réservées exclusivement aux témoins actifs, horloges et temps d’attente temps réel.
  - **Pastilles de lignes** : couleurs officielles RATP via `LineBadgeChip` (`lines.ts`), jamais de teintes inventées.
- **Typographie** :
  - UI : `--pl-font-ui` (`SF Pro Text` / `Asap Variable`).
  - Signalétique : `--pl-font-signal` (`Asap Condensed`).
  - Chiffres, horaires, vitesses, distances : **`font-variant-numeric: tabular-nums`** obligatoire.

---

## 2. Surfaces, profondeur & contrainte WebGL 60 FPS (Safari iOS)

- **Îlots flottants fixes** (`.pl-barre`, `.pl-carte`, `.pl-menu`, `MapControls`) :
  - Bordure **hairline** `1px` (`--pl-hairline`).
  - **Ombres multi-couches** : ombre de contact serrée + ombre ambiante douce + reflet supérieur `inset 0 1px 0 var(--pl-reflet)`.
  - **`backdrop-filter: blur(14px) saturate(1.12)` strictement statique**.
- **Interdictions absolues** :
  - **Jamais** de `backdrop-filter` animé (ni pendant une transition d’ouverture/fermeture, ni sur le `BottomSheet` glissant).
  - **Jamais** de transition sur `width`, `height`, `top`, `left`, `margin` ou `transition: all` — utiliser uniquement `transform` et `opacity`.

---

## 3. Mouvement & physique tactile

- **Courbes officielles « Plan Lumineux »** :
  - Contact poussoir : `--pl-ease-contact` (`cubic-bezier(.2, 0, 0, 1)`, `90–120 ms`).
  - Portes / tiroirs : `--pl-ease-portes` (`cubic-bezier(.22, 1, .36, 1)`, `300–380 ms`).
  - Rames : `--pl-ease-rame` (`cubic-bezier(.65, 0, .35, 1)`, `560–640 ms`).
- **Tiroir mobile (`BottomSheet.tsx`)** :
  - Piloté par `@use-gesture/react` (`useDrag`) + `motion/react` (`useMotionValue` + ressort GPU).
  - Relais propre scroll interne (`scrollTop <= 0`) ↔ glissement vers le bas.
  - Respect systématique de `env(safe-area-inset-top)` / `env(safe-area-inset-bottom)` et de `prefers-reduced-motion: reduce`.

---

## 4. Discipline anti-slop (structure & états)

- **Pas de cartes partout** : structurer l’information par l’espacement, la typographie et les filets `<Joint />` plutôt que d’empiler des cartes dans des cartes.
- **États complets obligatoires** sur tout composant interactif : repos, `hover` (`@media (hover: hover) and (pointer: fine)`), `focus-visible` (anneau `--pl-focus`), `active`, `disabled` et `loading` le cas échéant.
- **Pas d’effets gratuits** : aucun dégradé décoratif sur les titres, aucun mot isolé stylisé artificiellement, aucune duplication de KPI entre barre, tiroir et carte.
- **Passes ciblées** : travailler écran par écran et thème par thème (Clair puis Sombre).

---

## 5. Porte de qualité bloquante (avant validation)

1. **TypeScript & Build** : `npm run typecheck && npm --workspace=web run build` sans erreur.
2. **Accessibilité WCAG 2.2 AA** : **0 violation** sous `@axe-core/playwright` sur PC (`1280×800`) et iPhone (`390×844`), thèmes clair et sombre (notamment `aria-prohibited-attr`, `label-content-name-mismatch` WCAG 2.5.3, `target-size`).
3. **Cibles tactiles iPhone (`390×844`)** : **0 cible interactive `< 44×44 px`** (utiliser des hitbox CSS `::after` si l’élément visuel doit rester compact, ex. rames/correspondances du thermomètre).
4. **Stabilité** : `overflowX = false` et `0` erreur console.
