/**
 * OPFS (Origin Private File System) BlobStorage 어댑터 (ADR-0020)
 *
 * 디렉토리 구조: <OPFS root>/zm-os/<namespace>/<key>.json (JSON 직렬화).
 * AbortSignal: 메서드 진입 시 throwIfAborted + `list()` for-await loop **매 entry 폴링**
 * (ADR-0020 §D3 — 대규모 namespace cancel 응답성).
 *
 * 지원: Chrome 86+, Edge 86+, Firefox 111+. 미지원: Safari 18.x (createWritable 미지원).
 */

import type { AdapterDescriptor, BlobStorage, PortCallOptions } from '@zm/core';
import { BlobStorageError } from './errors';

const ROOT_DIR = 'zm-os';

const DESCRIPTOR: AdapterDescriptor = {
  portName: 'blob-storage',
  adapterName: 'local-opfs',
  version: '1.0.0',
  capabilities: ['namespace-list', 'persistent', 'file-backed'],
};

/**
 * OPFS createWritable API 사용 가능 여부 런타임 감지.
 * Safari 18.x는 getDirectory()는 지원하나 createWritable()은 미지원.
 */
export function isOPFSAvailable(): boolean {
  return (
    typeof globalThis.navigator !== 'undefined' &&
    typeof globalThis.navigator?.storage?.getDirectory === 'function' &&
    typeof globalThis.FileSystemWritableFileStream !== 'undefined'
  );
}

async function getRootDir(): Promise<FileSystemDirectoryHandle> {
  const opfsRoot = await navigator.storage.getDirectory();
  return opfsRoot.getDirectoryHandle(ROOT_DIR, { create: true });
}

async function getNamespaceDir(
  namespace: string,
  create: boolean,
): Promise<FileSystemDirectoryHandle | undefined> {
  try {
    const root = await getRootDir();
    return await root.getDirectoryHandle(namespace, { create });
  } catch {
    if (!create) return undefined;
    throw new BlobStorageError(`Failed to access namespace "${namespace}"`, 'PUT_FAILED');
  }
}

function fileKey(key: string): string {
  return `${key}.json`;
}

export function createOPFSBlobStorage(): BlobStorage {
  return {
    descriptor: DESCRIPTOR,

    async get<T>(namespace: string, key: string, opts?: PortCallOptions): Promise<T | undefined> {
      opts?.signal?.throwIfAborted();
      try {
        const dir = await getNamespaceDir(namespace, false);
        if (dir === undefined) return undefined;

        let fileHandle: FileSystemFileHandle;
        try {
          fileHandle = await dir.getFileHandle(fileKey(key));
        } catch {
          return undefined;
        }

        const file = await fileHandle.getFile();
        const text = await file.text();
        return JSON.parse(text) as T;
      } catch (e) {
        if (e instanceof BlobStorageError) throw e;
        throw new BlobStorageError('get failed', 'GET_FAILED', e);
      }
    },

    async put<T>(namespace: string, key: string, value: T, opts?: PortCallOptions): Promise<void> {
      opts?.signal?.throwIfAborted();
      try {
        const dir = await getNamespaceDir(namespace, true);
        if (dir === undefined) {
          throw new BlobStorageError(`Cannot create namespace "${namespace}"`, 'PUT_FAILED');
        }

        const fileHandle = await dir.getFileHandle(fileKey(key), { create: true });
        const writable = await fileHandle.createWritable();
        try {
          await writable.write(JSON.stringify(value));
        } finally {
          await writable.close();
        }
      } catch (e) {
        if (e instanceof BlobStorageError) throw e;
        throw new BlobStorageError('put failed', 'PUT_FAILED', e);
      }
    },

    async delete(namespace: string, key: string, opts?: PortCallOptions): Promise<void> {
      opts?.signal?.throwIfAborted();
      try {
        const dir = await getNamespaceDir(namespace, false);
        if (dir === undefined) return;

        try {
          await dir.removeEntry(fileKey(key));
        } catch {
          // key 부재 — 무시
        }
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
        const dir = await getNamespaceDir(namespace, false);
        if (dir === undefined) return [];

        const results: Array<{ key: string; value: T }> = [];
        // TS DOM types omit FileSystemDirectoryHandle.entries() (WICG File System spec)
        type DirWithEntries = FileSystemDirectoryHandle & {
          entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
        };
        for await (const [name, handle] of (dir as DirWithEntries).entries()) {
          opts?.signal?.throwIfAborted(); // ADR-0020 §D3: 매 entry 폴링
          if (handle.kind !== 'file' || !name.endsWith('.json')) continue;
          const file = await (handle as FileSystemFileHandle).getFile();
          const text = await file.text();
          const key = name.slice(0, -5); // .json 제거
          results.push({ key, value: JSON.parse(text) as T });
        }
        return results;
      } catch (e) {
        if (e instanceof BlobStorageError) throw e;
        throw new BlobStorageError('list failed', 'LIST_FAILED', e);
      }
    },

    async clear(namespace: string, opts?: PortCallOptions): Promise<void> {
      opts?.signal?.throwIfAborted();
      try {
        const root = await getRootDir();
        try {
          await root.removeEntry(namespace, { recursive: true });
        } catch {
          // namespace 부재 — 무시
        }
      } catch (e) {
        if (e instanceof BlobStorageError) throw e;
        throw new BlobStorageError('clear failed', 'CLEAR_FAILED', e);
      }
    },
  };
}
