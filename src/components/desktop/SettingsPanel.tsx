'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { useDesktopSettings } from './DesktopSettingsProvider';
import {
  WALLPAPER_CLASSES,
  WALLPAPER_LABELS,
} from '@/lib/storage/desktop-settings';
import type { WallpaperPreset, ThemeMode } from '@/lib/storage/desktop-settings';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

type SettingsPanelProps = {
  open: boolean;
  onClose: () => void;
};

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const PRESETS = Object.keys(WALLPAPER_CLASSES) as WallpaperPreset[];

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: '시스템 설정' },
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
];

// ─── SettingsPanel ────────────────────────────────────────────────────────────

/**
 * SettingsPanel — 데스크탑 설정 다이얼로그.
 *
 * 기능:
 *   - 배경화면 프리셋 선택 (8가지)
 *   - 이미지 URL 직접 입력
 *   - 테마 모드 선택 (시스템/라이트/다크)
 *
 * 구현: HTML <dialog> 사용 (ConfirmDialog 패턴 복제).
 * Escape 닫기는 dialog의 onCancel 이벤트로 처리.
 * backdrop 클릭 닫기는 onClick에서 target 비교로 처리.
 */
export function SettingsPanel({ open, onClose }: SettingsPanelProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const { wallpaper, themeMode, setWallpaper, setThemeMode } = useDesktopSettings();
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Escape 처리 (dialog의 기본 동작 preventDefault 후 onClose 호출)
  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement>): void => {
    e.preventDefault();
    onClose();
  };

  // backdrop 클릭 (dialog 요소 자체 클릭 = backdrop 영역)
  const handleDialogClick = (e: React.MouseEvent<HTMLDialogElement>): void => {
    if (e.target === dialogRef.current) onClose();
  };

  const handleImageUrlApply = (): void => {
    const trimmed = imageUrl.trim();
    if (trimmed === '') return;
    setWallpaper({ kind: 'url', url: trimmed });
  };

  const titleId = `settings-title-${uid}`;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={handleCancel}
      onClick={handleDialogClick}
      className="rounded-xl shadow-xl bg-white dark:bg-neutral-900 p-6 max-w-md w-full backdrop:bg-black/40"
    >
      <div>
        <h2 id={titleId} className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
          데스크탑 설정
        </h2>

        {/* ── 배경화면 섹션 ─────────────────────────────────────────────── */}
        <section className="mt-4">
          <h3 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-2">
            배경화면
          </h3>
          <div className="grid grid-cols-4 gap-2">
            {PRESETS.map((preset) => {
              const isActive = wallpaper.kind === 'preset' && wallpaper.preset === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={(): void => setWallpaper({ kind: 'preset', preset })}
                  title={WALLPAPER_LABELS[preset]}
                  aria-pressed={isActive}
                  className={[
                    'h-12 rounded-md border-2 transition-all',
                    WALLPAPER_CLASSES[preset],
                    isActive
                      ? 'border-blue-500 ring-2 ring-blue-300'
                      : 'border-transparent hover:border-neutral-300 dark:hover:border-neutral-600',
                  ].join(' ')}
                />
              );
            })}
          </div>

          {/* 이미지 URL 입력 */}
          <div className="mt-3 flex gap-2">
            <input
              type="url"
              placeholder="이미지 URL 입력..."
              value={imageUrl}
              onChange={(e): void => setImageUrl(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button
              type="button"
              onClick={handleImageUrlApply}
              disabled={imageUrl.trim() === ''}
              className="px-3 py-1.5 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              적용
            </button>
          </div>
          {wallpaper.kind === 'url' && (
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 truncate">
              현재: {wallpaper.url}
            </p>
          )}
        </section>

        {/* ── 테마 섹션 ─────────────────────────────────────────────────── */}
        <section className="mt-6">
          <h3 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-2">
            테마
          </h3>
          <div className="flex gap-2">
            {THEME_OPTIONS.map((opt) => {
              const isActive = themeMode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={(): void => setThemeMode(opt.value)}
                  aria-pressed={isActive}
                  className={[
                    'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700',
                  ].join(' ')}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── 닫기 ──────────────────────────────────────────────────────── */}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </dialog>
  );
}
