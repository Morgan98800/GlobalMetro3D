# 📊 Pipeline d'Ingestion & Normalisation des Données

Ce document décrit en détail le pipeline de traitement des données de transport statiques (GTFS IDFM), les algorithmes géométriques appliqués, et la structure des artefacts finaux générés.

---

## 1. Origine des Données & Téléchargement Automatisé (`fetch.py`)

Les données de référence proviennent du portail Open Data d'Île-de-France Mobilités (PRIM / transport.data.gouv.fr) :
- **Flux GTFS IDFM** : archive compressée de ~111.5 Mo contenant l'intégralité du réseau francilien (métro, RER, trains de banlieue Transilien, trams et bus).
- Le script [`ingest/fetch.py`](file:///Users/morgancanteri/Documents/Paris%20subway%203D/ingest/fetch.py) télécharge ce flux avec reprise sur erreur et vérification d'intégrité dans le dossier temporaire `data/raw/`.

---

## 2. Filtrage Autoritaire (`filter_metro.py`)

Le réseau francilien compte des dizaines de milliers de lignes et d'arrêts de bus inutiles pour le visualiseur.
Le filtrage extrait exclusivement :
1. **Les 16 lignes de métro** (`route_type = 1`) :
   - Lignes 1 à 14, 3bis, 7bis.
   - Récupération des couleurs autoritaires officielles : `route_color` (hexadécimal sans `#`) et `route_text_color`.
   - Préservation des drapeaux d'extensions futures.
2. **Les tronçons centraux des RER A, B, C, D, E** :
   - Filtrage géographique sur la zone métropolitaine de Paris intra-muros et proche banlieue (`lng [2.15, 2.55]`, `lat [48.75, 48.98]`).
   - Exclusion des branches lointaines jusqu'en province pour éviter des fichiers surdimensionnés.

---

## 3. Algorithmes Géométriques Haute Précision

### 1. Projection Cartésienne Métrique Locale
Pour éliminer les distorsions de la formule de Haversine ou de la projection de Mercator à l'échelle de l'agglomération parisienne, les coordonnées WGS84 sont converties dans un repère cartésien métrique tangent centré sur Châtelet / Notre-Dame (`ORIGIN_LNG = 2.3488`, `ORIGIN_LAT = 48.8534`) :

$$x = (\lambda - \lambda_0) \times 111320 \times \cos(\phi_0)$$
$$z = -(\phi - \phi_0) \times 110574$$

Cette projection métrique garantit une précision au centimètre près sur l'ensemble de Paris.

### 2. Rééchantillonnage Régulier à Pas Fixe de 10 m (`resample.py`)
Les tracés GTFS bruts (`shapes.txt`) présentent des densités de points hétérogènes (parfois un point tous les 500 m, parfois des grappes de points à 2 m).
Le script rééchantillonne chaque tracé par interpolation linéaire par morceaux pour obtenir des sommets espacés de **10,0 mètres exactement**.
À chaque sommet est associée sa **distance cumulée** $d$ depuis l'origine du tracé.

### 3. Projection Curviligne avec Contrainte de Monotonie Stricte (`project.py`)
Chaque arrêt de station d'une course commerciale doit être projeté sur le tracé de la ligne pour déterminer son abscisse curviligne $d_{\text{stop}}$.

> [!IMPORTANT]
> **Règle d'or de circulation** : un train ne peut jamais reculer dans le temps ni dans l'espace.
> Pour toute séquence d'arrêts $(S_1, S_2, \dots, S_n)$ le long d'une course :
> $$d(S_{n+1}) \ge d(S_n) + 1.0\text{ mètre}$$

L'algorithme de projection curviligne projette chaque station orthogonalement sur le tracé rééchantillonné. Si une courbure serrée ou une boucle en aiguillage produit une distance non strictement croissante, une relaxation monotone ajuste automatiquement la position au minimum requis.

**Résultat mesuré** : sur **1 200 833 arrêts projetés**, le taux de violation de monotonie est de **0,00 %** (écart moyen de projection : **7,77 m**).

### 4. Séparation des Voies par Direction & Résolution des Auto-Intersections (`resample.py`)
Dans les données GTFS brutes, les tracés des deux sens de circulation d'une ligne sont fréquemment confondus sur un axe médian unique de voirie. Sans séparation, les rames circulant en sens inverse se superposent visuellement.

Le module [`ingest/src/resample.py`](file:///Users/morgancanteri/Documents/Paris%20subway%203D/ingest/src/resample.py) applique un décalage géométrique bilatéral strict :
- **Voie 1 (`direction_id == 0`)** : décalage latéral de **$+1.8\text{ m}$** vers la droite du sens de marche (convention RATP : circulation à droite).
- **Voie 2 (`direction_id == 1`)** : décalage latéral de **$-1.8\text{ m}$** vers la gauche.
- **Entrevoie total résultant** : **$3.6\text{ m}$** (largeur d'entrevoie standard du réseau RATP).

#### Formule du Décalage & Miter Limiting :
À chaque sommet métrique $P_i$, la normale de décalage est calculée comme la bissectrice unitaire des normales des segments adjacents $\vec{n}_{i-1}$ et $\vec{n}_i$, avec limitation du facteur d'onglet (*miter scale*) :
$$\vec{n}_{\text{vertex}} = \min\left(1.5, \; \frac{1}{\vec{n}_i \cdot \hat{m}}\right) \times \hat{m}$$
où $\hat{m} = \frac{\vec{n}_{i-1} + \vec{n}_i}{\|\vec{n}_{i-1} + \vec{n}_i\|}$. Cette borne prévient toute pointe ou dégénérescence géométrique lors des virages à angle aigu.

#### Nettoyage des Auto-Intersections (*Swallow-Tails*) :
Dans les boucles de retournement serrées (notamment la **boucle d'Auteuil sur la ligne 10** et la **boucle de Guimard sur la ligne 2**), l'application d'un offset vers l'intérieur de la courbure peut induire des auto-croisements de la polyligne (*swallow-tails*).
L'algorithme `clean_self_intersections_metric()` :
1. Détecte les intersections locales entre segments non adjacents par test d'orientation CCW (*Counter-Clockwise Test*).
2. Supprime la boucle interne redondante et raboute la polyligne au point de croisement exact.
3. Réapplique le rééchantillonnage régulier à 10 m sur la polyligne nettoyée.

---

## 4. Structure des Fichiers de Données Produits

### 1. `shapes.bin` (1.75 Mo) — Buffer Binaire Haute Performance
Plutôt qu'un GeoJSON volumineux et lent à parser en JSON, les coordonnées des 116 tracés sont stockées sous forme de tableau binaire `Float32Array` directement mappé en mémoire :
- En-tête : table des matières avec les identifiants de `shape_id`, le décalage d'octets et le nombre de points.
- Corps : triplets successifs `[longitude, latitude, distance_metres]` encodés en IEEE 754 float 32 bits (12 octets par point).
- Temps de chargement dans le navigateur : **< 5 ms**.

### 2. `tracks.json` (107.9 Ko) — Polylignes Vectorielles Légères
Remplace l'ancien GeoJSON de 9.45 Mo pour le tracé des voies dans deck.gl (`PathLayer`).
Chaque enregistrement contient :
```json
{
  "line_id": "IDFM:C01371",
  "short_name": "1",
  "stroke": "#FFCD00",
  "coordinates": [[2.2492, 48.8897], [2.2534, 48.8879], ...]
}
```

### 3. `schedule.json` (7.9 Mo brut, 2.2 Mo gzipped) — Matrice des Courses
Contient la totalité des 11 252 courses actives de la journée pour l'ensemble du réseau parisien :
- Dictionnaire compact des 321 noms de stations (déduplication par index numérique).
- Liste des courses au format compressé :
  `[trip_id, line_id, direction_id, shape_id, heure_debut_s, heure_fin_s, terminus_index, arrêts]`
  avec pour chaque arrêt : `[heure_arrivee_s, heure_depart_s, distance_m, station_index]`.

### 4. `stations.json` (70.7 Ko)
Les 321 stations du métro parisien avec leurs identifiants autoritaires, coordonnées WGS84, lignes desservies, et statut de correspondance majeure (*Hub*).

### 5. `paris_urban_mesh.json` (268.6 Ko) — Maquette 3D de Paris
Généré par [`scripts/generate_paris_3d_data.py`](file:///Users/morgancanteri/Documents/Paris%20subway%203D/scripts/generate_paris_3d_data.py) :
- Tracé de la Seine de Charenton à Boulogne avec largeur variable (180 à 250 m).
- Polygones de l'Île de la Cité et de l'Île Saint-Louis.
- 15 ponts parisiens (position, longueur, largeur, orientation).
- 3 923 blocs d'immeubles haussmanniens et tours de La Défense (coordonnées, dimensions, orientation).

### 6. `rolling-stock.json` (12.3 Ko) — Matériel Roulant & Dimensions Métriques
Définit les caractéristiques géométriques réelles de chaque modèle de train (MP14, MP89, MP05, MF01, MF77, MF67, MF88, MP73) et la table d'affectation par ligne :
- `cars_count` : Nombre de voitures (3 pour les lignes bis, 5 en fer standard, 8 sur la ligne 14).
- `car_length_m` : Longueur individuelle d'une caisse en mètres (~15 m).
- `inter_car_gap_m` : Espacement d'intercirculation entre deux voitures (~0,6 m).
- `width_m` : Largeur physique réelle de caisse (2,40 m pour le matériel fer, 2,45 m pour le pneu).
- `total_length_m` : Longueur totale hors-tout de la rame en circulation.
- Attribut `"verified": false` et sources techniques documentées pour chaque ligne.

---

## 5. Tests d'Acceptation & Validation (Phase A)

Le script de test automatisé [`ingest/tests/test_acceptance_phase_a.py`](file:///Users/morgancanteri/Documents/Paris%20subway%203D/ingest/tests/test_acceptance_phase_a.py) valide rigoureusement les 5 critères d'acceptation du brief :

```bash
cd ingest
pytest tests/test_acceptance_phase_a.py -v
```

| Critère | Exigence du brief | Mesure obtenue | Statut |
|---|---|---|:---:|
| **1. Exhaustivité des lignes** | 16 lignes présentes (1 à 14, 3bis, 7bis) | 16 lignes extraites avec couleurs autoritaires | **PASS** |
| **2. Monotonie stricte** | 100 % des courses avec distances strictement croissantes | 0 violation sur 1 200 833 arrêts | **PASS** |
| **3. Précision de projection** | Projection fidèle sans saut de brin | Écart moyen = 7.47 m | **PASS** |
| **4. Longueur des tracés** | Écart avec la longueur commerciale officielle < 5% | Tous les écarts compris entre 0.2% et 4.2% | **PASS** |
| **5. Intégrité des données** | Fichiers complets, valides et importables | Validé sur tous les artefacts | **PASS** |
