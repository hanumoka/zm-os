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
    // .tsx도 포함한다. 이전에는 .ts만 잡아 컴포넌트 테스트를 작성해도
    // 실패가 아니라 '수집되지 않음'으로 조용히 사라졌다.
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      // components/를 제외하면 3,000줄이 리포트에서 빠져 커버리지가 실태를 오도한다.
      // 임계값은 걸지 않는다 — 1인 프로젝트에서 게이트는 무의미한 테스트를 만든다.
      include: ['src/lib/**/*.ts', 'src/components/**/*.{ts,tsx}'],
      exclude: ['src/**/__tests__/**'],
    },
  },
});
