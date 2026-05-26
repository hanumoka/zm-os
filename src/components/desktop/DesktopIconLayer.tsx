'use client';

import React from 'react';
import Link from 'next/link';
import { DesktopIcon } from './DesktopIcon';
import type { DesktopAppEntry } from './desktopApps';

type DesktopIconLayerProps = {
  apps: ReadonlyArray<DesktopAppEntry>;
  selectedIconId: string | null;
  showStoreIcon: boolean;
  onSelectIcon: (id: string | null) => void;
  onLaunchApp: (entry: DesktopAppEntry) => void;
  onContextMenuIcon?: (entry: DesktopAppEntry, x: number, y: number) => void;
};

const STORE_ICON_ID = '__system_store__';

export function DesktopIconLayer({
  apps,
  selectedIconId,
  showStoreIcon,
  onSelectIcon,
  onLaunchApp,
  onContextMenuIcon,
}: DesktopIconLayerProps): React.JSX.Element {
  return (
    <>
      {apps.map((entry) => (
        <DesktopIcon
          key={entry.id}
          id={entry.id}
          label={entry.name}
          icon={entry.icon}
          position={entry.iconPosition}
          selected={selectedIconId === entry.id}
          onLaunch={(): void => onLaunchApp(entry)}
          onSelect={(): void => onSelectIcon(entry.id)}
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
            e.stopPropagation();
          }}
          className="absolute right-[30px] top-[30px] block"
        >
          <DesktopIcon
            id={STORE_ICON_ID}
            label="스토어"
            icon={{ kind: 'emoji', char: '🛒' }}
            position={undefined}
            selected={selectedIconId === STORE_ICON_ID}
            onLaunch={(): void => {
              // Link의 href가 네비게이션 처리 — 추가 동작 불필요.
            }}
            onSelect={(): void => onSelectIcon(STORE_ICON_ID)}
          />
        </Link>
      )}
    </>
  );
}
