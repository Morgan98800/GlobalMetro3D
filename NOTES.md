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
