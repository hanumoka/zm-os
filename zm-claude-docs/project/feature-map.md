# Feature Map

> UI / 스토리지 / 샌드박싱 연결도. PRD 기능 ID(`DSK-NN` 등)와 코드 경로 매핑.

**Last Updated**: 2026-05-24

---

## 데이터 흐름 (POC 1차)

```
[User]
  ↓ 클릭
[Desktop UI (src/components/desktop/)]
  ↓ 앱 실행 요청
[Window Manager (DSK-01)]
  ↓ 매니페스트 로드
[App Manifest (src/lib/apps/manifest.ts)] ← [IndexedDB (STG-01)] ← [Store (STR-01)]
  ↓ blob: URL 생성
[Sandbox SDK (src/lib/apps/sandbox.ts)]
  ↓ iframe 생성 (sandbox="allow-scripts")
[Iframe (null/blob: origin)]
  ↓ Comlink RPC
[IPC Adapter (src/lib/apps/ipc/)] ↔ [Host Services]
```

---

## 기능 ID → 코드 경로 매핑

### Desktop (DSK)
| ID | 위치 |
|----|------|
| DSK-01 | `src/components/desktop/WindowManager.tsx` (예정) |
| DSK-02 | `src/components/desktop/Desktop.tsx` (예정) |
| DSK-03 | `src/components/desktop/Taskbar.tsx` (예정) |

### Store (STR)
| ID | 위치 |
|----|------|
| STR-01 | `src/components/store/Catalog.tsx` (예정) |
| STR-02 | `src/components/store/AppDetail.tsx` (예정) |

### Apps (APP)
| ID | 위치 |
|----|------|
| APP-01 | `src/lib/apps/manifest.ts` (예정) — Zod 스키마 |
| APP-02 | `src/lib/apps/package.ts` (예정) — ZIP 압축/해제 |
| APP-03 | `src/lib/apps/installed.ts` (예정) — IndexedDB CRUD |

### Sandbox (SBX)
| ID | 위치 |
|----|------|
| SBX-01 | `src/lib/apps/sandbox.ts` (예정) — blob URL + iframe |
| SBX-02 | `next.config.ts` `headers()` |

### IPC
| ID | 위치 |
|----|------|
| IPC-01 | `src/lib/apps/ipc/` (예정) — Comlink 어댑터 |

### Storage (STG)
| ID | 위치 |
|----|------|
| STG-01 | `src/lib/storage/indexeddb.ts` (예정) |
| STG-02 | `src/lib/storage/opfs.ts` (예정) |

### Game (GAME)
| ID | 위치 |
|----|------|
| GAME-01 | `public/sample-game/` 또는 `apps-bundled/game-01/` (예정) — Phaser 또는 Pixi |

---

## 신뢰 경계 (Trust Boundary)

```
┌──────────────────────────────────────┐
│ Host Origin (zm-os 자체)              │
│  - Next.js 페이지                    │
│  - IndexedDB / OPFS (사용자 데이터)   │
│  - src/lib/apps/ (host code)         │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ blob: / null origin (사용자 앱) │  │
│  │  - sandbox="allow-scripts"      │  │
│  │  - 격리된 스토리지 (parent 불가)│  │
│  │  - postMessage만 host와 통신    │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

신뢰 경계 통과는 **반드시 Comlink IPC를 통해서만**. 다른 통로 금지.
규칙: [`.claude/rules/security.md`](../../.claude/rules/security.md)
