import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { createExampleServer } from '../../../examples/api-server/server';

describe('developer-owned external server contract', () => {
  it('closes its database when the listener cannot start', async () => {
    const first = createExampleServer({ apiBase: 'http://127.0.0.1:4310', appId: 'test-app', appSecret: 'test-only-fixture', databasePath: ':memory:' });
    first.listen(0, '127.0.0.1'); await once(first, 'listening');
    const second = createExampleServer({ apiBase: 'http://127.0.0.1:4310', appId: 'test-app', appSecret: 'test-only-fixture', databasePath: ':memory:' });
    const failed = once(second, 'error'); second.listen((first.address() as AddressInfo).port, '127.0.0.1');
    try { const [error] = await failed; expect(error).toMatchObject({ code: 'EADDRINUSE' }); }
    finally { await new Promise<void>((resolve, reject) => first.close(error => error ? reject(error) : resolve())); }
  });
  it('keeps PKCE verifier server-side, consumes attempts, isolates users, and fails closed after revocation', async () => {
    let active = true;
    let observedVerifier = '';
    let checks = 0;
    const fakeFetch: typeof fetch = async (input, init): Promise<Response> => {
      const data = JSON.parse(String(init?.body)) as Record<string, string>;
      if (String(input).endsWith('/exchange')) {
        observedVerifier = data.verifier ?? '';
        return Response.json({ token: data.code, appUserId: data.code, expiresAt: new Date(Date.now() + 60000).toISOString() });
      }
      checks++;
      return Response.json({ active, ...(active ? { appUserId: data.token } : {}) });
    };
    const server = createExampleServer({ apiBase: 'http://127.0.0.1:4310', appId: 'test-app', appSecret: 'test-only-fixture', databasePath: ':memory:', request: fakeFetch });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
    const post = (route: string, value: unknown): Promise<Response> => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
    try {
      const attempt = await (await post('/auth/attempt', {})).json() as { attemptId: string; challenge: string; verifier?: string };
      expect(attempt.verifier).toBeUndefined(); expect(attempt.challenge).toHaveLength(43);
      const alice = await (await post('/auth/complete', { attemptId: attempt.attemptId, code: 'alice' })).json() as { sessionToken: string };
      expect(observedVerifier).toHaveLength(43);
      expect((await post('/auth/complete', { attemptId: attempt.attemptId, code: 'alice' })).status).toBe(403);
      const authorization = 'Bearer ' + alice.sessionToken;
      expect((await fetch(base + '/note', { method: 'PUT', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify({ note: 'alice-private' }) })).status).toBe(200);
      const bobAttempt = await (await post('/auth/attempt', {})).json() as { attemptId: string };
      const bob = await (await post('/auth/complete', { attemptId: bobAttempt.attemptId, code: 'bob' })).json() as { sessionToken: string };
      expect(await (await fetch(base + '/note', { headers: { authorization: 'Bearer ' + bob.sessionToken } })).json()).toMatchObject({ note: '' });
      expect(await (await fetch(base + '/note', { headers: { authorization } })).json()).toMatchObject({ note: 'alice-private' });
      active = false;
      expect((await fetch(base + '/note', { headers: { authorization } })).status).toBe(403);
      expect(checks).toBe(4);
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });
});
