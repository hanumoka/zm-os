---
number: "0006"
title: 데스크탑 앱 카탈로그 모델 — POC v1 하드코딩 + v2 STR 전환
status: accepted
date: 2026-05-24
author: hanumoka
related: ["0001", "0002", "0005"]
---

# ADR-0006: 데스크탑 앱 카탈로그 모델 (POC v1 하드코딩)

## Context

PRD §3 DSK-02 (데스크탑 영역 + 아이콘) 와 §7 수용 기준 1·3·4·6 (데스크탑 화면 → 아이콘 클릭 → 윈도우 → 종료) 을 충족하려면 데스크탑이 "표시할 앱 목록" 을 알아야 한다. 그러나 STR-01/02 (앱 스토어 UI) 는 Phase 2 작업이고 APP-03 (설치한 앱 목록 IndexedDB) 도 미구현 단계이다.

사용자가 즉시 "OS같은 화면" (사용자 피드백, 2026-05-24) 을 보려면 작업 5+6 시점에 카탈로그 데이터 소스를 결정해야 한다.

## Decision

**POC v1 = `src/components/desktop/desktopApps.ts` 의 하드코딩 `DESKTOP_APPS` 배열을 사용한다.**

- 2개 엔트리 (Bouncing Ball, IPC Demo) — 기존 `public/sample-game/`, `public/sample-game-ipc/` 자산 재활용.
- 타입 정의: `DesktopAppEntry = { id, name, icon, manifest, contentUrl, ipc?, iconPosition?, windowDefaults? }`.
- 사용자는 카탈로그를 "이미 설치된 앱" 으로 인지. POC 1차에서 install 액션은 생략 (PRD §7 시나리오 2·3 단순화).
- `<Desktop apps>` props가 카탈로그 override 를 이미 허용 → 테스트/v2 reshape 시 대체 가능.

### v2 reshape 경로
- STR-01/02 작업 진입 시 `DESKTOP_APPS` 상수 → `useInstalledApps()` 훅 (IndexedDB 백엔드) 로 교체.
- `DesktopAppEntry` 타입은 그대로 유지 → DesktopIcon / Taskbar / AppFrame 인터페이스 무변경.
- AppFrame 의 `entry.manifest` + `entry.contentUrl` + `entry.ipc` 구조가 그대로 v2 InstalledApp 레코드와 호환되도록 prefigure.

## Consequences

### Positive
- 즉시 동작하는 데스크탑 UX 검증 가능 (사용자 피드백 즉시 충족).
- STR-01/02 작업 블로커 해소 (작업 5+6 진입에 STR 의존 없음).
- `DesktopAppEntry` 타입이 v2 STR 인터페이스를 미리 정의 → reshape 비용 낮음.
- `<Desktop apps>` props override 로 테스트/v2 모킹 용이.

### Negative
- ~~사용자가 새 게임 설치 불가~~ **Phase 3 작업 1에서 사용자 ZIP 업로드(APP-02) 추가** (ADR-0008 신규) → 사용자 source 도입으로 해소. PRD §7 시나리오 2·3 (스토어에서 선택 → 설치) 검증 완료.
- `desktopApps.ts` 변경 = 코드 변경. 기존 built-in 게임 도입 시 작업 단위 1개 소요. POC 단계 허용.
- ~~IndexedDB persist 미적용~~ **Phase 2 작업 3에서 설치 상태 IDB 영속화 완료** (인터페이스 무변경, ADR-0007 idb wrapper 활용). 윈도우/아이콘 위치 persist는 별도 작업 (DSK-04 reshape 후보).

## Alternatives Considered

### B. JSON 파일 (`public/desktop-apps.json`)
- STR 인터페이스 유사 (런타임 fetch).
- **기각 사유**: 빌드 단계 추가 없이 TS 타입 활용 → 하드코딩이 더 안전. JSON 파싱 + Zod 검증 부담 추가. POC 1차 가치 낮음.

### C. IndexedDB CRUD (`useInstalledApps`)
- 가장 v2-호환적 모델.
- **기각 사유**: STG-01 (IndexedDB 추상화) + APP-03 (설치한 앱 목록 관리) 미구현 단계. 작업 순서 위반. Phase 2 진입 시 본격 도입.

## References

- PRD §3 DSK-02, §3 STR-01/02 (`zm-claude-docs/project/prd.md`)
- PRD §7 수용 기준 (`zm-claude-docs/project/prd.md`)
- ADR-0002 (윈도우 매니저 = react-rnd)
- ADR-0005 (윈도우 상태 관리 = Context + useReducer)
- 사용자 피드백 (2026-05-24): "OS면 데스크탑 처럼 바탕화면, 작업표시줄, 바탕화면 아이콘이 있어야"
- architect 설계 보고 (Phase 1 작업 5+6 통합, 본 세션 컨텍스트)

### Phase 2 작업 1 (STR-01/02) 산출물 (2026-05-24)
- `src/components/store/{InstalledAppsProvider.tsx, useInstalledApps.ts, AppCard.tsx, AppDetail.tsx}`
- `src/app/store/page.tsx` (/store 라우트)
- `src/components/desktop/desktopApps.ts` (DesktopAppEntry STR 메타데이터 확장: description, longDescription, category, screenshots, author, version)
- `src/components/desktop/Desktop.tsx` (설치 필터링 + 시스템 아이콘 우상단)
- `src/app/layout.tsx` (Provider scope 옵션 A)
- 신규 정책: PROD-03, PROD-04

### Phase 2 작업 3 (APP-03 + ADR-0006 reshape) 산출물 (2026-05-24)
- `src/lib/storage/installed-apps.ts` (신규, 도메인 wrapper: listInstalledAppIds / persistInstalledApp / removeInstalledApp / InstalledAppRecord)
- `src/components/store/InstalledAppsProvider.tsx` (HYDRATE action + useEffect hydration + install/uninstall fire-and-forget persist)
- 인터페이스 무변경 (PROD-04 정합). 호출자 (Desktop.tsx, AppCard.tsx, AppDetail.tsx, useInstalledApps.ts) 무수정.
- 정책 결정: P1=A useEffect 1회 / P2=a 빈→채우기 / P3=α fire-and-forget / P4=ㄱ silent console.error / P5=III {id, installedAt} / P6=㉠ §Consequences 갱신 / P7=A 인터페이스 무변경 / P8 HYDRATE union (race-safe)

### Phase 2 작업 4 (GAME-01) 산출물 (2026-05-24)
- `public/sample-game-phaser/index.html` (Phaser 3 스네이크 게임, ~366 LOC)
- `public/phaser.min.js` (Phaser 3.90.0 MIT, host self origin 정적 자원, ~1.2MB)
- `src/components/desktop/desktopApps.ts` (snake-game 엔트리 추가, category: 'game' 최초 활성화)
- `package.json` (phaser@^3.90.0 dependencies 추가)
- Phaser 번들 전략: Host self origin 상대경로 `<script src="/phaser.min.js">` (Chrome 142+ CDN 차단 회피, research-analyst 결정)

### Phase 3 작업 1 (APP-02 사용자 ZIP 업로드) 산출물 (2026-05-24)
- `src/lib/apps/zip-loader.ts` (320 LOC, 신규 — ZIP 파싱 + 보안 검증 6단계)
- `src/lib/apps/user-apps.ts` (61 LOC, 신규 — UserAppRecord 타입)
- `src/components/store/UserAppsProvider.tsx` (155 LOC, 신규 — useUserApps hook)
- `src/components/store/AppUploadButton.tsx` (152 LOC, 신규 — 파일 업로드 UI)
- `src/lib/storage/indexeddb.ts` (DB_VERSION 2 추가 — STORE_USER_APPS)
- `src/components/desktop/desktopApps.ts` (buildCatalog 함수 추가 — user source 통합)
- `src/components/desktop/AppFrame.tsx` (source 분기 — built-in vs user HTML)
- `src/components/desktop/Desktop.tsx` (buildCatalog 호출)
- `src/app/store/page.tsx` (AppUploadButton 표시)
- `src/app/layout.tsx` (UserAppsProvider 추가)
- `package.json` (jszip@^3.10.1 dependencies 추가)
- 정책: PROD-05 신규 등재
- ADR-0008 신규
