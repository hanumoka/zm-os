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
 * Capability 토큰. 점/콜론-구분 'family.action'(예: 'notify.post', 'fs:read') 권장.
 * 레거시 평면 토큰('gamepad', 'audio')도 허용한다 (v1 매니페스트 호환).
 *
 * 현재는 string alias — 값 집합을 enum으로 고정하지 않는다(OCP: 사용자 앱이 새 토큰
 * 선언 가능). 알려진 시스템 capability는 CAPABILITY_CATALOG가 SSOT.
 */
export type CapabilityId = string;

/**
 * 토큰 형식 검증 정규식.
 * - 평면: `gamepad`, `audio`
 * - 점/콜론 구분: `notify.post`, `fs:read`, `window.control`
 */
export const CAPABILITY_TOKEN_REGEX = /^[a-z][a-z0-9]*([._:][a-z0-9]+)*$/;

export function isValidCapabilityToken(token: string): boolean {
  return CAPABILITY_TOKEN_REGEX.test(token);
}

export type CapabilityRisk = 'low' | 'medium' | 'high';

/** capability 카탈로그 엔트리 — 시스템이 아는 capability 정의 (CAPABILITY_CATALOG 원소). */
export type CapabilityDef = {
  readonly id: CapabilityId;
  /** 사용자 grant UI 표시명 (F1). */
  readonly title: string;
  readonly risk: CapabilityRisk;
  /** false = 시스템 자동 grant (Android 'normal' 권한 유사). true = 사용자 승인 필요 (F1). */
  readonly requiresUserGrant: boolean;
  /** 이 capability가 노출하는 IPC 메서드 — allowedMethods 파생의 SSOT. */
  readonly ipcMethods: ReadonlyArray<string>;
};

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
