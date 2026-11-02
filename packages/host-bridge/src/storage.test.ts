import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { TEST_LIMITS, type AppSessionView } from '@zm/platform-contracts';
import { clearAppStorage, getAppStorage, setAppStorage, validateJson } from './storage';
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
