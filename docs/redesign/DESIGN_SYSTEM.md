# DESIGN SYSTEM — Paris Subway 3D

> Contrat unique pour le redesign de tous les composants UI.
> Tout secteur de redesign DOIT se conformer à ce document. Toute déviation doit être approuvée explicitement.

---

## 1. Géométrie

### 1.1 Rayons de bordure (`border-radius`)

| Élément | Valeur | Token | Usage |
|---|---|---|---|
| Bouton primaire, champ input, carte | `8px` | `--r-card` | `.map-control-btn`, `.cmd-palette__input`, `.dock`, `.records-dialog` |
| Badge ligne, bouton secondaire | `6px` | `--r-sm` | `.line-badge`, `.topbar__search-trigger`, `.topbar__menu-btn` |
| Petit badge, tag, puce | `4px` | `--r-xs` | `.badge-conf`, `.badge-rt`, `.badge-sched`, `.pill-mini` |
| Éléments circulaires | `50%` | `--r-full` | `.rt-dot`, `.station-bullet`, `.train-cursor` |
| Pilule transfert | `9999px` | `--r-pill` | `.transfer-pill` |
| Menu dropdown, tooltip | `6px` | `--r-sm` | `.topbar__dropdown`, `.map-tooltip` |
| Modale | `12px` | `--r-modal` | `.records-modal`, `.cmd-palette-dialog` |

> **Règle** : Pas de `border-radius` en dessous de `4px` dans l'UI. Les `2px` existants (ladder nodes, station dots) passent à `4px`.

### 1.2 Hauteurs de bouton

| Variante | Hauteur | Token | Usage |
|---|---|---|---|
| Touch (mobile) | `52px` | `--h-btn-touch` | Tous les boutons en navigation tactile |
| Standard | `48px` | `--h-btn` | Boutons primaires, search trigger, menu btn |
| Quiet | `44px` | `--h-btn-quiet` | Boutons secondaires, line-badge cliquable |

### 1.3 Tailles d'icône

| Contexte | Taille | Notes |
|---|---|---|
| Barre supérieure | `20×20` | `.topbar` actions |
| Bouton de contrôle carte | `18×18` | `.map-control-btn` |
| Badge ligne | `14×14` (texte) | Ajusté par `data-len` |
| Indicateur RT | `10×10` | `.rt-dot` |
| Curseur train | `12×12` | `.train-cursor` |

### 1.4 Espacements

| Token | Valeur | Usage |
|---|---|---|
| `--pad-btn` | `24px` | Padding horizontal boutons standards |
| `--pad-btn-quiet` | `18px` | Padding horizontal boutons discrets |
| `--gap-xs` | `4px` | Espacement très serré |
| `--gap-sm` | `8px` | Entre éléments groupés |
| `--gap-md` | `12px` | Espacement standard |
| `--gap-lg` | `16px` | Séparation de sections |
| `--gap-xl` | `24px` | Espacement large |

---

## 2. États interactifs

Tout élément interactif (bouton, lien, badge cliquable, input) DOIT implémenter ces 4 états.

### 2.1 Hover

```css
.element:hover {
  background: var(--eleve);
  border-color: var(--bord);
  transition: background var(--t-state) var(--ease),
              border-color var(--t-state) var(--ease);
}
```

- **Bouton primaire** (laiton) : `background: var(--laiton-hover)`
- **Badge ligne** : `outline: none; box-shadow: none;` + fond légèrement éclairci

### 2.2 Press (active)

```css
.element:active {
  transform: scale(0.97);
  transition: transform var(--t-press) var(--ease);
}
```

- Durée : `--t-press: 90ms`
- Pas de scale sur les badges ligne (trop petits) — seulement sur les boutons ≥ 44px

### 2.3 Focus-visible

```css
.element:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--fond), 0 0 0 4px var(--laiton);
}
```

- **Touche** : anneau laiton `4px` avec `2px` de séparation fond
- **Jamais** `outline: none` seul — toujours accompagné d'un `box-shadow` de remplacement

### 2.4 Disabled

```css
.element:disabled,
.element[aria-disabled="true"] {
  opacity: 0.4;
  pointer-events: none;
  filter: grayscale(0.6);
}
```

---

## 3. Ombres

### 3.1 Niveaux d'ombre

| Niveau | Usage | Valeur |
|---|---|---|
| `shadow-xs` | Éléments subtils (tooltip, badge) | `0 0 6px rgba(0,0,0,0.4)` |
| `shadow-sm` | Dropdown, petit panneau | `0 4px 12px rgba(0,0,0,0.35)` |
| `shadow-md` | Panneau dock, carte | `0 6px 20px rgba(0,0,0,0.65)` |
| `shadow-lg` | Modale, dialog | `0 12px 36px rgba(0,0,0,0.6)` |
| `shadow-xl` | Modale haute (records) | `0 20px 60px rgba(0,0,0,0.6)` |
| `shadow-2xl` | Commande palette | `0 24px 64px rgba(0,0,0,0.85)` |

### 3.2 Ombres internes (inset)

```css
/* État repos d'un champ ou bouton secondaire */
.element {
  box-shadow: inset 0 0 0 1px var(--bord);
}

/* État hover d'un champ ou bouton secondaire */
.element:hover {
  box-shadow: inset 0 0 0 1px var(--inactif);
}
```

### 3.3 Glow laiton (état actif / sélectionné)

```css
.element--active {
  box-shadow: 0 0 12px var(--laiton);
}
```

---

## 4. Backdrops

| Contexte | Couleur | Opacité | Usage |
|---|---|---|---|
| Modale | `#000` | `0.6` | `.records-modal`, `.cmd-palette` backdrop |
| Tooltip | — | — | Pas de backdrop, overlay direct |

```css
.backdrop {
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(2px);
}
```

---

## 5. Typographie

### 5.1 Registres

| Registre | Font | Weight | Size | Line-height | Usage |
|---|---|---|---|---|---|
| **Titre** | `Cabinet Grotesk` | `700` | `1.2rem` | `1.2` | `.records-modal h2`, `.cmd-palette__heading` |
| **Corps** | `Switzer` | `400` | `0.85rem` | `1.4` | Texte courant, libellés |
| **Corps fort** | `Switzer` | `500` | `0.85rem` | `1.4` | Éléments actifs, sélection |
| **UI** | `Switzer` | `500` | `0.75rem` | `1` | Boutons, badges, tags |
| **UI petite** | `Switzer` | `500` | `0.65rem` | `1` | Métadonnées, timestamps, confiance |

### 5.2 Règles

- **Pas de taille en dessous de `0.6rem`** (9.6px) dans l'UI
- `letter-spacing` uniquement pour les badges 3 lettres (`-0.02em`)
- Tabular figures (`font-variant-numeric: tabular-nums`) pour tous les chiffres dans badges, compteurs, horaires
- `-webkit-font-smoothing: antialiased` global

---

## 6. Mobile (< 768px)

### 6.1 Ajustements

| Propriété | Desktop | Mobile |
|---|---|---|
| Hauteur bouton | `48px` | `52px` (`--h-btn-touch`) |
| Taille titre modale | `1.2rem` | `1rem` |
| Padding modale | `24px` | `16px` |
| Dock | latéral (panel) | bottom sheet |
| Topbar name | `15px` | `14px` |
| Badge ligne | `44px` | `40px` |

### 6.2 Safe areas

```css
.element {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
```

---

## 7. Animations

### 7.1 Durées

| Token | Durée | Usage |
|---|---|---|
| `--t-press` | `90ms` | Scale au press, feedback immédiat |
| `--t-state` | `200ms` | Hover, focus, transition d'état |
| `--t-surface` | `240ms` | Ouverture/fermeture panneau, modale |
| `--t-camera` | `700ms` | Animation caméra carte |

### 7.2 Courbe

```css
--ease: cubic-bezier(0.32, 0.72, 0, 1);
```

Toutes les transitions utilisent `var(--ease)` sauf les badges ligne qui utilisent `cubic-bezier(0.16, 1, 0.3, 1)`.

### 7.3 Patterns

| Pattern | Code |
|---|---|
| Apparition modale | `opacity 0 → 1` + `transform: scale(0.96) → scale(1)` sur `--t-surface` |
| Disparition modale | `opacity 1 → 0` sur `150ms` (plus rapide que l'apparition) |
| Tooltip | `opacity 0 → 1` sur `120ms` |
| Badge ligne | `box-shadow` + `background` sur `140ms` avec courbe dédiée |
| Hover bouton | `background` + `border-color` sur `--t-state` |
| Press bouton | `transform: scale(0.97)` sur `--t-press` |

---

## 8. Couleurs (rappel)

La palette complète est dans `tokens.css`. Voici les tokens utilisables dans tous les secteurs :

| Token | Valeur | Rôle |
|---|---|---|
| `--fond` | `#0C0B0B` | Fond de carte, tunnels |
| `--surface` | `#141312` | Bandeau, panneaux, dock |
| `--eleve` | `#1C1A19` | Cartons, champs, bouton secondaire |
| `--bord` | `#2A2725` | Séparateurs, filets au repos |
| `--inactif` | `#4E4945` | Éléments désactivés, bâti |
| `--secondaire` | `#9A938C` | Texte secondaire, libellés |
| `--texte` | `#F2EFE9` | Texte principal |
| `--laiton` | `#C9A227` | Action primaire, actif, focus |
| `--laiton-hover` | `#D8B438` | Hover du laiton |
| `--carmin` / `--signal` | `#D9463C` | Perturbation, erreur |

---

## 9. Règles transverses

1. **Un fichier = un secteur** — ne jamais modifier plus de 2 fichiers par secteur (le `.ts` + le `.css`)
2. **Pas de nouveau token** sans l'ajouter d'abord dans `tokens.css`
3. **Accessibilité** : tous les boutons doivent avoir un `aria-label` ou un texte visible
4. **Pas de `!important`** sauf pour les overrides MapLibre inévitables
5. **Les transitions doivent utiliser les tokens** (`--t-state`, `--ease`), pas de valeurs hardcodées
6. **Mobile first** : la version mobile est la baseline, desktop est l'enhancement