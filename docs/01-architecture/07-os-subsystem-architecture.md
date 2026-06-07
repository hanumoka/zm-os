# OS 서브시스템 아키텍처 — 확장 기반 설계

> **Last Updated**: 2026-06-07
> **목적**: 실제 OS(Linux)의 기본 기능을 브라우저 한계 내에서 확장 가능하게 추가하기 위한 근본 아키텍처 검토 + 로드맵. F0 계약 락 단계 기준.
> **관련 ADR**: [ADR-0033](../02-decisions/adr-0033-os-extension-architecture.md)(방향) · [ADR-0034](../02-decisions/adr-0034-capability-and-ipc-contract.md)(load-bearing 계약) · [ADR-0017](../02-decisions/adr-0017-ports-and-adapters.md)(Ports&Adapters)
> **Living Document**

---

## 1. 요약

zm-os는 OS의 **격리(iframe)·통신 창구(IPC)·자원 추상화(Ports&Adapters)** 가 이미 견고하다. 빠진 것은 "앱이 OS 서비스를 **선언·허가·호출**하는 확장 계약"이다. 이를 단일 load-bearing 결정(**capability 토큰 → IPC 권한**)으로 지금 락하고(F0), 실제 OS 서비스(알림/클립보드/창제어/파일)는 그 위에 점진 추가한다(F1~F3). 브라우저 한계상 실제 프로세스/커널/raw FS/socket은 도입하지 않는다(에뮬레이션·Web API 매핑).

---

## 2. OS 서브시스템 ↔ zm-os 매핑

| OS 서브시스템 | 실제 OS | zm-os 현재 | 성숙도 | 방향 |
|------|------|------|:---:|------|
| 프로세스/실행 | fork/exec/스케줄링 | iframe 격리 + WindowManager(open/min/max) | ✅ 고 | 유지 (ProcessId 논리 식별자만 F2) |
| IPC/syscall | 시스템 호출 | `packages/ipc` RPC + `allowedMethods` | ✅ 고 | **authorize seam 보강(F0)** |
| 권한/capability | uid/권한, capability | `manifest.capabilities`(미사용) | 🔴 저 | **F0 락 (load-bearing)** |
| 파일시스템(VFS) | VFS/inode/mount | BlobStorage = path 없는 KV + namespace | 🟡 중 | kernel 서비스로 F2 (Port 아님) |
| 디바이스/서비스 | 드라이버 | `expose` 수기 + Permissions-Policy 차단 | 🟡 중 | **service descriptor 계약(F0)** + 서비스 F1+ |
| 사용자/권한 | 멀티유저/ACL | AuthProvider Port(미구현) | 🔴 저 | REFAC-02 트랙(단일사용자) |
| 시스템 서비스/데몬 | init/데몬 | 없음(ServiceWorker 미사용) | 🔴 저 | descriptor 예약, runtime F1+ |
| 셸/런처 | shell | 데스크탑 아이콘 + 스토어 | 🟡 중 | 유지 (런처/검색 후보) |
| 설정/레지스트리 | /etc, registry | DesktopSettings + `system` namespace | 🟡 중 | grant 저장에 `system` 재사용 |
| 이벤트/로깅 | syslog/이벤트 | PersistenceErrorContext(UI 에러만) | 🔴 저 | SystemEvent 타입 예약, EventBus F3 |

---

## 3. 브라우저 한계 (인지된 제약)

| 막히는 OS 기능 | 이유 | zm-os 대응 |
|------|------|------|
| 실제 프로세스/스레드 제어 | 브라우저 독점 | iframe = 격리 단위, Web Worker는 경량 (실 프로세스 미도입) |
| raw 파일시스템 | 보안 | OPFS/IndexedDB(origin 격리) + 향후 VFS 추상화 |
| raw 네트워크 소켓 | 보안 | fetch / WebSocket / WebRTC 한정 |
| 하드웨어 직접 접근, 커널 권한 | 아키텍처 | 불가 — 도입하지 않음 |

참고 사례: daedalOS(ZenFS+react-rnd), Puter(3-tier+S3), OS.js(WM+FS abstraction), WebContainers(WASM로 Node 실행). 출처는 §7.

---

## 4. 아키텍처 결정 (capability-우선 + microkernel-lite)

```
                ┌──────────────────────────────────────────┐
                │ apps/web (Composition Root, REFAC-02-P5)  │  ← F1+ 구현 얹는 자리
                └───────────────┬──────────────────────────┘
                                │ imports (단방향)
        ┌───────────────────────┼───────────────────────────┐
        ▼                        ▼                            ▼
 ┌──────────────┐    ┌──────────────────────┐     ┌──────────────┐
 │ @zm/core     │    │ (F2+) @zm/kernel      │     │ @zm/ipc       │
 │ capability/  │◄───│ broker/registry/      │────►│ host.ts       │
 │ service/     │    │ event-bus/vfs         │     │ authorize hook│
 │ events/      │    │ (구현 — 추후)         │     │ (seam)        │
 │ (계약 SSOT)  │    └───────────┬───────────┘     └──────────────┘
 └──────────────┘                │ uses BlobStorage Port
                                 ▼
                       ┌──────────────────────┐
                       │ @zm/adapters-local    │
                       └──────────────────────┘
```

- **계약 = `@zm/core`** (capability/service/events 타입 SSOT). **구현 = 추후** Composition Root(ADR-0023) 위.
- **load-bearing = capability 토큰 → IPC 권한** (ADR-0034). 단일 seam `capabilitiesToAllowedMethods()` + IPC `authorize` hook.
- **VFS는 Port 아님** (BlobStorage 위 서비스). **Boot = ADR-0023 재사용**.

---

## 5. F0 구현 내역 (이번 단계 — 계약 락)

`@zm/core` + `@zm/ipc`만 수정(REFAC-02 병렬 안전, 동작 byte-identical):

| 산출물 | 내용 |
|------|------|
| `packages/core/src/capability/` | `types.ts`(CapabilityId/Def/Request/Grant/Decision + 토큰 regex) + `catalog.ts`(CAPABILITY_CATALOG SSOT) + `capabilities-to-allowed-methods.ts`(seam, fail-closed) |
| `packages/core/src/service/types.ts` | `ServiceDescriptor` 계약(슬롯 예약) |
| `packages/core/src/events/types.ts` | `SystemEvent` 유니온(예약 — 변경 가능) |
| `packages/ipc/src/protocol.ts` | READY `grantedCapabilities?` additive + `MSG_TYPE.EVENT`/`EventMsgSchema` 예약(유니온 미포함) + 버전 정책 |
| `packages/ipc/src/types.ts`/`host.ts` | `HostEndpointOptions.authorize?` optional hook + 게이트 1줄 보강(미지정 시 동일) |
| `manifest.ts` | 주석만(스키마 불변, free-form 유지) |
| 테스트 | capability 10 + protocol grantedCapabilities 1 → **vitest 69→80, type-check 5/5** |

---

## 6. 전체 로드맵 (F0~F3)

| 단계 | 시점 | 핵심 |
|------|------|------|
| **F0** ✅ | 2026-06-07 | capability/IPC 계약 락 + service/event 타입 + ADR-0033/0034 + 본 문서 |
| **F1** | REFAC-02-P5 후 | capability broker 실강제 + grant 저장(`system` ns) + 첫 저위험 서비스(notify/clipboard) + grant UI(SettingsPanel) + `desktopApps.ts` 마이그레이션 (ADR-0035) |
| **F2** | 필요 신호 시 | VFS(BlobStorage 위 kernel 서비스, path/chroot/quota) + ProcessManager(WindowManager 동기) + soft-timeout(RP-1). 필요 시 `@zm/kernel` 도입 (ADR-0037/0038) |
| **F3** | cross-app/cloud 신호 시 | EventBus 실구현(+IPC `event` 채널) + cloud backend 합류(ADR-0024+) + 터미널/멀티유저 검토 (ADR-0039) |

**만들지 않는 것(과설계 회피)**: 실제 Web Worker 프로세스 격리, raw socket/FS, 멀티유저 ACL, 동적 service registry runtime, full microkernel IPC 라우터. → 필요 신호 시 로드맵 단계로.

---

## 7. 출처 (웹 리서치, 2026 기준)

**OS 서브시스템 / 커널**
- https://cs.ossu.dev/coursepages/ostep/ (OSTEP) · https://circuitlabs.net/the-linux-kernel-high-level-architecture-overview/

**브라우저-OS 사례**
- https://github.com/DustinBrett/daedalOS · https://github.com/HeyPuter/puter · https://www.os-js.org/ · https://webcontainers.io/
- https://github.com/zen-fs/core (ZenFS VFS) · https://github.com/jvilk/BrowserFS

**capability / 권한 모델**
- https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions (Manifest V3)
- https://v2.tauri.app/security/capabilities/ (Tauri v2) · https://en.wikipedia.org/wiki/Object-capability_model
- https://medium.com/webassembly/capabilities-based-security-with-wasi-c523a34c1944 (WASI)
- https://developer.android.com/guide/topics/manifest/manifest-intro (Android) · https://code.visualstudio.com/api/references/contribution-points (VS Code)

**스토리지 / VFS**
- https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system · https://web.dev/articles/origin-private-file-system

신뢰도: 1차 권위 출처(MDN/web.dev/공식 문서/OSTEP) 직접 확인 = 확실. 단계별 시점·우선순위는 zm-os 판단(추정).
