/**
 * 소유자: zm-os. 검토일: 2026-11-02. 로컬 웹 복구 검증 전용.
 * 전제: pnpm install/build, platform:setup의 전용 PostgreSQL 컨테이너 실행.
 * 실행: node scripts/platform-recovery.mjs
 * 절차: 무작위 fixture DB → HTTP 등록/검수/공개 → writer 중지 →
 * pg_dump + 파일 지문 → 다른 무작위 DB/폴더 복원 → HTTP 실행/이전판 공개.
 * 완료: JSON 결과의 checks가 모두 통과하고 소유 DB/폴더 정리.
 * 근거: .trial/recovery-report.json (성공한 정리 이후 생성, 실행 시작 시 이전 결과 제거).
 * 실패: 기존 zmtrial/.trial/files에는 쓰지 않는다. 오류를 보고하고 소유 자원만 정리.
 * 범위: 정지한 시험 fixture의 논리 백업. live snapshot/PITR/운영 RPO·RTO,
 * DB schema downgrade, OAuth 네트워크, 외부 개발자 DB, 브라우저 IDB는 미검증.
 * 복원물에는 시험 계정의 세션도 포함된다. 운영 복구용 인증 철회/키 복원 정책을
 * 구현한 도구가 아니며 임의 원본·복원 DB/경로를 CLI로 받지 않는다.
 */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, writeFile, readdir, lstat, rm, copyFile } from 'node:fs/promises';
import { dirname, join, resolve, relative, isAbsolute, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { createServer } from 'node:net';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const apiRoot = join(root, 'apps', 'api');
const apiRequire = createRequire(join(apiRoot, 'package.json'));
const container = 'zm-os-platform-trial-db';
const databasePattern = /^zmrecovery_[a-f0-9]{12}_(source|restore|failed|retry)$/;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const wait = ms => new Promise(resolveWait => setTimeout(resolveWait, ms));

export function ownedDatabase(name) {
  if (!databasePattern.test(name)) throw new Error('복구 시험 소유 DB 이름이 아닙니다.');
  return name;
}

export function childPath(base, name) {
  if (typeof name !== 'string' || !name || /[\\:]/.test(name) || [...name].some(character => character.charCodeAt(0) < 32) || name.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('안전하지 않은 복구 파일 경로입니다.');
  const target = resolve(base, name);
  const child = relative(resolve(base), target);
  if (!child || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) throw new Error('복구 경로가 소유 폴더를 벗어났습니다.');
  return target;
}

async function inventory(directory, prefix = '') {
  const files = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = prefix + entry.name;
    const absolute = childPath(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('복구 파일에 링크를 허용하지 않습니다.');
    if (entry.isDirectory()) files.push(...await inventory(absolute, `${name}/`));
    else if (entry.isFile()) {
      const bytes = await readFile(absolute);
      files.push({ path: name, bytes: bytes.length, sha256: digest(bytes) });
    } else throw new Error('복구 파일은 일반 파일이어야 합니다.');
  }
  return files;
}

function docker(args, input) {
  const result = spawnSync('docker', args, { encoding: null, input, windowsHide: true, maxBuffer: 32 * 1024 * 1024, timeout: 30000 });
  if (result.status !== 0 || result.error) throw new Error('전용 컨테이너의 복구 명령이 실패했습니다. 자격증명·원문 출력은 생략합니다.');
  return result.stdout;
}

async function ensureDirectory(directory) {
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('일반 복구 디렉터리가 아닙니다.');
}

export async function verifySnapshot(snapshot) {
  await ensureDirectory(snapshot);
  const raw = await readFile(join(snapshot, 'manifest.json'));
  if (raw.length > 1024 * 1024) throw new Error('복구 매니페스트가 너무 큽니다.');
  const manifest = JSON.parse(raw.toString('utf8'));
  if (manifest.format !== 1 || manifest.kind !== 'zm-os-local-recovery-fixture' || !Array.isArray(manifest.files) || manifest.files.length > 2000) throw new Error('지원하지 않는 복구 매니페스트입니다.');
  ownedDatabase(manifest.source);
  const fileRoot = join(snapshot, 'files');
  await ensureDirectory(fileRoot);
  for (const entry of manifest.files) {
    childPath(fileRoot, entry.path);
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('잘못된 파일 지문입니다.');
  }
  if (manifest.database?.path !== 'database.dump') throw new Error('잘못된 DB 백업 경로입니다.');
  const dumpPath = join(snapshot, 'database.dump');
  const dumpStat = await lstat(dumpPath);
  if (!dumpStat.isFile() || dumpStat.isSymbolicLink()) throw new Error('일반 DB 백업 파일이 아닙니다.');
  const dump = await readFile(dumpPath);
  if (dump.length !== manifest.database.bytes || digest(dump) !== manifest.database.sha256) throw new Error('DB 백업 지문이 일치하지 않습니다.');
  assert.deepEqual(await inventory(fileRoot), manifest.files, '번들 백업이 누락되었거나 변경되었습니다.');
  return manifest;
}

async function snapshotFixture(source, files, target) {
  ownedDatabase(source);
  await mkdir(target, { recursive: false });
  const fileRoot = join(target, 'files');
  await mkdir(fileRoot);
  const entries = await inventory(files);
  for (const entry of entries) {
    const destination = childPath(fileRoot, entry.path);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(childPath(files, entry.path), destination);
  }
  const dump = docker(['exec', container, 'pg_dump', '-U', 'zmtrial', '-Fc', '--no-owner', '--no-acl', '-d', source]);
  await writeFile(join(target, 'database.dump'), dump, { flag: 'wx', mode: 0o600 });
  const manifest = { format: 1, kind: 'zm-os-local-recovery-fixture', source, database: { path: 'database.dump', bytes: dump.length, sha256: digest(dump) }, files: entries };
  await writeFile(join(target, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
  await verifySnapshot(target);
  return manifest;
}

async function removeOwnedDirectory(workspace, directory) {
  const target = childPath(workspace, relative(workspace, directory).split(sep).join('/'));
  await rm(target, { recursive: true, force: true });
}

async function dropOwnedDatabase(admin, name) {
  ownedDatabase(name);
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
}

async function restoreFixture(admin, snapshot, name, workspace, files) {
  ownedDatabase(name);
  childPath(workspace, relative(workspace, files).split(sep).join('/'));
  const manifest = await verifySnapshot(snapshot); // No DB or output created before verification.
  let created = false, directoryCreated = false;
  try {
    // No overwrite: retrying an already completed destination is rejected.
    await mkdir(files, { recursive: false }); directoryCreated = true;
    await admin.query(`CREATE DATABASE ${name}`); created = true;
    docker(['exec', '-i', container, 'pg_restore', '-U', 'zmtrial', '--exit-on-error', '--single-transaction', '--no-owner', '--no-acl', '-d', name], await readFile(join(snapshot, 'database.dump')));
    for (const entry of manifest.files) {
      const destination = childPath(files, entry.path);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(childPath(join(snapshot, 'files'), entry.path), destination);
    }
    assert.deepEqual(await inventory(files), manifest.files);
    return { name, files };
  } catch (error) {
    if (created) await dropOwnedDatabase(admin, name);
    if (directoryCreated) await removeOwnedDirectory(workspace, files);
    throw error;
  }
}

class Client {
  cookie = ''; csrf = '';
  async call(path, method = 'GET', body, headers = {}, discardBody = false) {
    const response = await fetch(`http://127.0.0.1:14510/v1${path}`, {
      method, redirect: 'manual', signal: AbortSignal.timeout(10000),
      headers: { ...(this.cookie ? { cookie: this.cookie } : {}), ...(this.csrf ? { 'x-csrf-token': this.csrf } : {}), ...(body === undefined ? {} : { 'content-type': Buffer.isBuffer(body) ? 'application/zip' : 'application/json' }), ...headers },
      body: body === undefined ? undefined : Buffer.isBuffer(body) ? new Uint8Array(body) : JSON.stringify(body),
    });
    for (const item of response.headers.getSetCookie()) if (item.startsWith('zm_session=')) this.cookie = item.split(';')[0];
    if (discardBody) { await response.body?.cancel(); return { status: response.status }; }
    return { status: response.status, data: await response.json() };
  }
  async ok(path, method = 'GET', body, headers) {
    const result = await this.call(path, method, body, headers);
    assert.equal(result.status, 200, `${method} ${path} status=${result.status}`); return result.data;
  }
  async login(subject) {
    await this.ok('/test/login', 'POST', { subject, provider: 'google', ageConfirmed: true });
    const me = await this.ok('/me'); this.csrf = me.csrf; return me;
  }
}

async function startServer(config) {
  for (const port of [14510, 14511]) {
    const probe = createServer();
    await new Promise((resolveListen, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', resolveListen); });
    await new Promise((resolveClose, reject) => probe.close(error => error ? reject(error) : resolveClose()));
  }
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
    cwd: apiRoot, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'],
    env: { ...process.env, ZM_MODE: 'local-test', ZM_TEST_AUTH: '1', DATABASE_URL: config.databaseUrl, ZM_FILES: config.files, PORT: '14510', ASSET_PORT: '14511', ASSET_ORIGIN: 'http://127.0.0.1:14511', WEB_ORIGIN: 'http://localhost:4300', ZM_ASSET_SECRET: config.assetSecret },
  });
  let childError;
  child.once('error', error => { childError = error; });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const closed = once(child, 'close'); child.kill('SIGTERM');
    await Promise.race([closed, wait(5000).then(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); })]);
    if (child.exitCode === null && child.signalCode === null) await closed;
  };
  for (let attempt = 0; attempt < 80; attempt++) {
    if (childError || child.exitCode !== null) { await stop(); throw new Error('독립 복구 시험 API를 시작하지 못했습니다.'); }
    try { if ((await new Client().call('/health')).status === 200) return { stop }; } catch { /* Owned server starts asynchronously. */ }
    await wait(100);
  }
  await stop(); throw new Error('복구 시험 API 준비 시간 초과');
}

async function databaseState(db) {
  const names = (await db.pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(row => row.tablename);
  const counts = {};
  for (const name of names) {
    assert.match(name, /^[a-z_]+$/);
    counts[name] = (await db.pool.query(`SELECT count(*)::int AS count FROM ${name}`)).rows[0].count;
  }
  return { counts, apps: (await db.pool.query('SELECT * FROM apps ORDER BY id')).rows, versions: (await db.pool.query('SELECT id,app_id,hash,asset_revision,validation_status,review_status FROM versions ORDER BY id')).rows };
}

export async function runRecovery() {
  const reportPath = join(root, '.trial', 'recovery-report.json');
  await rm(reportPath, { force: true });
  const { register } = await import(pathToFileURL(apiRequire.resolve('tsx/esm/api')).href); register();
  const [{ Database }, { workOnce }, { createZip }] = await Promise.all([import('../apps/api/src/db.ts'), import('../apps/api/src/worker.ts'), import('../packages/cli/src/bundle.ts')]);
  const { default: pg } = await import(pathToFileURL(apiRequire.resolve('pg')).href);
  const config = JSON.parse(await readFile(join(root, '.trial', 'config.json'), 'utf8'));
  const url = new URL(config.DATABASE_URL);
  if (url.hostname !== '127.0.0.1' || url.port !== '15438' || url.pathname !== '/zmtrial' || url.username !== 'zmtrial') throw new Error('기존 전용 시험 DB 설정만 사용할 수 있습니다.');
  const label = docker(['inspect', '--format', '{{index .Config.Labels "zm-os.trial"}}', container]).toString().trim();
  if (label !== 'platform-rebuild') throw new Error('전용 시험 컨테이너의 소유 label이 일치하지 않습니다.');
  const admin = new pg.Pool({ connectionString: config.DATABASE_URL, max: 1 });
  const token = randomBytes(6).toString('hex');
  const names = Object.fromEntries(['source', 'restore', 'failed', 'retry'].map(role => [role, `zmrecovery_${token}_${role}`]));
  const workspace = await mkdtemp(join(tmpdir(), 'zm-os-recovery-'));
  const relativeWorkspace = relative(resolve(tmpdir()), resolve(workspace));
  assert.match(relativeWorkspace, /^zm-os-recovery-[A-Za-z0-9]+$/, '소유 임시 폴더 확인 실패');
  const cleanupWorkspace = childPath(resolve(tmpdir()), relativeWorkspace);
  const sourceFiles = join(workspace, 'source-files'); await mkdir(sourceFiles);
  const dbUrl = name => { const specific = new URL(config.DATABASE_URL); specific.pathname = `/${ownedDatabase(name)}`; return specific.toString(); };
  const assetSecret = randomBytes(32).toString('hex');
  const cfg = (name, files) => ({ databaseUrl: dbUrl(name), files, port: 14510, assetPort: 14511, assetOrigin: 'http://127.0.0.1:14511', webOrigin: 'http://localhost:4300', testAuth: true, sessionSeconds: 3600, codeSeconds: 60, statusSeconds: 86400, assetSecret });
  const checks = [];
  const createdDatabases = new Set();
  let db, server, report;
  try {
    await admin.query(`CREATE DATABASE ${ownedDatabase(names.source)}`);
    createdDatabases.add(names.source);
    db = new Database(dbUrl(names.source)); await db.migrate(); server = await startServer(cfg(names.source, sourceFiles));
    const owner = new Client(), developer = new Client(); await owner.login('owner'); await developer.login('alice');
    const application = await developer.ok('/developer/applications', 'POST', { displayName: '복구 시험 개발자', email: 'recovery@example.test', description: '격리된 복구 검증 앱' });
    await owner.ok(`/operator/developer-applications/${application.id}/decisions`, 'POST', { decision: 'approved', reason: '로컬 복구 검증' });
    const app = await developer.ok('/developer/apps', 'POST', { name: '격리된 복구 시험 앱' });
    const versions = [];
    for (const version of ['1.0.0', '2.0.0']) {
      const manifest = { schemaVersion: 1, appId: app.id, version, name: '복구 시험', description: '로컬 복구 검증', category: 'tools', entry: 'index.html', permissions: ['local-storage','cloud-storage'], apiOrigins: [], privacyNotice: '시험 기기와 서버에 개인 데이터를 저장합니다.' };
      const zip = await createZip([{ path: 'manifest.json', data: Buffer.from(JSON.stringify(manifest)) }, { path: 'index.html', data: Buffer.from(`<!doctype html><meta charset="utf-8"><title>복구 ${version}</title><p>fixture ${version}</p>`) }, { path: '한글 폴더/시험.JS', data: Buffer.from(`globalThis.recoveryVersion = '${version}';`) }]);
      const submitted = await developer.ok(`/developer/apps/${app.id}/versions`, 'POST', zip); versions.push(submitted.id);
      assert.equal(await workOnce(db, cfg(names.source, sourceFiles)), true);
      await developer.ok(`/developer/versions/${submitted.id}/submit`, 'POST', {});
      await owner.ok(`/operator/versions/${submitted.id}/decisions`, 'POST', { decision: 'approved', reason: '복구 fixture 검수' });
      const current = (await developer.ok('/developer/apps')).find(item => item.id === app.id);
      await developer.ok(`/developer/apps/${app.id}/releases`, 'POST', { versionId: submitted.id, revision: current.revision });
    }
    const consent = await developer.ok(`/apps/${app.id}/consent`);
    await developer.ok(`/me/app-consents/${app.id}`, 'PUT', { fingerprint: consent.fingerprint });
    const pinned = await developer.ok('/app-sessions', 'POST', { appId: app.id }); assert.equal(pinned.versionId, versions[1]);
    const cloudPath='/app-sessions/'+pinned.id+'/cloud';
    const empty=await developer.ok(cloudPath,'POST',{method:'cloud.get',params:{key:'note'}});
    const savedRequest={method:'cloud.put',params:{key:'note',generation:empty.generation,expectedRevision:0,requestId:randomUUID(),schemaVersion:1,value:{text:'복원 후에도 같은 개인 메모'}}};
    const saved=await developer.ok(cloudPath,'POST',savedRequest);
    const workspaceUser=await developer.ok('/me');
    const workspaceRequest={expectedUserId:workspaceUser.id,revision:0,requestId:randomUUID(),workspace:{schemaVersion:1,wallpaper:'night',positions:{store:{column:2,row:1}},windows:[{key:randomUUID(),kind:'system',system:'store',layout:{rect:{x:10,y:20,width:800,height:600},minimized:false,maximized:false,snap:'left'}}]}};
    const savedWorkspace=await developer.ok('/me/workspace','PUT',workspaceRequest);
    await developer.ok(cloudPath,'POST',{method:'cloud.remove',params:{key:'removed',generation:empty.generation,expectedRevision:0,requestId:randomUUID()}});
    await server.stop(); server = undefined; // Quiescence is an explicit fixture property, not a live-backup claim.
    const before = await databaseState(db); await db.close(); db = undefined;
    const snapshot = join(workspace, 'snapshot'); const manifest = await snapshotFixture(names.source, sourceFiles, snapshot);
    checks.push('정지한 독립 DB pg_dump와 uploads·prepared 파일 지문 백업');
    const firstFile = childPath(join(snapshot, 'files'), manifest.files[0].path); const originalFile = await readFile(firstFile);
    await writeFile(firstFile, 'corrupted fixture');
    await assert.rejects(restoreFixture(admin, snapshot, names.failed, workspace, join(workspace, 'bad-files')));
    await writeFile(firstFile, originalFile);
    await rm(firstFile); await assert.rejects(verifySnapshot(snapshot)); await writeFile(firstFile, originalFile);
    assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [names.failed])).rowCount, 0);
    checks.push('번들 손상·누락 사전 거부 및 원본 DB 보존');
    const dumpPath = join(snapshot, 'database.dump'); const dump = await readFile(dumpPath);
    const badDump = dump.subarray(0, Math.min(80, dump.length));
    await writeFile(dumpPath, badDump);
    await writeFile(join(snapshot, 'manifest.json'), JSON.stringify({ ...manifest, database: { path: 'database.dump', bytes: badDump.length, sha256: digest(badDump) } }));
    await assert.rejects(restoreFixture(admin, snapshot, names.failed, workspace, join(workspace, 'failed-files')));
    assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [names.failed])).rowCount, 0);
    await assert.rejects(lstat(join(workspace, 'failed-files')), { code: 'ENOENT' });
    await writeFile(dumpPath, dump); await writeFile(join(snapshot, 'manifest.json'), JSON.stringify(manifest, null, 2));
    checks.push('DB 복원 중 실제 pg_restore 실패 후 불완전 시험 DB·파일 정리');
    const restoredFiles = join(workspace, 'restored-files');
    await restoreFixture(admin, snapshot, names.restore, workspace, restoredFiles);
    createdDatabases.add(names.restore);
    await assert.rejects(restoreFixture(admin, snapshot, names.restore, workspace, restoredFiles));
    db = new Database(dbUrl(names.restore)); assert.deepEqual(await databaseState(db), before);
    checks.push('별도 DB·파일 복원 후 모든 테이블 행 수·버전 지문·공개 포인터 일치 및 덮어쓰기 거부');
    server = await startServer(cfg(names.restore, restoredFiles));
    assert.equal((await developer.ok(`/app-sessions/${pinned.id}`)).versionId, versions[1]);
    const restoredNote=await developer.ok(cloudPath,'POST',{method:'cloud.get',params:{key:'note'}});
    assert.deepEqual(restoredNote,{...saved,value:{text:'복원 후에도 같은 개인 메모'}});
    assert.deepEqual(await developer.ok(cloudPath,'POST',savedRequest),saved);
    assert.deepEqual(await developer.ok('/me/workspace?expectedUserId='+workspaceUser.id),savedWorkspace);
    assert.deepEqual(await developer.ok('/me/workspace','PUT',workspaceRequest),savedWorkspace);
    const tombstone=await developer.ok(cloudPath,'POST',{method:'cloud.get',params:{key:'removed'}});
    assert.equal(tombstone.exists,false);assert.equal(tombstone.revision,1);assert.equal(tombstone.value,null);
    checks.push('개인 메모 본문·수정 번호·저장 세대·삭제 표식·동일 요청 재시도 결과 복원');
    assert.match(await (await fetch(pinned.documentUrl)).text(), /fixture 2\.0\.0/);
    const originalZip = await readFile(join(restoredFiles, 'uploads', `${versions[1]}.zip`));
    assert.equal(digest(originalZip), before.versions.find(item => item.id === versions[1]).hash);
    checks.push('복원 DB로 실제 HTTP 세션·준비 자산·원본 ZIP 지문 확인');
    const current = (await developer.ok('/developer/apps')).find(item => item.id === app.id);
    const releasePath = `/developer/apps/${app.id}/releases`, payload = { versionId: versions[0], revision: current.revision }, headers = { 'idempotency-key': `recovery-${token}` };
    assert.equal((await developer.call(releasePath, 'POST', payload, headers, true)).status, 200);
    await developer.ok(releasePath, 'POST', payload, headers);
    assert.equal((await developer.call(releasePath, 'POST', { versionId: versions[1], revision: current.revision }, headers)).status, 409);
    assert.equal((await developer.call(releasePath, 'POST', payload)).status, 409);
    const afterRelease = (await developer.ok('/developer/apps')).find(item => item.id === app.id);
    assert.equal(afterRelease.revision, current.revision + 1); assert.equal(afterRelease.currentVersionId, versions[0]);
    assert.equal((await db.pool.query("SELECT count(*)::int AS count FROM audit_events WHERE action='app.released' AND target_id=$1 AND detail->>'versionId'=$2", [app.id, versions[0]])).rows[0].count, 2);
    const fresh = await developer.ok('/app-sessions', 'POST', { appId: app.id }); assert.equal(fresh.versionId, versions[0]);
    assert.equal((await developer.ok(`/app-sessions/${pinned.id}`)).versionId, versions[1]);
    assert.match(await (await fetch(fresh.documentUrl)).text(), /fixture 1\.0\.0/);
    assert.match(await (await fetch(pinned.documentUrl)).text(), /fixture 2\.0\.0/);
    checks.push('승인된 이전 앱 판 공개: 새 실행 1.0.0·기존 실행 2.0.0 유지');
    checks.push('공개 응답 본문 미사용 뒤 같은 키 재시도 1회 반영·키 재사용 충돌·오래된 revision 거부');
    await server.stop(); server = undefined; await db.close(); db = undefined;
    const retryFiles = join(workspace, 'retry-files'); await restoreFixture(admin, snapshot, names.retry, workspace, retryFiles); createdDatabases.add(names.retry);
    db = new Database(dbUrl(names.retry)); assert.deepEqual(await databaseState(db), before); await db.close(); db = undefined;
    db = new Database(dbUrl(names.source)); assert.deepEqual(await databaseState(db), before);
    checks.push('실패 뒤 새 대상 재복원 성공 및 최초 원본 DB·파일 불변');
    assert.deepEqual(await inventory(sourceFiles), manifest.files);
    report = { ok: true, checkedAt: new Date().toISOString(), runtime: { node: process.version, platform: process.platform }, checks, tables: Object.keys(before.counts).length, files: manifest.files.length, versions: versions.length, limitations: ['정지한 무작위 시험 fixture만 검증', '공개 응답 본문을 버린 시험이며 실제 TCP 응답 유실은 아님', 'DB schema downgrade·운영 백업/키 복구·외부 DB·브라우저 IDB·실제 OAuth·Android 미검증'] };
  } finally {
    if (server) await server.stop();
    if (db) await db.close();
    for (const name of createdDatabases) await dropOwnedDatabase(admin, name);
    await admin.end();
    await rm(cleanupWorkspace, { recursive: true, force: true });
  }
  await writeFile(reportPath, JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.info(JSON.stringify(await runRecovery(), null, 2)); }
  catch (error) { console.error(JSON.stringify({ ok: false, message: error instanceof assert.AssertionError ? '복구 검증의 기대 결과와 실제 결과가 다릅니다.' : error instanceof Error ? error.message : '복구 검증 실패' })); process.exitCode = 1; }
}
