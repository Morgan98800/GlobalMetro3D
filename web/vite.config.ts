import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  envDir: '../',
  resolve: {
    alias: {
      '@paris-subway/shared': path.resolve(__dirname, '../packages/shared/src')
    }
  },
  server: {
    port: 3000,
    open: true
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  }
});
