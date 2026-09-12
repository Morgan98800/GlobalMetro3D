# Audit design & utilisabilité — chrome UI

**Version 2 — correction de méthode.** Les sections **5 et 6** de la v1 étaient déduites des media queries, pas des images : elles sont **réécrites ci-dessous** (`C3.1` et `C3.2`), mesurées sur des `getBoundingClientRect()` relevés au runtime et sur des pixels de capture. Les cinq sous-sections `C1` à `C5` sont la réponse point par point à la correction demandée ; le corps de la v1 suit à partir de `## 1. Inventaire des composants de chrome`, et **ses sections 5, 6 et 10 y ont été corrigées sur place**, ainsi que, en annexe, les citations fausses relevées en `C4.g` : §3 (`chrome.css:246-248` → `chrome.css:615-617`), §6 (breakpoints `chrome.css:220` → `chrome.css:580`), et le décompte des captures de l'en-tête v1 (28 → 14 faisant autorité + 15 conservées comme preuve de l'artefact). Toute phrase de la v1 restée utile mais non revérifiée en v2 porte la mention **DÉDUIT DU CSS, NON VÉRIFIÉ**.

**Règle de preuve applicable à tout ce document à partir d'ici** *(demandée, extraite verbatim)* :

> Tout constat de mise en page doit désormais citer une valeur relevée au runtime ou un pixel de capture. Un constat déduit d'une media query est marqué **DÉDUIT DU CSS, NON VÉRIFIÉ**.

> [!NOTE]
> **Périmètre temporel.** Ce document est une **photographie d'un état donné** du chrome UI, à la date du harnais `/tmp/audit_shot.cjs`. Il n'est pas remis à jour quand le produit change, et c'est volontaire : ses valeurs n'ont de sens que comparées à d'autres valeurs mesurées de la même façon.
>
> Depuis, trois choses ont bougé et rendent certaines lignes obsolètes :
>
> 1. **La palette a été réécrite.** L'audit raisonne sur la rampe prune de la v1 (`#150E12`, `#F1EFEA`, `#E0483F`, …). L'implémentation actuelle est une rampe **gris chaud neutre** (`--fond #0C0B0B`, `--texte #F2EFE9`, `--carmin #D9463C`). Les alias de l'ancienne charte subsistent dans `tokens.css`. Voir [CHARTE-intERVALLE-sprague.md](docs/CHARTE-intERVALLE-sprague.md) §6.
> 2. **Les contrôles « Studio 3D » ont été retirés du produit** (`#btn-studio-mode`, `#studio-nav-bar`). Les constats qui les visent décrivent un chrome qui n'existe plus.
> 3. **Le fond de carte a changé** : Esri raster → OpenFreeMap vectoriel.

Périmètre inchangé : **mesure uniquement, aucune modification du produit**. Aucun fichier n'a été touché par cet audit. Hors périmètre absolu, non abordé, non modifié : moteur, pipeline, géométrie des tracés, `shapes.bin`, `schedule.json`, LOD, caméra, rendu 3D.

---

## C1. HARNAIS — comment les captures ont été prises, et pourquoi la v1 ne voyait que 573 px

### C1.1 Les deux harnais

**Jeu v1 (périmé, conservé comme preuve)** — l'outil **Playwright MCP** (extension VS Code), piloté par appels d'outils successifs : `open_browser_page`, `navigate_page`, `run_playwright_code` pour le clic, `screenshot_page`. Les 15 images sont dans `audit/design/harness-artifact/`.

**Jeu v2 (faisant autorité)** — un script autonome **hors du dépôt**, `/tmp/audit_shot.cjs`, exécuté par `node /tmp/audit_shot.cjs`. Moteur : **Chromium headless (Chrome for Testing 153.0.8010.12)**, `playwright-core@1.57.0`, script local. Aucune dépendance ajoutée au dépôt, aucun fichier du dépôt touché.

Ordre exact des appels, identique pour les 14 captures (source : `/tmp/audit_shot.cjs`, lignes 70-107) :

```js
const browser = await chromium.launch({ executablePath: EXE, headless: true,
  args: ['--force-device-scale-factor=1', '--hide-scrollbars', '--use-gl=angle'] });
for (const [w, h] of WIDTHS) for (const state of ['home', 'ligne14']) {
  const ctx  = await browser.newContext({ viewport: { width: w, height: h },
                                          deviceScaleFactor: 1, locale: 'fr-FR' });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll('.line-badge').length >= 21,
                             null, { timeout: 45000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(5000);                       // rendu 3D + données temps réel
  if (state === 'ligne14') {
    await page.evaluate(() => {                          // clic DOM en page, pas clic souris
      const b = [...document.querySelectorAll('.line-badge')].find(x => x.textContent.trim() === '14');
      (b.closest('button') || b).click();
    });
    await page.waitForFunction(() => document.querySelectorAll('.ladder-node-name').length > 3,
                               null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3500);
  }
  const m = await page.evaluate(MEASURE);
  await page.screenshot({ path: `audit/design/${state}_w${w}.png` });
  await ctx.close();
}
```

- **Nouvelle page et nouveau contexte par largeur et par état** : aucun redimensionnement en cours de session, donc aucun besoin de relayout. Le point 2 de la correction est satisfait par construction.
- **Viewport** : `{320×568, 390×844, 430×932, 768×1024, 1024×768, 1440×900, 1920×1080}` — les six largeurs demandées plus 768.
- **DPR** : `deviceScaleFactor: 1` **et** `--force-device-scale-factor=1`. Les 14 PNG sont donc à l'échelle 1:1 (vérifié : chaque fichier fait exactement `largeur × hauteur`).
- **Attente** : condition d'arrêt sur les 21 pastilles (données réseau chargées) + `document.fonts.ready` + 5 s (3,5 s de plus après sélection de ligne).
- **Clic** : `element.click()` **exécuté dans la page**, pas un clic souris Playwright. Conséquence à retenir pour le défaut (b) : à 320 px la pastille « 14 » est **cliquable par programme** tout en étant **hors de la zone atteignable par un pointeur réel**.

### C1.2 `map.resize()` : il n'y en a aucun, et il n'en faut aucun

- Aucun appel `map.resize()` n'existe dans l'application. On ne trouve que `web/src/main.ts:270-281` (écouteur `resize` → debounce 140 ms → `fitMetroNetwork(450)` recadre la caméra) et `web/src/ui/header.ts:245`.
- **Fait plus fort, vérifié dans le bundle réellement servi** : `MapLibre GL JS 4.7.1` (chargé depuis `https://unpkg.com/maplibre-gl@4.7.1`, non embarqué dans le dépôt) contient `trackResize:!0` par défaut **et** `new ResizeObserver(...)`. Le canvas de la carte se redimensionne donc seul avec son conteneur, sans `resize()` manuel. Vérification : `curl -s https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js | grep -c ResizeObserver` → `1` ; `grep -o 'trackResize:!0'` → présent.
- **Conclusion : l'absence de `map.resize()` n'est pas l'explication du plateau à 573 px.** C'était une fausse piste.

### C1.3 La question unique : 573 px = état réel du site, ou artefact du harnais ?

**Réponse : artefact du harnais.** Le contenu ne plafonne pas à 573 px CSS sur le site en desktop ; c'est la **surface de rendu du navigateur MCP** qui coupe la peinture. Preuve, trois mesures indépendantes.

**Preuve 1 — la v1 n'a jamais atteint la mise en page desktop, à aucune largeur.** Dans les fichiers de `harness-artifact/`, la bordure inférieure de `.topbar` tombe **au même endroit en pixels** à 768, 1024, 1440 et 1920 : détectée aux **lignes de l'image 94-95** dans les quatre cas. À DPR 2 cela vaut **y = 47 px CSS**, c'est-à-dire la hauteur du bandeau **mobile (48 px)**, jamais celle du bandeau desktop (52 px). Si le harnais avait rendu un viewport de 1024, 1440 ou 1920 px CSS, la v1 aurait capturé le bandeau 52 px. Elle ne l'a jamais fait.

| image v1 | taille fichier | bbox du contenu | bbox du fond du tiroir | bord de `.topbar` |
|---|---|---|---|---|
| `home_w1024.png` | 2048×1536 | 1144×856 | 1144×856 | image y 94-95 |
| `home_w1440.png` | 2880×1800 | 1144×714 | 1144×714 | image y 94-95 |
| `home_w1920.png` | 3840×2160 | 1144×642 | 1144×642 | image y 94-95 |
| `home_w768.png` | 1536×2048 | (plein) | 1144×856 | image y 94-95 |
| `home_w430.png` | 860×1864 | (plein) | 860×1862 | image y 94-95 |
| `home_w320.png`, `ligne14_w320.png` | 640×1136 | 638×1116 / 638×1134 | — | image y 94-95 |

Les fichiers grandissent (2048, 2880, 3840 px de large) mais **le contenu reste à 1144 px de large au maximum, et le fond du tiroir à exactement 1144 px dans les trois cas desktop** : la même mise en page, peinte dans le même coin, à toutes les largeurs demandées. En pixels rétiniens, 1144 ÷ 2 = **572 px CSS**, d'où le plateau à 573 px relevé. La surface MCP est une surface *bridgée* en DPR 2, clippée à **573,5 × 357,5 px CSS (1147 × 715 device)**, alors que `window.innerWidth` et `getBoundingClientRect()` de `#map` y répondent bien la largeur demandée. C'est exactement la signature d'un artefact de composition : le DOM dit 1920, la peinture dit 573.

**Preuve 2 — les 14 captures v2 remplissent 100 % du viewport.** Chaque PNG fait exactement `largeur × hauteur` (DPR 1), sans bande noire résiduelle, et `innerWidth` relevé dans la page égale la largeur demandée. Détail en `C2`.

**Preuve 3 — la mise en page change bien avec la largeur quand on la mesure.** Toujours avec les mêmes fichiers que la v1 : `.topbar` mesure **48 px à 320/390/430/768** et **52 px à 1024/1440/1920** (`C2`, table A). La v1 ne pouvait pas produire cette différence ; la v2 la produit à chaque largeur.

Donc : **« artefact de ton harnais ». L'état réel du site en desktop n'est pas un contenu de 573 px.** Le harnais v1 est conservé (`audit/design/harness-artifact/`) parce qu'il reste une preuve utilisable : il montre la mise en page *mobile* rendue à DPR 2, pas le desktop.

---

## C2. RECAPTURE — les 14 captures, une par une, avec les valeurs relevées

Les 14 images sont dans `audit/design/`, nommées `home_w<largeur>.png` et `ligne14_w<largeur>.png`. Le relevé complet (toutes les valeurs ci-dessous, plus celles exploitées en `C3` et `C4`) est dans **`audit/design/metrics.json`**, écrit par le harnais à la fin de la passe.

**Table A — les valeurs demandées, une ligne par capture.** Rectangles en px CSS, format `x,y,largeur,hauteur`. Chaque champ est arrondi indépendamment au pixel (un `y + h` peut donc différer d'une unité du `bottom` d'origine).

| # | capture | `innerWidth` | `innerHeight` | `devicePixelRatio` | `#map` (x,y,w,h) | `.topbar` (x,y,w,h) | `.dock` (x,y,w,h) |
|---|---|---|---|---|---|---|---|
| 1 | `home_w320.png` | 320 | 568 | 1 | 0,0,320,568 | 0,0,320,48 | 10,286,301,273 |
| 2 | `ligne14_w320.png` | 320 | 568 | 1 | 0,0,320,568 | 0,0,320,48 | 10,286,301,273 |
| 3 | `home_w390.png` | 390 | 844 | 1 | 0,0,390,844 | 0,0,390,48 | 10,429,371,405 |
| 4 | `ligne14_w390.png` | 390 | 844 | 1 | 0,0,390,844 | 0,0,390,48 | 10,429,371,405 |
| 5 | `home_w430.png` | 430 | 932 | 1 | 0,0,430,932 | 0,0,430,48 | 10,475,411,447 |
| 6 | `ligne14_w430.png` | 430 | 932 | 1 | 0,0,430,932 | 0,0,430,48 | 10,475,411,447 |
| 7 | `home_w768.png` | 768 | 1024 | 1 | 0,0,768,1024 | 0,0,768,52 | 10,524,749,491 |
| 8 | `ligne14_w768.png` | 768 | 1024 | 1 | 0,0,768,1024 | 0,0,768,52 | 10,523,749,492 |
| 9 | `home_w1024.png` | 1024 | 768 | 1 | 0,0,1024,768 | 0,0,1024,52 | 24,64,390,680 |
| 10 | `ligne14_w1024.png` | 1024 | 768 | 1 | 0,0,1024,768 | 0,0,1024,52 | 24,64,390,680 |
| 11 | `home_w1440.png` | 1440 | 900 | 1 | 0,0,1440,900 | 0,0,1440,52 | 24,64,390,812 |
| 12 | `ligne14_w1440.png` | 1440 | 900 | 1 | 0,0,1440,900 | 0,0,1440,52 | 24,64,390,812 |
| 13 | `home_w1920.png` | 1920 | 1080 | 1 | 0,0,1920,1080 | 0,0,1920,52 | 24,64,390,992 |
| 14 | `ligne14_w1920.png` | 1920 | 1080 | 1 | 0,0,1920,1080 | 0,0,1920,52 | 24,64,390,992 |

Deux conséquences immédiates, tirées de ces seuls rectangles :

- `#map` occupe **exactement la totalité du viewport à toutes les largeurs** (`0,0,W,H`). La carte est un fond plein cadre ; le tiroir est un **calque** posé dessus, jamais une colonne de mise en page. Le viewport de la carte n'est donc jamais réduit par le chrome. *(Corrige la v1 §6, « panneau latéral … ≈2/3 de la largeur en carte vide à droite du panneau » : il n'y a pas de colonne, il y a recouvrement.)*
- Le tiroir change de nature à 1024 : `x = 24, w = 390, z = 10` en desktop ; `x ≈ 10, w = W − 20, ancré bas, z = 150` en dessous de 768.

**Table B — état interne du tiroir, attribution et pastilles, par capture.** `.lines-grid` en `y,hauteur` ; l'attribution est le `.maplibregl-ctrl-attrib` ; `elementFromPoint` est l'élément réellement touché au **centre** du rectangle d'attribution.

| capture | `.lines-grid` (y,h,overflow) | `.dock-content` | `#dock-reset` (w) | `.dock-collapse` (w) | pastilles à l'écran | `elementFromPoint` au centre attrib. | lignes d'attrib. |
|---|---|---|---|---|---|---|---|
| `home_w320` | 377,310,visible | clientH **16** / scrollH 292 / scrollTop 0 | 0 | 48 | **15/21** | `line-badges` | 3 |
| `ligne14_w320` | 377,310,visible | clientH **16** / scrollH 872 / scrollTop 0 | 108 | 48 | **15/21** | `line-badges` | 3 |
| `home_w390` | 520,260,visible | clientH **53** / scrollH 273 / scrollTop 0 | 0 | 48 | 21/21 | `dock-empty-kicker` | 2 |
| `ligne14_w390` | 520,260,visible | clientH **53** / scrollH 887 / scrollTop 0 | 108 | 48 | 21/21 | `ladder-node-details` | 2 |
| `home_w430` | 566,210,visible | clientH **146** / scrollH 273 / scrollTop 0 | 0 | 48 | 21/21 | `dock-network-traffic dock-network-traffic--normal` | 2 |
| `ligne14_w430` | 566,210,visible | clientH **146** / scrollH 927 / scrollTop 0 | 108 | 48 | 21/21 | `ladder-node-name` | 2 |
| `home_w768` | 615,144,visible | clientH **254** / scrollH 254 / scrollTop 0 | 0 | 48 | 21/21 | `dock-empty-state` | 1 |
| `ligne14_w768` | 614,144,visible | clientH **255** / scrollH 979 / scrollTop 0 | 108 | 48 | 21/21 | `ladder-station-node` | 1 |
| `home_w1024` | 112,178,visible | clientH **454** / scrollH 454 / scrollTop 0 | 0 | 0 | 21/21 | — (aucun élément du tiroir) | 1 |
| `ligne14_w1024` | 133,178,visible | clientH **433** / scrollH 990 / scrollTop 0 | 108 | 0 | 21/21 | — | 1 |
| `home_w1440` | 112,178,visible | clientH **586** / scrollH 586 / scrollTop 0 | 0 | 0 | 21/21 | — | 1 |
| `ligne14_w1440` | 133,178,visible | clientH **565** / scrollH 949 / scrollTop 0 | 108 | 0 | 21/21 | — | 1 |
| `home_w1920` | 112,178,visible | clientH **766** / scrollH 766 / scrollTop 0 | 0 | 0 | 21/21 | — | 1 |
| `ligne14_w1920` | 133,178,visible | clientH **745** / scrollH 921 / scrollTop 0 | 108 | 0 | 21/21 | — | 1 |

*Précision de méthode :* `attribLines` est la hauteur du rectangle d'attribution divisée par son `line-height` calculé (donc « hauteur ÷ interligne ≈ n lignes »). Le booléen `attribCovered` de `metrics.json` compare la **bande verticale** de l'attribution à celle du tiroir ; c'est le test `elementFromPoint` qui établit la superposition réelle et c'est lui qui est cité ci-dessus.

**Table C — échelle des stations (état `ligne14`), valeurs mesurées sur `.ladder-node-name` et `.ladder-node-bullet`.** Les 21 stations sont rendues aux sept largeurs ; le nombre de noms tronqués indique l'ellipse (`scrollWidth > clientWidth`).

| capture | noms | tronqués | largeur de nom | x du nom | x de la puce | 1re station (y) | dernière (y) |
|---|---|---|---|---|---|---|---|
| `ligne14_w320` | 21 | **18** | 70 | 55 | 25 | 707 | 1520 |
| `ligne14_w390` | 21 | **6** | 140 | 55 | 25 | 801 | 1628 |
| `ligne14_w430` | 21 | **2** | 180 | 55 | 25 | 804 | 1664 |
| `ligne14_w768` | 21 | **0** | 518 | 55 | 25 | 786 | 1699 |
| `ligne14_w1024` | 21 | **3** | 152 | 72 | 43 | 342 | 1257 |
| `ligne14_w1440` | 21 | **3** | 152 | 72 | 43 | 342 | 1224 |
| `ligne14_w1920` | 21 | **3** | 152 | 72 | 43 | 342 | 1196 |

Noms tronqués par largeur :

- **320 (18/21)** : Aéroport d'Orly, Thiais - Orly (Pont de Rungis), Chevilly-Larue (Marché International), L'Haÿ-les-Roses, Villejuif - Gustave Roussy, Hôpital Bicêtre, Maison Blanche, Bibliothèque François Mitterrand, Cour Saint-Emilion, Gare de Lyon, Châtelet, Pyramides, Madeleine, Saint-Lazare, Pont Cardinet, Porte de Clichy, Mairie de Saint-Ouen, Saint-Denis - Pleyel.
- **390 (6/21)** : Thiais - Orly (Pont de Rungis), Chevilly-Larue (Marché International), Villejuif - Gustave Roussy, Bibliothèque François Mitterrand, Saint-Lazare, Mairie de Saint-Ouen.
- **430 (2/21)** : Chevilly-Larue (Marché International), Bibliothèque François Mitterrand.
- **768 (0/21)** : aucun.
- **1024 / 1440 / 1920 (3/21)** : Thiais - Orly (Pont de Rungis), Chevilly-Larue (Marché International), Bibliothèque François Mitterrand.

**Note de méthode — écart v1 → v2.** La v1 était à **DPR 2** sur une surface clippée à **573,5 × 357,5 px CSS (1147 × 715 device)** ; la v2 est à **DPR 1** sur une surface égale au viewport. C'est la seule différence de protocole, et elle suffit à changer la lecture : 573 px était la fenêtre du navigateur MCP, pas le site.

Périmètre : panneaux, bandeau, boutons, sélecteurs, hover card, bottom sheet,
typographie, couleurs, états, transitions, parcours. Hors périmètre (non
évalué) : moteur de simulation, pipeline de données, géométrie/tracé des
lignes, `shapes.bin`, `schedule.json`, seuils de LOD, caméra, rendu 3D du bâti
et des rames, gainage/décalage des tracés, performance mobile (déjà couverte
par [MOBILE_AUDIT.md](MOBILE_AUDIT.md)).

**Aucun fichier produit n'a été modifié pour produire cet audit.** Trois
éléments ont été ajoutés à la racine du dépôt : ce fichier, le dossier
`audit/design/` (**14 captures** faisant autorité, `home_w<largeur>.png` et
`ligne14_w<largeur>.png`, à `devicePixelRatio` 1, plus `metrics.json`) et son
sous-dossier `audit/design/harness-artifact/` (**15 captures** du harnais v1,
conservées comme preuve de l'artefact de 573 px décrit en `C1.3` et **non
utilisées** par les sections réécrites).

⚠️ Note de méthode importante : `git status` à la fin de cette tâche montre un
grand nombre de fichiers déjà modifiés (`M`) et non suivis (`??`) — par
exemple `web/src/map/train_models_layer.ts`, `data/processed/*.json`,
`docs/*.md`, plusieurs `diagnostic-*.png` à la racine de `web/public/`. Ces
changements existaient **avant le début de cette tâche** (travail en cours
d'une session précédente sur le rendu des rames / pipeline de données, hors
périmètre absolu de cet audit) — je ne les ai pas produits et je ne les ai pas
touchés. Je ne les ai pas non plus annulés : le faire aurait détruit un
travail en cours qui n'est pas le mien. Si un `git status` propre est requis
avant de committer ce livrable, il faudra d'abord traiter ou committer
séparément ce travail préexistant.

Convention de preuve : chaque constat est numéroté `C<section>.<n>` et cite un
`fichier:ligne`, une capture `audit/design/<nom>.png`, ou une valeur mesurée
en direct sur https://parisian3dsubway.netlify.app (Playwright/DevTools,
10/09/2026). Tout ce qui n'a pas pu être mesuré est marqué **NON MESURÉ**
avec la raison.

---

## C3. RÉÉCRITURE DES SECTIONS 5 ET 6, à partir des rectangles et des pixels

### C3.1 §5 réécrite — « Cibles et densité » ne peut plus parler de « surface visible » sans rectangle

La v1 annonçait « surface visible ≈ 65 % » à 1280×800 et « ≈ 12 % » à 390×844. Ces deux chiffres venaient d'arithmétique sur des valeurs de feuille de style, sur une surface de rendu fausse. Voici la mesure.

**Méthode.** Pour chaque largeur, la surface *non recouverte par le chrome* se calcule sur les rectangles de la table A : `W×H − (bandeau) − (tiroir)`, le bandeau et le tiroir ne s'intersectant jamais (tiroir `y ≥ 64` en desktop, `y ≥ 286` en mobile ; bandeau `y ≤ 52`).

| capture | aire du viewport | bandeau | tiroir | recouvert | **carte non recouverte** |
|---|---|---|---|---|---|
| 320×568 | 181 760 px² | 320×48 = 15 360 | 301×273 = 82 173 | **53,7 %** | **46,3 %** |
| 390×844 | 329 160 px² | 390×48 = 18 720 | 371×405 = 150 255 | **51,3 %** | **48,7 %** |
| 430×932 | 400 760 px² | 430×48 = 20 640 | 411×447 = 183 717 | **51,0 %** | **49,0 %** |
| 768×1024 | 786 432 px² | 768×52 = 39 936 | 749×491 = 367 759 | **51,8 %** | **48,2 %** |
| 1024×768 | 786 432 px² | 1024×52 = 53 248 | 390×680 = 265 200 | **40,5 %** | **59,5 %** |
| 1440×900 | 1 296 000 px² | 1440×52 = 74 880 | 390×812 = 316 680 | **30,2 %** | **69,8 %** |
| 1920×1080 | 2 073 600 px² | 1920×52 = 99 840 | 390×992 = 386 880 | **23,5 %** | **76,5 %** |

Trois qualificatifs sont obligatoires :

1. **« Non recouverte » n'est pas « perdue ».** À 1024/1440/1920 le tiroir `x = 24, w = 390, z = 10` **recouvre** un fond de carte plein cadre : la surface masquée est de la carte *peinte mais cachée*, pas de la mise en page retirée (`#map = 0,0,W,H` partout, table A).
2. **La surface libre croît en valeur absolue** : bande utile (bandeau → tiroir) de 320×238 px à 1024×716, puis 610×716 → 1026×848 → **1506×1028 px** en desktop (la bande perd la largeur du tiroir, 414 px, et rien d'autre). Les grands écrans ajoutent donc de la carte, mais proportionnellement moins.
3. **Le tiroir ne cache pas le réseau dessiné, aux grandes largeurs.** Mesuré : à 1024 le corridor de la ligne 14 est peint autour de **x ≈ 640-780**, donc entièrement à droite du tiroir (qui se termine à `x = 414`) ; à 1920, la boîte englobante de l'encre du réseau est **x ∈ [1022, 1280]**, également à droite du tiroir.

**Deuxième mesure, indépendante : l'encre réellement peinte.** Pixels satisfaisant `max−min > 45` et `max > 70`, échantillonnage 2 px, sur la bande non recouverte. Elle ne mesure pas la même chose que la surface : la caméra recadre le réseau (`fitMetroNetwork`) et, ligne sélectionnée, seule la ligne l'est — un faible pourcentage n'est donc pas un défaut en soi.

| état | 320 | 390 | 430 | 768 | 1024 | 1440 | 1920 |
|---|---|---|---|---|---|---|---|
| `home` — réseau complet | 15,5 % | 11,1 % | 10,5 % | 7,1 % | 7,8 % | 5,5 % | 4,2 % |
| `ligne14` — ligne sélectionnée | 1,0 % | 0,5 % | 0,8 % | 0,3 % | 0,4 % | 0,3 % | 0,2 % |

**Ce que la v1 dit et qui est faux :**

- ~~« 1280×800, dock ouvert … surface visible ≈ 65 % »~~ → la valeur mesurée la plus proche est **59,5 % à 1024×768** et **69,8 % à 1440×900** ; 65 % n'existe nulle part dans les mesures.
- ~~« 390×844, ligne sélectionnée (`.dock.has-selection` ≈ 692px) : surface visible ≈ 12 % »~~ → à 390×844 le tiroir mesure **371×405** (48,7 % de carte non recouverte, pas 12 %), et **`.dock.has-selection` n'est jamais appliqué** par le code (voir C4.d) : la règle `max-height:min(82vh, 82dvh)` de `main.css:1084-1087` est **morte**, le « 692 px » ne se produit jamais.
- ~~« carte réduite à ~12 % »~~ → **mesure mesurée : 46,3 % de carte non recouverte à 320×568** (le pire cas), et 48,2 % à 768×1024.
- Ce qui est **conservé** de la v1 §5 : l'inventaire des cibles tactiles. Il repose sur des valeurs de feuille de style et reste donc marqué **DÉDUIT DU CSS, NON VÉRIFIÉ** : `.line-badge` `30×30` (`web/src/ui/chrome.css:522-526`), `#dock-reset` `min-height:38px` mesuré **38 px** de haut et **108 px** de large en état « ligne sélectionnée » (table B), `#dock-collapse` `48×48` mesuré **48 px** de large à ≤430 et **0 px** à ≥1024 (hors flux), `.ladder-node-bullet` mesuré à `x = 25` (mobile) et `x = 43` (desktop) — l'écart puce→nom est donc de **30 px** et **29 px** respectivement (table C).

### C3.2 §6 réécrite — la matrice de mise en page, mesurée, et le contenu réellement visible

**Ce qui change réellement, et où.** Les transitions ci-dessous sont **observées sur des rectangles**, pas déduites :

| frontière | avant | après | preuve |
|---|---|---|---|
| hauteur du bandeau | 48 px à 320/390/430 | 52 px à 768/1024/1440/1920 | `.topbar` h = 48,48,48,52,52,52,52 (table A) |
| nature du tiroir | feuille basse collée au fond (`x=10`, `w=W−20`, `bottom` = `H−10`) à 320/390/430/768 | colonne de gauche fixe (`x=24`, `w=390`, `y=64`) à 1024/1440/1920 | table A |
| `z-index` du tiroir | **150** à 320/390/430/768 | **10** à 1024/1440/1920 | `dockCS` relevé : `zIndex 150 → 10` |
| `max-height` du tiroir | `272,64px / 405,12px / 447,36px / 491,52px` (= 48vh) | `none` | `dockCS.maxHeight` |
| bouton de repli `#dock-collapse` | largeur **48 px** | largeur **0 px** (hors flux) | table B |
| tiroir couvrant l'attribution | **oui** (hit test dans le tiroir) | **non** (`elementFromPoint` → aucun élément du tiroir) | table B |

**La même carte à toutes les largeurs :** `#map` = `0,0,W,H` dans les 14 relevés. Le chrome est un **calque** ; il n'existe aucune largeur où la carte cède une colonne au tiroir. *(La phrase de la v1 « Aucun de ces breakpoints ne correspond à 320, 390, 430, 1024, 1440 ou 1920 » reste vraie : les media queries du code sont `767px` (`web/src/ui/chrome.css:580`), `768px` (`web/src/styles/main.css:1050`), `359px` (`chrome.css:615-617`) et `768px` (`web/src/main.ts:184`, `web/src/map/labels_layer.ts:57`) — **DÉDUIT DU CSS, NON VÉRIFIÉ** quant à leurs seuils, mais leur effet est mesuré ci-dessus.)*

**Ce qu'on voit réellement, largeur par largeur** (relevé sur les 14 captures) :

| largeur | contenu visible dans le tiroir | contenu visible sur la carte |
|---|---|---|
| 320 `home` | rangées de pastilles 1 à 13 (3 rangées) ; l'état vide **absent** | réseau complet, paysage (aucun nom de station) |
| 320 `ligne14` | en-tête + 1 ligne (`.dock-content` = 16 px utiles sur 872) ; « Aéroport d'Orly » affleure | corridor de la ligne 14, étroit (48×186 px d'encre) |
| 390 `home` | pastilles 1→14, A→E ; « Service en cours » coupé | réseau complet ; trois noms superposés au centre |
| 390 `ligne14` | en-tête + « Aéroport d'Orly » (53 px utiles sur 887) | corridor 84×330 px |
| 430 `home` | grille complète + « Service en cours » + description (sous le texte d'attribution) | réseau complet |
| 768 `home` | grille sur 2 rangées + « Lignes modélisées 16 Métro · 5 RER », « Stations connectées 468 », « Consulter la méthode & données → » | réseau complet |
| 768 `ligne14` | grille (144 px) + 255 px d'échelle, soit ~11 stations | corridor, cadre 768 px |
| 1024/1440/1920 `home` | grille + état vide complet, jamais tronqué | réseau complet ; la carte occupe tout le reste |
| 1024/1440/1920 `ligne14` | en-tête + 433/565/745 px d'échelle sur 990/949/921 px de contenu → **tronquée dans les trois cas** (3, 3 et 3 noms ellipsés) | corridor mince : 150×566 / 210×782 / 258×966 px d'encre dans une bande de 610×716 / 1026×848 / 1506×1028 |

**Ce que la v1 §6 dit et qui est faux** — la v1 concluait « Bottom sheet » à 320/390/430/768 et « Panneau latéral fixe 390px » / « Desktop plein » à 1024/1440/1920. La v1 avait **raison sur les mots et tort sur la mesure** : elle les avait lus dans les media queries, sans jamais les voir. Les rectangles les confirment (tiroir bas `x=10, w=W−20, z=150` à ≤768 ; colonne `x=24, w=390, z=10` à ≥1024 ; `#map` plein cadre partout), mais la v1 en tirait des chiffres faux (65 %, 12 %, « 2/3 de la largeur en carte vide à droite du panneau ») et **n'avait jamais vu** les quatre faits suivants, qui sont l'essentiel de §6 :

1. la grille de pastilles **n'est pas un `grid`** mais un **flex-wrap** (mesuré : `gridTemplateColumns` = `none`, `overflow: visible` ; `chrome.css:516-520`) → son repli dépend des largeurs réelles et **elle déborde du tiroir** (310 px de grille dans un tiroir de 272,64 px à 320) ;
2. le tiroir **recouvre l'attribution légale** à 320/390/430/768 et **pas** au-delà (table B) ;
3. `.dock-content` **s'effondre à 16/53/146 px** à 320/390/430 (clientHeight mesuré contre 272/260/210 px de grille), parce que c'est **lui** qui absorbe la compression flex, pas la grille ;
4. **aucune règle ne replie la grille** quand une ligne est sélectionnée : ni `has-selection`, ni `collapsed` (voir C4.d).

---

## C4. LES SIX DÉFAUTS, UN PAR UN

Pour chacun : la capture qui le montre, le `fichier:ligne` de la cause, le coût de correction. Les chemins sont relatifs au dépôt.

### C4.a — Le texte d'attribution ODbL est peint sous le tiroir et n'est pas atteignable

**Captures qui le montrent :** `home_w320.png`, `home_w390.png`, `home_w430.png`, `home_w768.png`. Le texte légal est peint **à travers** les rangées de pastilles (320), `dock-empty-kicker` (390), le bandeau de trafic (430) et le bloc « Service en cours / Lignes modélisées… » (768). Sur les trois captures desktop le texte est au contraire dégagé et lisible.

**Rectification du constat du brief (« six captures sur sept ») :** mesuré, la superposition est **vraie à 4 largeurs sur 7 — et ce sont exactement toutes celles ≤ 768 px**. Preuve directe, test de collision `elementFromPoint` au **centre** du rectangle d'attribution : `line-badges` (320), `dock-empty-kicker` (390), `dock-network-traffic dock-network-traffic--normal` (430), `dock-empty-state` (768) ; et rien du tiroir à 1024/1440/1920 (table B).
*Nuance mesurée à 1024 :* le rectangle d'attribution commence à `x = 380` alors que le tiroir finit à `x = 414` → **34 px de recouvrement horizontal** sur le coin bas-droit du tiroir ; visible sur `ligne14_w1024.png` où le « © » vient buter contre le bord du panneau. À 1440 (`x = 796`) et 1920 (`x = 1276`) il n'y a aucun recouvrement.

**Le texte est bien le texte complet, pas une icône.** `attribText` relevé en direct : `© OpenMapTiles · © OpenStreetMap · IDFM ODbL | OpenFreeMap © OpenMapTiles Data from OpenStreetMap`, **5 liens** (`openmaptiles.org`, `openstreetmap.org/copyright`, `openfreemap.org`, `openmaptiles.org`, `openstreetmap.org/copyright`), réparti sur **3 lignes à 320, 2 lignes à 390 et 430, 1 ligne à partir de 768** (table B). `pointer-events` calculé = **`auto`** à toutes les largeurs. L'icône « (i) » n'est pas l'attribution : c'est le bouton de repli du contrôle (`compact: true`). **La v1 §6 affirmait « Attribution MapLibre repliée en icône (i) » : c'est faux**, l'attribution est déployée.

**Cause (`fichier:ligne`) :** le contrôle est créé dans **`web/src/map/maplibre.ts:37-42`** :
`new maplibregl.AttributionControl({ compact: true, customAttribution: '© OpenMapTiles · © OpenStreetMap · IDFM ODbL' })`, position `bottom-right`, donc **enfant de `#map`** — `#map` a `z-index: 1` (mesuré `mapZ = "1"`) et le contrôle a `z-index: auto` (mesuré). Le tiroir mobile est `z-index: 150` (mesuré ; `web/src/styles/main.css:1073` dans le bloc `@media (max-width: 768px)`) avec `overflow: hidden` (`main.css:1079`), ancré `bottom: 0.6rem` — il **couvre physiquement** la bande bas-droite où le contrôle est posé, et intercepte le pointeur au centre du texte. Le droit de clic des liens est donc neutralisé par l'empilement, pas par `pointer-events`.

**Coût de correction :** faible. Trois options, par ordre de sûreté : (1) déplacer le contrôle (`position: 'top-left'` ou `'top-right'`) → **1 ligne**, mais il collisionne alors avec le bandeau de trafic/la recherche ; (2) contraindre le tiroir mobile à s'arrêter au-dessus de la bande d'attribution (`bottom: 3.2rem` au lieu de `0.6rem`) → **1 déclaration**, mais coûte de la hauteur utile déjà rare (voir C4.b/c) ; (3) déplacer l'obligation dans l'UI existante : l'application a déjà un lien « Consulter la méthode & données → » dans l'état vide — y porter l'attribution → **1 fichier HTML + 1 ligne de config**, mais il faut alors garantir qu'elle reste visible **sans** ouvrir le tiroir (obligation ODbL). Estimation : **< 1 h**, dont la vérification du taux de contraste du texte d'attribution sur la carte.

### C4.b — À 320 px, les pastilles 14 puis A/B/C/D/E sont hors de portée

**Capture qui le montre :** `home_w320.png` — la liste s'arrête après « 13 », aucune pastille RER n'est peinte.

**Mesures :** les 21 pastilles sont rendues à toutes les largeurs (21/21 dans six relevés) **sauf à 320**, où le test viewport en compte **15**. Les rangées mesurées sont aux `y` **406, 456, 506, 556, 638** ; une pastille mesure **30 px** de haut ; le bord bas du tiroir est à **`y = 558`** :
- rangées 1 à 3 (`y` 406/456/506, bas 436/486/536) → **entièrement dans le tiroir** = 15 pastilles ;
- rangée 4 (`y = 556`, bas 586) → **2 px sur 30** au-dessus du bord, les 28 autres peints sous le `overflow: hidden` : la pastille **« 14 »** est de fait invisible, comme A, B, C, D ;
- rangée 5 (`y = 638`) → **80 px sous le bord bas du tiroir** : « E » est hors du tiroir.

**Rectification du constat du brief (« grille en 4 colonnes … coupé après A/B/C/D ») :** mesuré, le retour à la ligne se fait à **5 pastilles par rangée** à 320 (la grille fait 299 px de large, les pastilles 30 px) et **A, B, C, D ne sont pas visibles** — le premier élément inaccessible est la pastille **« 14 »**. Le RER E est bien inatteignable, mais l'inaccessibilité commence un cran plus tôt qu'annoncé.
*Précision honnête :* la pastille « 14 » **reste activable par programme** — le harnais l'a sélectionnée par un `.click()` DOM exécuté dans la page (`/tmp/audit_shot.cjs:86-90`), ce qui est précisément la preuve qu'un **pointeur réel** ne peut pas l'atteindre (cliquable au clavier/programme, hors de la zone peinte).

**Cause (`fichier:ligne`) :**
- `web/src/styles/main.css:1073` — `.dock` mobile `max-height: 48vh`, mesuré **272,64 px** à 320×568, et `main.css:1079` `overflow: hidden` ;
- `web/src/styles/main.css:289-293` — `.lines-grid` : `display: block`, `padding: 0.75rem 1rem 0.25rem`, **hauteur mesurée 310 px** avec `overflow: visible` : elle ne peut pas se réduire ;
- `web/src/ui/chrome.css:516-520` — `.line-badges` : `display: flex; flex-wrap: wrap;` (**ce n'est pas un `grid`** ; `gridTemplateColumns` relevé = `none`) ;
- `web/src/ui/chrome.css:526` — `.line-badge { flex: 0 0 auto; width/height: var(--badge-size) }` : aucune pastille ne peut rétrécir ;
- conséquence mesurée sur le frère : `.dock-content` est comprimé à **16 px** (`clientHeight 16` contre `scrollHeight 292`) parce que c'est lui, `flex: 1`, qui absorbe la contrainte.

**Coût de correction :** faire de la grille la zone défilante (`.lines-grid { overflow-y: auto }` ou `max-height` + scroll) — **1 déclaration** ; ou déplacer `.lines-grid` **dans** `.dock-content` (déjà `overflow-y: auto`) — **1 ligne HTML** (`web/index.html:92-107`), mais il faut alors que l'en-tête ne défile pas ; ou réduire `--badge-size`/les gaps sous 360 px — **1 media query**. La vraie dépense n'est pas le code mais **la décision de design** : que cède la place, la grille ou le texte d'état vide ? **1-2 h** avec validation visuelle aux 7 largeurs.

### C4.c — « Service en cours » : mesuré, le vrai point de rupture n'est pas celui annoncé

**Mesures (rectangles relevés) :** kicker `.dock-empty-kicker` puis description `.dock-empty-desc`, comparés au bord bas du tiroir et au conteneur défilant.

| largeur | kicker | description | `.dock-content` bas | bord bas du tiroir | ce qui se passe réellement |
|---|---|---|---|---|---|
| **320** | 711→730 | 735→792 | **703** | 558 | **rien n'est visible** : kicker et description sont sous `.dock-content` (703) *et* sous le tiroir (558) |
| **390** | 804→823 | 828→866 | 833 | **834** | le kicker tient (823 < 834), **la description est coupée** par le bord bas du tiroir (866 > 834) |
| **430** | 800→819 | 824→862 | 921 | 922 | les deux tiennent, mais l'attribution est peinte par-dessus (rectangle 878→922) : **superposition, pas troncature** |
| **768** | 783→802 | 806→844 | 1013 | 1014 | idem : les deux tiennent, l'attribution passe au-dessus de la bande basse (990→1014) |
| 1024 | 317→337 | 341→379 | 743 | 744 | rien à signaler |

**Rectification du constat du brief (« w430, w768 ») :** à 430 et 768 la description **n'est pas coupée mais recouverte** par le texte d'attribution (défaut a) ; la **troncature vraie est à 390** ; et à **320 le bloc est purement et simplement absent** (défaut b : `.dock-content` réduit à 16 px). `home_w320.png`, `home_w390.png`, `home_w430.png`, `home_w768.png` le montrent : à 320 pas d'état vide du tout, à 390 « Service en cours » est la dernière ligne lisible, à 430 et 768 le bloc complet est présent mais le texte légal le traverse.

**Cause (`fichier:ligne`) :** `web/src/styles/main.css:1073` (`max-height: 48vh` sur `.dock`) ; `main.css:339-343` (`.dock-content { flex: 1; overflow-y: auto }`, la hauteur utile devient 16/53/146 px) ; `main.css:345-360` (`.dock-empty-state`, `.dock-empty-kicker`, marges du bloc) ; l'état vide est monté par `web/src/ui/dock.ts:365` et `:424-440` (kicker `:425`, description `:426`) — il est **dans** le conteneur défilant, donc son sort dépend entièrement de la hauteur que la grille lui laisse.

**Coût de correction :** le même que C4.b (la cause est commune, à 90 %). Une correction supplémentaire utile : ancrer le bloc d'état vide en bas du tiroir ou le sortir du flux défilant, pour qu'il soit lisible même quand la grille consomme la hauteur. **30 min** une fois C4.b tranché.

### C4.d — Ligne 14 sélectionnée : quelle pièce décide de ne pas replier la grille

**La réponse est `web/src/ui/dock.ts`.** Trois faits concordants, mesurables dans le fichier et dans les captures :

1. **`dock.ts:222-232`** — `selectLine()` ne modifie que l'`display` du bouton de réinitialisation. Il **n'ajoute jamais** `has-selection` (ni sur `.dock`, ni ailleurs).
2. **`dock.ts:84-89`** — le bouton de repli applique la classe **`dock--collapsed`**. Or **aucune règle CSS de ce nom n'existe dans le dépôt** : `web/src/styles/main.css` définit `.dock.collapsed` (`:1092-1095`) et `.dock.collapsed .lines-grid, .dock.collapsed .dock-content { display: none }` (`:1097-1100`), **jamais `dock--collapsed`**. Le seul contrôle de repli du tiroir est donc **inerte**.
3. Réciproquement, **`.dock.has-selection`** (`main.css:1084-1087`, `max-height: min(82vh, 82dvh)`) **n'est jamais activée** : c'est du CSS mort. Et `.lines-grid` ne porte **aucun style inline** (`web/index.html:92-107`) et n'est repliée nulle part.

Conséquence : **rien ne replie la grille à la sélection**, et la grille conserve ses 260-310 px dans un tiroir de 272-405 px.

**Ce que ça donne, mesuré :**

| capture | `.dock-content` utile | contenu réel | ce qui affleure |
|---|---|---|---|
| `ligne14_w320` | **16 px** | 872 px | 1 ligne |
| `ligne14_w390` | **53 px** | 887 px | l'en-tête + « Aéroport d'Orly » au bord bas du tiroir |
| `ligne14_w430` | **146 px** | 927 px | ~3 stations |
| `ligne14_w768` | **255 px** | 979 px | ~11 stations (grille 144 px dans un tiroir de 491 px) |
| `ligne14_w1024` | **433 px** | 990 px | ~22 lignes d'échelle |
| `ligne14_w1440` | **565 px** | 949 px | idem |
| `ligne14_w1920` | **745 px** | 921 px | l'échelle entière (1re station `y = 342`, dernière `y = 1196` < 1055) |

Le défaut est donc **fortement dépendant de la largeur** : « l'échelle repoussée hors du tiroir sous une grille dépliée » est un défaut **mobile et tablette** (320/390/430, et partiellement 768), pas desktop. Sur `ligne14_w390.png` la grille occupe tout, et la seule station visible est bien « Aéroport d'Orly » plaquée au bord bas.

**Coût de correction :** **2 lignes dans `dock.ts`** (émettre la classe réellement stylée, ou appliquer `has-selection` dans `selectLine()`), plus la décision de comportement : replier la grille à la sélection fait**disparaître le sélecteur de ligne principal** ; à l'inverse, replier l'échelle au profit de la grille inverse le sens de lecture de l'écran `ligne14`. **~1 h**, dont l'essentiel en validation.

### C4.e — « Tout afficher » et le titre du tiroir

**Mesures (rectangles) :**

| largeur / état | `.dock-title` | `#dock-reset` (« Tout afficher ») | coexistence |
|---|---|---|---|
| 320 `home` | `25,334,103,17` | **0 px** (masqué) | non |
| 320 `ligne14` | `25,334,103,17` | `131,323,108,38` | oui, sur une ligne |
| 390 `home` | `25,477,103,17` | **0 px** (masqué) | non |
| 390 `ligne14` | `25,477,103,17` | `201,467,108,38` | oui, sur une ligne |
| 430 `home` | 25,523,103,17 | **0 px** | non |
| 1024/1440/1920 `ligne14` | 45,79,**109**,17 | 285,79,108,38 | oui, très à l'aise |

**Fait mesuré : la largeur du titre ne change jamais** (103 px à 320/390/430, 109 px à ≥1024) et le bouton est **absent du flux tant qu'aucune ligne n'est sélectionnée**. Sur `ligne14_w320.png` et `ligne14_w390.png`, l'en-tête tient donc « Lignes du réseau » + « Tout afficher » + le chevron **sur une seule ligne** ; la rangée est simplement saturée : `25 + 103 + 108 + 48 + marges ≈ 300` px pour une largeur de tiroir de **301 px** à 320.

**Rectification :** je ne reproduis **pas** un titre cassé en deux lignes à 320/390 dans les captures v2 — le titre mesure 17 px de haut aux sept largeurs. Toute affirmation sur un retour à la ligne du titre conditionné au texte serait **DÉDUIT DU CSS, NON VÉRIFIÉ** ; les deux seuls faits mesurés sont l'absence du bouton hors sélection et la saturation à 1 % de la rangée en 320 sélectionné.

**Cause (`fichier:ligne`) :** `web/src/styles/main.css:200-208` (`.dock-header`, disposition en ligne) et `main.css:234-263` (`.dock-reset-btn { min-height: 38px; padding: 0 16px }`, largeur mesurée 108 px) ; l'`display` du bouton est piloté à `web/src/ui/dock.ts:222-232` ; le DOM de l'en-tête est à `web/index.html:92-107`.

**Coût de correction :** cosmétique et faible (**~30 min**) : libellé plus court, bouton icône, ou `flex-wrap` ordonné. Mais corriger (e) sans corriger (b)/(c) ne rendrait lisible ni la grille ni l'état vide — c'est le même budget de hauteur qui est en jeu.

### C4.f — Libellés de stations : superposés et détachés de leurs points (signalétique uniquement)

**Captures qui le montrent :** `ligne14_w1024.png` — « **Porte de Clichy** » est peint **par-dessus « Saint-Lazare »** (les deux chaînes se chevauchent vers `y ≈ 258-272`, ce que la capture montre comme `SaintLazare` + `Porte de Clichy` superposés) ; « **Madeleine** » est traversé par le point blanc d'une rame (x ≈ 740-791) ; « Madeleine » et « Châtelet » se chevauchent vers `y ≈ 328`. `ligne14_w1440.png` — « **Mairie de Saint-Ouen** » + « Saint-Ouen » superposés vers `y ≈ 143` ; faisceau « Chevilly-Larue (Marché International) » / « Villejuif - Gustave Roussy » / « Aéroport d'Orly » superposé vers `y ≈ 770`. `home_w768.png` — trois noms superposés au centre.
**Rectification :** la fusion exacte « **PortedeClichyare** » relevée en v1 à 1440 **n'est pas reproduite à l'identique** en v2, mais **le même défaut est reproduit et visible à 1024** (superposition « Porte de Clichy » × « Saint-Lazare »). À 1440, « Porte de Clichy » **n'est pas peint du tout** (nom absent de la carte) : le constat à citer est donc « superpositions reproductibles à 1024 et 1440 », pas la chaîne fusionnée telle quelle.

**Mesures du détachement :** tous les noms sont peints **à droite de leur point d'environ 12 px**, avec un décalage vertical pouvant atteindre **32 px** ; « Bercy » est nettement à droite de sa station, « Olympiades » et « Madeleine » à gauche de la leur ; en haut du corridor, le libellé du terminus nord est réduit à « **Saint-Ouen** », la partie « Mairie de » étant **coupée au bord gauche** du libellé. C'est de la signalétique : **aucun tracé n'est concerné, aucun tracé ne doit être touché** (géométrie hors périmètre).

**Cause (`fichier:ligne`) — `web/src/map/labels_layer.ts` :**
- `labels_layer.ts:17-20` et `:108` — la couche est un **`TextLayer` deck.gl** dont le tri de collision est **écrit à la main**, deck.gl v9 n'exposant pas de filtre de collision ; `:77-105` contient la passe gloutonne AABB ;
- `labels_layer.ts:83` — la largeur réservée est **modélisée** : `Math.max(28, name.length * 8.2) + 22`, et `:88` la hauteur est **fixée à 22 px** (`y − 11 → y + 11`) : c'est une estimation, jamais une mesure du texte rendu ;
- `labels_layer.ts:63-66` — ces rectangles sont calculés dans un **repère Mercator local** (`scale = 256 · 2^zoom / 360`), alors que le texte est placé par deck.gl depuis `getPosition` + `getPixelOffset` (`:86-87`, `:71`, `:110`) : le repère de collision et le repère de dessin sont deux projections distinctes ;
- `labels_layer.ts:85-87` — **le détachement est structurel** : `getTextAnchor: 'start'` avec `offsetX = 12` (ou **`−width − 12`** pour un libellé sur deux) et `selectedLanes = [-32, -16, 0, 16, 32]` → par construction, un libellé n'est jamais centré sur son point, et un libellé sur deux est décalé **vers la gauche de sa propre largeur** ;
- `labels_layer.ts:60-62` et `:90` — le test de bord gauche est `viewportWidth / 2 + rect[0] < leftLabelBoundary`, avec `leftLabelBoundary = dockRect.width + 28` en desktop : le seuil est donc comparé à une coordonnée **mesurée depuis le centre de la carte**, ce qui place la ligne de coupe réelle à `x < 418 − viewportWidth/2`, soit **`x < −94` à 1024, `−302` à 1440, `−542` à 1920**. Les libellés ne sont donc **pas** écartés du tiroir : ils sont dessinés dessous et coupés par lui ;
- `web/src/map/capsule_layer.ts:610` — `collisionGroup: 'train-labels'` : les pastilles de rame ont leur **propre domaine de collision**, non coordonné avec la couche de libellés (le point blanc posé sur « Madeleine »).

**Hypothèse de mécanisme, explicitement NON VÉRIFIÉE À L'EXÉCUTION :** j'ai comparé la largeur **réservée** à la largeur **peinte** ; la réservation est **généreuse, pas insuffisante** (à 1024, « Aéroport d'Orly » est peint sur ≈ 93 px alors que `:83` en réserve 145 px). Les superpositions ne peuvent donc **pas** venir d'une sous-estimation de l'avance des glyphes : elles sont compatibles avec une **divergence de position** entre le repère de collision et le repère de dessin, qui croît avec la distance au centre de la carte — les quatre grappes observées (nord et sud) sont toutes loin du centre. Test de vérification : imprimer, pour une station, le rectangle du repère de collision **et** la position projetée par deck.gl dans le même repère. **À faire avant toute correction** de la passe de collision.

**Coût de correction :** **1 fichier** (`web/src/map/labels_layer.ts`) : politique d'ancrage/décalage/voies (`:85-87`) et test de bord (`:60-62`, `:90`) corrigeables et mesurables immédiatement (**2-3 h** avec vérification des quatre grappes) ; la passe de collision (`:83`, `:88`) demanderait une mesure réelle du texte (mesure de glyphes ou contrainte par le haut) — **4-8 h supplémentaires**, à n'engager qu'après le test ci-dessus. Aucune action sur la géométrie, les tracés ou le pipeline.

### C4.g — Corrections annexes de la v1, mesurées

- **`.topbar__name`** : la v1 citait `chrome.css:246-248` ; la règle `@media (max-width: 359px) { .topbar__name { display: none } }` est à **`web/src/ui/chrome.css:615-617`**. Vérifié visuellement : `home_w320.png` ne montre que le disque du logo, sans nom de produit.
- **« Attribution repliée en icône (i) »** : faux (voir C4.a) — l'attribution est le texte légal complet, 3 lignes à 320.
- **« grille en 4 colonnes »** à 320 : mesuré **5 pastilles par rangée** (voir C4.b).
- **« `.dock.has-selection` ≈ 692px »** : classe jamais appliquée, règle morte (voir C4.d).
- **Restent valides** (mesures ou relevés non remis en cause par la correction) : les jetons de couleur (`web/src/styles/tokens.css:2-16`), l'échec de contraste `--carmin` / `--surface` et les autres écarts AA, et l'inventaire de code mort (`web/src/ui/chrome.css:309-345` `.line-badge-btn`, `main.css:1355-1470` `.subway-search-bar`, `.rt-badge`, `.dock-badge`) — **DÉDUIT DU CSS, NON VÉRIFIÉ** pour les parties non recapturées : ces classes ne sont pas présentes dans les captures, ce qui est cohérent avec du code mort, mais aucune capture ne démontre à elle seule qu'une classe est morte.

---

## C5. RÈGLE — à appliquer à partir de maintenant

> **Tout constat de mise en page doit désormais citer une valeur relevée au runtime ou un pixel de capture. Un constat déduit d'une media query est marqué DÉDUIT DU CSS, NON VÉRIFIÉ.**

Conséquences pratiques retenues pour ce document :

1. **Toute affirmation sur une surface, une largeur, une hauteur ou une position de mise en page** est adossée à un `getBoundingClientRect()`, à un `clientHeight/scrollHeight`, à un test `elementFromPoint` ou à un pixel de capture — et le relevé brut est conservé dans `audit/design/metrics.json`.
2. **Toute affirmation sur un seuil de media query, une taille de police ou une couleur** reste utilisable mais est marquée **DÉDUIT DU CSS, NON VÉRIFIÉ**, avec `fichier:ligne`.
3. **Toute mesure de largeur de fenêtre passe par une nouvelle page au viewport cible** (jamais un redimensionnement en session) et note `innerWidth`, `innerHeight`, `devicePixelRatio` **et** les rectangles de `#map`, `.topbar`, `.dock`.
4. **Aucun constat de cet audit n'autorise une modification du produit.** Moteur, pipeline, géométrie des tracés, `shapes.bin`, `schedule.json`, LOD, caméra et rendu 3D restent hors périmètre, y compris pour les défauts signalétiques (C4.f s'arrête à la couche de libellés).

**État de production — protocole (pour rendre l'écart v1 → v2 reproductible).** L'écart entre les deux jeux de captures s'explique par trois paramètres de harnais, et par eux seuls : **DPR** (v1 = 2, v2 = 1), **surface de rendu** (v1 = surface bridgée clippée à **573,5 × 357,5 px CSS / 1147 × 715 device**, v2 = la surface du viewport), **un contexte neuf par capture** (v1 réutilisait une session, v2 ouvre un contexte par largeur et par état). Toute personne qui doit refaire la mesure doit donc reproduire exactement le protocole de `C1.1`.

**Livrables ajoutés par cette tâche :**

| chemin | nature |
|---|---|
| `DESIGN_AUDIT.md` | ce rapport (version 2) |
| `audit/design/*.png` | **14 captures** faisant autorité (DPR 1, une par largeur et par état) |
| `audit/design/metrics.json` | relevé complet des 14 captures (rectangles, hauteurs, tests de collision, polices, attribution) |
| `audit/design/harness-artifact/*.png` | **15 captures** du harnais v1, conservées comme preuve de l'artefact 573 px |

Aucun fichier de `web/`, `engine/`, `ingest/`, `packages/`, `scripts/`, `data/` ou `netlify/` n'a été modifié.

**Preuve d'absence de modification (relevée, pas affirmée).** `git status --porcelain` à la fin de cette tâche liste **86 entrées**, dont la quasi-totalité est un état de travail **préexistant**, documenté ci-dessus dans la note de méthode de la v1. Les deux seules entrées attribuables à cette tâche sont :

```
?? DESIGN_AUDIT.md
?? audit/
```

Et les horodatages le confirment : les fichiers produit modifiés portent des dates du **2026-09-10 entre 14:12 et 21:41** (`web/src/map/labels_layer.ts` 14:12, `web/src/ui/dock.ts` 14:12, `web/src/ui/chrome.css` 14:14, `web/src/styles/main.css` 15:49, `web/src/main.ts` 21:41), tandis que les seuls fichiers de cette tâche sont postérieurs (`audit/design/metrics.json` 23:46, `DESIGN_AUDIT.md` 23:57). Aucun fichier produit n'a donc été touché par l'audit, et aucun de ces changements préexistants n'a été annulé.

---

## 1. Inventaire des composants de chrome

Valeurs lues dans le code (pas dans la doc), avec alias de tokens résolus.
Palette réelle des tokens (`web/src/styles/tokens.css:2-16`) :
`--fond #0C0B0B`, `--surface #141312`, `--eleve #1C1A19`, `--bord #2A2725`,
`--inactif #4E4945`, `--secondaire #9A938C`, `--texte #F2EFE9`,
`--laiton #C9A227`, `--carmin #D9463C`.

| Composant | Fichier:ligne | Rayon | Bordure | Fond | Police (taille/graisse) | Hauteur | Padding |
|---|---|---|---|---|---|---|---|
| `.topbar` (bandeau) | [chrome.css:15-27](web/src/ui/chrome.css#L15-L27) | 0 | 1px `--bord` (bas) | `--surface` | 15px/600 (`.topbar__name`) | `52px` desktop / `48px` mobile | `0 16px` |
| `.topbar__search-trigger` | [chrome.css:179-192](web/src/ui/chrome.css#L179-L192) | 6px | 1px `--bord` | `--eleve` | 13px/400 | 34px (44px <768px, 36px <900px) | `0 10px` |
| `.topbar__menu-btn` | [chrome.css:222-232](web/src/ui/chrome.css#L222-L232) | 6px | 1px `--bord` | `--eleve` | — (icône) | 36px (44px <768px) | 0 |
| `.topbar__dropdown-menu` | [chrome.css:239-251](web/src/ui/chrome.css#L239-L251) | 8px | 1px `--bord` | `--surface` | — | auto | 6px |
| `.topbar__menu-item` | [chrome.css:255-268](web/src/ui/chrome.css#L255-L268) | 4px | 0 | transparent | 13.5px/500 | auto | `8px 10px` |
| `.cmd-palette-dialog` (palette recherche) | [chrome.css:295-311](web/src/ui/chrome.css#L295-L311) | 12px | 1px `--bord` | `--surface` | — | auto (max 75vh) | 0 |
| `.cmd-palette-item` | [chrome.css:423-431](web/src/ui/chrome.css#L423-L431) | 8px | 0 | transparent/`--eleve` (hover) | 14px/500 | auto | `10px 14px` |
| `.dock` (panneau latéral / bottom sheet) | [main.css:176-189](web/src/styles/main.css#L176-L189) | 12px (16px <768px) | 1px `--bord` | rgba(20,19,18,.94) | — | auto, `max-height:48vh` <768px | 0 |
| `.dock-header` | [main.css:213-219](web/src/styles/main.css#L213-L219) | 0 | 1px `--couture` (bas) | `--velours` | 0.85rem/600 (titre) | auto | `0.9rem 1.25rem` |
| `.dock-reset-btn` | [main.css:236-251](web/src/styles/main.css#L236-L251) | 6px | inset 1px `--couture` | `--capiton` | 13.5px/500 | `min-height:38px` | `0 16px` |
| `.dock-collapse-btn` | [main.css:268-278](web/src/styles/main.css#L268-L278) | 6px | inset 1px `--couture` | `--capiton` | 1rem | 48×48px | 0 |
| `.line-badge` (rond de ligne, dock) | [chrome.css:513-528](web/src/ui/chrome.css#L513-L528) | 50% | 0 | couleur GTFS | 14px/500 (30px de diamètre) | 30px (40px <768px) | 0 |
| `.line-badge-btn` | [main.css:309-322](web/src/styles/main.css#L309-L322) | 8px | 2px transparent | — | 0.95rem/700 | 38px | — |
| `.dock-line-close` | [main.css:400-410](web/src/styles/main.css#L400-L410) | 5px | 1px `--fonte-border` | transparent | 1.1rem | 32px | 0 |
| `.dock-line-direction` | [main.css:421-436](web/src/styles/main.css#L421-L436) | 5px | 1px `--fonte-border` | transparent | 0.68rem | `min-height:2.4em` | `0.38rem 0.45rem` |
| `.dock-records-btn` | [main.css:481-491](web/src/styles/main.css#L481-L491) | 4px | 1px `--fonte-border` | `--fonte-surface` | 0.68rem | auto | `0.4rem 0.6rem` |
| `.records-dialog` | [main.css:511-522](web/src/styles/main.css#L511-L522) | 10px | 1px `--fonte-border` | `--fonte-surface` | — | auto | `1.25rem` |
| `.records-close` | [main.css:568-578](web/src/styles/main.css#L568-L578) | 5px | 1px `--fonte-border` | transparent | 1.2rem | 36×36px | 0 |
| `.station-item` | [main.css:706-716](web/src/styles/main.css#L706-L716) | 6px | 0 | transparent/`--fonte-surface` (hover) | 0.85rem | auto | `0.6rem 0.75rem` |
| `.pill-mini` / `.transfer-pill` | [main.css:724-734](web/src/styles/main.css#L724-L734) | 4px | 0 | couleur GTFS | 0.7rem/700 | 20×20px | 0 |
| `.map-tooltip` (hover card) | [main.css:829-843](web/src/styles/main.css#L829-L843) | 8px | 1px `--bord` | rgba(20,19,18,.94) | 0.85rem/600 (nom) | auto | `0.6rem 0.9rem` |
| `.map-control-btn` (recentrer) | [main.css:987-1006](web/src/styles/main.css#L987-L1006) | 8px | 0 (box-shadow inset 1px) | `--eleve` | — (icône) | 48×48px | 0 |
| `.rt-status` (statut temps réel) | [chrome.css:107-116](web/src/ui/chrome.css#L107-L116) | 4px | 0 | transparent/`--eleve` (hover) | 12px/400 | ~14px de haut | `4px 6px` |
| `.rt-badge` (variante ancienne, `main.css`) | [main.css:83-97](web/src/styles/main.css#L83-L97) | 9999px | 1px rgba(74,222,128,.4) | rgba(22,101,52,.25) | 0.75rem/500 | auto | `0.25rem 0.6rem` |
| `.search-line-pill` (résultats recherche) | [chrome.css:471-483](web/src/ui/chrome.css#L471-L483) | 4px | 0 | couleur GTFS | 11px/700 | 22px | `0 5px` |

**Composants morts identifiés pendant l'inventaire** (classes présentes en CSS
mais jamais posées sur un élément par le code TS actuel, ou classes posées par
le TS mais sans aucune règle CSS) :
- `.line-badge-btn` et ses surcharges responsives ([main.css:309-345](web/src/styles/main.css#L309-L345), [main.css:1201-1214](web/src/styles/main.css#L1201-L1214), [main.css:1050-1075](web/src/styles/main.css#L1050-L1075)) — recherché dans tout `web/src/**/*.ts`, zéro occurrence. Code mort.
- `.subway-search-bar`, `.search-input-wrapper`, `.search-input`, `.search-dropdown`, `.search-hub-tag`, `.search-item*` ([main.css:1355-1470](web/src/styles/main.css#L1355-L1470), ~115 lignes) — l'UI de recherche réellement utilisée est `.cmd-palette-*` ([chrome.css:271-420](web/src/ui/chrome.css#L271-L420), posée par [search_bar.ts:88-129](web/src/ui/search_bar.ts#L88-L129)). Code mort, deux systèmes de recherche coexistent dans le CSS.
- `.dock-badge`, `.station-list`, `.dock-line-title` posés par [dock.ts:234-241](web/src/ui/dock.ts#L234-L241) (`renderLineStationsList`, le repli utilisé quand une ligne n'a pas de données d'échelle de stations) — **aucune règle CSS ne les cible** dans `main.css` ni `chrome.css`. Cet état de secours s'affiche donc sans mise en forme (texte brut empilé).

**Réponses aux trois chiffres demandés** (mesuré par `grep` sur
`web/src/styles/main.css` + `web/src/ui/chrome.css`, hors variantes `%`) :
- **Rayons distincts** : 11 valeurs (`2px, 3px, 4px, 5px, 6px, 8px, 10px, 12px, 16px, 50%, 9999px`), dont 9 valeurs px non circulaires. Aucune progression régulière (2, 3, 4, 5, 6, 8, 10, 12, 16 : pas de ratio constant, pas d'échelle déclarée).
- **Tailles de police distinctes** : 32 déclarations `font-size` distinctes (mélange `rem`/`px`), soit en px (base 16px) : 9.28 / 9.6 / 9.92 / 10 / 10.08 / 10.24 / 10.4 / 10.5 / 10.56 / 10.88 / 11 / 11.2 / 11.52 / 11.84 / 12 / 12.16 / 12.48 / 12.8 / 13 / 13.12 / 13.5 / 13.6 / 14 / 14.4 / 15 / 15.2 / 16 / 16.8(1.05rem, `.line-badge-btn` mort) / 17.6 / 19.2 / 22 px. Aucune échelle typographique déclarée (pas de variables `--font-size-*`) : chaque composant a sa valeur `rem`/`px` propre, à la centième près (ex. `0.62rem` vs `0.63rem` vs `0.64rem`, un écart de 0.16px chacun) — signe d'un ajustement au pixel près composant par composant plutôt que d'un système.
- **Couleurs de fond distinctes** (valeurs résolues, alias fusionnés) : 7 couleurs nommées de la palette (`--fond, --surface, --eleve, --bord, --secondaire, --laiton, --carmin`) utilisées comme fond via les tokens, **plus 24 couleurs `rgba()`/hex codées en dur** hors du système de tokens (ex. `rgba(180, 137, 79, 0.3)`, `rgba(31, 74, 59, 0.65)`, `#facc15`, `#22c55e` — voir §4).
- **Composants partageant strictement le même triplet (rayon, bordure, fond)** : `.dock-line-close` et `.records-close` partagent (5px, `1px var(--fonte-border)`, transparent) — mêmes valeurs pour deux boutons de fermeture différents dans deux contextes (dock vs modale records), sans lien de composant partagé dans le code (deux blocs CSS distincts, dupliqués). `.map-control-btn` et `.dock-collapse-btn` partagent (48×48px, pas de bordure visible, fond `--eleve`/`--capiton` — alias de la même couleur) mais avec un rayon différent (8px vs 6px) — donc pas de triplet strictement identique.

---

## 2. Hiérarchie visuelle

**Boutons pleins (fond opaque) recensés** : `.dock-reset-btn`, `.dock-collapse-btn`, `.map-control-btn`, `.topbar__search-trigger`, `.topbar__menu-btn`, `.topbar__menu-item` (au survol), `.line-badge` (rond coloré), `.pill-mini`/`.transfer-pill`, `.rt-badge` (variante inutilisée) — **8 styles de bouton plein** distincts, chacun avec ses propres valeurs de rayon/hauteur (aucun n'est un même composant réutilisé, voir §1).

**Boutons à contour (bordure visible, fond transparent)** : `.dock-line-close`, `.dock-line-direction`, `.dock-records-btn`, `.records-close`, `.topbar__method-btn` ([main.css:1531-1540](web/src/styles/main.css#L1531-L1540)) — **5 styles**.

Aucun bouton "primaire" au sens classique (grand, en couleur d'accent `--laiton`, texte contrastant) n'existe dans l'inventaire : l'accent `--laiton` (#C9A227) n'est utilisé comme **fond** de bouton nulle part ; il sert uniquement de couleur de bordure/anneau de focus/texte d'état actif. Autrement dit, il n'existe pas de hiérarchie "action principale vs action secondaire" construite par le style des boutons — tous les boutons de chrome ont un traitement visuel de niveau "secondaire discret" (fond `--eleve`/`--capiton`, bordure `--bord`, texte `--texte`/`--secondaire`).

**Action principale par écran/état** :
- Écran d'accueil (aucune ligne sélectionnée) : l'action attendue est "choisir une ligne". Les 21 ronds de ligne (`.line-badge`, coloré par ligne GTFS) sont visuellement les éléments les plus saturés de l'écran (voir [home_w1440.png](audit/design/home_w1440.png)) — ils se distinguent bien du panneau qui les contient (fond quasi noir `#141312` vs couleurs saturées de ligne). **Distinguable : oui.**
- Écran ligne sélectionnée : l'action "changer de sens" (`.dock-line-direction`) a un style à contour identique, au repos, à un bouton désactivé — bordure `1px var(--fonte-border)` (#2A2725, contraste ≈1.2:1 sur le fond du panneau) et texte `--ceramique-dim` (#9A938C). Seul l'état `.active` (sens courant) reprend la bordure `--laiton`. **Le bouton du sens NON sélectionné (l'action disponible) est donc moins visible que le bouton déjà actif**, l'inverse de la convention usuelle "l'action possible attire l'œil, l'état courant est neutre". Voir [ligne14_w1440.png](audit/design/ligne14_w1440.png).
- Palette de recherche (Cmd+K) : l'action "sélectionner un résultat" (`.cmd-palette-item`) n'a aucun style au repos (fond transparent) — seul le survol/la sélection clavier ajoute `--eleve`. Au premier coup d'œil sans survol, la liste de résultats ressemble à du texte, pas à des lignes cliquables.

**Éléments cliquables qui ne ressemblent pas à des éléments cliquables :**
- `.ladder-station-node` (chaque station de l'échelle verticale de ligne) : c'est un `<div>` cliquable ([station_ladder.ts:91](web/src/ui/station_ladder.ts#L91), [station_ladder.ts:124-134](web/src/ui/station_ladder.ts#L124-L134)) sans bordure, sans changement de curseur déclaré en CSS, sans soulignement — visuellement indissociable d'une simple ligne de texte. Seul un survol change le fond ([main.css:1225-1229](web/src/styles/main.css#L1225-L1229) équivalent `.ladder-station-node:hover`).
- `.station-item` (repli `renderLineStationsList`) : même situation, `<div>` avec `cursor:pointer` mais aucun élément visuel de bouton ([dock.ts:238-241](web/src/ui/dock.ts#L238-L241)).
- `.rt-status` (badge "recalé"/point temps réel) : `role="button" tabindex="0"` ([header.ts:96-105](web/src/ui/header.ts#L96-L105)) mais visuellement un simple point de 6px + texte optionnel, sans aucun indice visuel de cliquabilité au repos (pas de fond, pas de bordure) — seul un survol ajoute un fond `--eleve` discret.
- `.dock-method-link` (lien "Consulter la méthode & données →") : `color:var(--secondaire)` (gris), sans soulignement au repos ([main.css:660-670](web/src/styles/main.css#L660-L670)) — visuellement identique à du texte secondaire non interactif.

**Éléments non cliquables qui ressemblent à des boutons :**
- `.topbar__menu-toggle-state` ("Inactif"/"Actif" dans le menu Bâti 3D) : rendu avec fond `--eleve`, bordure, padding et rayon identiques à un vrai bouton ([chrome.css:311-317](web/src/ui/chrome.css#L311-L317)) alors que c'est un simple libellé d'état, non cliquable en lui-même (c'est le `<button>` parent qui l'est).
- `.badge-conf--measured/--bracketed/--extrapolated/--scheduled` et `.badge-rt`/`.badge-sched` (badges de confiance dans les tooltips de train) ont un traitement "pilule à bordure" identique aux boutons de ligne (`.dock-line-direction`) mais ne sont pas interactifs.

---

## 3. Typographie

**Familles réellement chargées** (mesuré via `document.fonts` + `performance.getEntriesByType('resource')` sur la page en production, 10/09/2026) :
- Requête réseau : `https://api.fontshare.com/v2/css?f[]=switzer@400,500,600,700&f[]=cabinet-grotesk@500,700,800` et `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700`.
- `document.fonts` ne contient **que 4 entrées `Switzer`** (poids 400/500/600/700, `status:"loaded"`) — **aucune entrée `Cabinet Grotesk`** n'apparaît, alors qu'elle est demandée dans la même requête Fontshare et déclarée en premier choix dans `--font-title` ([tokens.css:48](web/src/styles/tokens.css#L48)). Vérifié en direct : le seul sélecteur utilisant `--font-title` (`.search-line-pill`, [main.css:1511](web/src/styles/main.css#L1511)) calcule `font-family: Switzer, Inter, ...` (valeur `getComputedStyle` mesurée), donc **Cabinet Grotesk ne s'affiche jamais dans le produit**, malgré son chargement demandé — le registre "titre" prévu par la charte n'existe pas en pratique.
- 27 entrées `Inter` (poids 400/500/600 dupliqués 6-7 fois chacun, 700 dupliqué 6 fois) apparaissent avec `status:"unloaded"` : elles sont déclarées comme fallback CSS mais jamais réellement téléchargées/rendues, car Switzer répond toujours en premier dans la pile de polices. **Poids chargés mais inutilisés : Inter 400/500/600/700 (28 variantes déclarées, 0 rendues).**

**Échelle de tailles (px, base 16px)** — liste condensée par usage (32 valeurs brutes, voir §1) :
- 9.28–10.56px : libellés de méta-données très denses (`.dock-stat-label` 10.08px, `.line-group-title` 10.56px, `.badge-conf`/`.badge-rt` 10.4px, `.search-line-pill` desktop 11.2px)
- 11–12.8px : `.rt-status__label` 12px, `.topbar__distance` 12px, `.topbar__count-label` 13px, `.cmd-palette-hub` 10.5px, `.dock-line-summary strong` 11.84px
- 13–14.4px : `.topbar__name`/`.topbar__count-value` 15px, `.topbar__search-trigger` 13px, `.cmd-palette-item-name` 14px, `.station-item` 13.6px
- 15–16px : `.map-tooltip .tooltip-name` 13.6px, `.cmd-palette-input` 15px, corps de texte par défaut 16px (`body`)
- 17.6–22px : `.dock-line-close`/`.records-close` icônes texte 17.6/19.2px, `.cmd-palette-close` ×/`.dock-collapse-btn` 22/16px

**Quatre registres du produit — distinction mesurée :**
| Registre | Exemple | Famille calculée | Taille | Graisse |
|---|---|---|---|---|
| Signalétique (noms de station) | `.tooltip-name`, `.ladder-node-name` | Switzer (Cabinet Grotesk jamais chargé) | 13.6px / 12.8px | 600 / 400-700 |
| Donnée (intervalles, compteurs) | `.dock-line-summary strong`, `.topbar__count-value` | Switzer, `tnum` activé | 11.84px / 15px | tabular-nums, 400-700 |
| Interface (libellés, boutons) | `.dock-reset-btn`, `.topbar__search-text` | Switzer | 13.5px / 13px | 500 |
| Éditorial (page méthode) | `web/methode.html` | Switzer body + Cabinet Grotesk annoncé pour les titres | — | — |

Les quatre registres **ne sont pas typographiquement distincts** : puisque Cabinet Grotesk ne se charge jamais dans le contexte principal (voir plus haut), signalétique, donnée et interface partagent la même unique famille rendue (Switzer). Seul `methode.html` déclare sa propre feuille de style inline avec des couleurs de repli obsolètes (`--bg: var(--laque, #150E12)` alors que `--laque`/`--fond` vaut aujourd'hui `#0C0B0B`, [methode.html:34](web/methode.html#L34) vs [tokens.css:19](web/src/styles/tokens.css#L19)) — preuve que cette page a été stylée contre une version antérieure de la palette et n'a pas été resynchronisée.

**Libellés tronqués / veuves / capitales sans interlettrage :**
- `.topbar__name` : **mesuré** — absent de la capture [home_w320.png](audit/design/home_w320.png) et présent à partir de 390. La règle correspondante est `@media (max-width: 359px) { .topbar__name { display: none } }` à **[chrome.css:615-617](web/src/ui/chrome.css#L615-L617)** (la v1 citait `chrome.css:246-248`, qui ne contient pas cette règle) — pas de troncature, disparition complète du nom du produit sur très petits écrans.
- `.ladder-node-name` : `white-space:nowrap; overflow:hidden; text-overflow:ellipsis` ([main.css:1291-1298](web/src/styles/main.css#L1291-L1298)) — troncature réelle et volontaire, confirmée visuellement pour les noms longs à largeur `.ladder-node-train-slot` fixe de 150px qui réduit d'autant l'espace disponible pour le nom sur mobile ([main.css:1305-1312](web/src/styles/main.css#L1305-L1312)).
- Capitales sans `letter-spacing` : `.line-group-title` a `text-transform:uppercase` **avec** `letter-spacing:0.09em` ([chrome.css:...]/[main.css:304-308](web/src/styles/main.css#L304-L308)) — correct. En revanche `.dock-empty-kicker`/`.search-hub-tag` n'ont pas de transformation capitale, donc non concernés. **NON MESURÉ** : présence de veuves dans les descriptions longues (`dock-empty-desc`, `records-method`) — dépend du contenu dynamique en français et de la largeur exacte au runtime ; non vérifiable de façon déterministe sans rendu pixel par pixel de chaque phrase possible.

---

## 4. Couleur et états

**Palette (tokens.css)** — chaque variable, valeur, nombre d'usages comme fond/texte/bordure dans `main.css`+`chrome.css` (grep, hors alias) :

| Variable | Valeur | Usages directs (bg+color+border) |
|---|---|---|
| `--fond` | `#0C0B0B` | 6 |
| `--surface` | `#141312` | 12 |
| `--eleve` | `#1C1A19` | 15 |
| `--bord` | `#2A2725` | 18 |
| `--inactif` | `#4E4945` | 4 |
| `--secondaire` | `#9A938C` | 9 |
| `--texte` | `#F2EFE9` | 14 |
| `--laiton` | `#C9A227` | 11 (aucun en fond de bouton, voir §2) |
| `--carmin` | `#D9463C` | 3 |

À côté de ces 9 tokens, **24 couleurs `rgba()`/hex sont codées en dur** hors du système, dont deux "or/laiton" concurrents et visuellement proches mais différents : `--laiton #C9A227` (accent officiel) et `rgba(180, 137, 79, *)` ≈ `#B4894F` (utilisé pour `.badge-conf--*`, `.ladder-train-cursor`, [main.css:930-948](web/src/styles/main.css#L930-L948) et [main.css:1314-1322](web/src/styles/main.css#L1314-L1322)) — deux bruns/ors distincts pour un même rôle sémantique ("donnée mesurée/en approche"), sans lien déclaré entre eux.

**Ratios de contraste mesurés** (formule WCAG relative luminance, calcul Node, valeurs exactes) :

| Paire | Contraste | Verdict AA (texte normal, seuil 4.5) |
|---|---|---|
| `--texte` #F2EFE9 / `--fond` #0C0B0B | 17.13 | AA |
| `--texte` / `--surface` #141312 | 16.17 | AA |
| `--texte` / `--eleve` #1C1A19 | 15.11 | AA |
| `--secondaire` #9A938C / `--fond` | 6.48 | AA |
| `--secondaire` / `--eleve` | 5.72 | AA |
| `--laiton` #C9A227 / `--fond` | 8.13 | AA |
| `--carmin` #D9463C / `--fond` | 4.58 | AA (de justesse) |
| `--carmin` / `--surface` | 4.32 | **FAIL** texte normal (< 4.5), passe seulement en grand texte/UI (≥3.0) |
| `--inactif` #4E4945 / `--fond` | 2.21 | **FAIL** |
| `--inactif` / `--eleve` (`.topbar__search-kbd` couleur sur fond du bouton recherche, [chrome.css:213](web/src/ui/chrome.css#L213) + [chrome.css:180-190](web/src/ui/chrome.css#L180-L190)) | 1.95 | **FAIL** — le raccourci "⌘K" est quasiment illisible sur son propre bouton |

**Contraste des indices de ligne** (`route_color`/`route_text_color` du fichier `web/public/data/lines.json`, calcul WCAG exact sur les 21 couples réels) :

| Ligne | Fond | Texte | Ratio | Verdict |
|---|---|---|---|---|
| B | #5091CB | #FFFFFF | 3.36 | grand texte seulement |
| D | #008B5B | #FFFFFF | 4.34 | grand texte seulement |
| A | #EB2132 | #FFFFFF | 4.38 | grand texte seulement |
| E | #B94E9A | #FFFFFF | 4.55 | AA |
| 3 | #6E6E00 | #FFFFFF | 5.39 | AA |
| 2 | #0055C8 | #FFFFFF | 6.70 | AA |
| 5 | #FF5A00 | #000000 | 6.71 | AA |
| 12 | #00643C | #FFFFFF | 7.27 | AA |
| 8, 4, 11, 10, 7, 14, 13/3bis, 6/7bis, 1, 9, C | — | — | 7.68–13.93 | AA |

Les indices des lignes **B, D et A** (RER) sont sous le seuil AA de texte normal (4.5) — mais les badges ont un texte gras de 14px (11px pour "10"/"14") : selon WCAG, un texte ≥14px gras est "large" et le seuil descend à 3.0, donc ces trois badges passent le seuil "grand texte" (3.36–4.38 > 3.0) sans passer le seuil texte normal. Le code contient d'ailleurs un mécanisme dédié qui documente explicitement ce compromis : `textColorFor()` tolère un ratio ≥3.0 "car un indice est du texte large et gras" ([line_badge.ts:47-56](web/src/ui/line_badge.ts#L47-L56)).

**Tableau des 5 états par composant interactif** (mesuré par lecture du CSS : présence de `:hover`, `:focus`/`:focus-visible`, `:active`, `[disabled]`) :

| Composant | Repos | Survol | Focus clavier | Actif/pressé | Désactivé |
|---|---|---|---|---|---|
| `.line-badge` | ✅ | ✅ ([chrome.css:544-549](web/src/ui/chrome.css#L544-L549)) | ✅ ([chrome.css:554-557](web/src/ui/chrome.css#L554-L557)) | ✅ (`:active`, [chrome.css:551](web/src/ui/chrome.css#L551)) | ❌ |
| `.topbar__search-trigger` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `.topbar__menu-btn` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `.map-control-btn` | ✅ | ✅ | ✅ | ✅ | ❌ (masqué via opacité, pas un vrai `disabled`) |
| `.dock-reset-btn` | ✅ | ✅ | ❌ | ✅ | ❌ |
| `.dock-collapse-btn` | ✅ | ❌ | ❌ | ✅ | ❌ |
| `.dock-line-close` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `.dock-line-direction` | ✅ | ✅ | ❌ | ❌ (`.active` = sélection, pas `:active`) | ❌ |
| `.station-item` (repli) | ✅ | ✅ | ❌ (`<div>`, non focusable) | ❌ | ❌ |
| `.ladder-station-node` | ✅ | ✅ | ❌ (`<div>`, non focusable) | ❌ | ❌ |
| `.transfer-pill` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `.rt-status` (rôle bouton) | ✅ | ✅ | ❌ | ❌ | ❌ |
| `.cmd-palette-item` | ❌ (fond transparent) | ✅ | ✅ (`.is-active` piloté par JS clavier, [search_bar.ts:214-227](web/src/ui/search_bar.ts#L214-L227)) | ❌ | ❌ |
| `.records-close` | ✅ | ✅ | ❌ | ❌ | ❌ |

**Total d'états manquants comptés dans ce tableau : 24** sur 65 cases possibles (13 composants × 5 états), soit 37 %. Aucun composant de chrome n'implémente d'état `[disabled]` visuellement dédié (le seul "désactivé" apparent, `.map-control-btn` masqué, est une disparition complète, pas un style désactivé). 6 composants sur 13 n'ont aucun style de focus clavier propre (`.dock-reset-btn`, `.dock-line-close`, `.dock-line-direction`, `.transfer-pill`, `.rt-status`, `.records-close`) — ils dépendent entièrement du rendu par défaut du navigateur.

---

## 5. Cibles et densité

> **Section réécrite : voir `C3.1`.** Tous les constats de cette section qui reposent sur des valeurs de feuille de style (tailles de cibles, `gap`, hauteurs déduites de `padding`/`line-height`) sont **DÉDUIT DU CSS, NON VÉRIFIÉ**. Les seules valeurs de cette section relevées au runtime sont signalées comme telles. L'ancien bloc « Surface de carte visible, panneaux ouverts » a été retiré : ses chiffres (65 %, 12 %) venaient d'arithmétique sur des media queries, appliquée à une surface de rendu fausse (voir `C1.3`).

**Cibles tactiles < 44px (mobile, <768px, valeurs CSS effectives à cette largeur) — DÉDUIT DU CSS, NON VÉRIFIÉ sauf mention contraire :**
- `.dock-line-close` : 32×32px ([main.css:402-404](web/src/styles/main.css#L402-L404), aucune surcharge mobile)
- `.records-close` : 36×36px ([main.css:569-573](web/src/styles/main.css#L569-L573))
- `.pill-mini`/`.transfer-pill` : 20×20px ([main.css:724-727](web/src/styles/main.css#L724-L727))
- `.dock-reset-btn` : hauteur mini 38px ([main.css:247](web/src/styles/main.css#L247))
- `.cmd-palette-close` : 32×32px ([chrome.css:400-402](web/src/ui/chrome.css#L400-L402))
- `.dock-line-direction` : `min-height:2.4em` ≈ 26px de texte à 0.68rem/1.2 line-height + padding vertical 0.38rem×2 ≈ 22px → hauteur totale mesurée ≈ 33px
- `.rt-status` : hauteur totale ≈ padding 4px + ligne de texte (12px) + padding 4px ≈ 20px (zone cliquable réelle, avec `role="button"`)

**Cibles pointeur < 24px (desktop, souris) :**
- `.pill-mini`/`.transfer-pill`/`.search-line-pill` : 20×20 à 22×22px — sous le seuil de 24px (WCAG 2.5.8, cible minimale pointeur)
- `.rt-status` : ≈20×14px (voir calcul ci-dessus) — sous 24px dans les deux dimensions
- `.dock-traffic-dot`, `.rt-status__dot`, `.train-cursor-pulse` : 6-7px, mais non cliquables isolément (le parent porte le clic) — non comptées comme cibles.

**Paires de cibles séparées de moins de 8px :**
- `.line-badges { gap: 8px }` ([chrome.css:519](web/src/ui/chrome.css#L519)) — exactement à la limite (8px), pas en dessous.
- `.dock-header-actions { gap: 0.5rem }` = 8px ([main.css:225](web/src/styles/main.css#L225)) — à la limite.
- `.ladder-node-transfers { gap: 0.2rem }` = 3.2px entre plusieurs `.transfer-pill` de 20px quand une station a ≥2 correspondances ([main.css:1276-1281](web/src/styles/main.css#L1276-L1281)) — **sous 8px, cibles pointeur adjacentes de 20px séparées de 3.2px.**

**Surface de carte non recouverte par le chrome — chiffres de la v1 retirés, remplacés par des mesures de rectangles** (méthode et table complète en `C3.1` ; valeurs de la table A de `C2`) :

- À **1024×768** (aucune capture v1 à 1280×800 n'est exploitable : voir `C1.3`), tiroir `24,64,390,680` et bandeau 52 px : carte non recouverte = **59,5 %** de la fenêtre — et non « ≈ 65 % ».
- À **390×844**, aucun état ne produit « ≈ 12 % » : le tiroir mesure `10,429,371,405` (soit **48,7 %** de carte non recouverte). Le cas « ligne sélectionnée » de la v1 reposait sur `.dock.has-selection`, **jamais appliqué par le code** (voir `C4.d`) : la règle `max-height:min(82vh, 82dvh)` de `main.css:1084-1087` est morte et la bande résiduelle de ~104 px annoncée n'existe pas.
- Le pire cas mesuré est **320×568 : 46,3 %** de carte non recouverte (tiroir 301×273 + bandeau 48 px), et **48,2 %** à 768×1024.
- **Le tiroir ne masque pas le réseau dessiné aux grandes largeurs** : à 1024 le corridor de la ligne 14 est peint vers `x ≈ 640-780`, entièrement à droite du tiroir qui finit à `x = 414` ; à 1920 la boîte englobante de l'encre du réseau est `x ∈ [1022, 1280]`.
- Les cibles tactiles ci-dessus, en revanche, n'ont pas été re-mesurées en v2 : **DÉDUIT DU CSS, NON VÉRIFIÉ**, à l'exception de `#dock-reset` (**108 px de large, 38 px de haut** en état « ligne sélectionnée », relevé) et de `#dock-collapse` (**48 px** à ≤430, **0 px** — hors flux — à ≥1024, relevé).

---

## 6. Responsive

> **Section réécrite : voir `C3.2`** (matrice mesurée et contenu réellement visible largeur par largeur). Le tableau ci-dessous est conservé, **corrigé sur les cellules que les captures v2 contredisent** (voir la note qui le suit) ; les seuils de media queries qu'il cite restent **DÉDUIT DU CSS, NON VÉRIFIÉ**.

Captures prises à 320, 390, 430, 768, 1024, 1440, 1920px pour l'accueil (`home_w*.png`) et pour la ligne 14 sélectionnée (`ligne14_w*.png`), `audit/design/`. Fenêtre réelle vérifiée par `window.innerWidth` avant chaque capture (correspond exactement à la largeur demandée). Protocole exact : voir `C1.1` — **une page neuve et un contexte neuf par largeur et par état, `devicePixelRatio = 1`**, jamais de redimensionnement en cours de session.

| Largeur | Bandeau supérieur | Panneau latéral / bottom sheet | Barre de monuments | Hover card | Attributions | Bottom sheet |
|---|---|---|---|---|---|---|
| 320 | `.topbar__name` visible car ≥359px ; `.topbar__meta`/`.topbar__distance` déjà masqués (règle <768px) | Bottom sheet mesurée `10,286,301,273`, `z-index 150` ; grille de pastilles en **flex-wrap**, mesurée à **5 pastilles par rangée** (rangées `y` 406/456/506/556/638) → **15 pastilles sur 21 visibles** ([home_w320.png](audit/design/home_w320.png)) | Aucune barre de monuments trouvée dans le code (`grep` négatif, §inventaire) — **non applicable**, fonctionnalité absente du produit actuel | Non déclenché sur mobile (pas de survol tactile) — **NON MESURÉ** en usage tactile réel, un tap déclenche potentiellement un `mouseenter` synthétique selon le navigateur | Attribution **déployée** (3 lignes, 5 liens) et **peinte sous le tiroir** : `elementFromPoint` au centre du texte → `line-badges` (voir `C4.a`) | `max-height:48vh` |
| 390 | idem | Bottom sheet mesurée `10,429,371,405` ; grille en **4 rangées** (`y` 550/600/650/731), **21/21** pastilles visibles | — | — | idem | idem |
| 430 | idem | idem | — | — | idem | idem |
| 768 | Bascule exacte sur le breakpoint `max-width:767px`/`768px` : à 768px précis, les règles `@media (max-width:767px)` du bandeau ne s'appliquent **pas** (768 > 767) mais celles de `@media (max-width:768px)` du dock/carte **s'appliquent** (768 ≤ 768) → bandeau en mode "desktop" (52px, meta visible) alors que le dock est déjà en bottom sheet compact. Confirmé visuel [ligne14_w768.png](audit/design/ligne14_w768.png) : bandeau large avec libellés complets au-dessus d'un panneau replié en tiroir bas. | Bottom sheet | — | — | idem | `max-height:48vh` |
| 1024 | Desktop plein **confirmé** : `#map = 0,0,1024,768` | Colonne latérale mesurée `24,64,390,680`, `z-index 10`, `position:absolute` | — | — | idem | n/a (dock latéral) |
| 1440 | Desktop plein ; carte non recouverte **69,8 %** (mesuré) — ~~« ≈2/3 de la largeur en carte vide »~~ ([home_w1440.png](audit/design/home_w1440.png)) | Colonne mesurée `24,64,390,812` | — | — | idem | n/a |
| 1920 | Idem ; carte non recouverte **76,5 %** — le réseau se trouve intégralement à droite du tiroir (encre `x ∈ [1022, 1280]`) | Colonne mesurée `24,64,390,992` | — | — | Attributions dégagées, 1 ligne à `x = 1276` | n/a |

**Ce que les captures v2 contredisent dans ce tableau** (chaque point est mesuré, table A et table B de `C2`) :
- **« grille de lignes en 4 colonnes » (320) et « 5 colonnes » (390)** : faux. `.lines-grid` est un conteneur `flex-wrap` dont les rangées mesurées sont de 5 pastilles à 320, 6 puis 5 à 390, 7 puis 6 puis 5 à 430, 9 puis 8 à 768.
- **« Attribution MapLibre repliée en icône `i` »** : faux à toutes les largeurs. Le contrôle est `compact: true`, ce qui ne replie pas le texte : il est peint sur **3 lignes à 320, 2 à 390, 2 à 430, 1 à ≥768**, 5 liens compris. À 320/390/430/768 il est recouvert par le tiroir (voir `C4.a`).
- **« ≈2/3 de la largeur en carte vide à droite du panneau » (1440)** : faux. Carte non recouverte **69,8 %** à 1440, **59,5 %** à 1024, **76,5 %** à 1920.
- **`max-height:48vh`** : la valeur CSS existe (`main.css:1073`) mais la hauteur réellement atteinte est plafonnée par le contenu et par `top`/`bottom` : **272,64 px** à 320, **405,12 px** à 390, **447,36 px** à 430, **491,52 px** à 768. Les deux valeurs coïncident à 390 seulement.
- **768 (bandeau « desktop », 52 px, dock compact)** : confirmé par la mesure (`.topbar` = 52 px à partir de 768 inclus) — c'est le seul point du tableau que la v1 avait vu juste.

**Incohérence de breakpoint confirmée par le code, et par la mesure** : `chrome.css` utilise `767px` pour le bandeau ([chrome.css:580](web/src/ui/chrome.css#L580), et non `:220` comme l'écrivait la v1) alors que `main.css` utilise `768px` pour le dock/carte/tooltip ([main.css:1050](web/src/styles/main.css#L1050)) — un écart d'1px entre deux fichiers qui régissent la même bascule « mobile », produisant à exactement 768px de large un état hybride bandeau-desktop / panneau-mobile. **Le résultat est mesuré** : à 768×1024, `.topbar` fait 52 px (régime desktop) tandis que `.dock` est déjà un tiroir bas `10,524,749,491` à `z-index 150` (régime mobile) — les deux moitiés de l'écran ne suivent pas le même régime.

**Breakpoints réellement déclarés dans le CSS** (`grep -n @media`, **DÉDUIT DU CSS, NON VÉRIFIÉ** — citations revérifiées dans les fichiers) : `359px` ([chrome.css:615](web/src/ui/chrome.css#L615)), `480px` ([main.css:1162](web/src/styles/main.css#L1162)), `600px` ([main.css:589](web/src/styles/main.css#L589)), `767px` ([chrome.css:580](web/src/ui/chrome.css#L580), [main.css:71](web/src/styles/main.css#L71)), `768px` ([main.css:1050](web/src/styles/main.css#L1050)), `900px` ([chrome.css:567](web/src/ui/chrome.css#L567)). Aucun de ces breakpoints ne correspond à 320, 390, 430, 1024, 1440 ou 1920 — seuls 768 (largeur tablette testée) et 480 tombent dans la plage demandée. Le produit n'a donc aucune règle dédiée au-delà de 768px : les trois largeurs desktop mesurées partagent la même structure (bandeau 52 px, colonne `x = 24`, `w = 390`, `z-index 10`), mais **la surface de carte non recouverte continue de croître en valeur absolue** (610×716 → 1026×848 → 1506×1028 px hors chrome), ce que l'ancienne conclusion « carte vide qui domine » décrivait à l'envers : les grandes largeurs ajoutent de la carte utilisable, pas du vide. Mesures : `C3.1`.

---

## 7. Clavier et accessibilité

**Parcours Tab** (lecture du DOM/ordre du code, `web/index.html` + composants montés dans `main.ts`) :
Ordre attendu (ordre du DOM, aucun `tabindex` positif trouvé donc ordre = ordre naturel) : lien marque (`.topbar__brand`) → statut temps réel (`.rt-status`, `tabindex="0"`) → bouton recherche (`.topbar__search-trigger`) → bouton menu (`.topbar__menu-btn`) → bouton recentrer (`.map-control-btn`) → poignée du dock (`.dock-handle`, **pas focusable**, ni `tabindex` ni élément interactif natif) → bouton "Tout afficher" (conditionnel) → bouton replier (`.dock-collapse-btn`) → 21 ronds de ligne (`.line-badge`, chacun un vrai `<button>`) → contenu du panneau (bouton fermeture ligne, boutons de sens, puis **stations de l'échelle non focusables**, voir ci-dessous) → lien méthode.

**Éléments non focusables qui portent pourtant une action de clic** (donc **inaccessibles au clavier**, échec critère WCAG 2.1.1) :
- `.ladder-station-node` — `<div>` créé dans [station_ladder.ts:91-113](web/src/ui/station_ladder.ts#L91-L113), écouteur `click` seul ([station_ladder.ts:124-134](web/src/ui/station_ladder.ts#L124-L134)), aucun `tabindex`, `role`, ni gestionnaire `keydown`. Impossible d'ouvrir une station de la ligne sélectionnée au clavier.
- `.station-item` (repli sans échelle) — même défaut, [dock.ts:236-242](web/src/ui/dock.ts#L236-L242).
- `.dock-handle` — poignée de redimensionnement tactile ([dock.ts:97-107](web/src/ui/dock.ts#L97-L107)), gérée uniquement par `touchstart`/`touchmove` ; aucune alternative clavier pour réduire/agrandir le tiroir (le bouton `.dock-collapse-btn`, lui, est un vrai bouton et reste utilisable).

**Anneau de focus visible par composant** : voir tableau §4. Les composants suivants **n'ont aucun `:focus`/`:focus-visible` déclaré** et dépendent donc entièrement du style par défaut du navigateur, non garanti visible sur fond sombre personnalisé : `.dock-reset-btn`, `.dock-collapse-btn`, `.dock-line-close`, `.dock-line-direction`, `.transfer-pill`, `.rt-status`, `.records-close`, `.dock-method-link`. Aucun composant de chrome n'utilise `clip-path`, et un seul (`.map-tooltip`, `.cmd-palette-dialog`) utilise `overflow:hidden` — mais ces deux conteneurs ne portent pas eux-mêmes le focus (les enfants interactifs comme `.cmd-palette-input`/`.cmd-palette-close` sont stylés explicitement, [chrome.css:200-201](web/src/ui/chrome.css#L200-L201) neutralise l'outline navigateur sans le remplacer visiblement par autre chose de plus que `border-color`/`box-shadow` — vérifié présent, donc pas de perte). **Aucune troncature de l'anneau par `overflow:hidden` détectée sur un élément focusable lui-même.**

**Carte utilisable sans souris ?** Non : MapLibre GL (le canvas `#map`) ne reçoit aucun `tabindex` ni gestionnaire clavier dans `web/src/map/maplibre.ts` (grep négatif sur `keydown`/`tabindex` dans ce fichier) — le déplacement, le zoom et le survol des stations sur la carte elle-même ne sont pas opérables au clavier. **Alternative textuelle existe partiellement** : la liste de stations dans le panneau (`.station-item`/`.ladder-station-node`) donne un équivalent textuel du contenu de la carte, mais ces éléments sont eux-mêmes non focusables au clavier (voir ci-dessus) — donc l'alternative existe visuellement mais n'est pas non plus opérable sans souris.

**`prefers-reduced-motion`** : un seul point de code CSS le respecte, `.rt-status[data-state="live"] .rt-status__dot { animation: none }` ([chrome.css:167-169](web/src/ui/chrome.css#L167-L169)) ; deux points de code JS le respectent pour la simulation caméra/position (hors périmètre, [deck_overlay.ts:652](web/src/map/deck_overlay.ts#L652), [browser_engine.ts:309-312](web/src/sim/browser_engine.ts#L309-L312)). **Ce qui continue de bouger malgré `prefers-reduced-motion:reduce`** (aucune media query ne les neutralise) :
- `.cmd-palette-dialog` : animation d'ouverture `cmd-fade-in 140ms` ([chrome.css:307-311](web/src/ui/chrome.css#L307-L311))
- `.train-cursor-pulse` : `pulse-glow 1.5s infinite` ([main.css:1029-1034](web/src/styles/main.css#L1029-L1034) équivalent), point pulsé en continu tant qu'un train approche
- `.line-badge:hover { transform: translateY(-2px) }`-like et tous les `transition: transform`/`max-height` du dock, des boutons carte, du menu déroulant (~14 déclarations recensées en §8) restent actifs.

---

## 8. Mouvement

Inventaire exhaustif des `transition`/`animation` déclarées dans `main.css` + `chrome.css` :

| Élément | Durée / courbe | Déplace dans l'espace ? | Change l'apparence seule ? |
|---|---|---|---|
| `.rt-badge` (mort) | 250ms `cubic-bezier(.4,0,.2,1)` | non (translateY -1px au survol) | oui (filter brightness) |
| `.dock` (ouverture/fermeture) | `--t-surface` 240ms, `--ease` | oui (`transform`, `max-height`) | non |
| `.dock-reset-btn` | `--t-state` 200ms + `--t-press` 90ms | léger (`scale(0.972)` à l'activation) | oui (background, box-shadow) |
| `.dock-collapse-btn` | `--t-press` 90ms + `--t-state` 200ms | oui (`rotate(180deg)` quand replié) | oui |
| `.line-badge-btn` (mort) | 200ms ease | oui (`translateY(-2px)` survol) | oui |
| `.line-badge` | 140ms `cubic-bezier(.16,1,.3,1)` | non | oui (opacity, box-shadow, outline-color) |
| `.station-item` | 150ms ease | non | oui (background) |
| `.ladder-station-node` | 150ms ease | non | oui (background) |
| `.transfer-pill` | 150ms ease | oui (`scale(1.15)` survol) | non |
| `.ladder-train-cursor` | 200ms ease | oui (`scale(1.06)` survol) | oui |
| `.train-cursor-pulse` / `.rt-pulse-dot` | `pulse-glow` 1.5s/2s `infinite` | non | oui (scale + box-shadow, boucle continue) |
| `.rt-status__dot[data-state="live"]` | `rt-pulse` 2.4s ease-in-out infinite | non | oui (opacity, boucle continue) |
| `.map-control-btn` | 180ms `cubic-bezier(.16,1,.3,1)` | oui (`scale`, apparition/disparition) | oui |
| `.topbar__search-trigger` | 120ms ease | non | oui |
| `.topbar__menu-btn` | 120ms ease | non | oui |
| `.topbar__menu-item` | 100ms ease | non | oui |
| `.rt-status` | `--t-state` 200ms | non | oui |
| `.cmd-palette-item` | 80ms ease | non | oui |
| `.cmd-palette-dialog` (`cmd-fade-in`) | 140ms ease-out, une fois | oui (`translateY(-8px)→0`, `scale(.98)→1`) | oui (opacity) |
| `.search-input`/`.search-input-wrapper` (morts) | 200-300ms ease | oui (`width`) | oui |
| `.dock-method-link` | `--t-state` 200ms | non | oui (couleur) |
| `.topbar__method-btn` | `--t-state` 200ms | non | oui |

**Compteurs de valeurs vivantes qui s'animent en interpolant des chiffres** : recherché dans `main.ts`/`header.ts`/`dock.ts` — le compteur de rames (`topbar__count-value`), la distance cumulée (`topbar__distance`) et les statistiques de ligne (`#dock-line-count-0/1`, `#dock-line-headway-0/1`, `#dock-line-speed`) sont mis à jour par remplacement direct de `textContent` (`setText()`, [dock.ts:337-348](web/src/ui/dock.ts#L337-L348) ; `setTrainCount()`/`setNetworkDistance()`, [header.ts:220-247](web/src/ui/header.ts#L220-L247)) — **aucune interpolation de chiffres intermédiaires** (pas de `requestAnimationFrame` ni de tween numérique sur ces éléments). Les nombres changent par saut sec à chaque tick moteur.

---

## 9. Parcours

**Premier contact (30 secondes, sans aide)** — d'après [home_w1440.png](audit/design/home_w1440.png)/[home_w390.png](audit/design/home_w390.png) : le visiteur voit un fond quasi noir avec un lacis de lignes colorées animées (rendu carte), un bandeau portant "Métro de Paris", un compteur de rames, une icône recherche et un menu ☰, et un panneau listant 16 ronds de métro + 5 ronds de RER sous le libellé "Lignes du réseau". Il peut raisonnablement deviner qu'il faut cliquer un rond pour sélectionner une ligne (les ronds sont les seuls éléments saturés de couleur de l'écran). Rien à l'écran n'explique en revanche ce que représentent les points blancs qui se déplacent sur les tracés (rames) sans survol — l'info-bulle n'apparaît qu'au survol, non découverte spontanément sur tactile.

**Comptage d'actions pour 5 tâches** (chemin le plus court, boutons/clics comptés, hors défilement) :

| Tâche | Desktop | Mobile |
|---|---|---|
| Trouver une ligne précise (ex. ligne 14) | 1 (clic direct sur le rond dans la grille toujours visible) | 1 (idem, grille visible dans la bottom sheet) |
| Trouver une station précise (ex. "Gare de Lyon") | 2 (⌘K ou clic loupe → taper → Entrée/clic résultat) | 2 (tap loupe → taper → tap résultat) |
| Passer en "vue 3D" | **NON MESURÉ** — aucune bascule "vue 3D" explicite trouvée dans le chrome (seul un toggle "Bâti 3D" existe dans le menu ☰, qui active des bâtiments, pas une vue caméra dédiée) ; si "vue 3D" désigne ce toggle : 2 clics (menu ☰ → "Bâti 3D") | idem, 2 taps |
| Lire l'intervalle d'une ligne | 2 (sélectionner la ligne, puis lire "Intervalle moyen sens 1/2" dans le résumé qui s'affiche automatiquement) | 2 (idem, mais nécessite en plus de déplier la bottom sheet si elle était réduite — potentiellement 3) |
| Comprendre d'où viennent les données | 2 (menu ☰ → "Méthode", ou clic direct sur le lien "Consulter la méthode & données →" dans l'état vide du panneau = 1) | idem |

**Instructions textuelles qui n'existent que parce qu'un élément n'est pas compréhensible seul :**
- Le `title` de `.rt-status` ("Mode nominal : circulation calculée sur la grille horaire officielle GTFS.", [header.ts:91](web/src/ui/header.ts#L91)) est nécessaire car le point de 6px seul ne porte aucune information sans info-bulle native du navigateur.
- Le `title` de `.map-control-btn` ("Recadrer sur le réseau de métro") compense une icône (cercle+croix) qui ne décrit pas explicitement l'action de recentrage.
- `.dock-handle` porte un `title="Glisser pour afficher / masquer"` ([index.html:88](web/index.html#L88)) car la simple barre grise de 40×4px ne suggère pas nativement un geste de glissement.
- Le badge `.cmd-palette-hub` ("Pôle") et les badges `.badge-conf--*` nécessitent leur libellé textuel car leur seul style (couleur/bordure) ne distingue pas leur sens sans le lire.

---

## 10. Verdict

**Desktop** : l'interface de chrome est cohérente dans sa palette sombre et sa lisibilité de texte (tous les contrastes texte/fond mesurés en §4 passent AA, ratio minimal 15.11:1), mais elle est bâtie à partir de composants stylés au cas par cas (32 tailles de police, 11 rayons, deux systèmes de recherche coexistants, des boutons de fermeture dupliqués) sans grille de conception commune. ~~Elle « laisse jusqu'à 65 % de la fenêtre en carte sombre non exploitée »~~ : **mesure** — la carte non recouverte par le chrome occupe **59,5 % de la fenêtre à 1024×768, 69,8 % à 1440×900, 76,5 % à 1920×1080** (rectangles relevés, table A de `C2`, détail `C3.1`). Le chrome ne « gaspille » donc pas 65 % de l'écran ; il occupe une colonne de 390 px plus une marge de 24 px, soit **29,9 % de la largeur à 1920** — et la carte, elle, reste le même dessin quel que soit l'espace fourni (le réseau ne se déploie pas dans la largeur libérée : encre `x ∈ [1022, 1280]` à 1920).

**Mobile** : la sélection d'une ligne téléscobe le contenu du tiroir sans que rien ne se replie — l'échelle des stations est repoussée hors du tiroir sous la grille des 21 pastilles restée dépliée (mesure : `ligne14_w390`, contenu 887 px pour un `clientHeight` de 53 px ; `ligne14_w320`, 872 px pour 16 px). ~~« la carte visible chute à environ 12 % de l'écran (bottom sheet à 82vh) »~~ : faux dans les deux termes — le `max-height` de `82vh` n'est **jamais atteint** (`.dock.has-selection` n'est jamais appliqué, voir `C4.d` et l'item 8 ci-dessous) et la carte non recouverte mesure **46,3 % à 320×568**, **48,7 % à 390×844**, **49,0 % à 430×932**. Le vrai problème mobile est l'inverse de celui annoncé : le tiroir est **trop petit pour son contenu** (16 px, 53 px, 146 px de fenêtre visible pour 292/273/273 px de contenu) et coupe la navigation au lieu de la déployer. Une partie de cette navigation (stations de l'échelle verticale) n'est par ailleurs opérable ni au clavier ni autrement qu'au toucher direct sur chaque ligne de texte non stylée comme cible.

**Dix problèmes les plus coûteux, classés par impact :**

1. **Stations de l'échelle de ligne non focusables au clavier** — panne d'accessibilité totale sur le contenu le plus consulté de l'app. Fichier : [station_ladder.ts:91-134](web/src/ui/station_ladder.ts#L91-L134). Coût : **moyen** (ajout de `role="button"`, `tabindex="0"`, gestion `keydown`, style `:focus-visible`, sur un seul composant réutilisé).
2. **Repli `renderLineStationsList` totalement non stylé** (`.dock-badge`, `.station-list`, `.dock-line-title` sans CSS) — apparence cassée dès qu'une ligne n'a pas de données d'échelle. Fichier : [dock.ts:230-243](web/src/ui/dock.ts#L230-L243). Coût : **petit** (ajouter les règles manquantes, ou supprimer ce chemin mort si l'échelle est désormais toujours disponible).
3. **Deux systèmes de recherche CSS coexistants**, dont un mort (~115 lignes), source de confusion pour toute future modification du composant de recherche. Fichiers : [main.css:1355-1470](web/src/styles/main.css#L1355-L1470) vs [chrome.css:271-420](web/src/ui/chrome.css#L271-L420). Coût : **petit** (suppression du code mort).
4. **`.line-badge-btn` entièrement mort** (~50 lignes réparties sur 3 blocs responsive) qui entretient une confusion avec `.line-badge` (le composant réellement utilisé). Fichier : [main.css:309-345,1050-1075,1201-1214](web/src/styles/main.css#L309-L345). Coût : **petit**.
5. **Cabinet Grotesk jamais rendu malgré son chargement réseau demandé** — le registre "titre" de la charte typographique n'existe pas en pratique, et la police est téléchargée pour rien. Fichiers : [tokens.css:48](web/src/styles/tokens.css#L48), requête réseau Fontshare. Coût : **petit à moyen** (soit corriger la requête Fontshare/l'ordre de la pile pour qu'elle s'affiche réellement, soit retirer la police du chargement si le registre "titre" est abandonné).
6. **Absence quasi totale d'état `:focus-visible` dédié sur 6 composants de chrome** (`.dock-reset-btn`, `.dock-line-close`, `.dock-line-direction`, `.transfer-pill`, `.rt-status`, `.records-close`) — risque de perte de repère clavier selon navigateur/plateforme. Fichiers : [main.css](web/src/styles/main.css), [chrome.css](web/src/ui/chrome.css) (voir tableau §4). Coût : **petit** (ajouter une règle `:focus-visible` cohérente, potentiellement une seule règle générique).
7. **Aucun état `[disabled]` visuel sur aucun bouton de chrome** — impossible aujourd'hui de communiquer visuellement qu'une action est temporairement indisponible (ex. bouton recentrer avant chargement des données). Coût : **petit**.
8. ~~**Carte réduite à ~12 % de la fenêtre sur mobile une fois une ligne sélectionnée**~~ → **mesure : aucune règle de hauteur ne s'applique à la sélection.** `.dock.has-selection` (`[main.css:1084-1087](web/src/styles/main.css#L1084-L1087)`, `max-height:min(82vh, 82dvh)`) est **du code mort** : `selectLine()` (`dock.ts:222-232`) ne pose jamais cette classe, et la classe effectivement posée, `dock--collapsed` (`dock.ts:84-89`), n'a **aucune règle CSS**. Conséquence réelle, mesurée : le tiroir garde la hauteur dictée par son contenu et **tronque** l'échelle (voir `C4.d`) — problème **plus grave** que celui décrit, parce qu'il est invisible dans la feuille de style et masque des stations. Coût : **moyen** (2 lignes dans `dock.ts` + décision de comportement : replier la grille à la sélection fait disparaître le sélecteur de ligne).
9. **Incohérence de breakpoint à 768px entre `chrome.css` (767px) et `main.css` (768px)**, produisant un état hybride bandeau-desktop/panneau-mobile exactement à cette largeur — **confirmé par la mesure** (`.topbar` 52 px, `.dock` `10,524,749,491`, `z-index 150` à 768×1024). Fichiers : [chrome.css:580](web/src/ui/chrome.css#L580) vs [main.css:1050](web/src/styles/main.css#L1050). Coût : **petit** (aligner les deux seuils).
10. **32 tailles de police et 11 rayons distincts sans échelle déclarée** — chaque nouveau composant de chrome ajoute vraisemblablement encore une valeur unique, aggravant la dette de cohérence visuelle au fil du temps. Coût : **gros** (nécessite de définir une échelle et de remapper l'ensemble des composants existants, risque de régressions visuelles étendu).

*(Aucune correction n'a été appliquée : ce document est une mesure, pas une intervention.)*

---

## 11. Consignes des sessions précédentes

Recherche effectuée dans l'historique local des sessions Copilot pour ce workspace (`session_store_sql`, table `sessions`/`turns`), avec des mots-clés couvrant le chrome UI (`design`, `contraste`, `focus`, `hover card`, `bottom sheet`, `accessibilité`, `typographie`, `clavier`, `responsive`, `bandeau`, `dock`, `panneau`, `topbar`, `recherche`, `bouton`, `tooltip`, `police`, `couleur`).

**Constat** : l'historique local ne contient que **3 sessions** pour ce workspace, datées du 10/09/2026, et leurs échanges portent exclusivement sur le rendu 3D des rames (glTF, gainage, effet de chenille), le pipeline de données (shapes.bin, artefacts RER) et la géométrie du réseau — tous explicitement **hors périmètre** de cet audit design. **Aucune session antérieure consacrée au chrome UI, à la typographie, à la couleur, à l'accessibilité clavier ou au responsive n'a été trouvée dans l'historique accessible.**

**NON MESURÉ** pour l'ensemble de cette section : aucune consigne d'interface antérieure à comparer au code actuel n'existe dans l'historique disponible localement. Il est possible que des instructions de design aient été données dans des sessions antérieures non indexées (avant la mise en place de l'historique local, ou dans un autre environnement/poste de travail) — cette hypothèse ne peut ni être confirmée ni infirmée avec les outils disponibles ici. Aucune conclusion factuelle ne peut donc être tirée sur des consignes "perdues entre sessions" par opposition à des "obstacles techniques" : la donnée d'entrée nécessaire (le texte des consignes passées) est absente.
