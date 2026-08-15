/**
 * 소유자 ID 부트스트랩 (zm-docs `contracts.md` §2 — 단일 계정 시기의 ownerId)
 *
 * 저장 키 접두사로 쓸 소유자 ID를 결정한다. 없으면 UUID를 하나 만들어 `system`
 * namespace에 보관하고, 그 뒤로는 계속 같은 값을 쓴다.
 *
 * **`"local"` 같은 리터럴을 쓰지 않는 것이 이 파일의 존재 이유다.** 리터럴을 쓰면
 * 실제 계정이 생기는 순간 전 키를 다시 써야 하고, 그러면 "다중 사용자 확장 시
 * 마이그레이션 0"이라는 접두사 도입 근거 자체가 무너진다. 로그인이 붙으면 이 UUID를
 * 계정에 **매핑**하고 키는 그대로 둔다(ADR-0018 §D4).
 *
 * `system`은 파티션하지 않는 namespace다 — 접두사를 알려면 접두사가 필요해지는
 * 순환을 피하기 위해서다. 레지스트리가 `partition: 'global'`로 그것을 선언한다.
 *
 * @module adapters-local/partition/owner-id
 */

import { NS_SYSTEM, isValidOwnerId } from '@zm/core';
import type { UserId } from '@zm/core';
import { idbGet, idbPut } from '../blob-storage/indexeddb';

/** `system` namespace 안에서 소유자 ID를 보관하는 키. 접두사가 붙지 않는다. */
export const OWNER_ID_KEY = 'owner-id';

/**
 * 결정된 소유자 ID를 담는 캐시된 Promise.
 *
 * Promise를 캐시하는 것이 값을 캐시하는 것보다 중요하다 — 부팅 직후 여러 저장
 * 호출이 동시에 들어오면, 값 캐시로는 각자 "없다"를 보고 각자 UUID를 만든다.
 * Promise를 캐시하면 첫 호출자만 생성하고 나머지는 그것을 기다린다.
 */
let _ownerIdPromise: Promise<UserId> | null = null;

/**
 * UUID v4를 만든다.
 *
 * `crypto.randomUUID()`는 secure context에서만 있다. http로 띄운 LAN 주소처럼
 * secure context가 아닌 환경에서 부팅이 통째로 실패하지 않도록 폴백을 둔다.
 * 폴백도 `getRandomValues`를 쓴다 — `Math.random()`은 쓰지 않는다.
 */
function generateOwnerId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof c?.getRandomValues !== 'function') {
    throw new Error('[zm-os partition] crypto.getRandomValues를 쓸 수 없어 소유자 ID를 만들 수 없습니다');
  }
  c.getRandomValues(bytes);
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x40; // version 4
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function resolveOwnerId(): Promise<UserId> {
  const stored = await idbGet<unknown>(NS_SYSTEM, OWNER_ID_KEY);
  if (typeof stored === 'string' && isValidOwnerId(stored)) {
    return stored as UserId;
  }

  // 저장된 값이 있는데 형식이 깨졌으면 덮어쓴다. 남겨두면 매 부팅마다 새 ID가 나와
  // 데이터가 매번 다른 파티션에 쌓인다 — 조용히 데이터가 흩어지는 최악의 형태다.
  const fresh = generateOwnerId();
  await idbPut(NS_SYSTEM, OWNER_ID_KEY, fresh);
  return fresh as UserId;
}

/**
 * 소유자 ID를 얻는다. 없으면 만들어 보관한다.
 *
 * 저장 경계가 매 연산마다 호출하므로 반드시 캐시된다.
 */
export function getOwnerId(): Promise<UserId> {
  if (_ownerIdPromise === null) {
    // 실패한 Promise를 캐시에 남기면 이후 모든 저장이 영구히 같은 오류로 죽는다.
    // 캐시를 비워 다음 호출이 다시 시도하게 한다.
    _ownerIdPromise = resolveOwnerId().catch((err: unknown) => {
      _ownerIdPromise = null;
      throw err;
    });
  }
  return _ownerIdPromise;
}

/** 테스트 전용. 캐시를 비워 다음 호출이 다시 결정하게 한다. */
export function __resetOwnerIdCacheForTests(): void {
  _ownerIdPromise = null;
}
