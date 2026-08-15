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
        // 저장된 레이아웃에는 제목이 없다(contentId만 기록). 복원된 윈도우의
        // 제목은 카탈로그에서 해석한다.
        const title = win.title !== '' ? win.title : (entry?.name ?? win.contentId);

        return (
          <Window
            key={win.id}
            id={win.id}
            title={title}
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
            ariaLabel={`${title} 윈도우`}
          >
            {entry !== undefined ? (
              <AppFrame
                key={win.id}
                entry={entry}
                // 호스트 API의 대상 창을 여기서 고정한다. 앱이 창 ID를 인자로 넘기게 하면
                // 남의 창을 지목할 수 있다.
                host={{
                  setTitle: (text: string): void => {
                    manager.setTitle(win.id, text);
                  },
                  close: (): void => {
                    manager.close(win.id);
                  },
                }}
              />
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
