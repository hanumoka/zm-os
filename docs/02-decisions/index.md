# ADR Index

> Architecture Decision Records — 순차 번호. 수동 인덱스 (자동 생성 금지).

| ID | 제목 | 상태 | 날짜 |
|----|------|------|------|
| [ADR-0001](adr-0001-initial-stack.md) | 초기 스택 (Next.js 단일 풀스택 + 단일 사용자 + iframe 샌드박싱) | accepted | 2026-05-24 |
| [ADR-0002](adr-0002-window-manager.md) | 윈도우 매니저 라이브러리 — react-rnd 채택 (POC v1) | accepted | 2026-05-24 |
| [ADR-0003](adr-0003-ipc-surface.md) | 호스트-앱 IPC 어댑터 표면 — wire-compatible RPC + 화이트리스트 권한 (v1) | accepted | 2026-05-24 |
| [ADR-0004](adr-0004-csp-permissions-policy.md) | 호스트 origin CSP / Permissions-Policy 정책 — POC 1차 정적 헤더 모델 | accepted | 2026-05-24 |
| [ADR-0005](adr-0005-window-state-management.md) | 윈도우 상태 관리 방식 — React Context + useReducer (POC v1) | accepted | 2026-05-24 |
| [ADR-0006](adr-0006-desktop-app-catalog.md) | 데스크탑 앱 카탈로그 모델 — POC v1 하드코딩 + v2 STR 전환 | accepted | 2026-05-24 |
| [ADR-0007](adr-0007-client-storage-indexeddb.md) | 클라이언트 스토리지 추상화 — IndexedDB (idb library) + 메모리 폴백 | accepted | 2026-05-24 |
| [ADR-0008](adr-0008-user-zip-upload.md) | POC v1 사용자 ZIP 앱 업로드 모델 (JSZip + 단일 HTML + 보안 검증) | accepted | 2026-05-24 |
| [ADR-0009](adr-0009-storage-abstraction.md) | 스토리지 추상화 계층 — StorageAdapter Strategy 패턴 + OPFS 어댑터 | accepted | 2026-05-25 |
| [ADR-0011](adr-0011-user-app-lifecycle.md) | 사용자 앱 삭제 및 업데이트 UX (APP-04) | accepted | 2026-05-25 |
| [ADR-0012](adr-0012-dark-mode-strategy.md) | 다크 모드 CSS 전략 — Tailwind v4 class 기반 dark variant | accepted | 2026-05-25 |

## 다음 번호 가이드

- ADR-0013 후보:
  - IPC 권한 모델 v2 (manifest.permissions 매핑)
  - Comlink 라이브러리 도입 (v2 향상)
  - 윈도우 매니저 v2 reshape

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
