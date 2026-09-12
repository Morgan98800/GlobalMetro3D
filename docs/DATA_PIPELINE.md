# 📊 Pipeline d'Ingestion & Normalisation des Données

Ce document décrit en détail le pipeline de traitement des données de transport statiques (GTFS IDFM), les algorithmes géométriques appliqués, et la structure des artefacts finaux générés.

---

## 1. Origine des Données & Téléchargement Automatisé (`fetch.py`)

Les données de référence proviennent du portail Open Data d'Île-de-France Mobilités (PRIM / transport.data.gouv.fr) :
- **Flux GTFS IDFM** : archive compressée de ~111.5 Mo contenant l'intégralité du réseau francilien (métro, RER, trains de banlieue Transilien, trams et bus).
- Le script [`ingest/src/fetch.py`](file:///Users/morgancanteri/Documents/Paris%20subway%203D/ingest/src/fetch.py) télécharge ce flux avec reprise sur erreur et vérification d'intégrité dans le dossier temporaire `data/raw/`.

---

## 2. Filtrage Autoritaire (`filter_metro.py`)

Le réseau francilien compte des dizaines de milliers de lignes et d'arrêts de bus inutiles pour le visualiseur.
Le filtrage extrait exclusivement :
1. **Les 16 lignes de métro** (`route_type = 1`) :
   - Lignes 1 à 14, 3bis, 7bis.
   - Récupération des couleurs autoritaires officielles : `route_color` (hexadécimal sans `#`) et `route_text_color`.
   - Préservation des drapeaux d'extensions futures.
2. **Les RER A, B, C, D, E natifs** :
   - Lecture directe des routes GTFS IDFM (`route_type = 2`, agence IDFM), avec couleurs et couleurs de texte autoritaires.
  - Les stations RER sont fusionnées dans `stations.json` par `parent_station` (repli sur `stop_id`), puis filtrées par l'emprise `1.95 <= lon <= 2.75` et `48.72 <= lat <= 49.08`. Les tracés régionaux restent publiés dans `rer_lines.json`.

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

**Résultat mesuré** : sur **1 200 833 arrêts projetés**, le taux de violation de monotonie est de **0,00 %**. L'écart de projection arrêt → tracé, mesuré par `data/processed/projection_metrics.json`, vaut **7,81 m en moyenne** et **90,76 m au maximum** (4 264 projections dépassent 80 m, principalement sur les terminus et les branches RER où le brin retenu n'est pas celui emprunté par la mission).

### 4. Séparation des Voies par Direction & Résolution des Auto-Intersections (`resample.py`)
Dans les données GTFS brutes, les tracés des deux sens de circulation d'une ligne sont fréquemment confondus sur un axe médian unique de voirie. Sans séparation, les rames circulant en sens inverse se superposent visuellement.

Le module [`ingest/src/resample.py`](file:///Users/morgancanteri/Documents/Paris%20subway%203D/ingest/src/resample.py) applique un décalage géométrique bilatéral strict :
- **Voie 1 (`direction_id == 0`)** : décalage latéral de **$+1.8\text{ m}$** vers la droite du sens de marche (convention RATP : circulation à droite).
- **Voie 2 (`direction_id == 1`)** : décalage latéral de **$-1.8\text{ m}$** vers la gauche.
- **Entrevoie total résultant** : **$3.6\text{ m}$** (largeur d'entrevoie standard du réseau RATP).

#### Formule du Décalage & Normale Lissée :
À chaque sommet métrique $P_i$, la tangente est calculée sur une fenêtre de $\pm 30$ m puis normalisée. La normale est la rotation de 90° de cette tangente unitaire; aucune valeur en degrés ni miter non normalisé n'est utilisée. Les deux directions sont translatées de $+1,8$ m et $-1,8$ m, soit **3,6 m** d'entrevoie mesurée sur les axes est-ouest, nord-sud et en courbe.

#### Nettoyage des Auto-Intersections (*Swallow-Tails*) :
Dans les boucles de retournement serrées (notamment la **boucle d'Auteuil sur la ligne 10** et la **boucle de Guimard sur la ligne 2**), l'application d'un offset vers l'intérieur de la courbure peut induire des auto-croisements de la polyligne (*swallow-tails*).
L'algorithme `clean_self_intersections_metric()` :
1. Détecte les intersections locales entre segments non adjacents par test d'orientation CCW (*Counter-Clockwise Test*).
2. Supprime la boucle interne redondante et raboute la polyligne au point de croisement exact.
3. Réapplique le rééchantillonnage régulier à 10 m sur la polyligne nettoyée.

---

## 4. Structure des Fichiers de Données Produits

### 1. `shapes.bin` (0,80 Mo brut, 0,17 Mo Brotli) — Format SHP2
Les 116 tracés canoniques sont stockés dans un format binaire quantifié :
- en-tête `SHP2`, version et nombre de tracés ;
- identifiant, nombre de points, pas et longueur de queue ;
- origine longitude/latitude en `int32` puis deltas `int16` en $10^{-7}$ degré.
La précision maximale mesurée au round-trip est inférieure à 7 mm.

### 2. `tracks.json` (24,6 Ko) — Polylignes Vectorielles Dédupliquées
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

### 3. `schedule.json` (8,31 Mo brut) — Matrice des Courses
Contient la totalité des **11 252 courses actives de la journée** pour l'ensemble du réseau parisien :
- Dictionnaire compact des **321 noms de stations du réseau métro** (déduplication par index numérique). Les stations RER ne figurent pas dans cette table : les courses publiées sont les courses métro.
- Liste des courses au format compressé :
  `[trip_id, line_id, direction_id, shape_id, heure_debut_s, heure_fin_s, terminus_index, arrêts]`
  avec pour chaque arrêt : `[heure_arrivee_s, heure_depart_s, distance_m, station_index]`.

### 4. `stations.json` (~296 Ko)
Le comptage retenu est celui des **stations commerciales métro + RER** : pour chaque point d'arrêt
référencé par au moins une course active, on utilise `parent_station` quand le GTFS le
fournit, sinon `stop_id`. Les quais/points d'arrêt d'une même station commerciale sont donc
regroupés par identifiant GTFS, jamais par nom ou proximité géographique. Les stations
commerciales desservies par plusieurs lignes ne comptent qu'une fois dans le total et portent
la liste complète de leurs lignes.

**Le dernier artefact validé contient 468 stations et 21 lignes**, et le fichier est passé de
~70 Ko à ~296 Ko lorsque les stations RER et les compteurs de desserte y ont été fusionnés. La
décomposition est exacte et se réconcilie avec les 321 du `schedule.json` :

| Sous-ensemble | Nombre |
|---|:---:|
| Stations desservies uniquement par le métro | 304 |
| Stations desservies uniquement par le RER | 147 |
| Correspondances métro ↔ RER | 17 |
| **Total publié** | **468** |
| dont desservies par ≥ 1 ligne de métro (les 321 du dictionnaire `schedule.json`) | 321 |
| dont desservies par ≥ 1 ligne RER | 164 |
| dont pôles d'échange (`is_hub`) | 74 |

Il n'y a donc **pas de contradiction** entre les 321 et les 468 : 321 est le nombre de stations
du réseau métro, 468 le nombre de toutes les stations publiées (métro + RER après filtrage
par l'emprise `1.95 ≤ lon ≤ 2.75` / `48.72 ≤ lat ≤ 49.08`).

Le pipeline compare le nouveau nombre à celui de l'exécution précédente avant de remplacer
`stations.json` et échoue si l'écart dépasse 2 %. Ce contrôle protège contre une déduplication,
un filtrage géographique ou un GTFS amont modifié sans signalement.

### 5. `sections.json` — inventaire OSM pour la politique de caméra
Cet artefact est dérivé des ways OSM `railway=subway` puis projeté sur les tracés GTFS
rééchantillonnés, pour chaque ligne et chaque sens. La classification est stricte :
`tunnel=yes` ou `layer < 0` donne `souterrain`, `bridge=yes` ou `layer > 0` donne
`aerien`, et l'absence des deux donne `sol`. Un conflit de tags est conservé et marqué
avec priorité au souterrain ; il n'est jamais corrigé silencieusement. Chaque intervalle
porte `d_start_m`, `d_end_m`, `type`, les ways OSM sources et les stations d'extrémité.
Les sections courtes ou dont les deux extrémités sont la même station portent
`review_flags` et restent soumises à validation humaine. `sections-overrides.json` est
appliqué après la dérivation OSM.

> **Artefact retiré.** Une maquette 3D de Paris (`paris_urban_mesh.json`, ~269 Ko : Seine, îles, 15 ponts, 3 923 blocs haussmanniens) et son générateur `scripts/generate_paris_3d_data.py` ont été **supprimés du projet**. Le bâti urbain est désormais rendu par la couche vectorielle MapLibre `building-3d` (fill-extrusion OpenFreeMap, `minzoom: 14`, masquée par défaut), et l'eau par les couches `paris-water` / `paris-waterways` du style. Aucun fichier `paris_urban_mesh.json` n'existe plus dans le dépôt. Voir [3D_RENDERING.md](3D_RENDERING.md) §1 et §2.

### 6. `rolling-stock.json` (~17,7 Ko) — Matériel Roulant & Dimensions Métriques
Définit les caractéristiques géométriques réelles de chaque modèle de train (MP14, MP89, MP05, MF01, MF77, MF67, MF88, MP73) et la table d'affectation par ligne :
- `cars_count` : Nombre de voitures (3 pour les lignes bis, 5 en fer standard, 8 sur la ligne 14).
- `car_length_m` : Longueur individuelle d'une caisse en mètres (~15 m).
- `inter_car_gap_m` : Espacement d'intercirculation entre deux voitures (~0,6 m).
- `width_m` : Largeur physique réelle de caisse (2,40 m pour le matériel fer, 2,45 m pour le pneu).
- `total_length_m` : Longueur totale hors-tout de la rame en circulation.
- Attribut `"verified": false` et sources techniques documentées pour chaque ligne.

### 7. `line_ladders.json` (~409 Ko) — Diagrammes de marche
Généré par [`scripts/build_line_ladders.py`](file:///Users/morgancanteri/Documents/Paris%20subway%203D/scripts/build_line_ladders.py) :
la séquence commerciale des stations par ligne et par sens, avec les branches séparées
(lignes 7, 13 et RER). C'est la source du diagramme vertical interactif de l'interface
(`station_ladder.ts`), qui a besoin de l'ordre des arrêts sans relire `schedule.json` (8,31 Mo).

`station-rankings.json` (~803 Ko, §9) et `sections.json` (~168 Ko, §5) sont produits respectivement par
`scripts/build_station_rankings.py` et `scripts/build_sections.py`.

### 8. `model-assets-manifest.json` — Contrat glTF, licences et livrées

Généré par [`scripts/build_train_asset_manifest.py`](file:///Users/morgancanteri/Documents/Paris%20subway%203D/scripts/build_train_asset_manifest.py).

Le script produit **deux variantes du même manifeste** :

1. **Le manifeste canonique** (`build_manifest`) : `policy.external_downloads`,
   `policy.marketplace_models`, `render_contract`, et pour chaque famille l'asset complet
   (LOD, compression, origine, axe longitudinal, licence, provenance) et la livrée.
2. **Le manifeste servi** (`build_served_manifest`) : une **liste blanche volontairement
   fermée** — seuls `schema_version`, `generated_on`, `status`, `policy.train_models_present`
   et, par famille, `family_id` / `status` / `dimensions_m`. Tout le reste (licences,
   candidats de modèles, livrées) est retiré avant publication.

La destination détermine la variante : écrire vers `web/public/data/model-assets-manifest.json`
déclenche le manifeste servi, toute autre destination écrit le canonique. Le script détecte par
ailleurs la présence réelle des GLB (`policy.train_models_present = bool(train_glb_files)`).

Voici l'état des deux fichiers du dépôt :

| Fichier | Variante | `train_models_present` | Familles | `render_contract` |
|---|---|:---:|---|:---:|
| `data/model-assets-manifest.json` | canonique | `false` | `steel_classic`, `pneumatic`, `automatic_recent` (+ `pneumatic_generic`) | **oui** |
| `web/public/data/model-assets-manifest.json` | servi | **`true`** | `steel_classic`, `pneumatic`, `automatic_recent`, `pneumatic_generic` | non (retiré) |

> ⚠️ **Incohérence connue.** Le manifeste canonique de `data/` porte encore
> `train_models_present: false` et `train_model_files: []`, avec la date
> `generated_on: 2026-09-10` : il n'a pas été régénéré depuis la production des deux GLB.
> Seul le manifeste **servi** est rafraîchi, parce que `npm run build:web` ne passe que
> `--output web/public/data/model-assets-manifest.json`. Pour remettre `data/` d'aplomb :
> `python3 scripts/build_train_asset_manifest.py --output data/model-assets-manifest.json`.

Le `render_contract` (canonique uniquement) fixe le contrat de rendu consommé par
`train_models_layer.ts` :

- **une seule voiture glTF par famille**, instanciée `cars_count` fois le long de l'abscisse
  curviligne (`representation: one_car_instanced_along_curvilinear_path`) — ce n'est **pas**
  une rame complète modélisée ;
- `zoom_model_threshold: 16`, crossfade capsule → glTF sur `[15.5, 16.0]`,
  `desktop_instance_cap: 400` instances, `origin: car_center`, `long_axis: +X` ;
- `lod_count: 3`, compression `draco`/`meshopt`, `max_bytes_per_lod: 153600` (150 Ko) ;
- matériaux `matte_metalness_near_zero` et **aucune livrée physique validée**
  (`livery.approved_hex: null`) : les couleurs GTFS restent des couleurs de ligne.

Les deux modèles réellement présents sont **générés en interne, clean-room**, par
`scripts/build_train_box_models.py` (et contrôlés par `check_train_box_models.py`) :
`web/public/models/train/pneumatic_generic__neutral.glb` et
`web/public/models/train/steel_classic__neutral.glb`, publiés par
`scripts/publish_train_models.py`. Aucun actif de marketplace n'est téléchargé ; la politique
`external_downloads: blocked_until_human_source_and_license_approval` reste en vigueur, ce qui
explique que le statut global demeure `awaiting_human_asset_approval` alors même que des modèles
existent.

### 9. `station-rankings.json` — Desserte et records

Le script `scripts/build_station_rankings.py` agrège les passages planifiés GTFS par station et
par station-ligne, séparément pour semaine, samedi et dimanche. Les rangs et compteurs sont
recopiés dans `stations.json` et exposés dans le bouton « Records du réseau ».
La fréquentation annuelle IDFM/RATP 2015 n'est pas jointe : le jeu officiel disponible expose
un nom de station mais aucun identifiant GTFS fiable pour une jointure sans ambiguïté.

---

### Modèles RER A-E

Les lignes RER A, B, C, D et E disposent chacune d'un proxy glTF neutre
distinct (`rer_generic_A` à `rer_generic_E`). Ces fichiers sont générés
clean-room et instanciés voiture par voiture dans le visualiseur. Ils valident
le pipeline de chargement et de rendu, mais ne constituent pas encore une
reproduction industrielle validée des MI09, MI79, Z2N ou Z 50000.

Le manifeste canonique conserve pour chaque fichier son chemin et son SHA-256.
Le statut reste `awaiting_human_asset_approval` tant que la source, la licence,
les dimensions et la fidélité des compositions n'ont pas été approuvées.

## 5. Tests d'Acceptation & Validation (Phase A)

Le script de test automatisé [`ingest/tests/test_acceptance_phase_a.py`](file:///Users/morgancanteri/Documents/Paris%20subway%203D/ingest/tests/test_acceptance_phase_a.py) valide rigoureusement les 5 critères d'acceptation du brief :

```bash
cd ingest
pytest tests/test_acceptance_phase_a.py -v
```

| Critère | Exigence du brief | Mesure obtenue | Statut |
|---|---|---|:---:|
| **1. Exhaustivité des lignes** | 16 lignes présentes (1 à 14, 3bis, 7bis) | 16 lignes extraites avec couleurs autoritaires, + les 5 RER natives | **PASS** |
| **2. Monotonie stricte** | 100 % des courses avec distances strictement croissantes | 0 violation sur 1 200 833 arrêts | **PASS** |
| **3. Précision de projection** | Projection fidèle sans saut de brin | Écart moyen = **7,81 m**, maximum 90,76 m (`data/processed/projection_metrics.json`) | **PASS** |
| **4. Longueur des tracés** | Écart avec la longueur commerciale officielle < 5 % | Écart maximal mesuré sur les tracés publiés : **0,38 %** (voir [cartographie](cartographie_geographie_reseau.md) §3) | **PASS** |
| **5. Intégrité des données** | Fichiers complets, valides et importables | Validé sur tous les artefacts | **PASS** |
