# Diagnostic rendu 3D des rames

## Verdict E

**Comparaison avant/après SHP2 : non concluante dans cette passe.** La session locale est restée sur « Chargement du réseau parisien », en viewport `390 × 844`, avec plusieurs réponses HTTP 404. Les deux captures avant/après existent comme traces de session, mais elles montrent le même état de chargement et ne permettent pas d'attribuer une différence visuelle à SHP2. Aucune conclusion « défaut disparu », « atténué » ou « inchangé » n'est donc retenue.

La cause évidente observable en une ligne est : **le test visuel n'a pas atteint la scène cartographique rendue, donc ni la branche glTF/capsule ni la géométrie SHP2 n'ont pu être validées par image.**

## Captures

| Fichier | Intention | Paramètres réellement établis | Statut |
|---|---|---|---|
| `captures/00-avant-shp2.png` | avant SHP2 | URL locale `?profile=1`, viewport 390×844 | session de chargement, non exploitable |
| `captures/00-apres-shp2.png` | après SHP2 | URL locale `?profile=1`, viewport 390×844 | session de chargement, non exploitable |
| `captures/01-droite-z15.png` | droite, z15 | non appliqué | non exploitable |
| `captures/02-courbe-z15.png` | courbe L12, z15 | non appliqué ; référence analytique Marx Dormoy | non exploitable |
| `captures/03-courbe-z17.png` | courbe L12, z17 | non appliqué | non exploitable |
| `captures/04-station-z16.png` | station, z16 | non appliqué | non exploitable |
| `captures/05-croisement-z15.png` | croisement, z15 | non appliqué | non exploitable |
| `captures/06-large-z13.png` | vue large, z13 | non appliqué | non exploitable |

Les images sont conservées hors de `web/public/` et exclues de Git par `.gitignore`. Elles ne constituent pas une preuve de cadrage, de pitch ou de branche de rendu.

## B1 — Test visuel et branche de rendu

La branche nominale est :

```ts
return modelLayers.length > 0 ? modelLayers : capsuleLayers;
```

Le chemin glTF est admissible au-delà de `TRAIN_MODEL_ZOOM_THRESHOLD = 16`, après chargement du GLB et construction des couches. Toutefois `grazingCamera` devient vrai à partir de `pitch >= 45°`. Les deux familles déclarent `grazingCameraApproved: false` :

- `pneumatic_generic` : modèles refusés en caméra rasante ;
- `steel_classic` : modèles refusés en caméra rasante.

Dans ce cas, `createTrainModelLayers` retourne zéro couche et l'arbitre conserve les capsules. Cette conclusion est structurelle, issue du code, et non une observation visuelle de la session bloquée.

## B2 — GLB et éclairage

Mesures relevées :

| GLB | Taille |
|---|---:|
| `pneumatic_generic__neutral.glb` | 9 468 octets |
| `steel_classic__neutral.glb` | 9 460 octets |
| Total | 18 928 octets |

Les modèles sont chargés par `GLBLoader`, rendus par `ScenegraphLayer` et déclarent `_lighting: 'pbr'`. L'effet deck.gl est monté dès que `trainModelsEnabled()` est vrai, même si le modèle est ensuite refusé par la politique de caméra :

- lumière ambiante blanche, intensité `1.0` ;
- lumière directionnelle chaude `[255, 250, 235]`, intensité `2.0`, direction `[-1, -1, -2]`.

Le nom `createTrainModelSpikeLighting` est donc diagnostique, mais son appel est aussi présent sur le chemin nominal lorsque les modèles sont activés.

## B3 — SHP2

- fichier servi actuel : `web/public/data/shapes.bin`, 583 804 octets, en-tête `SHP2`, version 2 ;
- ancienne copie de traitement : `data/processed/shapes.bin`, 1 745 980 octets, format `MSHP` ;
- candidat historique pré-SHP2 : `/tmp/shapes-pre-candidate.bin`, 1 750 612 octets.

La comparaison binaire établit une différence de format et de taille. La comparaison visuelle avant/après n'a pas été réalisée de manière valide, car le navigateur n'a pas atteint la carte et l'ancien blob n'a pas été servi dans une séquence caméra reproductible.

## C — Questions géométriques

### 1. Que fait `splitIntoCars` ?

La rame est découpée suivant l'abscisse cumulée du shape. Pour `direction = 1` et la voiture `i` :

```text
carHead = headDistanceM - i × (carLengthM + interCarGapM)
carTail = carHead - carLengthM
```

Chaque tranche est extraite par `sliceShape`, avec interpolation des coordonnées aux bornes. La copie complète de lecture est dans `code/splitIntoCars.ts`.

### 2. L'espacement suit-il l'arc ?

Oui, dans le calcul des bornes : les voitures avancent selon l'abscisse curviligne et `inter_car_gap_m` est ajouté entre les têtes successives. C'est un espacement le long de l'arc du shape, pas une translation cartésienne indépendante.

### 3. Quelle différence entre longueur d'arc et corde ?

La longueur d'arc est la longueur de la tranche découpée dans le tracé. La corde est la distance directe entre deux positions de référence. Pour les modèles rigides, l'orientation et le centre sont calculés à partir des deux pivots de bogies (`getBogieCentresM`, repli à 11 m), donc sur une corde locale, tandis que le découpage et l'espacement restent curvilignes. La valeur arc-corde sur la courbe L12 n'a pas été mesurée faute de décodage du shape dans la session.

### 4. Que vaut `inter_car_gap_m` ?

Pour la ligne 12 : `0,95 m`. La distance entre têtes de voitures vaut donc `15,08 + 0,95 = 16,03 m`. La valeur est appliquée dans les bornes de `splitIntoCars` et dans le calcul des soufflets de la couche capsule.

## Données associées

- [donnees/mesures-glb-shp2.json](donnees/mesures-glb-shp2.json)
- [donnees/courbe-ligne12.json](donnees/courbe-ligne12.json)
- [donnees/rolling-stock-extrait.json](donnees/rolling-stock-extrait.json)
- [donnees/geometrie-voitures.json](donnees/geometrie-voitures.json)

La courbe L12 est repérée par `IDFM:C01382`. Le sommet analytique déjà relevé est `[2.35989, 48.8903]`, proche de Marx Dormoy (`3 956,9 m`) ; les stations encadrantes de la zone de cadrage sont Porte de la Chapelle (`3 193,7 m`) et Marcadet - Poissonniers (`4 735,0 m`).

## Limites

- aucune mesure visuelle fiable de pitch, zoom effectif ou branche glTF/capsule n'a pu être enregistrée ;
- aucun verdict visuel avant/après SHP2 ;
- les angles segment par segment et les longueurs corde sur le shape binaire restent à mesurer dans une session où le réseau est chargé ;
- 11 lignes ont `verified: false` dans la base de matériel : 3, 3bis, 6, 7bis, 10, 12, A, B, C, D et E.

Aucun correctif fonctionnel ni optimisation n'est inclus dans ce dossier. Le dossier reste hors de `web/public/` et hors du périmètre de publication Netlify.
