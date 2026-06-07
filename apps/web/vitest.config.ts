import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@zm/core': path.resolve(__dirname, '../../packages/core/src'),
      '@zm/storage': path.resolve(__dirname, '../../packages/storage/src'),
      '@zm/ipc': path.resolve(__dirname, '../../packages/ipc/src'),
      '@zm/adapters-local': path.resolve(__dirname, '../../packages/adapters-local/src'),
    },
  },
  test: {
    globals: false,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/__tests__/**'],
    },
  },
});
