---
name: zm-roadmap
description: 로드맵 조회/갱신 전용 스킬
user-invocable: true
argument-hint: "[status | update <내용>]"
---

로드맵을 조회하거나 갱신합니다.

## 동작 모드

### 조회 모드 (기본 또는 "status")

$ARGUMENTS가 비어있거나 "status"인 경우:
1. `docs/04-planning/02-roadmap.md` 읽기
2. Phase별 진행률 요약 출력
3. 현재 진행 중인 작업 + 다음 후보 표시

#### 출력 형식

```
## 로드맵 현황

| Phase | 진행률 | 상태 |
|-------|--------|------|
| Phase 1 | 7/7 (100%) | ✅ 완료 |
| Phase 2 | 4/4 (100%) | ✅ 완료 |
| Phase 3 | 2/4 (50%) | 🔄 진행 중 |

### 현재 진행 작업
- [작업명]

### 다음 후보
1. [후보 1]
2. [후보 2]
3. [후보 3]
```

### 갱신 모드 ("update ...")

$ARGUMENTS가 "update"로 시작하는 경우:
1. `docs/04-planning/02-roadmap.md` 읽기
2. 요청된 변경 적용 (Phase 진행률, 작업 상태 등)
3. Change Log 엔트리 추가
4. `docs/10-session/quick-ref.md` 동기화
5. `docs/10-session/current-phase.md` 동기화

## 주의사항
- 갱신 시 기존 데이터 삭제 금지 (append/update만)
- Phase 변경은 사용자 확인 필수
- 항상 한글로 보고
