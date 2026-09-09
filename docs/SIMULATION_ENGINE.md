# ⚙️ Moteur de Simulation Cinématique In-Browser

Ce document détaille le fonctionnement interne du moteur de circulation autonome exécuté dans le navigateur web (`web/src/sim/`), capable d'animer avec fluidité plus de 500 rames simultanées à 60 FPS sans dépendre d'un serveur applicatif lourd.

---

## 1. Principe Général de la Boucle de Simulation

Le moteur [`BrowserSubwayEngine`](file:///Users/morgancanteri/Documents/Paris%20subway%203D/web/src/sim/browser_engine.ts) orchestre la simulation temporelle cadencée à **1 Hz** :

```
[Horloge Système] ---> [Conversion Heure de Paris Europe/Paris]
                             │
                             ▼
              [Filtrage des Courses Actives]
              (currentSec >= t0 && currentSec <= t1)
                             │
                             ▼
       [Recalage par Retard Temps Réel PRIM (si disponible)]
                effTime = currentSec - delaySeconds
                             │
                             ▼
         [Calcul Cinématique Trapézoïdale (kinematics.ts)]
         - Abscisse curviligne d (mètres)
         - Vitesse instantanée v (km/h)
         - Cap lissé / Bearing θ (degrés)
                             │
                             ▼
          [Recherche Binaire sur shapes.bin Float32Array]
            Position WGS84 [longitude, latitude]
                             │
                             ▼
         [Notification aux Couches Graphiques deck.gl & Three.js]
```

---

## 2. Profil Cinématique Trapézoïdal Réaliste

Une simple interpolation linéaire ($v = \text{constante}$) donne une impression artificielle : les rames démarrent instantanément à 50 km/h et pilent net à 0 km/h.

Le module [`kinematics.ts`](file:///Users/morgancanteri/Documents/Paris%20subway%203D/web/src/sim/kinematics.ts) implémente un **profil de vitesse trapézoïdal physique** sur chaque interstation :

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

### Algorithme de dichotomie $O(\log N)$ :
Chaque tracé contient entre 500 et 3 000 points pré-ordonnés par distance croissante.
La recherche par dichotomie trouve en **$\le 11$ itérations** l'intervalle $[d_i, d_{i+1}]$ encadrant $d$.
Les coordonnées sont alors interpolées linéairement :
$$\text{fraction} = \frac{d - d_i}{d_{i+1} - d_i}$$
$$\text{lng} = \text{lng}_i + \text{fraction} \times (\text{lng}_{i+1} - \text{lng}_i)$$
$$\text{lat} = \text{lat}_i + \text{fraction} \times (\text{lat}_{i+1} - \text{lat}_i)$$

---

## 4. Calcul du Cap Lissé & Orientation des Rames

Pour orienter la rame (ou ses phares 3D) dans le sens de la marche, le cap instantané brut entre deux sommets consécutifs de 10 m serait trop bruité par les zig-zags des courbes.
La fonction `getSmoothedBearing` calcule le cap moyen sur une **fenêtre glissante de $\pm 30\text{ mètres}$** :

$$p_1 = \text{position}(d - 30\text{ m})$$
$$p_2 = \text{position}(d + 30\text{ m})$$
$$\theta = \text{atan2}\left(\sin(\Delta \lambda) \cos(\phi_2), \; \cos(\phi_1)\sin(\phi_2) - \sin(\phi_1)\cos(\phi_2)\cos(\Delta \lambda)\right)$$

Ce lissage garantit que les rames pivotent avec une fluidité naturelle dans les courbes et aiguillages.

---

## 5. Calcul de l'Intervalle Moyen (*Headway*)

Dans le diagramme de marche vertical (`station_ladder.ts`), l'intervalle moyen en direct entre deux rames est calculé dynamiquement :
$$\text{Headway Moyen} = \frac{\text{Temps de parcours commercial de la ligne}}{\text{Nombre de rames actives dans la direction}}$$

Ce calcul s'actualise en temps réel à chaque départ ou arrivée de rame sur la ligne.
