'use client';

import React, { useRef, useState } from 'react';
import { loadUserAppFromZip } from '@/lib/apps/zip-loader';
import type { ZipLoadErrorCode, ParsedUserApp, UpdateTarget } from '@/lib/apps/zip-loader';
import { DESKTOP_APPS } from '@/components/desktop/desktopApps';
import { useUserApps } from './UserAppsProvider';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

// ─── 상태 타입 ───────────────────────────────────────────────────────────────

type UploadStatus = 'idle' | 'parsing' | 'confirming-update' | 'saving' | 'done' | 'error';

// ─── built-in 앱 reserved IDs (모듈 상수 — 렌더마다 재생성 방지) ─────────────

const BUILTIN_RESERVED_IDS: ReadonlySet<string> = new Set<string>([
  ...DESKTOP_APPS.map((e) => e.id),
  ...DESKTOP_APPS.flatMap((e): string[] => {
    const m = e.manifest;
    if (typeof m === 'object' && m !== null && 'id' in m && typeof m.id === 'string') {
      return [m.id];
    }
    return [];
  }),
]);

// ─── 에러 메시지 매핑 ─────────────────────────────────────────────────────────

const ERROR_MESSAGES: Record<ZipLoadErrorCode, string> = {
  INVALID_ZIP: 'ZIP 파일을 읽을 수 없습니다.',
  NOT_ZIP_MAGIC: 'ZIP 파일이 아닙니다.',
  NO_MANIFEST: 'manifest.json이 없습니다.',
  NO_HTML: 'index.html이 없습니다.',
  MANIFEST_INVALID: '매니페스트 검증 실패',
  PATH_TRAVERSAL: '위험한 경로 발견 (../)',
  ZIP_TOO_LARGE: 'ZIP 파일이 너무 큽니다 (최대 10MB)',
  HTML_TOO_LARGE: 'index.html이 너무 큽니다 (최대 5MB)',
  BOMB: 'ZIP bomb 감지 (압축비 1000x 초과)',
  DUPLICATE_ID: '시스템 앱과 ID가 충돌합니다.',
};

// ─── 업데이트 확인 메시지 생성 ────────────────────────────────────────────────

function buildUpdateDescription(target: UpdateTarget): string {
  switch (target.comparison) {
    case 1:
      return `v${target.existingVersion} → v${target.newVersion} 으로 업그레이드합니다.`;
    case 0:
      return `동일한 버전(v${target.newVersion})으로 덮어씁니다. 앱 내용이 교체됩니다.`;
    case -1:
      return `v${target.existingVersion} → v${target.newVersion} 으로 다운그레이드합니다. 이전 버전의 데이터가 손실될 수 있습니다.`;
  }
}

// ─── AppUploadButton ──────────────────────────────────────────────────────────

export function AppUploadButton(): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [errMsg, setErrMsg] = useState<string>('');
  const { addUserApp, updateUserApp, userAppVersions } = useUserApps();

  // 업데이트 확인 대기 중인 앱 정보
  const [pendingUpdate, setPendingUpdate] = useState<{
    app: ParsedUserApp;
    target: UpdateTarget;
  } | null>(null);

  const handleFile = async (file: File): Promise<void> => {
    setStatus('parsing');
    setErrMsg('');

    const result = await loadUserAppFromZip(file, BUILTIN_RESERVED_IDS, userAppVersions);

    if (!result.ok) {
      setStatus('error');
      setErrMsg(ERROR_MESSAGES[result.code] + ' — ' + result.message);
      return;
    }

    // 업데이트 대상 감지 → 확인 다이얼로그 표시
    if (result.updateTarget !== null) {
      setPendingUpdate({ app: result.app, target: result.updateTarget });
      setStatus('confirming-update');
      return;
    }

    // 신규 앱 → 바로 저장
    setStatus('saving');
    await addUserApp(result.app);
    setStatus('done');
    setTimeout((): void => setStatus('idle'), 2000);
  };

  const handleConfirmUpdate = async (): Promise<void> => {
    if (pendingUpdate === null) return;
    setStatus('saving');
    await updateUserApp(pendingUpdate.app);
    setPendingUpdate(null);
    setStatus('done');
    setTimeout((): void => setStatus('idle'), 2000);
  };

  const handleCancelUpdate = (): void => {
    setPendingUpdate(null);
    setStatus('idle');
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0];
    if (f === undefined) return;
    void handleFile(f);
    if (inputRef.current !== null) {
      inputRef.current.value = '';
    }
  };

  const isDisabled = status === 'parsing' || status === 'saving' || status === 'confirming-update';

  const buttonLabel = ((): string => {
    switch (status) {
      case 'idle':              return 'ZIP 앱 업로드';
      case 'parsing':           return '검증 중...';
      case 'confirming-update': return '업데이트 확인 중...';
      case 'saving':            return '저장 중...';
      case 'done':              return '완료';
      case 'error':             return '다시 시도';
    }
  })();

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        className="hidden"
        onChange={handleChange}
        aria-hidden="true"
        tabIndex={-1}
      />

      <button
        type="button"
        disabled={isDisabled}
        aria-label="ZIP 앱 업로드"
        aria-busy={isDisabled}
        onClick={(): void => inputRef.current?.click()}
        className={[
          'inline-flex',
          'items-center',
          'gap-1.5',
          'px-3',
          'py-1.5',
          'rounded-md',
          'text-sm',
          'font-medium',
          'transition-colors',
          'focus-visible:outline',
          'focus-visible:outline-2',
          'focus-visible:outline-blue-400',
          isDisabled ? 'opacity-50 cursor-not-allowed' : '',
          status === 'done'
            ? 'bg-green-600 text-white'
            : status === 'error'
            ? 'bg-red-600 text-white hover:bg-red-700'
            : 'bg-blue-600 text-white hover:bg-blue-700',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {status === 'done' ? '✓ ' : ''}
        {buttonLabel}
      </button>

      {errMsg !== '' && (
        <span className="text-xs text-red-600 max-w-xs truncate" role="alert" title={errMsg}>
          {errMsg}
        </span>
      )}

      {/* 업데이트 확인 다이얼로그 */}
      {pendingUpdate !== null && (
        <ConfirmDialog
          open={status === 'confirming-update'}
          title={`"${pendingUpdate.app.manifest.name}" 업데이트`}
          description={buildUpdateDescription(pendingUpdate.target)}
          confirmLabel="업데이트"
          cancelLabel="취소"
          variant={pendingUpdate.target.comparison === -1 ? 'danger' : 'primary'}
          onConfirm={(): void => void handleConfirmUpdate()}
          onCancel={handleCancelUpdate}
        />
      )}
    </div>
  );
}
