/**
 * @zm/storage — DEPRECATION SHELL (ADR-0020 §D5)
 *
 * REFAC-02-P2: 모든 BlobStorage 구현이 `@zm/adapters-local/blob-storage`로 이전됨.
 * 이 패키지는 기존 호출자(`apps/web/src/lib/storage/*`) 하위호환용 re-export shell이다.
 * deprecation period: v2.0 ~ v2.1. v2.1 cleanup PR에서 본 패키지 삭제 +
 * 모든 import를 `@zm/adapters-local/blob-storage`로 교체.
 *
 * @deprecated import from '@zm/adapters-local/blob-storage' instead.
 * @module @zm/storage
 */

// ─── Port 타입 (StorageAdapter = BlobStorage alias) ──────────────────────────
export type { BlobStorage } from '@zm/core';
/** @deprecated use BlobStorage from '@zm/core' */
export type { BlobStorage as StorageAdapter } from '@zm/core';

// ─── 팩토리 + 레거시 namespace resolver ──────────────────────────────────────
export {
  createLocalBlobStorage,
  resolveAdapterFor,
  isIDBAvailable,
  isOPFSAvailable,
  isIDBAdapterAvailable,
  openDB,
  // 저수준 raw CRUD (레거시: installed-apps/user-apps)
  idbGet,
  idbPut,
  idbDelete,
  idbList,
  idbClear,
  // store 상수
  STORE_INSTALLED_APPS,
  STORE_USER_APPS,
  STORE_DESKTOP_LAYOUT,
  STORE_DESKTOP_SETTINGS,
  STORE_SYSTEM,
  DB_NAME,
  DB_VERSION,
  // 에러
  BlobStorageError,
} from '@zm/adapters-local/blob-storage';

export type { IDBStoreName } from '@zm/adapters-local/blob-storage';

/** @deprecated use BlobStorageError (extends PortError) */
export { BlobStorageError as StorageError } from '@zm/adapters-local/blob-storage';
