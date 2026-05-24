'use client';

import React, { useEffect, useRef, useState } from 'react';
import { parseManifest } from '@/lib/apps/manifest';
import { createSandboxedFrame } from '@/lib/apps/sandbox';
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
export function AppFrame({ entry }: AppFrameProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  // StrictMode double-execute 방지 (frontend.md W-01)
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const container = containerRef.current;
    if (!container) return;

    let destroyed = false;
    // handle을 useEffect 클로저 내에서 추적 (cleanup용)
    // eslint-disable-next-line prefer-const
    let handleRef: { current: ReturnType<typeof createSandboxedFrame> | null } =
      { current: null };

    // manifest 검증
    let manifest: ReturnType<typeof parseManifest>;
    try {
      manifest = parseManifest(entry.manifest);
    } catch (e) {
      setError(
        'manifest 오류: ' + (e instanceof Error ? e.message : String(e)),
      );
      return;
    }

    // POC 예외: raw fetch — /public 정적 파일 취득 (외부 API 아님).
    // v2에서는 Next.js 정적 import 또는 서버 사이드 전달로 교체 예정.
    fetch(entry.contentUrl)
      .then((r) => {
        if (!r.ok) {
          throw new Error(`fetch 실패: ${r.status} ${r.statusText}`);
        }
        return r.text();
      })
      .then((html) => {
        if (destroyed) return;

        const handle = createSandboxedFrame(container, {
          html,
          width: manifest.size.defaultWidth,
          height: manifest.size.defaultHeight,
          ...(entry.ipc !== undefined ? { ipc: entry.ipc } : {}),
        });
        handleRef.current = handle;
      })
      .catch((e: unknown) => {
        if (!destroyed) {
          setError(
            'frame 생성 오류: ' +
              (e instanceof Error ? e.message : String(e)),
          );
        }
      });

    return (): void => {
      destroyed = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
    // entry는 mount 시 1회만 실행. entry 변경 시 재마운트는 부모가 key prop으로 처리.
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

  return <div ref={containerRef} className="w-full h-full" />;
}
