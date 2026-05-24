'use client';

import React from 'react';
import type { AppIcon } from './desktopApps';

// ─── Props ────────────────────────────────────────────────────────────────────

type DesktopIconProps = {
  id: string;
  label: string;
  icon: AppIcon;
  position?: { x: number; y: number };
  selected?: boolean;
  onLaunch: () => void;
  onSelect?: () => void;
  className?: string;
};

// ─── DesktopIcon ─────────────────────────────────────────────────────────────

/**
 * DesktopIcon — 데스크탑 아이콘 컴포넌트.
 *
 * - 더블클릭 → onLaunch
 * - 단일클릭 → onSelect (선택 하이라이트)
 * - Enter / Space → onLaunch (a11y)
 * - absolute positioning (position prop 사용)
 * - 80×80px 세로 정렬 레이아웃
 */
export function DesktopIcon({
  id,
  label,
  icon,
  position,
  selected = false,
  onLaunch,
  onSelect,
  className = '',
}: DesktopIconProps): React.JSX.Element {
  const handleClick = (): void => {
    onSelect?.();
  };

  const handleDoubleClick = (): void => {
    onLaunch();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onLaunch();
    }
  };

  const positionStyle: React.CSSProperties =
    position !== undefined
      ? { left: position.x, top: position.y }
      : {};

  return (
    <div
      id={`desktop-icon-${id}`}
      role="button"
      tabIndex={0}
      aria-label={`${label} 앱 열기`}
      aria-pressed={selected}
      style={positionStyle}
      className={[
        'absolute',
        'flex',
        'flex-col',
        'items-center',
        'justify-center',
        'gap-1',
        'w-20',
        'h-20',
        'rounded-lg',
        'cursor-pointer',
        'select-none',
        'p-1',
        'transition-colors',
        selected
          ? 'bg-white/40 ring-2 ring-blue-400'
          : 'hover:bg-white/25',
        'focus-visible:outline',
        'focus-visible:outline-2',
        'focus-visible:outline-blue-400',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
    >
      {/* 아이콘 영역 */}
      <div className="flex items-center justify-center w-12 h-12 text-4xl">
        {icon.kind === 'emoji' ? (
          <span role="img" aria-hidden="true">
            {icon.char}
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={icon.src}
            alt={icon.alt}
            className="w-10 h-10 object-contain"
          />
        )}
      </div>

      {/* 라벨 */}
      <span className="text-xs text-white font-medium text-center leading-tight drop-shadow-sm line-clamp-2 px-0.5">
        {label}
      </span>
    </div>
  );
}
