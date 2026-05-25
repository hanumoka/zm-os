'use client';

import React, { useEffect, useRef } from 'react';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export type ContextMenuItem = {
  id: string;
  label: string;
  icon?: string;
  onClick: () => void;
  disabled?: boolean;
};

type ContextMenuProps = {
  items: ReadonlyArray<ContextMenuItem>;
  /** 화면 좌표 (clientX, clientY) — 동적 값이므로 인라인 style 예외 허용 */
  position: { x: number; y: number };
  onClose: () => void;
};

// ─── ContextMenu ──────────────────────────────────────────────────────────────

/**
 * ContextMenu — 우클릭 컨텍스트 메뉴.
 *
 * 닫기 조건:
 *   - 외부 영역 클릭 (mousedown)
 *   - Escape 키
 *
 * 참고: position은 동적 픽셀 좌표이므로 인라인 style 사용 (Tailwind arbitrary 불가)
 */
export function ContextMenu({ items, position, onClose }: ContextMenuProps): React.JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 닫기
  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (menuRef.current !== null && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Escape 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-[9999] min-w-[160px] rounded-lg shadow-xl border border-neutral-200 bg-white dark:bg-neutral-800 dark:border-neutral-700 py-1"
      style={{ left: position.x, top: position.y }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={(): void => {
            item.onClick();
            onClose();
          }}
          className={[
            'w-full text-left px-3 py-1.5 text-sm',
            'flex items-center gap-2',
            'transition-colors',
            item.disabled === true
              ? 'text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
              : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700',
          ].join(' ')}
        >
          {item.icon !== undefined && <span aria-hidden="true">{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </div>
  );
}
