'use client';

import React from 'react';
import type { DesktopAppEntry, AppIcon } from '@/components/desktop/desktopApps';

// ─── Props ────────────────────────────────────────────────────────────────────

type AppCardProps = {
  entry: DesktopAppEntry;
  installed: boolean;
  selected: boolean;
  onSelect: () => void;
};

// ─── AppIconDisplay ───────────────────────────────────────────────────────────

function AppIconDisplay({ icon }: { icon: AppIcon }): React.JSX.Element {
  if (icon.kind === 'emoji') {
    return (
      <span role="img" aria-hidden="true" className="text-3xl leading-none">
        {icon.char}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={icon.src}
      alt={icon.alt}
      className="w-8 h-8 object-contain"
    />
  );
}

// ─── AppCard ──────────────────────────────────────────────────────────────────

/**
 * AppCard — 스토어 앱 목록 카드.
 *
 * a11y: role="button", tabIndex={0}, onKeyDown(Enter/Space)
 * 시각: 아이콘 + 이름 + description(truncate) + "설치됨" 배지
 * selected 시 ring/border 강조
 */
export function AppCard({
  entry,
  installed,
  selected,
  onSelect,
}: AppCardProps): React.JSX.Element {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${entry.name} 앱 선택${installed ? ' — 설치됨' : ''}`}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      className={[
        'flex',
        'items-start',
        'gap-3',
        'p-3',
        'rounded-lg',
        'border',
        'cursor-pointer',
        'select-none',
        'transition-colors',
        'outline-none',
        selected
          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-400'
          : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50',
        'focus-visible:ring-2',
        'focus-visible:ring-blue-400',
        'focus-visible:outline-none',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* 아이콘 */}
      <div className="flex items-center justify-center w-10 h-10 shrink-0 rounded-md bg-neutral-100">
        <AppIconDisplay icon={entry.icon} />
      </div>

      {/* 텍스트 영역 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-neutral-900 truncate">
            {entry.name}
          </span>
          {installed && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 shrink-0">
              설치됨
            </span>
          )}
        </div>
        {entry.description !== undefined && (
          <p className="mt-0.5 text-xs text-neutral-500 line-clamp-2">
            {entry.description}
          </p>
        )}
        {entry.category !== undefined && (
          <span className="mt-1 inline-block text-xs text-neutral-400">
            {entry.category}
          </span>
        )}
      </div>
    </div>
  );
}
