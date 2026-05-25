# 정책 레지스트리 (Policy Registry)
> 확정 정책의 SSOT (Single Source of Truth). 사용자 결정 후 append/update.

## 정책 ID 규칙
- **ARCH-NN**: 아키텍처 결정
- **TECH-NN**: 기술 스택/도구 결정
- **PROD-NN**: 제품 정책 (기능 범위, UX)
- **CONST-NN**: 제약조건 (성능 목표, 메모리 한도 등)

## Active (현행 정책)

### ARCH-01: 단일 Next.js 풀스택 (2026-05-24)
- **결정**: POC 1차는 단일 Next.js 프로젝트 (App Router) + route handlers를 BE 대용. 모노레포는 v2.
- **이유**: POC 빠른 검증. 멀티유저 미도입 단계라 BE 분리 불필요.
- **재고 시점**: 멀티유저/클라우드 동기화 도입 시 packages/ 분리 검토.

### ARCH-02: iframe 샌드박싱 (2026-05-24, 정밀화 2026-05-24)
- **결정**: 사용자 제출 앱은 **blob: URL iframe + `sandbox="allow-scripts"`** 에서만 실행. 호스트-앱 통신은 Comlink-style RPC.
  - POC v1: 자체 wire-compatible 어댑터 (`src/lib/apps/ipc/`), srcdoc inline 호환, esbuild 불필요
  - v2: Comlink 라이브러리 도입 검토 — ADR-0003 정밀화 참조
- **이유**: 게임 엔진 호환성(Phaser/Pixi/Godot/Three.js), 구현 단순성, 검증된 보안 모델(Figma/itch.io 사용).
- **금지**: `allow-same-origin`, `allow-top-navigation`, `allow-popups-to-escape-sandbox`
- **상세 규칙**: `.claude/rules/security.md`

### TECH-01: 클라이언트 스토리지 — IndexedDB (idb library) + 메모리 폴백 + OPFS (2026-05-24, 정밀화 2026-05-24)
- **결정**: 
  - **저수준 추상화 계층**: `src/lib/storage/indexeddb.ts` (idb library v8.0.3 wrapper)
    - DB: 단일 `zm-os` v1, store `installed-apps`
    - CRUD: idbGet/idbPut/idbDelete/idbList/idbClear (메서드별 자동 트랜잭션)
    - 폴백: isIDBAvailable() → 메모리 Map (page reload 휘발)
    - 타입: 제네릭 `<T>` + SSR 안전 (호출자 책임 Zod 검증)
  - **고수준 도메인 계층**: 작업 3 APP-03 (useInstalledApps hook + IndexedDB hydration)
  - OPFS: 크롬/엣지 지원 (Safari는 IndexedDB 폴백). v2 이상 reshape 가능.
  - 멀티디바이스 동기화: v2에서 서버 연동 검토.
- **이유**: ADR-0007 — idb 라이브러리 (1.19KB brotli, Safari 14 워라운드, DBSchema 제네릭). POC 범위 (설치 앱 목록) 메모리도 충분.
- **W-02/W-03 [WARN]**: 메모리 폴백 휘발 — 호출자가 localStorage sync 또는 사용자 알림 책임 (작업 3).
- **재고 시점**: 멀티유저 도입 시 S3 호환 스토리지 + CRDT 동기화 검토.
- **상세**: ADR-0007

### TECH-02: Python hooks (2026-05-24)
- **결정**: Claude Code hooks는 Python 통합 (`mistake_guard.py`, `post_review.py`, `session_start.py`, `notify_done.py`). bash sub-spawn 회피로 cold ~150ms.
- **이유**: sonix_docs 패턴 검증됨. Windows 환경에서 bash 의존도 줄임.

### TECH-03: 호스트 origin CSP / Permissions-Policy — 정적 헤더 모델 (2026-05-24)
- **결정**: next.config.ts `headers()` + `src/lib/security/csp.ts` 정적 헤더. dev/prod 분기.
- **이유**: POC 1차 단순성, nonce middleware 회피
- **재고 시점**: v2 nonce 도입 또는 SharedArrayBuffer 게임 엔진 (Godot 등) 도입 시 COEP/COOP 검토
- **상세**: ADR-0004

### PROD-01: POC 1차 스코프 (2026-05-24)
- **결정**: 게임 스토어 + 단일 사용자 데스크탑 (몽상 5번). 멀티유저는 v2.
- **이유**: 빠른 검증 우선.
- **명시적 비목표**: 사용자 인증, 클라우드 동기화, 모바일, Electron 패키징.

### TECH-04: 윈도우 매니저 라이브러리 — react-rnd (2026-05-24)
- **결정**: src/components/desktop/Window.tsx가 react-rnd v10.5.3을 래핑. 드래그 핸들은 `dragHandleClassName='window-titlebar'` 고정.
- **이유**: ADR-0002 — 드래그+리사이즈+z-index 통합 / React 19 호환 / MIT / daedalOS 사용 사례
- **재고 시점**: 키보드 접근성 요구 시 dnd-kit 또는 자작으로 이주 검토 (v2)
- **상세**: ADR-0002

### TECH-05: 윈도우 상태 관리 — React Context + useReducer (2026-05-24)
- **결정**: useWindowManager 훅 + WindowManagerProvider (Context) + windowReducer (useReducer). Zustand 미도입.
- **이유**: ADR-0005 — POC 단순성 + 외부 의존성 0 + React 19 표준 API
- **재고 시점**: 윈도우 20개 이상 또는 persist/undo 요구 시 Zustand 전환 검토 (인터페이스 §3.2 동일)
- **상세**: ADR-0005

### PROD-02: 데스크탑 앱 카탈로그 — POC v1 하드코딩 (2026-05-24)
- **결정**: src/components/desktop/desktopApps.ts 의 DESKTOP_APPS 배열. 2 엔트리 (Bouncing Ball + IPC Demo).
- **이유**: ADR-0006 — STR 미존재 단계에서 데스크탑 UX 즉시 검증 + DesktopAppEntry 타입이 v2 STR 인터페이스 prefigure
- **재고 시점**: STR-01/02 작업 진입 시 → useInstalledApps + IndexedDB로 reshape (인터페이스 무변경)
- **상세**: ADR-0006

### PROD-03: 앱 카탈로그 메타데이터 모델 (2026-05-24)
- **결정**: `DesktopAppEntry` 단일 확장 (description, longDescription, category enum, screenshots, author, version). 별도 StoreCatalogEntry 분리 X.
- **이유**: ADR-0006 prefigure — v2 STR 백엔드 reshape 시 인터페이스 무변경 + Phase 2 작업 1 자동 채택 (P1=A).
- **카테고리 enum**: `'game' | 'utility' | 'demo'` (POC v1). v2 tag[] reshape 가능.
- **재고 시점**: STR 백엔드(클라우드) 도입 시 ADR-0007 신규.

### PROD-04: 설치 상태 storage + 데스크탑 아이콘 정책 (2026-05-24, 작업 3 완료 2026-05-24)
- **결정**:
  - 설치 상태 = POC v1 **메모리 React Context + useReducer** (immutable Set). **작업 3에서 IndexedDB reshape 완료** (InstalledAppsProvider HYDRATE action + useEffect hydration + fire-and-forget persist, 인터페이스 무변경).
  - 데스크탑 아이콘 = 설치된 앱만 표시 + "스토어" 시스템 아이콘 우상단 항상 표시.
  - Provider scope = layout.tsx 옵션 A → / 와 /store이 같은 Context 공유.
  - 좌표 컨벤션: 좌측 column (`x ≤ 30`) = 앱 아이콘 / 우상단 = 시스템 아이콘.
- **이유**: 사용자 결정 (Phase 2 코어 범위) + architect P2=α/P3=i+iii/Provider 옵션 A 추천 + ADR-0006.
- **작업 3**: InstalledAppsProvider + lib/storage/installed-apps.ts 기반 IndexedDB hydration (2026-05-24)

### PROD-05: POC v1 사용자 업로드 메타데이터 정책 (2026-05-24)
- **결정**:
  - 사용자 제출 ZIP 업로드 = 단일 HTML (자원 inline, v2 reshape 예정) + 보안 임계치 6단계 (magic byte → 파싱 → path traversal → 압축비 → 필수 파일 → 매니페스트)
  - 저장소 = IndexedDB STORE_USER_APPS (DB_VERSION 2), UserAppRecord = { id, manifest, htmlContent, installedAt, sourceZipSize, htmlSize }
  - 카탈로그 = buildCatalog(builtInApps, userApps) 통합 (source: 'built-in' | 'user')
  - 보안 임계치 (SSOT: zip-loader.ts):
    - MAX_ZIP_BYTES = 10MB
    - MAX_HTML_BYTES = 5MB (UTF-8)
    - MAX_COMPRESSION_RATIO = 1000 (ZIP bomb)
  - iframe 로드 = 기존 srcdoc inline (AppFrame.tsx 조건부, null origin 유지)
- **이유**: ADR-0008 — PRD §1.2 POC 비전 달성 (사용자 앱 업로드 → 설치 → 실행) + 백엔드 의존도 0 + v2 STR reshape 용이
- **상세**: ADR-0008, `.claude/rules/security.md` §사용자 제출 ZIP 수신 절차

### TECH-06: 다크 모드 CSS 전략 — Tailwind v4 class 기반 dark variant (2026-05-25)
- **결정**: `@custom-variant dark (&:where(.dark, .dark *))` + `<html class="dark">` 토글. system 모드는 `matchMedia` 리스너.
- **이유**: ADR-0012 — 사용자 수동 토글 + 시스템 팔로우 동시 지원. POC에서 초기 로드 flash 허용.
- **재고 시점**: v2에서 인라인 blocking 스크립트 또는 cookie 기반 SSR 힌트로 flash 제거
- **상세**: ADR-0012

## Deprecated
- (없음)

## 갱신 가이드
- 새 정책 결정 시: ID 할당 → Active에 append → 관련 문서/규칙 동시 갱신
- 정책 변경 시: 기존 항목을 Deprecated로 이동 (삭제 금지) + 새 ID로 추가
- 정책 위반 발견 시: `.claude/rules/known-mistakes.md` 에 M-NNN 추가
