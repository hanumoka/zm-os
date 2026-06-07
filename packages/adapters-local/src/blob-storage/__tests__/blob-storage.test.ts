import { describe, it, expect, beforeEach } from 'vitest';
import { PortError } from '@zm/core';
import type { BlobStorage } from '@zm/core';
import {
  createLocalBlobStorage,
  createMemoryBlobStorage,
  createIDBBlobStorage,
  BlobStorageError,
} from '../index';
import { createTestBlobStorage } from '../testing';

// ─── Memory 어댑터 동작 (기존 memory-adapter.test.ts 이전 + descriptor) ──────
describe('createMemoryBlobStorage', () => {
  let adapter: BlobStorage;

  beforeEach(() => {
    adapter = createMemoryBlobStorage();
  });

  it('descriptor.adapterName is "local-memory"', () => {
    expect(adapter.descriptor.adapterName).toBe('local-memory');
    expect(adapter.descriptor.portName).toBe('blob-storage');
  });

  it('put + get returns stored value', async () => {
    await adapter.put('ns', 'key1', { data: 42 });
    expect(await adapter.get<{ data: number }>('ns', 'key1')).toEqual({ data: 42 });
  });

  it('get non-existent key returns undefined', async () => {
    expect(await adapter.get('ns', 'missing')).toBeUndefined();
  });

  it('delete removes entry', async () => {
    await adapter.put('ns', 'key1', 'value');
    await adapter.delete('ns', 'key1');
    expect(await adapter.get('ns', 'key1')).toBeUndefined();
  });

  it('list returns all entries in namespace', async () => {
    await adapter.put('ns', 'a', 1);
    await adapter.put('ns', 'b', 2);
    await adapter.put('ns', 'c', 3);
    const items = await adapter.list<number>('ns');
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.key).sort()).toEqual(['a', 'b', 'c']);
    expect(items.map((i) => i.value).sort()).toEqual([1, 2, 3]);
  });

  it('clear removes all entries in namespace', async () => {
    await adapter.put('ns', 'a', 1);
    await adapter.put('ns', 'b', 2);
    await adapter.clear('ns');
    expect(await adapter.list('ns')).toHaveLength(0);
  });

  it('namespaces are isolated', async () => {
    await adapter.put('ns1', 'key', 'from-ns1');
    await adapter.put('ns2', 'key', 'from-ns2');
    expect(await adapter.get('ns1', 'key')).toBe('from-ns1');
    expect(await adapter.get('ns2', 'key')).toBe('from-ns2');
    await adapter.clear('ns1');
    expect(await adapter.get('ns1', 'key')).toBeUndefined();
    expect(await adapter.get('ns2', 'key')).toBe('from-ns2');
  });

  it('put overwrites existing value', async () => {
    await adapter.put('ns', 'key', 'old');
    await adapter.put('ns', 'key', 'new');
    expect(await adapter.get('ns', 'key')).toBe('new');
  });

  it('delete is idempotent (no error on missing key)', async () => {
    await expect(adapter.delete('ns', 'missing')).resolves.toBeUndefined();
  });
});

// ─── AbortSignal (ADR-0020 §D2) ──────────────────────────────────────────────
describe('BlobStorage AbortSignal', () => {
  it('memory get rejects when signal already aborted', async () => {
    const a = createMemoryBlobStorage();
    const ac = new AbortController();
    ac.abort();
    await expect(a.get('ns', 'k', { signal: ac.signal })).rejects.toThrow();
  });

  it('memory list rejects when signal already aborted', async () => {
    const a = createMemoryBlobStorage();
    const ac = new AbortController();
    ac.abort();
    await expect(a.list('ns', { signal: ac.signal })).rejects.toThrow();
  });

  it('memory put rejects when signal already aborted', async () => {
    const a = createMemoryBlobStorage();
    const ac = new AbortController();
    ac.abort();
    await expect(a.put('ns', 'k', 1, { signal: ac.signal })).rejects.toThrow();
  });

  it('idb (memory-fallback in node) get rejects when signal already aborted', async () => {
    const a = createIDBBlobStorage();
    const ac = new AbortController();
    ac.abort();
    await expect(a.get('installed-apps', 'k', { signal: ac.signal })).rejects.toThrow();
  });

  it('not aborted → resolves normally', async () => {
    const a = createMemoryBlobStorage();
    const ac = new AbortController();
    await a.put('ns', 'k', 7, { signal: ac.signal });
    expect(await a.get<number>('ns', 'k', { signal: ac.signal })).toBe(7);
  });
});

// ─── BlobStorageError / 팩토리 / testing alias (ADR-0020 §D4) ─────────────────
describe('BlobStorageError + factories', () => {
  it('BlobStorageError extends PortError (instanceof 양쪽 true)', () => {
    const e = new BlobStorageError('x', 'GET_FAILED');
    expect(e).toBeInstanceOf(PortError);
    expect(e).toBeInstanceOf(Error);
    expect(e.port).toBe('blob-storage');
    expect(e.code).toBe('GET_FAILED');
    expect(e.name).toBe('BlobStorageError');
  });

  it('createLocalBlobStorage({ policy: "memory" }) → local-memory', () => {
    expect(createLocalBlobStorage({ policy: 'memory' }).descriptor.adapterName).toBe('local-memory');
  });

  it('createIDBBlobStorage() descriptor는 local-idb', () => {
    expect(createIDBBlobStorage().descriptor.adapterName).toBe('local-idb');
  });

  it('createLocalBlobStorage({ policy: "idb-only" }) → node 환경(IDB 없음)에선 memory 폴백', () => {
    // node에는 globalThis.indexedDB 없음 → idb-only 정책은 memory로 폴백 (의도된 동작).
    expect(createLocalBlobStorage({ policy: 'idb-only' }).descriptor.adapterName).toBe('local-memory');
  });

  it('createTestBlobStorage() → local-memory', () => {
    expect(createTestBlobStorage().descriptor.adapterName).toBe('local-memory');
  });
});
