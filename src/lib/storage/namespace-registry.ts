/**
 * Namespace Registry — 스토리지 namespace SSOT (REFAC-01 C-3)
 *
 * 모든 IDB store 이름, 어댑터 오버라이드 정책, PersistenceErrorSource를
 * 이 파일 하나에서 관리한다. 새 namespace 추가 시 NAMESPACE_REGISTRY에
 * 1항목 추가 + indexeddb.ts upgrade 함수에 1 if블록 추가.
 */

export type AdapterOverridePolicy = 'idb-only' | 'default';

type NamespaceEntry = {
  readonly name: string;
  readonly sinceVersion: number;
  readonly adapterPolicy: AdapterOverridePolicy;
};

export const NAMESPACE_REGISTRY = [
  { name: 'installed-apps', sinceVersion: 1, adapterPolicy: 'idb-only' },
  { name: 'user-apps', sinceVersion: 2, adapterPolicy: 'idb-only' },
  { name: 'desktop-layout', sinceVersion: 3, adapterPolicy: 'idb-only' },
  { name: 'desktop-settings', sinceVersion: 4, adapterPolicy: 'idb-only' },
] as const satisfies ReadonlyArray<NamespaceEntry>;

export type NamespaceId = (typeof NAMESPACE_REGISTRY)[number]['name'];

export const NS_INSTALLED_APPS = 'installed-apps' as const;
export const NS_USER_APPS = 'user-apps' as const;
export const NS_DESKTOP_LAYOUT = 'desktop-layout' as const;
export const NS_DESKTOP_SETTINGS = 'desktop-settings' as const;

export function getNamespaceEntry(name: string): (typeof NAMESPACE_REGISTRY)[number] | undefined {
  return NAMESPACE_REGISTRY.find((e) => e.name === name);
}

export function isRegisteredNamespace(name: string): name is NamespaceId {
  return NAMESPACE_REGISTRY.some((e) => e.name === name);
}
