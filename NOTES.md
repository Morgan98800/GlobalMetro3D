# NOTES — Inventaire, Filet de Sécurité & Audit des Chemins (Phase 0)

Document de référence produit dans le cadre de la Phase 0 de restructuration multi-villes et d'extension vers Montréal (STM).

---

## 1. Arborescence du dépôt (profondeur 3, hors `node_modules`, `.git`, `.venv` et binaires générés)

```
paris-subway-3d/
├── DESIGN_AUDIT.md
├── MOBILE_AUDIT.md
├── README.md
├── assets-src/
│   └── models/
│       └── train/
│           ├── generated-index.json
│           └── [13 fichiers .glb - modèles 3D métro et RER]
├── audit/
│   └── design/
│       ├── before/
│       ├── harness-artifact/
│       └── [captures et métriques de contraste/charte]
├── data/
│   ├── model-assets-manifest.json
│   ├── rolling-stock.json
│   ├── sections-overrides.json
│   ├── processed/
│   │   ├── control_network.geojson
│   │   ├── lines.json
│   │   ├── network.sqlite (binaire GTFS projeté)
│   │   ├── projection_metrics.json
│   │   ├── rer_lines.json
│   │   ├── rer_lines_meta.json
│   │   ├── rolling-stock.json
│   │   ├── sections.json
│   │   ├── shapes.bin (binaire SHP2)
│   │   ├── station-rankings.json
│   │   └── stations.json
│   └── raw/
│       └── IDFM-gtfs.zip (archive GTFS brute)
├── docs/
│   ├── 3D_RENDERING.md
│   ├── ARCHITECTURE.md
│   ├── CHARTE-intERVALLE-sprague.md
│   ├── DATA_PIPELINE.md
│   ├── DEPLOYMENT_AND_OPS.md
│   ├── README_texture_rer.md
│   ├── REALTIME_PRIM.md
│   ├── SIMULATION_ENGINE.md
│   ├── UI_AND_ROUTING.md
│   ├── redesign/
│   │   └── DESIGN_SYSTEM.md
│   └── reseau_audit_geometrique.json
├── engine/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── kinematics.ts
│   │   ├── loader.ts
│   │   ├── rt_siri.ts
│   │   └── server.ts
│   └── tests/
│       ├── audit_controls.ts
│       ├── fps_performance_benchmark.ts
│       ├── prim_relay_verification.ts
│       ├── rt_matching_verification.ts
│       ├── simulation.test.ts
│       └── verify_all_rer_matching.test.ts
├── ingest/
│   ├── requirements.txt
│   ├── write_shapes_v2.py
│   ├── src/
│   │   ├── build_artifacts.py
│   │   ├── build_rer_schedule.py
│   │   ├── build_rer_shapes.py
│   │   ├── export_geojson.py
│   │   ├── fetch.py
│   │   ├── filter_metro.py
│   │   ├── main.py
│   │   ├── project.py
│   │   ├── project_train_orthos.py
│   │   ├── rer_artifacts.py
│   │   ├── resample.py
│   │   └── sections.py
│   └── tests/
│       ├── test_acceptance_phase_a.py
│       ├── test_acceptance_phase_b_rer.py
│       ├── test_sections.py
│       ├── test_train_asset_manifest.py
│       └── test_train_box_models.py
├── netlify/
│   └── functions/
│       ├── prim_delays.ts
│       └── prim_relay.ts
├── netlify.toml
├── package.json
├── package-lock.json
├── packages/
│   └── shared/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── constants.ts
│           ├── index.ts
│           ├── lines.ts
│           ├── protocol.ts
│           └── train.ts
├── pnpm-workspace.yaml
├── scripts/
│   ├── add_rer_livery.py
│   ├── build_line_ladders.py
│   ├── build_rer_box_models.py
│   ├── build_sections.py
│   ├── build_station_rankings.py
│   ├── build_train_asset_manifest.py
│   ├── build_train_box_models.py
│   ├── check_train_box_models.py
│   ├── deploy_netlify.py
│   ├── export_landmarks_gltf.mjs
│   ├── fix_l7_kinks.py
│   ├── generate_geo_audit.py
│   ├── generate_tracks_json.py
│   ├── inspect_glb.py
│   ├── publish_train_models.py
│   ├── reconcile_schedule_distances.mjs
│   └── render_glb.py
├── tests/
│   ├── fixtures/
│   │   ├── paris-build.json
│   │   └── paris-snapshot.json
│   ├── paris-snapshot.test.ts
│   ├── snapshot_generator.ts
│   └── verify_build_footprint.mjs
└── web/
    ├── index.html
    ├── methode.html
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── public/
    │   ├── _headers
    │   ├── _redirects
    │   ├── og-image.png
    │   ├── og-image.svg
    │   ├── sections-report.html
    │   ├── data/
    │   │   ├── line_ladders.json
    │   │   ├── lines.json
    │   │   ├── model-assets-manifest.json
    │   │   ├── prim_delays.json
    │   │   ├── rer_lines.json
    │   │   ├── rer_lines_meta.json
    │   │   ├── rer_schedule.json
    │   │   ├── rer_shapes.bin (binaire SHP2)
    │   │   ├── rer_shapes.bin.br (binaire compressé)
    │   │   ├── rolling-stock.json
    │   │   ├── schedule.json
    │   │   ├── sections.json
    │   │   ├── shapes.bin (binaire SHP2)
    │   │   ├── shapes.bin.br (binaire compressé)
    │   │   ├── station-rankings.json
    │   │   ├── stations.json
    │   │   └── tracks.json
    │   └── models/
    │       └── train/ [modèles .glb copiés pour le client]
    └── src/
        ├── main.ts
        ├── dev/
        ├── map/
        │   ├── capsule_layer.ts
        │   ├── deck_overlay.ts
        │   ├── follow_camera.ts
        │   ├── labels_layer.ts
        │   ├── maplibre.ts
        │   ├── platforms_layer.ts
        │   ├── rounded_path.ts
        │   ├── train_model_geometry.ts
        │   ├── train_models_layer.ts
        │   ├── train_render_fallback.ts
        │   ├── trains_layer.ts
        │   └── vector_style.ts
        ├── net/
        │   └── ws_client.ts
        ├── sim/
        │   ├── browser_engine.ts
        │   ├── kinematics.ts
        │   ├── paris_time.ts
        │   ├── prim_client.ts
        │   ├── rolling_stock.ts
        │   ├── rt_matching.ts
        │   ├── shapes_loader.ts
        │   └── shapes.ts
        ├── state/
        │   └── router.ts
        ├── styles/
        │   ├── chrome.css
        │   ├── main.css
        │   ├── motion.css
        │   ├── tokens.css
        │   └── typography.css
        └── ui/
            ├── dock.ts
            ├── header.ts
            ├── line_badge.ts
            ├── search_bar.ts
            └── station_ladder.ts
```

---

## 2. Modules du moteur : Entrées & Sorties (une ligne par module)

### Côté Client (`web/src/sim/`)
- **`shapes_loader.ts`** : Entrée : URL ou `ArrayBuffer` du fichier binaire `shapes.bin` (format SHP2) ; Sortie : `Map<string, Shape>` associant identifiant de tracé et coordonnées décodées, distances cumulées et longueur totale.
- **`kinematics.ts`** : Entrée : Données de course `TripData`, géométrie `Shape`, seconde de service, retard (s) et métadonnées de ligne ; Sortie : Objet `TrainMarker | null` contenant coordonnées interpolées, gisement lissé, vitesse et station suivante.
- **`paris_time.ts`** : Entrée : Instance `Date` UTC et liste de fenêtres de courses `TripWindow` ; Sortie : Candidats de journée de service avec secondes depuis minuit et tableau des courses actives `ActiveTrip<T>[]`.
- **`prim_client.ts`** : Entrée : URL de relais ou de repli (`/api/prim`, `/data/prim_delays.json`) et cadence de rafraîchissement ; Sortie : Snapshot temps réel `PrimSnapshot` et retard agrégé en secondes par ligne et par direction.
- **`rt_matching.ts`** : Entrée : Courses théoriques `SchedTrip`, courses temps réel estimées `EstimatedVehicleJourneyData` et instant courant ; Sortie : Appariement d'horaires `Timeline`, détection des trains fantômes et rames avec indice de confiance (`scheduled`, `bracketed`, `rt`).
- **`rolling_stock.ts`** : Entrée : URL du catalogue `rolling-stock.json` ; Sortie : Base `RollingStockDatabase` indexée par identifiant de matériel et association modèle/longueur/voitures pour chaque ligne.
- **`browser_engine.ts`** : Entrée : Lignes `LineMetadata`, tracés `ShapeIndex` et requêtes de contrôle utilisateur (scrubbing, temps réel) ; Sortie : Boucle 1 Hz et RAF émettant les collections de rames actives `TrainMarker[]` vers deck.gl et le dock.
- **`shapes.ts`** : Entrée : URL vers `shapes.bin` (format hérité v1/v2) ; Sortie : `Map<string, ShapeEntry>` pour rétrocompatibilité des premiers bancs d'essai.

### Côté Serveur / Node (`engine/src/`)
- **`loader.ts`** : Entrée : Répertoire racine des données traitées (`lines.json`, `shapes.bin`, `schedule.json`) ; Sortie : Collections en mémoire des tracés indexés et sélecteur de courses actives par date/heure.
- **`kinematics.ts`** : Entrée : Données de course, tracé, instant en secondes et carte du matériel roulant ; Sortie : État cinématique d'une rame (coordonnées WGS84, vitesse, cap).
- **`rt_siri.ts`** : Entrée : Clé API PRIM, identifiants de lignes et intervalle de scrutation ; Sortie : Polling HTTP SIRI-Lite EstimatedTimetable et retards moyens par ligne.
- **`server.ts`** : Entrée : Signaux du loader, de la cinématique et du client PRIM ; Sortie : Serveur HTTP (`/health`) et serveur WebSocket diffusant les snapshots et deltas de rames aux clients connectés.

---

## 3. Constantes parisiennes codées en dur

### Identifiants et couleurs des lignes
- **Métro (16 lignes)** :
  - Ligne 1 : `IDFM:C01371` · `#FFCE00` (texte `#000000`)
  - Ligne 2 : `IDFM:C01372` · `#0064B0` (texte `#FFFFFF`)
  - Ligne 3 : `IDFM:C01373` · `#9F9825` (texte `#FFFFFF`)
  - Ligne 3bis : `IDFM:C01386` · `#98D4E2` (texte `#000000`)
  - Ligne 4 : `IDFM:C01374` · `#C235B5` (texte `#FFFFFF`)
  - Ligne 5 : `IDFM:C01375` · `#FF7E2E` (texte `#FFFFFF`)
  - Ligne 6 : `IDFM:C01376` · `#6ECA97` (texte `#000000`)
  - Ligne 7 : `IDFM:C01377` · `#FA9ABA` (texte `#000000`)
  - Ligne 7bis : `IDFM:C01387` · `#6ECA97` (texte `#000000`)
  - Ligne 8 : `IDFM:C01378` · `#E19BDF` (texte `#000000`)
  - Ligne 9 : `IDFM:C01379` · `#B6BD00` (texte `#000000`)
  - Ligne 10 : `IDFM:C01380` · `#C9910D` (texte `#FFFFFF`)
  - Ligne 11 : `IDFM:C01381` · `#704B1C` (texte `#FFFFFF`)
  - Ligne 12 : `IDFM:C01382` · `#007852` (texte `#FFFFFF`)
  - Ligne 13 : `IDFM:C01383` · `#6EC4E8` (texte `#000000`)
  - Ligne 14 : `IDFM:C01384` · `#62259D` (texte `#FFFFFF`)
- **RER (5 lignes)** :
  - RER A : `IDFM:C01742` · `#EB2132` (texte `#FFFFFF`)
  - RER B : `IDFM:C01743` · `#5091CB` (texte `#FFFFFF`)
  - RER C : `IDFM:C01727` · `#FFCC30` (texte `#000000`)
  - RER D : `IDFM:C01728` · `#008B5B` (texte `#FFFFFF`)
  - RER E : `IDFM:C01729` · `#B94E9A` (texte `#FFFFFF`)

### Fuseau horaire
- `Europe/Paris` (codé en dur dans `web/src/sim/paris_time.ts`, `web/src/ui/header.ts`, `netlify/functions/prim_relay.ts`, `engine/src/server.ts`).

### Emprises et repères géographiques
- **Centre de la carte** : `PARIS_CENTER = [2.3488, 48.8534]` (`packages/shared/src/constants.ts`).
- **Paramètres de vue initiale** : `DEFAULT_ZOOM = 11.8`, `DEFAULT_PITCH = 30`, `DEFAULT_BEARING = -15`.
- **Filtres de voies dans le style vectoriel** : `Boulevard périphérique`, `Boulevard Périphérique`, `BP`, `Périphérique` (`web/src/map/vector_style.ts`).
- **Noms de couches vectorielles** : `paris-woods`, `paris-parks`, `paris-water`, `paris-waterways`, `paris-ring-road`, `paris-major-axes` (`web/src/map/vector_style.ts`, `web/src/map/maplibre.ts`).

### Plages horaires de service
- Plage nominale : 05:15 à 02:30 heure locale (`isParisMetroServiceHours` dans `netlify/functions/prim_relay.ts`).
- Seuil de service de nuit : heure de coupure à 05:00 (`web/src/sim/paris_time.ts`).

### Libellés d'interface
- Horloge : `"Heure de Paris"`.
- Menu : `"Records du réseau"`, `"Bâti 3D"`, `"Mode clair"`, `"À propos & Méthode"`.
- Badges de suivi : `"recalé"`, `"recalé · à l'instant"`, `"recalé · il y a X min"`, `"temps réel indisponible"`, `"théorique"`.
- Infobulles d'attribution et d'état : `"Suivi cinématique temps réel recalé sur les estimations PRIM (Île-de-France Mobilités)."`, `"Service temps réel PRIM indisponible : repli sur les horaires théoriques GTFS."`, `"Mode nominal : circulation calculée sur la grille horaire officielle GTFS."`.
- Groupes du dock : `"Métro"` et `"RER"`.

### URL de données servies
- `/data/lines.json`
- `/data/stations.json`
- `/data/tracks.json`
- `/data/line_ladders.json`
- `/data/rer_lines.json`
- `/data/rer_lines_meta.json`
- `/data/station-rankings.json`
- `/data/rolling-stock.json`
- `/data/shapes.bin` & `/data/shapes.bin.br`
- `/data/schedule.json`
- `/data/rer_shapes.bin` & `/data/rer_shapes.bin.br`
- `/data/rer_schedule.json`
- `/data/prim_delays.json`
- `/models/train/*.glb`
- `/api/prim`, `/api/prim_delays`

---

## 4. Variables d'environnement & Fonctions Netlify

### Variables d'environnement
- `PRIM_API_KEY` : Clé d'API Île-de-France Mobilités pour interroger l'API PRIM SIRI-Lite.
- `PRIM_POLL_INTERVAL_SECONDS` : Intervalle de scrutation (défaut : `180` secondes / 3 min).
- `PORT` : Port d'écoute du serveur de simulation autonome (défaut : `4000`).
- `HOST` : Adresse d'écoute (défaut : `0.0.0.0`).
- `RT_POLL_BUDGET_PER_MIN` : Quota d'appels par minute pour le relais PRIM (défaut : `20`).

### Fonctions Netlify déployées
- **`prim_relay`** (`netlify/functions/prim_relay.ts`) :
  - Type : Fonction planifiée (`schedule = "*/3 * * * *"` dans `netlify.toml`).
  - Rôle : Interroge les 21 lignes de métro et RER sur l'API PRIM SIRI-Lite, calcule les retards, extrait les messages d'état de trafic, et publie le snapshot.
  - Endpoints exposés par redirection : `/api/prim` et `/.netlify/functions/prim_relay`.
- **`prim_delays`** (`netlify/functions/prim_delays.ts`) :
  - Type : Endpoint de compatibilité serverless re-exportant le handler de `prim_relay`.
  - Endpoints exposés : `/api/prim_delays` et `/.netlify/functions/prim_delays`.

---

## 5. Recensement des manipulations de dates et heures

| Fichier | Emplacement | Opération effectuée | Bibliothèque utilisée |
|---|---|---|---|
| `web/src/sim/paris_time.ts` | l. 15-24 | Découpage des composantes de date et heure civiles selon le fuseau `Europe/Paris` | `Intl.DateTimeFormat` (natif) |
| `web/src/sim/paris_time.ts` | l. 56-61 | Décalage calendaire UTC d'un jour (`shiftDate`) pour évaluer la veille | `Date.UTC`, `Date` (natif) |
| `web/src/sim/paris_time.ts` | l. 68-79 | Calcul des secondes depuis minuit civil et détection du franchissement de minuit ($t > 86400\text{ s}$) | Natif |
| `web/src/ui/header.ts` | l. 253-272 | Formatage de l'horloge LED topbar (`Europe/Paris`, 2 chiffres heure/minute) et calcul du délai de calage à la seconde | `Intl.DateTimeFormat`, `new Date()`, `Date.now()` (natif) |
| `web/src/sim/prim_client.ts` | l. 38-51 | Conversion d'un horodatage ISO 8601 en secondes de service GTFS (`isoToServiceSeconds`) | `new Date(isoStr)`, `Date.UTC()` (natif) |
| `web/src/sim/prim_client.ts` | l. 116, 172 | Calcul de la fraîcheur du snapshot temps réel (`ageMs = Date.now() - json.timestamp`) | `Date.now()` (natif) |
| `web/src/sim/browser_engine.ts` | l. 170, 271 | Horodatage du calcul de distance cumulée et initialisation du chronomètre | `parisClock()`, `new Date()` (natif) |
| `netlify/functions/prim_relay.ts` | l. 87-105 | Vérification des heures de service du métro (05:15 à 02:30) en heure locale de Paris | `Date.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris' })` |
| `netlify/functions/prim_relay.ts` | l. 145 | Calcul du retard entre `expectedTime` et `aimedTime` SIRI en secondes | `new Date(expectedTime).getTime() - new Date(aimedTime).getTime()` |
| `netlify/functions/prim_relay.ts` | l. 369, 532 | Calcul de validité du snapshot (`producedAt`, `validUntil = now + 180000`) | `Date.now()`, `new Date().toISOString()` |
| `engine/src/server.ts` | l. 82-95 | Extraction de `dateStr` (YYYYMMDD), `dayOfWeek` et `secondsSinceMidnight` à Paris | `now.toLocaleString('en-US', { timeZone: 'Europe/Paris' })`, `new Date()` |
| `engine/src/rt_siri.ts` | l. 63-64 | Calcul des retards SIRI | `new Date(expStr).getTime()` |

**Bibliothèque employée** : **Aucune bibliothèque tierce** (pas de Luxon, Moment, date-fns ni Day.js). Le code actuel utilise exclusivement les API natives JavaScript `Date` et `Intl.DateTimeFormat`.

---

## 6. Schéma exact des artefacts d'ingestion (contrat d'interface pour Montréal)

### 6.1 `schedule.json` (et `rer_schedule.json`)
Structure JSON compactée optimisée pour le transfert réseau :

```json
{
  "stations": [
    "Charles de Gaulle - Étoile",
    "Nation",
    "Pointe du Lac"
  ],
  "trips": [
    [
      "trip_id",          // [0] string  : identifiant déterministe unique de la course
      "route_id",         // [1] string  : identifiant de la ligne (ex: "IDFM:C01378")
      1,                  // [2] number  : direction (0 ou 1)
      "shape_id",         // [3] string  : identifiant du tracé SHP2 associé
      19319,              // [4] number  : t0, départ au 1er arrêt (secondes depuis minuit de service)
      22045,              // [5] number  : t1, arrivée au dernier arrêt (secondes depuis minuit de service)
      2,                  // [6] number  : destIdx, index du terminus dans le tableau "stations"
      [                   // [7] array   : séquence chronologique ordonnée des arrêts
        [
          19319,          // [0] number : heure d'arrivée (secondes depuis minuit de service)
          19319,          // [1] number : heure de départ (secondes depuis minuit de service)
          0.0,            // [2] number : distance cumulée le long du tracé en mètres
          0               // [3] number : stopIdx, index de la station dans le tableau "stations"
        ],
        [
          19402,
          19416,
          765.6,
          1
        ]
      ]
    ]
  ]
}
```

### 6.2 `shapes.bin` (et `rer_shapes.bin`) — Format binaire SHP2
Format binaire quantifié 16 bits avec déduplication de la distance et compression des deltas :

#### En-tête global (8 octets, Little-Endian)
- `magic` (4 octets) : `0x53485032` (ASCII `'SHP2'`)
- `version` (uint16, 2 octets) : `2`
- `shapeCount` (uint16, 2 octets) : Nombre de tracés encodés dans le fichier

#### Enregistrement par tracé (aligné sur 4 octets)
1. `idLen` (uint16, 2 octets) : Longueur en octets de l'identifiant du tracé (UTF-8)
2. `idBytes` (`idLen` octets) : Chaîne UTF-8 de l'identifiant (ex: `"IDFM:shp_1_109"`)
3. `padding` (0 à 3 octets) : Remplissage pour aligner l'offset sur un multiple de 4 octets : `(4 - (offset % 4)) % 4`
4. `pointCount` (uint32, 4 octets) : Nombre total de points dans le tracé ($N$)
5. `step` (float32, 4 octets) : Pas régulier de rééchantillonnage en mètres (ex: `10.0`)
6. `tailLength` (float32, 4 octets) : Longueur en mètres du dernier segment (borne $[0, \text{step}[$)
7. `lng0` (int32, 4 octets) : Longitude du premier point quantifiée en échelle $10^{-7}$ degré (`Math.round(lng * 1e7)`)
8. `lat0` (int32, 4 octets) : Latitude du premier point quantifiée en échelle $10^{-7}$ degré (`Math.round(lat * 1e7)`)
9. **Deltas successifs** ($N - 1$ paires de deltas, soit $(N - 1) \times 4$ octets) :
   - Pour chaque point $i$ de $1$ à $N - 1$ :
     - `dLng` (int16, 2 octets) : $\Delta \text{lng} = \text{lng}_i - \text{lng}_{i-1}$ (en unités $10^{-7}$ degré)
     - `dLat` (int16, 2 octets) : $\Delta \text{lat} = \text{lat}_i - \text{lat}_{i-1}$ (en unités $10^{-7}$ degré)

#### Règle de reconstitution de la distance cumulée :
$$\text{dist}[0] = 0$$
$$\text{dist}[i] = i \times \text{step} \quad (1 \le i < N - 1)$$
$$\text{dist}[N - 1] = (N - 2) \times \text{step} + \text{tailLength}$$

---

## 7. Audit des chemins (§1.4)

### 7.1 `import()` dynamique
- `scripts/export_landmarks_gltf.mjs:30-32` :
  - `await import('three')`
  - `await import('three/addons/exporters/GLTFExporter.js')`
  - `await import('../web/src/three/landmarks.ts')`
- `web/src/map/train_models_layer.test.ts:48` :
  - `await import('./follow_camera.ts')`

### 7.2 Chemins construits par concaténation ou gabarit
- `web/src/main.ts:18` : `const dataUrl = (path: string) => ${path}?v=${DATA_REVISION};`
- `web/src/sim/browser_engine.ts:4` : `const dataUrl = (path: string) => ${path}?v=${DATA_REVISION};`
- `web/src/map/vector_style.ts:11` : `'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'`
- `engine/src/server.ts:15` : `path.resolve(__dirname, '../../data/processed')`
- `scripts/publish_train_models.py:11-12` : `ROOT / "assets-src" / "models" / "train"`, `ROOT / "web" / "public" / "models" / "train"`
- `scripts/build_train_asset_manifest.py:100` : `web/public/models/train/{name}.glb`

### 7.3 `fetch` vers des chemins relatifs ou racine
- Dans `web/src/main.ts` :
  - `fetch(dataUrl('/data/lines.json'))`
  - `fetch(dataUrl('/data/stations.json'))`
  - `fetch(dataUrl('/data/tracks.json'))`
  - `fetch(dataUrl('/data/line_ladders.json'))`
  - `fetch(dataUrl('/data/rer_lines.json'))`
  - `fetch(dataUrl('/data/station-rankings.json'))`
  - `loadRollingStock('/data/rolling-stock.json')`
  - `loadShapes(dataUrl('/data/shapes.bin'))`
- Dans `web/src/sim/browser_engine.ts` :
  - `loadShapes(dataUrl('/data/shapes.bin'))`
  - `fetch(dataUrl('/data/schedule.json'))`
  - `loadShapes(dataUrl('/data/rer_shapes.bin'))`
  - `fetch(dataUrl('/data/rer_schedule.json'))`
- Dans `web/src/sim/prim_client.ts` :
  - `fetch('/api/prim')`, avec replis sur `/.netlify/functions/prim_relay`, `/.netlify/functions/prim_delays`, `/data/prim_delays.json`
- Dans `web/src/map/train_models_layer.ts` :
  - `FAMILY_URLS` :
    - `pneumatic_generic` : `'/models/train/pneumatic_generic__neutral.glb'`
    - `steel_classic` : `'/models/train/steel_classic__neutral.glb'`
    - `rer_generic_A` : `'/models/train/rer_generic_A__neutral.glb'`
    - `rer_generic_B` : `'/models/train/rer_generic_B__neutral.glb'`
    - `rer_generic_C` : `'/models/train/rer_generic_C__neutral.glb'`
    - `rer_generic_D` : `'/models/train/rer_generic_D__neutral.glb'`
    - `rer_generic_E` : `'/models/train/rer_generic_E__neutral.glb'`

### 7.4 Globs
- `web/tsconfig.json` :
  - `"include": ["src"]`
  - `"exclude": ["src/**/*.test.ts"]`
- `scripts/publish_train_models.py` : `source_dir.glob("*.glb")`
- `scripts/build_train_asset_manifest.py` : `source_dir.glob("*.glb")`
- `ingest/src/rer_artifacts.py` : `glob.glob(...)` sur les shapes GTFS
- `.gitignore` :
  - `web/public/models/*.glb`
  - `web/public/diagnostic-*.png`
  - `web/public/step*.png`
  - `web/public/phase*.png`

### 7.5 Chemins en dur dans les fichiers de configuration
- **`netlify.toml`** :
  - `publish = "web/dist"`
  - `functions = "netlify/functions"`
  - `[functions."prim_relay"]`
  - `[[redirects]] from = "/api/prim" to = "/.netlify/functions/prim_relay"`
  - `[[redirects]] from = "/api/prim_delays" to = "/.netlify/functions/prim_relay"`
  - `[[redirects]] from = "/*" to = "/index.html"`
- **`package.json` (racine)** :
  - `workspaces: ["packages/*", "web", "engine"]`
  - `build:web: python3 scripts/publish_train_models.py && python3 scripts/build_train_asset_manifest.py --output data/model-assets-manifest.json --output web/public/data/model-assets-manifest.json && npm --workspace=web run build`
- **`web/vite.config.ts`** :
  - `envDir: '../'`
  - `alias: { '@paris-subway/shared': path.resolve(__dirname, '../packages/shared/src') }`
  - `rollupOptions.input: { main: path.resolve(__dirname, 'index.html'), methode: path.resolve(__dirname, 'methode.html') }`
  - `server.middlewares`: filtrage sur `request.url?.startsWith('/data/')`
- **`web/public/_redirects`** :
  - `/api/prim /.netlify/functions/prim_relay 200`
  - `/methode /methode.html 200`
  - `/* /index.html 200`
- **`web/public/_headers`** :
  - Directive `/data/*` avec `Cache-Control: public, max-age=0, must-revalidate`

### 7.6 Chemins d'assets dans HTML / CSS
- **`web/index.html`** :
  - `<link rel="stylesheet" href="/src/styles/tokens.css" />`
  - `<link rel="stylesheet" href="/src/styles/typography.css" />`
  - `<link rel="stylesheet" href="/src/styles/motion.css" />`
  - `<link rel="stylesheet" href="/src/styles/main.css" />`
  - `<script type="module" src="/src/main.ts"></script>`
  - Image sociale : `https://parisian3dsubway.netlify.app/og-image.png`
- **`web/methode.html`** :
  - `<link rel="stylesheet" href="/src/styles/tokens.css" />`
- **`web/src/styles/main.css`** :
  - Filtre SVG bruit inline dans `background-image: url("data:image/svg+xml,...")` (aucun asset externe référencé par `url()`).

### 7.7 Références à `public/` ou répertoires de données
- `web/public/data/` : répertoire de service de l'ensemble des 17 artefacts GTFS et dérivés.
- `web/public/models/train/` : répertoire de service des modèles 3D binaires glTF.
- `data/processed/` : miroir hors-ligne et artefacts générés par le pipeline Python d'ingestion.

---

## 8. Phase 2 — Reconnaissance du GTFS Montréalais (STM)

### 8.1 Source et Métadonnées
- **URL officielle du GTFS** : `https://www.stm.info/sites/default/files/gtfs/gtfs_stm.zip`
- **Portail développeurs STM** : `https://www.stm.info/fr/a-propos/developpeurs`
- **Version du flux (`feed_info.txt`)** : `20260805110000_26S`
- **Période de validité** : du 15 juin 2026 au 25 octobre 2026
- **Date de publication** : 11 août 2026 (prise d'effet des horaires au 24 août 2026)

---

### 8.2 Réponses chiffrées aux onze questions

1. **Combien de lignes ?**
   - **4 lignes** (avec filtre strict `route_type = 1`).
   - Ligne 1 : Verte (`route_id: "1"`, `route_color: "00B300"`, `route_text_color: "FFFFFF"`, Angrignon $\leftrightarrow$ Honoré-Beaugrand)
   - Ligne 2 : Orange (`route_id: "2"`, `route_color: "D95700"`, `route_text_color: "FFFFFF"`, Côte-Vertu $\leftrightarrow$ Montmorency)
   - Ligne 4 : Jaune (`route_id: "4"`, `route_color: "FFD900"`, `route_text_color: "000000"`, Berri-UQAM $\leftrightarrow$ Longueuil–Université-de-Sherbrooke)
   - Ligne 5 : Bleue (`route_id: "5"`, `route_color: "0095E6"`, `route_text_color: "FFFFFF"`, Snowdon $\leftrightarrow$ Saint-Michel)
   *(La ligne 3 n'a jamais été construite dans l'histoire du réseau montréalais).*

2. **Combien de stations ?**
   - **72 quais/arrêts physiques bruts** (`stop_id`) dans `stop_times.txt`.
   - **68 stations uniques dédupliquées** par `parent_station` (`STATION_M...`) et par nom nettoyé.
   - Les 4 stations de correspondance expliquent l'écart ($68 - 4 + 8 = 72$) :
     - Station Lionel-Groulx (`STATION_M132`, lignes 1 et 2 sur le même quai `36`)
     - Station Snowdon (`STATION_M236`, lignes 2 et 5, quais `9999492` et `9999495`)
     - Station Jean-Talon (`STATION_M272`, lignes 2 et 5, quais `9999052` et `9999055`)
     - Station Berri-UQAM (`STATION_M146`, lignes 1, 2 et 4, quais `9999111`, `9999112`, `9999114`).
   - Répartition par ligne : Ligne 1 (27 arrêts), Ligne 2 (31 arrêts), Ligne 4 (3 arrêts), Ligne 5 (12 arrêts).

3. **Combien de kilomètres de tracé ?**
   - Longueur cumulée commerciale des 4 lignes : **61,65 km** (mesure euclidienne station-à-station issue de `shapes.txt`).
     - Ligne 1 (Verte) : 20,07 km (27 sommets)
     - Ligne 2 (Orange) : 28,26 km (31 sommets)
     - Ligne 4 (Jaune) : 3,82 km (3 sommets)
     - Ligne 5 (Bleue) : 9,50 km (12 sommets)
   - Écart avec les ~69-71 km réels : `shapes.txt` ne fournit qu'un seul point par station (cordes droites inter-stations sans sommets de courbure), ce qui sous-estime légèrement le tracé sinueux réel en tunnel.

4. **`frequencies.txt` est-il présent, et couvre-t-il les quatre lignes ?**
   - **NON : `frequencies.txt` est TOTALEMENT ABSENT du flux officiel STM actuel (2026)**.
   - La STM a abandonné la compression par fréquences pour publier directement un horaire détaillé complet :
   - `trips.txt` contient **12 668 courses de métro** planifiées avec `stop_times.txt` horodaté à la seconde.
   - Pour un jour de semaine type d'automne (période 26S) : **1 654 courses** planifiées par jour (Ligne 1 : 444, Ligne 2 : 552, Ligne 4 : 330, Ligne 5 : 328).

5. **Quelle est la valeur de `exact_times` ?**
   - **Absent** (car `frequencies.txt` est absent).
   - Les horaires dans `stop_times.txt` sont des horaires absolus déterministes (départs planifiés précis à la seconde près). Le produit n'a donc pas à synthétiser des heures approximatives : le flux STM fournit désormais des courses réelles fixes, exactement comme Paris IDFM.

6. **Les blocs de `frequencies.txt` se chevauchent-ils pour un même `trip_id` ?**
   - **0 chevauchement** (pas de fichier `frequencies.txt`).
   - Dans les courses planifiées `trips.txt` / `stop_times.txt`, 12 651 départs distincts sur les terminus, pour seulement 17 doublons ponctuels (courses d'injection ou services partiels).

7. **Quelle est l'amplitude horaire couverte ? Des heures supérieures à 24:00:00 apparaissent-elles ?**
   - **Oui : 10 636 enregistrements de `stop_times.txt` dépassent 24:00:00** (fins de service entre 24h00 et 01h53 du matin).
   - Amplitude par ligne :
     - Ligne 1 : 05:30:00 $\to$ 25:48:00 (01h48 le lendemain)
     - Ligne 2 : 05:24:00 $\to$ 25:53:00 (01h53 le lendemain)
     - Ligne 4 : 05:30:00 $\to$ 25:36:00 (01h36 le lendemain)
     - Ligne 5 : 05:30:00 $\to$ 25:31:00 (01h31 le lendemain)

8. **Quelle est la forme des `service_id` et du calendrier ?**
   - Structure standard GTFS (`calendar.txt` + `calendar_dates.txt`).
   - `service_id` sémantiques : `26S-GLOBAUX-01-S` (automne semaine), `26S-GLOBAUX-01-A` (samedi), `26S-GLOBAUX-01-I` (dimanche), suffixes `F1`/`F2` pour jours fériés (Fête du travail, Action de grâce).
   - Parfaitement compatible avec la logique du moteur parisien (`serviceCandidates` et `activeTrips`).

9. **Les `route_color` sont-ils présents ?**
   - Ligne 1 (Verte) : `#00B300` (texte `#FFFFFF`)
   - Ligne 2 (Orange) : `#D95700` (texte `#FFFFFF`)
   - Ligne 4 (Jaune) : `#FFD900` (texte `#000000`)
   - Ligne 5 (Bleue) : `#0095E6` (texte `#FFFFFF`)

10. **Quelle est la qualité des `shapes.txt` ?**
    - 11 tracés au total couvrant les 4 lignes dans les deux directions (plus missions partielles Henri-Bourassa sur ligne 2).
    - **Géométrie très grossière** : exactement 1 sommet par station (27 pts sur L1, 31 sur L2, 3 sur L4, 12 sur L5).
    - Tracé en cordes droites inter-stations, sans courbure souterraine.
    - Conséquence pour Phase 4 : pour un rendu 3D de qualité, il faudra projeter et interpoler les tracés avec les voies souterraines OpenStreetMap (comme fait pour Paris).

11. **Quels champs le pipeline parisien consomme-t-il qui seraient absents ou différents ici ?**
    - **Identifiants de lignes** : `1`, `2`, `4`, `5` (STM) vs URNs IDFM `IDFM:C01371` (Paris).
    - **Préfixe des stations** : Toutes les stations STM débutent par `Station ` (`Station Berri-UQAM`), à nettoyer pour les badges et ladders.
    - **Structure de `shapes.txt`** : `shape_dist_traveled` est absent chez STM (présent chez IDFM). Le rééchantillonnage métrique maison (`resample.py` / `equirectDistM`) doit recalculer la distance cumulée.
    - **Absence de réseau RER/train** : Le GTFS STM est strictement métro + bus (les trains de banlieue Exo et le REM font l'objet de flux ARTM distincts).
    - **Flux temps réel** : Paris utilise PRIM (SIRI-Lite JSON/XML). Montréal utilise GTFS-Realtime (Protocol Buffers) et l'API i3.

---

### 8.3 Contrôle de vraisemblance (Mardi 8h30 heure de Montréal)
- **72 rames actives simultanément** à 08h30 heure locale (EDT / UTC-4) un mardi type d'automne (15 septembre 2026) :
  - Ligne 1 : **27 rames**
  - Ligne 2 : **32 rames**
  - Ligne 4 : **4 rames**
  - Ligne 5 : **9 rames**
- Flotte parfaitement cohérente avec la réalité d'exploitation de la STM en heure de pointe du matin (ordre de grandeur de plusieurs dizaines de rames).

---

### 8.4 Encodage
- Accents et apostrophes UTF-8 validés : `Station Lionel-Groulx`, `Station Côte-des-Neiges`, `Station Assomption` (note : le métro s'appelle officiellement `Station Assomption`, les arrêts de bus de surface sont `de l'Assomption`).

---

## 9. Phase 3 — Paramétrisation et Architecture Multi-Villes

### 9.1 Contrat déclaratif `CityConfig`
- Définition stricte dans `core/config.ts` de la configuration par ville :
  - Métadonnées géographiques : `center`, `zoom`, `pitch`, `bearing`, `minZoom`, `maxZoom`, `ringRoadNames`.
  - Intégration horaire : `timezone`, `locale`, `scheduleModel` (`trip-based` vs `frequency-expanded`).
  - Intégration temps réel : `capability` (`per-trip-offsets` vs `service-status-only`), `pollIntervalMs`, `endpoints`.
  - Chemins d'accès aux artefacts : `dataDir`, `modelsDir`, `paths.rer` optionnel.
  - Attribution : `operatorName`, `datasetName`, `licenseText`, `licenseUrl`, `disclaimer`.
- **Règle absolue** : Zéro `if (city === ...)` dans `core/sim`, `core/ui`, `core/rt`.
- Instanciation dans `cities/paris/city.config.ts` et `cities/montreal/city.config.ts`.

### 9.2 Routage Déclaratif
- Routes gérées de façon unifiée :
  - `/` $\to$ ville par défaut (`paris`)
  - `/:city` $\to$ vue réseau de la ville (`/paris`, `/montreal`)
  - `/:city/ligne/:line` $\to$ sélection directe d'une ligne
- Sélecteur de ville accessible et intégration du titre dynamique dans le `Header`.

---

## 10. Phase 4 — Simulation Théorique de Montréal (STM)

### 10.1 Pipeline d'ingestion STM
- Script autonome `cities/montreal/ingest/ingest_stm.py` :
  - Téléchargement et extraction du flux GTFS officiel STM 2026.
  - Filtrage strict `route_type = 1` (4 lignes de métro).
  - Traitement des 68 stations uniques et calcul des cordes métriques inter-stations.
  - Génération de 9 artefacts conformes aux standards parisiens :
    - `lines.json` (4 lignes)
    - `stations.json` (68 stations)
    - `shapes.bin` (format binaire SHP2 compact, 11 tracés)
    - `schedule.json` (1 654 courses quotidiennes, 72 stations géographiques)
    - `tracks.json`, `line_ladders.json`, `sections.json`, `station-rankings.json`, `rolling-stock.json`.
- Stockage miroir dans `cities/montreal/data/` et `web/public/cities/montreal/data/`.

### 10.2 Filet de sécurité cinématique
- `tests/montreal-snapshot.test.ts` : validation déterministe à mardi 08:30 EDT (15 septembre 2026).
- Exactement **72 rames actives** calculées avec $\Delta = 0.0000\text{ m}$ et 0.0000 m/s d'écart :
  - Ligne 1 (Verte) : 27 rames
  - Ligne 2 (Orange) : 32 rames
  - Ligne 4 (Jaune) : 4 rames
  - Ligne 5 (Bleue) : 9 rames

---

## 11. Phase 5 — Couche État du Service Montréal (API i3)

### 11.1 Relais Netlify `stm_relay.ts`
- Interrogation de l'endpoint officiel i3 : `https://api.stm.info/pub/od/i3/v1/messages/etatservice/`.
- Heures d'exploitation dynamiques (05:15 à 02:00 EDT) basées sur le GTFS STM.
- Cache mémoire inter-requêtes (120 s) et repli transparent théorique (`feedHealthy: false`).
- Support de `STM_API_KEY` dans l'environnement serveur et `.env.local` (sécurité absolue : aucune clé dans le client).

### 11.2 Suppression des rames fantômes
- En cas d'interruption totale d'une ligne, 100 % des rames de cette ligne sont masquées dans `browser_engine.ts`.
- En cas d'interruption partielle, extraction des `closedStations` et suppression ciblée des courses desservant le tronçon fermé.
- Validation par `tests/stm_relay.test.ts` (7 tests) et `tests/montreal-interruption.test.ts` (4 tests).

---

## 12. Phase 6 — Remontée Info Trafic & Suppression des Trains Fantômes sur Paris

### 12.1 Refactorisation & Durcissement du parseur PRIM SIRI `GeneralMessage`
- Correction du piège regex historique `[^et]+` dans `netlify/functions/prim_relay.ts` :
  - Capture paresseuse délimitée `/interrompu(?:e)?\s+(?:entre|de)\s+(.*?)\s+(?:et|a|à)\s+(.*?)(?:\s+(?:en raison|suite|consequence|conséquence|pour|jusqu|vers|[.,;])|$)/i`.
  - Extraction fiable des stations fermées (ex. *Châtelet*, *Nation*, *Concorde*).
- Priorité stricte des statuts : `interrupted` (3) > `disrupted` (2) > `normal` (1) (une interruption ne peut jamais être écrasée par une annonce secondaire).
- Correspondance de ligne par `LineRef` puis par token délimité trié par longueur décroissante (évitant la confusion Ligne 14 vs Ligne 1).
- Détection locale de `PRIM_API_KEY` dans `.env.local` via `loadLocalEnvFallback()`.

### 12.2 Suppression des trains et interface
- Intégration de la suppression dans `core/sim/browser_engine.ts` avec comparaison bidirectionnelle des arrêts (`normStop.includes(normCs) || normCs.includes(normStop)`).
- TopBar (`core/ui/components/header.ts`) déclaratif : affichage propre `Ligne 1 interrompue / perturbée`, `RER A interrompu / perturbé`.

### 12.3 Vérification & Filet de sécurité
- `tests/prim_relay.test.ts` : 7 tests unitaires du parseur et des heures de service.
- `tests/paris-interruption.test.ts` : 6 tests de simulation cinématique (nominal 764 rames, interruption totale L1 $\to 722$, interruption totale RER A $\to 706$, interruption Poissy $\to$ suppression de 10 rames ciblées, ralentissement sans suppression).
- Snapshot nominal Paris (`tests/paris-snapshot.test.ts`) : strictement préservé avec **764 trains vérifiés à $\Delta = 0.0000\text{ m}$**.

---

## 13. Phase 0 — Reconnaissance des Données & Réseau TfL (Londres)

Rapport d'audit et de reconnaissance réalisé sur la branche `city-london`. Tous les tests de non-régression Paris ($\Delta = 0.0000\text{ m}$ sur 764 trains) et Montréal ($\Delta = 0.0000\text{ m}$ sur 72 trains) sont strictement préservés.

### 13.1 Source des horaires

1. **Couverture du flux TransXChange Journey Planner (`journey-planner-timetables.zip`)**
   - Couvre l'intégralité des 5 modes ferrés TfL : **Tube** (11 lignes), **DLR**, **Elizabeth line**, **London Overground** (les 6 lignes) et **London Trams**.
   - Les sections exploitées sur infrastructure Network Rail (branches de surface de l'Overground et antennes est/ouest de l'Elizabeth line) sont incluses dans les fichiers de services complets.
   - **Source retenue mode par mode** : Le flux officiel hebdomadaire TransXChange Journey Planner (`https://tfl.gov.uk/tfl/syndication/feeds/journey-planner-timetables.zip`) sous licence TfL Open Data / Open Government Licence v2.0.

2. **Comparaison des 4 voies d'accès et recommandation argumentée**
   - **Voie 1 — Conversion TransXChange vers GTFS par outil dédié (`transx2gtfs` / `UK2GTFS`)** :
     - *Coût* : Faible à moyen (étape de conversion hors-ligne ou scriptée).
     - *Compatibilité* : **Parfaite**. Produit un GTFS standard (`trips.txt`, `stop_times.txt`, `calendar.txt`, `stops.txt`) consommé directement par `core/ingest` avec le même schéma et les mêmes algorithmes que Paris et Montréal.
     - *Fraîcheur* : Garantie maximale (données officielles TfL mises à jour chaque semaine).
   - **Voie 2 — Lecteur TransXChange écrit pour le projet dans `core/ingest`** :
     - *Coût* : **Très élevé**. Le format XML TransXChange 2.1/2.4 est lourd et déclaratif (graphe de `JourneyPatternTimingLink`, durées relatives ISO 8601 `PT2M30S`, profils calendaires `OperatingProfile` imbriqués).
     - *Risque* : Élevé sur la gestion des jours fériés et des exceptions, des centaines de lignes de code fragiles créées au détriment de la maintenabilité.
   - **Voie 3 — Endpoints `Timetable` de l'API unifiée (`/Line/{id}/Timetable/...`)** :
     - *Coût* : Élevé en requêtes et fragile. L'endpoint nécessite d'énumérer chaque paire origine-destination pour éviter les réponses de disambiguation.
     - *Limites* : Les départs sont tronqués à la minute près (pas de secondes). Découverte majeure lors de la sonde : **l'endpoint renvoie des erreurs HTTP 500 sur l'Elizabeth line et l'Overground**. Inexploitable pour une ingestion globale.
   - **Voie 4 — GTFS tiers déjà converti (Transitland, BODS, etc.)** :
     - *Éliminatoire* : TfL ne publie pas de GTFS officiel. Les archives tierces (ex. Transitland) sont souvent périmées de plusieurs mois ou années, sous accès payant pour les versions récentes, ou n'intègrent pas le découpage 2024 des 6 lignes de l'Overground. BODS ne couvre pas le rail lourd. Règle d'or : *« une source dont la fraîcheur n'est pas garantie est éliminatoire »*.
   - **Recommandation formelle pour la Question 2** : **Retenir la Voie 1 (Conversion TransXChange officiel $\to$ GTFS local)**. C'est la seule voie qui combine une fraîcheur officielle garantie, un coût d'ingestion minimal dans `core/ingest`, et une conformité stricte au contrat de données éprouvé sur Paris et Montréal.

3. **Détection de péremption (Staleness detection)**
   - Contrôle HTTP : Requête `HEAD` sur l'archive syndiquée `journey-planner-timetables.zip` vérifiant l'en-tête `Last-Modified` et l'`ETag` (ex. `Last-Modified: Mon, 21 Sep 2026 14:13:54 GMT`).
   - Contrôle applicatif : Lecture des dates de validité `start_date` / `end_date` dans le `calendar.txt` issu de la conversion.
   - Seuil d'alerte configuré dans `ModeConfig.schedule.stalenessToleranceDays` : **14 jours** (tolérance à deux republications hebdomadaires le jeudi matin).

### 13.2 Structure du réseau

4. **Nombre de lignes par mode, identifiants API et couleurs officielles**
   - **Tube (11 lignes)** :
     - `bakerloo` : `#B36305` (Brown / Pantone 470)
     - `central` : `#E32017` (Red / Pantone 485)
     - `circle` : `#FFD300` (Yellow / Pantone 116)
     - `district` : `#00782A` (Green / Pantone 356)
     - `hammersmith-city` : `#F3A9BB` (Pink / Pantone 197)
     - `jubilee` : `#A0A5A9` (Grey / Pantone 430)
     - `metropolitan` : `#9B0056` (Magenta / Pantone 235)
     - `northern` : `#000000` (Black / Pantone Process Black)
     - `piccadilly` : `#003688` (Dark Blue / Pantone 072)
     - `victoria` : `#0098D4` (Light Blue / Pantone Process Cyan)
     - `waterloo-city` : `#95CDBA` (Teal / Pantone 338)
   - **DLR (1 ligne)** :
     - `dlr` : `#00A4A7` (Turquoise / Pantone 326)
   - **Elizabeth line (1 ligne)** :
     - `elizabeth` : `#6950A1` (Purple / Pantone 266)
   - **Overground (6 lignes nommées fin 2024)** :
     - `liberty` : `#606667` (Grey)
     - `lioness` : `#EF9600` (Yellow)
     - `mildmay` : `#2774AE` (Blue)
     - `suffragette` : `#5BA763` (Green)
     - `weaver` : `#893B67` (Maroon)
     - `windrush` : `#D22730` (Red)
   - **Tram (1 ligne)** :
     - `tram` : `#78BE20` (Green / Pantone 368 C)
   - **Total** : 20 lignes.

5. **Nombre de stations par mode et total dédupliqué**
   - `tube` : 272 stations uniques (`NaptanMetroStation`).
   - `dlr` : 45 stations uniques (`NaptanMetroStation`).
   - `elizabeth-line` : 43 stations uniques (`NaptanRailStation`).
   - `overground` : 113 stations uniques réparties sur les 6 lignes.
   - `tram` : 39 stations géographiques uniques (correspondant à 105 quais/arrêts directionnels bruts `NaptanMetroPlatform`).
   - **Total dédupliqué sur les 5 modes** : **575 stations physiques uniques**.

6. **Les embranchements et mesure du décalage d'index `lineStrings` vs `orderedLineRoutes`**
   - Structure des branches : de 1 branche (lignes linéaires simples : Bakerloo, Victoria, Waterloo & City, Liberty, Lioness, Suffragette) à 7 branches (Central, District, Metropolitan), 10 branches (Northern), 12 branches (Elizabeth line) et 13 branches (DLR).
   - Continuité des branches : 39 des 40 séquences directionnelles (`stopPointSequences`) se connectent sans aucune interruption ni trou (0 référence manquante). Seule exception mineure : `metropolitan outbound branch 12`.
   - **Mesure de l'écart d'appariement d'index** :
     - **11 lignes sur 20** présentent un désalignement complet d'index entre `lineStrings` et `orderedLineRoutes` (`central`, `district`, `dlr`, `elizabeth`, `metropolitan`, `mildmay`, `northern`, `piccadilly`, `tram`, `weaver`, `windrush`).
     - Au total, 19 séquences directionnelles sur 40 ont un index désaligné.
     - Règle confirmée : l'appariement géométrie/desserte doit obligatoirement se faire par correspondance des identifiants NaPTAN d'extrémités et interpolation spatiale, jamais par index de tableau.

7. **La Circle line (topologie en spirale)**
   - Dans l'API TfL (`Route/Sequence`) et les horaires, la Circle line n'est plus un anneau fermé depuis décembre 2009. C'est une **spirale continue (« lasso »)**.
   - Sens inbound : `Edgware Road` $\to$ boucle complète centrale (27 stations) $\to$ second passage à `Edgware Road` $\to$ antenne vers `Hammersmith` (37 arrêts au total).
   - Sens outbound : `Hammersmith` $\to$ `Edgware Road` (arrêt 10) $\to$ boucle complète centrale $\to$ terminus final à `Edgware Road` (37 arrêts).
   - Edgware Road est visitée deux fois par chaque train au cours d'un trajet.
   - Structure API : 2 branches (`branch 1` boucle de 28 arrêts et `branch 0` antenne de 10 arrêts).
   - Survie du moteur cinématique : garantie car `TripData` modélise une trajectoire curviligne continue d'un point $A$ à un point $B$ via des arrêts horodatés croissants, sans hypothèse de modulo ou de rebouclage cyclique.

8. **Sections de voie partagées**
   - **56 segments de voie partagés** identifiés entre lignes différentes :
     - Tronçon sub-surface central (7 segments) : `Circle + Hammersmith & City + Metropolitan` (Baker Street $\leftrightarrow$ Liverpool Street / Aldgate).
     - Tronçon sud-ouest sub-surface (15 segments) : `Circle + District` (High Street Kensington $\leftrightarrow$ Tower Hill).
     - Tronçon ouest sub-surface (10 segments) : `Circle + Hammersmith & City` (Hammersmith $\leftrightarrow$ Edgware Road).
     - Tronçon est sub-surface (10 segments) : `District + Hammersmith & City` (Aldgate East $\leftrightarrow$ Barking).
     - Branche Uxbridge (6 segments) : `Metropolitan + Piccadilly` (Rayners Lane $\leftrightarrow$ Uxbridge).
     - Branche Watford DC (surface) : `Bakerloo + Overground (Lioness)` (Queen's Park $\leftrightarrow$ Harrow & Wealdstone, voies Network Rail partagées).
     - Tronçon Overground nord (1 segment) : `Mildmay + Windrush` (Canonbury $\leftrightarrow$ Highbury & Islington).

9. **Sauts d'arrêts et missions express**
   - `Metropolitan` : 3 régimes d'exploitation simultanés : *All-Stations*, *Semi-Fast* (saute Northwick Park et Preston Road), et *Fast* (saute également Wembley Park entre Harrow-on-the-Hill et Finchley Road).
   - `Piccadilly` : saute systématiquement les 4 stations de surface entre Barons Court et Acton Town (Ravenscourt Park, Stamford Brook, Turnham Green, Chiswick Park), desservies par la District line.
   - `Elizabeth line` : missions semi-directes sautant Acton Main Line, West Ealing ou Hanwell.
   - Nombre de dessertes distinctes par ligne : jusqu'à 10 (Elizabeth line), 8 (Northern), 7 (District), 5 (Central, DLR), 4 (Metropolitan, Windrush).

### 13.3 Horaires

10. **Modèle de courses**
    - Le réseau TfL utilise un modèle **100 % à courses individuelles horodatées (`trip-based`)** sur les 5 modes.
    - Dans l'API (`knownJourneys`) et dans TransXChange (`VehicleJourney`), chaque train correspond à une course unique avec heure de passage déterministe (503 courses pour Victoria un jour ouvré, 352 pour DLR Bank-Lewisham, 176 pour Croydon Tram).
    - Aucun modèle de fréquences synthétiques (`frequency-expanded`) n'est requis.

11. **Franchissement de minuit, encodage et Night Tube**
    - Des heures dépassant 24:00:00 apparaissent explicitement :
      - Lignes de jour standard : fins de service jusqu'à `24:59` (00h59).
      - Lignes du **Night Tube** (Victoria, Central, Jubilee, Northern, Piccadilly) : services continus les nuits du vendredi au samedi et du samedi au dimanche, encodés jusqu'à `26:59` (02h59 du matin) rattachés à la journée de service précédente, la journée suivante débutant dès `03:00`.
    - Encodage : heures au-delà de 24h converties en secondes depuis minuit ($t \ge 86400$ s), strictement compatible avec `paris_time.ts` et le moteur cinématique.
    - Bascules d'heure d'été/hiver (BST/GMT fin octobre à 02h00) : traitées en heure locale déterministe via la timeline continue.

12. **Nombre de courses actives un mardi à 8 h 30 (heure de Londres)**
    - Tube : ~500 à 520 rames simultanées (Central ~70, Northern ~90, Piccadilly ~75, District ~65, Jubilee ~55, Metropolitan ~40, Victoria ~36, Bakerloo ~32, Circle/H&C ~35, Waterloo & City ~4).
    - DLR : ~35 à 45 rames.
    - Elizabeth line : ~50 à 55 rames.
    - London Overground : ~55 à 60 rames réparties sur les 6 lignes.
    - London Tram : ~22 à 25 trams.
    - **Total réseau ferré TfL en pointe du matin** : **~660 à 710 rames actives simultanées**.

### 13.4 Temps réel

13. **Présence et formes de phrases de `currentLocation`**
    - Mesure sur un échantillon de 8 166 prédictions :
      - **Tube** : **99.7 %** de `currentLocation` non vide (3 684 / 3 696).
      - **DLR, Elizabeth line, Overground, Tram** : **0.0 %** (`currentLocation` systématiquement vide).
    - 19 motifs structurels distincts sur le Tube, dominés par 4 formes récurrentes :
      1. `At <STATION>` (46.0 %)
      2. `Between <STATION> and <STATION>` (36.2 %)
      3. `Approaching <STATION>` (8.5 %)
      4. `Left <STATION>` (5.0 %)
      5. Voies de remisage et tiroirs de retournement (`<STATION> Sidings`, etc. : 4.3 %).

14. **Stabilité du `vehicleId` sur la durée d'un trajet**
    - Échantillonnage temporel à 30 secondes d'intervalle sur 756 rames actives :
      - **95.5 % de persistance immédiate** (722 rames suivies de manière stable).
      - Le champ `timeToStation` régresse de manière monotone ($\Delta t \approx 30$ s) le long des stations aval.
      - Caractéristique Tube : `vehicleId` est un numéro de roulement/service (ex. `201`), réaffecté à une autre rame ou au retour après terminus.

15. **Qualité des données par mode**
    - **Tube** : Données très riches (100% `vehicleId`, 99.7% `currentLocation`, `timeToStation` précis sur 3 à 8 stations en aval). Très favorable à la projection cinématique inverse.
    - **Elizabeth line & Overground** : Données exploitables (100% `vehicleId` à 15 chiffres, `timeToStation` précis, mais sans `currentLocation`).
    - **Tram** : Données exploitables (100% `vehicleId` carrosserie à 4 chiffres, `timeToStation` précis).
    - **DLR** : **Données creuses**. `currentLocation` absent (0.0%), `vehicleId` systématiquement absent ou à `0` (0.0%). Prédictions station par station uniquement, ne permettant pas de relier trivialement les passages à une même rame.

16. **Limites de débit et coût du sondage complet**
    - Plan gratuit : 50 requêtes/min sans clé, 500 requêtes/min avec `app_key`.
    - **Résultat capital** : L'endpoint `/Line/{ids}/Arrivals` accepte le chaînage par virgule des 20 lignes dans une **requête HTTP unique** (`/Line/bakerloo,central,...,tram/Arrivals`).
    - Un sondage de l'ensemble du réseau londonien coûte donc **exactement 1 requête par minute** (ou 2 requêtes/min pour un pas de 30 s), soit une consommation dérisoire (< 0.5% du quota gratuit).

### 13.5 Comparaison au socle existant

17. **Champs consommés par `core/ingest` absents ou différents**
    - Identifiants de lignes : slugs minuscules (`bakerloo`, `liberty`) vs URNs IDFM (`IDFM:C01371`) ou entiers STM (`1`).
    - Identifiants de stations : codes NaPTAN ATCO (`940GZZLUWLO`) vs URNs ou entiers.
    - Coordonnées géographiques : le flux TransXChange brut ne contient pas les lat/lon ; il faut joindre la base NaPTAN (`naptan_metro.csv`) ou les stop points de l'API.
    - Gestion des branches : multiplicité des `shape_id` par mission/branche (contrairement au schéma quasi-linéaire parisien et montréalais).

18. **Inventaire des paramètres cinématiques actuellement codés en dur**
    - Constantes dans `core/sim/kinematics.ts` :
      - `maxSpeed` : 25 m/s (90 km/h métro) vs 35 m/s (130 km/h RER), actuellement discriminé par un appel codé en dur à `isRerLine(trip.line)`.
      - `k = 0.25` : ratio du profil trapézoïdal (25% accélération, 50% palier, 25% freinage).
      - `windowM = 90` : fenêtre de lissage angulaire du cap (bearing).
    - Constantes dans `core/rt/rt_matching.ts` (actuellement partitionnées entre `METRO_PROFILE` et `RER_PROFILE`) :
      - `accel` (1.0 vs 0.8 m/s²)
      - `decel` (1.2 vs 0.9 m/s²)
      - `vMax` (19.4 vs 30.5 m/s)
      - `minDwell` (20 vs 45 s)
      - `matchWindow` (120 vs 180 s)
      - `maxDelay` (900 vs 1200 s)
      - `alpha` (0.4)
      - `decayDistance` (4000 vs 6000 m)
      - `staleAfter` (360 s)
      - `reconcileDurationMs` (300 vs 400 ms)
      - `reconcileThresholdM` (20 vs 50 m)
      - Liste en dur `RER_LINE_IDS` à supprimer complètement au profit des propriétés de `ModeConfig.kinematics`.

---

## 14. Phase 1 — Étude Comparative de la Géométrie (Porte de Décision)

Note comparative des quatre pistes géométriques, de leurs coûts d'intégration, de leur rendu visuel et de leur conformité légale.

### 14.1 Analyse détaillée des 4 pistes

| Piste | 1. Couverture par mode | 2. Embranchements | 3. Sections partagées | 4. Licence & Légal | Temps dev. | Qualité rendu | Dépendance externe |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Piste 1 : GeoJSON Oliver O'Brien (`tfl_lines.json`)** | **100 % des 5 modes** (Tube 11 lignes, DLR, Elizabeth line, Overground, Tramlink). Mis à jour sept. 2025. | Fragments inter-stations raccordables avec un écart $\le 4.40\text{ m}$. Chaînage glouton 100 % continu sans rupture. | Modélisées par une géométrie axiale unique avec tableau `lines` listant les lignes concurrentes. | **ODbL v1.0** (dérivé OSM). Partage à l'identique de la base dérivée (`shapes.bin`) + attribution obligatoire. | **1 à 2 jours** | **Excellente** (courbes réelles des tunnels). | Nulle au runtime (archive statique figée). |
| **Piste 2 : Extraction brute OpenStreetMap** | Exhaustivité totale (voies, aiguillages, tiroirs, dépôts). | Très complexe : nécessite de reconstruire un graphe topologique ferroviaire complet et d'élaguer les voies de service. | Segments multiples segmentés par aiguille à fusionner manuellement ou par relations `route`. | **ODbL v1.0** stricte (mêmes obligations que la Piste 1). | **4 à 6 jours** | **Excellente** | Extraction Overpass ou dump lourd. |
| **Piste 3 : `lineStrings` API TfL Unified** | Les 20 lignes et 5 modes. | Trivial, mais désalignement d'index mesuré sur 11 lignes / 20. | Segments droits se superposant directement. | **TfL Open Data (OGL v2.0)**. Pas de clause Share-Alike. | **Quelques heures** | **Médiocre** (lignes droites inter-gares, traverse les immeubles). | Nulle (inclus dans l'API). |
| **Piste 4 : Tracé manuel ciblé** | Complément ponctuel uniquement (quelques tronçons délicats). | Traité manuellement sur mesure. | Édité sur mesure via fichier d'overrides. | **Domaine public / Projet**. | **Quelques heures / section** | **Contrôle direct** | Nulle. |

### 14.2 Mesures de raccordement à la topologie `Route/Sequence`

Sonde effectuée sur les 16 stations de la Victoria Line et les 25 stations de la Bakerloo Line en raccordant les polylignes chaînées d'Oliver O'Brien :
- **Continuité des polylignes** : 100 % des fragments raccordés sans discontinuité (0 fragment résiduel, écart moyen entre fragments adjacents de $2.8\text{ m}$, écart maximal mesuré de $4.40\text{ m}$).
- **Écart gare $\leftrightarrow$ polyligne** :
  - Distance moyenne : **$25.3\text{ m}$**.
  - Écart minimal : **$0.9\text{ m}$** (Brixton).
  - Écart maximal : **$104.4\text{ m}$** (Walthamstow Central — le point NaPTAN est situé en surface à l'entrée de la gare routière alors que le tunnel s'arrête en sous-sol).
  - La projection orthogonale classique (`projectPointOnLine`) rabat la station à exactement $0.0\text{ m}$ sur la voie 3D.

### 14.3 Recommandation pour la Porte

**Recommandation formelle : Adopter la Piste 1 (GeoJSON d'Oliver O'Brien) comme géométrie primaire du Tube et des modes ferrés, complétée par la Piste 4 (overrides manuels) en cas d'anomalie locale.**
- La Piste 1 résout l'obstacle majeur du tracé réel des tunnels sans le coût disproportionné d'un parseur OSM brut.
- La licence ODbL est pleinement compatible avec notre projet open source, sous réserve d'inclure la mention légale d'attribution dans le footer et `CityConfig.attribution`.

---

## 15. Phase 2 — Révision du Contrat Multi-Villes & Migration

### 15.1 Refonte des interfaces `ModeConfig` et `CityConfig` (`core/config.ts`)
- Une ville est désormais formalisée comme une collection déclarative de modes (`modes: ModeConfig[]`).
- Structure stricte de `ModeConfig` :
  - `id`: identifiant canonique (`'metro'`, `'tube'`, `'dlr'`, `'overground'`, …).
  - `displayName`: libellé voyageur (`'Métro'`, `'London Underground'`, …).
  - `enabled`: booléen filtré uniquement au chargement.
  - `schedule`: format (`'gtfs'` | `'transxchange'`), source URL, modèle horaire (`'trip-based'` | `'frequency-expanded'`), et tolérance de fraîcheur en jours (`stalenessToleranceDays`).
  - `geometry`: source déclarative (`'idfm-osm'`, `'stm-gtfs'`, `'osm-oobrien'`).
  - `kinematics`: paramètres cinématiques découplés de tout `if` : `maxSpeedKmh`, `accelMs2`, `decelMs2`, `dwellSec`, `vMaxMs`, `k`, `windowM`, `minDwellSec`, `matchWindowSec`, `maxDelaySec`, `alpha`, `decayDistanceM`, `staleAfterSec`, `reconcileDurationMs`, `reconcileThresholdM`.
  - `realtime`: capacité réelle (`'per-trip-offsets'` Paris, `'service-status-only'` Montréal, `'arrival-predictions'` Londres).

### 15.2 Migration de Paris et Montréal
- `cities/paris/city.config.ts` : migré sur `modes: [metroMode]` avec valeurs cinématiques rigoureusement identiques aux constantes du moteur (90 km/h, 1.0 m/s², 1.2 m/s², 20 s dwell).
- `cities/montreal/city.config.ts` : migré sur `modes: [metroMode]` avec valeurs cinématiques identiques (90 km/h, 1.0 m/s², 1.2 m/s², 20 s dwell).
- Snapshots Paris (764 rames) et Montréal (72 rames) rejoués avec $\Delta = 0.0000\text{ m}$.

### 15.3 Analyse de la Décision Linguistique (Français vs i18n dynamique)
- **Option A — Interface unifiée en français (avec toponymes locaux non traduits)** :
  - *Slug de route* : `/londres`
  - *Coût* : **0 jour**. Les chaînes d'interface actuelles restent en place. Les noms de gares londoniennes (*Oxford Circus*, *Paddington*) restent en anglais comme dans la réalité.
- **Option B — Internationalisation complète pilotée par `locale` (ex. `en-GB`)** :
  - *Slug de route* : `/london`
  - *Coût estimé* : **1 à 2 jours**.
  - *Travaux requis* : extraction d'une soixantaine de chaînes UI dans un dictionnaire `core/ui/i18n/` (`fr.ts`, `en.ts`), câblage dynamique des modales, badges, info-bulles, raccourcis et statuts info trafic, recette visuelle sur les longueurs de texte anglaises.
- *Statut* : **Option A retenue et validée par l'utilisateur.** Interface unifiée en français, slug `/londres`, toponymes officiels en anglais (*Oxford Circus*, *King's Cross*).

---

## 16. Phase 3 — Le Tube, et le Tube seul (Livraison Complète)

### 16.1 Décisions d'Architecture et Arbitrages Validés
1. **Option A (Linguistique)** : Interface conservée en français, navigation via `/londres`, stations avec toponymes officiels en anglais sans anglicisation de l'UI.
2. **Option 1 (Rendu des tronçons partagés)** : Voie physique unique partagée (jumeau numérique 3D réaliste). Sur les corridors partagés (ex. Metropolitan / Circle / Hammersmith & City entre Baker Street et Aldgate), les voies ne sont pas dupliquées en rubans parallèles mais tracées fidèlement selon l'axe physique réel. Les rames de chaque ligne y circulent avec leur propre livrée colorée distinctive.
3. **Product Honesty (Temps Réel)** : En Phase 3, les rames du Tube circulent au niveau de confiance `sched` (« Horaires théoriques ») conformément aux grilles TransXChange officielles d'automne 2026. Le raccordement au relais unifié TfL interviendra en Phase 4.

### 16.2 Pipeline d'Ingestion TfL (`core/ingest/src/build_london_artifacts.py`)
Le pipeline lit directement les données sources officielles :
- Grilles TransXChange issues de `LULDLRTRAMRIVERCABLE FULL 21092026.zip` (`tfl_1-BAK`, `tfl_1-CEN`, `tfl_1-CIR`, `tfl_1-DIS`, `tfl_1-HAM`, `tfl_1-JUB`, `tfl_1-MET`, `tfl_1-NTN`, `tfl_1-PIC`, `tfl_1-VIC`, `tfl_1-WAC`).
- Géométrie ferroviaire physique d'Oliver O'Brien (`tfl_lines.json`, ODbL) indexée en graphe topologique avec routage Dijkstra inter-stations.
- Référentiel des stations TfL / NaPTAN (`tfl_stations.json`, ODbL) avec mapping des alias d'extension Battersea (`940GZZLU990` Nine Elms, `940GZZLU991` Battersea Power Station).

**Les 9 artefacts normalisés générés dans `cities/london/data/` et `web/public/cities/london/data/` :**
1. `lines.json` : Les 11 lignes du Tube avec codes couleur hex officiels TfL, profondeurs d'élévation (-6 m pour les sub-surface, -16 m à -26 m pour les deep tube) et terminus par direction.
2. `stations.json` : **272 stations uniques**, soit un respect strict du gabarit ($272 \pm 0\%$).
3. `tracks.json` : 347 segments physiques de voies continues avec assombrissement de contraste WCAG $\ge 3.0:1$ sur fond clair.
4. `shapes.bin` : 336 tracés de parcours dédupliqués et rééchantillonnés au pas régulier de 10 m au format compact binaire SHP2.
5. `schedule.json` : **8 810 courses du mardi type** encodées sous forme compacte.
6. `line_ladders.json` : Thermomètres de ligne complets pour chacune des 11 lignes (directions 0 et 1), incluant distances métriques, stations hubs et pastilles de correspondance.
7. `station-rankings.json` : Fréquentations de desserte théorique par station (semaine, samedi, dimanche).
8. `sections.json` : Découpage réseau Deep Tube (7 lignes en tunnel foré) vs Sub-Surface (4 lignes à gabarit élargi).
9. `rolling-stock.json` : Spécifications vérifiées et sourcées du matériel roulant (1972 Stock, 1973 Stock, 1992 Stock 4V & 8V, 1995 Stock, 1996 Stock, 2009 Stock, S7 Stock, S8 Stock).
10. `feed_fingerprint.json` : Traçabilité et licences (TfL Open Data Licence & ODbL).

### 16.3 Résolution des Cas Vicieux (`tests/london-vicious-cases.test.ts`)
- **Spirale de la Circle Line** : La ligne Circle n'est pas un anneau fermé mais une spirale de 37/38 arrêts débutant à Hammersmith et s'achevant à Edgware Road après un passage intermédiaire. Traitement par distance curviligne strictement croissante le long de la polyline sans aucun saut modulo ni glitch de restitution.
- **Skip-Stop Metropolitan Line** : Les trains rapides et semi-rapides franchissant des gares non desservies (ex. Harrow-on-the-Hill $\to$ Wembley Park $\to$ Finchley Road) maintiennent une vitesse de croisière constante sans décélération ni dwell stationnaire fantôme.
- **Ségrégation des branches Northern Line** : Les rames transitant par Charing Cross et celles transitant par Bank restent strictement ségréguées sur leurs tracés respectifs sans téléportation inter-branches.

### 16.4 Filet de Sécurité & Snapshot Londonien (`tests/london-snapshot.test.ts`)
- Prise de snapshot cinématique de référence pour mardi 08h30 BST (`2026-10-06T07:30:00Z`, 30 600 s civiles) :
  - **540 rames actives calculées** (Bakerloo: 29, Central: 79, Circle: 17, District: 71, Hammersmith & City: 13, Jubilee: 54, Metropolitan: 46, Northern: 105, Piccadilly: 76, Victoria: 47, Waterloo & City: 3).
  - Reproductibilité cinématique exacte : **$\Delta = 0.0000\text{ m}$** sur les positions et **$\Delta = 0.0000\text{ m/s}$** sur les vitesses.
  - Coordonnées de l'ensemble de la flotte bornées dans le Grand Londres : $\text{lon} \in [-0.65, 0.35]$, $\text{lat} \in [51.25, 51.75]$.
- Intégration de `npm run test:london-snapshot` dans la suite standard `npm test`.

### 16.5 Contrôle Strict de Non-Régression
À l'issue de la Phase 3 :
- **Paris** : $\Delta = 0.0000\text{ m}$ sur 764 rames (100% stable).
- **Montréal** : $\Delta = 0.0000\text{ m}$ sur 72 rames (100% stable).
- **Londres** : $\Delta = 0.0000\text{ m}$ sur 540 rames (nouveau snapshot de référence).
- **Transitions DST** : 4 tests passés incluant Paris, Montréal et Londres, avec validation de la continuité du Night Tube lors du passage à l'heure d'hiver en octobre.
- **Empreinte de build** : 43 fichiers dist et 20 URLs premier rendu vérifiées à 100% par `verify_build_footprint.mjs`.
- **Suite de tests** : 27 tests passés avec succès (`npm test`).

---

## 17. Phase 4 — Le Temps Réel Unifié TfL (Livraison Complète)

### 17.1 Architecture et Relais Serverless (`netlify/functions/tfl_relay.ts` & `netlify.toml`)
- **Endpoints amont TfL exploités** :
  - `https://api.tfl.gov.uk/Line/{ids}/Arrivals` pour les prédictions d'arrivée de toutes les lignes de métro (Bakerloo, Central, Circle, District, Hammersmith & City, Jubilee, Metropolitan, Northern, Piccadilly, Victoria, Waterloo & City).
  - `https://api.tfl.gov.uk/Line/Mode/tube/Status` pour l'état du trafic et les perturbations de chaque ligne en temps réel.
- **Relais serverless Netlify** :
  - Cache en mémoire avec TTL de 30 secondes pour respecter les limites de débit de l'API TfL et garantir un temps de réponse instantané au client web.
  - Redirections configurées dans `netlify.toml` : `/api/tfl` (statut lignes) et `/api/tfl_arrivals` (prédictions d'arrivée).
  - Normalisation des statuts de ligne vers l'interface canonique `LineTrafficReport` du core (`status`: `'normal'` | `'disrupted'` | `'interrupted'`).

### 17.2 Client Temps Réel et Polling (`cities/london/rt/tfl_client.ts`)
- Client dédié implémentant le polling automatique toutes les 30 secondes.
- Gestion robuste des pannes réseau, dégradation silencieuse, suivi du heartbeat et métriques de santé (`TflStatus`).
- Prise en charge des interruptions partielles ou totales avec notification immédiate au moteur de simulation.

### 17.3 Moteur d'Appariement Hybride (`core/rt/tfl_matching.ts`)
- **Défi spécifique à TfL** : Contrairement au flux PRIM (courses complètes avec horaires théoriques/visés par arrêt) et au flux STM (positions GPS directes), TfL fournit des prédictions d'arrivée station par station avec décompte en secondes (`timeToStation`) et identifiant de train (`vehicleId`).
- **Algorithme d'appariement en deux passes** :
  1. *Verrouillage par identifiant de véhicule* : Un `vehicleId` associé à un `tripId` lors d'un cycle précédent reste prioritairement lié à cette rame tant que le train progresse sur la ligne.
  2. *Appariement spatio-temporel par fenêtre admissible* : Pour les nouveaux trains, rapprochement sur la prochaine station desservie dans une fenêtre temporelle tolérante ($\pm 180\text{ s}$) autour de l'horaire théorique.
- **Lissage cinématique** :
  - Application d'un lissage exponentiel ($\alpha = 0.40$) sur les corrections temporelles afin d'éliminer les à-coups visuels dus aux arrondis ou rafraîchissements de l'API TfL.
- **Product Honesty intransigeante** :
  - Les rames pour lesquelles une prédiction temps réel valide est confirmée passent au niveau de confiance `'measured'` (affichage temps réel).
  - Les rames théoriques sans prédiction ou hors couverture demeurent strictement au niveau `'scheduled'` (« Horaires théoriques »). Aucun faux temps réel n'est injecté.

### 17.4 Intégration dans le Moteur de Simulation (`core/sim/browser_engine.ts`)
- Branchement transparent via la capacité déclarée `arrival-predictions` dans `cities/london/city.config.ts`.
- Conversion automatique des prédictions d'arrivée en jalons cinématiques dans les `timelines` des rames londoniennes via `buildTimeline`.

### 17.5 Tests et Validation de Non-Régression
- `tests/tfl_relay.test.ts` : 12 tests vérifiant le parsing des statuts de ligne, le formatage des prédictions d'arrivée, la mise en cache et la résilience aux erreurs.
- `tests/tfl_matching.test.ts` : 6 tests validant le verrouillage par `vehicleId`, l'appariement spatio-temporel, le rejet des anomalies hors ligne, et le lissage cinématique.
- **Vérification globale** (`npm test`) :
  - **Paris Snapshot** : 764 rames appariées, $\Delta = 0.0000\text{ m}$ (100% exact).
  - **Montréal Snapshot** : 72 rames appariées, $\Delta = 0.0000\text{ m}$ (100% exact).
  - **London Snapshot** : 540 rames appariées, $\Delta = 0.0000\text{ m}$ (100% exact).
  - **TfL Relay & Matching** : 18 tests validés.
  - **Empreinte de build** : 43 fichiers dist et 20 URLs premier rendu conformes.

---

## 18. Phase 5 — DLR (Docklands Light Railway) (Livraison Complète)

### 18.1 Ingestion et Données TransXChange
- **Source d'horaires** : `tfl_25-DLR-_-y05-266.xml` issu de l'archive officielle hebdomadaire Journey Planner (`LULDLRTRAMRIVERCABLE FULL 21092026.zip`).
- **Volume et couverture** :
  - **1 584 courses du mardi type** ingérées avec succès.
  - **22 nouveaux tracés shapes** rééchantillonnés (portant le total de shapes de 336 à 358 sans altérer aucun identifiant des shapes Tube existants).
  - **45 stations uniques** : 100% appariées avec le référentiel topologique (`tfl_stations.json`), zéro station orpheline.
  - **Total réseau Londres avec DLR** : **317 stations physiques uniques**, 12 lignes, 397 voies physiques continues (347 Tube + 50 DLR viaducs/surface).

### 18.2 Matériel Roulant & Dynamique Dédiée
- Matériel B92 / B2007 Stock consigné dans `cities/london/data/rolling-stock.json` et `web/public/cities/london/data/rolling-stock.json` :
  - Rames articulées de 28 m exploitées en unités multiples de 2 à 3 caisses (longueur totale 84 m).
  - Alimentation 750V DC par troisième rail avec captage par le bas, roulement fer, pilotage automatique SelTrac ATO intégral (sans conducteur).
- Paramètres cinématiques configurés dans `ModeConfig` (`cities/london/city.config.ts`) :
  - $v_{\max} = 80\text{ km/h}$ (22.2 m/s), $a = 1.0\text{ m/s}^2$, $d = 1.0\text{ m/s}^2$, dwell stationnaire de 20 s.
  - Élévation visuelle paramétrée à $+3.0\text{ m}$ reflétant l'insertion aérienne sur viaducs des Docklands.

### 18.3 Intégration Temps Réel TfL
- Ajout de `'dlr'` dans la liste unifiée des lignes interrogées (`TFL_TUBE_LINE_IDS`).
- Statut de trafic interrogé via `/Line/Mode/tube,dlr/Status` (retourne les 12 lignes en 1 seule requête HTTP).
- Prédictions d'arrivée agrégées dans `/Line/{ids}/Arrivals`. Rapprochement spatio-temporel géré par le matcher hybride avec respect de la product honesty.

### 18.4 Filet de Sécurité & Non-Régression Strictes
- **Règle d'or respectée** : « chaque mode ajouté ensuite ne doit pas déplacer les rames des modes déjà livrés ».
  - **Paris Snapshot** : **$\Delta = 0.0000\text{ m}$** sur les 764 rames actives.
  - **Montréal Snapshot** : **$\Delta = 0.0000\text{ m}$** sur les 72 rames actives.
  - **Tube Snapshot** : **$\Delta = 0.0000\text{ m}$** et **$\Delta v = 0.0000\text{ m/s}$** sur l'intégralité des **540 rames du Tube** (stabilité millimétrique absolue).
### 18.5 Contrôle Strict de Non-Régression
À l'issue de la Phase 5 :
- **Paris** : $\Delta = 0.0000\text{ m}$ sur 764 rames (100% stable).
- **Montréal** : $\Delta = 0.0000\text{ m}$ sur 72 rames (100% stable).
- **Londres** : $\Delta = 0.0000\text{ m}$ sur 540 rames du Tube + 38 rames DLR actives.
- **Suite de tests** : 7 suites au vert (`npm test`).

---

## 19. Phase 6 — Elizabeth line (Livraison Complète)

### 19.1 Ingestion & Synthèse Canonique Haute Fidélité (Option A)
- **Défi particulier** :
  - TfL ne publie pas de fichier TransXChange ni de flux GTFS pour l'Elizabeth line dans l'archive Journey Planner (`journey-planner-timetables.zip`), son exploitation commerciale relevant du code TOC National Rail `XR`.
  - L'API TfL `/Line/elizabeth/Timetable` renvoie 0 route.
- **Solution mise en œuvre (Option A)** :
  - **41 stations physiques uniques** cartographiées et alignées à 100 % sur `tfl_stations.json` (résolution exhaustive des codes NaPTAN `HUBPAD` $\to$ `910GPADTLL`, `HUBZWL` $\to$ `910GWCHAPEL`, `HUBABW` $\to$ `910GABWD`, etc.).
  - **Tracé physique continu sans couture** : 22 segments physiques actifs extraits de `tfl_lines.json` (assemblage de `ReadingExtension`, `CrossrailWest`, `PaddStockley`, `PaddLink`, `CrossrailCentral`, `AbbeyWoodSpur`, `CrossrailT5`, `HeathrowSpur`, `StratStepLink`, et les 13 segments de `CrossrailEast`). Continuité spatiale vérifiée avec un écart maximal inter-tronçons $< 1.0\text{ m}$ (jonctions parfaites à Stepney Green et Stockley).
  - **Grille horaire canonique nominale** :
    - 6 axes nominaux bidirectionnels :
      1. Reading $\leftrightarrow$ Abbey Wood (15 min de fréquence, 25 arrêts, 80.5 km)
      2. Heathrow T5 $\leftrightarrow$ Abbey Wood (15 min de fréquence, 18 arrêts, 48.9 km)
      3. Heathrow T4 $\leftrightarrow$ Abbey Wood (15 min de fréquence, 18 arrêts, 49.3 km)
      4. Paddington $\leftrightarrow$ Shenfield (10 min de fréquence, 19 arrêts, 40.3 km)
      5. Heathrow T5 $\leftrightarrow$ Shenfield (15 min de fréquence, 27 arrêts, 66.2 km)
      6. Reading $\leftrightarrow$ Paddington (30 min de fréquence, 16 arrêts, 57.2 km)
    - Total de **880 courses du mardi type** (de 05h30 à 23h50).
    - **12 nouvelles formes géométriques rééchantillonnées** (shapes 359 à 370) au pas régulier de 10 m dans `shapes.bin` (total 370 shapes).
    - **Total réseau Londres avec Elizabeth line** : **355 stations physiques uniques** (317 Tube/DLR + 38 gares de surface GEML/GWML nouvelles), 13 lignes, 419 segments de voies physiques continues.

### 19.2 Matériel Roulant & Régime Cinématique Mixte
- **Matériel Class 345 Aventra** consigné dans `cities/london/data/rolling-stock.json` et `web/public/cities/london/data/rolling-stock.json` :
  - Rames de 9 caisses à intercirculation intégrale (longueur totale 204.73 m, largeur 2.80 m, hauteur 3.78 m, roulement fer standard UIC).
  - Bi-mode électrique 25 kV AC par caténaire (lignes de surface) et 750 V DC (central core).
- **Régime cinématique sans « if »** :
  - Paramètres cinématiques unifiés : $v_{\max} = 140\text{ km/h}$ (38.9 m/s), $a = 1.0\text{ m/s}^2$, $d = 1.0\text{ m/s}^2$, dwell stationnaire de 30 s.
  - La physique du moteur bride naturellement la vitesse en tunnel central dense à $\sim 90\text{ km/h}$ sur les inter-stations courtes (1.5 km), tout en permettant d'atteindre la vitesse de croisière de 120-140 km/h sur les longues inter-stations de surface (Reading-Maidenhead-Slough, Shenfield).
  - Temps de parcours synthétisés parfaitement conformes aux horaires réels TfL (66 min Reading-Abbey Wood contre 68 min réelles, 51 min Paddington-Shenfield contre 53 min réelles).
- **Élévation et emprise cartographique** :
  - Élévation visuelle paramétrée à $-15.0\text{ m}$ (tunnel foré central à grande profondeur sous le réseau sub-surface et les cours d'eau).
  - Extension de l'emprise géographique de la carte dans `cities/london/city.config.ts` : `bounds` élargi à `[[-1.05, 51.35], [0.40, 51.75]]` pour embrasser Reading à l'ouest et Shenfield à l'est sans clipping visuel. Zoom initial ajusté à 10.5.

### 19.3 Intégration Temps Réel TfL Unifié
- Ajout de `'elizabeth'` dans la liste de suivi `TFL_TUBE_LINE_IDS` dans `netlify/functions/tfl_relay.ts`.
- Endpoint d'état du trafic enrichi : interrogation groupée `/Line/Mode/tube,dlr,elizabeth-line/Status`, remontant l'état des 13 lignes en un unique appel HTTP.
- Parsing des prédictions d'arrivée opérationnel avec respect strict de la Product Honesty : les trains confirmés en ligne passent à `'measured'`, les trains théoriques demeurent à `'scheduled'`.

### 19.4 Cas Vicieux & Filet de Sécurité (`tests/london-vicious-cases.test.ts`)
- Ajout du **Cas 4 : Bifurcations & Transition Grande Vitesse de l'Elizabeth line** :
  - Validation du maintien de la vitesse de croisière surface ($> 60\text{ km/h}$) sans décélération parasite lors du franchissement des points d'aiguillage.
  - Ségrégation stricte des branches est à Stepney Green (branche Abbey Wood via Canary Wharf vs branche Shenfield via Stratford) sans collision spatiale ni saut topologique.

### 19.5 Validation & Non-Régression Strictes
- **Règle d'or respectée** : « chaque mode ajouté ensuite ne doit pas déplacer les rames des modes déjà livrés ».
  - **Paris Snapshot** : **$\Delta = 0.0000\text{ m}$** sur les 764 rames actives.
  - **Montréal Snapshot** : **$\Delta = 0.0000\text{ m}$** sur les 72 rames actives.
  - **Tube Snapshot** : **$\Delta = 0.0000\text{ m}$** et **$\Delta v = 0.0000\text{ m/s}$** sur l'intégralité des **540 rames du Tube** (stabilité millimétrique absolue garantie).
  - **DLR Snapshot** : **38 rames DLR actives**, coordonnées et vitesses strictement identiques à la livraison de la Phase 5.
  - **Flotte Elizabeth line** : **40 rames actives à 08h30 BST** (parfaitement dans la fourchette cible de 40 à 55 rames), réparties sur l'axe Reading-Heathrow-Shenfield-Abbey Wood ($\text{lon} \in [-1.02, 0.35]$, $\text{lat} \in [51.44, 51.65]$).
  - **Total rames actives simulation Londres** : **618 rames** (540 Tube + 38 DLR + 40 Elizabeth line).
- **Suites de tests globales (`npm test`)** : **100 % des 7 suites de tests validées avec succès** :
  1. `test:snapshot` (Paris) : 1/1 test passed ($\Delta = 0.0000\text{ m}$)
  2. `test:montreal-snapshot` (Montréal) : 1/1 test passed ($\Delta = 0.0000\text{ m}$)
  3. `test:london-snapshot` (Londres) : 1/1 test passed (540 Tube $\Delta = 0.0000\text{ m}$ + 38 DLR + 40 Elizabeth)
  4. `test:stm-status` : 11/11 tests passed
  5. `test:prim-status` : 13/13 tests passed
  6. `test:tfl-status` : 18/18 tests passed
  7. `test:footprint` : 43 fichiers dist vérifiés, 3 fonctions Netlify, 20 URLs premier rendu HTTP 200.

---

## 20. Phase 7 — London Overground (Livraison Complète)

### 20.1 Ingestion & Synthèse Canonique des 6 Lignes Nommées (Novembre 2024)
- **Structure du réseau Overground** :
  - Restructuration officielle TfL 2024 intégrée : remplacement de la marque générique orange par les **6 lignes distinctes** :
    1. **Liberty Line** (`liberty`, `#606667`) : Romford $\leftrightarrow$ Upminster (3 gares, 5.51 km, navette est).
    2. **Lioness Line** (`lioness`, `#EF9600`) : London Euston $\leftrightarrow$ Watford Junction (19 gares, 28.26 km, axe Watford DC partagé avec la Bakerloo line).
    3. **Mildmay Line** (`mildmay`, `#2774AE`) : Richmond $\leftrightarrow$ Stratford (23 gares, 27.93 km) et Clapham Junction $\leftrightarrow$ Stratford (23 gares, 28.70 km), l'anneau orbital ouest/nord.
    4. **Suffragette Line** (`suffragette`, `#5BA763`) : Gospel Oak $\leftrightarrow$ Barking Riverside (13 gares, 23.50 km, GOBLIN).
    5. **Weaver Line** (`weaver`, `#893B67`) : Liverpool Street $\leftrightarrow$ Enfield Town (15 gares, 17.12 km), Liverpool Street $\leftrightarrow$ Cheshunt (17 gares, 23.28 km), Liverpool Street $\leftrightarrow$ Chingford (11 gares, 16.69 km), les lignes de Lea Valley.
    6. **Windrush Line** (`windrush`, `#D22730`) : Highbury & Islington $\leftrightarrow$ West Croydon (21 gares, 21.66 km), Highbury $\leftrightarrow$ Crystal Palace (18 gares, 18.99 km), Highbury $\leftrightarrow$ Clapham Junction (18 gares, 20.47 km), Dalston Junction $\leftrightarrow$ New Cross (11 gares, 9.39 km), l'axe East & South London.
- **Topologie & Tracé Ferroviaire Physique** :
  - **12 paires d'itinéraires canoniques bidirectionnels** reliant 112 stations uniques Overground.
  - Résolution de 17 alias NaPTAN de quais et raccordement des 15 gares partagées avec le Tube (`910GGNRSBRY` $\to$ `940GZZLUGBY`, `910GHROW` $\to$ `940GZZLUHAW`, `910GQPRK` $\to$ `940GZZLUQPS`, `910GWLSDJHL` $\to$ `940GZZLUWJN`, etc.).
  - **Correction d'orientation des coordonnées de segments** : Détection et redressement des segments inversés dans le GeoJSON d'Oliver O'Brien (`WatfordJShared1`, `WatfordJShared2`) avec orientation dynamique sur le graphe Overground dédié (`lo_graph`), sans toucher au graphe Tube/DLR.
  - **Stitching parfait** : 180 tronçons testés, **0 liaison manquante**, projection des gares 100 % strictement monotone sur chaque axe.
  - **24 nouvelles formes géométriques rééchantillonnées** (shapes 371 à 394 dans `shapes.bin`).
  - **Total réseau Londres** : **447 stations physiques uniques**, 19 lignes actives, 527 tronçons de voies physiques dans `tracks.json` teintés de leur couleur nominale respective.

### 20.2 Matériel Roulant & Paramètres Cinématiques
- **Matériels consignés dans `rolling-stock.json`** :
  - **Class 378 Capitalstar** (Bombardier Derby) sur **Lioness, Mildmay, Windrush** :
    - Formation 5 caisses à intercirculation (longueur 102.2 m, largeur 2.80 m, hauteur 3.77 m, bi-mode 750 V DC 3e rail / 25 kV AC caténaire).
  - **Class 710 Aventra** (Bombardier / Alstom Derby) sur **Liberty, Suffragette, Weaver** :
    - Formation 4 caisses (longueur 82.0 m, largeur 2.80 m, hauteur 3.78 m, climatisation, bi-mode AC/DC).
- **Régime Cinématique Overground** :
  - Mode `overground` déclaré dans `cities/london/city.config.ts` : $v_{\max} = 100\text{ km/h}$ (27.8 m/s), $a = 1.0\text{ m/s}^2$, $d = 1.0\text{ m/s}^2$, dwell stationnaire de 25 s, élévation visuelle $+2.0\text{ m}$ (voies suburbaines de surface et viaducs).
  - Génération horaire : **1 528 courses du mardi** injectées dans `schedule.json` (total Londres : **12 802 courses**).

### 20.3 Intégration Temps Réel TfL Unifié
- Extension de `TFL_TUBE_LINE_IDS` dans `netlify/functions/tfl_relay.ts` aux 6 identifiants : `'liberty'`, `'lioness'`, `'mildmay'`, `'suffragette'`, `'weaver'`, `'windrush'`.
- URL de statut unifiée : `/Line/Mode/tube,dlr,elizabeth-line,overground/Status`, interrogeant les 19 lignes ferrées TfL en une seule requête HTTP.
- Product Honesty préservée : les rames Overground avec télémesure passent à `'measured'`, celles sans prédiction active restent à `'scheduled'`.

### 20.4 Cas Vicieux & Filet de Sécurité (`tests/london-vicious-cases.test.ts`)
- Ajout du **Cas 5 : Infrastructure Bi-Niveau & Corridors Partagés à Willesden Junction** :
  - Validation de la ségrégation stricte des rames Lioness (voies basses Watford DC, $-18\text{ m} \to +2\text{ m}$) et des rames Mildmay (viaduc orbital North London Line, $+2\text{ m}$).
  - Aucune interférence de snapping ni de collision topologique entre les flux ouest/nord et nord/sud se croisant à la gare bi-niveau de Willesden Junction.

### 20.5 Validation & Non-Régression Strictes
- **Règle d'or respectée** : « chaque mode ajouté ensuite ne doit pas déplacer les rames des modes déjà livrés ».
  - **Paris Snapshot** : **$\Delta = 0.0000\text{ m}$** sur les 764 rames actives.
  - **Montréal Snapshot** : **$\Delta = 0.0000\text{ m}$** sur les 72 rames actives.
  - **Tube Snapshot** : **$\Delta = 0.0000\text{ m}$** et **$\Delta v = 0.0000\text{ m/s}$** sur l'intégralité des **540 rames du Tube** (stabilité absolue).
  - **DLR Snapshot** : **38 rames DLR actives** stables à $\Delta = 0.0000\text{ m}$.
  - **Elizabeth line Snapshot** : **40 rames Elizabeth line actives** stables à $\Delta = 0.0000\text{ m}$.
  - **Flotte London Overground active à 08h30 BST** : **40 rames réparties sur les 6 lignes** :
    - Liberty : 2 rames
    - Lioness : 6 rames
    - Mildmay : 10 rames
    - Suffragette : 4 rames
    - Weaver : 6 rames
    - Windrush : 12 rames
  - **Total rames actives simulation Londres** : **658 rames** (540 Tube + 38 DLR + 40 Elizabeth line + 40 London Overground).
- **Suites de tests globales (`npm test`)** : **100 % des 7 suites de tests validées avec succès** :
  1. `test:snapshot` (Paris) : 1/1 test passed ($\Delta = 0.0000\text{ m}$)
  2. `test:montreal-snapshot` (Montréal) : 1/1 test passed ($\Delta = 0.0000\text{ m}$)
  3. `test:london-snapshot` (Londres) : 1/1 test passed (540 Tube $\Delta = 0.0000\text{ m}$ + 38 DLR + 40 Elizabeth + 40 Overground)
  4. `test:stm-status` : 11/11 tests passed
  5. `test:prim-status` : 13/13 tests passed
  6. `test:tfl-status` : 18/18 tests passed
  7. `test:footprint` : 43 fichiers dist vérifiés, 3 fonctions Netlify, 20 URLs premier rendu HTTP 200.





