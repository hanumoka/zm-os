import { describe, it, expect } from 'vitest';
import {
  classifyQuotaLevel,
  DEFAULT_QUOTA_THRESHOLDS,
} from '../quota-monitor';

describe('classifyQuotaLevel', () => {
  describe('기본 임계치 (warning=0.8, critical=0.9)', () => {
    it('0.79 → ok', () => {
      expect(classifyQuotaLevel(0.79)).toBe('ok');
    });

    it('0.8 → warning (경계값 포함)', () => {
      expect(classifyQuotaLevel(0.8)).toBe('warning');
    });

    it('0.89 → warning', () => {
      expect(classifyQuotaLevel(0.89)).toBe('warning');
    });

    it('0.9 → critical (경계값 포함)', () => {
      expect(classifyQuotaLevel(0.9)).toBe('critical');
    });

    it('1.0 → critical', () => {
      expect(classifyQuotaLevel(1.0)).toBe('critical');
    });

    it('0 → ok', () => {
      expect(classifyQuotaLevel(0)).toBe('ok');
    });
  });

  describe('DEFAULT_QUOTA_THRESHOLDS 명시 전달 — 기본값과 동일 동작', () => {
    it('0.8 → warning (DEFAULT_QUOTA_THRESHOLDS 명시)', () => {
      expect(classifyQuotaLevel(0.8, DEFAULT_QUOTA_THRESHOLDS)).toBe('warning');
    });
  });

  describe('커스텀 thresholds', () => {
    it('warning=0.5, critical=0.7: 0.6 → warning', () => {
      const custom = { warning: 0.5, critical: 0.7 };
      expect(classifyQuotaLevel(0.6, custom)).toBe('warning');
    });
  });
});
