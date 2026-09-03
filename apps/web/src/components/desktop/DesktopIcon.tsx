'use client';

import React, { useRef } from 'react';
import type { AppIcon } from './desktopApps';
import { DRAG_THRESHOLD } from './icon-grid';

// ─── 상수 ─────────────────────────────────────────────────────────────────────

/** 드래그 종료 후 이 시간 안의 click/dblclick은 무시한다 (드래그가 실행으로 새지 않도록) */
const CLICK_SUPPRESS_MS = 300;

// ─── Props ────────────────────────────────────────────────────────────────────

type DesktopIconProps = {
  id: string;
  label: string;
  icon: AppIcon;
  position?: { x: number; y: number };
  /**
   * 단일 클릭으로도 실행한다. 스토어처럼 '앱 실행'이 아니라 '화면 이동'인
   * 아이콘용이다. 드래그와 충돌하지 않는다 — 드래그 직후 클릭은 isDragEcho()가
   * 막는다.
   */
  openOnSingleClick?: boolean;
  selected?: boolean;
  onLaunch: () => void;
  onSelect?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  /** 드래그 중 실시간 좌표. 지정하면 드래그가 활성화된다. */
  onDragMove?: (id: string, x: number, y: number) => void;
  /** 드래그 종료 좌표. 스냅·클램프는 호출자가 수행한다. */
  onDragEnd?: (id: string, x: number, y: number) => void;
  /** 이동 없이 세션이 끝났을 때. 부모가 드래그 표시 상태를 반드시 해제하도록. */
  onDragCancel?: (id: string) => void;
  /** 드래그 중 여부 — z-index를 올려 다른 아이콘 위에 표시한다. */
  dragging?: boolean;
  className?: string;
};

type DragSession = {
  pointerId: number;
  /** 세션을 시작한 버튼. 마우스는 모든 버튼이 pointerId를 공유하므로 함께 봐야 한다. */
  button: number;
  /** 포인터와 아이콘 좌상단의 간격 — 잡은 지점을 유지하기 위함 */
  grabOffsetX: number;
  grabOffsetY: number;
  moved: boolean;
  lastX: number;
  lastY: number;
};

// ─── DesktopIcon ─────────────────────────────────────────────────────────────

/**
 * DesktopIcon — 데스크탑 아이콘 컴포넌트.
 *
 * - 더블클릭 → onLaunch
 * - 단일클릭 → onSelect (선택 하이라이트)
 * - Enter / Space → onLaunch (a11y)
 * - position 지정 시 absolute, 미지정 시 일반 흐름 (부모가 배치를 결정)
 * - 80×80px 세로 정렬 레이아웃
 */
export function DesktopIcon({
  id,
  label,
  icon,
  position,
  openOnSingleClick = false,
  selected = false,
  onLaunch,
  onSelect,
  onContextMenu,
  onDragMove,
  onDragEnd,
  onDragCancel,
  dragging = false,
  className = '',
}: DesktopIconProps): React.JSX.Element {
  const dragRef = useRef<DragSession | null>(null);
  const dragEndedAtRef = useRef(0);

  const isPositioned = position !== undefined;
  // 저장된 좌표가 없어도 끌 수 있어야 한다. 시작 좌표는 pointerdown 시점에
  // 엘리먼트의 실제 위치에서 읽는다(handlePointerDown 참조).
  const canDrag = onDragMove !== undefined && onDragEnd !== undefined;

  /** 드래그 직후의 잔여 click/dblclick인지 */
  const isDragEcho = (): boolean =>
    Date.now() - dragEndedAtRef.current < CLICK_SUPPRESS_MS;

  const handleClick = (): void => {
    if (isDragEcho()) return;
    onSelect?.();
    if (openOnSingleClick) onLaunch();
  };

  const handleDoubleClick = (): void => {
    if (isDragEcho()) return;
    // 단일 클릭이 이미 실행했다. 여기서 또 부르면 같은 동작이 두 번 난다.
    if (openOnSingleClick) return;
    onLaunch();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onLaunch();
    }
  };

  // ─── 드래그 ────────────────────────────────────────────────────────────────
  //
  // offsetParent = 가장 가까운 positioned 조상 = 데스크탑 영역(relative).
  // 좌표를 그 영역 기준으로 환산해야 position prop과 같은 좌표계가 된다.

  const areaOf = (el: HTMLElement): DOMRect | null => {
    const parent = el.offsetParent;
    return parent instanceof HTMLElement ? parent.getBoundingClientRect() : null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!canDrag) return;
    if (e.button !== 0) return;
    // 진행 중인 세션을 두 번째 포인터(멀티터치)가 덮어쓰면 첫 포인터의 종료가
    // 유실되어 드래그 표시 상태가 영구히 남는다.
    if (dragRef.current !== null) return;
    const area = areaOf(e.currentTarget);
    if (area === null) return;

    // 새 입력이 시작됐으므로 이전 드래그의 클릭 억제는 만료시킨다.
    // 그러지 않으면 첫 클릭이 임계값을 살짝 넘겼을 때 뒤따르는 더블클릭까지 삼켜
    // 앱이 실행되지 않는다.
    dragEndedAtRef.current = 0;

    // 저장된 좌표가 있으면 그것이 시작점이다. 없으면(앵커로만 배치된 아이콘,
    // 예: 스토어) 엘리먼트의 실제 위치를 영역 좌표계로 환산해 쓴다.
    // 그래야 처음 끌 때 아이콘이 원래 자리에서 튀지 않는다.
    const rect = e.currentTarget.getBoundingClientRect();
    const startX = position?.x ?? rect.left - area.left;
    const startY = position?.y ?? rect.top - area.top;

    dragRef.current = {
      pointerId: e.pointerId,
      button: e.button,
      grabOffsetX: e.clientX - area.left - startX,
      grabOffsetY: e.clientY - area.top - startY,
      moved: false,
      lastX: startX,
      lastY: startY,
    };
    // 일부 브라우저는 알 수 없는 pointerId에 NotFoundError를 던진다.
    // 캡처는 편의 기능이므로 실패해도 드래그 자체는 계속되어야 한다.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* 캡처 불가 — 이벤트는 계속 흐른다 */
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const session = dragRef.current;
    if (session === null || session.pointerId !== e.pointerId) return;
    if (onDragMove === undefined) return;
    const area = areaOf(e.currentTarget);
    if (area === null) return;

    const x = e.clientX - area.left - session.grabOffsetX;
    const y = e.clientY - area.top - session.grabOffsetY;

    if (!session.moved) {
      const movedEnough =
        Math.abs(x - session.lastX) >= DRAG_THRESHOLD ||
        Math.abs(y - session.lastY) >= DRAG_THRESHOLD;
      if (!movedEnough) return;
      session.moved = true;
    }

    session.lastX = x;
    session.lastY = y;
    onDragMove(id, x, y);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>, fromCancel: boolean): void => {
    const session = dragRef.current;
    if (session === null || session.pointerId !== e.pointerId) return;
    // 마우스는 좌/우 버튼이 같은 pointerId를 쓴다. 드래그 중 우클릭의 pointerup이
    // 왼쪽 드래그를 중간 지점에서 확정해 버리는 것을 막는다.
    // pointercancel에는 의미 있는 button이 없으므로 검사하지 않는다.
    if (!fromCancel && e.button !== session.button) return;

    dragRef.current = null;

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* 이미 해제됨 */
    }

    if (!session.moved) {
      // 이동이 없었어도 부모의 드래그 표시 상태는 반드시 풀어야 한다.
      onDragCancel?.(id);
      return;
    }

    // 취소(pointercancel)도 마지막 좌표로 확정한다.
    // 원위치 복귀는 별도 요구사항이며, 확정하지 않으면 화면과 저장이 어긋난다.
    dragEndedAtRef.current = Date.now();
    onDragEnd?.(id, session.lastX, session.lastY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    endDrag(e, false);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>): void => {
    endDrag(e, true);
  };

  // 배치 규칙
  //
  // 1. position 있음 → 데스크탑 좌표계에 absolute
  //    사용자가 옮긴 좌표이거나, 아직 옮기지 않았다면 부모가 정한 기본 자리다.
  //    **부모가 아니라 아이콘 자신이 absolute여야 한다** — 부모를 positioned로
  //    감싸면 offsetParent가 그 부모가 되어 areaOf()가 데스크탑 영역 대신
  //    래퍼를 잡고, 드래그 좌표가 통째로 어긋난다.
  // 2. 없음 → 일반 흐름 (부모가 배치를 결정)
  const positionStyle: React.CSSProperties = isPositioned
    ? { left: position.x, top: position.y, zIndex: dragging ? 30 : undefined }
    : {};

  return (
    <div
      id={`desktop-icon-${id}`}
      role="button"
      tabIndex={0}
      aria-label={`${label} 앱 열기`}
      aria-pressed={selected}
      style={positionStyle}
      className={[
        isPositioned ? 'absolute' : 'relative',
        'flex',
        'flex-col',
        'items-center',
        'justify-center',
        'gap-1',
        'w-20',
        'h-20',
        'rounded-lg',
        'cursor-pointer',
        'select-none',
        'p-1',
        // 드래그 중에는 색 전환 애니메이션이 좌표 추종을 흐리게 만든다.
        dragging ? '' : 'transition-colors',
        // 터치에서 드래그가 스크롤·롱프레스로 가로채이지 않도록
        canDrag ? 'touch-none' : '',
        dragging ? 'opacity-80 scale-105' : '',
        selected
          ? 'bg-white/40 ring-2 ring-blue-400'
          : 'hover:bg-white/25',
        'focus-visible:outline',
        'focus-visible:outline-2',
        'focus-visible:outline-blue-400',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      onContextMenu={onContextMenu}
      onPointerDown={canDrag ? handlePointerDown : undefined}
      onPointerMove={canDrag ? handlePointerMove : undefined}
      onPointerUp={canDrag ? handlePointerUp : undefined}
      onPointerCancel={canDrag ? handlePointerCancel : undefined}
      onDragStart={canDrag ? (e): void => e.preventDefault() : undefined}
    >
      {/* 아이콘 영역 */}
      <div className="flex items-center justify-center w-12 h-12 text-4xl">
        {icon.kind === 'emoji' ? (
          <span role="img" aria-hidden="true">
            {icon.char}
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={icon.src}
            alt={icon.alt}
            className="w-10 h-10 object-contain"
          />
        )}
      </div>

      {/* 라벨 */}
      <span className="text-xs text-white font-medium text-center leading-tight drop-shadow-sm line-clamp-2 px-0.5">
        {label}
      </span>
    </div>
  );
}
