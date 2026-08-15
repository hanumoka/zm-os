/**
 * 파티션 경계 동작 검증 (zm-docs `contracts.md` §2)
 *
 * 안쪽 어댑터를 직접 들여다보는 테스트다 — 경계가 실제로 접두사를 **쓰는지**
 * 확인해야 하기 때문이다. 경계를 통해서만 보면 접두사를 아예 안 붙여도
 * 왕복 테스트는 전부 통과한다.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { NS_SYSTEM, NS_USER_APPS, scopeKey } from '@zm/core';
import type { BlobStorage, UserId } from '@zm/core';
import { createMemoryBlobStorage } from '../memory-adapter';
import { withPartition } from '../partitioned';

const OWNER = '2f6b0c9e-4a11-4d3f-9c22-8f0a1b2c3d4e' as UserId;
const OTHER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' as UserId;

let inner: BlobStorage;
let scoped: BlobStorage;

beforeEach(() => {
  inner = createMemoryBlobStorage();
  scoped = withPartition(inner, {
    resolveOwnerId: () => Promise.resolve(OWNER),
    migrate: () => Promise.resolve(),
  });
});

describe('쓰기', () => {
  it('안쪽 저장소에는 접두사가 붙은 키로 들어간다', async () => {
    await scoped.put(NS_USER_APPS, 'snake', { v: 1 });

    expect(await inner.get(NS_USER_APPS, scopeKey(OWNER, 'snake'))).toEqual({ v: 1 });
    expect(await inner.get(NS_USER_APPS, 'snake')).toBeUndefined();
  });

  it('바깥에서는 접두사가 보이지 않는다', async () => {
    await scoped.put(NS_USER_APPS, 'snake', { v: 1 });
    expect(await scoped.get(NS_USER_APPS, 'snake')).toEqual({ v: 1 });
  });
});

describe('목록', () => {
  it('키에서 접두사를 벗겨 돌려준다', async () => {
    await scoped.put(NS_USER_APPS, 'snake', 1);
    await scoped.put(NS_USER_APPS, 'tetris', 2);

    const keys = (await scoped.list(NS_USER_APPS)).map((e) => e.key).sort();
    expect(keys).toEqual(['snake', 'tetris']);
  });

  it('남의 레코드를 돌려주지 않는다', async () => {
    await inner.put(NS_USER_APPS, scopeKey(OTHER, 'their-app'), 'secret');
    await scoped.put(NS_USER_APPS, 'mine', 'ok');

    const entries = await scoped.list(NS_USER_APPS);
    expect(entries).toEqual([{ key: 'mine', value: 'ok' }]);
  });

  it('접두사 없는 레거시 키도 돌려주지 않는다 — 흡수는 별도 단계다', async () => {
    await inner.put(NS_USER_APPS, 'legacy', 'old');
    expect(await scoped.list(NS_USER_APPS)).toEqual([]);
  });
});

describe('삭제와 비우기', () => {
  it('delete는 내 접두사 키만 지운다', async () => {
    await inner.put(NS_USER_APPS, scopeKey(OTHER, 'snake'), 'theirs');
    await scoped.put(NS_USER_APPS, 'snake', 'mine');

    await scoped.delete(NS_USER_APPS, 'snake');

    expect(await inner.get(NS_USER_APPS, scopeKey(OWNER, 'snake'))).toBeUndefined();
    expect(await inner.get(NS_USER_APPS, scopeKey(OTHER, 'snake'))).toBe('theirs');
  });

  it('clear는 objectStore 전체를 비우지 않는다', async () => {
    await inner.put(NS_USER_APPS, scopeKey(OTHER, 'theirs'), 'keep');
    await inner.put(NS_USER_APPS, 'legacy', 'keep');
    await scoped.put(NS_USER_APPS, 'mine', 'drop');

    await scoped.clear(NS_USER_APPS);

    expect(await inner.get(NS_USER_APPS, scopeKey(OWNER, 'mine'))).toBeUndefined();
    expect(await inner.get(NS_USER_APPS, scopeKey(OTHER, 'theirs'))).toBe('keep');
    expect(await inner.get(NS_USER_APPS, 'legacy')).toBe('keep');
  });
});

describe('파티션하지 않는 namespace', () => {
  it('system은 접두사 없이 그대로 저장한다 — 순환을 피하기 위해서다', async () => {
    await scoped.put(NS_SYSTEM, 'owner-id', OWNER);

    expect(await inner.get(NS_SYSTEM, 'owner-id')).toBe(OWNER);
    expect(await inner.get(NS_SYSTEM, scopeKey(OWNER, 'owner-id'))).toBeUndefined();
  });

  it('system 목록은 있는 그대로 돌려준다', async () => {
    await scoped.put(NS_SYSTEM, 'owner-id', OWNER);
    expect(await scoped.list(NS_SYSTEM)).toEqual([{ key: 'owner-id', value: OWNER }]);
  });
});

describe('descriptor', () => {
  it('파티션 적용 여부를 실행 중에 관측할 수 있다', () => {
    expect(scoped.descriptor.capabilities).toContain('owner-partitioned');
    expect(scoped.descriptor.adapterName).toBe(inner.descriptor.adapterName);
  });
});
