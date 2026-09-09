# 🎨 Moteurs Graphiques & Rendu Visuel 3D

Ce document détaille l'architecture graphique unifiée du projet : une scène 3D haute performance fonctionnant sur un **unique contexte WebGL** combinant MapLibre GL JS (fond vectoriel et bâti 3D extrudé) et deck.gl (infrastructure ferroviaire, rames en circulation et monuments historiques glTF).

---

## 1. Fond de Carte & Infrastructure Métropolitaine (MapLibre GL + deck.gl)

### 1. Fond de Carte Vectoriel Industriel Sombre
- **Source vectorielle** : Tuiles vectorielles OpenMapTiles hébergées par **OpenFreeMap** (`https://tiles.openfreemap.org/planet`), éliminant tout fond rasterisé et offrant l'accès direct aux géométries de bâtiments.
- **Palette chromatique industrielle** conforme à `tokens.css` :
  - Fond / Ardoise : `--fonte` (`#0E1512`), `--fonte-surface` (`#141D19`).
  - Voies d'eau (La Seine & canaux) : `--ardoise-eau` (`#0A2E2B`).
  - Réseau viaire : `--zinc-route` (`#18231E`) et `--zinc-autoroute` (`#22322B`).
  - Aucun libellé de rue avant le zoom 14 (`minzoom: 14`) pour préserver la lisibilité du réseau de transport.
- **Paramètres de vue par défaut** :
  - Centre : Paris Châtelet (`lng: 2.3488`, `lat: 48.8534`).
  - Zoom initial : `12.3`.
  - Inclinaison (*Pitch*) : `52°` (vue 3D perspective) basculable en `0°` (vue 2D zénithale).
  - Orientation (*Bearing*) : `-15°` (aligné sur l'axe historique de la Seine).

### 2. Extrusion Altitudinale des Voies (`elevation_offset`)
À Paris, de nombreuses lignes se croisent en sous-sol (ex: Châtelet-Les Halles, République, Montparnasse). Sans gestion de l'altitude, les tracés se chevauchent de manière confuse.
Chaque ligne se voit attribuer un décalage vertical autoritaire dans `lines.json` :
- Ligne 14 (la plus profonde) : décalage `-28 m`.
- Lignes historiques (1, 4) : décalage `-12 m`.
- Sections aériennes (Ligne 6 Bir-Hakeim, Ligne 2 Barbès) : décalage `+12 m`.

Le `PathLayer` de deck.gl prend en compte ce décalage pour extruder les polylignes avec jointures et extrémités arrondies.

### 3. Rendu des Rames en Capsule (Addendum deck.gl — Pile 5 couches métriques)

Pour offrir une perception physique du matériel roulant sans le coût d'un maillage 3D, les rames sur la carte MapLibre/deck.gl sont matérialisées par une tranche géométrique découpée dans l'axe de la voie (`shapes.bin`) et épaissie à la largeur réelle du matériel (`widthUnits: 'meters'`). La capsule épouse ainsi fidèlement les courbes du tracé et s'agrandit avec le zoom.

```text
       ┌─────────────────────────────────────────────────────────┐
       │                Couche 1 : Contour Noir/Or               │  (largeur = width + 1.2m, bague dorée PRIM / pointillés GTFS)
       │  ┌──────────────┐   ┌──────────────┐   ┌─────────────┐  │
       │  │  Voiture 3   │   │  Voiture 2   │   │  Voiture 1  │  │  (Couche 2 : Caisses, couleur ligne assombrie -35%)
       │  │ ┌──────────┐ │   │ ┌──────────┐ │   │ ┌─────────┐ │  │  (Couche 3 : Toit, largeur = width * 0.35, +25% HSL)
       │  │ └──────────┘ │   │ └──────────┘ │   │ █ Nez 2.5m│ │  │  (Couche 4 : Nez de tête, bandeau blanc éclatant)
       │  └──────────────┘   └──────────────┘   └─────────────┘  │
       └─────────────────────────────────────────────────────────┘
                                       ▲
                             Couche 5 : [ 1 ] Étiquette de ligne (offset [0, -22], collisionFilter)
```

#### A. Pile de 5 couches deck.gl (`parameters: { depthTest: false }`)
1. **Couche 1 — Contour (`PathLayer`)** : Tranche entière non découpée, largeur $= \text{width} + 1.2\text{ m}$.
   - **Recalage PRIM direct** : Bague dorée lumineuse (`[250, 204, 21, 255]`) en temps réel.
   - **Confiance théorique GTFS** : Contour en pointillés (`PathStyleExtension`, `getDashArray: [3, 2]`) et opacité d'ensemble à 65 %.
2. **Couche 2 — Caisses (`PathLayer`)** : Sous-tranches par voiture (séparées par les intercirculations) à la largeur métrique exacte du matériel (`width_m`). Couleur de ligne assombrie de 35 % pour créer la masse volumique du train.
3. **Couche 3 — Toit (`PathLayer`)** : Sous-tranches par voiture, largeur $= \text{width} \times 0.35$, teinte de ligne éclaircie de +25 % en luminosité HSL (effet de chanfrein et reflet de toiture sans éclairage 3D).
4. **Couche 4 — Nez de rame (`PathLayer`)** : Bandeau de 2,5 m situé sur la tête de rame, largeur $= \text{width}$, en blanc brillant (`#FFFFFF`) figurant le masque de face avant et l'éclairage frontal.
5. **Couche 5 — Étiquettes (`TextLayer`)** : Pastille contrastée sur la tête de rame avec le numéro de ligne, `getPixelOffset: [0, -22]`, `backgroundPadding: [6, 4]`, dotée de `CollisionFilterExtension` priorisant la rame sélectionnée.

#### B. Niveaux de détail (LOD) & Économie GPU
Pour maximiser la fluidité à grande échelle, le branchement LOD s'exécute **avant** toute découpe géométrique :
- **Zoom $< 12$** *(Mobile $< 13$)* : Pastille double disque haute performance (aucun calcul de tranche ni découpe de voie).
- **Zoom $12 \le z \le 13.5$** *(Mobile $13 \le z \le 14.5$)* : Capsule entière monolithique métrique (couches 1 & 2 uniquement, sans toit ni nez).
- **Zoom $> 13.5$** *(Mobile $> 14.5$)* : Pile complète avec découpe individuelle des voitures (`splitIntoCars`), toit biseauté et nez blanc.
- **Zoom $\ge 13$** *(Mobile $\ge 14$)* : Affichage des étiquettes textuelles de rame (couche 5).
- **Mobile Capping** : Plafonnement automatique à 150 rames découpées simultanées, sélectionnées par distance euclidienne croissante au centre de la carte.

#### C. Interpolation Cinématique Sub-seconde (60 FPS)
Bien que le moteur de simulation GTFS/PRIM cadence son état logique à 1 Hz, l'affichage tourne en continu à 60 FPS dans `requestAnimationFrame` :
- **Extrapolation continue** : $\hat{d} = d_{\text{tick}} + v \times (t - t_{\text{tick}})$.
- **Résorption douce des écarts** : À la réception de chaque tick, l'écart résiduel $(\hat{d} - d_{\text{tick}})$ est amorti linéairement sur 300 ms pour éliminer tout à-coup visuel.
- **Recalage franc sur rupture** : Si un saut $> 20\text{ m}$ survient (recalage réel PRIM ou téléportation), la nouvelle position s'applique instantanément sans étirement artificiel.
- **Accessibilité `prefers-reduced-motion`** : Si l'utilisateur a configuré son système pour réduire les mouvements, l'extrapolation continue est désactivée et les positions sautent doucement au pas discret de 1 Hz.

---

## 2. Bâti Urbain 3D & Monuments Historiques (Contexte Unifié)

Le rendu 3D de Paris ne fait plus appel à un second moteur WebGL (l'ancien Studio Three.js a été éliminé). Il est entièrement intégré dans la même scène que les voies et les rames, garantissant 60 FPS constants sans surcharge GPU.

### 1. Bâti 3D en `fill-extrusion` (MapLibre GL)
Les bâtiments parisiens sont générés en direct par le GPU à partir des géométries vectorielles d'OpenFreeMap :
- **Couche** : `building-3d` de type `fill-extrusion`.
- **Seuil d'apparition** : `minzoom: 14`, avec montée progressive de l'opacité entre zoom 14 (0.0) et zoom 15.5 (0.78) pour éviter tout effet de pop visuel.
- **Calcul des hauteurs** :
  ```json
  ["coalesce", ["get", "render_height"], 18]
  ```
  Les bâtiments sans hauteur explicitée dans OpenStreetMap adoptent une hauteur médiane estimée à 18 mètres (gabarit haussmannien typique de 5 à 6 étages).
- **Palette chromatique & occlusion** :
  - Teinte ardoise/zinc sombre (`#18231F`) en harmonie avec l'univers nocturne.
  - Masquage sélectif des polygones OSM bruts pour les monuments historiques (`['!=', 'hide_3d', true]`) afin d'éviter tout chevauchement avec les modèles glTF.

### 2. Monuments Historiques en glTF (`deck.gl ScenegraphLayer`)
Les monuments emblématiques de Paris sont modélisés sous forme d'actifs glTF binaires (`.glb`) ultra-légers (< 300 Ko chacun, 203 Ko cumulés) et intégrés via `ScenegraphLayer` :

| Monument | Fichier | Taille | Emplacement WGS84 | Yaw (Cap) | Particularités |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Tour Eiffel** | `tour_eiffel.glb` | 60.6 Ko | `[2.2945, 48.8584]` | 26° | Alignée axe Champ-de-Mars, dentelle ajourée |
| **Arc de Triomphe** | `arc_de_triomphe.glb` | 11.1 Ko | `[2.2950, 48.8738]` | 26° | Voûte axée sur les Champs-Élysées |
| **Sacré-Cœur** | `sacre_coeur.glb` | 62.2 Ko | `[2.3431, 48.8867]` | 0° | Dômes et campanile de Montmartre |
| **Notre-Dame** | `notre_dame.glb` | 7.7 Ko | `[2.3499, 48.8530]` | -20° | Île de la Cité, tours et nef axées |
| **Hôtel des Invalides** | `invalides.glb` | 25.1 Ko | `[2.3124, 48.8550]` | 0° | Dôme doré et cour d'honneur |
| **Tour Montparnasse** | `montparnasse.glb` | 5.2 Ko | `[2.3217, 48.8421]` | 35° | Silhouette monolithique 210 m |
| **Musée du Louvre** | `louvre.glb` | 7.4 Ko | `[2.3364, 48.8606]` | 0° | Ailes et Cour Carrée |
| **Le Panthéon** | `pantheon.glb` | 24.0 Ko | `[2.3460, 48.8462]` | 0° | Dôme néo-classique et colonnade |

#### A. Conventions de Coordonnées & Export
- **Système d'axes** : Les modèles sont exportés avec une rotation native $X = +\pi/2$ lors de la conversion glTF, ce qui garantit qu'ils sont en convention **Z-up** conforme à deck.gl WGS84.
- **Orientation runtime** : `getOrientation: (d) => [0, -(d.yaw || 0), 0]` (Pitch = 0, Roll = 0, Yaw = cap géographique en degrés).
- **Chargement à la demande** : Les modèles ne sont instanciés que pour un zoom $\ge 13$ et dans un rayon géodésique autour du centre de vue (`viewRadiusDeg`), garantissant zéro surcharge mémoire quand l'utilisateur observe d'autres zones.

### 3. Pipeline de Composition & Ordre de Rendu
- L'overlay deck.gl est instancié avec `interleaved: false`.
- Les voies de métro et les rames actives sont ainsi dessinées en surimpression sur le bâti extrudé MapLibre, évitant tout effet de masquage ou de clipping visuel des tunnels et voies en tranchée.
- La barre de navigation en bas d'écran (`#studio-nav-bar`) pilote directement la caméra MapLibre (`map.flyTo()`) avec une inclinaison cinématique à 55° et une rotation orientée sur chaque monument.
