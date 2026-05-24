/**
 * IndexedDB 추상화 계층 (STG-01)
 *
 * 정책:
 * - P1=B: idb library v8.0.3 사용
 * - P2: 단일 DB `zm-os` v1, store `installed-apps`
 * - P3=A: 메서드별 자동 트랜잭션
 * - P4=A: 단일 버전 v1, store 추가 시 bump
 * - P5=B: IDB 미사용 환경 → 메모리 폴백 (Safari Private Browsing 등)
 * - P6: structured clone raw (Zod 검증은 호출자 책임)
 * - P7: throw 표준 Error
 *
 * SSR 안전: 'use client' 디렉티브 없음 — lib 모듈, 호출자가 client 컴포넌트에서 사용
 * 모든 IDB 접근 전 isIDBAvailable() 체크 → 메모리 폴백
 */

import { type DBSchema, type IDBPDatabase, openDB as idbOpenDB } from 'idb';

// ─── DB / Store 상수 ─────────────────────────────────────────────────────────
export const DB_NAME = 'zm-os';
/** DB 버전. store 추가 시 bump (현재 v2: STORE_USER_APPS 추가) */
export const DB_VERSION = 2;
export const STORE_INSTALLED_APPS = 'installed-apps' as const;
/** v2: 사용자 업로드 앱 store (APP-02) */
export const STORE_USER_APPS = 'user-apps' as const;

// ─── 타입 ─────────────────────────────────────────────────────────────────────
export type IDBStoreName = typeof STORE_INSTALLED_APPS | typeof STORE_USER_APPS;

/**
 * idb DBSchema 타입 정의 — value를 any로 두어야 idb 내부 타입 충족
 * (idb DBSchemaValue.value: any 제약)
 * 실제 타입 안전성은 idbGet<T>/idbPut<T> 제네릭으로 보장
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ZmOsDBSchema extends DBSchema {
  [STORE_INSTALLED_APPS]: {
    key: string;
    // idb DBSchemaValue가 value: any를 요구하므로 불가피한 any — 외부 API는 T = unknown 제네릭으로 노출
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any;
  };
  [STORE_USER_APPS]: {
    key: string;
    // idb DBSchemaValue가 value: any를 요구하므로 불가피한 any — 외부 API는 T = unknown 제네릭으로 노출
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any;
  };
}

// ─── IDB 가용성 가드 (SSR 안전) ───────────────────────────────────────────────
export function isIDBAvailable(): boolean {
  return typeof globalThis.indexedDB !== 'undefined' && globalThis.indexedDB !== null;
}

// ─── 메모리 폴백 (P5=B) ───────────────────────────────────────────────────────
// IDB 미사용 환경(SSR, Safari Private Browsing 0 quota 등)에서 사용
// 페이지 reload 시 휘발 — 호출자는 이 동작을 인지해야 함
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
        // v0 → v1: STORE_INSTALLED_APPS 생성
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains(STORE_INSTALLED_APPS)) {
            db.createObjectStore(STORE_INSTALLED_APPS);
          }
        }
        // v1 → v2: STORE_USER_APPS 생성 (APP-02 사용자 업로드 앱)
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains(STORE_USER_APPS)) {
            db.createObjectStore(STORE_USER_APPS);
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
        // 다른 탭이 upgrade 요청 중 — 현재 connection 닫고 캐시 무효화
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

/**
 * 단일 레코드 조회.
 * 키가 없으면 undefined 반환.
 * IDB 미사용 환경에서는 메모리 폴백.
 */
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

/**
 * 레코드 저장 (upsert).
 * IDB 미사용 환경에서는 메모리 폴백.
 */
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
  // idb put 시그니처: put(storeName, value, key?) — value가 ZmOsDBSchema value(any)로 할당됨
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  await db.put(storeName, value as Parameters<typeof db.put>[1], key);
}

/**
 * 레코드 삭제.
 * 존재하지 않는 키도 에러 없이 처리.
 * IDB 미사용 환경에서는 메모리 폴백.
 */
export async function idbDelete(
  storeName: IDBStoreName,
  key: string,
): Promise<void> {
  if (!isIDBAvailable()) {
    _memoryStoreOf(storeName).delete(key);
    return;
  }
  const db = await openDB();
  await db.delete(storeName, key);
}

/**
 * store 전체 목록 조회 (key + value 쌍).
 * IDB 미사용 환경에서는 메모리 폴백.
 */
export async function idbList<T = unknown>(
  storeName: IDBStoreName,
): Promise<ReadonlyArray<{ key: string; value: T }>> {
  if (!isIDBAvailable()) {
    const m = _memoryStoreOf(storeName);
    return Array.from(m.entries()).map(([key, value]) => ({ key, value: value as T }));
  }
  const db = await openDB();
  // 단일 트랜잭션에서 keys + values를 함께 조회 (원자성 보장)
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

/**
 * store 전체 삭제.
 * IDB 미사용 환경에서는 메모리 폴백.
 */
export async function idbClear(storeName: IDBStoreName): Promise<void> {
  if (!isIDBAvailable()) {
    _memoryStoreOf(storeName).clear();
    return;
  }
  const db = await openDB();
  await db.clear(storeName);
}
