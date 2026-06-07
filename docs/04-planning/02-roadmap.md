# Roadmap

> **Living Document**. 항목 완료 시 즉시 갱신. PRD와 동시 갱신.

**Version**: 0.10.0
**Last Updated**: 2026-05-27

> 🔵 **진행 중 WU claim**: [`_derived-wu-state.md`](_derived-wu-state.md) — 자동 생성(누가 어느 작업 점유 중). `/zm-wu-start`·`/zm-wu-stop` 시 갱신.

---

## §1. 대시보드

| Phase | 상태 | 진행률 | 목표 종료 |
|-------|------|--------|----------|
| **Phase 0** — 초기 셋팅 | ✅ 완료 | 100% | 2026-05-24 |
| **Phase 1** — 코어 샌드박싱 + 윈도우 매니저 | ✅ 완료 | 100% (작업 7/7) | 2026-05-24 |
| **Phase 2** — 앱 스토어 + 첫 게임 시연 | ✅ 완료 | 100% (작업 4/4) | 2026-05-24 |
| **Phase 3** — POC 안정화 + 데모 영상 | ✅ 완료 | 100% (작업 4/4) | 2026-05-25 |

POC 종료 후: **v2 plan v0.3.0** (2026-05-27, ADR-0017~0023 채택 반영) → [`03-v2-plan.md`](03-v2-plan.md). **10 Epic + 58 작업** (기존 53 + REFAC-02 5 작업) + **24주 추정** (REFAC-02 3주 + M5~M10 21주). **현재 상태**: ADR-0017~0023 일괄 채택 ✅ (Ports & Adapters + Local 어댑터 6건). **다음**: REFAC-02 P1 진입 (`packages/adapters-local` 신규 + namespace-registry adapterPolicies reshape).

---

## §2. Phase 0 — 초기 셋팅

| Group | 작업 | 상태 |
|-------|------|------|
| A | Next.js 16 골격 | ✅ |
| B | `.claude/` 셋팅 | ✅ |
| C | `docs/` 골격 | 🔄 |
| D | CLAUDE.md + README.md | ⏳ |
| E | 검증 + 첫 커밋 | ⏳ |

---

## §3. Phase 1 — 코어 샌드박싱 + 윈도우 매니저

> 코드의 가장 어려운 부분 먼저. 보안과 격리가 동작하지 않으면 나머지 무의미.

| 작업 | 의존성 | 상태 | 비고 |
|------|--------|------|------|
| 앱 매니페스트 Zod 스키마 (APP-01) | — | ✅ | `src/lib/apps/manifest.ts` |
| blob: iframe SDK (SBX-01) | APP-01 | ✅ | `src/lib/apps/sandbox.ts` |
| Comlink IPC 어댑터 (IPC-01) | SBX-01 | ✅ | `src/lib/apps/ipc/` (wire-compatible v1) |
| CSP/Permissions-Policy 헤더 (SBX-02) | — | ✅ | next.config.ts + src/lib/security/csp.ts |
| 윈도우 매니저 (DSK-01) | ADR-0002 | ✅ | react-rnd v10.5.3 (ADR-0002 확정) + Context+useReducer (ADR-0005) |
| 데스크탑 영역 (DSK-02) | DSK-01 | ✅ | `src/components/desktop/Desktop.tsx + DesktopIcon.tsx + desktopApps.ts + ADR-0006` |
| 작업표시줄 (DSK-03) | DSK-01 | ✅ | `src/components/desktop/Taskbar.tsx + TaskbarButton.tsx + Clock.tsx` |
| `app-sandbox-auditor` agent 1회 감사 | 위 전부 | ✅ | 감사 리포트: security/phase-1-audit-2026-05-24.md |

---

## §4. Phase 2 — 앱 스토어 + 첫 게임

| 작업 | 의존성 | 상태 | 비고 |
|------|--------|------|------|
| ✅ 앱 카탈로그 UI + 설치 (STR-01/02) | — | ✅ 완료 | 스토어 라우트 + InstalledAppsProvider + 데스크탑 동기화 |
| ✅ 첫 샘플 게임 (GAME-01) | STR-02 | ✅ 완료 | Phaser 3 Snake (host self origin, IPC 미사용) |
| ✅ IndexedDB 추상화 (STG-01) | — | ✅ 완료 | `src/lib/storage/indexeddb.ts` (idb v8.0.3 + 메모리 폴백) |
| ✅ 설치한 앱 목록 영속화 (APP-03) | STG-01 | ✅ 완료 | IndexedDB hydration + fire-and-forget persist (InstalledAppsProvider, lib/storage/installed-apps.ts) |
| OPFS 어댑터 (STG-02) | — | ✅ 완료 | StorageAdapter Strategy 패턴 + ADR-0009 |
| 앱 패키지 포맷 (APP-02) | — | ✅ 완료 | JSZip 3.10.1 + 보안 검증 (Phase 3 작업 1) |

---

## §5. Phase 3 — POC 안정화

| 작업 | 설명 | 상태 |
|------|------|------|
| ✅ 사용자 ZIP 앱 업로드 (APP-02) | JSZip 3.10.1 + 보안 검증 6단계 (magic byte → 파싱 → path traversal → 압축비 → 필수 파일 → 매니페스트) + UserAppsProvider + IDB STORE_USER_APPS | ✅ 완료 |
| ✅ 안정화 (A1+A2) | 빌드/번들 사이즈 측정 (static 1.4MB, gzip ~400-500KB) + iframe 셀프 페네스트 자동화 (Playwright, 14 항목 ALL PASS) | ✅ 완료 |
| B. 게임 엔진 호환성 매트릭스 | Pixi.js 8.18.1 + Three.js r184 샘플 + 3개 엔진 ALL PASS (Godot v2) | ✅ 완료 |
| C. 데모 영상 1편 | Playwright 비디오 녹화 7 Scene (스토어→ZIP→Snake→Pixi+Three→사용자앱→피날레) | ✅ 완료 |

---

## §6. 마일스톤

- **M1**: Group E 완료 + 첫 커밋
- **M2**: iframe SDK + 첫 게임이 데스크탑에서 실행됨
- **M3**: 스토어에서 설치 → 데스크탑에서 실행 end-to-end
- **M4**: 데모 영상 + POC 종료

---

## §7. 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| iframe sandbox 우회 CVE 발견 | 보안 | 새 CVE 정기 확인, `security.md` 갱신 |
| COEP/COOP 헤더 충돌 (SharedArrayBuffer 게임) | 게임 호환성 | 헤더 조건부 적용, 게임별 매트릭스 |
| Safari OPFS 미지원 | 호환성 | IndexedDB 폴백 (TECH-01) |
| 게임 무한 루프 → 탭 hang | UX | iframe별 soft timeout (security.md) |

---

## §8. Change Log

### 0.10.0 (2026-05-27) — v2 설계 단계 완료 (ADR-0017~0023 + v2 plan v0.3.0)
- **ADR-0017 채택 ✅**: Ports & Adapters 아키텍처 + 5개 Port (AuthProvider / AppRepository / BlobStorage / SyncProvider / ModerationProvider) + 단일 PortError + `@zm/core/ports` SSOT + `@zm/adapters-local` 신규 패키지 + 하이브리드 어댑터 선택. ADR-0013/0014/0015 superseded 처리.
- **ADR-0018~0023 일괄 채택 ✅**: Local 어댑터 6건 (LocalAuth / LocalRepo IDB / LocalOPFS BlobStorage / LocalNoOpSync / LocalStaticModeration / Adapter Resolver). architect 2회 병렬 호출 + 사용자 결정 26건 일괄 채택.
- **policy-registry**: ARCH-03 신규 (Ports & Adapters) + Local 어댑터 6 ADR 참조 추가. ARCH-01 reshape (adapters-local 추가). TECH-07/08/09 Deprecated 섹션 이동.
- **v2 plan v0.3.0**: 10 Epic (REFAC-02 신규 J Epic + 9 기존) + 58 작업 (53 + 5) + 24주 추정 (REFAC-02 3주 + M5~M10 21주). 각 작업에 LocalAdapter 필수 / CloudAdapter 옵션 표기.
- **Local-only v2.0 출시 옵션**: REFAC-02 + M5 완료 시점에 Local-only 출시 가능, M6 이후 Cloud 단계적.

### 0.9.0 (2026-05-27) — Post-POC + v2 진입 전환
- **REFAC-01 8/8 ✅ 전체 완료** (C-1 Error Boundary + H-5 에러 플러밍 + C-3 NS Registry + H-1 Manifest v2 + H-4 Persistence Hook + H-2 Validation Chain + H-3 ContentLoader + C-2 Desktop 분리)
- **APP-04 확장 완료**: 데스크탑 아이콘 우클릭 컨텍스트 메뉴 + AppInfoDialog
- **SRV-00 모노레포 마이그레이션 ✅ 완료** (2026-05-26): src/ → apps/web + packages/{core,storage,ipc} + pnpm 11 + Turborepo 2.7. 검증: turbo type-check 4/4 + vitest 61/61 + next build PASS
- **v2 ADR 1차 3건 작성**: ADR-0013(Auth: Supabase) + ADR-0014(DB: Supabase) + ADR-0015(Sync: LWW) + ADR-0016(Monorepo)
- **방향 전환 (2026-05-26)**: 사용자 결정 "로컬 100% + 외부 의존성 0 + 클라우드는 어댑터 옵션"
  - ADR-0013/0014/0015 헤더 `status: accepted (will be superseded by ADR-0017+)`
  - v2 plan v0.2.1로 reshape 표기, v0.3.0 재작성 대기
  - 다음: ADR-0017 (Ports & Adapters + 5 Port) + ADR-0018~0023 (LocalAdapter 6건)
- **v2 작업 수 재집계**: 46 → **53건** (PRD §3 등재 기준)
- **PRD §3 v2 ID 53건 등재** (USR/CLD/STR-v2/MOD/SBX-v2/SRV/MIG/OBS/API-SEC)
- **문서 정밀 감사 2026-05-27**: BLOCK 3 + WARN 8 + INFO 3 식별 → 9건 일괄 수정 (코드 변경 0)

### 0.8.0 (2026-05-25) — POC 1차 완료 (M4 마일스톤)
- **Phase 3 전체 완료** ✅ (4/4, 100%) — M4 마일스톤 달성, POC 공식 종료
- Phase 3-B ✅: 게임 엔진 호환성 매트릭스 — Pixi.js 8.18.1 + Three.js r184 ALL PASS
  - 2개 built-in 샘플 앱 추가 (Particle Rain + Spinning Cubes)
  - `docs/07-testing/01-engine-compatibility-matrix.md` 호환성 매트릭스 문서
  - e2e-engine-compat.mjs Playwright 자동 검증
- Phase 3-C ✅: 데모 영상 — Playwright 비디오 녹화 7 Scene
  - e2e-demo-video.mjs (스토어 설치 → ZIP 업로드 → Snake → Pixi+Three → 사용자 앱 → 피날레)
- 문서 체계 고도화: sonix_docs 패턴 도입
  - zm-claude-docs/ → docs/ 번호 기반 카테고리 마이그레이션
  - 규칙 4→10개, 훅 4→10개, 스킬 5→9개
  - events/ 이벤트 스트림 + 정책 다이제스트 + TS 인덱스 신규
- 문서 정밀 검토: 11건 이슈 수정 (broken link, FIFO 정리, 버전 동기화)

### 0.7.0 (2026-05-25) — Phase 3 작업 2 완료 (안정화)
- Phase 3 작업 2 완료 ✅ (안정화: 번들 측정 + iframe 우회 시도 셀프 페네스트)
  - 번들 측정: `npm run build` (Turbopack) → static chunks ~1.4MB (raw), gzip 추정 ~400-500KB (LCP target 내)
  - iframe 셀프 페네스트: Playwright e2e 자동화 (14 항목 모두 PASS)
    - PT-a/b/c/d/e/g/h (iframe sandbox 격리 검증)
    - ZP-C7 (ZIP bomb 1028x → 거부 확인)
    - ZP-C8 (HTML 6MB → 거부 확인)
    - CSP-1 (response 헤더 검증)
  - 코드 변경 0건 (architect 목표)
  - 신규 위협: N-08 (postMessage DoS, POC 수용, v2 후보)
- **Phase 3 진행률: 2/4 (50%)** — 다음: 게임 엔진 호환성 (B) 또는 데모 영상 (C)

### 0.6.0 (2026-05-24) — Phase 3 작업 1 완료
- Phase 3 작업 1 완료 ✅ (APP-02: 사용자 ZIP 앱 업로드)
  - JSZip 3.10.1 + 보안 검증 6단계 (magic byte → JSZip.loadAsync → path traversal → 압축비 → 필수 파일 → manifest Zod)
  - UserAppsProvider + AppUploadButton (drag-drop + 파일 입력)
  - IndexedDB DB_VERSION 2 + STORE_USER_APPS (UserAppRecord = id/manifest/htmlContent/installedAt/sourceZipSize/htmlSize)
  - buildCatalog(builtInApps, userApps) 통합 (source: 'built-in' | 'user')
  - AppFrame.tsx + Desktop.tsx source 분기 (built-in srcdoc vs user HTML)
  - 자동 채택 결정 10개 (P1~P10)
  - 신규 ADR-0008 + PROD-05 정책
  - 검증: build-checker ✅ / code-reviewer ✅ / sandbox-auditor ✅ / constraint-checker ✅ / self-verifier ✅ PASS
  - 신규 위협 N-05/06/07 등록 (CVE-2022-48285, HTML 크기, ZIP bomb)
  - 사용자 검증 deferred: e2e Playwright (ZIP 업로드 → 설치 → 실행)
- **Phase 3 진행률: 1/4 (25%)** — 다음 후보: 안정화 (A1/A2) 또는 게임 엔진 (B)

### 0.5.0 (2026-05-24) — Phase 2 ✅ 완료

### 0.3.0 (2026-05-24) — Phase 2 작업 4 완료
- Phase 2 작업 4 완료 ✅ (GAME-01: Phaser 3 Snake)
  - `public/sample-game-phaser/index.html` (~366 LOC) + `public/phaser.min.js` (v3.90.0, ~1.2MB)
  - `src/components/desktop/desktopApps.ts` (snake-game 엔트리 추가) + `package.json` (phaser@^3.90.0)
  - 자동 채택 결정: P1=A / P2=Host self origin / P3=A / P4=A / P5=auto
  - 검증 4명 + self-verifier ✅ PASS
  - POC v1 카탈로그: 3개 엔트리 (Bouncing Ball + IPC Demo + Snake)
- **Phase 2 진행률: 2/4 (50%)**
- 다음: 작업 2 (STG-01) 또는 작업 3 (APP-03) 진입 가능

### 0.2.0 (2026-05-24) — Phase 2 진입 / 작업 1 완료
- Phase 2 작업 1 완료 ✅ (STR-01/02: 스토어 UI + 설치 흐름)
  - `/store` 라우트 + AppCard + AppDetail + InstalledAppsProvider
  - 데스크탑 필터링 (설치된 앱만) + 스토어 시스템 아이콘 우상단
  - DesktopAppEntry STR 메타데이터 확장
  - C-01 fix: 스토어 아이콘 좌표 충돌 해소
- **Phase 2 진행률: 1/4 (25%)**
- 다음: 작업 2 (STG-01) 또는 작업 4 (GAME-01) 진입 가능

### 0.1.6 (2026-05-24)
- Phase 1 작업 7 완료 (보안 감사) ✅ PASS
- app-sandbox-auditor 1회 전체 감사 (8 항목 매트릭스 + ADR 정합 + CVE 매핑)
- 즉시 fix 2건 적용: H-1 (runtime-iife DANGEROUS_KEYS 객체 결함) + SANDBOX_ORIGIN 상수 일관성
- 감사 리포트 보관: docs/05-security/phase-1-audit-2026-05-24.md
- **Phase 1 7/7 (100%) 완료** — Phase 2 진입 가능

### 0.1.5 (2026-05-24)
- Phase 1 작업 5+6 통합 완료
- DSK-02 (데스크탑 영역 + 아이콘) ✅
- DSK-03 (작업표시줄 + 시계) ✅
- AppFrame + desktopApps (ADR-0006)
- 메인 페이지 / 가상 데스크탑 전환

### 0.1.4 (2026-05-24)
- Phase 1 작업 4 완료
- DSK-01 (윈도우 매니저 — react-rnd 기반) ✅
- Context+useReducer 상태 관리 (ADR-0005)
- sandbox-test 페이지 두 Window 통합

### 0.1.3 (2026-05-24)
- Phase 1 작업 3 완료
- SBX-02 (CSP / Permissions-Policy 헤더) ✅
- ADR-0002 확정 (윈도우 매니저 = react-rnd)
- ADR-0004 작성 (CSP/Permissions-Policy 정책)

### 0.1.2 (2026-05-24)
- Phase 1 작업 2 완료
- IPC-01 (Comlink wire-compatible RPC 어댑터) ✅

### 0.1.1 (2026-05-24)
- Phase 0 완료, Phase 1 진입
- 작업 1 (iframe 샌드박싱 PoC) 완료

### 0.1.0 (2026-05-24)
- 초기 로드맵 작성 (Phase 0~3 정의)
