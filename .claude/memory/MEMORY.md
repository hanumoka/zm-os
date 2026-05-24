# zm-os Project Memory
> 시스템 프롬프트 자동 로드 (200줄 한도). 최종 갱신: 2026-05-24 (초기 셋팅)

## 프로젝트 수치 (항상 최신 유지)
- 현재 Phase: **Phase 2 ✅ 완료 (4/4, 100%)** — Phase 3 진입 가능
- 코드 LOC: ~3862 LOC (TS) + sample-game/sample-game-ipc/sample-game-phaser ~750 LOC (HTML/JS) — Phase 2 작업 3 완료 후 약 62 LOC 순증 (installed-apps.ts)
- 에이전트: 10개 (architect, research-analyst, lib-developer, fe-developer, build-checker, code-reviewer, app-sandbox-auditor, constraint-checker, self-verifier, doc-updater) + workflow 문서
- 모델 전략: architect/self-verifier=opus / 구현·리뷰·감사=sonnet / 빌드·문서·제약검사=haiku
- 스킬: 5개 (zm-commit, zm-unit-done, zm-session, zm-troubleshoot, zm-memory-save)
- 규칙: 4개 (frontend, security, work-units, known-mistakes)
- 훅: 4개 Python (mistake_guard, post_review, session_start, notify_done)
- 단위 테스트: 0 | E2E: Playwright POC v1 (`e2e-snake.mjs`, 10 step PASS) — Phase 3 정식 도입 예정
- 의존성: next 16, react 19, tailwind 4, zod 4.4.3, typescript 5, react-rnd v10.5.3, phaser@3.90.0, idb@8.0.3, playwright (dev)

## 기술 스택
- **FE/풀스택**: Next.js 16 (App Router) + React 19 + Tailwind v4
- **클라이언트 스토리지**: IndexedDB(폴백) + OPFS(Chrome/Edge) — 구현 예정
- **앱 샌드박싱**: blob: URL iframe + sandbox="allow-scripts" + Comlink IPC
- **언어**: TypeScript strict
- **배포**: 로컬 dev 서버만 (POC). v2에서 Vercel 등.

## 규칙 참조
- 반복 실수 레지스트리: `.claude/rules/known-mistakes.md` (M-000~ 현재 0건)
- 보안 규칙 (도메인 핵심): `.claude/rules/security.md`
- 코드 규칙: `.claude/rules/frontend.md`
- 작업 단위 원칙: `.claude/rules/work-units.md`

## Key Learnings
- [Troubleshooting Patterns](troubleshooting-patterns.md) — TS-000~ 현재 0건
- [Tech Gotchas](tech-gotchas.md) — iframe sandbox / OPFS / Next.js App Router / Tailwind v4 주의사항
- [Policy Registry](policy-registry.md) — 확정 정책 SSOT (ARCH-01, ARCH-02, TECH-01)

## PRD + 로드맵 (Living Documents)
- **PRD**: `zm-claude-docs/project/prd.md`
- **로드맵**: `zm-claude-docs/project/roadmap.md`
- **Feature Map**: `zm-claude-docs/project/feature-map.md`

## SSH GitHub 계정
- 개인 계정 `hanumoka` 사용. SSH config host는 `github-personal` (key: `id_hanumoka_personal`)
- 회사 계정과 분리되어 있음 — 자세히는 글로벌 메모리(`~/.claude/projects/.../memory/ssh-github-accounts.md`)

## User Preferences
- 한국어로 응답 기본
- 정책 결정 사항은 사용자에게 선택지 제시 후 결정 (work-units.md 참조)
- POC 단계 — 코드 정교함보다 빠른 검증 우선

## Project State
- 빈 저장소에서 시작 (2026-05-24 git init + 첫 push to github-personal:hanumoka/zm-os.git)
- Phase 0 ✅ 완료 (`efed152 chore(setup)`)
- Phase 1 ✅ 완료 (7/7, `7d3fd32`까지) — Playwright e2e PASS
- Phase 2 ✅ 완료 (4/4, 100%, `4f3d0e3`까지) — Playwright e2e PASS (snake + hydration)
- **Phase 3 진입 대기** — 사용자 우선순위 결정 필요 (다음 세션 첫 행동)
- **Phase 3 후보 (4개)**: APP-02 ZIP 업로드 / 안정화 (번들+셀프 페네스트) / 게임 엔진 매트릭스 (Pixi+Three.js) / STG-02 OPFS+DSK-04 윈도우 위치 영속화

## 최근 결정사항 (최대 10, FIFO)
- 2026-05-24: **Phase 2 ✅ 완료 (4/4, 100%)** 종료 정리 — quick-ref/current-phase/MEMORY 갱신 (커밋 `b609390`). 다음 세션 Phase 3 진입 — 사용자 우선순위 결정 대기 (APP-02 / 안정화 / 게임엔진 / STG-02+DSK-04).
- 2026-05-24: Phase 2 작업 3 완료 — APP-03 IndexedDB hydration + fire-and-forget persist (InstalledAppsProvider, lib/storage/installed-apps.ts). 인터페이스 무변경. Playwright e2e PASS (e2e-hydration.mjs 8 step).
- 2026-05-24: Phase 2 작업 2 완료 — STG-01 IndexedDB 추상화 (idb v8.0.3, 메모리 폴백). ADR-0007 신규. 75% 진행률.
- 2026-05-24: Phase 2 작업 1+4 Playwright e2e ALL PASS (10 step). TS-004 Snake 자동 벽 충돌 fix (paused 모드). D1/D2 deferred 검증 — Chrome srcdoc null origin → host /phaser.min.js 200 OK, Phaser AUTO sandbox 정상.
- 2026-05-24: Phase 2 작업 4 완료 — GAME-01 Phaser 3 Snake (procedural, host self origin). POC v1 카탈로그 3개 엔트리 완성.
- 2026-05-24: Phase 2 작업 1 완료 — STR-01/02 (스토어 UI + InstalledAppsProvider + 데스크탑 동기화). C-01 fix (스토어 시스템 아이콘 우상단).
- 2026-05-24: PROD-03/04 신규 정책 — 카탈로그 메타데이터 단일 모델 + Provider scope 옵션 A + 좌표 컨벤션.
- 2026-05-24: Phase 1 작업 7 보안 감사 ✅ PASS. H-1 + SANDBOX_ORIGIN fix. Phase 2 진입 가능.
- 2026-05-24: 작업 5+6 통합 완료 — DSK-02 데스크탑 + DSK-03 작업표시줄. 메인 페이지 / 가상 데스크탑.
- 2026-05-24: ADR-0006 — 데스크탑 앱 카탈로그 = POC v1 하드코딩 (v2 STR 전환)
- 2026-05-24: ADR-0002 확정 — 윈도우 매니저 = react-rnd v10.5.3
- 2026-05-24: 작업 3 완료 — CSP/Permissions-Policy 정적 헤더 (ADR-0004 dev/prod 분기, COEP/COOP 미도입)
- 2026-05-24: 에이전트 팀 10명 재구성 — 설계/구현/검증/메타/문서 5계층. 사용자 요구(추측 금지 + 재검증 의무) 충족. workflow 표준화
- 2026-05-24: Phase 1 작업 1 완료 — srcdoc 기반 iframe (sandbox="allow-scripts", null origin) + Zod 매니페스트
- 2026-05-24: Phase 0 완료 + Phase 1 진입
- 2026-05-24: 문서/CC 셋팅 — zm-v3 골격 + sonix_docs 베스트 결합 (Python hooks, ADR frontmatter, .claudeignore)
- 2026-05-24: TECH-01 IndexedDB+OPFS 클라이언트 스토리지 (서버 동기화는 v2)
- 2026-05-24: ARCH-02 iframe + Comlink 샌드박싱 (blob: URL, allow-scripts만)
- 2026-05-24: 작업 4 완료 — 윈도우 매니저 DSK-01 (react-rnd v10.5.3, Window 컴포넌트 + useWindowManager)

## Project State
- **Phase 2 ✅ 완료 (4/4, 100%)**. 작업 1 ✅ (STR-01/02 스토어 UI) + 작업 2 ✅ (STG-01 IndexedDB) + 작업 3 ✅ (APP-03 hydration+persist) + 작업 4 ✅ (GAME-01 Phaser Snake).
- 산출물: 작업 1 (9 파일, 신규 5 + 수정 4) + 작업 2 (2 파일, 신규 1 + 수정 1 + ADR-0007) + 작업 3 (2 파일, 신규 1 + 수정 1) + 작업 4 (4 파일, 신규 2 + 수정 2)
- 다음: Phase 3 진입 가능 (POC 안정화 + 데모 영상)

> **최종 갱신**: 2026-05-24 — Phase 2 작업 3 완료, 문서 갱신 완료
