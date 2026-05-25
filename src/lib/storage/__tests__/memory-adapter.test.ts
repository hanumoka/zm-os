import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../memory-adapter';
import type { StorageAdapter } from '../storage-adapter';

describe('createMemoryAdapter', () => {
  let adapter: StorageAdapter;

  beforeEach(() => {
    adapter = createMemoryAdapter();
  });

  it('name is "memory"', () => {
    expect(adapter.name).toBe('memory');
  });

  it('put + get returns stored value', async () => {
    await adapter.put('ns', 'key1', { data: 42 });
    const result = await adapter.get<{ data: number }>('ns', 'key1');
    expect(result).toEqual({ data: 42 });
  });

  it('get non-existent key returns undefined', async () => {
    const result = await adapter.get('ns', 'missing');
    expect(result).toBeUndefined();
  });

  it('delete removes entry', async () => {
    await adapter.put('ns', 'key1', 'value');
    await adapter.delete('ns', 'key1');
    const result = await adapter.get('ns', 'key1');
    expect(result).toBeUndefined();
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
    const items = await adapter.list('ns');
    expect(items).toHaveLength(0);
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
