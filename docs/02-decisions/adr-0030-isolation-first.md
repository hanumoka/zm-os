# ADR-0030: 멀티 세션 협업 — Isolation-First (worktree 격리)

- **number**: 0030
- **title**: 멀티 세션 협업 — Isolation-First (worktree 격리)
- **status**: accepted
- **date**: 2026-06-07
- **author**: KYB (김영빈)
- **related**: [ADR-0031, ADR-0032]

## Context

여러 Claude Code 세션(및 향후 팀원)이 동시에 zm-os 에서 작업할 때, 같은 working tree 를
공유하면 동시 편집으로 작업이 유실된다. sonix_docs(회사 프로젝트)에서 검증된 협업 인프라를
이식한다. 본 ADR 은 헌법 1(Isolation-First)의 근거다.

> 번호 메모: 0024~0029 는 index.md 가 CloudAdapter 트랙으로 예약 → 협업 헌법 ADR 은 0030~0032 사용.

## Decision

**P1**: 두 작업이 같은 파일을 동시에 만질 수 없도록 **git worktree 로 위치를 분리**한다.
lock 이 아니라 설계가 충돌을 막는다.

**P6**: `context-{user}.md`, `pre-compact-recovery` 등 개인 메모리는 **호스트별 LOCAL**
(`.gitignore`), 원격으로 흘러나가지 않는다. 새 worktree 에는 `.worktreeinclude` 로 따라온다.

실현: `/zm-wu-start` → `EnterWorktree(name="<wu>")` + `.claude/settings.json`
`worktree.{baseRef:"head", cleanupPeriodDays:1}`.

## Consequences

- (+) 동시 세션 작업 분실 구조적 0
- (+) 메인 working tree 는 조회/통합 전용으로 깨끗하게 유지
- (−) WU 시작 시 worktree 진입 절차 추가 (스킬이 자동화)
- 강제: `mistake_guard_edit.py` 가 활성 WU 영역 메인 편집을 [WARN](`WU_ENFORCE=1` 시 [BLOCK])

## Related

- 헌법: `.claude/rules/constitution/01-isolation-first.md`
- ADR-0031(SSOT), ADR-0032(Domain-Separation)
- 원본: sonix_docs ADR-KYB0089
