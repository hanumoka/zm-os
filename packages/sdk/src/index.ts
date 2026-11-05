import type { CloudRecord, CloudWriteResult, CloudPut, CloudRemove, CloudList, JsonValue, RpcRequest, RpcResponse } from '@zm/platform-contracts';

export class SdkError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'SdkError'; }
}
export interface Sdk {
  runtime: { ready(): Promise<JsonValue>; close(): Promise<void> };
  storage: { get(key: string): Promise<JsonValue>; set(key: string, value: JsonValue): Promise<void>; remove(key: string): Promise<void> };
  cloud: {
    get(key: string): Promise<CloudRecord>;
    put(key: string, data: CloudPut): Promise<CloudWriteResult>;
    remove(key: string, data: CloudRemove): Promise<CloudWriteResult>;
    list(options?: { cursor?: string; limit?: number }): Promise<CloudList>;
  };
  identity: { getAppUser(): Promise<{ appUserId: string }> };
  auth: { createCode(challenge: string): Promise<{ code: string; expiresAt: string }> };
  dispose(): void;
}
interface Pending { resolve: (value: JsonValue) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
export interface RpcClient { call(method: RpcRequest['method'], params?: Record<string, unknown>): Promise<JsonValue>; dispose(): void }

/** A connected port is a capability. Only the handshake below creates it in an app. */
export function createRpcClient(port: MessagePort, timeoutMs = 10000): RpcClient {
  const pending = new Map<string, Pending>();
  let closed = false;
  port.onmessage = (event: MessageEvent<unknown>): void => {
    const data = event.data;
    if (!data || typeof data !== 'object' || !('id' in data) || typeof data.id !== 'string') return;
    const entry = pending.get(data.id);
    if (!entry) return;
    const response = data as RpcResponse;
    pending.delete(data.id); clearTimeout(entry.timer);
    if (response.error) entry.reject(new SdkError(response.error.code, response.error.message));
    else entry.resolve(response.result ?? null);
  };
  port.start();
  const dispose = (): void => {
    if (closed) return;
    closed = true; port.onmessage = null; port.close();
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new SdkError('CLOSED', '앱 연결이 종료되었습니다.')); }
    pending.clear();
  };
  return {
    call(method, params = {}): Promise<JsonValue> {
      if (closed) return Promise.reject(new SdkError('CLOSED', '앱 연결이 종료되었습니다.'));
      if (pending.size >= 64) return Promise.reject(new SdkError('BUSY', '동시에 처리할 수 있는 요청 수를 넘었습니다.'));
      const id = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new SdkError('TIMEOUT', '호스트 응답 시간이 초과되었습니다.')); }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        try { port.postMessage({ id, method, params } satisfies RpcRequest); }
        catch { clearTimeout(timer); pending.delete(id); reject(new SdkError('INVALID_VALUE', '전송 가능한 값이 아닙니다.')); }
      });
    },
    dispose,
  };
}

export function createSdk(): Sdk {
  let client: Promise<RpcClient> | undefined;
  let active: RpcClient | undefined;
  let disposed = false;
  let cancelConnect: (() => void) | undefined;
  const connect = (): Promise<RpcClient> => {
    if (disposed) return Promise.reject(new SdkError('CLOSED', '앱 연결이 종료되었습니다.'));
    if (client) return client;
    client = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || window.parent === window) { reject(new SdkError('NO_HOST', 'zm-os 실행 호스트에서 앱을 열어 주세요.')); return; }
      const instanceId = new URL(window.location.href).searchParams.get('instance');
      if (!instanceId) { reject(new SdkError('NO_HOST', '앱 실행 식별자가 없습니다.')); return; }
      const cleanup = (): void => { clearInterval(interval); clearTimeout(timer); window.removeEventListener('message', receive); cancelConnect = undefined; };
      const receive = (event: MessageEvent<unknown>): void => {
        if (event.source !== window.parent || !event.data || typeof event.data !== 'object') return;
        const data = event.data as Record<string, unknown>;
        if (data.type !== 'ZM_HOST_CONNECT' || data.protocol !== 1 || data.instanceId !== instanceId || !event.ports[0]) return;
        cleanup(); active = createRpcClient(event.ports[0]); resolve(active);
      };
      const hello = (): void => window.parent.postMessage({ type: 'ZM_SDK_HELLO', protocol: 1, instanceId }, '*');
      window.addEventListener('message', receive);
      const interval = setInterval(hello, 200);
      const timer = setTimeout(() => { cleanup(); reject(new SdkError('NO_HOST', '실행 호스트에 연결하지 못했습니다.')); }, 10000);
      cancelConnect = (): void => { cleanup(); reject(new SdkError('CLOSED', '앱 연결이 종료되었습니다.')); };
      hello();
    });
    return client;
  };
  const call = async (method: RpcRequest['method'], params?: Record<string, unknown>): Promise<JsonValue> => (await connect()).call(method, params);
  const dispose = (): void => { disposed = true; cancelConnect?.(); active?.dispose(); };
  return {
    runtime: { ready: () => call('runtime.ready'), close: async () => { await call('runtime.close'); dispose(); } },
    storage: {
      get: key => call('storage.get', { key }),
      set: async (key, value) => { await call('storage.set', { key, value }); },
      remove: async key => { await call('storage.remove', { key }); },
    },
    identity: { getAppUser: async () => await call('identity.getAppUser') as { appUserId: string } },
    cloud: {
      get: async key => await call('cloud.get', { key }) as CloudRecord,
      put: async (key, data) => await call('cloud.put', { ...data, key }) as CloudWriteResult,
      remove: async (key, data) => await call('cloud.remove', { ...data, key }) as CloudWriteResult,
      list: async (options = {}) => await call('cloud.list', options) as CloudList,
    },
    auth: { createCode: async challenge => await call('auth.createCode', { challenge }) as { code: string; expiresAt: string } },
    dispose,
  };
}

export const zm = createSdk();
