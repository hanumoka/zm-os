# Roadmap

> **Living Document**. 항목 완료 시 즉시 갱신. PRD와 동시 갱신.

**Version**: 0.1.1
**Last Updated**: 2026-05-24

---

## §1. 대시보드

| Phase | 상태 | 진행률 | 목표 종료 |
|-------|------|--------|----------|
| **Phase 0** — 초기 셋팅 | ✅ 완료 | 100% | 2026-05-24 |
| **Phase 1** — 코어 샌드박싱 + 윈도우 매니저 | 🔄 진행 중 | 약 14% (작업 1/7) | 미정 |
| **Phase 2** — 앱 스토어 + 첫 게임 시연 | ⏳ 대기 | 0% | 미정 |
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
| Comlink IPC 어댑터 (IPC-01) | SBX-01 | ⏳ | `src/lib/apps/ipc/` (다음) |
| CSP/Permissions-Policy 헤더 (SBX-02) | — | ⏳ | `next.config.ts` |
| 윈도우 매니저 (DSK-01) | ADR-0002 | ⏳ | react-rnd or dnd-kit (TBD) |
| 데스크탑 영역 (DSK-02) | DSK-01 | ⏳ | |
| 작업표시줄 (DSK-03) | DSK-01 | ⏳ | |
| `app-sandbox-auditor` agent 1회 감사 | 위 전부 | ⏳ | |

---

## §4. Phase 2 — 앱 스토어 + 첫 게임

| 작업 | 의존성 | 비고 |
|------|--------|------|
| 앱 패키지 포맷 (APP-02) | APP-01 | itch.io식 ZIP |
| 설치한 앱 목록 관리 (APP-03) | STG-01 | IndexedDB |
| IndexedDB 추상화 (STG-01) | — | |
| OPFS 어댑터 (STG-02) | — | Safari 폴백 IndexedDB |
| 앱 카탈로그 UI (STR-01) | APP-03 | |
| 앱 상세 + 설치 (STR-02) | STR-01 | |
| 첫 샘플 게임 (GAME-01) | SBX-01, IPC-01, STR-02 | Phaser 또는 Pixi |

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

### 0.1.1 (2026-05-24)
- Phase 0 완료, Phase 1 진입
- 작업 1 (iframe 샌드박싱 PoC) 완료

### 0.1.0 (2026-05-24)
- 초기 로드맵 작성 (Phase 0~3 정의)
