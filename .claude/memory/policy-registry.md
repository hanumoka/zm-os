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

### ARCH-02: iframe 샌드박싱 (2026-05-24)
- **결정**: 사용자 제출 앱은 **blob: URL iframe + `sandbox="allow-scripts"`** 에서만 실행. 호스트-앱 통신은 Comlink 기반 RPC.
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

### PROD-01: POC 1차 스코프 (2026-05-24)
- **결정**: 게임 스토어 + 단일 사용자 데스크탑 (몽상 5번). 멀티유저는 v2.
- **이유**: 빠른 검증 우선.
- **명시적 비목표**: 사용자 인증, 클라우드 동기화, 모바일, Electron 패키징.

## Deprecated
- (없음)

## 갱신 가이드
- 새 정책 결정 시: ID 할당 → Active에 append → 관련 문서/규칙 동시 갱신
- 정책 변경 시: 기존 항목을 Deprecated로 이동 (삭제 금지) + 새 ID로 추가
- 정책 위반 발견 시: `.claude/rules/known-mistakes.md` 에 M-NNN 추가
