# zm-os Project Memory
> 시스템 프롬프트 자동 로드 (200줄 한도). 최종 갱신: 2026-06-07 (REFAC-02-P2 완료)

## 프로젝트 수치 (항상 최신 유지)
- 현재 상태: **POC ✅ 완료 + Post-POC ✅ 완료 + v2 진입** (로컬-우선 전환, ADR-0017~0023 채택 완료, REFAC-02 진행 중)
- 코드 LOC: `apps/web/src + packages/*/src`만 산정, 샘플(`public/sample-*`) 제외 — 약 5200 LOC (TS) + samples ~1500 LOC (HTML/JS)
- 구조: 모노레포 `apps/web` + `packages/{core,storage,ipc,adapters-local}` (pnpm 11 + Turborepo 2.7) — adapters-local에 blob-storage(P2)+app-repository(P3) 구현, `@zm/storage`는 deprecation shell
- 에이전트: 14개 (architect, research-analyst, design-reviewer, lib-developer, fe-developer, build-checker, code-reviewer, app-sandbox-auditor, constraint-checker, integration-tester, perf-monitor, self-verifier, doc-updater, **zm-context-guardian**) + workflow 문서
- 모델 전략: architect/design-reviewer/self-verifier=opus / 구현·리뷰·감사·통합검증=sonnet / 빌드·문서·제약·성능=haiku
- 스킬: 17개 (기존 9 + 협업 8: zm-wu-start/stop/next, zm-handoff, zm-setup, zm-team, zm-onboarding, zm-agent-teams)
- 규칙: 11개 + constitution/ 3 (frontend, security, work-units, known-mistakes, doc-naming, file-categories, quality-standard, self-review, auto-memory-protocol, troubleshoot-auto, **wu-claim** + **constitution/{01-isolation-first,02-ssot-and-derived,03-domain-separation}**)
- 훅: 17개 Python (기존 10 + 협업 7: file_lock, idgen, merge_jsonl, _resolve-user, check_wu_race, wu_claim_manager, mistake_guard_edit)
- 단위 테스트: Vitest 104개 (10파일 ALL PASS, +app-repository 14) | E2E: Playwright 6개 (모두 PASS)
- 의존성: next 16, react 19, tailwind 4, zod 4.4.3, typescript 5, react-rnd v10.5.3, phaser@3.90.0, idb@8.0.3, jszip@3.10.1, pixi.js@8.18.1, three@0.184.0, vitest@4.1.7 (dev), playwright (dev)

## 기술 스택
- **FE/풀스택**: Next.js 16 (App Router) + React 19 + Tailwind v4 (모노레포 `apps/web/`)
- **클라이언트 스토리지**: BlobStorage Port (IDB/OPFS/Memory + AbortSignal) — `packages/adapters-local/blob-storage` (REFAC-02-P2), `@zm/storage`=deprecation shell
- **앱 샌드박싱**: blob: URL iframe + sandbox="allow-scripts" + Comlink-compatible IPC (rate-limiter 포함)
- **언어**: TypeScript strict
- **배포**: 로컬 dev 서버만 (POC). v2 = 로컬-우선 + 옵션 클라우드 어댑터.

## 규칙 참조
- 반복 실수 레지스트리: `.claude/rules/known-mistakes.md` (M-001~006 등록, 현재 6건)
- 제품 리스크 레지스트리: `.claude/rules/security.md` §제품 리스크 (RP-1~6) — 사용자 코드/데이터 리스크
- 보안 규칙 (도메인 핵심): `.claude/rules/security.md`
- 코드 규칙: `.claude/rules/frontend.md`
- 작업 단위 원칙: `.claude/rules/work-units.md`

## Key Learnings
- [Troubleshooting Patterns](../../docs/13-troubleshooting/entries.md) — TS-000~ 현재 0건
- [Tech Gotchas](tech-gotchas.md) — iframe sandbox / OPFS / Next.js App Router / Tailwind v4 주의사항
- [Policy Registry](../../docs/03-policy/01-policy-registry.md) — ARCH-01~04, TECH-01~10, PROD-01~05, CONST-01/02

## PRD + 로드맵 (Living Documents)
- **PRD**: `docs/04-planning/01-prd.md` (v2 ID 53건 등재)
- **로드맵**: `docs/04-planning/02-roadmap.md` (v0.9.0)
- **v2 Plan**: `docs/04-planning/03-v2-plan.md` (v0.3.0 ✅)
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
- **REFAC-02-P1 ✅ 완료 (2026-05-27)**: 5 Port 인터페이스 SSOT (`packages/core/src/ports/` 7 파일) + `@zm/adapters-local` 신규 패키지 골조 + namespace-registry adapterPolicies 배열 reshape + system namespace 5번째 엔트리 + indexeddb.ts DB_VERSION 4→5 + resolve-adapter.ts 호환 alias 사용. turbo type-check 5/5 PASS + test 5/5 PASS (회귀 0).
- **REFAC-02-P2 ✅ 완료 (2026-06-07)**: BlobStorage Port + IDB/OPFS/Memory 어댑터 → `@zm/adapters-local/blob-storage` 흡수(7파일 이전) + AbortSignal(OPFS list 매 entry throwIfAborted) + `BlobStorageError extends PortError` + `createLocalBlobStorage` 통합 팩토리 + testing subpath + `@zm/storage` deprecation shell(소비처 4파일 변경 0). type-check 5/5 + vitest 90 + next build ✅.
- **REFAC-02-P3 ✅ 완료 (2026-06-07)**: AppRepository Port + LocalRepo IDB 어댑터(`@zm/adapters-local/app-repository`, BlobStorage 위 thin layer, content-agnostic) + cascade remove + INVALID_SOURCE 가드 + defaultOwnerId + contract test 14. 범위 A(어댑터만) — 소비처 wrapper 흡수/usePorts reshape/content 마이그레이션은 P5로 이관(빌드 깨짐 회피). type-check 5/5 + vitest 104 + build ✅.
- **다음 후보**: **REFAC-02-P4** — AuthProvider+SyncProvider+ModerationProvider Local 어댑터 (LocalAuth/LocalNoOpSync/LocalStaticModeration + patterns.ts 7정규식, ADR-0018/0021/0022). 5일 추정.

## 최근 결정사항 (최대 10, FIFO)
- 2026-06-07: **REFAC-02-P3 완료** — AppRepository Port + LocalRepo IDB 어댑터(ADR-0019 실행, 범위 A=어댑터만). `@zm/adapters-local/app-repository` 신규: `createLocalAppRepository(blob)`(BlobStorage 위, user-apps+installed-apps 2 namespace, cascade remove, INVALID_SOURCE 가드, defaultOwnerId, content-agnostic) + testing subpath + contract test 14. AppRecord에 htmlContent 필드 없음 확인 → html은 BlobStorage(contentRef.blobKey) 담당. **소비처 wrapper 흡수/usePorts reshape/content 마이그레이션은 P5로 이관**(usePorts/Composition Root 의존 — 빌드 깨짐 회피). apps/web 무변경. type-check 5/5 + vitest 90→104(+14) + build ✅.
- 2026-06-07: **REFAC-02-P2 완료** — BlobStorage Port + LocalOPFS 어댑터 이전(ADR-0020 실행). `packages/storage` 7파일 → `@zm/adapters-local/blob-storage` 흡수 + AbortSignal(OPFS list 매 entry throwIfAborted, IDB/Memory 진입 폴링) + `BlobStorageError extends PortError`(8 code) + `createLocalBlobStorage` 팩토리 + testing subpath. `@zm/storage`=deprecation shell(re-export, 소비처 4파일 변경 0). adapters-local exports/idb dep + apps/web tsconfig/vitest/next에 `@zm/adapters-local` 등록 + pnpm install. type-check 5/5 + vitest 80→90(+19) + next build ✅.
- 2026-06-07: **OS 확장 근본 아키텍처 F0 계약 락** — 실제 OS 기능 확장 기반을 미리 확정. capability-우선(단일 load-bearing: capability 토큰→IPC 권한) + microkernel-lite + 점진. `@zm/core`에 capability/service/events 계약 SSOT + `capabilitiesToAllowedMethods` seam(fail-closed) + IPC `authorize` optional hook(byte-identical) + READY grantedCapabilities·MSG_TYPE.EVENT additive 예약. manifest 스키마 불변. ADR-0033/0034 + arch 07 + ARCH-04. VFS는 Port 아님(PortName 불변), 구현은 REFAC-02-P5 후(F1~F3). Explore 3 + Plan 2 + 사용자 Q1=A/Q2=A. type-check 5/5, vitest 69→80.
- 2026-06-07: **요구사항·계획·실수/리스크 정밀 검토 + 보강 1차** — 보고서 `docs/05-analysis/04-requirements-and-risk-review.md` 신규. 도메인 보안(iframe/IPC/CSP) 정합 우수 확인 (웹 오탐 reconcile: Comlink #603=자체 wire-RPC라 비적용). 적용: M-004~006 등록 + D1 스토리지 쿼터 모니터링 구현(quota-monitor/use-quota-monitor/QuotaBadge, vitest 61→69, tsc 5/5) + security.md 제품 리스크 RP-1~6 신설 + D2 soft-timeout deferred 명시 + stale 경로(src/lib/apps/ipc→packages/ipc 등) 정정 + v2-plan P1 의존성 노트. 비기능 요구사항(성능/브라우저/스토리지)은 선택지만 제시(미확정).
- 2026-06-07: **문서 메타데이터 정밀 검토 + 8건 일괄 동기화** — 코드/기능 결함 0 (type-check 5/5, test 61/61, 협업 인프라 무결성 100%). 협업 인프라 이식(c368b5e) 후 누적 stale 정정: CLAUDE.md/quick-ref/_workflow 에이전트 13→14명(zm-context-guardian) + 스킬 9→17, current-phase 테스트 56→61 + historical 섹션 표기, doc-naming ADR 0008→0032·arch 05→06, MEMORY/feature-map/roadmap "ADR-0017 대기"→채택완료. archive/snapshot 등 historical 박제 보존. Explore 3 병렬 감사 + 직접 검증. 코드 변경 0.
- 2026-06-07: **sonix_docs 협업 인프라 이식 완료 (4 Phase, 37 산출물)** — 다중 세션·팀원 협업(격리·직렬화·감사 3층). file_lock/idgen/merge_jsonl/_resolve-user verbatim + wu_claim_manager(ML→WU 일반화, 기존 ID claim) + emit_event 교체(append API, actor dict 수정) + 헌법 3(ADR-0030~0032) + 카테고리 A~E + M-002/M-003 BLOCK + 협업 스킬 8 + zm-context-guardian + team-config(KYB만) + worktree/merge-driver/pre-push. events/ 추적 전환. 검증: 훅 smoke + claim 왕복 + merge driver + type-check 5/5 + vitest 5/5 회귀 0.
- 2026-05-27: **REFAC-02-P1 완료** — Ports & Adapters 코드 마이그레이션 첫 작업. 13 파일 변경 (신규 10 + 수정 3). `packages/core/src/ports/` 7 파일 (common/auth/app-repository/blob-storage/sync/moderation/index) + `@zm/adapters-local` 신규 패키지 골조 + namespace-registry adapterPolicies 배열 reshape (호환 alias `getLegacyAdapterPolicy` 제공) + system namespace 추가 + indexeddb.ts v5 upgrade + resolve-adapter.ts alias 사용. lib-developer + architect 검증 + 직접 보완 (lib-developer 토큰 한도로 일부 누락). turbo type-check 5/5 + test 5/5 PASS.
- 2026-05-27: **v2 plan v0.3.0 작성** — ADR-0017~0023 채택 반영. 10 Epic + 58 작업 + 24주 추정 (REFAC-02 3주 + M5~M10 21주). 각 작업에 LocalAdapter 필수 / CloudAdapter 옵션 표기. 신규 Epic J REFAC-02 (P1~P5 = M5 진입 전 선행). Local-only v2.0 출시 옵션 명시.
- 2026-05-27: **ADR-0018~0023 Local 어댑터 6건 일괄 채택** — LocalAuth(crypto.randomUUID + system namespace + BroadcastChannel) + LocalRepo IDB(installed-apps/user-apps 2 namespace, cascade remove, contentRef inline v2.0) + LocalOPFS BlobStorage(packages/storage 흡수, AbortSignal 매 entry, BlobStorageError extends PortError) + LocalNoOpSync(silent no-op ~30 LOC) + LocalStaticModeration(정규식 7 패턴 fail-closed + ConfirmDialog 재사용) + Adapter Resolver(createLocalPorts + PortsContext + 동적 import Suspense + adapterPolicies Port+namespace 2차원). architect 2회 병렬 호출 + 사용자 결정 26건 추천 일괄 채택.
- 2026-05-27: **ADR-0017 Ports & Adapters 채택** — 5 Port(Auth/AppRepo/Blob/Sync/Moderation) + 단일 `PortError` + `@zm/core/ports` SSOT + `@zm/adapters-local` 신규 패키지 + 하이브리드 어댑터 선택 + `@zm/storage` 1 v2 minor deprecation. ADR-0013/0014/0015 superseded. ARCH-03 신규 + ARCH-01/TECH-01 reshape + TECH-07/08/09 deprecated. 사용자 결정 8건 일괄 채택.
> **최종 갱신**: 2026-06-07 — REFAC-02-P3 완료 (AppRepository LocalRepo 어댑터, content-agnostic, 소비처는 P5, vitest 104, type-check 5/5, build ✅)
