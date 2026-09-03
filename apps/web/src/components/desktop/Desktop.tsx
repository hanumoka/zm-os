'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowManager } from './useWindowManager';
import {
  DesktopIconLayer,
  STORE_DEFAULT_POSITION,
  STORE_ICON_ID,
} from './DesktopIconLayer';
import { launchApp } from './launch-app';
import { WindowLayer } from './WindowLayer';
import { Taskbar } from './Taskbar';
import { ContextMenu } from './ContextMenu';
import { SettingsPanel } from './SettingsPanel';
import { AppInfoDialog } from './AppInfoDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { buildCatalog } from './desktopApps';
import type { DesktopAppEntry } from './desktopApps';
import type { ContextMenuItem } from './ContextMenu';
import { useInstalledApps } from '@/components/store/useInstalledApps';
import { useUserApps } from '@/components/store/UserAppsProvider';
import { useDesktopSettings } from './DesktopSettingsProvider';
import { WALLPAPER_CLASSES } from './wallpaper-presets';
import { usePersistence } from '@/lib/storage/use-persistence';
import { NS_DESKTOP_LAYOUT } from '@zm/core';
import type { DesktopIconsRecord } from '@/lib/storage/desktop-icons';
import type { IconPoint } from './icon-grid';
import { loadDesktopIcons, saveDesktopIcons } from '@/lib/storage/desktop-icons';
import { arrangeInGrid, cellKey, placeIcons, resolveDropPosition } from './icon-grid';

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
  const {
    isInstalled,
    uninstall,
    hydrated: installedHydrated,
    hydrationFailed: installedFailed,
  } = useInstalledApps();
  const {
    userApps,
    removeUserApp,
    hydrated: userAppsHydrated,
    hydrationFailed: userAppsFailed,
  } = useUserApps();
  const { wallpaper } = useDesktopSettings();

  // 카탈로그가 실제 데이터를 반영하는 시점. 두 저장소 모두 IDB에서 hydrate되어야
  // "이 앱은 설치되지 않았다"는 판단이 참이 된다.
  //
  // 실패도 제외한다. usePersistence는 로드가 실패해도 hydrated를 true로 만들지만
  // 그때 목록은 비어 있다. 이를 "설치된 앱 없음"으로 읽으면 복원된 윈도우를 전부
  // 닫고, 그 빈 결과가 레이아웃으로 저장돼 사용자 배치가 영구 소실된다.
  const catalogReady =
    installedHydrated && !installedFailed && userAppsHydrated && !userAppsFailed;

  const apps = useMemo(
    () => appsProp ?? buildCatalog(userApps),
    [appsProp, userApps],
  );

  // 화면에 실제로 그려지는 아이콘. 카탈로그에는 있지만 설치되지 않은 앱은
  // 아이콘이 없으므로 배치·점유 계산에서 **카탈로그가 아니라 이 목록**을 쓴다.
  const visibleApps = useMemo(
    () => (catalogReady ? apps.filter((a) => isInstalled(a.id)) : []),
    [catalogReady, apps, isInstalled],
  );

  const desktopAreaRef = useRef<HTMLDivElement>(null);
  const [selectedIconId, setSelectedIconId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [infoApp, setInfoApp] = useState<DesktopAppEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DesktopAppEntry | null>(null);

  // ─── DSK-06: 아이콘 배치 ───────────────────────────────────────────────────
  //
  // 저장된 좌표는 카탈로그의 iconPosition을 덮어쓴다.
  // 드래그 중에는 dragging 상태가 실시간 좌표를 제공하고, 드롭 시점에만 영속화한다.

  const [iconPositions, setIconPositions] = useState<Record<string, IconPoint>>({});
  const [dragging, setDragging] = useState<{ id: string; point: IconPoint } | null>(null);

  const { writable: iconsWritable, persistAsync: persistIcons } = usePersistence<
    DesktopIconsRecord | undefined
  >({
    namespace: NS_DESKTOP_LAYOUT,
    loadFn: loadDesktopIcons,
    onHydrate: (record) => {
      if (record === undefined) return;
      setIconPositions({ ...record.positions });
    },
  });

  // hydration 전이거나 실패했으면 iconPositions가 빈 객체이므로, 저장하면
  // 아직 읽지 못한 다른 아이콘의 좌표까지 통째로 지운다.
  const iconsWritableRef = useRef(iconsWritable);
  iconsWritableRef.current = iconsWritable;

  const commitIconPositions = useCallback(
    (next: Record<string, IconPoint>): void => {
      setIconPositions(next);
      if (!iconsWritableRef.current) return;
      persistIcons('persist', () =>
        saveDesktopIcons({ savedAt: Date.now(), positions: next }),
      );
    },
    [persistIcons],
  );

  const desktopAreaSize = useCallback((): { width: number; height: number } => {
    const rect = desktopAreaRef.current?.getBoundingClientRect();
    return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
  }, []);

  // 이벤트 핸들러에서 최신 좌표를 읽기 위한 ref.
  // setState updater 안에서 저장을 호출하면 updater가 순수하지 않게 되고
  // StrictMode 이중 실행에서 저장이 두 번 나간다.
  const iconPositionsRef = useRef(iconPositions);
  iconPositionsRef.current = iconPositions;

  // 화면에 있는 아이콘의 최종 좌표. 아래 memo에서 계산한 뒤 대입한다.
  // 드롭 시 점유 셀을 이 값에서 읽으므로 렌더가 보는 것과 어긋나지 않는다.
  const effectiveIconPositionsRef = useRef<Record<string, IconPoint>>({});

  const handleIconDragMove = useCallback((id: string, x: number, y: number): void => {
    setDragging({ id, point: { x, y } });
  }, []);

  const handleIconDragCancel = useCallback((): void => {
    setDragging(null);
  }, []);

  // 자기 자신을 제외한 다른 아이콘이 점유한 셀 — 겹쳐 놓아 아래 아이콘이
  // 완전히 가려지는 것을 막는다.
  //
  // ★ 기준은 **화면에 있는 아이콘의 최종 좌표**(effectiveIconPositions)다.
  // 예전에는 카탈로그 전체를 훑어 `iconPositions[id] ?? entry.iconPosition`으로
  // 셀을 모았는데, 그러면 **설치하지도 않아 화면에 없는 built-in 앱이 자기 기본
  // 자리를 영구히 예약**했다. 좌측 열 위 다섯 칸(30,30 / 30,130 / … / 30,430)이
  // 그래서 통째로 막혔고, 스토어 아이콘을 좌상단에 놓으려 하면 한 칸 오른쪽으로
  // 밀려났다. 보이지 않는 아이콘은 가릴 것도 없으므로 점유하지 않는다.
  // 스토어도 같은 맵에 들어 있어 따로 더할 필요가 없다.
  const occupiedCellsExcept = useCallback(
    (excludeId: string): ReadonlySet<string> => {
      const cells = new Set<string>();
      for (const [id, point] of Object.entries(effectiveIconPositionsRef.current)) {
        if (id === excludeId) continue;
        cells.add(cellKey(point));
      }
      return cells;
    },
    [],
  );

  const handleIconDragEnd = useCallback(
    (id: string, x: number, y: number): void => {
      setDragging(null);
      const { width, height } = desktopAreaSize();
      const dropped = resolveDropPosition(
        { x, y },
        width,
        height,
        occupiedCellsExcept(id),
      );
      commitIconPositions({ ...iconPositionsRef.current, [id]: dropped });
    },
    [commitIconPositions, desktopAreaSize, occupiedCellsExcept],
  );

  // 영역 크기가 줄면 저장된 좌표가 영역 밖을 가리킬 수 있다.
  // overflow-hidden에 잘려 보이지도 잡히지도 않으므로 렌더 시점에 다시 가둔다.
  const [areaSize, setAreaSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const node = desktopAreaRef.current;
    if (node === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect === undefined) return;
      setAreaSize({ width: rect.width, height: rect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // 화면에 있는 아이콘의 최종 좌표를 한 번에 정한다. 드래그 중인 아이콘만
  // 실시간 좌표로 덮어쓴다.
  //
  // ★ 저장된 좌표가 없는 아이콘의 기본 자리가 이미 차 있으면 빈 칸으로 밀어낸다.
  // 설치는 id만 저장하고 좌표는 저장하지 않으므로(`installed-apps.ts`), 나중에
  // 설치한 앱은 사용자가 그 자리에 옮겨 둔 아이콘 위에 그대로 겹칠 수 있다.
  // 드롭 경로에만 겹침 회피를 두면 이 경로가 열린 채 남는다.
  const effectiveIconPositions = useMemo<Record<string, IconPoint>>(() => {
    const placed = placeIcons(
      [
        // 스토어가 먼저다. 기본 자리(좌상단)를 앱보다 먼저 잡아야
        // 앱 기본 좌표가 그 아래로 흐른다.
        { id: STORE_ICON_ID, defaultPosition: STORE_DEFAULT_POSITION },
        ...visibleApps.map((a) => ({ id: a.id, defaultPosition: a.iconPosition })),
      ],
      iconPositions,
      areaSize.width,
      areaSize.height,
    );
    if (dragging === null) return placed;
    return { ...placed, [dragging.id]: dragging.point };
  }, [iconPositions, dragging, areaSize, visibleApps]);

  effectiveIconPositionsRef.current = effectiveIconPositions;

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

  const handleAutoArrange = (): void => {
    const { width, height } = desktopAreaSize();
    // 스토어를 빼면 정렬된 앱이 그 자리에 겹칠 수 있다.
    const ids = [...visibleApps.map((a) => a.id), STORE_ICON_ID];
    commitIconPositions(arrangeInGrid(ids, height, width));
  };

  const handleResetIconPositions = (): void => {
    commitIconPositions({});
  };

  const buildContextMenuItems = (): ContextMenuItem[] => {
    if (contextMenu === null || contextMenu.kind === 'desktop') {
      const items: ContextMenuItem[] = [
        {
          id: 'auto-arrange',
          label: '아이콘 자동 정렬',
          icon: '🧹',
          onClick: handleAutoArrange,
        },
      ];
      if (Object.keys(iconPositions).length > 0) {
        items.push({
          id: 'reset-icons',
          label: '아이콘 위치 초기화',
          icon: '↩️',
          onClick: handleResetIconPositions,
        });
      }
      items.push({
        id: 'settings',
        label: '데스크탑 설정',
        icon: '⚙️',
        onClick: (): void => setSettingsOpen(true),
      });
      return items;
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
  //
  // catalogReady 가드가 없으면 DSK-04 레이아웃 복원이 깨진다.
  // 윈도우 레이아웃과 설치 목록은 서로 다른 IDB 로드라 완료 순서가 보장되지 않는다.
  // 레이아웃이 먼저 도착하면 isInstalled()가 아직 빈 집합을 보고 false를 반환해,
  // 복원되자마자 모든 윈도우가 닫힌다.
  useEffect(() => {
    if (!catalogReady) return;
    const appIds = new Set(apps.map((a) => a.id));
    for (const win of manager.windows) {
      if (!appIds.has(win.contentId) || !isInstalled(win.contentId)) {
        manager.close(win.id);
      }
    }
  }, [catalogReady, apps, manager, isInstalled]);

  // 시작 메뉴와 같은 동작이어야 하므로 로직은 launch-app.ts 한 곳에 둔다.
  const handleLaunch = (entry: DesktopAppEntry): void => {
    launchApp(manager, entry);
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
          iconPositions={effectiveIconPositions}
          draggingIconId={dragging?.id ?? null}
          onIconDragMove={handleIconDragMove}
          onIconDragEnd={handleIconDragEnd}
          onIconDragCancel={handleIconDragCancel}
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
