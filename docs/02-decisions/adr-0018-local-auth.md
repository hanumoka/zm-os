---
number: "0018"
title: LocalAuth — POC v1 anonymous user 모델 (AuthProvider Local 어댑터)
status: accepted
date: 2026-05-27
author: hanumoka
related: ["0017"]
---

# ADR-0018: LocalAuth — POC v1 anonymous user 모델

## Context

ADR-0017 §D1.2가 정의한 `AuthProvider` 인터페이스의 첫 번째 구현체. POC v1은 단일 사용자 가정으로 동작했으며 `apps/web/src/`에 `user-id`/`session` 식별자 사용은 0건이다(grep 확인). 그러나 v2 Cloud Auth(ADR-0024+) 도입 시 `AppRecord.ownerId`(ADR-0017 §D1.3) 필드가 활성화되므로, POC v1 시점부터 **모든 데이터 쓰기에 UserId가 첨부**되어야 마이그레이션 시 데이터 손실이 발생하지 않는다.

LocalAuth의 책임:
1. 최초 진입 시 익명 UserId 1건 자동 발급 (브랜드 타입 `UserId = string & { __brand }`)
2. UserId 영속화 — 브라우저 재방문 시 동일 UserId 복원
3. multi-tab session 일관성 — 한 탭에서 signOut/signIn 시 다른 탭이 즉시 인지
4. v2 Cloud 어댑터로 교체 시 anon UserId → Cloud UserId 매핑 hook 제공 (인터페이스 무변경)

## Decision

### D1. UserId 발급 + 영속화

- 생성: `crypto.randomUUID()` (RFC 4122 v4) — 모든 타겟 브라우저 지원 가정
- 영속화: BlobStorage Port의 신규 namespace `system`에 저장
  - key: `'auth.local.anon.user-id'`
  - value: `{ userId: string, displayName: string, issuedAt: number }`
- `system` namespace는 `packages/core/src/namespace-registry.ts`에 5번째 엔트리로 추가
  - `{ name: 'system', sinceVersion: 5, adapterPolicy: 'idb-only' }`
- 최초 `getSession()` 호출 시 영속 데이터 없으면 자동 발급 + put (lazy init)
- `signIn({})` 무인자 호출도 동일 동작 (idempotent — 기존 UserId 있으면 반환, 없으면 신규)

### D2. 시그니처 (ADR-0017 §D1.2 정합)

```typescript
import type {
  AuthProvider,
  Session,
  SessionChangeEvent,
  AdapterDescriptor,
  PortCallOptions,
} from '@zm/core/ports';
import type { BlobStorage } from '@zm/core/ports';
import { PortError } from '@zm/core/ports';

export type LocalAuthDeps = {
  readonly blobStorage: BlobStorage;
  readonly clock?: () => number;          // 테스트용 — 기본 Date.now
  readonly randomUUID?: () => string;     // 테스트용 — 기본 crypto.randomUUID
};

export function createLocalAuth(deps: LocalAuthDeps): AuthProvider {
  /* 시그니처만 — 구현은 lib-developer */
}
```

생성자 대신 factory 함수 (DI 명시 + 테스트 가능성).

### D3. multi-tab session sync

- **채택**: BroadcastChannel API (채널명 `'zm-os:auth'`)
- signIn/signOut 시 `{ type: 'signed-in' | 'signed-out', session?, ts }` 메시지 broadcast
- 다른 탭의 `subscribe` 콜백이 즉시 호출됨
- SSR 안전: BroadcastChannel 생성은 `if (typeof BroadcastChannel !== 'undefined')` 가드, 미지원 시 no-op fallback
- POC v1은 단일 사용자이므로 cross-tab signOut 충돌은 없음 — 단순 broadcast 충분

### D4. Cloud 마이그레이션 hook

- `AuthProvider` 인터페이스에는 hook 추가 안 함 (인터페이스 무변경 원칙)
- 별도 utility `packages/adapters-local/src/auth/migration.ts`:
  - `exportAnonUserId(blobStorage): Promise<{ userId, displayName, issuedAt } | null>`
  - Cloud Auth 어댑터(ADR-0024+)가 첫 가입 시 이 utility 호출 → Cloud user metadata에 `legacy_anon_user_id` 필드 저장
  - 모든 `AppRecord.ownerId` 등은 신규 Cloud UserId로 일괄 갱신 (별도 migration utility, ADR-0027+ 예정)

### D5. 에러 처리

- BlobStorage put 실패 → `PortError('auth', 'STORAGE_UNAVAILABLE', cause, retryable=false)` throw
- BroadcastChannel 미지원 환경 → silent fallback (subscribe는 동일 탭 in-memory만 동작)
- signOut 호출 시: `system` namespace의 `auth.local.anon.user-id` 삭제 + broadcast — 다음 `getSession()`이 신규 UserId 발급 (사용자 시나리오: "초기화")

### D6. displayName 정책

- 기본값: `'Anonymous-' + userId.slice(0, 8)` (예: `Anonymous-3f8a2c1d`)
- 사용자 변경 가능 — `signIn({ displayName: 'Alice' })` 호출 시 영속 데이터 갱신
- v2 Cloud 어댑터는 OAuth provider profile 사용 — 인터페이스 무변경

## Consequences

### Positive
- POC v1에서 즉시 UserId 부여 가능 → v2 Cloud 마이그레이션 시 `AppRecord.ownerId` 자동 채워짐
- AuthProvider 인터페이스를 어댑터별 구현 변경 없이 유지 (DIP)
- BroadcastChannel로 multi-tab UX 일관성 확보 (브라우저 표준)
- Cloud Auth 어댑터 진입 비용: 신규 OAuth 어댑터 + migration utility 1건

### Negative
- BlobStorage Port에 의존 → LocalAuth 인스턴스 생성 순서 강제 (Composition Root에서 blob 먼저 생성)
- BroadcastChannel 미지원 구형 브라우저는 multi-tab 일관성 누락 (POC 타겟 브라우저 외이므로 영향 미미)
- `system` namespace 신설 — namespace-registry 5번째 엔트리 + indexeddb upgrade 함수 1 if 블록 추가 (REFAC-01 C-3 패턴 그대로)

### Neutral
- 어댑터 LOC: ~120 LOC 예상 (factory + getSession + signIn + signOut + subscribe + BroadcastChannel handler)
- Vitest 단위 테스트: clock + randomUUID DI로 결정적 테스트 가능

## Alternatives

### A1. UserId를 localStorage에 직접 저장 (BlobStorage 우회)
- Pros: 의존성 1단 감소
- Cons: `system` namespace 패턴(다른 영속 데이터 관리 방식과 통일)에서 벗어남 — 향후 system 단위 영속 데이터 추가 시 일관성 깨짐
- **거부 이유**: ADR-0017 §D1.4 BlobStorage Port의 통일 원칙 위배

### A2. UserId 미발급 — Cloud 어댑터 도입 시점에 최초 발급
- Pros: POC LOC 절감
- Cons: 모든 `AppRecord.ownerId`가 v1에서 undefined → Cloud 진입 시 일괄 update 필요. v1 데이터를 v2로 이행하는 마이그레이션 utility 복잡도 증가
- **거부 이유**: ADR-0017 R2 마이그레이션 리스크 증대

### A3. multi-tab sync로 StorageEvent 채택 (localStorage 기반)
- Pros: BroadcastChannel 미지원 환경 대응
- Cons: 데이터를 BlobStorage(IDB)에 저장하므로 StorageEvent 자동 트리거 안 됨 → 별도 sentinel localStorage 키 필요 (복잡도 증가)
- **거부 이유**: BroadcastChannel이 의도 표현 명확 + 타겟 브라우저 모두 지원

## 사용자 결정 (2026-05-27 확정)

| Q | 결정 |
|---|------|
| Q1. `system` namespace | ✅ 신설 — system 단위 영속 데이터 분리 명확 |
| Q2. displayName 기본값 | ✅ `Anonymous-<8자>` — debugging + 멀티유저 v2 UI 호환 |
| Q3. signOut 시 UserId | ✅ 삭제 — POC v1 "초기화" 시나리오 (개발 + 데모 편의) |

## 마이그레이션 단계

1. `packages/core/src/namespace-registry.ts` — `system` 5번째 엔트리 추가
2. `apps/web/src/lib/storage/indexeddb.ts` — upgrade v5 (system store 생성)
3. `packages/adapters-local/src/auth/local-auth.ts` 작성 (createLocalAuth factory)
4. `apps/web/src/lib/ports/index.ts` (Composition Root, ADR-0023) — `createPorts()`에 LocalAuth wiring
5. v2 Cloud 진입 시: `packages/adapters-local/src/auth/migration.ts` 작성 → `exportAnonUserId` 노출
