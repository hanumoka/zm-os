# zm-os Project Memory
> 시스템 프롬프트 자동 로드 (200줄 한도). 최종 갱신: 2026-05-25 (문서 체계 고도화)

## 프로젝트 수치 (항상 최신 유지)
- 현재 Phase: **Phase 3 ✅ 완료 (4/4, 100%)** — M4 마일스톤 달성, POC 종료
- 코드 LOC: ~4300 LOC (TS) + samples/games ~1500 LOC (HTML/JS) — 작업 2 문서만 (코드 변경 0)
- 에이전트: 10개 (architect, research-analyst, lib-developer, fe-developer, build-checker, code-reviewer, app-sandbox-auditor, constraint-checker, self-verifier, doc-updater) + workflow 문서
- 모델 전략: architect/self-verifier=opus / 구현·리뷰·감사=sonnet / 빌드·문서·제약검사=haiku
- 스킬: 9개 (zm-commit, zm-unit-done, zm-session, zm-troubleshoot, zm-memory-save, zm-work-intake, zm-work-completion, zm-doc-status, zm-roadmap)
- 규칙: 10개 (frontend, security, work-units, known-mistakes, doc-naming, file-categories, quality-standard, self-review, auto-memory-protocol, troubleshoot-auto)
- 훅: 10개 Python (mistake_guard, post_review, session_start, notify_done, category_guard, emit_event, prompt_context, pre_compact, post_compact, post_review_checks)
- 단위 테스트: 0 | E2E: Playwright 6개 (snake/hydration/zip-upload/pentest/engine-compat/demo-video, 모두 PASS)
- 의존성: next 16, react 19, tailwind 4, zod 4.4.3, typescript 5, react-rnd v10.5.3, phaser@3.90.0, idb@8.0.3, jszip@3.10.1, pixi.js@8.18.1 (NEW), three@0.184.0 (NEW), playwright (dev)

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
- POC 단계 — 코드 정교함보다 빠른 검증 우선

## Project State
- **Phase 3 진행 중 (2/4, 50%)**. 작업 1 ✅ (APP-02 ZIP 업로드), 작업 2 ✅ (안정화).
- **POC 종료 게이트 ✅ 통과** — 보안 14 페네스트 + 번들 임계치 PASS, 데모/시연 가능.
- 마지막 커밋: `d1c391a test(security): Phase 3 작업 2 안정화`, push 완료.
- **🛑 세션 종료 (2026-05-25)**. 다음 세션 진입 시 Phase 3 남은 3 후보 중 사용자 선택:
  - 게임 엔진 호환성 (Pixi.js + Three.js + Godot)
  - STG-02 OPFS + DSK-04 윈도우 위치 영속화
  - 데모 영상 (e2e end-to-end)

## 최근 결정사항 (최대 10, FIFO)
- 2026-05-25: 문서 정밀 검토 — 11건 이슈 수정 (broken link 3건 + FIFO 정리 + 버전 0.8.0 bump + settings.json 스킬 permission 추가). 정합성 97%→100%.
- 2026-05-25: Phase 3-C 데모 영상 완료 — Playwright 비디오 녹화 7 Scene (스토어→ZIP→Snake→Pixi+Three→사용자앱→피날레). M4 마일스톤 달성, POC 공식 종료.
- 2026-05-25: Phase 3-B 게임 엔진 호환성 매트릭스 — Pixi.js 8.18.1 + Three.js r184 ALL PASS. 3개 엔진 sandbox/WebGL/격리 검증.
- 2026-05-25: 문서 체계 고도화 — sonix_docs 패턴 도입. docs/ 번호 기반 카테고리 + 규칙 10 + 훅 10 + 스킬 9 + events/ 이벤트 스트림.
- 2026-05-25: Phase 3 작업 2 완료 — 안정화 (번들 1.4MB + 14 페네스트 ALL PASS). N-08 postMessage DoS v2 후보.
- 2026-05-24: Phase 3 작업 1 완료 — APP-02 ZIP 업로드 (JSZip 3.10.1, 보안 검증 6단계). ADR-0008 + PROD-05.
- 2026-05-24: Phase 2 ✅ 완료 (4/4) — STR-01/02 + STG-01 + APP-03 + GAME-01. Playwright e2e ALL PASS.
- 2026-05-24: Phase 1 ✅ 완료 (7/7) — 코어 샌드박싱 + 윈도우 매니저 + 보안 감사.
- 2026-05-24: 에이전트 팀 10명 재구성. 표준 워크플로 (_workflow.md).
- 2026-05-24: Phase 0 완료 + 핵심 정책 확정 — ARCH-01/02 + TECH-01~05 + PROD-01~05.

> **최종 갱신**: 2026-05-25 — POC 1차 완료 (M4), 문서 정밀 검토 + 리팩토링 완료
