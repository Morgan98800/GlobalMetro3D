# ⚙️ Moteur de Simulation Cinématique In-Browser

Ce document détaille le fonctionnement interne du moteur de circulation autonome exécuté dans le navigateur web (`web/src/sim/`), capable d'animer la totalité du service simultané à 60 FPS sans dépendre d'un serveur applicatif lourd.

**Charge réelle mesurée** dans `web/public/data/schedule.json` (Métro) et `web/public/data/rer_schedule.json` (RER) :

| Métrique | Métro (16 lignes) | RER (5 lignes A, B, C, D, E) | Total Réseau Régional |
|---|---|---|---|
| Courses programmées | **11 252** | **2 613** | **13 865** |
| Rames simultanées en pointe | **533** (08:51) | **233** (08:30) | **~766** rames en ligne |
| Lignes couvertes | **16** | **5** (A, B, C, D, E) | **21 lignes** |
| Fenêtre de service | **05:22 → 25:16** | **00:00:29 → 24:58:08** | **24h/24** |
| Fichier géométrique SHP2 | `shapes.bin` (116 shapes, 0,8 Mo) | `rer_shapes.bin` (250 shapes, 4,1 Mo) | **366 shapes**, 11 546 km |

---

## 1. Principe Général de la Boucle de Simulation

Le moteur [`BrowserSubwayEngine`](file:///Users/morgancanteri/Documents/Paris%20subway%203D/web/src/sim/browser_engine.ts) orchestre la simulation selon **deux fréquences imbriquées** :

- un **tick de simulation à 1 Hz** (`setInterval`) qui relit l'heure, sélectionne les courses actives et recalcule les positions exactes ;
- une **boucle d'interpolation à 60 FPS** (`requestAnimationFrame`) qui extrapole ces positions entre deux ticks pour un rendu fluide (voir §6).

```
[Horloge Système] ---> [paris_time.ts : journées de service candidates]
                             │
                             ▼
              [Sélection des Courses Actives (selectActiveTrips)]
              (currentSec >= t0 && currentSec <= t1, tolérant à minuit)
                             │
                             ▼
    [Niveau 2 : Rapprochement Course↔GTFS — matchScore()]
    [Niveau 3 : Chronologie Corrigée — buildTimeline()]
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
   [Temps réel actif]            [Aucun flux PRIM]
   positionAt(timeline, t)       kinematics.ts (profil trapézoïdal)
   profil trapézoïdal accel/     coefficient de transition k = 0.25
   decel + 4 niveaux de confiance
              └──────────────┬──────────────┘
                             ▼
         [Recherche Binaire sur shapes.bin SHP2 v2]
            Position WGS84 [longitude, latitude]
                             │
                             ▼
          [Notification aux Couches Graphiques MapLibre & deck.gl]
```

---

## 2. Résolution de l'Heure de Service (`paris_time.ts`)

C'est le module qui a corrigé le bug le plus vicieux du moteur. La version initiale faisait `currentSec = sec % 86400` : dans un GTFS, une course qui continue après minuit porte une heure **≥ 86 400** (24h30 = 88 200 s). À 00h30, `currentSec` valait 1 800 et **aucune course n'était sélectionnée** : zéro rame sur la carte.

Le principe retenu est qu'un instant donné appartient à **deux journées de service possibles**. À 00h30 le mardi, on est à la fois à 1 800 s de la journée de mardi et à 88 200 s de la journée de lundi.

- `parisClock(now)` renvoie le couple `ParisClock { date: 'YYYY-MM-DD', secondsSinceMidnight: 0..86399 }` via un `Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris' })`, ce qui absorbe correctement les changements d'heure.
- `serviceCandidates(now)` retourne **une ou deux** journées : la journée civile courante, plus la veille si l'on est avant **05:00** civiles (le service de nuit ne dépasse jamais ~29h).
- `selectActiveTrips(trips, now, runsOn?, marginSeconds?)` évalue chaque course contre les deux candidats et retourne `ActiveTrip { trip, serviceSeconds, serviceDate }`. `runsOn` est optionnel : `schedule.json` ne porte pas de calendrier, donc toutes les courses sont considérées valides les deux jours — sans effet de bord, car une course diurne a un `t1` bien inférieur à 86 400 s.
- `getServiceStatus()` expose l'état du service (`active` / `before_first` / `ended` / `loading`) avec `firstMetroLabel` et `secondsUntilFirst` pour l'affichage « première rame à 05:22 ».

---

## 3. Profil Cinématique Trapézoïdal Réaliste

Une simple interpolation linéaire ($v = \text{constante}$) donne une impression artificielle : les rames démarrent instantanément à 50 km/h et pilent net à 0 km/h.

Le module [`kinematics.ts`](file:///Users/morgancanteri/Documents/Paris%20subway%203D/web/src/sim/kinematics.ts) implémente un **profil de vitesse trapézoïdal physique** sur chaque interstation.

> **Deux trapèzes coexistent dans le moteur.** `kinematics.ts` (mode théorique pur) utilise un coefficient de transition fixe $k = 0.25$ et ne dépend que de la géométrie du tracé. `rt_matching.ts` (mode temps réel) possède son propre `trapezoid()` paramétré par une accélération et une décélération physiques (`accel = 1,0 m·s⁻²`, `decel = 1,2 m·s⁻²`) bornées par `vMax = 19,4 m·s⁻¹` (~70 km/h), de sorte que la rame respecte un profil plausible même lorsque la chronologie corrigée lui impose un retard à rattraper.

```
Vitesse (km/h)
   ^
v_max ───────            ┌────────────────────────────┐
             │           │                            │
             │          /                              \
             │         /                                \
             │        /                                  \
   0 ────────┴───────┴────────────────────────────────────┴─────────> Temps (s)
             [Arrêt] [Accélération]      [Croisière]      [Freinage]
             Station A                                    Station B
```

### Formules Mathématiques

Soit $\Delta D = dist_1 - dist_0$ la distance interstation en mètres et $T = arr_1 - dep_0$ la durée commerciale prévue en secondes.
On définit la fraction temporelle normalisée :
$$\tau = \frac{t_{\text{eff}} - dep_0}{T} \in [0, 1]$$

En fixant le coefficient de transition d'accélération/freinage à $k = 0.25$ (25 % du temps en accélération, 50 % en vitesse de croisière stabilisée, 25 % en décélération douce) :

1. **Vitesse de croisière théorique** :
   $$V_{\text{cruise}} = \frac{\Delta D}{(1 - k) \times T}$$

2. **Phase 1 : Accélération progressive ($\tau \in [0, k]$)** :
   $$\text{Progression } S(\tau) = \frac{1}{2} \frac{\tau^2}{k(1 - k)}$$
   $$\text{Vitesse instantanée } v(\tau) = V_{\text{cruise}} \times \left(\frac{\tau}{k}\right)$$

3. **Phase 2 : Vitesse de croisière stabilisée ($\tau \in [k, 1 - k]$)** :
   $$\text{Progression } S(\tau) = \frac{\tau - 0.5 k}{1 - k}$$
   $$\text{Vitesse instantanée } v(\tau) = V_{\text{cruise}}$$

4. **Phase 3 : Décélération & Freinage doux ($\tau \in [1 - k, 1]$)** :
   Soit $u = 1 - \tau \in [0, k]$ :
   $$\text{Progression } S(\tau) = 1 - \frac{1}{2} \frac{u^2}{k(1 - k)}$$
   $$\text{Vitesse instantanée } v(\tau) = V_{\text{cruise}} \times \left(\frac{u}{k}\right)$$

5. **Phase 4 : Stationnement en station ($t_{\text{eff}} \in [arr_0, dep_0]$)** :
   $$S = 0 \quad \text{et} \quad v = 0\text{ km/h}$$
   La rame reste immobile à quai pendant les 20 à 30 secondes d'échange de voyageurs.

---

## 3. Détermination de la Position & Recherche Binaire

Une fois l'abscisse curviligne $d$ (en mètres) obtenue, la fonction `getCoordAtDistance` localise instantanément le point géographique correspondant dans le buffer binaire `shapes.bin`.

### Format binaire SHP2 v2 ([`shapes_loader.ts`](file:///Users/morgancanteri/Documents/Paris%20subway%203D/web/src/sim/shapes_loader.ts))
Les tracés ne sont **pas** un JSON : `shapes.bin` (804 816 octets, **116 tracés canoniques**) est décodé en `ArrayBuffer` avec le schéma suivant.

| Octet | Champ | Encodage |
|---|---|---|
| 0 | `magic` | `0x53485032` — `'SHP2'`, lu en **big-endian** |
| 4 | `version` | `uint16` = **2** |
| 6 | `shapeCount` | `uint16` = **116**, lu en **little-endian** |
| — | `idLen` + `idBytes` + alignement sur 4 octets | par tracé |
| — | `pointCount` `uint32`, `step` `float32`, `tailLength` `float32` | métadonnées du tracé |
| — | `lng0` `int32`, `lat0` `int32` | point d'origine |
| — | `(pointCount − 1)` × `int16` (delta lng, delta lat) | points suivants en delta |

Les coordonnées sont des entiers mis à l'échelle par `SCALE = 1e-7` (7 décimales, ~1 cm à Paris). Le chargement utilise `cache: 'force-cache'` et une **mémoïsation par promesse** (`let pending: Promise<ShapeIndex> | null`) afin qu'un même fichier ne soit jamais téléchargé deux fois, même en cas d'appels concurrents au démarrage.

### Algorithme de dichotomie $O(\log N)$ :
Chaque tracé contient de l'ordre de plusieurs centaines à quelques milliers de points pré-ordonnés par distance croissante.
La recherche par dichotomie trouve en **$\le 11$ itérations** l'intervalle $[d_i, d_{i+1}]$ encadrant $d$ (voir aussi `shapes.ts`, qui expose la longueur cumulée du tracé).
Les coordonnées sont alors interpolées linéairement :
$$\text{fraction} = \frac{d - d_i}{d_{i+1} - d_i}$$
$$\text{lng} = \text{lng}_i + \text{fraction} \times (\text{lng}_{i+1} - \text{lng}_i)$$
$$\text{lat} = \text{lat}_i + \text{fraction} \times (\text{lat}_{i+1} - \text{lat}_i)$$

---

## 5. Calcul du Cap Lissé & Orientation des Rames

Pour orienter la rame (ou ses phares 3D) dans le sens de la marche, le cap instantané brut entre deux sommets consécutifs de 10 m serait trop bruité par les zig-zags des courbes.
La fonction `getSmoothedBearing(shape, distM, windowM = 30)` calcule le cap moyen sur une **fenêtre glissante de $\pm 30\text{ mètres}$** :

$$p_1 = \text{position}(d - 30\text{ m})$$
$$p_2 = \text{position}(d + 30\text{ m})$$
$$\theta = \text{atan2}\left(\sin(\Delta \lambda) \cos(\phi_2), \; \cos(\phi_1)\sin(\phi_2) - \sin(\phi_1)\cos(\phi_2)\cos(\Delta \lambda)\right)$$

Ce lissage garantit que les rames pivotent avec une fluidité naturelle dans les courbes et aiguillages. Le résultat est borné à **85°** afin qu'un tracé en épingle ne fasse jamais basculer la rame sur le côté.

---

## 6. Interpolation Sub-seconde à 60 FPS

Le tick à 1 Hz ne suffit pas : entre deux recalculs, la rame doit continuer d'avancer sans à-coups. La boucle `requestAnimationFrame` extrapole donc chaque rame :

$$d_{\text{estimé}} = d_{\text{tick}} + v \times \Delta t + e_{\text{réconciliation}}(t)$$

- **Extrapolation linéaire** : `v` est la vitesse instantanée issue du profil trapézoïdal, `Δt` le temps écoulé depuis le dernier tick.
- **Réconciliation douce sur 300 ms** : lorsque la nouvelle position recalcule une erreur `rawError = extrapolatedD − dTick`, cette erreur n'est pas appliquée d'un coup mais résorbée linéairement sur **300 ms** (`factor = 1.0 − elapsed / 300`).
- **Seuil de décrochage à 20 m** : au-delà de `|rawError| > 20`, la réconciliation est abandonnée (`reconcileOffset = 0`) et la rame est replacée directement — cela se produit lors d'un recalage temps réel brutal ou d'un changement de course.
- **Bornage** : `d` est toujours écrêté dans `[0, shape.length]` pour éviter une rame hors tracé en bout de ligne (avertissement console émis une seule fois par course).
- **Fondu des rames fantômes** : une rame retirée reste rendue pendant **240 ms** avant disparition complète, ce qui évite le clignotement.
- **`prefers-reduced-motion`** : si l'utilisateur a demandé une réduction des animations, la boucle 60 FPS est court-circuitée et les positions sont appliquées directement au tick — aucune interpolation, aucun fondu.

---

## 7. Matériel Roulant ([`rolling_stock.ts`](file:///Users/morgancanteri/Documents/Paris%20subway%203D/web/src/sim/rolling_stock.ts))

Ce module fournit les dimensions physiques nécessaires au dessin des caisses et au calcul de la « corde » rigide entre bogies.

- `loadRollingStock(url = '/data/rolling-stock.json')` charge la base (modèles + affectations par ligne) et **audite** les entrées : toute ligne dont `verified` est faux est signalée par un `console.warn` listant le modèle et la source.
- `getRollingStockForLine(db, lineIdOrShortName)` résout une ligne par nom court (`"1"`, `"14"`, `"7bis"`) puis par identifiant IDFM (`IDFM:C01371`).
- `getBogieCentresM(stock)` renvoie `bogie_centres_m`, avec la valeur de repli `DEFAULT_BOGIE_CENTRES_M = 11,0 m` — c'est cette corde qui contraint l'orientation de la caisse au-dessus des courbes.
- **Repli générique** si la ligne est inconnue : 5 voitures, 75 m, voiture de 15 m, largeur 2,40 m, soufflet 0,95 m, `drive_type: 'steel'`, `verified: false`.
- Le champ `drive_type` distingue `'tire'` (pneumatique : lignes 1, 4, 6, 11, 14…) de `'steel'` (fer classique), information utilisée par le rendu des rames.

---

## 8. Calcul de l'Intervalle Moyen (*Headway*)

Dans le diagramme de marche vertical (`station_ladder.ts`), l'intervalle moyen en direct entre deux rames est calculé dynamiquement :
$$\text{Headway Moyen} = \frac{\text{Temps de parcours commercial de la ligne}}{\text{Nombre de rames actives dans la direction}}$$

Ce calcul s'actualise en temps réel à chaque départ ou arrivée de rame sur la ligne.

---

## 9. Rapprochement Temps Réel ([`rt_matching.ts`](file:///Users/morgancanteri/Documents/Paris%20subway%203D/web/src/sim/rt_matching.ts))

Lorsque le flux PRIM est disponible, la cinématique théorique est remplacée par une **chronologie corrigée par course**. Le détail complet figure dans [REALTIME_PRIM.md](REALTIME_PRIM.md) ; les points structurants pour le moteur sont :

1. **`matchScore(journey, trip)`** — rapproche une course du flux avec une course GTFS en comparant les heures théoriques aux arrêts communs (médiane, rejet au-delà de 120 s, score `médiane / √(arrêts communs)`).
2. **`buildTimeline(trip, calls, previous?)`** — produit une `Timeline` d'arrêts corrigés : mesure directe, interpolation encadrée entre deux mesures, ou décroissance sur 4 000 m après la dernière mesure. L'écart est lissé par `alpha = 0,4` contre la chronologie précédente.
3. **`positionAt(timeline, t)`** — renvoie `Position { dist, speed, delay, confidence, nextStopId, atStop }`, avec un profil trapézoïdal paramétré par `accel`/`decel` et plafonné à `vMax`.
4. **`confidenceFor(...)`** — attribue `measured`, `bracketed`, `extrapolated` ou `scheduled` selon le nombre d'arrêts encadrants mesurés et la fraîcheur de la dernière mesure (`staleAfter = 6 min`).
5. **`GhostTracker`** — compte les concédés consécutifs sans mesure par `tripId` pour identifier les courses supprimées, sans conclure hâtivement si le flux est en panne.

---

## 10. Tests

Les suites unitaires s'exécutent directement avec Node en mode `--experimental-strip-types` (aucun bundler requis) :

```bash
npm --workspace=web test            # shapes + paris_time
npm --workspace=web run test:shapes
npm --workspace=web run test:time
npm --workspace=web run test:train-models
```

| Fichier | Couverture |
|---|---|
| `paris_time.test.ts` | Changements d'heure, journée de service dupliquée après minuit, courses ≥ 86 400 s |
| `shapes.test.ts` | Décodage du format SHP2 v2 et recherche par abscisse curviligne |
| `../map/train_models_layer.test.ts` | Politique de rendu des modèles glTF (seuil de zoom, plafonds d'instances) |
