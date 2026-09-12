# 🚇 Métro & RER Parisiens 3D — Visualiseur Cartographique

[![Site en direct](https://img.shields.io/badge/Site%20en%20Direct-parisian3dsubway.netlify.app-00DC82?style=flat-square&logo=netlify)](https://parisian3dsubway.netlify.app)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![deck.gl](https://img.shields.io/badge/deck.gl-9.1-blue?style=flat-square)](https://deck.gl/)
[![MapLibre GL](https://img.shields.io/badge/MapLibre%20GL-4.7-2980b9?style=flat-square)](https://maplibre.org/)
[![IDFM PRIM](https://img.shields.io/badge/Donn%C3%A9es-IDFM%20PRIM%20SIRI--Lite-0055A5?style=flat-square)](https://prim.iledefrance-mobilites.fr/)

Application web cartographique modélisant en temps réel la circulation du **métro et RER parisien** sur un jumeau numérique cartographique de Paris.

Accès direct en production : **[https://parisian3dsubway.netlify.app](https://parisian3dsubway.netlify.app)**

---

## 🌟 Fonctionnalités Clés

1. **Une Seule Scène 3D, Trois Stratégies de Rendu des Rames** :
   - **Marqueurs** (`trains_layer.ts`, `z < 9`) : pastilles de repli portant le niveau de confiance (`measured` / `bracketed` / `extrapolated` / `scheduled`).
   - **Capsules métriques** (`capsule_layer.ts`, `z ≥ 9`) : caisses découpées dans le tracé réel, toitures, soufflets, phares et feux LED, halo or pour les rames recalées.
   - **Modèles glTF** (`train_models_layer.ts`, `z > 16`) : `ScenegraphLayer` instanciant une caisse par voiture, familles `pneumatic_generic` et `steel_classic`. Désactivables via `?train-models=0`.
   - Fond vectoriel OpenFreeMap, relief DEM (exagération ×1,5) et bâti 3D `fill-extrusion` activable depuis l'en-tête.

2. **Moteur de Circulation In-Browser à Cinématique Trapézoïdale** :
   - Simulation autonome cadencée à 1 Hz exploitant les 11 252 courses commerciales de la journée (`schedule.json`).
   - Profil cinématique trapézoïdal : 25 % d'accélération, 50 % de croisière, 25 % de freinage, plafond à 85 km/h, plus le stationnement en station.
   - Interpolation à 60 FPS entre deux ticks (`requestAnimationFrame`), avec résorption des écarts sur 300 ms et recalage franc au-delà de 20 m.
   - Calcul des azimuts et des caps lissés sur ±30 m le long de tracés binaires SHP2 compressés (`shapes.bin`).

3. **Synchronisation Temps Réel PRIM (Île-de-France Mobilités)** :
   - Relais Netlify côté serveur vers le flux officiel SIRI-Lite `EstimatedTimetable`, planifié toutes les 3 minutes, cache 180 s.
   - Recalage des courses théoriques sur les passages réels (`rt_matching.ts`) et exposition de **4 niveaux de confiance** — mesuré, encadré, extrapolé, théorique.
   - Lissage exponentiel des écarts avec $\alpha = 0.4$, fenêtre d'appariement de 120 s, oubli après 6 min sans donnée fraîche.
   - Pastilles rames dynamiques : halo **or** pour les rames mesurées ou encadrées, halo blanc cassé et contour pointillé pour le théorique.

4. **« Le Quai » & Diagramme de Marche Vertical (Niveau 2)** :
   - Rail latéral escamotable avec les pastilles de lignes (16 lignes de métro + 5 lignes RER natives).
   - Diagramme vertical des stations avec commutateur de terminus (direction A ⇄ B).
   - Visualisation en direct des rames en approche en face de leur prochain arrêt avec vitesse instantanée et retard calculé.
   - Indicateur en direct d'intervalle moyen (*headway*).

5. **Recherche Instantanée de Stations (`⌘K` / Loupe)** :
   - Autocomplétion floue instantanée sur les 468 stations publiées du réseau.
   - Affichage des pastilles officielles des correspondances et tags Hub.
   - Vol de caméra cinématique immédiat avec zoom 16x sur la station choisie.

6. **Optimisation Mobile Smartphone & Typographie Institutionnelle** :
   - Tiroir rétractable en bas d'écran (Bottom Sheet tactile) avec support des zones protégées (`safe-area-inset`).
   - Typographie **Switzer** pour l'interface et **Cabinet Grotesk** pour les titres, servies par Fontshare, avec **Inter** en repli ; chiffres tabulaires (`tnum`) pour les chronomètres et indices de lignes.
   - Cibles tactiles de 52 px sur mobile, et plafond de 150 rames découpées simultanément.

7. **Vertu de Bande Passante** :
   - Voies dédupliquées **24,6 Ko** (`tracks.json`), tracés binaires **0,80 Mo** brut (**0,17 Mo Brotli**, `shapes.bin.br`) — ces deux artefacts étant considérés comme les plus critiques par la carte réseau.

---

## 🏛️ Architecture du Projet

```
Paris subway 3D/
├── docs/                        # Documentation technique détaillée
│   ├── ARCHITECTURE.md          # Architecture logicielle & flux de données
│   ├── DATA_PIPELINE.md         # Ingestion GTFS, rééchantillonnage & projection
│   ├── SIMULATION_ENGINE.md     # Moteur cinématique in-browser & profil trapézoïdal
│   ├── REALTIME_PRIM.md         # Intégration de l'API IDFM PRIM SIRI-Lite
│   ├── 3D_RENDERING.md          # MapLibre, deck.gl, bâti 3D et matériel roulant
│   ├── UI_AND_ROUTING.md        # Interface utilisateur, Quai & routage SPA
│   ├── DEPLOYMENT_AND_OPS.md    # Build, Netlify, en-têtes CDN & exploitation
│   └── CHARTE-intERVALLE-sprague.md # Charte typographique (spécification)
│
├── ingest/                      # Pipeline d'ingestion Python
│   ├── fetch.py                 # Téléchargement du flux GTFS officiel IDFM
│   ├── filter_metro.py          # Filtrage strict sur les lignes de métro
│   ├── resample.py              # Rééchantillonnage métrique à pas fixe
│   ├── project.py               # Projection curviligne strictement monotone
│   ├── sections.py              # Inventaire des sections OSM (aérien / sol / souterrain)
│   ├── rer_artifacts.py         # Artefacts des 5 lignes RER natives
│   └── main.py                  # Orchestrateur du pipeline complet
│
├── scripts/                     # Scripts de traitement & génération
│   ├── build_line_ladders.py    # Génération de line_ladders.json
│   ├── build_sections.py        # Section inventory dérivé d'OSM (politique de caméra)
│   ├── build_station_rankings.py# Rangs de desserte GTFS (semaine / samedi / dimanche)
│   ├── build_train_box_models.py# Génération clean-room des caisses GLB (1 voiture/fichier)
│   ├── check_train_box_models.py# Assertion du contrat de rendu sur chaque GLB produit
│   ├── publish_train_models.py  # Projection des GLB internes vers l'input de build web
│   ├── generate_tracks_json.py  # Déduplication des tracés (24,6 Ko publiés)
│   ├── fix_l7_kinks.py          # Ré-encodage des tracés canoniques nettoyés
│   ├── generate_geo_audit.py    # Régénère docs/cartographie_geographie_reseau.md
│   └── deploy_netlify.py        # Déploiement ZIP direct via l'API Netlify
│
├── engine/                      # Service local optionnel (HTTP + WebSocket, port 4000)
│   ├── src/server.ts            # Serveur, endpoint /health, relais PRIM
│   ├── src/kinematics.ts        # Cinématique serveur (miroir du moteur web)
│   ├── src/loader.ts            # Chargement des artefacts locaux
│   └── tests/                   # Audit contrôles, benchmark FPS, vérification RT
│
├── netlify/functions/           # Façade serverless
│   ├── prim_relay.ts            # Relais PRIM + cache, planifié */3 * * * *
│   └── prim_delays.ts           # Ré-export de prim_relay
│
├── packages/shared/             # Code partagé web ⇄ engine
│   └── src/                     # constants, lines, protocol, train, index
│
├── web/                         # Application Web Front-End (Vite + TypeScript)
│   ├── public/data/             # Données servies au client
│   │   ├── lines.json           # Métadonnées des 21 lignes métro + RER
│   │   ├── stations.json        # 468 stations publiées, dont 164 RER filtrées
│   │   ├── tracks.json          # 24 tracés de voies dédupliqués (24,6 Ko)
│   │   ├── shapes.bin           # Buffer binaire SHP2 quantifié (0,80 Mo)
│   │   ├── shapes.bin.br        # Copie Brotli (0,17 Mo)
│   │   ├── schedule.json        # 11 252 courses actives de la journée (8,31 Mo)
│   │   ├── line_ladders.json    # Arborescence des diagrammes de marche (409 Ko)
│   │   ├── sections.json        # Sections aériennes / sol / souterraines
│   │   ├── station-rankings.json# Rangs de desserte par station
│   │   ├── rer_lines.json       # Tracés régionaux filtrés par ligne RER
│   │   ├── rolling-stock.json   # Matériel roulant & dimensions métriques
│   │   └── model-assets-manifest.json # Contrat de rendu des GLB de rame
│   ├── public/models/train/     # 2 caisses GLB clean-room (pneu, fer)
│   ├── src/
│   │   ├── main.ts              # Point d'entrée, orchestration & modales
│   │   ├── map/                 # Couche cartographique (MapLibre + deck.gl)
│   │   ├── sim/                 # Moteur cinématique, recalage temps réel & PRIM
│   │   ├── ui/                  # Dock, diagramme vertical, en-tête, recherche
│   │   ├── state/               # Routeur d'URL SPA
│   │   └── styles/              # Design tokens CSS & styles
│   └── package.json
└── README.md
```

---

## 🚀 Démarrage Rapide en Local

### Prérequis
- Node.js >= 18 (monorepo npm workspaces : `packages/*`, `web`, `engine`)
- Python >= 3.9 (avec `shapely`, `requests`, `numpy` pour régénérer les données)

### Installation & Lancement

```bash
# 1. Cloner le projet
git clone https://github.com/Morgan98800/Kerbal-Water.git "Paris subway 3D"
cd "Paris subway 3D"

# 2. Installer les dépendances (à la racine, workspaces npm)
npm install

# 3. Lancer le serveur de développement Vite du client web
npm run dev:web
```

L'application est immédiatement accessible sur **`http://localhost:3000`** (port déclaré dans
`web/vite.config.ts`, qui ouvre aussi le navigateur automatiquement). Le port `5173` correspond
au défaut de Vite : il n'est **pas** utilisé ici.

### Compilation de Production

```bash
# Depuis la racine : publie les GLB, régénère le manifeste, puis build Vite
npm run build:web
```

Les fichiers statiques prêts pour la production sont générés dans `web/dist/`.

### Service local optionnel (`engine/`)

```bash
npm --workspace=engine run dev     # node --watch src/server.js
# HTTP + WebSocket sur http://localhost:4000 (PORT surchargeable), endpoint /health
```

Ce service n'est pas nécessaire au fonctionnement du site : il sert aux tests d'audit
(`npm --workspace=engine run test`, `node --test`) et au relais PRIM local. Le client
`web/src/net/ws_client.ts` est présent mais n'est importé par aucun point d'entrée.

---

## 📚 Documentation Détaillée

Consultez les guides techniques dédiés dans le dossier [`docs/`](file:///Users/morgancanteri/Documents/Paris%20subway%203D/docs/) :

- **[Architecture & Flux Global](docs/ARCHITECTURE.md)** : Schémas d'architecture, couches de données, code-splitting et performances.
- **[Pipeline de Données](docs/DATA_PIPELINE.md)** : Extraction GTFS, projection monotone, formats binaires et optimisations de payload.
- **[Moteur de Simulation & Cinématique](docs/SIMULATION_ENGINE.md)** : Moteur autonome, profil trapézoïdal, calcul de vitesse et headway.
- **[Temps Réel PRIM SIRI-Lite](docs/REALTIME_PRIM.md)** : relais côté serveur, fenêtre de service, rapprochement course↔théorique et recalage des rames.
- **[Rendu Visuel 2.5D & 3D](docs/3D_RENDERING.md)** : MapLibre, deck.gl, bâti vectoriel et matériel roulant.
- **[Interface Utilisateur & Navigation](docs/UI_AND_ROUTING.md)** : Composants UI, ergonomie smartphone, raccourcis et routage SPA.
- **[Déploiement & Exploitation](docs/DEPLOYMENT_AND_OPS.md)** : Build Vite, Netlify, en-têtes CDN et poids des bundles.
- **[Audit géométrique](docs/cartographie_geographie_reseau.md)** : fichier **généré** par `scripts/generate_geo_audit.py` — ne pas éditer à la main.
- **[Charte typographique](docs/CHARTE-intERVALLE-sprague.md)** : spécification de design (voir l'encadré de statut en tête de fichier).
- **[Audits historiques](DESIGN_AUDIT.md)** : relevés de mesures datés (`DESIGN_AUDIT.md`, `MOBILE_AUDIT.md`) — ils décrivent l'état du produit au moment de la mesure, pas l'état courant.

---

## 📜 Licence & Données
- Données théoriques : **GTFS Île-de-France Mobilités** (Licence Ouverte v2.0).
- Données temps réel : **API PRIM / SIRI-Lite** (Île-de-France Mobilités).
- Fond cartographique : **OpenFreeMap** (tuiles vectorielles schéma OpenMapTiles, © OpenStreetMap). Relief : `demotiles.maplibre.org`. Aucun fond Esri, Mapbox ou Google n'est utilisé.
- Typographies : **Switzer** et **Cabinet Grotesk** (Fontshare), **Inter** (Google Fonts, repli).
- Code source : Développé dans le cadre du visualiseur 3D du métro parisien.
