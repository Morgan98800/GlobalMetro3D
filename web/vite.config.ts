import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  envDir: '../',
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, '../core'),
      '@cities': path.resolve(__dirname, '../cities'),
      '@paris-subway/shared': path.resolve(__dirname, '../core')
    }
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
    }
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        methode: path.resolve(__dirname, 'methode.html')
      }
    }
  }
});
