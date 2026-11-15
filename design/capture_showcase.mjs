#!/usr/bin/env node
/**
 * Faïence v2 — screenshots.
 *
 *   node design/capture_showcase.mjs             app captures (needs web/dist) + mockups
 *   node design/capture_showcase.mjs app         app only   → design/screenshots/
 *   node design/capture_showcase.mjs maquettes   mockups    → design/screenshots/maquettes/
 *
 * Mockups are rendered from design/showcase.html (npm run design:showcase).
 * CHROMIUM_PATH=/path/to/chrome reuses an installed browser.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST_DIR = path.join(ROOT, 'web', 'dist');
const SHOWCASE = path.join(ROOT, 'design', 'showcase.html');
const OUT_DIR = path.join(ROOT, 'design', 'screenshots');
const OUT_MAQ = path.join(OUT_DIR, 'maquettes');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.bin': 'application/octet-stream',
  '.glb': 'model/gltf-binary',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

// v2 selectors first, v1 fallbacks so the script works during the migration.
const SEL = {
  lignes: ['button[aria-label="Lignes, choisir une ligne"]', 'button[aria-label="Choisir une ligne"]'],
  arreterSuivi: ['button[aria-label="Arrêter le suivi"]'],
  ligne14: ['button[aria-label="Ligne 14"]', 'button[aria-label^="Ligne 14,"]'],
  monter: ['button[aria-label="Monter à bord d’une rame en 3D"]'],
};

const MAQUETTES = [
  { id: 'desktop-overview', width: 1440, height: 900, file: '01_bureau_jour_accueil.png' },
  { id: 'desktop-route', width: 1440, height: 900, file: '02_bureau_nuit_itineraire.png' },
  { id: 'desktop-station', width: 1440, height: 900, file: '03_bureau_nuit_station.png' },
  { id: 'cab-mp14', width: 1440, height: 900, file: '04_bureau_cabine_mp14.png' },
  { id: 'cab-mf01', width: 1440, height: 900, file: '05_bureau_cabine_mf01.png' },
  { id: 'mobile-overview', width: 390, height: 844, file: '06_mobile_accueil.png' },
  { id: 'mobile-station', width: 390, height: 844, file: '07_mobile_station.png' },
  { id: 'desktop-ligne', width: 1440, height: 900, file: '08_bureau_jour_ligne.png' },
  { id: 'desktop-suivi', width: 1440, height: 900, file: '09_bureau_jour_suivi.png' },
  { id: 'desktop-recherche', width: 1440, height: 900, file: '10_bureau_nuit_recherche.png' },
  { id: 'desktop-apropos', width: 1440, height: 900, file: '11_bureau_jour_apropos.png' },
  { id: 'desktop-records', width: 1440, height: 900, file: '12_bureau_nuit_records.png' },
  { id: 'mobile-autour', width: 390, height: 844, file: '13_mobile_autour.png' },
  { id: 'mobile-menu', width: 390, height: 844, file: '14_mobile_menu.png' },
];

function startStaticServer(rootDir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
      let relPath = decodeURIComponent(reqUrl.pathname);
      if (relPath === '/' || relPath === '/paris' || relPath === '/paris/') relPath = '/index.html';
      let filePath = path.join(rootDir, relPath.replace(/^\/+/, ''));
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) filePath = path.join(rootDir, 'index.html');
      res.setHeader('Content-Type', MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, port: typeof addr === 'object' && addr ? addr.port : 4173 });
    });
  });
}

async function createPage(browser, { width, height, colorScheme = 'light', isMobile = false }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    colorScheme,
    isMobile,
    hasTouch: isMobile,
    deviceScaleFactor: isMobile ? 2 : 1,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (err) => console.error('[capture:pageerror]', err.message));
  return { ctx, page };
}

async function clickFirst(page, selectors) {
  for (const s of selectors) {
    const el = await page.$(s);
    if (el) {
      await el.click({ noWaitAfter: true });
      return s;
    }
  }
  throw new Error(`None of these selectors matched: ${selectors.join(' | ')}`);
}

async function waitForAppReady(page) {
  await page.waitForSelector('#topbar-search-trigger', { state: 'attached', timeout: 60000 });
  await page
    .waitForFunction(() => document.getElementById('app-loader')?.classList.contains('is-hidden'), null, { timeout: 30000 })
    .catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1800);
}

async function waitForDrawerSettled(page) {
  await page
    .waitForFunction(
      () => {
        const d = document.querySelector('[role="dialog"]');
        if (!(d instanceof HTMLElement)) return false;
        const r = d.getBoundingClientRect();
        return r.width > 120 && r.left >= -2 && r.right <= window.innerWidth + 2;
      },
      null,
      { timeout: 15000 },
    )
    .catch(() => {});
  await page.waitForTimeout(900);
}

async function assertNoHorizontalOverflow(page, label) {
  const result = await page.evaluate(() => {
    const docOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const clipped = [];
    document.querySelectorAll('header *, section *, nav *, [role="dialog"] *').forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      if (el.closest('[aria-hidden="true"], [hidden]')) return;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      if (rect.right > window.innerWidth + 4 || rect.left < -4)
        clipped.push({ tag: el.tagName, text: el.innerText?.slice(0, 40), left: Math.round(rect.left), right: Math.round(rect.right) });
    });
    return { docOverflow, clippedCount: clipped.length, clippedSample: clipped.slice(0, 3) };
  });
  if (result.docOverflow > 2 || result.clippedCount > 0) console.warn(`[capture:${label}] Overflow:`, JSON.stringify(result));
  else console.log(`[capture:${label}] Layout OK (no horizontal overflow).`);
}

async function shot(page, dir, filename, fullPage = false) {
  await page.screenshot({ path: path.join(dir, filename), animations: 'disabled', fullPage, timeout: 45000 });
}

async function captureApp(browser) {
  if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) throw new Error('web/dist/index.html missing — run `npm run build:web` first.');
  const { server, port } = await startStaticServer(DIST_DIR);
  const base = `http://127.0.0.1:${port}`;
  try {
    {
      const { ctx, page } = await createPage(browser, { width: 1440, height: 900 });
      await page.goto(`${base}/paris?rt=0`, { waitUntil: 'domcontentloaded' });
      await waitForAppReady(page);
      await clickFirst(page, SEL.lignes);
      await page.waitForTimeout(800);
      await assertNoHorizontalOverflow(page, 'desktop-light');
      await shot(page, OUT_DIR, '01_desktop_light_overview.png');
      await ctx.close();
    }
    {
      const { ctx, page } = await createPage(browser, { width: 1440, height: 900, colorScheme: 'dark' });
      await page.goto(`${base}/paris?rt=0&from=Ch%C3%A2telet&to=Bastille`, { waitUntil: 'domcontentloaded' });
      await waitForAppReady(page);
      await waitForDrawerSettled(page);
      await assertNoHorizontalOverflow(page, 'desktop-dark-route');
      await shot(page, OUT_DIR, '02_desktop_dark_route_planner.png');
      await ctx.close();
    }
    {
      const { ctx, page } = await createPage(browser, { width: 1440, height: 900, colorScheme: 'dark' });
      await page.goto(`${base}/paris?rt=0&station=Strasbourg`, { waitUntil: 'domcontentloaded' });
      await waitForAppReady(page);
      await waitForDrawerSettled(page);
      await page.waitForTimeout(1600);
      await assertNoHorizontalOverflow(page, 'desktop-3d-hub');
      await shot(page, OUT_DIR, '03_desktop_3d_station_hub.png');
      await ctx.close();
    }
    {
      const { ctx, page } = await createPage(browser, { width: 1440, height: 900 });
      await page.goto(`${base}/paris?rt=0`, { waitUntil: 'domcontentloaded' });
      await waitForAppReady(page);
      await clickFirst(page, SEL.lignes);
      await page.waitForTimeout(500);
      await clickFirst(page, SEL.ligne14);
      await page.waitForTimeout(900);
      await clickFirst(page, SEL.monter);
      await page.waitForSelector('[data-ride-route]', { timeout: 20000 });
      await page.waitForTimeout(1600);
      await page.click('[data-ride-live]', { noWaitAfter: true });
      await page.waitForTimeout(1800);
      await shot(page, OUT_DIR, '04_desktop_quai_3d_cab_mp14.png');
      await page.selectOption('[data-ride-route]', '9');
      await page.waitForTimeout(2600);
      await shot(page, OUT_DIR, '05_desktop_quai_3d_cab_mf01.png');
      await ctx.close();
    }
    for (const [query, file, label] of [
      ['', '06_mobile_390_overview.png', 'mobile-overview'],
      ['&station=Bastille', '07_mobile_390_station_sheet.png', 'mobile-station-sheet'],
    ]) {
      const { ctx, page } = await createPage(browser, { width: 390, height: 844, isMobile: true });
      await page.goto(`${base}/paris?rt=0${query}`, { waitUntil: 'domcontentloaded' });
      await waitForAppReady(page);
      if (query) await waitForDrawerSettled(page);
      await assertNoHorizontalOverflow(page, label);
      await shot(page, OUT_DIR, file);
      await ctx.close();
    }
  } finally {
    server.close();
  }
}

async function captureMaquettes(browser) {
  if (!fs.existsSync(SHOWCASE)) throw new Error('design/showcase.html missing — run `npm run design:showcase` first.');
  fs.mkdirSync(OUT_MAQ, { recursive: true });
  const base = pathToFileURL(SHOWCASE).href;
  for (const m of MAQUETTES) {
    const mobile = m.width < 500;
    const { ctx, page } = await createPage(browser, { width: m.width, height: m.height, isMobile: mobile });
    await page.goto(`${base}?screen=${m.id}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(700);
    await assertNoHorizontalOverflow(page, `maquette:${m.id}`);
    await shot(page, OUT_MAQ, m.file);
    await ctx.close();
  }
  const { ctx, page } = await createPage(browser, { width: 1440, height: 900 });
  await page.goto(`${base}?theme=light`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(3500); // embedded screens load in iframes
  await shot(page, OUT_MAQ, '00_planche_charte.png', true);
  await ctx.close();
}

async function main() {
  const mode = process.argv[2] ?? 'tout';
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: [
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
      // file:// iframes in the style guide are cross-origin; keep them in-process so full-page captures paint them
      '--disable-site-isolation-trials', '--disable-features=IsolateOrigins,site-per-process', '--allow-file-access-from-files',
    ],
  });
  try {
    if (mode === 'tout' || mode === 'app') await captureApp(browser);
    if (mode === 'tout' || mode === 'maquettes') await captureMaquettes(browser);
    console.log('Captures written to', OUT_DIR);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
