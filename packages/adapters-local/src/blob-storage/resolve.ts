/**
 * BlobStorage 어댑터 팩토리 (ADR-0020 §D1, §D8)
 *
 * `createLocalBlobStorage()` 단일 진입점. 3개 백엔드 어댑터(IDB/OPFS/Memory)는 internal.
 * namespace별 정책은 namespace-registry(getBlobStorageAdapter)에서 읽어 자동 선택 —
 * 이 분기는 BlobStorage 내부에 보존되며, ADR-0023 PortResolver(P5)는 본 팩토리만 호출한다.
 */

import type { BlobStorage } from '@zm/core';
import { getBlobStorageAdapter } from '@zm/core';
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

/**
 * 레지스트리의 어댑터 값을 정책으로 1:1 옮긴다.
 *
 * 예전에는 3값(`local-idb | local-opfs | local-memory`)을 2값으로 접어 전달해,
 * 레지스트리에 `local-memory`로 등록해도 'auto'가 되어 OPFS가 있으면 영구 저장됐다.
 * "휘발성으로 두겠다"는 선언이 정반대 결과를 내던 지점이다.
 */
function resolvePolicy(opts?: CreateLocalBlobStorageOptions): BlobStoragePolicy {
  if (opts?.policy !== undefined) return opts.policy;
  if (opts?.namespace === undefined) return 'auto';

  switch (getBlobStorageAdapter(opts.namespace)) {
    case 'local-idb':
      return 'idb-only';
    case 'local-opfs':
      return 'opfs-only';
    case 'local-memory':
      return 'memory';
    default:
      // 미등록 namespace — 가용한 것 중 최선으로.
      return 'auto';
  }
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
      // OPFS 미지원(Safari 등)에서 무조건 생성하면 첫 접근에서 깨진다. 폴백을 둔다.
      if (isOPFSAvailable()) return createOPFSBlobStorage();
      return isIDBAdapterAvailable() ? createIDBBlobStorage() : createMemoryBlobStorage();
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
