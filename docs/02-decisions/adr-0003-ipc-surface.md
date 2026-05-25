---
number: "0003"
title: 호스트-앱 IPC 어댑터 표면 — wire-compatible RPC + 화이트리스트 권한 (v1)
status: accepted
date: 2026-05-24
author: hanumoka
related: ["0001"]
---

## Context

ARCH-02(policy-registry.md)는 "호스트-앱 통신은 Comlink 기반 RPC"로 결정되어 있다.
그러나 POC 단계에서 srcdoc inline 요구사항이 추가됨에 따라 Comlink v4 라이브러리를
직접 사용하려면 esbuild 등 별도 빌드 파이프라인이 필요하다.
이는 작업 단위(work-units.md 기준 0.5~1일)를 초과할 수 있어, POC에 적합한 대안 검토가 필요했다.

### 핵심 제약

1. **srcdoc inline 주입**: iframe은 `srcdoc` 속성으로 HTML을 인라인 주입한다.
   앱 측 IPC 런타임은 Next.js 번들 외부에서 실행되어야 하므로,
   별도 JS 문자열로 srcdoc에 `<script>` 태그 삽입이 필요하다.
2. **Comlink v4.4.2 origin 검증 미지원**: Comlink는 origin 검증을 내장하지 않는다
   (Issue #603 미해결). 래퍼에서 강제 구현 필요.
3. **null origin iframe**: `sandbox="allow-scripts"` + srcdoc 환경에서
   iframe origin은 `"null"` (문자열)이 됨. `postMessage` 전송 시 `targetOrigin = '*'` 필수.

## Decision

### A vs B spike 결과

| 기준 | A: 자체 RPC (wire-compatible) | B: Comlink 라이브러리 |
|------|-----------------------------|----------------------|
| 빌드 단계 | 불필요 (string 상수) | esbuild/rollup 필요 |
| 작업 단위 | ~150-200 LOC, POC 1일 내 | 빌드 파이프라인 추가로 2일+ |
| Comlink 호환성 | wire-compatible 설계, v2에서 마이그레이션 가능 | 직접 부합 |
| Origin 검증 | 직접 구현 (강제) | 래퍼 구현 필요 (동일 공수) |
| 향후 확장 | v2에서 Comlink 도입 시 인터페이스 유지 가능 | v2 직접 사용 |

**결정: A (자체 RPC, Comlink wire-compatible POC 어댑터)**

ARCH-02를 다음과 같이 정밀화한다:
> "Comlink-style RPC — POC v1은 자체 어댑터 (~150 LOC, srcdoc inline 호환),
> v2 reshape 시 Comlink 라이브러리 도입 검토"

### 모듈 구조

```
src/lib/apps/ipc/
  types.ts          — IpcStatus, IpcErrorCode, IpcError class, HostEndpoint, AppClient 인터페이스
  protocol.ts       — INIT/READY/CALL/RESULT/ERROR 메시지 포맷 + Zod 스키마 + 프로토콜 버전 상수
  host.ts           — createHostEndpoint(options): HostEndpoint
  app.ts            — connectToHost(options): AppClient (TypeScript 직접 사용 경로)
  runtime-iife.ts   — 앱 측 런타임 IIFE JS 문자열 (srcdoc inject용) + injectIpcRuntime()
  index.ts          — 호스트 측 barrel (types + host만 export)
src/lib/apps/
  sandbox.ts        — ipc?: SandboxIpcOptions 옵션 추가, srcdoc 앞 runtime-iife 주입
```

### 핸드셰이크 프로토콜

```
앱(iframe) ──INIT { v, methods: string[] }──────────────► 호스트
호스트      ──READY { v, hostOrigin, grantedMethods }───► 앱
이후: 양방향 CALL { v, callId, method, args } / RESULT { v, callId, result } / ERROR { v, callId, code, message }
```

### 권한 모델 v1

- `allowedMethods: ReadonlyArray<string>` 화이트리스트
- 앱이 INIT으로 announce한 메서드 목록과 교집합을 계산 → `grantedMethods`
- manifest.permissions 매핑은 v2에서 도입

### 보안 강제

- 호스트 메시지 리스너: `event.source === iframe.contentWindow` + `event.origin === 'null'` 이중 검증
- 앱 런타임 리스너: `event.source === window.parent` + READY 수신 후 `hostOrigin` 저장 및 비교
- Zod 스키마 검증 + prototype pollution 방어 (`__proto__`, `constructor`, `prototype` 키 거부)
- raw `postMessage` 호출은 ipc 어댑터 내부에만 캡슐화

### SandboxOptions 하위 호환

- 기존 `onMessage` 콜백은 JSDoc `@deprecated` 표시 후 유지 (레거시 sample-game/sandbox-test 동작 보존)
- `ipc` 옵션 지정 시 srcdoc에 런타임 자동 주입 + `SandboxHandle.ipc?: HostEndpoint` 노출

## Consequences

### 긍정

- POC 1일 내 구현 완료 (빌드 파이프라인 불필요)
- 인터페이스(`createHostEndpoint` / `connectToHost`)는 Comlink-compatible하게 설계되어
  v2에서 실제 Comlink로 교체 시 소비처(sandbox.ts) 코드 변경 최소화
- origin 검증, Zod 스키마 방어가 강제되어 Comlink 직접 사용보다 보안 강화

### 부정/트레이드오프

- Comlink의 Proxy 기반 자동 타입 추론, Transferable 지원 등 고급 기능 미사용
- 런타임 IIFE 문자열은 TypeScript 타입 검사 범위 밖 (JS plain string)
- v2에서 Comlink 도입 시 IIFE 문자열 → 빌드 파이프라인 전환 필요

## Alternatives

### B: Comlink 라이브러리 직접 사용

ARCH-02 원안에 직접 부합하나, srcdoc inline을 위한 IIFE 번들이 필요.
esbuild `npm run prebuild` 단계 추가 or Next.js custom webpack config 필요.
→ 작업 단위 초과 + 빌드 복잡성 증가로 POC 단계에서는 기각.

### C: 기존 onMessage 확장 (raw postMessage)

단순하지만 권한 모델, 핸드셰이크, 타임아웃, Zod 검증 등 보안 요소를 직접 구현해야 함.
→ 결국 A와 동일한 구현량이 되어 차별점 없음. 기각.

---

_ADR-0001 및 policy-registry.md의 ARCH-02 항목은 doc-updater 단계에서 이 ADR을 참조해 갱신 예정._
