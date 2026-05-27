---
number: "0023"
title: Adapter Resolver + Composition Root — createPorts() + PortsContext + 동적 import
status: accepted
date: 2026-05-27
author: hanumoka
related: ["0017", "0018", "0019", "0020", "0021", "0022"]
---

# ADR-0023: Adapter Resolver + Composition Root

## Context

ADR-0017 §D4에서 어댑터 선택은 하이브리드(Local 정적 / Cloud 동적 import)로 결정되었다. 이 ADR은 (1) Port 인스턴스 생성 + 주입 지점(Composition Root), (2) Cloud 어댑터 동적 import 시점, (3) React Provider 패턴, (4) 테스트 환경 mock 주입, (5) namespace-registry adapterPolicy 확장을 정의한다.

현재 코드는 부분적으로 Resolver 패턴이 적용되어 있다.
- `packages/storage/src/resolve-adapter.ts`: namespace-registry 기반 lazy singleton (`resolveAdapterFor`)
- `apps/web/src/app/layout.tsx`: Provider 트리(PersistenceErrorProvider → DesktopSettingsProvider → ...) 직접 wiring
- 5 Provider 모두 `import` 정적 의존 (Local 가정)

5 Port 도입 후 layout.tsx + 각 Provider는 `usePorts()` 단일 hook으로 추상화되어야 한다. 이 ADR은 그 wiring을 정의한다.

## Decision

### D1. createPorts(config) 시그니처 — config override + 기본 Local

```typescript
// packages/adapters-local/src/resolver.ts
import type {
  AuthProvider, AppRepository, BlobStorage, SyncProvider, ModerationProvider,
} from '@zm/core/ports';

export type PortsConfig = {
  readonly auth?: AuthProvider;
  readonly repo?: AppRepository;
  readonly blob?: BlobStorage;
  readonly sync?: SyncProvider;
  readonly moderation?: ModerationProvider;
};

export type Ports = {
  readonly auth: AuthProvider;
  readonly repo: AppRepository;
  readonly blob: BlobStorage;
  readonly sync: SyncProvider;
  readonly moderation: ModerationProvider;
};

export function createLocalPorts(config?: PortsConfig): Ports {
  const blob = config?.blob ?? createLocalBlobStorage();
  return {
    auth: config?.auth ?? createLocalAuth({ blobStorage: blob }),
    repo: config?.repo ?? createLocalAppRepository(blob),
    blob,
    sync: config?.sync ?? createLocalNoOpSync(),
    moderation: config?.moderation ?? createLocalStaticModeration(),
  };
}
```

config override는 테스트 + Cloud 어댑터 교체에 모두 사용. 미지정 Port는 Local 기본값. 의존성 순서: `blob → auth, repo` (둘 다 blob 주입), 나머지는 독립.

### D2. Cloud 어댑터 동적 import 시점 — 첫 호출 lazy + Suspense boundary

`apps/web/src/lib/ports/index.ts`(Composition Root)는 환경 변수 + 사용자 설정에 따라 어댑터를 선택한다.

```typescript
// apps/web/src/lib/ports/index.ts
import { createLocalPorts } from '@zm/adapters-local/resolver';

export async function resolvePorts(): Promise<Ports> {
  const mode = readPortMode();    // env > userSetting > 'local'

  if (mode === 'local') {
    return createLocalPorts();
  }

  // Cloud: lazy dynamic import (Turbopack code-split)
  if (mode === 'cloud-supabase') {
    const { createCloudSupabasePorts } = await import('@zm/adapters-cloud-supabase');
    const localBlob = createLocalBlobStorage();
    return createCloudSupabasePorts({ localFallbackBlob: localBlob });
  }

  throw new PortError('unknown mode', 'app-repository', 'INVALID_MODE');
}
```

**PortsProvider 내부에서 `use(resolvePorts())` Suspense boundary**:

```typescript
// apps/web/src/lib/ports/PortsContext.tsx
'use client';
import { use } from 'react';

const portsPromise = resolvePorts();  // module top-level — 1회 실행

export function PortsProvider({ children }) {
  const ports = use(portsPromise);    // Suspense boundary
  return <PortsContext.Provider value={ports}>{children}</PortsContext.Provider>;
}
```

Local-only 사용자: `mode === 'local'` 분기에서 정적 import만 사용 → Cloud 번들 tree-shake. Cloud 사용자: 첫 페이지 진입 시 동적 import 1회 (Suspense fallback 표시).

### D3. React Provider 패턴 — PortsContext + usePorts() hook

단일 module export(`ports.repo.list()`) 대신 PortsContext + `usePorts()` hook 선택. 근거:
- 테스트에서 `<TestPortsProvider value={mockPorts}>`로 쉽게 주입 가능
- React 19 `use(context)` 호환
- React 외부(non-component lib)는 module export 자체가 없으므로 영향 없음 (lib 함수는 ports를 인자로 받음)

```typescript
// apps/web/src/lib/ports/PortsContext.tsx
export const PortsContext = createContext<Ports | null>(null);

export function usePorts(): Ports {
  const ports = useContext(PortsContext);
  if (ports === null) throw new Error('usePorts: PortsProvider 하위에서 호출');
  return ports;
}
```

### D4. 테스트 환경 mock 주입 — TestPortsProvider + createTestPorts

```typescript
// apps/web/src/lib/ports/testing.tsx (Vitest 전용)
export function createTestPorts(overrides?: PortsConfig): Ports {
  return createLocalPorts({
    blob: createTestBlobStorage(),
    ...overrides,
  });
}

export function TestPortsProvider({ children, ports }: { children; ports?: Ports }): JSX.Element {
  const value = ports ?? createTestPorts();
  return <PortsContext.Provider value={value}>{children}</PortsContext.Provider>;
}
```

Vitest 6개 파일이 사용 가능. e2e Playwright는 production-like 환경이므로 `createLocalPorts()` 그대로.

### D5. adapterPolicy 확장 — Port + namespace 2 차원

기존 `namespace-registry.ts`의 `adapterPolicy: 'idb-only' | 'default'`는 BlobStorage Port 한정. 5 Port 도입 후 Port별로 정책이 다를 수 있다 (Auth는 namespace 무관, Repo는 user-apps만 cloud sync 가능 등).

```typescript
// packages/core/src/namespace-registry.ts (확장)
export type AdapterPolicy =
  | { readonly port: 'blob-storage'; readonly adapter: 'local-idb' | 'local-opfs' | 'local-memory' }
  | { readonly port: 'app-repository'; readonly adapter: 'local-idb' | 'cloud-supabase' }
  | { readonly port: 'sync'; readonly adapter: 'local-noop' | 'cloud-supabase' };

export type NamespaceEntry = {
  readonly name: NamespaceId;
  readonly sinceVersion: number;
  readonly adapterPolicies: ReadonlyArray<AdapterPolicy>;  // ⚠️ 복수형
};

export const NAMESPACE_REGISTRY = [
  {
    name: 'installed-apps',
    sinceVersion: 1,
    adapterPolicies: [
      { port: 'blob-storage', adapter: 'local-idb' },
      { port: 'app-repository', adapter: 'local-idb' },  // POC 한정
      { port: 'sync', adapter: 'local-noop' },
    ],
  },
  // ...
] as const;
```

기존 단일 `adapterPolicy: 'idb-only'`는 `adapterPolicies` 배열의 `blob-storage` 엔트리로 마이그레이션. resolveByPolicy 함수는 `adapterPolicies.find(p => p.port === 'blob-storage')` 기반.

### D6. 환경 감지 우선순위 — env > 사용자 설정 > namespace-registry 기본

```typescript
function readPortMode(): 'local' | 'cloud-supabase' {
  // 1. env 변수 (build time)
  if (process.env.NEXT_PUBLIC_PORTS_MODE) return process.env.NEXT_PUBLIC_PORTS_MODE as any;

  // 2. 사용자 설정 (DesktopSettingsRecord 확장 — 옵션)
  // SSR safe: typeof window guard
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('zm:ports-mode');
    if (stored === 'local' || stored === 'cloud-supabase') return stored;
  }

  // 3. 기본
  return 'local';
}
```

env 변수가 최우선 — 빌드 시 Cloud 사용자가 명시적으로 enable. 사용자 설정은 런타임 토글용 (v2 사용자 시나리오 F: Local↔Cloud 전환). 기본값은 'local' (로컬-우선 원칙).

### D7. layout.tsx reshape

```typescript
// apps/web/src/app/layout.tsx
import { PortsProvider } from '@/lib/ports/PortsContext';

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>
        <PortsProvider>          {/* ⚠️ 신규 — Suspense boundary */}
          <PersistenceErrorProvider>
            <DesktopSettingsProvider>
              <UserAppsProvider>
                <InstalledAppsProvider>
                  <WindowManagerProvider>{children}</WindowManagerProvider>
                </InstalledAppsProvider>
              </UserAppsProvider>
            </DesktopSettingsProvider>
          </PersistenceErrorProvider>
        </PortsProvider>
      </body>
    </html>
  );
}
```

`PortsProvider`가 최외곽 — 다른 Provider 모두 `usePorts()` 호출 가능. Suspense boundary는 React 19의 `use()` 자동 처리.

### D8. Cloud 어댑터 패키지 미존재 시 빌드 안전성

POC v2.0 진입 시점에 `@zm/adapters-cloud-supabase` 패키지는 미존재 가능. `await import('@zm/adapters-cloud-supabase')`는 빌드 시 unresolved module로 실패 가능 → `@ts-expect-error` + `webpackIgnore: true` magic comment + runtime catch로 graceful fail.

```typescript
async function loadCloudPorts() {
  try {
    // @ts-expect-error — optional peer dependency
    const mod = await import(/* webpackIgnore: true */ '@zm/adapters-cloud-supabase');
    return mod.createCloudSupabasePorts();
  } catch (e) {
    console.warn('[ports] Cloud adapter not installed, falling back to local');
    return createLocalPorts();
  }
}
```

v2 Cloud Epic 진입 시 이 패턴 정제 — ADR-0024+에서 명시 import + peerDependencies 등재.

## Consequences

### Positive
- Composition Root 단일 지점 (`apps/web/src/lib/ports/index.ts`) — 어댑터 wiring SSOT
- Cloud 어댑터 tree-shake 보장 (Local-only 빌드 시 Cloud 번들 0)
- TestPortsProvider로 Vitest mock 주입 단순화
- adapterPolicies 확장으로 Port별 정책 분리 가능
- React 19 `use()` + Suspense로 PortsContext 자연스럽게 async

### Negative
- 모듈 top-level `resolvePorts()` 실행 → SSR 환경에서 Local 어댑터도 IDB 접근 가드 필요 (각 어댑터 내부에 isIDBAvailable 보존)
- adapterPolicies 배열 형식 변경 → namespace-registry 기존 호출자 5+ 곳 reshape
- Suspense fallback UI 추가 필요 (Cloud 동적 import 첫 호출 시)

### Neutral
- module top-level Promise는 Next.js 16 App Router에서 1회 실행 보장 — React 19 use() 캐시
- Local 모드는 동적 import 없으므로 cold start 영향 0

## Alternatives

### A1. 단일 module export ports.repo.list()
- Pros: 호출 간결 (`import { ports } from '@/lib/ports'`)
- Cons: 테스트 시 module mock 필요 (vi.mock), Cloud 동적 import와 충돌 (top-level await)
- 거부 이유: Vitest mock 복잡도 + SSR top-level await 제약

### A2. Cloud 어댑터 앱 시작 시 await (lazy 아님)
- Pros: 단순 — Promise 캐싱 불필요
- Cons: Local 사용자도 Cloud 번들 로드 대기 → 초기 페이지 LCP 회귀
- 거부 이유: 로컬-우선 원칙 위배

### A3. createPorts({ mode })로 빌드 타임 결정
- Pros: tree-shake 명확
- Cons: 런타임 토글 불가 (v2 시나리오 F 차단)
- 거부 이유: ADR-0017 §D4 하이브리드 결정과 충돌

### A4. PortsContext 없이 useSyncExternalStore
- Pros: ports 변경 구독 가능
- Cons: ports는 immutable singleton (변경 안 됨) — 구독 불필요
- 거부 이유: 단순화 우선

## 사용자 결정 (2026-05-27 확정)

| Q | 결정 |
|---|------|
| Q23-1 createPorts 시그니처 | ✅ config override + Local 기본 (테스트 mock + Cloud 교체 양립) |
| Q23-2 Cloud 동적 import 시점 | ✅ 첫 호출 lazy + Suspense boundary (B+C 조합) |
| Q23-3 Provider 패턴 | ✅ PortsContext + usePorts hook (테스트 주입 + DIP) |
| Q23-4 Test 구조 | ✅ TestPortsProvider + createTestPorts (module mock 회피) |
| Q23-5 adapterPolicies 확장 | ✅ Port + namespace 2차원 배열 |
| Q23-6 환경 감지 우선순위 | ✅ env > 사용자 설정 > 기본 |

## 마이그레이션 단계

1. `packages/core/src/namespace-registry.ts` adapterPolicies 배열 형식 reshape (기존 단일 `adapterPolicy: 'idb-only'` → `adapterPolicies: [...]`)
2. `packages/adapters-local/src/resolver.ts` 신규 — createLocalPorts 구현
3. `apps/web/src/lib/ports/index.ts` 신규 — resolvePorts + readPortMode
4. `apps/web/src/lib/ports/PortsContext.tsx` 신규 — PortsProvider + usePorts hook
5. `apps/web/src/lib/ports/testing.tsx` 신규 — TestPortsProvider (Vitest)
6. `apps/web/src/app/layout.tsx` PortsProvider 최외곽 추가
7. 5 Provider 내부 reshape — `import` 대신 `usePorts()` 사용
8. Vitest 기존 6 파일에서 `<TestPortsProvider>` wrap 추가
9. Cloud 어댑터 graceful fallback 검증 (`@zm/adapters-cloud-supabase` 미설치 환경에서 빌드 PASS)
10. e2e Playwright 6 시나리오 회귀 PASS

## 리스크

| ID | 리스크 | 영향 | 대응 |
|----|--------|------|------|
| R1 | module top-level `resolvePorts()` Promise — SSR 시 IDB 접근 → 에러 | Next.js prerender 실패 | 각 어댑터 내부 `isIDBAvailable()` 가드 보존 (현재 코드 유지) — Promise 자체는 throw 안 함, 메서드 호출 시점에 polyfill |
| R2 | Cloud 어댑터 패키지 미존재 시 dynamic import 빌드 실패 | v2.0 빌드 broken | `webpackIgnore: true` magic comment + runtime try/catch (D8) |
| R3 | adapterPolicies 배열 reshape — 기존 호출자 5+ 곳 변경 | 작업 비대 | resolveByPolicy 함수 1곳만 변경, 외부 API는 그대로 (`adapterPolicy` getter alias 유지) |
| R4 | Suspense fallback UI 미정의 → 첫 화면 빈 화면 | UX 회귀 | PortsProvider에 명시적 `<Suspense fallback={<LoadingDesktop />}>` 또는 PortsProvider 내부 fallback 처리 |
| R5 | Vitest TestPortsProvider 누락 시 Provider null → throw | 테스트 깨짐 | Vitest setup file에 자동 wrap 또는 명시 강제 (lint rule 검토) |
| R6 | PortMode 사용자 설정 localStorage 접근 → SSR 시 undefined | hydration mismatch | typeof window guard + useEffect 내부 토글 적용 |

## 검증할 가정 (research-analyst 위임 필요)

| 가정 | 검증 방법 |
|------|----------|
| G1. React 19 `use(promise)` + Suspense가 module top-level Promise 캐싱 | research-analyst: React 19 docs + Next.js 16 App Router 호환 |
| G2. Turbopack `webpackIgnore` 동등 magic comment 지원 | research-analyst: Turbopack docs 또는 `'@vite-ignore'` 등가 |
| G3. `process.env.NEXT_PUBLIC_PORTS_MODE` 클라이언트 노출 — Next.js 16 동작 검증 | research-analyst: Next.js 16 env 변수 docs |
| G4. namespace-registry adapterPolicies 배열 reshape 시 기존 5+ 호출자 영향 범위 | lib-developer: grep `adapterPolicy` 전체 + 마이그레이션 PR로 일괄 |
