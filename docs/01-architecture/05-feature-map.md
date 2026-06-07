# Feature Map

> UI / 스토리지 / 샌드박싱 연결도. PRD 기능 ID(`DSK-NN` 등)와 코드 경로 매핑.
> **모노레포 마이그레이션 후** (SRV-00, 2026-05-26): `src/` → `apps/web/src/` + `packages/{core,storage,ipc}`

**Last Updated**: 2026-06-07

---

## 데이터 흐름 (POC 1차, 모노레포 후)

```
[User]
  ↓ 클릭
[Desktop UI (apps/web/src/components/desktop/)]
  ↓ 앱 실행 요청
[Window Manager (DSK-01)]
  ↓ 매니페스트 로드
[App Manifest (packages/core/src/manifest.ts)] ← [BlobStorage (packages/adapters-local/blob-storage/)] ← [Store (STR-01)]
  ↓ blob: URL 또는 srcdoc 생성
[Sandbox SDK (apps/web/src/lib/apps/sandbox.ts)]
  ↓ iframe 생성 (sandbox="allow-scripts")
[Iframe (null/blob: origin)]
  ↓ Comlink-compatible RPC
[IPC Adapter (packages/ipc/)] ↔ [Host Services (apps/web/src/lib/...)]
```

---

## 기능 ID → 코드 경로 매핑 (모노레포 후 실제 경로)

### Desktop (DSK)
| ID | 위치 | 상태 |
|----|------|------|
| DSK-01 | `apps/web/src/components/desktop/{WindowManagerProvider,Window,useWindowManager,windowReducer}.tsx` | ✅ |
| DSK-02 | `apps/web/src/components/desktop/{Desktop.tsx,DesktopIcon.tsx,desktopApps.ts}` | ✅ |
| DSK-03 | `apps/web/src/components/desktop/{Taskbar.tsx,TaskbarButton.tsx,Clock.tsx}` | ✅ |
| DSK-04 | 윈도우 레이아웃 영속화 (StorageAdapter 통합) | ✅ |
| DSK-05 | 데스크탑 커스터마이징 (배경/테마/설정 UI) | ✅ |

### Store (STR)
| ID | 위치 | 상태 |
|----|------|------|
| STR-01/02 | `apps/web/src/app/store/` + `apps/web/src/components/store/{AppCard,AppDetail}.tsx` + `InstalledAppsProvider.tsx` | ✅ |

### Apps (APP)
| ID | 위치 | 상태 |
|----|------|------|
| APP-01 | `packages/core/src/manifest.ts` (Zod 스키마, v1/v2 호환) | ✅ |
| APP-02 | `apps/web/src/lib/apps/zip-loader.ts` + `apps/web/src/lib/apps/UserAppsProvider.tsx` + `AppUploadButton.tsx` | ✅ |
| APP-03 | `apps/web/src/lib/storage/installed-apps.ts` (IndexedDB hydration) | ✅ |
| APP-04 | ConfirmDialog + semver 비교 + AppInfoDialog (컨텍스트 메뉴) | ✅ |

### Sandbox (SBX)
| ID | 위치 | 상태 |
|----|------|------|
| SBX-01 | `apps/web/src/lib/apps/sandbox.ts` (blob URL + srcdoc iframe) | ✅ |
| SBX-02 | `apps/web/next.config.ts` + `apps/web/src/lib/security/csp.ts` | ✅ |

### IPC
| ID | 위치 | 상태 |
|----|------|------|
| IPC-01 | `packages/ipc/src/` (wire-compatible RPC v1) + rate-limiter (N-08 방어) | ✅ |
| IPC-02 | Comlink 라이브러리 직접 통합 | ⏳ v2 |

### Storage (STG)
| ID | 위치 | 상태 |
|----|------|------|
| STG-01 | `packages/adapters-local/src/blob-storage/indexeddb.ts` (idb v8.0.3 raw CRUD + 메모리 폴백) | ✅ |
| STG-02 | `packages/adapters-local/src/blob-storage/{idb,opfs,memory}-adapter.ts` — BlobStorage Port 구현 (IDB/OPFS/Memory + AbortSignal, ADR-0020) | ✅ |
| STG-03 | `packages/storage` = deprecation shell (re-export, ADR-0020 §D5, v2.0~v2.1) | ✅ REFAC-02-P2 |
| STG-04 | `packages/adapters-local/src/app-repository/local-app-repository.ts` — AppRepository Port 구현 (BlobStorage 위, cascade remove, content-agnostic, ADR-0019). 소비처 wiring은 P5 | ✅ REFAC-02-P3 |

### Game (GAME) — 게임 엔진 매트릭스
| ID | 위치 | 상태 |
|----|------|------|
| GAME-01 | `apps/web/public/sample-game-phaser/` (Phaser 3.90.0 Snake) | ✅ |
| 추가 | `apps/web/public/sample-game-pixi/` (Pixi.js 8.18.1) + `sample-game-three/` (Three.js r184) | ✅ |

### Errors (REFAC-01)
| ID | 위치 | 상태 |
|----|------|------|
| C-1 | `apps/web/src/app/error.tsx` + `apps/web/src/app/global-error.tsx` (Error Boundary) | ✅ |
| H-5 | `apps/web/src/lib/errors/PersistenceErrorContext.tsx` (구조화 에러 플러밍) | ✅ |
| H-1 | `packages/core/src/manifest.ts` (Manifest v2 + v1 호환 마이그레이션) | ✅ |

---

## ✅ v2 진입 — Ports & Adapters 채택 완료 (ADR-0017~0023, 2026-05-27)

**현재**: 모노레포 + **REFAC-02-P1**로 5 Port 인터페이스 SSOT 확정 (`packages/core/src/ports/`) + `@zm/adapters-local` 골조. 인증/스토어 백엔드는 REFAC-02-P2~P5에서 구현.
**채택 완료**: 5개 Port 정의 (AuthProvider / AppRepository / BlobStorage / SyncProvider / ModerationProvider) + ADR-0018~0023 각 Port의 LocalAdapter 명세.

`packages/storage`는 BlobStorage Port로 REFAC-02-P2에서 흡수 예정.

---

## 신뢰 경계 (Trust Boundary)

```
┌──────────────────────────────────────────────┐
│ Host Origin (zm-os 자체)                      │
│  - Next.js 페이지 (apps/web/src/app/)         │
│  - IndexedDB / OPFS / Memory                  │
│    (packages/storage/ StorageAdapter)         │
│  - apps/web/src/lib/apps/ (host code)         │
│  - packages/core (manifest/version/errors)    │
│                                              │
│  ┌────────────────────────────────┐          │
│  │ blob: / null origin (사용자 앱) │          │
│  │  - sandbox="allow-scripts"      │          │
│  │  - 격리된 스토리지 (parent 불가)│          │
│  │  - postMessage만 host와 통신    │          │
│  │  - IPC rate-limiter 적용 (N-08) │          │
│  └────────────────────────────────┘          │
└──────────────────────────────────────────────┘
```

신뢰 경계 통과는 **반드시 IPC RPC (`packages/ipc/`)를 통해서만**. 다른 통로 금지.
규칙: [`.claude/rules/security.md`](../../.claude/rules/security.md)
