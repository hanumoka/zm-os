'use client';

import React, { useEffect, useId, useRef } from 'react';
import type { DesktopAppEntry } from './desktopApps';

type AppInfoDialogProps = {
  open: boolean;
  app: DesktopAppEntry | null;
  onClose: () => void;
};

export function AppInfoDialog({ open, app, onClose }: AppInfoDialogProps): React.JSX.Element | null {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [open]);

  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement>): void => {
    e.preventDefault();
    onClose();
  };

  const handleDialogClick = (e: React.MouseEvent<HTMLDialogElement>): void => {
    if (e.target === dialogRef.current) onClose();
  };

  const uid = useId();
  const titleId = `app-info-title-${uid}`;

  if (app === null) return null;

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={handleCancel}
      onClick={handleDialogClick}
      className="rounded-xl shadow-xl bg-white p-6 max-w-md w-full backdrop:bg-black/40"
    >
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-12 h-12 text-3xl bg-neutral-100 rounded-lg">
            {app.icon.kind === 'emoji' ? (
              <span role="img" aria-hidden="true">{app.icon.char}</span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={app.icon.src} alt={app.icon.alt} className="w-10 h-10 object-contain" />
            )}
          </div>
          <div className="flex-1">
            <h2 id={titleId} className="text-lg font-bold text-neutral-900">
              {app.name}
            </h2>
            {app.version !== undefined && (
              <p className="text-xs text-neutral-500">버전 {app.version}</p>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-[80px_1fr] gap-y-2 text-sm">
          <dt className="text-neutral-500">ID</dt>
          <dd className="text-neutral-900 font-mono text-xs break-all">{app.id}</dd>

          <dt className="text-neutral-500">출처</dt>
          <dd className="text-neutral-900">{app.source === 'user' ? '사용자 업로드' : '시스템'}</dd>

          {app.author !== undefined && (
            <>
              <dt className="text-neutral-500">제작자</dt>
              <dd className="text-neutral-900">{app.author}</dd>
            </>
          )}

          {app.category !== undefined && (
            <>
              <dt className="text-neutral-500">카테고리</dt>
              <dd className="text-neutral-900">{app.category}</dd>
            </>
          )}

          {app.description !== undefined && (
            <>
              <dt className="text-neutral-500">설명</dt>
              <dd className="text-neutral-900">{app.description}</dd>
            </>
          )}
        </dl>

        <div className="flex justify-end mt-6">
          <button
            type="button"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </dialog>
  );
}
