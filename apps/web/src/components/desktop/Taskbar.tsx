'use client';

import React, { useMemo, useState } from 'react';
import { useWindowManager } from './useWindowManager';
import { TaskbarButton } from './TaskbarButton';
import { Clock } from './Clock';
import { SettingsPanel } from './SettingsPanel';
import { QuotaBadge } from './QuotaBadge';
import { useUserApps } from '@/components/store/UserAppsProvider';
import { buildCatalog } from './desktopApps';
import { findDesktopApp } from './desktopApps';
import { useQuotaMonitor } from '@/lib/storage/use-quota-monitor';
import type { AppIcon } from './desktopApps';
import type { WindowState } from './types';

// ─── 기본 아이콘 ───────────────────────────────────────────────────────────────

const FALLBACK_ICON: AppIcon = { kind: 'emoji', char: '🗔' };

// ─── Taskbar ──────────────────────────────────────────────────────────────────

/**
 * Taskbar — 작업표시줄 컴포넌트.
 *
 * 레이아웃:
 *   - 좌측: 시작 버튼 (POC placeholder)
 *   - 중앙: 열린 윈도우 TaskbarButton 목록
 *   - 우측: Clock
 *
 * active 윈도우 결정 (가정 A6):
 *   - manager.windows 중 zIndex가 가장 높은 윈도우를 active로 간주.
 *   - minimized 상태는 active 대상에서 제외.
 *
 * TaskbarButton onClick 로직:
 *   - active(최상위 + 비최소화) → minimize
 *   - minimized → restore + focus
 *   - 그 외 → focus
 */
export function Taskbar(): React.JSX.Element {
  const manager = useWindowManager();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { estimate } = useQuotaMonitor({ pollIntervalMs: 60_000 });
  const { userApps } = useUserApps();

  // built-in + 사용자 업로드 앱을 합친 카탈로그. 사용자 앱 창의 라벨·아이콘 해석에 필요하다.
  const catalog = useMemo(() => buildCatalog(userApps), [userApps]);

  // active 윈도우: zIndex 최대값 (minimized 제외)
  const activeWindow: WindowState | undefined = manager.windows
    .filter((w) => w.state !== 'minimized')
    .reduce<WindowState | undefined>((acc, w) => {
      if (acc === undefined || w.zIndex > acc.zIndex) return w;
      return acc;
    }, undefined);

  const handleButtonClick = (win: WindowState): void => {
    if (win.state === 'minimized') {
      manager.restore(win.id);
      manager.focus(win.id);
    } else if (activeWindow?.id === win.id) {
      manager.minimize(win.id);
    } else {
      manager.focus(win.id);
    }
  };

  const handleStartClick = (): void => {
    // POC placeholder: 시작 메뉴 미구현
    // eslint-disable-next-line no-console
    console.log('[zm-os] 시작 버튼 클릭 — 시작 메뉴 미구현 (POC)');
  };

  return (
    <div
      className="flex items-center h-12 px-2 gap-2 bg-black/40 backdrop-blur-sm select-none"
      role="toolbar"
      aria-label="작업표시줄"
    >
      {/* ── 시작 버튼 (POC placeholder) ──────────────────────────────────────── */}
      <button
        type="button"
        onClick={handleStartClick}
        className="flex items-center justify-center w-9 h-9 rounded bg-white/10 hover:bg-white/20 text-white text-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white shrink-0"
        aria-label="시작 메뉴 열기 (미구현)"
        title="시작 (POC)"
      >
        ⊞
      </button>

      {/* ── 구분선 ────────────────────────────────────────────────────────────── */}
      <div className="w-px h-6 bg-white/20 shrink-0" aria-hidden="true" />

      {/* ── 윈도우 버튼 목록 ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 flex-1 overflow-x-auto min-w-0">
        {manager.windows.map((win) => {
          // built-in 전용 findDesktopApp만 쓰면 사용자 업로드 앱이 해석되지 않아
          // 복원된 창의 라벨이 raw contentId로 나온다. 전체 카탈로그를 먼저 본다.
          const entry =
            catalog.find((a) => a.id === win.contentId) ?? findDesktopApp(win.contentId);
          const icon: AppIcon = entry?.icon ?? FALLBACK_ICON;
          const isActive =
            activeWindow?.id === win.id && win.state !== 'minimized';
          // 복원된 윈도우는 저장 레이아웃에 제목이 없어 title이 빈 문자열이다.
          const displayTitle =
            win.title !== '' ? win.title : (entry?.name ?? win.contentId);

          return (
            <TaskbarButton
              key={win.id}
              window={win}
              isActive={isActive}
              icon={icon}
              displayTitle={displayTitle}
              onClick={(): void => handleButtonClick(win)}
            />
          );
        })}
      </div>

      {/* ── 우측: 쿼터 배지 + 설정 버튼 + Clock ───────────────────────────── */}
      <div className="flex items-center gap-1 px-2 shrink-0">
        <QuotaBadge estimate={estimate} />
        <button
          type="button"
          onClick={(): void => setSettingsOpen(true)}
          className="px-2 py-1 text-sm text-white/80 hover:text-white hover:bg-white/10 rounded transition-colors"
          aria-label="데스크탑 설정"
          title="설정"
        >
          ⚙️
        </button>
        <Clock />
      </div>

      {/* ── 설정 패널 ─────────────────────────────────────────────────────────── */}
      <SettingsPanel open={settingsOpen} onClose={(): void => setSettingsOpen(false)} />
    </div>
  );
}
