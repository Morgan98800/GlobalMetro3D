import fs from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

const NON_PARIS_MODEL_PREFIXES = [
  'wmata_generic',
  'bvg_',
  'scotrail_class_385',
  'val_208',
  'val_52m',
  'breda_vlc',
];

function parisDistTrimAndSwVersion(): Plugin {
  return {
    name: 'paris-dist-trim-and-sw-version',
    apply: 'build',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      if (!fs.existsSync(distDir)) return;

      // 1. Prune inactive multi-city datasets (54 MB) & internal diagnostic reports from production bundle while keeping them in repo for tests
      fs.rmSync(path.join(distDir, 'cities'), { recursive: true, force: true });
      fs.rmSync(path.join(distDir, 'data', 'station-rankings.json'), { force: true });
      fs.rmSync(path.join(distDir, 'sections-report.html'), { force: true });

      const modelsDir = path.join(distDir, 'models', 'train');
      if (fs.existsSync(modelsDir)) {
        for (const file of fs.readdirSync(modelsDir)) {
          if (NON_PARIS_MODEL_PREFIXES.some((prefix) => file.startsWith(prefix))) {
            fs.rmSync(path.join(modelsDir, file), { force: true });
          }
        }
      }

      // 2. Version the built service worker with a unique build stamp
      const swPath = path.join(distDir, 'sw.js');
      if (fs.existsSync(swPath)) {
        const hash = Date.now().toString(36);
        const content = fs.readFileSync(swPath, 'utf8').replace(/__BUILD_HASH__/g, hash);
        fs.writeFileSync(swPath, content, 'utf8');
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), parisDistTrimAndSwVersion()],
  envDir: '../',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@core': path.resolve(__dirname, '../core'),
      '@cities': path.resolve(__dirname, '../cities'),
      '@paris-subway/shared': path.resolve(__dirname, '../core'),
    },
  },
  server: {
    port: 3000,
    open: true,
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.startsWith('/data/')) {
          response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          response.setHeader('Pragma', 'no-cache');
        }
        next();
      });
    },
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        methode: path.resolve(__dirname, 'methode.html'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/maplibre-gl')) return 'maplibre';
          if (
            id.includes('node_modules/@deck.gl') ||
            id.includes('node_modules/@luma.gl') ||
            id.includes('node_modules/@loaders.gl') ||
            id.includes('node_modules/@math.gl')
          ) {
            return 'deckgl';
          }
          if (id.includes('node_modules/three')) return 'three';
          if (
            id.includes('node_modules/react') ||
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react-aria-components')
          ) {
            return 'ui-vendor';
          }
        },
      },
    },
  },
});
