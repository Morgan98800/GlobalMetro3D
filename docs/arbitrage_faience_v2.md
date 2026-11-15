# Arbitrage du layout et des boutons — Faïence v2.1

Réponse à [`audit_layout_faience_v2.md`](audit_layout_faience_v2.md). Chaque décision est déjà appliquée dans le pack : composants de `web/src/ui/` et maquettes `design/screenshots/maquettes/` 01 à 14.

## Les trois règles qui tranchent

1. **Une commande, un seul endroit par plateforme.**
2. **Par vue, au plus :**
   - un bouton `primaire` (Émail) ;
   - un bouton `afficheur`, qui fait entrer dans le monde ferroviaire ;
   - une plaque.
3. **Le placement dépend de la fréquence d’usage.** Une action fréquente reste visible. Une action rare va dans un menu. Une action qui en double une autre disparaît.

## Bilan

| Périmètre | v1 | v2.1 |
| :--- | :--- | :--- |
| `StationDrawer` | 9 boutons à libellé | 3 boutons à libellé et 3 icônes (★, ⋯, ×) |
| `FollowTrainHud` | ×, Quitter, Cabine 3D | ×, Monter dans cette rame |
| Entrées vers la 3D | 4 | 3, une par sujet |
| Mode Passionné | 3 endroits | 1 par plateforme |
| Bâtiments 3D, Records, lien `/methode` | 2 endroits chacun | 1 chacun |
| Modales d’information | 4 | 2 |
| Pied de `RoutePlannerDrawer` | Effacer, Partager, Fermer | Partager l’itinéraire |

---

## 1. Boutons conservés et variante Faïence

Rappel des variantes :
- `primaire` (Émail) : l’action principale, une par vue.
- `secondaire` (Faïence) : les autres actions.
- `discret` : les barres et listes denses.
- `afficheur` : l’entrée en 3D, une par vue.
- `IconButton` : les commandes sans texte, toujours avec un nom accessible.

### `TopNavBar`

| Élément v1 | Décision | Composant, variante | Libellé v2.1 |
| :--- | :--- | :--- | :--- |
| Sélecteur de réseau | Garder | `ReseauButton` (Marque, nom, chevron) | « Paris » |
| Recherche globale | Garder | `SearchTrigger`, id `#topbar-search-trigger` conservé | « Où allez-vous ? » + ⌘K |
| Itinéraire, Autour de moi, Lignes | Garder | `Button discret` avec `pressed` ; `IconButton` sous 1024 px ; `BarreMobile` sous 768 px | Le bouton Lignes affiche la pastille de la ligne active |
| Simple / Passionné | Garder, bureau seulement | `Segmented` sm | « Simple », « Passionné » |
| Menu ⋮ | Garder | `IconButton` avec `expanded`, ouvre `MenuPrincipal` | « Menu et réglages » |
| Horloge | Sortir du bandeau, toujours visible | `Horloge` (afficheur) | « 21:20 » |
| Bandeau télémétrie (Passionné) | Garder | `BandeauTelemetrie`, chiffres séparés par des joints | « 312 rames en circulation », « 18 450 km parcourus » |
| PRIM Live actif / Théorique | Garder | `InterrupteurDirect` (afficheur, `role="switch"`) | « Temps réel PRIM » ; sans flux, étiquette « Horaires théoriques » |
| Trophée Records | **Supprimer** | — | Doublon du menu ⋮ |

### `MapControls`

| Élément v1 | Décision | Composant, variante | Libellé v2.1 |
| :--- | :--- | :--- | :--- |
| Vue 3D / 2D | Garder | `IconButton` `pressed` | « Vue en 3D » |
| Bâtiments 3D | Garder, seul endroit | `IconButton` `pressed` | « Bâtiments en relief » |
| GPS en direct | Garder | `IconButton` `pressed`, icône pleine quand actif | « Suivre ma position » |
| Recentrer | Garder, contextuel | `IconButton` | « Recentrer sur Paris », « … sur Bastille », « … sur la rame suivie » |
| Cabine & Quai 3D | **Supprimer** | — | Voir § 2.3 |
| Presets Édimbourg `W C H S V` | **Fusionner** | Un `IconButton` qui ouvre un `MenuBouton` (ouverture vers la gauche) | « Points de vue », entrées en noms complets |
| Suivre un train (Édimbourg) | Déplacer | Rame cliquable dans le thermomètre de `LinesDock` | — |
| Zoom ± | Garder sur bureau | `IconButton` | Alternative au pincement (WCAG 2.5.1) |

### `LinesDock` (ex-`LineDetailsPanel`)

Le panneau a deux niveaux : **Lignes** (pastilles et état du trafic) et **Ligne X** (détail).

| Élément v1 | Décision | Composant, variante | Libellé v2.1 |
| :--- | :--- | :--- | :--- |
| `Toutes` | Remplacer | `Button discret` sm avec chevron, retour au niveau Lignes | « Toutes les lignes » |
| `Réduire` / `Ouvrir` (mobile) | Fusionner | Poignée de feuille, qui est un bouton (`aria-expanded`) | « Réduire les lignes », « Agrandir les lignes » |
| Fermer × | Garder en mode Simple (en Passionné, le panneau est permanent) | `IconButton` | « Fermer les lignes » |
| Pastilles | Garder | `LineBadgeChip` md interactive | « Ligne 4 » |
| Sens (`SegmentedControl`) | Remplacer | Rangée « Direction » et `IconButton secondaire` | « Inverser la direction » |
| Encart trafic | Garder | Texte et point d’état, sans bouton | « Trafic normal, 27 rames en ligne. » |
| 4 cartes KPI (Passionné) | Garder, sans cartes | Grille 2 × 2 à joints (`dl`), chiffres tabulaires | Rames en ligne, Longueur, Matériel, Exploitation |
| `Cabine 3D en direct` / `Voir la rame en 3D` | **Fusionner** | `Button afficheur` | « Monter à bord » dans les deux modes ; le direct se choisit en cabine |
| `StationLadder` | Remplacer | `Thermometre` | Arrêts, rames et correspondances sont trois cibles distinctes |
| « Voir sur la carte » (ajouté en v2) | **Retirer** | — | Sélectionner une ligne la cadre déjà |

### `StationDrawer`

| Élément v1 | Décision | Composant, variante | Libellé v2.1 |
| :--- | :--- | :--- | :--- |
| Titre | Garder | `Plaque` md (`h2`) | Nom de la station |
| `Sauver` / `Favori` | Déplacer dans l’en-tête | `IconButton` `pressed` | « Favori » |
| `Domicile`, `Travail`, `Partager` | **Déplacer dans le menu** | `MenuBouton` | « Partager la station », « Utiliser comme domicile », « Utiliser comme travail » |
| Fermer | Garder | `IconButton` | « Fermer la fiche » |
| Pastilles | Garder | `LineBadgeChip` md, ouvre la ligne | — |
| `Accessible PMR` | Garder comme étiquette, pas comme bouton | Pastille d’encart | « Accessible en fauteuil » |
| Alertes trafic | Garder | Texte et point d’état | « Perturbé. … » |
| Prochains passages | Garder | `Passages` | — |
| `Suivre`, sur chaque passage (Passionné) | **Fusionner dans l’horaire** | L’horaire de l’`Afficheur` devient le bouton (`onPassage`) | « Suivre la rame, dans 2 minutes » |
| Confiance (Passionné) | Garder | Légende sous le terminus | « Mesuré PRIM, 2 min 14 s » |
| `Aller ici (B)` | Garder | `primaire` | « Y aller » |
| `Partir (A)` | Garder | `secondaire` | « Partir d’ici » |
| `Quai 3D` | Garder (Paris) | `afficheur` | « Voir le quai en 3D » |
| `Zoom 3D` | **Supprimer** | — | Voir § 2.1 |
| `Ligne X` | **Supprimer** | — | Doublon des pastilles |

### `RoutePlannerDrawer`

| Élément v1 | Décision | Composant, variante | Libellé v2.1 |
| :--- | :--- | :--- | :--- |
| Domicile, Travail, jusqu’à 4 favoris | Garder | `Button secondaire` sm | « Domicile » ou « Définir le domicile » ; favoris : ★ et nom en Signalétique |
| `Ma position` | Déplacer dans le champ A | `IconButton` dans le champ, visible quand A est vide | « Partir de ma position » |
| `Inverser départ et arrivée` | Garder | `IconButton secondaire` | Idem |
| Effacer un champ | Garder | ⊗ dans le champ | « Effacer départ », « Effacer arrivée » |
| Cartes de trajet | Garder | `CarteItineraire` (`aria-expanded`) | — |
| `Partager` | Garder | `Button secondaire` | « Partager l’itinéraire » |
| `Effacer` (pied) | **Supprimer** | — | Les ⊗ des champs suffisent |
| `Fermer` (pied) | **Supprimer** | — | × en en-tête |

### `FollowTrainHud` (nouveau composant)

| Élément v1 | Décision | Composant, variante | Libellé v2.1 |
| :--- | :--- | :--- | :--- |
| × | Garder (+ Échap) | `IconButton` | « Arrêter le suivi » |
| `Quitter` | **Supprimer** | — | Doublon de × |
| `Cabine 3D` | Garder (Paris) | `afficheur` | « Monter dans cette rame » |
| Barre de progression | Garder | `PlanDeLigneHorizontal` (variante claire) | — |
| Vitesse et confiance (Passionné) | Garder | Afficheur km/h et légende | « 41 km/h », « Position mesurée il y a 12 s » |

### `NearbyDrawer` (nouveau composant)

| Élément v1 | Décision | Composant, variante | Libellé v2.1 |
| :--- | :--- | :--- | :--- |
| Cartes de station | Remplacer par des rangées | Bouton-rangée, séparé par des joints | Temps à pied, nom, pastilles, distance, deux départs |
| `Réessayer` / `Rechercher une station` | Garder, hiérarchisés selon la cause | `primaire` et `secondaire` | Refus : « Rechercher une station » d’abord. Position indisponible ou délai : « Réessayer » d’abord. |
| `Fermer` (pied) | **Supprimer** | — | × en en-tête |

### `StationSearchPalette` (nouveau composant)

| Élément v1 | Décision | Composant, variante | Libellé v2.1 |
| :--- | :--- | :--- | :--- |
| Champ | Garder | Combobox ARIA, texte de 18 px | « Station, adresse, lieu ou ligne » |
| Raccourci A → B | Garder comme **première option**, pas comme bouton | Option de liste | « Itinéraire entre deux points » |
| Résultats | Garder | Options groupées par type ; la correspondance est en gras, jamais en couleur | Stations, Lignes, Adresses et lieux |
| Fermeture | Échap sur bureau, `discret` « Annuler » sur mobile | — | — |

### `InfoModals`

| Élément v1 | Décision | Composant, variante | Libellé v2.1 |
| :--- | :--- | :--- | :--- |
| `about` et `method` | **Fusionner** | `AProposModale` | « À propos et méthode », un seul lien « Lire la méthode complète » |
| `records` | Garder | `RecordsModale` et `Segmented` | « Records de fréquentation » ; onglets « En semaine », « Le samedi », « Le dimanche » ; listes « Les plus fréquentées » et « Les moins fréquentées » |
| `settings` | **Supprimer** | Contenu réparti, voir § 2.4 | — |
| `Fermer` et `Terminer` en pied | **Supprimer** | ×, Échap et clic sur le fond | Les réglages s’appliquent immédiatement |

### `CabHud` (`paris_ride_view.ts`)

| Accroche v1 | Décision | Composant, variante | Libellé v2.1 |
| :--- | :--- | :--- | :--- |
| `[data-ride-route]` | Garder | `select` natif stylé sur verre | « Ligne 14, Saint-Denis Pleyel – Aéroport d’Orly » |
| `[data-ride-exit]` | Garder | `discret` et Kbd Esc | « Revenir à la carte » |
| `[data-ride-live]` | Garder | `InterrupteurDirect` | « Temps réel PRIM » |
| `[data-ride-view]` | Garder | `Segmented` | « Quai », « Cabine » |
| `[data-ride-stock]` | Garder | `discret` sm, chiffres | « MP 14 CA », qui bascule vers « Sprague 1930 » |
| `[data-ride-speed]` | Garder | `discret` sm | « 1× » |
| `[data-ride-pause]` | Garder | `IconButton` | « Mettre en pause », « Reprendre » |
| `[data-ride-eiffel]` | Garder, **contextuel** | `secondaire` sm dans la carte d’information | « Regarder la tour Eiffel », voir § 3.6 |

---

## 2. Suppressions et fusions

### 2.1 `StationDrawer` : de 9 boutons à 3

| Action | Fréquence | Nouvelle place |
| :--- | :--- | :--- |
| Favori | Fréquente | Icône en en-tête : c’est une propriété de la station, qu’on coche |
| Domicile, Travail | Une fois par an | Menu « Plus d’actions ». Elles occupaient la zone la plus précieuse de la fiche. L’itinéraire garde ses raccourcis Domicile et Travail, qui servent tous les jours. |
| Partager | Rare | Menu « Plus d’actions » |
| Ligne X | — | Supprimée, doublon exact des pastilles placées juste au-dessus |
| Zoom 3D | — | Supprimé, voir ci-dessous |

Sélectionner une station cadre déjà la caméra. La proposition règle la question du zoom sans ajouter de bouton :
- **En mode Simple**, le cadrage reste à l’échelle du quartier.
- **En mode Passionné**, le cadrage devient rapproché et en 3D sur la station : c’est l’ancien « Zoom 3D ».
- **Si l’utilisateur s’éloigne**, le bouton Recentrer de `MapControls`, qui est contextuel, devient « Recentrer sur Bastille ».

Aucune commande ne se perd, aucune n’est dupliquée.

Il reste trois boutons visibles : « Y aller » (`primaire`), « Partir d’ici » (`secondaire`) et « Voir le quai en 3D » (`afficheur`).

### 2.2 `FollowTrainHud` : × reste, « Quitter » disparaît

Une carte flottante n’a qu’une sortie. Le × en haut à droite est la convention et prend peu de place ; Échap fait la même chose. Le nom accessible dit l’action : « Arrêter le suivi ».

### 2.3 Entrées vers la 3D : quatre deviennent trois, une par sujet

| Vue | Sujet | Bouton `afficheur` |
| :--- | :--- | :--- |
| `LinesDock`, ligne choisie | Une ligne | « Monter à bord » |
| `StationDrawer` | Une station | « Voir le quai en 3D » |
| `FollowTrainHud` | Une rame | « Monter dans cette rame » |
| `MapControls` | Aucun : le bouton devait deviner la rame ou la ligne | **Supprimé** |

`MapControls` agit sur la carte, alors qu’entrer en 3D est une action sur un sujet. Chaque vue garde donc au plus un `afficheur`, et son libellé dit où l’on entre.

### 2.4 Réglages dédupliqués

| Commande | v1 | v2.1 |
| :--- | :--- | :--- |
| Mode Passionné | Barre (bureau), menu ⋮ (mobile), modale Réglages | Barre sur bureau, menu ⋮ sur mobile |
| Thème | Modale Réglages | Menu ⋮ |
| Bâtiments 3D | `MapControls`, modale Réglages | `MapControls` |
| Records | Menu ⋮, trophée du bandeau | Menu ⋮ |
| Lien `/methode` | À propos, Méthode | « À propos et méthode » |
| Modale Réglages | 4 contrôles et « Terminer » | **Supprimée** |

Après dédoublonnage, la modale Réglages n’aurait plus contenu que le thème, et un dialogue pour un seul choix ne se justifie pas. Le menu ⋮ devient un petit panneau non modal (`MenuPrincipal`) : niveau de détail (mobile seulement), thème, puis les deux entrées vers les modales.

---

## 3. Adaptation des écrans hors pack

### 3.1 `FollowTrainHud`, maquette 09

Carte flottante centrée en bas. Elle se lit de haut en bas :
1. la ligne et la direction ;
2. la prochaine station, avec l’attente à droite dans un afficheur ;
3. le plan de ligne horizontal, dont le train avance avec la courbe `ease-rame` ;
4. en Passionné, la vitesse et la confiance ;
5. l’entrée en 3D.

Le panneau des lignes reste masqué pendant le suivi, comme en v1.

### 3.2 `NearbyDrawer`, maquette 13

Ce sont des rangées, pas des cartes. Le temps à pied vient en premier, en grands chiffres, parce que c’est lui qui décide. Viennent ensuite le nom en Signalétique, les pastilles et la distance, puis les deux prochains départs.

Les deux départs peuvent appartenir à deux lignes différentes. L’`Afficheur` accepte donc désormais une `ligne` par passage : il dessine un **onglet de couleur** à gauche de chaque horaire, comme sur les écrans de quai, et lit « Ligne 1, dans 1 minute ».

Les erreurs disent la cause et la marche à suivre ; l’ordre des deux boutons dépend de la cause.

### 3.3 `StationSearchPalette`, maquette 10

Un champ, une liste, aucun bouton. La palette suit le modèle combobox ARIA et se pilote aux flèches et à Entrée. Une rangée d’aide en pied l’indique sur bureau. Sur mobile, la palette occupe tout l’écran et se ferme par « Annuler ».

### 3.4 `InfoModals`, maquettes 11 et 12 : le ticket est remplacé

Le SVG de ticket de la modale `about` porte les logos RATP, SNCF, optile et Île-de-France Mobilités, ce que le § 13 interdit. La livrée du ticket elle-même est aussi un élément d’identité du réseau.

Il est remplacé par **notre propre composition** :
- un bandeau en carrelage biseauté ;
- la Marque de l’app ;
- une Plaque « Métro & RER Parisiens 3D ».

Les organismes sont **crédités en texte**, dans une liste « Données et licences », et uniquement pour leurs données. Une mention d’indépendance clôt la modale. Les crédits écrits respectent d’ailleurs mieux les obligations d’attribution des licences open data qu’un logo.

> À faire de votre côté : ajuster le paragraphe « Méthode » et la liste des sources (`SOURCES_PAR_DEFAUT`) à votre fournisseur de fond de carte et à votre méthode réelle.

### 3.5 `MenuPrincipal`, maquette 14

Panneau ancré au bouton ⋮. Il contient :
- le niveau de détail (mobile seulement), avec une phrase d’aide ;
- le thème (Système, Clair, Sombre) ;
- un joint ;
- les entrées « Records de fréquentation » et « À propos et méthode ».

### 3.6 `CabHud` : le bouton tour Eiffel

Le bouton reste, mais **contextuel**. Il n’apparaît que sur le tronçon d’où la tour est visible (ligne 6 aux abords de Bir-Hakeim), sous la forme d’un `secondaire` sm dans la carte d’information du HUD. Son libellé est descriptif : « Regarder la tour Eiffel ». Il ne s’ajoute pas à la barre de contrôle permanente.

**Point juridique à faire valider.**
- La structure de la tour est dans le domaine public, mais ses illuminations nocturnes (l’éclairage doré de 1985, puis le scintillement) sont protégées par le droit d’auteur.
- La SETE soumet la reproduction d’images de la tour illuminée la nuit à autorisation préalable.

Conséquences pour la 3D :
- ne pas reproduire l’éclairage ni le scintillement ; de nuit, dessiner une silhouette ou un éclairage neutre ;
- ne pas employer de logo ou de pictogramme de la SETE ;
- n’utiliser le nom que pour désigner le point de vue.

Sources :
- [Dreyfus, 2015](https://www.dreyfus.fr/en/2015/12/11/nighttime-photos-of-the-eiffel-tower-is-the-lighting-protected-by-copyright/) ;
- [Global Legal Post](https://www.globallegalpost.com/blogs/by-day-and-by-night-45-two-different-stories-at-the-eiffel-tower-6410796).

Ce document n’est pas un avis juridique.

### 3.7 Bandeaux

**Télémétrie (Passionné).** Il est livré avec `BandeauTelemetrie` :
- des chiffres tabulaires séparés par des joints, sans points médians ;
- la bascule `InterrupteurDirect`.

**Fraîcheur des données (`stalenessWarning`).** Pas de composant pour l’instant, il suffit d’appliquer la grammaire :
- un `Panneau` flottant centré sous la barre, avec un point de vigilance ;
- une phrase qui dit le fait et la conséquence : « Données mises à jour il y a 6 min. Les temps affichés peuvent être décalés. » ;
- aucun bouton si l’actualisation est automatique.

---

## 4. Accroches DOM

| Accroche | Statut |
| :--- | :--- |
| `#topbar-search-trigger`, `[role="dialog"]`, `button[aria-label="Ligne 14"]`, `button[aria-label="Monter à bord d’une rame en 3D"]` | Inchangées |
| `button[aria-label="Lignes, choisir une ligne"]` | Inchangée depuis la v2 (le script accepte aussi l’ancien libellé) |
| `[data-ride-route]`, `-exit`, `-live`, `-view`, `-stock`, `-speed`, `-pause`, `-eiffel` | Toutes présentes sur `CabHud`. `[data-ride-live]` est maintenant `role="switch"` avec `aria-checked`. |
| `button[aria-label="Arrêter le suivi"]` | Nouvelle (`FollowTrainHud`) |
| `button[aria-label="Favori"]` (`aria-pressed`), `button[aria-label="Plus d’actions"]` | Nouvelles (`StationDrawer`) |
| Bouton « Toutes les lignes », bouton « Inverser la direction » | Nouvelles (`LinesDock`) |
| Pieds « Effacer » et « Fermer », bouton « Quitter », trophée, modale Réglages | Supprimés |

`paris_ride_view.ts` doit piloter le HUD par les props de `CabHud` (`onVue`, `onMateriel`, `onAllure`, etc.) et non par des écouteurs DOM. Les attributs `data-ride-*` restent posés pour les tests et les captures.

## 5. Ordre de mise en œuvre

1. **`InterrupteurDirect` et `Afficheur`.** Bas niveau, sans risque.
2. **`StationDrawer`.** C’est le gain le plus visible.
3. **Entrées 3D.** Retirer celle de `MapControls`, garder les trois `afficheur`.
4. **`MenuPrincipal`.** Supprimer la modale Réglages en même temps.
5. **`LinesDock` à deux niveaux et `Thermometre`.**
6. **`FollowTrainHud`, `NearbyDrawer`, `StationSearchPalette`, `InfoModals`.**
7. **Captures.** Lancer `node design/capture_showcase.mjs` et vérifier les accroches du § 4.
