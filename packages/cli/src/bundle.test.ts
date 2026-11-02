import { describe, expect, it } from 'vitest';
import { createZip, validateZip, validatePath, type BundleFile } from './bundle';
import { TEST_LIMITS } from '@zm/platform-contracts';

const appId = '00000000-0000-4000-8000-000000000001';
const manifest = { schemaVersion: 1, appId, version: '1.0.0', name: 'notes', description: 'notes', category: 'tools', entry: 'index.html', permissions: ['local-storage'], apiOrigins: [], privacyNotice: 'local' };
const base = (): BundleFile[] => [{ path: 'manifest.json', data: Buffer.from(JSON.stringify(manifest)) }, { path: 'index.html', data: Buffer.from('<!doctype html><title>Notes</title>') }];
describe('immutable app bundle validation', () => {
  it('extracts a valid bundle and verifies its registered app identity', async () => {
    const zip = await createZip(base());
    const result = await validateZip(zip, { expectedAppId: appId });
    expect(result.files).toHaveLength(2); expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    await expect(validateZip(zip, { expectedAppId: '00000000-0000-4000-8000-000000000002' })).rejects.toThrow('앱 ID');
  });
  it.each(['../file.js', '/file.js', 'a\\file.js', 'file.js:stream', '.env', 'nested/.git/config.json', 'con.js', 'x%2fy.js', 'key.pem'])('rejects unsafe or secret file paths: %s', name => { expect(() => validatePath(name)).toThrow(); });
  it('rejects duplicate case-insensitive names', async () => {
    const zip = await createZip([...base(), { path: 'INDEX.html', data: Buffer.from('other') }]);
    await expect(validateZip(zip)).rejects.toThrow('중복');
  });
  it.each(['app.JS', 'page.HTML', 'meta.JSON'])('applies secret checks to uppercase extensions: %s', async name => {
    const fixture = 'ghp_' + 'x'.repeat(30);
    const zip = await createZip([...base(), { path: name, data: Buffer.from(fixture) }]);
    await expect(validateZip(zip)).rejects.toThrow('비밀정보');
  });
  it('rejects high expansion even if the compressed input is small', async () => {
    const zip = await createZip([...base(), { path: 'bomb.js', data: Buffer.alloc(TEST_LIMITS.expandedBytes + 1) }]);
    expect(zip.length).toBeLessThan(TEST_LIMITS.zipBytes);
    await expect(validateZip(zip)).rejects.toThrow('압축 해제');
  });
  it('permits HTTP only for explicit loopback tests', async () => {
    const files = base(); files[0] = { path: 'manifest.json', data: Buffer.from(JSON.stringify({ ...manifest, permissions: ['external-api'], apiOrigins: ['http://127.0.0.1:4320'] })) };
    const zip = await createZip(files);
    await expect(validateZip(zip)).rejects.toThrow('HTTPS');
    await expect(validateZip(zip, { allowLocalHttp: true })).resolves.toMatchObject({ manifest: { appId } });
  });
});
