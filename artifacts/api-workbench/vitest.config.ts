import path from 'path';
import { defineConfig } from 'vitest/config';

// Deliberately standalone: vite.config.ts requires PORT and BASE_PATH, which
// only make sense when actually serving the app.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
