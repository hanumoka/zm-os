---
name: zm-work-completion
description: 작업 완료 종합 파이프라인 (zm-unit-done + 정책갱신 + 이벤트 + 다음 작업 추천)
user-invocable: true
argument-hint: "[작업명]"
---

작업 단위 완료 시 종합 파이프라인을 실행합니다. `/zm-unit-done`을 포함하여 확장합니다.

## 실행 절차

### Step 1: `/zm-unit-done` 실행
- 빌드 검증 (tsc)
- 문서 갱신 (current-phase.md)
- 작업 로그 (docs/11-archive/YYYY-MM.md)
- 버그 수정 사후 분석 (조건부)

### Step 2: 정책 다이제스트 갱신 확인
- 이번 작업에서 정책 결정이 있었는지 확인
- `docs/03-policy/01-policy-registry.md` 변경 시 → `docs/03-policy/_digest.md` 동기화

### Step 3: 이벤트 기록
- `events/YYYY-MM.jsonl`에 작업 완료 이벤트 기록 (emit_event.py 훅이 자동 처리하지만, 수동 요약 이벤트 추가)

### Step 4: 다음 작업 추천
- `docs/10-session/quick-ref.md`의 "다음 후보" 섹션 갱신
- `docs/04-planning/02-roadmap.md`에서 다음 미완료 작업 식별
- 사용자에게 추천

### Step 5: MEMORY.md 갱신
- `.claude/memory/MEMORY.md` 프로젝트 수치 갱신
- "최근 결정사항" 작업 완료 기록 추가

## 출력 형식

```
## 작업 완료 종합 보고

### 빌드
- ✅/❌ tsc: N 에러

### 문서 갱신
- ✅ current-phase.md: Phase N (X/Y → X+1/Y)
- ✅ archive: docs/11-archive/YYYY-MM.md
- ✅ policy digest: 동기화 완료/불필요
- ✅ MEMORY.md: 수치 갱신

### 다음 작업 후보
1. [후보 1]
2. [후보 2]
```

## 주의사항
- `/zm-unit-done` 빌드 실패 시 전체 중단
- 커밋은 수행하지 않음
