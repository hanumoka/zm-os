# 헌법 2 — Single Source of Truth + Append-Only Events (P2, P3)

> **상위 ADR**: [ADR-0031](../../../docs/02-decisions/adr-0031-ssot-and-derived.md)
> **상태**: accepted (2026-06-07) — sonix_docs 협업 인프라 이식
> **Living Document**

## 원칙

**P2. 각 데이터의 진실원(SSOT)은 단 하나. 그 외는 derive 결과물.**

**P3. 상태는 변경되지만 이벤트는 추가만(append-only). 인덱스는 events 로부터 재생성 가능.**

## 근거

- 같은 파일에 상태 + 변경 로그를 겸직시키면 머지 충돌이 의미 손상으로 직결
- union merge 는 행 append 에 적합하나 행 update 에는 부적합
- Event Sourcing 은 충돌을 commutative 로 만들어 머지 불가능 영역 제거

## SSOT 매핑 (zm-os)

| 데이터 | SSOT | Derived view |
|--------|------|--------------|
| WU claim/상태 | `.project-memory/claims/<WU>.json` (운영 캐시) + `events` `wu_claim`/`wu_release`/`wu_state_change` | `docs/04-planning/02-roadmap.md` 마커(best-effort) |
| Lifecycle 이벤트 | `events/YYYY-MM.jsonl` | 인덱스/대시보드 |
| 결정(ADR) | `docs/02-decisions/adr-NNNN.md` | `events` `adr_add` |
| 정책 | `docs/03-policy/01-policy-registry.md` | `docs/03-policy/_digest.md` |
| 트러블슈팅 | `docs/13-troubleshooting/entries.md` | `docs/13-troubleshooting/index.md` |
| 개인 메모리 | `.project-memory/context-{user}.md` (LOCAL) | (없음 — host-bound) |

## 이벤트 스키마

공통 필드: `ts`(ISO8601), `type`, `actor`(user_id), `session`, `source_commit`, `details` + `entity_id`(불변 ULID, WU 결정론적).

타입: `wu_claim`(+`fencing_token`), `wu_release`, `wu_state_change`, `doc_change`, `adr_add`, `correction`.

## 머지 전략

- `events/*.jsonl merge=jsonl-append` — union+dedup+ts정렬 (`scripts/install-merge-drivers.sh`). 미등록 시 union fallback.
- `.project-memory/claims/<WU>.json` — per-WU 샤딩(claim당 1파일). 다른 WU = 다른 파일 → 머지 충돌 0. `.gitattributes` merge 규칙 불필요.
- `docs/04-planning/02-roadmap.md` / troubleshooting `entries.md`,`index.md` — `merge=union`.
- `.project-memory/context-*.md` — `merge=ours` + `.gitignore`(untrack 결정 우선).

## 도구

- `.claude/hooks/emit_event.py` — append (CLI/Library/PostToolUse)
- `.claude/hooks/idgen.py` — ULID 생성
- `.claude/hooks/file_lock.py` — read→write 직렬화
- `.claude/hooks/merge_jsonl.py` — events union+dedup 머지 드라이버
- `.claude/hooks/wu_claim_manager.py` — claim/release/sweep + wu_claim/wu_release emit

## 예외

- 사람이 SSOT(ADR/entries.md)를 직접 편집하는 것은 허용
- events 정정은 modify/delete 가 아닌 `correction` 타입 신규 append

## 관련 헌법

- [01-isolation-first.md](01-isolation-first.md)
- [03-domain-separation.md](03-domain-separation.md)
