# Charte Graphique — Intervalle Sprague

> [!IMPORTANT]
> **Ce document est une spécification de design, pas une description du code.** Il exprime l'intention esthétique d'origine (une identité prune/or/opalin inspirée de la laque oxblood et du velours des voitures d'origine). L'implémentation livrée a retenu la **structure** de cette charte (mêmes jetons, mêmes rôles, mêmes dimensions) mais a évolué vers une **rampe neutre chaude** — gris légèrement chaud plutôt que prune.
>
> Ce qui suit décrit la cible. Pour la vérité terrain, voir [`web/src/styles/tokens.css`](file:///Users/morgancanteri/Documents/Paris%20subway%203D/web/src/styles/tokens.css) et [UI_AND_ROUTING.md](UI_AND_ROUTING.md) §1. L'état d'implémentation jeton par jeton est récapitulé en §6.

---

## 1. Identité & Philosophie

Intervalle puise son identité dans le patrimoine technique et architectural du réseau métropolitain parisien historique : la laque oxblood des voitures de première classe d'origine, le velours des banquettes, le capiton, et le laiton des barres d'appui. Prune, or et opalin composent un vocabulaire noble issu de l'opéra et de la reliure.

---

## 2. Palette Laque

### Rampe

| Jeton | Valeur | Rôle |
|---|---|---|
| `--laque` | `#150E12` | fond absolu, vide de la carte, tunnels |
| `--velours` | `#1E1419` | surfaces du chrome : bandeau, panneaux |
| `--capiton` | `#291B21` | surfaces élevées, cartons, champs, boutons secondaires |
| `--couture` | `#3B2830` | bordures et séparateurs au repos |
| `--patine` | `#6E505A` | filets, bâti extrudé, éléments inactifs |
| `--opale-dim` | `#A8949C` | texte secondaire, libellés, unités |
| `--opale` | `#F1EFEA` | texte principal, plaques de station |

### Accents

| Jeton | Valeur | Rôle exclusif |
|---|---|---|
| `--laiton` | `#C9A227` | état actif, recalage temps réel, action primaire |
| `--carmin` | `#E0483F` | perturbation, erreur |

---

## 3. Le fond — Trois couches

1. **Le vignettage** : `radial-gradient(115% 85% at 50% 38%, #241820 0%, #150E12 58%, #0B070A 100%)`
   Assombrit progressivement les bords vers un presque-noir pour focaliser le regard sur Paris.
2. **Le grain** : bruit monochrome à 5,5 % d'opacité statique, supprimant le banding des dégradés sombres.
3. **La carte vectorielle** : fond désaturé fondu dans `--laque`, avec la Seine, les canaux et le périphérique.

---

## 4. Typographie

| Registre | Choix | Source | Statut |
|---|---|---|---|
| interface, donnée | **Switzer** (avec `tnum`) | Fontshare | ✅ chargé (400, 500, 600, 700) |
| signalétique, affichage | **Cabinet Grotesk** | Fontshare | ✅ chargé (500, 700, 800) |
| éditorial, méthode | **Zodiak** / **Gambarino** | Fontshare | ❌ **jamais chargées** |
| fort caractère | **Karrik** | Velvetyne | ❌ **jamais chargée** |

> Seules **Switzer** et **Cabinet Grotesk** sont réellement téléchargées (voir `web/index.html`). **Inter** est chargée depuis Google Fonts comme repli. Le nom `'Archivo'` apparaît dans `--font-title` mais n'est qu'un **repli CSS** : aucune fonte Archivo n'est jamais servie.

---

## 5. Boutons & Contrôles

### Dimensions
- Hauteur primaire & secondaire : 48 px (mobile : 52 px)
- Hauteur tertiaire : 44 px (mobile : 52 px)
- Padding horizontal : 24 px (tertiaire : 18 px)
- Largeur minimale : 104 px
- Écart icône / libellé : 9 px
- Taille icône : 15 px

### Niveaux
- **Primaire** : Fond `--laiton`, texte `--laque`, sans filet.
- **Secondaire** : Fond `--capiton`, texte `--opale`, 1 px filet `--couture` inset.
- **Tertiaire** : Fond transparent, texte `--opale-dim`, sans filet.

### États & Mouvement
- **Survol (200ms)** : Élévation d'un palier, filet passe à `--patine`.
- **Pression (90ms)** : `transform: scale(0.972)` et descente d'un palier.
- **Inactif** : Fond `--capiton`, texte `--patine`, filet `--couture` (pas d'opacité réduite).
- **Chargement** : Largeur fixe verrouillée, indicateur dans l'emplacement icône.

---

## 6. État d'Implémentation (vérité terrain)

`tokens.css` déclare la rampe effective, puis expose les noms de cette charte comme **alias** afin que les anciens composants continuent de fonctionner. Les jetons existent donc tous — mais leurs **valeurs** diffèrent pour huit d'entre eux.

### Correspondance des jetons

| Jeton de la charte | Valeur spécifiée | Alias implémenté | Valeur réelle |
|---|---|---|---|
| `--laque` | `#150E12` | → `--fond` | **`#0C0B0B`** |
| `--velours` | `#1E1419` | → `--surface` | **`#141312`** |
| `--capiton` | `#291B21` | → `--eleve` | **`#1C1A19`** |
| `--couture` | `#3B2830` | → `--bord` | **`#2A2725`** |
| `--patine` | `#6E505A` | → `--inactif` | **`#4E4945`** |
| `--opale-dim` | `#A8949C` | → `--secondaire` | **`#9A938C`** |
| `--opale` | `#F1EFEA` | → `--texte` | **`#F2EFE9`** |
| `--laiton` | `#C9A227` | `--laiton` | ✅ `#C9A227` (identique) |
| `--carmin` | `#E0483F` | `--carmin` / `--signal` | **`#D9463C`** |

En clair : la direction **prune / oxblood n'a pas été retenue**. La rampe livrée est un **gris chaud neutre** (`#0C0B0B` → `#F2EFE9`), le laiton reste l'unique accent actif, et le carmin est un peu plus froid qu'annoncé. Les rôles sémantiques, eux, sont respectés à la lettre.

### Le fond

| Couche | Spécifié | Implémenté |
|---|---|---|
| Vignettage | `radial-gradient(115% 85% at 50% 38%, #241820 0%, #150E12 58%, #0B070A 100%)` | `radial-gradient(75% 65% at 50% 45%, #141312 0%, #0C0B0B 60%, #050505 100%)` — plus resserré, sans teinte prune |
| Grain | 5,5 % | ✅ `--grain-opacity: 0.055` |
| Carte vectorielle | fond désaturé, Seine, canaux, périphérique | ✅ conforme — couches `paris-water`, `paris-waterways`, `paris-canal-core`, `paris-ring-road` sur fond OpenFreeMap |

### Dimensions et mouvement

Les dimensions de §5 sont **implémentées à l'identique**, sous forme de jetons :

| Spécifié | Jeton |
|---|---|
| Primaire/secondaire 48 px, mobile 52 px | `--h-btn: 48px`, `--h-btn-touch: 52px` |
| Tertiaire 44 px, mobile 52 px | `--h-btn-quiet: 44px` |
| Padding horizontal 24 px (tertiaire 18 px) | `--pad-btn: 24px`, `--pad-btn-quiet: 18px` |
| Largeur minimale 104 px | `--w-btn-min: 104px` |
| Survol 200 ms | `--t-state: 200ms` |
| Pression 90 ms, `scale(0.972)` | `--t-press: 90ms` |
| Courbe d'animation | `--ease: cubic-bezier(0.32, 0.72, 0, 1)` (spécifiée ici pour la première fois) |

L'écart icône/libellé de 9 px et la taille d'icône de 15 px ne sont pas tokenisés : ils vivent dans le CSS des composants.
