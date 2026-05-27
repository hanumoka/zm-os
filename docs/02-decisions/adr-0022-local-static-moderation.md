---
number: "0022"
title: LocalStaticModeration — HTML 정적 분석 어댑터 (ModerationProvider Local)
status: accepted
date: 2026-05-27
author: hanumoka
related: ["0017", "0011"]
---

# ADR-0022: LocalStaticModeration — HTML 정적 분석 어댑터

## Context

ADR-0017 §D1.6가 정의한 `ModerationProvider` 인터페이스의 Local 구현체. POC v1 zip-loader는 9개 validator로 **ZIP 구조 검증만**(magic byte, path traversal, ZIP bomb, 크기, schema) 수행하며, **HTML 코드 내용 정적 검증은 없다**(`apps/web/src/lib/apps/zip-loader.ts:60-133` 확인).

LocalStaticModeration의 책임:
1. AppManifest + HTML 콘텐츠를 받아 위험 패턴 검출 → `allowed`/`flagged`/`blocked` verdict 반환
2. iframe `sandbox="allow-scripts"` + blob: URL null origin 정책(보안 규칙 §1)을 우회 시도하는 패턴 차단
3. Cloud Moderation 어댑터(ADR-0029+) 도입 시 인터페이스 무변경 + fail-closed 정책 일관

검출 대상은 **호스트 환경/사용자 데이터 침입을 시도하는 패턴**이며, 게임 정상 동작 패턴(`fetch`, `localStorage`, `addEventListener`)은 차단하지 않는다 — iframe sandbox + null origin이 이미 격리하므로 본 어댑터는 **2차 방어선**(defense-in-depth)이다.

## Decision

### D1. 시그니처 (ADR-0017 §D1.6 정합)

```typescript
import type {
  ModerationProvider,
  ModerationVerdict,
  ModerationInput,
  AdapterDescriptor,
  PortCallOptions,
} from '@zm/core/ports';
import type { DetectionPattern } from './patterns';

const DESCRIPTOR: AdapterDescriptor = {
  portName: 'moderation',
  adapterName: 'local-static',
  version: '1.0.0',
  capabilities: ['static-pattern-match'],
};

export type LocalStaticModerationDeps = {
  readonly patterns?: ReadonlyArray<DetectionPattern>;   // 기본 DEFAULT_PATTERNS
};

export function createLocalStaticModeration(
  deps?: LocalStaticModerationDeps,
): ModerationProvider {
  /* 시그니처만 — 본문은 lib-developer */
}
```

### D2. 검출 패턴 카탈로그 (`packages/adapters-local/src/moderation/patterns.ts`)

```typescript
export type Severity = 'flagged' | 'blocked';

export type DetectionPattern = {
  readonly id: string;                  // 'eval-call' | 'new-function' | ...
  readonly description: string;
  readonly severity: Severity;
  readonly regex: RegExp;
};

export const DEFAULT_PATTERNS: ReadonlyArray<DetectionPattern> = [
  /* 시그니처만 — 본문 D3 참조 */
];
```

### D3. 초기 패턴 (POC v1)

| ID | severity | 정규식 (의도) | 차단 이유 |
|----|----------|---------------|-----------|
| `eval-call` | `blocked` | `\beval\s*\(` | 임의 코드 실행 (iframe sandbox에서도 호스트 통신 시도 가능) |
| `new-function` | `blocked` | `\bnew\s+Function\s*\(` | eval 우회 |
| `script-src-http` | `flagged` | `<script[^>]*\bsrc\s*=\s*["']https?:` | 외부 스크립트 로드 (CSP가 1차 방어, but flagging으로 사용자 인지) |
| `iframe-srcdoc` | `flagged` | `<iframe[^>]*\bsrcdoc\s*=` | 중첩 iframe (의도된 패턴일 수 있어 flagged) |
| `postmessage-wildcard` | `blocked` | `postMessage\s*\([^,]+,\s*["']\*["']` | targetOrigin `'*'` 사용 — security.md §2 위반 |
| `data-url-script` | `flagged` | `data:(text/html\|application/javascript)` | data URL 스크립트 inject |
| `import-dynamic` | `flagged` | `\bimport\s*\(` | 동적 import (외부 모듈 로드 가능) |

- 정규식 false-positive 우려가 있으므로 severity 단계화: `flagged`는 사용자 확인 후 설치 진행 가능, `blocked`는 강제 차단
- 추후 ADR 없이 `patterns.ts` 1행 추가로 패턴 확장 (OCP)

### D4. 정규식 vs AST 트레이드오프 — 정규식 채택

| 항목 | 정규식 | AST (esprima/acorn) |
|------|--------|---------------------|
| 번들 | 0KB | esprima 110KB / acorn 90KB |
| 정확도 | false-positive 가능 (예: 문자열 `"eval("` 내 매칭) | 정확 (실제 호출만) |
| 성능 | O(n) regex scan, 5MB HTML에 <50ms | AST 빌드 200~500ms 추정 |
| 우회 난이도 | `eval` 분할 (`window["eva"+"l"]`)로 쉽게 우회 | 동일 (런타임 동적 검출 불가) |
| 유지보수 | 패턴 1행 추가 | AST visitor 작성 필요 |

**결론**: 정규식 채택. 본 어댑터는 2차 방어선이며, 1차 방어선(iframe sandbox + null origin + CSP)이 이미 격리. 우회 가능한 패턴도 cloud Moderation 도입 시 더 강력한 분석으로 대체 가능 (ADR-0029+, 예: 외부 AV API). false-positive는 `flagged` severity로 완화.

### D5. fail policy — fail-closed (ADR-0017 Q5 결정)

- Local 어댑터는 동기 동작이므로 timeout 무관 — 항상 즉시 verdict 반환
- 단, 예외 발생 시(예: 정규식 catastrophic backtracking으로 인한 OOM 시도) → `PortError` 대신 `blocked` verdict 반환 (fail-closed)
- 정규식은 `RegExp` 작성 시 backtracking 방지 (linear-time pattern only — 위 D3 패턴 모두 충족)

### D6. capability 검증 (ADR-0017 §D6, R3 리스크)

- POC v1 capabilities semantics 미정 — 본 ADR은 manifest.capabilities는 검사하지 않음
- 향후 capabilities 정책 정의 시 (별도 ADR), `patterns.ts`에 `capabilityRule` 추가하여 `'gamepad'` capability 요청 시 `<input type="...">` 사용 의무 등 검사
- 본 ADR 범위: HTML 정적 패턴 매칭만

### D7. 모듈 위치 (ADR-0017 §D3)

```
packages/adapters-local/src/moderation/
├── local-static-moderation.ts    # createLocalStaticModeration factory
├── patterns.ts                    # DEFAULT_PATTERNS + DetectionPattern 타입
└── index.ts                       # barrel export
```

### D8. zip-loader와 관계

- zip-loader 9 validator는 **ZIP 구조 검증** 그대로 유지 (변경 없음)
- 본 어댑터는 **install action**에서 호출 (UserAppsProvider.install) — zip-loader 성공 후 ModerationProvider.scan(manifest, htmlContent) 호출
- `blocked` verdict → 설치 거부 + reasons UI 표시
- `flagged` verdict → 확인 다이얼로그 + 사용자 동의 후 설치 진행 (ADR-0011 ConfirmDialog 재사용)
- `allowed` → 그대로 설치

## Consequences

### Positive
- 2차 방어선 추가 — sandbox/CSP 우회 패턴 정적 차단 (defense-in-depth)
- 정규식 채택으로 번들 영향 0KB
- 패턴 카탈로그 외부화 — 신규 패턴 추가 시 ADR 없이 `patterns.ts` 1행 (OCP)
- Cloud Moderation(ADR-0029+) 진입 시 어댑터 1건 교체 + 인터페이스 무변경
- fail-closed 정책 일관 (Cloud 어댑터와 동일 시멘틱)

### Negative
- 정규식 false-positive 가능 — `flagged` severity로 완화하나 UX 마찰 증가 가능
- 우회 가능 (예: `eval` 분할) — 본 어댑터는 careless authoring 차단 수준
- HTML 외 JS 분리 파일(`<script src="game.js">`)은 본 어댑터에서 미검사 — POC v1 게임은 inline script 가정 (ADR-0011 manifest v2 entryPoint는 HTML 단일)
- 패턴 카탈로그 유지 비용 — 새 우회 기법 발견 시 patterns.ts 갱신 필요 (security.md 참조 권고)

### Neutral
- 어댑터 LOC: ~80 LOC (factory + scan + 패턴 매칭 loop)
- patterns.ts: ~50 LOC (7 패턴 초기, 확장 가능)
- Vitest 테스트: 패턴별 positive/negative 케이스 ~30개 (~150 LOC)

## Alternatives

### A1. AST 파싱 (esprima/acorn) 채택
- Pros: false-positive 최소
- Cons: 번들 +90~110KB, 우회 난이도 동일 (동적 호출 검출 불가). POC 빠른 검증 우선 (CLAUDE.md §6)
- 거부 이유: 번들 영향 대비 이득 낮음

### A2. Moderation 미도입 — sandbox/CSP만 신뢰
- Pros: 어댑터 작성 불필요
- Cons: ADR-0017 §D1.6 ModerationProvider Port 의무 위배, 2차 방어선 부재
- 거부 이유: 5 Port 균일 원칙 위배

### A3. 외부 Cloud API 즉시 도입 (예: VirusTotal)
- Pros: 정확도 최고
- Cons: 로컬-우선 원칙 위배 (외부 의존성 0), POC 범위 밖
- 거부 이유: 로컬-우선 (2026-05-26 결정)

## 사용자 결정 (2026-05-27 확정)

| Q | 결정 |
|---|------|
| Q1. eval-call/new-function severity | ✅ `blocked` — sandbox 우회 시도 강력 차단 |
| Q2. script-src-http severity | ✅ `flagged` — 사용자 인지 + 실제 차단은 런타임 CSP |
| Q3. 패턴 확장 거버넌스 | ✅ `patterns.ts` 직접 PR (코드 리뷰 + Vitest 매트릭스로 충분) |
| Q4. flagged verdict UI | ✅ ConfirmDialog 재사용 (ADR-0011 기존 UI) |

## 마이그레이션 단계

1. `packages/adapters-local/src/moderation/patterns.ts` 작성 (DEFAULT_PATTERNS 7건)
2. `packages/adapters-local/src/moderation/local-static-moderation.ts` 작성 (createLocalStaticModeration factory)
3. `apps/web/src/lib/ports/index.ts` Composition Root에 wiring
4. `UserAppsProvider.install` 또는 `useInstallUserApp` 훅에서 zip-loader 성공 후 `ports.moderation.scan` 호출 분기
5. `flagged` verdict 시 ConfirmDialog 표시 (ADR-0011 재사용)
6. Vitest: 패턴별 positive/negative 케이스 30개 (catastrophic backtracking 회귀 방지 포함)
7. v2 Cloud Moderation 진입 시: ADR-0029+ Cloud 어댑터 작성, 본 어댑터 옵션 유지 (Local-only 모드 지원)
