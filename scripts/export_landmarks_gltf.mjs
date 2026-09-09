import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'web/public/models');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Node.js FileReader polyfill for Three.js GLTFExporter
class NodeFileReader {
  readAsArrayBuffer(blob) {
    setTimeout(async () => {
      try {
        this.result = await blob.arrayBuffer();
        if (this.onloadend) this.onloadend({ target: this });
        if (this.onload) this.onload({ target: this });
      } catch (e) {
        if (this.onerror) this.onerror(e);
      }
    }, 0);
  }
}
global.FileReader = NodeFileReader;

async function exportLandmarks() {
  const THREE = await import('three');
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const { PARIS_LANDMARKS } = await import('../web/src/three/landmarks.ts');

  const exporter = new GLTFExporter();
  const manifest = [];

  const SLUGS = {
    'Tour Eiffel': 'tour_eiffel',
    'Arc de Triomphe': 'arc_de_triomphe',
    'Sacré-Cœur (Montmartre)': 'sacre_coeur',
    'Notre-Dame de Paris': 'notre_dame',
    'Hôtel des Invalides': 'invalides',
    'Tour Montparnasse': 'montparnasse',
    'Musée du Louvre': 'louvre',
    'Le Panthéon': 'pantheon'
  };

  console.log('=== Export des 8 monuments paramétriques vers glTF (GLB) ===');

  for (const lm of PARIS_LANDMARKS) {
    const slug = SLUGS[lm.name] || lm.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const group = lm.builder();

    // Clean lights and transparent rays that are Three.js specific
    const cleanGroup = group.clone();
    const toRemove = [];
    cleanGroup.traverse((child) => {
      if (
        child.isPointLight ||
        child.isLight ||
        (child.material && child.material.transparent && child.material.opacity < 0.3)
      ) {
        toRemove.push(child);
      }
    });
    toRemove.forEach((c) => c.parent && c.parent.remove(c));

    // Aligner l'axe vertical du modèle (Y Three.js) sur l'axe vertical Z (Up WGS84 deck.gl)
    cleanGroup.rotation.x = Math.PI / 2;
    cleanGroup.updateMatrixWorld(true);

    const glbBuffer = await exporter.parseAsync(cleanGroup, { binary: true });
    const outFileName = `${slug}.glb`;
    const outFilePath = path.join(OUTPUT_DIR, outFileName);

    fs.writeFileSync(outFilePath, Buffer.from(glbBuffer));
    const kbSize = (glbBuffer.byteLength / 1024).toFixed(1);
    console.log(`✓ ${lm.name} -> ${outFileName} (${kbSize} Ko)`);

    manifest.push({
      id: slug,
      name: lm.name,
      coords: lm.coords,
      file: `/models/${outFileName}`,
      sizeBytes: glbBuffer.byteLength,
      sizeKb: parseFloat(kbSize)
    });
  }

  const manifestPath = path.join(OUTPUT_DIR, 'landmarks.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nManifeste enregistré : ${manifestPath}`);
  console.log('Total des 8 monuments :', (manifest.reduce((acc, m) => acc + m.sizeKb, 0)).toFixed(1), 'Ko');
}

exportLandmarks().catch((err) => {
  console.error('Erreur export :', err);
  process.exit(1);
});
