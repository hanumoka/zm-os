/**
 * BlobStorage Local 어댑터 barrel (ADR-0020)
 *
 * 공개 진입점: `createLocalBlobStorage()`. 3개 백엔드 어댑터는 internal(고급/테스트용 export).
 * `@zm/storage` deprecation shell이 이 모듈에서 re-export 한다.
 *
 * @module adapters-local/blob-storage
 */

// 통합 팩토리 + 레거시 호환 resolver
export {
  createLocalBlobStorage,
  resolveAdapterFor,
  type BlobStoragePolicy,
  type CreateLocalBlobStorageOptions,
} from './resolve';

// 에러
export { BlobStorageError, type BlobStorageErrorCode } from './errors';

// 가용성 가드
export { isOPFSAvailable } from './opfs-adapter';
export { isIDBAdapterAvailable } from './idb-adapter';

// 저수준 raw CRUD + store 상수 (deprecation shell 호환 — 레거시 호출자용)
export {
  isIDBAvailable,
  openDB,
  idbGet,
  idbPut,
  idbDelete,
  idbList,
  idbClear,
  DB_NAME,
  DB_VERSION,
  STORE_INSTALLED_APPS,
  STORE_USER_APPS,
  STORE_DESKTOP_LAYOUT,
  STORE_DESKTOP_SETTINGS,
  STORE_SYSTEM,
  type IDBStoreName,
} from './indexeddb';

// 백엔드 어댑터 (internal — 고급/테스트용)
export { createIDBBlobStorage } from './idb-adapter';
export { createOPFSBlobStorage } from './opfs-adapter';
export { createMemoryBlobStorage } from './memory-adapter';
