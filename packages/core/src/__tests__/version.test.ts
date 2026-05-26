import { describe, it, expect } from 'vitest';
import { compareSemver } from '../version';

describe('compareSemver', () => {
  it('returns 1 when a > b (major)', () => {
    expect(compareSemver('2.0.0', '1.0.0')).toBe(1);
  });

  it('returns 1 when a > b (minor)', () => {
    expect(compareSemver('1.2.0', '1.1.0')).toBe(1);
  });

  it('returns 1 when a > b (patch)', () => {
    expect(compareSemver('1.0.1', '1.0.0')).toBe(1);
  });

  it('returns 0 when a === b', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
  });

  it('returns -1 when a < b (major)', () => {
    expect(compareSemver('1.0.0', '2.0.0')).toBe(-1);
  });

  it('returns -1 when a < b (minor)', () => {
    expect(compareSemver('1.1.0', '1.2.0')).toBe(-1);
  });

  it('returns -1 when a < b (patch)', () => {
    expect(compareSemver('1.0.0', '1.0.1')).toBe(-1);
  });

  it('handles multi-digit versions correctly', () => {
    expect(compareSemver('1.10.0', '1.9.0')).toBe(1);
    expect(compareSemver('10.0.0', '9.99.99')).toBe(1);
  });

  it('returns 0 for identical zero versions', () => {
    expect(compareSemver('0.0.0', '0.0.0')).toBe(0);
  });
});
