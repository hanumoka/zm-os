/**
 * IndexedDB 저수준 추상화 (STG-01) — BlobStorage Local 어댑터 raw CRUD
 *
 * ADR-0020: packages/storage → @zm/adapters-local/blob-storage 흡수 (코드 변경 없이 이동).
 *
 * 정책:
 * - idb library v8.0.3 사용
 * - 메서드별 자동 트랜잭션
 * - 단일 DB `zm-os`, store 추가 시 DB_VERSION bump
 * - IDB 미사용 환경 → 메모리 폴백 (Safari Private Browsing 등)
 * - structured clone raw (Zod 검증은 호출자 책임)
 *
 * SSR 안전: 'use client' 없음 — 모든 IDB 접근 전 isIDBAvailable() 체크 → 메모리 폴백
 */

import { type DBSchema, type IDBPDatabase, openDB as idbOpenDB } from 'idb';
import {
  NS_INSTALLED_APPS,
  NS_USER_APPS,
  NS_DESKTOP_LAYOUT,
  NS_DESKTOP_SETTINGS,
  NS_SYSTEM,
} from '@zm/core';
import type { NamespaceId } from '@zm/core';

export {
  NS_INSTALLED_APPS as STORE_INSTALLED_APPS,
  NS_USER_APPS as STORE_USER_APPS,
  NS_DESKTOP_LAYOUT as STORE_DESKTOP_LAYOUT,
  NS_DESKTOP_SETTINGS as STORE_DESKTOP_SETTINGS,
  NS_SYSTEM as STORE_SYSTEM,
};

// ─── DB / Store 상수 ─────────────────────────────────────────────────────────
export const DB_NAME = 'zm-os';
/** DB 버전. store 추가 시 bump (v2: user-apps, v3: desktop-layout, v4: desktop-settings, v5: system) */
export const DB_VERSION = 5;

// ─── 타입 ─────────────────────────────────────────────────────────────────────
export type IDBStoreName = NamespaceId;

/**
 * idb DBSchema 타입 정의 — value를 any로 두어야 idb 내부 타입 충족
 * (idb DBSchemaValue.value: any 제약). 실제 타입 안전성은 idbGet<T>/idbPut<T> 제네릭으로 보장.
 */
interface ZmOsDBSchema extends DBSchema {
  [NS_INSTALLED_APPS]: {
    key: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any;
  };
  [NS_USER_APPS]: {
    key: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any;
  };
  [NS_DESKTOP_LAYOUT]: {
    key: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any;
  };
  [NS_DESKTOP_SETTINGS]: {
    key: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any;
  };
  [NS_SYSTEM]: {
    key: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any;
  };
}

// ─── IDB 가용성 가드 (SSR 안전) ───────────────────────────────────────────────
export function isIDBAvailable(): boolean {
  return typeof globalThis.indexedDB !== 'undefined' && globalThis.indexedDB !== null;
}

// ─── 메모리 폴백 ──────────────────────────────────────────────────────────────
const _memoryStore = new Map<IDBStoreName, Map<string, unknown>>();

function _memoryStoreOf(storeName: IDBStoreName): Map<string, unknown> {
  let s = _memoryStore.get(storeName);
  if (s === undefined) {
    s = new Map<string, unknown>();
    _memoryStore.set(storeName, s);
  }
  return s;
}

// ─── DB 라이프사이클 (lazy singleton) ────────────────────────────────────────
let _dbPromise: Promise<IDBPDatabase<ZmOsDBSchema>> | null = null;

/**
 * zm-os IndexedDB를 열고 캐싱된 Promise를 반환한다.
 * IDB 미사용 환경에서 호출 시 reject — 호출 전 isIDBAvailable() 체크 필수.
 */
export function openDB(): Promise<IDBPDatabase<ZmOsDBSchema>> {
  if (!isIDBAvailable()) {
    return Promise.reject(new Error('[zm-os IDB] IndexedDB is not available (SSR or blocked)'));
  }
  if (_dbPromise === null) {
    _dbPromise = idbOpenDB<ZmOsDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains(NS_INSTALLED_APPS)) {
            db.createObjectStore(NS_INSTALLED_APPS);
          }
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains(NS_USER_APPS)) {
            db.createObjectStore(NS_USER_APPS);
          }
        }
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains(NS_DESKTOP_LAYOUT)) {
            db.createObjectStore(NS_DESKTOP_LAYOUT);
          }
        }
        if (oldVersion < 4) {
          if (!db.objectStoreNames.contains(NS_DESKTOP_SETTINGS)) {
            db.createObjectStore(NS_DESKTOP_SETTINGS);
          }
        }
        if (oldVersion < 5) {
          if (!db.objectStoreNames.contains(NS_SYSTEM)) {
            db.createObjectStore(NS_SYSTEM);
          }
        }
      },
      blocked(currentVersion, blockedVersion) {
        console.warn('[zm-os IDB] open blocked — other tab has older version', {
          currentVersion,
          blockedVersion,
        });
      },
      blocking(currentVersion, blockedVersion) {
        console.warn('[zm-os IDB] blocking other tab upgrade — closing connection', {
          currentVersion,
          blockedVersion,
        });
        const closingPromise = _dbPromise;
        _dbPromise = null;
        void closingPromise?.then((db) => {
          db.close();
        });
      },
      terminated() {
        console.warn('[zm-os IDB] connection terminated unexpectedly — cache invalidated');
        _dbPromise = null;
      },
    });
  }
  return _dbPromise;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function idbGet<T = unknown>(
  storeName: IDBStoreName,
  key: string,
): Promise<T | undefined> {
  if (!isIDBAvailable()) {
    const v = _memoryStoreOf(storeName).get(key);
    return v as T | undefined;
  }
  const db = await openDB();
  const value: unknown = await db.get(storeName, key);
  return value as T | undefined;
}

export async function idbPut<T = unknown>(
  storeName: IDBStoreName,
  key: string,
  value: T,
): Promise<void> {
  if (!isIDBAvailable()) {
    _memoryStoreOf(storeName).set(key, value);
    return;
  }
  const db = await openDB();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  await db.put(storeName, value as Parameters<typeof db.put>[1], key);
}

export async function idbDelete(storeName: IDBStoreName, key: string): Promise<void> {
  if (!isIDBAvailable()) {
    _memoryStoreOf(storeName).delete(key);
    return;
  }
  const db = await openDB();
  await db.delete(storeName, key);
}

export async function idbList<T = unknown>(
  storeName: IDBStoreName,
): Promise<ReadonlyArray<{ key: string; value: T }>> {
  if (!isIDBAvailable()) {
    const m = _memoryStoreOf(storeName);
    return Array.from(m.entries()).map(([key, value]) => ({ key, value: value as T }));
  }
  const db = await openDB();
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  const [keys, values] = await Promise.all([store.getAllKeys(), store.getAll()]);
  await tx.done;
  const result: Array<{ key: string; value: T }> = [];
  for (let i = 0; i < keys.length; i++) {
    result.push({ key: String(keys[i]), value: values[i] as T });
  }
  return result;
}

export async function idbClear(storeName: IDBStoreName): Promise<void> {
  if (!isIDBAvailable()) {
    _memoryStoreOf(storeName).clear();
    return;
  }
  const db = await openDB();
  await db.clear(storeName);
}
