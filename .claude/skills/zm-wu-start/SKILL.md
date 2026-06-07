---
name: zm-wu-start
description: "Claim a Work Unit (WU) for the current Claude Code session. Records claimed_by/session_id/heartbeat in .project-memory/claims/, marks roadmap state ⬜→🔵, emits wu_claim event, auto-commits and pushes. Use when starting work on a task (REFAC-02-P2, USR-01, Epic-J, ...). Auto-loads for '작업 시작', 'claim', '점유', 'wu start' queries."
disable-model-invocation: false
allowed-tools: Bash, Read, Edit
argument-hint: "<WU-ID> [--takeover]"
---

# /zm-wu-start

특정 작업(Work Unit)을 현재 Claude Code 세션이 점유(claim)한다. 다른 세션/팀원이 이미 점유 중이면 거부된다.
(sonix_docs `zm-ml-start` 일반화 이식 — zm-os 는 기존 식별자에 claim 만 적용)

## 실행

```bash
python -X utf8 .claude/hooks/wu_claim_manager.py claim <WU-ID>
```

`--takeover` 플래그로 stale claim 강제 인계 가능. WU-ID 는 zm-os 기존 식별자 그대로 (예: `REFAC-02-P2`, `USR-01`).

## 동작 (wu_claim_manager.py claim)

1. git user.name → `_resolve-user.py` 로 user_id 매핑 (KYB → M01)
2. `CLAUDE_CODE_SESSION_ID` 추출 + Agent Teams sub-session 감지 시 거부
3. `git fetch origin <branch>` (stale view 방지, 비차단)
4. `.project-memory/claims/<WU>.json` read → 이미 active 면 거부 (stale 5분+ 시 자동 인계)
5. claim 샤드 atomic write + `wu_claim` event emit (entity_id = WU 결정론적 ULID, fencing_token)
6. `docs/04-planning/02-roadmap.md` 행의 상태 마커 ⬜→🔵 (best-effort; 마커 행 없으면 skip)
7. `git add` (claim 샤드 + events + roadmap) + commit + push

## 출력 예시

```
[OK] REFAC-02-P2 claimed by 김영빈 (a1b2c3d4) | committed+pushed
[REJECT] REFAC-02-P2 이미 김영빈 (M01) 점유 중. claimed_at: ... --takeover 강제 인계 가능.
```

## 후속 처리 (claim 성공 시 Claude Code 가 즉시 수행)

1. **워크트리 자동 진입** (헌법 1 Isolation-First)
   - `EnterWorktree(name="<wu-lowercased>")` — 예: `REFAC-02-P2` → `EnterWorktree(name="refac-02-p2")`
   - base = `settings.json` `worktree.baseRef:"head"` (현재 브랜치)
   - 진입 후 모든 본 작업은 worktree 내부에서 (메인 working tree 편집 금지 — `mistake_guard_edit.py` 경고)
   - 이미 worktree 안이면 재진입 불필요
2. `.project-memory/context-kyb.md` "현재 포커스"에 한 줄 추가 (Auto Memory Protocol)
3. 작업 — PostToolUse hook 이 매 Edit/Write 마다 heartbeat 1분 throttle touch
4. 완료/중단 시 반드시 `/zm-wu-stop <WU> [완료|중단|차단]`

## 충돌 처리

- **push non-fast-forward**: `git pull --rebase` 후 재시도. claim 샤드는 working tree 에 보존.
- **transition guard**: roadmap 현재 마커가 예상(⬜/🟡)이 아니면 claim 만 갱신하고 roadmap skip + 경고.

## DRY-RUN

`ML_CLAIM_DRY_RUN=1` 환경변수 시 git 부작용 없이 claim 샤드/이벤트만 기록 (검증용).

## 관련

- 해제: `/zm-wu-stop <WU> [완료|중단|차단]`
- 현황: `python .claude/hooks/wu_claim_manager.py status`
- 규칙: [.claude/rules/wu-claim.md](../../rules/wu-claim.md)
