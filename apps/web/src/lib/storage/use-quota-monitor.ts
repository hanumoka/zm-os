'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  estimateStorageQuota,
  type QuotaEstimate,
  type QuotaThresholds,
} from './quota-monitor';

export type UseQuotaMonitorOptions = {
  readonly thresholds?: QuotaThresholds;
  readonly pollIntervalMs?: number;
};

export type UseQuotaMonitorResult = {
  readonly estimate: QuotaEstimate | null;
  readonly refresh: () => void;
};

export function useQuotaMonitor(
  options: UseQuotaMonitorOptions = {},
): UseQuotaMonitorResult {
  const { thresholds, pollIntervalMs } = options;
  const [estimate, setEstimate] = useState<QuotaEstimate | null>(null);

  // ref로 최신 thresholds 참조 — 의존성 배열에서 객체 동일성 불안정 방지
  const thresholdsRef = useRef(thresholds);
  thresholdsRef.current = thresholds;

  const fetchAndSet = useCallback((): Promise<void> => {
    return estimateStorageQuota(thresholdsRef.current).then((result) => {
      setEstimate(result);
    });
  }, []);

  // 마운트 시 1회 조회 + cancelled 가드 (unmount 후 setState 방지)
  useEffect(() => {
    let cancelled = false;

    estimateStorageQuota(thresholdsRef.current)
      .then((result) => {
        if (cancelled) return;
        setEstimate(result);
      })
      .catch(() => {
        // estimateStorageQuota 는 throw 하지 않으므로 여기엔 도달하지 않음
        // 안전장치
      });

    return () => {
      cancelled = true;
    };
    // fetchAndSet ref 기반 → 불필요한 재실행 방지를 위해 빈 배열 유지
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 폴링 — pollIntervalMs > 0 일 때만 활성화
  useEffect(() => {
    if (!pollIntervalMs || pollIntervalMs <= 0) return;

    const id = setInterval(() => {
      void fetchAndSet();
    }, pollIntervalMs);

    return () => {
      clearInterval(id);
    };
  }, [pollIntervalMs, fetchAndSet]);

  const refresh = useCallback((): void => {
    void fetchAndSet();
  }, [fetchAndSet]);

  return { estimate, refresh };
}
