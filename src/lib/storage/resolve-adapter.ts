/**
 * 스토리지 어댑터 팩토리 (환경 감지 + 캐싱)
 *
 * 우선순위: OPFS > IndexedDB > Memory
 * namespace별 오버라이드 지원.
 */

import type { StorageAdapter } from './storage-adapter';
import { isOPFSAvailable, createOPFSAdapter } from './opfs-adapter';
import { isIDBAdapterAvailable, createIDBAdapter } from './idb-adapter';
import { createMemoryAdapter } from './memory-adapter';

let _cachedAdapter: StorageAdapter | null = null;

/**
 * 런타임 환경에 따라 최적의 어댑터를 반환한다.
 * 최초 호출 시 1회 결정, 이후 캐싱 (lazy singleton).
 */
export function resolveStorageAdapter(): StorageAdapter {
  if (_cachedAdapter !== null) return _cachedAdapter;

  if (isOPFSAvailable()) {
    _cachedAdapter = createOPFSAdapter();
  } else if (isIDBAdapterAvailable()) {
    _cachedAdapter = createIDBAdapter();
  } else {
    _cachedAdapter = createMemoryAdapter();
  }

  return _cachedAdapter;
}

const NAMESPACE_OVERRIDES: Record<string, () => StorageAdapter> = {
  'desktop-layout': () => {
    if (isIDBAdapterAvailable()) return createIDBAdapter();
    return createMemoryAdapter();
  },
  'installed-apps': () => {
    if (isIDBAdapterAvailable()) return createIDBAdapter();
    return createMemoryAdapter();
  },
  'user-apps': () => {
    if (isIDBAdapterAvailable()) return createIDBAdapter();
    return createMemoryAdapter();
  },
};

const _nsCache = new Map<string, StorageAdapter>();

/**
 * namespace별 최적 어댑터를 반환한다.
 * 오버라이드 등록된 namespace는 전용 어댑터, 그 외는 기본 어댑터.
 */
export function resolveAdapterFor(namespace: string): StorageAdapter {
  const cached = _nsCache.get(namespace);
  if (cached !== undefined) return cached;

  const factory = NAMESPACE_OVERRIDES[namespace];
  const adapter = factory !== undefined ? factory() : resolveStorageAdapter();
  _nsCache.set(namespace, adapter);
  return adapter;
}
