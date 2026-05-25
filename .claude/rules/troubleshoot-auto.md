---
globs: ["docs/13-troubleshooting/**"]
---

# Troubleshooting Auto-Management (MANDATORY)

작업 중 이슈를 자동 감지하여 `docs/13-troubleshooting/`에 기록하고, 계획/리뷰 시 과거 TS를 자동 참조한다.

## A. 이슈 자동 감지 및 기록

### 자동 기록 대상 (사용자 확인 없이 즉시 기록)
- Bash 명령 2회 이상 연속 실패 (동일 원인)
- 빌드/타입체크 오류 (`npx tsc` 실패)
- iframe sandbox 관련 런타임 에러
- 의존성 버전 호환성 문제
- IndexedDB/OPFS 저장소 관련 오류

### 사용자 확인 후 기록
- 설계 대안 검토 중 발견한 제약사항
- 성능/번들 사이즈 관련 관찰
- 브라우저 호환성 이슈

### 기록 절차
1. `docs/13-troubleshooting/index.md` 읽기 → 마지막 TS-NNN +1 확인
2. index.md에 행 추가 + entries.md **선두에** 상세 추가
3. 반복 패턴(3회 이상)이면 M-NNN 등록 제안 (known-mistakes 연동)

### 기록 형식

index.md 행:
```
| TS-NNN | {문제 요약} | {모듈} | {원인 분류} | M-NNN 또는 — |
```

entries.md 선두:
```
### TS-NNN: {문제 요약} (YYYY-MM-DD)
- **증상**: {관찰된 현상}
- **원인**: {근본 원인}
- **해결**: {수정 내용}
- **관련 파일**: {파일 경로}
- **관련**: {ADR-NNNN 또는 —}
```

## B. 이슈 자동 참조

### 자동 참조 트리거
- 작업 계획(Plan) 수립 시 → 관련 모듈의 과거 TS 검색
- 코드 리뷰/분석 요청 시 → 해당 모듈 과거 이슈 확인
- 동일 에러 메시지 재발 시 → 기존 해결 방법 제시
- 보안 민감 경로 변경 시 → sandbox/CSP 관련 과거 TS 확인

### 참조 방법
1. Grep으로 `docs/13-troubleshooting/index.md`에서 모듈명/키워드 검색
2. 관련 TS-NNN 발견 시 entries.md에서 해당 엔트리 읽기
3. 과거 해결 방법을 현재 작업에 반영

## C. 월별 롤링

entries.md가 **500줄 초과** 시 3개월 이전 엔트리를 `archive/YYYY-MM.md`로 이동.
index.md 테이블 행은 유지 (검색용).
