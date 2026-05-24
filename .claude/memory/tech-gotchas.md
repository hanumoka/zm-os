# Tech Gotchas
> 라이브러리/플랫폼별 주의사항 (특정 버그가 아닌 일반 함정).
> 새 함정 발견 시 즉시 여기에 기록 → 같은 실수 반복 방지.

## iframe Sandbox (도메인 핵심)

- **`allow-same-origin + allow-scripts` 조합 금지**
  sandbox 우회의 가장 흔한 원인. host와 origin이 같아지면 storage/cookie 접근 가능.
- **blob: URL의 origin 격리**
  blob URL은 생성 origin과 동일하지만, sandbox 속성이 적용된 iframe에 blob src를 로드하면 **null origin**으로 격리. 이게 핵심 보안 메커니즘.
- **postMessage `event.origin`은 문자열 `"null"`**
  sandbox iframe에서 보낸 메시지의 origin은 정확히 `"null"` 문자열. origin 검증 시 정확한 매칭 필요.

## OPFS (Origin Private File System)

- **Safari 미지원** (2026-05 기준) — IndexedDB 폴백 필수
- **동기 API는 Web Worker에서만** — 메인 스레드에서는 비동기 API만
- **origin별 격리** — 같은 도메인의 다른 사용자 계정 데이터 분리하려면 사용자 ID prefix 활용

## Next.js 16 App Router

- **route group `(group)`은 URL 세그먼트 미생성**
  `app/(auth)/login/page.tsx` → URL은 `/login` (`/auth/login` 아님)
- **`'use client'` 전염**
  클라이언트 컴포넌트 내부에서 import한 모듈은 클라이언트 번들 포함. 무거운 서버 전용 모듈을 클라이언트에서 import하지 말 것.
- **`dangerouslyAllowLocalIP: true`** (`next.config.ts`)
  localhost 이미지 최적화 기본 false. 로컬 dev에서 이미지가 안 뜨면 이 옵션 확인.
- **route handler 응답**
  `Response` 또는 `NextResponse` 사용. raw object return 안 됨.

## React 19

- **`use()` hook** — Promise를 컴포넌트에서 await. Suspense와 함께 사용.
- **`useActionState`/`useFormStatus`** — form action 상태 추적.
- **`forwardRef` 불필요** — ref가 일반 prop처럼 작동.

## postMessage

- **`event.origin` 검증 누락이 가장 흔한 XSS 경로** — 항상 `if (event.origin !== EXPECTED) return;`
- **transferable objects** — 큰 ArrayBuffer는 `transfer`로 전달하여 복사 비용 회피.

## COEP / COOP

- **SharedArrayBuffer 활성화 시 필수**:
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`
- **iframe 호환성 충돌** — sandbox iframe에 COEP를 강제하면 외부 게임 자산(이미지/오디오)이 차단 가능. 점진적 도입.

## Tailwind v4

- **`@import "tailwindcss"`** (v3의 `@tailwind base/components/utilities` 대체)
- **PostCSS plugin은 `@tailwindcss/postcss`** (별도 패키지)
- **CSS 변수 기반 테마** — `@theme` 디렉티브

## Windows + Git

- **CRLF 경고**: `.gitattributes`에 `* text=auto eol=lf` 명시하면 차단
- **PowerShell** — bash와 문법 다름. `&&`는 PS7+만 지원. `$null` vs `/dev/null`.
- **SSH 키 분리** — 개인/회사 계정 분리는 `~/.ssh/config`의 Host alias 활용
