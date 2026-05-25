import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { loadUserAppFromZip } from '../zip-loader';

const VALID_MANIFEST = JSON.stringify({
  schemaVersion: 1,
  id: 'test-app',
  name: 'Test App',
  version: '1.0.0',
});

const VALID_HTML = '<html><body>Hello</body></html>';

async function makeZipFile(
  files: Record<string, string>,
  name = 'test.zip',
): Promise<File> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }
  const buf = await zip.generateAsync({ type: 'arraybuffer' });
  return new File([buf], name, { type: 'application/zip' });
}

function makeValidZip(): Promise<File> {
  return makeZipFile({
    'manifest.json': VALID_MANIFEST,
    'index.html': VALID_HTML,
  });
}

const EMPTY_RESERVED = new Set<string>();
const BUILTIN_RESERVED = new Set<string>(['builtin-app']);

describe('loadUserAppFromZip', () => {
  it('valid ZIP returns ok: true with ParsedUserApp', async () => {
    const file = await makeValidZip();
    const result = await loadUserAppFromZip(file, EMPTY_RESERVED);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.app.manifest.id).toBe('test-app');
      expect(result.app.manifest.version).toBe('1.0.0');
      expect(result.app.htmlContent).toContain('Hello');
      expect(result.updateTarget).toBeNull();
    }
  });

  it('non-ZIP file returns NOT_ZIP_MAGIC', async () => {
    const file = new File(['not a zip'], 'test.zip', { type: 'application/zip' });
    const result = await loadUserAppFromZip(file, EMPTY_RESERVED);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NOT_ZIP_MAGIC');
    }
  });

  it('missing manifest.json returns NO_MANIFEST', async () => {
    const file = await makeZipFile({ 'index.html': VALID_HTML });
    const result = await loadUserAppFromZip(file, EMPTY_RESERVED);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NO_MANIFEST');
    }
  });

  it('missing index.html returns NO_HTML', async () => {
    const file = await makeZipFile({ 'manifest.json': VALID_MANIFEST });
    const result = await loadUserAppFromZip(file, EMPTY_RESERVED);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NO_HTML');
    }
  });

  it('invalid manifest returns MANIFEST_INVALID', async () => {
    const file = await makeZipFile({
      'manifest.json': JSON.stringify({ schemaVersion: 1, id: 'x' }),
      'index.html': VALID_HTML,
    });
    const result = await loadUserAppFromZip(file, EMPTY_RESERVED);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('MANIFEST_INVALID');
    }
  });

  it('path traversal in entry returns PATH_TRAVERSAL', async () => {
    const file = await makeZipFile({
      'manifest.json': VALID_MANIFEST,
      'index.html': VALID_HTML,
      '../evil.txt': 'pwned',
    });
    const result = await loadUserAppFromZip(file, EMPTY_RESERVED);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('PATH_TRAVERSAL');
    }
  });

  it('duplicate reserved id returns DUPLICATE_ID', async () => {
    const manifest = JSON.stringify({
      schemaVersion: 1,
      id: 'builtin-app',
      name: 'Clone',
      version: '1.0.0',
    });
    const file = await makeZipFile({
      'manifest.json': manifest,
      'index.html': VALID_HTML,
    });
    const result = await loadUserAppFromZip(file, BUILTIN_RESERVED);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('DUPLICATE_ID');
    }
  });

  it('existing user app returns updateTarget with comparison', async () => {
    const file = await makeValidZip();
    const existingUserApps = new Map([['test-app', '0.9.0']]);
    const result = await loadUserAppFromZip(file, EMPTY_RESERVED, existingUserApps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.updateTarget).not.toBeNull();
      expect(result.updateTarget!.existingVersion).toBe('0.9.0');
      expect(result.updateTarget!.newVersion).toBe('1.0.0');
      expect(result.updateTarget!.comparison).toBe(1); // upgrade
    }
  });

  it('same version user app returns comparison 0', async () => {
    const file = await makeValidZip();
    const existingUserApps = new Map([['test-app', '1.0.0']]);
    const result = await loadUserAppFromZip(file, EMPTY_RESERVED, existingUserApps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.updateTarget!.comparison).toBe(0);
    }
  });

  it('downgrade returns comparison -1', async () => {
    const file = await makeValidZip();
    const existingUserApps = new Map([['test-app', '2.0.0']]);
    const result = await loadUserAppFromZip(file, EMPTY_RESERVED, existingUserApps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.updateTarget!.comparison).toBe(-1);
    }
  });

  it('new app with existingUserApps returns updateTarget null', async () => {
    const file = await makeValidZip();
    const existingUserApps = new Map([['other-app', '1.0.0']]);
    const result = await loadUserAppFromZip(file, EMPTY_RESERVED, existingUserApps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.updateTarget).toBeNull();
    }
  });
});
