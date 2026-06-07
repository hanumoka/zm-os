import React from 'react';
import type { QuotaEstimate } from '@/lib/storage/quota-monitor';

type QuotaBadgeProps = { readonly estimate: QuotaEstimate | null };

/**
 * QuotaBadge — 스토리지 쿼터 경고 배지.
 *
 * level이 'warning' 또는 'critical'일 때만 렌더.
 * 그 외 ('ok' | 'unavailable' | null) 는 null 반환.
 */
export function QuotaBadge({ estimate }: QuotaBadgeProps): React.JSX.Element | null {
  if (estimate === null) return null;
  if (estimate.level !== 'warning' && estimate.level !== 'critical') return null;

  const usageMB = (estimate.usage / (1024 * 1024)).toFixed(1);
  const quotaMB = (estimate.quota / (1024 * 1024)).toFixed(1);
  const pct = (estimate.ratio * 100).toFixed(0);

  const tooltipText = `${pct}% 사용 (${usageMB} MB / ${quotaMB} MB)`;
  const labelText = `저장공간 ${pct}%`;

  const isWarning = estimate.level === 'warning';

  const dotClass = isWarning
    ? 'w-2 h-2 rounded-full bg-amber-400 shrink-0'
    : 'w-2 h-2 rounded-full bg-red-500 shrink-0';

  const badgeClass = isWarning
    ? 'flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-amber-300 bg-amber-500/20 border border-amber-500/40'
    : 'flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-red-300 bg-red-500/20 border border-red-500/40';

  return (
    <span className={badgeClass} title={tooltipText} aria-label={`스토리지 경고: ${tooltipText}`}>
      <span className={dotClass} aria-hidden="true" />
      {labelText}
    </span>
  );
}
