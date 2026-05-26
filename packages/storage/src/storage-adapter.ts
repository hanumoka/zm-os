/**
 * 스토리지 어댑터 인터페이스 (Strategy 패턴)
 * ADR-0009: IndexedDB / OPFS / Memory 통합 추상화
 *
 * - key-value 의미론 (namespace + key → value)
 * - 비동기 전용 (OPFS async API 대응)
 * - 직렬화/역직렬화는 호출자 책임
 */

export type StorageAdapterName = 'indexeddb' | 'opfs' | 'memory';

export interface StorageAdapter {
  readonly name: StorageAdapterName;
  get<T>(namespace: string, key: string): Promise<T | undefined>;
  put<T>(namespace: string, key: string, value: T): Promise<void>;
  delete(namespace: string, key: string): Promise<void>;
  list<T>(namespace: string): Promise<ReadonlyArray<{ key: string; value: T }>>;
  clear(namespace: string): Promise<void>;
}

export class StorageError extends Error {
  constructor(
    message: string,
    public readonly adapter: StorageAdapterName,
    public readonly cause?: unknown,
  ) {
    super(`[${adapter}] ${message}`);
    this.name = 'StorageError';
  }
}
