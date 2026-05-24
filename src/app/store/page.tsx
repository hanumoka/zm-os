'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { DESKTOP_APPS } from '@/components/desktop/desktopApps';
import type { DesktopAppCategory, DesktopAppEntry } from '@/components/desktop/desktopApps';
import { useInstalledApps } from '@/components/store/useInstalledApps';
import { AppCard } from '@/components/store/AppCard';
import { AppDetail } from '@/components/store/AppDetail';

// ─── 카테고리 필터 타입 ───────────────────────────────────────────────────────

type CategoryFilter = DesktopAppCategory | 'all';

const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  all: '전체',
  game: '게임',
  utility: '유틸리티',
  demo: '데모',
};

const CATEGORY_FILTERS: ReadonlyArray<CategoryFilter> = [
  'all',
  'game',
  'utility',
  'demo',
];

// ─── StorePage ────────────────────────────────────────────────────────────────

/**
 * 스토어 페이지 — /store 라우트 (P5=r1: 단일 라우트 + 사이드 패널).
 *
 * 레이아웃:
 *   - 헤더: "zm-os 앱 스토어" + "← 데스크탑으로" 링크
 *   - 카테고리 필터 버튼 그룹
 *   - 본문: 좌측 카드 목록 + 우측 상세 패널
 *
 * 설치 상태: useInstalledApps() (InstalledAppsProvider 하위 — layout.tsx 옵션A)
 */
export default function StorePage(): React.JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  const { isInstalled, install, uninstall } = useInstalledApps();

  // 카테고리 필터링
  const filteredApps: ReadonlyArray<DesktopAppEntry> =
    categoryFilter === 'all'
      ? DESKTOP_APPS
      : DESKTOP_APPS.filter((app) => app.category === categoryFilter);

  // 선택된 앱 항목
  const selectedEntry: DesktopAppEntry | undefined =
    selectedId !== null
      ? DESKTOP_APPS.find((app) => app.id === selectedId)
      : undefined;

  const handleSelect = (id: string): void => {
    setSelectedId((prev) => (prev === id ? null : id));
  };

  const handleInstall = (id: string): void => {
    install(id);
  };

  const handleUninstall = (id: string): void => {
    uninstall(id);
  };

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-neutral-50">
      {/* ── 헤더 ──────────────────────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-neutral-200 bg-white px-4 py-3 flex items-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800 transition-colors rounded px-2 py-1 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
          aria-label="데스크탑으로 돌아가기"
        >
          <span aria-hidden="true">←</span>
          <span>데스크탑으로</span>
        </Link>
        <div className="w-px h-4 bg-neutral-200" aria-hidden="true" />
        <h1 className="text-base font-semibold text-neutral-900">
          zm-os 앱 스토어
        </h1>
        <div className="ml-auto text-xs text-neutral-400">
          {DESKTOP_APPS.length}개 앱
        </div>
      </header>

      {/* ── 카테고리 필터 ─────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-neutral-200 bg-white px-4 py-2 flex items-center gap-1">
        {CATEGORY_FILTERS.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={(): void => setCategoryFilter(cat)}
            aria-pressed={categoryFilter === cat}
            className={[
              'px-3',
              'py-1.5',
              'rounded-md',
              'text-sm',
              'font-medium',
              'transition-colors',
              'focus-visible:outline',
              'focus-visible:outline-2',
              'focus-visible:outline-blue-400',
              categoryFilter === cat
                ? 'bg-blue-600 text-white'
                : 'text-neutral-600 hover:bg-neutral-100',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* ── 본문 ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* 좌측: 카드 목록 */}
        <div className="w-80 shrink-0 border-r border-neutral-200 overflow-y-auto p-3 flex flex-col gap-2">
          {filteredApps.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-neutral-400">
              해당 카테고리에 앱이 없습니다.
            </div>
          ) : (
            filteredApps.map((entry) => (
              <AppCard
                key={entry.id}
                entry={entry}
                installed={isInstalled(entry.id)}
                selected={selectedId === entry.id}
                onSelect={(): void => handleSelect(entry.id)}
              />
            ))
          )}
        </div>

        {/* 우측: 상세 패널 */}
        <div className="flex-1 overflow-hidden bg-white">
          {selectedEntry !== undefined ? (
            <AppDetail
              entry={selectedEntry}
              installed={isInstalled(selectedEntry.id)}
              onInstall={(): void => handleInstall(selectedEntry.id)}
              onUninstall={(): void => handleUninstall(selectedEntry.id)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-neutral-400">
              <span className="text-4xl" aria-hidden="true">
                🛒
              </span>
              <p className="text-sm">앱을 선택하면 상세 정보가 표시됩니다.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
