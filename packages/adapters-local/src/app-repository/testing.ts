/**
 * 테스트용 AppRepository (ADR-0019 — contract test 격리)
 *
 * `@zm/adapters-local/app-repository/testing` subpath로 노출.
 * in-memory BlobStorage 주입으로 IDB 없이 격리 테스트.
 *
 * @module adapters-local/app-repository/testing
 */

import type { AppRepository, UserId } from '@zm/core';
import { createMemoryBlobStorage } from '../blob-storage';
import { createLocalAppRepository } from './local-app-repository';

/** 테스트용 고정 소유자. 실제 부트스트랩(UUID 생성)과 무관하게 결과를 재현 가능하게 한다. */
export const TEST_OWNER_ID = '00000000-0000-4000-8000-000000000001' as UserId;

export function createTestAppRepository(ownerId: UserId = TEST_OWNER_ID): AppRepository {
  return createLocalAppRepository(createMemoryBlobStorage(), { ownerId });
}
