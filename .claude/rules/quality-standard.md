---
globs: ["src/**/*.ts", "src/**/*.tsx", "docs/**/*.md"]
---

# Implementation Quality Standard (MANDATORY)

설계/코드/문서 수정 작업 시 아래 기준을 충족해야 한다.

## 코드 품질

### 유연성 (Flexibility)
- 하드코딩 금지 — 설정값은 config/env/인터페이스로 분리
- 확장 가능한 구조 — 새 케이스 추가 시 기존 코드 수정 최소화
- 단일 책임 원칙 — 함수/컴포넌트는 한 가지 역할만

### 안정성 (Stability)
- 에러 경계 명확화 — 외부 호출(fetch/IndexedDB/OPFS)은 예외 처리 필수
- 부작용 격리 — 상태 변경은 명시적이고 롤백 가능
- SSR 안전 — `window`/`document`/`localStorage` 접근은 `useEffect` 내부에서만

### 표준화 (Standardization)
- 기존 패턴 우선 — 새 패턴 도입 전 기존 유사 구현 확인
- 네이밍 컨벤션 — 기존 컨벤션 그대로 따름
- TypeScript strict — `any` 금지, 함수 반환 타입 명시

## 문서 품질

- 필수 요소: H1 제목 + Last Updated 날짜 + 목적 1줄 설명
- ADR 필수 메타: number, title, status, date (본문 상단)
- Living Document: 지속 갱신 문서에 `> Living Document` 표기
- 코드 블록: 언어 태그 필수 (`typescript`, `markdown` 등)
- 링크: 상대경로만 사용 (절대경로 금지)

## 타협 규칙

세 기준(유연성/안정성/표준화) 중 타협 필요 시 → 사용자에게 트레이드오프 명시 후 선택.
POC 단계에서는 **빠른 검증 > 보안/격리 > 코드 정교함** 우선순위 적용.
