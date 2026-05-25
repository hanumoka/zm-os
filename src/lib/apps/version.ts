/**
 * semver 비교 유틸리티 (APP-04 lib layer)
 *
 * 사전조건: /^\d+\.\d+\.\d+$/ 형식 — manifest.ts Zod가 보장.
 * 외부 의존 없음 (순수 함수).
 * SSR 안전: 환경 의존 없음.
 * 'use client' 미사용.
 */

// ─── 공개 타입 ────────────────────────────────────────────────────────────────

/** compareSemver 반환 값: 1(a > b) | 0(equal) | -1(a < b) */
export type SemverCompareResult = 1 | 0 | -1;

// ─── 공개 함수 ────────────────────────────────────────────────────────────────

/**
 * 두 semver 문자열을 비교한다.
 *
 * @param a  비교 기준 버전 (예: "1.2.0")
 * @param b  비교 대상 버전 (예: "1.1.0")
 * @returns  1 if a > b, 0 if a === b, -1 if a < b
 *
 * 사전조건: /^\d+\.\d+\.\d+$/ — manifest.ts Zod 스키마가 호출 전에 검증한다.
 */
export function compareSemver(a: string, b: string): SemverCompareResult {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}
