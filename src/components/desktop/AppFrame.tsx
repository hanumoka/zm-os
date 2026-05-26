'use client';

import React, { useEffect, useRef, useState } from 'react';
import { parseManifest } from '@/lib/apps/manifest';
import { createSandboxedFrame } from '@/lib/apps/sandbox';
import { createContentLoader, type ContentSource } from '@/lib/apps/content-loader';
import type { DesktopAppEntry } from './desktopApps';

// ─── Props ────────────────────────────────────────────────────────────────────

type AppFrameProps = {
  entry: DesktopAppEntry;
};

// ─── AppFrame ─────────────────────────────────────────────────────────────────

/**
 * AppFrame — 샌드박스 iframe을 마운트하는 컨테이너 컴포넌트.
 *
 * 동작 순서:
 *   1. parseManifest(entry.manifest) → AppManifest 검증
 *   2. fetch(entry.contentUrl) → HTML 문자열 취득 (POC 예외: raw fetch 허용)
 *      ※ POC 예외: AppFrame에서만 raw fetch 사용. /public 정적 파일 취득이므로
 *        외부 API 호출이 아님. v2에서는 정적 import 또는 서버 사이드 전달로 교체 예정.
 *   3. createSandboxedFrame → iframe sandbox 생성
 *   4. cleanup에서 handle.destroy()
 *
 * SSR 안전: document/window 접근은 useEffect 내부에서만.
 * StrictMode guard: initRef로 double-execute 방지 (frontend.md 규칙).
 */
type LoadStatus =
  | 'idle'
  | 'parsing'
  | 'fetching'
  | 'creating'
  | 'mounted'
  | 'error';

export function AppFrame({ entry }: AppFrameProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<LoadStatus>('idle');

  // StrictMode 대응: useRef 가 unmount/remount 시 새 인스턴스로 재생성되어 false 로 초기화 되므로
  // initRef 단독 guard 는 StrictMode 의 unmount→remount 사이클 에서 두 번째 mount 도 실행됨.
  // 두 번째 mount 에서 cleanup 된 컴포넌트가 다시 fetch/iframe 생성하면 됨.
  // (이전 guard 패턴은 두 번째 mount 도 차단하는 버그였음 — 작업 7 audit 후속 수정)
  useEffect(() => {
    // 디버그: AppFrame mount 추적
    // eslint-disable-next-line no-console
    console.log('[AppFrame] mount', entry.id, entry.source, entry.contentUrl ?? '(srcdoc)');

    const container = containerRef.current;
    if (container === null) {
      // eslint-disable-next-line no-console
      console.warn('[AppFrame] containerRef.current is null', entry.id);
      return;
    }

    let destroyed = false;
    const handleRef: {
      current: ReturnType<typeof createSandboxedFrame> | null;
    } = { current: null };

    // 1. manifest 검증
    setStatus('parsing');
    let manifest: ReturnType<typeof parseManifest>;
    try {
      manifest = parseManifest(entry.manifest);
      // eslint-disable-next-line no-console
      console.log('[AppFrame] manifest OK', entry.id, manifest);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error('[AppFrame] manifest 오류', entry.id, msg);
      setStatus('error');
      setError('manifest 오류: ' + msg);
      return;
    }

    // 2. HTML 취득 (ContentLoader 전략 패턴)
    const contentSource: ContentSource = entry.source === 'user'
      ? { source: 'user', htmlContent: entry.htmlContent ?? '' }
      : { source: 'built-in', contentUrl: entry.contentUrl ?? '' };
    const loader = createContentLoader(contentSource);
    setStatus('fetching');
    loader.load()
      .then((html) => {
        if (destroyed) {
          // eslint-disable-next-line no-console
          console.log('[AppFrame] destroyed before mount', entry.id);
          return;
        }
        // eslint-disable-next-line no-console
        console.log(
          '[AppFrame] html ready',
          entry.id,
          'html length:',
          html.length,
        );

        // 3. iframe 생성
        setStatus('creating');
        const handle = createSandboxedFrame(container, {
          html,
          width: manifest.size.defaultWidth,
          height: manifest.size.defaultHeight,
          ...(entry.ipc !== undefined ? { ipc: entry.ipc } : {}),
        });
        handleRef.current = handle;
        setStatus('mounted');
        // eslint-disable-next-line no-console
        console.log('[AppFrame] mounted', entry.id, {
          iframe: handle.iframe,
          width: handle.iframe.width,
          height: handle.iframe.height,
          srcdocLength: handle.iframe.srcdoc?.length,
        });
      })
      .catch((e: unknown) => {
        if (destroyed) return;
        const msg = e instanceof Error ? e.message : String(e);
        // eslint-disable-next-line no-console
        console.error('[AppFrame] frame 생성 오류', entry.id, msg);
        setStatus('error');
        setError('frame 생성 오류: ' + msg);
      });

    return (): void => {
      // eslint-disable-next-line no-console
      console.log('[AppFrame] unmount/cleanup', entry.id);
      destroyed = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
    // entry는 mount 시 1회만. entry 변경 시 재마운트는 부모가 key prop으로 처리.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error !== null) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-red-50 p-4">
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 max-w-sm">
          <p className="font-semibold mb-1">{entry.name} 로드 실패</p>
          <p className="text-xs font-mono break-all">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {/* iframe mount 대상. sandbox.ts 가 이 div 안에 iframe 을 appendChild 한다. */}
      <div ref={containerRef} className="w-full h-full" />

      {/* 로딩 상태 오버레이 — mounted 이전엔 표시, mounted 후엔 숨김. */}
      {status !== 'mounted' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="rounded bg-neutral-900/70 px-3 py-1.5 text-xs text-white font-mono">
            {entry.id} — {status}
            {status === 'fetching' && entry.source === 'built-in' && `: ${entry.contentUrl ?? ''}`}
          </div>
        </div>
      )}
    </div>
  );
}
