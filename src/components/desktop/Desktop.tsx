'use client';

import React, { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useWindowManager } from './useWindowManager';
import { Window } from './Window';
import { AppFrame } from './AppFrame';
import { DesktopIcon } from './DesktopIcon';
import { Taskbar } from './Taskbar';
import { buildCatalog } from './desktopApps';
import type { DesktopAppEntry } from './desktopApps';
import type { WindowState } from './types';
import { useInstalledApps } from '@/components/store/useInstalledApps';
import { useUserApps } from '@/components/store/UserAppsProvider';

// ─── Props ────────────────────────────────────────────────────────────────────

type DesktopProps = {
  /**
   * 표시할 앱 목록.
   * APP-02: undefined 시 buildCatalog(userApps) 자동 사용 (built-in + 사용자 앱 통합).
   * 명시 전달 시 그대로 사용 (테스트 / Storybook 용도).
   */
  apps?: ReadonlyArray<DesktopAppEntry>;
  /** "스토어" 시스템 아이콘 표시 여부. 기본값: true (P3=i+iii) */
  showStoreIcon?: boolean;
  className?: string;
};

// ─── Desktop ──────────────────────────────────────────────────────────────────

/**
 * Desktop — 가상 데스크탑 메인 컴포넌트.
 *
 * 레이아웃:
 *   - 루트: flex column (전체 화면)
 *     - 데스크탑 영역 (flex-1 relative) ← Window bounds 대상
 *     - Taskbar (h-12)
 *
 * 윈도우 표시 규칙:
 *   - state === 'minimized': Window에 state='minimized' 전달 → display:none (DOM 유지)
 *   - state === 'open' | 'maximized': 정상 표시
 *
 * bounds: Window 컴포넌트에 bounds='parent' 전달.
 * (Window → react-rnd bounds prop으로 전달되어 데스크탑 영역 내 이동 제한)
 */
export function Desktop({
  apps: appsProp,
  showStoreIcon = true,
  className = '',
}: DesktopProps): React.JSX.Element {
  const manager = useWindowManager();
  const { isInstalled } = useInstalledApps();
  const { userApps } = useUserApps();

  // APP-02: appsProp 미전달 시 buildCatalog(userApps) 사용 (P6)
  const apps = useMemo(
    () => appsProp ?? buildCatalog(userApps),
    [appsProp, userApps],
  );
  const desktopAreaRef = useRef<HTMLDivElement>(null);
  const [selectedIconId, setSelectedIconId] = useState<string | null>(null);

  // P3=i: 설치된 앱만 아이콘 표시
  const visibleApps = apps.filter((a) => isInstalled(a.id));

  // ── onLaunch 핸들러 ────────────────────────────────────────────────────────
  const handleLaunch = (entry: DesktopAppEntry): void => {
    // 이미 열려 있는 윈도우가 있으면 focus/restore
    const existing: WindowState | undefined = manager.windows.find(
      (w) => w.id === entry.id,
    );
    if (existing !== undefined) {
      if (existing.state === 'minimized') {
        manager.restore(entry.id);
      }
      manager.focus(entry.id);
      return;
    }

    manager.open({
      id: entry.id,
      title: entry.name,
      contentId: entry.id,
      initialPosition: entry.windowDefaults?.position,
      initialSize: entry.windowDefaults?.size,
    });
  };

  return (
    <div
      className={[
        'flex',
        'flex-col',
        'w-full',
        'h-full',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* ── 데스크탑 영역 ─────────────────────────────────────────────────────── */}
      <div
        ref={desktopAreaRef}
        className="flex-1 relative overflow-hidden bg-gradient-to-br from-sky-100 to-indigo-200"
        onClick={(): void => {
          // 빈 영역 클릭 시 선택 해제
          setSelectedIconId(null);
        }}
      >
        {/* ── 데스크탑 아이콘 (설치된 앱만 — P3=i) ──────────────────────────── */}
        {visibleApps.map((entry) => (
          <DesktopIcon
            key={entry.id}
            id={entry.id}
            label={entry.name}
            icon={entry.icon}
            position={entry.iconPosition}
            selected={selectedIconId === entry.id}
            onLaunch={(): void => handleLaunch(entry)}
            onSelect={(): void => setSelectedIconId(entry.id)}
          />
        ))}

        {/* ── "스토어" 시스템 아이콘 (P3=iii) ─────────────────────────────── */}
        {/*
         * 좌표 컨벤션 (code-reviewer C-01 fix, 2026-05-24):
         * - 데스크탑 좌측 column 좌표 = { x: 30, y: 30, 130, 230, ... } (앱 아이콘용)
         * - 스토어 시스템 아이콘 = 데스크탑 우상단 고정 (right:30, top:30)
         *   → 일반 앱 아이콘과 시각적/공간적 분리
         *   → 좌측 column 아이콘이 N개여도 충돌 없음
         * desktopApps.ts 의 iconPosition 은 `x ≤ 30, y < 1000` 좌측 column 만 사용 권장.
         */}
        {showStoreIcon && (
          <Link
            href="/store"
            aria-label="앱 스토어 열기"
            onClick={(e): void => {
              // 이벤트 버블링으로 인한 데스크탑 선택 해제 방지
              e.stopPropagation();
            }}
            className="absolute right-[30px] top-[30px] block"
          >
            <DesktopIcon
              id="__system_store__"
              label="스토어"
              icon={{ kind: 'emoji', char: '🛒' }}
              position={undefined}
              selected={selectedIconId === '__system_store__'}
              onLaunch={(): void => {
                // Link의 href가 네비게이션 처리 — 추가 동작 불필요.
                // 일반 앱 아이콘은 single-click=select / double-click=launch 이나
                // 스토어 시스템 아이콘은 Link 래핑으로 모든 클릭이 navigate 됨 (의도된 UX).
              }}
              onSelect={(): void => setSelectedIconId('__system_store__')}
            />
          </Link>
        )}

        {/* ── 윈도우 목록 ────────────────────────────────────────────────────── */}
        {manager.windows.map((win) => {
          const entry = apps.find((a) => a.id === win.contentId);

          return (
            <Window
              key={win.id}
              id={win.id}
              title={win.title}
              position={win.position}
              size={win.size}
              state={win.state}
              zIndex={win.zIndex}
              bounds="parent"
              controls={{
                onClose: (): void => manager.close(win.id),
                onMinimize: (): void => manager.minimize(win.id),
                onMaximize: (): void => manager.maximize(win.id),
                onRestore: (): void => manager.restore(win.id),
                onFocus: (): void => manager.focus(win.id),
              }}
              geometry={{
                onMove: (x: number, y: number): void =>
                  manager.setPosition(win.id, x, y),
                onResize: (
                  width: number,
                  height: number,
                  x: number,
                  y: number,
                ): void => {
                  manager.setSize(win.id, width, height);
                  manager.setPosition(win.id, x, y);
                },
              }}
              ariaLabel={`${win.title} 윈도우`}
            >
              {entry !== undefined ? (
                // key={win.id}로 entry 변경 시 AppFrame 재마운트
                <AppFrame key={win.id} entry={entry} />
              ) : (
                <div className="flex items-center justify-center w-full h-full text-sm text-neutral-500">
                  알 수 없는 앱: {win.contentId}
                </div>
              )}
            </Window>
          );
        })}
      </div>

      {/* ── 작업표시줄 ────────────────────────────────────────────────────────── */}
      <div className="h-12 shrink-0">
        <Taskbar />
      </div>
    </div>
  );
}
