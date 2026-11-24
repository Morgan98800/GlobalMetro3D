# DESIGN.md : Charte « Plan Lumineux » (Paris Subway 3D)

Document de référence pour toute modification UI/UX, cartographique ou 3D sur **Paris Subway 3D** (Desktop + iPhone Safari).
Objectif : célébrer et raffiner l'identité physique **Plan Lumineux** (PILI 1937, faïence RATP, **diodes ASVA 605 nm**, **plaques émaillées Bleu Nuit**, **afficheurs SIEL**, **poussoirs en relief**) avec la fluidité, la netteté et les proportions natives d'**Apple Plans / Flighty** sur iPhone — à **60 FPS WebGL** et **0 violation WCAG 2.2 AA**.

---

## 1. Identité visuelle « Plan Lumineux » (à préserver et sublimer)

Sources de vérité : `web/src/design/tokens.ts` et `web/src/ui/plan-lumineux/plan-lumineux.css`.
Utiliser exclusivement les tokens CSS `--pl-*` ou `@theme inline` (aucune couleur hexadécimale arbitraire en dur).

### Surfaces et matières
- **Jour (Faïence claire)** : `--pl-surface: #f4f5f7`, `--pl-carte: rgba(255, 255, 255, .88)`, `--pl-calotte: #ffffff`, encre `#141923`.
- **Nuit (Faïence sombre)** : `--pl-surface: #12151b`, `--pl-carte: rgba(22, 26, 34, .86)`, `--pl-calotte: #1e232d`, encre `#f2f4f7`.
- **Îlot HUD cabine (`.pl-hud`)** : toujours sombre et opaque, sans `backdrop-filter`.

### Signatures tactiles protégées
- **Diodes ASVA / PILI (`.pl-lampe`, 605 nm)** : signature centrale de l'application (`--pl-asva: #ff6200`, `--pl-ambre: #ffb22e`, lentille verre + filament + respiration subtile). Elles doivent rester **visibles et vivantes** sur desktop ET sur iPhone (navigation active, thermomètre PILI, cartes rames, états temps réel).
- **Poussoirs en relief (`.pl-poussoir` + `.pl-calotte`)** : anneau métallique fonte/laiton + calotte faïence avec reflet supérieur subtil (`--pl-reflet`) et enfoncement tactile (`:active`). Sur iPhone, calibrer l'épaisseur d'anneau (`1px–1.5px`) et le padding pour rester fin et précis, jamais lourd ou massif.
- **Plaque émaillée Bleu Nuit RATP (`.pl-plaque`)** & **Afficheur SIEL LED (`.pl-siel`)** : utilisés pour les en-têtes de station/ligne et les temps d'attente / horloge.
- **Pastilles de lignes** : couleurs officielles RATP via `LineBadgeChip` (`lines.ts`).
- **Vert Jade RATP (`--pl-cobalt`, `--pl-laiton-*`)** : accent signature pour les actions primaires, l'anneau actif et le focus clavier (`:focus-visible`).

### Typographie
- UI : `--pl-font-ui` (`SF Pro Text` / `Asap Variable`).
- Signalétique : `--pl-font-signal` (`Asap Condensed`).
- Chiffres, horaires, vitesses, capacités, distances : **`font-variant-numeric: tabular-nums`** obligatoire.

---

## 2. Proportions et ergonomie iPhone (Priorité mobile 390×844)

L'iPhone est l'écran principal. Chaque proportion doit éviter le syndrome « trop gros / trop petit » :

### Échelle de proportions iPhone
- **Barre haute flottante** : 1 seule rangée compacte (`44px` de haut), dégagée de la Dynamic Island (`pt-[max(10px,env(safe-area-inset-top))]`). Pilule réseau + horloge SIEL compacte à gauche ; contrôles carte (3D / centrage / menu) regroupés en pilule verticale ou coin droit sans chevaucher la carte.
- **Zone du pouce (BottomSheet)** :
  - **Repos (`bas`)** : ~`156–170px` (~19 % de l'écran). Contient la barre de recherche (`44px`) + 4 tuiles « Plan Lumineux » calibrées (`54px` de haut, icône `18px`, libellé `11.5px`, diode ASVA en coin). Laisse **> 72 % de la carte 3D libre**.
  - **Contexte (`moyen`)** :
    - Vue `Lignes` : ajustée au contenu (`~340–380px`, ~42 % de l'écran) pour voir les tracés s'illuminer sur la carte au-dessus. Pastilles RATP en grille serrée à `44×44 px` (7 par ligne sur 390 px, gap `6px`).
    - Vue `Ligne active` / `Bibliothèque` / `Itinéraire` : `~52 %` puis `~88 %` (`haut`) sous la safe-area haute.
- **Safe-areas & Viewport** :
  - Toujours `100dvh` (`h-dvh`), jamais `100vh`.
  - Toujours `pb-[max(1rem,env(safe-area-inset-bottom))]` sur le contenu bas.
- **Cibles tactiles** : minimum **`44×44 px`** sur tous les éléments interactifs mobiles (boutons, pastilles, poignée du sheet, boutons de fermeture).
- **Physique tactile** :
  - Glissement piloté par `@use-gesture/react` + `motion/react` (ressort GPU `transform: translateY()` uniquement).
  - Scroll-handoff fluide (glisser vers le bas quand le scroll interne est à `0` descend le tiroir).

---

## 3. Performance WebGL 60 FPS & Safari iOS

- **GPU-only animations** : animer exclusivement `transform` et `opacity`. Jamais `transition: all`, `width`, `height`, `top`, `left` ou `margin`.
- **`backdrop-filter` statique uniquement** : `blur(14px) saturate(1.12)` (avec `-webkit-backdrop-filter`) uniquement sur les îlots fixes (`.pl-barre`, `.pl-carte`, `.pl-menu`), **jamais** sur le `BottomSheet` en mouvement ni animé.
- **3D Showroom & Rames** : `setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))`, textures standard glTF 2.0 PNG, éclairage studio lisible.

---

## 4. Accessibilité (WCAG 2.2 AA)

- **0 violation `@axe-core/playwright`** sur Desktop (`1280×800`) et iPhone (`390×844`), Jour et Nuit.
- Contraste ≥ 4.5:1 (texte normal), ≥ 3:1 (grands titres & composants UI).
- `aria-label` cohérents avec le texte visible (WCAG 2.5.3).
- Support complet `prefers-reduced-motion: reduce`.
