'use client';

import React, { useRef, useState } from 'react';
import { useWindowManager } from './useWindowManager';
import { Window } from './Window';
import { AppFrame } from './AppFrame';
import { DesktopIcon } from './DesktopIcon';
import { Taskbar } from './Taskbar';
import { DESKTOP_APPS } from './desktopApps';
import type { DesktopAppEntry } from './desktopApps';
import type { WindowState } from './types';

// ─── Props ────────────────────────────────────────────────────────────────────

type DesktopProps = {
  /** 표시할 앱 목록. 기본값: DESKTOP_APPS */
  apps?: ReadonlyArray<DesktopAppEntry>;
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
  apps = DESKTOP_APPS,
  className = '',
}: DesktopProps): React.JSX.Element {
  const manager = useWindowManager();
  const desktopAreaRef = useRef<HTMLDivElement>(null);
  const [selectedIconId, setSelectedIconId] = useState<string | null>(null);

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
        {/* ── 데스크탑 아이콘 ─────────────────────────────────────────────────── */}
        {apps.map((entry) => (
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
