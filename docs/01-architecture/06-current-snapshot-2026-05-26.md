# 현재 아키텍처 + 기술 스택 스냅샷

> **기준 시점**: 2026-05-26 (SRV-00 모노레포 마이그레이션 완료 직후)
> **목적**: 로컬-우선 + Ports & Adapters 아키텍처 도입 전 baseline 정리

---

## §1. 모노레포 구조 (SRV-00 결과)

```
zm-os/
├── apps/
│   └── web/                          # @zm/web — Next.js 16 풀스택
│       ├── src/
│       │   ├── app/                  # 페이지 + Server Action
│       │   ├── components/{desktop,store,ui}/
│       │   └── lib/{apps,errors,security,storage}/
│       ├── public/                   # 정적 자산 + 샘플 게임
│       └── e2e/                      # Playwright (6 시나리오)
├── packages/
│   ├── core/                         # @zm/core — 순수 타입/유틸 (zod만)
│   ├── storage/                      # @zm/storage — Strategy 패턴
│   └── ipc/                          # @zm/ipc — wire-compatible RPC
├── docs/ (10 카테고리 + ADR-0001~0016)
├── pnpm-workspace.yaml + turbo.json
└── .claude/ (13 agents + 9 skills + 10 rules + 10 hooks)
```

**총 코드 규모**: ~8,372 LOC (TypeScript) + samples ~1,500 LOC (HTML/JS)

---

## §2. 패키지 의존성 그래프

```
            ┌──────────────┐
            │  @zm/core    │  (zod만 의존)
            └──────┬───────┘
                   │
   ┌───────────────┼───────────────┐
   ▼               ▼               ▼
@zm/storage    @zm/ipc          @zm/web
            (zod)           (모두 소비)
```

순환 의존 0건. lib → components 단방향 (REFAC-01 정밀 감사 보정 완료).

---

## §3. 확정 기술 스택 (POC v1)

| 영역 | 기술 | 버전 | 출처 |
|------|------|------|------|
| FE 프레임워크 | Next.js (Turbopack) | 16.1.1 | ADR-0001 |
| UI 라이브러리 | React | 19.2.3 | ADR-0001 |
| 언어 | TypeScript strict | 5.x | ADR-0001 |
| 스타일 | Tailwind v4 + class dark | 4.x | ADR-0012 |
| 윈도우 매니저 | react-rnd | 10.5.3 | ADR-0002 |
| 윈도우 상태 | React Context + useReducer | — | ADR-0005 |
| 검증 | Zod | 4.4.3 | ADR-0001 |
| 클라이언트 DB | idb library | 8.0.3 | ADR-0007 |
| 스토리지 추상화 | StorageAdapter Strategy | 자체 | **ADR-0009 ⭐** |
| iframe 격리 | sandbox="allow-scripts" + srcdoc | 네이티브 | ARCH-02 |
| 호스트-앱 IPC | wire-compatible RPC (자체) | 자체 | ADR-0003 |
| ZIP 처리 | JSZip | 3.10.1 | ADR-0008 |
| 게임 엔진 (샘플) | Phaser 3.90 / Pixi 8.18 / Three r184 | — | Phase 3-B |
| 단위 테스트 | Vitest | 4.1.7 | TEST-01 |
| e2e 테스트 | Playwright | 1.60.0 | — |
| 패키지 매니저 | pnpm workspaces | 10.33.0 | ADR-0016 |
| 모노레포 빌더 | Turborepo | 2.9.14 | ADR-0016 |

**핵심: 외부 SaaS 의존 0건. 모든 의존성은 npm 정적 라이브러리.**

---

## §4. 적용 중인 아키텍처 패턴

| 패턴 | 위치 | 효과 | 출처 |
|------|------|------|------|
| **Strategy (StorageAdapter)** | `@zm/storage` | IDB/OPFS/Memory 어댑터 교체 | ADR-0009 |
| **Strategy (ContentLoader)** | `apps/web/.../content-loader.ts` | built-in vs user 콘텐츠 분리 | REFAC-01 H-3 |
| **Validation Chain** | `apps/web/.../validators/` (9파일) | 검증 단계 모듈화 | REFAC-01 H-2 |
| **Discriminated Union (Manifest v1/v2)** | `@zm/core/manifest` | V1 자동 마이그레이션 | REFAC-01 H-1 |
| **SSOT (Namespace Registry)** | `@zm/core/namespace-registry` | namespace 식별자 단일 출처 | REFAC-01 C-3 |
| **Custom Hook DI (usePersistence)** | `apps/web/.../use-persistence.ts` | Provider 영속화 캡슐화 | REFAC-01 H-4 |
| **Error Boundary 계층화** | error.tsx + global + Context | 다층 에러 격리 | REFAC-01 C-1+H-5 |
| **Wire-Compatible RPC** | `@zm/ipc` | Comlink와 동일 API surface | ADR-0003 |

**핵심 관찰**: StorageAdapter는 Ports & Adapters의 부분 구현. v2에서 인증/DB/Sync로 동일 패턴 확장이 자연스러움.

---

## §5. 외부 의존성 현황

### 🟢 로컬 100% 동작 (외부 의존 0)
- POC v1 전 기능 (스토어/데스크탑/iframe/IPC/IDB/사용자 ZIP)
- `pnpm dev` / `pnpm build` / `pnpm test` 전체 로컬 실행
- 외부 API 호출 0건 (게임 엔진은 `/public/` 정적 자산)

### 🟡 v2 옵션 분리 대상 (어댑터 추상화 후보)

| 영역 | 클라우드 후보 | 로컬 기본 (제안) |
|------|--------------|----------------|
| 인증 | Supabase Auth | LocalAuth (단일 사용자 또는 password) |
| DB | Supabase Postgres | LocalRepo (IDB 기반) |
| 객체 스토리지 | R2 / Supabase Storage | OPFS / IDB |
| 동기화 | LWW + 서버 권위 시계 | LocalNoOp |
| 모더레이션 | VirusTotal / ClamAV | 정적 분석 (eval/Function 검출) |

---

## §6. ADR + 정책 인벤토리

### ADR (16건)
- **ADR-0001~0012** (POC v1 결정, 13건): 스택/IPC/CSP/윈도우/카탈로그/스토리지/ZIP/추상화/앱 라이프사이클/다크모드
- **ADR-0013** (v2 Supabase Auth) — ⚠️ 로컬-우선 reshape 대기
- **ADR-0014** (v2 Supabase Postgres) — ⚠️ 로컬-우선 reshape 대기
- **ADR-0015** (v2 LWW 동기화) — ⚠️ 로컬-우선 reshape 대기
- **ADR-0016** (v2 모노레포 pnpm+Turborepo) ✅

### Policy (정책 레지스트리)
- **ARCH-01~02**: 모노레포 / iframe 샌드박싱
- **TECH-01~10**: 스토리지 / Python hooks / CSP / 윈도우 / 상태관리 / 다크 / Auth / DB / Sync / 모노레포
- **PROD-01~05**: POC 스코프 / 카탈로그 / 메타데이터 / 설치 상태 / 사용자 ZIP
- **CONST-01~02**: RLS 활성화 / 클라이언트 시계 hint

---

## §7. 로컬-우선 아키텍처 진입 (사용자 결정 2026-05-26)

**원칙**: 로컬 개발/실행은 외부 의존성 0건. 클라우드 서비스는 어댑터를 통한 옵션.

### 추상화 대상 Port 5개 (제안)

| Port (도메인 인터페이스) | Local Adapter (기본) | Cloud Adapter (옵션) |
|------------------------|---------------------|---------------------|
| **AuthProvider** | LocalAuth (IDB) | SupabaseAuth, AWS Cognito |
| **StorageAdapter** ✅ | IDB / OPFS / Memory | R2 / Supabase Storage |
| **AppRepository** | LocalRepo (IDB) | PostgresRepo (Supabase) |
| **SyncProvider** | LocalNoOp | CloudLWW (Supabase Realtime) |
| **ModerationProvider** | StaticAnalysis | RemoteScan (VirusTotal) |

### 진입 ADR (대기)
- **ADR-0017**: Ports & Adapters 아키텍처 (5개 Port 정의)
- **ADR-0013~0015 reshape**: 어댑터 옵션으로 격하
- **ADR-0018~0023**: 각 Port의 LocalAdapter 기본 명세

### v2 plan 영향
- v0.2.0 (Supabase 가정) → v0.3.0 (로컬-우선 + 옵션 어댑터)
- 9 Epic + 46 작업 구조는 유지, 각 작업에 "LocalAdapter 필수 / CloudAdapter 옵션" 명시 필요
