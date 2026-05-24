'use client';

import React from 'react';
import type { DesktopAppEntry, AppIcon } from '@/components/desktop/desktopApps';

// ─── Props ────────────────────────────────────────────────────────────────────

type AppDetailProps = {
  entry: DesktopAppEntry;
  installed: boolean;
  onInstall: () => void;
  onUninstall: () => void;
};

// ─── AppIconDisplay ───────────────────────────────────────────────────────────

function AppIconDisplay({ icon }: { icon: AppIcon }): React.JSX.Element {
  if (icon.kind === 'emoji') {
    return (
      <span role="img" aria-hidden="true" className="text-5xl leading-none">
        {icon.char}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={icon.src}
      alt={icon.alt}
      className="w-16 h-16 object-contain rounded-xl"
    />
  );
}

// ─── AppDetail ────────────────────────────────────────────────────────────────

/**
 * AppDetail — 스토어 앱 상세 패널.
 *
 * 본문: 아이콘 + name + author + version + longDescription + screenshots
 * CTA:
 *   - installed === false → "설치" 버튼 (primary, bg-blue-600)
 *   - installed === true → "설치됨" disabled + "제거" outline 버튼
 */
export function AppDetail({
  entry,
  installed,
  onInstall,
  onUninstall,
}: AppDetailProps): React.JSX.Element {
  return (
    <div className="flex flex-col h-full overflow-y-auto p-5 gap-5">
      {/* ── 헤더 ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <div className="flex items-center justify-center w-16 h-16 shrink-0 rounded-xl bg-neutral-100">
          <AppIconDisplay icon={entry.icon} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-neutral-900 leading-tight">
            {entry.name}
          </h2>
          {entry.author !== undefined && (
            <p className="text-sm text-neutral-500 mt-0.5">{entry.author}</p>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {entry.version !== undefined && (
              <span className="text-xs text-neutral-400">
                v{entry.version}
              </span>
            )}
            {entry.category !== undefined && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-neutral-100 text-neutral-600">
                {entry.category}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── CTA 버튼 ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {installed ? (
          <>
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="px-4 py-2 rounded-md text-sm font-medium bg-neutral-100 text-neutral-400 cursor-not-allowed"
            >
              설치됨
            </button>
            <button
              type="button"
              onClick={onUninstall}
              className="px-4 py-2 rounded-md text-sm font-medium border border-neutral-300 text-neutral-700 bg-white hover:bg-neutral-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
            >
              제거
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onInstall}
            className="px-4 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
          >
            설치
          </button>
        )}
      </div>

      {/* ── 구분선 ────────────────────────────────────────────────────────── */}
      <hr className="border-neutral-200" />

      {/* ── 긴 설명 ───────────────────────────────────────────────────────── */}
      {entry.longDescription !== undefined ? (
        <div>
          <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">
            설명
          </h3>
          <p className="text-sm text-neutral-700 leading-relaxed whitespace-pre-line">
            {entry.longDescription}
          </p>
        </div>
      ) : entry.description !== undefined ? (
        <div>
          <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">
            설명
          </h3>
          <p className="text-sm text-neutral-700 leading-relaxed">
            {entry.description}
          </p>
        </div>
      ) : null}

      {/* ── 스크린샷 ──────────────────────────────────────────────────────── */}
      {entry.screenshots !== undefined && entry.screenshots.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">
            스크린샷
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {entry.screenshots.map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={src}
                src={src}
                alt="스크린샷"
                className="w-full rounded-md border border-neutral-200 object-cover aspect-video"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
