import { describe, it, expect, beforeEach } from 'vitest';
import { PortError } from '@zm/core';
import type { AppManifest, AppRecord, AppRepository, UserId } from '@zm/core';
import { createMemoryBlobStorage } from '../../blob-storage';
import { createLocalAppRepository } from '../local-app-repository';
import { createTestAppRepository } from '../testing';

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
    ...extra,
  };
}

describe('createLocalAppRepository', () => {
  let repo: AppRepository;

  beforeEach(() => {
    repo = createLocalAppRepository(createMemoryBlobStorage());
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
    expect((await repo.listInstalled()).sort()).toEqual(['a', 'b']);
    await repo.unmarkInstalled('a');
    expect(await repo.listInstalled()).toEqual(['b']);
  });

  it('defaultOwnerId — ownerId 미지정 시 자동 채움', async () => {
    const owned = createLocalAppRepository(createMemoryBlobStorage(), {
      defaultOwnerId: 'u-1' as UserId,
    });
    await owned.upsert(userApp('a'));
    expect((await owned.get('a'))?.ownerId).toBe('u-1');
  });

  it('defaultOwnerId — record.ownerId 있으면 보존', async () => {
    const owned = createLocalAppRepository(createMemoryBlobStorage(), {
      defaultOwnerId: 'u-1' as UserId,
    });
    await owned.upsert(userApp('a', { ownerId: 'u-2' as UserId }));
    expect((await owned.get('a'))?.ownerId).toBe('u-2');
  });

  it('list ownerId 필터', async () => {
    const owned = createLocalAppRepository(createMemoryBlobStorage());
    await owned.upsert(userApp('a', { ownerId: 'u-1' as UserId }));
    await owned.upsert(userApp('b', { ownerId: 'u-2' as UserId }));
    expect((await owned.list({ ownerId: 'u-1' as UserId })).map((r) => r.manifest.id)).toEqual(['a']);
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
