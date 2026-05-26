'use client';

import React, { useEffect, useState } from 'react';

// ─── Props ────────────────────────────────────────────────────────────────────

type ClockProps = {
  /** 시간 포맷 함수. 기본: 24시간 HH:MM */
  format?: (date: Date) => string;
  className?: string;
};

// ─── 기본 포맷 함수 ────────────────────────────────────────────────────────────

function defaultFormat(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// ─── Clock ────────────────────────────────────────────────────────────────────

/**
 * Clock — 실시간 시계 컴포넌트.
 *
 * SSR 안전:
 *   - 초기 렌더에서는 placeholder('--:--') 표시.
 *   - mount 후 useEffect에서 실제 시간으로 교체.
 *   - setInterval cleanup으로 메모리 누수 방지.
 *
 * StrictMode double-execute는 setInterval 이므로
 * cleanup(clearInterval)으로 자연스럽게 처리됨.
 */
export function Clock({
  format = defaultFormat,
  className = '',
}: ClockProps): React.JSX.Element {
  // SSR hydration 안전: 초기값 null (서버/클라이언트 불일치 방지)
  const [displayTime, setDisplayTime] = useState<string | null>(null);

  useEffect(() => {
    // mount 직후 즉시 표시
    setDisplayTime(format(new Date()));

    const intervalId = setInterval((): void => {
      setDisplayTime(format(new Date()));
    }, 1000);

    return (): void => {
      clearInterval(intervalId);
    };
    // format이 바뀌면 interval 재생성. 일반적으로 안정적인 참조 전달 권장.
  }, [format]);

  return (
    <span
      className={[
        'text-sm',
        'font-mono',
        'text-white',
        'tabular-nums',
        'select-none',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-live="off"
      aria-label={`현재 시각 ${displayTime ?? ''}`}
    >
      {/* 초기 서버 렌더 및 hydration 전: placeholder */}
      {displayTime ?? '--:--'}
    </span>
  );
}
