/**
 * BlobStorage 어댑터 팩토리 (ADR-0020 §D1, §D8)
 *
 * `createLocalBlobStorage()` 단일 진입점. 3개 백엔드 어댑터(IDB/OPFS/Memory)는 internal.
 * namespace별 정책은 namespace-registry(getLegacyAdapterPolicy)에서 읽어 자동 선택 —
 * 이 분기는 BlobStorage 내부에 보존되며, ADR-0023 PortResolver(P5)는 본 팩토리만 호출한다.
 */

import type { BlobStorage } from '@zm/core';
import { getLegacyAdapterPolicy } from '@zm/core';
import { isOPFSAvailable, createOPFSBlobStorage } from './opfs-adapter';
import { isIDBAdapterAvailable, createIDBBlobStorage } from './idb-adapter';
import { createMemoryBlobStorage } from './memory-adapter';

export type BlobStoragePolicy = 'auto' | 'idb-only' | 'opfs-only' | 'memory';

export type CreateLocalBlobStorageOptions = {
  readonly policy?: BlobStoragePolicy;
  /** 지정 시 namespace-registry 정책으로 policy를 파생 (policy 미지정일 때만). */
  readonly namespace?: string;
};

function resolveAuto(): BlobStorage {
  if (isOPFSAvailable()) return createOPFSBlobStorage();
  if (isIDBAdapterAvailable()) return createIDBBlobStorage();
  return createMemoryBlobStorage();
}

function resolvePolicy(opts?: CreateLocalBlobStorageOptions): BlobStoragePolicy {
  if (opts?.policy !== undefined) return opts.policy;
  if (opts?.namespace !== undefined) {
    // getLegacyAdapterPolicy: 'idb-only' | 'default'
    return getLegacyAdapterPolicy(opts.namespace) === 'idb-only' ? 'idb-only' : 'auto';
  }
  return 'auto';
}

/**
 * Local BlobStorage 어댑터를 생성한다 (ADR-0020 §D1).
 * - policy 명시 시 그대로, 미명시 + namespace 지정 시 registry 정책으로 파생, 둘 다 없으면 'auto'.
 * - 'auto' 우선순위: OPFS > IndexedDB > Memory.
 */
export function createLocalBlobStorage(
  opts?: CreateLocalBlobStorageOptions,
): BlobStorage {
  switch (resolvePolicy(opts)) {
    case 'idb-only':
      return isIDBAdapterAvailable() ? createIDBBlobStorage() : createMemoryBlobStorage();
    case 'opfs-only':
      return createOPFSBlobStorage();
    case 'memory':
      return createMemoryBlobStorage();
    case 'auto':
    default:
      return resolveAuto();
  }
}

// ─── 레거시 호환 (deprecation period v2.0~v2.1) ──────────────────────────────

const _nsCache = new Map<string, BlobStorage>();

/**
 * @deprecated namespace별 BlobStorage. ADR-0023 PortResolver(P5)로 대체 예정.
 * `@zm/storage` shell 경유 호출자(desktop-layout/settings) 호환을 위해 유지.
 */
export function resolveAdapterFor(namespace: string): BlobStorage {
  const cached = _nsCache.get(namespace);
  if (cached !== undefined) return cached;
  const adapter = createLocalBlobStorage({ namespace });
  _nsCache.set(namespace, adapter);
  return adapter;
}
