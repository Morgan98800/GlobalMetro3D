# Audit Géographique & Cartographique du Réseau Parisien (Métro + RER)

> Document 100 % généré par script (`scripts/generate_geo_audit.py`). Aucune valeur n'est extrapolée.

## 1. Inventaire et Géométrie des 21 Lignes

| Ligne | Mode | Couleur | Stations | Nb Tracés | Longueur Commerciale (GTFS max path) | Longueur Cumulée Rendu | Emprise Bounding Box [O, S, E, N] | Terminus |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **1** | METRO | `#FFBE00` | 25 | 2 | 16.51 km | 32.94 km | `[2.237, 48.8445, 2.4389, 48.8921]` | Château de Vincennes ↔ La Défense |
| **2** | METRO | `#0055C8` | 25 | 2 | 12.34 km | 24.57 km | `[2.2774, 48.848, 2.3991, 48.8844]` | Nation ↔ Porte Dauphine |
| **3** | METRO | `#6E6E00` | 25 | 1 | 11.64 km | 11.64 km | `[2.2804, 48.8629, 2.4155, 48.8971]` | Gallieni ↔ Pont de Levallois - Bécon |
| **3bis** | METRO | `#82C8E6` | 4 | 1 | 1.34 km | 1.34 km | `[2.3989, 48.8654, 2.4065, 48.8762]` | Porte des Lilas ↔ Gambetta |
| **4** | METRO | `#A0006E` | 29 | 1 | 13.22 km | 13.21 km | `[2.3159, 48.8033, 2.3586, 48.8974]` | Porte de Clignancourt ↔ Bagneux - Lucie Aubrac |
| **5** | METRO | `#FF5A00` | 22 | 1 | 14.69 km | 14.68 km | `[2.3544, 48.8309, 2.4493, 48.9063]` | Bobigny - Pablo Picasso ↔ Place d'Italie |
| **6** | METRO | `#82DC73` | 28 | 2 | 13.65 km | 27.21 km | `[2.2847, 48.8296, 2.4021, 48.8745]` | Nation ↔ Charles de Gaulle - Étoile |
| **7** | METRO | `#FF82B4` | 38 | 2 | 19.78 km | 38.38 km | `[2.3323, 48.7869, 2.4108, 48.9207]` | La Courneuve - 8 Mai 1945 ↔ Villejuif - Louis Aragon |
| **7bis** | METRO | `#82DC73` | 8 | 2 | 3.23 km | 6.10 km | `[2.3643, 48.8769, 2.4004, 48.8825]` | Pré-Saint-Gervais ↔ Louis Blanc |
| **8** | METRO | `#D282BE` | 38 | 1 | 23.17 km | 23.17 km | `[2.2784, 48.7688, 2.4645, 48.872]` | Balard ↔ Pointe du Lac |
| **9** | METRO | `#D2D200` | 37 | 1 | 19.57 km | 19.57 km | `[2.2306, 48.8296, 2.4415, 48.8747]` | Pont de Sèvres ↔ Mairie de Montreuil |
| **10** | METRO | `#DC9600` | 23 | 2 | 11.75 km | 21.54 km | `[2.2283, 48.8409, 2.3645, 48.8531]` | Boulogne Pont de Saint-Cloud ↔ Gare d'Austerlitz |
| **11** | METRO | `#6E491E` | 19 | 1 | 12.16 km | 12.14 km | `[2.3475, 48.8573, 2.4803, 48.8859]` | Rosny-Bois-Perrier ↔ Châtelet |
| **12** | METRO | `#00643C` | 31 | 1 | 17.00 km | 16.99 km | `[2.2732, 48.8242, 2.3809, 48.9143]` | Mairie d'Issy ↔ Mairie d'Aubervilliers |
| **13** | METRO | `#82C8E6` | 32 | 3 | 18.14 km | 40.65 km | `[2.2841, 48.8108, 2.3646, 48.9459]` | Châtillon - Montrouge ↔ Asnières - Gennevilliers - Les Courtilles |
| **14** | METRO | `#640082` | 21 | 1 | 27.72 km | 27.72 km | `[2.3096, 48.7284, 2.3874, 48.9174]` | Saint-Denis - Pleyel ↔ Aéroport d'Orly |
| **A** | RAIL | `#EB2132` | 44 | 38 | 76.32 km | 1908.11 km | `[2.0117, 48.7526, 2.7824, 49.0511]` | Cergy–Le Haut · Poissy · Saint-Germain-en-Laye ↔ Marne-la-Vallée–Chessy · Boissy-Saint-Léger |
| **B** | RAIL | `#5091CB` | 37 | 40 | 64.89 km | 1644.47 km | `[2.0709, 48.6938, 2.6423, 49.0102]` | Aéroport Charles-de-Gaulle 2 TGV · Mitry–Claye ↔ Saint-Rémy-lès-Chevreuse · Robinson |
| **C** | RAIL | `#FFCC30` | 52 | 78 | 96.34 km | 3774.78 km | `[1.9957, 48.4274, 2.4272, 49.0469]` | Pontoise · Versailles Château Rive Gauche · Saint-Quentin-en-Yvelines ↔ Massy–Palaiseau · Dourdan–La Forêt · Saint-Martin-d'Étampes |
| **D** | RAIL | `#008B5B` | 16 | 60 | 90.38 km | 2708.19 km | `[2.3443, 48.2934, 2.6552, 49.2639]` | Creil ↔ Malesherbes · Melun |
| **E** | RAIL | `#B94E9A` | 25 | 11 | 115.50 km | 520.94 km | `[2.227, 48.7394, 2.7587, 48.9148]` | Nanterre–La Folie ↔ Tournan · Chelles–Gournay |

> **Lecture des colonnes.** « Longueur Commerciale (GTFS max path) » est `measured_length_km`, la longueur du tracé le plus long d'une ligne dans le GTFS. « Longueur Cumulée Rendu » est la somme de toutes les polylignes publiées dans `tracks.json` (`tracks.json` pour le métro, `rer_lines.json` pour le RER) : elle compte donc **chaque variante de branche et chaque sens de circulation**. Sur le RER, où les missions sont nombreuses, ce cumul dépasse très largement la longueur commerciale — c'est un indicateur de volume de géométrie à rendre, pas une longueur de ligne.

## 2. Politique de Cadrage et Filtrage RER

- **Option B appliquée** : Les tracés RER sont intégrés dans leur continuité régionale sans coupure artificielle en rase campagne.
- **Cadrage par défaut** : La caméra initiale et le bouton de recentrage global sont strictement calés sur `metroBounds` (emprise intra-muros / proche couronne des 16 lignes de métro). Les branches lointaines du RER (Cergy, Creil, Malesherbes, Marne-la-Vallée) ne rapetissent pas Paris à l'ouverture.
- **Comptage GTFS vs Commercial Réseau Express Régional** :
  - RER A : 44 stations publiées après filtrage géographique.
  - RER B : 37 stations publiées après filtrage géographique.
  - RER C : 52 stations publiées après filtrage géographique.
  - RER D : 16 stations publiées après filtrage géographique.
  - RER E : 25 stations publiées après filtrage géographique.

## 3. Anomalies Mesurées et Seuils de Contrôle

| Métrique | Seuil d'alerte / rejet | Valeur mesurée actuelle | Statut |
| :--- | :---: | :---: | :---: |
| Angle de virage consécutif (kinks / U-turns) | > 150.0° | **88.6°** (max réseau, ligne 12) | Conforme |
| Écart longueur tracé publié vs `measured_length_km` | >= 5.0 % | < 0.38 % (16/16 lignes < 2.5 %) | Conforme |
| Comptage stations commerciales métro | doit rester stable (~321) | **321** stations desservies par au moins une ligne de métro (sur 468 publiées) | Conforme |
| Décalage de projection arrêt-voie | > 95.0 m | moyenne = 7.81 m  max = 90.76 m sur 1 200 833 projections (4 264 au-delà de 80 m) | Conforme |
| Déduplication des tracés (shapes.bin → tracks.json) | segments publiés < tracés sources | 116 tracés canoniques → 24 segments publiés (4.8× ) | Conforme |

Les trois derniers indicateurs sont relus depuis les artefacts publiés à chaque exécution. Le critère d'acceptation « écart de longueur < 5 % » est également vérifié par `ingest/tests/test_acceptance_phase_a.py`.