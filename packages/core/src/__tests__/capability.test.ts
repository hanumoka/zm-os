import { describe, it, expect } from 'vitest';
import {
  isValidCapabilityToken,
  CAPABILITY_TOKEN_REGEX,
  capabilitiesToAllowedMethods,
  getCapabilityDef,
  isKnownCapability,
  CAPABILITY_CATALOG,
} from '../capability';

describe('capability token 검증', () => {
  it('평면 레거시 토큰 허용 (v1 호환)', () => {
    expect(isValidCapabilityToken('gamepad')).toBe(true);
    expect(isValidCapabilityToken('audio')).toBe(true);
  });

  it('점/콜론-구분 토큰 허용', () => {
    expect(isValidCapabilityToken('notify.post')).toBe(true);
    expect(isValidCapabilityToken('fs:read')).toBe(true);
    expect(isValidCapabilityToken('window.control')).toBe(true);
  });

  it('잘못된 토큰 거부', () => {
    expect(isValidCapabilityToken('')).toBe(false);
    expect(isValidCapabilityToken('Bad Token')).toBe(false);
    expect(isValidCapabilityToken('.bad')).toBe(false);
    expect(isValidCapabilityToken('UPPER')).toBe(false);
    expect(isValidCapabilityToken('trailing.')).toBe(false);
  });

  it('정규식이 export 됨', () => {
    expect(CAPABILITY_TOKEN_REGEX.test('demo.basic')).toBe(true);
  });
});

describe('capability 카탈로그', () => {
  it('데모 capability 조회', () => {
    const def = getCapabilityDef('demo.basic');
    expect(def).toBeDefined();
    expect(def?.ipcMethods).toEqual(['ping', 'getTime', 'echo']);
    expect(def?.risk).toBe('low');
  });

  it('미정의 capability는 undefined', () => {
    expect(getCapabilityDef('does.not.exist')).toBeUndefined();
    expect(isKnownCapability('does.not.exist')).toBe(false);
    expect(isKnownCapability('demo.basic')).toBe(true);
  });

  it('카탈로그의 모든 토큰이 형식 규칙을 만족', () => {
    for (const def of CAPABILITY_CATALOG) {
      expect(isValidCapabilityToken(def.id)).toBe(true);
    }
  });
});

describe('capabilitiesToAllowedMethods (seam)', () => {
  it('카탈로그 capability를 IPC 메서드로 펼침', () => {
    expect(capabilitiesToAllowedMethods(['demo.basic'])).toEqual([
      'ping',
      'getTime',
      'echo',
    ]);
  });

  it('미정의 토큰은 무시 (fail-closed)', () => {
    expect(capabilitiesToAllowedMethods(['unknown.cap'])).toEqual([]);
    expect(capabilitiesToAllowedMethods([])).toEqual([]);
  });

  it('중복 메서드 제거 (합집합)', () => {
    const result = capabilitiesToAllowedMethods(['demo.basic', 'demo.basic']);
    expect(result).toEqual(['ping', 'getTime', 'echo']);
  });
});
