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

## 2. Compilation du Projet Web (`web/`)

L'application web est construite avec **Vite** et **TypeScript** :

```bash
# Se placer dans le dossier web
cd web

# 1. Vérification stricte des types TypeScript & compilation Vite
npm run build
```

### Résultats de Build
Le build génère un bundle ultra-optimisé dans `web/dist/` avec **code-splitting dynamique** :
- `dist/index.html` (~5.1 Ko) : point d'entrée HTML5 avec préconnexions Google Fonts et meta viewports.
- `dist/assets/index-*.js` (~1.69 Mo) : code principal (MapLibre, deck.gl, moteur de simulation et interface).
- `dist/assets/paris_scene-*.js` (~584 Ko, 146 Ko gzipped) : **chunk Three.js isolé**, téléchargé uniquement si l'utilisateur bascule sur le Studio 3D (`🗼`).
- `dist/assets/index-*.css` (~17.1 Ko) : styles consolidés, design tokens et polices.
- `dist/data/` : artefacts de données compactés (`tracks.json`, `shapes.bin`, `schedule.json`, `line_ladders.json`, `paris_urban_mesh.json`).

---

## 3. Déploiement en Production sur Netlify

Le site est hébergé sur le CDN mondial de Netlify à l'adresse :
👉 **[https://parisian3dsubway.netlify.app](https://parisian3dsubway.netlify.app)**

### Déploiement Direct via l'API Netlify (Python)
Pour déployer instantanément une nouvelle version de `web/dist/` :

```bash
./ingest/.venv/bin/python -c '
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

### 1. `web/public/_redirects` (Routage SPA)
Garantit que les URL profondes (ex: `/ligne/1`, `/ligne/14?dir=1`) sont servies par le routeur côté client sans erreur 404 :
```
/*    /index.html   200
```

### 2. `web/public/_headers` (Sécurité & Caching)
Configure les en-têtes de sécurité HTTP stricts et désactive l'injection de widgets tiers non sollicités :
```
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
```

### 3. Compression & Performance HTTP
Les fichiers binaires volumineux comme `shapes.bin` (1.75 Mo) et `schedule.json` (7.9 Mo) sont automatiquement servis par Netlify avec compression **Brotli / Gzip**, réduisant le transfert réel à ~2.2 Mo sur le réseau.
