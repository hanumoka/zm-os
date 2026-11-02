import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { TEST_LIMITS, type AppSessionView } from '@zm/platform-contracts';
import { captureStorageLease, clearAppStorage, getAppStorage, removeAppStorage, setAppStorage, StorageLeaseExpiredError, validateJson } from './storage';
import { checkRequest } from './index';

describe('current user and app local storage', () => {
  it('isolates both dimensions and clears only the selected partition', async () => {
    await setAppStorage('alice', 'notes', 'same', 'alice-note');
    await setAppStorage('bob', 'notes', 'same', 'bob-note');
    await setAppStorage('alice', 'other', 'same', 'other-app');
    await clearAppStorage('alice', 'notes');
    expect(await getAppStorage('alice', 'notes', 'same')).toBeNull();
    expect(await getAppStorage('bob', 'notes', 'same')).toBe('bob-note');
    expect(await getAppStorage('alice', 'other', 'same')).toBe('other-app');
  });
  it('checks the aggregate quota in the same transaction as the write', async () => {
    const value = 'a'.repeat(Math.ceil(TEST_LIMITS.localBytes / 2));
    const outcomes = await Promise.allSettled([setAppStorage('quota', 'app', 'a', value), setAppStorage('quota', 'app', 'b', value)]);
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(outcome => outcome.status === 'rejected')).toHaveLength(1);
    await clearAppStorage('quota', 'app');
  });
  it('serializes a pre-delete write and rejects stale writes and removals from another connection', async () => {
    const lease = await captureStorageLease('epoch', 'notes');
    await setAppStorage('epoch', 'notes', 'key', 'before', lease);
    vi.resetModules();
    const secondConnection = await import('./storage');
    const concurrent = await Promise.allSettled([
      setAppStorage('epoch', 'notes', 'key', 'racing', lease),
      secondConnection.clearAppStorage('epoch', 'notes'),
    ]);
    expect(concurrent[1]?.status).toBe('fulfilled');
    expect(await getAppStorage('epoch', 'notes', 'key')).toBeNull();
    await expect(setAppStorage('epoch', 'notes', 'key', 'late', lease)).rejects.toBeInstanceOf(StorageLeaseExpiredError);
    const fresh = await captureStorageLease('epoch', 'notes');
    await setAppStorage('epoch', 'notes', 'key', 'new execution', fresh);
    await expect(removeAppStorage('epoch', 'notes', 'key', lease)).rejects.toBeInstanceOf(StorageLeaseExpiredError);
    await expect(getAppStorage('epoch', 'notes', 'key', lease)).rejects.toBeInstanceOf(StorageLeaseExpiredError);
    expect(await getAppStorage('epoch', 'notes', 'key', fresh)).toBe('new execution');
  });
  it('keeps other user, app and preview generations valid after a published partition is cleared', async () => {
    const scopes = [['scope-user', 'scope-app'], ['other-user', 'scope-app'], ['scope-user', 'other-app'], ['scope-user', 'preview:scope-app']] as const;
    const leases = await Promise.all(scopes.map(([user, app]) => captureStorageLease(user, app)));
    await clearAppStorage('scope-user', 'scope-app');
    await expect(setAppStorage('scope-user', 'scope-app', 'key', 'stale', leases[0])).rejects.toBeInstanceOf(StorageLeaseExpiredError);
    for (const lease of leases.slice(1)) {
      await setAppStorage(lease.userId, lease.appId, 'key', 'valid', lease);
      expect(await getAppStorage(lease.userId, lease.appId, 'key', lease)).toBe('valid');
    }
  });
  it('aborts a queued put when disposed and prevents later writes from the same execution', async () => {
    const abort = new AbortController();
    const lease = await captureStorageLease('dispose', 'app', abort.signal);
    const put = IDBObjectStore.prototype.put;
    const intercepted = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      const request = put.apply(this, args); abort.abort(); return request;
    });
    try { await expect(setAppStorage('dispose', 'app', 'key', 'uncommitted', lease)).rejects.toThrow('종료된 앱'); }
    finally { intercepted.mockRestore(); }
    expect(await getAppStorage('dispose', 'app', 'key')).toBeNull();
    await expect(setAppStorage('dispose', 'app', 'key', 'late', lease)).rejects.toThrow('종료된 앱');
  });
  it('rejects values that cannot round trip as JSON', () => {
    expect(() => validateJson(Number.NaN)).toThrow();
    expect(() => validateJson(new Date())).toThrow();
    expect(() => validateJson({ bad: undefined })).toThrow();
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    expect(() => validateJson(cycle)).toThrow();
  });
});

const session: AppSessionView = {
  id: 'session', appId: 'app', versionId: 'version', appUserId: 'private-app-user', expiresAt: '2026-12-01T00:00:00Z', documentUrl: 'http://127.0.0.1:4311/index.html',
  manifest: { schemaVersion: 1, appId: '00000000-0000-4000-8000-000000000001', version: '1.0.0', name: 'notes', description: 'notes', category: 'tools', entry: 'index.html', permissions: ['local-storage'], apiOrigins: [], privacyNotice: 'local' },
};
describe('SDK request boundary', () => {
  it('rejects caller-selected user or app scope', () => {
    expect(() => checkRequest({ id: '1', method: 'storage.get', params: { key: 'note', userId: 'bob' } }, session)).toThrow();
  });
  it('requires the reviewed permission', () => {
    expect(() => checkRequest({ id: '1', method: 'identity.getAppUser', params: {} }, session)).toThrow();
    expect(() => checkRequest({ id: '2', method: 'storage.get', params: { key: 'note' } }, session)).not.toThrow();
  });
  it('rejects oversized messages without touching storage', () => {
    expect(() => checkRequest({ id: '1', method: 'storage.set', params: { key: 'note', value: 'x'.repeat(TEST_LIMITS.messageBytes) } }, session)).toThrow();
  });
});
