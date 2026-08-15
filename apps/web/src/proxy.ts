import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { buildCsp } from '@/lib/security/csp';

/**
 * 요청마다 nonce를 발급하고 Content-Security-Policy를 싣는다.
 *
 * ## 왜 이 파일이 있는가 (2026-08-15 실측)
 *
 * prod 빌드에서 **호스트 셸이 hydration되지 않았다.** Next.js prerender 산출물에
 * nonce 없는 inline `<script>` 6개(RSC 페이로드)가 들어가는데 `script-src 'self'`가
 * 전부 차단했기 때문이다. 화면에는 SSR된 데스크탑이 그대로 보여서 정상 동작으로
 * 오독하기 쉬웠다 — 시계가 `--:--`에 멈춘 것이 유일한 육안 단서였다.
 *
 * 그 6개는 프레임워크 산출물이라 외부 파일로 뺄 수 없다(`next/script`·
 * `dangerouslySetInnerHTML` 참조 0건). 그래서 nonce가 유일한 실용 해법이다.
 *
 * 근거 전문: `zm-docs`의 `docs/research/2026-08-15-zm-os-prod-build-measurement.md`
 *
 * ## 동적 렌더링이 전제다
 *
 * Next.js는 **요청에 실린 CSP 헤더를 근거로 SSR 중에** nonce를 주입한다. 정적
 * 페이지는 빌드 타임에 생성되어 요청 헤더가 없으므로 nonce가 주입되지 않는다.
 * 그래서 `app/layout.tsx`가 `dynamic = 'force-dynamic'`을 선언한다. 그것을 지우면
 * 라우트가 다시 static이 되고 셸이 조용히 죽는다.
 *
 * ## nonce는 prod 전용이다
 *
 * CSP는 한 지시어에 nonce가 있으면 그 지시어의 `'unsafe-inline'`을 무시한다.
 * dev의 `script-src`는 HMR 때문에 `'unsafe-inline'`이 필요하므로 dev에는 nonce를
 * 넣지 않는다. `buildCsp`가 그 분기를 갖고 있다.
 *
 * ## `'strict-dynamic'` 금지
 *
 * 이유는 `lib/security/csp.ts`의 `buildCsp` 주석에 있다. 요약하면 앱을 죽인다.
 */
export function proxy(request: NextRequest): NextResponse {
  const isProd = process.env.NODE_ENV === 'production';

  // Buffer는 edge 런타임에서 보장되지 않는다. Web 표준 API만 쓴다.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const nonce = btoa(String.fromCharCode(...bytes));

  const csp = buildCsp(isProd ? 'production' : 'development', isProd ? nonce : undefined);

  // Next.js가 nonce를 찾아 자기 script 태그에 주입하려면 **요청** 헤더에 CSP가 있어야 한다.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);

  return response;
}

export const config = {
  matcher: [
    {
      // 문서 응답에만 적용한다. 정적 자산은 CSP를 실을 대상이 아니다.
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
