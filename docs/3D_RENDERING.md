# 🎨 Moteurs Graphiques & Rendu Visuel 3D

Ce document détaille l'architecture graphique unifiée du projet : une scène 3D haute performance fonctionnant sur un **unique contexte WebGL** combinant MapLibre GL JS 5.24 (fond vectoriel, relief et bâti 3D extrudé) et deck.gl 9.1 / 9.4 (infrastructure ferroviaire et rames en circulation).

> **Pas de moteur secondaire et pas de monuments modélisés.** L'ancien Studio Three.js et son jeu de huit monuments `.glb` ont été retirés : ils ne subsistent nulle part dans `web/src/`, `web/public/models/` ni dans le code de rendu. Le seul contenu glTF réellement chargé aujourd'hui est le matériel roulant (§2.3). Le script `scripts/export_landmarks_gltf.mjs` reste présent dans le dépôt mais n'est appelé par aucun point d'entrée.

---

## 1. Fond de Carte & Infrastructure Métropolitaine (MapLibre GL + deck.gl)

### 1. Fond de Carte Vectoriel Industriel Sombre
- **Source vectorielle** : Tuiles vectorielles OpenMapTiles hébergées par **OpenFreeMap** (`https://tiles.openfreemap.org/planet`), éliminant tout fond rasterisé et offrant l'accès direct aux géométries de bâtiments.
- **Palette chromatique** : la charte `tokens.css` (rampe neutre chaude) est appliquée à l'interface. Le style cartographique, lui, code ses teintes en hexadécimal direct, alignées sur cette rampe :

  | Couche | Type / source-layer | `minzoom` | Teinte | Opacité |
  | :--- | :--- | :---: | :--- | :--- |
  | `background` | `background` | — | `rgba(0,0,0,0)` | — |
  | `paris-woods` | `fill` / `landcover` | — | `#111010` | 0.28 |
  | `paris-water` | `fill` / `water` | 10 | `#141312` | 0.40 |
  | `paris-waterways` | `line` / `waterway` | 10 | `#1C1A19` | 0.45 |
  | `paris-canal-core` | `line` / `waterway` | 11 | `#2A2725` | 0.40 |
  | `paris-ring-road` | `line` / `transportation` | 9 | `#2A2725` | 0.85 |
  | `quiet-rail` | `line` / `transportation` | 11 | `#1C1A19` | 0.50, pointillés `[3,2]` |
  | `quiet-roads` | `line` / `transportation` | 10 | `#141312` | 0.45 |
  | `quiet-boundary` | `line` / `boundary` | 10 | `#1C1A19` | 0.35, pointillés `[4,3]` |
  | `building-3d` | `fill-extrusion` / `building` | 14 | `#1C1A19` | voir §2.1 |

  Aucune couche `symbol` n'est déclarée : **le fond de carte ne porte aucun libellé de rue, à aucun zoom.** La seule typographie de la scène est celle des étiquettes de rames (`TextLayer`) produite par deck.gl. Le champ `glyphs` pointe malgré tout vers `https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf`.
- **Relief** : un `raster-dem` (`https://demotiles.maplibre.org/terrain-tiles/{z}/{x}/{y}.png`, `tileSize: 256`, `maxzoom: 12`) est monté via `map.setTerrain({ exaggeration: 1.5 })` au `style.load`, pour les collines de Montmartre, Belleville et Sainte-Geneviève.
- **Attribution** : `AttributionControl` compact personnalisé (OpenMapTiles · OpenStreetMap · IDFM ODbL).
- **Paramètres de vue** :
  - Centre de référence : Paris Châtelet (`lng: 2.3488`, `lat: 48.8534`) — `PARIS_CENTER` dans `packages/shared`.
  - Le cadrage d'ouverture est ajusté sur l'emprise réelle du réseau (`bounds`), pas sur un zoom fixe. Constantes partagées : `DEFAULT_ZOOM = 11.8`, `DEFAULT_PITCH = 30`, `DEFAULT_BEARING = -15`.
  - La carte MapLibre est créée avec `pitch: 0`, `bearing: 0`, `maxPitch: 60`, `maxZoom: 18`.
  - **Politique de caméra par palier** (`maxPitchForZoom`) : tant que le bâti extrudé n'est pas actif, l'inclinaison est plafonnée à `30°` ; au-delà de `z = 14` elle monte linéairement jusqu'à `60°` atteints à `z = 16.5`. Ce lissage évite le saut brutal d'inclinaison au franchissement du seuil `building-3d`.
  - Un bouton de l'en-tête active/désactive le bâti 3D (`onToggleBuildings`), qui pilote la `visibility` de la couche `building-3d`.

### 2. Extrusion Altitudinale des Voies (`elevation_offset`)
À Paris, de nombreuses lignes se croisent en sous-sol (ex: Châtelet-Les Halles, République, Montparnasse). Sans gestion de l'altitude, les tracés se chevauchent de manière confuse.
Chaque ligne se voit attribuer un décalage vertical autoritaire dans `lines.json` :
- Ligne 14 (la plus profonde) : décalage `-28 m`.
- Lignes historiques (1, 4) : décalage `-12 m`.
- Sections aériennes (Ligne 6 Bir-Hakeim, Ligne 2 Barbès) : décalage `+12 m`.

Le `PathLayer` de deck.gl prend en compte ce décalage pour extruder les polylignes avec jointures et extrémités arrondies.

### 3. Rendu des Rames (deck.gl)

La représentation des rames — capsules métriques, modèles glTF ou marqueurs de repli — est décrite en détail au **§2.3**. Cette section ne couvre que l'interpolation cinématique qui s'applique quel que soit le mode de rendu.

#### Interpolation Cinématique Sub-seconde (60 FPS)
Bien que le moteur de simulation cadence son état logique à 1 Hz, l'affichage tourne en continu à 60 FPS dans `requestAnimationFrame` :
- **Extrapolation continue** : $\hat{d} = d_{\text{tick}} + v \times (t - t_{\text{tick}})$, plus le résidu de recalage éventuel.
- **Résorption douce des écarts** : à la réception de chaque tick, l'écart résiduel est amorti **linéairement sur 300 ms** (`factor = 1 - elapsed/300`), ce qui élimine tout à-coup visuel.
- **Recalage franc sur rupture** : si l'écart mesuré dépasse **20 m** (`Math.abs(rawError) > 20`), l'offset de résorption est remis à zéro et la nouvelle position s'applique immédiatement, sans étirement artificiel.
- **Rames fantômes** : les rames supprimées par un tick sont conservées dans le jeu rendu puis fondues en **240 ms** avant d'être retirées.
- **Accessibilité `prefers-reduced-motion`** : l'extrapolation continue est désactivée et les positions sautent doucement au pas discret de 1 Hz.

---

## 2. Bâti Urbain 3D & Matériel Roulant (Contexte Unifié)

Aucun second moteur WebGL n'est instancié : le bâti, le relief, les voies, les stations et les rames vivent dans la même scène MapLibre, surimpressionnés par l'adaptateur `MapboxOverlay` de `@deck.gl/mapbox`, monté en `interleaved: false`. deck.gl n'expose pas d'export `MapLibreOverlay` distinct ; cet adaptateur est celui utilisé pour l'intégration MapLibre.

### 1. Bâti 3D en `fill-extrusion` (MapLibre GL)
Les bâtiments parisiens sont extrudés par le GPU à partir des géométries vectorielles OpenFreeMap (schéma OpenMapTiles) :
- **Couche** : `building-3d`, type `fill-extrusion`, `source-layer: 'building'`.
- **Seuil d'apparition** : `minzoom: 14`.
- **Visibilité** : la couche est déclarée avec `layout: { visibility: 'none' }`, c'est-à-dire **masquée par défaut**. Elle n'est révélée que par le bouton « Bâti 3D » de l'en-tête. C'est ce même bouton qui, combiné à `maxPitchForZoom`, autorise l'ouverture progressive de l'inclinaison.
- **Rampes de profondeur** :
  ```json
  "fill-extrusion-base":   ["coalesce", ["get", "render_min_height"], 0],
  "fill-extrusion-height": ["coalesce", ["get", "render_height"], 18]
  ```
  Les bâtiments sans hauteur explicite dans OpenStreetMap prennent les 18 mètres du gabarit haussmannien courant (5 à 6 étages).
- **Opacité progressive** — clé de voûte de l'anti-« pop » visuel :

  | Zoom | 14 | 14.5 | 16 | 18 |
  | :--- | :---: | :---: | :---: | :---: |
  | `fill-extrusion-opacity` | 0.00 | 0.28 | 0.70 | 0.70 |

- **Teinte** : `#1C1A19` (équivalent de la surface élevée `--eleve` de `tokens.css`), en harmonie avec l'univers nocturne neutre.
- **Filtre** : `['!=', 'hide_3d', true]`, qui écarte les polygones OSM explicitement exclus de l'extrusion.

### 2. Relief (terrain DEM)
Au chargement du style, la carte monte un `setTerrain({ source: 'terrain', exaggeration: 1.5 })`. L'exagération volontaire (×1,5) rend lisibles les reliefs parisiens — Montmartre, Belleville, Sainte-Geneviève — sans écraser le bâti. La source est un `raster-dem` 256 px plafonné à `maxzoom: 12`.

### 3. Matériel roulant : trois stratégies de rendu
Le choix de la représentation des rames est centralisé dans `web/src/map/train_render_fallback.ts` :

```ts
return modelLayers.length > 0 ? modelLayers : capsuleLayers;
```

Trois familles de couches sont donc possibles, dans cet ordre de priorité :

#### A. Modèles glTF (`train_models_layer.ts`) — zoom > 16
Seule utilisation réelle d'assets glTF du projet :
- `ScenegraphLayer` + `GLBLoader` de `@loaders.gl/gltf`, éclairage `_lighting: 'pbr'`, délai de chargement de 5 s.
- **Seuil** : `TRAIN_MODEL_ZOOM_THRESHOLD = 16`.
- **Deux familles en place** dans `web/public/models/train/` :
  `pneumatic_generic__neutral.glb` → `/models/train/pneumatic_generic__neutral.glb`
  `steel_classic__neutral.glb` → `/models/train/steel_classic__neutral.glb`
- **Désactivation explicite** : `?train-models=0` force `trainModelsEnabled()` à `false` (retour aux capsules). Un mode de diagnostic `?debug=trains` est géré par `capsule_layer.ts`.
- **Un seul maillage instancié par voiture**, répété le long de l'abscisse curviligne ; l'orientation de chaque voiture est calculée sur **la corde des centres de bogies** (`getBogieCentresM(stock)`), pas sur une tangente locale — c'est ce qui supprime le ripage visuel des voitures en courbe.
- **Politique de caméra** : `MODEL_RENDER_POLICY` porte `heightMeasured: false` et `grazingCameraApproved: false` pour les deux familles. Tant que ces drapeaux ne sont pas validés, la vue rasante (`grazingCamera`) fait délibérément renoncer les modèles au profit des capsules.
- Un état de chargement par actif est exposé par `subscribeTrainModelAssets` / `assetStatus`.

#### B. Capsules métriques (`capsule_layer.ts`) — zoom ≥ 9
Stratégie par défaut à moyenne et haute échelle : une tranche géométrique découpée dans l'axe de la voie (`shapes.bin`) et épaissie à la largeur réelle du matériel (`widthUnits: 'meters'`).

```text
   ┌───────────────────────────────────────────────────────────┐
   │  Couche 1 — Halo de contour (plus large que la voie)      │  or si confiance mesurée/bracketed,
   │   ┌────────────┐  ┌────────────┐  ┌────────────┐          │  sinon blanc cassé + pointillés [3,2]
   │   │  Voiture 3 │  │  Voiture 2 │  │  Voiture 1 │          │  Couche 2 — Caisses (neutre, contraste ≥ 3:1)
   │   │ ┌────────┐ │  │ ┌────────┐ │  │ ┌────────┐ │          │  Couche 3 — Toitures (même découpe)
   │   └─┴────────┴─┘  └─┴────────┴─┘  └─┴────────┴─┘          │  Couche 4 — Soufflets d'intercirculation
   │      ══════          ══════          ══════      ▮ Nez    │  Couche 5 — Phares/feux LED + nez
   └───────────────────────────────────────────────────────────┘
                            ▲
              Couche 6 — Étiquette de ligne (pixelOffset [0, -24])
```

1. **Halo de contour (`PathLayer`)** — tranche entière non découpée, plus large que la voie pour garantir une visibilité à 100 %.
   - Rames **mesurées ou encadrées** (`conf === 'measured' | 'bracketed'`) : halo **or** `[255, 215, 0, 255]`.
   - Autres niveaux : halo blanc cassé `[240, 240, 240, 240]`.
   - Rames **théoriques GTFS** (`conf === 'scheduled'`) : `PathStyleExtension` actif, `getDashArray: [3, 2]`, `dashUnits: 'widths'`.
2. **Caisses (`PathLayer`)** — sous-tranches par voiture, largeur métrique exacte (`width_m`). La teinte est choisie algorithmiquement : `getNeutralBodyColor()` parcourt `NEUTRAL_BODY_COLORS` et retient le premier neutre atteignant un **rapport de contraste ≥ 3:1** (`relativeLuminance` + `contrastRatio`) avec la couleur de la ligne. Aucune livrée n'est inventée.
3. **Toitures (`PathLayer`)** — même découpe par voiture que les caisses.
4. **Soufflets (`PathLayer`)** — segments d'intercirculation entre deux caisses consécutives, dérivés de `sliceShape(shape, carTailD, nextCarHeadD)`.
5. **Signalisation lumineuse** — `computeTrainLights()` place deux phares blancs (`[255, 255, 210, 255]`, rayon 0,75 m) et deux feux rouges (`[255, 30, 50, 255]`, rayon 0,70 m), décalés latéralement de `widthM × 0.32` et surélevés de **+3,2 m**. Le nez de rame prend la teinte neutre opposée à celle de la caisse (`getNeutralNoseColor` : caisse claire → `#3B3D3D`, caisse sombre → `#F1EFEA`).
6. **Étiquettes (`TextLayer`)** — pastille de numéro de ligne sur la tête de rame, `getPixelOffset: [0, -24]`.

##### Niveaux de détail (LOD) — valeurs réelles
| Palier | Desktop | Mobile |
| :--- | :--- | :--- |
| Capsules activées (`minCapsuleZoom`) | `z ≥ 9.0` | `z ≥ 9.0` |
| Découpe individuelle des voitures + toitures + nez (`detailedZoom`) | `z ≥ 13.5` | `z ≥ 14.2` |
| Étiquettes de rame (`labelZoom`) | `z ≥ 13.0` | `z ≥ 14.0` |

Le mode mobile est détecté par `innerWidth <= 768` **ou** par le user-agent (`/Android|iPhone|iPad|iPod|Mobile/`). Sur mobile, le nombre de rames découpées est plafonné à **150**, retenues par distance croissante au centre de la carte.

#### C. Marqueurs de repli (`trains_layer.ts`)
Sous `z = 9` (et partout où les capsules ne peuvent pas être construites), on retombe sur `createTrainsLayers()`, un simple `ScatterplotLayer` (`TrainMarker`). Il porte les **quatre niveaux de confiance** du module de recalage temps réel :
- `measured` — or `#C9A227` ;
- `bracketed`, `extrapolated`, `scheduled` — nuances d'opale décroissantes.
Le drapeau `isLowZoom = zoom < 11.5 && !selectedLineId` réduit encore le bruit de fond à bas zoom.

### 4. Pipeline de Composition & Ordre de Rendu
- L'overlay deck.gl est instancié avec `interleaved: false`.
- Les voies de métro et les rames actives sont donc dessinées en surimpression sur le bâti extrudé MapLibre, ce qui évite tout masquage ou clipping visuel des tunnels et des voies en tranchée.
- Les effets d'éclairage (`createTrainModelSpikeLighting()`) ne sont montés que si les modèles glTF ou le mode diagnostic sont effectivement actifs.
- **Il n'existe plus de barre de navigation monuments (`#studio-nav-bar`)** : elle a été supprimée en même temps que le Studio Three.js. La caméra n'est plus pilotée que par le cadrage réseau, le bouton « Bâti 3D », la sélection de ligne et le clic sur une rame ou une station.
