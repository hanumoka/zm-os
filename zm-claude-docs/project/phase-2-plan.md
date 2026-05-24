# Phase 2 Plan

**Version**: 0.1.0
**Created**: 2026-05-24
**Status**: 작업 1 ✅ 완료 — 작업 2/4 진입 가능

---

## §1. 사용자 결정 (확정)

| 항목 | 결정 |
|------|------|
| Phase 2 범위 | **코어** — STR-01/02 + STG-01 + APP-03 + GAME-01 (APP-02 ZIP은 Phase 3) |
| 첫 작업 단위 | **STR-01/02** (스토어 UI + 설치 흐름) |
| 게임 엔진 | **Phaser 3** (가장 표준, 2D 게임) |

---

## §2. 작업 단위 분할 (4개)

| # | 작업 | 산출 | 의존성 | 상태 |
|---|------|------|--------|------|
| 1 | **STR-01/02**: 스토어 UI + 설치 흐름 | `/store` 라우트 + 카탈로그 카드 + 설치 Context + 데스크탑 아이콘 동기화 | — | ✅ 완료 |
| 2 | **STG-01**: IndexedDB 추상화 | `src/lib/storage/indexeddb.ts` (CRUD + Safari 폴백 검토) | — | ⏳ 대기 |
| 3 | **APP-03 + ADR-0006 reshape**: 설치 영속화 | `useInstalledApps()` IndexedDB hydration + ADR-0007 신규 | 작업 2 | ⏳ 대기 |
| 4 | **GAME-01**: Phaser 3 게임 | `public/sample-game-phaser/` + desktopApps 엔트리 추가 | 작업 1 (스토어에 등재) | ⏳ 진입 가능 |

순서: 1 → 2 → 3 → 4 (4는 1 완료 후 언제든 진입 가능)

---

## §3. 작업 1 — architect 결정 (자동 채택, P1~P5)

architect 보고 (Opus, 본 세션) 추천 그대로 자동 채택. goal "사용자에게 묻지 말고 진행" 컨텍스트.

| ID | 항목 | 결정 |
|----|------|------|
| **P1** | 카탈로그 데이터 모델 | **A** — `DesktopAppEntry` 확장 (단일 모델, ADR-0006 prefigure) |
| **P2** | 설치 상태 storage | **α** — 메모리 React Context + useReducer (작업 3에서 IndexedDB로 reshape, 인터페이스 무변경) |
| **P3** | 데스크탑 아이콘 정책 | **i + iii** — 설치된 앱만 + "스토어" 시스템 아이콘 1개 |
| **P4** | 카탈로그 정의 위치 | **x** — `desktopApps.ts` 확장 |
| **P5** | 라우팅 | **r1** — `/store` 단일 라우트 + 사이드 패널 (modal 미사용) |
| Provider scope | `layout.tsx`에 Provider 배치 | **옵션 A** — `/`와 `/store`가 같은 설치 상태 공유 |

### 신규 정책 등재 예정 (doc-updater 단계, 작업 1 종료 시)
- **PROD-03**: 설치 상태 storage = POC v1 메모리 (Context) → v2 IndexedDB 작업 3에서 reshape
- **PROD-04**: 데스크탑 아이콘 표시 규칙 = 설치된 앱 + "스토어" 시스템 아이콘 1개

---

## §4. 작업 1 — 산출물 명세 (architect §3 시그니처)

### 신규 파일 (5개)
| 경로 | 책임 |
|------|------|
| `src/app/store/page.tsx` | 스토어 라우트 entry. 헤더 + 카테고리 필터 + grid + 사이드 패널 |
| `src/components/store/InstalledAppsProvider.tsx` | Context + useReducer. `useInstalledAppsContext` accessor |
| `src/components/store/useInstalledApps.ts` | Provider 외부 분리 hook |
| `src/components/store/AppCard.tsx` | 카드 (아이콘 + 이름 + description + "설치됨" 배지, a11y role/tabIndex) |
| `src/components/store/AppDetail.tsx` | 상세 패널 (longDescription + screenshots + 설치/제거 CTA) |

### 수정 파일 (3-4개)
| 경로 | 변경 |
|------|------|
| `src/components/desktop/desktopApps.ts` | `DesktopAppEntry` STR optional 필드 추가 + 기존 2 엔트리에 description/category 등 채움 |
| `src/components/desktop/Desktop.tsx` | `useInstalledApps()` 필터링 + "스토어" 시스템 아이콘 + `showStoreIcon?: boolean` props |
| `src/app/layout.tsx` | `InstalledAppsProvider` + `WindowManagerProvider` 중첩 |
| `src/app/page.tsx` | Provider 제거 (layout으로 이동), Desktop만 렌더 |

**합계**: 신규 5 + 수정 3-4 = **8-9 파일** (work-units.md ~10 한도 정확)

---

## §5. 작업 1 — 인터페이스 명세 (핵심)

### DesktopAppEntry 확장
```ts
export type DesktopAppCategory = 'game' | 'utility' | 'demo';

export type DesktopAppEntry = {
  // 기존 필드 (id, name, icon, manifest, contentUrl, ipc?, iconPosition?, windowDefaults?) 유지
  // 신규 optional 필드:
  description?: string;
  longDescription?: string;
  category?: DesktopAppCategory;
  screenshots?: ReadonlyArray<string>;
  author?: string;
  version?: string;
};
```

### InstalledAppsContextValue
```ts
type InstalledAppsContextValue = {
  installedIds: ReadonlySet<string>;
  isInstalled: (id: string) => boolean;
  install: (id: string) => void;
  uninstall: (id: string) => void;
};
```

### Provider 중첩 (layout.tsx)
```
<InstalledAppsProvider>
  <WindowManagerProvider>
    {children}
  </WindowManagerProvider>
</InstalledAppsProvider>
```

---

## §6. 가정 (작업 1 — 사용자 검증 deferred)

| ID | 가정 | 검증 방법 |
|----|------|---------|
| A1 | layout.tsx Provider scope 옵션 A 시 `/`와 `/store` 같은 Context 공유 | dev e2e: 스토어에서 설치 → 데스크탑 아이콘 즉시 출현 |
| A6 | 설치 안 된 앱이 윈도우에 남는 경우 = 윈도우 유지 + 다음 close 시 종료 (POC v1) | v2 reshape 시 uninstall confirmation + auto-close |
| A4 | "스토어" 시스템 아이콘 = `🛒` emoji + 라벨 "스토어" (UX 단순화) | 사용자 피드백 시 reshape |

---

## §7. 다음 세션 진입 지점 (재부팅 후)

1. **본 plan 파일 + architect 보고** 다시 확인 (필요 시 architect 재호출은 불필요 — 결정 모두 보관)
2. **fe-developer 호출** (`Agent` tool, model: `sonnet`)
   - prompt: §4 산출물 + §5 인터페이스 명세 + 자동 채택 결정 (P1~P5 + Provider 옵션A)
3. fe-developer 완료 후 → 검증 4명 병렬 (build-checker / code-reviewer / app-sandbox-auditor lightweight / constraint-checker)
4. self-verifier → doc-updater → 커밋

### doc-updater 단계 처리 예정
- `policy-registry.md` PROD-03/04 등재
- `decisions/index.md` ADR-0006 §References에 본 작업 산출물 append
- `prd.md` §3 STR-01/02 ⏳ → ✅
- `roadmap.md` Phase 2 진행률 0/4 → 1/4

---

## §8. 다음 작업 단위 (작업 2, 3, 4)

### 작업 2: STG-01 IndexedDB 추상화
- `src/lib/storage/indexeddb.ts` — open/get/put/delete/list 기본 CRUD
- Safari 호환성 검증 (research-analyst 위임)
- OPFS는 STG-02 별도 (Phase 3로 이관 권장)

### 작업 3: APP-03 + ADR-0006 reshape
- `useInstalledApps()` IndexedDB hydration (useEffect에서 1회 load)
- `install`/`uninstall`에 background persist
- ADR-0007 신규 (IndexedDB 도입 결정)
- ADR-0006 superseded 또는 §Consequences 갱신

### 작업 4: GAME-01 Phaser 3 게임
- `public/sample-game-phaser/` — Phaser 3 단순 게임 (스네이크/퍼즐 후보)
- `npm install phaser` (게임 자체에 번들로 포함 — sandbox iframe 안에서 동작)
- desktopApps.ts에 엔트리 추가 (category: 'game', description, screenshots 등 풍부)
- iframe sandbox + null origin 호환 검증 (Phase 1 research 기준 PASS 예정)
- 작업 단위 한도: 3-4 파일

---

## §9. 핵심 우선순위 / 제약

- **POC 1차 빠른 검증 우선** (사용자 명시)
- **work-units.md ~10 파일/단위 한도 준수**
- **새 정책 결정은 사용자 확인** — 단, goal 컨텍스트에서 architect 명확 추천 시 자동 채택 (본 작업 1 채택 패턴)
- **사용자 검증 deferred 누적** — 각 작업 단위 종료 시 self-verifier가 명시

---

**최종 갱신**: 2026-05-24 (재부팅 직전, 작업 1 fe-developer 호출 직전 중단)
