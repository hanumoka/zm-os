import { describe, it, expect } from 'vitest';
import { parseManifest, safeParseManifest } from '../manifest';

const VALID_MINIMAL = {
  schemaVersion: 1,
  id: 'my-app',
  name: 'My App',
  version: '1.0.0',
};

const VALID_FULL = {
  schemaVersion: 1,
  id: 'com.example.game',
  name: 'Cool Game',
  version: '2.1.3',
  author: 'Dev',
  description: 'A cool game',
  entryPoint: 'main.html',
  icon: 'icon.png',
  size: { defaultWidth: 640, defaultHeight: 480 },
  permissions: ['gamepad', 'audio'] as const,
  sandbox: { storage: 'isolated' as const, network: 'host-proxy' as const, clipboard: true },
};

describe('parseManifest', () => {
  it('parses valid minimal manifest with defaults', () => {
    const result = parseManifest(VALID_MINIMAL);
    expect(result.id).toBe('my-app');
    expect(result.entryPoint).toBe('index.html');
    expect(result.size.defaultWidth).toBe(800);
    expect(result.permissions).toEqual([]);
    expect(result.sandbox.network).toBe('none');
  });

  it('parses valid full manifest', () => {
    const result = parseManifest(VALID_FULL);
    expect(result.author).toBe('Dev');
    expect(result.size.defaultWidth).toBe(640);
    expect(result.permissions).toEqual(['gamepad', 'audio']);
    expect(result.sandbox.clipboard).toBe(true);
  });

  it('throws on missing required field (id)', () => {
    expect(() => parseManifest({ schemaVersion: 1, name: 'X', version: '1.0.0' })).toThrow();
  });

  it('throws on invalid id format (uppercase)', () => {
    expect(() => parseManifest({ ...VALID_MINIMAL, id: 'MyApp' })).toThrow();
  });

  it('throws on invalid version format', () => {
    expect(() => parseManifest({ ...VALID_MINIMAL, version: '1.0' })).toThrow();
    expect(() => parseManifest({ ...VALID_MINIMAL, version: 'v1.0.0' })).toThrow();
  });

  it('throws on wrong schemaVersion', () => {
    expect(() => parseManifest({ ...VALID_MINIMAL, schemaVersion: 2 })).toThrow();
  });
});

describe('safeParseManifest', () => {
  it('returns success: true for valid input', () => {
    const result = safeParseManifest(VALID_MINIMAL);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('my-app');
    }
  });

  it('returns success: false for invalid input', () => {
    const result = safeParseManifest({ schemaVersion: 1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
  });
});
