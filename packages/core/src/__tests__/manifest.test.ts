import { describe, it, expect } from 'vitest';
import { parseManifest, safeParseManifest } from '../manifest';

const V1_MINIMAL = {
  schemaVersion: 1,
  id: 'my-app',
  name: 'My App',
  version: '1.0.0',
};

const V1_FULL = {
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

const V2_MINIMAL = {
  schemaVersion: 2,
  id: 'my-app',
  name: 'My App',
  version: '1.0.0',
};

const V2_FULL = {
  schemaVersion: 2,
  id: 'com.example.game',
  name: 'Cool Game',
  version: '2.1.3',
  author: 'Dev',
  description: 'A cool game',
  entryPoint: 'main.html',
  icon: 'icon.png',
  size: { defaultWidth: 640, defaultHeight: 480 },
  capabilities: ['gamepad', 'audio', 'webgl'],
  sandbox: { storage: 'isolated' as const, network: 'host-proxy' as const, clipboard: true },
};

describe('parseManifest — V2 (현행)', () => {
  it('parses minimal V2 manifest with defaults', () => {
    const result = parseManifest(V2_MINIMAL);
    expect(result.schemaVersion).toBe(2);
    expect(result.id).toBe('my-app');
    expect(result.entryPoint).toBe('index.html');
    expect(result.size.defaultWidth).toBe(800);
    expect(result.capabilities).toEqual([]);
    expect(result.sandbox.network).toBe('none');
  });

  it('parses full V2 manifest with capabilities', () => {
    const result = parseManifest(V2_FULL);
    expect(result.schemaVersion).toBe(2);
    expect(result.author).toBe('Dev');
    expect(result.size.defaultWidth).toBe(640);
    expect(result.capabilities).toEqual(['gamepad', 'audio', 'webgl']);
    expect(result.sandbox.clipboard).toBe(true);
  });

  it('accepts arbitrary capability strings', () => {
    const result = parseManifest({ ...V2_MINIMAL, capabilities: ['webgpu', 'fullscreen', 'x-custom'] });
    expect(result.capabilities).toEqual(['webgpu', 'fullscreen', 'x-custom']);
  });
});

describe('parseManifest — V1 하위호환 (마이그레이션)', () => {
  it('migrates minimal V1 → V2 with empty capabilities', () => {
    const result = parseManifest(V1_MINIMAL);
    expect(result.schemaVersion).toBe(2);
    expect(result.id).toBe('my-app');
    expect(result.capabilities).toEqual([]);
    expect(result.entryPoint).toBe('index.html');
    expect((result as Record<string, unknown>)['permissions']).toBeUndefined();
  });

  it('migrates V1 permissions to V2 capabilities', () => {
    const result = parseManifest(V1_FULL);
    expect(result.schemaVersion).toBe(2);
    expect(result.capabilities).toEqual(['gamepad', 'audio']);
    expect((result as Record<string, unknown>)['permissions']).toBeUndefined();
    expect(result.author).toBe('Dev');
    expect(result.sandbox.clipboard).toBe(true);
  });
});

describe('parseManifest — 에러', () => {
  it('throws on missing required field (id)', () => {
    expect(() => parseManifest({ schemaVersion: 2, name: 'X', version: '1.0.0' })).toThrow();
  });

  it('throws on invalid id format (uppercase)', () => {
    expect(() => parseManifest({ ...V2_MINIMAL, id: 'MyApp' })).toThrow();
  });

  it('throws on invalid version format', () => {
    expect(() => parseManifest({ ...V2_MINIMAL, version: '1.0' })).toThrow();
    expect(() => parseManifest({ ...V2_MINIMAL, version: 'v1.0.0' })).toThrow();
  });

  it('throws on unsupported schemaVersion', () => {
    expect(() => parseManifest({ ...V2_MINIMAL, schemaVersion: 3 })).toThrow();
    expect(() => parseManifest({ ...V2_MINIMAL, schemaVersion: 0 })).toThrow();
  });
});

describe('safeParseManifest', () => {
  it('returns success for V2 input', () => {
    const result = safeParseManifest(V2_MINIMAL);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.schemaVersion).toBe(2);
      expect(result.data.capabilities).toEqual([]);
    }
  });

  it('returns success for V1 input (migrated)', () => {
    const result = safeParseManifest(V1_FULL);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.schemaVersion).toBe(2);
      expect(result.data.capabilities).toEqual(['gamepad', 'audio']);
    }
  });

  it('returns failure for invalid input', () => {
    const result = safeParseManifest({ schemaVersion: 2 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
  });
});
