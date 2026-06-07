export type QuotaLevel = 'ok' | 'warning' | 'critical' | 'unavailable';

export type QuotaEstimate = {
  readonly usage: number;
  readonly quota: number;
  readonly ratio: number;
  readonly level: QuotaLevel;
};

export const QUOTA_WARNING_RATIO = 0.8;
export const QUOTA_CRITICAL_RATIO = 0.9;

export type QuotaThresholds = {
  readonly warning: number;
  readonly critical: number;
};

export const DEFAULT_QUOTA_THRESHOLDS: QuotaThresholds = {
  warning: QUOTA_WARNING_RATIO,
  critical: QUOTA_CRITICAL_RATIO,
};

const UNAVAILABLE_ESTIMATE: QuotaEstimate = {
  usage: 0,
  quota: 0,
  ratio: 0,
  level: 'unavailable',
};

/**
 * 순수 분류 함수 — 테스트 용이.
 * ratio >= critical → 'critical', >= warning → 'warning', else → 'ok'
 */
export function classifyQuotaLevel(
  ratio: number,
  thresholds: QuotaThresholds = DEFAULT_QUOTA_THRESHOLDS,
): QuotaLevel {
  if (ratio >= thresholds.critical) return 'critical';
  if (ratio >= thresholds.warning) return 'warning';
  return 'ok';
}

/**
 * navigator.storage.estimate() 1회 조회.
 * SSR / 미지원 / reject 시 level:'unavailable' 반환 (throw 금지).
 */
export async function estimateStorageQuota(
  thresholds: QuotaThresholds = DEFAULT_QUOTA_THRESHOLDS,
): Promise<QuotaEstimate> {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.storage === 'undefined' ||
    typeof navigator.storage.estimate !== 'function'
  ) {
    return UNAVAILABLE_ESTIMATE;
  }

  try {
    const result = await navigator.storage.estimate();
    const usage = result.usage ?? 0;
    const quota = result.quota ?? 0;
    const ratio = quota > 0 ? usage / quota : 0;
    const level = classifyQuotaLevel(ratio, thresholds);
    return { usage, quota, ratio, level };
  } catch {
    return UNAVAILABLE_ESTIMATE;
  }
}
