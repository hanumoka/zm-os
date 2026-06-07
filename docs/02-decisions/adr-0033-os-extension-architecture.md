---
number: "0033"
title: OS 확장 아키텍처 — capability-우선 + microkernel-lite + 점진
status: accepted
date: 2026-06-07
author: hanumoka
related: ["0017", "0023", "0034"]
---

# ADR-0033: OS 확장 아키텍처 (capability-우선 + 점진)

## Context

zm-os는 "브라우저 위 가상 데스크탑"으로서 실제 OS가 갖는 기본 기능(파일/알림/클립보드/창제어/프로세스 등)을 점진적으로 추가해야 한다. 이미 **격리(iframe `allow-scripts`) + 통신 창구(`packages/ipc` RPC) + Ports & Adapters(5 Port, ADR-0017)** 라는 OS형 뼈대를 갖췄으나, "앱이 OS 서비스를 어떻게 **선언·허가·호출**하는가"의 확장 계약이 없다(`manifest.capabilities`는 선언만 있고 미사용, IPC 권한은 앱별 수기 `allowedMethods`).

근본 아키텍처를 **미리** 확장성·유연성·안정성 있게 잡되, POC·단일사용자·로컬-우선 맥락에서 **과설계를 회피**해야 한다. 조사: 실제 OS 서브시스템(OSTEP/Linux 커널) + 브라우저-OS 사례(daedalOS·Puter·OS.js·WebContainers) + capability 보안(Chrome Manifest V3·Tauri v2·WASI object-capability) + VFS(ZenFS/OPFS). 상세 출처: [`docs/01-architecture/07-os-subsystem-architecture.md`](../01-architecture/07-os-subsystem-architecture.md).

## Decision

### D1. capability-우선 (단일 load-bearing 계약)
모든 OS 기능(서비스/이벤트/파일/생명주기)은 "이 앱이 무엇을 할 수 있는가"의 표현이며, 그 표현이 곧 **capability 토큰 → IPC 권한 계약**이다. 이 계약 하나만 지금 SSOT로 락한다. 상세: [ADR-0034](adr-0034-capability-and-ipc-contract.md).

### D2. microkernel-lite — 계약은 `@zm/core`, 구현은 추후
- **계약(타입/스키마/카탈로그)**은 `@zm/core`가 SSOT (capability / service / events). manifest·ipc·apps/web이 동일 계약 import.
- **런타임 구현**(capability broker, service registry, event bus, VFS)은 추후 단계에서 ADR-0023 Composition Root(`createLocalPorts`, REFAC-02-P5) 위에 얹는다. 별도 `@zm/kernel` 패키지는 F2+에서 필요 시 도입(지금은 미생성).
- full microkernel(서비스간 IPC 라우터, 동적 plugin registry)은 도입하지 않는다.

### D3. VFS는 신규 Port 아님
`PortName` 5개 유니언(`packages/core/src/ports/common.ts`)은 **불변**. VFS는 향후 BlobStorage Port를 백엔드로 쓰는 kernel 서비스로 추가(ZenFS가 store 위에 POSIX 의미론을 얹는 구조). REFAC-02-P2~P5 진행 중 Port 유니언 변경 금지.

### D4. Boot/Lifecycle은 ADR-0023 재사용
"부팅 순서"는 ADR-0023의 `createLocalPorts`가 곧 정의한다. 신규 Boot/ProcessManager 추상화를 만들지 않는다(iframe + WindowManager가 이미 프로세스 생명주기 단위).

### D5. Phasing (lock / reserve / defer)

| 단계 | 시점 | 내용 |
|------|------|------|
| **F0** | 지금 (REFAC-02 병렬) | capability/IPC 계약 락(ADR-0034) + service/event 타입 예약 + ADR + 문서. `@zm/core` + `@zm/ipc`만 수정(파일 충돌 0). |
| **F1** | REFAC-02-P5 후 | capability broker 실강제 + grant 저장(`system` ns) + 첫 저위험 서비스(notify/clipboard) + grant UI + `desktopApps.ts` 마이그레이션. |
| **F2** | 필요 신호 시 | VFS(BlobStorage 위 kernel 서비스) + ProcessManager + soft-timeout(RP-1). 필요 시 `@zm/kernel` 도입. |
| **F3** | cross-app/cloud 신호 시 | EventBus 실구현(+IPC `event` 채널) + cloud backend 합류 + 터미널/멀티유저 검토. |

### D6. 예약 ADR 번호
- **0035**: System Service Registry (descriptor + 정적 슬롯, F1)
- **0036**: IPC 프로토콜 진화 정책 + EVENT 채널 (F3에서 라우팅)
- **0037**: VFS (BlobStorage 위 kernel 서비스, F2)
- **0038**: Process Lifecycle / Boot (ADR-0023 확장, F2)
- **0039**: System Event Bus (F3)
- (0024~0029는 CloudAdapter 트랙 예약 — 별개)

## Consequences

- ✅ 미래 OS 기능이 "카탈로그/디스크립터/유니언에 variant 추가"만으로 rework 없이 끼워진다.
- ✅ `PortName` 불변 → REFAC-02와 충돌 0. F0는 `@zm/core`+`@zm/ipc`만 손대 병렬 안전.
- ✅ 과설계 회피: POC에 full microkernel/VFS/멀티유저 미도입.
- ⚠️ F0는 눈에 보이는 신규 기능이 없음(기반 작업). 실제 서비스는 F1+.
- ⚠️ service/event 타입은 "예약"이라 F1~F3에서 조정 가능(특히 event 토픽 스키마).

## Alternatives

- **(A) 지금 full microkernel/VFS/멀티유저 선구축**: 브라우저 한계 + 단일사용자 맥락에서 죽은 코드·번들 비용. 거부.
- **(B) VFS를 6번째 Port로 승격**: REFAC-02-P2~P5 한복판에 common.ts/resolver/ADR-0017 흔듦. 거부(D3).
- **(C) 아무 계약도 락하지 않고 기능별로 즉흥 추가**: manifest/IPC 이원화가 고착 → 추후 모든 앱·서비스 시그니처 rework. 거부.
