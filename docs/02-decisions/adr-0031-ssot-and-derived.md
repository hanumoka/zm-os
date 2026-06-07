# ADR-0031: 멀티 세션 협업 — SSOT + Append-Only Events

- **number**: 0031
- **title**: 멀티 세션 협업 — SSOT + Append-Only Events
- **status**: accepted
- **date**: 2026-06-07
- **author**: KYB (김영빈)
- **related**: [ADR-0030, ADR-0032]

## Context

협업 상태(누가 어느 작업을 점유 중인지, 변경 이력)를 여러 파일에 중복 보관하면 머지 충돌이
의미 손상으로 직결된다. sonix_docs Event Sourcing 패턴을 이식한다. 헌법 2 의 근거.

## Decision

**P2**: 각 데이터의 진실원(SSOT)은 단 하나. 그 외는 derive 결과물.

**P3**: 상태는 변경되지만 **이벤트는 추가만(append-only)**. 충돌을 commutative 로 만들어
머지 불가능 영역을 제거한다.

- WU claim SSOT = `.project-memory/claims/<WU>.json` (per-WU 샤딩 → 머지 충돌 0)
- 감사 SSOT = `events/YYYY-MM.jsonl` (append-only, `merge=jsonl-append` union+dedup+ts정렬)
- entity_id = WU 결정론적 ULID (`idgen.deterministic_ulid(0, wu_id)`)
- roadmap 마커는 best-effort derived view

## Consequences

- (+) 두 세션이 다른 WU/이벤트 append → 머지 충돌 구조적 0
- (+) 인덱스 손상 시 events 에서 복구 가능
- (−) `events/`·`claims/` 를 git 추적으로 전환 (기존 `events/` gitignore 해제)
- 도구: `emit_event.py`(append), `idgen.py`, `file_lock.py`, `merge_jsonl.py`, `wu_claim_manager.py`

## Related

- 헌법: `.claude/rules/constitution/02-ssot-and-derived.md`
- ADR-0030(Isolation), ADR-0032(Domain-Separation)
- 원본: sonix_docs ADR-KYB0090 / ADR-KYB0095
