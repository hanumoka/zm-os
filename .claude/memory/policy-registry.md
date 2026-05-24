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

### TECH-01: 클라이언트 스토리지 — IndexedDB + OPFS (2026-05-24)
- **결정**: POC는 IndexedDB(폴백) + OPFS(Chrome/Edge). 멀티디바이스 동기화는 v2.
- **이유**: 단일 사용자 POC. 서버 동기화 인프라 후순위.
- **재고 시점**: 멀티유저 도입 시 S3 호환 스토리지 + CRDT 동기화 검토.

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

## Deprecated
- (없음)

## 갱신 가이드
- 새 정책 결정 시: ID 할당 → Active에 append → 관련 문서/규칙 동시 갱신
- 정책 변경 시: 기존 항목을 Deprecated로 이동 (삭제 금지) + 새 ID로 추가
- 정책 위반 발견 시: `.claude/rules/known-mistakes.md` 에 M-NNN 추가
