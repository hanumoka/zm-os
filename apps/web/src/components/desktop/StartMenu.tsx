'use client';

import React, { useEffect, useRef } from 'react';
import type { AppIcon, DesktopAppEntry } from './desktopApps';

// ─── Props ────────────────────────────────────────────────────────────────────

type StartMenuProps = {
  /** 설치된 앱. 카탈로그 전체가 아니라 데스크탑에 보이는 것과 같은 목록이어야 한다. */
  apps: ReadonlyArray<DesktopAppEntry>;
  onLaunchApp: (entry: DesktopAppEntry) => void;
  onOpenStore: () => void;
  onOpenSettings: () => void;
  onClose: () => void;
};

// ─── 아이콘 ───────────────────────────────────────────────────────────────────

function Icon({ icon }: { icon: AppIcon }): React.JSX.Element {
  if (icon.kind === 'emoji') {
    return (
      <span className="text-lg shrink-0 w-6 text-center" aria-hidden="true">
        {icon.char}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={icon.src} alt="" aria-hidden="true" className="w-6 h-6 object-contain shrink-0" />
  );
}

// ─── StartMenu ────────────────────────────────────────────────────────────────

/**
 * StartMenu — 작업표시줄 시작 버튼이 여는 메뉴.
 *
 * 설치된 앱을 한곳에서 실행하고 스토어·설정으로 갈 수 있다. 데스크탑 아이콘이
 * 가려지거나 흩어져 있어도 앱에 도달할 경로를 하나 보장하는 것이 목적이다.
 *
 * 닫기: 외부 클릭(mousedown) / Escape / 항목 실행. ContextMenu와 같은 규칙이다.
 *
 * ContextMenu를 재사용하지 않은 이유는 두 가지다 — 그쪽은 좌표를 받아 아래로
 * 펼치므로 작업표시줄에서 열면 화면 밖으로 나가고, 아이콘을 `string`으로만 받아
 * `{ kind: 'url' }` 이미지 아이콘을 표현하지 못한다.
 */
export function StartMenu({
  apps,
  onLaunchApp,
  onOpenStore,
  onOpenSettings,
  onClose,
}: StartMenuProps): React.JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null);

  // 외부 클릭으로 닫기.
  // 시작 버튼 자체의 클릭은 버튼 쪽 토글이 처리하므로 여기서 걸러야 이중 처리가
  // 되지 않는다 — data 속성으로 식별한다.
  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      const target = e.target as Node | null;
      if (target === null) return;
      if (menuRef.current?.contains(target) === true) return;
      if (target instanceof Element && target.closest('[data-start-button]') !== null) return;
      onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // 열리자마자 첫 항목으로 포커스를 옮겨 키보드만으로 쓸 수 있게 한다.
  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, []);

  const itemClass = [
    'w-full text-left px-3 py-2 text-sm rounded',
    'flex items-center gap-2.5',
    'text-neutral-700 dark:text-neutral-200',
    'hover:bg-neutral-100 dark:hover:bg-neutral-700',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400',
    'transition-colors',
  ].join(' ');

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="시작 메뉴"
      // 작업표시줄(h-12) 바로 위에서 위로 펼친다.
      className="absolute bottom-14 left-2 z-[9999] w-64 max-h-[70vh] overflow-y-auto rounded-lg shadow-2xl border border-neutral-200 bg-white dark:bg-neutral-800 dark:border-neutral-700 p-1.5"
    >
      <p className="px-3 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
        설치된 앱
      </p>

      {apps.length === 0 ? (
        <p className="px-3 py-2 text-sm text-neutral-500 dark:text-neutral-400">
          설치된 앱이 없습니다. 스토어에서 추가하세요.
        </p>
      ) : (
        apps.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={(): void => {
              onLaunchApp(entry);
              onClose();
            }}
          >
            <Icon icon={entry.icon} />
            <span className="truncate">{entry.name}</span>
          </button>
        ))
      )}

      <div className="my-1.5 h-px bg-neutral-200 dark:bg-neutral-700" />

      <button
        type="button"
        role="menuitem"
        className={itemClass}
        onClick={(): void => {
          onOpenStore();
          onClose();
        }}
      >
        <Icon icon={{ kind: 'emoji', char: '🛒' }} />
        <span>스토어</span>
      </button>

      <button
        type="button"
        role="menuitem"
        className={itemClass}
        onClick={(): void => {
          onOpenSettings();
          onClose();
        }}
      >
        <Icon icon={{ kind: 'emoji', char: '⚙️' }} />
        <span>설정</span>
      </button>
    </div>
  );
}
