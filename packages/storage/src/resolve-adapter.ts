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
import { getLegacyAdapterPolicy } from '@zm/core';

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

function resolveByPolicy(policy: string): StorageAdapter {
  if (policy === 'idb-only') {
    return isIDBAdapterAvailable() ? createIDBAdapter() : createMemoryAdapter();
  }
  return resolveStorageAdapter();
}

const _nsCache = new Map<string, StorageAdapter>();

/**
 * namespace별 최적 어댑터를 반환한다.
 * 레지스트리에 등록된 namespace는 adapterPolicies에 따라 어댑터 선택, 그 외는 기본 어댑터.
 *
 * REFAC-02-P1: namespace-registry adapterPolicy 단수 → adapterPolicies 배열 reshape (ADR-0023 §D5).
 * 본 함수는 deprecation period(v2.0~v2.1) 동안 호환 alias `getLegacyAdapterPolicy`로 동작.
 * P2 완료 시점에 BlobStorage Port 직접 사용으로 reshape 후 삭제.
 */
export function resolveAdapterFor(namespace: string): StorageAdapter {
  const cached = _nsCache.get(namespace);
  if (cached !== undefined) return cached;

  const legacyPolicy = getLegacyAdapterPolicy(namespace);
  const adapter = resolveByPolicy(legacyPolicy);
  _nsCache.set(namespace, adapter);
  return adapter;
}
