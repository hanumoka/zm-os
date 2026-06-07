# WU Claim Protocol (MANDATORY)

작업(Work Unit)을 시작/종료할 때 Claude Code 세션이 자동으로 점유(claim)/해제(release)하여
여러 세션·팀원 중 누가 어느 작업을 어느 세션으로 잡고 있는지 가시화한다.
(sonix_docs ML Claim Protocol 일반화 이식 — zm-os 는 기존 식별자에 claim 만 적용)

## WU 식별자

zm-os 기존 식별자를 그대로 claim 키로 사용한다. 자동 번호 발급 없음.
- 예: `REFAC-02-P2`, `USR-01`, `Epic-J`, `M5-SRV-01`, 또는 ad-hoc `WU-7`

## 데이터 모델

- **운영 SSOT**: `.project-memory/claims/<WU>.json` (per-WU 샤딩, git tracked, team-shared)
- **감사 SSOT**: `events/YYYY-MM.jsonl` (append-only)
- **상태 표시(best-effort)**: `docs/04-planning/02-roadmap.md` 상태 마커 (⬜→🔵→✅/⬜/🚫)

## 사용 명령

| 시점 | 명령 | 동작 |
|------|------|------|
| 작업 시작 | `/zm-wu-start <WU>` | claim + 🔵 + worktree 진입 + git commit/push |
| 작업 완료 | `/zm-wu-stop <WU> 완료` | release + ✅ |
| 일시 중단 | `/zm-wu-stop <WU> 중단` | release + ⬜ (재claim 가능) |
| 외부 차단 | `/zm-wu-stop <WU> 차단` | release + 🚫 |
| 강제 인계 | `/zm-wu-start <WU> --takeover` | stale claim 인계 |
| 현황 | `python .claude/hooks/wu_claim_manager.py status` | 활성 claim 목록 |

## 자동화 (Hook 통합)

- **SessionStart**: heartbeat 5분 이상 stale entry 자동 sweep + roadmap 상태 복원
- **PostToolUse (Edit/Write)**: 본 세션 user 의 active claim heartbeat 1분 throttle touch
- **Stop**: 본 세션 user 의 claim 에 last_stopped_at stamp
- **pre-push**: gitleaks 또는 fallback regex 로 secret 스캔, 차단 시 push reject

## 금지 사항

- [BLOCK] **`git push --no-verify` 금지** (M-003) — pre-push secret 스캔 우회 차단
- [BLOCK] **`git add .` / `git add -A` 금지** (M-002) — 무관/타 세션 변경물 우연 포함
- [BLOCK] **claims/<WU>.json 수동 편집 금지** — race condition. `/zm-wu-start`/`/zm-wu-stop` 또는 `wu_claim_manager.py` CLI 만 사용
- roadmap 상태 마커는 transition guard 준수 (🔵 ↔ ⬜/🟡, 🔵 → ✅/🚫)

## 운영 가이드라인

- **30분 이상 idle 시 release 권장**: `/zm-wu-stop <WU> 중단`
- **Agent Teams**: parent 세션에서 미리 `/zm-wu-start` → sub-team spawn. sub-session 은 claim 거부됨
- **세션 분기(`/clear`, `/compact`)**: 같은 user.name 이면 다음 PostToolUse 시 session_id 자동 갱신, claim 유지
- **충돌(push reject)**: `git pull --rebase` 후 재시도. claim 변경은 working tree 에 보존됨

## 위험 요소 (잔존)

| # | 위험 | 완화 |
|:-:|------|------|
| R1 | Claude crash 로 stale 진행중 | heartbeat 5분 TTL + SessionStart sweep |
| R2 | 동시 claim race | file_lock + transition guard + git push reject |
| R5 | secret 자동 push | pre-push hook (gitleaks/regex) |
| R8 | `/clear`·`/compact` 후 session_id 변경 | PostToolUse touch 가 새 session_id 자동 갱신 |

## 관련 문서

- 스킬: [`/zm-wu-start`](../skills/zm-wu-start/SKILL.md), [`/zm-wu-stop`](../skills/zm-wu-stop/SKILL.md)
- 모듈: [`.claude/hooks/wu_claim_manager.py`](../hooks/wu_claim_manager.py)
- 헌법: [constitution/](constitution/)
- pre-push: [`scripts/git-hooks/pre-push`](../../scripts/git-hooks/pre-push)
