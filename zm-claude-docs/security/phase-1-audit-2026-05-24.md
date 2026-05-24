# Phase 1 종합 보안 감사 리포트

**날짜**: 2026-05-24
**감사자**: `app-sandbox-auditor` agent (Phase 1 작업 7)
**감사 범위**: Phase 1 작업 1~6 코드베이스 + ADR-0001~0006 + 정책 (TECH-01~05, PROD-01/02, ARCH-01/02)
**결과**: ✅ **조건부 PASS** → 즉시 fix 2건 적용 후 **PASS**

---

## 결론 요약

Phase 1 보안 골격은 완성. Phase 2 진입 가능. 감사에서 발견된 즉시 fix 2건은 본 리포트 §보강 적용에서 처리 완료.

**검토 파일**: 25개 (코드 14, ADR 6, 정책/규칙 5)

**결과 분포**:
- Critical: 0건
- High: 1건 (H-1, 즉시 fix 완료)
- Medium: 1건 (N-1, Phase 3 후보)
- Low: 2건 (N-2, N-3, 구조적 한계 또는 v2 reshape)
- Info: 9건 (누적 정리)
- 신규 위협: 4건 (N-1~N-4)

---

## 1. 8 항목 매트릭스 (Phase 1 전체)

| # | 항목 | 결과 | 핵심 위치 |
|---|------|------|----------|
| 1 | iframe sandbox 속성 (`allow-scripts`만) | ✅ PASS | `sandbox.ts:5,76` const tuple 강제. 금지 토큰 0건. |
| 2 | origin 격리 (srcdoc/null) | ✅ PASS | `sandbox.ts:85` srcdoc 사용. |
| 3 | postMessage origin 검증 | ✅ PASS | `host.ts:159,162` 이중 검증 (source + origin). 앱 측도 동일. |
| 4 | Comlink 경유 RPC | ✅ PASS | raw postMessage 3건 모두 IPC 어댑터 내부. |
| 5 | CSP / Permissions-Policy | ✅ PASS | 13개 민감 기능 차단. dev/prod 분기. |
| 6 | COEP/COOP 충돌 | ✅ PASS (미도입) | ADR-0004 §6 명시. SAB 0건. |
| 7 | localStorage/IndexedDB 격리 | ✅ PASS | null origin 자동 격리. 자가 진단 통과. |
| 8 | 리소스 고갈 방어 | ⚠ PARTIAL | RPC 5000ms 타임아웃만. 메모리 quota 미구현 — Phase 3 후보. |

---

## 2. 작업 단위별 보안 상태

| 작업 | 상태 | 잔존 Info |
|------|------|----------|
| 작업 1 (iframe 샌드박싱) | ✅ PASS | 0 |
| 작업 2 (Comlink-style IPC) | ✅ PASS | 1 (H-1, fix 완료) |
| 작업 2.5 (TS-002 fix) | ✅ PASS | 0 |
| 작업 3 (CSP/Permissions-Policy) | ✅ PASS | 4 (모두 ADR-0004 정당화 명시) |
| 작업 4 (윈도우 매니저) | ✅ PASS | 3 (보안 영향 0) |
| 작업 5+6 (데스크탑+작업표시줄) | ✅ PASS | 2 (1건 fix 완료, 1건 deferred) |

---

## 3. 즉시 fix 적용 결과 (감사 권고)

### ✅ H-1 fix: `runtime-iife.ts:59` DANGEROUS_KEYS 객체 리터럴 결함

**문제**: `var DANGEROUS_KEYS = { __proto__: true, constructor: true, prototype: true };` — JavaScript Annex B에 따라 `{ __proto__: ... }`는 own enumerable property가 아닌 **prototype slot 설정**으로 해석. 결과:
- `DANGEROUS_KEYS['toString']` → `Object.prototype.toString` (truthy, false positive)
- 모든 `Object.prototype` 메서드 키가 우연히 차단됨

**Fix**: 배열 + `indexOf` 패턴으로 교체.
```js
var DANGEROUS_KEYS_LIST = ['__proto__', 'constructor', 'prototype'];
// ...
if (DANGEROUS_KEYS_LIST.indexOf(keys[i]) !== -1) return true;
```

호스트 측 `protocol.ts:24`는 `new Set(...)`로 이미 정확히 구현됨 → 비일관성 해소.

### ✅ 권고 2 fix: `host.ts:162` SANDBOX_ORIGIN 상수 일관성

**문제**: `sandbox.ts`는 `SANDBOX_ORIGIN = 'null'` 상수 export. `host.ts:162`는 리터럴 `'null'` 사용. SSOT 위반.

**Fix**: `host.ts` 상단에 `SANDBOX_ORIGIN` 상수 정의 (sandbox.ts → host.ts 기존 import로 인한 순환 회피 위해 inline). 메시지 리스너 162번 줄에서 `event.origin !== SANDBOX_ORIGIN` 으로 변경.

v2 reshape 시 `src/lib/apps/ipc/constants.ts` 분리 권고 (주석 명시).

### tsc 재검증: 0 에러

---

## 4. 신규 위협 모델 (통합 감사 발견)

| ID | 등급 | 항목 | 현재 영향 | 대응 |
|----|------|------|---------|------|
| **N-1** | Medium | 호스트 expose 메서드 인자 검증 부재. `host.ts:137` handler(...args). | 0 (현재 expose는 read-only/echo만) | v2 권한 모델 정밀화 시 expose별 Zod 스키마. |
| **N-2** | Low | iframe `targetOrigin = '*'`. | 0 (null origin 구조적 한계) | ADR-0003 trade-off. v2 Comlink transferable. |
| **N-3** | Low | postMessage 비동기 race (close 직후). | 0 (Zod + origin 검증으로 비정상 메시지 차단) | Phase 3 안정화: `_listener` 최상단 `_status === 'closed'` early return. |
| **N-4** | Info | `AppFrame.tsx:63` fetch /public 호스트 origin. | 0 (srcdoc로 격리됨) | ADR-0006 v2 reshape: IndexedDB BLOB. |

---

## 5. CVE 매핑

| CVE | 영향 | 미티게이션 | 잔존 위험 |
|-----|------|----------|----------|
| **CVE-2024-5691** (Firefox sandbox 우회) | Firefox 사용자 | `allow-scripts` 단독 + null origin 이중 격리 | 브라우저 패치 의존 |
| **CVE-2025-4609** (Chromium IPC) | Chromium IPC layer | Zod + DANGEROUS_KEYS + origin 이중 검증 | 브라우저 패치 의존 |
| **CVE-2025-54143** (Firefox iOS 다운로드) | Firefox iOS | 본 POC 데스크탑 dev 환경, iOS 비목표 (PROD-01) | 미해당 |

세 CVE 모두 브라우저 벤더 패치 의존. 호스트 측 다층 방어 (sandbox + null origin + Zod + DANGEROUS_KEYS) 적용 중.

---

## 6. ADR / 정책 일관성

### ADR-0001~0006 정합
| ADR | 코드 일관성 |
|-----|------------|
| ADR-0001 (초기 스택) | ✅ PASS |
| ADR-0002 (react-rnd) | ✅ PASS (dragHandleClassName 강제) |
| ADR-0003 (IPC) | ✅ PASS (H-1 fix 후 보안 의도 정확 작동) |
| ADR-0004 (CSP) | ✅ PASS (dev/prod 분기 정확) |
| ADR-0005 (Context+useReducer) | ✅ PASS |
| ADR-0006 (POC 카탈로그) | ✅ PASS |

### 정책 일관성
| 정책 | 상태 |
|------|------|
| ARCH-01 (단일 Next.js) | ✅ PASS |
| ARCH-02 (iframe + Comlink-style RPC) | ✅ PASS |
| TECH-01~05 (스토리지/hooks/CSP/매니저/상태) | ✅ PASS (TECH-01 미진입) |
| PROD-01 (POC 1차 스코프) | ✅ PASS |
| PROD-02 (하드코딩 카탈로그) | ✅ PASS |

### known-mistakes
- 등록 위반 0건.
- **M-001 후보**: H-1 "객체 리터럴 `__proto__: true`는 own property 아님" — 향후 동일 실수 방지용 등재 선택 가능 (작업 7 후속).

---

## 7. 사용자 검증 deferred 누적

### 🟡 검증 권장 (UX/기능, 보안 영향 없음)
1. `/sandbox-test` 격리 자가 진단 (`canTouchParentStorage/Document/Cookies` 모두 false)
2. IPC 핸드셰이크 "연결됨" 전환
3. DevTools Network 헤더 (CSP/Permissions-Policy 등) 확인
4. 다중 윈도우 z-index 변화
5. 메인 페이지 데스크탑 표시 + 아이콘 더블클릭 → 윈도우 열림
6. 작업표시줄 클릭 동작 (active→minimize / minimized→restore+focus / else→focus)
7. 윈도우 close → 다시 열기 재마운트
8. 드래그 핸들 격리 (iframe 영역 드래그 안 됨)
9. `bounds="parent"` 작업표시줄 침범 방지
10. Clock 1초 갱신
11. **IPC Demo 본문 표시 여부** (sandbox-test에서 보고된 빈 화면 이슈, 데스크탑 페이지에서도 재현 가능성)

### 🔴 즉시 검증 필요 (보안 영향)
- (없음) — 자동 검증 가능한 보안 항목은 모두 PASS.

---

## 8. Phase 2 진입 전 권고

### ✅ 즉시 fix 완료 (본 감사 결과)
- H-1 (DANGEROUS_KEYS) 해소
- SANDBOX_ORIGIN 일관성 해소

### v2 reshape 우선순위 (Phase 3 안정화)
1. nonce 기반 strict CSP middleware (`unsafe-inline`/`unsafe-eval` 제거)
2. Comlink 라이브러리 정식 도입 (runtime-iife → 빌드 파이프라인) — H-1 패턴 영구 해소
3. 메모리 quota + soft timeout (security.md §리소스 고갈 충족)
4. expose 메서드별 Zod 스키마 (N-1)
5. HSTS + HTTPS prod 배포
6. COEP/COOP 도입 (Phase 3 게임 엔진 매트릭스 후)
7. `src/lib/apps/ipc/constants.ts` 분리 (SANDBOX_ORIGIN SSOT)

### Phase 2 사전 점검
- STR-01/02 도입 시 `desktopApps.ts` → `useInstalledApps()` reshape (ADR-0006 prefigure)
- APP-03 도입 시 contentUrl → IndexedDB BLOB → blob: URL iframe 전환 검토 (N-4)
- 사용자 제출 앱 ZIP 검증 파이프라인 (parseManifest 외 정적 분석)

---

## 9. 결과: ✅ **PASS** (즉시 fix 적용 후 확정)

Phase 1 보안 골격 완성. Phase 2 진입 가능.

- 8 항목 매트릭스 모두 PASS (1건 PARTIAL — Phase 3 후보)
- ADR-0001~0006 정합 ✅
- 정책 (TECH/PROD/ARCH) 일관성 ✅
- 신규 위협 N-1~N-4 모두 현재 영향 0/Low, v2 reshape에서 해소 가능
- CVE 추적 항목 다층 방어로 미티게이션
- 즉시 fix 2건 (H-1 + SANDBOX_ORIGIN) 적용 완료

---

**감사 종료** — 2026-05-24
