import { TEST_LIMITS, type JsonValue } from '@zm/platform-contracts';

const DB = 'zm-platform-app-storage-v1';
const STORE = 'entries';
const GENERATIONS = 'generations';
interface Row { userId: string; appId: string; key: string; value: JsonValue; bytes: number }
interface Generation { userId: string; appId: string; value: string }
export interface StorageLease { readonly userId: string; readonly appId: string; readonly generation: string; readonly signal?: AbortSignal }
export class StorageLeaseExpiredError extends Error {
  constructor() { super('로컬 데이터가 삭제되었습니다. 앱을 다시 실행해 주세요.'); this.name = 'StorageLeaseExpiredError'; }
}
let database: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 2);
    request.onupgradeneeded = (): void => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        const store = request.result.createObjectStore(STORE, { keyPath: ['userId', 'appId', 'key'] });
        store.createIndex('partition', ['userId', 'appId']);
      }
      if (!request.result.objectStoreNames.contains(GENERATIONS)) request.result.createObjectStore(GENERATIONS, { keyPath: ['userId', 'appId'] });
    };
    request.onerror = (): void => { database = undefined; reject(new Error('로컬 저장소를 열지 못했습니다.')); };
    request.onblocked = (): void => { database = undefined; reject(new Error('다른 창이 로컬 저장소 변경을 막고 있습니다.')); };
    request.onsuccess = (): void => {
      request.result.onversionchange = (): void => { request.result.close(); database = undefined; };
      resolve(request.result);
    };
  });
  return database;
}

/** Acquire once when attaching an execution, before its first asynchronous authorization. */
export async function captureStorageLease(userId: string, appId: string, signal?: AbortSignal): Promise<StorageLease> {
  const db = await open();
  if (signal?.aborted) throw new Error('종료된 앱은 저장소를 사용할 수 없습니다.');
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GENERATIONS, 'readonly');
    const request = tx.objectStore(GENERATIONS).get([userId, appId]);
    tx.oncomplete = (): void => {
      if (signal?.aborted) { reject(new Error('종료된 앱은 저장소를 사용할 수 없습니다.')); return; }
      resolve(Object.freeze({ userId, appId, generation: (request.result as Generation | undefined)?.value ?? '', signal }));
    };
    tx.onabort = tx.onerror = (): void => reject(new Error('저장소 실행 권한을 준비하지 못했습니다.'));
  });
}

async function access<T>(lease: StorageLease, mode: IDBTransactionMode, operation: (store: IDBObjectStore, result: (value: T) => void, fail: (error: Error) => void) => void): Promise<T> {
  const db = await open();
  if (lease.signal?.aborted) throw new Error('종료된 앱은 저장소를 사용할 수 없습니다.');
  return new Promise((resolve, reject) => {
    // Both stores are in the same transaction: a clear in any tab either follows
    // this write and removes it, or precedes it and invalidates this lease.
    const tx = db.transaction([STORE, GENERATIONS], mode);
    let value: T;
    let error: Error | undefined;
    const fail = (reason: Error): void => { error = reason; tx.abort(); };
    const abort = (): void => fail(new Error('종료된 앱은 저장소를 사용할 수 없습니다.'));
    lease.signal?.addEventListener('abort', abort, { once: true });
    const cleanup = (): void => lease.signal?.removeEventListener('abort', abort);
    tx.oncomplete = (): void => { cleanup(); resolve(value); };
    tx.onabort = (): void => { cleanup(); reject(error ?? new Error('로컬 저장소 작업에 실패했습니다.')); };
    tx.onerror = (): void => { error ??= new Error('로컬 저장소 작업에 실패했습니다.'); };
    const request = tx.objectStore(GENERATIONS).get([lease.userId, lease.appId]);
    request.onsuccess = (): void => {
      if (((request.result as Generation | undefined)?.value ?? '') !== lease.generation) { fail(new StorageLeaseExpiredError()); return; }
      try { operation(tx.objectStore(STORE), result => { value = result; }, fail); }
      catch (reason) { fail(reason instanceof Error ? reason : new Error('로컬 저장소 작업에 실패했습니다.')); }
    };
  });
}

async function scope(userId: string, appId: string, lease?: StorageLease): Promise<StorageLease> {
  if (lease && (lease.userId !== userId || lease.appId !== appId)) throw new Error('저장소 실행 영역이 일치하지 않습니다.');
  return lease ?? captureStorageLease(userId, appId);
}

export function validateJson(value: unknown, seen = new Set<object>(), depth = 0): asserts value is JsonValue {
  if (depth > 32) throw new Error('저장 값의 중첩이 너무 깊습니다.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object' || value === null || seen.has(value)) throw new Error('JSON 값만 저장할 수 있습니다.');
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error('일반 JSON 객체만 저장할 수 있습니다.');
  if (Array.isArray(value) && Object.keys(value).length !== value.length) throw new Error('빈 칸이 없는 JSON 배열만 저장할 수 있습니다.');
  seen.add(value);
  for (const child of Object.values(value)) validateJson(child, seen, depth + 1);
  seen.delete(value);
}
function validKey(key: string): void {
  if (!key || key.length > 256 || [...key].some(char => char.charCodeAt(0) < 32)) throw new Error('저장 키는 제어문자 없는 1~256자여야 합니다.');
}

export async function getAppStorage(userId: string, appId: string, key: string, lease?: StorageLease): Promise<JsonValue> {
  validKey(key);
  return access(await scope(userId, appId, lease), 'readonly', (store, resolve) => {
    const request = store.get([userId, appId, key]);
    request.onsuccess = (): void => resolve((request.result as Row | undefined)?.value ?? null);
  });
}

export async function setAppStorage(userId: string, appId: string, key: string, value: unknown, lease?: StorageLease): Promise<void> {
  validKey(key); validateJson(value);
  const bytes = new TextEncoder().encode(key + JSON.stringify(value)).byteLength;
  if (bytes > TEST_LIMITS.localBytes) throw new Error('앱 로컬 저장 한도를 초과했습니다.');
  return access(await scope(userId, appId, lease), 'readwrite', (store, resolve, fail) => {
    const request = store.index('partition').getAll(IDBKeyRange.only([userId, appId]));
    request.onsuccess = (): void => {
      const used = (request.result as Row[]).filter(row => row.key !== key).reduce((sum, row) => sum + row.bytes, 0);
      if (used + bytes > TEST_LIMITS.localBytes) { fail(new Error('앱 로컬 저장 한도를 초과했습니다.')); return; }
      store.put({ userId, appId, key, value, bytes } satisfies Row);
      resolve(undefined);
    };
  });
}

export async function removeAppStorage(userId: string, appId: string, key: string, lease?: StorageLease): Promise<void> {
  validKey(key);
  return access(await scope(userId, appId, lease), 'readwrite', (store, resolve) => {
    store.delete([userId, appId, key]); resolve(undefined);
  });
}

/** The host calls this only after an explicit current-device deletion confirmation. */
export async function clearPreviewStorage(userId: string, appId: string): Promise<void> {
  await clearAppStorage(userId, `preview:${appId}`);
}

/** The host calls this only after an explicit current-device deletion confirmation. */
export async function clearAppStorage(userId: string, appId: string): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE, GENERATIONS], 'readwrite');
    tx.objectStore(GENERATIONS).put({ userId, appId, value: crypto.randomUUID() } satisfies Generation);
    const request = tx.objectStore(STORE).index('partition').openKeyCursor(IDBKeyRange.only([userId, appId]));
    request.onsuccess = (): void => {
      const cursor = request.result;
      if (cursor) { tx.objectStore(STORE).delete(cursor.primaryKey); cursor.continue(); }
    };
    tx.oncomplete = (): void => resolve(); tx.onabort = tx.onerror = (): void => reject(new Error('앱 로컬 데이터를 삭제하지 못했습니다.'));
  });
}
