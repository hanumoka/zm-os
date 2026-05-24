'use client';

import React from 'react';
import type { WindowState } from './types';
import type { AppIcon } from './desktopApps';

// ─── Props ────────────────────────────────────────────────────────────────────

type TaskbarButtonProps = {
  window: WindowState;
  isActive: boolean;
  icon: AppIcon;
  onClick: () => void;
};

// ─── TaskbarButton ────────────────────────────────────────────────────────────

/**
 * TaskbarButton — 작업표시줄의 개별 윈도우 버튼.
 *
 * 클릭 동작은 부모(Taskbar)가 결정:
 *   - active(최상위 윈도우) → minimize
 *   - minimized → restore + focus
 *   - 그 외 → focus
 *
 * 시각: 아이콘 + 라벨 + active highlight (border-bottom 또는 background)
 */
export function TaskbarButton({
  window: win,
  isActive,
  icon,
  onClick,
}: TaskbarButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex',
        'items-center',
        'gap-2',
        'h-10',
        'px-3',
        'rounded',
        'text-sm',
        'font-medium',
        'transition-colors',
        'max-w-40',
        'shrink-0',
        isActive
          ? 'bg-white/20 text-white border-b-2 border-white'
          : win.state === 'minimized'
            ? 'text-white/60 hover:bg-white/10 hover:text-white'
            : 'text-white/90 hover:bg-white/15',
        'focus-visible:outline',
        'focus-visible:outline-2',
        'focus-visible:outline-white',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`${win.title}${win.state === 'minimized' ? ' (최소화됨)' : ''}`}
      aria-pressed={isActive}
      title={win.title}
    >
      {/* 아이콘 */}
      <span className="text-base shrink-0" aria-hidden="true">
        {icon.kind === 'emoji' ? (
          icon.char
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={icon.src}
            alt={icon.alt}
            className="w-4 h-4 object-contain"
          />
        )}
      </span>

      {/* 라벨 */}
      <span className="truncate">{win.title}</span>
    </button>
  );
}
