---
name: zm-wu-stop
description: "Release a Work Unit claim and update its state (완료/중단/차단). Updates roadmap marker, emits wu_release/wu_state_change, auto-commits and pushes, and recovers the worktree. Use when finishing or interrupting a task. Auto-loads for '작업 완료', '작업 중단', 'wu stop', 'release' queries."
disable-model-invocation: false
allowed-tools: Bash, Read, Edit
argument-hint: "<WU-ID> 완료|중단|차단"
---

# /zm-wu-stop

본 세션이 점유 중인 작업(Work Unit)을 해제하고 상태를 갱신한다.
(sonix_docs `zm-ml-stop` 일반화 이식)

## 실행

```bash
python -X utf8 .claude/hooks/wu_claim_manager.py release <WU-ID> <완료|중단|차단>
```

## outcome 종류

| outcome | roadmap 마커 | 의미 |
|---------|:------------:|------|
| `완료` | ✅ | 모든 태스크 완료, 재claim 불필요 |
| `중단` | ⬜ | 이번 세션에서 못 끝냄, 추후 재claim 가능 |
| `차단` | 🚫 | 외부 의존으로 멈춤. 차단 사항 별도 추적 |

## 동작 (wu_claim_manager.py release)

1. `.project-memory/claims/<WU>.json` read → 본 세션/user 의 claim 아니면 거부 (`--takeover` 안내)
2. `docs/04-planning/02-roadmap.md` 마커 갱신 (🔵→ outcome). transition guard: 🔵 아니면 skip + 경고
3. claim 샤드 삭제 + `wu_release` + `wu_state_change` event emit
4. `git add` + commit + push

## 후속 처리 (Claude Code 응답)

1. `.project-memory/context-kyb.md` "현재 포커스"에서 제거 + "최근 결정사항"에 한 줄 (필요 시 `/zm-memory-save`)
2. **워크트리 회수** (헌법 1 — 명시적 자기 정리):
   - **outcome=완료**: release 직후 `ExitWorktree(action="remove")` 호출 (uncommitted/unmerged 있으면 자동 거부 → commit/push 후 재호출)
   - **outcome=중단/차단**: `ExitWorktree(action="keep")` — 재claim 시 동일 worktree 재진입
   - ⚠️ `cleanupPeriodDays` 자동 sweep 에만 의존 금지 — 명시적 ExitWorktree(remove) 가 신뢰 경로
3. 고아 worktree 일괄 정리: `python .claude/hooks/wu_claim_manager.py gc-worktrees` (clean+merged+non-active 만 제거)

## 워크트리 → main 통합 표준 절차

worktree 작업을 main 에 반영할 때, 다른 세션이 main 을 선행시키면 worktree 가 발산(diverged)한다.
**항상 fetch → worktree 에 origin/main 흡수 → 메인에서 `merge --no-ff`** 순서. `--ff-only` 통합 금지.

```bash
git fetch origin
git merge origin/main         # worktree 안에서 (events 는 merge driver 가 자동 union)
git -C <main> merge --no-ff <worktree-branch>
git -C <main> push
```

**Fail-Safe (P7)**: 메인 working tree 가 dirty(타 세션 미커밋)면 통합 보류 — worktree 브랜치를 origin 에 올려 durable 하게 둠.

## 관련

- 점유: `/zm-wu-start <WU>`
- 현황: `python .claude/hooks/wu_claim_manager.py status`
- 규칙: [.claude/rules/wu-claim.md](../../rules/wu-claim.md)
