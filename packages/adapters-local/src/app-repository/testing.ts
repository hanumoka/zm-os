/**
 * 테스트용 AppRepository (ADR-0019 — contract test 격리)
 *
 * `@zm/adapters-local/app-repository/testing` subpath로 노출.
 * in-memory BlobStorage 주입으로 IDB 없이 격리 테스트.
 *
 * @module adapters-local/app-repository/testing
 */

import type { AppRepository } from '@zm/core';
import { createMemoryBlobStorage } from '../blob-storage';
import { createLocalAppRepository } from './local-app-repository';

export function createTestAppRepository(): AppRepository {
  return createLocalAppRepository(createMemoryBlobStorage());
}
