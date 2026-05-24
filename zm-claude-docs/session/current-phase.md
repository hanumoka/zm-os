# Current Phase

## Phase 1 — 코어 샌드박싱 + 윈도우 매니저 (진행 중, 2026-05-24)

### 목표
신뢰할 수 없는 사용자 제출 앱(게임)을 격리해서 안전하게 실행하는 인프라를 코드로 구현. 그 위에 윈도우 매니저로 데스크탑 UX를 얹는다.

### 작업 단위

| # | 작업 | 산출물 | 상태 |
|---|------|--------|------|
| 1 | iframe 샌드박싱 PoC | manifest.ts + sandbox.ts + sample-game + sandbox-test 페이지 | ✅ 완료 |
| 2 | Comlink 기반 IPC 어댑터 | src/lib/apps/ipc/ | ⏳ 대기 |
| 3 | CSP / Permissions-Policy 헤더 (SBX-02) | next.config.ts | ⏳ 대기 |
| 4 | 윈도우 매니저 (DSK-01) | src/components/desktop/WindowManager.tsx | ⏳ 대기 (라이브러리 ADR-0002 필요) |
| 5 | 데스크탑 영역 (DSK-02) | src/components/desktop/Desktop.tsx | ⏳ 대기 |
| 6 | 작업표시줄 (DSK-03) | src/components/desktop/Taskbar.tsx | ⏳ 대기 |
| 7 | `app-sandbox-auditor` agent 1회 감사 | 리포트 | ⏳ 대기 |

### 최근 변경 (2026-05-24)
- **17:30**: Phase 0 완료 — 첫 커밋 `efed152 chore(setup)`, push 완료 (origin/main)
- **19:00**: Phase 1 작업 1 완료 — iframe 샌드박싱 PoC
  - `npm install zod`
  - `src/lib/apps/manifest.ts` — Zod 매니페스트 스키마 (APP-01) ✅
  - `src/lib/apps/sandbox.ts` — iframe + sandbox="allow-scripts" + srcdoc 격리 (SBX-01) ✅
  - `public/sample-game/index.html` — Bouncing Ball 미니 게임 + 격리 검증 자가 진단
  - `src/app/sandbox-test/page.tsx` — `/sandbox-test` 데모 페이지
  - `npx tsc --noEmit` 통과
  - 사용자 직접 검증 권장: `npm run dev` → http://localhost:3000/sandbox-test → 메시지에서 `canTouchParentStorage/Document/Cookies` 모두 `false` 확인

### 블로커
- 없음

### 다음 작업
1. **작업 2 — Comlink IPC 어댑터**: 호스트-앱 간 RPC 통신 추상화 (`src/lib/apps/ipc/`). `npm install comlink` + 호스트 측 endpoint + 게임 측 클라이언트 + sandbox-test 페이지에 RPC 예시 추가.
2. **작업 3 — CSP/Permissions-Policy 헤더 (SBX-02)**: `next.config.ts`의 `headers()`에 보안 헤더 추가.
3. **ADR-0002 — 윈도우 매니저 라이브러리 선택**: react-rnd vs dnd-kit vs 자작. 작업 4 시작 전 필수.

### 다음 진입 지점 (Phase 2 후보)
- 앱 패키지 포맷 (APP-02): itch.io식 ZIP 처리
- 설치한 앱 목록 (APP-03): IndexedDB CRUD
- 스토어 UI (STR-01, STR-02)
