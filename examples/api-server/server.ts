import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

interface AuthResult { token: string; appUserId: string; expiresAt: string }
interface Attempt { verifier: string; expiresAt: number }
interface AppLogin { platformToken: string; expiresAt: number }
export interface ExampleConfig { apiBase: string; appId: string; appSecret: string; databasePath: string; request?: typeof fetch }
const token = (): string => randomBytes(32).toString('base64url');
const fingerprint = (value: string): string => createHash('sha256').update(value).digest('hex');

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const raw of request) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as Uint8Array);
    size += chunk.length; if (size > 8192) throw new Error('REQUEST_TOO_LARGE'); chunks.push(chunk);
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_REQUEST');
  return value as Record<string, unknown>;
}

/** This server belongs to an app developer. It is not a platform managed app server. */
export function createExampleServer(config: ExampleConfig): ReturnType<typeof createServer> {
  const request = config.request ?? fetch;
  const db = new DatabaseSync(config.databasePath);
  let databaseClosed = false;
  const closeDatabase = (): void => { if (!databaseClosed) { databaseClosed = true; db.close(); } };
  db.exec('CREATE TABLE IF NOT EXISTS notes (app_user_id TEXT PRIMARY KEY, note TEXT NOT NULL)');
  const attempts = new Map<string, Attempt>();
  const logins = new Map<string, AppLogin>();
  const platform = async (route: string, data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await request(config.apiBase + '/v1/app-auth/' + route, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Basic ' + Buffer.from(config.appId + ':' + config.appSecret).toString('base64') }, body: JSON.stringify(data), signal: AbortSignal.timeout(5000), redirect: 'error',
    });
    if (!response.ok) throw new Error('AUTH_REJECTED');
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('AUTH_REJECTED');
    return result as Record<string, unknown>;
  };
  const send = (response: ServerResponse, status: number, data: unknown): void => {
    response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'x-content-type-options': 'nosniff' }); response.end(JSON.stringify(data));
  };
  const server = createServer((incoming, response) => {
    void (async (): Promise<void> => {
      if (incoming.method === 'OPTIONS') { response.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, PUT, OPTIONS', 'access-control-allow-headers': 'content-type, authorization' }).end(); return; }
      for (const [id, attempt] of attempts) if (attempt.expiresAt <= Date.now()) attempts.delete(id);
      for (const [id, login] of logins) if (login.expiresAt <= Date.now()) logins.delete(id);
      const url = new URL(incoming.url ?? '/', 'http://127.0.0.1:4320');
      if (incoming.method === 'POST' && url.pathname === '/auth/attempt') {
        if (attempts.size >= 100) { send(response, 429, { message: '시험 인증 요청이 너무 많습니다.' }); return; }
        const attemptId = token(); const verifier = token();
        attempts.set(fingerprint(attemptId), { verifier, expiresAt: Date.now() + 60000 });
        send(response, 200, { attemptId, challenge: createHash('sha256').update(verifier).digest('base64url') }); return;
      }
      if (incoming.method === 'POST' && url.pathname === '/auth/complete') {
        const input = await body(incoming);
        if (typeof input.attemptId !== 'string' || typeof input.code !== 'string') throw new Error('INVALID_REQUEST');
        const id = fingerprint(input.attemptId); const attempt = attempts.get(id);
        if (!attempt) throw new Error('AUTH_REJECTED');
        attempts.delete(id); // Consume before exchange. Failure requires a fresh attempt and code.
        const auth = await platform('exchange', { code: input.code, verifier: attempt.verifier });
        if (typeof auth.token !== 'string' || typeof auth.appUserId !== 'string' || typeof auth.expiresAt !== 'string') throw new Error('AUTH_REJECTED');
        const typed = auth as unknown as AuthResult;
        const expiresAt = Date.parse(typed.expiresAt);
        if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new Error('AUTH_REJECTED');
        const sessionToken = token();
        logins.set(fingerprint(sessionToken), { platformToken: typed.token, expiresAt });
        send(response, 200, { sessionToken, appUserId: typed.appUserId }); return;
      }
      if (url.pathname === '/note' && ['GET', 'PUT'].includes(incoming.method ?? '')) {
        const bearer = incoming.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
        const login = bearer ? logins.get(fingerprint(bearer)) : undefined;
        if (!login) throw new Error('AUTH_REJECTED');
        const input = incoming.method === 'PUT' ? await body(incoming) : {};
        if (incoming.method === 'PUT' && (typeof input.note !== 'string' || input.note.length > 4000)) throw new Error('INVALID_REQUEST');
        // Authorize immediately before admitting this DB operation. A later revocation cannot undo an admitted transaction.
        const identity = await platform('introspect', { token: login.platformToken });
        if (identity.active !== true || typeof identity.appUserId !== 'string') { if (bearer) logins.delete(fingerprint(bearer)); throw new Error('AUTH_REJECTED'); }
        const admittedAt = new Date().toISOString();
        if (incoming.method === 'PUT') db.prepare('INSERT INTO notes(app_user_id,note) VALUES(?,?) ON CONFLICT(app_user_id) DO UPDATE SET note=excluded.note').run(identity.appUserId, input.note as string);
        const row = db.prepare('SELECT note FROM notes WHERE app_user_id=?').get(identity.appUserId);
        send(response, 200, { note: row?.note ?? '', admittedAt }); return;
      }
      if (incoming.method === 'GET' && url.pathname === '/health') { send(response, 200, { ok: true, responsibility: 'developer-operated', database: 'SQLite local example' }); return; }
      send(response, 404, { message: '경로를 찾을 수 없습니다.' });
    })().catch(error => {
      const kind = error instanceof Error ? error.message : '';
      const status = kind === 'INVALID_REQUEST' ? 400 : kind === 'REQUEST_TOO_LARGE' ? 413 : 403;
      send(response, status, { message: status === 403 ? '현재 실행 권한을 확인하지 못했습니다.' : '요청 형식이나 크기를 확인하세요.' });
    });
  });
  server.once('close', closeDatabase);
  server.on('error', () => { if (!server.listening) closeDatabase(); });
  return server;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const appId = process.env.APP_ID;
  const appSecret = process.env.APP_SECRET;
  if (!appId || !appSecret) throw new Error('개발자 콘솔에서 발급한 APP_ID와 APP_SECRET 환경변수가 필요합니다.');
  const folder = fileURLToPath(new URL('./.data/', import.meta.url)); mkdirSync(folder, { recursive: true });
  const server = createExampleServer({ apiBase: process.env.PLATFORM_API ?? 'http://127.0.0.1:4310', appId, appSecret, databasePath: folder + '/notes.sqlite' });
  server.on('error', () => { process.stderr.write('외부 API 예제 서버를 시작하지 못했습니다. 포트와 로컬 저장소를 확인하세요.\n'); process.exitCode = 1; });
  server.listen(4320, '127.0.0.1', () => process.stdout.write('개발자 외부 API 예제: http://127.0.0.1:4320\n'));
  process.once('SIGINT', () => server.close()); process.once('SIGTERM', () => server.close());
}
