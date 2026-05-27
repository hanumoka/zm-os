---
number: "0021"
title: LocalNoOpSync — 동기화 비활성 어댑터 (SyncProvider Local)
status: accepted
date: 2026-05-27
author: hanumoka
related: ["0017"]
---

# ADR-0021: LocalNoOpSync — 동기화 비활성 어댑터

## Context

ADR-0017 §D1.5가 정의한 `SyncProvider` 인터페이스의 Local 구현체. POC v1은 단일 사용자 + 단일 디바이스 가정으로 동기화 개념이 없으나, ADR-0017이 5 Port를 일관 인터페이스로 추상화하므로 SyncProvider Port의 Local 어댑터가 필요하다.

목적:
1. `apps/web` 호출 코드가 `ports.sync.status()` 등을 항상 호출 가능 (null 체크 불필요)
2. v2 Cloud Sync 어댑터(ADR-0026+) 진입 시 인터페이스 무변경
3. UI는 `status() === 'disabled'` 분기로 sync 관련 UI 비표시 (예: "동기화 상태" 인디케이터)

LocalNoOpSync는 모든 작업이 no-op이며, ADR-0017 §D1.5에서 명시한 **silent no-op**(Q8 결정) 원칙을 따른다 — `subscribe`는 콜백 한 번도 호출하지 않으며 즉시 unsubscribe 가능한 함수를 반환한다.

## Decision

### D1. 시그니처 (ADR-0017 §D1.5 정합)

```typescript
import type {
  SyncProvider,
  SyncEntity,
  SyncStatus,
  AdapterDescriptor,
  PortCallOptions,
} from '@zm/core/ports';

const DESCRIPTOR: AdapterDescriptor = {
  portName: 'sync',
  adapterName: 'local-noop',
  version: '1.0.0',
  capabilities: [],          // 'realtime-sync' 등 미보유
};

export function createLocalNoOpSync(): SyncProvider {
  /* 시그니처만 — 본문은 lib-developer */
}
```

생성자 대신 factory 함수 + 의존성 0 (테스트/주입 불필요).

### D2. 메서드별 동작

| 메서드 | 동작 |
|--------|------|
| `descriptor` | 상수 `DESCRIPTOR` 반환 |
| `status()` | `'disabled'` 고정 반환 |
| `pull(entityType, opts?)` | `Promise.resolve([])` (readonly empty array — `Object.freeze([])` 모듈 상수 재사용) |
| `push(entities, opts?)` | `Promise.resolve(undefined)` (entities 무시) |
| `subscribe(entityType, handler)` | 즉시 no-op unsubscribe 함수 반환 — handler 한 번도 호출하지 않음 |

### D3. silent no-op 정책 (ADR-0017 §D1.5 Q8 결정)

- push/pull 호출은 **콘솔 로그 없음** (개발 환경 포함)
- 호출자가 LocalNoOpSync를 인지하고 호출을 회피해야 한다는 가정은 **하지 않음** — 모든 호출 안전
- 디버깅 시: `status() === 'disabled'` 분기로 호출자가 조기 return하면 됨 (선택적 최적화)
- subscribe handler 호출 안 함 — 호출자는 unsubscribe만 정상 호출 가능

### D4. AbortSignal 처리

- ADR-0017 `PortCallOptions.signal` 인자는 받지만 실제로는 즉시 resolve되므로 signal 검사 불필요
- 단, 코드 일관성 위해 `signal.throwIfAborted()` 호출 1회 (즉시 abort된 signal 전달 시 명세 일관 처리)

### D5. Cloud Sync 교체 hook

- `SyncProvider` 인터페이스에 hook 추가 안 함 (인터페이스 무변경)
- 별도 utility `packages/adapters-local/src/sync/migration.ts`:
  - `exportAllLocalEntities(blobStorage, repo): Promise<ReadonlyArray<SyncEntity>>`
  - Cloud Sync 어댑터(ADR-0026+) 도입 시 first push에 전달
- LocalNoOpSync 자체는 데이터 보유 0 — 마이그레이션 데이터 소스는 BlobStorage + AppRepository

### D6. 어댑터 LOC 추정

- 본 어댑터 자체: ~30 LOC (factory 1 + 5 메서드 stub + descriptor 상수)
- Vitest 테스트: ~50 LOC (status 확인 + pull empty + subscribe immediate-unsubscribe + abort signal)

## Consequences

### Positive
- 호출자(예: 상태바 UI)가 `ports.sync.status()` 무조건 호출 가능 — null 체크 코드 제거
- v2 Cloud Sync 진입 비용 최소 — 어댑터 1건 교체, 인터페이스 변경 0
- silent no-op으로 개발 로그 노이즈 0
- 단위 테스트 단순 (DI 없음, side effect 없음)

### Negative
- 어댑터 자체 가치는 인터페이스 균일성 유일 (LOC 30 정도지만 ADR 1건 비용)
- 호출자가 `status() === 'disabled'` 분기 누락 시 무의미한 pull/push 호출 발생 — 성능 영향 미미하나 코드 가독성 저하 가능

### Neutral
- 번들 영향: 무시할 수준 (<1KB)
- subscribe handler 미호출은 RxJS/observable 패턴과 다르나, ADR-0017 §D1.5 명세 그대로

## Alternatives

### A1. SyncProvider Port를 optional로 (`ports.sync?: SyncProvider`)
- Pros: 어댑터 작성 불필요
- Cons: 호출자 모두 `?.` 체크 필요 → 5 Port 균일성 깨짐, ADR-0017 §D1 원칙 위배
- 거부 이유: 5 Port 균일 원칙 (ADR-0017)

### A2. pull/push에서 throw `PortError('sync', 'DISABLED', ...)`
- Pros: 호출 실수 즉시 감지
- Cons: 호출자가 항상 try/catch 또는 status 사전 체크 필요 → 사용성 저하
- 거부 이유: silent no-op 정책 (ADR-0017 §D1.5 Q8 결정)

### A3. subscribe가 즉시 'disabled' 이벤트 1회 호출 후 unsubscribe
- Pros: 호출자가 disabled 상태 명시 인지 가능
- Cons: `SyncEntity` 타입과 무관한 의사 이벤트 → 타입 안정성 깨짐, ADR-0017 §D1.5 시그니처 변경 필요
- 거부 이유: 인터페이스 명세 위배

## 사용자 결정 (2026-05-27 확정)

| Q | 결정 |
|---|------|
| Q1. subscribe handler 호출 정책 | ✅ 영원히 호출 안 함 (ADR-0017 Q8 silent 결정) |
| Q2. push/pull 호출 로그 정책 | ✅ silent (디버깅은 status() 분기로) |

## 마이그레이션 단계

1. `packages/adapters-local/src/sync/local-noop-sync.ts` 작성 (~30 LOC)
2. `apps/web/src/lib/ports/index.ts` Composition Root에 wiring
3. UI 상태바(있을 경우): `if (ports.sync.status() === 'disabled') return null` 분기
4. v2 Cloud Sync 진입 시: ADR-0026+ Cloud Sync 어댑터 작성 + 본 어댑터 deprecated 또는 옵션 유지 (Local-only 모드)
