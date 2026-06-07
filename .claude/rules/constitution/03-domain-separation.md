# 헌법 3 — 영역 분리 + 명시적 Lifecycle + Fail-Safe Defaults (P4, P5, P7)

> **상위 ADR**: [ADR-0032](../../../docs/02-decisions/adr-0032-domain-separation.md)
> **상태**: accepted (2026-06-07) — sonix_docs 협업 인프라 이식
> **Living Document**

## 원칙

**P4. 모든 파일에 [HUMAN / SYSTEM / SHARDED / EVENTS / LOCAL] 카테고리. hook이 강제(점진).**

**P5. 작업 시작/중단/완료는 항상 system call. "감으로 시작 / 조용히 종료" 차단.**

**P7. 모호한 상황(stale claim, mismatched session_id, 비정상 transition)은 자동 진행 X, 사용자 확인.**

## 카테고리 매트릭스

상세: [`.claude/rules/file-categories.yaml`](../file-categories.yaml)

| 카테고리 | 의미 | 편집 권한 | 위반 시 |
|:--------:|------|----------|---------|
| **A. HUMAN** | 사람 전용 (아키텍처/정책/기획) | 사람만 | [WARN] |
| **B. SYSTEM** | 자동화 전용 (claims/인덱스/상태) | 자동화만 | [WARN] → [BLOCK] |
| **C. SHARDED** | 개인별 (`{PREFIX}`) | 본인 PREFIX 만 | [BLOCK] (cross_prefix) |
| **D. EVENTS** | append-only 이벤트 | 누구나 append | [BLOCK] (modify/delete) |
| **E. LOCAL** | 호스트별 local | 자유 (gitignored) | (없음) |

## Lifecycle 강제

| 액션 | 명령 | 자동 처리 |
|------|------|----------|
| 작업 시작 | `/zm-wu-start <WU>` | claim + 🔵 마커(best-effort) + worktree 진입 + wu_claim event |
| 작업 중단 | `/zm-wu-stop <WU> 중단` | release + ⬜ 마커 + wu_release event + worktree keep |
| 작업 완료 | `/zm-wu-stop <WU> 완료` | release + ✅ 마커 + wu_release event + worktree grace |
| 외부 차단 | `/zm-wu-stop <WU> 차단` | release + 🚫 마커 + wu_release event |

명령 없이 활성 WU 영역 편집 시:
- 기본: `mistake_guard_edit.py` [WARN]
- `WU_ENFORCE=1`: [BLOCK]

## Fail-Safe 패턴

| 상황 | 자동 동작 | 사용자 확인 |
|------|----------|------------|
| stale claim (heartbeat 5분 초과) | 자동 인계 | (None — TTL 결정) |
| roadmap transition guard 위반 | 마커 갱신 skip + 경고 | 사용자 확인 후 정정 |
| pre-push secret scan 의심 | push 차단 | 결과 확인 후 재push |
| worktree remove 시 uncommitted | refuse | `--discard-changes` 명시 |
| `--no-verify` 시도 | 차단 (M-003) | (예외 없음) |
| `git add . / -A` 시도 | 차단 (M-002) | 명시적 파일 add |

## 정정 메커니즘 (각 강제 정책의 우회로)

- `WU_ENFORCE=0` — 메인 worktree 편집 가드 토글
- correction 이벤트 — events 정정
- `--takeover` — stale claim 강제 인계
- `.claude/settings.local.json` — 호스트별 override
- `.worktreeinclude` 명시적 제외 — host-bound 데이터 비복사

## 도구

- `.claude/hooks/category_guard.py` — PreToolUse Edit/Write 카테고리 검증
- `.claude/hooks/mistake_guard_edit.py` — 활성 WU 영역 메인 worktree 편집 [WARN]/[BLOCK]
- `.claude/hooks/mistake_guard.py` — Bash BLOCK 패턴 (M-002/M-003 포함)
- `.claude/rules/known-mistakes.md` — [BLOCK] 패턴 동적 로딩

## 관련 헌법

- [01-isolation-first.md](01-isolation-first.md)
- [02-ssot-and-derived.md](02-ssot-and-derived.md)
