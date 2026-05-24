'use client';

import React, { useRef, useState } from 'react';
import { loadUserAppFromZip } from '@/lib/apps/zip-loader';
import type { ZipLoadErrorCode } from '@/lib/apps/zip-loader';
import { DESKTOP_APPS } from '@/components/desktop/desktopApps';
import { useUserApps } from './UserAppsProvider';

// ─── 상태 타입 (P10=A: 단순 상태) ────────────────────────────────────────────

type UploadStatus = 'idle' | 'parsing' | 'validating' | 'saving' | 'done' | 'error';

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
  DUPLICATE_ID: '이미 존재하는 앱 ID입니다.',
};

// ─── AppUploadButton ──────────────────────────────────────────────────────────

/**
 * AppUploadButton — ZIP 앱 업로드 버튼.
 *
 * APP-02 / P2=A: 스토어 페이지 헤더에 삽입.
 * 파일 선택 → loadUserAppFromZip 검증 → addUserApp IDB 영속화.
 *
 * SSR 안전: useRef/useState는 클라이언트 전용이지만 'use client' 디렉티브로 보장.
 * File input은 CSP에 의해 인라인 핸들러 없이 동작.
 */
export function AppUploadButton(): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [errMsg, setErrMsg] = useState<string>('');
  const { addUserApp, userApps } = useUserApps();

  // built-in entry.id + built-in manifest.id + 현재 사용자 앱 manifest.id 모두 reservedIds로 전달
  // (zip-loader는 manifest.id로 비교 — built-in 앱의 entry.id와 manifest.id가 다르므로 둘 다 차단)
  const reservedIds = new Set<string>([
    ...DESKTOP_APPS.map((e) => e.id),
    ...DESKTOP_APPS.flatMap((e): string[] => {
      const m = e.manifest;
      if (typeof m === 'object' && m !== null && 'id' in m && typeof m.id === 'string') {
        return [m.id];
      }
      return [];
    }),
    ...userApps.map((u) => u.manifest.id),
  ]);

  const handleFile = async (file: File): Promise<void> => {
    setStatus('parsing');
    setErrMsg('');

    // loadUserAppFromZip: ZIP 크기·magic·path traversal·bomb·manifest·html 검증
    const result = await loadUserAppFromZip(file, reservedIds);

    if (!result.ok) {
      setStatus('error');
      setErrMsg(ERROR_MESSAGES[result.code] + ' — ' + result.message);
      return;
    }

    setStatus('saving');
    await addUserApp(result.app);
    setStatus('done');

    // 2초 후 idle 복귀
    setTimeout((): void => {
      setStatus('idle');
    }, 2000);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0];
    if (f === undefined) return;
    void handleFile(f);
    // 동일 파일 재업로드 허용 — input value 초기화
    if (inputRef.current !== null) {
      inputRef.current.value = '';
    }
  };

  const isDisabled = status === 'parsing' || status === 'saving';

  const buttonLabel = ((): string => {
    switch (status) {
      case 'idle':    return 'ZIP 앱 업로드';
      case 'parsing': return '검증 중...';
      case 'validating': return '검증 중...';
      case 'saving':  return '저장 중...';
      case 'done':    return '완료';
      case 'error':   return '다시 시도';
    }
  })();

  return (
    <div className="flex items-center gap-3">
      {/* 숨겨진 file input */}
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        className="hidden"
        onChange={handleChange}
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* 업로드 버튼 */}
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

      {/* 에러 메시지 */}
      {errMsg !== '' && (
        <span className="text-xs text-red-600 max-w-xs truncate" role="alert" title={errMsg}>
          {errMsg}
        </span>
      )}
    </div>
  );
}
