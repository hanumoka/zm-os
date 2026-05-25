/**
 * 메모리 스토리지 어댑터 (page reload 시 휘발)
 * 기존 indexeddb.ts _memoryStore 패턴을 StorageAdapter로 승격.
 */

import type { StorageAdapter } from './storage-adapter';

export function createMemoryAdapter(): StorageAdapter {
  const store = new Map<string, Map<string, unknown>>();

  function namespaceOf(ns: string): Map<string, unknown> {
    let m = store.get(ns);
    if (m === undefined) {
      m = new Map<string, unknown>();
      store.set(ns, m);
    }
    return m;
  }

  return {
    name: 'memory',

    async get<T>(namespace: string, key: string): Promise<T | undefined> {
      return namespaceOf(namespace).get(key) as T | undefined;
    },

    async put<T>(namespace: string, key: string, value: T): Promise<void> {
      namespaceOf(namespace).set(key, value);
    },

    async delete(namespace: string, key: string): Promise<void> {
      namespaceOf(namespace).delete(key);
    },

    async list<T>(namespace: string): Promise<ReadonlyArray<{ key: string; value: T }>> {
      const m = namespaceOf(namespace);
      return Array.from(m.entries()).map(([key, value]) => ({
        key,
        value: value as T,
      }));
    },

    async clear(namespace: string): Promise<void> {
      store.delete(namespace);
    },
  };
}
