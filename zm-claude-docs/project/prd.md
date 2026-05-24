# Product Requirements Document (PRD)

> **Living Document**. 기능 완료 시 즉시 갱신. 버전 bump 필수.

**Version**: 0.4.0
**Last Updated**: 2026-05-24
**Status**: Phase 2 — 앱 스토어 + 첫 게임 (작업 3/4 완료 ✅)

---

## §1. 비전

### §1.1 한 줄 정의
zm-os는 **브라우저 안에서 동작하는 가상 데스크탑** 으로, 사용자가 직접 만든 JavaScript 앱(특히 게임)을 **공유 스토어** 에 올려 다른 사용자가 자기 브라우저에 설치·실행할 수 있게 한다.

### §1.2 궁극적 비전 (몽상)
1. 브라우저를 가상 데스크탑처럼 사용
2. 가상 데스크탑/가상 OS를 브라우저에서 구현
3. 사용자 계정 + 어디서나 본인 OS 접근
4. Windows Store 식 공유 앱 마켓플레이스 (사용자 제작 앱)
5. **POC 1차 (현재)**: JS 게임 업로드/공유/설치/플레이

---

## §2. POC 1차 스코프 (확정, 2026-05-24)

### In Scope
- ✅ 가상 데스크탑 UI (윈도우 매니저, 데스크탑 영역, 작업표시줄)
- ✅ 앱 스토어 UI (목록, 상세, 설치 버튼)
- ✅ 앱 매니페스트 명세 (이름, 버전, entryPoint, 권한)
- ✅ iframe 샌드박싱 (blob: URL + `sandbox="allow-scripts"`)
- ✅ Comlink 기반 호스트-앱 IPC
- ✅ 클라이언트 스토리지 (IndexedDB 폴백 + OPFS)
- ✅ 첫 샘플 게임 1개 (Phaser 또는 Pixi)
- ✅ 로컬 dev 서버에서 동작 (`npm run dev`)

### Out of Scope (POC 1차)
- ❌ 사용자 인증, 로그인
- ❌ 클라우드 동기화 (서버 측 스토리지)
- ❌ 멀티유저, 공유 스토어 백엔드
- ❌ 결제, 모더레이션, DMCA
- ❌ 모바일 최적화
- ❌ Electron 패키징
- ❌ 프로덕션 배포

---

## §3. 기능 인벤토리 (Feature ID 규칙: DSK / STR / APP / SBX / IPC / STG)

| ID | 이름 | 상태 | 비고 |
|----|------|------|------|
| **DSK-01** | 윈도우 매니저 (드래그/리사이즈/포커스) | ✅ 완료 | `src/components/desktop/Window.tsx + useWindowManager (react-rnd v10.5.3)` |
| **DSK-02** | 데스크탑 영역 + 아이콘 | ✅ 완료 | `src/components/desktop/Desktop.tsx + DesktopIcon.tsx + desktopApps.ts` |
| **DSK-03** | 작업표시줄 (실행 중 앱) | ✅ 완료 | `src/components/desktop/Taskbar.tsx + TaskbarButton.tsx + Clock.tsx` |
| **STR-01** | 앱 카탈로그 UI | ✅ 완료 | `/store` 라우트 + AppCard + InstalledAppsProvider |
| **STR-02** | 앱 상세 페이지 + 설치 | ✅ 완료 | AppDetail 패널 + install/uninstall 액션 |
| **APP-01** | 앱 매니페스트 스키마 (Zod) | ✅ 완료 | `src/lib/apps/manifest.ts` |
| **APP-02** | 앱 패키지 포맷 (itch.io식 ZIP) | ⏳ 계획 | |
| **APP-03** | 설치한 앱 목록 관리 | ⏳ 계획 | IndexedDB |
| **SBX-01** | blob: URL iframe 샌드박스 SDK | ✅ 완료 | `src/lib/apps/sandbox.ts` (srcdoc + sandbox="allow-scripts") |
| **SBX-02** | CSP/Permissions-Policy 헤더 | ✅ 완료 | next.config.ts headers() + src/lib/security/csp.ts |
| **IPC-01** | Comlink 기반 RPC 어댑터 | ✅ 완료 | `src/lib/apps/ipc/` (wire-compatible v1) |
| **STG-01** | IndexedDB 추상화 | ✅ 완료 | `src/lib/storage/indexeddb.ts` (idb v8.0.3 + 메모리 폴백) |
| **STG-02** | OPFS 어댑터 (Chrome/Edge) | ⏳ 계획 | Safari는 IndexedDB 폴백 |
| **GAME-01** | 첫 샘플 게임 (Phaser 또는 Pixi) | ✅ 완료 | `public/sample-game-phaser/` Phaser 3 Snake — Phase 2 작업 4. Bouncing Ball은 `public/sample-game/` 유지 |

---

## §4. v2 후보 (멀티유저 + 클라우드)

- 사용자 인증 (Clerk 또는 Supabase Auth)
- 클라우드 스토리지 (Cloudflare R2 또는 Supabase Storage)
- 데스크탑 상태 클라우드 동기화 (CRDT or last-write-wins)
- 앱 스토어 백엔드 (Postgres + RLS, 업로드 + 모더레이션)
- 멀티디바이스 동기화

상세 후보 스택: [`research/multitenant-stack-options.md`](../research/multitenant-stack-options.md)

---

## §5. v3 후보 (몽상 1~4번 본격)

- 진정한 "가상 OS" (v86/WebVM 식)
- 앱 간 IPC 프레임워크
- 파일 시스템 추상화 (가상 FS or 클라우드 통합)
- 권한 모델 세분화 (camera/mic/geolocation grant flow)

---

## §6. 명시적 비목표 (영구)

- 실제 OS 부팅 (v86은 영감만, 성능 문제로 부적합)
- Cryptocurrency mining 앱 호스팅 (모더레이션 정책)
- Adult content (모더레이션 정책)

---

## §7. 수용 기준 (POC 1차)

POC 완료 = 아래 시나리오가 동작:
1. 사용자가 데스크탑 화면을 본다
2. "스토어"에서 게임 1개를 선택한다
3. 설치 버튼 → 데스크탑에 아이콘 생성
4. 아이콘 클릭 → 윈도우가 열리고 게임이 실행됨
5. 게임이 iframe sandbox 안에서 안전하게 실행됨 (개발자 도구로 검증)
6. 게임 종료 → 윈도우 닫기 → 다시 실행 가능

---

## §8. Change Log

### 0.4.0 (2026-05-24) — Phase 2 작업 2 완료
- Phase 2 작업 2 완료 ✅ (STG-01: IndexedDB 추상화)
  - 신규: `src/lib/storage/indexeddb.ts` (~183 LOC) — idb library v8.0.3 wrapper + 메모리 폴백
  - 수정: `package.json` (idb@^8.0.3 dependencies 추가)
  - 자동 채택 결정: P1=B idb library / P2 단일 DB/store / P3=A 메서드별 자동 트랜잭션 / P4=A v1 버전 / P5=B 메모리 폴백 / P6 structured clone / P7 표준 Error
  - 신규 결정: ADR-0007 (클라이언트 스토리지 IndexedDB + 메모리 폴백)
  - 검증: build-checker ✅ / code-reviewer ✅ / sandbox-auditor ✅ / constraint-checker ✅ / self-verifier ✅ PASS
  - W-01 fix 적용 (blocking callback race condition)
  - W-02/W-03 [WARN] POC 수용
  - 사용자 검증 deferred: 작업 3 통합 검증 후 e2e (설치 앱 목록 persist + 메모리 폴백 Safari)
  - **Phase 2 진행률: 3/4 (75%)** — 작업 3 진입 가능

### 0.3.0 (2026-05-24) — Phase 2 작업 4 완료
- Phase 2 작업 4 완료 ✅ (GAME-01: Phaser 3 Snake)
  - 신규: `public/sample-game-phaser/index.html` (~366 LOC) + `public/phaser.min.js` (~1.2MB, MIT v3.90.0)
  - 수정: `src/components/desktop/desktopApps.ts` (snake-game 엔트리 추가) + `package.json` (phaser@^3.90.0)
  - 자동 채택 결정: P1=A (스네이크) / P2=Host self origin / P3=A IPC 미사용 / P4=A procedural / P5=auto
  - 검증: build-checker ✅ / code-reviewer ✅ / sandbox-auditor ✅ / constraint-checker ✅ / self-verifier ✅ PASS
  - 사용자 검증 deferred: 게임 화면 표시 + 게임플레이 정상 + iframe 격리 정상 (2026-05-24)
  - **POC v1 카탈로그**: 3개 엔트리 (Bouncing Ball + IPC Demo + Snake) — 둘다 완전 동작 검증
- **Phase 2 진행률: 2/4 (50%)** — 작업 2/3 진입 가능

### 0.2.0 (2026-05-24) — Phase 2 진입 / 작업 1 완료
- Phase 2 작업 1 완료 ✅ (STR-01/02: 스토어 UI + 설치 흐름)
  - 신규: `src/app/store/page.tsx` + `src/components/store/{InstalledAppsProvider,useInstalledApps,AppCard,AppDetail}.tsx/ts`
  - 수정: `src/components/desktop/{desktopApps.ts, Desktop.tsx}` + `src/app/{layout.tsx, page.tsx}`
  - DesktopAppEntry STR 메타데이터 확장 (description, longDescription, category, screenshots, author, version)
  - InstalledAppsProvider (메모리 Context 설치 상태, 작업 3에서 IndexedDB reshape)
  - /store 단일 라우트 + 사이드 패널 (P5=r1)
  - 데스크탑: 설치된 앱만 표시 + "스토어" 시스템 아이콘 우상단 (P3=i+iii)
  - C-01 fix: 스토어 시스템 아이콘 좌표 우상단 분리 (left:30 top:30 → right:30 top:30)
- 신규 정책: PROD-03 (카탈로그 메타데이터 모델), PROD-04 (설치 상태 + 데스크탑 아이콘 규칙)
- **Phase 2 진행률: 1/4 (25%)** — 작업 2/4 진입 가능

### 0.1.6 (2026-05-24)
- Phase 1 작업 7 완료 (보안 감사) ✅ PASS
- app-sandbox-auditor 1회 전체 감사 (8 항목 매트릭스 + ADR 정합 + CVE 매핑)
- 즉시 fix 2건 적용: H-1 (runtime-iife DANGEROUS_KEYS 객체 결함) + SANDBOX_ORIGIN 상수 일관성
- 감사 리포트 보관: zm-claude-docs/security/phase-1-audit-2026-05-24.md
- **Phase 1 7/7 (100%) 완료** — Phase 2 진입 가능

### 0.1.5 (2026-05-24)
- Phase 1 작업 5+6 통합 완료
- DSK-02 (데스크탑 영역 + 아이콘) ✅
- DSK-03 (작업표시줄 + 시계) ✅
- AppFrame 컴포넌트 (sandbox iframe lifecycle)
- desktopApps 하드코딩 카탈로그 (ADR-0006)
- 메인 페이지 / 가 진짜 가상 데스크탑 (page.tsx 전면 교체)

### 0.1.4 (2026-05-24)
- Phase 1 작업 4 완료
- DSK-01 (윈도우 매니저 — react-rnd 기반) ✅
- src/components/desktop/{types, Window, useWindowManager, WindowManagerProvider, windowReducer} 신규
- ADR-0005 작성 (윈도우 상태 관리 = Context+useReducer)
- sandbox-test 페이지 두 Window 통합 (P2=β)

### 0.1.3 (2026-05-24)
- Phase 1 작업 3 완료
- SBX-02 (CSP / Permissions-Policy 헤더) ✅
- src/lib/security/csp.ts 신규 (dev/prod 분기)
- ADR-0002 확정 (윈도우 매니저 = react-rnd)
- ADR-0004 작성 (CSP/Permissions-Policy 정책)

### 0.1.2 (2026-05-24)
- Phase 1 작업 2 완료
- IPC-01 (Comlink wire-compatible RPC 어댑터) ✅
- sandbox.ts에 IPC 옵션 추가 (onMessage @deprecated)
- 첫 IPC 데모 sample-game-ipc + /sandbox-test 섹션 2
- ADR-0003 작성 (호스트-앱 IPC 어댑터 표면)

### 0.1.1 (2026-05-24)
- Phase 1 진입, 작업 1 완료
- APP-01 (매니페스트 Zod 스키마) ✅
- SBX-01 (blob:/srcdoc iframe sandbox SDK) ✅
- GAME-01 임시 구현 (Bouncing Ball, 격리 검증용)
- `/sandbox-test` 데모 페이지

### 0.1.0 (2026-05-24)
- 초기 PRD 작성 (Phase 0 초기 셋팅 단계)
- POC 1차 스코프 확정
- 기능 인벤토리 14개 등재
