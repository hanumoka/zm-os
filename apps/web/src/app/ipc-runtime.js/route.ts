import { IPC_RUNTIME_IIFE } from '@zm/ipc';

/**
 * 샌드박스 앱이 로드하는 IPC 런타임을 `/ipc-runtime.js`로 서빙한다.
 *
 * ## 왜 라우트 핸들러인가
 *
 * 런타임 코드의 정본은 `packages/ipc`의 `IPC_RUNTIME_IIFE` 문자열 상수다.
 * 빌드 단계로 `public/`에 복사하면 상수와 서빙본이 갈라질 수 있다 — 상수를 고치고
 * 복사를 잊으면 앱이 옛 런타임을 쓴다. 라우트가 상수를 직접 읽으면 그 드리프트가
 * 구조적으로 불가능해진다.
 *
 * ## 왜 external로 서빙해야 하는가
 *
 * 앱은 `srcdoc` 문서이고 호스트 CSP를 상속하는데 nonce가 없다. 따라서 인라인
 * 주입은 프로덕션에서 차단된다. 절대 경로 external classic script는 `'self'`로
 * 통과한다는 것이 2026-08-15 실측으로 확인됐다.
 *
 * `Content-Type`을 명시하는 것이 중요하다 — 응답에 `X-Content-Type-Options:
 * nosniff`가 붙으므로 타입이 틀리면 브라우저가 실행을 거부한다.
 */
export function GET(): Response {
  return new Response(IPC_RUNTIME_IIFE, {
    status: 200,
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      // 배포마다 내용이 바뀔 수 있고 URL에 해시가 없다. 항상 재검증한다.
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}
