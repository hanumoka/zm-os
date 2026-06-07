---
number: "0034"
title: App Capability 모델 + IPC 권한 계약 (load-bearing)
status: accepted
date: 2026-06-07
author: hanumoka
related: ["0003", "0017", "0033"]
---

# ADR-0034: App Capability 모델 + IPC 권한 계약

## Context

ADR-0033에서 "capability 토큰 → IPC 권한 계약"이 OS 확장의 단일 load-bearing 결정으로 식별되었다. 현재 상태:
- `manifest.capabilities: z.array(z.string())` — **선언만 있고 런타임 소비처 0건**.
- IPC 권한 = `desktopApps.ts`가 앱별로 손으로 적은 `allowedMethods` 화이트리스트(`packages/ipc/src/host.ts` 게이트). manifest와 **연결 안 됨**.
- 즉 "앱이 무엇을 할 수 있는가"의 표현이 manifest(free-form)와 IPC(수기)로 **이원화**.

이 계약은 잘못 잡으면 모든 앱 매니페스트 + 모든 호스트 서비스 시그니처 + 프로토콜이 깨지므로 되돌리기 비용이 최대다. F0에서 **계약만** 락한다(강제 엔진/grant UI는 F1).

## Decision

### D1. Capability 토큰 규약 (`@zm/core/capability`)
- `CapabilityId` = string. 점/콜론-구분 `family.action`(`notify.post`, `fs:read`) 권장. 레거시 평면 토큰(`gamepad`)도 허용.
- `CAPABILITY_TOKEN_REGEX = /^[a-z][a-z0-9]*([._:][a-z0-9]+)*$/`. enum으로 값 집합을 **고정하지 않는다**(OCP: 사용자 앱이 새 토큰 선언 가능).
- `CAPABILITY_CATALOG` 배열 = 시스템이 아는 capability SSOT(`namespace-registry.ts` 패턴). 각 엔트리 = `{ id, title, risk, requiresUserGrant, ipcMethods }`. F0 seed = `demo.basic`(ping/getTime/echo).

### D2. 단일 seam — `capabilitiesToAllowedMethods()`
- 앱이 선언한 capability 토큰 → 허용 IPC 메서드 합집합. **fail-closed**(미정의 토큰 무시).
- F0는 거의 항등(카탈로그 `ipcMethods` 펼침). **F1에서 capability broker(grant 상태/scope 반영)가 본 함수 본문만 교체** — 시그니처 불변 → 호출자 무영향. 이것이 "rework 없이 broker 후추가"의 지점.

### D3. IPC 권한 계약 (`@zm/ipc`, additive)
- `HostEndpointOptions.authorize?: (method, args) => boolean` **optional hook**. `host.ts` 게이트를 `allowedMethods.includes(method) || (authorize && !authorize(...))`로 보강. **미지정 시 allowedMethods-only 동작(현행과 byte-identical, TS-002 회귀 0).** F1 broker가 주입.
- READY 메시지에 `grantedCapabilities?: string[]` **additive 예약 필드**(F0는 host 미전송).
- `MSG_TYPE.EVENT` + `EventMsgSchema` **예약**(AnyIpcMsgSchema 유니온 미포함 → `parseIpcMsg`가 무시 → 동작 불변). F3에서 라우팅.
- 프로토콜 진화 정책: additive-only(optional 필드 / 신규 타입 예약)는 버전 유지(v1), breaking 변경 시에만 bump.

### D4. manifest 스키마 불변
`manifest.capabilities`는 **free-form `z.array(z.string())` 그대로 유지**(regex 미적용). 이유: v1 평면 토큰(`gamepad`/`audio`) 호환 + 사용자 앱 확장성(OCP). 토큰 형식/grant 검증은 capability catalog + broker(F1)가 담당.

## Consequences

- ✅ manifest와 IPC 권한이 **단일 매핑 함수**(`capabilitiesToAllowedMethods`)로 수렴 → broker가 무료로 후추가.
- ✅ IPC 변경 전부 additive → 기존 앱/테스트 무영향(protocol 13 tests PASS, +1 grantedCapabilities).
- ✅ host.ts 게이트 1곳만 보강 → 보안 검증 지점 단일 유지(WASI object-capability식 "grant 안 된 호출 forge 불가"의 토대).
- ⚠️ F0에서 `desktopApps.ts`는 여전히 수기 `allowedMethods` 사용(데모). capability 선언 마이그레이션은 F1.

## Alternatives

- **capability enum 고정**: 사용자 앱이 새 토큰 선언 시 core 변경 강제 → OCP 위반. 거부(string+regex).
- **지금 broker 실구현**: grant UI/영속화/강제는 REFAC-02-P5 후 작업. 빌드 위 빌드. 거부(seam 함수 stub만).
- **manifest에 regex 강제**: v1 평면 토큰 거부 → 기존 매니페스트/마이그레이션/테스트 깨짐. 거부(D4).
- **allowedMethods를 capability로 즉시 대체**: 데모 앱 동작 변경 + REFAC-02 한복판 리스크. 거부(파생/보강 방식).
