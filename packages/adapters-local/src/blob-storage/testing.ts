/**
 * 테스트용 BlobStorage (ADR-0020 §D6)
 *
 * `@zm/adapters-local/blob-storage/testing` subpath로 노출.
 * Vitest 등에서 `usePorts({ blob: createTestBlobStorage() })` 형태로 주입.
 *
 * @module adapters-local/blob-storage/testing
 */

import type { BlobStorage } from '@zm/core';
import { createMemoryBlobStorage } from './memory-adapter';

/** in-memory BlobStorage 인스턴스 (격리된 휘발 저장소). */
export function createTestBlobStorage(): BlobStorage {
  return createMemoryBlobStorage();
}
