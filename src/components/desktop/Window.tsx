'use client';

import React from 'react';
import { Rnd } from 'react-rnd';
import type { RndDragCallback, RndResizeCallback } from 'react-rnd';
import type { WindowProps } from './types';

// ─── 기본값 상수 ──────────────────────────────────────────────────────────────

const DEFAULT_POSITION = { x: 80, y: 80 };
const DEFAULT_SIZE = { width: 640, height: 480 };
const DEFAULT_MIN_SIZE = { width: 240, height: 160 };

// ─── Window 컴포넌트 ──────────────────────────────────────────────────────────

/**
 * <Window> — react-rnd 래퍼 컴포넌트.
 *
 * 보안 강제 (security.md + architect §6):
 *   - dragHandleClassName="window-titlebar" 고정 — 타이틀바 영역으로만 드래그 핸들 한정.
 *   - iframe 영역 드래그 가로채기 방지.
 *
 * 의존성 그래프:
 *   Window → types (WindowProps)
 *   Window ⬅ useWindowManager (import 없음 — controlled 패턴, architect §4)
 *   부모(fe-developer)가 controls/geometry 콜백을 통해 WindowManager와 연결.
 *
 * 주의사항:
 *   - window/document 직접 접근 없음. react-rnd 내부가 처리.
 *   - 최소화(minimized) 상태: display:none 처리 — DOM 유지로 iframe 재시작 방지.
 *   - 최대화(maximized) 상태: position/size를 부모가 주입하는 방식(controlled).
 */
export function Window({
  id,
  title,
  initialPosition,
  initialSize,
  position,
  size,
  minSize,
  maxSize,
  resizable = true,
  draggable = true,
  bounds,
  lockAspectRatio = false,
  state = 'open',
  zIndex = 10,
  controls,
  geometry,
  children,
  className = '',
  titleBarClassName = '',
  ariaLabel,
}: WindowProps): React.JSX.Element | null {
  // ─── Controlled vs Uncontrolled 처리 ─────────────────────────────────────

  const isControlled = position !== undefined && size !== undefined;

  const rndPosition = isControlled ? position : undefined;
  const rndSize = isControlled ? size : undefined;

  const rndDefault = !isControlled
    ? {
        x: initialPosition?.x ?? DEFAULT_POSITION.x,
        y: initialPosition?.y ?? DEFAULT_POSITION.y,
        width: initialSize?.width ?? DEFAULT_SIZE.width,
        height: initialSize?.height ?? DEFAULT_SIZE.height,
      }
    : undefined;

  // ─── 드래그 완료 콜백 ────────────────────────────────────────────────────

  const handleDragStop: RndDragCallback = (_e, data): void => {
    geometry?.onMove?.(data.x, data.y);
  };

  // ─── 리사이즈 완료 콜백 ──────────────────────────────────────────────────

  const handleResizeStop: RndResizeCallback = (
    _e,
    _dir,
    elementRef,
    _delta,
    pos,
  ): void => {
    geometry?.onResize?.(
      elementRef.offsetWidth,
      elementRef.offsetHeight,
      pos.x,
      pos.y,
    );
  };

  // ─── 최소화 상태: DOM 유지 + 숨김 ────────────────────────────────────────

  const isMinimized = state === 'minimized';

  // ─── 최대화 상태 클래스 ──────────────────────────────────────────────────
  // 최대화 시 position/size는 부모(WindowManager)가 controlled 주입.

  const outerClassName = [
    'flex',
    'flex-col',
    'rounded-lg',
    'shadow-xl',
    'border',
    'border-neutral-300',
    'bg-white',
    'overflow-hidden',
    'select-none',
    isMinimized ? 'hidden' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  // ─── Rnd 공통 Props ───────────────────────────────────────────────────────

  const rndProps = {
    ...(isControlled && rndPosition !== undefined && rndSize !== undefined
      ? { position: rndPosition, size: rndSize }
      : { default: rndDefault }),
    minWidth: minSize?.width ?? DEFAULT_MIN_SIZE.width,
    minHeight: minSize?.height ?? DEFAULT_MIN_SIZE.height,
    ...(maxSize !== undefined
      ? { maxWidth: maxSize.width, maxHeight: maxSize.height }
      : {}),
    bounds: bounds,
    enableResizing: resizable,
    disableDragging: !draggable,
    // 보안 강제: 드래그 핸들 = 타이틀바 전용 (iframe 드래그 가로채기 방지)
    dragHandleClassName: 'window-titlebar',
    lockAspectRatio: lockAspectRatio,
    onDragStop: handleDragStop,
    onResizeStop: handleResizeStop,
    style: { zIndex },
    className: outerClassName,
  };

  return (
    <Rnd
      {...rndProps}
      role="dialog"
      aria-label={ariaLabel ?? title}
      aria-modal={false}
      data-window-id={id}
    >
      {/* ── 타이틀바 ── */}
      {/* 보안: dragHandleClassName="window-titlebar" — 이 요소만 드래그 핸들 */}
      <div
        className={[
          'window-titlebar',
          'flex',
          'items-center',
          'justify-between',
          'px-3',
          'py-2',
          'bg-neutral-100',
          'border-b',
          'border-neutral-300',
          'cursor-grab',
          'active:cursor-grabbing',
          titleBarClassName,
        ]
          .filter(Boolean)
          .join(' ')}
        onMouseDown={(): void => {
          controls?.onFocus?.();
        }}
      >
        {/* 타이틀 */}
        <span className="text-sm font-medium text-neutral-800 truncate flex-1 select-none">
          {title}
        </span>

        {/* 컨트롤 버튼 그룹 */}
        <div className="flex items-center gap-1.5 ml-2 shrink-0">
          {/* 최소화 */}
          {controls?.onMinimize !== undefined && (
            <button
              type="button"
              onClick={(e): void => {
                e.stopPropagation();
                controls.onMinimize?.();
              }}
              className="w-3 h-3 rounded-full bg-yellow-400 hover:bg-yellow-500 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow-600"
              aria-label={`${title} 최소화`}
            />
          )}

          {/* 최대화 / 복원 */}
          {state !== 'maximized' && controls?.onMaximize !== undefined && (
            <button
              type="button"
              onClick={(e): void => {
                e.stopPropagation();
                controls.onMaximize?.();
              }}
              className="w-3 h-3 rounded-full bg-green-400 hover:bg-green-500 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-600"
              aria-label={`${title} 최대화`}
            />
          )}

          {state === 'maximized' && controls?.onRestore !== undefined && (
            <button
              type="button"
              onClick={(e): void => {
                e.stopPropagation();
                controls.onRestore?.();
              }}
              className="w-3 h-3 rounded-full bg-green-400 hover:bg-green-500 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-600"
              aria-label={`${title} 복원`}
            />
          )}

          {/* 닫기 */}
          {controls?.onClose !== undefined && (
            <button
              type="button"
              onClick={(e): void => {
                e.stopPropagation();
                controls.onClose?.();
              }}
              className="w-3 h-3 rounded-full bg-red-400 hover:bg-red-500 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600"
              aria-label={`${title} 닫기`}
            />
          )}
        </div>
      </div>

      {/* ── 콘텐츠 영역 ── */}
      {/* pointer-events:auto 유지 — iframe이 클릭 이벤트 수신해야 함 */}
      <div className="flex-1 overflow-hidden relative">
        {children}
      </div>
    </Rnd>
  );
}
