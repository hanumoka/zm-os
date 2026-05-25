# Current Phase

## 🚀 POC 완료 → Post-POC 작업 진행 중
- **Phase 1**: ✅ 완료 (7/7, 100%)
- **Phase 2**: ✅ 완료 (4/4, 100%)
- **Phase 3**: ✅ 완료 (4/4, 100%) — M4 마일스톤 달성
- **Post-POC**: APP-04 ✅ + TEST-01 ✅ + DSK-05 ✅ (배경화면/테마/설정 UI)

### 작업 1 — APP-02 사용자 ZIP 업로드 (✅ 완료)
- **산출물**: 신규 4파일 + 수정 7파일 (총 11개 산출)
- **핵심 기능**: JSZip 3.10.1 기반 ZIP 파싱 + 보안 검증 6단계 (magic byte → 파싱 → path traversal → 압축비 → 필수 파일 → 매니페스트)
- **저장소**: IndexedDB DB_VERSION 2 + STORE_USER_APPS (UserAppRecord)
- **카탈로그 통합**: buildCatalog(builtInApps, userApps) — source: 'built-in' | 'user'
- **iframe 로드**: AppFrame.tsx source 분기 (built-in srcdoc vs user HTML inline)
- **자동 채택**: 10개 정책 결정 (P1=JSZip / P2=A / P3=α / P4~P10 임계치/저장소/상태)
- **검증**: 4명 + self-verifier ✅ PASS
- **ADR-0008 신규** + **PROD-05 신규 정책**
- **보안 위협 등록**: N-05/06/07 (CVE-2022-48285, HTML 크기, ZIP bomb)

### 작업 2 — 안정화 (✅ 완료)
- **산출물**: 신규 2파일 (e2e-pentest.mjs + phase-3-stabilization-audit-2026-05-25.md)
- **코드 변경**: 0건 (architect 목표 달성)
- **번들 측정**: `npm run build` → static chunks ~1.4MB (raw), gzip 추정 ~400-500KB (LCP 임계치 내)
- **iframe 셀프 페네스트**: Playwright 자동화 (14 항목 ALL PASS)
  - PT-a XSS: document.cookie/origin 격리 ✅
  - PT-b parent 접근: window.parent.localStorage/top.document.cookie ✅
  - PT-c 외부 fetch: evil.example 차단 ✅
  - PT-d 중첩 iframe: sandbox 토큰 상속 (격리 유지) ✅
  - PT-e eval/Function: 정상 동작 (iframe 격리라 호스트 무관) ✅
  - PT-g postMessage 폭주: 100건 전송 → DoS 방어 부재 (v2 후보) ⚠️
  - PT-h `__zmosIpc`: IPC 미주입 확인 ✅
  - ZP-C7 ZIP bomb (1028x 압축비): 거부 ✅
  - ZP-C8 HTML 6MB: 거부 ✅
  - CSP/Permissions-Policy 헤더: 확인 ✅
- **신규 위협**: N-08 (postMessage DoS, POC 수용, v2 후보)
- **검증**: 자동화 ALL PASS, 코드 검증 0건 (문서만)

## 🎯 Post-POC 완료 작업

| 작업 | 설명 | ADR | 상태 |
|------|------|-----|------|
| APP-04 | 사용자 앱 삭제/업데이트 UX (ConfirmDialog + semver) | ADR-0011 | ✅ 완료 |
| TEST-01 | Vitest 4.1.7 + 56개 단위 테스트 | — | ✅ 완료 |
| DSK-05 | 데스크탑 커스터마이징 (배경/테마/설정 UI) | ADR-0012 | ✅ 완료 |

### 다음 후보
- IPC-02: Comlink 직접 통합 (v2 준비)
- APP-04 확장: 데스크탑 우클릭 컨텍스트 메뉴에서 앱 삭제/정보

---

## ✅ Phase 1 — 코어 샌드박싱 + 윈도우 매니저 (완료, 2026-05-24)

### 목표
신뢰할 수 없는 사용자 제출 앱(게임)을 격리해서 안전하게 실행하는 인프라를 코드로 구현. 그 위에 윈도우 매니저로 데스크탑 UX를 얹는다.

### 작업 단위

| # | 작업 | 산출물 | 상태 |
|---|------|--------|------|
| 1 | iframe 샌드박싱 PoC | manifest.ts + sandbox.ts + sample-game + sandbox-test 페이지 | ✅ 완료 |
| 2 | Comlink IPC 어댑터 | src/lib/apps/ipc/ | ✅ 완료 |
| 2.5 | TS-002 fix (host.ts:279 권한 게이트 결함) | host.ts | ✅ 완료 |
| 3 | CSP / Permissions-Policy 헤더 (SBX-02) | next.config.ts | ✅ 완료 |
| 4 | 윈도우 매니저 (DSK-01) | src/components/desktop/{types, Window, useWindowManager, WindowManagerProvider, windowReducer} | ✅ 완료 |
| 5 | 데스크탑 영역 (DSK-02) | src/components/desktop/Desktop.tsx + DesktopIcon.tsx + desktopApps.ts + AppFrame.tsx | ✅ 완료 |
| 6 | 작업표시줄 (DSK-03) | src/components/desktop/Taskbar.tsx + TaskbarButton.tsx + Clock.tsx | ✅ 완료 |
| 7 | `app-sandbox-auditor` agent 1회 감사 | docs/05-security/phase-1-audit-2026-05-24.md | ✅ 완료 |

### 최근 변경 (2026-05-24)
- **[작업 4]**: Phase 2 작업 4 완료 — GAME-01 (Phaser 3 Snake) ✅ PASS
  - 산출물: 2 신규 (snake-game HTML + phaser.min.js) + 2 수정 (desktopApps.ts, package.json)
  - 자동 채택: P1=A (스네이크) / P2=Host self origin / P3=A (IPC 미사용) / P4=A (procedural) / P5=auto
  - 검증: build-checker ✅ / code-reviewer ✅ / sandbox-auditor ✅ / constraint-checker ✅ / self-verifier ✅ PASS
  - 사용자 검증 deferred: 게임 화면 표시 + 게임플레이 + iframe 격리 (2026-05-24)
  - **Phase 2 진행률: 2/4 (50%)**
  - 다음: 작업 2 (STG-01) 또는 작업 3 (APP-03)
- **20:30**: Phase 2 작업 1 완료 — STR-01/02 (스토어 UI + 설치 흐름) ✅ PASS
  - 산출물: 9 파일 (신규 5 + 수정 4)
  - DesktopAppEntry STR 메타데이터 확장 (description, longDescription, category, screenshots, author, version)
  - InstalledAppsProvider (메모리 Context, 작업 3 IndexedDB reshape)
  - `/store` 라우트 + AppCard + AppDetail + 데스크탑 동기화
  - C-01 fix: 스토어 시스템 아이콘 좌표 우상단 분리 (left → right)
  - 검증: build-checker ✅ / code-reviewer ✅ / sandbox-auditor ✅ / constraint-checker ✅ / self-verifier ✅ PASS
  - **Phase 2 진행률: 1/4 (25%)**
  - 다음: 작업 2 (STG-01) 또는 작업 4 (GAME-01) 진입 가능
- **23:00**: Phase 1 작업 7 완료 — app-sandbox-auditor 전체 감사 ✅ PASS
  - 감사 범위: 25 파일 (코드 14, ADR 6, 정책/규칙 5)
  - 매트릭스: 8 항목 (7 PASS + 1 PARTIAL)
  - 신규 위협: N-1/N-2/N-3/N-4 (Medium/Low/Low/Info)
  - 즉시 fix 2건: src/lib/apps/ipc/runtime-iife.ts:59 (DANGEROUS_KEYS 패턴) + src/lib/apps/ipc/host.ts:162 (SANDBOX_ORIGIN 일관성)
  - 산출물: docs/05-security/phase-1-audit-2026-05-24.md (신규 감사 리포트)
  - **Phase 1 7/7 (100%) 완료** — Phase 2 진입 가능
  - 다음: Phase 2 plan (앱 스토어 STR-01/02 + APP-02/03 + 첫 게임 GAME-01 시연)
- **22:30**: Phase 1 작업 5+6 통합 완료 (데스크탑 DSK-02 + 작업표시줄 DSK-03 + ADR-0006)
  - 산출물: 9 파일 (신규 6 컴포넌트 + DesktopIcon + AppFrame + desktopApps + page.tsx 전면 교체 + tsconfig 자동 정렬 + ADR-0006)
  - 검증: build-checker ✅ / code-reviewer ✅ (Critical 0, Warning 5 비-블로커) / app-sandbox-auditor ✅ (Critical 0, High 0, AppFrame lifecycle PASS, IPC expose 순수성 PASS) / constraint-checker ✅ / self-verifier ✅ PASS
  - 사용자 직접 검증 deferred (9항목): 메인 페이지 데스크탑 표시 + 아이콘 더블클릭 + 윈도우 드래그/리사이즈 + 작업표시줄 동작 + 시계 + IPC 본문 표시 + bounds="parent" 침범 여부 등
  - 다음 작업: 작업 7 (app-sandbox-auditor 전체 감사 또는 APP-03 IndexedDB)
- **22:00**: Phase 1 작업 4 완료 (윈도우 매니저 DSK-01 + ADR-0005)
  - 산출물: 10개 파일 (신규 5 + 수정 4 + ADR 1)
  - 검증: build/code-reviewer/sandbox-auditor/constraint ✅ PASS + self-verifier ✅ PASS 조건부
  - Warning 2건 메인 직접 수정 (W-01 useRef guard, W-02 'use client' 제거)
  - 사용자 검증 deferred: 6항목 (드래그/리사이즈/포커스 동작, iframe 격리, z-index, close 순서, minimize)
  - 다음 작업: 작업 5 (데스크탑 영역 DSK-02)
- **17:30**: Phase 0 완료 — 첫 커밋 `efed152 chore(setup)`, push 완료 (origin/main)
- **19:00**: Phase 1 작업 1 완료 — iframe 샌드박싱 PoC (커밋 `127edcb feat(sandbox)`)
- **21:00**: Phase 1 작업 3 완료 (CSP/Permissions-Policy 헤더, SBX-02): csp.ts + next.config.ts + ADR-0004. 4명 검증 + self-verifier ✅ PASS
- **21:15**: ADR-0002 확정 (윈도우 매니저 = react-rnd v10.5.3, MIT). 작업 4 진입 조건 충족
  - `npm install zod`
  - `src/lib/apps/manifest.ts` — Zod 매니페스트 스키마 (APP-01) ✅
  - `src/lib/apps/sandbox.ts` — iframe + sandbox="allow-scripts" + srcdoc 격리 (SBX-01) ✅
  - `public/sample-game/index.html` — Bouncing Ball + 격리 자가 진단
  - `src/app/sandbox-test/page.tsx` — `/sandbox-test` 데모 페이지
  - `npx tsc --noEmit` 통과
  - 사용자 직접 검증 권장: `npm run dev` → http://localhost:3000/sandbox-test → 메시지에서 `canTouchParentStorage/Document/Cookies` 모두 `false` 확인
- **20:00**: 에이전트 팀 10명 재구성 (사용자 요구: 설계 안정/확장성 + 추측 금지 + 재검증 의무)
  - 신규 5명: architect / research-analyst / lib-developer / constraint-checker / self-verifier
  - 보강 4명: fe-developer / code-reviewer / build-checker / doc-updater
  - 신규 문서: `.claude/agents/_workflow.md` (표준 작업 흐름)
  - 모델 전략: architect+self-verifier=opus, 구현/리뷰/감사=sonnet, 빌드/문서/제약=haiku
- **20:30**: Phase 1 작업 2 완료 — Comlink IPC 어댑터 (예정 커밋)
  - `src/lib/apps/ipc/{types,protocol,host,app,runtime-iife,index}.ts` (6 신규)
  - `src/lib/apps/sandbox.ts` (확장, IPC 옵션 추가, onMessage @deprecated)
  - `src/app/sandbox-test/page.tsx` (확장, 섹션 2 IPC 데모)
  - `public/sample-game-ipc/index.html` (신규, ping/getTime/echo)
  - `docs/02-decisions/adr-0003-ipc-surface.md` (신규)
  - `docs/02-decisions/index.md` (수정, ADR-0003 등재)
  - POC v1 = 자체 wire-compatible RPC (srcdoc inline 호환, esbuild 회피)
  - 권한 v1 = allowedMethods 화이트리스트 (manifest 매핑은 v2)
  - 검증: build-checker ✅ / code-reviewer 재리뷰 ✅ / app-sandbox-auditor 재감사 ✅ / constraint-checker ✅ / self-verifier ✅ (조건부, 사용자 검증 deferred)
  - 사용자 직접 검증 deferred: `npm run dev` → `/sandbox-test` 섹션 2 핸드셰이크 + ping/getTime/echo 6단계 확인
  - **다음 작업 시작 시 우선 처리**: `src/lib/apps/ipc/host.ts:279` `_appMethods.length > 0` 게이트 결함 (앱 announce 없을 시 우회 가능, 보안 임팩트 0이나 명세 불일치)

### 블로커
- 없음

### 다음 작업

남은 모든 작업은 **재구성된 10명 에이전트 팀** 워크플로(`.claude/agents/_workflow.md`)로 진행:

1. **작업 2 — Comlink IPC 어댑터**: architect → research-analyst(Comlink 사실) → lib-developer → 검증 4명 병렬 → self-verifier → doc-updater
2. **작업 3 — CSP/Permissions-Policy 헤더 (SBX-02)**: architect → research-analyst(CSP/Permissions-Policy 스펙) → fe-developer(next.config.ts) → 검증 → self-verifier → doc-updater
3. **ADR-0002 — 윈도우 매니저 라이브러리 선택**: architect → research-analyst(react-rnd/dnd-kit/자작 비교) → 사용자 결정 → 작업 4 진입

### 다음 진입 지점 (Phase 2 후보)
- 앱 패키지 포맷 (APP-02): itch.io식 ZIP 처리
- 설치한 앱 목록 (APP-03): IndexedDB CRUD
- 스토어 UI (STR-01, STR-02)
