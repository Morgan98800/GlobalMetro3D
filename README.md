# 🚇 Métro Parisien 3D — Visualiseur Cartographique & Studio 3D

[![Site en direct](https://img.shields.io/badge/Site%20en%20Direct-parisian3dsubway.netlify.app-00DC82?style=flat-square&logo=netlify)](https://parisian3dsubway.netlify.app)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/Three.js-0.186-black?style=flat-square&logo=three.js)](https://threejs.org/)
[![deck.gl](https://img.shields.io/badge/deck.gl-9.1-blue?style=flat-square)](https://deck.gl/)
[![MapLibre GL](https://img.shields.io/badge/MapLibre%20GL-4.7-2980b9?style=flat-square)](https://maplibre.org/)
[![IDFM PRIM](https://img.shields.io/badge/Donn%C3%A9es-IDFM%20PRIM%20SIRI--Lite-0055A5?style=flat-square)](https://prim.iledefrance-mobilites.fr/)

Application web cartographique et studio 3D immersif modélisant en temps réel la circulation intégrale du **métro et RER parisien** (~500 rames simultanées) sur un jumeau numérique 3D haute fidélité de Paris.

Accès direct en production : **[https://parisian3dsubway.netlify.app](https://parisian3dsubway.netlify.app)**

---

## 🌟 Fonctionnalités Clés

1. **Dualité Graphique Instantanée (Bouton `🗼` / `🗺️`)** :
   - **Vue Cartographique 2.5D (MapLibre + deck.gl)** : fond de carte sombre Esri haute performance, extrusion 3D des 16 lignes de métro avec décalage altimétrique aux croisements souterrains, rames blanc porcelaine à haut contraste avec cœur de couleur de ligne.
   - **Studio 3D Paris « Ville Lumière » (Three.js)** : maquette 3D architecturale complète avec surface miroitante de la Seine, Île de la Cité, Île Saint-Louis, 15 ponts historiques, 3 923 immeubles haussmanniens instanciés à 60 FPS, quartier d'affaires de La Défense, Tour Eiffel avec phare rotatif 360° en temps réel, butte Montmartre avec Sacré-Cœur blanc, et réseau de métro néon en radiographie sous la ville.

2. **Moteur de Circulation In-Browser à Cinématique Trapézoïdale** :
   - Simulation autonome cadencée à 1 Hz exploitant les 11 252 courses commerciales de la journée (`schedule.json`).
   - Profil cinématique trapézoïdal réaliste : accélération progressive ($1.0\text{ m/s}^2$), palier de croisière ($60\text{ à }80\text{ km/h}$), décélération douce ($1.1\text{ m/s}^2$), et stationnement en station.
   - Calcul des azimuts et des caps lissés le long de tracés binaires compressés (`shapes.bin`).

3. **Synchronisation Temps Réel PRIM (Île-de-France Mobilités)** :
   - Connexion directe au flux officiel SIRI-Lite `EstimatedTimetable`.
   - Régulation par Token Bucket (15 requêtes/minute, respect strict des quotas).
   - Calcul différencié des retards par sens de circulation (`dir=0` vs `dir=1`) avec lissage exponentiel ($\alpha = 0.35$).
   - Pastilles rames dynamiques : bague or/ambre pulsante en cas de recalage temps réel.

4. **« Le Quai » & Diagramme de Marche Vertical (Niveau 2)** :
   - Rail latéral escamotable avec les 16 pastilles de lignes (1 à 14, 3bis, 7bis).
   - Diagramme vertical des stations avec commutateur de terminus (direction A ⇄ B).
   - Visualisation en direct des rames en approche en face de leur prochain arrêt avec vitesse instantanée et retard calculé.
   - Indicateur en direct d'intervalle moyen (*headway*).

5. **Recherche Instantanée de Stations (`⌘K` / Loupe)** :
   - Autocomplétion floue instantanée sur les 321 stations du réseau.
   - Affichage des pastilles officielles des correspondances et tags Hub.
   - Vol de caméra cinématique immédiat avec zoom 16x sur la station choisie.

6. **Optimisation Mobile Smartphone & Typographie Institutionnelle** :
   - Tiroir rétractable en bas d'écran (Bottom Sheet tactile) avec support des zones protégées (`safe-area-inset`).
   - Typographie **Inter** pour l'interface et **Archivo 800** pour les titres, avec chiffres tabulaires (`tnum`) pour les chronomètres et indices de lignes.
   - Allègement réseau radical : seulement **107 Ko** pour le réseau de voies (`tracks.json`), divisant par 4 le temps de chargement sur smartphone.

---

## 🏛️ Architecture du Projet

```
Paris subway 3D/
├── docs/                        # Documentation technique détaillée
│   ├── ARCHITECTURE.md          # Architecture logicielle & flux de données
│   ├── DATA_PIPELINE.md         # Ingestion GTFS, rééchantillonnage & projection
│   ├── SIMULATION_ENGINE.md     # Moteur cinématique in-browser & profil trapézoïdal
│   ├── REALTIME_PRIM.md         # Intégration de l'API IDFM PRIM SIRI-Lite
│   ├── 3D_RENDERING.md          # Moteurs deck.gl & Three.js Studio 3D
│   └── UI_AND_ROUTING.md        # Interface utilisateur, Quai & routage SPA
│
├── ingest/                      # Pipeline d'ingestion Python
│   ├── fetch.py                 # Téléchargement du flux GTFS officiel IDFM
│   ├── filter_metro.py          # Filtrage strict sur les 16 lignes de métro
│   ├── resample.py              # Rééchantillonnage métrique à pas fixe 10m
│   ├── project.py               # Projection curviligne strictement monotone
│   └── build_artifacts.py       # Génération des artefacts normalisés
│
├── scripts/                     # Scripts de traitement & génération
│   ├── build_line_ladders.py    # Génération de line_ladders.json
│   ├── generate_tracks_json.py  # Extraction optimisée de tracks.json (108 Ko)
│   └── generate_paris_3d_data.py# Génération de paris_urban_mesh.json (3D Paris)
│
├── web/                         # Application Web Front-End (Vite + TypeScript)
│   ├── public/data/             # Données servies au client
│   │   ├── lines.json           # Métadonnées des 16 lignes
│   │   ├── stations.json        # 321 stations consolidées avec correspondances
│   │   ├── tracks.json          # Polylignes simplifiées des voies (108 Ko)
│   │   ├── shapes.bin           # Buffer binaire Float32Array (1.7 Mo)
│   │   ├── schedule.json        # 11 252 courses actives de la journée
│   │   ├── line_ladders.json    # Arborescence des diagrammes de marche
│   │   ├── rer_lines.json       # Tronçons centraux des RER A, B, C, D, E
│   │   └── paris_urban_mesh.json# Bâtiments haussmanniens, Seine & ponts 3D
│   ├── src/
│   │   ├── main.ts              # Point d'entrée, orchestration & code-splitting
│   │   ├── map/                 # Couche cartographique (MapLibre + deck.gl)
│   │   ├── sim/                 # Moteur cinématique & client PRIM
│   │   ├── three/               # Scène 3D Paris (Three.js), Seine & monuments
│   │   ├── ui/                  # Dock, diagramme vertical, barre de recherche
│   │   ├── state/               # Routeur d'URL SPA
│   │   └── styles/              # Design tokens CSS & styles
│   └── package.json
└── README.md
```

---

## 🚀 Démarrage Rapide en Local

### Prérequis
- Node.js >= 18
- Python >= 3.9 (avec `shapely`, `requests`, `numpy` pour régénérer les données)

### Installation & Lancement

```bash
# 1. Cloner le projet
git clone https://github.com/Morgan98800/Kerbal-Water.git "Paris subway 3D"
cd "Paris subway 3D"

# 2. Installer les dépendances du client web
cd web
npm install

# 3. Lancer le serveur de développement Vite
npm run dev
```

L'application est immédiatement accessible sur `http://localhost:5173`.

### Compilation de Production

```bash
cd web
npm run build
```

Les fichiers statiques prêts pour la production sont générés dans `web/dist/`.

---

## 📚 Documentation Détaillée

Consultez les guides techniques dédiés dans le dossier [`docs/`](file:///Users/morgancanteri/Documents/Paris%20subway%203D/docs/) :

- **[Architecture & Flux Global](docs/ARCHITECTURE.md)** : Schémas d'architecture, couches de données, code-splitting et performances.
- **[Pipeline de Données](docs/DATA_PIPELINE.md)** : Extraction GTFS, projection monotone, formats binaires et optimisations de payload.
- **[Moteur de Simulation & Cinématique](docs/SIMULATION_ENGINE.md)** : Moteur autonome, profil trapézoïdal, calcul de vitesse et headway.
- **[Temps Réel PRIM SIRI-Lite](docs/REALTIME_PRIM.md)** : Quotas, token bucket, parsing des retards et recalage des courses.
- **[Rendu Visuel 2.5D & 3D](docs/3D_RENDERING.md)** : deck.gl vs Three.js, instanciation urbaine, Seine, monuments et phares rotatifs.
- **[Interface Utilisateur & Navigation](docs/UI_AND_ROUTING.md)** : Composants UI, ergonomie smartphone, raccourcis et routage SPA.

---

## 📜 Licence & Données
- Données théoriques : **GTFS Île-de-France Mobilités** (Licence Ouverte v2.0).
- Données temps réel : **API PRIM / SIRI-Lite** (Île-de-France Mobilités).
- Fond cartographique : **Esri Dark Gray Canvas**.
- Code source : Développé dans le cadre du visualiseur 3D du métro parisien.
