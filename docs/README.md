# docs — zm-os 프로젝트 문서 허브

> 번호 기반 카테고리 구조. 명명 규칙: `.claude/rules/doc-naming.md`
> 최종 갱신: 2026-05-25

## 세션 진입 (필독)
- [10-session/quick-ref.md](10-session/quick-ref.md) — 1페이지 컨텍스트 (수치/링크/현재 상태)
- [10-session/current-phase.md](10-session/current-phase.md) — 현재 Phase 상세

## 01-architecture/ — 기능 아키텍처
- [01-desktop-window-manager.md](01-architecture/01-desktop-window-manager.md) — 가상 데스크탑 + 윈도우 매니저
- [02-app-sandboxing.md](01-architecture/02-app-sandboxing.md) — iframe 샌드박싱 + Comlink IPC
- [03-app-store.md](01-architecture/03-app-store.md) — 앱 스토어
- [04-app-manifest.md](01-architecture/04-app-manifest.md) — 앱 패키지 매니페스트 명세
- [05-feature-map.md](01-architecture/05-feature-map.md) — UI / 스토리지 / 샌드박싱 연결도

## 02-decisions/ — ADR (Architecture Decision Records)
- [index.md](02-decisions/index.md) — ADR 인덱스
- [adr-0001](02-decisions/adr-0001-initial-stack.md) — 초기 스택
- [adr-0002](02-decisions/adr-0002-window-manager.md) — 윈도우 매니저 (react-rnd)
- [adr-0003](02-decisions/adr-0003-ipc-surface.md) — IPC 어댑터 표면
- [adr-0004](02-decisions/adr-0004-csp-permissions-policy.md) — CSP/Permissions-Policy
- [adr-0005](02-decisions/adr-0005-window-state-management.md) — 윈도우 상태 관리
- [adr-0006](02-decisions/adr-0006-desktop-app-catalog.md) — 데스크탑 앱 카탈로그
- [adr-0007](02-decisions/adr-0007-client-storage-indexeddb.md) — 클라이언트 스토리지 (IndexedDB)
- [adr-0008](02-decisions/adr-0008-user-zip-upload.md) — 사용자 ZIP 업로드

## 03-policy/ — 정책
- [01-policy-registry.md](03-policy/01-policy-registry.md) — 정책 SSOT (ARCH/TECH/PROD/CONST)
- [_digest.md](03-policy/_digest.md) — 정책 요약 (세션 로드용)

## 04-planning/ — 프로젝트 계획
- [01-prd.md](04-planning/01-prd.md) — 요구사항 / 기능 인벤토리 / Change Log
- [02-roadmap.md](04-planning/02-roadmap.md) — 타임라인 / 마일스톤

## 05-analysis/ — 외부 리서치 + 기술 분석
- [01-browser-os-landscape.md](05-analysis/01-browser-os-landscape.md) — Puter/daedalOS/OS.js 비교
- [02-sandboxing-untrusted-js.md](05-analysis/02-sandboxing-untrusted-js.md) — iframe/ShadowRealm/QuickJS-WASM
- [03-multitenant-stack-options.md](05-analysis/03-multitenant-stack-options.md) — Supabase/Cloudflare/Puter

## 06-security/ — 보안 감사
- [01-phase-1-audit-2026-05-24.md](06-security/01-phase-1-audit-2026-05-24.md) — Phase 1 전체 감사 리포트
- [02-phase-3-stabilization-audit-2026-05-25.md](06-security/02-phase-3-stabilization-audit-2026-05-25.md) — Phase 3 안정화 감사 (14 페네스트)

## 07-testing/ — 테스트 전략/결과
- [01-engine-compatibility-matrix.md](07-testing/01-engine-compatibility-matrix.md) — 게임 엔진 호환성 매트릭스 (Phaser/Pixi/Three.js)

## 11-archive/ — 월별 작업 로그
- [2026-05.md](11-archive/2026-05.md) — 2026년 5월

## 13-troubleshooting/ — 트러블슈팅
- [index.md](13-troubleshooting/index.md) — TS 인덱스 테이블
- [entries.md](13-troubleshooting/entries.md) — 상세 엔트리

---

## SSOT 매트릭스

| 카테고리 | SSOT 위치 |
|---------|-----------|
| 정책 결정 | `docs/03-policy/01-policy-registry.md` |
| 정책 요약 | `docs/03-policy/_digest.md` |
| 반복 실수 | `.claude/rules/known-mistakes.md` |
| 트러블슈팅 | `docs/13-troubleshooting/entries.md` |
| 기술 함정 | `.claude/memory/tech-gotchas.md` |
| 보안 규칙 | `.claude/rules/security.md` |
| 요구사항 | `docs/04-planning/01-prd.md` |
| 로드맵 | `docs/04-planning/02-roadmap.md` |
| 아키텍처 결정 | `docs/02-decisions/adr-*.md` |
| 진행상황 | `docs/10-session/current-phase.md` |
| 이벤트 기록 | `events/YYYY-MM.jsonl` |
