/**
 * App Capability 계약 (ADR-0034) — load-bearing.
 *
 * 앱이 `manifest.capabilities`로 필요한 권한을 선언 → (F1) capability broker가
 * grant/강제. F0 단계에서는 **타입 + 카탈로그 SSOT + `capabilitiesToAllowedMethods`
 * seam**만 제공한다. 실제 grant 영속화/강제 엔진/사용자 prompt UI는 F1(REFAC-02-P5 후).
 *
 * @see docs/02-decisions/adr-0034-capability-and-ipc-contract.md
 * @see docs/01-architecture/07-os-subsystem-architecture.md
 * @module capability/types
 */

/**
 * Capability 토큰.
 *
 * **값 집합은 닫혀 있다.** `host-api/contract.ts`의 `HostApiSurface`에서 파생되므로
 * 표면에 없는 토큰은 타입으로 존재하지 않는다.
 *
 * ADR-0034는 원래 이것을 `string` alias로 두었다 — 근거는 "사용자 앱이 새 토큰을 선언할
 * 수 있어야 한다"(OCP)였다. 그 근거는 `DEC-0007`로 ZIP 업로드 경로가 제거되면서 대상을
 * 잃었다. 앱은 전부 `zm-os` 저장소 안의 모듈이므로 토큰을 모르는 앱이 존재할 수 없다.
 * 열어 두면 오타가 조용히 "권한 없음"이 되고, 그것을 잡을 수단이 없다.
 */
import type { CapabilityId } from '../host-api/contract';

export type { CapabilityId };

/**
 * 토큰 **형식** 검증 정규식. 카탈로그 소속 여부는 보지 않는다 — 그쪽은
 * `isKnownCapability`가 판정한다. 둘을 섞으면 형식이 맞는 미등록 토큰이 통과한다.
 */
export const CAPABILITY_TOKEN_REGEX = /^[a-z][a-z0-9]*([._:][a-z0-9]+)*$/;

export function isValidCapabilityToken(token: string): boolean {
  return CAPABILITY_TOKEN_REGEX.test(token);
}

export type CapabilityRisk = 'low' | 'medium' | 'high';

/** 매니페스트 선언 → grant 결정 입력 (Chrome MV3 permissions 유사). scope는 Tauri v2 JSON scope. */
export type CapabilityRequest = {
  readonly id: CapabilityId;
  readonly scope?: Readonly<Record<string, unknown>>;
};

/** 사용자/시스템이 승인한 grant — 영속화 대상 (F1, `system` namespace). */
export type CapabilityGrant = {
  readonly appId: string;
  readonly capabilityId: CapabilityId;
  readonly scope?: Readonly<Record<string, unknown>>;
  readonly grantedAt: number;
  readonly grantedBy: 'user' | 'system' | 'default';
};

/** broker 판정 결과 (F1). 'prompt'는 사용자 확인 필요. */
export type CapabilityDecision =
  | { readonly outcome: 'allow' }
  | { readonly outcome: 'deny'; readonly reason: string }
  | { readonly outcome: 'prompt'; readonly request: CapabilityRequest };
