/**
 * IndexedDB BlobStorage 어댑터 (ADR-0020)
 *
 * indexeddb.ts의 raw CRUD를 BlobStorage Port로 래핑.
 * AbortSignal: 메서드 진입 시 throwIfAborted (idb 자체는 AbortSignal 미지원,
 * 작업 단위가 단일 트랜잭션이라 mid-operation cancel 무의미 — ADR-0020 §D2).
 */

import type { AdapterDescriptor, BlobStorage, PortCallOptions } from '@zm/core';
import { isRegisteredNamespace, NAMESPACE_REGISTRY } from '@zm/core';
import { BlobStorageError } from './errors';
import {
  isIDBAvailable,
  idbGet,
  idbPut,
  idbDelete,
  idbList,
  idbClear,
} from './indexeddb';
import type { IDBStoreName } from './indexeddb';

const DESCRIPTOR: AdapterDescriptor = {
  portName: 'blob-storage',
  adapterName: 'local-idb',
  version: '1.0.0',
  capabilities: ['namespace-list', 'persistent'],
};

function resolveStoreName(namespace: string): IDBStoreName {
  if (!isRegisteredNamespace(namespace)) {
    const registered = NAMESPACE_REGISTRY.map((e) => e.name).join(', ');
    throw new BlobStorageError(
      `Unknown namespace "${namespace}". Registered: ${registered}`,
      'UNKNOWN_NAMESPACE',
    );
  }
  return namespace;
}

export function isIDBAdapterAvailable(): boolean {
  return isIDBAvailable();
}

export function createIDBBlobStorage(): BlobStorage {
  return {
    descriptor: DESCRIPTOR,

    async get<T>(namespace: string, key: string, opts?: PortCallOptions): Promise<T | undefined> {
      opts?.signal?.throwIfAborted();
      try {
        return await idbGet<T>(resolveStoreName(namespace), key);
      } catch (e) {
        if (e instanceof BlobStorageError) throw e;
        throw new BlobStorageError('get failed', 'GET_FAILED', e);
      }
    },

    async put<T>(namespace: string, key: string, value: T, opts?: PortCallOptions): Promise<void> {
      opts?.signal?.throwIfAborted();
      try {
        await idbPut(resolveStoreName(namespace), key, value);
      } catch (e) {
        if (e instanceof BlobStorageError) throw e;
        throw new BlobStorageError('put failed', 'PUT_FAILED', e);
      }
    },

    async delete(namespace: string, key: string, opts?: PortCallOptions): Promise<void> {
      opts?.signal?.throwIfAborted();
      try {
        await idbDelete(resolveStoreName(namespace), key);
      } catch (e) {
        if (e instanceof BlobStorageError) throw e;
        throw new BlobStorageError('delete failed', 'DELETE_FAILED', e);
      }
    },

    async list<T>(
      namespace: string,
      opts?: PortCallOptions,
    ): Promise<ReadonlyArray<{ key: string; value: T }>> {
      opts?.signal?.throwIfAborted();
      try {
        return await idbList<T>(resolveStoreName(namespace));
      } catch (e) {
        if (e instanceof BlobStorageError) throw e;
        throw new BlobStorageError('list failed', 'LIST_FAILED', e);
      }
    },

    async clear(namespace: string, opts?: PortCallOptions): Promise<void> {
      opts?.signal?.throwIfAborted();
      try {
        await idbClear(resolveStoreName(namespace));
      } catch (e) {
        if (e instanceof BlobStorageError) throw e;
        throw new BlobStorageError('clear failed', 'CLEAR_FAILED', e);
      }
    },
  };
}
