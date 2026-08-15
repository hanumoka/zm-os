import { describe, it, expect } from 'vitest';
import {
  isValidCapabilityToken,
  CAPABILITY_TOKEN_REGEX,
  capabilitiesToAllowedMethods,
  getCapabilityMeta,
  isKnownCapability,
  isCapabilityAvailable,
  CAPABILITY_CATALOG,
  CAPABILITY_METHODS,
  CAPABILITY_IDS,
  HOST_METHOD_NAMES,
  AVAILABLE_CAPABILITY_IDS,
} from '../capability';

describe('capability token 형식', () => {
  it('점-구분 토큰을 허용한다', () => {
    expect(isValidCapabilityToken('notes.read')).toBe(true);
    expect(isValidCapabilityToken('shell.window')).toBe(true);
  });

  it('잘못된 형식을 거부한다', () => {
    for (const bad of ['', 'Bad Token', '.bad', 'UPPER', 'trailing.']) {
      expect(isValidCapabilityToken(bad)).toBe(false);
    }
  });

  it('형식 검사는 카탈로그 소속을 보지 않는다', () => {
    // 둘을 섞으면 형식이 맞는 미등록 토큰이 통과한다. 판정 주체가 다르다.
    expect(isValidCapabilityToken('fs.read')).toBe(true);
    expect(isKnownCapability('fs.read')).toBe(false);
  });

  it('정규식이 export 된다', () => {
    expect(CAPABILITY_TOKEN_REGEX.test('demo.basic')).toBe(true);
  });
});

describe('카탈로그와 표면의 일치', () => {
  it('카탈로그 키와 CAPABILITY_IDS가 같다', () => {
    expect([...CAPABILITY_IDS].sort()).toEqual(Object.keys(CAPABILITY_CATALOG).sort());
  });

  it('모든 토큰이 형식 규칙을 만족한다', () => {
    for (const id of CAPABILITY_IDS) expect(isValidCapabilityToken(id)).toBe(true);
  });

  it('메서드 이름이 자기 capability의 네임스페이스로 시작한다', () => {
    // 1:1은 타입으로 강제되지만, 캐스트로 우회한 값이 들어오는 것을 런타임에서도 막는다.
    for (const id of CAPABILITY_IDS) {
      const namespace = id.split('.')[0];
      for (const method of CAPABILITY_METHODS[id]) {
        expect(method.startsWith(`${namespace}.`)).toBe(true);
      }
    }
  });

  it('메서드 이름이 중복되지 않는다', () => {
    // 겹치면 서로 다른 capability가 같은 핸들러를 열어 1:1이 무너진다.
    expect(new Set(HOST_METHOD_NAMES).size).toBe(HOST_METHOD_NAMES.length);
  });

  it('와이어 메서드 이름이 프로토콜의 64자 상한 안에 있다', () => {
    for (const m of HOST_METHOD_NAMES) expect(m.length).toBeLessThanOrEqual(64);
  });
});

describe('구현 상태', () => {
  it('shell과 demo는 구현되어 있고 notes는 아직 아니다', () => {
    expect(isCapabilityAvailable('shell.window')).toBe(true);
    expect(isCapabilityAvailable('demo.basic')).toBe(true);
    expect(isCapabilityAvailable('notes.read')).toBe(false);
    expect(isCapabilityAvailable('notes.write')).toBe(false);
  });

  it('AVAILABLE_CAPABILITY_IDS가 status와 일치한다', () => {
    expect([...AVAILABLE_CAPABILITY_IDS].sort()).toEqual(['demo.basic', 'shell.window']);
  });

  it('미정의 토큰 조회는 undefined', () => {
    expect(getCapabilityMeta('does.not.exist')).toBeUndefined();
    expect(getCapabilityMeta('demo.basic')?.risk).toBe('low');
  });
});

describe('capabilitiesToAllowedMethods (seam)', () => {
  it('토큰을 와이어 메서드로 펼친다', () => {
    expect(capabilitiesToAllowedMethods(['demo.basic'])).toEqual([
      'demo.ping',
      'demo.getTime',
      'demo.echo',
    ]);
  });

  it('여러 토큰의 합집합을 낸다', () => {
    expect(capabilitiesToAllowedMethods(['shell.window', 'demo.basic'])).toEqual([
      'shell.setTitle',
      'shell.close',
      'demo.ping',
      'demo.getTime',
      'demo.echo',
    ]);
  });

  it('미정의 토큰은 무시한다 (fail-closed)', () => {
    expect(capabilitiesToAllowedMethods(['unknown.cap'])).toEqual([]);
    expect(capabilitiesToAllowedMethods([])).toEqual([]);
  });

  it('중복 토큰이 메서드를 중복시키지 않는다', () => {
    expect(capabilitiesToAllowedMethods(['demo.basic', 'demo.basic'])).toEqual([
      'demo.ping',
      'demo.getTime',
      'demo.echo',
    ]);
  });

  it('read 토큰만으로 write 메서드가 열리지 않는다', () => {
    // 1:1의 실제 목적이다. notes.write는 requiresUserGrant가 true다.
    const allowed = capabilitiesToAllowedMethods(['notes.read']);
    expect(allowed).toEqual(['notes.list', 'notes.get']);
    expect(allowed).not.toContain('notes.put');
    expect(allowed).not.toContain('notes.delete');
  });
});
