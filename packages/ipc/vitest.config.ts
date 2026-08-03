import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['src/**/*.test.ts'],
    // host.ts는 window/MessageEvent에 의존한다. node 환경에서는 테스트 자체가 불가능해
    // 이 프로젝트의 도메인 핵심(샌드박스 격리)이 무검증으로 남아 있었다.
    environment: 'happy-dom',
  },
});
