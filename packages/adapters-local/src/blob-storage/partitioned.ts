/**
 * 파티션 경계 — 저장 어댑터를 감싸 소유자 접두사를 적용한다.
 *
 * zm-docs `contracts.md` §2가 정한 **단 하나의 적용 지점**이다. 도메인 래퍼마다
 * 접두사를 붙이지 않는 이유는 새 래퍼를 만들 때 빠뜨리고, 빠뜨린 것을 검출할 방법이
 * 없기 때문이다. 여기 한 곳이면 "접두사 없는 키는 존재할 수 없다"가 구조로 보장된다.
 *
 * 경계 **바깥에서는 파티션이 없는 것처럼 보여야 한다.** 그래서
 * - `list()`는 내 것만 돌려주고 키에서 접두사를 벗긴다
 * - `clear()`는 내 것만 지운다 (objectStore 전체를 비우지 않는다)
 *
 * 이 둘을 빠뜨리면 호출자가 접두사 붙은 키를 앱 ID로 쓰거나, 다중 사용자에서
 * 남의 데이터를 지운다.
 *
 * @module adapters-local/blob-storage/partitioned
 */

import { isPartitionedNamespace, scopeKey, unscopeKey } from '@zm/core';
import type { AdapterDescriptor, BlobStorage, PortCallOptions, UserId } from '@zm/core';
import { getOwnerId } from '../partition/owner-id';
import { ensurePartitionMigrated } from '../partition/migrate';

export type PartitionOptions = {
  /** 소유자 ID 결정 방법. 테스트가 주입한다. 기본값은 `system` namespace의 UUID. */
  readonly resolveOwnerId?: () => Promise<UserId>;
  /** 접두사 도입 전 데이터 흡수. 테스트가 끈다. */
  readonly migrate?: () => Promise<void>;
};

/**
 * 어댑터를 파티션 경계로 감싼다.
 *
 * `descriptor`에 `partitioned`를 더해, 실행 중에 어떤 어댑터가 파티션을 적용하고
 * 있는지 관측할 수 있게 한다. 이게 없으면 "적용되고 있다"를 코드로만 믿어야 한다.
 */
export function withPartition(inner: BlobStorage, opts?: PartitionOptions): BlobStorage {
  const resolveOwner = opts?.resolveOwnerId ?? getOwnerId;
  const migrate = opts?.migrate ?? ensurePartitionMigrated;

  const descriptor: AdapterDescriptor = {
    ...inner.descriptor,
    capabilities: [...inner.descriptor.capabilities, 'owner-partitioned'],
  };

  /** 해당 namespace에서 쓸 접두사. 파티션 대상이 아니면 `null`. */
  async function ownerFor(namespace: string): Promise<UserId | null> {
    if (!isPartitionedNamespace(namespace)) return null;
    await migrate();
    return await resolveOwner();
  }

  return {
    descriptor,

    async get<T>(namespace: string, key: string, callOpts?: PortCallOptions): Promise<T | undefined> {
      const owner = await ownerFor(namespace);
      if (owner === null) return inner.get<T>(namespace, key, callOpts);
      return inner.get<T>(namespace, scopeKey(owner, key), callOpts);
    },

    async put<T>(namespace: string, key: string, value: T, callOpts?: PortCallOptions): Promise<void> {
      const owner = await ownerFor(namespace);
      if (owner === null) return inner.put<T>(namespace, key, value, callOpts);
      return inner.put<T>(namespace, scopeKey(owner, key), value, callOpts);
    },

    async delete(namespace: string, key: string, callOpts?: PortCallOptions): Promise<void> {
      const owner = await ownerFor(namespace);
      if (owner === null) return inner.delete(namespace, key, callOpts);
      return inner.delete(namespace, scopeKey(owner, key), callOpts);
    },

    async list<T>(
      namespace: string,
      callOpts?: PortCallOptions,
    ): Promise<ReadonlyArray<{ key: string; value: T }>> {
      const owner = await ownerFor(namespace);
      const all = await inner.list<T>(namespace, callOpts);
      if (owner === null) return all;

      const mine: Array<{ key: string; value: T }> = [];
      for (const entry of all) {
        const bare = unscopeKey(owner, entry.key);
        if (bare === null) continue; // 남의 것. 오류가 아니라 정상적인 건너뛰기다.
        mine.push({ key: bare, value: entry.value });
      }
      return mine;
    },

    async clear(namespace: string, callOpts?: PortCallOptions): Promise<void> {
      const owner = await ownerFor(namespace);
      if (owner === null) return inner.clear(namespace, callOpts);

      // 내 것만 지운다. inner.clear()는 objectStore 전체를 비우므로 쓸 수 없다.
      const all = await inner.list<unknown>(namespace, callOpts);
      for (const entry of all) {
        if (unscopeKey(owner, entry.key) === null) continue;
        await inner.delete(namespace, entry.key, callOpts);
      }
    },
  };
}
