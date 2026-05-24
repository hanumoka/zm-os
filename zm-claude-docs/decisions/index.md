# ADR Index

> Architecture Decision Records — 순차 번호. 수동 인덱스 (자동 생성 금지).

| ID | 제목 | 상태 | 날짜 |
|----|------|------|------|
| [ADR-0001](adr-0001-initial-stack.md) | 초기 스택 (Next.js 단일 풀스택 + 단일 사용자 + iframe 샌드박싱) | accepted | 2026-05-24 |
| [ADR-0003](adr-0003-ipc-surface.md) | 호스트-앱 IPC 어댑터 표면 — wire-compatible RPC + 화이트리스트 권한 (v1) | accepted | 2026-05-24 |

## 다음 번호 가이드

- ADR-0002 후보:
  - 윈도우 매니저 라이브러리 선택 (react-rnd vs dnd-kit vs 자작)
  - 앱 매니페스트 schema 확정
  - 클라이언트 상태 관리 (Zustand vs Jotai vs React 19 useReducer)
- ADR-0004 후보:
  - IPC 권한 모델 v2 (manifest.permissions 매핑)
  - Comlink 라이브러리 도입 (srcdoc 빌드 파이프라인 포함)

## 작성 규칙

- 파일명: `adr-NNNN-kebab-case-title.md`
- frontmatter:
  ```yaml
  ---
  number: "NNNN"
  title: <간결한 결정 제목>
  status: proposed | accepted | deprecated | superseded
  date: YYYY-MM-DD
  author: <git user>
  related: [<other ADR ids>]
  ---
  ```
- 본문 권장 섹션: Context / Decision / Consequences / Alternatives
