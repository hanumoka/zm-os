# ADR Index

> Architecture Decision Records — 순차 번호. 수동 인덱스 (자동 생성 금지).

| ID | 제목 | 상태 | 날짜 |
|----|------|------|------|
| [ADR-0001](adr-0001-initial-stack.md) | 초기 스택 (Next.js 단일 풀스택 + 단일 사용자 + iframe 샌드박싱) | accepted | 2026-05-24 |
| [ADR-0002](adr-0002-window-manager.md) | 윈도우 매니저 라이브러리 — react-rnd 채택 (POC v1) | accepted | 2026-05-24 |
| [ADR-0003](adr-0003-ipc-surface.md) | 호스트-앱 IPC 어댑터 표면 — wire-compatible RPC + 화이트리스트 권한 (v1) | accepted | 2026-05-24 |
| [ADR-0004](adr-0004-csp-permissions-policy.md) | 호스트 origin CSP / Permissions-Policy 정책 — POC 1차 정적 헤더 모델 | accepted | 2026-05-24 |
| [ADR-0005](adr-0005-window-state-management.md) | 윈도우 상태 관리 방식 — React Context + useReducer (POC v1) | accepted | 2026-05-24 |

## 다음 번호 가이드

- ADR-0006 후보:
  - IPC 권한 모델 v2 (manifest.permissions 매핑)
  - Comlink 라이브러리 도입 (srcdoc 빌드 파이프라인)
  - 윈도우 매니저 v2 reshape (Zustand 또는 키보드 접근성)
  - 앱 매니페스트 schema 확정 (v2)

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
