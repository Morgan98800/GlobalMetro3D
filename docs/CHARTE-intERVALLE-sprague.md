# Charte Graphique — Intervalle Sprague

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

| Registre | Choix | Source |
|---|---|---|
| interface, donnée | **Switzer** (avec `tnum`) | Fontshare |
| signalétique, affichage | **Cabinet Grotesk** | Fontshare |
| éditorial, méthode | **Zodiak** / **Gambarino** | Fontshare |
| fort caractère | **Karrik** | Velvetyne |

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
