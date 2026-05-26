import { describe, it, expect } from 'vitest';
import { createRateLimiter } from '../rate-limiter';

function makeTimer(): { now: () => number; advance: (ms: number) => void } {
  let t = 1000;
  return {
    now: (): number => t,
    advance: (ms: number): void => { t += ms; },
  };
}

describe('createRateLimiter', () => {
  it('allows messages within limit', () => {
    const timer = makeTimer();
    const limiter = createRateLimiter({ maxMessages: 5, windowMs: 1000, penaltyMs: 2000 }, timer.now);

    for (let i = 0; i < 5; i++) {
      expect(limiter.check()).toBe('allow');
    }
  });

  it('drops at maxMessages+1 and enters penalty', () => {
    const timer = makeTimer();
    const limiter = createRateLimiter({ maxMessages: 3, windowMs: 1000, penaltyMs: 2000 }, timer.now);

    expect(limiter.check()).toBe('allow');
    expect(limiter.check()).toBe('allow');
    expect(limiter.check()).toBe('allow');
    expect(limiter.check()).toBe('drop');
  });

  it('penalty blocks all messages until expiry', () => {
    const timer = makeTimer();
    const limiter = createRateLimiter({ maxMessages: 2, windowMs: 1000, penaltyMs: 500 }, timer.now);

    limiter.check(); // allow
    limiter.check(); // allow
    limiter.check(); // drop → penalty starts (penaltyUntil = 1500)

    timer.advance(100); // t=1100, still in penalty
    expect(limiter.check()).toBe('penalty');

    timer.advance(100); // t=1200, still in penalty
    expect(limiter.check()).toBe('penalty');

    // advance past both penalty (1500) AND window reset (2000)
    timer.advance(1000); // t=2200
    expect(limiter.check()).toBe('allow');
  });

  it('window resets after windowMs', () => {
    const timer = makeTimer();
    const limiter = createRateLimiter({ maxMessages: 2, windowMs: 1000, penaltyMs: 2000 }, timer.now);

    limiter.check(); // allow
    limiter.check(); // allow

    timer.advance(1000); // window reset
    expect(limiter.check()).toBe('allow');
    expect(limiter.check()).toBe('allow');
  });

  it('reset() clears all state', () => {
    const timer = makeTimer();
    const limiter = createRateLimiter({ maxMessages: 1, windowMs: 1000, penaltyMs: 2000 }, timer.now);

    limiter.check(); // allow
    limiter.check(); // drop → penalty

    limiter.reset();
    const s = limiter.status();
    expect(s.count).toBe(0);
    expect(s.inPenalty).toBe(false);
    expect(s.totalDropped).toBe(0);

    expect(limiter.check()).toBe('allow');
  });

  it('status() reflects current state', () => {
    const timer = makeTimer();
    const limiter = createRateLimiter({ maxMessages: 2, windowMs: 1000, penaltyMs: 500 }, timer.now);

    limiter.check();
    limiter.check();
    const before = limiter.status();
    expect(before.count).toBe(2);
    expect(before.inPenalty).toBe(false);
    expect(before.totalDropped).toBe(0);

    limiter.check(); // drop → penalty
    const after = limiter.status();
    expect(after.inPenalty).toBe(true);
    expect(after.totalDropped).toBe(1);
    expect(after.penaltyRemainingMs).toBe(500);
  });

  it('uses default config when none provided', () => {
    const timer = makeTimer();
    const limiter = createRateLimiter(undefined, timer.now);

    for (let i = 0; i < 60; i++) {
      expect(limiter.check()).toBe('allow');
    }
    expect(limiter.check()).toBe('drop');
  });
});
