/** 로컬 웹 인수 전용. 기존 trial DB/파일과 독립된 DB·포트를 사용한다.
 * 소유자: zm-os. 검토일: 2026-11-03.
 * 전제: platform:setup의 PostgreSQL 컨테이너와 pnpm 의존성.
 * 실행: node scripts/platform-web-check.mjs external-deletion|moderation|runner-lifecycle|desktop|desktop-icons|email-auth|all
 * 완료: 브라우저 시험 성공, 자기 서버·DB·임시 파일 정리 후 exit 0.
 * 실패: 자기 자원만 정리하고 실패 코드를 반환한다. 실제 OAuth는 사용하지 않는다.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, lstat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer as createNetServer } from 'node:net';

async function main() {
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const apiRoot = join(root, 'apps/api'), webRoot = join(root, 'apps/platform-web');
const apiRequire = createRequire(join(apiRoot, 'package.json'));
const webRequire = createRequire(join(webRoot, 'package.json'));
const tests = {
  'external-deletion': 'external-deletion.mjs',
  moderation: 'moderation.mjs',
  'runner-lifecycle': 'runner-lifecycle.mjs',
  desktop: 'desktop.mjs',
  'desktop-icons': 'desktop-icons.mjs',
  'email-auth': 'email-auth.mjs',
};
const mode = process.argv[2] ?? 'all';
assert.ok(mode === 'all' || Object.hasOwn(tests, mode), '알려진 웹 인수 시험 이름만 지정하세요.');
const targets = mode === 'all' ? Object.values(tests) : [tests[mode]];
for (const target of targets) await lstat(join(webRoot, 'e2e', target));

const label = spawnSync('docker', ['inspect', '--format', '{{index .Config.Labels "zm-os.trial"}}', 'zm-os-platform-trial-db'], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
assert.equal(label.status, 0, '로컬 trial PostgreSQL 컨테이너가 필요합니다.');
assert.equal(label.stdout.trim(), 'platform-rebuild', '소유 label이 다른 DB는 사용하지 않습니다.');
const local = JSON.parse(await readFile(join(root, '.trial/config.json'), 'utf8'));
const source = new URL(local.DATABASE_URL);
assert.ok(source.hostname === '127.0.0.1' && source.port === '15438' && source.pathname === '/zmtrial', '정해진 로컬 trial DB 접속만 허용합니다.');
for (const port of [14600, 14610, 14611, 14612]) {
  await new Promise((done, reject) => {
    const probe = createNetServer();
    probe.once('error', () => reject(new Error(`시험 포트 ${port}가 이미 사용 중입니다.`)));
    probe.listen(port, '127.0.0.1', () => probe.close(done));
  });
}
const { default: pg } = await import(pathToFileURL(apiRequire.resolve('pg')).href);
const { createServer } = await import(pathToFileURL(webRequire.resolve('vite')).href);
const admin = new pg.Pool({ connectionString: source.toString() });
const name = `zmwebui_${randomBytes(6).toString('hex')}`;
const files = await mkdtemp(join(tmpdir(), 'zm-os-web-check-'));
const testUrl = new URL(source);testUrl.pathname = '/'+name;
const env = {
  ...process.env, ZM_MODE: 'local-test', ZM_TEST_AUTH: '1',
  DATABASE_URL: testUrl.toString(), ZM_TEST_DATABASE_URL: testUrl.toString(), ZM_FILES: files,
  ZM_ASSET_SECRET: randomBytes(32).toString('hex'), PORT: '14610', ASSET_PORT: '14611',
  WEB_ORIGIN: 'http://localhost:14600', ZM_WEB_URL: 'http://localhost:14600', ASSET_ORIGIN: 'http://localhost:14611',
  GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', GITHUB_CLIENT_ID: '', GITHUB_CLIENT_SECRET: '',
};
const children = new Set();
let vite, created = false, cleanupPromise, interrupted = false;
function child(args, cwd, visibleLogs = false) {
  assert.equal(interrupted, false, '중단된 시험에서 새 프로세스를 시작하지 않습니다.');
  const processChild = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ['ignore', visibleLogs ? 'inherit' : 'pipe', 'pipe'] });
  processChild.on('error', () => {});
  // Error call logs can contain lookup secrets or credentials. Only browser PASS messages use stdout.
  processChild.stdout?.resume();processChild.stderr?.resume();
  children.add(processChild);
  return processChild;
}
async function stopChild(processChild) {
  if (!processChild.pid || processChild.exitCode !== null || processChild.signalCode !== null) return;
  await new Promise(done => {
    const timeout = setTimeout(() => processChild.kill('SIGKILL'), 5000);
    processChild.once('close', () => { clearTimeout(timeout); done(); });
    processChild.kill('SIGTERM');
  });
}
function cleanup() {
  cleanupPromise ??= (async () => {
  const failures = [];
  const results = await Promise.allSettled([...children].map(stopChild));
  failures.push(...results.filter(result => result.status === 'rejected'));
  try { if (vite) await vite.close(); } catch { failures.push('web'); }
  try {
    if (created) {
      assert.match(name, /^zmwebui_[a-f0-9]{12}$/);
      await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
      assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount, 0);
    }
  } catch { failures.push('database'); }
  try { await admin.end(); } catch { failures.push('pool'); }
  try {
    assert.equal(dirname(resolve(files)), resolve(tmpdir()));
    assert.ok(files.startsWith(join(tmpdir(), 'zm-os-web-check-')));
    assert.equal((await lstat(files)).isSymbolicLink(), false);
    await rm(files, { recursive: true, force: true });
  } catch { failures.push('files'); }
  assert.equal(failures.length, 0, '자기 시험 자원 일부를 정리하지 못했습니다.');
  })();
  return cleanupPromise;
}
function abort(signal) {
  interrupted = true;process.exitCode = 1;
  console.error(`시험이 ${signal}로 중단되었습니다. 생성 중인 작업이 끝나면 자기 자원을 정리합니다.`);
  for (const processChild of children) processChild.kill('SIGTERM');
}
process.once('SIGINT', () => abort('SIGINT'));
process.once('SIGTERM', () => abort('SIGTERM'));
try {
  await admin.query(`CREATE DATABASE ${name}`);created = true;
  const api = child(['--import', 'tsx', 'src/main.ts'], apiRoot);
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(interrupted, false, '시험을 중단했습니다.');
    assert.equal(api.exitCode, null, '시험 API가 준비 전에 종료되었습니다.');
    try {
      const health = await fetch('http://127.0.0.1:14610/v1/health', { signal: AbortSignal.timeout(1000) });
      if (health.ok) { ready = true; break; }
    } catch { /* Owned process starting. */ }
    await new Promise(done => setTimeout(done, 100));
  }
  assert.ok(ready, '시험 API 준비 시간이 초과되었습니다.');
  child(['--import', 'tsx', 'src/main.ts'], join(root, 'apps/worker'));
  vite = await createServer({
    root: webRoot, configFile: join(webRoot, 'vite.config.ts'), logLevel: 'error',
    server: { host: '127.0.0.1', port: 14600, strictPort: true, proxy: { '/v1': 'http://127.0.0.1:14610' } },
  });
  assert.equal(interrupted, false, '시험을 중단했습니다.');
  await vite.listen();
  assert.equal(interrupted, false, '시험을 중단했습니다.');
  assert.equal((await fetch('http://localhost:14600/v1/health')).status, 200);
  console.info('독립 웹 시험 환경 준비 완료: 웹 14600 · API 14610 · 자산 14611');
  for (const target of targets) {
    const browser = child([join(webRoot, 'e2e', target)], webRoot, true);
    const code = await new Promise((done, reject) => {
      browser.once('error', () => reject(new Error('브라우저 시험 시작 실패')));
      browser.once('close', done);
    });
    assert.equal(code, 0, `브라우저 시험 실패: ${target}`);
  }
} catch (error) {
  // Connection errors can embed connection strings; print the known assertion boundary only.
  console.error(error instanceof assert.AssertionError ? error.message.split('\n')[0] : '독립 웹 시험 실행에 실패했습니다. 비밀 값이 포함될 수 있는 원문은 출력하지 않습니다.');
  process.exitCode = 1;
} finally {
  await cleanup();
  console.info('자기 시험 서버·DB·임시 파일 정리 완료');
}
}

try { await main(); }
catch { console.error('독립 웹 시험 준비 또는 정리에 실패했습니다. 자격증명을 포함할 수 있는 오류 원문은 출력하지 않습니다.'); process.exitCode = 1; }
