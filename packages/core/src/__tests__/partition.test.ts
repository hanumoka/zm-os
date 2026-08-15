import { describe, expect, it } from 'vitest';
import {
  PARTITION_SEPARATOR,
  isUnscopedLegacyKey,
  isValidOwnerId,
  scopeKey,
  unscopeKey,
} from '../partition';
import { getPartitionPolicy, isPartitionedNamespace, NS_SYSTEM, NS_USER_APPS } from '../namespace-registry';
import type { UserId } from '../ports/auth';

const OWNER = '2f6b0c9e-4a11-4d3f-9c22-8f0a1b2c3d4e' as UserId;
const OTHER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' as UserId;

describe('소유자 ID 형식', () => {
  it('구분자를 포함하면 거부한다', () => {
    expect(isValidOwnerId(`a${PARTITION_SEPARATOR}b`)).toBe(false);
  });

  it('빈 문자열을 거부한다', () => {
    expect(isValidOwnerId('')).toBe(false);
  });

  it('UUID를 받아들인다', () => {
    expect(isValidOwnerId(OWNER)).toBe(true);
  });

  it('scopeKey는 잘못된 소유자 ID를 조용히 통과시키지 않는다', () => {
    // 통과시키면 첫 `:`가 경계라는 전제가 깨져 unscopeKey가 엉뚱한 값을 돌려준다.
    expect(() => scopeKey('a:b' as UserId, 'k')).toThrow();
  });
});

describe('접두사 붙이기/떼기', () => {
  it('왕복하면 원래 키가 나온다', () => {
    expect(unscopeKey(OWNER, scopeKey(OWNER, 'sample-snake'))).toBe('sample-snake');
  });

  it('키에 구분자가 들어 있어도 첫 구분자만 경계로 본다', () => {
    const key = 'a:b:c';
    expect(unscopeKey(OWNER, scopeKey(OWNER, key))).toBe(key);
  });

  it('빈 키도 왕복한다', () => {
    expect(unscopeKey(OWNER, scopeKey(OWNER, ''))).toBe('');
  });

  it('남의 접두사는 null이다 — 이것이 목록 필터의 근거다', () => {
    expect(unscopeKey(OWNER, scopeKey(OTHER, 'x'))).toBeNull();
  });

  it('접두사가 없는 키는 null이다', () => {
    expect(unscopeKey(OWNER, 'x')).toBeNull();
  });

  it('소유자 ID가 다른 ID의 접두사여도 섞이지 않는다', () => {
    // 구분자 없이 startsWith만 봤다면 'abc'가 'abcd'의 키를 자기 것으로 읽는다.
    const shortOwner = 'abc' as UserId;
    const longOwner = 'abcd' as UserId;
    expect(unscopeKey(shortOwner, scopeKey(longOwner, 'k'))).toBeNull();
  });
});

describe('레거시 키 판정', () => {
  it('접두사 없는 키를 레거시로 본다', () => {
    expect(isUnscopedLegacyKey(OWNER, 'sample-snake')).toBe(true);
  });

  it('내 접두사가 붙은 키는 레거시가 아니다', () => {
    expect(isUnscopedLegacyKey(OWNER, scopeKey(OWNER, 'sample-snake'))).toBe(false);
  });
});

describe('namespace 파티션 정책', () => {
  it('system은 파티션하지 않는다 — 소유자 ID가 거기 있기 때문이다', () => {
    expect(getPartitionPolicy(NS_SYSTEM)).toBe('global');
    expect(isPartitionedNamespace(NS_SYSTEM)).toBe(false);
  });

  it('사용자 데이터 namespace는 파티션한다', () => {
    expect(isPartitionedNamespace(NS_USER_APPS)).toBe(true);
  });

  it('미등록 namespace는 파티션하는 쪽으로 기운다', () => {
    // 빠뜨렸을 때 격리를 덜 하는 쪽으로 기울면 누락이 조용히 통과한다.
    expect(isPartitionedNamespace('not-registered-yet')).toBe(true);
  });
});
