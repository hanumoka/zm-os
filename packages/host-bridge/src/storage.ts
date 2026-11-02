import { TEST_LIMITS, type JsonValue } from '@zm/platform-contracts';

const DB = 'zm-platform-app-storage-v1';
const STORE = 'entries';
interface Row { userId: string; appId: string; key: string; value: JsonValue; bytes: number }
let database: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = (): void => {
      const store = request.result.createObjectStore(STORE, { keyPath: ['userId', 'appId', 'key'] });
      store.createIndex('partition', ['userId', 'appId']);
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

export async function getAppStorage(userId: string, appId: string, key: string): Promise<JsonValue> {
  validKey(key);
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get([userId, appId, key]);
    request.onsuccess = (): void => resolve((request.result as Row | undefined)?.value ?? null);
    request.onerror = (): void => reject(new Error('로컬 값을 읽지 못했습니다.'));
  });
}

export async function setAppStorage(userId: string, appId: string, key: string, value: unknown): Promise<void> {
  validKey(key); validateJson(value);
  const bytes = new TextEncoder().encode(key + JSON.stringify(value)).byteLength;
  if (bytes > TEST_LIMITS.localBytes) throw new Error('앱 로컬 저장 한도를 초과했습니다.');
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    let error: Error | undefined;
    const request = store.index('partition').getAll(IDBKeyRange.only([userId, appId]));
    request.onsuccess = (): void => {
      const used = (request.result as Row[]).filter(row => row.key !== key).reduce((sum, row) => sum + row.bytes, 0);
      if (used + bytes > TEST_LIMITS.localBytes) { error = new Error('앱 로컬 저장 한도를 초과했습니다.'); tx.abort(); return; }
      store.put({ userId, appId, key, value, bytes } satisfies Row);
    };
    tx.oncomplete = (): void => resolve();
    tx.onabort = tx.onerror = (): void => reject(error ?? new Error('로컬 저장에 실패했습니다.'));
  });
}

export async function removeAppStorage(userId: string, appId: string, key: string): Promise<void> {
  validKey(key);
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete([userId, appId, key]);
    tx.oncomplete = (): void => resolve(); tx.onabort = tx.onerror = (): void => reject(new Error('로컬 값을 삭제하지 못했습니다.'));
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
    const tx = db.transaction(STORE, 'readwrite');
    const request = tx.objectStore(STORE).index('partition').openKeyCursor(IDBKeyRange.only([userId, appId]));
    request.onsuccess = (): void => {
      const cursor = request.result;
      if (cursor) { tx.objectStore(STORE).delete(cursor.primaryKey); cursor.continue(); }
    };
    tx.oncomplete = (): void => resolve(); tx.onabort = tx.onerror = (): void => reject(new Error('앱 로컬 데이터를 삭제하지 못했습니다.'));
  });
}
