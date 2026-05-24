---
name: zm-commit
description: zm-os 커밋 규칙에 맞는 커밋 생성
disable-model-invocation: true
user-invocable: true
argument-hint: "[커밋 메시지 힌트 | push]"
---

zm-os 커밋 규칙에 따라 커밋을 생성합니다.

## 커밋 메시지 형식

```
<type>(<scope>): <subject>

<body> (선택)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Type**: feat, fix, refactor, docs, test, chore
**Scope**: desktop, store, apps, sandbox, ipc, storage, docs, infra, setup

## 절차

1. `git status --short`로 변경사항 확인
2. `git diff --stat`로 변경 규모 파악
3. `git log --oneline -5`로 최근 커밋 스타일 확인
4. 변경사항 분석 후 적절한 type/scope 선택
5. 관련 파일만 `git add` (민감 파일 제외)
6. HEREDOC으로 커밋 메시지 전달
7. `Co-Authored-By` 라인 포함
8. 사용자가 $ARGUMENTS에 "push"를 포함하면 push도 수행

## 주의사항

- `.env`, credentials, 시크릿 파일은 절대 커밋하지 않음
- `git add -A` 대신 개별 파일 지정
- `--amend` 사용 금지 (새 커밋 생성)
- main 브랜치 force push 금지 (mistake_guard.py가 자동 차단)
