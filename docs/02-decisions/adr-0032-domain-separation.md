# ADR-0032: 멀티 세션 협업 — 영역 분리 + 명시적 Lifecycle + Fail-Safe

- **number**: 0032
- **title**: 멀티 세션 협업 — 영역 분리 + 명시적 Lifecycle + Fail-Safe
- **status**: accepted
- **date**: 2026-06-07
- **author**: KYB (김영빈)
- **related**: [ADR-0030, ADR-0031]

## Context

정책 문서만으로는 사람/자동화 영역 침범과 lifecycle 우회를 막을 수 없다. sonix_docs 의
카테고리 매트릭스 + 명시적 lifecycle + Fail-Safe 를 이식한다. 헌법 3 의 근거.

## Decision

**P4**: 모든 파일에 [HUMAN / SYSTEM / SHARDED / EVENTS / LOCAL] 카테고리. hook 이 강제(점진).
정의: `.claude/rules/file-categories.yaml` `governance_categories`.

**P5**: 작업 시작/중단/완료는 항상 system call(`/zm-wu-start`·`/zm-wu-stop`).
"감으로 시작 / 조용히 종료" 차단.

**P7**: 모호한 상황(stale claim, mismatched session_id, 비정상 transition)은 자동 진행하지 않고
사용자 확인. Fail-Safe defaults.

강제: `category_guard.py`(카테고리), `mistake_guard_edit.py`(WU 영역 + WU_ENFORCE),
`mistake_guard.py`(Bash BLOCK — M-002 `git add -A`, M-003 `--no-verify`).

## Consequences

- (+) SYSTEM(claims) 직접 편집·EVENTS 수정·우회 push 가 경고/차단됨
- (+) 단일 개발자에서도 안전, 팀원 추가 시 SHARDED cross_prefix 자동 활성
- (−) 일부 작업에 lifecycle 명령 절차 추가 (스킬이 자동화)

## Related

- 헌법: `.claude/rules/constitution/03-domain-separation.md`
- 규칙: `.claude/rules/wu-claim.md`, `.claude/rules/known-mistakes.md`
- ADR-0030(Isolation), ADR-0031(SSOT)
- 원본: sonix_docs ADR-KYB0091
