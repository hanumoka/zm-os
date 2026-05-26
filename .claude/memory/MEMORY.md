# zm-os Project Memory
> 시스템 프롬프트 자동 로드 (200줄 한도). 최종 갱신: 2026-05-25 (문서 체계 고도화)

## 프로젝트 수치 (항상 최신 유지)
- 현재 Phase: **Phase 3 ✅ 완료 (4/4, 100%)** — M4 마일스톤 달성, POC 종료
- 코드 LOC: ~5200 LOC (TS) + samples/games ~1500 LOC (HTML/JS) — DSK-05 신규 4파일 + 수정 6파일 + 테스트 6파일
- 에이전트: 13개 (architect, research-analyst, design-reviewer, lib-developer, fe-developer, build-checker, code-reviewer, app-sandbox-auditor, constraint-checker, integration-tester, perf-monitor, self-verifier, doc-updater) + workflow 문서
- 모델 전략: architect/design-reviewer/self-verifier=opus / 구현·리뷰·감사·통합검증=sonnet / 빌드·문서·제약·성능=haiku
- 스킬: 9개 (zm-commit, zm-unit-done, zm-session, zm-troubleshoot, zm-memory-save, zm-work-intake, zm-work-completion, zm-doc-status, zm-roadmap)
- 규칙: 10개 (frontend, security, work-units, known-mistakes, doc-naming, file-categories, quality-standard, self-review, auto-memory-protocol, troubleshoot-auto)
- 훅: 10개 Python (mistake_guard, post_review, session_start, notify_done, category_guard, emit_event, prompt_context, pre_compact, post_compact, post_review_checks)
- 단위 테스트: Vitest 61개 (6파일 ALL PASS) | E2E: Playwright 6개 (모두 PASS)
- 의존성: next 16, react 19, tailwind 4, zod 4.4.3, typescript 5, react-rnd v10.5.3, phaser@3.90.0, idb@8.0.3, jszip@3.10.1, pixi.js@8.18.1, three@0.184.0, vitest@4.1.7 (dev), playwright (dev)

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
- [Troubleshooting Patterns](../../docs/13-troubleshooting/entries.md) — TS-000~ 현재 0건
- [Tech Gotchas](tech-gotchas.md) — iframe sandbox / OPFS / Next.js App Router / Tailwind v4 주의사항
- [Policy Registry](../../docs/03-policy/01-policy-registry.md) — 확정 정책 SSOT (ARCH-01, ARCH-02, TECH-01)

## PRD + 로드맵 (Living Documents)
- **PRD**: `docs/04-planning/01-prd.md`
- **로드맵**: `docs/04-planning/02-roadmap.md`
- **Feature Map**: `docs/01-architecture/05-feature-map.md`

## SSH GitHub 계정
- 개인 계정 `hanumoka` 사용. SSH config host는 `github-personal` (key: `id_hanumoka_personal`)
- 회사 계정과 분리되어 있음 — 자세히는 글로벌 메모리(`~/.claude/projects/.../memory/ssh-github-accounts.md`)

## User Preferences
- 한국어로 응답 기본
- 정책 결정 사항은 사용자에게 선택지 제시 후 결정 (work-units.md 참조)
- v2 단계 — 설계 안정성/유연성/확장성 > 개발 속도. 면밀한 검토 + 작업 결과 검수 중시.

## Project State
- **Phase 3 ✅ 완료 (4/4, 100%)** + **Post-POC 진행 중**
- **POC 종료 게이트 ✅ 통과** — 보안 14 페네스트 + 번들 임계치 PASS, 데모/시연 가능.
- **Post-POC**: APP-04 ✅ + TEST-01 ✅ + DSK-05 ✅ + REFAC-01 (2/8) 진행 중
- **REFAC-01**: 설계 리팩토링 **8/8 ✅ 전체 완료** (C-1+H-5+C-3+H-1+H-4+H-2+H-3+C-2)
- 다음 후보: ADR-Monorepo 작성 + PRD §3 v2 ID 일괄 등재 + ADR 2차 7건 작성 (Storage/Hosting/Permission/API-Auth/Migration/Moderation/PROD-05-v2)

## 최근 결정사항 (최대 10, FIFO)
- 2026-05-26: v2 ADR 3건 일괄 작성 — ADR-0013(Auth: Supabase Auth) + ADR-0014(DB: Supabase Postgres + Drizzle) + ADR-0015(Sync: LWW + 서버 권위 시계). policy-registry TECH-07/08/09 + CONST-01/02 등재. research-analyst 3건 사실 조사 기반.
- 2026-05-26: v2 Plan v0.2.0 — architect 검토 + 사용자 결정 4건 반영. **9 Epic(G/H/I 신규) + 46 작업 + 12 ADR 후보 + 10 정책 reshape + M5~M10 (21주)**.
- 2026-05-26: v2 Plan 초안 작성 — 6 Epic + 33 작업 + 7 ADR 후보 + 8 정책 reshape + 4 마일스톤(M5~M8). docs/04-planning/03-v2-plan.md.
- 2026-05-26: APP-04 확장 완료 — 데스크탑 아이콘 우클릭 컨텍스트 메뉴 (앱 정보 + 사용자 앱 삭제). AppInfoDialog 신규.
- 2026-05-26: REFAC-01 정밀 감사 + 수정 — H-3 lib→components 역방향 의존성 제거 + C-2 정책 코멘트 복원.
- 2026-05-26: REFAC-01 **전체 완료 (8/8)** — H-2 9 validator 분리 + H-3 ContentLoader 전략 + C-2 Desktop 컴포넌트 분리.
- 2026-05-26: REFAC-01 H-4 완료 — usePersistence 훅 추출. 4개 Provider 공통 hydration+persist 패턴 DI화.
- 2026-05-26: REFAC-01 H-1 완료 — Manifest v2 Schema (capabilities 개방형 string[]). V1/V2 하위호환 마이그레이션.
- 2026-05-26: REFAC-01 C-3 완료 — Namespace Registry 통합 (3파일→1파일 SSOT). 'window-layout' 버그 수정.
- 2026-05-25: REFAC-01 착수 — 설계 정밀 검토 8항목 확정. C-1 Error Boundary + H-5 에러 플러밍 완료.
- 2026-05-25: DSK-05 완료 — 데스크탑 커스터마이징 (배경화면 8 프리셋 + URL + 라이트/다크/시스템 테마 + 컨텍스트 메뉴 + 설정 패널). ADR-0012.
- 2026-05-25: TEST-01 완료 — Vitest 4.1.7 도입 + 56개 단위 테스트. zip-loader Node.js File 호환 수정.
- 2026-05-25: APP-04 완료 — 사용자 앱 삭제(확인 다이얼로그) + 업데이트(semver 비교). ConfirmDialog 범용 UI. ADR-0011.
- 2026-05-25: N-08 postMessage DoS 방어 완료 — rate-limiter.ts (고정 윈도우 카운터 60건/초 + penalty 2초). host.ts 통합.
- 2026-05-25: STG-02 + DSK-04 완료 — StorageAdapter Strategy 패턴 (IDB/OPFS/Memory) + 윈도우 레이아웃 영속화. ADR-0009 확정.
- 2026-05-25: 에이전트 팀 재편 10→13명. 2단계 검증 파이프라인 + architect/design-reviewer 필수 게이트.
- 2026-05-25: Phase 3-C 데모 영상 완료 — Playwright 비디오 녹화 7 Scene. M4 마일스톤 달성, POC 공식 종료.
- 2026-05-25: Phase 3-B 게임 엔진 호환성 매트릭스 — Pixi.js 8.18.1 + Three.js r184 ALL PASS.
- 2026-05-25: 문서 체계 고도화 — sonix_docs 패턴 도입. docs/ 번호 기반 카테고리 + 규칙 10 + 훅 10 + 스킬 9.

> **최종 갱신**: 2026-05-25 — REFAC-01 설계 리팩토링 착수 (C-1+H-5 완료)
