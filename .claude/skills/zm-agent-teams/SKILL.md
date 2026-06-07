---
name: zm-agent-teams
description: Toggle Claude Code Agent Teams feature on/off. Edits .claude/settings.local.json to add/remove CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS env var. Use when starting large multi-part work or returning to single-session mode.
disable-model-invocation: false
allowed-tools: Read, Write, Edit, Bash
argument-hint: "[on|off|status]"
---

# /zm-agent-teams

Agent Teams 기능을 켜거나 끈다. (sonix_docs 이식)

**인수**: `on` / `off` / `status`(또는 없음)

> ⚠️ 변경은 **다음 세션부터** 적용. 현재 세션 무영향. 대상 파일: `.claude/settings.local.json` (LOCAL, gitignored).

## 절차

1. `.claude/settings.local.json` Read → `env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` 확인 (`"1"`=ON).
2. 인수 처리:

### status (또는 없음)
현재 상태만 출력 (ON ✅ / OFF ⛔ + 적용 시점 + 토큰 비용 안내).

### on
`env` 에 `"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"` 추가 (기존 키 보존).
```bash
python -c "
import json, os
p='.claude/settings.local.json'
cfg=json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {}
cfg.setdefault('env', {})['CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS']='1'
json.dump(cfg, open(p,'w',encoding='utf-8'), indent=2, ensure_ascii=False)
print('done')
"
```
출력: `## Agent Teams: ON ✅` + "다음 세션부터 유효" + 토큰 3~5배 안내 + Shift+Down(팀원 전환).

### off
`env` 에서 키 제거 (env 비면 env 키 자체 제거).
```bash
python -c "
import json
p='.claude/settings.local.json'
cfg=json.load(open(p, encoding='utf-8'))
cfg.get('env', {}).pop('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS', None)
if 'env' in cfg and not cfg['env']: del cfg['env']
json.dump(cfg, open(p,'w',encoding='utf-8'), indent=2, ensure_ascii=False)
print('done')
"
```
출력: `## Agent Teams: OFF ⛔` + 단일 세션 + subagent 모드 복귀.

## JSON 편집 원칙
- 전체 Read → 파싱 → 수정 → Write. 기존 키(model, permissions 등) 보존. 들여쓰기 2 spaces.
- ⚠️ M-001 류: `python3` 금지 → `python` 사용.

## 주의
- Agent Teams sub-session 은 `/zm-wu-start` claim 거부됨 — parent 세션에서 미리 claim 후 spawn.
