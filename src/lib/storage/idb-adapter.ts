/**
 * IndexedDB 스토리지 어댑터
 * 기존 indexeddb.ts의 idbGet/idbPut/idbDelete/idbList/idbClear를 래핑.
 *
 * namespace 매핑: namespace → IDBStoreName (동적 매핑 불가 — 등록된 store만)
 */

import type { StorageAdapter } from './storage-adapter';
import { StorageError } from './storage-adapter';
import {
  isIDBAvailable,
  idbGet,
  idbPut,
  idbDelete,
  idbList,
  idbClear,
  STORE_INSTALLED_APPS,
  STORE_USER_APPS,
  STORE_DESKTOP_LAYOUT,
  STORE_DESKTOP_SETTINGS,
} from './indexeddb';
import type { IDBStoreName } from './indexeddb';

const NAMESPACE_MAP: Record<string, IDBStoreName> = {
  'installed-apps': STORE_INSTALLED_APPS,
  'user-apps': STORE_USER_APPS,
  'desktop-layout': STORE_DESKTOP_LAYOUT,
  'desktop-settings': STORE_DESKTOP_SETTINGS,
};

function resolveStoreName(namespace: string): IDBStoreName {
  const storeName = NAMESPACE_MAP[namespace];
  if (storeName === undefined) {
    throw new StorageError(
      `Unknown namespace "${namespace}". Registered: ${Object.keys(NAMESPACE_MAP).join(', ')}`,
      'indexeddb',
    );
  }
  return storeName;
}

export function isIDBAdapterAvailable(): boolean {
  return isIDBAvailable();
}

export function createIDBAdapter(): StorageAdapter {
  return {
    name: 'indexeddb',

    async get<T>(namespace: string, key: string): Promise<T | undefined> {
      try {
        return await idbGet<T>(resolveStoreName(namespace), key);
      } catch (e) {
        throw new StorageError('get failed', 'indexeddb', e);
      }
    },

    async put<T>(namespace: string, key: string, value: T): Promise<void> {
      try {
        await idbPut(resolveStoreName(namespace), key, value);
      } catch (e) {
        throw new StorageError('put failed', 'indexeddb', e);
      }
    },

    async delete(namespace: string, key: string): Promise<void> {
      try {
        await idbDelete(resolveStoreName(namespace), key);
      } catch (e) {
        throw new StorageError('delete failed', 'indexeddb', e);
      }
    },

    async list<T>(namespace: string): Promise<ReadonlyArray<{ key: string; value: T }>> {
      try {
        return await idbList<T>(resolveStoreName(namespace));
      } catch (e) {
        throw new StorageError('list failed', 'indexeddb', e);
      }
    },

    async clear(namespace: string): Promise<void> {
      try {
        await idbClear(resolveStoreName(namespace));
      } catch (e) {
        throw new StorageError('clear failed', 'indexeddb', e);
      }
    },
  };
}
