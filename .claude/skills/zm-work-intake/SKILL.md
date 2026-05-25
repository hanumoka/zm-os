---
name: zm-work-intake
description: 작업 진입 시 Phase/정책 확인 → 선택지 제시 → architect 호출 권고
user-invocable: true
argument-hint: "[작업명 또는 기능 ID (예: GAME-01, STG-02)]"
---

새 작업 단위 진입 시 체크리스트를 실행합니다.

## 실행 절차

### Step 1: 현재 상태 확인
1. `docs/10-session/current-phase.md` 읽기 → 현재 Phase/작업 진행률 확인
2. `docs/04-planning/02-roadmap.md` 읽기 → 다음 작업 후보 목록 추출
3. `docs/10-session/quick-ref.md` 읽기 → 빠른 컨텍스트

### Step 2: 정책 충돌 사전 검사
1. `docs/03-policy/01-policy-registry.md` 읽기
2. 요청된 작업이 기존 정책(ARCH/TECH/PROD)과 충돌하는지 확인
3. 충돌 시 선택지 제시: (A) 예외 허용 → ADR, (B) 정책 수정, (C) 작업 축소

### Step 3: 영향 분석
1. `docs/01-architecture/` 관련 문서 확인
2. 영향 받는 파일/모듈 식별
3. ADR 필요 여부 판단

### Step 4: 작업 선택지 제시 (AskUserQuestion)
- 정책 질문 의무 적용 (work-units.md)
- 선택지 2~3개 + 추천 표시
- 사용자 결정 후 기록

### Step 5: architect 에이전트 호출 권고
- 인터페이스/모듈 경계가 있는 작업이면 architect 호출 추천
- 단순 UI 작업이면 바로 fe-developer 위임

## 출력 형식

```
## 작업 진입 준비 완료

**작업**: [작업명]
**Phase**: Phase N (X/Y, ZZ%)
**정책 충돌**: 없음 / [충돌 상세]
**영향 모듈**: [목록]
**ADR 필요**: 예/아니오
**추천 다음 단계**: architect 호출 / 바로 구현
```

## 주의사항
- 정책 판단 필요 시 반드시 사용자에게 질문 (임의 결정 금지)
- 사용자 결정 후 → `docs/03-policy/01-policy-registry.md` 갱신
