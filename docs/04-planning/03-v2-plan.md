# v2 Plan — 로컬-우선 + 옵션 클라우드 어댑터

> **Living Document**. ADR-0017~0023 채택 (2026-05-27) 반영.
> 각 작업은 LocalAdapter 필수 / CloudAdapter 옵션 구조를 따른다.

**Version**: 0.3.0
**Last Updated**: 2026-06-07
**Status**: ✅ 설계 단계 완료 — REFAC-02 구현 진입 대기

> **2026-05-26 사용자 결정 (확정)**:
> "로컬 100% 설치 + 외부 의존성 0 + 클라우드는 추상화 레이어 뒤의 옵션"
>
> 2026-05-27 ADR-0017~0023 일괄 채택으로 5 Port + 6 Local 어댑터 명세 확정. v0.2.0의 클라우드 전제 작업은 모두 LocalAdapter 필수 / CloudAdapter 옵션 표기로 reshape.

---

## §1. Context

POC 1차(Phase 0~3)가 2026-05-25 M4 마일스톤으로 종료. Post-POC(REFAC-01 + APP-04 확장)도 완료. SRV-00 모노레포 마이그레이션(2026-05-26) + ADR-0017~0023 일괄 채택(2026-05-27)으로 v2 진입 설계 단계가 완료되었다.

v2의 핵심 아키텍처는 **Ports & Adapters (ADR-0017)**:
- 5 Port 인터페이스 SSOT: `packages/core/src/ports/`
- Local 어댑터: `packages/adapters-local/` (정적 번들, 기본)
- Cloud 어댑터: `packages/adapters-cloud-*` (동적 import, 옵션)

본 plan은 9 Epic + REFAC-02(코드 마이그레이션) + 53 작업 + M5~M10 마일스톤 구조를 유지하되, 각 작업에 LocalAdapter 필수 / CloudAdapter 옵션 표기를 추가한다.

---

## §2. v2 목표 (In Scope)

| 영역 | 로컬-우선 (LocalAdapter, 기본) | 옵션 (CloudAdapter) |
|------|---------------------------|---------------------|
| **인증** | LocalAuth (anon UserId, ADR-0018) | CloudAuth (Supabase Auth 등, ADR-0024+) |
| **앱 카탈로그** | LocalRepo (IDB, ADR-0019) | CloudRepo (Supabase Postgres + RLS, ADR-0025+) |
| **객체 스토리지** | LocalOPFS (IDB/OPFS/Memory, ADR-0020) | CloudBlob (R2/Supabase Storage, ADR-0028+) |
| **동기화** | LocalNoOpSync (단일 사용자, ADR-0021) | CloudSync (LWW + 서버 권위 시계, ADR-0026+) |
| **모더레이션** | LocalStaticModeration (정규식 7 패턴, ADR-0022) | CloudModeration (VirusTotal 등, ADR-0029+) |
| **데이터 마이그레이션** | LocalAuth anon UserId → CloudAuth 매핑 | Local↔Cloud 데이터 전환 (ADR-0027+) |
| **보안 강화** | iframe sandbox + CSP + LocalStaticModeration | 서버측 ZIP 재검증 + CSP nonce + 권한 grant UI |
| **백엔드 보안** | (해당 없음 — 로컬 모드) | CSRF/SSRF/rate limit/audit log/RLS |
| **관찰 가능성** | REFAC-01 C-1 Error Boundary + H-5 | 에러 추적 + 사용자 행동 분석 |
| **IPC 정식화** | 자체 RPC (POC 그대로) | Comlink 라이브러리 직접 통합 (IPC-02) |
| **인프라** | 로컬 dev 서버 | 호스팅/CI/모니터링/백업/시크릿 관리 |

---

## §3. v2 비목표 (Out of Scope)

v3 이연:
- 가상 OS 부팅 (v86/WebVM) — PRD §1.2 비전 1번
- 앱 간 IPC (cross-app communication)
- 권한 모델 세분화 (camera/mic/geolocation grant flow)
- 가상 파일 시스템 (앱이 host FS 접근)
- COEP/COOP/SharedArrayBuffer (Godot 등 SAB 게임 엔진)
- OPFS SyncAccessHandle Worker 분리 (ADR-0020-1 별도 분기)

v2 영구 비목표:
- 가상화폐 채굴 앱 호스팅 (PRD §6 영구 정책)
- 성인 콘텐츠 (PRD §6 영구 정책)
- 결제/구독 시스템 — Marketplace 도입 후 별도 phase
- 모바일 네이티브 (Electron/Tauri)
- 다국어 (i18n)
- 키보드 접근성 dnd-kit 이주 (TECH-04 재고 시점 도래 시 별도 검토)

---

## §4. Epic 분해 (10 Epic, REFAC-02 신규)

Feature ID 규칙:
- **REFAC-02** — Ports & Adapters 코드 마이그레이션 [신규 Epic J, M5 진입 전]
- **USR** — 사용자 인증/프로필
- **CLD** — 클라우드 스토리지/동기화
- **STR-v2** — 스토어 백엔드 (기존 STR 확장)
- **MOD** — 모더레이션
- **SBX-v2** — 샌드박스 강화 (기존 SBX 확장)
- **SRV** — 서버/인프라
- **MIG** — 데이터 마이그레이션
- **OBS** — 관찰 가능성
- **API-SEC** — 백엔드 보안

### Epic J: REFAC-02 — Ports & Adapters 마이그레이션 [신규, M5 진입 전 선행]

ADR-0017~0023 채택 결과를 코드에 반영. 5 작업 분할 (각 0.5~1주, 총 ~3주).

**의존성 구조**: P1(선행) → P2~P4(병렬 가능하지만 P2가 P3/P4 사전 선행 권장) → P5(모두 완료 후).
상세: P1은 Ports 인터페이스 SSOT + 어댑터 골조 reshape (소규모). P2~P4는 각 Port별 어댑터 이전 (표준 규모 병렬 가능). P5는 Composition Root + 통합 테스트로 P1~P4 마무리. 예상시간은 개략값 — 정밀 산정 추적 필요.

| ID | 작업 | 의존성 | 예상 |
|----|------|--------|------|
| **REFAC-02-P1** | `packages/adapters-local` 신규 패키지 생성 + namespace-registry `adapterPolicies` 배열 reshape + `system` namespace 5번째 엔트리 추가 | ADR-0017/0018/0023 | 3일 |
| **REFAC-02-P2** | BlobStorage Port + LocalOPFS 어댑터 이전 (`packages/storage` 흡수) + AbortSignal 매 entry 폴링 + `BlobStorageError extends PortError` + `@zm/storage` deprecation shell | ADR-0020 + P1 | 5일 |
| **REFAC-02-P3** | AppRepository Port + LocalRepo (IDB) 어댑터 + 4 도메인 wrapper 흡수 (installed-apps/user-apps 제거, desktop-layout/settings reshape) + cascade remove + contentRef inline v2.0 | ADR-0019 + P2 | 5일 |
| **REFAC-02-P4** | AuthProvider + SyncProvider + ModerationProvider Local 어댑터 (LocalAuth + LocalNoOpSync + LocalStaticModeration) + `patterns.ts` 7 정규식 + zip-loader 통합 (install action에서 scan 호출) | ADR-0018/0021/0022 + P2 | 5일 |
| **REFAC-02-P5** | Adapter Resolver + Composition Root (`createLocalPorts` + `PortsContext` + 동적 import Suspense) + 5 Provider 내부 `usePorts()` reshape + Vitest TestPortsProvider + e2e 회귀 검증 | ADR-0023 + P1~P4 | 5일 |

**진입 게이트**: REFAC-02 5 작업 모두 완료 + Vitest 75+ PASS + e2e 6 시나리오 PASS + Suspense fallback UI 검증. 완료 후 M5 진입.

### Epic A: 인증 + 사용자 (USR)

LocalAdapter: ADR-0018 LocalAuth (모든 작업 기본). CloudAdapter (옵션): ADR-0024+ CloudAuth-Supabase.

| ID | 작업 | LocalAdapter | CloudAdapter (옵션) | 의존성 | 예상 |
|----|------|-------------|---------------------|--------|------|
| USR-01 | 로컬 anon UserId 자동 발급 + 영속화 + multi-tab sync | ADR-0018 | ADR-0024+ (OAuth + middleware + JWT 클레임) | REFAC-02 | 1주 |
| USR-02 | 사용자 프로필 (displayName/아바타) + 데스크탑 표시 | LocalAuth displayName | CloudAuth profile | USR-01 | 3일 |
| USR-03 | 로그인/로그아웃 UI + 보호 라우트 | "초기화" 시나리오 | OAuth 로그인 페이지 | USR-01 | 2일 |
| USR-04 | 세션 만료 + 토큰 refresh | (Local: 무기한) | refresh flow | USR-01 | 2일 |
| USR-05 | 계정 삭제 (GDPR) + 데이터 export | system namespace clear | + 서버 데이터 cascade | USR-01, CLD-02 | 3일 |
| USR-06 | 디바이스 세션 관리 (다중 로그인 + 강제 로그아웃) | BroadcastChannel 멀티탭 | 서버 세션 revoke | USR-01 | 3일 |

### Epic B: 클라우드 스토리지 (CLD) — CloudAdapter 옵션 트랙

LocalAdapter: ADR-0020 (BlobStorage IDB/OPFS), ADR-0021 (LocalNoOpSync). CloudAdapter (옵션): ADR-0028+ (CloudBlob R2/Supabase Storage), ADR-0026+ (CloudSync LWW).

| ID | 작업 | LocalAdapter | CloudAdapter (옵션) | 의존성 | 예상 |
|----|------|-------------|---------------------|--------|------|
| CLD-01 | 객체 스토리지 결정 + 어댑터 인터페이스 | ADR-0020 LocalOPFS | ADR-0028+ CloudBlob (R2 vs Supabase Storage) | REFAC-02 | 1주 |
| CLD-02 | BlobStorage Cloud 어댑터 구현 + 동적 import wiring | (기본 동작) | CloudBlob 어댑터 + ADR-0023 Resolver Cloud 분기 | CLD-01, USR-01 | 1주 |
| CLD-03 | 동기화 전략 (LWW + 서버 권위 시계) | LocalNoOpSync (ADR-0021) | ADR-0026+ CloudSync-LWW (SyncEnvelope) | REFAC-02 | 1주 |
| CLD-04 | 데스크탑 상태 동기화 구현 (윈도우 레이아웃 + 설정) | (no-op) | CloudSync.push/pull | CLD-02, CLD-03 | 2주 |
| CLD-05 | 사용자 업로드 ZIP 클라우드 보관 (presigned URL) | (Local: IDB inline) | CloudBlob.put + presigned URL | CLD-02 | 3일 |
| CLD-06 | 오프라인 큐 + 재연결 sync (멱등성 키 + retry) | (no-op) | sync-queue namespace + idempotencyKey | CLD-04 | 2주 |
| CLD-07 | 충돌 해결 UX (LWW — 사용자 표시 + 수동 머지) | (no-op) | ConfirmDialog 재사용 | CLD-03 | 3일 |
| CLD-08 | 동기화 상태 표시 UI (저장 중/오프라인/충돌) | status='disabled'로 미표시 | status 분기 UI | CLD-04 | 3일 |
| CLD-09 | 사용자별 quota + 초과 UX | (Local: 무제한) | RLS + 사용량 카운터 | CLD-02 | 2일 |

### Epic C: 스토어 백엔드 (STR-v2)

LocalAdapter: ADR-0019 LocalRepo (IDB). CloudAdapter (옵션): ADR-0025+ CloudRepo-Supabase.

| ID | 작업 | LocalAdapter | CloudAdapter (옵션) | 의존성 | 예상 |
|----|------|-------------|---------------------|--------|------|
| STR-v2-01 | DB schema + RLS — apps/users/installs | (없음 — IDB namespace) | Postgres + RLS auth.uid()=owner_id | USR-01 | 3일 |
| STR-v2-02 | API 라우트 (apps CRUD + install/uninstall) | LocalRepo 직접 호출 | API route handlers + Drizzle | STR-v2-01 | 1주 |
| STR-v2-03 | 사용자 앱 업로드 → 서버 보관 + 검증 (PROD-05-v2) | LocalRepo upsert + LocalStaticModeration | CloudRepo + 서버 측 ZIP 재스캔 | STR-v2-02, SBX-v2-06 | 2주 |
| STR-v2-04 | 공유 카탈로그 (다른 사용자 앱 검색/설치) | (단일 사용자만) | CloudRepo public list | STR-v2-02 | 5일 |
| STR-v2-05 | 평점/다운로드 수 + 정렬 | (없음) | rating table + 정렬 인덱스 | STR-v2-04 | 3일 |
| STR-v2-06 | 검색 + 필터 (카테고리/태그/엔진/평점) | (Local: 클라이언트 필터) | tsvector + GIN index | STR-v2-04 | 5일 |
| STR-v2-07 | 사용자 프로필 페이지 (내 앱, 다운로드 수) | (Local: 자신만 표시) | profile + 통계 | USR-02, STR-v2-04 | 3일 |
| STR-v2-08 | 앱 버전 관리 (semver + 호환성 + 자동 업데이트) | LocalRepo upsert (semver 비교 보존) | + 서버 정책 push | STR-v2-02 | 5일 |

### Epic D: 모더레이션 (MOD)

LocalAdapter: ADR-0022 LocalStaticModeration (정규식 7 패턴). CloudAdapter (옵션): ADR-0029+ CloudModeration (VirusTotal 등).

| ID | 작업 | LocalAdapter | CloudAdapter (옵션) | 의존성 | 예상 |
|----|------|-------------|---------------------|--------|------|
| MOD-01 | 정적 분석 (HTML 패턴 + 의존성 화이트리스트) | ADR-0022 patterns.ts | + AV API + 서버 측 정적 분석 강화 | REFAC-02 | 1주 (Local) + 1주 (Cloud) |
| MOD-02 | 수동 모더레이션 UI (관리자 승인 대기 큐) | (없음) | admin route + queue | STR-v2-01 | 1주 |
| MOD-03 | 신고 기능 + 자동 격리 | (없음) | report endpoint + status='blocked' | STR-v2-04 | 3일 |
| MOD-04 | DMCA / 콘텐츠 정책 페이지 | static page | (동일) | — | 1일 |
| MOD-05 | 자동 콘텐츠 분류 (성인/마이너/카테고리) — DSA 요구 | (없음) | 분류 모델 | MOD-01 | 1주 |
| MOD-06 | 신뢰 개발자 시스템 (자동 승인) | (없음) | trust score | MOD-02 | 3일 |

### Epic E: 보안 강화 (SBX-v2)

| ID | 작업 | LocalAdapter | CloudAdapter (옵션) | 의존성 | 예상 |
|----|------|-------------|---------------------|--------|------|
| SBX-v2-00 | APP-01 v2 — 매니페스트 schema 진화 (capabilities + host-app 권한 모델) | manifest v2 (REFAC-01 H-1 완료) | + 권한 grant 영속화 | ADR-Permission (보류) | 1주 |
| SBX-v2-01 | IPC-02 — Comlink 라이브러리 직접 통합 + esbuild + 인터페이스 회귀 테스트 | Comlink wire-compatible (POC) | (동일) | ADR-IPC (보류) | 1.5주 |
| SBX-v2-02 | N-08 강화 — POC rate-limiter 검토 + 정식 대응 | rate-limiter.ts (POC 완료) | + 서버측 rate limit (API-SEC-02) | — | 2일 |
| SBX-v2-03 | CSP nonce 도입 (TECH-03 reshape) + 게임 엔진 매트릭스 재검증 | nonce middleware | (동일) | SRV-01 | 1주 |
| SBX-v2-04 | iframe sandbox 우회 CVE 모니터링 자동화 | dependabot + CVE feed | (동일) | — | 2일 |
| SBX-v2-05 | 권한 grant UI + 영속화 + 호스트 측 enforcement | LocalRepo 권한 record | + 서버 audit | SBX-v2-00 | 2주 |
| SBX-v2-06 | 서버 측 ZIP 재스캔 (clamd / VirusTotal API) | (Local: LocalStaticModeration로 대체) | CloudModeration 어댑터 | SRV-01 | 1주 |
| SBX-v2-07 | iframe sandbox + Permissions-Policy v2 명시적 grant | manifest capabilities 기반 동적 sandbox | (동일) | SBX-v2-05 | 3일 |

### Epic F: 인프라 (SRV)

| ID | 작업 | 의존성 | 예상 |
|----|------|--------|------|
| ~~**SRV-00**~~ | ✅ ARCH-01 reshape — apps/web + packages/{core,storage,ipc} (ADR-0016) | — | 완료 (2026-05-26) |
| SRV-01 | 호스팅 결정 (Vercel vs Cloudflare Pages vs 정적 export) | ADR-Hosting (보류) | 1주 (검토) |
| SRV-02 | CI/CD (lint/test/build/deploy) | SRV-01 | 3일 |
| SRV-03 | 에러 추적 (Sentry 또는 self-hosted) | SRV-01 | 2일 |
| SRV-04 | 로깅 + 알림 (Edge Function 비용 모니터링) | SRV-01 | 2일 |
| SRV-05 | 환경 변수 + 시크릿 관리 정책 (`NEXT_PUBLIC_PORTS_MODE` 등) | SRV-01 | 2일 |
| SRV-06 | 백업 + 재해 복구 (DB + Storage 일일 백업) | CLD-01, STR-v2-01 | 3일 |

### Epic G: 데이터 마이그레이션 (MIG)

LocalAdapter는 자체 마이그레이션 불필요 (단일 사용자). CloudAdapter 도입 시 Local↔Cloud 마이그레이션 필요.

| ID | 작업 | LocalAdapter | CloudAdapter (옵션) | 의존성 | 예상 |
|----|------|-------------|---------------------|--------|------|
| MIG-01 | LocalAuth anon UserId → CloudAuth 매핑 (첫 가입 시 1회 업로드) | exportAnonUserId utility (ADR-0018 D4) | CloudAuth metadata `legacy_anon_user_id` | USR-01, CLD-02 | 1주 |
| MIG-02 | 충돌 정책 (병합/덮어쓰기/스킵) + UI | (해당 없음) | ConfirmDialog 재사용 | MIG-01 | 3일 |
| MIG-03 | 시뮬레이션 + 롤백 가능 (v1 IDB 백업 90일 유지) | (해당 없음) | snapshot namespace | MIG-01 | 3일 |

### Epic H: 관찰 가능성 (OBS)

| ID | 작업 | LocalAdapter | CloudAdapter (옵션) | 의존성 | 예상 |
|----|------|-------------|---------------------|--------|------|
| OBS-01 | 클라이언트 에러 추적 (REFAC-01 C-1 + H-5 통합) | PersistenceErrorContext (POC) | + Sentry 전송 | SRV-03 | 3일 |
| OBS-02 | 사용자 행동 분석 (앱 설치/실행, 엔진 사용) | (Local: 미수집) | Analytics 전송 | SRV-01 | 3일 |
| OBS-03 | 서버 audit log (모더레이션, 권한 grant 등) | (해당 없음) | audit_log table + 인덱스 | SRV-01 | 3일 |

### Epic I: 백엔드 보안 (API-SEC) — CloudAdapter 전용

LocalAdapter는 백엔드 부재이므로 본 Epic은 CloudAdapter 활성 시점에만 적용.

| ID | 작업 | 의존성 | 예상 |
|----|------|--------|------|
| API-SEC-01 | CSRF 보호 (Next.js Server Action + API route) | SRV-01, USR-01 | 3일 |
| API-SEC-02 | 서버 측 rate limiting (N-08 클라이언트와 별개) | SRV-01 | 2일 |
| API-SEC-03 | SSRF 방어 (사용자 URL fetch 차단/검증) | STR-v2-03 | 2일 |
| API-SEC-04 | 호스트 UI 렌더 사용자 콘텐츠 sanitize (description/screenshots 등) | STR-v2-04 | 2일 |

---

## §5. ADR 진행 현황

### ✅ 채택 완료 (2026-05-27 기준)

| ADR | 제목 | 영향 |
|-----|------|------|
| ADR-0016 | v2 모노레포 (pnpm + Turborepo) | ARCH-01 reshape, TECH-10 등재 |
| **ADR-0017** | **Ports & Adapters + 5 Port 정의** | ARCH-03 신규, TECH-07/08/09 superseded |
| **ADR-0018** | LocalAuth — POC anon UserId + system namespace | USR Epic 기본 어댑터 |
| **ADR-0019** | LocalRepo IDB — installed-apps/user-apps 흡수 + cascade remove | STR-v2 Epic 기본 어댑터 |
| **ADR-0020** | LocalOPFS BlobStorage — packages/storage 흡수 + AbortSignal | CLD Epic 기본 어댑터 |
| **ADR-0021** | LocalNoOpSync — silent no-op | CLD Epic sync 기본 |
| **ADR-0022** | LocalStaticModeration — 정규식 7 패턴 fail-closed | MOD Epic 기본 어댑터 |
| **ADR-0023** | Adapter Resolver + Composition Root | REFAC-02-P5 진입 명세 |

### ⛔ Superseded (참고용 보존)

| ADR | 이전 결정 | superseded by |
|-----|----------|---------------|
| ADR-0013 | v2 Supabase Auth 단일 채택 | ADR-0017 → ADR-0024+ (CloudAuth-Supabase 예정) |
| ADR-0014 | v2 Supabase Postgres + Drizzle | ADR-0017 → ADR-0025+ (CloudRepo-Supabase 예정) |
| ADR-0015 | v2 LWW + 서버 권위 시계 | ADR-0017 → ADR-0026+ (CloudSync-LWW 예정) |

### ⏳ 보류 — Cloud 어댑터 트랙 (CLD Epic 진입 시점)

| ADR 후보 | 영향 | 비고 |
|----------|------|------|
| ADR-0024+ | CloudAuth-Supabase 어댑터 | ADR-0013 결정 근거 흡수 (MAU 비용, RLS, CVE 회피) |
| ADR-0025+ | CloudRepo-Supabase 어댑터 | ADR-0014 결정 근거 흡수 (Drizzle, RLS auth.uid() 패턴) |
| ADR-0026+ | CloudSync-LWW 어댑터 | ADR-0015 결정 근거 흡수 (SyncEnvelope, 멱등성 키) |
| ADR-0027+ | Local↔Cloud Migration utility | MIG-01~03 전제 |
| ADR-0028+ | CloudBlob 어댑터 (R2 vs Supabase Storage) | CLD-01 선택 |
| ADR-0029+ | CloudModeration 어댑터 (VirusTotal 등) | SBX-v2-06 + MOD-01 강화 |
| ADR-Permission | manifest capabilities + grant 영속화 | SBX-v2-00, APP-01 v2 schema |
| ADR-Hosting | Vercel vs Cloudflare Pages vs 정적 export | SRV-01 |
| ADR-API-Auth | Server Action vs Route Handler + JWT cookie vs header | API-SEC-01 |
| ADR-IPC | IPC-02 Comlink 라이브러리 직접 통합 | SBX-v2-01 |
| ADR-PROD-05-v2 | 사용자 ZIP 다중 파일 + presigned URL | STR-v2-03 |
| ADR-Cache | 클라이언트 IDB 캐시 + invalidation | 비용/성능 |

**진입 순서**: REFAC-02 → M5 (USR Local 기본) → M6 (STR-v2 Local + Cloud 옵션 진입) → ADR-0024+ 작성 → M7~M10.

---

## §6. POC v1 → v2 정책 reshape 현황

| 정책 ID | POC v1 | v2 reshape | 상태 |
|---------|--------|-----------|------|
| **ARCH-01** | 단일 Next.js | apps/web + packages/{core,storage,ipc,adapters-local} | ✅ 완료 (ADR-0016 + ADR-0017) |
| **ARCH-02** | iframe + 자체 RPC | Comlink 라이브러리 (IPC-02 / SBX-v2-01) | ⏳ v2.1 |
| **ARCH-03** | (신규) | Ports & Adapters 5 Port + 어댑터 패키지 | ✅ 신규 (ADR-0017) |
| **TECH-01** | IDB + 메모리 폴백 + OPFS | BlobStorage Port + Local 어댑터 (ADR-0020) | ✅ ADR-0017+0020 |
| **TECH-03** | 정적 CSP/PP 헤더 | nonce 기반 동적 CSP (SBX-v2-03) | ⏳ M8 |
| **TECH-05** | Context + useReducer | (검토) Zustand 도입 시점 — 윈도우 20+ 또는 persist 요구 시 | ⏳ 무기한 |
| **TECH-07** | (이전) Supabase Auth 단일 채택 | superseded by ADR-0017 → ADR-0024+ Cloud 옵션 | ⛔ superseded |
| **TECH-08** | (이전) Supabase Postgres + Drizzle | superseded by ADR-0017 → ADR-0025+ Cloud 옵션 | ⛔ superseded |
| **TECH-09** | (이전) LWW + 서버 권위 시계 | superseded by ADR-0017 → ADR-0026+ Cloud 옵션 | ⛔ superseded |
| **PROD-01** | 단일 사용자 | LocalAuth anon UserId (단일 사용자 유지) + Cloud 옵션 | ✅ ADR-0018 |
| **PROD-02** | 하드코딩 desktopApps.ts | LocalRepo (IDB) — `built-in` 카탈로그는 호출자가 별도 제공 | ✅ ADR-0019 |
| **PROD-05** | 단일 HTML inline + IDB | v2.0 inline 유지 + LocalStaticModeration scan + v2.1 blob 분리 | 🔄 진행 중 (ADR-0019/0022) |
| **CONST-01** | (신규) | RLS 의무 — CloudRepo 어댑터 한정 | ✅ ADR-0017 (scope 한정) |
| **CONST-02** | (신규) | 서버 시계 권위 — CloudSync 어댑터 한정 | ✅ ADR-0017 (scope 한정) |
| **security.md ZIP 수신** | 클라이언트 6단계 + LocalStaticModeration | + 서버 측 동등 이상 복제 (SBX-v2-06 — Cloud 모드) | 🔄 진행 중 |
| **ADR-0010 N-08** | 클라이언트 rate-limiter | + 서버 측 rate limit (API-SEC-02 — Cloud 모드) | ⏳ M8 |

### 마이그레이션 원칙
- **인터페이스 보존**: useInstalledApps, useUserApps 등 hook 시그니처 무변경. 내부만 Port 호출로 reshape (REFAC-02)
- **점진적**: Local 어댑터로 v2.0 출시 → Cloud 어댑터 옵션 도입 (M6 이후)
- **롤백 가능**: `NEXT_PUBLIC_PORTS_MODE=local`로 언제든 Local 전용 회귀
- **회귀 테스트**: Vitest contract test (Port 단위) + e2e Playwright (Provider 시그니처 보존)

---

## §7. 마일스톤 (v0.3.0 재배치)

| 마일스톤 | 목표 Epic + 작업 | 예상 |
|---------|-----------------|------|
| **REFAC-02 (M5 진입 전)** | Epic J 5 작업 (P1~P5) — packages/adapters-local 신규 + 5 Provider Port 호출 reshape | 3주 |
| **M5** | SRV-01~02 + USR-01~04 (인프라 + 로컬 인증 기본) | 3주 |
| **M6** | STR-v2-01~02 + CLD-01~02 + SBX-v2-00 (Local 카탈로그 + Cloud 어댑터 진입) | 4주 |
| **M7** | CLD-03~09 + STR-v2-03~05 (Cloud 동기화 + 스토어 백엔드) + ADR-0024~0026 작성 | 5주 |
| **M8** | MOD-01~04 + SBX-v2-01~07 + API-SEC-01~04 (모더레이션 + 보안 + 백엔드 보안) | 4주 |
| **M9** | USR-05~06 + MIG-01~03 + STR-v2-06~08 + MOD-05~06 (마이그레이션 + 마무리) | 3주 |
| **M10** | SRV-03~06 + OBS-01~03 + 페네스트 + 베타 출시 | 2주 |

**총 24주** (6개월) — REFAC-02 3주 추가로 v0.2.0의 21주에서 +3주. architect 18~22주 범위 +α.

**Local-only v2.0 출시 옵션**: REFAC-02 + M5 완료 시점에 "Local-only v2.0" 출시 가능 (M6 이후는 Cloud 어댑터). 사용자 시나리오 F(Local↔Cloud 전환)를 v2.1로 분리 가능.

---

## §8. 리스크 (v0.3.0 갱신)

| 리스크 | 영향 | 대응 |
|--------|------|------|
| **인증 공급자 비용 폭증** | $$ | LocalAuth 기본 + Cloud 옵션 — 비용 noise 없음. CloudAuth 도입 시 무료 tier + Auth.js 자체 호스팅 |
| **CRDT 학습 곡선** | 일정 | LWW로 출발 (ADR-0026+ Cloud Sync) → 충돌 빈도 측정 → CRDT 도입 판단 |
| **사용자 업로드 악성 코드** | 보안 | LocalStaticModeration (ADR-0022) + iframe sandbox + 수동 모더레이션 + 서버 재스캔 (Cloud) |
| **스토리지 비용** | $$ | 사용자별 quota (CLD-09) + Local-only 사용자는 무비용 |
| **벤더 lock-in** | 마이그레이션 | Ports & Adapters로 어댑터 교체 1건 단위 (ADR-0017) |
| **CSP nonce 부작용** | 호환성 | Phase별 적용 + 게임 엔진 매트릭스 재검증 (SBX-v2-03) |
| **법적 이슈 (DMCA, DSA)** | 법무 | MOD-04 + MOD-05 정책 + takedown 절차 |
| **CSRF/XSS** | 보안 | API-SEC-01 + API-SEC-04 sanitize (Cloud 모드) |
| **SSRF** | 보안 | API-SEC-03 + presigned URL 직접 업로드 모델 |
| **공급망 공격** | 보안 | dependabot + lockfile policy (SRV-02 통합) |
| **계정 탈취 (JWT leak)** | 보안 | cookie httpOnly + SameSite=Strict (ADR-API-Auth 결정) |
| **악성 모더레이터** | 운영 | OBS-03 audit log + 권한 격리 |
| **DoS via 업로드** | 가용성 | API-SEC-02 서버 rate limit |
| **데이터 마이그레이션 실패** | 사용자 손실 | MIG-03 90일 백업 + 롤백 (ADR-0027+ Cloud 도입 시) |
| **모더레이션 우회** | 보안 | LocalStaticModeration (ADR-0022 정규식 7) + Cloud 재스캔 (SBX-v2-06) + MOD-06 신뢰 등급 |
| **[신규] Cloud 어댑터 미설치 빌드 실패** | 빌드 broken | webpackIgnore magic comment + try/catch graceful fallback (ADR-0023 §D8) |
| **[신규] Local↔Cloud 마이그레이션 데이터 손실** | 사용자 손실 | Migration utility 별도 작성 (Port 외부) + 90일 백업 (ADR-0027+) |
| **[신규] Suspense fallback UI 미정의** | UX 회귀 | PortsProvider에 명시적 LoadingDesktop fallback (ADR-0023 R4) |
| **[신규] adapterPolicies reshape 호출자 누락** | 빌드 회귀 | resolveByPolicy 1곳만 변경 + alias 보존 (ADR-0023 R3) |

---

## §9. 검증 기준 (v2 종료 게이트)

### 기능 검증 (Local-only v2.0 기본)
1. 첫 진입 시 anon UserId 자동 발급 + 영속화 + 멀티탭 동기화 (ADR-0018)
2. 데스크탑 → 앱 설치/실행/삭제/업데이트 (REFAC-02 후 동일 UX)
3. 사용자 ZIP 업로드 → LocalStaticModeration scan → flagged/blocked verdict UI (ADR-0022)
4. `NEXT_PUBLIC_PORTS_MODE=local` 또는 미설정 시 Cloud 어댑터 번들 0KB (ADR-0023)
5. signOut → system namespace clear → 다음 진입 시 신규 UserId 발급

### 기능 검증 (Cloud 옵션 활성 시)
6. 회원가입 → 로그인 → 데스크탑 사용자 계정 연동 (USR-01 + ADR-0024+)
7. 다른 브라우저/디바이스 로그인 → 동일 데스크탑 상태 복원 (CLD-04 + ADR-0026+)
8. 사용자 A가 ZIP 업로드 → CloudModeration 큐 → 승인 → 공개 카탈로그 노출 (STR-v2-03)
9. 사용자 B 검색 → 설치 → 본인 데스크탑 실행 (STR-v2-04)
10. 사용자 A 데스크탑 ↔ 사용자 B 데스크탑 독립 (RLS 격리 — CONST-01)
11. POC v1 사용자가 v2로 마이그레이션 → 기존 설치 앱/설정 보존 (MIG-01~03)
12. 오프라인 → 액션 큐 → 재연결 시 sync (CLD-06)
13. 계정 삭제 → 데이터 export + 서버 데이터 완전 제거 (USR-05, GDPR)

### 보안 검증
1. **OWASP ASVS L1** 체크리스트 통과 (Cloud 모드)
2. **OWASP Top 10 2025** A01~A10 항목별 대응 명시
3. **iframe sandbox 페네스트 14항목** + v2 신규 항목 ALL PASS (Local + Cloud 양쪽)
4. **RLS 우회 자동 페네스트** (50+ 시도) — CloudRepo 채택 시
5. **모더레이션 우회 자동 페네스트** (악성 정적 패턴 50+) — LocalStaticModeration + CloudModeration
6. **CSRF/SSRF/XSS 자동 페네스트** — API-SEC 검증 (Cloud 모드)
7. **공급망 점검** — dependabot 임계치 0 critical

### Local-only 추가 검증
1. `pnpm install` 후 `NEXT_PUBLIC_PORTS_MODE` 미설정 → Local 정상 동작
2. `pnpm build` 후 번들 분석 → `@zm/adapters-cloud-*` 0KB (tree-shake)
3. Vitest 75+ PASS (Port contract test + 기존 61 + Local 어댑터 contract 14+)
4. e2e Playwright 6 시나리오 PASS

---

## §10. 다음 단계

### 완료 (2026-05-27 기준)
1. ✅ **ADR-0016** (모노레포) — pnpm + Turborepo
2. ✅ **SRV-00 실행** — apps/web + packages/{core,storage,ipc}
3. ✅ **ADR-0017** Ports & Adapters + 5 Port
4. ✅ **ADR-0018~0023** Local 어댑터 6건 일괄 채택
5. ✅ **ADR-0013/0014/0015 superseded** 처리
6. ✅ **policy-registry + _digest + MEMORY** 동기화
7. ✅ **v2 plan v0.3.0** 본 문서 갱신

### 즉시 진입 — REFAC-02 (코드 마이그레이션 5 작업, ~3주)
8. **REFAC-02-P1**: `packages/adapters-local` 신규 패키지 + namespace-registry adapterPolicies reshape + system namespace 추가 (3일)
9. **REFAC-02-P2**: BlobStorage Port + LocalOPFS 어댑터 이전 + `@zm/storage` shell (5일)
10. **REFAC-02-P3**: AppRepository Port + LocalRepo + 4 wrapper 흡수 (5일)
11. **REFAC-02-P4**: AuthProvider + SyncProvider + ModerationProvider 3 어댑터 (5일)
12. **REFAC-02-P5**: Adapter Resolver + Composition Root + 5 Provider reshape + 회귀 검증 (5일)

### REFAC-02 완료 후 — M5 진입
13. **SRV-01~02 결정** — 호스팅 검토 (Vercel vs CF Pages vs 정적 export) + CI/CD 구축
14. **USR-01~04 (Local 어댑터 기본)** — LocalAuth 통합 UI + 로그인/로그아웃 + 세션 만료

### M6 이후
15. **ADR-0024~0026 작성** — CloudAuth/CloudRepo/CloudSync 어댑터 (CLD Epic 진입 시점)
16. **CLD/STR-v2 Cloud 옵션 진입** — Cloud 어댑터 동적 import 구현
17. **회귀 테스트 infra** — hook 시그니처 보존 자동 검증 + Port contract test 매트릭스

---

## §11. 가정 (검증 필요)

| 가정 | 검증 방법 |
|------|----------|
| (G1) crypto.randomUUID()가 모든 타겟 브라우저 지원 | research-analyst (ADR-0018) |
| (G2) BroadcastChannel multi-tab sync가 안정적 | research-analyst (ADR-0018) |
| (G3) idb v8.0.3 AbortSignal 미지원 — entry-level 폴링으로 충분 | lib-developer (REFAC-02-P2) |
| (G4) React 19 `use(promise)` + Suspense가 module top-level Promise 캐싱 | research-analyst (ADR-0023) |
| (G5) Turbopack `webpackIgnore` 동등 magic comment 지원 | research-analyst (ADR-0023) |
| (G6) Next.js 16에서 `NEXT_PUBLIC_PORTS_MODE` 클라이언트 노출 동작 | research-analyst (ADR-0023) |
| (G7) Cloudflare R2 egress 무료가 게임 ZIP 대량 다운로드 부하에 충분 | research-analyst (ADR-0028+ 작성 시) |
| (G8) OPFS Worker + SyncAccessHandle이 cloud-adapter와 충돌 없음 | spike 1주 권장 (M6 진입 시) |
| (G9) Comlink v4.4.2+가 host.ts 인터페이스 보존 가능 | research-analyst (ADR-IPC 작성 시, SBX-v2-01) |
| (G10) 사용자별 10MB 스토리지 한도가 평균 게임 크기에 충분 | 시뮬레이션 (CLD-09 작업 시) |

---

## §12. Change Log

### 0.3.0 (2026-05-27) — ADR-0017~0023 일괄 채택 반영
- **신규 Epic J (REFAC-02)**: 5 작업 분할 (P1~P5) — M5 진입 전 선행, 약 3주
- **Epic A~I 작업 reshape**: 각 작업에 LocalAdapter (필수) + CloudAdapter (옵션) 표기 추가
- **ADR 진행 현황 §5 신설**: 채택 8건(0016~0023) + superseded 3건(0013~0015) + 보류 12건(0024+)
- **POC reshape 정책 §6 갱신**: ARCH-01/ARCH-03/TECH-01 완료, TECH-07/08/09 superseded 명시
- **마일스톤 §7 재배치**: REFAC-02(M5 전, 3주) + M5~M10 = 총 24주
- **Local-only v2.0 옵션**: REFAC-02 + M5 완료 시점에 Local-only 출시 가능, M6 이후 Cloud 단계적
- **신규 리스크 4건**: Cloud 어댑터 미설치 빌드 실패 / Local↔Cloud 마이그레이션 / Suspense fallback / adapterPolicies reshape
- **검증 기준 §9 분리**: Local-only(1~5) + Cloud 옵션 활성(6~13) + Local 추가(빌드/번들/테스트)
- **§12 다음 단계 재정의**: REFAC-02 P1~P5 즉시 진입 가능

### 0.2.0 (2026-05-26) — architect 검토 + 사용자 결정 반영
- 신규 3 Epic: G(데이터 마이그레이션) + H(관찰 가능성) + I(백엔드 보안)
- 신규 작업 13건, 마일스톤 재배치 M5~M10 (총 21주)
- ADR 후보 7건 → 12건, POC reshape 8건 → 10건
- 리스크 7건 → 15건
- 사용자 확정: Epic G 도입, ADR 3건 병렬, 18~22주 수용, 모노레포 v2 진입 전 일괄

### 0.1.0 (2026-05-26)
- 초기 v2 plan 작성 (6 Epic + 33 작업 + 7 ADR 후보)
