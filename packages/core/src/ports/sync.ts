/**
 * SyncProvider Port (ADR-0017 §D1.5)
 *
 * 동기화 추상화 인터페이스.
 * LocalNoOpSync(ADR-0021) / CloudSupabaseSync(ADR-0026+)가 이 인터페이스를 구현한다.
 *
 * LocalNoOp 어댑터: status() = 'disabled', 다른 메서드는 Promise.resolve / empty array,
 * subscribe는 즉시 unsubscribe 가능한 no-op 반환 (silent — ADR-0017 Q8 결정).
 */

import type { AdapterDescriptor, PortCallOptions } from './common';

export type SyncEntity = {
  readonly entityType: 'app-record' | 'installed-mark' | 'desktop-layout' | 'desktop-settings';
  readonly entityId: string;
  readonly updatedAt: number; // 클라이언트 시각 (서버 권위 시계는 어댑터 내부)
  readonly payload: unknown; // 호출자가 Zod 검증
};

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'disabled';

export interface SyncProvider {
  readonly descriptor: AdapterDescriptor;
  status(): SyncStatus;
  pull(entityType: SyncEntity['entityType'], opts?: PortCallOptions): Promise<ReadonlyArray<SyncEntity>>;
  push(entities: ReadonlyArray<SyncEntity>, opts?: PortCallOptions): Promise<void>;
  subscribe(entityType: SyncEntity['entityType'], handler: (entity: SyncEntity) => void): () => void;
}
