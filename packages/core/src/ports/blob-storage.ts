/**
 * BlobStorage Port (ADR-0017 §D1.4)
 *
 * 기존 StorageAdapter 인터페이스를 흡수. IDB/OPFS/Memory 3 어댑터가 이 인터페이스를 구현한다.
 * PortCallOptions (AbortSignal) 추가.
 */

import type { AdapterDescriptor, PortCallOptions } from './common';

export interface BlobStorage {
  readonly descriptor: AdapterDescriptor;
  get<T>(namespace: string, key: string, opts?: PortCallOptions): Promise<T | undefined>;
  put<T>(namespace: string, key: string, value: T, opts?: PortCallOptions): Promise<void>;
  delete(namespace: string, key: string, opts?: PortCallOptions): Promise<void>;
  list<T>(namespace: string, opts?: PortCallOptions): Promise<ReadonlyArray<{ key: string; value: T }>>;
  clear(namespace: string, opts?: PortCallOptions): Promise<void>;
}
