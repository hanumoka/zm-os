/**
 * OPFS (Origin Private File System) 스토리지 어댑터
 *
 * 디렉토리 구조: <OPFS root>/zm-os/<namespace>/<key>.json
 * 직렬화: JSON.stringify/parse
 * API: createWritable() 비동기 (메인 스레드)
 *
 * 지원: Chrome 86+, Edge 86+, Firefox 111+
 * 미지원: Safari 18.x (createWritable 미지원) — isOPFSAvailable()로 런타임 감지
 */

import type { StorageAdapter } from './storage-adapter';
import { StorageError } from './storage-adapter';

const ROOT_DIR = 'zm-os';

/**
 * OPFS createWritable API 사용 가능 여부 런타임 감지.
 * Safari 18.x는 getDirectory()는 지원하나 createWritable()은 미지원.
 * FileSystemWritableFileStream 존재 여부로 판별.
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
    throw new StorageError(`Failed to access namespace "${namespace}"`, 'opfs');
  }
}

function fileKey(key: string): string {
  return `${key}.json`;
}

export function createOPFSAdapter(): StorageAdapter {
  return {
    name: 'opfs',

    async get<T>(namespace: string, key: string): Promise<T | undefined> {
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
        if (e instanceof StorageError) throw e;
        throw new StorageError('get failed', 'opfs', e);
      }
    },

    async put<T>(namespace: string, key: string, value: T): Promise<void> {
      try {
        const dir = await getNamespaceDir(namespace, true);
        if (dir === undefined) {
          throw new StorageError(`Cannot create namespace "${namespace}"`, 'opfs');
        }

        const fileHandle = await dir.getFileHandle(fileKey(key), { create: true });
        const writable = await fileHandle.createWritable();
        try {
          await writable.write(JSON.stringify(value));
        } finally {
          await writable.close();
        }
      } catch (e) {
        if (e instanceof StorageError) throw e;
        throw new StorageError('put failed', 'opfs', e);
      }
    },

    async delete(namespace: string, key: string): Promise<void> {
      try {
        const dir = await getNamespaceDir(namespace, false);
        if (dir === undefined) return;

        try {
          await dir.removeEntry(fileKey(key));
        } catch {
          // key 부재 — 무시
        }
      } catch (e) {
        if (e instanceof StorageError) throw e;
        throw new StorageError('delete failed', 'opfs', e);
      }
    },

    async list<T>(namespace: string): Promise<ReadonlyArray<{ key: string; value: T }>> {
      try {
        const dir = await getNamespaceDir(namespace, false);
        if (dir === undefined) return [];

        const results: Array<{ key: string; value: T }> = [];
        // TS DOM types omit FileSystemDirectoryHandle.entries() (WICG File System spec)
        type DirWithEntries = FileSystemDirectoryHandle & {
          entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
        };
        for await (const [name, handle] of (dir as DirWithEntries).entries()) {
          if (handle.kind !== 'file' || !name.endsWith('.json')) continue;
          const file = await (handle as FileSystemFileHandle).getFile();
          const text = await file.text();
          const key = name.slice(0, -5); // .json 제거
          results.push({ key, value: JSON.parse(text) as T });
        }
        return results;
      } catch (e) {
        if (e instanceof StorageError) throw e;
        throw new StorageError('list failed', 'opfs', e);
      }
    },

    async clear(namespace: string): Promise<void> {
      try {
        const root = await getRootDir();
        try {
          await root.removeEntry(namespace, { recursive: true });
        } catch {
          // namespace 부재 — 무시
        }
      } catch (e) {
        if (e instanceof StorageError) throw e;
        throw new StorageError('clear failed', 'opfs', e);
      }
    },
  };
}
