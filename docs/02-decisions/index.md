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
| [ADR-0009](adr-0009-storage-abstraction.md) | 스토리지 추상화 계층 — StorageAdapter Strategy 패턴 + OPFS 어댑터 | superseded (→0020) | 2026-05-25 |
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
| [ADR-0033](adr-0033-os-extension-architecture.md) | OS 확장 아키텍처 — capability-우선 + microkernel-lite + 점진 | accepted | 2026-06-07 |
| [ADR-0034](adr-0034-capability-and-ipc-contract.md) | App Capability 모델 + IPC 권한 계약 (load-bearing) | accepted | 2026-06-07 |
| [ADR-0040](adr-0040-app-record-schema.md) | AppRecord 콘텐츠 표현과 레거시 레코드 승격 | accepted | 2026-08-04 |

> **0024~0029 결번(예약)**: CloudAdapter 옵션 트랙 — 아래 "보류" 참조. 협업 헌법 ADR 은 예약 회피를 위해 0030~0032 사용.
> **0035~0039 예약**: OS 확장 후속 (ADR-0033 §D6) — 0035 Service Registry / 0036 IPC 프로토콜·EVENT / 0037 VFS / 0038 Lifecycle·Boot / 0039 Event Bus. F1~F3에서 작성.

## 다음 번호 가이드

> **2026-05-26 방향 전환**: 로컬-우선 + 외부 의존성 옵션 아키텍처. 클라우드 단독 가정 ADR은 reshape.
> **2026-05-27**: ADR-0017~0023 7건 채택 완료 (Ports & Adapters + Local 어댑터 6건) + ADR-0013/0014/0015 superseded 처리 완료.

> ## ⚠ 2026-08-15 — 아래 보류 목록을 닫는다
>
> 이 절은 2026-05-27 시점의 계획이었고 **전제가 소멸했다.** `zm-docs`의 `DEC-0006`이 이전 전략을 폐기하고
> 브라우저가 강제하는 기술 제약 16건만 승계했으며, `DEC-0007`·`DEC-0008`이 새 방향을 확정했다.
>
> **다음에 무엇을 할 차례인지는 `zm-docs`의 `docs/projects/zm-os/index.md`가 정본이다.**
> 이 목록을 보고 죽은 트랙을 재개하지 마라 — 그것을 막는 것이 이 표기의 목적이다.

### 다음 단계 — **닫힘**

이전 내용(v2 plan v0.3.0 재작성 / REFAC-02 5작업 분할 / M5 진입)은 효력이 없다.
REFAC-02의 Ports & Adapters 골격만 자산으로 살아남았고, 그 위에 파티션 키·소유자 필드·딥링크가 추가된다.

**현재 1순위는 호스트 셸의 hydration 복구다.** 프로덕션 빌드에서 셸이 뜨지 않는다(2026-08-15 실측).

### 보류 목록 — **전부 닫힘**

| 보류 항목 | 처분 |
|---|---|
| ADR-0024+ CloudAuth-Supabase | **소멸.** Supabase 트랙 폐기. 백엔드는 Spring Boot + Kotlin, 인증 스택은 미정 |
| ADR-0025+ CloudRepo-Supabase | **소멸.** 동일 |
| ADR-0026+ CloudSync-LWW | **소멸.** 다기기 실시간 동기화는 결정 게이트 뒤 |
| ADR-0027+ Migration utility (Local↔Cloud) | **소멸.** 기존 로컬 POC 데이터를 보존하지 않기로 했다 |
| ADR-0028+ CloudBlob (R2 / Supabase Storage) | **소멸.** 동일 트랙 |
| ADR-0029+ CloudModeration (VirusTotal 등) | **대상 상실.** 앱이 전부 소유자 것이라 모더레이션 대상이 없다 |
| ADR-Permission (capabilities + grant 영속화) | **살아 있다.** 단 승인 UI 없이 **실강제와 영속화만** 먼저. grant UI는 분리 |
| ADR-Hosting (Vercel / CF Pages / 정적 export) | **재정의.** 배포는 하기로 했으나(`DEC-0007`) 도메인·운영비 상한이 미정. **`output: 'export'`는 금지** — 보안 헤더가 무력화된다 |
| ADR-API-Auth (Server Action / JWT cookie) | **재정의.** Next route handler가 아니라 `server/`의 Spring Boot가 맡는다 |
| IPC-02 (Comlink 직접 통합) | **소멸.** Comlink를 쓰지 않는다(의존성 0). 대신 **MessagePort 단일 채널 전환**이 승계 제약 6이다 |
| ADR-Storage-Cloud (R2 / S3 어댑터) | **소멸.** 동일 트랙 |
| ADR-Migration (로컬 v1 → v2) | **소멸.** 동일 |
| ADR-Moderation-Cloud | **대상 상실.** 동일 |

**결번 0024~0029는 회수하지 않는다.** 재사용하면 위 기록과 번호가 충돌한다.

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
