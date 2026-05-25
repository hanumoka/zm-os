'use client';

import React, { useEffect, useId, useRef } from 'react';

// ─── Props ────────────────────────────────────────────────────────────────────

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger → 빨간 확인 버튼 */
  variant?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
};

// ─── ConfirmDialog ────────────────────────────────────────────────────────────

/**
 * ConfirmDialog — 네이티브 <dialog> 기반 범용 확인 다이얼로그.
 *
 * WHY native <dialog>: 외부 라이브러리 의존성 0, focus-trap/Escape 키 처리가
 * 브라우저 내장이므로 별도 구현 불필요. showModal()은 top-layer에 렌더링되어
 * z-index 경쟁 문제가 없음.
 *
 * backdrop 클릭 감지: <dialog> 자체의 onClick에서 e.target === dialogRef.current
 * 인 경우를 backdrop 클릭으로 판단 (content 영역은 내부 div가 target이 됨).
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '확인',
  cancelLabel = '취소',
  variant = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.JSX.Element | null {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // open prop 변화에 따라 showModal / close 호출
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;

    if (open) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [open]);

  // Escape 키로 닫기 — 네이티브 cancel 이벤트 처리
  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement>): void => {
    // 브라우저가 Escape 시 자동으로 close()를 호출하기 전에 preventDefault하여
    // 상태 관리를 onCancel 콜백에 위임
    e.preventDefault();
    onCancel();
  };

  // backdrop 클릭 감지: dialog 요소 자체가 target이면 backdrop 영역
  const handleDialogClick = (e: React.MouseEvent<HTMLDialogElement>): void => {
    if (e.target === dialogRef.current) {
      onCancel();
    }
  };

  const confirmButtonClass = [
    'px-4 py-2 rounded-md text-sm font-medium transition-colors',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400',
    variant === 'danger'
      ? 'bg-red-600 text-white hover:bg-red-700'
      : 'bg-blue-600 text-white hover:bg-blue-700',
  ].join(' ');

  const cancelButtonClass = [
    'px-4 py-2 rounded-md text-sm font-medium transition-colors',
    'bg-neutral-100 text-neutral-700 hover:bg-neutral-200',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400',
  ].join(' ');

  const uid = useId();
  const titleId = `confirm-dialog-title-${uid}`;
  const descId = `confirm-dialog-desc-${uid}`;

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descId}
      aria-modal="true"
      onCancel={handleCancel}
      onClick={handleDialogClick}
      className="rounded-xl shadow-xl bg-white p-6 max-w-sm w-full backdrop:bg-black/40"
    >
      {/* content wrapper: 클릭 이벤트가 여기서 멈추도록 stopPropagation 불필요.
          내부 div가 target이면 handleDialogClick의 backdrop 감지 조건 불충족. */}
      <div>
        <h2 id={titleId} className="text-lg font-bold text-neutral-900">
          {title}
        </h2>
        <p id={descId} className="text-sm text-neutral-600 mt-2">
          {description}
        </p>

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className={cancelButtonClass}
          >
            {cancelLabel}
          </button>
          {/* autoFocus: 확인 버튼에 초기 포커스 — 위험 동작은 취소가 기본이지만
              다이얼로그 포커스 진입점은 명시적으로 확인 버튼으로 설정 */}
          <button
            type="button"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            onClick={onConfirm}
            className={confirmButtonClass}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
