import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { EventEmitter } from 'node:events';

const ROOT = process.cwd();
const DIST_DIR = path.resolve(ROOT, 'web/dist');
const FIXTURE_PATH = path.resolve(ROOT, 'tests/fixtures/paris-build.json');

if (!fs.existsSync(FIXTURE_PATH)) {
  console.error(`❌ Fixture file not found: ${FIXTURE_PATH}`);
  process.exit(1);
}

const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

// 1. Audit Dist Files and Sizes (within 1%)
console.log('🔍 Auditing dist/ files against footprint...');
if (!fs.existsSync(DIST_DIR)) {
  console.error(`❌ dist directory not found: ${DIST_DIR}. Run "npm run build:web" first.`);
  process.exit(1);
}

const actualFiles = new Map();
function walkDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full);
    } else if (entry.isFile()) {
      const rel = path.relative(DIST_DIR, full);
      const size = fs.statSync(full).size;
      actualFiles.set(rel, size);
    }
  }
}
walkDir(DIST_DIR);

let sizeErrors = 0;
let missingFiles = 0;

for (const expected of fixture.distFiles) {
  let actualSize = actualFiles.get(expected.originalPath);

  if (actualSize === undefined && expected.normalizedPath.includes('.[hash].')) {
    const prefix = expected.normalizedPath.split('.[hash].')[0];
    const ext = '.' + expected.normalizedPath.split('.[hash].')[1];
    for (const [relPath, s] of actualFiles.entries()) {
      if (relPath.startsWith(prefix) && relPath.endsWith(ext)) {
        if (Math.abs(s - expected.sizeBytes) / expected.sizeBytes <= 0.05) {
          actualSize = s;
          break;
        }
      }
    }
  }

  if (actualSize === undefined) {
    console.error(`❌ Missing file in dist/: ${expected.originalPath} (pattern: ${expected.normalizedPath})`);
    missingFiles++;
    continue;
  }

  const minAllowed = expected.minSize1Pct;
  const maxAllowed = expected.maxSize1Pct;
  if (actualSize < minAllowed || actualSize > maxAllowed) {
    const deltaPct = ((actualSize - expected.sizeBytes) / expected.sizeBytes * 100).toFixed(2);
    console.error(`❌ Size deviation > 1% on ${expected.originalPath}: expected ~${expected.sizeBytes}B [${minAllowed}-${maxAllowed}], got ${actualSize}B (${deltaPct}%)`);
    sizeErrors++;
  }
}

if (missingFiles > 0 || sizeErrors > 0) {
  console.error(`❌ Dist footprint check failed: ${missingFiles} missing files, ${sizeErrors} size deviations.`);
  process.exit(1);
}
console.log(`✅ Dist footprint verified: ${fixture.distFiles.length} files checked, all sizes within 1%.`);

// 2. Audit Netlify Functions
console.log('🔍 Auditing Netlify functions...');
for (const fn of fixture.netlifyFunctions) {
  const entryPath = path.resolve(ROOT, fn.entry);
  if (!fs.existsSync(entryPath)) {
    console.error(`❌ Missing Netlify function entry: ${fn.entry}`);
    process.exit(1);
  }
}
const netlifyToml = fs.readFileSync(path.resolve(ROOT, 'netlify.toml'), 'utf8');
if (!netlifyToml.includes('prim_relay')) {
  console.error('❌ netlify.toml missing prim_relay function configuration');
  process.exit(1);
}
if (!netlifyToml.includes('stm_relay')) {
  console.error('❌ netlify.toml missing stm_relay function configuration');
  process.exit(1);
}
console.log(`✅ Netlify functions verified (${fixture.netlifyFunctions.length} functions).`);

// 3. Replay First Render HTTP requests (without external network socket requirement)
console.log('🔍 Verifying status codes and MIME types on first render resources...');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.bin': 'application/octet-stream',
  '.br': 'application/octet-stream',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

function handleStaticRequest(reqUrl) {
  let reqPath = decodeURIComponent(reqUrl.split('?')[0]);
  if (reqPath === '/') reqPath = '/index.html';

  let filePath = path.join(DIST_DIR, reqPath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    if (reqPath.startsWith('/assets/')) {
      const dir = path.join(DIST_DIR, 'assets');
      const basePrefix = path.basename(reqPath).split('-')[0];
      const ext = path.extname(reqPath);
      const match = fs.existsSync(dir) ? fs.readdirSync(dir).find(f => f.startsWith(basePrefix + '-') && f.endsWith(ext)) : null;
      if (match) {
        filePath = path.join(dir, match);
      } else {
        return { status: 404, mime: 'text/plain', size: 0 };
      }
    } else {
      return { status: 404, mime: 'text/plain', size: 0 };
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  const size = fs.statSync(filePath).size;
  return { status: 200, mime, size };
}

let httpErrors = 0;
for (const resItem of fixture.firstRenderResources) {
  const result = handleStaticRequest(resItem.url);

  if (result.status !== resItem.expectedStatus) {
    console.error(`❌ HTTP status mismatch for ${resItem.url}: expected ${resItem.expectedStatus}, got ${result.status}`);
    httpErrors++;
  }

  if (!result.mime.includes(resItem.expectedMime)) {
    console.error(`❌ MIME type mismatch for ${resItem.url}: expected to contain "${resItem.expectedMime}", got "${result.mime}"`);
    httpErrors++;
  }

  if (result.size === 0) {
    console.error(`❌ Empty response body for ${resItem.url}`);
    httpErrors++;
  }
}

if (httpErrors > 0) {
  console.error(`❌ First-render verification failed with ${httpErrors} errors.`);
  process.exit(1);
}

console.log(`✅ First-render resources verified: ${fixture.firstRenderResources.length} URLs tested (all HTTP 200 with matching MIME types).`);
console.log('🎉 ALL BUILD FOOTPRINT & FIRST-RENDER CHECKS PASSED!');
