import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';

it('upgrades existing v1 entries without discarding their values', async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('zm-platform-app-storage-v1', 1);
    request.onupgradeneeded = (): void => {
      const store = request.result.createObjectStore('entries', { keyPath: ['userId', 'appId', 'key'] });
      store.createIndex('partition', ['userId', 'appId']);
      store.put({ userId: 'existing', appId: 'app', key: 'memo', value: 'preserved', bytes: 13 });
    };
    request.onsuccess = (): void => { request.result.close(); resolve(); };
    request.onerror = (): void => reject(request.error);
  });
  const storage = await import('./storage');
  const lease = await storage.captureStorageLease('existing', 'app');
  expect(await storage.getAppStorage('existing', 'app', 'memo', lease)).toBe('preserved');
  await storage.clearAppStorage('existing', 'app');
  await expect(storage.setAppStorage('existing', 'app', 'memo', 'late', lease)).rejects.toBeInstanceOf(storage.StorageLeaseExpiredError);
  expect(await storage.getAppStorage('existing', 'app', 'memo')).toBeNull();
});
