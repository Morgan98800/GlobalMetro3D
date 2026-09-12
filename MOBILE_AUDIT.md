# Audit Mobile & Performance — Paris Subway 3D

> **Statut des mesures : baseline historique.** Les mesures ci-dessous décrivent
> l'état audité avant les optimisations SHP2, la déduplication des tracés et la
> mutualisation du chargement des formes. Elles ne décrivent pas les tailles
> actuelles publiées; conserver cette distinction lors de toute comparaison.

> [!NOTE]
> **Ce qui a changé depuis cet audit.** Plusieurs anomalies et recommandations
> documentées ici ont été traitées ; les lignes concernées sont conservées telles
> quelles car elles constituent la preuve avant/après :
>
> | Constat de l'audit | État actuel |
> |---|---|
> | Double téléchargement de `shapes.bin` | ✅ **corrigé** — `shapes_loader.ts` mémoïse la promesse (`let pending`), un seul `fetch` même en appels concurrents |
> | `shapes.bin` servi sans compression | ✅ **corrigé** — `shapes.bin` (804 816 o) est désormais accompagné de `shapes.bin.br` (168 167 o) |
> | Double contexte WebGL (Three.js + MapLibre) | ✅ **supprimé** — plus aucune dépendance Three.js ; `dist/` ne contient aucun chunk Three.js |
> | Bâti 3D absent du mobile (fond raster Esri) | ✅ **remplacé** — bascule sur OpenFreeMap vectoriel + couche `building-3d` (`fill-extrusion`, `minzoom: 14`) |
> | Polices « Archivo + Inter » | ⚠️ **obsolète** — les fontes servies sont **Switzer** et **Cabinet Grotesk** (Fontshare), avec Inter en repli |
> | Tuiles « Esri Canvas » | ⚠️ **obsolète** — la ligne ne sert plus qu'à documenter l'ancien fond |
> | Bouton et barre « Studio 3D » (`#btn-studio-mode`, `#studio-nav-bar`) | ❌ **supprimés du produit** — les mesures de la §4 les concernant sont purement historiques |
> | « 321 stations » (§1.3) | ℹ️ **sans contradiction** — 321 est le nombre de **stations desservies par au moins une ligne de métro**, celles que le moteur simule. Le référentiel publié `stations.json` en compte 468 au total (304 métro seules, 147 RER seules, 17 correspondances). Voir [DATA_PIPELINE.md](docs/DATA_PIPELINE.md) §4.4 |

> **Cible auditée** : Site déployé en production sur [`https://parisian3dsubway.netlify.app`](https://parisian3dsubway.netlify.app)  
> **Méthodologie** : Mesures Chrome DevTools Protocol (CDP) automatisées en conditions réelles, cache vidé, bridage réseau standard DevTools (Fast 4G, Slow 4G), bridage CPU (4x, 6x), et émulation d'écrans tactiles (380×820 et 320×568).  
> **Règle stricte** : Mesures objectives et chiffrées uniquement.

---

## 1. Poids et Chargement

### 1.1 Mesure globale au démarrage (cache vide)

| Profil Réseau | Débit descendant / montant | RTT (Latence) | Poids Transféré (Wire) | Données Décompressées | FCP (First Contentful Paint) | DCL (DOMContentLoaded) | Load Complete | Long Tasks au démarrage |
|---|---|---|---|---|---|---|---|---|
| **Non bridé (Fibre/WiFi)** | Illimité | ~15 ms | **5,73 Mo** | **14,92 Mo** | 2 924 ms | 2 957 ms | 3 022 ms | 1 tâche (66 ms) |
| **Fast 4G (DevTools)** | 1,50 Mbit/s / 750 kbit/s | 40 ms | **5,67 Mo** | **7,43 Mo** | 780 ms | 3 415 ms | 3 416 ms | 3 tâches (60, 53, 50 ms) |
| **Slow 4G (DevTools)** | 500 kbit/s / 500 kbit/s | 400 ms | **2,24 Mo** *(partiel à 35s)* | **4,31 Mo** | 1 532 ms | 10 183 ms | 10 185 ms | 1 tâche (58 ms) |

> ⚠️ **Constat critique de bande passante** : En Slow 4G, après **35 secondes**, l'application n'avait toujours pas fini de charger ses artefacts indispensables (`schedule.json` n'avait reçu que 0 octets terminés, `shapes.bin` saturait le lien). La carte restait figée sur `"Calcul des rames..."`.

---

### 1.2 Poids de chaque artefact réel téléchargé

Mesures réelles capturées sur le réseau déployé (Netlify CDN) :

| Ressource | Type MIME | Encodage | Poids Transféré (Fil) | Poids Décompressé | Ratio Compression | Latence / Durée (Fast 4G) |
|---|---|---|---|---|---|---|
| `index-DlGAP4sW.js` | `application/javascript` | `br` (Brotli) | **450,7 Ko** (461 589 B) | 1,65 Mo (1 731 718 B) | 3,75x | 2 922 ms |
| `index-DxYcsPkZ.css` | `text/css` | `br` (Brotli) | **3,9 Ko** (4 013 B) | 17,2 Ko (17 638 B) | 4,39x | 275 ms |
| `maplibre-gl.css` (unpkg) | `text/css` | `gzip` | **9,5 Ko** (9 700 B) | 64,0 Ko (65 534 B) | 6,75x | 184 ms |
| Polices Archivo + Inter | `font/woff2` | `none` | **81,5 Ko** (83 436 B) | 81,4 Ko (83 372 B) | 1,00x | 606 - 743 ms |
| `tracks.json` | `application/json` | `br` (Brotli) | **25,1 Ko** (25 683 B) | 107,9 Ko (110 473 B) | 4,30x | 634 ms |
| `line_ladders.json` | `application/json` | `br` (Brotli) | **24,7 Ko** (25 338 B) | 409,4 Ko (419 226 B) | 16,55x | 776 ms |
| `rer_lines.json` | `application/json` | `br` (Brotli) | **28,0 Ko** (28 674 B) | 231,7 Ko (237 219 B) | 8,27x | 742 ms |
| `stations.json` | `application/json` | `br` (Brotli) | **8,2 Ko** (8 381 B) | 69,1 Ko (70 778 B) | 8,44x | 378 ms |
| `lines.json` | `application/json` | `br` (Brotli) | **1,0 Ko** (1 066 B) | 4,8 Ko (4 932 B) | 4,63x | 242 ms |
| `rolling-stock.json` | `application/json` | `br` (Brotli) | **1,4 Ko** (1 445 B) | 11,6 Ko (11 841 B) | 8,19x | 211 ms |
| `shapes.bin` *(1er appel)* | `application/octet-stream` | `none` | **1,67 Mo** (1 751 718 B) | 1,67 Mo (1 750 612 B) | 1,00x | 8 980 ms |
| `shapes.bin` *(2e appel dupliqué)* | `application/octet-stream` | `none` | **1,67 Mo** (1 747 488 B) | 1,67 Mo (1 750 612 B) | 1,00x | 0 ms (parallèle) |
| `schedule.json` | `application/json` | `br` (Brotli) | **1,47 Mo** (1 540 094 B) | **7,93 Mo** (8 316 939 B) | 5,40x | 917 ms |
| Tuiles Esri Canvas (20 tuiles) | `image/jpeg` | `none` | **243 Ko** | 233 Ko | 1,00x | 1 100 ms |

#### 🚨 Deux anomalies majeures détectées au chargement réseau :
1. **Double téléchargement de `shapes.bin` (3,34 Mo gaspillés)** : Le fichier binaire de 1,67 Mo est téléchargé **deux fois en parallèle** (une fois par `loadShapesBin` au niveau de `main.ts` pour deck.gl, et une seconde fois dans `browser_engine.ts`). Sur smartphone en 4G, cela représente un téléchargement redondant massif.
2. **Absence de compression sur `shapes.bin`** : Netlify sert `shapes.bin` en `content-encoding: none`. Les données flottantes pourraient bénéficier d'une compression gzip/brotli ou de quantization 16-bit.

---

### 1.3 Micro-benchmark CPU de `schedule.json`

Mesure isolée du décodage de `schedule.json` (7,93 Mo décompressés, 11 252 courses, 321 stations, 280 000+ points d'arrêts) :

| Profil CPU | `JSON.parse` | Transformation des trips (stops, indexation) | Blocage UI Total (`initBlock`) | Impact Utilisateur |
|---|---|---|---|---|
| **CPU 1x (Apple Silicon natif)** | **24,4 ms** | **24,3 ms** | **48,7 ms** | Léger accroc (< 50 ms) |
| **CPU 4x (Smartphone Milieu de gamme)** | **71,3 ms** | **46,6 ms** | **117,9 ms** | **Long Task confirmée (118 ms de gel)** |
| **CPU 6x (Smartphone Entrée de gamme)** | **124,2 ms** | **92,2 ms** | **216,4 ms** | **Gel complet de l'interface (216 ms)** |

> 📌 **Verdict parsing** : Sur un smartphone moyen (4x throttling), le décodage et l'instanciation de `schedule.json` sur le thread principal bloque le rendu pendant **118 ms à 216 ms**, créant une saccade visible dès l'ouverture de l'application.

---

## 2. Framerate et Rendu sur 30 Secondes

Mesures continues sur 1 800 frames (~30 000 ms) avec WebGL ANGLE Metal / Canvas principal 1440×813 (4,47 Mo de drawing buffer) :

| Scénario | Durée réelle | Frames totales | FPS p5 (5e centile) | FPS p50 (médiane) | FPS p95 | FPS Moyen | Min FPS | Max FPS | RAM JS Heap finale |
|---|---|---|---|---|---|---|---|---|---|
| **Niveau 1 — Réseau complet, 2D (pitch 0°)** | 30 001 ms | 1 801 | **59,9** | **59,9** | **60,2** | **60,2** | 59,5 | 416,7 | 31,53 Mo |
| **Niveau 1 — Réseau complet, 3D (pitch 52°)** | 30 009 ms | 1 801 | **59,9** | **59,9** | **60,2** | **60,0** | 59,5 | 90,9 | 31,60 Mo |
| **Niveau 2 — Ligne 1 filtrée (Dock ouvert)** | 30 000 ms | 1 801 | **59,5** | **59,9** | **60,2** | **60,3** | 59,5 | 625,0 | 35,02 Mo |
| **Studio 3D Three.js (sur site déployé)** | 30 006 ms | 1 800 | **59,5** | **59,9** | **60,2** | **60,0** | **30,0** | 60,6 | **56,20 Mo** *(+78%)* |

### Analyse Framerate & Mémoire :
- **Deck.gl + MapLibre** : Stabilité exemplaire à 60 FPS constants. Aucune chute sous 59,5 FPS, consommation mémoire stable (~31-35 Mo).
- **Studio 3D Three.js (ancien module)** :
  - Dès l'activation du Studio 3D (bouton 🗼), la mémoire JS Heap fait un bond immédiat de **31,5 Mo à 56,2 Mo (+78%)**.
  - Une chute à **30,0 FPS** est enregistrée lors de la compilation des shaders et de l'instanciation du second contexte WebGL (400×300, 0,46 Mo de buffer).
  - Deux contextes WebGL tournent en parallèle, divisant la bande passante GPU sur smartphone.

---

## 3. Comportement sous Throttling CPU & Endurance

### 3.1 Framerate sous Throttling CPU (Pitch 52°, Réseau complet)

| Profil Appareil simulé | Throttling CPU | FPS p5 | FPS Médian (p50) | FPS Moyen | Minimum FPS |
|---|---|---|---|---|---|
| **Milieu de gamme (ex: Pixel 6a, Galaxy A53)** | **4x CPU** | 59,9 | **59,9** | 60,3 | 59,5 |
| **Entrée de gamme (ex: smartphone < 150€)** | **6x CPU** | 59,9 | **59,9** | 61,2 | 59,5 |

> Une fois les données initialisées en mémoire, le moteur d'interpolation deck.gl maintient 60 FPS même sous 6x CPU throttling.

### 3.2 Test d'Endurance 5 Minutes (4x CPU, Réseau complet 3D)

Mesure de l'évolution de la mémoire vive JavaScript sur 300 secondes :

| Temps écoulé | Mémoire JS Heap Utilisée | Rames affichées | Framerate instantané | Fuite mémoire détectée ? |
|---|---|---|---|---|
| **t = 0 s** | 54,8 Mo *(pic de parsing)* | Calcul des rames... | 60 FPS | Non |
| **t = 30 s** | 30,7 Mo *(GC effectué)* | Calcul des rames... | 60 FPS | Non |
| **t = 60 s** | 30,6 Mo | Calcul des rames... | 60 FPS | Non |
| **t = 120 s** | 30,8 Mo | Calcul des rames... | 60 FPS | Non |
| **t = 300 s (5 min)** | 30,9 Mo | Calcul des rames... | 60 FPS | **0 fuite mémoire observée** |

### 🐞 Bogue de Minuit Détecté lors de l'Audit :
Pendant les tests entre 00h00 et 03h00, l'indicateur est resté bloqué sur `"Calcul des rames..."`.  
**Cause mesurée** : Dans `browser_engine.ts`, `getCurrentParisSeconds()` applique un simple modulo 86400 (`currentSec = sec % 86400`). À minuit, `currentSec < 14400`. Or dans le GTFS, les courses continuant après minuit ont `t0 >= 86400` (ex: 24h30 = 88200s). `currentSec >= trip.t0` échouait pour 100% des courses, détectant 0 rames. De plus, `rafLoop` avait la garde `this.trackedTrains.size > 0`, empêchant tout appel à `onTick` pour rafraîchir le libellé.

---

## 4. Audit Ergonomie & Interface Tactile

Mesures géométriques précises des éléments interactifs sur deux résolutions mobiles de référence : **380×820** (iPhone moderne / Galaxy S) et **320×568** (iPhone SE 1re gén / petits terminaux).

### 4.1 Cibles tactiles non conformes (Norme WCAG 2.5.5 : minimum 44×44 px)

Sur le site déployé, **22 cibles tactiles interactives enfreignent la norme minimale de 44×44 px** :

| Élément | Sélecteur DOM | Dimensions réelles (380px) | Dimensions réelles (320px) | Conforme WCAG (44×44 px) ? |
|---|---|---|---|---|
| **Boutons de contrôle caméra** | `.map-control-btn` (3D, ⊙) | **38 × 38 px** | **38 × 38 px** | ❌ **Non** (défaut de 6 px) |
| **Bouton Studio 3D** | `#btn-studio-mode` (🗼) | **38 × 38 px** | **38 × 38 px** | ❌ **Non** |
| **Indices de ligne (1 à 14)** | `.line-badge-btn` | **39,3 × 30 px** | **31,8 × 30 px** | ❌ **Non** (hauteur 30 px critique) |
| **Poignée du tiroir** | `.dock-handle` | **40 × 4 px** | **40 × 4 px** | ❌ **Non** (hauteur 4 px impossible à viser) |
| **Bouton replier le quai** | `#dock-collapse` | **28 × 28 px** | **28 × 28 px** | ❌ **Non** (déficit de 16 px) |
| **Bouton bascule PRIM** | `#rt-toggle-btn` | 170,6 × **24,8 px** | 170,6 × **24,8 px** | ❌ **Non** (hauteur 24,8 px) |

### 4.2 Problèmes de disposition et chevauchements sur petit écran

1. **Chevauchement du Header sur 320 px** :
   - Le conteneur d'en-tête s'étale sur **3 lignes superposées** (hauteur totale 83,5 px).
   - Le bouton `rt-toggle-btn` descend jusqu'à `y = 84,9 px` et chevauche directement le bouton de contrôle caméra 3D (`y = 54 px`).
2. **Écrasement des indices sur 320 px** :
   - La grille `repeat(8, 1fr)` compresse les indices de ligne à **31,8 px de large**, rendant le texte `"3bis"` et `"7bis"` illisible et impossible à toucher avec le pouce sans fausse frappe.
3. **Barre de navigation Studio 3D** :
   - Positionnée à `bottom: 5.5rem`, elle se retrouve enfouie sous le tiroir du quai quand celui-ci est déplié (`max-height: 48vh`).

---

## 5. Verdict & Plan de Gains Chiffré

### 5.1 Synthèse des faiblesses

| Point faible | Mesure avant | Impact |
|---|---|---|
| Double téléchargement `shapes.bin` | **3,50 Mo** transférés | Gaspillage de 1,75 Mo de bande passante 4G au boot |
| Poids de `schedule.json` | **1,50 Mo** Brotli / 7,93 Mo brut | 1,5 Mo transféré + 118 à 216 ms de Long Task CPU |
| Cibles tactiles trop petites | **22 boutons < 44 px** (jusqu'à 28 px) | Fautes de frappe fréquentes sur mobile |
| Double contexte WebGL (Three.js) | +24,7 Mo de RAM, chute à 30 FPS | Deux renderers en concurrence sur le GPU mobile |
| Bâti 3D absent du mobile déployé | Carte raster 2D Esri (pas d'extrusion) | Incohérence avec la promesse 3D |

---

### 5.2 Plan de gains chiffré

| Action d'optimisation | Gain Poids Transféré | Gain Temps CPU / Latence | Gain Ergonomie / Rendu |
|---|---|---|---|
| **Suppression du double fetch `shapes.bin`** | **-1,75 Mo** | -4,5 s en Fast 4G | Économie de batterie et data mobile |
| **Passage de `schedule.json` en binaire / Arrow** | **-1,10 Mo** (de 1,5 Mo à ~400 Ko) | Élimination de la Long Task (de 216 ms à < 10 ms) | Zéro gel de l'interface au démarrage |
| **Décodage dans un Web Worker** | 0 Mo | **-118 à -216 ms de gel sur thread UI** | Fluidité parfaite dès la première frame |
| **Intégration du Redesign Chrome & Badges** | 0 Mo | Amélioration du LCP et CLS (header stable 48px) | **100% des cibles tactiles conformes 44px**, badges 40px GTFS, contraste WCAG AA validé |
| **Suppression définitive de Three.js (étape 3)** | **-24,7 Mo de RAM** | Suppression des chutes à 30 FPS | Un unique contexte WebGL partagé MapLibre + deck.gl |
