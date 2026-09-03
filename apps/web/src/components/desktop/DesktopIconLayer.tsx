'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { DesktopIcon } from './DesktopIcon';
import { ICON_GRID } from './icon-grid';
import type { IconPoint } from './icon-grid';
import type { DesktopAppEntry } from './desktopApps';

type DesktopIconLayerProps = {
  apps: ReadonlyArray<DesktopAppEntry>;
  selectedIconId: string | null;
  showStoreIcon: boolean;
  onSelectIcon: (id: string | null) => void;
  onLaunchApp: (entry: DesktopAppEntry) => void;
  onContextMenuIcon?: (entry: DesktopAppEntry, x: number, y: number) => void;
  /** 사용자가 옮긴 아이콘 좌표. 없는 id는 카탈로그의 iconPosition으로 폴백한다. */
  iconPositions?: Readonly<Record<string, { x: number; y: number }>>;
  /** 드래그 중인 아이콘 id */
  draggingIconId?: string | null;
  onIconDragMove?: (id: string, x: number, y: number) => void;
  onIconDragEnd?: (id: string, x: number, y: number) => void;
  /** 이동 없이 세션이 끝났을 때 — 드래그 표시 해제용 */
  onIconDragCancel?: (id: string) => void;
};

/**
 * 스토어 시스템 아이콘의 id.
 *
 * 일반 앱과 같은 좌표·영속화 경로를 쓰므로 `Desktop.tsx`도 이 id를 알아야 한다
 * (충돌 회피 셀 계산, 자동 정렬 대상).
 */
export const STORE_ICON_ID = '__system_store__';

/**
 * 스토어 아이콘의 기본 자리 — 격자의 첫 칸(좌상단).
 *
 * 앱 아이콘보다 **먼저** 자리를 잡는다. 좌측 열 첫 칸을 스토어가 쓰므로
 * `desktopApps.ts`의 built-in 기본 좌표는 그 아래(y=130)에서 시작한다.
 * 사용자가 한 번 옮기면 저장된 좌표가 이 값을 덮는다.
 */
export const STORE_DEFAULT_POSITION: IconPoint = {
  x: ICON_GRID.originX,
  y: ICON_GRID.originY,
};

export function DesktopIconLayer({
  apps,
  selectedIconId,
  showStoreIcon,
  onSelectIcon,
  onLaunchApp,
  onContextMenuIcon,
  iconPositions,
  draggingIconId = null,
  onIconDragMove,
  onIconDragEnd,
  onIconDragCancel,
}: DesktopIconLayerProps): React.JSX.Element {
  const router = useRouter();

  return (
    <>
      {apps.map((entry) => (
        <DesktopIcon
          key={entry.id}
          id={entry.id}
          label={entry.name}
          icon={entry.icon}
          position={iconPositions?.[entry.id] ?? entry.iconPosition}
          selected={selectedIconId === entry.id}
          dragging={draggingIconId === entry.id}
          onLaunch={(): void => onLaunchApp(entry)}
          onSelect={(): void => onSelectIcon(entry.id)}
          onDragMove={onIconDragMove}
          onDragEnd={onIconDragEnd}
          onDragCancel={onIconDragCancel}
          onContextMenu={(e): void => {
            if (onContextMenuIcon === undefined) return;
            e.preventDefault();
            e.stopPropagation();
            onContextMenuIcon(entry, e.clientX, e.clientY);
          }}
        />
      ))}

      {/*
       * 좌표 컨벤션
       * - 스토어 시스템 아이콘 = 격자 첫 칸(좌상단). `STORE_DEFAULT_POSITION`
       * - 앱 아이콘 = 그 아래 좌측 column ({ x: 30, y: 130, 230, ... })
       *
       * 예전에는 스토어를 우상단에 붙였다(code-reviewer C-01 fix, 2026-05-24).
       * 좌측 column과 겹치지 않도록 자리를 떼어 놓으려는 것이었는데, 겹침은 이제
       * `placeIcons`가 좌표로 해결하므로 영역을 나눠 가질 이유가 없어졌다.
       *
       * 스토어도 다른 아이콘과 동일하게 끌 수 있다. 예전에는 <Link>로 감싸 고정
       * 배치했는데, 그러면 두 가지가 막혔다 — position이 없어 드래그가 비활성이었고,
       * 설령 켜도 <Link>가 positioned 조상이 되어 드래그 좌표가 어긋났다.
       *
       * 실행 방식은 기존과 같다 — **단일 클릭으로 스토어가 열린다.**
       * <Link>를 걷어낸 것은 앵커의 네이티브 이동이 드래그 종료와 충돌하기
       * 때문이지 단일 클릭 자체가 문제여서가 아니다. 클릭 핸들러 방식은
       * isDragEcho()가 드래그 직후 클릭을 막아 주므로 드래그와 공존한다.
       */}
      {showStoreIcon && (
        <DesktopIcon
          id={STORE_ICON_ID}
          label="스토어"
          icon={{ kind: 'emoji', char: '🛒' }}
          position={iconPositions?.[STORE_ICON_ID] ?? STORE_DEFAULT_POSITION}
          openOnSingleClick
          selected={selectedIconId === STORE_ICON_ID}
          dragging={draggingIconId === STORE_ICON_ID}
          onLaunch={(): void => {
            router.push('/store');
          }}
          onSelect={(): void => onSelectIcon(STORE_ICON_ID)}
          onDragMove={onIconDragMove}
          onDragEnd={onIconDragEnd}
          onDragCancel={onIconDragCancel}
        />
      )}
    </>
  );
}
