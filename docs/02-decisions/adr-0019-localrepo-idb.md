---
number: "0019"
title: LocalRepo IDB — AppRepository Local 어댑터 (IndexedDB 단일 트랜잭션)
status: accepted
date: 2026-05-27
author: hanumoka
related: ["0009", "0011", "0017", "0020", "0023"]
---

# ADR-0019: LocalRepo IDB — AppRepository Local 어댑터

## Context

ADR-0017 §D1.3에서 `AppRepository` Port는 7개 메서드(`list/get/upsert/remove/markInstalled/unmarkInstalled/listInstalled`)를 갖는 단일 인터페이스로 확정되었다(§D8 단일 Port 결정). 현재 `apps/web/src/lib/storage/`에는 4개 도메인 wrapper가 존재한다.

- `installed-apps.ts` (3 함수): `listInstalledAppIds` / `persistInstalledApp` / `removeInstalledApp`, 키 = `appId`, 값 = `{ id, installedAt }`
- `user-apps.ts` (3 함수): `listUserApps` / `saveUserApp` / `deleteUserApp`, 키 = `manifest.id`, 값 = `ParsedUserApp & { installedAt }` (htmlContent 문자열 포함)
- `desktop-layout.ts` (3 함수): `loadDesktopLayout` / `saveDesktopLayout` / `clearDesktopLayout`, 키 = `'current'`(고정), 값 = `DesktopLayoutRecord`
- `desktop-settings.ts` (3 함수): `loadDesktopSettings` / `saveDesktopSettings` / `clearDesktopSettings`, 키 = `'settings'`(고정), 값 = `DesktopSettingsRecord`

이 중 앞 2개(installed-apps, user-apps)는 "앱"의 카탈로그/설치 마크로서 `AppRepository`에 자연스럽게 흡수된다. 뒤 2개(desktop-layout, desktop-settings)는 **앱이 아닌 데스크탑 환경 상태**로, Repository 의미론(`list/get/upsert by id`)에 맞지 않는다 — 키가 1개로 고정된 단일 문서이기 때문이다. 호출자는 `BlobStorage` Port를 직접 호출하는 편이 자연스럽다.

또한 `ParsedUserApp.htmlContent`는 현재 IDB에 직렬화된 string으로 저장되고 있으나, ADR-0017 §D1.3의 `AppRecord.contentRef` 모델은 `blob-key` 분리를 가정한다. 이 ADR은 POC 호환을 위해 v2.0에서는 inline string을 유지하고 v2.1에서 blob 분리하는 마이그레이션 경로를 정의한다.

## Decision

### D1. AppRepository 책임 범위 — 앱 관련만 흡수

`AppRepository`는 `installed-apps` + `user-apps` 2 namespace만 흡수한다. `desktop-layout` + `desktop-settings`는 `BlobStorage` Port 직접 호출(`ports.blob.get('desktop-layout', 'current')`)로 reshape한다.

근거: 후자는 단일 키 문서로 `list/get/upsert(id)` 의미론이 부자연스럽고 (`upsert` 시 ID 인자가 무의미), 향후 Cloud 어댑터에서도 RLS 정책이 단일 user 단일 row로 동일하다. `BlobStorage` Port의 namespace+key 모델이 더 적합.

### D2. 모듈 구조 — Repository는 BlobStorage 위 layer

```
packages/adapters-local/src/
├── blob-storage/        # ADR-0020 — IDB/OPFS/Memory 어댑터
│   └── idb-adapter.ts   # BlobStorage 구현
└── app-repository/
    └── local-app-repository.ts  # AppRepository 구현, BlobStorage 호출
```

`LocalAppRepository`는 생성 시 `BlobStorage` 인스턴스를 주입받아 그 위에서 동작한다 (high-level → low-level). namespace 직접 호출이 아닌 BlobStorage Port 경유 → IDB 트랜잭션 최적화는 `BlobStorage` 어댑터 내부에서 처리(추후 batched put API 추가 시점에 일괄 가능).

```typescript
export function createLocalAppRepository(blob: BlobStorage, opts?: {
  readonly defaultOwnerId?: UserId;     // POC: anon 자동 채움
}): AppRepository;
```

### D3. namespace 매핑 + source 분기

`AppRepository`는 내부적으로 2 namespace를 다룬다.

- `user-apps` namespace: `AppRecord` 전체 저장 (key = `manifest.id`)
- `installed-apps` namespace: 설치 마크 (key = `appId`, value = `{ installedAt: number }`)

메서드별 namespace 사용:
- `list({ source: 'built-in' })` → built-in 카탈로그는 IDB 미저장. 호출자(스토어 페이지)가 `manifest.json` static import로 별도 제공. Repository는 빈 배열 반환 + `descriptor.capabilities`에 `'built-in-passthrough'` 표기
- `list({ source: 'user' })` 또는 무필터 → `user-apps` namespace `list()`
- `get(id)` → user-apps 우선 조회, 없으면 null (built-in은 호출자가 별도 카탈로그에서 lookup)
- `upsert(record)` → record.source === 'user'만 user-apps namespace에 put. `source: 'built-in'` 입력 시 `PortError('app-repository', 'INVALID_SOURCE')`
- `remove(id)` → user-apps namespace delete + 함께 installed-apps namespace에서도 unmark (cascade, D4 결정)
- `markInstalled(appId)` → installed-apps namespace put (key=appId, value={installedAt: Date.now()})
- `unmarkInstalled(appId)` → installed-apps namespace delete
- `listInstalled()` → installed-apps namespace list → key 배열 반환

### D4. cascade 동작 — `remove(id)` 시 installed-apps 자동 unmark

사용자 앱 `remove` 시 `installed-apps` 마크도 자동 제거. 근거: 현재 UserAppsProvider.removeUserApp 호출 후 InstalledAppsProvider.uninstall를 별도 호출하던 패턴을 Port가 흡수 → 호출자 로직 간결화. Cascade 비원자(2 메서드 순차 호출, 부분 실패 시 inconsistent 가능) — 단일 IDB 트랜잭션 보장은 v2.1로 연기.

### D5. markInstalled 키 형식 — record 객체 보존

현재 `installed-apps` namespace에는 `{ id, installedAt }` 객체가 저장되고 있다. 이를 유지하되 key는 `appId` 그대로, value는 `{ installedAt: number }`만 보존 (id는 key와 중복이므로 제거). built-in과 user 앱 모두 동일 namespace 공유 — `source` 분기 불필요.

### D6. ownerId 처리 — POC nullable 유지 + defaultOwnerId 옵션

`AppRecord.ownerId`는 v2 Cloud 어댑터 RLS 전용. POC LocalAppRepository는 `ownerId`를 받지 않고 nullable로 저장 (write 시 받으면 그대로 저장, read 시 그대로 반환). `defaultOwnerId` 옵션은 LocalAuth(ADR-0018)의 anon UserId를 자동 채울 수 있도록 hook 제공 — 기본은 undefined.

### D7. contentRef 모델 — POC inline blob-ref + lazy 마이그레이션

현재 `UserAppRecord.htmlContent: string`은 IDB 단일 record에 inline. `AppRecord.contentRef`는 ADR-0017에서 `'blob-ref'` kind를 가정하지만, **v2.0에서는 `blobKey = manifest.id` + htmlContent를 동일 record에 inline 보존** (실질적 separation 없음). v2.1에서 BlobStorage Port에 별도 namespace `app-blobs` 추가 + 분리 마이그레이션.

이유: POC 데이터 마이그레이션 리스크 회피 + 현재 zip 1MB 제한이 IDB record 사이즈 안전 범위 내. ADR-0020에서 BlobStorage `put` 옵션 `{ binary?: true }` 도입 시 자연스럽게 reshape.

### D8. 호출자 마이그레이션 — Provider 시그니처 보존

`UserAppsProvider` / `InstalledAppsProvider` 외부 시그니처(`useUserApps()` / `useInstalledApps()` 반환 타입)는 유지. 내부적으로만 `ports.repo` 호출로 reshape.

`@/lib/storage/{installed-apps,user-apps}.ts` 4개 도메인 wrapper는 **제거** — Port 도입으로 layer 중복. 단 type alias (`UserAppRecord`, `InstalledAppRecord`)는 `apps/web/src/lib/repo/types.ts`로 이동 보존 (UI 컴포넌트가 의존 중).

`@/lib/storage/{desktop-layout,desktop-settings}.ts` 2개 wrapper는 **유지** (BlobStorage 직접 호출 reshape만). 단 `resolveAdapterFor` import는 `usePorts().blob`로 교체.

## Consequences

### Positive
- 4개 도메인 wrapper 중 2개 제거 (lib LOC -100 추정)
- Provider 외부 시그니처 보존으로 UI 컴포넌트 변경 0
- cascade remove로 호출 사이트 1줄 감소 (`uninstall` 별도 호출 불필요)
- v2 Cloud 어댑터가 동일 인터페이스만 구현하면 됨 (RLS는 ownerId 필드로 격리)

### Negative
- cascade 비원자성 (D4) — 부분 실패 시 orphan installed-mark 발생 가능
- contentRef 모델 v2.1 reshape 부담 (D7)
- list 메서드의 `source: 'built-in'` 분기는 호출자가 카탈로그 별도 lookup 필요

### Neutral
- LocalAppRepository는 BlobStorage 위 thin layer (~150 LOC 추정)
- 테스트: BlobStorage mock 주입으로 contract test 격리 가능

## Alternatives

### A1. AppRepository에 4 namespace 모두 흡수
- Pros: 단일 Port 통합, namespace-registry 일관성
- Cons: `list/get/upsert(id)` 의미론이 desktop-layout 단일 키 문서와 부정합. `upsert('current', record)` 형태는 어색
- 거부 이유: ADR-0017 §D1.4 BlobStorage는 namespace+key 모델로 단일 key 문서를 자연스럽게 처리

### A2. AppRepository를 BlobStorage와 같은 layer (IDB 직접 호출)
- Pros: IDB 단일 트랜잭션으로 cascade 원자성 보장
- Cons: BlobStorage가 제공하는 IDB/OPFS/Memory 폴백 로직 중복 구현
- 거부 이유: D2의 high-level→low-level 구조가 SOLID DIP에 부합

### A3. cascade 미적용 (호출자가 명시 호출)
- Pros: 원자성 책임이 호출자에 명시
- Cons: 호출 사이트마다 동일 패턴 반복, 누락 시 inconsistent
- 거부 이유: REFAC-01 H-4 (use-persistence 공통화) 정신과 일치 — Port가 일관성 책임

### A4. AppRepository v2.1 분리 — AppCatalog + InstallationTracker
- Pros: SRP 강화
- Cons: POC 시점 v2 진입 비용 증가
- 거부 이유: ADR-0017 §D8에서 이미 v2.1 reshape 여지로 결정

## 사용자 결정 (2026-05-27 확정)

| Q | 결정 |
|---|------|
| Q19-1 책임 범위 | ✅ 앱 관련 2 namespace만 (desktop-layout/settings는 BlobStorage 직접) |
| Q19-2 cascade remove | ✅ 자동 unmark (v2.1 트랜잭션 원자화) |
| Q19-3 contentRef v2.0 | ✅ inline 유지 + v2.1 분리 (마이그레이션 리스크 최소화) |
| Q19-4 desktop wrapper | ✅ 유지 (BlobStorage 직접 호출 reshape) |
| Q19-5 defaultOwnerId | ✅ opts 인자로 LocalAuth anon UserId 주입 |

## 마이그레이션 단계

1. `packages/adapters-local/src/app-repository/local-app-repository.ts` 신규 (~150 LOC)
2. Vitest contract test 작성 (`list/get/upsert/remove/markInstalled/unmarkInstalled/listInstalled` 14 케이스)
3. `apps/web/src/lib/repo/types.ts` 신규 — UserAppRecord/InstalledAppRecord 타입 이동
4. `apps/web/src/lib/ports/PortsContext.tsx`에서 LocalAppRepository 주입 (ADR-0023)
5. `UserAppsProvider` 내부 reshape — `usePorts().repo` 호출
6. `InstalledAppsProvider` 내부 reshape — 동일 패턴
7. `apps/web/src/lib/storage/{installed-apps,user-apps}.ts` 제거
8. `desktop-layout.ts` / `desktop-settings.ts`의 `resolveAdapterFor` → `usePorts().blob`로 교체
9. 기존 Vitest 14개(installed-apps, user-apps 관련) 갱신 또는 contract test로 흡수
10. e2e 회귀 — 앱 설치/삭제/업데이트 시나리오 PASS 확인

## 리스크

| ID | 리스크 | 영향 | 대응 |
|----|--------|------|------|
| R1 | cascade remove 부분 실패 (orphan installed-mark) | UI에 "설치됨" 표시 잔존, 동작 불일치 | startup 시 `listInstalled()` 결과를 `list({source:'user'})`와 cross-check하여 orphan 정리 (별도 함수) |
| R2 | contentRef inline 모델의 IDB record 사이즈 한도 | 1MB ZIP → ~2MB record (htmlContent + base64 등) | MAX_ZIP_BYTES 1MB 유지 + record당 5MB 이상 시 throw로 가드. v2.1 분리 시점 트리거 |
| R3 | UserAppRecord ↔ AppRecord 변환 함수 누락 | type 불일치 빌드 에러 | `toAppRecord/toUserAppRecord` 양방향 어댑터 함수 + 단위 테스트 8 케이스 |
| R4 | 4개 Vitest 파일 변경 범위 | 기존 테스트 회귀 | Vitest 14개 PASS 유지 + contract test 신규 14개 = 총 28개 |
