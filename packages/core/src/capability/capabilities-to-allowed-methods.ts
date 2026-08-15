/**
 * 단일 seam (ADR-0034): 앱이 선언한 capability 토큰 → 허용 IPC 메서드 목록.
 *
 * F1에서 capability broker가 grant 상태·scope를 반영하도록 **이 함수 본문만 교체**한다.
 * 시그니처가 불변이므로 호출자는 영향받지 않는다.
 *
 * 정책: 알 수 없는 토큰은 무시한다 — **fail-closed**. 토큰이 이제 닫힌 유니언이므로
 * 타입 단계에서 대부분 걸러지지만, 매니페스트는 런타임 입력이라 여기서도 막는다.
 *
 * @module capability/capabilities-to-allowed-methods
 */

import { CAPABILITY_METHODS, isKnownCapability } from './catalog';
import type { HostMethodName } from '../host-api/contract';

export function capabilitiesToAllowedMethods(
  capabilities: ReadonlyArray<string>,
): ReadonlyArray<HostMethodName> {
  const methods = new Set<HostMethodName>();
  for (const cap of capabilities) {
    if (!isKnownCapability(cap)) continue; // fail-closed
    for (const m of CAPABILITY_METHODS[cap]) methods.add(m);
  }
  return [...methods];
}
