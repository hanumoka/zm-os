# zm-os Project Memory
> 시스템 프롬프트 자동 로드 (200줄 한도). 최종 갱신: 2026-05-27 (문서 정밀 감사 + 9건 일괄 수정)

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
- **v2 진입 작업 ✅ 완료**: SRV-00 모노레포 마이그레이션 + ADR-0013/0014/0015/0016 작성
- **⚠️ 진행 중 방향 전환**: 로컬-우선 (2026-05-26) → ADR-0013/0014/0015 헤더 `accepted (will be superseded by ADR-0017+)`, v2 plan v0.3.0 재작성 대기
- **다음 후보**: **ADR-0017** (Ports & Adapters + 5 Port) → ADR-0018~0023 (LocalAdapter 6건) → v2 plan v0.3.0 → M5 진입

## 최근 결정사항 (최대 10, FIFO)
- 2026-05-27: **문서 정밀 감사 + 9건 일괄 수정** — BLOCK 3 (ADR-0013/0014/0015 헤더 status + v2-plan §5 ✅ 표기 + CLAUDE.md `src/lib/api/` 경로) + WARN 6 (_digest 동기화 + roadmap v0.9.0 + quick-ref 전면 + CLAUDE.md 경로 + feature-map 모노레포 + MEMORY FIFO). 코드 변경 0건, 문서만 10개 파일.
- 2026-05-26: **로컬-우선 아키텍처 전환** — 사용자 결정. 로컬 100% 외부 의존성 0 + 클라우드 옵션은 어댑터 추상화. Ports & Adapters 도입 (ADR-0017 대기). 기존 ADR-0013/0014/0015는 "어댑터 옵션"으로 reshape 대기. 진행 중이던 ADR 2차 7건은 로컬-우선 6건(0018~0023)으로 재구성, 클라우드 어댑터 ADR은 별도 트랙(0024+) 분리.
- 2026-05-26: **SRV-00 실행 완료** — 모노레포 마이그레이션 (src/ → apps/web + packages/{core,storage,ipc} + pnpm workspaces + Turborepo). 검증: turbo type-check 4/4 + turbo test 61/61 + next build ✅.
- 2026-05-26: ADR-0016 (v2 모노레포) — pnpm 11 + Turborepo 2.7. 구조 apps/web + packages/{core,storage,ipc}. ARCH-01 reshape + TECH-10 등재.
- 2026-05-26: v2 ADR 3건 일괄 작성 — ADR-0013(Auth: Supabase Auth) + ADR-0014(DB: Supabase Postgres + Drizzle) + ADR-0015(Sync: LWW + 서버 권위 시계). policy-registry TECH-07/08/09 + CONST-01/02 등재.
- 2026-05-26: v2 Plan v0.2.0 — architect 검토 + 사용자 결정 4건 반영. **9 Epic(G/H/I 신규) + 53 작업 + 12 ADR 후보 + 10 정책 reshape + M5~M10 (21주)**.
- 2026-05-26: v2 Plan 초안 작성 — 6 Epic + 33 작업 + 7 ADR 후보 + 8 정책 reshape + 4 마일스톤(M5~M8). docs/04-planning/03-v2-plan.md.
- 2026-05-26: APP-04 확장 완료 — 데스크탑 아이콘 우클릭 컨텍스트 메뉴 (앱 정보 + 사용자 앱 삭제). AppInfoDialog 신규.
- 2026-05-26: REFAC-01 정밀 감사 + 수정 — H-3 lib→components 역방향 의존성 제거 + C-2 정책 코멘트 복원.
- 2026-05-26: REFAC-01 **전체 완료 (8/8)** — C-1+H-5+C-3+H-1+H-4+H-2+H-3+C-2 모두 완료.

> **최종 갱신**: 2026-05-27 — 문서 정밀 감사 + 9건 일괄 수정 (코드 변경 0)
