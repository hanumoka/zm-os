/**
 * BlobStorage 어댑터 에러 (ADR-0020 §D4)
 *
 * `PortError`를 상속해 호출자 catch 패턴을 단일화한다 (`instanceof PortError`).
 * `@zm/storage`의 레거시 `StorageError`는 이 클래스의 alias로 1 v2 minor 동안 유지된다.
 */

import { PortError } from '@zm/core';

export type BlobStorageErrorCode =
  | 'GET_FAILED'
  | 'PUT_FAILED'
  | 'DELETE_FAILED'
  | 'LIST_FAILED'
  | 'CLEAR_FAILED'
  | 'UNKNOWN_NAMESPACE'
  | 'NOT_AVAILABLE'
  | 'ABORTED';

export class BlobStorageError extends PortError {
  constructor(message: string, code: BlobStorageErrorCode, cause?: unknown) {
    super(message, 'blob-storage', code, cause);
    this.name = 'BlobStorageError';
  }
}
