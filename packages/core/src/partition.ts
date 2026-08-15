/**
 * 파티션 스코프 키 — 순수 규약 (zm-docs `docs/projects/zm-os/contracts.md` §2)
 *
 * 저장 키에 소유자 접두사를 붙여 "다중 사용자가 생겨도 마이그레이션 0"을 성립시킨다.
 * 나중에 붙이면 기존 레코드를 전부 다시 써야 하므로 그 근거 자체가 사라진다 —
 * 그래서 첫 레코드보다 먼저 정한 계약이고, 이 파일이 그 형식의 정본이다.
 *
 * 여기에는 브라우저 API가 없다. 붙이고 떼는 규칙만 둔다. 실제로 언제 어디에 적용할지는
 * `@zm/adapters-local`의 저장 어댑터 경계가 정하며, **그 한 곳 외에는 적용하지 않는다.**
 *
 * @module core/partition
 */

import type { UserId } from './ports/auth';

/**
 * 접두사 구분자.
 *
 * `:`인 이유는 소유자 ID가 이 문자를 포함할 수 없기 때문이다(`isValidOwnerId`).
 * 그래서 첫 `:`가 항상 경계이고 파싱이 모호해질 수 없다.
 */
export const PARTITION_SEPARATOR = ':';

/**
 * 소유자 ID로 쓸 수 있는 값인가.
 *
 * 조건은 두 개뿐이다 — 비어 있지 않을 것, 구분자를 포함하지 않을 것.
 * UUID를 강제하지 않는 이유는 로그인이 붙으면 발급 주체가 바뀌기 때문이다.
 * 형식을 좁게 못 박으면 그때 이 검사가 실제 ID를 거부한다.
 */
export function isValidOwnerId(value: string): boolean {
  return value.length > 0 && !value.includes(PARTITION_SEPARATOR);
}

/** 키에 소유자 접두사를 붙인다. */
export function scopeKey(ownerId: UserId, key: string): string {
  if (!isValidOwnerId(ownerId)) {
    throw new Error(
      `[zm-os partition] 소유자 ID에 '${PARTITION_SEPARATOR}'를 쓸 수 없습니다: ${JSON.stringify(ownerId)}`,
    );
  }
  return `${ownerId}${PARTITION_SEPARATOR}${key}`;
}

/**
 * 접두사를 뗀다. **내 것이 아니면 `null`이다.**
 *
 * 목록 조회가 이 함수로 남의 레코드를 걸러낸다. 그래서 "떼기 실패"와 "빈 키"를 구분해야
 * 하고, 예외 대신 `null`을 쓴다 — 남의 키를 만나는 것은 오류가 아니라 정상이다.
 */
export function unscopeKey(ownerId: UserId, scopedKey: string): string | null {
  const prefix = `${ownerId}${PARTITION_SEPARATOR}`;
  if (!scopedKey.startsWith(prefix)) return null;
  return scopedKey.slice(prefix.length);
}

/**
 * 접두사가 붙지 않은 레거시 키인가.
 *
 * 소유자가 1명인 동안에만 의미가 있다. 계정이 2개가 되면 "내 접두사가 아닌 키"는
 * 레거시가 아니라 **남의 레코드**이므로, 이 판정을 근거로 흡수하면 남의 데이터를
 * 가져오게 된다. 호출부(1회 마이그레이션)에 같은 경고를 둔다.
 */
export function isUnscopedLegacyKey(ownerId: UserId, key: string): boolean {
  return !key.startsWith(`${ownerId}${PARTITION_SEPARATOR}`);
}
