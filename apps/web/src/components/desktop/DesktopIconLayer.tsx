'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { DesktopIcon } from './DesktopIcon';
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
       * 좌표 컨벤션 (code-reviewer C-01 fix, 2026-05-24):
       * - 데스크탑 좌측 column 좌표 = { x: 30, y: 30, 130, 230, ... } (앱 아이콘용)
       * - 스토어 시스템 아이콘 = 저장된 좌표가 없으면 우상단(anchor)
       *   → 일반 앱 아이콘과 시각적/공간적 분리
       *   → 좌측 column 아이콘이 N개여도 충돌 없음
       * desktopApps.ts 의 iconPosition 은 `x ≤ 30, y < 1000` 좌측 column 만 사용 권장.
       *
       * 스토어도 다른 아이콘과 동일하게 끌 수 있다. 예전에는 <Link>로 감싸 고정
       * 배치했는데, 그러면 두 가지가 막혔다 — position이 없어 드래그가 비활성이었고,
       * 설령 켜도 <Link>가 positioned 조상이 되어 드래그 좌표가 어긋났다.
       * 지금은 아이콘 자신이 anchor로 배치되고, 한 번 끌면 좌표가 저장돼
       * 그때부터는 일반 앱 아이콘과 완전히 같은 경로를 탄다.
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
          position={iconPositions?.[STORE_ICON_ID]}
          anchor="top-right"
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
