---
name: zm-doc-status
description: docs/ 전체 상태 대시보드 (파일수/stale 문서/broken link 검사)
user-invocable: true
---

docs/ 디렉토리 전체 상태를 한눈에 보여줍니다.

## 확인 항목

### 1. 카테고리별 파일 수
- `docs/` 하위 각 디렉토리(01-architecture ~ 13-troubleshooting)의 .md 파일 수 집계

### 2. ADR 현황
- `docs/02-decisions/index.md` 파일 수
- 마지막 ADR 번호 + 날짜

### 3. 정책 현황
- `docs/03-policy/01-policy-registry.md` 정책 수 (Active/Deprecated)
- `docs/03-policy/_digest.md` 마지막 갱신일

### 4. 로드맵 진행률
- `docs/04-planning/02-roadmap.md`에서 Phase별 완료/미완료 작업 수

### 5. 트러블슈팅 현황
- `docs/13-troubleshooting/index.md` TS 엔트리 수
- 마지막 TS-NNN 번호

### 6. Known Mistakes 현황
- `.claude/rules/known-mistakes.md` M-NNN 수 (BLOCK/WARN 분류)

### 7. Broken Link 검사
- `docs/README.md`의 모든 링크가 실제 파일을 가리키는지 검증
- 깨진 링크 목록 출력

### 8. 이벤트 스트림 현황
- `events/` 디렉토리 파일 수 + 이번 달 이벤트 수

## 출력 형식

```
## docs/ 상태 대시보드

| 카테고리 | 파일 수 | 상태 |
|---------|---------|------|
| 01-architecture | N개 | OK |
| 02-decisions | N개 (최신 ADR-NNNN) | OK |
| 03-policy | N개 (Active: N) | OK |
| 04-planning | N개 | OK |
| 05-analysis | N개 | OK |
| 06-security | N개 | OK |
| 07-testing | N개 | OK/EMPTY |
| 10-session | 2개 | OK |
| 11-archive | N개 | OK |
| 13-troubleshooting | 2개 (TS-NNN) | OK |

### Broken Links
- [없음 / 목록]

### Known Mistakes
- M-NNN: N건 (BLOCK: N / WARN: N)

### Events
- events/YYYY-MM.jsonl: N건
```

## 주의사항
- 읽기 전용 (파일 수정 없음)
- 항상 한글로 보고
