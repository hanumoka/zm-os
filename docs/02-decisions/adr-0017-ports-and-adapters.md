---
number: "0017"
title: Ports & Adapters 아키텍처 + 5개 Port 정의 (로컬-우선 + 클라우드 옵션)
status: accepted
date: 2026-05-27
author: hanumoka
related: ["0009", "0013", "0014", "0015", "0016"]
supersedes: ["0013", "0014", "0015"]
superseded_by: []
---

# ADR-0017: Ports & Adapters 아키텍처 + 5개 Port 정의

## Context

2026-05-26 사용자 결정으로 zm-os는 **로컬 100% 동작 + 외부 의존성 0**을 v2 진입 시 보장한다. 클라우드 서비스는 어댑터를 통해 옵션으로 추가된다. 이 결정은 ADR-0013(Auth: Supabase), ADR-0014(DB: Supabase), ADR-0015(Sync: LWW + 서버 권위 시계)에서 가정한 "Supabase 단일 채택"과 충돌하며, 세 ADR은 본 ADR 직후 superseded 처리되고 Cloud 어댑터 명세는 ADR-0024+에서 별도 작성된다.

현재 코드는 부분적으로 Ports & Adapters 패턴을 적용 중이다.

- `packages/storage/src/storage-adapter.ts`의 `StorageAdapter` 인터페이스는 IDB/OPFS/Memory 3 어댑터를 Strategy로 통합
- `resolveAdapterFor(namespace)`(`packages/storage/src/resolve-adapter.ts`)는 namespace별 정책에 따라 어댑터 선택 (ADR-0009)
- `packages/core/src/namespace-registry.ts`는 4 namespace SSOT + `adapterPolicy` 보유
- `packages/core/src/errors/persistence-error.ts`의 `PersistenceErrorEvent`는 5 Port 공통 에러 채널 prototype

이 prototype을 5개 Port로 일반화하여 인증/저장소/리포지토리/동기화/모더레이션을 일관된 패턴으로 추상화한다.

### 추상화 동기

1. **테스트 가능성**: Port 단위 mock 어댑터로 통합 테스트 격리 (POC v1 Vitest 61 테스트 일부가 이미 IDB Memory 폴백에 의존)
2. **로컬-우선 보장**: Local 어댑터만으로 모든 기능 동작. Cloud 어댑터는 빌드 시 선택 가능
3. **마이그레이션 안전성**: ADR-0018~0023(Local) + ADR-0024+(Cloud)를 동일 인터페이스에서 작성 → 사용자가 Local↔Cloud 전환 가능
4. **SOLID 정합**: 현재 lib→components 단방향 + 도메인 wrapper 패턴(REFAC-01 결과)을 그대로 활용

---

## Decision

### D1. 5개 Port 정의

#### D1.1 공통 타입 (`packages/core/src/ports/common.ts` 신규)

```typescript
export type PortName = 'auth' | 'app-repository' | 'blob-storage' | 'sync' | 'moderation';

export class PortError extends Error {
  constructor(
    message: string,
    public readonly port: PortName,
    public readonly code: string,                  // 'NOT_FOUND' | 'UNAUTHORIZED' | 'QUOTA_EXCEEDED' | ...
    public readonly cause?: unknown,
    public readonly retryable: boolean = false,
  ) {
    super(`[${port}:${code}] ${message}`);
    this.name = 'PortError';
  }
}

export type PortCallOptions = { readonly signal?: AbortSignal };

export type AdapterDescriptor = {
  readonly portName: PortName;
  readonly adapterName: string;                    // 'local-idb' | 'cloud-supabase' | ...
  readonly version: string;
  readonly capabilities: ReadonlyArray<string>;    // 'realtime-sync' | 'oauth' | ...
};
```

#### D1.2 AuthProvider (`packages/core/src/ports/auth.ts`)

```typescript
export type UserId = string & { readonly __brand: 'UserId' };

export type Session = {
  readonly userId: UserId;
  readonly displayName: string;
  readonly issuedAt: number;                       // epoch ms
  readonly expiresAt: number | null;               // null = 무기한 (LocalAuth POC)
};

export type SessionChangeEvent =
  | { type: 'signed-in'; session: Session }
  | { type: 'signed-out' }
  | { type: 'session-refreshed'; session: Session };

export interface AuthProvider {
  readonly descriptor: AdapterDescriptor;
  getSession(opts?: PortCallOptions): Promise<Session | null>;
  signIn(credentials: Readonly<Record<string, string>>, opts?: PortCallOptions): Promise<Session>;
  signOut(opts?: PortCallOptions): Promise<void>;
  subscribe(handler: (event: SessionChangeEvent) => void): () => void;
}
```

#### D1.3 AppRepository (`packages/core/src/ports/app-repository.ts`)

```typescript
import type { AppManifest } from '../manifest';

export type AppRecord = {
  readonly manifest: AppManifest;
  readonly source: 'built-in' | 'user';
  readonly installedAt: number;
  readonly contentRef:
    | { readonly kind: 'built-in-url'; readonly url: string }
    | { readonly kind: 'blob-ref'; readonly blobKey: string };
  readonly ownerId?: UserId;                       // v2 Cloud 어댑터 RLS용
};

export type AppListFilter = {
  readonly source?: 'built-in' | 'user';
  readonly ownerId?: UserId;
};

export interface AppRepository {
  readonly descriptor: AdapterDescriptor;
  list(filter?: AppListFilter, opts?: PortCallOptions): Promise<ReadonlyArray<AppRecord>>;
  get(id: string, opts?: PortCallOptions): Promise<AppRecord | null>;
  upsert(record: AppRecord, opts?: PortCallOptions): Promise<void>;
  remove(id: string, opts?: PortCallOptions): Promise<void>;
  markInstalled(appId: string, opts?: PortCallOptions): Promise<void>;
  unmarkInstalled(appId: string, opts?: PortCallOptions): Promise<void>;
  listInstalled(opts?: PortCallOptions): Promise<ReadonlyArray<string>>;
}
```

#### D1.4 BlobStorage (`packages/core/src/ports/blob-storage.ts`)

기존 `StorageAdapter` 인터페이스를 흡수. 기존 IDB/OPFS/Memory 3 어댑터는 BlobStorage Port의 Local 구현체로 재배치.

```typescript
export interface BlobStorage {
  readonly descriptor: AdapterDescriptor;
  get<T>(namespace: string, key: string, opts?: PortCallOptions): Promise<T | undefined>;
  put<T>(namespace: string, key: string, value: T, opts?: PortCallOptions): Promise<void>;
  delete(namespace: string, key: string, opts?: PortCallOptions): Promise<void>;
  list<T>(namespace: string, opts?: PortCallOptions): Promise<ReadonlyArray<{ key: string; value: T }>>;
  clear(namespace: string, opts?: PortCallOptions): Promise<void>;
}
```

#### D1.5 SyncProvider (`packages/core/src/ports/sync.ts`)

```typescript
export type SyncEntity = {
  readonly entityType: 'app-record' | 'installed-mark' | 'desktop-layout' | 'desktop-settings';
  readonly entityId: string;
  readonly updatedAt: number;                      // 클라이언트 시각 (서버 권위 시계는 어댑터 내부)
  readonly payload: unknown;                       // 호출자가 Zod 검증
};

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'disabled';

export interface SyncProvider {
  readonly descriptor: AdapterDescriptor;
  status(): SyncStatus;
  pull(entityType: SyncEntity['entityType'], opts?: PortCallOptions): Promise<ReadonlyArray<SyncEntity>>;
  push(entities: ReadonlyArray<SyncEntity>, opts?: PortCallOptions): Promise<void>;
  subscribe(entityType: SyncEntity['entityType'], handler: (entity: SyncEntity) => void): () => void;
}
```

LocalNoOp 어댑터: `status() = 'disabled'`, 다른 메서드는 `Promise.resolve` / empty array, `subscribe` 즉시 unsubscribe 가능한 no-op 반환 (silent — Q8 결정).

#### D1.6 ModerationProvider (`packages/core/src/ports/moderation.ts`)

```typescript
export type ModerationVerdict =
  | { readonly status: 'allowed' }
  | { readonly status: 'flagged'; readonly reasons: ReadonlyArray<string> }   // 경고 + 사용자 확인
  | { readonly status: 'blocked'; readonly reasons: ReadonlyArray<string> };  // 강제 차단

export type ModerationInput = {
  readonly manifest: AppManifest;
  readonly htmlContent: string;
  readonly contentHash?: string;                   // 어댑터별 캐시 키 (SHA-256 hex)
};

export interface ModerationProvider {
  readonly descriptor: AdapterDescriptor;
  scan(input: ModerationInput, opts?: PortCallOptions): Promise<ModerationVerdict>;
}
```

**Fail policy (Q5 결정 = fail-closed)**: Cloud 어댑터 타임아웃 / `PROVIDER_UNAVAILABLE` 발생 시 어댑터가 `blocked` verdict 반환. Local 어댑터는 항상 동기 동작이므로 무관.

### D2. 에러 모델 — 단일 `PortError` (Q1 결정)

- 단일 `PortError` 클래스 + `port`/`code`/`retryable` 필드
- 호출자가 `instanceof PortError` 단일 catch로 5 Port 통합 처리
- 기존 `StorageError`는 `PortError`로 마이그레이션 (re-export alias 유지하여 호환)
- `PersistenceErrorEvent`(UI 표시용)는 `PortError`를 wrap

### D3. 모듈 위치 — Core(인터페이스) + 별도 패키지(Local 어댑터) (Q3 결정)

```
packages/
├── core/                         # @zm/core (외부 의존성: zod만)
│   └── src/
│       └── ports/                # 신규 — 5 Port 인터페이스 SSOT
│           ├── index.ts          # barrel export
│           ├── common.ts         # PortError / AdapterDescriptor / PortCallOptions
│           ├── auth.ts
│           ├── app-repository.ts
│           ├── blob-storage.ts   # StorageAdapter 흡수
│           ├── sync.ts
│           └── moderation.ts
├── adapters-local/               # 신규 패키지 @zm/adapters-local
│   └── src/
│       ├── auth/local-auth.ts                      # ADR-0018 진입
│       ├── app-repository/local-app-repository.ts  # ADR-0019 진입
│       ├── blob-storage/                            # ADR-0020 — packages/storage 흡수
│       │   ├── idb-adapter.ts
│       │   ├── opfs-adapter.ts
│       │   └── memory-adapter.ts
│       ├── sync/local-noop-sync.ts                 # ADR-0021 진입
│       ├── moderation/local-static-moderation.ts   # ADR-0022 진입 (eval/Function 정규식 검출)
│       └── resolver.ts                              # ADR-0023 진입 — Adapter Resolver
├── storage/                      # ⚠️ deprecated — re-export shell only (1 v2 minor)
└── ipc/                          # 변경 없음

apps/web/
└── src/lib/
    ├── ports/                    # 신규 — Port 인스턴스 wiring (Composition Root)
    │   └── index.ts              # createPorts(): { auth, repo, blob, sync, moderation }
    └── storage/                  # 기존 도메인 wrapper — ports.repo.upsert(...) 호출로 reshape (REFAC-02)
```

### D4. 어댑터 선택 메커니즘 — 하이브리드 (Q2 결정)

- **Local 어댑터 (기본)**: `@zm/adapters-local`를 정적 번들 포함 — 빌드 타임 tree-shake 가능
- **Cloud 어댑터 (옵션)**: `import('@zm/adapters-cloud-supabase')` 동적 import + lazy load
- **Resolver** (`@zm/adapters-local/resolver.ts`, ADR-0023): 환경 변수 + 사용자 설정 기반 어댑터 선택. namespace-registry의 `adapterPolicy`를 Port별로 확장
- **이유**:
  - Local-only 사용자는 Cloud 어댑터 번들 미포함 (로컬-우선 원칙)
  - Cloud 사용자는 런타임 토글 가능 (사용자 시나리오 F: Local↔Cloud 전환)

### D5. ADR-0013/0014/0015 처리 — 즉시 superseded + Cloud 어댑터 별도 ADR (Q4 결정)

- 세 ADR frontmatter `status: superseded` 전환 + `superseded_by: ["0017"]` 메타
- 본문 첫 줄에 안내 추가: "본 ADR은 ADR-0017의 어댑터 옵션 명세로 reshape됨. Cloud Auth는 ADR-0024+, Cloud Repo는 ADR-0025+, Cloud Sync는 ADR-0026+ 참조"
- Cloud 어댑터 ADR(0024+)은 v2 plan v0.3.0의 CLD Epic 진입 시점에 작성 — 본 ADR 범위 밖

### D6. capability 검증 책임 분리

- Port는 검증된 데이터를 받음 (`AppRecord.manifest`는 `parseManifest`로 정규화된 v2)
- 검증은 호출자(UserAppsProvider, store action)가 `@zm/core/manifest`의 `safeParseManifest` 호출
- ModerationProvider는 manifest+html만 받고 verdict 반환 — capability 의미론 해석은 호출자

### D7. Port 도입 시점 — REFAC-02 5 작업 분할 (Q6 결정 반영)

- 현재 `apps/web/src/lib/storage/{installed-apps,user-apps,desktop-layout,desktop-settings}.ts`는 `idbXxx` 직접 호출 → `ports.repo.markInstalled(...)` 등으로 reshape
- 4 Provider의 `usePersistence` 호출은 Port 호출로 변경
- **단일 PR 금지**, 5 작업(P-port-N) 분할 — Port별 incremental migration
- `@zm/storage`는 deprecation period 1 v2 minor (re-export shell 유지 후 v2.1 cleanup) — **Q6 결정**

### D8. 단일 AppRepository Port (Q7 결정)

- `list/get/upsert/remove`와 `markInstalled/listInstalled`를 단일 `AppRepository` Port에 통합
- 현재 도메인 wrapper 4개(`installed-apps.ts`/`user-apps.ts`/...)는 같은 IDB 트랜잭션 가능성 (Local 어댑터에서 효율적)
- 분리(`AppCatalog` + `InstallationTracker`)는 v2.1 reshape 여지로 보존

---

## Consequences

### Positive
- v2 Cloud 도입이 어댑터 교체 1건 단위로 가능 (ADR-0024+ 진입 비용 최소)
- 통합 테스트가 Local 어댑터 mock + Cloud 어댑터 contract test로 분리
- 외부 SaaS 의존성 0 보장 — POC 데모/시연 안정성 유지
- SOLID DIP/OCP 충족 — lib→components 단방향 강화

### Negative
- 도입 비용: 5 Port + 6 Local 어댑터 ADR(0018~0023) + REFAC-02 (5 작업) — v2 진입 전 2~3주 예상
- 추가 추상화 레이어로 콜스택 1단계 깊어짐 (성능 영향 미미 — 어댑터 메서드는 함수 호출 1단)
- Local↔Cloud 마이그레이션은 Port 인터페이스로 자동화 불가 — 별도 유틸 필요 (리스크 R2)
- `@zm/storage` deprecation period 관리 — 1 v2 minor 후 cleanup PR 필요

### Neutral
- 번들 사이즈: Local 어댑터만 기본 포함 — 현재 대비 +2~3KB 추정 (Port interface는 dead code elimination)
- TypeScript 컴파일 시간: 패키지 1개 추가 — 측정 후 검토

---

## Alternatives

### A1. Strategy 패턴 유지 + Port 미도입
- Pros: 기존 `StorageAdapter` 단일 유지, 추상화 비용 0
- Cons: Auth/Repo/Sync/Moderation이 모두 직접 구현으로 흡수 → DIP 위배, Cloud 어댑터 도입 비용 폭증
- **거부 이유**: v2 Cloud 옵션 도입 시점 reshape 비용이 본 ADR 도입 비용보다 크다

### A2. ADR별 어댑터 옵션 흡수 (Cloud 어댑터를 ADR-0018/0019/0021에 통합)
- Pros: ADR 수 감소
- Cons: ADR-0018(Local Auth) 내부에 Cloud Auth 명세 혼재 → 가독성 저하 + 변경 시 ADR 1건 비대
- **거부 이유**: ADR 단위 = 결정 1건 원칙 위배

### A3. 빌드 타임 전용 어댑터 선택 (Q2 옵션 i)
- Pros: 번들 사이즈 최소
- Cons: 사용자 런타임 토글 불가 — Local↔Cloud 전환 시 재배포 강제
- **거부 이유**: 사용자 시나리오 F(Local↔Cloud 마이그레이션) 차단

### A4. 런타임 전용 어댑터 선택 (Q2 옵션 ii)
- Pros: 단일 빌드 + 사용자 토글 자유도
- Cons: Local-only 사용자도 Cloud 어댑터 번들 포함 → POC 약속 위배 ("외부 의존성 0")
- **거부 이유**: 로컬-우선 원칙 위배

---

## 리스크 + 대응

| 리스크 | 영향 | 대응 |
|--------|------|------|
| **R1. 순환 의존**: `@zm/adapters-local`이 `@zm/core/ports`만 import, but Cloud 어댑터 추가 의존 시 (예: Supabase SDK가 `@zm/core` 타입 import) | 빌드 실패 또는 패키지 분리 무력화 | 사전 검사: `pnpm madge --circular packages/`. Cloud 어댑터 ADR(0024+) 작성 시 의존성 그래프 명시 |
| **R2. Local↔Cloud 마이그레이션 데이터 손실** | 사용자 데이터 유실 (앱/레이아웃) | Migration utility 별도 작성 (Port 아님). `BlobStorage.list` 전체 export → 신규 어댑터 import. 충돌 시 LWW 또는 사용자 수동 결정 (CLD Epic에서 ADR-0027+ 신규) |
| **R3. capability 누락**: AppManifest v2의 `capabilities: string[]`이 Port에 명시 없음 — Cloud 어댑터가 capability 기반 권한 검증 필요 시 | 보안 우회 가능 | ModerationProvider Port에 `capabilities` 검증 위임 (`verdict.reasons`에 `'requested-capability: X not allowed'` 형태). 단 capabilities semantics는 별도 ADR로 정의 (POC 범위 밖) |
| **R4. 테스트 폭증**: 5 Port × 2 어댑터 = 10 contract test 매트릭스 | 테스트 코드 증가 | Port별 contract test suite 1개 + 어댑터별 setup 함수 분리. Vitest `describe.each` 활용. POC 61개 → v2 진입 시 ~120개 예상 |
| **R5. 빌드 시간 영향**: 신규 패키지 1개 + 동적 import code-split | dev cold start +0.5~1s 예상 | Turborepo 캐시 + `transpilePackages` 적용으로 영향 최소화. perf-monitor 기준선 측정 후 결정 |
| **R6. `usePersistence` 훅 reshape 범위**: 4 Provider가 동일 패턴 — Port 도입 시 모두 변경 | REFAC-02 작업 비대 | usePersistence를 Port-aware로 reshape (`namespace` + `port` 2 인자) → 4 Provider 동일 패턴 유지. 변경 최소 |

---

## 검증할 가정

| 가정 | 검증 방법 |
|------|----------|
| G1. **`StorageAdapter` 흡수**: `AbortSignal` 추가가 기존 4 어댑터 호환 깨지 않는가? | lib-developer 위임: 옵션 인자 `signal?`이므로 호환. OPFS의 `for await` loop은 어댑터 구현에서 `signal.throwIfAborted()` 폴링 추가 |
| G2. **idb v8.0.3 AbortSignal 지원** | research-analyst 위임 — idb changelog 확인 |
| G3. **Cloud 어댑터 동적 import + Turbopack/Next.js 16 code-split** | research-analyst 위임 — Next.js 16 + Turbopack 동적 import 지원 문서 |
| G4. **`@zm/adapters-local` 신규 패키지가 pnpm + Turborepo 캐시 정상 등록** | lib-developer: `pnpm-workspace.yaml` + `turbo.json` 1행 추가 (ADR-0016 §Decision 참조) |
| G5. **`PortError` 단일 클래스로 5 Port 충분** | design-reviewer 검토: 호출 지점 4개(`installed-apps.ts` 등)에 한정, `StorageError`→`PortError` re-export로 호환 가능 |

---

## 정책 충돌 + reshape

- **ARCH-01** (모노레포): "apps/web + packages/{core, storage, ipc}" → **"apps/web + packages/{core, storage, ipc, adapters-local}"**로 reshape
- **TECH-01** (IndexedDB): BlobStorage Port의 Local 어댑터로 격하 — "저수준 IDB → BlobStorage Port" reshape
- **TECH-07** (Supabase Auth): superseded → ADR-0024+ Cloud Auth 어댑터로 별도 등재
- **TECH-08** (Supabase Postgres): superseded → ADR-0025+ Cloud Repo 어댑터로 별도 등재
- **TECH-09** (LWW Sync): superseded → ADR-0026+ Cloud Sync 어댑터로 별도 등재
- **CONST-01** (RLS): Cloud 어댑터 한정 — Local 어댑터는 무관 (단일 사용자)
- **CONST-02** (서버 시계 권위): CloudSync 어댑터 한정
- **ARCH-NN 신규**: Ports & Adapters 원칙 등재 (인터페이스 SSOT은 `@zm/core/ports`, 어댑터는 별도 패키지)

---

## 다음 단계

1. ADR-0013/0014/0015 superseded 처리 (heading 메모 + frontmatter `status: superseded` + `superseded_by: ["0017"]`)
2. policy-registry + _digest + MEMORY 갱신 (ARCH-NN 신규 + TECH-01 reshape + TECH-07/08/09 superseded)
3. ADR-0018~0023 (Local 어댑터 6건) 병렬 설계 진입
4. v2 plan v0.3.0 재작성 (로컬 우선 + 옵션 어댑터 구조)
