---
number: "0004"
title: 호스트 origin CSP / Permissions-Policy 정책 — POC 1차 정적 헤더 모델
status: accepted
date: 2026-05-24
author: hanumoka
related: ["0001", "0003"]
---

# ADR-0004: 호스트 origin CSP / Permissions-Policy 정책 — POC 1차 정적 헤더 모델

## Context

### 보안 명세 요구사항

`.claude/rules/security.md`는 다음을 명시한다:

- `next.config.ts`의 `headers()`에서 Content-Security-Policy / Permissions-Policy 헤더를 정의할 것
- CSP: 인라인 스크립트 금지, `script-src 'self'` 기본, 게임 iframe은 blob: 허용
- Permissions-Policy: 카메라/마이크/지오로케이션/USB 등 차단
- COEP/COOP는 게임 엔진 호환성 검증 후 신중히 도입

### ADR-0001 §2 샌드박싱 모델과의 연관

ADR-0001 §2(샌드박싱 결정)는 "blob: URL iframe + `sandbox="allow-scripts"`"를 채택했다.
사용자 앱 iframe의 origin은 `"null"` (문자열)이 되어 host origin과 완전 분리된다.
따라서 CSP는 **호스트 페이지** 보호 정책이고, 사용자 앱은 iframe sandbox 속성으로 별도 격리된다.

- **Host origin CSP**: `next.config.ts headers()` → 모든 호스트 응답에 적용
- **Sandbox iframe CSP**: `sandbox="allow-scripts"` (allow-same-origin 금지) → iframe 자체 격리

두 계층을 혼동하지 않는 것이 핵심이다.

### POC 1차 스코프

POC 단계(로컬 dev 서버, `npm run dev`)에서는:
- nonce 기반 strict CSP는 Next.js middleware 없이 구현 불가 (빌드 시점 정적 설정의 한계)
- COEP/COOP는 SharedArrayBuffer를 활성화하지만 sandbox iframe + 게임 엔진 호환성 미검증
- 정적 헤더 모델이 작업 단위 내에서 구현 가능하고 즉각적인 보안 강화 효과를 제공

## Decision

### 1. 단일 파일 변경 + 모듈 분리

- `next.config.ts`에 `headers()` async 함수 추가
- CSP/Permissions-Policy 로직은 분량 임계를 감안해 `src/lib/security/csp.ts`로 분리
  - `next.config.ts`에서만 import (server-side build config 전용)
  - `'use client'` 미사용, env 의존 없음 (순수 문자열 빌더)

### 2. 정적 헤더 모델 채택

nonce 기반 strict CSP 대신 정적 문자열 기반 CSP를 채택한다.
이유: nonce는 요청마다 새 값을 생성해야 하므로 Next.js middleware 없이는 구현 불가.
POC 단계에서 middleware 도입은 작업 단위를 초과한다.

### 3. dev / prod 분기

`process.env.NODE_ENV` 기반으로 `mode: 'development' | 'production'`을 결정하고
`securityHeaders(mode)`에 전달한다.

- **dev**: `unsafe-eval` + `unsafe-inline` 허용 (HMR / Fast Refresh / 로컬 WebSocket 필요)
- **prod**: `unsafe-eval` / `unsafe-inline` 제거, `frame-ancestors 'none'`, `X-Frame-Options: DENY`

### 4. CSP 정책 상세

| 지시어 | dev | prod |
|--------|-----|------|
| `default-src` | `'self'` | `'self'` |
| `script-src` | `'self' 'unsafe-eval' 'unsafe-inline'` | `'self'` |
| `style-src` | `'self' 'unsafe-inline'` | `'self' 'unsafe-inline'` |
| `img-src` | `'self' data: blob:` | `'self' data: blob:` |
| `font-src` | `'self' data:` | `'self' data:` |
| `connect-src` | `'self' ws: http://localhost:* http://127.0.0.1:*` | `'self'` |
| `frame-src` | `'self' blob:` | `'self' blob:` |
| `worker-src` | `'self' blob:` | `'self' blob:` |
| `object-src` | `'none'` | `'none'` |
| `base-uri` | `'self'` | `'self'` |
| `form-action` | `'self'` | `'self'` |
| `frame-ancestors` | `'self'` | `'none'` |
| `manifest-src` | `'self'` | `'self'` |

`frame-src blob:`은 sandbox iframe(srcdoc → blob: origin) 실행을 허용하기 위해 필요.

### 5. Permissions-Policy 상세

dev/prod 공통 적용.

**완전 차단**: `camera=()`, `microphone=()`, `geolocation=()`, `payment=()`, `usb=()`,
`bluetooth=()`, `serial=()`, `accelerometer=()`, `gyroscope=()`, `magnetometer=()`,
`display-capture=()`, `screen-wake-lock=()`, `xr-spatial-tracking=()`

**호스트 self만 허용**: `fullscreen=(self)`, `picture-in-picture=(self)`

사용자 앱(sandbox iframe)은 sandbox 속성 + CSP frame-src 이중 격리로
Permissions-Policy와 무관하게 위 기능 접근 불가.

### 6. COEP / COOP 미도입

ADR-0001 §2의 blob: iframe sandbox 모델과 COEP(`require-corp`) 간 호환성 미검증.
`Cross-Origin-Embedder-Policy: require-corp` 강제 시 sandbox iframe이 외부 리소스(CDN 등)를
로드하려면 CORP 헤더가 필요하다. 게임 엔진 자산 로딩에 영향을 줄 수 있어
POC 1차에서는 미도입. v2에서 게임 엔진 매트릭스 검증 후 도입 여부 결정.

### 7. 기타 헤더

- `Referrer-Policy: no-referrer` — `sandbox.ts`의 `iframe.referrerPolicy = 'no-referrer'`와 정합
- `X-Content-Type-Options: nosniff` — MIME 스니핑 방어
- `X-Frame-Options: DENY` — prod only, `frame-ancestors 'none'` CSP 폴백 (구형 브라우저 대응)
- HSTS 미도입 — POC는 `http://localhost` 환경, HTTPS 미사용

## Consequences

### 긍정

- 즉각적인 보안 강화: 클릭재킹, base hijacking, object/embed 인젝션, MIME 스니핑 방어
- 단일 파일(`src/lib/security/csp.ts`) 집중 관리 — 정책 변경 시 한 곳만 수정
- dev HMR/FastRefresh 동작 보장 (`unsafe-eval`, `unsafe-inline`, WebSocket connect-src)
- `Referrer-Policy: no-referrer`가 sandbox.ts iframe 정책과 일관성 유지
- 순수 문자열 빌더 — 테스트 용이 (import 후 결과 문자열 검증만으로 단위 테스트 가능)

### 부정 / 트레이드오프

- 정적 CSP 모델: 인라인 스크립트를 script 태그에 넣는 경우 prod에서 차단됨
  - Next.js App Router는 기본적으로 inline script 최소화하므로 실제 영향 낮음
  - 제3자 위젯 등 외부 inline script 도입 시 nonce 또는 hash 추가 필요
- COEP/COOP 미도입: SharedArrayBuffer 미지원 → 일부 WASM 게임 엔진 제약 가능
- `unsafe-inline` style-src: Tailwind CSS v4 빌드 아티팩트 호환을 위해 유지
  - 순수 CSS-in-JS 없이 static 빌드 기준이므로 XSS 위험은 제한적

## Alternatives

### B: COEP / COOP 도입

`Cross-Origin-Embedder-Policy: require-corp` + `Cross-Origin-Opener-Policy: same-origin`을 추가하면
SharedArrayBuffer가 활성화되어 Emscripten/WASM 기반 게임 엔진의 멀티스레드 기능을 사용할 수 있다.

**미채택 사유**: sandbox iframe과 게임 엔진 외부 CDN 자산 로딩 간 호환성 미검증.
`require-corp` 적용 시 CORP 헤더 없는 CDN 리소스 로딩이 차단됨.
Phase 3 게임 엔진 매트릭스 검증 후 도입 재검토.

### C: nonce 기반 strict CSP (middleware 방식)

Next.js middleware(`src/middleware.ts`)에서 요청마다 crypto nonce를 생성하고
CSP 헤더와 `<script nonce="">` 태그에 주입하면 `unsafe-inline` 제거 가능.

**미채택 사유**: POC 1차에서 middleware 도입은 작업 단위를 초과.
v2 보안 강화 단계에서 middleware 도입 시 함께 적용 권장.
`src/lib/security/csp.ts`의 `buildCsp()` 함수를 확장해 nonce 파라미터를 추가하는 방식으로
API 호환성을 유지한 채 점진적 마이그레이션 가능.

### D: `src/lib/security/` 미분리 — `next.config.ts` 인라인

빌더 함수를 `next.config.ts`에 직접 인라인하는 방식.

**미채택 사유**: `next.config.ts`가 수백 줄로 비대해지고,
CSP/Permissions-Policy 상수가 혼재해 유지보수 어려움.
테스트 격리도 불가. 파일 분리가 가독성과 단위 테스트 면에서 우세.
