// @ts-check
/**
 * zm-os ESLint — 금지 규칙을 기계가 검사하게 만드는 최소 세트.
 *
 * `CLAUDE.md`의 금지 규칙 4개는 그동안 주석으로만 존재했고, 코드 곳곳의
 * eslint-disable 주석은 읽는 린터가 없어 장식이었다. 여기서 실제 검사로 승격한다.
 *
 * 의도적으로 좁게 시작한다:
 * - error는 금지 규칙 4개 + hooks 규칙만. 나머지는 warn.
 * - type-checked 규칙(no-unsafe-*)은 쓰지 않는다 — IDB·OPFS 어댑터의 정당한
 *   캐스트에서 대량 위반이 떠 도입 자체가 막힌다.
 */

import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/e2e-out/**',
      '**/*.min.js',
      'apps/web/public/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // 브라우저 코드
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },

  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      // 두 플러그인은 규칙을 켜기 위해서가 아니라 기존 eslint-disable 주석이
      // 참조하는 규칙을 실제로 존재하게 만들기 위해서도 필요하다.
      // 플러그인이 없으면 그 주석들이 "정의되지 않은 규칙" 에러가 된다.
      '@next/next': nextPlugin,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      // ── 금지 규칙 (CLAUDE.md 정책 다이제스트) ───────────────────────────
      '@typescript-eslint/no-explicit-any': 'error',

      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@zm/storage',
              message:
                '@zm/storage는 ADR-0020 §D5의 삭제 대상 shell이다. @zm/adapters-local/blob-storage를 쓸 것.',
            },
            {
              name: '@/components/store/AppUploadButton',
              message:
                'ZIP 업로드 UI는 zm-docs DEC-0007로 제거됐다. 배포와 로그인이 붙으면 인터넷에 노출된 업로드 경로가 된다. 재장착은 새 결정 기록이 선행이다.',
            },
          ],
        },
      ],

      // raw postMessage 금지 — 호스트-앱 통신은 @zm/ipc 어댑터를 거친다.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression > MemberExpression[property.name='postMessage']",
          message:
            'raw postMessage 금지. @zm/ipc의 엔드포인트를 사용할 것 (ARCH-02).',
        },
        {
          // 저수준 IDB CRUD 직접 사용 금지 — 파티션 스코프 키 경계를 우회한다.
          // zm-docs contracts.md §2가 "어댑터 경계 한 곳"을 정했고, 우회로가 있으면
          // 그 결정이 참이 아니게 된다. 실제로 이 경로로 우회하던 래퍼가 2개 있었다.
          selector:
            "ImportDeclaration > ImportSpecifier[imported.name=/^(idbGet|idbPut|idbDelete|idbList|idbClear|openDB)$/]",
          message:
            '저수준 IDB CRUD 직접 사용 금지. 소유자 파티션 접두사를 건너뛴다. BlobStorage 어댑터(resolveAdapterFor / createLocalBlobStorage)를 경유할 것 (zm-docs contracts.md §2).',
        },
      ],

      // ── React ────────────────────────────────────────────────────────────
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // ── 경고로만 (지금 error로 켜면 기존 코드가 대량으로 막힌다) ─────────
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // 접근성 — 경고로 시작한다. 실제로 배경 프리셋 버튼에 접근 가능한 이름이
      // 없는 것을 브라우저 검증에서 확인했다.
      'jsx-a11y/alt-text': 'warn',
      'jsx-a11y/anchor-has-content': 'warn',
      'jsx-a11y/aria-props': 'warn',
      'jsx-a11y/role-has-required-aria-props': 'warn',
      '@next/next/no-img-element': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // packages/ipc는 postMessage를 실제로 구현하는 곳이다 — 금지 대상이 아니다.
  {
    files: ['packages/ipc/**/*.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },

  // @zm/storage shell 자신과, 아직 그것을 쓰는 저장 래퍼들.
  // G5(Composition Root)에서 정리되면 이 예외를 지우고 error가 실제로 걸리게 한다.
  {
    files: ['packages/storage/**/*.ts', 'apps/web/src/lib/storage/**/*.ts'],
    rules: { 'no-restricted-imports': 'warn' },
  },

  // 파티션 경계를 구현하는 곳과, 그것을 re-export하는 shell은 저수준 CRUD를 쓴다.
  // 여기가 바로 "한 곳"이므로 금지 대상이 아니다.
  {
    files: ['packages/adapters-local/**/*.ts', 'packages/storage/**/*.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },

  // 테스트는 진단 목적의 콘솔·단언 캐스트를 허용한다.
  {
    files: ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // e2e 스크립트와 설정 파일은 Node에서 직접 실행하는 .mjs다.
  // 진단 목적이라 미사용 변수·빈 블록을 error로 막지 않는다.
  {
    files: ['**/*.mjs'],
    // Playwright 스크립트는 Node에서 돌지만 page.evaluate() 콜백은 브라우저에서
    // 실행된다. 한 파일 안에 두 실행 환경이 섞이므로 전역도 둘 다 선언한다.
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      'no-console': 'off',
      'no-empty': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
);
