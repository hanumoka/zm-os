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

/**
 * nonce 관련 불변식.
 *
 * 이 블록은 "주석으로만 존재하는 규칙은 실패한다"에 대한 대응이다.
 * 2026-08-15 프로덕션 빌드 실측에서 드러난 두 함정을 기계가 막는다.
 */
describe('buildCsp — nonce', () => {
  const NONCE = 'TESTNONCEVALUE==';

  it('nonce를 주면 script-src에 실린다', () => {
    const scriptSrc = directive(buildCsp('production', NONCE), 'script-src') ?? '';
    expect(scriptSrc).toContain(`'nonce-${NONCE}'`);
  });

  it("nonce가 있어도 script-src에 'self'가 남는다", () => {
    // 'self'가 사라지면 srcdoc 샌드박스 앱이 호스트의 절대경로 external script를
    // 로드하지 못한다. 앱 문서에는 nonce가 없기 때문이다.
    const scriptSrc = directive(buildCsp('production', NONCE), 'script-src') ?? '';
    expect(scriptSrc).toContain("'self'");
  });

  it("어떤 경우에도 'strict-dynamic'을 넣지 않는다", () => {
    // 'strict-dynamic'은 host allowlist('self')를 무시시킨다. 호스트 CSP는 srcdoc
    // iframe에 상속되므로, 넣는 순간 앱의 external script가 전부 차단된다.
    for (const mode of ['development', 'production'] as const) {
      for (const nonce of [undefined, NONCE]) {
        expect(buildCsp(mode, nonce)).not.toContain('strict-dynamic');
      }
    }
  });

  it('style-src에는 nonce를 넣지 않는다', () => {
    // CSP는 지시어에 nonce가 있으면 그 지시어의 'unsafe-inline'을 무시한다.
    // style-src는 Tailwind v4 아티팩트 때문에 'unsafe-inline'이 필요하다.
    const styleSrc = directive(buildCsp('production', NONCE), 'style-src') ?? '';
    expect(styleSrc).not.toContain('nonce-');
    expect(styleSrc).toContain("'unsafe-inline'");
  });

  it('nonce 없이도 기존 prod 동작이 유지된다', () => {
    const scriptSrc = directive(buildCsp('production'), 'script-src') ?? '';
    expect(scriptSrc).toBe("script-src 'self'");
  });
});

describe('securityHeaders — CSP 소유권', () => {
  it('includeCsp: false면 CSP를 빼고 나머지 헤더는 유지한다', () => {
    // CSP는 요청마다 nonce가 달라지므로 next.config.ts가 아니라 src/proxy.ts가 소유한다.
    const headers = securityHeaders('production', { includeCsp: false });
    const names = headers.map((h) => h.key.toLowerCase());
    expect(names).not.toContain('content-security-policy');
    expect(names).toContain('permissions-policy');
    expect(names).toContain('referrer-policy');
    expect(names).toContain('x-content-type-options');
    expect(names).toContain('x-frame-options');
  });
});
