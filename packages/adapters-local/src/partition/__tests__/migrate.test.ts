/**
 * 접두사 도입 시점의 기존 데이터 흡수 (zm-docs `contracts.md` §2)
 *
 * Node에는 IndexedDB가 없으므로 `indexeddb.ts`의 메모리 폴백 위에서 돈다.
 * 폴백은 모듈 전역이라 테스트마다 비워야 한다.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { NS_INSTALLED_APPS, NS_SYSTEM, NS_USER_APPS, scopeKey } from '@zm/core';
import { idbClear, idbGet, idbList, idbPut } from '../../blob-storage/indexeddb';
import { __resetOwnerIdCacheForTests, getOwnerId } from '../owner-id';
import {
  PARTITION_MIGRATION_KEY,
  __resetPartitionMigrationForTests,
  ensurePartitionMigrated,
} from '../migrate';

beforeEach(async () => {
  await idbClear(NS_INSTALLED_APPS);
  await idbClear(NS_USER_APPS);
  await idbClear(NS_SYSTEM);
  __resetOwnerIdCacheForTests();
  __resetPartitionMigrationForTests();
});

describe('소유자 ID 부트스트랩', () => {
  it('처음 부르면 만들어 보관하고, 두 번째부터는 같은 값을 준다', async () => {
    const first = await getOwnerId();
    __resetOwnerIdCacheForTests();
    expect(await getOwnerId()).toBe(first);
    expect(await idbGet(NS_SYSTEM, 'owner-id')).toBe(first);
  });

  it("리터럴 'local'을 쓰지 않는다", async () => {
    // 리터럴을 쓰면 실제 계정이 생기는 순간 전 키를 다시 써야 해서
    // "마이그레이션 0"이라는 접두사 도입 근거가 무너진다.
    expect(await getOwnerId()).not.toBe('local');
  });

  it('저장된 값이 구분자를 포함해 깨져 있으면 새로 만든다', async () => {
    await idbPut(NS_SYSTEM, 'owner-id', 'bad:value');
    const owner = await getOwnerId();
    expect(owner).not.toBe('bad:value');
    expect(owner).not.toContain(':');
  });

  it('동시에 여러 번 불러도 하나만 만든다', async () => {
    // 값이 아니라 Promise를 캐시하는 이유. 값 캐시라면 각자 "없다"를 보고 각자 만든다.
    const ids = await Promise.all([getOwnerId(), getOwnerId(), getOwnerId()]);
    expect(new Set(ids).size).toBe(1);
  });
});

describe('레거시 키 흡수', () => {
  it('접두사 없는 레코드를 내 파티션으로 옮기고 원본을 지운다', async () => {
    await idbPut(NS_INSTALLED_APPS, 'sample-snake', { id: 'sample-snake', installedAt: 1 });

    await ensurePartitionMigrated();
    const owner = await getOwnerId();

    expect(await idbGet(NS_INSTALLED_APPS, scopeKey(owner, 'sample-snake'))).toEqual({
      id: 'sample-snake',
      installedAt: 1,
    });
    expect(await idbGet(NS_INSTALLED_APPS, 'sample-snake')).toBeUndefined();
  });

  it('여러 namespace를 함께 훑는다', async () => {
    await idbPut(NS_INSTALLED_APPS, 'a', 1);
    await idbPut(NS_USER_APPS, 'b', 2);

    await ensurePartitionMigrated();
    const owner = await getOwnerId();

    expect(await idbGet(NS_INSTALLED_APPS, scopeKey(owner, 'a'))).toBe(1);
    expect(await idbGet(NS_USER_APPS, scopeKey(owner, 'b'))).toBe(2);
  });

  it('접두사 쪽에 이미 값이 있으면 덮어쓰지 않는다', async () => {
    const owner = await getOwnerId();
    await idbPut(NS_USER_APPS, scopeKey(owner, 'x'), 'new');
    await idbPut(NS_USER_APPS, 'x', 'old');

    await ensurePartitionMigrated();

    expect(await idbGet(NS_USER_APPS, scopeKey(owner, 'x'))).toBe('new');
    expect(await idbGet(NS_USER_APPS, 'x')).toBeUndefined();
  });

  it('system namespace는 건드리지 않는다', async () => {
    await idbPut(NS_SYSTEM, 'some-flag', 'kept');
    await ensurePartitionMigrated();
    expect(await idbGet(NS_SYSTEM, 'some-flag')).toBe('kept');
  });

  it('완료를 기록해 두 번 돌지 않는다', async () => {
    await ensurePartitionMigrated();
    expect(typeof (await idbGet(NS_SYSTEM, PARTITION_MIGRATION_KEY))).toBe('number');

    // 흡수가 끝난 뒤 들어온 접두사 없는 키는 남의 것일 수 있다. 다시 돌면 흡수한다.
    await idbPut(NS_USER_APPS, 'arrived-later', 'not-mine');
    __resetPartitionMigrationForTests();
    await ensurePartitionMigrated();

    expect(await idbGet(NS_USER_APPS, 'arrived-later')).toBe('not-mine');
  });

  it('옮길 것이 없으면 아무것도 만들지 않는다', async () => {
    await ensurePartitionMigrated();
    expect(await idbList(NS_USER_APPS)).toEqual([]);
  });
});
