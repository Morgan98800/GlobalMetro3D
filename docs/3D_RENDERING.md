# 🎨 Moteurs Graphiques & Rendu Visuel 3D

Ce document détaille l'architecture graphique duale du projet : la vue cartographique haute densité (MapLibre + deck.gl) et la maquette 3D architecturale nocturne de Paris (Three.js).

---

## 1. Vue Cartographique 2.5D (MapLibre GL JS + deck.gl)

### 1. Fond de Carte & Perspective
- **Fond de carte** : tuiles vectorielles rasterisées **Esri Dark Gray Canvas**, offrant un contraste maximal sans watermark intrusif.
- **Paramètres initiaux** :
  - Centre : Paris Châtelet (`lng: 2.3488`, `lat: 48.8534`).
  - Zoom : `12.3`.
  - Inclinaison (*Pitch*) : `52°` (vue 3D plongeante) ou `0°` (vue 2D zénithale en 1 clic).
  - Orientation (*Bearing*) : `-15°` (aligné sur l'axe historique de la Seine et des grands boulevards).

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

## 2. Studio 3D Paris (« Ville Lumière ») — Three.js

Accessible à tout moment en cliquant sur le bouton **`🗼`** dans les commandes de carte, ce mode bascule vers une maquette 3D nocturne architecturale.

### 1. La Seine, ses Îles et ses Ponts en 3D
- **Surface miroitante de la Seine** :
  - Ruban géométrique de 180 à 250 m de large suivant le méandre réel de Charenton à Boulogne.
  - Matériau aquatique PBR profond (`color: 0x14b8a6`, `emissive: 0x0891b2`, `roughness: 0.08`, `metalness: 0.85`), réfléchissant la lune et les lumières des quais.
- **Île de la Cité et Île Saint-Louis** :
  - Plateaux rocheux insulaires émergeant à +2 m au-dessus de l'eau avec quais en pierre claire (`#C8BAA1`).
- **15 Ponts Historiques en 3D** :
  - Pont Neuf, Pont Alexandre III, Pont d'Iéna, Pont de la Concorde...
  - **Pont de Bir-Hakeim** : modélisé avec son étage inférieur routier et son viaduc métallique supérieur franchi par les rames de la ligne 6.

### 2. Tissu Urbain Haussmannien & La Défense (Performance 60 FPS via `InstancedMesh`)
Pour garantir 60 FPS constants sans faire souffrir la carte graphique :
- **3 923 immeubles parisiens** sont instanciés via `THREE.InstancedMesh`.
- **Haussmann classique** : façades en pierre de taille chaude (`#DFD5C2`), toits en zinc ardoise bleuté (`#4A6572`), et fenêtres éclairées la nuit en jaune chaud (`#FBBF24`).
- **Quartier d'affaires de La Défense** : 15 gratte-ciel en verre et acier bleu miroitant (`#60A5FA` et `#1D4ED8`) montant jusqu'à 231 m (Tour First, Majunga, Total Coupole, Engie T1, Grande Arche).

### 3. Monuments Parisiens Emblématiques
- **Tour Eiffel (324 m)** :
  - Piliers quadruples arqués, 1ère et 2ème plateformes ajourées, flèche métallique dorée (`metalness: 0.85`, `roughness: 0.3`).
  - Projecteurs dorés orientés vers le haut à la base.
  - **Le Phare de la Tour Eiffel** : balise lumineuse à 324 m avec **deux faisceaux dorés rotatifs à 360° en temps réel** (`fog: false` pour préserver la clarté lumineuse sans noircissement).
- **Sacré-Cœur & Butte Montmartre** :
  - Butte en relief surélevée à +115 m.
  - Basilique en travertin blanc étincelant avec grand dôme central, clochetons et campanile arrière de 83 m.
- **Arc de Triomphe (Place de l'Étoile)** :
  - Voûte monumentale et attique sculpté.
  - 12 avenues rayonnantes bordées de lanternes dorées.
- **Notre-Dame de Paris**, **Dôme doré des Invalides**, **Tour Montparnasse** (avec feux de sommet clignotants), **Pyramide du Louvre**, **Panthéon**.

### 4. Réseau de Métro Luminescent & Rames 3D
- **Tubes néon** : diamètre élargi à 16 m avec forte émissivité (`emissiveIntensity: 1.2`) aux couleurs de la ligne, formant un réseau de lumière visible sous la ville.
- **Rames 3D** : véhicules en blanc lustré avec liseré de couleur de ligne et **phares doubles blancs** projetant de la lumière vers l'avant.
- **Curseur Rayons X** : permet d'ajuster en continu la transparence de la dalle de sol (de 10 % pour un effet rayons X pur jusqu'à 100 % pour un sol plein).

### 5. Barre de Navigation par Monument
Une barre d'outils flottante au bas de l'écran permet de survoler instantanément les monuments clés :
- `🗼 Tour Eiffel`
- `🏛️ Cité (Notre-Dame)`
- `🌟 Étoile (Champs-Élysées)`
- `⛪ Montmartre (Sacré-Cœur)`
- `🌐 Vue Globale`

Chaque clic déclenche une trajectoire de caméra cinématographique interpolée avec amorti cubique doux (*Cubic Ease-Out*).
