import { describe, expect, it } from 'vitest';
import {
  NAMESPACE_REGISTRY,
  NS_DESKTOP_LAYOUT,
  NS_DESKTOP_SETTINGS,
  NS_INSTALLED_APPS,
  NS_SYSTEM,
  NS_USER_APPS,
  getBlobStorageAdapter,
  getNamespaceEntry,
  isRegisteredNamespace,
} from '../namespace-registry';

describe('NAMESPACE_REGISTRY 불변식', () => {
  it('name이 중복되지 않는다', () => {
    const names = NAMESPACE_REGISTRY.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('sinceVersion은 1부터 빈틈 없이 이어진다', () => {
    // DB_VERSION을 max(sinceVersion)으로 파생할 수 있으려면 빈틈이 없어야 한다.
    const versions = NAMESPACE_REGISTRY.map((e) => e.sinceVersion).sort((a, b) => a - b);
    expect(versions[0]).toBe(1);
    for (let i = 1; i < versions.length; i += 1) {
      const prev = versions[i - 1] ?? 0;
      const cur = versions[i] ?? 0;
      expect(cur - prev).toBeLessThanOrEqual(1);
    }
  });

  it('모든 항목이 blob-storage 정책을 갖는다', () => {
    for (const entry of NAMESPACE_REGISTRY) {
      expect(getBlobStorageAdapter(entry.name)).toBeDefined();
    }
  });

  it('NS_* 상수가 전부 레지스트리에 등록돼 있다', () => {
    for (const ns of [
      NS_INSTALLED_APPS,
      NS_USER_APPS,
      NS_DESKTOP_LAYOUT,
      NS_DESKTOP_SETTINGS,
      NS_SYSTEM,
    ]) {
      expect(isRegisteredNamespace(ns)).toBe(true);
    }
  });
});

describe('조회 함수', () => {
  it('등록되지 않은 이름은 undefined', () => {
    expect(getNamespaceEntry('nope')).toBeUndefined();
    expect(isRegisteredNamespace('nope')).toBe(false);
    expect(getBlobStorageAdapter('nope')).toBeUndefined();
  });

  it('등록된 이름은 항목을 돌려준다', () => {
    const entry = getNamespaceEntry(NS_SYSTEM);
    expect(entry?.name).toBe('system');
    expect(entry?.sinceVersion).toBe(5);
  });
});
