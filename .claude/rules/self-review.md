---
globs: ["src/**/*.ts", "src/**/*.tsx", "docs/**/*.md"]
---

# Post-Task Self-Review (MANDATORY)

작업 완료 후 사용자에게 결과 보고 **직전**, 아래 체크리스트를 자동 실행한다.
(순수 조회/질문 응답/문서 읽기만 한 경우 생략)

## 트리거 조건

- 코드/설정/문서를 Edit/Write로 **2회 이상** 수정한 작업
- 아키텍처/설계 결정을 내린 작업
- 보안 민감 경로 (`src/lib/apps/`, `src/components/desktop/`, `next.config.ts`) 변경

## 코드 변경 체크리스트

| # | 항목 | 검증 내용 |
|---|------|-----------|
| 1 | tsc | `npx tsc --noEmit` 에러 0 |
| 2 | any 검사 | 변경 파일에 `any` 타입 없음 |
| 3 | 보안 규칙 | security.md 위반 없음 (iframe sandbox, postMessage, CSP) |
| 4 | 반환 타입 | 새 함수에 반환 타입 명시 |
| 5 | use client | `'use client'` 필요성 재확인 (서버 컴포넌트 기본) |

## 문서 변경 체크리스트

| # | 항목 | 검증 내용 |
|---|------|-----------|
| 1 | 명명 규칙 | doc-naming.md 준수 (번호, kebab-case 등) |
| 2 | 링크 유효성 | 내부 링크가 실제 파일을 가리키는지 |
| 3 | SSOT 동기화 | policy-registry 변경 시 _digest.md 갱신 |

## 종합 체크리스트 (코드+문서 공통)

| # | 항목 | 검증 내용 |
|---|------|-----------|
| 1 | 오판 | 요구사항 잘못 해석 또는 범위 벗어남? |
| 2 | 실수 | known-mistakes (M-NNN) 패턴 해당? |
| 3 | 누락 | 요청 항목 중 빠뜨린 것? 관련 파일 동시 수정 누락? |
| 4 | 모순 | 같은 작업 내 충돌하는 설정/코드/문서? |
| 5 | 정책 충돌 | policy-registry 또는 ADR과 충돌? |

## 출력 규칙

- **전부 PASS** → 결과 보고 끝에 `✓ Self-review PASS` 한 줄 추가
- **이슈 발견** → `⚠ Self-review` 블록에 항목별 문제와 수정 제안 표시, 사용자 확인 후 진행
