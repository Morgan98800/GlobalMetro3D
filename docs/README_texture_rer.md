# Modèles RER v2 — texture d'albédo procédurale

Remplace les cinq `baseColorFactor` de la v1 par une **texture générée en
Python** appliquée sur un dépliage UV cylindrique. Aucune dépendance externe :
le PNG est encodé à la main avec `zlib`, le GLB sérialisé à la main.

## Ce qui change

| | v1 (facteurs) | v2 (texture) |
|---|---|---|
| Primitives | 5 | **1** |
| Triangles | 148 | **128** |
| Matériau | `baseColorFactor` ×5 | **`baseColorTexture`** |
| Fenêtres | deux bandeaux continus | **rangées individuelles** |
| Portes | deux quads sombres | **vantaux avec encadrement** |
| Poids | 10 852 o | **12 468 o** (dont 3,2 Ko de texture) |

Le gain principal n'est pas le poids, c'est **l'alignement du modèle de
matériau sur tes GLB métro**, qui utilisent déjà `baseColorTexture` avec un PNG
d'albédo. L'écart de rendu entre les deux familles — que la vérification
visuelle n'avait pas pu trancher — disparaît par construction.

## Le dépliage

La caisse est une extrusion de section fermée : c'est un cylindre déplié, donc
le mapping est exact.

    u = (x + L/2) / L          position le long de la voiture
    v = abscisse curviligne le long du profil, normalisée sur [0 ; 0,92]

La bande `v ∈ [0,94 ; 1,0]` est réservée aux faces d'about, peintes en ton de
soufflet d'intercirculation. Un point final dupliqué à `s = périmètre` évite la
couture : sans lui, le dernier quad interpolerait `v` de 0,92 vers 0 et la
texture entière défilerait à l'envers sur ce quad.

## La peinture

La texture fait 1024 × 320. Elle est peinte **ligne de pixels par ligne de
pixels** : pour chaque rangée `v`, le script retrouve le point du profil
correspondant, donc son `y` réel. La stratification n'est donc pas dupliquée
entre géométrie et peinture — la texture connaît la vraie forme de la caisse.

Découpe verticale, en mètres depuis le dessous de caisse : soubassement
jusqu'à 0,34 · fenêtres basses 0,56–1,16 · ceinture 1,26–1,56 · fenêtres hautes
1,70–2,30 · toiture au-dessus de 2,44. Deux rangs de fenêtres superposés, c'est
la signature du RER à deux niveaux.

Découpe horizontale : fenêtres de 1,05 m espacées de 0,30 m, interrompues par
deux portes de 1,30 m avec encadrement plus sombre, filet de bas de caisse, et
léger panneautage vertical tous les 2,5 m.

> **Piège évité, à connaître :** une texture PNG est interprétée en **sRGB** par
> glTF, alors que `baseColorFactor` est en **linéaire**. Les tons sont donc
> saisis ici directement en sRGB 0–255, sans conversion — l'inverse exact de la
> v1, où l'absence de conversion délavait tout.

## Les cinq livrées

La ceinture porte la couleur GTFS de la ligne : A `#EB2132`, B `#5091CB`,
C `#FFCC30`, D `#008B5B`, E `#B94E9A`. Ce n'est pas une livrée réelle — les
rames RER ne portent pas la couleur de leur ligne — mais c'est une convention
cohérente avec ta carte, et elle n'utilise aucune marque. `--livery neutral`
produit une ceinture grise si tu préfères l'homogénéité avec le métro.

Aucun logo : le macaron RER et les marques IDFM, RATP et SNCF sont déposées, et
ton projet affiche une clause de non-affiliation. L'identification de ligne
passe par la pastille `TextLayer` déjà en place sur la tête de rame.

## À faire au moment d'intégrer

**1. Régénérer le manifeste — bloquant.** Les SHA-256 des cinq GLB changent.
`build_train_asset_manifest.py` est fail-closed : sans régénération, il refusera
les modèles et le rendu retombera silencieusement sur les capsules.

```bash
python3 scripts/publish_train_models.py
python3 scripts/build_train_asset_manifest.py --output web/public/data/model-assets-manifest.json
```

**2. Vérifier que l'origine est conservée.** X ∈ [−7,5 ; +7,5], Y ∈ [0 ; 2,85],
Z ∈ [±1,40], soit exactement la convention corrigée en phase précédente.
`car_length` doit rester identique à `car_length_m` de `rolling-stock.json`.

**3. La cabine dépasse 15 Ko** (17 312 o). Elle reste inutilisable en l'état de
toute façon : `train_models_layer.ts` répète un seul maillage par voiture. Ne
l'ajoute pas au manifeste tant que la couche ne sait pas placer un maillage
distinct en tête et en queue.

**4. La comparaison visuelle métro / RER redevient pertinente.** Les deux
familles utilisent désormais le même modèle de matériau : si un écart de ton
subsiste, il vient de la texture, pas du moteur.

## Commandes

```bash
python3 build_rer_box_models.py                          # 5 livrees + cabines
python3 build_rer_box_models.py --livery neutral --no-cab # ceinture grise, corps seul
python3 build_rer_box_models.py --dump-texture /tmp/t.png # inspecter la texture
python3 render_glb.py corps.glb cabine.glb apercu.png     # rendu texture, z-buffer
```

`render_glb.py` remplace `preview_glb.py` : un tri de faces par profondeur ne
suffit plus, il faut interpoler les UV en barycentrique pour voir les fenêtres.
