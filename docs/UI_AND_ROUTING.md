# 📱 Interface Utilisateur, Ergonomie & Routage SPA

Ce document détaille les composants de l'interface utilisateur, le design system (une rampe neutre chaude librement inspirée de l'imagerie du métro parisien, sans affiliation à la RATP), l'optimisation pour smartphone et la gestion du routage d'URL monopage (SPA).

---

## 1. Le Design System — Rampe Neutre Chaude

L'interface s'inspire du patrimoine du métro parisien (entourages Art Nouveau, carrelage biseauté) mais l'implémentation actuelle de [`tokens.css`](file:///Users/morgancanteri/Documents/Paris%20subway%203D/web/src/styles/tokens.css) **a abandonné les verts profonds au profit d'une rampe neutre chaude** (commentaire de source : « Nouvelle rampe chromatique neutre, chaleur 2 % au lieu de 10 % »). C'est cette rampe qui fait autorité ; l'ancienne palette « Guimard / céramique » n'existe plus que sous forme d'**alias de compatibilité**.

### Palette de Couleurs Principales (`tokens.css`)

| Token CSS | Hexadécimal | Rôle dans l'UI |
|---|:---:|---|
| `--fond` | `#0C0B0B` | Fond principal de l'application et de la carte |
| `--surface` | `#141312` | Cartes, conteneurs et éléments surélevés |
| `--eleve` | `#1C1A19` | Surfaces de troisième niveau (bâti extrudé, tuiles) |
| `--bord` | `#2A2725` | Bordures fines et séparateurs |
| `--inactif` | `#4E4945` | Éléments désactivés / patine |
| `--secondaire` | `#9A938C` | Texte secondaire et métadonnées |
| `--texte` | `#F2EFE9` | Texte principal |
| `--laiton` | `#C9A227` | Accent doré : statuts, rame mesurée, records |
| `--laiton-hover` | `#D8B438` | État survol de l'accent |
| `--carmin` / `--signal` | `#D9463C` | Alertes et signaux |

Deux variables complètent la charte : `--vignette` (dégradé radial `#141312 → #0C0B0B → #050505`) et `--grain-opacity: 0.055`.

**Alias de compatibilité encore utilisés par `main.css`** — ils pointent tous vers la rampe ci-dessus :

| Ancien token | Pointe vers |
|---|---|
| `--laque`, `--fonte` | `--fond` |
| `--velours`, `--fonte-surface` | `--surface` |
| `--capiton`, `--guimard` | `--eleve` |
| `--couture`, `--fonte-border`, `--guimard-light` | `--bord` |
| `--patine`, `--ceramique-faint` | `--inactif` |
| `--opale-dim`, `--ceramique-dim` | `--secondaire` |
| `--opale`, `--ceramique` | `--texte` |

Les noms historiques (`--guimard`, `--ceramique`, `--fonte`…) fonctionnent donc toujours, mais **ne désignent plus les teintes vertes et ivoire d'origine**. Les valeurs citées dans [`CHARTE-intERVALLE-sprague.md`](CHARTE-intERVALLE-sprague.md) (par ex. `--laque #150E12`, `--carmin #E0483F`) sont la spécification d'origine et diffèrent de l'implémentation.

### Typographie & Chiffres Tabulaires
- **Interface courante** : police **Switzer** (400, 500, 600, 700), chargée depuis Fontshare — `--font-main` / `--font-ui`.
- **Titres & Identité** : police **Cabinet Grotesk** (500, 700, 800), également Fontshare — `--font-title`.
- **Repli** : **Inter** (400, 500, 600, 700) depuis Google Fonts si Fontshare échoue. `--font-title` déclare aussi `Archivo` en repli, mais **Archivo n'est jamais téléchargé** : ce n'est qu'un nom de *fallback*, pas une police servie.
- **Chiffres Tabulaires (`font-feature-settings: "tnum" 1`)** : activés sur les indices de lignes, les chronomètres de retard, les vitesses instantanées et le compteur de rames, afin d'éviter tout décalage horizontal pendant les incrémentations.

### Mouvement & Cibles Tactiles
- Durées : `--t-press: 90ms`, `--t-state: 200ms`, `--t-surface: 240ms`, `--t-camera: 700ms`, courbe `cubic-bezier(0.32, 0.72, 0, 1)`.
- Hauteurs de contrôles : `--h-btn: 48px`, `--h-btn-quiet: 44px`, `--h-btn-touch: 52px` (mobile), `--w-btn-min: 104px`.

---

## 2. « Le Quai » — Volet Latéral & Tiroir Tactile Mobile (`dock.ts`)

Le composant [`SubwayDock`](file:///Users/morgancanteri/Documents/Paris%20subway%203D/web/src/ui/dock.ts) gère la sélection de ligne :

### Sur Ordinateur Desktop
- Rail latéral escamotable fixé sur la gauche de l'écran.
- Deux groupes de pastilles : les 16 lignes de métro et les 5 lignes RER natives (A à E), avec les couleurs et contrastes GTFS contrôlés par `auditLineContrast()` (`line_badge.ts`).
- Clic sur une ligne :
  - La caméra s'envole en douceur pour cadrer l'emprise totale de la ligne, avec un padding mesuré sur le panneau réel.
  - Les 15 autres lignes sont atténuées à 25 % d'opacité.
  - Le Quai bascule sur le **Diagramme de Marche Vertical (Niveau 2)**.

### Sur Smartphone (< 768px)
- Le Quai se transforme en **tiroir rétractable tactile en bas d'écran (Bottom Sheet)**.
- Deux états :
  - **Replié (52 px)** : affiche uniquement la barre de sélection des lignes au ras de l'écran, laissant 90 % de surface visible pour la carte 3D.
  - **Déplié (48vh)** : glisse vers le haut pour afficher le diagramme des stations et les rames en approche.
- Prise en compte de la zone protégée de l'encoche iPhone (`env(safe-area-inset-top)` et `safe-area-inset-bottom`).

---

## 3. Diagramme de Marche Vertical (Niveau 2) (`station_ladder.ts`)

Inspiré des schémas de ligne officiels affichés au-dessus des portes de rames de métro :
- **Ligne de vie verticale** reliant les stations dans leur ordre commercial.
- **Commutateur de Direction (Terminus A ⇄ B)** : inversion instantanée de l'orientation de parcours.
- **Curseurs de Rames en Temps Réel** :
  - Chaque rame active est positionnée en face de son prochain arrêt.
  - Affichage de sa vitesse instantanée en km/h et de son retard (`À l'heure`, `+2 min`, `-1 min`).
  - **Clic sur un curseur** : la caméra se verrouille sur la rame et s'oriente dans son cap de marche en 3D.
- **Indicateur d'Intervalle Moyen (*Headway*)** : actualisé en direct selon le nombre de rames présentes dans la direction (ex: `2 min 40 s`).
- **Support des Branches (Ligne 7 et Ligne 13)** : séparation visuelle des tronçons bifurqués (ex: vers *Asnières-Gennevilliers* vs *Saint-Denis-Université* sur la 13).
- Résumé de ligne mis à jour à 1 Hz : rames par sens, headway, vitesse, stations, longueur, matériel et état du service.
- Les étiquettes de stations sont posées par `labels_layer.ts` avec un **tassement glouton en pixels** — deck.gl v9 n'expose pas de `CollisionFilterExtension` utilisable pour un `TextLayer` de stations, contrairement à ce qu'indiquait une version antérieure de ce document. Les paliers réels d'affichage sont :
  - `z < 12.5` : uniquement les ultra-pôles (15 stations maximum) ;
  - `12.5 ≤ z < 14.0` : pôles et correspondances ;
  - `z ≥ 14.0` : toutes les stations ;
  - dès qu'une ligne est sélectionnée, ses stations sont prioritaires.

---

## 4. En-tête, Statuts & Modales (`header.ts` + `main.ts`)

Le composant [`TopBar`](file:///Users/morgancanteri/Documents/Paris%20subway%203D/web/src/ui/header.ts) regroupe :

- **Marque et titre** (lien de retour à l'accueil).
- **Compteurs** : nombre de lignes, nombre de stations.
- **Distance de recherche** et **statut temps réel** (`rtStatusEl` + `rtLabelEl`) : état du flux PRIM et dernier rafraîchissement.
- **Bouton de recherche** (ouvre la barre instantanée, §5).
- **Bascule « Bâti 3D »** (`onToggleBuildings`) : pilote la `visibility` de la couche `building-3d` de MapLibre.
- **Menu déroulant** ouvrant la modale Méthode et la modale Records.

Deux modales sont implémentées dans `main.ts` :

- **`openMethodologyModal()`** : expose les **4 niveaux de méthode** (tracé 3D + GTFS théorique → recalage PRIM → extrapolation → confiance), les **4 badges de confiance** (`measured`, `bracketed`, `extrapolated`, `scheduled`), les licences ODbL et la clause explicite de non-affiliation avec la RATP et Île-de-France Mobilités. Un lien renvoie vers la page statique `/methode`.
- **`openNetworkRecords()`** : records de desserte calculés par `station-rankings.json`, en trois onglets (semaine / samedi / dimanche), avec les cinq stations les plus desservies et les cinq moins desservies. La fréquentation annuelle IDFM 2015 n'est volontairement pas jointe, faute d'identifiant GTFS fiable dans le jeu officiel.

---

## 5. Barre de Recherche Instantanée (`search_bar.ts`)

Intégrée dans l'en-tête (avec raccourci clavier universel `⌘K` / `Ctrl+K`) :
- **Recherche floue insensible aux accents et à la casse** sur les stations du réseau métro + RER.
- **Affichage dynamique des résultats** :
  - Nom officiel de la station.
  - Macaron `Hub` doré pour les pôles majeurs d'échanges (Châtelet, Gare du Nord, Montparnasse...).
  - Pastilles officielles de toutes les lignes en correspondance.
- **Action au clic** : vol de caméra immédiat avec zoom 16x sur les quais de la station choisie.

---

## 6. Routage d'URL SPA & Historique de Navigation (`router.ts`)

L'application gère un routage d'URL monopage propre et partageable :

| URL | État déclenché |
|---|---|
| `/` | Vue générale du réseau parisien (21 lignes actives) |
| `/ligne/1` | Filtrage sur la ligne 1 (direction 0 par défaut) |
| `/ligne/14?dir=1` | Filtrage sur la ligne 14 orientée vers Saint-Denis Pleyel |

### Configuration Netlify (`_redirects`)
Pour que le rafraîchissement d'une URL directe ou un partage de lien (ex: `https://parisian3dsubway.netlify.app/ligne/6`) ne renvoie pas une erreur 404, le fichier [`web/public/_redirects`](file:///Users/morgancanteri/Documents/Paris%20subway%203D/web/public/_redirects) redirige toutes les requêtes vers `index.html` avec le code HTTP 200 :
```
/*    /index.html   200
```
Le routeur TypeScript intercepte l'URL lors du bootstrap et configure automatiquement le dock et la caméra sur la ligne demandée.
