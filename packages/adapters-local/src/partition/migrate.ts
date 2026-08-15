/**
 * 접두사 도입 시점의 기존 데이터 흡수 (zm-docs `contracts.md` §2)
 *
 * 접두사가 생기기 전에 쓰인 평문 키가 로컬 브라우저에 남아 있다. 그대로 두면 다음
 * 부팅에서 전부 안 보이게 되어, 설치한 앱과 아이콘 배치가 조용히 사라진 것처럼 보인다.
 * 정책 2절의 "조용한 재초기화 금지"가 그대로 적용되는 상황이라 흡수한다.
 *
 * ⚠️ **이 규칙은 소유자가 1명인 동안에만 성립한다.**
 * 계정이 2개가 되면 "내 접두사가 아닌 키"는 레거시가 아니라 **남의 레코드**이고,
 * 그때 이 코드가 살아 있으면 남의 데이터를 내 것으로 흡수한다.
 * 다중 사용자를 열기 전에 이 모듈을 삭제한다.
 *
 * 저수준 idb CRUD를 직접 쓴다 — 접두사가 붙지 않은 원본 키를 봐야 하므로 파티션
 * 경계 아래에서 동작해야 한다. 파티션 경계를 통과하면 레거시 키는 보이지 않는다.
 *
 * @module adapters-local/partition/migrate
 */

import { NAMESPACE_REGISTRY, NS_SYSTEM, isUnscopedLegacyKey, scopeKey } from '@zm/core';
import type { NamespaceId, UserId } from '@zm/core';
import { idbGet, idbPut, idbDelete, idbList } from '../blob-storage/indexeddb';
import { getOwnerId } from './owner-id';

/** 흡수를 이미 끝냈다는 표시. `system`에 둔다 — 파티션되지 않는 namespace다. */
export const PARTITION_MIGRATION_KEY = 'partition-migrated-at';

let _migrationPromise: Promise<void> | null = null;

function partitionedNamespaces(): ReadonlyArray<NamespaceId> {
  return NAMESPACE_REGISTRY.filter((e) => e.partition === 'scoped').map((e) => e.name);
}

async function migrateNamespace(ownerId: UserId, namespace: NamespaceId): Promise<number> {
  const entries = await idbList<unknown>(namespace);
  let moved = 0;

  for (const { key, value } of entries) {
    if (!isUnscopedLegacyKey(ownerId, key)) continue;

    // 이미 같은 이름의 접두사 키가 있으면 덮어쓰지 않는다. 접두사 쪽이 새 데이터다.
    const target = scopeKey(ownerId, key);
    const existing = await idbGet<unknown>(namespace, target);
    if (existing === undefined) {
      await idbPut(namespace, target, value);
      moved += 1;
    }
    await idbDelete(namespace, key);
  }

  return moved;
}

async function runMigration(): Promise<void> {
  const done = await idbGet<unknown>(NS_SYSTEM, PARTITION_MIGRATION_KEY);
  if (typeof done === 'number') return;

  const ownerId = await getOwnerId();
  let total = 0;
  for (const namespace of partitionedNamespaces()) {
    total += await migrateNamespace(ownerId, namespace);
  }

  await idbPut(NS_SYSTEM, PARTITION_MIGRATION_KEY, Date.now());
  if (total > 0) {
    console.warn(`[zm-os partition] 접두사 없는 레코드 ${total}건을 소유자 파티션으로 옮겼습니다`);
  }
}

/**
 * 흡수를 1회 수행한다. 이미 끝났으면 즉시 반환한다.
 *
 * 저장 경계가 모든 연산 앞에서 이것을 기다린다. 기다리지 않으면 흡수 전에 읽은
 * 호출자가 "데이터 없음"을 보고, 그 상태로 기본값을 저장해버릴 수 있다.
 */
export function ensurePartitionMigrated(): Promise<void> {
  if (_migrationPromise === null) {
    _migrationPromise = runMigration().catch((err: unknown) => {
      // 실패를 캐시에 남기면 저장이 영구히 죽는다. 다음 호출이 다시 시도하게 한다.
      _migrationPromise = null;
      throw err;
    });
  }
  return _migrationPromise;
}

/** 테스트 전용. */
export function __resetPartitionMigrationForTests(): void {
  _migrationPromise = null;
}
