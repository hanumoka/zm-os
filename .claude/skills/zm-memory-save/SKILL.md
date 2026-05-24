---
name: zm-memory-save
description: 세션 종료 시 메모리 + Work Completion 문서 갱신
user-invocable: true
argument-hint: "[작업 유형: bugfix|feature|docs|none]"
---

세션 종료 전 프로젝트 상태를 저장합니다.

## 실행 절차

### 1. 현재 세션 변경사항 수집
- `git diff --stat` 또는 `git status --short`로 변경 파일 목록 확인
- 변경 내용 요약 정리

### 2. 작업 유형 분류
$ARGUMENTS가 비어있으면 변경사항 분석으로 자동 분류:
- **bugfix**: 버그 수정 (fix 커밋, 에러 해결)
- **feature**: 새 기능 또는 기능 개선 (feat 커밋)
- **docs**: 문서만 변경
- **none**: 변경사항 없음

### 3. Work Completion 문서 갱신 (유형별)

#### bugfix
1. `.claude/memory/troubleshooting-patterns.md`에 TS-NNN 추가
2. `.claude/rules/known-mistakes.md`에 반복 패턴이면 M-NNN 추가 제안

#### feature
1. `zm-claude-docs/session/current-phase.md` 상태 갱신
2. `zm-claude-docs/project/prd.md` 해당 항목 업데이트

#### docs
- 해당 문서만 날짜 갱신

### 4. `.claude/memory/MEMORY.md` 갱신
- 프로젝트 수치 변경 시 갱신
- 정책 결정 추가 시 `.claude/memory/policy-registry.md`에 SSOT 기록

### 5. 갱신 요약 출력

```
## Memory Save 완료

### 갱신 파일
- [목록]

### 세션 요약
- 작업 유형: [bugfix/feature/docs/none]
- 변경 파일: N개
- 주요 변경: [1줄 요약]
```

## 주의사항
- 기존 결정사항 삭제 금지 (append only)
- 시크릿/토큰 절대 포함 금지
