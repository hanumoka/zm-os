/**
 * Namespace Registry — 스토리지 namespace SSOT (REFAC-01 C-3, REFAC-02 P1 reshape)
 *
 * ADR-0023 §D5: adapterPolicy 단일 필드 → adapterPolicies 배열 형식으로 확장.
 * Port + namespace 2차원 정책 관리.
 *
 *
 * 새 namespace 추가 시:
 * 1. NAMESPACE_REGISTRY에 1항목 추가 (`sinceVersion` = 직전 최대값 + 1)
 * 2. NS_* 상수 1줄 추가
 *
 * 그 외에는 손댈 곳이 없다. `DB_VERSION`, IDB 스키마 타입, upgrade 시 objectStore 생성은
 * 전부 이 레지스트리에서 파생된다(`indexeddb.ts`). 예전에는 세 곳을 손으로 맞춰야 했고,
 * 어긋나면 objectStore가 생성되지 않아 런타임 NotFoundError가 났다.
 */

// ─── AdapterPolicy 타입 (ADR-0023 §D5) ───────────────────────────────────────

export type AdapterPolicy =
  | { readonly port: 'blob-storage'; readonly adapter: 'local-idb' | 'local-opfs' | 'local-memory' }
  | { readonly port: 'app-repository'; readonly adapter: 'local-idb' | 'cloud-supabase' }
  | { readonly port: 'sync'; readonly adapter: 'local-noop' | 'cloud-supabase' };

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

/**
 * IDB 스키마 버전 = 등록된 namespace의 최대 `sinceVersion`.
 *
 * 손으로 관리하면 레지스트리와 어긋날 수 있고, 어긋나는 순간 새 objectStore가
 * 생성되지 않아 첫 접근에서 NotFoundError가 난다. 파생하면 어긋날 수가 없다.
 */
export const DB_SCHEMA_VERSION: number = NAMESPACE_REGISTRY.reduce(
  (max, entry) => (entry.sinceVersion > max ? entry.sinceVersion : max),
  1,
);

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

// ─── 어댑터 정책 조회 ────────────────────────────────────────────────────────
//
// namespace에 지정된 BlobStorage 어댑터를 돌려준다.
// `@zm/adapters-local`의 resolvePolicy가 이 값을 1:1로 정책에 옮긴다.
//
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

