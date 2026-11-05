import { cloudSchemas, rpcRequestSchema, TEST_LIMITS, CLOUD_LIMITS, type CloudMethod, type AppSessionView, type JsonValue, type RpcRequest, type RpcResponse } from '@zm/platform-contracts';
import { captureStorageLease, clearAppStorage, clearPreviewStorage, getAppStorage, removeAppStorage, setAppStorage, StorageLeaseExpiredError, validateJson } from './storage';
export { clearAppStorage, clearPreviewStorage };

export interface HostOptions {
  iframe: HTMLIFrameElement;
  userId: string;
  session: AppSessionView;
  authorize(): Promise<void>;
  createCode(challenge: string): Promise<{ code: string; expiresAt: string }>;
  cloud?(method: CloudMethod, params: Record<string, unknown>): Promise<JsonValue>;
  onClose(reason?: string): void;
}

export function checkRequest(value: unknown, session: AppSessionView): RpcRequest {
  validateJson(value);
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > TEST_LIMITS.messageBytes) throw new Error('SDK 메시지 한도를 초과했습니다.');
  const request = rpcRequestSchema.parse(value);
  const keys = Object.keys(request.params).sort().join(',');
  if (request.method.startsWith('storage.')) {
    if (!session.manifest.permissions.includes('local-storage')) throw new Error('로컬 저장 권한이 없습니다.');
    if (typeof request.params.key !== 'string' || keys !== (request.method === 'storage.set' ? 'key,value' : 'key')) throw new Error('저장 요청 형식이 올바르지 않습니다.');
  } else if (request.method.startsWith('cloud.')) {
    if (!session.manifest.permissions.includes('cloud-storage')) throw new Error('서버 저장 권한이 없습니다.');
    cloudSchemas[request.method as CloudMethod].parse(request.params);
  } else if (request.method === 'identity.getAppUser') {
    if (!session.manifest.permissions.includes('app-identity') || keys) throw new Error('앱 사용자 식별 권한이 없습니다.');
  } else if (request.method === 'auth.createCode') {
    if (!session.manifest.permissions.includes('external-api') || keys !== 'challenge' || typeof request.params.challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(request.params.challenge)) throw new Error('외부 인증 요청이 올바르지 않습니다.');
  } else if (keys) throw new Error('지원하지 않는 인자입니다.');
  return request;
}

/** Narrow transport boundary: wildcard send is necessary for an opaque sandbox origin. */
export function attachHostBridge(options: HostOptions): { dispose(): void } {
  const { iframe, session, userId } = options;
  const storageAppId = session.isPreview ? `preview:${session.appId}` : session.appId;
  if (!iframe.sandbox.contains('allow-scripts') || iframe.sandbox.length !== 1) throw new Error('앱 iframe에는 allow-scripts만 허용합니다.');
  const instanceId = session.id;
  let port: MessagePort | undefined;
  let disposed = false;
  let loadCount = 0;
  let windowStart = performance.now();
  let requests = 0;
  let pending = 0;
  const ids = new Set<string>();
  const storageAbort = new AbortController();
  const dispose = (): void => {
    if (disposed) return;
    disposed = true; storageAbort.abort(); window.removeEventListener('message', hello); iframe.removeEventListener('load', loaded);
    if (port) { port.onmessage = null; port.close(); }
    ids.clear();
  };
  const terminate = (reason: string): void => { dispose(); options.onClose(reason); };
  // Never acquire a new generation from an SDK request after authorize().
  // While this initial acquisition is pending, no request is executed.
  const storageLease = captureStorageLease(userId, storageAppId, storageAbort.signal).catch(() => null);
  const loaded = (): void => { if (++loadCount > 1) terminate('앱이 다른 문서로 이동하여 실행을 종료했습니다.'); };
  const send = (response: RpcResponse): void => { if (!disposed) port?.postMessage(response); };
  const handle = async (data: unknown): Promise<void> => {
    if (disposed) return;
    if (performance.now() - windowStart >= 1000) { windowStart = performance.now(); requests = 0; }
    if (++requests > 30 || pending >= 16) { terminate('앱의 SDK 요청 한도를 초과했습니다.'); return; }
    let request: RpcRequest;
    try { request = checkRequest(data, session); }
    catch { terminate('허용하지 않는 SDK 요청입니다.'); return; }
    if (ids.has(request.id)) { terminate('중복된 SDK 요청입니다.'); return; }
    ids.add(request.id); pending++;
    if (ids.size > 10000) { terminate('앱 실행의 SDK 요청 한도를 초과했습니다.'); return; }
    try {
      const lease = await storageLease;
      if (disposed) return;
      if (request.method.startsWith('storage.') && !lease) throw Object.assign(new Error('이 브라우저의 로컬 저장소를 사용할 수 없습니다. 서버 저장은 계속 사용할 수 있습니다.'), { code: 'LOCAL_STORAGE_UNAVAILABLE' });
      await options.authorize();
      if (disposed) return;
      let result: JsonValue = null;
      switch (request.method) {
        case 'runtime.ready': result = { appId: session.appId, version: session.manifest.version, platform: 'web', preview: session.isPreview === true, localStorageLimitBytes: TEST_LIMITS.localBytes, cloudStorageLimitBytes: CLOUD_LIMITS.spaceBytes, cloudRecordLimitBytes: CLOUD_LIMITS.recordBytes }; break;
        case 'runtime.close': send({ id: request.id, result: null }); terminate('앱을 종료했습니다.'); return;
        case 'identity.getAppUser': result = { appUserId: session.appUserId }; break;
        case 'auth.createCode': result = await options.createCode(request.params.challenge as string); break;
        case 'storage.get': result = await getAppStorage(userId, storageAppId, request.params.key as string, lease!); break;
        case 'storage.set': await setAppStorage(userId, storageAppId, request.params.key as string, request.params.value, lease!); break;
        case 'storage.remove': await removeAppStorage(userId, storageAppId, request.params.key as string, lease!); break;
        case 'cloud.get': case 'cloud.put': case 'cloud.remove': case 'cloud.list':
          if (!options.cloud) throw Object.assign(new Error('이 호스트는 서버 저장을 지원하지 않습니다.'), { code: 'CLOUD_UNAVAILABLE' });
          result = await options.cloud(request.method, request.params); break;
      }
      if (disposed) return;
      await options.authorize();
      send({ id: request.id, result });
    } catch (error) {
      if (error instanceof StorageLeaseExpiredError) { terminate(error.message); return; }
      const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
      if (status === 401 || status === 403 || status === 404) { terminate('앱 실행 권한이 종료되었습니다.'); return; }
      const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'REQUEST_FAILED';
      send({ id: request.id, error: { code, message: error instanceof Error ? error.message : '요청을 처리하지 못했습니다.' } });
    } finally { pending--; }
  };
  const hello = (event: MessageEvent<unknown>): void => {
    if (disposed || port || event.source !== iframe.contentWindow || event.origin !== 'null' || !event.data || typeof event.data !== 'object') return;
    const data = event.data as Record<string, unknown>;
    if (data.type !== 'ZM_SDK_HELLO' || data.protocol !== 1 || data.instanceId !== instanceId) return;
    const channel = new MessageChannel(); port = channel.port1;
    port.onmessage = (message: MessageEvent<unknown>): void => { void handle(message.data); };
    port.start();
    iframe.contentWindow?.postMessage({ type: 'ZM_HOST_CONNECT', protocol: 1, instanceId }, '*', [channel.port2]);
  };
  window.addEventListener('message', hello); iframe.addEventListener('load', loaded);
  return { dispose };
}
