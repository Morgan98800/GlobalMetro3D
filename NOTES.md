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


