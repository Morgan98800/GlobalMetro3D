import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'core'),
      '@cities': path.resolve(__dirname, 'cities'),
      '@paris-subway/shared': path.resolve(__dirname, 'core')
    }
  },
  test: {
    environment: 'node'
  }
});
