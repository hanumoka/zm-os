# zm-os Project Memory
> 시스템 프롬프트 자동 로드 (200줄 한도). 최종 갱신: 2026-05-27 (v2 plan v0.3.0 + ADR-0017~0023 채택)

## 프로젝트 수치 (항상 최신 유지)
- 현재 상태: **POC ✅ 완료 + Post-POC ✅ 완료 + v2 진입** (로컬-우선 전환, ADR-0017 대기)
- 코드 LOC: `apps/web/src + packages/*/src`만 산정, 샘플(`public/sample-*`) 제외 — 약 5200 LOC (TS) + samples ~1500 LOC (HTML/JS)
- 구조: 모노레포 `apps/web` + `packages/{core,storage,ipc}` (pnpm 11 + Turborepo 2.7)
- 에이전트: 13개 (architect, research-analyst, design-reviewer, lib-developer, fe-developer, build-checker, code-reviewer, app-sandbox-auditor, constraint-checker, integration-tester, perf-monitor, self-verifier, doc-updater) + workflow 문서
- 모델 전략: architect/design-reviewer/self-verifier=opus / 구현·리뷰·감사·통합검증=sonnet / 빌드·문서·제약·성능=haiku
- 스킬: 9개 (zm-commit, zm-unit-done, zm-session, zm-troubleshoot, zm-memory-save, zm-work-intake, zm-work-completion, zm-doc-status, zm-roadmap)
- 규칙: 10개 (frontend, security, work-units, known-mistakes, doc-naming, file-categories, quality-standard, self-review, auto-memory-protocol, troubleshoot-auto)
- 훅: 10개 Python (mistake_guard, post_review, session_start, notify_done, category_guard, emit_event, prompt_context, pre_compact, post_compact, post_review_checks)
- 단위 테스트: Vitest 61개 (6파일 ALL PASS) | E2E: Playwright 6개 (모두 PASS)
- 의존성: next 16, react 19, tailwind 4, zod 4.4.3, typescript 5, react-rnd v10.5.3, phaser@3.90.0, idb@8.0.3, jszip@3.10.1, pixi.js@8.18.1, three@0.184.0, vitest@4.1.7 (dev), playwright (dev)

## 기술 스택
- **FE/풀스택**: Next.js 16 (App Router) + React 19 + Tailwind v4 (모노레포 `apps/web/`)
- **클라이언트 스토리지**: StorageAdapter Strategy (IndexedDB / OPFS / Memory) — `packages/storage/`
- **앱 샌드박싱**: blob: URL iframe + sandbox="allow-scripts" + Comlink-compatible IPC (rate-limiter 포함)
- **언어**: TypeScript strict
- **배포**: 로컬 dev 서버만 (POC). v2 = 로컬-우선 + 옵션 클라우드 어댑터.

## 규칙 참조
- 반복 실수 레지스트리: `.claude/rules/known-mistakes.md` (M-001 등록, 현재 1건)
- 보안 규칙 (도메인 핵심): `.claude/rules/security.md`
- 코드 규칙: `.claude/rules/frontend.md`
- 작업 단위 원칙: `.claude/rules/work-units.md`

## Key Learnings
- [Troubleshooting Patterns](../../docs/13-troubleshooting/entries.md) — TS-000~ 현재 0건
- [Tech Gotchas](tech-gotchas.md) — iframe sandbox / OPFS / Next.js App Router / Tailwind v4 주의사항
- [Policy Registry](../../docs/03-policy/01-policy-registry.md) — ARCH-01/02, TECH-01~10, PROD-01~05, CONST-01/02

## PRD + 로드맵 (Living Documents)
- **PRD**: `docs/04-planning/01-prd.md` (v2 ID 53건 등재)
- **로드맵**: `docs/04-planning/02-roadmap.md` (v0.9.0)
- **v2 Plan**: `docs/04-planning/03-v2-plan.md` (v0.2.1, ⚠️ v0.3.0 재작성 대기)
- **Feature Map**: `docs/01-architecture/05-feature-map.md`
- **baseline 스냅샷**: `docs/01-architecture/06-current-snapshot-2026-05-26.md`

## SSH GitHub 계정
- 개인 계정 `hanumoka` 사용. SSH config host는 `github-personal` (key: `id_hanumoka_personal`)
- 회사 계정과 분리되어 있음 — 자세히는 글로벌 메모리(`~/.claude/projects/.../memory/ssh-github-accounts.md`)

## User Preferences
- 한국어로 응답 기본
- 정책 결정 사항은 사용자에게 선택지 제시 후 결정 (work-units.md 참조)
- v2 단계 — 설계 안정성/유연성/확장성 > 개발 속도. 면밀한 검토 + 작업 결과 검수 중시.

## Project State
- **POC 1~3 Phase ✅ 완료** (4/4 × 3 = 모두 100%) — M4 마일스톤 달성, POC 공식 종료
- **POC 종료 게이트 ✅ 통과** — 보안 14 페네스트 + 번들 임계치 PASS
- **Post-POC ✅ 완료**: APP-04 + TEST-01 + DSK-05 + **REFAC-01 8/8** + APP-04 확장
- **v2 설계 단계 ✅ 완료 (2026-05-27)**: SRV-00 모노레포 + ADR-0016 + **ADR-0017~0023 일괄 채택** + **v2 plan v0.3.0 작성** (10 Epic + 58 작업 + 24주 추정)
- **다음 후보**: **REFAC-02 P1 진입** — `packages/adapters-local` 신규 + namespace-registry adapterPolicies reshape (lib-developer 위임). P1~P5 완료 후 M5 진입 (SRV-01~02 + USR-01~04 로컬 인증).

## 최근 결정사항 (최대 10, FIFO)
- 2026-05-27: **v2 plan v0.3.0 작성** — ADR-0017~0023 채택 반영. 10 Epic + 58 작업 + 24주 추정 (REFAC-02 3주 + M5~M10 21주). 각 작업에 LocalAdapter 필수 / CloudAdapter 옵션 표기. 신규 Epic J REFAC-02 (P1~P5 = M5 진입 전 선행). Local-only v2.0 출시 옵션 명시. 신규 리스크 4건. roadmap v0.10.0 + PRD §3.2 갱신.
- 2026-05-27: **ADR-0018~0023 Local 어댑터 6건 일괄 채택** — LocalAuth(crypto.randomUUID + system namespace + BroadcastChannel) + LocalRepo IDB(installed-apps/user-apps 2 namespace, cascade remove, contentRef inline v2.0) + LocalOPFS BlobStorage(packages/storage 흡수, AbortSignal 매 entry, BlobStorageError extends PortError) + LocalNoOpSync(silent no-op ~30 LOC) + LocalStaticModeration(정규식 7 패턴 fail-closed + ConfirmDialog 재사용) + Adapter Resolver(createLocalPorts + PortsContext + 동적 import Suspense + adapterPolicies Port+namespace 2차원). architect 2회 병렬 호출 + 사용자 결정 26건 추천 일괄 채택.
- 2026-05-27: **ADR-0017 Ports & Adapters 채택** — 5 Port(Auth/AppRepo/Blob/Sync/Moderation) + 단일 `PortError` + `@zm/core/ports` SSOT + `@zm/adapters-local` 신규 패키지 + 하이브리드 어댑터 선택 + `@zm/storage` 1 v2 minor deprecation. ADR-0013/0014/0015 superseded. ARCH-03 신규 + ARCH-01/TECH-01 reshape + TECH-07/08/09 deprecated. 사용자 결정 8건 일괄 채택.
- 2026-05-27: **문서 정밀 감사 + 9건 일괄 수정** — BLOCK 3 + WARN 6. 코드 변경 0, 문서만 11개 (commit f0b4eb9).
- 2026-05-26: **로컬-우선 아키텍처 전환** — 사용자 결정. 로컬 100% 외부 의존성 0 + 클라우드 옵션은 어댑터 추상화. ADR-0013/0014/0015 reshape 대기 결정 (2026-05-27 superseded 완료).
- 2026-05-26: **SRV-00 실행 완료** — 모노레포 마이그레이션 (src/ → apps/web + packages/{core,storage,ipc} + pnpm workspaces + Turborepo). 검증: turbo type-check 4/4 + turbo test 61/61 + next build ✅.
- 2026-05-26: ADR-0016 (v2 모노레포) — pnpm 11 + Turborepo 2.7. 구조 apps/web + packages/{core,storage,ipc}. ARCH-01 reshape + TECH-10 등재.
- 2026-05-26: v2 ADR 3건 일괄 작성 — ADR-0013(Auth: Supabase Auth) + ADR-0014(DB: Supabase Postgres + Drizzle) + ADR-0015(Sync: LWW + 서버 권위 시계). 이후 2026-05-27 모두 superseded by ADR-0017.
- 2026-05-26: v2 Plan v0.2.0 — architect 검토 + 사용자 결정 4건 반영. 9 Epic + 53 작업 + 12 ADR 후보 + 10 정책 reshape + M5~M10 (21주). v0.3.0 재작성 대기.
- 2026-05-26: APP-04 확장 완료 — 데스크탑 아이콘 우클릭 컨텍스트 메뉴 (앱 정보 + 사용자 앱 삭제). AppInfoDialog 신규.

> **최종 갱신**: 2026-05-27 — v2 plan v0.3.0 + ADR-0017~0023 채택
