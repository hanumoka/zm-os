'use client';

import React from 'react';
import { Window } from './Window';
import { AppFrame } from './AppFrame';
import type { DesktopAppEntry } from './desktopApps';
import type { WindowManager } from './types';

type WindowLayerProps = {
  windows: WindowManager['windows'];
  apps: ReadonlyArray<DesktopAppEntry>;
  manager: WindowManager;
};

export function WindowLayer({ windows, apps, manager }: WindowLayerProps): React.JSX.Element {
  return (
    <>
      {windows.map((win) => {
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
              onResize: (width: number, height: number, x: number, y: number): void => {
                manager.setSize(win.id, width, height);
                manager.setPosition(win.id, x, y);
              },
            }}
            ariaLabel={`${win.title} 윈도우`}
          >
            {entry !== undefined ? (
              <AppFrame key={win.id} entry={entry} />
            ) : (
              <div className="flex items-center justify-center w-full h-full text-sm text-neutral-500">
                알 수 없는 앱: {win.contentId}
              </div>
            )}
          </Window>
        );
      })}
    </>
  );
}
