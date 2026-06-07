/**
 * 메모리 BlobStorage 어댑터 (page reload 시 휘발)
 *
 * ADR-0020 §D6: runtime 폴백(Safari Private Browsing) + 테스트 주입(testing.ts)에 사용.
 * AbortSignal: 메서드 진입 시 throwIfAborted (작업 단위가 단순 Map 연산).
 */

import type { AdapterDescriptor, BlobStorage, PortCallOptions } from '@zm/core';

const DESCRIPTOR: AdapterDescriptor = {
  portName: 'blob-storage',
  adapterName: 'local-memory',
  version: '1.0.0',
  capabilities: ['namespace-list', 'volatile'],
};

export function createMemoryBlobStorage(): BlobStorage {
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
    descriptor: DESCRIPTOR,

    async get<T>(namespace: string, key: string, opts?: PortCallOptions): Promise<T | undefined> {
      opts?.signal?.throwIfAborted();
      return namespaceOf(namespace).get(key) as T | undefined;
    },

    async put<T>(namespace: string, key: string, value: T, opts?: PortCallOptions): Promise<void> {
      opts?.signal?.throwIfAborted();
      namespaceOf(namespace).set(key, value);
    },

    async delete(namespace: string, key: string, opts?: PortCallOptions): Promise<void> {
      opts?.signal?.throwIfAborted();
      namespaceOf(namespace).delete(key);
    },

    async list<T>(
      namespace: string,
      opts?: PortCallOptions,
    ): Promise<ReadonlyArray<{ key: string; value: T }>> {
      opts?.signal?.throwIfAborted();
      const m = namespaceOf(namespace);
      return Array.from(m.entries()).map(([key, value]) => ({ key, value: value as T }));
    },

    async clear(namespace: string, opts?: PortCallOptions): Promise<void> {
      opts?.signal?.throwIfAborted();
      store.delete(namespace);
    },
  };
}
