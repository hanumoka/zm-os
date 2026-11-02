/** 대상: 로컬 복구 도구 유지보수자. 검토일: 2026-11-02.
 * node --test scripts/platform-recovery.test.mjs
 * 실제 PostgreSQL·HTTP까지: ZM_RECOVERY_INTEGRATION=1 환경 변수로 같은 명령 실행.
 * 기본 시험은 임시 fixture 파일만, 통합 시험도 별도 무작위 DB만 사용한다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { childPath, ownedDatabase, runRecovery, verifySnapshot } from './platform-recovery.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');

test('복구 대상은 도구 전용 DB 이름과 하위 파일 경로로 제한', () => {
  assert.equal(ownedDatabase('zmrecovery_0123456789ab_restore'), 'zmrecovery_0123456789ab_restore');
  for (const name of ['zmtrial', 'postgres', 'zmtest_123', 'zmrecovery_0123456789ab_restore;DROP']) assert.throws(() => ownedDatabase(name));
  const base = resolve(tmpdir(), 'zm-os-recovery-path-test');
  assert.equal(childPath(base, 'prepared/한글 폴더/시험.JS'), join(base, 'prepared', '한글 폴더', '시험.JS'));
  for (const name of ['../outside', '/absolute', 'a/../../outside', 'a\\outside', 'C:/outside', '', './inside', 'a//b']) assert.throws(() => childPath(base, name));
});

test('DB·파일 지문, 누락·추가 파일, 매니페스트 경로 변경 검증', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zm-os-recovery-unit-'));
  try {
    const dump = Buffer.from('unit-test archive'), content = Buffer.from('fixture');
    await mkdir(join(directory, 'files'));
    await writeFile(join(directory, 'database.dump'), dump);
    await writeFile(join(directory, 'files', 'index.html'), content);
    const manifest = { format: 1, kind: 'zm-os-local-recovery-fixture', source: 'zmrecovery_0123456789ab_source', database: { path: 'database.dump', bytes: dump.length, sha256: digest(dump) }, files: [{ path: 'index.html', bytes: content.length, sha256: digest(content) }] };
    await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
    assert.deepEqual(await verifySnapshot(directory), manifest);
    await writeFile(join(directory, 'files', 'index.html'), 'changed'); await assert.rejects(verifySnapshot(directory));
    await writeFile(join(directory, 'files', 'index.html'), content);
    await writeFile(join(directory, 'files', 'unexpected.html'), 'extra'); await assert.rejects(verifySnapshot(directory));
    await rm(join(directory, 'files', 'unexpected.html'));
    await writeFile(join(directory, 'database.dump'), 'corrupt'); await assert.rejects(verifySnapshot(directory));
    await writeFile(join(directory, 'database.dump'), dump);
    await writeFile(join(directory, 'manifest.json'), JSON.stringify({ ...manifest, files: [{ ...manifest.files[0], path: '../outside' }] }));
    await assert.rejects(verifySnapshot(directory));
    await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
    await rm(join(directory, 'files', 'index.html')); await assert.rejects(verifySnapshot(directory));
  } finally {
    assert.match(relative(resolve(tmpdir()), resolve(directory)), /^zm-os-recovery-unit-[A-Za-z0-9]+$/);
    await rm(resolve(directory), { recursive: true, force: true });
  }
});

test('독립 PostgreSQL pg_dump/pg_restore와 HTTP 이전판 공개·실패·재시도', { skip: process.env.ZM_RECOVERY_INTEGRATION !== '1', timeout: 180000 }, async () => {
  const result = await runRecovery();
  assert.equal(result.ok, true); assert.equal(result.checks.length, 8);
  assert.equal(result.versions, 2); assert.ok(result.tables >= 20); assert.equal(result.files, 8);
});
