'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useWindowManager } from './useWindowManager';
import { DesktopIconLayer } from './DesktopIconLayer';
import { WindowLayer } from './WindowLayer';
import { Taskbar } from './Taskbar';
import { ContextMenu } from './ContextMenu';
import { SettingsPanel } from './SettingsPanel';
import { AppInfoDialog } from './AppInfoDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { buildCatalog } from './desktopApps';
import type { DesktopAppEntry } from './desktopApps';
import type { ContextMenuItem } from './ContextMenu';
import type { WindowState } from './types';
import { useInstalledApps } from '@/components/store/useInstalledApps';
import { useUserApps } from '@/components/store/UserAppsProvider';
import { useDesktopSettings } from './DesktopSettingsProvider';
import { WALLPAPER_CLASSES } from '@/lib/storage/desktop-settings';

type DesktopProps = {
  apps?: ReadonlyArray<DesktopAppEntry>;
  showStoreIcon?: boolean;
  className?: string;
};

type ContextMenuState =
  | { kind: 'desktop'; x: number; y: number }
  | { kind: 'icon'; x: number; y: number; entry: DesktopAppEntry };

export function Desktop({
  apps: appsProp,
  showStoreIcon = true,
  className = '',
}: DesktopProps): React.JSX.Element {
  const manager = useWindowManager();
  const { isInstalled, uninstall } = useInstalledApps();
  const { userApps, removeUserApp } = useUserApps();
  const { wallpaper } = useDesktopSettings();

  const apps = useMemo(
    () => appsProp ?? buildCatalog(userApps),
    [appsProp, userApps],
  );
  const desktopAreaRef = useRef<HTMLDivElement>(null);
  const [selectedIconId, setSelectedIconId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [infoApp, setInfoApp] = useState<DesktopAppEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DesktopAppEntry | null>(null);

  const bgClass = wallpaper.kind === 'preset' ? WALLPAPER_CLASSES[wallpaper.preset] : '';
  const bgStyle: React.CSSProperties | undefined = wallpaper.kind === 'url'
    ? { backgroundImage: `url(${wallpaper.url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : undefined;

  const handleDesktopContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault();
    setContextMenu({ kind: 'desktop', x: e.clientX, y: e.clientY });
  };

  const handleIconContextMenu = (entry: DesktopAppEntry, x: number, y: number): void => {
    setContextMenu({ kind: 'icon', x, y, entry });
  };

  const buildContextMenuItems = (): ContextMenuItem[] => {
    if (contextMenu === null || contextMenu.kind === 'desktop') {
      return [
        {
          id: 'settings',
          label: '데스크탑 설정',
          icon: '⚙️',
          onClick: (): void => setSettingsOpen(true),
        },
      ];
    }

    const { entry } = contextMenu;
    const items: ContextMenuItem[] = [
      {
        id: 'info',
        label: '앱 정보',
        icon: 'ℹ️',
        onClick: (): void => setInfoApp(entry),
      },
    ];

    if (entry.source === 'user') {
      items.push({
        id: 'delete',
        label: '앱 삭제',
        icon: '🗑️',
        onClick: (): void => setDeleteTarget(entry),
      });
    }

    return items;
  };

  const handleConfirmDelete = (): void => {
    if (deleteTarget === null) return;
    const id = deleteTarget.id;
    uninstall(id);
    void removeUserApp(id);
    setDeleteTarget(null);
  };

  // APP-04: 삭제된 앱의 실행 중 윈도우 자동 닫기
  useEffect(() => {
    const appIds = new Set(apps.map((a) => a.id));
    for (const win of manager.windows) {
      if (!appIds.has(win.contentId) || !isInstalled(win.contentId)) {
        manager.close(win.id);
      }
    }
  }, [apps, manager, isInstalled]);

  const visibleApps = apps.filter((a) => isInstalled(a.id));

  const handleLaunch = (entry: DesktopAppEntry): void => {
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
      className={['flex', 'flex-col', 'w-full', 'h-full', className].filter(Boolean).join(' ')}
    >
      <div
        ref={desktopAreaRef}
        className={`flex-1 relative overflow-hidden ${bgClass}`}
        style={bgStyle}
        onClick={(): void => setSelectedIconId(null)}
        onContextMenu={handleDesktopContextMenu}
      >
        <DesktopIconLayer
          apps={visibleApps}
          selectedIconId={selectedIconId}
          showStoreIcon={showStoreIcon}
          onSelectIcon={setSelectedIconId}
          onLaunchApp={handleLaunch}
          onContextMenuIcon={handleIconContextMenu}
        />

        <WindowLayer windows={manager.windows} apps={apps} manager={manager} />
      </div>

      {contextMenu !== null && (
        <ContextMenu
          items={buildContextMenuItems()}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={(): void => setContextMenu(null)}
        />
      )}

      <AppInfoDialog
        open={infoApp !== null}
        app={infoApp}
        onClose={(): void => setInfoApp(null)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="앱 삭제"
        description={
          deleteTarget !== null
            ? `'${deleteTarget.name}' 앱을 영구 삭제하시겠습니까? 저장된 데이터가 모두 제거됩니다.`
            : ''
        }
        confirmLabel="삭제"
        cancelLabel="취소"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={(): void => setDeleteTarget(null)}
      />

      <SettingsPanel open={settingsOpen} onClose={(): void => setSettingsOpen(false)} />

      <div className="h-12 shrink-0">
        <Taskbar />
      </div>
    </div>
  );
}
