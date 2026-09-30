# 🚀 Guide de Déploiement & Exploitation (Ops)

Ce document détaille les procédures de compilation, les variables d'environnement nécessaires, et la chaîne de déploiement automatisée sur Netlify.

---

## 1. Variables d'Environnement & Secrets

Les clés sensibles sont isolées dans le fichier local `.env` à la racine du projet (exclu de Git via `.gitignore`) :

```env
# Clé d'API Île-de-France Mobilités PRIM (Flux SIRI-Lite temps réel)
PRIM_API_KEY=

# Identifiants de déploiement Netlify
NETLIFY_SITE_ID=
NETLIFY_AUTH_TOKEN=
```

> [!CAUTION]
> Ne jamais commiter ni pousser ces jetons dans un dépôt Git public.

---

## 2. Compilation du Projet Web

La compilation se lance **depuis la racine** du dépôt (espace de travail npm) :

```bash
npm run build:web
```

Cette commande enchaîne trois étapes :

1. `python3 scripts/publish_train_models.py` — conversion des modèles de rames sources vers `web/public/models/train/` ;
2. `python3 scripts/build_train_asset_manifest.py --output data/model-assets-manifest.json --output web/public/data/model-assets-manifest.json` — régénération des manifestes canonique et servi (variante *fail-closed*, voir [DATA_PIPELINE.md](DATA_PIPELINE.md) §8) ;
3. `npm --workspace=web run build` — soit `tsc && vite build` (vérification stricte des types puis build Vite).

Pour ne faire que l'étape Vite pendant le développement : `cd web && npm run build`.

### Résultats de Build (mesurés sur `web/dist/`)

Le build produit dans `web/dist/` un bundle principal plus quelques chunks chargés à la demande :

| Fichier | Taille | Rôle |
|---|---|---|
| `assets/main-*.js` | **2 460 848 o** (~2,35 Mio) | MapLibre, deck.gl, moteur de simulation et interface |
| `assets/` | **2 544 824 o** (~2,43 Mio) | JavaScript et CSS compilés |
| `data/` | **13 413 162 o** (~12,79 Mio) | Artefacts réseau et simulation |
| `models/train/` | **18 928 o** (~18,5 Ko) | Deux modèles GLB publiés |
| Fichiers à la racine de `dist/` | **69 885 o** (~68,2 Ko) | Pages HTML, Open Graph, règles Netlify et fichiers système |
| **Total `web/dist/`** | **16 046 799 o** (~15,30 Mio) | Somme exacte des fichiers, hors blocs d'allocation disque |

**Il n'existe aucun chunk Three.js** : le rendu est intégralement assuré par MapLibre GL et deck.gl, qui partagent le pipeline cartographique publié.

### Poids total publié et dette à surveiller

| Sous-ensemble | Taille |
|---|---|
| `dist/assets/` (JS + CSS) | 2 544 824 o (~2,43 Mio) |
| `dist/data/` (14 artefacts) | 13 413 162 o (~12,79 Mio) |
| `dist/models/train/` (2 GLB) | 18 928 o (~18,5 Ko) |
| Fichiers à la racine | 69 885 o (~68,2 Ko) |
| **Total `web/dist/`** | **16 046 799 o (~15,30 Mio)** |

> [!NOTE]
> Les captures de diagnostic ne sont plus publiées. Le nettoyage a supprimé les 16 fichiers `diagnostic-*.png`, `step*-line12-*.png` et `phase*.png` présents lors de la passe de nettoyage. `og-image.png` a été conservé et vérifié en production (`HTTP 200`, `Content-Type: image/png`).

Les artefacts de données (`dist/data/`, ~12,79 Mio) sont en revanche indispensables, dominés par `schedule.json` (8 243 325 o) et `rer_lines.json` (3 211 447 o).

---

## 3. Déploiement en Production sur Netlify

Le site est hébergé sur le CDN mondial de Netlify à l'adresse :
👉 **[https://parisian3dsubway.netlify.app](https://parisian3dsubway.netlify.app)**

### Déploiement Direct via l'API Netlify

Le dépôt fournit un script dédié, [`scripts/deploy_netlify.py`](file:///Users/morgancanteri/Documents/Paris%20subway%203D/scripts/deploy_netlify.py), qui zippe `web/dist/` en mémoire et l'envoie à l'API Netlify, puis attend le passage à l'état `ready`. Il n'exige **aucune dépendance externe** (bibliothèque standard `urllib`, plus `certifi` s'il est disponible) et lit les identifiants depuis `.env` ou depuis l'environnement :

```bash
python3 scripts/deploy_netlify.py
```

L'équivalent minimal, si vous préférez une commande ponctuelle (nécessite `requests`) :

```bash
python3 -c '
import os, zipfile, io, requests, time

TOKEN = os.environ.get("NETLIFY_AUTH_TOKEN")
SITE_ID = os.environ.get("NETLIFY_SITE_ID")
DIST_DIR = "web/dist"

zip_buffer = io.BytesIO()
with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(DIST_DIR):
        for file in files:
            file_path = os.path.join(root, file)
            arcname = os.path.relpath(file_path, DIST_DIR)
            zf.write(file_path, arcname)

zip_bytes = zip_buffer.getvalue()
print(f"Envoi de {len(zip_bytes) / 1024 / 1024:.2f} Mo à Netlify...")

url = f"https://api.netlify.com/api/v1/sites/{SITE_ID}/deploys"
headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/zip"
}

res = requests.post(url, headers=headers, data=zip_bytes)
deploy_id = res.json().get("id")
print("Déploiement initié avec ID:", deploy_id)

for _ in range(25):
    d = requests.get(f"https://api.netlify.com/api/v1/deploys/{deploy_id}", headers=headers).json()
    if d.get("state") == "ready":
        print("✅ Déploiement EN LIGNE sur :", d.get("ssl_url"))
        break
    time.sleep(2)
'
```

---

## 4. Fichiers de Configuration Spécifiques Netlify

### 1. `netlify.toml` (racine)
C'est le fichier directeur du déploiement géré par Netlify :

```toml
[build]
  command   = "npm run build:web"
  publish   = "web/dist"
  functions = "netlify/functions"

[functions]
  node_bundler = "esbuild"

[functions."prim_relay"]
  schedule = "*/3 * * * *"   # rafraîchissement PRIM toutes les 3 minutes (Paris)

[functions."stm_relay"]
  schedule = "*/2 * * * *"   # rafraîchissement STM toutes les 2 minutes (Montréal)

[functions."tfl_relay"]
  schedule = "* * * * *"     # rafraîchissement TfL chaque minute (Londres)

[functions."lille_relay"]
  schedule = "* * * * *"     # rafraîchissement Ilévia GTFS-RT chaque minute (Lille)
```

Quatre relais serveur et leurs redirections associées sont configurés :
- `/api/prim` → `/.netlify/functions/prim_relay` (200)
- `/api/stm` → `/.netlify/functions/stm_relay` (200)
- `/api/tfl` & `/api/tfl_arrivals` → `/.netlify/functions/tfl_relay` (200)
- `/api/lille-rt` → `/.netlify/functions/lille_relay` (200)
- `/*` → `/index.html` (200, routage SPA)

---

## 5. Artefacts Attendus par Ville (`web/dist/cities/<ville>/`)

Chaque ville dispose d'une arborescence autonome sous `cities/<ville>/data/` synchronisée dans `web/public/cities/<ville>/data/` :

| Ville | Artefacts attendus (`data/`) | Modèles 3D (`models/train/`) | Relais Netlify |
|---|---|---|---|
| **Paris** | 17 fichiers à la racine (`data/`) | `pneumatic_generic`, `steel_classic`, `rer_generic_A..E` | `/api/prim` |
| **Montréal** | 10 fichiers (`cities/montreal/data/`) | `mr_73__neutral.glb`, `mpm_10__neutral.glb` | `/api/stm` |
| **Londres** | 10 fichiers (`cities/london/data/`) | 10 profils Tube, Overground, DLR, Elizabeth, Tram | `/api/tfl` |
| **Lille** | 10 fichiers (`cities/lille/data/`) | `val_208__neutral.glb`, `val_52m__neutral.glb`, `breda_vlc__neutral.glb` | `/api/lille-rt` |

---

## 6. Checklist de Publication

1. `npm run build:web` depuis la racine et vérification qu'aucune erreur TypeScript ne subsiste.
2. `npm test` pour s'assurer de la conformité de tous les tests unitaires, snapshots (Paris, Montréal, Londres, Lille) et empreinte de build.
3. `python3 scripts/deploy_netlify.py --prod` (lit `NETLIFY_AUTH_TOKEN` et `NETLIFY_SITE_ID` depuis `.env` ou l'environnement).
4. Contrôle post-déploiement :
   - `curl -I https://parisian3dsubway.netlify.app/cities/lille/data/lines.json` (HTTP 200)
   - `curl -I https://parisian3dsubway.netlify.app/cities/lille/models/train/breda_vlc__neutral.glb` (HTTP 200)
   - `curl -I https://parisian3dsubway.netlify.app/api/lille-rt` (HTTP 200)
