/**
 * LocalAppRepository — AppRepository Local 어댑터 (ADR-0019)
 *
 * BlobStorage Port(ADR-0020) 위 thin layer. 2 namespace 사용:
 * - `user-apps`: AppRecord 저장 (key = manifest.id)
 * - `installed-apps`: 설치 마크 (key = appId, value = { installedAt })
 *
 * **content-agnostic**: AppRecord(메타데이터 + contentRef 포인터)만 다룬다. 실제 HTML
 * 바이트는 BlobStorage(`contentRef.blobKey`)가 보관하며, 그 wiring/데이터 마이그레이션은
 * REFAC-02-P5 담당. AbortSignal/PortError/폴백은 주입된 BlobStorage가 처리.
 *
 * @module adapters-local/app-repository/local-app-repository
 */

import { PortError } from '@zm/core';
import type {
  AdapterDescriptor,
  AppListFilter,
  AppRecord,
  AppRepository,
  BlobStorage,
  PortCallOptions,
  UserId,
} from '@zm/core';

const USER_APPS_NS = 'user-apps';
const INSTALLED_APPS_NS = 'installed-apps';

const DESCRIPTOR: AdapterDescriptor = {
  portName: 'app-repository',
  adapterName: 'local-idb',
  version: '1.0.0',
  capabilities: ['built-in-passthrough'],
};

export type CreateLocalAppRepositoryOptions = {
  /** POC: write 시 ownerId 미지정이면 채울 anon UserId (LocalAuth, ADR-0018). 기본 undefined. */
  readonly defaultOwnerId?: UserId;
};

export function createLocalAppRepository(
  blob: BlobStorage,
  opts?: CreateLocalAppRepositoryOptions,
): AppRepository {
  const defaultOwnerId = opts?.defaultOwnerId;

  return {
    descriptor: DESCRIPTOR,

    async list(
      filter?: AppListFilter,
      callOpts?: PortCallOptions,
    ): Promise<ReadonlyArray<AppRecord>> {
      // built-in 카탈로그는 IDB 미저장 — 호출자가 static import로 별도 제공 (built-in-passthrough)
      if (filter?.source === 'built-in') return [];
      const records = await blob.list<AppRecord>(USER_APPS_NS, callOpts);
      let result = records.map((r) => r.value);
      if (filter?.ownerId !== undefined) {
        result = result.filter((r) => r.ownerId === filter.ownerId);
      }
      return result;
    },

    async get(id: string, callOpts?: PortCallOptions): Promise<AppRecord | null> {
      const record = await blob.get<AppRecord>(USER_APPS_NS, id, callOpts);
      return record ?? null;
    },

    async upsert(record: AppRecord, callOpts?: PortCallOptions): Promise<void> {
      if (record.source !== 'user') {
        throw new PortError(
          `upsert는 source='user'만 허용합니다 (받은 값: '${record.source}')`,
          'app-repository',
          'INVALID_SOURCE',
        );
      }
      const toStore: AppRecord =
        record.ownerId === undefined && defaultOwnerId !== undefined
          ? { ...record, ownerId: defaultOwnerId }
          : record;
      await blob.put(USER_APPS_NS, toStore.manifest.id, toStore, callOpts);
    },

    async remove(id: string, callOpts?: PortCallOptions): Promise<void> {
      await blob.delete(USER_APPS_NS, id, callOpts);
      // cascade unmark (ADR-0019 §D4) — 비원자 순차. orphan 정리는 P5.
      await blob.delete(INSTALLED_APPS_NS, id, callOpts);
    },

    async markInstalled(appId: string, callOpts?: PortCallOptions): Promise<void> {
      await blob.put(INSTALLED_APPS_NS, appId, { installedAt: Date.now() }, callOpts);
    },

    async unmarkInstalled(appId: string, callOpts?: PortCallOptions): Promise<void> {
      await blob.delete(INSTALLED_APPS_NS, appId, callOpts);
    },

    async listInstalled(callOpts?: PortCallOptions): Promise<ReadonlyArray<string>> {
      const records = await blob.list(INSTALLED_APPS_NS, callOpts);
      return records.map((r) => r.key);
    },
  };
}
