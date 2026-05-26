import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@zm/core': path.resolve(__dirname, '../core/src'),
    },
  },
  test: {
    globals: false,
    include: ['src/**/*.test.ts'],
  },
});
