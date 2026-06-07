/**
 * Capability 카탈로그 — 시스템이 아는 모든 capability 정의 SSOT (ADR-0034).
 *
 * 새 capability 추가 = 이 배열에 1엔트리 (namespace-registry.ts와 동일 패턴).
 * F0: POC 데모 RPC(ping/getTime/echo)를 단일 데모 capability로 매핑한 seed만 둔다.
 * 실제 OS 서비스 capability(notify/clipboard/window/fs)는 F1+에서 추가.
 *
 * @module capability/catalog
 */

import type { CapabilityDef } from './types';

export const CAPABILITY_CATALOG = [
  {
    id: 'demo.basic',
    title: '데모 기본 RPC (ping/getTime/echo)',
    risk: 'low',
    requiresUserGrant: false,
    ipcMethods: ['ping', 'getTime', 'echo'],
  },
] as const satisfies ReadonlyArray<CapabilityDef>;

/** 카탈로그에 정의된 알려진 capability 토큰 유니언. */
export type KnownCapabilityId = (typeof CAPABILITY_CATALOG)[number]['id'];

export function getCapabilityDef(id: string): CapabilityDef | undefined {
  return CAPABILITY_CATALOG.find((c) => c.id === id);
}

export function isKnownCapability(id: string): boolean {
  return CAPABILITY_CATALOG.some((c) => c.id === id);
}
