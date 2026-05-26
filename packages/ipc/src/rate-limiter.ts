/**
 * postMessage Rate Limiter (N-08 DoS 방어)
 *
 * 알고리즘: 고정 윈도우 카운터 + 벌칙 쿨다운
 * - 윈도우 내 메시지 수가 maxMessages 초과 시 드롭
 * - 초과 시 penaltyMs 동안 전체 차단
 * - INIT/READY 핸드셰이크 메시지는 호출자가 제외 (check 호출 안 함)
 *
 * Side effect: 내부 카운터 갱신만 (DOM/스토리지/네트워크 없음)
 */

export interface RateLimitConfig {
  readonly maxMessages: number;
  readonly windowMs: number;
  readonly penaltyMs: number;
}

export type RateLimitVerdict = 'allow' | 'drop' | 'penalty';

export interface RateLimitStatus {
  readonly count: number;
  readonly inPenalty: boolean;
  readonly penaltyRemainingMs: number;
  readonly totalDropped: number;
}

export interface MessageRateLimiter {
  check(): RateLimitVerdict;
  status(): RateLimitStatus;
  reset(): void;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxMessages: 60,
  windowMs: 1000,
  penaltyMs: 2000,
};

export function createRateLimiter(
  config?: Partial<RateLimitConfig>,
  nowFn?: () => number,
): MessageRateLimiter {
  const cfg: RateLimitConfig = { ...DEFAULT_CONFIG, ...config };
  const now = nowFn ?? Date.now;

  let windowStart = now();
  let count = 0;
  let totalDropped = 0;
  let penaltyUntil = 0;

  function check(): RateLimitVerdict {
    const t = now();

    if (t < penaltyUntil) {
      totalDropped++;
      return 'penalty';
    }

    if (t - windowStart >= cfg.windowMs) {
      windowStart = t;
      count = 0;
    }

    count++;

    if (count > cfg.maxMessages) {
      penaltyUntil = t + cfg.penaltyMs;
      totalDropped++;
      return 'drop';
    }

    return 'allow';
  }

  function status(): RateLimitStatus {
    const t = now();
    const inPenalty = t < penaltyUntil;
    return {
      count,
      inPenalty,
      penaltyRemainingMs: inPenalty ? penaltyUntil - t : 0,
      totalDropped,
    };
  }

  function reset(): void {
    windowStart = now();
    count = 0;
    totalDropped = 0;
    penaltyUntil = 0;
  }

  return { check, status, reset };
}
