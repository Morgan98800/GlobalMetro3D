// Builds the living style guide into ONE self-contained HTML file
// (fonts, data and images inlined): design/showcase.html
//   npx vite build --config design/showcase-src/vite.config.mjs
import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: here('.'),
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    viteSingleFile(),
    {
      name: 'copy-showcase',
      closeBundle() {
        copyFileSync(here('../showcase-dist/index.html'), here('../showcase.html'));
      },
    },
  ],
  build: {
    outDir: here('../showcase-dist'),
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    reportCompressedSize: false,
  },
});
