/**
 * Namespace Registry — 스토리지 namespace SSOT (REFAC-01 C-3, REFAC-02 P1 reshape)
 *
 * ADR-0023 §D5: adapterPolicy 단일 필드 → adapterPolicies 배열 형식으로 확장.
 * Port + namespace 2차원 정책 관리.
 *
 * 기존 호출자 호환:
 * - `getNamespaceEntry(name).adapterPolicy` 직접 참조 호출자를 위해
 *   `getBlobStorageAdapter(namespace)` alias 함수 제공.
 *   (`packages/storage/src/resolve-adapter.ts`의 `entry.adapterPolicy` 참조)
 *
 * 새 namespace 추가 시:
 * 1. NAMESPACE_REGISTRY에 1항목 추가
 * 2. indexeddb.ts upgrade 함수에 1 if블록 추가
 * 3. DB_VERSION + STORE_* 상수 추가
 */

// ─── AdapterPolicy 타입 (ADR-0023 §D5) ───────────────────────────────────────

export type AdapterPolicy =
  | { readonly port: 'blob-storage'; readonly adapter: 'local-idb' | 'local-opfs' | 'local-memory' }
  | { readonly port: 'app-repository'; readonly adapter: 'local-idb' | 'cloud-supabase' }
  | { readonly port: 'sync'; readonly adapter: 'local-noop' | 'cloud-supabase' };

// ─── 하위호환 타입 (deprecation period: v2.0 ~ v2.1) ─────────────────────────

/** @deprecated Use AdapterPolicy from ports instead. Will be removed in v2.1. */
export type AdapterOverridePolicy = 'idb-only' | 'default';

// ─── NamespaceEntry 타입 ──────────────────────────────────────────────────────

type NamespaceEntry = {
  readonly name: string;
  readonly sinceVersion: number;
  readonly adapterPolicies: ReadonlyArray<AdapterPolicy>;
};

// ─── NAMESPACE_REGISTRY (ADR-0023 §D5 + ADR-0018 §D1) ───────────────────────

export const NAMESPACE_REGISTRY = [
  {
    name: 'installed-apps',
    sinceVersion: 1,
    adapterPolicies: [
      { port: 'blob-storage', adapter: 'local-idb' },
      { port: 'app-repository', adapter: 'local-idb' },
      { port: 'sync', adapter: 'local-noop' },
    ],
  },
  {
    name: 'user-apps',
    sinceVersion: 2,
    adapterPolicies: [
      { port: 'blob-storage', adapter: 'local-idb' },
      { port: 'app-repository', adapter: 'local-idb' },
      { port: 'sync', adapter: 'local-noop' },
    ],
  },
  {
    name: 'desktop-layout',
    sinceVersion: 3,
    adapterPolicies: [
      { port: 'blob-storage', adapter: 'local-idb' },
      { port: 'sync', adapter: 'local-noop' },
    ],
  },
  {
    name: 'desktop-settings',
    sinceVersion: 4,
    adapterPolicies: [
      { port: 'blob-storage', adapter: 'local-idb' },
      { port: 'sync', adapter: 'local-noop' },
    ],
  },
  {
    name: 'system',
    sinceVersion: 5,
    adapterPolicies: [
      { port: 'blob-storage', adapter: 'local-idb' },
    ],
  },
] as const satisfies ReadonlyArray<NamespaceEntry>;

// ─── 파생 타입 ────────────────────────────────────────────────────────────────

export type NamespaceId = (typeof NAMESPACE_REGISTRY)[number]['name'];

// ─── 상수 ────────────────────────────────────────────────────────────────────

export const NS_INSTALLED_APPS = 'installed-apps' as const;
export const NS_USER_APPS = 'user-apps' as const;
export const NS_DESKTOP_LAYOUT = 'desktop-layout' as const;
export const NS_DESKTOP_SETTINGS = 'desktop-settings' as const;
export const NS_SYSTEM = 'system' as const;

// ─── 조회 함수 ────────────────────────────────────────────────────────────────

export function getNamespaceEntry(name: string): (typeof NAMESPACE_REGISTRY)[number] | undefined {
  return NAMESPACE_REGISTRY.find((e) => e.name === name);
}

export function isRegisteredNamespace(name: string): name is NamespaceId {
  return NAMESPACE_REGISTRY.some((e) => e.name === name);
}

// ─── 호환 alias 함수 (ADR-0023 §D5 R3 대응) ─────────────────────────────────
//
// 기존 resolve-adapter.ts가 `entry.adapterPolicy`를 직접 참조하는 패턴을
// `getBlobStorageAdapter(namespace)` 함수로 대체한다.
// P2(blob-storage 어댑터 구현) 이후 resolve-adapter.ts가 삭제되면 이 함수도 삭제 대상.
//
/** @deprecated Use adapterPolicies array directly. Will be removed in v2.1. */
export function getBlobStorageAdapter(
  namespace: string,
): 'local-idb' | 'local-opfs' | 'local-memory' | undefined {
  const entry = getNamespaceEntry(namespace);
  if (entry === undefined) return undefined;
  // `as const satisfies`로 인해 entry.adapterPolicies 요소들이 좁은 리터럴 타입으로 추론되므로
  // type predicate 대신 단순 find + cast 사용 (AdapterPolicy 유니언과의 호환 보장)
  const policies = entry.adapterPolicies as ReadonlyArray<AdapterPolicy>;
  const policy = policies.find((p) => p.port === 'blob-storage');
  if (policy === undefined || policy.port !== 'blob-storage') return undefined;
  return policy.adapter;
}

/** @deprecated Use getBlobStorageAdapter instead. Will be removed in v2.1. */
export function getLegacyAdapterPolicy(namespace: string): AdapterOverridePolicy {
  const adapter = getBlobStorageAdapter(namespace);
  if (adapter === 'local-opfs') return 'default';
  if (adapter === 'local-memory') return 'default';
  // local-idb 또는 미등록 namespace
  return adapter === 'local-idb' ? 'idb-only' : 'default';
}
