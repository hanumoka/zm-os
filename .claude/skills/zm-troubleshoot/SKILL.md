---
name: zm-troubleshoot
description: 트러블슈팅 기록 조회/등록 (TS-NNN) + 반복 실수 연동 (M-NNN)
user-invocable: true
argument-hint: "[조회: TS-NNN 또는 키워드 | 등록: 증상 설명]"
---

트러블슈팅 패턴을 조회하거나 새로 등록합니다.

## 동작 모드

### 조회 모드 (TS-NNN 또는 키워드)

$ARGUMENTS가 "TS-" 로 시작하거나 키워드인 경우:
1. `docs/13-troubleshooting/entries.md`에서 검색
2. 관련 패턴 목록 출력
3. 유사 패턴 제안

### 등록 모드 (증상 설명)

$ARGUMENTS가 증상 설명인 경우:
1. 기존 TS-NNN 번호 확인 → 다음 번호 부여
2. 사용자에게 정보 수집:
   - 증상 (어떤 에러/동작?)
   - 원인 (왜 발생?)
   - 해결 (어떻게 고쳤?)
   - 관련 파일
3. `docs/13-troubleshooting/entries.md`에 추가 + `docs/13-troubleshooting/index.md` 인덱스 행 추가:

```markdown
### [TS-NNN] 제목

**증상**: ...
**원인**: ...
**해결**: ...
**관련 파일**: ...
**날짜**: YYYY-MM-DD
```

4. 반복 패턴 분석:
   - 유사한 기존 TS 항목이 있는가?
   - 반복 패턴이면 `.claude/rules/known-mistakes.md`에 M-NNN 추가 제안
   - [BLOCK] 수준이면 `mistake_guard.py`가 자동 차단할 수 있는 패턴(백틱 인용)으로 등록 제안

### 출력 형식

```
## 트러블슈팅 등록 완료

- ID: TS-NNN
- 제목: [제목]
- M-NNN 연동: [있음/없음]

### 관련 기존 패턴
- TS-XXX: [유사 패턴]
```

## 버그 수정 프로토콜

### 수정 전 필수 확인
1. **실제 렌더링 경로 추적**: URL → route file → 실제 컴포넌트 확인 (Grep으로 텍스트 검색, DevTools 콘솔)
2. **기존 패턴 확인**: `docs/13-troubleshooting/entries.md` 참조
3. **진단 우선**: 수정 전 디버깅 로그 추가 → 데이터 확인 → 수정

### 수정 후 필수
1. **사후 분석 기록**: troubleshooting-patterns.md에 패턴 추가
2. **MEMORY.md 갱신**: 핵심 교훈 1줄 추가 (해당 시)

## 주의사항
- 증상/원인/해결 모두 구체적으로 기록 (모호한 기록 금지)
- 관련 파일 경로는 프로젝트 루트 기준 상대 경로
- 시크릿/토큰은 마스킹 처리
