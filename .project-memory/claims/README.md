# .project-memory/claims/ — WU Claim 샤딩 디렉토리

> 다중 세션·팀원 협업의 SSOT. `wu_claim_manager.py` 가 관리. **수동 편집 금지.**

## 구조

- `<WU-ID>.json` — Work Unit 1건당 1파일 (claim 당 1파일 → 머지 충돌 구조적 0).
  - 예: `REFAC-02-P2.json`, `USR-01.json`, `WU-7.json`
  - git-tracked (팀 가시성 보존). 다른 WU = 다른 파일이므로 `.gitattributes` merge 규칙 불필요.
- `<WU-ID>.json.lock` — `file_lock.py` 사이드카 (gitignored, 일시적).

## 엔트리 스키마

```json
{
  "claimed_by": "hanumoka",        // git user.name
  "user_name": "김영빈",
  "user_id": "M01",                 // team-config.json
  "session_id": "<UUID>",           // CLAUDE_CODE_SESSION_ID
  "session_short": "abc12345",
  "session_seq": null,
  "claimed_at": "ISO8601",
  "heartbeat_at": "ISO8601",        // PostToolUse touch 가 1분 throttle 로 갱신
  "last_stopped_at": null,
  "parent_session_id": null
}
```

## 생명주기 (수동 호출 금지 — 스킬 경유)

| 액션 | 명령 |
|------|------|
| 시작 | `/zm-wu-start <WU-ID> [--takeover]` |
| 중단/완료/차단 | `/zm-wu-stop <WU-ID> [중단\|완료\|차단]` |
| 현황 | `python .claude/hooks/wu_claim_manager.py status` |

- heartbeat 5분(`HEARTBEAT_TIMEOUT_SEC=300`) 초과 → stale. SessionStart sweep 가 자동 인계.
- 진실원: 이 디렉토리(운영 캐시) + `events/*.jsonl`(append-only 감사 로그).
- 상세 규칙: [.claude/rules/wu-claim.md](../../.claude/rules/wu-claim.md)
