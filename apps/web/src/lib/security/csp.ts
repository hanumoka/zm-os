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
 *
 * nonce 기반 strict CSP는 Next.js middleware 필요 → v2에서 도입 검토 (ADR-0004 §Alternatives-C).
 */
export function buildCsp(mode: 'development' | 'production'): string {
  const isProd = mode === 'production';

  const scriptSrc = isProd
    ? CSP_SCRIPT_SRC_BASE
    : `${CSP_SCRIPT_SRC_BASE} ${CSP_DEV_SCRIPT_EXTRAS}`;

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
): ReadonlyArray<SecurityHeader> {
  const isProd = mode === 'production';

  const headers: SecurityHeader[] = [
    {
      key: 'Content-Security-Policy',
      value: buildCsp(mode),
    },
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
  ];

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
