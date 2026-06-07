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
| [ADR-0013](adr-0013-v2-auth-supabase.md) | v2 사용자 인증 — Supabase Auth 채택 | superseded by ADR-0017 | 2026-05-26 |
| [ADR-0014](adr-0014-v2-db-supabase.md) | v2 Postgres 호스팅 + RLS — Supabase 채택 | superseded by ADR-0017 | 2026-05-26 |
| [ADR-0015](adr-0015-v2-sync-lww.md) | v2 데스크탑 상태 동기화 — LWW + 서버 권위 시계 | superseded by ADR-0017 | 2026-05-26 |
| [ADR-0016](adr-0016-v2-monorepo.md) | v2 모노레포 도구 — pnpm workspaces + Turborepo | accepted | 2026-05-26 |
| [ADR-0017](adr-0017-ports-and-adapters.md) | Ports & Adapters 아키텍처 + 5개 Port 정의 (로컬-우선 + 클라우드 옵션) | accepted | 2026-05-27 |
| [ADR-0018](adr-0018-local-auth.md) | LocalAuth — POC v1 anonymous user 모델 (AuthProvider Local 어댑터) | accepted | 2026-05-27 |
| [ADR-0019](adr-0019-localrepo-idb.md) | LocalRepo IDB — AppRepository Local 어댑터 (IndexedDB) | accepted | 2026-05-27 |
| [ADR-0020](adr-0020-localopfs-blobstorage.md) | LocalOPFS BlobStorage — BlobStorage Local 어댑터 (IDB/OPFS/Memory + AbortSignal) | accepted | 2026-05-27 |
| [ADR-0021](adr-0021-local-noop-sync.md) | LocalNoOpSync — 동기화 비활성 어댑터 (SyncProvider Local) | accepted | 2026-05-27 |
| [ADR-0022](adr-0022-local-static-moderation.md) | LocalStaticModeration — HTML 정적 분석 어댑터 (ModerationProvider Local) | accepted | 2026-05-27 |
| [ADR-0023](adr-0023-adapter-resolver-composition-root.md) | Adapter Resolver + Composition Root — createPorts() + PortsContext + 동적 import | accepted | 2026-05-27 |
| [ADR-0030](adr-0030-isolation-first.md) | 멀티 세션 협업 — Isolation-First (worktree 격리) | accepted | 2026-06-07 |
| [ADR-0031](adr-0031-ssot-and-derived.md) | 멀티 세션 협업 — SSOT + Append-Only Events | accepted | 2026-06-07 |
| [ADR-0032](adr-0032-domain-separation.md) | 멀티 세션 협업 — 영역 분리 + 명시적 Lifecycle + Fail-Safe | accepted | 2026-06-07 |

> **0024~0029 결번(예약)**: CloudAdapter 옵션 트랙 — 아래 "보류" 참조. 협업 헌법 ADR 은 예약 회피를 위해 0030~0032 사용.

## 다음 번호 가이드

> **2026-05-26 방향 전환**: 로컬-우선 + 외부 의존성 옵션 아키텍처. 클라우드 단독 가정 ADR은 reshape.
> **2026-05-27**: ADR-0017~0023 7건 채택 완료 (Ports & Adapters + Local 어댑터 6건) + ADR-0013/0014/0015 superseded 처리 완료.

### 다음 단계 — v2 plan v0.3.0 재작성 + 구현 진입
- **v2 plan v0.3.0**: 9 Epic 유지 + 작업마다 LocalAdapter 필수 / CloudAdapter 옵션 표기
- **REFAC-02** (5 작업 분할): packages/adapters-local 신규 + 5 Provider Port 호출 reshape
- **M5 진입**: SRV-01~02 + USR-01~04 로컬 인증 기본

### 보류 — ADR-0024+ (CloudAdapter 옵션 트랙, v2 CLD Epic 진입 시점)
- ADR-0024+: CloudAuth-Supabase (ADR-0013 정보 흡수)
- ADR-0025+: CloudRepo-Supabase (ADR-0014 정보 흡수)
- ADR-0026+: CloudSync-LWW (ADR-0015 정보 흡수)
- ADR-0027+: Migration utility (Local↔Cloud 데이터 전환)
- ADR-0028+: CloudBlob (R2 / Supabase Storage)
- ADR-0029+: CloudModeration (VirusTotal 등)
- ADR-Permission (manifest capabilities + grant 영속화)
- ADR-Hosting (Vercel / CF Pages)
- ADR-API-Auth (Server Action / JWT cookie)
- IPC-02 (Comlink 직접 통합)
  - ADR-Permission (manifest capabilities + grant 영속화)
  - ADR-API-Auth (Server Action vs Route Handler, JWT cookie 위치)
  - ADR-Hosting (Vercel / CF Pages / 정적 export)
  - ADR-Storage-Cloud (R2 / Supabase Storage / S3 어댑터)
  - ADR-Migration (로컬 v1 → v2)
  - ADR-Moderation-Cloud (VirusTotal 등 옵션 어댑터)

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
