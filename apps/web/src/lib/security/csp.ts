/**
 * CSP / Permissions-Policy 헤더 빌더
 *
 * server-side build config (next.config.ts) 전용 모듈.
 * 브라우저/클라이언트에서 import 금지 — `'use client'` 미사용.
 * env 의존 없음: mode는 호출자(next.config.ts)가 결정.
 *
 * @see ADR-0004: 호스트 origin CSP / Permissions-Policy 정책 — POC 1차 정적 헤더 모델
 * @see .claude/rules/security.md — CSP / Permissions-Policy 명세
 */

// ─── CSP 지시어 상수 ───────────────────────────────────────────────────────────

/** 개발 환경에서만 허용: eval + inline (HMR / Fast Refresh 필요) */
const CSP_DEV_SCRIPT_EXTRAS = "'unsafe-eval' 'unsafe-inline'" as const;

/**
 * 스크립트 기본 허용: 'self'
 * prod에서는 unsafe-eval / unsafe-inline 제거.
 */
const CSP_SCRIPT_SRC_BASE = "'self'" as const;

/** 스타일: 'self' + 'unsafe-inline' (Tailwind CSS v4 빌드 아티팩트 포함) */
const CSP_STYLE_SRC = "'self' 'unsafe-inline'" as const;

/** 이미지: self + data URL + blob URL (캔버스/게임 엔진 스크린샷) */
const CSP_IMG_SRC = "'self' data: blob:" as const;

/** 폰트: self + data URL (embedded web font fallback) */
const CSP_FONT_SRC = "'self' data:" as const;

/** 워커: self + blob URL (Web Worker / Service Worker 후보 경로) */
const CSP_WORKER_SRC = "'self' blob:" as const;

/** 프레임: self + blob URL (sandbox iframe srcdoc → blob: origin) */
const CSP_FRAME_SRC = "'self' blob:" as const;

/** object / embed 완전 차단 */
const CSP_OBJECT_SRC = "'none'" as const;

/** base 태그 셀프만 허용 (XSS base hijacking 방어) */
const CSP_BASE_URI = "'self'" as const;

/** form action 셀프만 허용 */
const CSP_FORM_ACTION = "'self'" as const;

/** manifest.json 셀프만 허용 */
const CSP_MANIFEST_SRC = "'self'" as const;

/** dev connect-src: HMR WebSocket + localhost API 허용 */
const CSP_CONNECT_SRC_DEV =
  "'self' ws: http://localhost:* http://127.0.0.1:*" as const;

/** prod connect-src: self만 허용 */
const CSP_CONNECT_SRC_PROD = "'self'" as const;

/** frame-ancestors: prod는 'none' (클릭재킹 완전 차단) */
const CSP_FRAME_ANCESTORS_PROD = "'none'" as const;

/** frame-ancestors: dev는 'self' (로컬 iframe 테스트 허용) */
const CSP_FRAME_ANCESTORS_DEV = "'self'" as const;

// ─── Permissions-Policy 상수 ─────────────────────────────────────────────────

/**
 * 완전 차단 기능 목록.
 * 사용자 앱(sandbox iframe) 상위 정책으로 강제 적용됨.
 */
const PERMISSIONS_DENIED: ReadonlyArray<string> = [
  'camera=()',
  'microphone=()',
  'geolocation=()',
  'payment=()',
  'usb=()',
  'bluetooth=()',
  'serial=()',
  'accelerometer=()',
  'gyroscope=()',
  'magnetometer=()',
  'display-capture=()',
  'screen-wake-lock=()',
  'xr-spatial-tracking=()',
];

/**
 * 호스트 self만 허용 기능 목록.
 * 사용자 앱(sandbox iframe)에는 자동 차단(iframe sandbox 상속).
 */
const PERMISSIONS_SELF: ReadonlyArray<string> = [
  'fullscreen=(self)',
  'picture-in-picture=(self)',
];

// ─── buildCsp ─────────────────────────────────────────────────────────────────

/**
 * Content-Security-Policy 헤더 값 생성.
 *
 * - dev:  unsafe-eval + unsafe-inline 허용 (HMR / Fast Refresh 필요)
 * - prod: unsafe-eval / unsafe-inline 제거, frame-ancestors 'none'
 * - nonce가 주어지면 script-src에만 추가한다 (`src/proxy.ts`가 요청마다 발급).
 *
 * ## 왜 nonce가 필요한가 (2026-08-15 실측)
 *
 * prod에서 Next.js prerender 산출물에 nonce 없는 inline `<script>` 6개가 들어간다.
 * `script-src 'self'` 만으로는 전부 차단되어 RSC 페이로드가 전달되지 않고 **셸이
 * hydration되지 않는다.** 그 6개는 프레임워크 산출물이라 외부 파일로 뺄 수 없다.
 * nonce는 페이지가 **동적 렌더링**될 때만 주입되므로 라우트가 static이면 안 된다.
 *
 * ## ⚠ `'strict-dynamic'`을 절대 추가하지 마라
 *
 * Next.js 공식 예시에는 들어 있지만 zm-os에서는 **앱을 죽인다.**
 * `'strict-dynamic'`이 있으면 `'self'` 같은 host allowlist가 **무시**된다.
 * 그런데 호스트 CSP는 `srcdoc` 샌드박스 iframe에 **상속**되고(실측 확인), 앱 문서에는
 * nonce가 없다. 따라서 앱이 로드하는 절대경로 external script가 전부 차단된다.
 *
 * 현재 조합이 정확히 원하는 상태를 만든다:
 *   - 호스트 inline  → nonce로 실행됨
 *   - 호스트 external → 'self'로 실행됨
 *   - 앱 inline      → nonce가 없으므로 차단 (격리 유지)
 *   - 앱 external    → 'self'로 통과 (IPC 런타임 외부화 경로)
 *
 * 이 불변식은 `__tests__/csp.test.ts`가 기계적으로 검사한다.
 *
 * ## ⚠ style-src에는 nonce를 넣지 마라
 *
 * CSP는 한 지시어에 nonce나 hash가 있으면 그 지시어의 `'unsafe-inline'`을 **무시**한다.
 * style-src는 Tailwind v4 빌드 아티팩트 때문에 `'unsafe-inline'`이 필요하므로,
 * nonce를 넣는 순간 스타일이 전부 깨진다.
 *
 * @see ADR-0004
 */
export function buildCsp(
  mode: 'development' | 'production',
  nonce?: string,
): string {
  const isProd = mode === 'production';

  // dev에서 nonce를 쓰면 'unsafe-inline'이 무시되어 HMR이 깨진다.
  // 그래서 nonce는 prod 전용이며, dev는 기존 허용 정책을 그대로 둔다.
  const scriptSrcParts: string[] = [CSP_SCRIPT_SRC_BASE];
  if (nonce) scriptSrcParts.push(`'nonce-${nonce}'`);
  if (!isProd) scriptSrcParts.push(CSP_DEV_SCRIPT_EXTRAS);
  const scriptSrc = scriptSrcParts.join(' ');

  const connectSrc = isProd ? CSP_CONNECT_SRC_PROD : CSP_CONNECT_SRC_DEV;

  const frameAncestors = isProd
    ? CSP_FRAME_ANCESTORS_PROD
    : CSP_FRAME_ANCESTORS_DEV;

  const directives: ReadonlyArray<string> = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src ${CSP_STYLE_SRC}`,
    `img-src ${CSP_IMG_SRC}`,
    `font-src ${CSP_FONT_SRC}`,
    `connect-src ${connectSrc}`,
    `frame-src ${CSP_FRAME_SRC}`,
    `worker-src ${CSP_WORKER_SRC}`,
    `object-src ${CSP_OBJECT_SRC}`,
    `base-uri ${CSP_BASE_URI}`,
    `form-action ${CSP_FORM_ACTION}`,
    `frame-ancestors ${frameAncestors}`,
    `manifest-src ${CSP_MANIFEST_SRC}`,
  ];

  return directives.join('; ');
}

// ─── buildPermissionsPolicy ───────────────────────────────────────────────────

/**
 * Permissions-Policy 헤더 값 생성.
 *
 * dev/prod 공통 정책.
 * 사용자 앱(sandbox iframe)은 sandbox 속성 + CSP frame-src 이중 격리로
 * Permissions-Policy와 무관하게 카메라/마이크 등 접근 불가.
 */
export function buildPermissionsPolicy(): string {
  const features: ReadonlyArray<string> = [
    ...PERMISSIONS_DENIED,
    ...PERMISSIONS_SELF,
  ];
  return features.join(', ');
}

// ─── securityHeaders ──────────────────────────────────────────────────────────

/** Next.js headers() 반환 타입과 일치하는 단일 헤더 항목 타입 */
export type SecurityHeader = {
  readonly key: string;
  readonly value: string;
};

/**
 * 모든 보안 헤더 배열 반환.
 *
 * next.config.ts `headers()` 함수에서 단독 사용.
 * COEP / COOP는 게임 엔진 호환성 영향 미검증으로 미도입 (ADR-0004 §Alternatives-B).
 *
 * @param mode - 'development' | 'production'  (호출자가 NODE_ENV 기반으로 결정)
 */
export function securityHeaders(
  mode: 'development' | 'production',
  options?: { readonly includeCsp?: boolean },
): ReadonlyArray<SecurityHeader> {
  const isProd = mode === 'production';
  // CSP는 요청마다 nonce가 달라지므로 정적 헤더 설정이 아니라 `src/proxy.ts`가 소유한다.
  // next.config.ts는 includeCsp: false로 호출해 나머지 헤더만 싣는다.
  const includeCsp = options?.includeCsp ?? true;

  const headers: SecurityHeader[] = [];

  if (includeCsp) {
    headers.push({
      key: 'Content-Security-Policy',
      value: buildCsp(mode),
    });
  }

  headers.push(
    {
      key: 'Permissions-Policy',
      value: buildPermissionsPolicy(),
    },
    {
      key: 'Referrer-Policy',
      // sandbox.ts referrerPolicy: 'no-referrer' 와 정합
      value: 'no-referrer',
    },
    {
      key: 'X-Content-Type-Options',
      value: 'nosniff',
    },
  );

  // X-Frame-Options: prod only (frame-ancestors CSP 폴백, 구형 브라우저 대응)
  // dev에서는 로컬 iframe 테스트를 위해 미적용
  if (isProd) {
    headers.push({
      key: 'X-Frame-Options',
      value: 'DENY',
    });
  }

  return headers;
}
