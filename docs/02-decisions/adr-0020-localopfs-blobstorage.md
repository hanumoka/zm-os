---
number: "0020"
title: LocalOPFS BlobStorage — BlobStorage Local 어댑터 (IDB/OPFS/Memory + AbortSignal)
status: accepted
date: 2026-05-27
author: hanumoka
related: ["0009", "0017", "0019", "0023"]
---

# ADR-0020: LocalOPFS BlobStorage — BlobStorage Local 어댑터

## Context

ADR-0017 §D1.4에서 `BlobStorage` Port는 기존 `StorageAdapter` 인터페이스를 흡수하되 `PortCallOptions { signal?: AbortSignal }`을 추가하는 것으로 확정되었다. ADR-0009 (Strategy 패턴, IDB/OPFS/Memory 3 어댑터)는 이 Port의 Local 구현체로 재배치된다.

현재 `packages/storage`는 7 파일로 구성된다.
- `storage-adapter.ts`: `StorageAdapter` interface + `StorageError` class
- `indexeddb.ts`: idb v8.0.3 기반 raw CRUD (`idbGet/idbPut/idbDelete/idbList/idbClear`) + DB lifecycle + memory fallback (`_memoryStore`)
- `idb-adapter.ts`: indexeddb.ts wrap한 StorageAdapter 구현 (~80 LOC)
- `opfs-adapter.ts`: navigator.storage.getDirectory + JSON 직렬화 어댑터 (~150 LOC, for-await loop in `list()`)
- `memory-adapter.ts`: Map 기반 어댑터 (~50 LOC)
- `resolve-adapter.ts`: 환경 감지 + namespace 정책 기반 lazy singleton (~60 LOC)
- `index.ts`: barrel export

이 ADR은 (1) `packages/storage` → `packages/adapters-local/src/blob-storage/`로 이동, (2) `AbortSignal` 추가, (3) `StorageError` → `PortError('blob-storage', ...)` 마이그레이션, (4) `@zm/storage` deprecation shell 유지를 정의한다.

## Decision

### D1. 패키지 이동 + 파일 구조

```
packages/adapters-local/src/blob-storage/
├── index.ts                # createLocalBlobStorage() 팩토리 + re-export
├── idb-adapter.ts          # 기존 코드 이동 + AbortSignal 추가
├── opfs-adapter.ts         # 기존 코드 이동 + AbortSignal 추가 + for-await 폴링
├── memory-adapter.ts       # 기존 코드 이동
├── indexeddb.ts            # 저수준 CRUD (idb wrap) — 그대로 이동
└── resolve.ts              # 기존 resolve-adapter.ts 이동 + 명칭 단축
```

`createLocalBlobStorage(opts?: { policy?: 'auto' | 'idb-only' | 'opfs-only' | 'memory'; namespace?: string })` 단일 팩토리로 통합. 기존 3개 factory(`createIDBAdapter` 등)는 internal export로 격하 (호출자는 createLocalBlobStorage만 사용).

### D2. AbortSignal 통합 — 5 메서드 모두 진입 시 throwIfAborted

```typescript
export function createLocalIDBBlobStorage(): BlobStorage {
  return {
    descriptor: { portName: 'blob-storage', adapterName: 'local-idb', version: '1.0.0', capabilities: ['namespace-list'] },
    async get<T>(ns, key, opts) {
      opts?.signal?.throwIfAborted();
      const value = await idbGet<T>(resolveStoreName(ns), key);
      return value;
    },
    // ...
  };
}
```

IDB/Memory 어댑터는 메서드별 단순 진입 polling으로 충분 (idb 자체는 AbortSignal 미지원, 작업 단위가 단일 트랜잭션이라 mid-operation cancel 무의미).

### D3. OPFS for-await loop AbortSignal 폴링 — 매 entry

OPFS `list()`의 `for await (const [name, handle] of dir.entries())` loop은 디렉토리에 100+ 파일 있을 때 cancel 필요. **매 entry마다 `signal?.throwIfAborted()` 호출**.

근거: 매 100 entries는 사용자 인지 가능한 cancel 지연 (~100ms × entry 처리), 시간 기반(setTimeout)은 React 18 batching과 무관하게 의미 없음. 매 entry는 throwIfAborted 호출 비용 < 1μs.

```typescript
async list<T>(ns, opts) {
  opts?.signal?.throwIfAborted();
  // ...
  for await (const [name, handle] of (dir as DirWithEntries).entries()) {
    opts?.signal?.throwIfAborted();  // 매 entry 폴링
    if (handle.kind !== 'file' || !name.endsWith('.json')) continue;
    // ...
  }
}
```

### D4. PortError 마이그레이션 — alias 보존

`StorageError`는 즉시 제거하지 않고 alias로 유지하여 1 v2 minor deprecation period 보존.

```typescript
// packages/adapters-local/src/blob-storage/errors.ts
export class BlobStorageError extends PortError {
  constructor(message: string, code: string, cause?: unknown) {
    super(message, 'blob-storage', code, cause);
    this.name = 'BlobStorageError';
  }
}

// packages/storage/src/index.ts (deprecation shell)
import { BlobStorageError } from '@zm/adapters-local/blob-storage';
/** @deprecated use BlobStorageError or PortError */
export const StorageError = BlobStorageError;
```

각 어댑터의 `throw new StorageError(...)`는 `throw new BlobStorageError(message, code, cause)`로 교체. `code` enum: `'GET_FAILED' | 'PUT_FAILED' | 'DELETE_FAILED' | 'LIST_FAILED' | 'CLEAR_FAILED' | 'UNKNOWN_NAMESPACE' | 'NOT_AVAILABLE' | 'ABORTED'`.

`AbortError`는 별도 처리: `signal.throwIfAborted()`가 throw하는 `DOMException` (name='AbortError')은 그대로 전파 — 호출자(usePersistence)가 `instanceof DOMException && err.name === 'AbortError'`로 silent ignore.

### D5. @zm/storage deprecation shell — re-export 전용

```typescript
// packages/storage/src/index.ts (deprecation shell, v2.0 ~ v2.1 cleanup)
export {
  type BlobStorage as StorageAdapter,
  type BlobStorage,
  createLocalBlobStorage,
  isIDBAvailable,
  isOPFSAvailable,
  resolveAdapterFor,  // 호환 함수: createLocalBlobStorage({ namespace }) wrap
} from '@zm/adapters-local/blob-storage';

export {
  STORE_INSTALLED_APPS,
  STORE_USER_APPS,
  STORE_DESKTOP_LAYOUT,
  STORE_DESKTOP_SETTINGS,
} from '@zm/core'; // 이미 namespace-registry에 NS_*로 존재 — alias

/** @deprecated use BlobStorage */
export type { BlobStorage as StorageAdapter };

/** @deprecated use createLocalBlobStorage().get/.put/.delete */
export {
  idbGet, idbPut, idbDelete, idbList, idbClear,
} from '@zm/adapters-local/blob-storage';
```

deprecation period: v2.0 release ~ v2.1. v2.1 release PR에서 `packages/storage` 디렉토리 자체 삭제 + 모든 import를 `@zm/adapters-local/blob-storage`로 교체.

### D6. Memory 어댑터 — runtime 포함 + 테스트 전용 export 분리

`createLocalMemoryBlobStorage()`는 runtime resolver에 포함 (Safari Private Browsing 폴백). 추가로 `@zm/adapters-local/blob-storage/testing` subpath export로 `createTestBlobStorage()` 제공 — Vitest에서 `usePorts({ blob: createTestBlobStorage() })` 주입 가능.

`package.json`:
```json
{
  "exports": {
    "./blob-storage": "./src/blob-storage/index.ts",
    "./blob-storage/testing": "./src/blob-storage/testing.ts"
  }
}
```

### D7. OPFS Worker 분리 보류 (POC main thread 유지)

`SyncAccessHandle` Worker 분리는 ADR-0020에서는 미적용. 현재 OPFS 어댑터는 main thread `createWritable` 기반이며, 작은 record(<10KB) 위주의 desktop-layout/settings/installed-marks는 main thread 충분. user-apps의 htmlContent(~1MB)도 IDB 우선 정책(`adapterPolicy: 'idb-only'`)으로 OPFS 미선택.

v2 진입 시 OPFS Worker 분리 ADR-0020-1로 분기 가능 (capabilities 필드에 `'sync-access-handle'` 추가).

### D8. resolver 메커니즘 reshape — namespace 정책은 BlobStorage에 그대로 보존

기존 `resolveAdapterFor(namespace)`는 `createLocalBlobStorage({ namespace })`로 wrap. 내부적으로 `getNamespaceEntry(namespace).adapterPolicy`를 읽어 IDB/OPFS/Memory 선택. ADR-0023의 PortResolver는 이를 직접 호출하지 않고 `createLocalBlobStorage()`만 호출 (BlobStorage 내부에서 namespace별 분기).

## Consequences

### Positive
- 패키지 분리로 adapters-local 단위 tree-shake 가능 (Local 사용자가 Cloud 어댑터 미포함 시 ~3KB 절감)
- AbortSignal 통합으로 OPFS list cancel 가능 (대규모 namespace 시나리오)
- PortError 통합으로 호출자 catch 패턴 단일화 (`instanceof PortError`)
- @zm/storage shell로 v2.0 마이그레이션 점진적 (대기 1 minor)

### Negative
- 신규 패키지 1개 (Turborepo 캐시 cold start +0.5s)
- BlobStorageError alias 코드 (v2.1 cleanup까지 유지)
- OPFS list 매 entry 폴링은 100+ entries 시 ~100μs 누적 (무의미한 수준)

### Neutral
- 코드 이동 범위: 7 파일 × ~100 LOC 평균 = 700 LOC 이동, 신규 ~50 LOC (AbortSignal + PortError 적용)
- Vitest 기존 storage 테스트 호환 — import path만 변경

## Alternatives

### A1. AbortSignal 시간 기반 폴링 (e.g. 100ms 간격)
- Pros: 균등한 cancel 지연
- Cons: setTimeout micro-task 오버헤드 + React 18 batching과 충돌
- 거부 이유: for-await 자연 iteration이 이미 비동기 break point — entry 단위 폴링이 최적

### A2. PortError 즉시 전환 (alias 없이)
- Pros: 코드 깔끔, 즉시 v2.0 cleanup
- Cons: @zm/storage import 사용 외부 코드(있다면) 동시 변경 강제
- 거부 이유: POC 외부 의존성은 없으나 ADR-0017 §D7의 "deprecation period 1 v2 minor" 결정 준수

### A3. OPFS Worker 분리 즉시 도입
- Pros: 큰 record(htmlContent ~1MB) put 시 main thread block 회피
- Cons: postMessage 직렬화 비용 + SyncAccessHandle Safari 미지원
- 거부 이유: 현재 idb-only 정책이 user-apps namespace 차지 — OPFS 미사용. v2 진입 후 필요시 ADR-0020-1

### A4. 통합 패키지 @zm/storage 유지 + adapters-local 흡수 (반대 방향)
- Pros: 패키지 신규 안 만들어도 됨
- Cons: ADR-0017 §D3 모듈 위치 결정과 충돌, Cloud 어댑터 패키지와 layout 불일치
- 거부 이유: ADR-0017 reshape 비용 폭증

## 사용자 결정 (2026-05-27 확정)

| Q | 결정 |
|---|------|
| Q20-1 AbortSignal 폴링 빈도 | ✅ 매 entry (μs 비용 + 자연 break point) |
| Q20-2 PortError 마이그레이션 | ✅ alias 유지 1 minor (ADR-0017 deprecation 결정 준수) |
| Q20-3 OPFS Worker 분리 | ✅ POC 미적용 (idb-only 정책상 OPFS 사용 한정적) |
| Q20-4 Memory 어댑터 범위 | ✅ runtime + testing subpath |
| Q20-5 @zm/storage shell 수명 | ✅ v2.0 ~ v2.1 (1 minor) |
| Q20-6 cancel partial 처리 | ✅ throw (AbortSignal 표준 의미론, 호출자가 retry) |

## 마이그레이션 단계

1. `packages/adapters-local/` 신규 패키지 생성 (`package.json`, `tsconfig.json`, `vitest.config.ts`)
2. `pnpm-workspace.yaml` + `turbo.json` 1행 추가
3. `packages/storage/src/*` 7 파일 → `packages/adapters-local/src/blob-storage/`로 git mv
4. `BlobStorageError` 신규 + 각 어댑터 `StorageError` → `BlobStorageError` 교체
5. 5 메서드 시그니처에 `opts?: PortCallOptions` 추가 + `signal?.throwIfAborted()` 삽입
6. OPFS `list()` for-await loop에 매 entry 폴링 추가
7. `createLocalBlobStorage()` 통합 팩토리 신규 (3 createXxxAdapter wrap)
8. `packages/storage/src/index.ts`를 deprecation shell로 reshape (re-export only)
9. Vitest 기존 storage 테스트 import 경로 갱신 + AbortSignal 테스트 6 케이스 신규
10. `apps/web` import: `@zm/storage` 그대로 유지 (shell 경유) — 기존 호출자 변경 0
11. e2e 회귀 PASS 확인 (6/6)
12. v2.1 cleanup PR: `packages/storage` 삭제 + 모든 import를 `@zm/adapters-local/blob-storage`로 sed 교체

## 리스크

| ID | 리스크 | 영향 | 대응 |
|----|--------|------|------|
| R1 | git mv 후 import 경로 누락 → 빌드 실패 | 회귀 | tsc strict + Turborepo dep graph로 자동 검출 |
| R2 | AbortSignal polyfill (구 Safari) | runtime 에러 | `globalThis.AbortController` feature detect + no-op 폴백 |
| R3 | StorageError alias 사용 → PortError 미감지 catch | 호환 깨짐 가능 | BlobStorageError extends PortError 상속 관계 보존, instanceof 양쪽 모두 true |
| R4 | idb v8.0.3 자체는 AbortSignal 미지원 | mid-operation cancel 불가 | entry-level 폴링 + 어댑터 메서드 진입 폴링으로 충분, idb 내부 transaction은 timeout으로 fallback (idb 자체 timeout API 활용) |
| R5 | shell wrap 함수 시그니처 불일치 | TS strict 빌드 실패 | `BlobStorage as StorageAdapter` type alias 정확성 검증 단위 테스트 3 케이스 |
