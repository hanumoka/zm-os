/**
 * Capability 카탈로그 — 토큰의 메타데이터와 토큰 → 메서드 표.
 *
 * **토큰 집합 자체는 여기서 정하지 않는다.** `host-api/contract.ts`의 `HostApiSurface`에서
 * 파생된다(ADR-0034 갱신). 예전에는 이 파일의 `ipcMethods`가 자유 문자열 배열이라
 * 표면과 카탈로그가 조용히 어긋날 수 있었고, 실제로 `demo.basic`의 메서드가 네임스페이스
 * 없는 평면 이름(`ping`)이어서 "네임스페이스 = capability 1:1"을 이미 위반하고 있었다.
 *
 * 새 capability 추가 = `HostApiSurface`에 네임스페이스나 접미사를 추가 → 이 파일 두 표가
 * **컴파일 에러로 작성을 요구**한다. 빠뜨릴 수가 없다.
 *
 * @module capability/catalog
 */

import type { CapabilityId, MethodsOf, MustBeEmpty, HostMethodName } from '../host-api/contract';
import type { CapabilityRisk } from './types';

/** capability 하나의 메타데이터. 메서드 목록은 여기 없다 — 아래 별도 표가 갖는다. */
export type CapabilityMeta = {
  /** 사용자 grant UI 표시명 (F1). */
  readonly title: string;
  readonly risk: CapabilityRisk;
  /** false = 시스템 자동 grant. true = 사용자 승인 필요 (F1에서 UI가 붙는다). */
  readonly requiresUserGrant: boolean;
  /**
   * `planned` = 타입과 토큰만 동결했고 핸들러가 없다.
   *
   * 이 값이 있는 이유는 "나중에 하기로 한 것"이 "잊힌 것"으로 바뀌지 않게 하기 위해서다.
   * `available`로 바꾸는 순간 컴파일러가 핸들러를 요구하고, 반대로 `planned`인 채
   * 구현해도 컴파일이 실패한다. contracts.md §5의 `unavailable`/`missing`에 대응한다.
   */
  readonly status: 'available' | 'planned';
};

/**
 * capability 메타데이터.
 *
 * 키 누락도 잉여도 컴파일 에러다 — 표면에 네임스페이스를 늘리면 여기 작성을 강제당한다.
 *
 * ⚠ `risk`와 `requiresUserGrant` 값은 아직 소유자 확인을 받지 않았다. F1의 승인 UI가
 *   없는 지금은 어느 값이어도 런타임 동작이 같다.
 */
export const CAPABILITY_CATALOG = {
  'notes.read': { title: '노트 읽기', risk: 'low', requiresUserGrant: false, status: 'planned' },
  'notes.write': { title: '노트 쓰기', risk: 'high', requiresUserGrant: true, status: 'planned' },
  'shell.window': {
    title: '창 제목 변경·닫기',
    risk: 'low',
    requiresUserGrant: false,
    status: 'available',
  },
  'demo.basic': { title: '데모 RPC', risk: 'low', requiresUserGrant: false, status: 'available' },
} as const satisfies Record<CapabilityId, CapabilityMeta>;

/**
 * 토큰 → 그 토큰이 여는 와이어 메서드.
 *
 * 런타임에 필요한 표라 손으로 적지만, 튜플 제약이 잘못 적는 것을 막는다.
 *
 * - `'notes.read': ['notes.put']` → `MethodsOf<'notes.read'>` 위반 → 컴파일 실패
 * - `'fs.read': [...]` → `CapabilityId`에 없는 키 → 실패
 * - `'notes.read': []` → 비어 있지 않은 튜플 위반 → 실패
 * - capability 하나 누락 → 매핑 타입이 전 키를 요구 → 실패
 *
 * 즉 `requiresUserGrant: true`인 `notes.write`의 메서드를 `notes.read`가 여는 상태가
 * **표현 불가능**하다. 이것이 1:1 강제의 실체다.
 */
export const CAPABILITY_METHODS = {
  'notes.read': ['notes.list', 'notes.get'],
  'notes.write': ['notes.put', 'notes.delete'],
  'shell.window': ['shell.setTitle', 'shell.close'],
  'demo.basic': ['demo.ping', 'demo.getTime', 'demo.echo'],
} as const satisfies { [C in CapabilityId]: readonly [MethodsOf<C>, ...Array<MethodsOf<C>>] };

// ─── 컴파일 타임 단언 ─────────────────────────────────────────────────────────

/** 어떤 capability로도 도달할 수 없는 메서드가 표면에 남아 있으면 컴파일 실패. */
type CoveredMethod = (typeof CAPABILITY_METHODS)[CapabilityId][number];
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _AssertNoOrphanMethod = MustBeEmpty<Exclude<HostMethodName, CoveredMethod>>;

// ─── 런타임 목록 ──────────────────────────────────────────────────────────────

/**
 * 알려진 capability 토큰 전부. 매니페스트 검증(`z.enum`)이 이것을 쓴다.
 *
 * `Object.keys`가 아니라 명시 배열인 이유는 `z.enum`이 값 튜플을 요구하기 때문이다.
 * 아래 단언이 카탈로그와의 어긋남을 양방향으로 막는다.
 */
export const CAPABILITY_IDS = [
  'notes.read',
  'notes.write',
  'shell.window',
  'demo.basic',
] as const satisfies ReadonlyArray<CapabilityId>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _AssertCapabilityIdsComplete = MustBeEmpty<
  Exclude<CapabilityId, (typeof CAPABILITY_IDS)[number]>
>;

/** 와이어에 실릴 수 있는 메서드 이름 전부. 게이트와 테스트가 참조한다. */
export const HOST_METHOD_NAMES: ReadonlyArray<HostMethodName> = CAPABILITY_IDS.flatMap(
  (id) => CAPABILITY_METHODS[id] as ReadonlyArray<HostMethodName>,
);

// ─── 조회 ─────────────────────────────────────────────────────────────────────

export function isKnownCapability(id: string): id is CapabilityId {
  return (CAPABILITY_IDS as ReadonlyArray<string>).includes(id);
}

export function getCapabilityMeta(id: string): CapabilityMeta | undefined {
  return isKnownCapability(id) ? CAPABILITY_CATALOG[id] : undefined;
}

/** 이 capability의 핸들러가 이미 존재하는가. `planned`면 호출해도 실행할 것이 없다. */
export function isCapabilityAvailable(id: string): boolean {
  return getCapabilityMeta(id)?.status === 'available';
}

/**
 * 지금 구현이 있는 capability의 **타입**.
 *
 * 합성 루트의 구현 객체가 `ImplementedFlat<AvailableCapability>` 타입을 갖는다. 그래서
 * `status`를 `available`로 바꾸는 순간 컴파일러가 핸들러를 요구하고, `planned`인 채
 * 구현해도 컴파일이 실패한다. **"나중에 하기로 한 것"이 "잊힌 것"으로 바뀌지 않는다.**
 */
export type AvailableCapability = {
  [K in CapabilityId]: (typeof CAPABILITY_CATALOG)[K]['status'] extends 'available' ? K : never;
}[CapabilityId];

/** 위 타입의 런타임 대응. */
export const AVAILABLE_CAPABILITY_IDS = CAPABILITY_IDS.filter((id) =>
  isCapabilityAvailable(id),
) as ReadonlyArray<CapabilityId>;
