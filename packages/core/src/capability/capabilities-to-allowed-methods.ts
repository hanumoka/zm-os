/**
 * 단일 seam (ADR-0034): 앱이 선언한 capability 토큰 → 허용 IPC 메서드 목록.
 *
 * F0: 카탈로그에 정의된 capability의 `ipcMethods`를 펼쳐 합집합 반환 (거의 항등).
 * F1: capability broker가 grant 상태/scope를 반영하도록 **본 함수 본문만 교체**한다
 *     (시그니처 불변 → 호출자 무영향). 이것이 "rework 없이 끼워짐"의 핵심 지점.
 *
 * 정책: 알 수 없는 토큰은 무시(권한 부여 안 함) — **fail-closed**.
 *
 * @module capability/capabilities-to-allowed-methods
 */

import { getCapabilityDef } from './catalog';
import type { CapabilityId } from './types';

export function capabilitiesToAllowedMethods(
  capabilities: ReadonlyArray<CapabilityId>,
): ReadonlyArray<string> {
  const methods = new Set<string>();
  for (const cap of capabilities) {
    const def = getCapabilityDef(cap);
    if (def === undefined) continue; // fail-closed: 미정의 토큰은 권한 부여 안 함
    for (const m of def.ipcMethods) methods.add(m);
  }
  return [...methods];
}
