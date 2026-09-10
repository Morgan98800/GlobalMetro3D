# 📱 Interface Utilisateur, Ergonomie & Routage SPA

Ce document détaille les composants de l'interface utilisateur, le design system inspiré de l'identité visuelle de la RATP, l'optimisation pour smartphone, et la gestion du routage d'URL monopage (SPA).

---

## 1. Le Design System « Guimard Moderne »

L'interface s'inspire du patrimoine historique du métro parisien (les entourages Art Nouveau d'Hector Guimard et le carrelage biseauté en céramique blanche des stations) réinterprété dans un style d'interface moderne et sombre :

### Palette de Couleurs Principales (`tokens.css`)

| Token CSS | Hexadécimal | Rôle dans l'UI |
|---|:---:|---|
| `--fonte` | `#0E1512` | Fond principal sombre des panneaux et de la carte |
| `--fonte-surface` | `#16221D` | Cartes, conteneurs et fonds d'éléments surélevés |
| `--fonte-border` | `#23352D` | Bordures fines et séparateurs subtils |
| `--guimard` | `#1F4A3B` | Vert impérial iconique pour les états actifs et survols |
| `--ceramique` | `#EFE9DD` | Blanc cassé chaud pour les textes principaux |
| `--ceramique-dim` | `#A69F91` | Texte secondaire, sous-titres et métadonnées |
| `--laiton` | `#B4894F` | Dorure chaude Art Déco pour les indicateurs de statut et accents |

### Typographie & Chiffres Tabulaires
- **Interface courante** : Police **Inter** (400, 500, 600, 700), ultra-lisible aux petites tailles et neutre.
- **Titres & Identité** : Police **Archivo 800** (extra-bold), imposante et institutionnelle.
- **Chiffres Tabulaires (`font-feature-settings: "tnum" 1`)** : Activés sur tous les indices de lignes, les chronomètres de retards, les vitesses instantanées et le compteur de rames pour garantir un alignement numérique vertical strict sans décalage horizontal pendant les incrémentations.

---

## 2. « Le Quai » — Volet Latéral & Tiroir Tactile Mobile (`dock.ts`)

Le composant [`SubwayDock`](file:///Users/morgancanteri/Documents/Paris%20subway%203D/web/src/ui/dock.ts) gère la sélection de ligne :

### Sur Ordinateur Desktop
- Rail latéral escamotable fixé sur la gauche de l'écran.
- Deux groupes de pastilles : 16 lignes de métro et les RER A à E, avec les couleurs et contrastes GTFS.
- Clic sur une ligne :
  - La caméra s'envole en douceur pour cadrer l'emprise totale de la ligne, avec un padding mesuré sur le panneau réel.
  - Les 15 autres lignes sont atténuées à 25 % d'opacité.
  - Le Quai bascule sur le **Diagramme de Marche Vertical (Niveau 2)**.

### Sur Smartphone (< 768px)
- Le Quai se transforme en **tiroir rétractable tactile en bas d'écran (Bottom Sheet)**.
- Deux états :
  - **Replié (52 px)** : affiche uniquement la barre de sélection des lignes au ras de l'écran, laissant 90 % de surface visible pour la carte 3D.
  - **Déplié (48vh)** : glisse vers le haut pour afficher le diagramme des stations et les rames en approche.
- Prise en compte de la zone protégée de l'encoche iPhone (`env(safe-area-inset-top)` et `safe-area-inset-bottom`).

---

## 3. Diagramme de Marche Vertical (Niveau 2) (`station_ladder.ts`)

Inspiré des schémas de ligne officiels affichés au-dessus des portes de rames de métro :
- **Ligne de vie verticale** reliant les stations dans leur ordre commercial.
- **Commutateur de Direction (Terminus A ⇄ B)** : inversion instantanée de l'orientation de parcours.
- **Curseurs de Rames en Temps Réel** :
  - Chaque rame active est positionnée en face de son prochain arrêt.
  - Affichage de sa vitesse instantanée en km/h et de son retard (`À l'heure`, `+2 min`, `-1 min`).
  - **Clic sur un curseur** : la caméra se verrouille sur la rame et s'oriente dans son cap de marche en 3D.
- **Indicateur d'Intervalle Moyen (*Headway*)** : actualisé en direct selon le nombre de rames présentes dans la direction (ex: `2 min 40 s`).
- **Support des Branches (Ligne 7 et Ligne 13)** : séparation visuelle des tronçons bifurqués (ex: vers *Asnières-Gennevilliers* vs *Saint-Denis-Université* sur la 13).
- Résumé de ligne mis à jour à 1 Hz : rames par sens, headway, vitesse, stations, longueur, matériel et état du service.
- Les noms des stations apparaissent dès le zoom 13 pour les pôles/correspondances, dès 14,5 pour toutes les stations, et pour toute ligne sélectionnée. Le placement priorisé évite les collisions ; le survol garde le nom et les correspondances accessibles.

---

## 4. Barre de Recherche Instantanée (`search_bar.ts`)

Intégrée dans l'en-tête (avec raccourci clavier universel `⌘K` / `Ctrl+K`) :
- **Recherche floue insensible aux accents et à la casse** sur les stations du réseau métro + RER.
- **Affichage dynamique des résultats** :
  - Nom officiel de la station.
  - Macaron `Hub` doré pour les pôles majeurs d'échanges (Châtelet, Gare du Nord, Montparnasse...).
  - Pastilles officielles de toutes les lignes en correspondance.
- **Action au clic** : vol de caméra immédiat avec zoom 16x sur les quais de la station choisie.

---

## 5. Routage d'URL SPA & Historique de Navigation (`router.ts`)

L'application gère un routage d'URL monopage propre et partageable :

| URL | État déclenché |
|---|---|
| `/` | Vue générale du réseau parisien (21 lignes actives) |
| `/ligne/1` | Filtrage sur la ligne 1 (direction 0 par défaut) |
| `/ligne/14?dir=1` | Filtrage sur la ligne 14 orientée vers Saint-Denis Pleyel |

### Configuration Netlify (`_redirects`)
Pour que le rafraîchissement d'une URL directe ou un partage de lien (ex: `https://parisian3dsubway.netlify.app/ligne/6`) ne renvoie pas une erreur 404, le fichier [`web/public/_redirects`](file:///Users/morgancanteri/Documents/Paris%20subway%203D/web/public/_redirects) redirige toutes les requêtes vers `index.html` avec le code HTTP 200 :
```
/*    /index.html   200
```
Le routeur TypeScript intercepte l'URL lors du bootstrap et configure automatiquement le dock et la caméra sur la ligne demandée.
