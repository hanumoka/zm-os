# Current Phase

## Phase 1 — 코어 샌드박싱 + 윈도우 매니저 (진행 중, 2026-05-24)

### 목표
신뢰할 수 없는 사용자 제출 앱(게임)을 격리해서 안전하게 실행하는 인프라를 코드로 구현. 그 위에 윈도우 매니저로 데스크탑 UX를 얹는다.

### 작업 단위

| # | 작업 | 산출물 | 상태 |
|---|------|--------|------|
| 1 | iframe 샌드박싱 PoC | manifest.ts + sandbox.ts + sample-game + sandbox-test 페이지 | ✅ 완료 |
| 2 | Comlink IPC 어댑터 | src/lib/apps/ipc/ | ✅ 완료 |
| 2.5 | TS-002 fix (host.ts:279 권한 게이트 결함) | host.ts | ✅ 완료 |
| 3 | CSP / Permissions-Policy 헤더 (SBX-02) | next.config.ts | ⏳ 진행 예정 |
| 4 | 윈도우 매니저 (DSK-01) | src/components/desktop/WindowManager.tsx | ⏳ 대기 (라이브러리 ADR-0002 필요) |
| 5 | 데스크탑 영역 (DSK-02) | src/components/desktop/Desktop.tsx | ⏳ 대기 |
| 6 | 작업표시줄 (DSK-03) | src/components/desktop/Taskbar.tsx | ⏳ 대기 |
| 7 | `app-sandbox-auditor` agent 1회 감사 | 리포트 | ⏳ 대기 |

### 최근 변경 (2026-05-24)
- **17:30**: Phase 0 완료 — 첫 커밋 `efed152 chore(setup)`, push 완료 (origin/main)
- **19:00**: Phase 1 작업 1 완료 — iframe 샌드박싱 PoC (커밋 `127edcb feat(sandbox)`)
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
  - `zm-claude-docs/decisions/adr-0003-ipc-surface.md` (신규)
  - `zm-claude-docs/decisions/index.md` (수정, ADR-0003 등재)
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
