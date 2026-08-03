import { describe, expect, it } from 'vitest';
import { buildCsp, buildPermissionsPolicy, securityHeaders } from '../csp';

/**
 * 이 모듈의 반환값은 next.config.ts의 headers()로 모든 응답에 실린다.
 * 문자열 조립이라 타입이 지켜주지 않으므로 "있어야 할 것 / 없어야 할 것"을 단언한다.
 *
 * 스냅샷은 쓰지 않는다 — 정당한 변경마다 갱신하게 되어 의미가 사라진다.
 */

const directive = (csp: string, name: string): string | undefined =>
  csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d === name || d.startsWith(`${name} `));

describe('buildCsp — production', () => {
  const csp = buildCsp('production');

  it('script-src에 unsafe-inline / unsafe-eval이 없다', () => {
    const scriptSrc = directive(csp, 'script-src') ?? '';
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it('frame-ancestors가 none이다 (클릭재킹 방어)', () => {
    expect(directive(csp, 'frame-ancestors')).toBe("frame-ancestors 'none'");
  });

  it('object-src가 none이다', () => {
    expect(directive(csp, 'object-src')).toBe("object-src 'none'");
  });

  it('frame-src에 blob:이 남아 있다 — 샌드박스 iframe의 전제다', () => {
    expect(directive(csp, 'frame-src')).toContain('blob:');
  });

  it('base-uri / form-action이 self로 잠겨 있다', () => {
    expect(directive(csp, 'base-uri')).toBe("base-uri 'self'");
    expect(directive(csp, 'form-action')).toBe("form-action 'self'");
  });
});

describe('buildCsp — development', () => {
  const csp = buildCsp('development');

  it('개발 편의를 위해 script-src에 unsafe가 허용된다', () => {
    const scriptSrc = directive(csp, 'script-src') ?? '';
    expect(scriptSrc).toContain("'unsafe-eval'");
  });

  it('개발에서도 object-src는 none을 유지한다', () => {
    expect(directive(csp, 'object-src')).toBe("object-src 'none'");
  });

  it('production과 dev가 실제로 다르다', () => {
    expect(csp).not.toBe(buildCsp('production'));
  });
});

describe('buildPermissionsPolicy', () => {
  const policy = buildPermissionsPolicy();

  it('비어 있지 않다', () => {
    expect(policy.length).toBeGreaterThan(0);
  });

  it('민감 기능이 차단 목록에 있다', () => {
    for (const feature of ['camera', 'microphone', 'geolocation']) {
      expect(policy).toContain(feature);
    }
  });
});

describe('securityHeaders', () => {
  it('production 헤더에 CSP와 X-Frame-Options가 포함된다', () => {
    const headers = securityHeaders('production');
    const names = headers.map((h) => h.key.toLowerCase());
    expect(names).toContain('content-security-policy');
    expect(names).toContain('x-frame-options');
  });

  it('모든 헤더가 비어 있지 않은 값을 갖는다', () => {
    for (const mode of ['development', 'production'] as const) {
      for (const header of securityHeaders(mode)) {
        expect(header.key.length).toBeGreaterThan(0);
        expect(header.value.length).toBeGreaterThan(0);
      }
    }
  });
});
