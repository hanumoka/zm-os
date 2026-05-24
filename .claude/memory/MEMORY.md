# zm-os Project Memory
> 시스템 프롬프트 자동 로드 (200줄 한도). 최종 갱신: 2026-05-24 (초기 셋팅)

## 프로젝트 수치 (항상 최신 유지)
- 현재 Phase: **Phase 0 — 초기 셋팅**
- 코드 LOC: 0 (셋팅만)
- 에이전트: 5개 (fe-developer, code-reviewer, build-checker, doc-updater, app-sandbox-auditor)
- 스킬: 5개 (zm-commit, zm-unit-done, zm-session, zm-troubleshoot, zm-memory-save)
- 규칙: 4개 (frontend, security, work-units, known-mistakes)
- 훅: 4개 Python (mistake_guard, post_review, session_start, notify_done)
- 단위 테스트: 0 | E2E: 0

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
- 초기 셋팅 진행 중: Next.js 16 골격 / .claude/ 셋팅 / zm-claude-docs/ 골격
- 다음 진입: POC 코드 구현 (가상 데스크탑 UI + 윈도우 매니저 + 앱 스토어 + 첫 샌드박스 게임 1개)

## 최근 결정사항 (최대 10, FIFO)
- 2026-05-24: ARCH-01 단일 Next.js 풀스택 (POC 단계, 모노레포는 v2)
- 2026-05-24: ARCH-02 iframe + Comlink 샌드박싱 (blob: URL, allow-scripts만)
- 2026-05-24: TECH-01 IndexedDB+OPFS 클라이언트 스토리지 (서버 동기화는 v2)
- 2026-05-24: 문서/CC 셋팅 — zm-v3 골격 + sonix_docs 베스트 결합 (Python hooks, ADR frontmatter, .claudeignore)

> **최종 갱신**: 2026-05-24 — Group A + Group B 셋팅 완료 (Next.js 골격 + .claude/ 전체)
