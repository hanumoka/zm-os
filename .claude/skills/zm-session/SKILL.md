---
name: zm-session
description: zm-os 세션 시작 시 컨텍스트 로드. 세션 시작, 현재 상태, 진행상황 확인 시 사용
user-invocable: true
disable-model-invocation: true
---

zm-os 세션 시작 프로토콜을 실행합니다.

## 순서

1. `zm-claude-docs/session/quick-ref.md` 읽기
2. `zm-claude-docs/session/current-phase.md` 읽기
3. `git status --short` + `git log --oneline -5` 확인
4. `git branch --show-current`로 현재 브랜치 확인
5. 종합 보고서 작성 (한글)

## 보고 형식

```markdown
## 세션 복원 완료

**현재 Phase**: [Phase 이름]
**진행률**: [X%]
**브랜치**: [현재 브랜치]

### 마지막 완료 작업
- [작업 내용]

### 블로커
- [있으면 기록]

### 다음 작업
1. [다음 할 일]
2. [그 다음 할 일]

### Quick Links
- [관련 문서 링크들]
```

## 주의사항

- 파일이 없으면 에러 없이 스킵
- 항상 한글로 보고
- session-start.py hook이 이미 일부 정보를 자동 로드하므로, 그것을 보완·요약하는 용도
