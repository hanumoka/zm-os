---
name: zm-wu-next
description: "(Optional) Suggest the next ad-hoc WU-NNN number by scanning roadmap and active claims. zm-os uses existing identifiers (REFAC-02-P2, USR-01) for named work, so this is only for ad-hoc work units. Read-only, no side effects."
disable-model-invocation: false
allowed-tools: Bash
argument-hint: ""
---

# /zm-wu-next

(선택) ad-hoc `WU-NNN` 작업번호의 다음 값을 조회한다. **read-only, 부수효과 0.**

> zm-os 는 명명 작업에 기존 식별자(REFAC-02-P2, USR-01, Epic-J 등)를 그대로 쓴다.
> 본 스킬은 임시 작업단위(`WU-7` 류)가 필요할 때만 사용. 일반 작업은 `/zm-wu-start <기존-ID>` 로 바로 claim.

## 실행

```bash
python -X utf8 .claude/hooks/wu_claim_manager.py next
```

## 동작

`docs/04-planning/02-roadmap.md` 의 `WU-NNN` 패턴 + 활성 claim 의 `WU-NNN` 을 합산해 `max + 1` 출력.

```
WU-3
```

## 관련

- 시작: `/zm-wu-start <WU-ID>`
- 규칙: [.claude/rules/wu-claim.md](../../rules/wu-claim.md)
