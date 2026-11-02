import { describe, expect, it } from 'vitest';
import { createRpcClient } from './index';

describe('SDK RPC lifecycle', () => {
  it('matches responses and ignores unknown or late response IDs', async () => {
    const channel = new MessageChannel();
    const client = createRpcClient(channel.port1, 1000);
    channel.port2.onmessage = event => {
      channel.port2.postMessage({ id: 'wrong-id', result: 'not-this' });
      channel.port2.postMessage({ id: event.data.id, result: { appUserId: 'app-user' } });
    };
    expect(await client.call('identity.getAppUser')).toEqual({ appUserId: 'app-user' });
    client.dispose(); channel.port2.close();
  });
  it('bounds requests that receive no host response', async () => {
    const channel = new MessageChannel(); const client = createRpcClient(channel.port1, 10);
    await expect(client.call('runtime.ready')).rejects.toMatchObject({ code: 'TIMEOUT' });
    client.dispose(); channel.port2.close();
  });
  it('rejects pending calls and further calls after disposal', async () => {
    const channel = new MessageChannel(); const client = createRpcClient(channel.port1);
    const pending = client.call('storage.get', { key: 'note' }); client.dispose();
    await expect(pending).rejects.toMatchObject({ code: 'CLOSED' });
    await expect(client.call('runtime.ready')).rejects.toMatchObject({ code: 'CLOSED' });
    channel.port2.close();
  });
});
