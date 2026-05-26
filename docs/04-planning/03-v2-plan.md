# v2 Plan — 멀티유저 + 클라우드 (revised)

> **Living Document**. architect 검토 + 사용자 결정사항 반영.
> 각 결정사항은 ADR로 별도 승격 예정.

**Version**: 0.2.0
**Last Updated**: 2026-05-26
**Status**: architect ✅ + 사용자 결정 ✅ — ADR 3건 병렬 작성 대기

---

## §1. Context

POC 1차(Phase 0~3)가 2026-05-25 M4 마일스톤으로 종료되었고, Post-POC(REFAC-01 + APP-04 확장)도 완료되었다. v0.1.0 초안 후 architect 정밀 검토(2026-05-26)에서 결정적 결함 7건 + 누락 작업 13건이 식별되어 본 v0.2.0으로 revision한다.

**사용자 확정 사항 (2026-05-26)**:
- Epic G(데이터 마이그레이션) **도입** — POC v1 사용자 데이터 보존 의무
- ADR 작성 우선순위 — **인증 + DB + 동기화 병렬** 3건
- 추정 부풀림 **수용** (14주 → 18~22주, 품질 우선)
- ARCH-01 모노레포 분리 — **v2 진입 전 일괄**

---

## §2. v2 목표 (In Scope)

| 영역 | 목표 |
|------|------|
| **인증** | 사용자 계정 + 로그인 + 세션 관리 + 계정 삭제(GDPR) + 디바이스 관리 |
| **클라우드 스토리지** | 설치 앱/데스크탑 설정/사용자 업로드 ZIP 서버 보관 + 사용자별 quota |
| **동기화** | 멀티디바이스 데스크탑 상태 동기화 + 충돌 해결 UX + 오프라인 큐 |
| **공유 스토어** | 백엔드 앱 카탈로그 + 업로드 + 모더레이션 + 검색/필터 + 사용자 프로필 + 버전 관리 |
| **모더레이션** | 정적 분석 + 자동 분류 + 수동 검토 + 신뢰 개발자 + DMCA |
| **보안 강화** | iframe sandbox 강화 + 서버측 ZIP 재검증 + CSP nonce + 권한 grant UI + 매니페스트 schema v2 |
| **백엔드 보안** | CSRF/SSRF/서버측 rate limit/audit log/RLS/세션 보안 |
| **데이터 마이그레이션** | POC v1 IDB → v2 클라우드 무손실 이전 |
| **관찰 가능성** | 에러 추적 + 사용자 행동 분석 + 서버 audit log |
| **IPC 정식화** | 자체 RPC → Comlink 라이브러리 직접 통합 (IPC-02) |
| **인프라** | 호스팅/CI/모니터링/백업/시크릿 관리 |

---

## §3. v2 비목표 (Out of Scope)

v3 이연:
- 가상 OS 부팅 (v86/WebVM) — PRD §1.2 비전 1번
- 앱 간 IPC (cross-app communication)
- 권한 모델 세분화 (camera/mic/geolocation grant flow)
- 가상 파일 시스템 (앱이 host FS 접근)
- COEP/COOP/SharedArrayBuffer (Godot 등 SAB 게임 엔진)

v2 영구 비목표:
- 가상화폐 채굴 앱 호스팅 (PRD §6 영구 정책)
- 성인 콘텐츠 (PRD §6 영구 정책)
- 결제/구독 시스템 — Marketplace 도입 후 별도 phase
- 모바일 네이티브 (Electron/Tauri)
- 다국어 (i18n)
- 키보드 접근성 dnd-kit 이주 (TECH-04 재고 시점 도래 시 별도 검토)

---

## §4. Epic 분해

Feature ID 규칙 확장:
- **USR** — 사용자 인증/프로필
- **CLD** — 클라우드 스토리지/동기화
- **STR-v2** — 스토어 백엔드 (기존 STR 확장)
- **MOD** — 모더레이션
- **SBX-v2** — 샌드박스 강화 (기존 SBX 확장)
- **SRV** — 서버/인프라
- **MIG** — 데이터 마이그레이션 [신규 Epic G]
- **OBS** — 관찰 가능성 [신규 Epic H]
- **API-SEC** — 백엔드 보안 [신규 Epic I]

### Epic A: 인증 + 사용자 (USR)

| ID | 작업 | 의존성 | 예상 |
|----|------|--------|------|
| USR-01 | 인증 공급자 통합 (Clerk vs Supabase Auth) + JWT 클레임 설계 + middleware | ADR-Auth | 2주 |
| USR-02 | 사용자 프로필 (이름/아바타) + 데스크탑 표시 | USR-01 | 3일 |
| USR-03 | 로그인/로그아웃 UI + 보호 라우트 | USR-01 | 2일 |
| USR-04 | 세션 만료 + 토큰 refresh | USR-01 | 2일 |
| USR-05 | 계정 삭제 (GDPR) + 데이터 export | USR-01, CLD-02 | 3일 |
| USR-06 | 디바이스 세션 관리 (다중 로그인 + 강제 로그아웃) | USR-01 | 3일 |

### Epic B: 클라우드 스토리지 (CLD)

| ID | 작업 | 의존성 | 예상 |
|----|------|--------|------|
| CLD-01 | 객체 스토리지 선택 (R2 vs Supabase Storage) | ADR-Storage | 1주 |
| CLD-02 | cloud-adapter.ts — StorageAdapter Strategy 확장 | CLD-01, USR-01, ADR-0009 | 1주 |
| CLD-03 | 동기화 전략 결정 (CRDT vs LWW) | ADR-Sync | 1주 (검토) |
| CLD-04 | 데스크탑 상태 동기화 구현 (윈도우 레이아웃 + 설정) | CLD-02, CLD-03 | 2주 |
| CLD-05 | 사용자 업로드 ZIP 클라우드 보관 (presigned URL) | CLD-02 | 3일 |
| CLD-06 | 오프라인 큐 + 재연결 sync (멱등성 키 + retry) | CLD-04 | 2주 |
| CLD-07 | 충돌 해결 UX (LWW 채택 시 — 사용자 표시 + 수동 머지) | CLD-03 | 3일 |
| CLD-08 | 동기화 상태 표시 UI (저장 중/오프라인/충돌) | CLD-04 | 3일 |
| CLD-09 | 사용자별 quota + 초과 UX | CLD-02 | 2일 |

### Epic C: 스토어 백엔드 (STR-v2)

| ID | 작업 | 의존성 | 예상 |
|----|------|--------|------|
| STR-v2-01 | DB schema (Postgres + RLS) — apps/users/installs | USR-01, ADR-DB | 3일 |
| STR-v2-02 | API 라우트 (apps CRUD + install/uninstall) | STR-v2-01 | 1주 |
| STR-v2-03 | 사용자 앱 업로드 → 서버 보관 + 검증 (PROD-05 v2 reshape) | STR-v2-02, SBX-v2-06 | 2주 |
| STR-v2-04 | 공유 카탈로그 (다른 사용자 앱 검색/설치) | STR-v2-02 | 5일 |
| STR-v2-05 | 평점/다운로드 수 + 정렬 | STR-v2-04 | 3일 |
| STR-v2-06 | 검색 + 필터 (카테고리/태그/엔진/평점) | STR-v2-04 | 5일 |
| STR-v2-07 | 사용자 프로필 페이지 (내 앱, 다운로드 수) | USR-02, STR-v2-04 | 3일 |
| STR-v2-08 | 앱 버전 관리 (semver + 호환성 + 자동 업데이트 정책) | STR-v2-02 | 5일 |

### Epic D: 모더레이션 (MOD)

| ID | 작업 | 의존성 | 예상 |
|----|------|--------|------|
| MOD-01 | 정적 분석 (eval 금지/의존성 화이트리스트) — 서버 측 | SRV-01 | 2주 |
| MOD-02 | 수동 모더레이션 UI (관리자 승인 대기 큐) | STR-v2-01 | 1주 |
| MOD-03 | 신고 기능 + 자동 격리 | STR-v2-04 | 3일 |
| MOD-04 | DMCA / 콘텐츠 정책 페이지 | — | 1일 |
| MOD-05 | 자동 콘텐츠 분류 (성인/마이너/카테고리) — DSA 요구 | MOD-01 | 1주 |
| MOD-06 | 신뢰 개발자 시스템 (자동 승인) | MOD-02 | 3일 |

### Epic E: 보안 강화 (SBX-v2)

| ID | 작업 | 의존성 | 예상 |
|----|------|--------|------|
| SBX-v2-00 | APP-01 v2 — 매니페스트 schema 진화 (capabilities + host-app 권한 모델) | ADR-Permission | 1주 |
| SBX-v2-01 | IPC-02 — Comlink 라이브러리 직접 통합 + esbuild + 인터페이스 회귀 테스트 | ADR-IPC | 1.5주 |
| SBX-v2-02 | N-08 강화 — POC rate-limiter 검토 + 정식 대응 | — | 2일 |
| SBX-v2-03 | CSP nonce 도입 (TECH-03 reshape) + 게임 엔진 매트릭스 재검증 | SRV-01 | 1주 |
| SBX-v2-04 | iframe sandbox 우회 CVE 모니터링 자동화 | — | 2일 |
| SBX-v2-05 | 권한 grant UI + 영속화 + 호스트 측 enforcement | SBX-v2-00 | 2주 |
| SBX-v2-06 | 서버 측 ZIP 재스캔 (clamd / VirusTotal API) | SRV-01 | 1주 |
| SBX-v2-07 | iframe sandbox + Permissions-Policy v2 명시적 grant | SBX-v2-05 | 3일 |

### Epic F: 인프라 (SRV)

| ID | 작업 | 의존성 | 예상 |
|----|------|--------|------|
| **SRV-00** | **ARCH-01 reshape — src/ → apps/web/ + packages 추출 + pnpm + Turborepo (ADR-0016)** | **없음 (M5 진입 전 선행)** | **1~2일** |
| SRV-01 | 호스팅 결정 (Vercel vs Cloudflare Pages) | ADR-Hosting | 1주 (검토) |
| SRV-02 | CI/CD (lint/test/build/deploy) | SRV-01 | 3일 |
| SRV-03 | 에러 추적 (Sentry 또는 self-hosted) | SRV-01 | 2일 |
| SRV-04 | 로깅 + 알림 (Edge Function 비용 모니터링) | SRV-01 | 2일 |
| SRV-05 | 환경 변수 + 시크릿 관리 정책 | SRV-01 | 2일 |
| SRV-06 | 백업 + 재해 복구 (DB + Storage 일일 백업) | CLD-01, STR-v2-01 | 3일 |

### Epic G: 데이터 마이그레이션 (MIG) [신규]

| ID | 작업 | 의존성 | 예상 |
|----|------|--------|------|
| MIG-01 | v1 IDB → 사용자 계정 첫 로그인 시 1회 업로드 | USR-01, CLD-02 | 1주 |
| MIG-02 | 충돌 정책 (병합/덮어쓰기/스킵) + UI | MIG-01 | 3일 |
| MIG-03 | 시뮬레이션 + 롤백 가능 (v1 IDB 백업 90일 유지) | MIG-01 | 3일 |

### Epic H: 관찰 가능성 (OBS) [신규]

| ID | 작업 | 의존성 | 예상 |
|----|------|--------|------|
| OBS-01 | 클라이언트 에러 추적 (REFAC-01 C-1 Error Boundary + H-5 통합) | SRV-03 | 3일 |
| OBS-02 | 사용자 행동 분석 (앱 설치/실행, 엔진 사용) | SRV-01 | 3일 |
| OBS-03 | 서버 audit log (모더레이션, 권한 grant 등) | SRV-01 | 3일 |

### Epic I: 백엔드 보안 (API-SEC) [신규]

| ID | 작업 | 의존성 | 예상 |
|----|------|--------|------|
| API-SEC-01 | CSRF 보호 (Next.js Server Action + API route) | SRV-01, USR-01 | 3일 |
| API-SEC-02 | 서버 측 rate limiting (N-08 클라이언트와 별개) | SRV-01 | 2일 |
| API-SEC-03 | SSRF 방어 (사용자 URL fetch 차단/검증) | STR-v2-03 | 2일 |
| API-SEC-04 | 호스트 UI 렌더 사용자 콘텐츠 sanitize (description/screenshots 등) | STR-v2-04 | 2일 |

---

## §5. 결정 필요 사항 (ADR Candidates) — 12건

| ADR 후보 | 영향 | 우선순위 | 진행 |
|---------|------|---------|------|
| **ADR-Auth** — 인증 공급자 (Clerk vs Supabase Auth vs Auth.js) | USR-01, JWT 클레임, 비용 | **High (1차 병렬)** | ✅ ADR-0013 (Supabase Auth) |
| **ADR-DB** — Postgres 호스팅 (Supabase vs Neon vs 자체) + RLS 전략 | STR-v2-01, 비용 | **High (1차 병렬)** | ✅ ADR-0014 (Supabase) |
| **ADR-Sync** — 동기화 전략 (CRDT Yjs/Automerge vs LWW + 충돌 표시) | CLD-03, UX 복잡도 | **High (1차 병렬)** | ✅ ADR-0015 (LWW + 서버 권위 시계) |
| **ADR-Storage** — 객체 스토리지 (R2 vs Supabase Storage vs S3) | CLD-01, 비용/지역 | **High (2차)** | ⏳ |
| **ADR-Hosting** — 호스팅 (Vercel vs Cloudflare Pages) | SRV-01, 빌드 제약 | **High (2차)** | ⏳ |
| **ADR-Permission** — 권한 모델 (capabilities + grant 영속화) | SBX-v2-00, APP-01 v2 schema | **High (2차)** | ⏳ |
| **ADR-API-Auth** — API 인증 흐름 (Server Action vs Route Handler + JWT cookie vs header) | CSRF/XSS 모델, API-SEC-01 | **High (2차)** | ⏳ |
| **ADR-Migration** — 데이터 마이그레이션 전략 (v1 IDB → 서버, 백업 정책) | MIG Epic 전제 | **High (2차)** | ⏳ |
| **ADR-Moderation** — 모더레이션 모델 (사전/사후/신뢰 등급) | MOD Epic 전체 | **High (2차)** | ⏳ |
| **ADR-PROD-05-v2** — 사용자 ZIP 모델 v2 (단일 HTML → 다중 파일 + presigned URL) | STR-v2-03 + AppFrame.tsx | **High (BREAKING)** | ⏳ |
| **ADR-Monorepo** — packages/ 분리 구조 (v2 진입 전 일괄) | ARCH-01 reshape | **High (즉시)** | ✅ ADR-0016 (pnpm + Turborepo) |
| **ADR-Cache** — 객체 스토리지 → 클라이언트 IDB 캐시 + invalidation | 비용/성능 | Medium | ⏳ |

**1차 병렬 작성** (사용자 결정): ADR-Auth + ADR-DB + ADR-Sync 동시 진행

---

## §6. POC v1 → v2 마이그레이션 (10건)

| 정책 ID | 현재 (POC) | v2 reshape | 영향 |
|---------|-----------|-----------|------|
| **ARCH-01** | 단일 Next.js | **packages/ 분리 (v2 진입 전 일괄)** | 빌드/CI 변경, 큰 PR |
| **ARCH-02** | iframe + 자체 RPC | Comlink 라이브러리 (IPC-02 / SBX-v2-01) | runtime-iife.ts 교체, esbuild |
| **TECH-01** | IDB + 메모리 폴백 + OPFS | + cloud-adapter (CLD-02) | adapter 1개 추가 |
| **TECH-03** | 정적 CSP/PP 헤더 | nonce 기반 동적 CSP (SBX-v2-03) | next.config.ts 재구성 + 게임 엔진 매트릭스 재검증 |
| **TECH-05** | Context + useReducer | (검토) Zustand 도입 시점 | 윈도우 20+ 또는 persist 요구 시 |
| **PROD-01** | 단일 사용자 | **멀티유저** (USR Epic) | 전체 reshape |
| **PROD-02** | 하드코딩 desktopApps.ts | API 기반 동적 (STR-v2-02) | 인터페이스 보존 검증 필요 |
| **PROD-05** | 단일 HTML inline + IDB | **서버 보관 + 모더레이션 + 다중 파일** (PROD-05 v2 reshape) | AppFrame.tsx srcdoc 전면 변경, BREAKING |
| **security.md ZIP 수신** | 클라이언트 6단계 | **서버 측 동등 이상 복제** (SBX-v2-06) | 새로운 server-side 검증 |
| **ADR-0010 N-08** | 클라이언트 rate-limiter | + 서버 측 rate limit (API-SEC-02) | 클라/서버 양쪽 |

### 마이그레이션 원칙
- **인터페이스 보존**: useInstalledApps, useUserApps 등 hook 시그니처 무변경. 내부만 cloud-aware로 교체.
- **점진적**: cloud-adapter는 IDB 위 sync layer로 동작. POC v1 코드 그대로 동작 가능.
- **롤백 가능**: feature flag 또는 ENV로 v1/v2 토글.
- **회귀 테스트**: PROD-02/PROD-05 reshape 시 hook 시그니처 보존 자동 검증 추가.

---

## §7. 마일스톤 (재배치)

| 마일스톤 | 목표 Epic + 작업 | 예상 |
|---------|-----------------|------|
| **M5** | SRV-01~02 + USR-01~04 (인프라 + 인증) + **ARCH-01 모노레포 분리** | 3주 |
| **M6** | STR-v2-01~02 + CLD-01~02 + SBX-v2-00 (DB + 스토리지 어댑터 + 매니페스트 v2) | 4주 |
| **M7** | CLD-03~09 + STR-v2-03~05 (동기화 + 스토어 백엔드) | 5주 |
| **M8** | MOD-01~04 + SBX-v2-01~07 + API-SEC-01~04 (모더레이션 + 보안 + 백엔드 보안) | 4주 |
| **M9** | USR-05~06 + MIG-01~03 + STR-v2-06~08 + MOD-05~06 (나머지 마무리) | 3주 |
| **M10** | SRV-03~06 + OBS-01~03 + 페네스트 + 베타 출시 | 2주 |

**총 21주** (5.25개월) — architect 추정 18~22주 범위 내.

ADR 결정 기간(2~3주)은 별도. M5 진입 전 ADR 3건 병렬 완료 필요.

---

## §8. 리스크 (확장)

| 리스크 | 영향 | 대응 |
|--------|------|------|
| **인증 공급자 비용 폭증** | $$ | 무료 tier 한도 + Auth.js 자체 호스팅 대안 |
| **CRDT 학습 곡선** | 일정 | LWW로 출발 → 충돌 빈도 측정 → CRDT 도입 판단 |
| **사용자 업로드 악성 코드** | 보안 | 정적 분석 + sandbox + 수동 모더레이션 + 서버 재스캔 |
| **스토리지 비용** | $$ | 사용자별 quota (CLD-09) + 사용 통계 모니터링 |
| **벤더 lock-in (Supabase)** | 마이그레이션 | OSS 호환 API 선택 (PG + S3 호환) |
| **CSP nonce 부작용** | 호환성 | Phase별 적용 + 게임 엔진 매트릭스 재검증 (SBX-v2-03) |
| **법적 이슈 (DMCA, DSA)** | 법무 | MOD-04 + MOD-05 정책 + takedown 절차 |
| **CSRF/XSS** [신규] | 보안 | API-SEC-01 + API-SEC-04 sanitize |
| **SSRF** [신규] | 보안 | API-SEC-03 + presigned URL 직접 업로드 모델 |
| **공급망 공격** [신규] | 보안 | dependabot + lockfile policy (SRV-02 통합) |
| **계정 탈취 (JWT leak)** [신규] | 보안 | cookie httpOnly + SameSite=Strict (ADR-API-Auth 결정) |
| **악성 모더레이터** [신규] | 운영 | OBS-03 audit log + 권한 격리 |
| **DoS via 업로드** [신규] | 가용성 | API-SEC-02 서버 rate limit |
| **데이터 마이그레이션 실패** [신규] | 사용자 손실 | MIG-03 90일 백업 + 롤백 |
| **모더레이션 우회** [신규] | 보안 | MOD-01 정적 분석 + SBX-v2-06 서버 재스캔 + MOD-06 신뢰 등급 |

---

## §9. 검증 기준 (v2 종료 게이트)

### 기능 검증
1. 회원가입 → 로그인 → 데스크탑 사용자 계정 연동
2. 다른 브라우저/디바이스 로그인 → 동일 데스크탑 상태 복원 (동기화)
3. 사용자 A가 ZIP 업로드 → 모더레이션 큐 → 승인 → 공개 카탈로그 노출
4. 사용자 B 검색 → 설치 → 본인 데스크탑 실행
5. 사용자 A의 데스크탑 ↔ 사용자 B의 데스크탑 독립 (RLS 격리 검증)
6. POC v1 사용자가 v2로 마이그레이션 → 기존 설치 앱/설정 보존 (MIG-01~03)
7. 오프라인 → 액션 큐 → 재연결 시 sync (CLD-06)
8. 계정 삭제 → 데이터 export + 서버 데이터 완전 제거 (USR-05, GDPR)

### 보안 검증
1. **OWASP ASVS L1** 체크리스트 통과
2. **OWASP Top 10 2025** A01~A10 항목별 대응 명시
3. **iframe sandbox 페네스트 14항목** + v2 신규 항목 ALL PASS
4. **RLS 우회 자동 페네스트** (50+ 시도) — Supabase 채택 시
5. **모더레이션 우회 자동 페네스트** (악성 정적 패턴 50+) — MOD-01 검증
6. **CSRF/SSRF/XSS 자동 페네스트** — API-SEC 검증
7. **공급망 점검** — dependabot 임계치 0 critical

---

## §10. 다음 단계

### 완료 (2026-05-26)
1. ✅ **ADR 3건 병렬 작성**: ADR-0013(Auth) + ADR-0014(DB) + ADR-0015(Sync)
   - 결정: Supabase Auth + Supabase Postgres + LWW
   - policy-registry: TECH-07/08/09 + CONST-01/02 등재
2. ✅ **ADR-Monorepo 작성**: ADR-0016 (pnpm 11 + Turborepo 2.7)
   - 구조: apps/web + packages/{core,storage,ipc}
   - policy-registry: ARCH-01 reshape + TECH-10 등재
   - 신규 작업 SRV-00 추가 (M5 진입 전 선행)
3. ✅ **PRD §3 v2 ID 일괄 등재**: 53건 (USR/CLD/STR-v2/MOD/SBX-v2/SRV/MIG/OBS/API-SEC)

### 다음 단계
4. **SRV-00 실행**: src/ → apps/web/ 이동 + packages 추출 (1~2일, ADR-0016 마이그레이션)
5. **ADR 2차 7건 작성**: Storage/Hosting/Permission/API-Auth/Migration/Moderation/PROD-05-v2
6. **M5 진입**: SRV-01~02 + USR-01~04 (인프라 + 인증)

### ADR 1차 완료 후
4. **ADR 2차 작성**: ADR-Storage + ADR-Hosting + ADR-Permission + ADR-API-Auth + ADR-Migration + ADR-Moderation + ADR-PROD-05-v2 (7건)
5. **Epic A plan 분해**: USR Epic 별도 plan 문서 (`04-planning/04-epic-a-auth-plan.md`)

### M5 진입 전
6. **ARCH-01 모노레포 분리 실행**
7. **회귀 테스트 infra**: hook 시그니처 보존 자동 검증 (인터페이스 보존 원칙)
8. **테스트 카테고리 확장**: RLS / CSRF / 모더레이션 우회 (TEST-v2)

---

## §11. 가정 (검증 필요)

| 가정 | 검증 방법 |
|------|----------|
| Clerk + Supabase RLS 통합 복잡도 낮음 | research-analyst (ADR-Auth 작성 시) |
| Cloudflare R2 egress 무료가 게임 ZIP 대량 다운로드 부하에 충분 | research-analyst (ADR-Storage 작성 시) |
| OPFS Worker + SyncAccessHandle이 cloud-adapter와 충돌 없음 | spike 1주 권장 |
| Comlink v4.4.2+가 host.ts 인터페이스 보존 가능 | research-analyst (ADR-IPC 작성 시) |
| 사용자별 10MB 스토리지 한도가 평균 게임 크기에 충분 | 시뮬레이션 (CLD-09 작업 시) |
| Vercel Next.js 16 Server Action 인증 흐름 안정 | research-analyst (ADR-API-Auth) |

---

## §12. Change Log

### 0.2.0 (2026-05-26) — architect 검토 + 사용자 결정 반영
- **신규 3 Epic**: G(데이터 마이그레이션) + H(관찰 가능성) + I(백엔드 보안)
- **신규 작업 13건**: USR-05/06, CLD-07/08/09, STR-v2-06/07/08, MOD-05/06, SBX-v2-00/06/07
- **순환 의존성 해소**: MOD-01 ↔ STR-v2-03 → MOD-01 의존성 = SRV-01만
- **ADR 후보 7건 → 12건** (Migration/Permission/API-Auth/PROD-05-v2/Moderation/Cache 추가)
- **POC reshape 8건 → 10건** (PROD-05 v2 + N-08 서버측)
- **마일스톤 재배치**: M5~M10 (5주 → 6 마일스톤), 총 21주
- **리스크 7건 → 15건** (CSRF/SSRF/XSS/공급망/계정탈취/악성모더레이터/DoS/마이그레이션실패)
- **검증 기준 구체화**: OWASP ASVS L1 + Top 10 2025 매핑 + RLS/모더레이션 자동 페네스트
- **사용자 확정**: Epic G 도입, ADR 3건 병렬, 18~22주 수용, 모노레포 v2 진입 전 일괄

### 0.1.0 (2026-05-26)
- 초기 v2 plan 작성 (6 Epic + 33 작업 + 7 ADR 후보)
