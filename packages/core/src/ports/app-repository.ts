/**
 * AppRepository Port (ADR-0017 §D1.3)
 *
 * 앱 레코드 + 설치 상태 통합 추상화 인터페이스.
 * LocalAppRepository(ADR-0019) / CloudAppRepository(ADR-0025+)가 이 인터페이스를 구현한다.
 */

import type { AppManifest } from '../manifest';
import type { UserId } from './auth';
import type { AdapterDescriptor, PortCallOptions } from './common';

export type AppRecord = {
  readonly manifest: AppManifest;
  readonly source: 'built-in' | 'user';
  readonly installedAt: number;
  readonly contentRef:
    | { readonly kind: 'built-in-url'; readonly url: string }
    | { readonly kind: 'blob-ref'; readonly blobKey: string };
  readonly ownerId?: UserId; // v2 Cloud 어댑터 RLS용
};

export type AppListFilter = {
  readonly source?: 'built-in' | 'user';
  readonly ownerId?: UserId;
};

export interface AppRepository {
  readonly descriptor: AdapterDescriptor;
  list(filter?: AppListFilter, opts?: PortCallOptions): Promise<ReadonlyArray<AppRecord>>;
  get(id: string, opts?: PortCallOptions): Promise<AppRecord | null>;
  upsert(record: AppRecord, opts?: PortCallOptions): Promise<void>;
  remove(id: string, opts?: PortCallOptions): Promise<void>;
  markInstalled(appId: string, opts?: PortCallOptions): Promise<void>;
  unmarkInstalled(appId: string, opts?: PortCallOptions): Promise<void>;
  listInstalled(opts?: PortCallOptions): Promise<ReadonlyArray<string>>;
}
