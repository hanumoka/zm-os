import { describe, it, expect, beforeEach } from 'vitest';
import { PortError } from '@zm/core';
import type { AppManifest, AppRecord, AppRepository, UserId } from '@zm/core';
import { createMemoryBlobStorage } from '../../blob-storage';
import { createLocalAppRepository } from '../local-app-repository';
import { createTestAppRepository, TEST_OWNER_ID } from '../testing';

function manifestOf(id: string): AppManifest {
  return {
    schemaVersion: 2,
    id,
    name: id,
    version: '1.0.0',
    entryPoint: 'index.html',
    size: { defaultWidth: 800, defaultHeight: 600 },
    sandbox: { storage: 'isolated', network: 'none', clipboard: false },
    capabilities: [],
  };
}

function userApp(id: string, extra?: Partial<AppRecord>): AppRecord {
  return {
    manifest: manifestOf(id),
    source: 'user',
    installedAt: 1,
    contentRef: { kind: 'blob-ref', blobKey: id },
    ownerId: TEST_OWNER_ID,
    ...extra,
  };
}

describe('createLocalAppRepository', () => {
  let repo: AppRepository;

  beforeEach(() => {
    repo = createLocalAppRepository(createMemoryBlobStorage(), { ownerId: TEST_OWNER_ID });
  });

  it('descriptor는 app-repository / local-idb', () => {
    expect(repo.descriptor.portName).toBe('app-repository');
    expect(repo.descriptor.adapterName).toBe('local-idb');
    expect(repo.descriptor.capabilities).toContain('built-in-passthrough');
  });

  it('upsert + get round-trip', async () => {
    const app = userApp('a');
    await repo.upsert(app);
    expect(await repo.get('a')).toEqual(app);
  });

  it('get 없는 id → null', async () => {
    expect(await repo.get('missing')).toBeNull();
  });

  it('list({source:"user"}) / 무필터 → user 앱 반환', async () => {
    await repo.upsert(userApp('a'));
    await repo.upsert(userApp('b'));
    expect((await repo.list({ source: 'user' })).map((r) => r.manifest.id).sort()).toEqual(['a', 'b']);
    expect((await repo.list()).length).toBe(2);
  });

  it('list({source:"built-in"}) → [] (built-in-passthrough)', async () => {
    await repo.upsert(userApp('a'));
    expect(await repo.list({ source: 'built-in' })).toEqual([]);
  });

  it('upsert source!=="user" → PortError INVALID_SOURCE', async () => {
    const builtIn: AppRecord = {
      manifest: manifestOf('x'),
      source: 'built-in',
      installedAt: 1,
      contentRef: { kind: 'built-in-url', url: '/x.html' },
      ownerId: TEST_OWNER_ID,
    };
    await expect(repo.upsert(builtIn)).rejects.toBeInstanceOf(PortError);
    await expect(repo.upsert(builtIn)).rejects.toMatchObject({
      port: 'app-repository',
      code: 'INVALID_SOURCE',
    });
  });

  it('remove → get null', async () => {
    await repo.upsert(userApp('a'));
    await repo.remove('a');
    expect(await repo.get('a')).toBeNull();
  });

  it('remove cascade → installed 마크도 제거', async () => {
    await repo.upsert(userApp('a'));
    await repo.markInstalled('a');
    expect(await repo.listInstalled()).toContain('a');
    await repo.remove('a');
    expect(await repo.listInstalled()).not.toContain('a');
  });

  it('markInstalled / unmarkInstalled / listInstalled', async () => {
    await repo.markInstalled('a');
    await repo.markInstalled('b');
    // listInstalled는 ReadonlyArray를 반환한다 — 제자리 정렬하지 않고 복사본을 정렬한다.
    expect([...(await repo.listInstalled())].sort()).toEqual(['a', 'b']);
    await repo.unmarkInstalled('a');
    expect(await repo.listInstalled()).toEqual(['b']);
  });

  it('ownerId 없는 레거시 레코드는 읽는 시점에 이 저장소의 소유자로 채워진다', async () => {
    const blob = createMemoryBlobStorage();
    const owned = createLocalAppRepository(blob, { ownerId: 'u-1' as UserId });
    // 접두사·소유자 필드가 도입되기 전 형태를 어댑터를 거치지 않고 직접 심는다.
    const { ownerId: _drop, ...legacy } = userApp('a');
    await blob.put('user-apps', 'a', legacy);

    expect((await owned.get('a'))?.ownerId).toBe('u-1');
  });

  it('다른 소유자의 레코드를 쓰면 거부한다 — 키와 필드가 어긋나는 것을 막는다', async () => {
    const owned = createLocalAppRepository(createMemoryBlobStorage(), {
      ownerId: 'u-1' as UserId,
    });
    const foreign = owned.upsert(userApp('a', { ownerId: 'u-2' as UserId }));
    await expect(foreign).rejects.toMatchObject({
      port: 'app-repository',
      code: 'OWNER_MISMATCH',
    });
  });

  it('list ownerId 필터 — 저장소 소유자가 아니면 비어 있다', async () => {
    const owned = createLocalAppRepository(createMemoryBlobStorage(), {
      ownerId: 'u-1' as UserId,
    });
    await owned.upsert(userApp('a', { ownerId: 'u-1' as UserId }));
    expect((await owned.list({ ownerId: 'u-1' as UserId })).map((r) => r.manifest.id)).toEqual(['a']);
    expect(await owned.list({ ownerId: 'u-2' as UserId })).toEqual([]);
  });

  it('AbortSignal 사전 abort → reject (BlobStorage 경유)', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(repo.get('a', { signal: ac.signal })).rejects.toThrow();
    await expect(repo.upsert(userApp('a'), { signal: ac.signal })).rejects.toThrow();
    await expect(repo.listInstalled({ signal: ac.signal })).rejects.toThrow();
  });
});

describe('createTestAppRepository', () => {
  it('주입 없이 동작하는 in-memory repo', async () => {
    const repo = createTestAppRepository();
    await repo.upsert(userApp('a'));
    expect(await repo.get('a')).not.toBeNull();
  });
});
