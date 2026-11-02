import { afterEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import type { AppSessionView } from '@zm/platform-contracts';
import { attachHostBridge, clearPreviewStorage } from './index';

const session: AppSessionView = { id: 'session-1', appId: 'app-1', appUserId: 'app-user-1', versionId: 'version-1', expiresAt: '2026-12-01T00:00:00Z', documentUrl: 'http://127.0.0.1:4311/app?instance=session-1', manifest: { schemaVersion: 1, appId: '00000000-0000-4000-8000-000000000001', version: '1.0.0', name: 'notes', description: 'notes', category: 'tools', entry: 'index.html', permissions: ['app-identity'], apiOrigins: [], privacyNotice: 'test' } };
const sleep = async (): Promise<void> => new Promise(resolve => setTimeout(resolve, 20));
function fixture(authorize: () => Promise<void> = async () => undefined, execution = session): { sendHello(source: unknown, instanceId?: string): void; frameWindow: object; ports: MessagePort[]; dispose(): void; close: ReturnType<typeof vi.fn>; frame: EventTarget } {
  const host = new EventTarget(); vi.stubGlobal('window', host);
  const ports: MessagePort[] = [];
  const frameWindow = { postMessage: (_data: unknown, _origin: string, transfer: MessagePort[]): void => { if (transfer[0]) ports.push(transfer[0]); } };
  const frame = Object.assign(new EventTarget(), { sandbox: { length: 1, contains: (value: string): boolean => value === 'allow-scripts' }, contentWindow: frameWindow });
  const close = vi.fn();
  const bridge = attachHostBridge({ iframe: frame as unknown as HTMLIFrameElement, userId: 'platform-user-private', session: execution, authorize, createCode: async () => ({ code: 'not-used', expiresAt: '' }), onClose: close });
  const sendHello = (source: unknown, instanceId = session.id): void => {
    const event = Object.assign(new Event('message'), { source, origin: 'null', data: { type: 'ZM_SDK_HELLO', protocol: 1, instanceId } }); host.dispatchEvent(event);
  };
  return { sendHello, frameWindow, ports, dispose: (): void => { bridge.dispose(); for (const port of ports) port.close(); }, close, frame };
}
afterEach(() => vi.unstubAllGlobals());
describe('MessagePort source and execution binding', () => {
  async function storage(execution: AppSessionView, method: string, params: Record<string, unknown>): Promise<unknown> {
    const f = fixture(async () => undefined, execution);
    try {
      f.sendHello(f.frameWindow);
      return await new Promise((resolve, reject) => {
        const port = f.ports[0]!;
        const timer = setTimeout(() => reject(new Error('bridge timeout')), 1000);
        port.onmessage = (event): void => { clearTimeout(timer); if (event.data.error) reject(new Error(String(event.data.error.message))); else resolve(event.data.result); };
        port.start(); port.postMessage({ id: crypto.randomUUID(), method, params });
      });
    } finally { f.dispose(); }
  }
  it('isolates preview reads and writes from the same user and published app', async () => {
    const normal: AppSessionView = { ...session, manifest: { ...session.manifest, permissions: ['local-storage'] } };
    const preview = { ...normal, isPreview: true };
    await storage(normal, 'storage.set', { key: 'preview-boundary', value: 'published-data' });
    expect(await storage(preview, 'storage.get', { key: 'preview-boundary' })).toBeNull();
    await storage(preview, 'storage.set', { key: 'preview-boundary', value: 'draft-data' });
    expect(await storage(normal, 'storage.get', { key: 'preview-boundary' })).toBe('published-data');
    expect(await storage(preview, 'storage.get', { key: 'preview-boundary' })).toBe('draft-data');
  });
  it('deletes only preview storage after a separate confirmation', async () => {
    const normal: AppSessionView = { ...session, manifest: { ...session.manifest, permissions: ['local-storage'] } };
    const preview = { ...normal, isPreview: true };
    await storage(normal, 'storage.set', { key: 'preview-delete', value: 'keep' });
    await storage(preview, 'storage.set', { key: 'preview-delete', value: 'delete' });
    await clearPreviewStorage('platform-user-private', session.appId);
    expect(await storage(normal, 'storage.get', { key: 'preview-delete' })).toBe('keep');
    expect(await storage(preview, 'storage.get', { key: 'preview-delete' })).toBeNull();
  });
  it('does not trust null origin from another frame or a previous instance', () => {
    const f = fixture();
    try {
      f.sendHello({}); f.sendHello(f.frameWindow, 'old-session'); expect(f.ports).toHaveLength(0);
      f.sendHello(f.frameWindow); expect(f.ports).toHaveLength(1);
      f.sendHello(f.frameWindow); expect(f.ports).toHaveLength(1);
    } finally { f.dispose(); }
  });
  it('discards a late asynchronous grant after the host disposes the execution', async () => {
    let release: (() => void) | undefined;
    const authorize = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
    const f = fixture(authorize); let responses = 0;
    try {
      f.sendHello(f.frameWindow);
      const port = f.ports[0]!; port.onmessage = (): void => { responses++; }; port.start();
      port.postMessage({ id: 'request', method: 'identity.getAppUser', params: {} });
      await sleep(); expect(authorize).toHaveBeenCalledOnce(); f.dispose(); release?.(); await sleep(); expect(responses).toBe(0);
    } finally { f.dispose(); }
  });
  it('terminates on navigation and on revoked authorization', async () => {
    const f = fixture(async () => { throw Object.assign(new Error('revoked'), { status: 403 }); });
    try {
      f.sendHello(f.frameWindow); f.ports[0]!.postMessage({ id: 'request', method: 'runtime.ready', params: {} });
      await sleep(); expect(f.close).toHaveBeenCalledWith('앱 실행 권한이 종료되었습니다.');
    } finally { f.dispose(); }
    const navigation = fixture();
    try { navigation.frame.dispatchEvent(new Event('load')); expect(navigation.close).not.toHaveBeenCalled(); navigation.frame.dispatchEvent(new Event('load')); expect(navigation.close).toHaveBeenCalledOnce(); }
    finally { navigation.dispose(); }
  });
});
