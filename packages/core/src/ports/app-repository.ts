/**
 * AppRepository Port (ADR-0017 §D1.3)
 *
 * 앱 레코드 + 설치 상태 통합 추상화 인터페이스.
 * LocalAppRepository(ADR-0019) / CloudAppRepository(ADR-0025+)가 이 인터페이스를 구현한다.
 */

import type { AppManifest } from '../manifest';
import type { UserId } from './auth';
import type { AdapterDescriptor, PortCallOptions } from './common';

/**
 * 앱 콘텐츠의 위치.
 *
 * `inline-html`은 ADR-0019 D7이 정한 v2.0 모델이다 — 사용자 업로드 앱의 HTML을
 * 같은 레코드에 인라인 보존한다. 이 variant가 없으면 실제로 저장돼 있는 형태를
 * Port 타입으로 표현할 수 없어, 어댑터가 레거시 레코드를 검증 없이 캐스트하게 된다.
 * v2.1에서 BlobStorage로 옮기면 이 variant만 없애면 된다.
 */
export type AppContentRef =
  | { readonly kind: 'built-in-url'; readonly url: string }
  | { readonly kind: 'blob-ref'; readonly blobKey: string }
  | { readonly kind: 'inline-html'; readonly html: string };

export type AppRecord = {
  readonly manifest: AppManifest;
  readonly source: 'built-in' | 'user';
  readonly installedAt: number;
  readonly contentRef: AppContentRef;
  /**
   * 소유자. optional이 아니다 (zm-docs `contracts.md` §2).
   *
   * 저장 키 접두사와 중복이지만 둘 다 둔다 — 접두사는 로컬 KV의 격리 수단이고
   * 이 필드는 서버 행의 격리 수단(RLS)이다. 클라우드 어댑터가 붙을 때 필드가
   * 없으면 행 단위 정책을 걸 근거가 없다. 두 값이 어긋나지 않도록 채우는 지점을
   * 어댑터 하나로 좁힌다.
   */
  readonly ownerId: UserId;
};

/**
 * 저장소에서 읽은 값을 AppRecord로 정규화한다.
 *
 * IDB에는 두 세대의 레코드가 섞여 있다.
 *   - 레거시: `{ manifest, htmlContent, installedAt }` (source·contentRef 없음)
 *   - 현행:   `{ manifest, source, installedAt, contentRef }`
 *
 * 레거시를 그대로 AppRecord로 캐스트하면 `source`가 undefined가 되어
 * upsert 가드에 전부 걸리고, 사용자가 업로드한 앱이 사라진 것처럼 보인다.
 * 여기서 승격하되 저장된 값은 건드리지 않는다(lazy migration) — 다음 쓰기에서
 * 자연스럽게 새 형태로 저장된다.
 *
 * 순수 함수다. 판별 불가능한 값에는 null을 돌려주고, 호출자가 건너뛴다.
 * 삭제하지 않는 것이 중요하다 — 읽지 못한 것과 없는 것은 다르다.
 *
 * `ownerId`가 없는 레코드는 접두사가 도입되기 전에 쓰인 것이므로 `fallbackOwnerId`로
 * 채운다. 인자로 받는 이유는 이 함수가 순수해야 하기 때문이고, 넘기는 쪽이 어댑터
 * 하나뿐이라 채우는 지점은 여전히 한 곳이다.
 */
export function normalizeAppRecord(value: unknown, fallbackOwnerId: UserId): AppRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;

  const manifest = raw['manifest'];
  if (typeof manifest !== 'object' || manifest === null) return null;

  const installedAt = typeof raw['installedAt'] === 'number' ? raw['installedAt'] : 0;

  // source가 없으면 사용자 업로드다 — built-in은 IDB에 저장하지 않는다.
  const rawSource = raw['source'];
  const source: 'built-in' | 'user' = rawSource === 'built-in' ? 'built-in' : 'user';

  const contentRef = normalizeContentRef(raw);
  if (contentRef === null) return null;

  const rawOwnerId = raw['ownerId'];
  const ownerId =
    typeof rawOwnerId === 'string' && rawOwnerId.length > 0
      ? (rawOwnerId as UserId)
      : fallbackOwnerId;

  return {
    manifest: manifest as AppManifest,
    source,
    installedAt,
    contentRef,
    ownerId,
  };
}

function normalizeContentRef(raw: Record<string, unknown>): AppContentRef | null {
  const existing = raw['contentRef'];
  if (typeof existing === 'object' && existing !== null) {
    const ref = existing as Record<string, unknown>;
    const kind = ref['kind'];
    if (kind === 'built-in-url' && typeof ref['url'] === 'string') {
      return { kind: 'built-in-url', url: ref['url'] };
    }
    if (kind === 'blob-ref' && typeof ref['blobKey'] === 'string') {
      return { kind: 'blob-ref', blobKey: ref['blobKey'] };
    }
    if (kind === 'inline-html' && typeof ref['html'] === 'string') {
      return { kind: 'inline-html', html: ref['html'] };
    }
    return null;
  }
  // 레거시: htmlContent가 최상위에 있다.
  if (typeof raw['htmlContent'] === 'string') {
    return { kind: 'inline-html', html: raw['htmlContent'] };
  }
  return null;
}

export type AppListFilter = {
  readonly source?: 'built-in' | 'user';
  readonly ownerId?: UserId;
};

export interface AppRepository {
  readonly descriptor: AdapterDescriptor;
  list(filter?: AppListFilter, opts?: PortCallOptions): Promise<ReadonlyArray<AppRecord>>;
  get(id: string, opts?: PortCallOptions): Promise<AppRecord | null>;
  upsert(record: AppRecord, opts?: PortCallOptions): Promise<void>;
  remove(id: string, opts?: PortCallOptions): Promise<void>;
  markInstalled(appId: string, opts?: PortCallOptions): Promise<void>;
  unmarkInstalled(appId: string, opts?: PortCallOptions): Promise<void>;
  listInstalled(opts?: PortCallOptions): Promise<ReadonlyArray<string>>;
}
