# Roadmap

> **Living Document**. 항목 완료 시 즉시 갱신. PRD와 동시 갱신.

**Version**: 0.5.0
**Last Updated**: 2026-05-24

---

## §1. 대시보드

| Phase | 상태 | 진행률 | 목표 종료 |
|-------|------|--------|----------|
| **Phase 0** — 초기 셋팅 | ✅ 완료 | 100% | 2026-05-24 |
| **Phase 1** — 코어 샌드박싱 + 윈도우 매니저 | ✅ 완료 | 100% (작업 7/7) | 2026-05-24 |
| **Phase 2** — 앱 스토어 + 첫 게임 시연 | ✅ 완료 | 100% (작업 4/4) | 2026-05-24 |
| **Phase 3** — POC 안정화 + 데모 영상 | ⏳ 대기 | 0% | 미정 |

POC 종료 후: v2 plan (멀티유저/클라우드) 별도 plan 필요.

---

## §2. Phase 0 — 초기 셋팅

| Group | 작업 | 상태 |
|-------|------|------|
| A | Next.js 16 골격 | ✅ |
| B | `.claude/` 셋팅 | ✅ |
| C | `zm-claude-docs/` 골격 | 🔄 |
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
| OPFS 어댑터 (STG-02) | — | ⏳ 계획 | Safari 폴백 IndexedDB |
| 앱 패키지 포맷 (APP-02) | — | itch.io식 ZIP (Phase 3 후보) |

---

## §5. Phase 3 — POC 안정화

- 빌드/번들 사이즈 측정
- iframe 우회 시도 (시큐리티 셀프 페네스트)
- 게임 엔진 호환성 매트릭스 (Phaser/Pixi/Three.js/Godot)
- 데모 영상 1편 (3분 이내)

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
- 감사 리포트 보관: zm-claude-docs/security/phase-1-audit-2026-05-24.md
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
