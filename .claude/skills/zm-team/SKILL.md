---
name: zm-team
description: "View registered team members (team-config.json) and current WU claims (who is working on what). Read-only. New member registration → /zm-onboarding. Auto-loads for '팀', 'team', '팀원', '담당자', '누가 작업', 'who is working' queries."
disable-model-invocation: false
allowed-tools: Bash, Read
argument-hint: ""
---

# /zm-team

등록된 팀원과 현재 WU 점유 현황을 **조회**한다. (신규 등록은 `/zm-onboarding`)

## 실행

```bash
# 1) 등록 팀원
python -c "import json; d=json.load(open('.claude/team-config.json', encoding='utf-8')); [print(f\"{k}: {v['name']} ({v['id']}) suffix={v['ctx_suffix']}\") for k,v in d['members'].items()]"

# 2) 현재 WU 점유 현황
python -X utf8 .claude/hooks/wu_claim_manager.py status

# 3) derived 뷰 갱신 (docs/04-planning/_derived-wu-state.md)
python -X utf8 scripts/derive-wu-state.py
```

갱신 후 `docs/04-planning/_derived-wu-state.md` 를 읽어 표로 보여줄 수 있다 (roadmap 에서도 링크됨).

## 출력 예시

```
KYB: 김영빈 (M01) suffix=kyb

REFAC-02-P2: 김영빈 (M01) a1b2c3d4
USR-01: 김영빈 (M01) e5f6g7h8 [STALE]
```

## 동작

- `.claude/team-config.json` `members` 조회 (현재 KYB 1인, 확장가능)
- `wu_claim_manager.py status` 로 활성/stale claim 표시

## 관련

- 신규 팀원 등록: `/zm-onboarding`
- 작업 점유: `/zm-wu-start`, 해제: `/zm-wu-stop`
- 멤버 SSOT: `.claude/team-config.json`
